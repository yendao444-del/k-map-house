create table if not exists public.tenant_web_accounts (
  tenant_id text primary key references public.tenants(id) on delete restrict,
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  email text not null unique check(email=lower(btrim(email))),
  status text not null default 'pending' check(status in ('pending','active','locked')),
  activated_at timestamptz,
  last_login_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tenant_web_accounts add column if not exists session_version integer not null default 0;
alter table public.webmobile_auth_sessions add column if not exists account_version integer;
alter table public.tenant_web_accounts enable row level security;
revoke all on public.tenant_web_accounts from public,anon,authenticated;
grant select on public.tenant_web_accounts to authenticated;
grant all on public.tenant_web_accounts to service_role;
drop policy if exists tenant_web_accounts_staff_read on public.tenant_web_accounts;
create policy tenant_web_accounts_staff_read on public.tenant_web_accounts for select to authenticated
  using(exists(select 1 from public.users u where u.id=auth.uid() and u.status='active'));

-- Both demo and real portal identities are Auth users, never staff identities.
do $$ declare constraint_name text; begin
  for constraint_name in select conname from pg_constraint
    where conrelid='public.webmobile_auth_sessions'::regclass and confrelid='public.webmobile_demo_accounts'::regclass
  loop execute format('alter table public.webmobile_auth_sessions drop constraint %I',constraint_name); end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.webmobile_auth_sessions'::regclass and confrelid='auth.users'::regclass) then
    alter table public.webmobile_auth_sessions add constraint webmobile_portal_sessions_auth_user_fkey foreign key(user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

create or replace function public.webmobile_enroll_tenant(p_user_id uuid,p_tenant_id text,p_email text,p_actor uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.users where id=p_actor and role='admin' and status='active') then raise exception 'Admin required'; end if;
  if not exists(select 1 from public.tenants where id=p_tenant_id and is_active and lower(btrim(email))=p_email) then raise exception 'Tenant/email mismatch'; end if;
  if not exists(select 1 from auth.users where id=p_user_id and raw_app_meta_data->>'portal_role'='webmobile_tenant') then raise exception 'Invalid portal identity'; end if;
  update auth.users set role='anon' where id=p_user_id;
  delete from public.users where id=p_user_id;
  insert into public.tenant_web_accounts(tenant_id,auth_user_id,email,created_by) values(p_tenant_id,p_user_id,p_email,p_actor);
end $$;
revoke all on function public.webmobile_enroll_tenant(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.webmobile_enroll_tenant(uuid,text,text,uuid) to service_role;

-- Serialize revocation against login so an in-flight login cannot restore a revoked session.
create or replace function public.webmobile_revoke_tenant(p_tenant_id text,p_status text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare portal_id uuid;
begin
  if p_status is not null and p_status not in ('lock','unlock') then raise exception 'Invalid status'; end if;
  update tenant_web_accounts set session_version=session_version+1,
    status=case when p_status='lock' then 'locked' when p_status='unlock' then case when activated_at is null then 'pending' else 'active' end else status end,
    updated_at=now()
  where tenant_id=p_tenant_id returning auth_user_id into portal_id;
  if portal_id is null then raise exception 'Account missing'; end if;
  delete from webmobile_auth_sessions where user_id=portal_id;
end $$;
revoke all on function public.webmobile_revoke_tenant(text,text) from public,anon,authenticated;
grant execute on function public.webmobile_revoke_tenant(text,text) to service_role;

create or replace function public.webmobile_save_tenant_session(p_id uuid,p_user uuid,p_version integer,p_access text,p_refresh text,p_expiry timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare current_version integer;
begin
  select session_version into current_version from tenant_web_accounts where auth_user_id=p_user and status<>'locked' for update;
  if current_version is null or current_version<>p_version then raise exception 'Session revoked'; end if;
  insert into webmobile_auth_sessions(id,user_id,account_version,access_token,refresh_token,token_expires_at)
  values(p_id,p_user,p_version,p_access,p_refresh,p_expiry);
  update tenant_web_accounts set status='active',activated_at=coalesce(activated_at,now()),last_login_at=now(),updated_at=now() where auth_user_id=p_user;
end $$;
revoke all on function public.webmobile_save_tenant_session(uuid,uuid,integer,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.webmobile_save_tenant_session(uuid,uuid,integer,text,text,timestamptz) to service_role;
