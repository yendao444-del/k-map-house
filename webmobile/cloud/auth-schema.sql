-- Enrollment and browser sessions are service-only. Demo JWTs keep the existing
-- restricted anon database role; they are not staff accounts in public.users.
create table if not exists public.webmobile_demo_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_kind text not null check(tenant_kind in ('existing','new')),
  contract_id text not null unique check(contract_id in ('demo-current-101','demo-current-102')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.webmobile_auth_sessions (
  id uuid primary key,
  user_id uuid not null references public.webmobile_demo_accounts(user_id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  expires_at timestamptz not null default now()+interval '7 days',
  refresh_lease uuid,
  refresh_locked_until timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webmobile_auth_sessions_expiry on public.webmobile_auth_sessions(expires_at);
alter table public.webmobile_demo_accounts enable row level security;
alter table public.webmobile_auth_sessions enable row level security;
revoke all on public.webmobile_demo_accounts, public.webmobile_auth_sessions from public, anon, authenticated;
grant all on public.webmobile_demo_accounts, public.webmobile_auth_sessions to service_role;

create or replace function public.webmobile_auth_rate(p_ip text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare bucket text := 'auth:'||p_ip||':'||to_char(now(),'YYYYMMDDHH24MI'); hits integer;
begin
  delete from webmobile_auth_sessions where expires_at<now();
  insert into webmobile_demo_limits(key,count,expires_at) values(bucket,1,now()+interval '10 minutes')
  on conflict(key) do update set count=webmobile_demo_limits.count+1 returning count into hits;
  return hits<=10;
end $$;
create or replace function public.webmobile_auth_refresh_claim(p_id uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update webmobile_auth_sessions set refresh_lease=p_lease,refresh_locked_until=now()+interval '30 seconds'
  where id=p_id and expires_at>now() and (refresh_locked_until is null or refresh_locked_until<now());
  return found;
end $$;
revoke all on function public.webmobile_auth_rate(text),public.webmobile_auth_refresh_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.webmobile_auth_rate(text),public.webmobile_auth_refresh_claim(uuid,uuid) to service_role;
