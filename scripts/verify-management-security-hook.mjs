import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const checks = await management(env, '/database/query', { query: `
begin;
do $$ declare uid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); begin
  insert into auth.users(id,email) values(uid,'hook-fixture-'||uid||'@example.invalid');
  insert into public.users(id,email,username,full_name,role,status) values(uid,'hook-fixture-'||uid||'@example.invalid',uid::text,'Hook fixture','admin','active') on conflict(id) do update set role='admin',status='active';
  update management_security.settings set enforce_management=true;
  perform set_config('request.method','POST',true); perform set_config('request.path','/rpc/admin_pwa_investment_read',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid,'aal','aal1')::text,true);
  begin perform public.security_management_pre_request(); raise exception 'AAL1 RPC bypass'; exception when insufficient_privilege then null; end;
  perform set_config('request.path','/rpc/security_mfa_readiness',true);
  perform public.security_management_pre_request();
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','app_metadata',jsonb_build_object('portal_role','webmobile_tenant'))::text,true);
  perform set_config('request.path','/rpc/tenant_email_check',true); perform public.security_management_pre_request();
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.path','/rpc/security_service',true); perform public.security_management_pre_request();
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform public.security_management_pre_request();
end $$;
select 'Management AAL1 denied; readiness, tenant, service and anonymous compatibility passed' verification;
rollback;` })
assert.equal(checks.length, 1)
if (process.argv.includes('--enable')) {
  await management(env, '/database/query', { query: "alter role authenticator set pgrst.db_pre_request='public.security_management_pre_request'; notify pgrst,'reload config'; notify pgrst,'reload schema';" })
}
const report = { at: new Date().toISOString(), checks, hookInstalled: process.argv.includes('--enable'), rolloutFlagsUnchanged: true, customerDataChanged: false, limitation: 'SQL compatibility; direct HTTP verification follows with disposable identities.' }
await writeFile(new URL('../docs/security/qa/mfa-hook-2026-10-10.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
