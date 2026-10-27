-- Private, service-authoritative management security. Rollout flags stay off
-- until recovery, gateway, UI and disposable-account verification are ready.
begin;
create extension if not exists pgcrypto with schema extensions;
create schema management_security;
revoke all on schema management_security from public,anon,authenticated,service_role;

create table management_security.settings (
  singleton boolean primary key default true check(singleton),
  enrollment_enabled boolean not null default false,
  enforce_management boolean not null default false,
  idle_seconds integer not null default 21600 check(idle_seconds between 300 and 86400),
  lifetime_seconds integer not null default 21600 check(lifetime_seconds between 1800 and 86400),
  recent_seconds integer not null default 300 check(recent_seconds between 60 and 900)
);
insert into management_security.settings(singleton) values(true);
create table management_security.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mfa_required boolean not null default false,
  recovery_batch_id uuid,
  recovery_ack_at timestamptz,
  recovery_session_id uuid
);
create table management_security.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text not null check(ip_hash ~ '^[a-f0-9]{64}$'),
  agent_hash text not null check(agent_hash ~ '^[a-f0-9]{64}$'),
  label text not null check(length(label) between 1 and 120),
  created_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index on management_security.devices(user_id,expires_at) where revoked_at is null;
create table management_security.sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references management_security.devices(id),
  ip_hash text not null check(ip_hash ~ '^[a-f0-9]{64}$'),
  agent_hash text not null check(agent_hash ~ '^[a-f0-9]{64}$'),
  password_verified_at timestamptz not null,
  email_required boolean not null default true,
  email_verified_at timestamptz,
  email_identity_hash text,
  authorized_at timestamptz,
  recovery_only boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  last_activity_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index on management_security.sessions(user_id) where revoked_at is null;
create table management_security.recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  used_at timestamptz,
  unique(user_id,code_hash)
);
create table management_security.email_challenges (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references management_security.sessions(session_id) on delete cascade,
  purpose text not null check(purpose in ('signin','recovery')),
  ip_hash text not null,
  email_identity_hash text not null,
  code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check(attempts between 0 and 5),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp()+interval '5 minutes'),
  verified_at timestamptz,
  closed_at timestamptz,
  delivery_failed_at timestamptz
);
create index on management_security.email_challenges(user_id,created_at desc);
create table management_security.rate_limits(key text primary key,attempts integer not null,window_started_at timestamptz not null);
create table management_security.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  event_type text not null check(event_type in (
    'password_verified','mfa_enrollment_started','mfa_enrollment_verified','mfa_disabled',
    'mfa_challenge_failed','mfa_challenge_verified','email_sent','email_delivery_failed',
    'email_challenge_failed','email_challenge_verified','rate_limited',
    'recovery_codes_issued','recovery_codes_acknowledged','recovery_code_used','recovery_code_failed',
    'trusted_device_created','trusted_device_revoked','session_authorized','session_revoked',
    'sessions_revoked','risk_step_up_required')),
  success boolean not null,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index on management_security.audit_events(user_id,created_at desc);
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='management_security' loop
    execute format('alter table management_security.%I enable row level security',t.tablename);
    execute format('revoke all on management_security.%I from public,anon,authenticated,service_role',t.tablename);
  end loop;
end $$;

create function management_security.audit(p_user uuid,p_session uuid,p_type text,p_success boolean,p_ip text,p_metadata jsonb default '{}')
returns void language sql security definer set search_path='' as $$
  insert into management_security.audit_events(user_id,session_id,event_type,success,ip_hash,metadata)
    values(p_user,p_session,p_type,p_success,p_ip,p_metadata);
$$;
create function management_security.email_hash(p_user uuid) returns text
language sql stable security definer set search_path='' as $$
  select encode(extensions.digest(lower(btrim(email)),'sha256'),'hex') from auth.users where id=p_user;
