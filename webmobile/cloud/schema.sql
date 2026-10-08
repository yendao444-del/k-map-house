-- Isolated DEMO state: no changes to tenants, contracts, invoices or bank data.
create table if not exists public.webmobile_demo_sessions (
  id uuid primary key,
  state jsonb not null default '{}',
  lease uuid,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.webmobile_demo_limits (
  key text primary key,
  count integer not null default 0,
  expires_at timestamptz not null
);
alter table public.webmobile_demo_sessions enable row level security;
alter table public.webmobile_demo_limits enable row level security;
revoke all on public.webmobile_demo_sessions, public.webmobile_demo_limits from anon, authenticated;
grant all on public.webmobile_demo_sessions, public.webmobile_demo_limits to service_role;

create or replace function public.webmobile_demo_claim(p_id uuid, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  delete from webmobile_demo_sessions where updated_at < now() - interval '24 hours' and (locked_until is null or locked_until < now());
  insert into webmobile_demo_sessions(id) values(p_id) on conflict do nothing;
  update webmobile_demo_sessions set lease=p_lease, locked_until=now()+interval '60 seconds', updated_at=now()
    where id=p_id and (locked_until is null or locked_until < now()) returning state into result;
  if not found then return jsonb_build_object('busy', true); end if;
  return jsonb_build_object('busy', false, 'state', result);
end $$;
create or replace function public.webmobile_demo_release(p_id uuid, p_lease uuid, p_state jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update webmobile_demo_sessions set state=p_state, lease=null, locked_until=null, updated_at=now() where id=p_id and lease=p_lease;
  return found;
end $$;
create or replace function public.webmobile_demo_quota(p_ip text, p_session uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare day_key text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD');
bucket text; current_count integer; max_count integer;
begin
  -- Serializes quota updates for the same day, independently of OCR requests.
  perform pg_advisory_xact_lock(hashtext('webmobile-demo-quota-' || day_key));
  delete from webmobile_demo_limits where expires_at < now();
  for bucket, max_count in select * from (values
    ('global:' || day_key, 200), ('ip:' || day_key || ':' || p_ip, 120), ('session:' || day_key || ':' || p_session::text, 20)
  ) as limits(key, maximum) loop
    select count into current_count from webmobile_demo_limits where key=bucket;
    if coalesce(current_count, 0) >= max_count then return false; end if;
  end loop;
  for bucket in select * from (values ('global:' || day_key), ('ip:' || day_key || ':' || p_ip), ('session:' || day_key || ':' || p_session::text)) as limits(key) loop
    insert into webmobile_demo_limits(key, count, expires_at) values(bucket, 1, now()+interval '48 hours')
      on conflict(key) do update set count=webmobile_demo_limits.count+1;
  end loop;
  return true;
end $$;
revoke all on function public.webmobile_demo_claim(uuid,uuid), public.webmobile_demo_release(uuid,uuid,jsonb), public.webmobile_demo_quota(text,uuid) from public, anon, authenticated;
grant execute on function public.webmobile_demo_claim(uuid,uuid), public.webmobile_demo_release(uuid,uuid,jsonb), public.webmobile_demo_quota(text,uuid) to service_role;
