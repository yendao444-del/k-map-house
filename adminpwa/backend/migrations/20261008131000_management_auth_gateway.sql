begin;
create table if not exists public.admin_pwa_auth_limits (
  key text primary key,
  attempts integer not null,
  window_started_at timestamptz not null
);
alter table public.admin_pwa_auth_limits enable row level security;
revoke all on public.admin_pwa_auth_limits from public,anon,authenticated;
grant all on public.admin_pwa_auth_limits to service_role;
create index if not exists admin_pwa_auth_limits_expiry on public.admin_pwa_auth_limits(window_started_at);

create or replace function public.admin_pwa_auth_rate(p_ip text,p_login text)
returns boolean language plpgsql security definer set search_path='' as $$
declare item record; count_now integer; allowed boolean := true;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise insufficient_privilege; end if;
  if p_ip !~ '^[a-f0-9]{64}$' or p_login !~ '^[a-f0-9]{64}$' or p_ip is null or p_login is null then return false; end if;
  for item in select * from (values ('ip:'||p_ip,60,10),('login:'||p_login,900,100)) as v(key,seconds,max_attempts) order by key loop
    insert into public.admin_pwa_auth_limits(key,attempts,window_started_at)
    values(item.key,1,clock_timestamp())
    on conflict(key) do update set
      attempts=case when admin_pwa_auth_limits.window_started_at <= clock_timestamp()-make_interval(secs=>item.seconds) then 1 else least(admin_pwa_auth_limits.attempts+1,1000000) end,
      window_started_at=case when admin_pwa_auth_limits.window_started_at <= clock_timestamp()-make_interval(secs=>item.seconds) then clock_timestamp() else admin_pwa_auth_limits.window_started_at end
    returning attempts into count_now;
    if count_now > item.max_attempts then allowed := false; end if;
  end loop;
  delete from public.admin_pwa_auth_limits where window_started_at < clock_timestamp()-interval '1 day';
  return allowed;
end $$;
revoke all on function public.admin_pwa_auth_rate(text,text) from public,anon,authenticated;
grant execute on function public.admin_pwa_auth_rate(text,text) to service_role;
grant execute on function public.resolve_login_email(text) to service_role;
commit;
