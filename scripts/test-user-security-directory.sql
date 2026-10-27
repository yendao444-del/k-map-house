begin;
-- Every identity, factor, session and email transition below is synthetic and
-- rolled back. No real account is updated or included in the report.
do $test$
declare
  admin_id uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid(); pending_id uuid:=gen_random_uuid();
  admin_sid uuid:=gen_random_uuid(); staff_sid uuid:=gen_random_uuid();
  admin_factor uuid:=gen_random_uuid(); staff_factor uuid:=gen_random_uuid();
  item jsonb; n integer;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (admin_id,'directory-admin-'||admin_id||'@example.invalid',clock_timestamp()),
    (staff_id,'directory-staff-'||staff_id||'@example.invalid',clock_timestamp()),
    (pending_id,'directory-pending-'||pending_id||'@example.invalid',null);
  insert into public.users(id,email,username,full_name,role,status) values
    (admin_id,'directory-admin-'||admin_id||'@example.invalid',admin_id::text,'Directory admin fixture','admin','active'),
    (staff_id,'directory-staff-'||staff_id||'@example.invalid',staff_id::text,'Directory staff fixture','user','active'),
    (pending_id,'directory-pending-'||pending_id||'@example.invalid',pending_id::text,'Directory pending fixture','user','inactive')
    on conflict(id) do update set role=excluded.role,status=excluded.status;
  insert into auth.mfa_factors(id,user_id,factor_type,status,friendly_name,secret,created_at,updated_at) values
    (admin_factor,admin_id,'totp','verified','Directory admin fixture','synthetic-secret',clock_timestamp(),clock_timestamp()),
    (staff_factor,staff_id,'totp','verified','Directory staff fixture','synthetic-secret',clock_timestamp(),clock_timestamp()),
    (gen_random_uuid(),pending_id,'totp','unverified','Directory pending fixture','synthetic-secret',clock_timestamp(),clock_timestamp());
  insert into auth.sessions(id,user_id,aal,factor_id,created_at,updated_at) values
    (admin_sid,admin_id,'aal2',admin_factor,clock_timestamp(),clock_timestamp()),
    (staff_sid,staff_id,'aal2',staff_factor,clock_timestamp(),clock_timestamp());
  insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) values
    (gen_random_uuid(),admin_sid,'totp',clock_timestamp(),clock_timestamp()),
    (gen_random_uuid(),staff_sid,'totp',clock_timestamp(),clock_timestamp());
  insert into management_security.accounts(user_id,mfa_required,recovery_ack_at) values
    (admin_id,true,clock_timestamp()),(staff_id,true,clock_timestamp());
  insert into management_security.sessions(session_id,user_id,ip_hash,agent_hash,password_verified_at,email_required,authorized_at,expires_at) values
    (admin_sid,admin_id,repeat('a',64),repeat('b',64),clock_timestamp(),false,clock_timestamp(),clock_timestamp()+interval '6 hours'),
    (staff_sid,staff_id,repeat('a',64),repeat('b',64),clock_timestamp(),false,clock_timestamp(),clock_timestamp()+interval '6 hours');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','session_id',admin_sid,'aal','aal2')::text,true);
  execute 'set local role authenticated';
  select to_jsonb(d) into item from public.management_user_directory() d where d.id=staff_id;
  if item->>'role'<>'user' or item->>'status'<>'active' or item->>'authenticator_verified'<>'true' then
    raise exception 'Admin directory/profile/TOTP flags incorrect'; end if;
  if item->>'email_verified'<>'false' then raise exception 'Admin provisioned email incorrectly treated as OTP proof'; end if;
  if (select count(*) from jsonb_object_keys(item))<>15 or item ?| array['secret','password_hash','recovery_codes','email_verified_identity_hash','session_id','access_token'] then
    raise exception 'Directory projection exposes private fields'; end if;
  select to_jsonb(d) into item from public.management_user_directory() d where d.id=pending_id;
  if item->>'authenticator_verified'<>'false' or item->>'email_verified'<>'false' or item->>'status'<>'inactive' then
    raise exception 'Unverified factor or disabled account flags incorrect'; end if;
  begin
    update management_security.accounts set email_verified_at=clock_timestamp() where user_id=staff_id;
    raise exception 'Client forged mailbox verification';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- Reproduce an already-authorized login after recent MFA has aged out.
  -- POST is the SDK default used by already-running clients; GET is the new
  -- explicit read request. Both must work without a sensitive-operation proof.
  update auth.mfa_amr_claims set updated_at=clock_timestamp()-interval '30 minutes'
    where session_id=admin_sid and authentication_method='totp';
  execute 'set local role authenticated';
  if not public.security_management_access_allowed(false) or public.security_management_access_allowed(true) then
    raise exception 'Stale MFA fixture does not distinguish reads from sensitive writes'; end if;
  perform set_config('request.path','/rpc/management_user_directory',true);
  perform set_config('request.method','POST',true);
  perform public.security_management_pre_request();
  select count(*) into n from public.management_user_directory() where id in (admin_id,staff_id,pending_id);
  if n<>3 then raise exception 'Existing POST client failed directory read'; end if;
  perform set_config('request.method','GET',true);
  perform public.security_management_pre_request();
  perform set_config('request.method','POST',true);
  perform set_config('request.path','/users',true);
  begin perform public.security_management_pre_request(); raise exception 'Sensitive writes accepted stale MFA';
    exception when insufficient_privilege then null; end;
  execute 'reset role';

  -- Simulate the trusted server's successful OTP transition for the fixture.
  update management_security.sessions set email_verified_at=clock_timestamp(),email_identity_hash=management_security.email_hash(staff_id) where session_id=staff_sid;
  execute 'set local role authenticated';
  select email_verified into strict n from (select case when email_verified then 1 else 0 end as email_verified from public.management_user_directory() where id=staff_id) d;
  if n<>1 then raise exception 'Successful OTP proof not remembered'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated','session_id',staff_sid,'aal','aal2')::text,true);
  execute 'set local role authenticated';
  select count(*) into n from public.management_user_directory();
  if n<>1 then raise exception 'Staff directory exposes other accounts'; end if;
  execute 'reset role';
  delete from auth.sessions where id=staff_sid;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','session_id',admin_sid,'aal','aal2')::text,true);
  execute 'set local role authenticated';
  if not (select email_verified from public.management_user_directory() where id=staff_id) then
    raise exception 'Logout/session cleanup discarded account OTP proof'; end if;
  execute 'reset role';
  update auth.users set email='directory-changed-'||staff_id||'@example.invalid' where id=staff_id;
  execute 'set local role authenticated';
  if (select email_verified from public.management_user_directory() where id=staff_id) then
    raise exception 'Old OTP proof accepted for changed email'; end if;
  execute 'reset role';
  update auth.mfa_factors set status='unverified' where id=staff_factor;
  execute 'set local role authenticated';
  if (select authenticator_verified from public.management_user_directory() where id=staff_id) then
    raise exception 'Removed/unverified MFA still shown verified'; end if;
  execute 'reset role';

  update management_security.sessions set revoked_at=clock_timestamp() where session_id=admin_sid;
  execute 'set local role authenticated';
  perform set_config('request.path','/rpc/management_user_directory',true);
  begin perform public.security_management_pre_request(); raise exception 'Revoked session passed read hook';
    exception when insufficient_privilege then null; end;
  begin perform public.management_user_directory(); raise exception 'Revoked session read directory';
    exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',pending_id,'role','authenticated','app_metadata',jsonb_build_object('portal_role','webmobile_tenant'))::text,true);
  execute 'set local role authenticated';
  begin perform public.management_user_directory(); raise exception 'Inactive/tenant subject read directory';
    exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin perform public.management_user_directory(); raise exception 'Unknown subject read directory';
    exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  begin perform public.management_user_directory(); raise exception 'Anonymous read directory';
    exception when insufficient_privilege then null; end;
  execute 'reset role';
end;
$test$;
rollback;
