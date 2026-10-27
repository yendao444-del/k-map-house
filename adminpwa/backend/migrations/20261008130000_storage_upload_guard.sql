begin;

-- Preserve public viewing of room photos and existing manager roles. PUBLIC
-- write policies remain subject to these restrictive authenticated guards.
create policy room_images_management_insert_guard on storage.objects
as restrictive for insert to public
with check (bucket_id <> 'room-images' or exists (
  select 1 from public.users u where u.id=auth.uid()
  and u.status='active' and u.role in ('admin','user')
));

create policy room_images_management_delete_guard on storage.objects
as restrictive for delete to public
using (bucket_id <> 'room-images' or exists (
  select 1 from public.users u where u.id=auth.uid()
  and u.status='active' and u.role in ('admin','user')
));

-- Storage deletion reads the object first. Authenticated managers retain the
-- required read path; anonymous listing stays unavailable.
create policy room_images_management_select on storage.objects
for select to authenticated using (bucket_id='room-images' and exists (
  select 1 from public.users u where u.id=auth.uid()
  and u.status='active' and u.role in ('admin','user')
));

commit;
