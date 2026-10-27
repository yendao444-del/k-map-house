CREATE OR REPLACE FUNCTION public.security_totp_replacement(p_action text, p_user uuid, p_session uuid, p_ip text, p_agent text, p_old uuid DEFAULT NULL::uuid, p_new uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r management_security.totp_replacements; s management_security.sessions;
  a management_security.accounts; fresh timestamptz; current_factor uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,401));
  select * into r from management_security.totp_replacements where user_id=p_user;
  if p_action='resume' then
    if r.user_id is null or r.finished_at is not null or r.session_id<>p_session
      or not exists(select 1 from auth.sessions where id=p_session and user_id=p_user and factor_id=r.new_factor_id)
      or management_security.mfa_at(p_user,p_session) is null
      or management_security.mfa_at(p_user,p_session)<=clock_timestamp()-interval '5 minutes' then return jsonb_build_object('ok',true); end if;
    p_action:='finish'; p_old:=r.old_factor_id; p_new:=r.new_factor_id;
  end if;
  if p_action='verified' then
    if r.user_id is null or r.session_id<>p_session or r.new_factor_id is distinct from p_new then return jsonb_build_object('ok',true); end if;
    p_action:='finish'; p_old:=r.old_factor_id;
  end if;
  select * into s from management_security.sessions where session_id=p_session and user_id=p_user for update;
  select * into a from management_security.accounts where user_id=p_user for update;
  if not management_security.live(p_user,p_session,p_ip) or s.agent_hash is distinct from p_agent or s.recovery_only then return jsonb_build_object('ok',false); end if;
  fresh:=management_security.mfa_at(p_user,p_session);
  select factor_id into current_factor from auth.sessions where id=p_session and user_id=p_user;
  if p_action='begin' then
    if s.authorized_at is null or a.recovery_ack_at is null or fresh is null or fresh <= clock_timestamp()-interval '30 seconds'
      or current_factor is distinct from p_old
      or (s.email_required and (s.email_verified_at is null or s.email_identity_hash is distinct from management_security.email_hash(p_user))) then return jsonb_build_object('ok',false); end if;
    -- A second browser must not replace a live operation. Abandoned unverified
    -- factors can be safely cleaned; a verified new factor must be resumed.
    if r.user_id is not null and r.finished_at is null then
      if exists(select 1 from auth.mfa_factors where id=r.new_factor_id and user_id=p_user and status='verified') then return jsonb_build_object('ok',false); end if;
      if r.session_id<>p_session and r.started_at>clock_timestamp()-interval '10 minutes' and management_security.live(p_user,r.session_id) then return jsonb_build_object('ok',false); end if;
      delete from auth.mfa_factors where id=r.new_factor_id and user_id=p_user and status='unverified';
    end if;
    insert into management_security.totp_replacements(user_id,session_id,old_factor_id) values(p_user,p_session,p_old)
      on conflict(user_id) do update set session_id=excluded.session_id,old_factor_id=excluded.old_factor_id,new_factor_id=null,started_at=clock_timestamp(),finished_at=null;
    perform management_security.audit(p_user,p_session,'mfa_rotation_started',true,p_ip);
    return jsonb_build_object('ok',true);
  end if;
  if r.user_id is null or r.session_id<>p_session then return jsonb_build_object('ok',false); end if;
  if p_action='cancel' then
    if r.finished_at is not null then return jsonb_build_object('ok',true); end if;
    if exists(select 1 from auth.mfa_factors where id=r.new_factor_id and user_id=p_user and status='verified') then return jsonb_build_object('ok',false); end if;
    delete from auth.mfa_factors where id=r.new_factor_id and user_id=p_user and status='unverified';
    delete from management_security.totp_replacements where user_id=p_user;
    perform management_security.audit(p_user,p_session,'mfa_rotation_cancelled',true,p_ip);
    return jsonb_build_object('ok',true);
  elsif p_action='register' then
    if r.finished_at is not null or r.started_at<=clock_timestamp()-interval '10 minutes' or (r.new_factor_id is not null and r.new_factor_id<>p_new) then return jsonb_build_object('ok',false); end if;
    if not exists(select 1 from auth.mfa_factors where id=p_new and user_id=p_user and factor_type='totp' and status='unverified' and created_at>=r.started_at) then return jsonb_build_object('ok',false); end if;
    update management_security.totp_replacements set new_factor_id=p_new where user_id=p_user;
    return jsonb_build_object('ok',true);
  elsif p_action='finish' then
    if r.old_factor_id is distinct from p_old or r.new_factor_id is distinct from p_new then return jsonb_build_object('ok',false); end if;
    if r.finished_at is not null then return jsonb_build_object('ok',true); end if;
    if fresh is null or fresh<=clock_timestamp()-interval '5 minutes' or current_factor is distinct from p_new
      or not exists(select 1 from auth.mfa_factors where id=p_new and user_id=p_user and factor_type='totp' and status='verified') then return jsonb_build_object('ok',false); end if;
    -- Atomic retirement: reuse the trigger's narrow current-session exemption
    -- only inside this transaction, after verifying the replacement. Business
    -- access still requires acknowledging newly issued recovery codes.
    update management_security.accounts set recovery_session_id=p_session,recovery_ack_at=null where user_id=p_user;
    delete from auth.mfa_factors where user_id=p_user and factor_type='totp' and id<>p_new;
    update management_security.accounts set recovery_session_id=null where user_id=p_user;
    update management_security.sessions set device_id=null where session_id=p_session;
    update management_security.totp_replacements set finished_at=clock_timestamp() where user_id=p_user;
    perform management_security.audit(p_user,p_session,'mfa_rotation_finished',true,p_ip);
    return jsonb_build_object('ok',true);
  end if;
  return jsonb_build_object('ok',false);
end $function$
