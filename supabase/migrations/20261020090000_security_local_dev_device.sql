begin;

-- Provisioned only by the operator, never by a browser-supplied dev flag.
alter table management_security.devices add column if not exists local_dev boolean not null default false;
alter table management_security.sessions add column if not exists dev_device_verified_at timestamptz;

create or replace function management_security.dev_device_at(p_user uuid,p_session uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
  select s.dev_device_verified_at from management_security.sessions s
  join management_security.devices d on d.id=s.device_id and d.user_id=s.user_id
  join management_security.accounts a on a.user_id=s.user_id
  where s.user_id=p_user and s.session_id=p_session and not s.recovery_only
    and management_security.live(p_user,p_session) and s.authorized_at is not null
    and d.local_dev and d.revoked_at is null and d.expires_at>clock_timestamp()
    and d.ip_hash=s.ip_hash and d.agent_hash=s.agent_hash
    and s.email_identity_hash=management_security.email_hash(p_user)
    and a.recovery_session_id is null and a.recovery_ack_at is not null;
$$;
revoke all on function management_security.dev_device_at(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.security_dev_device_login(p_user uuid,p_session uuid,p_ip text,p_agent text,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d management_security.devices; s management_security.sessions;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  select * into s from management_security.sessions where user_id=p_user and session_id=p_session for update;
  if s.session_id is null or s.recovery_only or not management_security.live(p_user,p_session,p_ip)
    or s.agent_hash is distinct from p_agent or s.password_verified_at<clock_timestamp()-interval '2 minutes'
    or not exists(select 1 from auth.mfa_amr_claims where session_id=p_session and authentication_method='password')
    or not exists(select 1 from management_security.accounts where user_id=p_user and recovery_session_id is null and recovery_ack_at is not null)
    then return jsonb_build_object('ok',false); end if;
  select * into d from management_security.devices where user_id=p_user and token_hash=p_token_hash
    and local_dev and revoked_at is null and expires_at>clock_timestamp() for update;
  if d.id is null or p_ip !~ '^[a-f0-9]{64}$' or p_agent !~ '^[a-f0-9]{64}$'
    or (d.ip_hash<>repeat('0',64) and (d.ip_hash<>p_ip or d.agent_hash<>p_agent))
    then return jsonb_build_object('ok',false); end if;
  update management_security.devices set ip_hash=p_ip,agent_hash=p_agent,last_seen_at=clock_timestamp() where id=d.id;
  update management_security.sessions set device_id=d.id,dev_device_verified_at=clock_timestamp(),
    authorized_at=clock_timestamp(),email_required=false,email_identity_hash=management_security.email_hash(p_user)
    where session_id=p_session;
  perform management_security.audit(p_user,p_session,'session_authorized',true,p_ip,jsonb_build_object('method','local_dev_device','device_id',d.id));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.security_dev_device_status(p_user uuid,p_session uuid,p_ip text,p_agent text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  return jsonb_build_object('ok',exists(select 1 from management_security.sessions s where s.user_id=p_user
    and s.session_id=p_session and s.ip_hash=p_ip and s.agent_hash=p_agent
    and management_security.dev_device_at(p_user,p_session) is not null));
end $$;
revoke all on function public.security_dev_device_login(uuid,uuid,text,text,text),public.security_dev_device_status(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.security_dev_device_login(uuid,uuid,text,text,text),public.security_dev_device_status(uuid,uuid,text,text) to service_role;

create or replace function management_security.login_factor_at(p_user uuid,p_session uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
  select greatest(management_security.mfa_at(p_user,p_session),management_security.email_factor_at(p_user,p_session),management_security.dev_device_at(p_user,p_session));
$$;

-- Patch only the explicit dev-device exception; preserve every existing role,
-- TOTP/email/recovery/session check for all other sessions.
do $migration$
declare definition text; old text; replacement text;
begin
  select pg_get_functiondef('public.security_service(text,uuid,uuid,text,text,jsonb)'::regprocedure) into definition;
  if position('''device_verified''' in definition)=0 then
    old:='when not management_security.required(p_user) then ''optional''';
    replacement:='when management_security.dev_device_at(p_user,p_session) is not null then ''ready'' '||old;
    if (length(definition)-length(replace(definition,old,'')))/length(old)<>1 then raise exception 'Unexpected security state dispatcher'; end if;
    definition:=replace(definition,old,replacement);
    old:='''email_login_available'',management_security.email_login_eligible(p_user)';
    replacement:='''device_verified'',management_security.dev_device_at(p_user,p_session) is not null,'||old;
    if position(old in definition)=0 then raise exception 'Missing login state fields'; end if;
    definition:=replace(definition,old,replacement);
    definition:=replace(definition,'when mfa_time is not null then ''totp'' when login_time is not null then ''email''','when mfa_time is not null then ''totp'' when management_security.dev_device_at(p_user,p_session) is not null then ''dev_device'' when login_time is not null then ''email''');
    execute definition;
  end if;
  select pg_get_functiondef('public.security_management_access_allowed(boolean)'::regprocedure) into definition;
  if position('management_security.dev_device_at' in definition)=0 then
    old:='if s.authorized_at is null or s.recovery_only then return false; end if;';
    replacement:=old||$guard$
  if management_security.dev_device_at(uid,sid) is not null then
    return not p_sensitive or coalesce(s.password_confirmed_at>clock_timestamp()-interval '5 minutes'
      and s.password_confirmation_ip=s.ip_hash and s.password_confirmation_agent=s.agent_hash,false);
  end if;$guard$;
    if (length(definition)-length(replace(definition,old,'')))/length(old)<>1 then raise exception 'Unexpected access guard'; end if;
    execute replace(definition,old,replacement);
  end if;
end $migration$;
notify pgrst,'reload schema';
commit;
