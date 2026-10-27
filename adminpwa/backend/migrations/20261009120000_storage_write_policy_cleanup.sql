begin;

-- Keep room images publicly readable through the public bucket, but make every
-- write path require an active management account. The old PUBLIC write
-- policies were permissive and easy to re-open accidentally later.
drop policy if exists "Allow public upload room-images" on storage.objects;
drop policy if exists "Allow public delete room-images" on storage.objects;
drop policy if exists room_images_management_insert on storage.objects;
drop policy if exists room_images_management_delete on storage.objects;

create policy room_images_management_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'room-images' and exists (
  select 1 from public.users u where u.id = auth.uid()
  and u.status = 'active' and u.role in ('admin','user')
));

create policy room_images_management_delete on storage.objects
for delete to authenticated
using (bucket_id = 'room-images' and exists (
  select 1 from public.users u where u.id = auth.uid()
  and u.status = 'active' and u.role in ('admin','user')
));

-- Supabase owns storage.objects as supabase_storage_admin. The management
-- postgres role cannot revoke the owner's grants; access is constrained by
-- RLS policies above, with the existing restrictive guards left in place.

commit;
