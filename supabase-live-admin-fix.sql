-- MVPLUXCREATIONS live admin save fix
-- Run this in the CURRENT Supabase project used by the website:
-- https://ncbddqxdinvcsoszdsxr.supabase.co
--
-- It creates the live edit table and gives your admin login permission
-- to save website edits from Admin Mode.

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_profiles enable row level security;

drop policy if exists "Admins can view their admin profile" on public.admin_profiles;
create policy "Admins can view their admin profile"
on public.admin_profiles for select
using (auth.uid() = user_id);

create table if not exists public.site_edits (
  page_key text primary key,
  edits jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_edits add column if not exists revision bigint not null default 0;

alter table public.site_edits enable row level security;

drop policy if exists "Anyone can view site edits" on public.site_edits;
drop policy if exists "Admins can view site edits" on public.site_edits;
create policy "Admins can view site edits"
on public.site_edits for select
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Admins can create site edits" on public.site_edits;
create policy "Admins can create site edits"
on public.site_edits for insert
with check (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Admins can update site edits" on public.site_edits;
create policy "Admins can update site edits"
on public.site_edits for update
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
))
with check (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

drop policy if exists "Admins can delete site edits" on public.site_edits;
create policy "Admins can delete site edits"
on public.site_edits for delete
using (exists (
  select 1 from public.admin_profiles
  where admin_profiles.user_id = auth.uid()
));

revoke select on public.site_edits from anon;
grant select on public.site_edits to authenticated;
grant insert, update, delete on public.site_edits to authenticated;
grant select on public.admin_profiles to authenticated;

create or replace function public.save_site_edits(p_page_key text,p_edits jsonb,p_expected_revision bigint,p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_row public.site_edits;
begin
  if not exists(select 1 from public.admin_profiles where user_id=auth.uid()) then raise exception 'Admin access is required.'; end if;
  if nullif(trim(coalesce(p_page_key,'')),'') is null or p_edits is null or jsonb_typeof(p_edits)<>'object' then raise exception 'A page key and JSON object are required.'; end if;
  select * into current_row from public.site_edits where page_key=p_page_key for update;
  if current_row.page_key is null then
    if coalesce(p_expected_revision,0)<>0 then raise exception using errcode='40001',message='Admin state changed. Reload before saving again.'; end if;
    insert into public.site_edits(page_key,edits,revision,updated_by,updated_at) values(p_page_key,p_edits,1,auth.uid(),now()) returning * into current_row;
  else
    if current_row.revision<>coalesce(p_expected_revision,-1) then raise exception using errcode='40001',message='Admin state changed. Reload before saving again.'; end if;
    update public.site_edits set edits=case when p_replace then p_edits else current_row.edits||p_edits end,revision=current_row.revision+1,updated_by=auth.uid(),updated_at=now() where page_key=p_page_key returning * into current_row;
  end if;
  return jsonb_build_object('page_key',current_row.page_key,'edits',current_row.edits,'revision',current_row.revision,'updated_at',current_row.updated_at);
end;
$$;

revoke all on function public.save_site_edits(text,jsonb,bigint,boolean) from public;
grant execute on function public.save_site_edits(text,jsonb,bigint,boolean) to authenticated;

-- Add the admin account if it exists in Auth users.
-- Keep both here for now because you tested with both emails.
insert into public.admin_profiles (user_id)
select id from auth.users
where lower(email) in ('mvpluxcreations@gmail.com', 'coolap69@aol.com')
on conflict (user_id) do nothing;

select
  email,
  id as user_id,
  exists (
    select 1 from public.admin_profiles
    where admin_profiles.user_id = auth.users.id
  ) as is_admin
from auth.users
where lower(email) in ('mvpluxcreations@gmail.com', 'coolap69@aol.com');