$$;
create function management_security.auth_session(p_user uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.sessions s join public.users u on u.id=s.user_id
    where s.id=p_session and s.user_id=p_user and u.status='active' and u.role in ('admin','user')
      and (s.not_after is null or s.not_after>clock_timestamp()));
$$;
create function management_security.mfa_at(p_user uuid,p_session uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
  select max(c.updated_at) from auth.mfa_amr_claims c join auth.sessions s on s.id=c.session_id
    join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
    where s.id=p_session and s.user_id=p_user and s.aal='aal2'
      and f.factor_type='totp' and f.status='verified' and c.authentication_method='totp';
$$;
create function management_security.live(p_user uuid,p_session uuid,p_ip text default null) returns boolean
language sql stable security definer set search_path='' as $$
  select management_security.auth_session(p_user,p_session) and exists(
    select 1 from management_security.sessions s cross join management_security.settings c
    where s.user_id=p_user and s.session_id=p_session and s.revoked_at is null
      and s.expires_at>clock_timestamp() and s.last_activity_at>clock_timestamp()-make_interval(secs=>c.idle_seconds)
      and (p_ip is null or s.ip_hash=p_ip));
$$;
create function management_security.required(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (select enforce_management from management_security.settings where singleton)
    or exists(select 1 from management_security.accounts where user_id=p_user and mfa_required)
    or exists(select 1 from auth.mfa_factors where user_id=p_user and factor_type='totp' and status='verified');
$$;
create function management_security.rate(p_kind text,p_user uuid,p_ip text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare item text; n integer; ok boolean:=true;
begin
  for item in select unnest(array[p_kind||':user:'||p_user::text,p_kind||':ip:'||p_ip]) order by 1 loop
    insert into management_security.rate_limits as r(key,attempts,window_started_at)
      values(item,1,clock_timestamp()) on conflict(key) do update set
      attempts=case when r.window_started_at<=clock_timestamp()-make_interval(secs=>p_seconds) then 1 else least(r.attempts+1,1000000) end,
      window_started_at=case when r.window_started_at<=clock_timestamp()-make_interval(secs=>p_seconds) then clock_timestamp() else r.window_started_at end
      returning attempts into n;
    if n>p_limit then ok:=false; end if;
  end loop;
  if not ok then perform management_security.audit(p_user,null,'rate_limited',false,p_ip,jsonb_build_object('kind',p_kind)); end if;
  delete from management_security.rate_limits where window_started_at<clock_timestamp()-interval '2 days';
  return ok;
end $$;

-- A single service-only dispatcher keeps transitions transactional. Edge must
-- verify the bearer with Auth before passing p_user/session, and derive IP/agent.
create function public.security_service(p_action text,p_user uuid,p_session uuid,p_ip text,p_agent text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare s management_security.sessions; a management_security.accounts; d management_security.devices;
  c management_security.email_challenges; cfg management_security.settings; factor uuid;
  mfa_time timestamptz; started timestamptz; batch uuid; code_id uuid; plain text; codes jsonb:='[]'; i integer; kind text; email_ok boolean;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if p_user is null or p_session is null or p_ip is null or p_agent is null or p_ip !~ '^[a-f0-9]{64}$' or p_agent !~ '^[a-f0-9]{64}$' or not management_security.auth_session(p_user,p_session) then return jsonb_build_object('ok',false,'state','expired'); end if;
  select * into cfg from management_security.settings where singleton;
  if p_action='register' then
    select created_at into started from auth.sessions where id=p_session;
    if started<clock_timestamp()-interval '2 minutes' or not exists(select 1 from auth.mfa_amr_claims where session_id=p_session and authentication_method='password') then raise insufficient_privilege; end if;
    select * into d from management_security.devices where user_id=p_user and token_hash=p_data->>'device_hash' and revoked_at is null and expires_at>clock_timestamp() and ip_hash=p_ip and agent_hash=p_agent;
    insert into management_security.accounts(user_id,mfa_required) values(p_user,management_security.required(p_user))
      on conflict(user_id) do update set mfa_required=management_security.accounts.mfa_required or excluded.mfa_required;
    insert into management_security.sessions(session_id,user_id,device_id,ip_hash,agent_hash,password_verified_at,email_required,expires_at)
      values(p_session,p_user,d.id,p_ip,p_agent,started,d.id is null,started+make_interval(secs=>cfg.lifetime_seconds))
      on conflict(session_id) do nothing;
    perform management_security.audit(p_user,p_session,'password_verified',true,p_ip);
    if d.id is null then perform management_security.audit(p_user,p_session,'risk_step_up_required',true,p_ip,jsonb_build_object('reason','new_device_or_ip')); end if;
  end if;
  if not management_security.live(p_user,p_session) then return jsonb_build_object('ok',false,'state','expired'); end if;
  select * into s from management_security.sessions where session_id=p_session for update;
  if p_action in ('register','status') and (s.ip_hash<>p_ip or s.agent_hash<>p_agent) then
    update management_security.sessions set ip_hash=p_ip,agent_hash=p_agent,email_required=true,email_verified_at=null,email_identity_hash=null,authorized_at=null,device_id=null where session_id=p_session returning * into s;
    perform management_security.audit(p_user,p_session,'risk_step_up_required',true,p_ip,jsonb_build_object('reason','ip_or_agent_changed'));
  end if;
  if s.ip_hash<>p_ip or s.agent_hash<>p_agent then return jsonb_build_object('ok',false,'state','risk'); end if;
  select * into a from management_security.accounts where user_id=p_user;
  select id into factor from auth.mfa_factors where user_id=p_user and factor_type='totp' and status='verified' order by created_at limit 1;
  mfa_time:=management_security.mfa_at(p_user,p_session);
  email_ok:=s.email_verified_at is not null and s.email_identity_hash=management_security.email_hash(p_user);

  if p_action in ('register','status') then
    return jsonb_build_object('ok',true,'state',case
      when s.recovery_only then 'recovery' when not management_security.required(p_user) then 'optional'
      when factor is null then 'enroll' when mfa_time is null then 'totp'
      when s.email_required and not email_ok then 'email' when a.recovery_ack_at is null then 'recovery_codes'
      when s.authorized_at is null then 'authorize' else 'ready' end,
      'factor_id',factor,'enrollment_enabled',cfg.enrollment_enabled,'email_required',s.email_required,
      'email_verified',email_ok,'recovery_acknowledged',a.recovery_ack_at is not null,
      'recent_mfa',mfa_time>clock_timestamp()-make_interval(secs=>cfg.recent_seconds),'expires_at',s.expires_at);
  elsif p_action='rate' then
    kind:=p_data->>'kind';
    return jsonb_build_object('ok',case
      when kind='totp' then management_security.rate(kind,p_user,p_ip,10,300)
      when kind='email_verify' then management_security.rate(kind,p_user,p_ip,10,900)
      when kind='email_send' then management_security.rate(kind,p_user,p_ip,5,900)
      when kind='recovery' then management_security.rate(kind,p_user,p_ip,6,900)
      else false end);
  elsif p_action='mfa_event' then
    if p_data->>'success'='true' and mfa_time is null then raise insufficient_privilege; end if;
    perform management_security.audit(p_user,p_session,case when p_data->>'success'='true' then 'mfa_challenge_verified' else 'mfa_challenge_failed' end,p_data->>'success'='true',p_ip);
    return jsonb_build_object('ok',true);
  elsif p_action='email_create' then
    kind:=p_data->>'purpose';
    if kind not in ('signin','recovery') or (kind='signin' and factor is not null and mfa_time is null) or (kind='recovery' and s.password_verified_at<clock_timestamp()-interval '10 minutes') then raise insufficient_privilege; end if;
    if exists(select 1 from management_security.email_challenges where user_id=p_user and created_at>clock_timestamp()-interval '60 seconds') then return jsonb_build_object('ok',false,'reason','wait'); end if;
    update management_security.email_challenges set closed_at=clock_timestamp() where session_id=p_session and purpose=kind and closed_at is null;
    insert into management_security.email_challenges(id,user_id,session_id,purpose,ip_hash,email_identity_hash,code_hash)
      values((p_data->>'challenge_id')::uuid,p_user,p_session,kind,p_ip,management_security.email_hash(p_user),p_data->>'code_hash');
    perform management_security.audit(p_user,p_session,'email_sent',true,p_ip,jsonb_build_object('purpose',kind));
    return jsonb_build_object('ok',true,'challenge_id',p_data->>'challenge_id','expires_in',300);
  elsif p_action='email_failed' then
    update management_security.email_challenges set delivery_failed_at=clock_timestamp(),closed_at=clock_timestamp()
      where id=(p_data->>'challenge_id')::uuid and user_id=p_user and session_id=p_session and closed_at is null;
    if found then perform management_security.audit(p_user,p_session,'email_delivery_failed',false,p_ip); end if;
    return jsonb_build_object('ok',true);
  elsif p_action='email_verify' then
    select * into c from management_security.email_challenges where id=(p_data->>'challenge_id')::uuid and user_id=p_user and session_id=p_session and purpose=p_data->>'purpose' for update;
    if c.id is null or c.closed_at is not null or c.delivery_failed_at is not null or c.expires_at<=clock_timestamp() or c.attempts>=5 or c.ip_hash<>p_ip or c.email_identity_hash is distinct from management_security.email_hash(p_user) then return jsonb_build_object('ok',false); end if;
    update management_security.email_challenges set attempts=attempts+1 where id=c.id;
    if c.code_hash is distinct from p_data->>'code_hash' then
      perform management_security.audit(p_user,p_session,'email_challenge_failed',false,p_ip); return jsonb_build_object('ok',false);
    end if;
    update management_security.email_challenges set closed_at=clock_timestamp(),verified_at=clock_timestamp() where id=c.id;
    update management_security.sessions set email_verified_at=clock_timestamp(),email_identity_hash=c.email_identity_hash where session_id=p_session;
    perform management_security.audit(p_user,p_session,'email_challenge_verified',true,p_ip,jsonb_build_object('purpose',c.purpose));
    return jsonb_build_object('ok',true);
  elsif p_action='recovery_consume' then
    if s.password_verified_at<clock_timestamp()-interval '10 minutes' or not email_ok or s.email_verified_at<clock_timestamp()-interval '5 minutes'
      or not exists(select 1 from management_security.email_challenges where session_id=p_session and purpose='recovery' and verified_at>clock_timestamp()-interval '5 minutes') then return jsonb_build_object('ok',false); end if;
    perform pg_advisory_xact_lock(hashtextextended(p_user::text,401));
    update management_security.recovery_codes set used_at=clock_timestamp()
      where user_id=p_user and code_hash=p_data->>'code_hash' and used_at is null and batch_id=a.recovery_batch_id and a.recovery_ack_at is not null returning id into code_id;
    if code_id is null then perform management_security.audit(p_user,p_session,'recovery_code_failed',false,p_ip); return jsonb_build_object('ok',false); end if;
    update management_security.accounts set mfa_required=true,recovery_ack_at=null,recovery_session_id=p_session where user_id=p_user;
    update management_security.sessions set recovery_only=true,authorized_at=null where session_id=p_session;
    update management_security.sessions set revoked_at=coalesce(revoked_at,clock_timestamp()),authorized_at=null where user_id=p_user and session_id<>p_session;
    update management_security.devices set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=p_user;
    perform management_security.audit(p_user,p_session,'recovery_code_used',true,p_ip,jsonb_build_object('access','reenrollment_only'));
    return jsonb_build_object('ok',true,'state','recovery');
  elsif p_action='recovery_issue' then
    if mfa_time is null or mfa_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds) or (s.email_required and not email_ok) then raise insufficient_privilege; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_user::text,401)); batch:=gen_random_uuid();
    delete from management_security.recovery_codes where user_id=p_user;
    for i in 1..10 loop
      plain:=upper(encode(extensions.gen_random_bytes(16),'hex'));
      insert into management_security.recovery_codes(user_id,batch_id,code_hash) values(p_user,batch,encode(extensions.digest(plain,'sha256'),'hex'));
      codes:=codes||jsonb_build_array(substr(plain,1,8)||'-'||substr(plain,9,8)||'-'||substr(plain,17,8)||'-'||substr(plain,25,8));
    end loop;
    update management_security.accounts set recovery_batch_id=batch,recovery_ack_at=null,mfa_required=true where user_id=p_user;
    perform management_security.audit(p_user,p_session,'recovery_codes_issued',true,p_ip,jsonb_build_object('count',10,'batch_id',batch));
    return jsonb_build_object('ok',true,'batch_id',batch,'codes',codes);
  elsif p_action='recovery_ack' then
    if mfa_time is null or a.recovery_batch_id is distinct from (p_data->>'batch_id')::uuid then return jsonb_build_object('ok',false); end if;
    update management_security.accounts set recovery_ack_at=clock_timestamp() where user_id=p_user;
    perform management_security.audit(p_user,p_session,'recovery_codes_acknowledged',true,p_ip);
    return jsonb_build_object('ok',true);
  elsif p_action='authorize' then
    if management_security.required(p_user) then
      if mfa_time is null or mfa_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds) or a.recovery_ack_at is null or (s.email_required and not email_ok) then return jsonb_build_object('ok',false); end if;
      if s.recovery_only and (a.recovery_session_id is distinct from p_session or mfa_time<=coalesce((select max(created_at) from management_security.audit_events where user_id=p_user and session_id=p_session and event_type='recovery_code_used'),clock_timestamp())) then return jsonb_build_object('ok',false); end if;
    end if;
    update management_security.sessions set authorized_at=clock_timestamp(),recovery_only=false,last_activity_at=clock_timestamp() where session_id=p_session;
    update management_security.accounts set recovery_session_id=null where user_id=p_user and recovery_session_id=p_session;
    perform management_security.audit(p_user,p_session,'session_authorized',true,p_ip);
    return jsonb_build_object('ok',true);
  elsif p_action='revoke_session' then
    if p_data->>'all'='true' and management_security.required(p_user) and (mfa_time is null or mfa_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds)) then raise insufficient_privilege; end if;
    update management_security.sessions set revoked_at=coalesce(revoked_at,clock_timestamp()),authorized_at=null where user_id=p_user and (p_data->>'all'='true' or session_id=p_session);
    if p_data->>'all'='true' then update management_security.devices set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=p_user; end if;
    perform management_security.audit(p_user,p_session,case when p_data->>'all'='true' then 'sessions_revoked' else 'session_revoked' end,true,p_ip);
    return jsonb_build_object('ok',true);
  end if;
  -- Remaining operations require authorized, recent MFA. Never expose hashes.
  if s.authorized_at is null or s.recovery_only or mfa_time is null or mfa_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds) then raise insufficient_privilege; end if;
  if p_action='device_create' then
    if not email_ok then raise insufficient_privilege; end if;
    insert into management_security.devices(user_id,token_hash,ip_hash,agent_hash,label,expires_at)
      values(p_user,p_data->>'token_hash',p_ip,p_agent,left(coalesce(nullif(btrim(p_data->>'label'),''),'Thiết bị của tôi'),120),clock_timestamp()+interval '30 days') returning * into d;
    update management_security.sessions set device_id=d.id where session_id=p_session;
    perform management_security.audit(p_user,p_session,'trusted_device_created',true,p_ip,jsonb_build_object('device_id',d.id));
    return jsonb_build_object('ok',true,'device_id',d.id,'expires_at',d.expires_at);
  elsif p_action='device_revoke' then
    update management_security.devices set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=(p_data->>'device_id')::uuid and user_id=p_user;
    if not found then return jsonb_build_object('ok',false); end if;
    update management_security.sessions set revoked_at=coalesce(revoked_at,clock_timestamp()),authorized_at=null where user_id=p_user and device_id=(p_data->>'device_id')::uuid;
    perform management_security.audit(p_user,p_session,'trusted_device_revoked',true,p_ip,jsonb_build_object('device_id',p_data->>'device_id'));
    return jsonb_build_object('ok',true);
  elsif p_action='overview' then
    return jsonb_build_object('ok',true,
      'devices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'created_at',created_at,'last_seen_at',last_seen_at,'expires_at',expires_at,'revoked_at',revoked_at) order by created_at desc) from management_security.devices where user_id=p_user),'[]'),
      'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',session_id,'current',session_id=p_session,'created_at',created_at,'last_activity_at',last_activity_at,'expires_at',expires_at,'revoked_at',revoked_at) order by created_at desc) from management_security.sessions where user_id=p_user),'[]'),
      'events',coalesce((select jsonb_agg(e) from (select id,event_type,success,created_at from management_security.audit_events where user_id=p_user order by created_at desc limit 50)e),'[]'));
  end if;
  raise exception 'Unsupported security transition';
