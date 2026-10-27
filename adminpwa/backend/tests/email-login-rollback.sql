do $$
declare uid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); sid2 uuid:=gen_random_uuid();
  factor uuid:=gen_random_uuid(); challenge uuid:=gen_random_uuid(); ip text:=repeat('a',64); agent text:=repeat('b',64);
  code_hash text:=repeat('c',64); result jsonb; n integer;
begin
  insert into auth.users(id,email,email_confirmed_at) values(uid,'email-login-fixture-'||uid||'@example.invalid',clock_timestamp());
  insert into public.users(id,email,username,full_name,role,status)
    values(uid,'email-login-fixture-'||uid||'@example.invalid','email-login-'||uid,'Rollback email login','user','active') on conflict(id) do update set role='user',status='active';
  insert into auth.mfa_factors(id,user_id,factor_type,status,friendly_name,secret,created_at,updated_at)
    values(factor,uid,'totp','verified','Rollback fixture','not-a-live-secret',clock_timestamp(),clock_timestamp());
  insert into auth.sessions(id,user_id,aal,created_at,updated_at) values(sid,uid,'aal1',clock_timestamp(),clock_timestamp()),(sid2,uid,'aal1',clock_timestamp(),clock_timestamp());
  insert into management_security.accounts(user_id,mfa_required,recovery_ack_at,email_verified_at,email_verified_identity_hash)
    values(uid,true,clock_timestamp(),clock_timestamp(),management_security.email_hash(uid)) on conflict(user_id) do update
    set recovery_ack_at=clock_timestamp(),email_verified_at=clock_timestamp(),email_verified_identity_hash=management_security.email_hash(uid);
  insert into management_security.sessions(session_id,user_id,ip_hash,agent_hash,password_verified_at,email_required,expires_at)
    values(sid,uid,ip,agent,clock_timestamp(),true,clock_timestamp()+interval '6 hours'),(sid2,uid,ip,agent,clock_timestamp(),true,clock_timestamp()+interval '6 hours');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid,'aal','aal1')::text,true);
  if public.security_management_access_allowed(false) then raise exception 'Password-only session read access'; end if;
  if has_function_privilege('authenticated','public.security_email_login_verify(uuid,uuid,text,text,uuid,text)','EXECUTE')
    or has_function_privilege('anon','public.security_email_login_start(uuid,uuid,text,text,uuid,text)','EXECUTE') then raise exception 'Public can forge proof'; end if;
  begin perform public.security_email_login_verify(uid,sid,ip,agent,challenge,code_hash); raise exception 'Browser verified itself'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update management_security.accounts set email_verified_at=null where user_id=uid;
  if public.security_email_login_start(uid,sid,ip,agent,challenge,code_hash)->>'ok'<>'false' then raise exception 'Unverified mailbox accepted'; end if;
  update management_security.accounts set email_verified_at=clock_timestamp() where user_id=uid;
  update management_security.accounts set recovery_ack_at=null where user_id=uid;
  if public.security_email_login_start(uid,sid,ip,agent,challenge,code_hash)->>'ok'<>'false' then raise exception 'Incomplete setup accepted'; end if;
  update management_security.accounts set recovery_ack_at=clock_timestamp() where user_id=uid;
  result:=public.security_email_login_start(uid,sid,ip,agent,challenge,code_hash);
  if result->>'ok'<>'true' then raise exception 'Valid registered mailbox denied'; end if;
  if public.security_email_login_start(uid,sid,ip,agent,gen_random_uuid(),code_hash)->>'reason'<>'wait' then raise exception 'Resend cooldown missing'; end if;
  if public.security_email_login_verify(uid,sid,ip,agent,challenge,code_hash)->>'ok'<>'false' then raise exception 'Unaccepted provider mail verified'; end if;
  update management_security.email_challenges set provider_id=gen_random_uuid(),provider_accepted_at=clock_timestamp(),attempts=0 where id=challenge;
  if public.security_email_login_verify(uid,sid2,ip,agent,challenge,code_hash)->>'ok'<>'false' then raise exception 'Challenge stolen across sessions'; end if;
  if public.security_email_login_verify(uid,sid,repeat('d',64),agent,challenge,code_hash)->>'ok'<>'false' then raise exception 'Different IP accepted'; end if;
  if public.security_email_login_verify(uid,sid,ip,repeat('d',64),challenge,code_hash)->>'ok'<>'false' then raise exception 'Different browser accepted'; end if;
  if public.security_email_login_verify(uid,sid,ip,agent,challenge,repeat('d',64))->>'ok'<>'false' then raise exception 'Wrong OTP accepted'; end if;
  update management_security.email_challenges set expires_at=clock_timestamp()-interval '1 second' where id=challenge;
  if public.security_email_login_verify(uid,sid,ip,agent,challenge,code_hash)->>'ok'<>'false' then raise exception 'Expired OTP accepted'; end if;
  update management_security.email_challenges set expires_at=clock_timestamp()+interval '5 minutes',attempts=5 where id=challenge;
  if public.security_email_login_verify(uid,sid,ip,agent,challenge,code_hash)->>'ok'<>'false' then raise exception 'OTP attempts bypassed'; end if;
  update management_security.email_challenges set attempts=0 where id=challenge;
  if public.security_email_login_verify(uid,sid,ip,agent,challenge,code_hash)->>'ok'<>'true' then raise exception 'Valid email OTP denied'; end if;
  if public.security_email_login_verify(uid,sid,ip,agent,challenge,code_hash)->>'ok'<>'false' then raise exception 'OTP reused'; end if;
  if public.security_service('status',uid,sid,ip,agent)->>'state'<>'ready' then raise exception 'Email login status still requests TOTP'; end if;
  if public.security_password_stepup('status',uid,sid,ip,agent)->>'ok'<>'true' then raise exception 'Email login cannot confirm password'; end if;
  if public.security_overview_read(uid,sid,ip,agent)->>'ok'<>'true' then raise exception 'Email login cannot read own security'; end if;
  begin perform public.security_service('recovery_issue',uid,sid,ip,agent); raise exception 'Email replaced TOTP for recovery rotation'; exception when insufficient_privilege then null; end;
  if management_security.mfa_at(uid,sid) is not null or not exists(select 1 from auth.sessions where id=sid and aal='aal1') then raise exception 'Fabricated TOTP or AAL2'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid,'aal','aal1')::text,true);
  if not public.security_management_access_allowed(false) or not public.security_management_access_allowed(true) then raise exception 'Verified email login denied business access'; end if;
  update management_security.sessions set email_mfa_at=clock_timestamp()-interval '10 minutes' where session_id=sid;
  if not public.security_management_access_allowed(false) or public.security_management_access_allowed(true) then raise exception 'Email login read duration or write recency broken'; end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  if public.security_password_stepup('confirm',uid,sid,ip,agent)->>'ok'<>'true' then raise exception 'Password proof after older email login denied'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid,'aal','aal1')::text,true);
  if not public.security_management_access_allowed(true) then raise exception 'Confirmed password after email denied'; end if;
  update auth.users set email='changed-'||uid||'@example.invalid' where id=uid;
  if public.security_management_access_allowed(false) then raise exception 'Changed email kept proof'; end if;
  update auth.users set email='email-login-fixture-'||uid||'@example.invalid' where id=uid;
  update management_security.sessions set recovery_only=true where session_id=sid;
  if public.security_management_access_allowed(false) then raise exception 'Recovery-only session escaped'; end if;
  update management_security.sessions set recovery_only=false,revoked_at=clock_timestamp() where session_id=sid;
  if public.security_management_access_allowed(false) then raise exception 'Revoked session accepted'; end if;
  update management_security.sessions set revoked_at=null,expires_at=clock_timestamp()-interval '1 second' where session_id=sid;
  if public.security_management_access_allowed(false) then raise exception 'Expired session accepted'; end if;
  update management_security.sessions set expires_at=clock_timestamp()+interval '6 hours' where session_id=sid;
  update public.users set status='inactive' where id=uid;
  if public.security_management_access_allowed(false) then raise exception 'Inactive account accepted'; end if;
end $$;
select 'passed' as email_login_invariants;
