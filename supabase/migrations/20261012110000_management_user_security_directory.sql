begin;

-- Account-level evidence of mailbox OTP verification, independent of session
-- cleanup. Auth email_confirmed_at alone may be set by account provisioning.
alter table management_security.accounts
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verified_identity_hash text;

create or replace function management_security.remember_email_verification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.email_verified_at is not null
    and new.email_identity_hash = management_security.email_hash(new.user_id) then
    insert into management_security.accounts(user_id,email_verified_at,email_verified_identity_hash)
      values(new.user_id,new.email_verified_at,new.email_identity_hash)
    on conflict(user_id) do update
      set email_verified_at=excluded.email_verified_at,
          email_verified_identity_hash=excluded.email_verified_identity_hash;
  end if;
  return new;
end $$;
revoke all on function management_security.remember_email_verification() from public,anon,authenticated,service_role;

drop trigger if exists remember_email_verification on management_security.sessions;
create trigger remember_email_verification
after insert or update of email_verified_at,email_identity_hash on management_security.sessions
for each row execute function management_security.remember_email_verification();

-- Only backfill successful OTP proof for the account's current login email.
insert into management_security.accounts(user_id,email_verified_at,email_verified_identity_hash)
select distinct on (proof.user_id) proof.user_id,proof.verified_at,proof.email_identity_hash
from (
  select user_id,email_verified_at as verified_at,email_identity_hash
    from management_security.sessions where email_verified_at is not null
  union all
  select user_id,verified_at,email_identity_hash
    from management_security.email_challenges where verified_at is not null
) proof
where proof.email_identity_hash=management_security.email_hash(proof.user_id)
order by proof.user_id,proof.verified_at desc
on conflict(user_id) do update
  set email_verified_at=excluded.email_verified_at,
      email_verified_identity_hash=excluded.email_verified_identity_hash;

-- Fixed projection: no Auth secrets, session identifiers, hashes or recovery
-- codes cross this boundary. Preserve admin-directory and staff-self access.
create or replace function public.management_user_directory()
returns table (
  id uuid,username text,email text,phone text,notification_email text,
  email_notifications_enabled boolean,email_notification_preferences jsonb,
  full_name text,avatar_url text,role text,status text,last_login_at timestamptz,
  created_at timestamptz,authenticator_verified boolean,email_verified boolean
)
language plpgsql stable security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); actor_role text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    select u.role::text into actor_role from public.users u
      where u.id=actor_id and u.status='active' and u.role in ('admin','user');
    if actor_role is null or not public.security_management_access_allowed(false) then
      raise insufficient_privilege;
    end if;
  end if;
  return query
  select u.id,u.username::text,u.email::text,u.phone::text,u.notification_email::text,
    u.email_notifications_enabled,u.email_notification_preferences::jsonb,
    u.full_name::text,u.avatar_url::text,u.role::text,u.status::text,
    u.last_login_at::timestamptz,u.created_at::timestamptz,
    exists(select 1 from auth.mfa_factors f
      where f.user_id=u.id and f.factor_type='totp' and f.status='verified'),
    coalesce(a.email_verified_at is not null
      and a.email_verified_identity_hash=management_security.email_hash(u.id),false)
  from public.users u left join management_security.accounts a on a.user_id=u.id
  where coalesce(auth.role(),'')='service_role' or actor_role='admin' or u.id=actor_id;
end $$;
revoke all on function public.management_user_directory() from public,anon;
grant execute on function public.management_user_directory() to authenticated,service_role;

notify pgrst,'reload schema';
commit;