end $$;

-- Audit actual Auth factor changes. Deleting a verified factor never disables
-- the durable account requirement and revokes old business sessions/devices.
create function management_security.factor_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid; sid uuid; kind text;
begin
  actor:=case when tg_op='DELETE' then old.user_id else new.user_id end;
  -- A cascaded account deletion cannot create a new account/audit FK row.
  if not exists(select 1 from auth.users where id=actor) then return case when tg_op='DELETE' then old else new end; end if;
  if tg_op='INSERT' then kind:='mfa_enrollment_started';
  elsif tg_op='UPDATE' and old.status is distinct from new.status and new.status='verified' then kind:='mfa_enrollment_verified';
  elsif tg_op='DELETE' and old.status='verified' then kind:='mfa_disabled';
  else return case when tg_op='DELETE' then old else new end; end if;
  if kind in ('mfa_enrollment_verified','mfa_disabled') then
    insert into management_security.accounts(user_id,mfa_required) values(actor,true)
      on conflict(user_id) do update set mfa_required=true,recovery_ack_at=null;
    select recovery_session_id into sid from management_security.accounts where user_id=actor;
    if kind='mfa_disabled' then
      update management_security.sessions set revoked_at=coalesce(revoked_at,clock_timestamp()),authorized_at=null where user_id=actor and (sid is null or session_id<>sid);
      update management_security.devices set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=actor;
    end if;
  end if;
  perform management_security.audit(actor,sid,kind,true,null);
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger management_security_factor_audit after insert or update or delete on auth.mfa_factors for each row execute function management_security.factor_audit();

