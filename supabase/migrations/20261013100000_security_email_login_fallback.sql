begin;

alter table management_security.sessions
  add column if not exists email_mfa_at timestamptz,
  add column if not exists email_mfa_ip text,
  add column if not exists email_mfa_agent text,
  add column if not exists email_mfa_challenge uuid;
alter table management_security.email_challenges
  add column if not exists login_factor boolean not null default false;

create or replace function management_security.email_login_eligible(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from management_security.accounts a
    join auth.users au on au.id=a.user_id join public.users pu on pu.id=au.id
    where a.user_id=p_user and pu.status='active' and pu.role in ('admin','user')
      and au.email_confirmed_at is not null and a.recovery_ack_at is not null
      and a.recovery_session_id is null and a.email_verified_at is not null
      and a.email_verified_identity_hash=management_security.email_hash(p_user)
      and exists(select 1 from auth.mfa_factors f where f.user_id=p_user and f.factor_type='totp' and f.status='verified'));
$$;

-- An application second factor, never a forged AAL2 token/TOTP claim.
create or replace function management_security.email_factor_at(p_user uuid,p_session uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
  select s.email_mfa_at from management_security.sessions s
  join management_security.email_challenges c on c.id=s.email_mfa_challenge
  where s.user_id=p_user and s.session_id=p_session and not s.recovery_only
    and management_security.live(p_user,p_session)
    and management_security.email_login_eligible(p_user)
    and s.email_verified_at is not null
    and s.email_identity_hash=management_security.email_hash(p_user)
    and s.email_mfa_ip=s.ip_hash and s.email_mfa_agent=s.agent_hash
    and c.login_factor and c.user_id=p_user and c.session_id=p_session
    and c.verified_at is not null and c.delivery_failed_at is null
    and c.provider_accepted_at is not null and c.provider_id is not null
    and c.email_identity_hash=s.email_identity_hash and c.ip_hash=s.ip_hash;
$$;
create or replace function management_security.login_factor_at(p_user uuid,p_session uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
  select greatest(management_security.mfa_at(p_user,p_session),management_security.email_factor_at(p_user,p_session));
$$;
revoke all on function management_security.email_login_eligible(uuid),management_security.email_factor_at(uuid,uuid),management_security.login_factor_at(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.security_email_login_start(
  p_user uuid,p_session uuid,p_ip text,p_agent text,p_challenge uuid,p_code_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s management_security.sessions; au auth.users; n integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if not management_security.auth_session(p_user,p_session) or not management_security.live(p_user,p_session,p_ip)
    or not management_security.email_login_eligible(p_user) then return jsonb_build_object('ok',false); end if;
  select * into s from management_security.sessions where user_id=p_user and session_id=p_session for update;
  if s.session_id is null or s.recovery_only or s.ip_hash is distinct from p_ip or s.agent_hash is distinct from p_agent
    or p_challenge is null or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false); end if;
  select * into au from auth.users where id=p_user;
  if au.email_confirmed_at is null then return jsonb_build_object('ok',false); end if;
  if exists(select 1 from management_security.email_challenges where user_id=p_user and created_at>clock_timestamp()-interval '60 seconds') then return jsonb_build_object('ok',false,'reason','wait'); end if;
  update management_security.email_challenges set closed_at=clock_timestamp() where session_id=p_session and purpose='signin' and closed_at is null;
  insert into management_security.email_challenges(id,user_id,session_id,purpose,ip_hash,email_identity_hash,code_hash,login_factor)
    values(p_challenge,p_user,p_session,'signin',p_ip,management_security.email_hash(p_user),p_code_hash,true);
  perform management_security.audit(p_user,p_session,'email_sent',true,p_ip,jsonb_build_object('purpose','signin','login_factor',true));
  return jsonb_build_object('ok',true,'challenge_id',p_challenge,'expires_in',300);
end $$;

create or replace function public.security_email_login_verify(
  p_user uuid,p_session uuid,p_ip text,p_agent text,p_challenge uuid,p_code_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c management_security.email_challenges; s management_security.sessions;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  select * into s from management_security.sessions where user_id=p_user and session_id=p_session for update;
  if s.session_id is null or s.recovery_only or not management_security.live(p_user,p_session,p_ip)
    or not management_security.email_login_eligible(p_user) or s.ip_hash is distinct from p_ip or s.agent_hash is distinct from p_agent
    then return jsonb_build_object('ok',false); end if;
  select * into c from management_security.email_challenges where id=p_challenge and user_id=p_user and session_id=p_session and purpose='signin' and login_factor for update;
  if c.id is null or c.closed_at is not null or c.delivery_failed_at is not null or c.expires_at<=clock_timestamp()
    or c.provider_accepted_at is null or c.provider_id is null
    or c.attempts>=5 or c.ip_hash is distinct from p_ip
    or c.email_identity_hash is distinct from management_security.email_hash(p_user)
    or c.code_hash is distinct from p_code_hash then
    if c.id is not null and c.closed_at is null then update management_security.email_challenges set attempts=least(attempts+1,5) where id=c.id; end if;
    perform management_security.audit(p_user,p_session,'email_challenge_failed',false,p_ip,jsonb_build_object('purpose','signin','login_factor',true));
    return jsonb_build_object('ok',false);
  end if;
  update management_security.email_challenges set closed_at=clock_timestamp(),verified_at=clock_timestamp() where id=c.id;
  update management_security.sessions set email_verified_at=clock_timestamp(),email_identity_hash=c.email_identity_hash,
    email_mfa_at=clock_timestamp(),email_mfa_ip=p_ip,email_mfa_agent=p_agent,email_mfa_challenge=c.id,
    authorized_at=clock_timestamp(),recovery_only=false,last_activity_at=clock_timestamp() where session_id=p_session;
  perform management_security.audit(p_user,p_session,'email_challenge_verified',true,p_ip,jsonb_build_object('purpose','signin','login_factor',true));
  return jsonb_build_object('ok',true,'state','ready','login_method','email');
end $$;

create or replace function public.security_email_login_status(p_user uuid,p_session uuid,p_ip text,p_agent text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s management_security.sessions;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  select * into s from management_security.sessions where user_id=p_user and session_id=p_session;
  if s.session_id is null or s.authorized_at is null or s.ip_hash is distinct from p_ip or s.agent_hash is distinct from p_agent
    or management_security.email_factor_at(p_user,p_session) is null
    or (s.device_id is not null and not exists(select 1 from management_security.devices where id=s.device_id and user_id=p_user and revoked_at is null and expires_at>clock_timestamp())) then return jsonb_build_object('ok',false); end if;
  return jsonb_build_object('ok',true,'state','ready','login_method','email','second_factor_verified',true);
end $$;

-- The normal guard remains unchanged for TOTP/AAL2. A recent, server-recorded
-- email login proof may satisfy this application session while the JWT is AAL1.
create or replace function public.security_management_access_allowed(p_sensitive boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; role_name text; profile_status text; s management_security.sessions; mfa_time timestamptz; email_time timestamptz; factor_time timestamptz;
begin
  if auth.role()='service_role' then return true; end if;
  if uid is null then return false; end if;
  select role,status into role_name,profile_status from public.users where id=uid;
  if role_name in ('admin','user') then
    if profile_status is distinct from 'active' then return false; end if;
  else return coalesce(auth.jwt()->'app_metadata'->>'portal_role'='webmobile_tenant',false); end if;
  if not management_security.required(uid) then return true; end if;
  if coalesce(auth.jwt()->>'session_id','') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return false; end if;
  sid:=(auth.jwt()->>'session_id')::uuid;
  if not management_security.live(uid,sid) then return false; end if;
  select * into s from management_security.sessions where session_id=sid;
  if s.authorized_at is null or s.recovery_only then return false; end if;
  if s.device_id is not null and not exists(select 1 from management_security.devices where id=s.device_id and user_id=uid and revoked_at is null and expires_at>clock_timestamp()) then return false; end if;
  if s.email_required and (s.email_verified_at is null or s.email_identity_hash is distinct from management_security.email_hash(uid)) then return false; end if;
  if not exists(select 1 from management_security.accounts where user_id=uid and recovery_ack_at is not null) then return false; end if;
  mfa_time:=management_security.mfa_at(uid,sid); email_time:=management_security.email_factor_at(uid,sid);
  factor_time:=greatest(coalesce(mfa_time,'epoch'::timestamptz),coalesce(email_time,'epoch'::timestamptz));
  if factor_time='epoch'::timestamptz then return false; end if;
  if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' and email_time is null then return false; end if;
  return not p_sensitive or factor_time>clock_timestamp()-(select make_interval(secs=>recent_seconds) from management_security.settings)
    or coalesce(s.password_confirmed_at>clock_timestamp()-interval '5 minutes' and s.password_confirmation_ip=s.ip_hash and s.password_confirmation_agent=s.agent_hash,false);
end $$;

revoke execute on function public.security_email_login_start(uuid,uuid,text,text,uuid,text),public.security_email_login_verify(uuid,uuid,text,text,uuid,text),public.security_email_login_status(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.security_email_login_start(uuid,uuid,text,text,uuid,text),public.security_email_login_verify(uuid,uuid,text,text,uuid,text),public.security_email_login_status(uuid,uuid,text,text) to service_role;

-- Preserve recovery/TOTP rotation transitions while accepting the alternate
-- factor for normal login, session/device management and password confirmation.
do $migration$
declare definition text; signature text; pair jsonb; old text;
begin
  select pg_get_functiondef('public.security_service(text,uuid,uuid,text,text,jsonb)'::regprocedure) into definition;
  if position('email_login_available' in definition)=0 then
    for pair in select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_array('mfa_time timestamptz;', 'mfa_time timestamptz; login_time timestamptz;'),
      jsonb_build_array('mfa_time:=management_security.mfa_at(p_user,p_session);', 'mfa_time:=management_security.mfa_at(p_user,p_session); login_time:=management_security.login_factor_at(p_user,p_session);'),
      jsonb_build_array('when factor is null then ''enroll'' when mfa_time is null then ''totp''', 'when factor is null then ''enroll'' when login_time is null then ''totp'''),
      jsonb_build_array('''factor_id'',factor,''enrollment_enabled''', '''email_login_available'',management_security.email_login_eligible(p_user) and not s.recovery_only,''second_factor_verified'',login_time is not null,''login_method'',case when mfa_time is not null then ''totp'' when login_time is not null then ''email'' else null end,''factor_id'',factor,''enrollment_enabled'''),
      jsonb_build_array('''recent_mfa'',mfa_time>', '''recent_mfa'',login_time>'),
      jsonb_build_array('if mfa_time is null or mfa_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds) or a.recovery_ack_at is null', 'if login_time is null or login_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds) or a.recovery_ack_at is null'),
      jsonb_build_array('if s.authorized_at is null or s.recovery_only or mfa_time is null or (p_action is distinct from ''device_create'' and mfa_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds)) then raise insufficient_privilege; end if;', 'if s.authorized_at is null or s.recovery_only or login_time is null or (p_action is distinct from ''device_create'' and login_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds)) then raise insufficient_privilege; end if;'),
      jsonb_build_array('if p_data->>''all''=''true'' and management_security.required(p_user) and (mfa_time is null or mfa_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds))', 'if p_data->>''all''=''true'' and management_security.required(p_user) and (login_time is null or login_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds))'),
      jsonb_build_array('email_required=true,email_verified_at=null,email_identity_hash=null,authorized_at=null,device_id=null', 'email_required=true,email_verified_at=null,email_identity_hash=null,authorized_at=null,device_id=null,email_mfa_at=null,email_mfa_challenge=null,email_mfa_ip=null,email_mfa_agent=null')
    )) loop
      old:=pair->>0;
      if (length(definition)-length(replace(definition,old,'')))/length(old)<>1 then raise exception 'Email login migration: unexpected transition %',left(old,100); end if;
      definition:=replace(definition,old,pair->>1);
    end loop;
    execute definition;
  end if;
  foreach signature in array array['public.security_password_stepup(text,uuid,uuid,text,text)','public.security_overview_read(uuid,uuid,text,text)'] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if position('management_security.login_factor_at' in definition)>0 then continue; end if;
    if position('management_security.mfa_at' in definition)=0 then raise exception 'Missing factor guard in %',signature; end if;
    execute replace(definition,'management_security.mfa_at','management_security.login_factor_at');
  end loop;
end $migration$;
notify pgrst,'reload schema';
commit;
