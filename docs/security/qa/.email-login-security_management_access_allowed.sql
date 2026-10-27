CREATE OR REPLACE FUNCTION public.security_management_access_allowed(p_sensitive boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
