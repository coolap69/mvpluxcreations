-- Fast public content snapshots for the MVPLUX Admin CMS.
--
-- This migration is additive. It does not expose public.site_edits, alter any
-- Product/Collection data, or activate the Supabase-first storefront by itself.
-- Activation is an explicit Admin-only operation that succeeds only when the
-- stored snapshot exactly matches the currently deployed static snapshot.
-- Pre-fast-publishing rollback checkpoint:
-- b146bc7a0298b626453f3a245a8c7f04f756fd16

begin;

create or replace function public.get_public_site_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(state_row.edits->>'liveContentEnabled', 'false') = 'true'
      and jsonb_typeof(state_row.edits->'lastPublishedSnapshot') = 'object'
      and state_row.edits->'lastPublishedSnapshot'->>'version' = '1'
      and jsonb_typeof(state_row.edits->'lastPublishedSnapshot'->'products') = 'object'
      and jsonb_typeof(state_row.edits->'lastPublishedSnapshot'->'categoryDisplayCards') = 'object'
    then jsonb_build_object(
      'snapshot', state_row.edits->'lastPublishedSnapshot',
      'liveRevision', case
        when coalesce(state_row.edits->>'liveContentRevision', '') ~ '^[0-9]+$'
          then (state_row.edits->>'liveContentRevision')::bigint
        else 0
      end,
      'publishedAt', coalesce(nullif(state_row.edits->>'livePublishedAt', ''), state_row.updated_at::text)
    )
    else null
  end
  from public.site_edits as state_row
  where state_row.page_key = 'admin-global';
$$;

create or replace function public.activate_public_site_snapshot(
  p_expected_snapshot jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.site_edits;
  current_live_revision bigint;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access is required.';
  end if;
  if jsonb_typeof(p_expected_snapshot) <> 'object' then
    raise exception 'A validated public snapshot is required.';
  end if;

  select * into current_row
  from public.site_edits
  where page_key = 'admin-global'
  for update;

  if current_row.page_key is null then
    raise exception 'Admin global state is unavailable.';
  end if;
  if current_row.revision <> coalesce(p_expected_revision, -1) then
    raise exception using errcode = '40001', message = 'Admin state changed. Reload before activating live content.';
  end if;
  if current_row.edits->'lastPublishedSnapshot' is distinct from p_expected_snapshot then
    raise exception using errcode = '22000', message = 'Stored live snapshot does not match the currently deployed static snapshot.';
  end if;

  current_live_revision := case
    when coalesce(current_row.edits->>'liveContentRevision', '') ~ '^[0-9]+$'
      then (current_row.edits->>'liveContentRevision')::bigint
    else 0
  end;

  update public.site_edits
  set edits = current_row.edits || jsonb_build_object(
      'liveContentEnabled', true,
      'liveContentRevision', current_live_revision,
      'livePublishedAt', coalesce(nullif(current_row.edits->>'livePublishedAt', ''), now()::text)
    ),
    revision = current_row.revision + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where page_key = 'admin-global';

  return public.get_public_site_snapshot() || jsonb_build_object('siteRevision', current_row.revision + 1);
end;
$$;

create or replace function public.save_live_site_snapshot(
  p_snapshot jsonb,
  p_expected_revision bigint,
  p_expected_live_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.site_edits;
  current_live_revision bigint;
  next_live_revision bigint;
  next_published_at timestamptz := now();
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access is required.';
  end if;
  if jsonb_typeof(p_snapshot) <> 'object'
    or p_snapshot->>'version' <> '1'
    or jsonb_typeof(p_snapshot->'products') <> 'object'
    or jsonb_typeof(p_snapshot->'categoryDisplayCards') <> 'object' then
    raise exception 'A validated normalized public snapshot is required.';
  end if;

  select * into current_row
  from public.site_edits
  where page_key = 'admin-global'
  for update;

  if current_row.page_key is null then
    raise exception 'Admin global state is unavailable.';
  end if;
  if coalesce(current_row.edits->>'liveContentEnabled', 'false') <> 'true' then
    raise exception using errcode = '55000', message = 'Fast live content is not activated. Verify the deployed snapshot before activation.';
  end if;
  if current_row.revision <> coalesce(p_expected_revision, -1) then
    raise exception using errcode = '40001', message = 'Admin state changed. Reload before saving live again.';
  end if;

  current_live_revision := case
    when coalesce(current_row.edits->>'liveContentRevision', '') ~ '^[0-9]+$'
      then (current_row.edits->>'liveContentRevision')::bigint
    else 0
  end;
  if current_live_revision <> coalesce(p_expected_live_revision, -1) then
    raise exception using errcode = '40001', message = 'Public live content changed. Reload before saving live again.';
  end if;
  next_live_revision := current_live_revision + 1;

  update public.site_edits
  set edits = current_row.edits || jsonb_build_object(
      'previousLiveSnapshot', current_row.edits->'lastPublishedSnapshot',
      'lastPublishedSnapshot', p_snapshot,
      'liveContentRevision', next_live_revision,
      'livePublishedAt', next_published_at::text
    ),
    revision = current_row.revision + 1,
    updated_by = auth.uid(),
    updated_at = next_published_at
  where page_key = 'admin-global';

  return public.get_public_site_snapshot() || jsonb_build_object('siteRevision', current_row.revision + 1);
end;
$$;

revoke all on function public.get_public_site_snapshot() from public;
revoke all on function public.get_public_site_snapshot() from anon, authenticated;
grant execute on function public.get_public_site_snapshot() to anon, authenticated;

revoke all on function public.activate_public_site_snapshot(jsonb,bigint) from public;
revoke all on function public.activate_public_site_snapshot(jsonb,bigint) from anon, authenticated;
grant execute on function public.activate_public_site_snapshot(jsonb,bigint) to authenticated;

revoke all on function public.save_live_site_snapshot(jsonb,bigint,bigint) from public;
revoke all on function public.save_live_site_snapshot(jsonb,bigint,bigint) from anon, authenticated;
grant execute on function public.save_live_site_snapshot(jsonb,bigint,bigint) to authenticated;

commit;
