begin;
create function public.security_recovery_reset_allowed(p_user uuid,p_session uuid,p_ip text,p_agent text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  return management_security.live(p_user,p_session,p_ip) and exists(
    select 1 from management_security.sessions s join management_security.accounts a on a.user_id=s.user_id
    where s.session_id=p_session and s.user_id=p_user and s.agent_hash=p_agent and s.recovery_only
      and a.recovery_session_id=p_session and s.password_verified_at>clock_timestamp()-interval '15 minutes'
      and s.email_verified_at>clock_timestamp()-interval '10 minutes'
      and s.email_identity_hash=management_security.email_hash(p_user));
end $$;
revoke all on function public.security_recovery_reset_allowed(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.security_recovery_reset_allowed(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
