begin;
-- No customer rows are used. Every fixture and security transition rolls back.
do $$
declare uid uuid:=gen_random_uuid(); other_uid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); other_sid uuid:=gen_random_uuid();
  factor uuid:=gen_random_uuid(); phone_sid uuid:=gen_random_uuid(); phone_ip text:=encode(extensions.gen_random_bytes(32),'hex'); ip text:=encode(extensions.gen_random_bytes(32),'hex'); agent text:=repeat('b',64); value jsonb;
  codes jsonb; batch uuid; challenge uuid:=gen_random_uuid(); expiry timestamptz; n integer;
  configured_idle integer; configured_lifetime integer; sid_auth_created timestamptz; sid_expires timestamptz;
  other_sid_auth_created timestamptz; other_sid_expires timestamptz;
begin
  select idle_seconds,lifetime_seconds into configured_idle,configured_lifetime
    from management_security.settings where singleton;
  if configured_idle<>21600 or configured_lifetime<>21600 then
    raise exception 'Management session policy must use a six-hour idle and absolute limit, got idle=% lifetime=%',configured_idle,configured_lifetime;
  end if;
  if exists(select 1 from management_security.sessions where expires_at>created_at+interval '6 hours') then
    raise exception 'Existing management session exceeds the six-hour deadline';
  end if;
  update management_security.settings set enforce_management=false;
  insert into auth.users(id,email,email_confirmed_at) values(uid,'mfa-rollback-'||uid||'@example.invalid',clock_timestamp()),(other_uid,'mfa-rollback-'||other_uid||'@example.invalid',clock_timestamp());
  insert into public.users(id,email,username,full_name,role,status) values(uid,'mfa-rollback-'||uid||'@example.invalid','mfa-rollback-'||uid,'MFA rollback fixture','admin','active'),(other_uid,'mfa-rollback-'||other_uid||'@example.invalid','mfa-rollback-'||other_uid,'MFA rollback fixture','user','active') on conflict(id) do update set role=excluded.role,status=excluded.status;
  insert into auth.sessions(id,user_id,aal,created_at,updated_at) values(sid,uid,'aal1',clock_timestamp(),clock_timestamp()),(other_sid,other_uid,'aal1',clock_timestamp(),clock_timestamp());
  insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) values(gen_random_uuid(),sid,'password',clock_timestamp(),clock_timestamp()),(gen_random_uuid(),other_sid,'password',clock_timestamp(),clock_timestamp());
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','service_role','session_id',sid,'aal','aal1')::text,true);
  value:=public.security_service('register',uid,sid,ip,agent);
  if value->>'state'<>'optional' then raise exception 'Optional bootstrap must work before rollout'; end if;
  expiry:=(value->>'expires_at')::timestamptz;
  select a.created_at,s.expires_at into sid_auth_created,sid_expires
    from management_security.sessions s join auth.sessions a on a.id=s.session_id
    where s.session_id=sid;
  if sid_expires>sid_auth_created+interval '6 hours' or expiry>sid_auth_created+interval '6 hours' then
    raise exception 'New management session exceeds six-hour deadline';
  end if;
  update management_security.settings set enforce_management=true;
  value:=public.security_service('register',other_uid,other_sid,ip,agent);
  if value->>'state'<>'enroll' then raise exception 'Unenrolled staff bypass'; end if;
  select a.created_at,s.expires_at into other_sid_auth_created,other_sid_expires
    from management_security.sessions s join auth.sessions a on a.id=s.session_id
    where s.session_id=other_sid;
  if other_sid_expires>other_sid_auth_created+interval '6 hours' then
    raise exception 'Second new management session exceeds six-hour deadline';
  end if;
  if (public.security_service('authorize',other_uid,other_sid,ip,agent)->>'ok')::boolean then raise exception 'Unenrolled staff authorized'; end if;
  begin update management_security.settings set enrollment_enabled=false; raise exception 'Mandatory enrollment disabled'; exception when insufficient_privilege then null; end;
  value:=public.security_service('status',uid,sid,ip,agent);
  if value->>'state'<>'enroll' then raise exception 'Enforcement must require enrollment'; end if;
  if (public.security_service('authorize',uid,sid,ip,agent)->>'ok')::boolean then raise exception 'AAL1 authorized'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid,'aal','aal1')::text,true);
  if public.security_management_access_allowed(false) then raise exception 'AAL1 direct access allowed'; end if;
  begin perform public.security_service('authorize',uid,sid,ip,agent); raise exception 'Browser invoked security service'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','service_role','session_id',sid,'aal','aal1')::text,true);
  insert into auth.mfa_factors(id,user_id,factor_type,status,friendly_name,secret,created_at,updated_at) values(factor,uid,'totp','unverified','Rollback fixture','not-a-live-secret',clock_timestamp(),clock_timestamp());
  update auth.mfa_factors set status='verified' where id=factor;
  update auth.sessions set aal='aal2',factor_id=factor where id=sid;
  insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) values(gen_random_uuid(),sid,'totp',clock_timestamp(),clock_timestamp());
  value:=public.security_service('status',uid,sid,ip,agent);
  if value->>'state'<>'email' then raise exception 'New device must require mailbox proof, got %',value->>'state'; end if;
  if (public.security_service('authorize',uid,sid,ip,agent)->>'ok')::boolean then raise exception 'AAL2 bypassed mailbox'; end if;
  value:=public.security_service('email_create',uid,sid,ip,agent,jsonb_build_object('purpose','signin','challenge_id',challenge,'code_hash',repeat('c',64)));
  if value->>'ok'<>'true' then raise exception 'Challenge creation failed'; end if;
  value:=public.security_service('email_verify',uid,sid,ip,agent,jsonb_build_object('purpose','signin','challenge_id',challenge,'code_hash',repeat('d',64)));
  if value->>'ok'<>'false' then raise exception 'Wrong code accepted'; end if;
  value:=public.security_service('email_verify',uid,sid,ip,agent,jsonb_build_object('purpose','signin','challenge_id',challenge,'code_hash',repeat('c',64)));
  if value->>'ok'<>'true' then raise exception 'Correct code rejected'; end if;
  value:=public.security_service('email_verify',uid,sid,ip,agent,jsonb_build_object('purpose','signin','challenge_id',challenge,'code_hash',repeat('c',64)));
  if value->>'ok'<>'false' then raise exception 'Email code reused'; end if;
  value:=public.security_service('recovery_issue',uid,sid,ip,agent);
  codes:=value->'codes'; batch:=(value->>'batch_id')::uuid;
  if jsonb_array_length(codes)<>10 or exists(select 1 from jsonb_array_elements_text(codes) c where c !~ '^[A-F0-9]{8}(-[A-F0-9]{8}){3}$') then raise exception 'Recovery entropy/format mismatch'; end if;
  if (public.security_service('authorize',uid,sid,ip,agent)->>'ok')::boolean then raise exception 'Acknowledgement skipped'; end if;
  value:=public.security_service('recovery_ack',uid,sid,ip,agent,jsonb_build_object('batch_id',batch));
  if value->>'ok'<>'true' then raise exception 'Ack failed'; end if;
  value:=public.security_service('authorize',uid,sid,ip,agent);
  if value->>'ok'<>'true' then raise exception 'Valid flow not authorized'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid,'aal','aal2')::text,true);
  if not public.security_management_access_allowed(true) then raise exception 'Valid AAL2 session denied'; end if;
  -- A fresh phone session still needs its own email proof, while the recovery
  -- acknowledgement and existing code batch remain account-wide.
  insert into auth.sessions(id,user_id,aal,factor_id,created_at,updated_at)
    values(phone_sid,uid,'aal2',factor,clock_timestamp(),clock_timestamp());
  insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at)
    values(gen_random_uuid(),phone_sid,'password',clock_timestamp(),clock_timestamp()),
      (gen_random_uuid(),phone_sid,'totp',clock_timestamp(),clock_timestamp());
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
  value:=public.security_service('register',uid,phone_sid,phone_ip,repeat('1',64));
  if value->>'state'<>'email' or value->>'recovery_acknowledged'<>'true' then raise exception 'Phone login lost saved recovery acknowledgement'; end if;
  update management_security.sessions set email_verified_at=clock_timestamp(),email_identity_hash=management_security.email_hash(uid) where session_id=phone_sid;
  value:=public.security_service('status',uid,phone_sid,phone_ip,repeat('1',64));
  if value->>'state'<>'authorize' or value->>'recovery_acknowledged'<>'true' then raise exception 'Phone repeated saved recovery setup'; end if;
  if public.security_service('authorize',uid,phone_sid,phone_ip,repeat('1',64))->>'ok'<>'true' then raise exception 'Verified phone could not authorize'; end if;
  if (select recovery_batch_id from management_security.accounts where user_id=uid) is distinct from batch
    or (select count(*) from management_security.recovery_codes where user_id=uid and batch_id=batch)<>10 then raise exception 'Phone login rotated existing recovery codes'; end if;
  value:=public.security_service('status',uid,phone_sid,repeat('2',64),repeat('1',64));
  if value->>'state'<>'email' or value->>'recovery_acknowledged'<>'true' then raise exception 'Phone IP change lost account recovery acknowledgement'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',other_sid,'aal','aal2')::text,true);
  if public.security_management_access_allowed(false) then raise exception 'Cross-user session accepted'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','service_role','session_id',sid,'aal','aal2')::text,true);
  update auth.mfa_amr_claims set updated_at=clock_timestamp()-interval '10 minutes' where session_id=sid and authentication_method='totp';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid,'aal','aal2')::text,true);
  if not public.security_management_access_allowed(false) or public.security_management_access_allowed(true) then raise exception 'MFA recency policy incorrect'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','service_role','session_id',sid,'aal','aal2')::text,true);
  update auth.mfa_amr_claims set updated_at=clock_timestamp() where session_id=sid and authentication_method='totp';
  value:=public.security_service('device_create',uid,sid,ip,agent,jsonb_build_object('token_hash',repeat('e',64),'label','Rollback device'));
  if value->>'ok'<>'true' then raise exception 'Device creation failed'; end if;
  if public.security_service('overview',uid,sid,ip,agent)::text like '%token_hash%' then raise exception 'Hash exposed'; end if;
  value:=public.security_service('status',uid,sid,repeat('f',64),agent);
  if value->>'state'<>'email' then raise exception 'IP change did not step up'; end if;
  value:=public.security_service('register',uid,sid,repeat('f',64),agent);
  if (value->>'expires_at')::timestamptz<>expiry then raise exception 'Session life restarted'; end if;
  update management_security.sessions set ip_hash=ip,email_verified_at=clock_timestamp(),email_identity_hash=management_security.email_hash(uid),authorized_at=clock_timestamp() where session_id=sid;
  -- Independent attempt budgets and a denied attempt cannot roll back the count.
  for n in 1..10 loop value:=public.security_service('rate',uid,sid,ip,agent,'{"kind":"totp"}'); if value->>'ok'<>'true' then raise exception 'Rate prematurely denied'; end if; end loop;
  if public.security_service('rate',uid,sid,ip,agent,'{"kind":"totp"}')->>'ok'<>'false' then raise exception 'TOTP rate bypass'; end if;
  if public.security_service('rate',uid,sid,ip,agent,'{"kind":"email_send"}')->>'ok'<>'true' then raise exception 'Rate budgets not independent'; end if;
  -- Recovery is password + recent recovery-purpose email + single-use code.
  challenge:=gen_random_uuid();
  insert into management_security.email_challenges(id,user_id,session_id,purpose,ip_hash,email_identity_hash,code_hash,verified_at,closed_at) values(challenge,uid,sid,'recovery',ip,management_security.email_hash(uid),repeat('a',64),clock_timestamp(),clock_timestamp());
  value:=public.security_service('recovery_consume',uid,sid,ip,agent,jsonb_build_object('code_hash',encode(extensions.digest(replace(codes->>0,'-',''),'sha256'),'hex')));
  if value->>'ok'<>'true' then raise exception 'Recovery code rejected'; end if;
  if public.security_service('recovery_consume',uid,sid,ip,agent,jsonb_build_object('code_hash',encode(extensions.digest(replace(codes->>0,'-',''),'sha256'),'hex')))->>'ok'<>'false' then raise exception 'Recovery code reused'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid,'aal','aal2')::text,true);
  if public.security_management_access_allowed(false) then raise exception 'Recovery granted business access'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','service_role','session_id',sid,'aal','aal2')::text,true);
  delete from auth.mfa_factors where id=factor;
  if not management_security.required(uid) then raise exception 'Unenroll cleared account requirement'; end if;
  if not exists(select 1 from management_security.audit_events where user_id=uid and event_type='mfa_disabled') then raise exception 'Auth factor deletion not audited'; end if;
  if not management_security.live(uid,sid,ip) then raise exception 'Recovery bootstrap session lost'; end if;
  update management_security.sessions set last_activity_at=clock_timestamp()-interval '6 hours 1 minute' where session_id=sid;
  if management_security.live(uid,sid,ip) then raise exception 'Idle timeout bypass'; end if;
  update management_security.sessions set last_activity_at=clock_timestamp(),expires_at=clock_timestamp()-interval '1 second' where session_id=sid;
  if management_security.live(uid,sid,ip) then raise exception 'Lifetime timeout bypass'; end if;
  if has_function_privilege('authenticated','public.security_service(text,uuid,uuid,text,text,jsonb)','EXECUTE') then raise exception 'Browser has private RPC grant'; end if;
  if has_schema_privilege('authenticated','management_security','USAGE') then raise exception 'Browser can access private schema'; end if;
end $$;
select 'MFA foundation invariants passed; transaction rolled back' verification;
rollback;
