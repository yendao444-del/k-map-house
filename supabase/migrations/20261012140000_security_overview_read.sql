begin;
-- Read this account's security history using its existing verified login.
-- Device/session mutations still use security_service and require fresh MFA.
create or replace function public.security_overview_read(p_user uuid,p_session uuid,p_ip text,p_agent text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s management_security.sessions; a management_security.accounts;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  select * into s from management_security.sessions where user_id=p_user and session_id=p_session;
  select * into a from management_security.accounts where user_id=p_user;
  if not management_security.live(p_user,p_session,p_ip) or s.agent_hash is distinct from p_agent
    or s.authorized_at is null or s.recovery_only or a.recovery_ack_at is null
    or management_security.mfa_at(p_user,p_session) is null
    or (s.email_required and (s.email_verified_at is null or s.email_identity_hash is distinct from management_security.email_hash(p_user)))
    or (s.device_id is not null and not exists(select 1 from management_security.devices where id=s.device_id and user_id=p_user and revoked_at is null and expires_at>clock_timestamp()))
  then return jsonb_build_object('ok',false); end if;
  return jsonb_build_object('ok',true,
    'devices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'created_at',created_at,'last_seen_at',last_seen_at,'expires_at',expires_at,'revoked_at',revoked_at) order by created_at desc) from management_security.devices where user_id=p_user),'[]'),
    'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',session_id,'current',session_id=p_session,'created_at',created_at,'last_activity_at',last_activity_at,'expires_at',expires_at,'revoked_at',revoked_at) order by created_at desc) from management_security.sessions where user_id=p_user),'[]'),
    'events',coalesce((select jsonb_agg(e) from (select id,event_type,success,created_at from management_security.audit_events where user_id=p_user order by created_at desc limit 50)e),'[]'));
end $$;
revoke all on function public.security_overview_read(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.security_overview_read(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
