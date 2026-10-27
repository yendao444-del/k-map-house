CREATE OR REPLACE FUNCTION public.security_password_stepup(p_action text, p_user uuid, p_session uuid, p_ip text, p_agent text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
