-- Keep room names unique for new and renamed rooms while preserving any
-- duplicates that already exist so this migration can be deployed safely.
create or replace function public.prevent_duplicate_room_name()
returns trigger
language plpgsql
as $$
declare
  normalized_name text;
begin
  normalized_name := lower(trim(regexp_replace(new.name, '\s+', ' ', 'g')));
  if normalized_name = '' then
    raise exception 'Tên phòng không được để trống.' using errcode = '23514';
  end if;

  -- Serialize attempts for the same name so two simultaneous inserts cannot
  -- both pass the lookup below.
  perform pg_advisory_xact_lock(hashtextextended(normalized_name, 0));
  if exists (
    select 1
    from public.rooms room
    where room.id <> coalesce(new.id, '')
      and lower(trim(regexp_replace(room.name, '\s+', ' ', 'g'))) = normalized_name
  ) then
    raise exception 'Tên phòng này đã tồn tại. Vui lòng nhập tên khác.' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists rooms_prevent_duplicate_name on public.rooms;
create trigger rooms_prevent_duplicate_name
before insert or update of name on public.rooms
for each row execute function public.prevent_duplicate_room_name();

-- Only active administrators may remove a room. Foreign-key restrictions and
-- the client-side history checks still prevent removal of rooms with data.
drop policy if exists authenticated_admin_delete_rooms on public.rooms;
create policy authenticated_admin_delete_rooms
on public.rooms
for delete
to authenticated
using (
  exists (
    select 1
    from public.users
    where public.users.id = auth.uid()
      and public.users.role = 'admin'
      and public.users.status = 'active'
  )
);
