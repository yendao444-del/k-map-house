begin;

alter table management_security.sessions
  add column if not exists password_confirmed_at timestamptz,
  add column if not exists password_confirmation_ip text,
  add column if not exists password_confirmation_agent text;

-- Only the trusted gateway may record a successful current-password check.
-- A password never bootstraps MFA or grants a new management login session.
create or replace function public.security_password_stepup(
  p_action text, p_user uuid, p_session uuid, p_ip text, p_agent text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare state jsonb; s management_security.sessions; recent boolean;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if p_action not in ('prepare','confirm','status') then raise invalid_parameter_value; end if;
  state:=public.security_service('status',p_user,p_session,p_ip,p_agent,'{}');
  select * into s from management_security.sessions where session_id=p_session and user_id=p_user;
  if state->>'state' is distinct from 'ready' or s.session_id is null or s.recovery_only
    or management_security.mfa_at(p_user,p_session) is null
    or (s.device_id is not null and not exists(select 1 from management_security.devices where id=s.device_id and user_id=p_user and revoked_at is null and expires_at>clock_timestamp())) then
    return jsonb_build_object('ok',false,'reason','session','state',state->>'state');
  end if;
  recent:=coalesce(s.password_confirmed_at>clock_timestamp()-interval '5 minutes'
    and s.password_confirmation_ip=p_ip and s.password_confirmation_agent=p_agent,false);
  if p_action='status' then return jsonb_build_object('ok',true,'recent_password',recent); end if;
  if p_action='prepare' then
    return jsonb_build_object('ok',management_security.rate('password_stepup',p_user,p_ip,5,300),'reason','rate');
  end if;
  update management_security.sessions set password_confirmed_at=clock_timestamp(),
    password_confirmation_ip=p_ip,password_confirmation_agent=p_agent
    where session_id=p_session and user_id=p_user;
  perform management_security.audit(p_user,p_session,'password_verified',true,p_ip,'{"purpose":"sensitive_operation_confirmation"}'::jsonb);
  return jsonb_build_object('ok',true,'recent_password',true);
end $$;
revoke all on function public.security_password_stepup(text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.security_password_stepup(text,uuid,uuid,text,text) to service_role;

-- Keep the existing role/session/MFA model; accept recent password proof only
-- after all original live AAL2, mailbox, recovery and device checks pass.
create or replace function public.security_management_access_allowed(p_sensitive boolean default false) returns boolean
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
  return not p_sensitive or mfa_time>clock_timestamp()-(select make_interval(secs=>recent_seconds) from management_security.settings)
    or coalesce(s.password_confirmed_at>clock_timestamp()-interval '5 minutes'
      and s.password_confirmation_ip=s.ip_hash and s.password_confirmation_agent=s.agent_hash,false);
end $$;
notify pgrst,'reload schema';
commit;
