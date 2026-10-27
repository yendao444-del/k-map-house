begin;

-- The management directory must never be readable by every signed-in account.
-- The scoped self/management policy remains in place and is enforced together
-- with the MFA request guard.
drop policy if exists users_select_authenticated on public.users;

create or replace function public.management_directory_access()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.users u
    where u.id=auth.uid() and u.status='active' and u.role='admin');
$$;
revoke all on function public.management_directory_access() from public, anon;
grant execute on function public.management_directory_access() to authenticated, service_role;

drop policy if exists users_select_scoped_profile on public.users;
create policy users_select_scoped_profile on public.users
for select to authenticated
using (id=auth.uid() or public.management_directory_access());

create or replace function public.notification_recipients()
returns table (id uuid, full_name text, notification_email text,
  email_notifications_enabled boolean, email_notification_preferences jsonb)
language sql stable security definer set search_path='' as $$
  select u.id,u.full_name,u.notification_email,u.email_notifications_enabled,
    u.email_notification_preferences
  from public.users u
  where u.status='active' and u.role in ('admin','user')
    and exists(select 1 from public.users actor
      where actor.id=auth.uid() and actor.status='active' and actor.role in ('admin','user'));
$$;
revoke all on function public.notification_recipients() from public,anon;
grant execute on function public.notification_recipients() to authenticated, service_role;

-- Enforce the profile field boundary for direct REST payloads as well as UI.
-- Auth-owned synchronization and service jobs keep their server authority.
create or replace function public.guard_user_profile_update()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('postgres','supabase_auth_admin','service_role') then return new; end if;
  if auth.role() is distinct from 'authenticated' or auth.uid() is null then
    raise insufficient_privilege;
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at
    or new.last_login_at is distinct from old.last_login_at then
    raise exception 'System identity fields cannot be edited' using errcode='42501';
  end if;
  if public.management_directory_access() then return new; end if;
  if old.id is distinct from auth.uid() or
    (to_jsonb(new)-array['full_name','phone','avatar_url','notification_email',
      'email_notifications_enabled','email_notification_preferences']) is distinct from
    (to_jsonb(old)-array['full_name','phone','avatar_url','notification_email',
      'email_notifications_enabled','email_notification_preferences']) then
    raise exception 'Only personal profile fields may be edited' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_user_profile_update() from public,anon,authenticated;
drop trigger if exists guard_user_profile_update on public.users;
create trigger guard_user_profile_update before update on public.users
for each row execute function public.guard_user_profile_update();

-- Room photos contain internal property information.  Keep object access behind
-- the existing authenticated storage policies and return short-lived signed URLs
-- from the clients.
update storage.buckets
set public = false
where id = 'room-images';

notify pgrst, 'reload schema';
commit;
