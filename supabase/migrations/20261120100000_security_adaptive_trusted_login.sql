begin;

-- Risk data is private and contains only gateway-derived account/IP hashes.
create table management_security.login_attempts (
  login_hash text primary key check(login_hash ~ '^[a-f0-9]{64}$'),
  failures integer not null default 0 check(failures between 0 and 1000),
  last_failed_at timestamptz not null,
  ip_hash text not null check(ip_hash ~ '^[a-f0-9]{64}$')
);
alter table management_security.login_attempts enable row level security;
create index login_attempts_expiry on management_security.login_attempts(last_failed_at);
revoke all on management_security.login_attempts from public,anon,authenticated,service_role;

alter table management_security.sessions
  add column login_hash text,
  add column login_failures integer not null default 0,
  add column device_family_hash text,
  add column step_up_after timestamptz;
alter table management_security.devices
  add column password_identity_hash text,
  add column email_identity_hash text;

create function public.security_login_attempt(p_login text,p_ip text,p_success boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if coalesce(p_login,'') !~ '^[a-f0-9]{64}$' or coalesce(p_ip,'') !~ '^[a-f0-9]{64}$' or p_success is null then return jsonb_build_object('ok',false); end if;
  if p_success then
    select failures into n from management_security.login_attempts
      where login_hash=p_login and last_failed_at>clock_timestamp()-interval '15 minutes';
  else
    insert into management_security.login_attempts as r(login_hash,failures,last_failed_at,ip_hash)
      values(p_login,1,clock_timestamp(),p_ip)
      on conflict(login_hash) do update set
        failures=case when r.last_failed_at<=clock_timestamp()-interval '15 minutes' then 1 else least(r.failures+1,1000) end,
        last_failed_at=clock_timestamp(),ip_hash=p_ip returning failures into n;
  end if;
  delete from management_security.login_attempts where last_failed_at<clock_timestamp()-interval '1 day';
  return jsonb_build_object('ok',true,'failures',coalesce(n,0));
end $$;

create function management_security.device_identity_valid(p_device uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from management_security.devices d join auth.users u on u.id=d.user_id
    where d.id=p_device and d.user_id=p_user and not d.local_dev and d.revoked_at is null
      and d.expires_at>clock_timestamp() and d.email_identity_hash=management_security.email_hash(p_user)
      and d.password_identity_hash=encode(extensions.digest(coalesce(u.encrypted_password,''),'sha256'),'hex'));
$$;

-- An old AAL2 claim must not satisfy a new browser/risk challenge. Auth must
-- record another actual TOTP verification after that transition.
create or replace function management_security.mfa_at(p_user uuid,p_session uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
  select max(c.updated_at) from auth.mfa_amr_claims c join auth.sessions s on s.id=c.session_id
    join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
    left join management_security.sessions ms on ms.session_id=s.id and ms.user_id=s.user_id
    where s.id=p_session and s.user_id=p_user and s.aal='aal2'
      and f.factor_type='totp' and f.status='verified' and c.authentication_method='totp'
      and (ms.step_up_after is null or c.updated_at>ms.step_up_after);
$$;

create function management_security.login_risk(p_user uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select s.login_failures>=3 or exists(
      select 1 from management_security.login_attempts r where r.login_hash=s.login_hash
        and r.failures>=3 and r.last_failed_at>clock_timestamp()-interval '15 minutes')
    from management_security.sessions s where s.user_id=p_user and s.session_id=p_session),true)
    or (select count(*)>=3 from management_security.audit_events
      where user_id=p_user and event_type in ('mfa_challenge_failed','email_challenge_failed')
        and created_at>clock_timestamp()-interval '15 minutes'
        and created_at>coalesce((select max(created_at) from management_security.audit_events
          where user_id=p_user and success and event_type in ('mfa_challenge_verified','email_challenge_verified')),'epoch'::timestamptz));
$$;

-- Only sessions explicitly trusted after full verification get a 30-day
-- restoration window. Other sessions keep the existing six-hour policy.
create or replace function management_security.live(p_user uuid,p_session uuid,p_ip text default null) returns boolean
language sql stable security definer set search_path='' as $$
  select management_security.auth_session(p_user,p_session) and exists(
    select 1 from management_security.sessions s cross join management_security.settings c
    where s.user_id=p_user and s.session_id=p_session and s.revoked_at is null
      and s.expires_at>clock_timestamp()
      and s.last_activity_at>clock_timestamp()-case
        when management_security.device_identity_valid(s.device_id,p_user) then interval '30 days'
        else make_interval(secs=>c.idle_seconds) end
      and (p_ip is null or s.ip_hash=p_ip));
$$;

create or replace function management_security.dev_device_at(p_user uuid,p_session uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
  select s.dev_device_verified_at from management_security.sessions s
  join management_security.devices d on d.id=s.device_id and d.user_id=s.user_id
  join management_security.accounts a on a.user_id=s.user_id
  where s.user_id=p_user and s.session_id=p_session and not s.recovery_only
    and management_security.live(p_user,p_session) and s.authorized_at is not null
    and d.revoked_at is null and d.expires_at>clock_timestamp()
    and ((d.local_dev and d.ip_hash=s.ip_hash and d.agent_hash=s.agent_hash)
      or (not d.local_dev and management_security.device_identity_valid(d.id,p_user)
        and d.agent_family_hash=s.device_family_hash))
    and s.email_identity_hash=management_security.email_hash(p_user)
    and a.recovery_session_id is null and a.recovery_ack_at is not null;
$$;

create or replace function public.security_trusted_device_login(p_user uuid,p_session uuid,p_ip text,p_network text,p_agent text,p_agent_family text,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d management_security.devices; s management_security.sessions; risk boolean;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if coalesce(p_ip,'') !~ '^[a-f0-9]{64}$' or coalesce(p_agent,'') !~ '^[a-f0-9]{64}$'
    or coalesce(p_agent_family,'') !~ '^[a-f0-9]{64}$' or coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$'
    or (p_network is not null and p_network !~ '^[a-f0-9]{64}$') then return jsonb_build_object('ok',false); end if;
  select * into s from management_security.sessions where user_id=p_user and session_id=p_session for update;
  if s.session_id is null or s.recovery_only or not management_security.live(p_user,p_session,p_ip)
    or s.agent_hash is distinct from p_agent or s.password_verified_at<clock_timestamp()-interval '2 minutes'
    or not exists(select 1 from auth.mfa_amr_claims where session_id=p_session and authentication_method='password')
    or not exists(select 1 from management_security.accounts where user_id=p_user and recovery_session_id is null and recovery_ack_at is not null)
    then return jsonb_build_object('ok',false); end if;
  select * into d from management_security.devices where user_id=p_user and token_hash=p_token_hash for update;
  if d.id is null or not management_security.device_identity_valid(d.id,p_user) then return jsonb_build_object('ok',false,'reason','unknown_device'); end if;
  risk:=management_security.login_risk(p_user,p_session)
    or (s.login_failures>0 and not management_security.familiar_network(p_user,p_ip,p_network));
  if d.agent_family_hash is distinct from p_agent_family or risk then
    perform management_security.audit(p_user,p_session,'risk_step_up_required',true,p_ip,
      jsonb_build_object('reason',case when risk then 'failed_attempts' else 'device_agent_changed' end,'device_id',d.id));
    return jsonb_build_object('ok',false,'reason','verification_required');
  end if;
  update management_security.devices set ip_hash=p_ip,agent_hash=p_agent,
    known_networks=management_security.merge_networks(array[p_ip,p_network],d.known_networks),last_seen_at=clock_timestamp() where id=d.id;
  update management_security.sessions set device_id=d.id,device_family_hash=p_agent_family,
    dev_device_verified_at=clock_timestamp(),authorized_at=clock_timestamp(),email_required=false,
    email_identity_hash=management_security.email_hash(p_user),expires_at=d.expires_at where session_id=p_session;
  perform management_security.audit(p_user,p_session,'session_authorized',true,p_ip,jsonb_build_object('method','trusted_device','device_id',d.id));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.security_trusted_device_remember(p_user uuid,p_session uuid,p_ip text,p_network text,p_agent text,p_agent_family text,p_token_hash text,p_previous_hash text,p_label text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d management_security.devices; s management_security.sessions; password_hash text; deadline timestamptz;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if coalesce(p_ip,'') !~ '^[a-f0-9]{64}$' or coalesce(p_agent,'') !~ '^[a-f0-9]{64}$'
    or coalesce(p_agent_family,'') !~ '^[a-f0-9]{64}$' or coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$'
    or (p_network is not null and p_network !~ '^[a-f0-9]{64}$')
    or (p_previous_hash is not null and p_previous_hash !~ '^[a-f0-9]{64}$') then return jsonb_build_object('ok',false); end if;
  select * into s from management_security.sessions where user_id=p_user and session_id=p_session for update;
  -- A remembered-device proof cannot create/extend trust by itself. Require
  -- an actual TOTP/email factor, including all mailbox and recovery guards.
  if s.session_id is null or s.recovery_only or s.authorized_at is null or not management_security.live(p_user,p_session,p_ip)
    or s.agent_hash is distinct from p_agent
    or greatest(management_security.mfa_at(p_user,p_session),management_security.email_factor_at(p_user,p_session)) is null
    or s.email_identity_hash is distinct from management_security.email_hash(p_user)
    or (s.email_required and s.email_verified_at is null)
    or not exists(select 1 from management_security.accounts where user_id=p_user and recovery_session_id is null and recovery_ack_at is not null)
    or (s.device_id is not null and not exists(select 1 from management_security.devices where id=s.device_id and user_id=p_user and revoked_at is null and expires_at>clock_timestamp()))
    then return jsonb_build_object('ok',false); end if;
  if p_previous_hash is not null then
    select * into d from management_security.devices where user_id=p_user and token_hash=p_previous_hash
      and not local_dev and revoked_at is null and expires_at>clock_timestamp() for update;
  end if;
  select encode(extensions.digest(coalesce(encrypted_password,''),'sha256'),'hex') into password_hash from auth.users where id=p_user;
  -- The deadline is tied to the verification, never sliding on password login.
  deadline:=greatest(management_security.mfa_at(p_user,p_session),management_security.email_factor_at(p_user,p_session))+interval '30 days';
  if d.id is null then
    insert into management_security.devices(user_id,token_hash,ip_hash,agent_hash,agent_family_hash,known_networks,label,expires_at,password_identity_hash,email_identity_hash)
      values(p_user,p_token_hash,p_ip,p_agent,p_agent_family,array_remove(array[p_ip,p_network],null),
        left(coalesce(nullif(btrim(p_label),''),'Thiết bị của tôi'),120),deadline,password_hash,management_security.email_hash(p_user)) returning * into d;
    perform management_security.audit(p_user,p_session,'trusted_device_created',true,p_ip,jsonb_build_object('device_id',d.id));
  else
    update management_security.devices set token_hash=p_token_hash,ip_hash=p_ip,agent_hash=p_agent,agent_family_hash=p_agent_family,
      known_networks=management_security.merge_networks(array[p_ip,p_network],d.known_networks),
      label=coalesce(nullif(left(btrim(p_label),120),''),label),last_seen_at=clock_timestamp(),expires_at=deadline,
      password_identity_hash=password_hash,email_identity_hash=management_security.email_hash(p_user) where id=d.id returning * into d;
  end if;
  update management_security.sessions set device_id=d.id,device_family_hash=p_agent_family,
    dev_device_verified_at=clock_timestamp(),expires_at=deadline,login_failures=0 where session_id=p_session;
  delete from management_security.login_attempts where login_hash=s.login_hash;
  return jsonb_build_object('ok',true,'device_id',d.id,'expires_at',deadline,'session_expires_at',deadline);
end $$;

-- A valid, already-authorized session may follow a Wi-Fi/mobile IP change.
-- Its device, browser family, account identity and absolute deadline still apply.
create function public.security_trusted_session_resume(p_user uuid,p_session uuid,p_ip text,p_network text,p_agent text,p_agent_family text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s management_security.sessions; d management_security.devices; changed boolean;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if coalesce(p_ip,'') !~ '^[a-f0-9]{64}$' or coalesce(p_agent,'') !~ '^[a-f0-9]{64}$'
    or coalesce(p_agent_family,'') !~ '^[a-f0-9]{64}$' or (p_network is not null and p_network !~ '^[a-f0-9]{64}$') then return jsonb_build_object('ok',false); end if;
  select * into s from management_security.sessions where user_id=p_user and session_id=p_session for update;
  if s.session_id is null or s.authorized_at is null or s.recovery_only or not management_security.live(p_user,p_session)
    then return jsonb_build_object('ok',false); end if;
  select * into d from management_security.devices where id=s.device_id and user_id=p_user for update;
  if d.id is null or d.local_dev then return jsonb_build_object('ok',false); end if;
  changed:=s.ip_hash is distinct from p_ip or s.agent_hash is distinct from p_agent;
  if not management_security.device_identity_valid(d.id,p_user)
    or s.email_identity_hash is distinct from management_security.email_hash(p_user)
    or d.agent_family_hash is distinct from p_agent_family or s.device_family_hash is distinct from p_agent_family
    or not exists(select 1 from management_security.accounts where user_id=p_user and recovery_session_id is null and recovery_ack_at is not null)
    or (changed and management_security.login_risk(p_user,p_session)) then
    update management_security.sessions set authorized_at=null,dev_device_verified_at=null,
      device_id=null,device_family_hash=null,step_up_after=clock_timestamp(),
      email_required=true,email_verified_at=null,email_identity_hash=null,
      email_mfa_at=null,email_mfa_challenge=null,email_mfa_ip=null,email_mfa_agent=null,
      password_confirmed_at=null where session_id=p_session;
    perform management_security.audit(p_user,p_session,'risk_step_up_required',true,p_ip,jsonb_build_object('reason','trusted_session_changed'));
    return jsonb_build_object('ok',false);
  end if;
  update management_security.sessions set ip_hash=p_ip,agent_hash=p_agent,last_activity_at=clock_timestamp(),
    password_confirmed_at=case when changed then null else password_confirmed_at end,
    dev_device_verified_at=coalesce(dev_device_verified_at,authorized_at) where session_id=p_session;
  update management_security.devices set last_seen_at=clock_timestamp(),
    known_networks=management_security.merge_networks(array[p_ip,p_network],d.known_networks) where id=d.id;
  return jsonb_build_object('ok',true);
end $$;

-- Preserve the existing state machine, adding only service-recorded risk data.
do $migration$
declare definition text; anchor text;
begin
  select pg_get_functiondef('public.security_service(text,uuid,uuid,text,text,jsonb)'::regprocedure) into definition;
  anchor:='perform management_security.audit(p_user,p_session,''password_verified'',true,p_ip);';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected registration dispatcher'; end if;
  definition:=replace(definition,anchor,$patch$
    update management_security.sessions set login_hash=p_data->>'login_hash',
      login_failures=greatest(0,least(coalesce((p_data->>'login_failures')::integer,0),1000)) where session_id=p_session;
    perform management_security.audit(p_user,p_session,'password_verified',true,p_ip);
  $patch$);
  -- A registered, verified mailbox does not need another email OTP after
  -- a real TOTP login. First-time setup and account recovery still require it.
  anchor:='email_ok:=s.email_verified_at is not null and s.email_identity_hash=management_security.email_hash(p_user);';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected mailbox dispatcher'; end if;
  execute replace(definition,anchor,anchor||$patch$
    if not s.recovery_only and mfa_time is not null and a.email_verified_at is not null
      and a.email_verified_identity_hash=management_security.email_hash(p_user) then
      update management_security.sessions set email_required=false,email_identity_hash=management_security.email_hash(p_user)
        where session_id=p_session returning * into s;
      email_ok:=true;
    end if;
  $patch$);
  select pg_get_functiondef('public.security_management_access_allowed(boolean)'::regprocedure) into definition;
  anchor:='if s.authorized_at is null or s.recovery_only then return false; end if;';
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected access guard'; end if;
  execute replace(definition,anchor,anchor||$patch$
    if s.device_id is not null and exists(select 1 from management_security.devices where id=s.device_id and not local_dev)
      and not management_security.device_identity_valid(s.device_id,uid) then return false; end if;
  $patch$);
  -- All risk transitions in the legacy dispatcher must invalidate old MFA too.
  select pg_get_functiondef('public.security_service(text,uuid,uuid,text,text,jsonb)'::regprocedure) into definition;
  anchor:='authorized_at=null,device_id=null';
  if position(anchor in definition)=0 then raise exception 'Missing risk reset'; end if;
  execute replace(definition,anchor,'authorized_at=null,device_id=null,dev_device_verified_at=null,step_up_after=clock_timestamp()');
end $migration$;

revoke all on function management_security.device_identity_valid(uuid,uuid),management_security.login_risk(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.security_login_attempt(text,text,boolean),public.security_trusted_session_resume(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.security_login_attempt(text,text,boolean),public.security_trusted_session_resume(uuid,uuid,text,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
