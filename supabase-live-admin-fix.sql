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
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_edits enable row level security;

drop policy if exists "Anyone can view site edits" on public.site_edits;
create policy "Anyone can view site edits"
on public.site_edits for select
using (true);

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

grant select on public.site_edits to anon, authenticated;
grant insert, update, delete on public.site_edits to authenticated;
grant select on public.admin_profiles to authenticated;

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
