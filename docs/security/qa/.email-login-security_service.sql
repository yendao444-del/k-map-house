CREATE OR REPLACE FUNCTION public.security_service(p_action text, p_user uuid, p_session uuid, p_ip text, p_agent text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      when s.recovery_only and factor is not null and (mfa_time is null or mfa_time <= coalesce((select max(created_at) from management_security.audit_events where user_id=p_user and session_id=p_session and event_type='recovery_code_used'),clock_timestamp())) then 'recovery'
      when not management_security.required(p_user) then 'optional'
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
  if s.authorized_at is null or s.recovery_only or mfa_time is null or (p_action is distinct from 'device_create' and mfa_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds)) then raise insufficient_privilege; end if;
  if p_action='device_create' then
    if a.user_id is null or a.recovery_ack_at is null
      or (s.email_required and not coalesce(email_ok,false))
      or (s.device_id is not null and not exists(
        select 1 from management_security.devices
        where id=s.device_id and user_id=p_user and revoked_at is null
          and expires_at>clock_timestamp() and ip_hash=p_ip and agent_hash=p_agent))
      or (not coalesce(email_ok,false) and (s.email_required or s.device_id is null))
    then raise insufficient_privilege; end if;
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
end $function$