create function public.security_mfa_readiness() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enrollment_enabled',enrollment_enabled,'enforcement_enabled',enforce_management) from management_security.settings where singleton;
$$;
create function public.security_management_access_allowed(p_sensitive boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; role_name text; profile_status text; s management_security.sessions; mfa_time timestamptz;
begin
  if auth.role()='service_role' then return true; end if;
  if uid is null then return false; end if;
  select role,status into role_name,profile_status from public.users where id=uid;
  if role_name in ('admin','user') then
    if profile_status is distinct from 'active' then return false; end if;
  else return coalesce(auth.jwt()->'app_metadata'->>'portal_role'='webmobile_tenant',false); end if;
  if not management_security.required(uid) then return true; end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' or coalesce(auth.jwt()->>'session_id','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return false; end if;
  sid:=(auth.jwt()->>'session_id')::uuid;
  if not management_security.live(uid,sid) then return false; end if;
  select * into s from management_security.sessions where session_id=sid;
  if s.authorized_at is null or s.recovery_only then return false; end if;
  if s.device_id is not null and not exists(select 1 from management_security.devices where id=s.device_id and user_id=uid and revoked_at is null and expires_at>clock_timestamp()) then return false; end if;
  if s.email_required and (s.email_verified_at is null or s.email_identity_hash is distinct from management_security.email_hash(uid)) then return false; end if;
  if not exists(select 1 from management_security.accounts where user_id=uid and recovery_ack_at is not null) then return false; end if;
  mfa_time:=management_security.mfa_at(uid,sid);
  if mfa_time is null then return false; end if;
  return not p_sensitive or mfa_time>clock_timestamp()-(select make_interval(secs=>recent_seconds) from management_security.settings);
end $$;
create function public.security_management_pre_request() returns void
language plpgsql security definer set search_path='' as $$
declare method text:=current_setting('request.method',true); path text:=current_setting('request.path',true); sensitive boolean;
begin
  if auth.role() is distinct from 'authenticated' then return; end if;
  if path='/rpc/security_mfa_readiness' then return; end if;
  sensitive:=coalesce(method,'GET') not in ('GET','HEAD','OPTIONS') and path not in ('/rpc/admin_pwa_investment_read','/rpc/email_server_status','/rpc/contract_account_readiness','/rpc/tenant_email_check');
  if not public.security_management_access_allowed(sensitive) then raise exception 'Management MFA/session verification required' using errcode='42501'; end if;
  if coalesce(auth.jwt()->>'session_id','') ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    update management_security.sessions set last_activity_at=clock_timestamp()
      where session_id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid() and revoked_at is null and last_activity_at<clock_timestamp()-interval '30 seconds';
  end if;
end $$;

-- RLS catches direct table access. The staged pre-request hook also catches
-- SECURITY DEFINER business RPCs. Bootstrap profile reads use the private Edge.
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity loop
    execute format('create policy management_mfa_read_guard on public.%I as restrictive for select to authenticated using (public.security_management_access_allowed(false))',t.relname);
    execute format('create policy management_mfa_insert_guard on public.%I as restrictive for insert to authenticated with check (public.security_management_access_allowed(true))',t.relname);
    execute format('create policy management_mfa_update_guard on public.%I as restrictive for update to authenticated using (public.security_management_access_allowed(true)) with check (public.security_management_access_allowed(true))',t.relname);
    execute format('create policy management_mfa_delete_guard on public.%I as restrictive for delete to authenticated using (public.security_management_access_allowed(true))',t.relname);
  end loop;
end $$;
create policy management_mfa_storage_read_guard on storage.objects as restrictive for select to authenticated using (public.security_management_access_allowed(false));
create policy management_mfa_storage_insert_guard on storage.objects as restrictive for insert to authenticated with check (public.security_management_access_allowed(true));
create policy management_mfa_storage_update_guard on storage.objects as restrictive for update to authenticated using (public.security_management_access_allowed(true)) with check (public.security_management_access_allowed(true));
create policy management_mfa_storage_delete_guard on storage.objects as restrictive for delete to authenticated using (public.security_management_access_allowed(true));

revoke all on all functions in schema management_security from public,anon,authenticated,service_role;
revoke all on function public.security_service(text,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.security_service(text,uuid,uuid,text,text,jsonb) to service_role;
revoke all on function public.security_mfa_readiness(),public.security_management_access_allowed(boolean),public.security_management_pre_request() from public,anon;
grant execute on function public.security_mfa_readiness(),public.security_management_access_allowed(boolean),public.security_management_pre_request() to authenticated,service_role;
-- Hook installation happens only after a rollback test and staged gateway:
-- alter role authenticator set pgrst.db_pre_request='public.security_management_pre_request';
notify pgrst,'reload schema';
commit;
