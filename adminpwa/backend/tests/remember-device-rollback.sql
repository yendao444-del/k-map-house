do $$
declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid();
  factor uuid:=gen_random_uuid(); ip text:=repeat('a',64); agent text:=repeat('b',64);
  value jsonb; device uuid; expiry timestamptz; denied boolean; scenario text; count_before bigint;
begin
  insert into auth.users(id,email,email_confirmed_at) values(uid,'remember-'||uid||'@example.invalid',clock_timestamp()),(other_uid,'remember-'||other_uid||'@example.invalid',clock_timestamp());
  insert into public.users(id,email,username,full_name,role,status) values(uid,'remember-'||uid||'@example.invalid','remember-'||uid,'Remember fixture','user','active') on conflict(id) do update set role='user',status='active';
  insert into auth.mfa_factors(id,user_id,factor_type,status,secret,created_at,updated_at) values(factor,uid,'totp','verified','fixture-only',clock_timestamp(),clock_timestamp());
  insert into auth.sessions(id,user_id,aal,factor_id,created_at,updated_at) values(sid,uid,'aal2',factor,clock_timestamp(),clock_timestamp());
  insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) values(gen_random_uuid(),sid,'password',clock_timestamp(),clock_timestamp()),(gen_random_uuid(),sid,'totp',clock_timestamp(),clock_timestamp());
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.security_service('register',uid,sid,ip,agent);
  update management_security.accounts set recovery_ack_at=clock_timestamp() where user_id=uid;
  update management_security.sessions set email_verified_at=clock_timestamp(),email_identity_hash=management_security.email_hash(uid),authorized_at=clock_timestamp() where session_id=sid;
  select expires_at into expiry from management_security.sessions where session_id=sid;
  update auth.mfa_amr_claims set updated_at=clock_timestamp()-interval '20 minutes' where session_id=sid and authentication_method='totp';
  value:=public.security_service('device_create',uid,sid,ip,agent,jsonb_build_object('label','Personal browser','token_hash',repeat('c',64)));
  if value->>'ok' is distinct from 'true' then raise exception 'Completed login could not remember device'; end if;
  device:=(value->>'device_id')::uuid;
  if (select user_id from management_security.devices where id=device) is distinct from uid
    or (select expires_at from management_security.sessions where session_id=sid) is distinct from expiry
    or (value->>'expires_at')::timestamptz>clock_timestamp()+interval '30 days'
    or not exists(select 1 from management_security.audit_events where user_id=uid and session_id=sid and event_type='trusted_device_created') then raise exception 'Wrong ownership/deadline/audit'; end if;
  -- Every rejected operation runs in a subtransaction: no fixture mutation leaks.
  foreach scenario in array array['wrong_user','wrong_ip','wrong_agent','unauthorized','recovery_only','no_mfa','no_recovery_ack','no_email','revoked','expired','revoked_device','expired_device','public_rpc','revoke_stale'] loop
    denied:=false;
    select count(*) into count_before from management_security.devices where user_id=uid;
    begin
      if scenario='unauthorized' then update management_security.sessions set authorized_at=null where session_id=sid;
      elsif scenario='recovery_only' then update management_security.sessions set recovery_only=true where session_id=sid;
      elsif scenario='no_mfa' then update auth.sessions set aal='aal1' where id=sid;
      elsif scenario='no_recovery_ack' then update management_security.accounts set recovery_ack_at=null where user_id=uid;
      elsif scenario='no_email' then update management_security.sessions set email_identity_hash=null where session_id=sid;
      elsif scenario='revoked' then update management_security.sessions set revoked_at=clock_timestamp() where session_id=sid;
      elsif scenario='expired' then update management_security.sessions set expires_at=clock_timestamp()-interval '1 second' where session_id=sid;
      elsif scenario='revoked_device' then update management_security.devices set revoked_at=clock_timestamp() where id=device;
      elsif scenario='expired_device' then update management_security.devices set expires_at=clock_timestamp()-interval '1 second' where id=device;
      elsif scenario='public_rpc' then perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
      end if;
      value:=public.security_service(case when scenario='revoke_stale' then 'device_revoke' else 'device_create' end,
        case when scenario='wrong_user' then other_uid else uid end,sid,
        case when scenario='wrong_ip' then repeat('d',64) else ip end,
        case when scenario='wrong_agent' then repeat('d',64) else agent end,
        jsonb_build_object('token_hash',repeat('e',64),'device_id',device));
      if value->>'ok' is distinct from 'true' then denied:=true; end if;
      -- Deliberately rollback even if the operation returned a safe denial.
      raise exception using errcode='PZ001',message='fixture rollback';
    exception when insufficient_privilege then denied:=true;
      when sqlstate 'PZ001' then null;
    end;
    if not denied then raise exception 'Unsafe remember-device acceptance: %',scenario; end if;
    if (select count(*) from management_security.devices where user_id=uid)<>count_before then raise exception 'Rejected operation mutated devices'; end if;
  end loop;
  -- A login on an already remembered browser can reuse its bound device proof.
  update management_security.sessions set email_required=false,email_verified_at=null,email_identity_hash=null where session_id=sid;
  value:=public.security_service('device_create',uid,sid,ip,agent,jsonb_build_object('token_hash',repeat('f',64)));
  if value->>'ok' is distinct from 'true' then raise exception 'Remembered browser could not renew after completed login'; end if;
end $$;
select 'passed' as remember_device_invariants;
