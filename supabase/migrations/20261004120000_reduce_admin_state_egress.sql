-- Keep routine Admin reads and writes from returning the complete admin-global
-- JSON document. Recovery data remains stored and unchanged, but is available
-- only through the existing explicit recovery workflow.

begin;

create or replace function public.get_admin_working_state(p_keys text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_row public.site_edits;
  selected_edits jsonb;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access is required.';
  end if;

  select *
  into current_row
  from public.site_edits
  where page_key = 'admin-global';

  if current_row.page_key is null then
    return jsonb_build_object(
      'page_key', 'admin-global',
      'edits', '{}'::jsonb,
      'revision', 0
    );
  end if;

  select coalesce(jsonb_object_agg(requested.key, current_row.edits -> requested.key), '{}'::jsonb)
  into selected_edits
  from (
    select distinct key
    from unnest(coalesce(p_keys, array[]::text[])) as key
    where key <> 'adminPublishingMigrationBackupV1'
      and current_row.edits ? key
  ) as requested;

  return jsonb_build_object(
    'page_key', current_row.page_key,
    'edits', selected_edits,
    'revision', current_row.revision,
    'recoveryBackupAvailable', current_row.edits ? 'adminPublishingMigrationBackupV1'
  );
end;
$$;

create or replace function public.save_admin_working_state(
  p_edits jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
  selected_edits jsonb;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access is required.';
  end if;
  if p_edits is null or jsonb_typeof(p_edits) <> 'object' or p_edits = '{}'::jsonb then
    raise exception 'Admin working-state edits must be a non-empty object.';
  end if;
  if p_edits ? 'adminPublishingMigrationBackupV1' then
    raise exception 'Recovery data cannot be changed through the working-state operation.';
  end if;

  saved := public.save_site_edits(
    'admin-global',
    p_edits,
    p_expected_revision,
    false
  );

  select coalesce(jsonb_object_agg(changed.key, saved->'edits'->changed.key), '{}'::jsonb)
  into selected_edits
  from jsonb_object_keys(p_edits) as changed(key);

  return jsonb_build_object(
    'edits', selected_edits,
    'revision', coalesce((saved->>'revision')::bigint, p_expected_revision + 1),
    'updated_at', saved->>'updated_at'
  );
end;
$$;

revoke all on function public.get_admin_working_state(text[]) from public, anon, authenticated;
grant execute on function public.get_admin_working_state(text[]) to authenticated;

revoke all on function public.save_admin_working_state(jsonb,bigint) from public, anon, authenticated;
grant execute on function public.save_admin_working_state(jsonb,bigint) to authenticated;

commit;
