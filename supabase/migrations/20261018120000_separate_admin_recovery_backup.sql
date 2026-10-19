-- Preserve the verified migration recovery archive without forcing every normal
-- Admin/Save Live write to rewrite the multi-megabyte recovery document.

begin;

insert into public.site_edits (page_key, edits, revision, updated_by, updated_at)
select
  'admin-recovery-v1',
  jsonb_build_object(
    'adminPublishingMigrationBackupV1',
    edits -> 'adminPublishingMigrationBackupV1'
  ),
  1,
  updated_by,
  now()
from public.site_edits
where page_key = 'admin-global'
  and edits ? 'adminPublishingMigrationBackupV1'
on conflict (page_key) do update
set edits = excluded.edits,
    revision = public.site_edits.revision + 1,
    updated_by = excluded.updated_by,
    updated_at = now();

update public.site_edits
set edits = edits - 'adminPublishingMigrationBackupV1',
    revision = revision + 1,
    updated_at = now()
where page_key = 'admin-global'
  and edits ? 'adminPublishingMigrationBackupV1';

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
  recovery_available boolean;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access is required.';
  end if;

  select *
  into current_row
  from public.site_edits
  where page_key = 'admin-global';

  select exists (
    select 1
    from public.site_edits
    where page_key = 'admin-recovery-v1'
      and edits ? 'adminPublishingMigrationBackupV1'
  ) or coalesce(current_row.edits ? 'adminPublishingMigrationBackupV1', false)
  into recovery_available;

  if current_row.page_key is null then
    return jsonb_build_object(
      'page_key', 'admin-global',
      'edits', '{}'::jsonb,
      'revision', 0,
      'recoveryBackupAvailable', recovery_available
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
    'recoveryBackupAvailable', recovery_available
  );
end;
$$;

revoke all on function public.get_admin_working_state(text[]) from public, anon, authenticated;
grant execute on function public.get_admin_working_state(text[]) to authenticated;

commit;
