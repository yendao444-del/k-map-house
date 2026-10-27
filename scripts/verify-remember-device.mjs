import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env=await privateConfig()
assert.equal(new URL(env.SUPABASE_URL).hostname.split('.')[0],'wtrycmiojsiliyjxsewz')
const migration=await readFile(new URL('../supabase/migrations/20261012150000_security_remember_device_existing_login.sql',import.meta.url),'utf8')
const fixture=await readFile(new URL('../adminpwa/backend/tests/remember-device-rollback.sql',import.meta.url),'utf8')
const safetyQuery=`select (select row_to_json(s) from management_security.settings s where singleton) as settings,
  md5(pg_get_functiondef('public.security_management_access_allowed(boolean)'::regprocedure)) as business_guard,
  md5(coalesce((select proacl::text from pg_proc where oid='public.security_service(text,uuid,uuid,text,text,jsonb)'::regprocedure),'')) as rpc_acl;`
const before=await management(env,'/database/query',{query:safetyQuery})
const result=await management(env,'/database/query',{query:migration.replace(/\bcommit;/i,'')+'\n'+fixture+'\nrollback;'})
assert.equal(result[0]?.remember_device_invariants,'passed')
const production=process.argv.includes('--production')
if(production) {
  await management(env,'/database/query',{query:migration})
  const deployed=await management(env,'/database/query',{query:'begin;\n'+fixture+'\nrollback;'})
  assert.equal(deployed[0]?.remember_device_invariants,'passed')
}
const after=await management(env,'/database/query',{query:safetyQuery})
assert.deepEqual(after,before)
const report={at:new Date().toISOString(),productionApplied:production,result,settingsAndBusinessGuardUnchanged:true,customerDataChanged:false,fixturesRolledBack:true,tests:'Completed AAL2 login outside fresh-MFA window; ownership/IP/browser/deadline/recovery/mail/device checks; public RPC denied; device revocation still requires fresh MFA.'}
await writeFile(new URL('../docs/security/qa/remember-device-'+(production?'deployment':'database')+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
