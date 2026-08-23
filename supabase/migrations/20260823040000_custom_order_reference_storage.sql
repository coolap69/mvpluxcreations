insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'custom-order-references',
  'custom-order-references',
  false,
  6000000,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins view custom order references" on storage.objects;
create policy "Admins view custom order references"
on storage.objects for select to authenticated
using (
  bucket_id = 'custom-order-references'
  and exists (
    select 1 from public.admin_profiles
    where admin_profiles.user_id = auth.uid()
  )
);
