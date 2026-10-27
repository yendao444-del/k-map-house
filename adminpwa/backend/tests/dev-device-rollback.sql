do $$
declare uid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); other_sid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid();
  ip text:=repeat('a',64); agent text:=repeat('b',64); token_hash text:=encode(extensions.digest(uid::text,'sha256'),'hex'); r jsonb;
begin
  insert into auth.users(id,email,email_confirmed_at) values(uid,'dev-fixture-'||uid||'@example.invalid',clock_timestamp());
  insert into public.users(id,email,username,full_name,role,status) values(uid,'dev-fixture-'||uid||'@example.invalid','dev-'||uid,'Dev rollback','admin','active') on conflict(id) do update set role='admin',status='active';
  insert into management_security.accounts(user_id,mfa_required,recovery_ack_at) values(uid,true,clock_timestamp()) on conflict(user_id) do update set recovery_ack_at=clock_timestamp();
  insert into auth.sessions(id,user_id,aal,created_at,updated_at) values(sid,uid,'aal1',clock_timestamp(),clock_timestamp()),(other_sid,uid,'aal1',clock_timestamp(),clock_timestamp());
  insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) values(gen_random_uuid(),sid,'password',clock_timestamp(),clock_timestamp());
  insert into management_security.devices(id,user_id,token_hash,ip_hash,agent_hash,label,expires_at,local_dev) values(did,uid,token_hash,repeat('0',64),repeat('0',64),'Dev rollback',clock_timestamp()+interval '1 day',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  r:=public.security_service('register',uid,sid,ip,agent);
  if public.security_dev_device_login(uid,sid,ip,agent,repeat('d',64))->>'ok'<>'false' then raise exception 'Wrong device token accepted'; end if;
  if public.security_dev_device_login(uid,other_sid,ip,agent,token_hash)->>'ok'<>'false' then raise exception 'Unregistered session accepted'; end if;
  update management_security.devices set local_dev=false where id=did;
  if public.security_dev_device_login(uid,sid,ip,agent,token_hash)->>'ok'<>'false' then raise exception 'Ordinary trusted device bypassed MFA'; end if;
  update management_security.devices set local_dev=true where id=did;
  if public.security_dev_device_login(uid,sid,ip,agent,token_hash)->>'ok'<>'true' then raise exception 'Valid dev device denied'; end if;
  if public.security_service('status',uid,sid,ip,agent)->>'state'<>'ready' then raise exception 'Dev device still requests OTP'; end if;
  if public.security_service('status',uid,sid,ip,agent)->>'device_verified'<>'true' then raise exception 'Missing server proof'; end if;
  if public.security_dev_device_status(uid,sid,repeat('d',64),agent)->>'ok'<>'false'
    or public.security_dev_device_status(uid,sid,ip,repeat('d',64))->>'ok'<>'false' then raise exception 'IP/browser mismatch accepted'; end if;
  begin perform public.security_service('recovery_issue',uid,sid,ip,agent); raise exception 'Dev device regenerated recovery codes'; exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.security_dev_device_login(uuid,uuid,text,text,text)','execute')
    or has_function_privilege('authenticated','public.security_dev_device_status(uuid,uuid,text,text)','execute') then raise exception 'Public can forge dev proof'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid,'aal','aal1')::text,true);
  if not public.security_management_access_allowed(false) or public.security_management_access_allowed(true) then raise exception 'Dev read/password gates broken'; end if;
  begin perform public.security_dev_device_login(uid,sid,ip,agent,token_hash); raise exception 'Browser self-authorized'; exception when insufficient_privilege then null; end;
  update management_security.sessions set password_confirmed_at=clock_timestamp(),password_confirmation_ip=ip,password_confirmation_agent=agent where session_id=sid;
  if not public.security_management_access_allowed(true) then raise exception 'Confirmed password denied'; end if;
  update management_security.devices set revoked_at=clock_timestamp() where id=did;
  if public.security_management_access_allowed(false) then raise exception 'Revoked device accepted'; end if;
  update management_security.devices set revoked_at=null,expires_at=clock_timestamp()-interval '1 second' where id=did;
  if public.security_management_access_allowed(false) then raise exception 'Expired device accepted'; end if;
  update management_security.devices set expires_at=clock_timestamp()+interval '1 day' where id=did;
  update management_security.sessions set expires_at=clock_timestamp()-interval '1 second' where session_id=sid;
  if public.security_management_access_allowed(false) then raise exception 'Expired session accepted'; end if;
  update management_security.sessions set expires_at=clock_timestamp()+interval '1 hour',recovery_only=true where session_id=sid;
  if public.security_management_access_allowed(false) then raise exception 'Recovery-only escaped'; end if;
  update management_security.sessions set recovery_only=false where session_id=sid;
  update auth.users set email='changed-'||uid||'@example.invalid' where id=uid;
  if public.security_management_access_allowed(false) then raise exception 'Changed email retained proof'; end if;
end $$;
select 'passed' dev_device_invariants;
