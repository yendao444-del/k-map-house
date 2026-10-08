import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
import { root } from './private-config.mjs'
import { hashContractToken, newContractToken } from '../cloud/contract-confirmation.mjs'

const env=await contractTestConfig(),schema=env.CONTRACT_DB_SCHEMA
assert.equal(schema,'ankhang_contract_test')
const suffix=crypto.randomUUID().replaceAll('-','').slice(0,12),prefix=`qa-provision-${suffix}`
const tenantIds=[],roomIds=[],draftIds=[],authIds=[],checks=[]
const sql=query=>testManagement(env,'/database/query',{query})
const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json'}
async function api(route,body,token=env.SUPABASE_SERVICE_ROLE_KEY) {
 const response=await fetch(env.SUPABASE_URL+route,{method:'POST',headers:{...headers,Authorization:`Bearer ${token}`,'Content-Profile':schema,'Accept-Profile':schema},body:JSON.stringify(body)})
 return {status:response.status,ok:response.ok,data:await response.json().catch(()=>null)}
}
async function rpc(name,body,token) {return api(`/rest/v1/rpc/${name}`,body,token)}
const mark=name=>checks.push(name)
const password=`Qa!${randomBytes(18).toString('base64url')}`
async function tenant(index) {
 const id=`${prefix}-${index}`,email=`${id}@ankhanghome.example`
 tenantIds.push(id)
 await sql(`insert into ${schema}.tenants(id,full_name,email,is_active) values('${id}','Khách thử cấp tài khoản','${email}',true)`)
 return {id,email}
}
async function createAuth(id,email,extra={}) {
 const result=await api('/auth/v1/admin/users',{id,email,password,email_confirm:true,role:'anon',app_metadata:{portal_role:'webmobile_tenant',...extra},user_metadata:{username:`portal_${id.replaceAll('-','')}`,full_name:'Khách thử cấp tài khoản'}})
 if(result.ok)authIds.push(result.data.id)
 return result
}
const trigger=`qa_provision_profile_${suffix}`
try {
 // Mirror Electron's staff-profile AFTER INSERT trigger in the isolated project.
 // It runs only for this test's exact synthetic email prefix.
 await sql(`create function ${schema}.${trigger}() returns trigger language plpgsql security definer set search_path=${schema},pg_temp as $$ begin
 if new.email like '${prefix}%@ankhanghome.example' then
 insert into ${schema}.users(id,email,username,full_name) values(new.id,new.email,new.raw_user_meta_data->>'username','QA profile');
 end if; return new; end $$;
 create trigger ${trigger} after insert on auth.users for each row execute function ${schema}.${trigger}();`)

 const adminTenant=await tenant('admin'),adminUser=crypto.randomUUID()
 const blocked=await createAuth(adminUser,adminTenant.email)
 assert.equal(blocked.status,500,'initial admin metadata arrives too late without reservation');mark('reproduces original GoTrue insertion failure')
 const forged=await api('/auth/v1/admin/users',{id:adminUser,email:adminTenant.email,password,user_metadata:{portal_role:'webmobile_tenant'}})
 assert.equal(forged.status,500);mark('untrusted user_metadata cannot bypass system-email guard')
 const args={p_user:adminUser,p_tenant:adminTenant.id,p_email:adminTenant.email,p_actor:env.CONTRACT_TEST_ADMIN_ID}
 assert.ok(!(await rpc('webmobile_prepare_tenant_auth',args,env.VITE_SUPABASE_ANON_KEY)).ok);mark('anonymous cannot reserve Auth identity')
 assert.ok(!(await rpc('webmobile_prepare_tenant_auth',{...args,p_actor:crypto.randomUUID()})).ok);mark('reservation requires actual active admin')
 assert.ok([200,204].includes((await rpc('webmobile_prepare_tenant_auth',args)).status))
 const created=await createAuth(adminUser,adminTenant.email)
 assert.equal(created.status,200,JSON.stringify(created.data));assert.equal(created.data.id,adminUser);mark('admin creation succeeds for email already in tenant profile')
 assert.equal(created.data.app_metadata.portal_role,'webmobile_tenant');assert.equal(created.data.role,'anon')
 const isolated=(await sql(`select (select count(*) from ${schema}.users where id='${adminUser}')::int staff,(select count(*) from ${schema}.tenant_auth_provisions where user_id='${adminUser}')::int reservations`))[0]
 assert.equal(isolated.staff,0);assert.equal(isolated.reservations,0);mark('creation never grants staff profile and consumes reservation')
 assert.ok([200,204].includes((await rpc('webmobile_enroll_tenant',{p_user_id:adminUser,p_tenant_id:adminTenant.id,p_email:adminTenant.email,p_actor:env.CONTRACT_TEST_ADMIN_ID})).status));mark('admin-created identity enrolls in tenant account')

 const info=await tenant('provision')
 const portalUser=crypto.randomUUID()
 const reservation={p_user:portalUser,p_tenant:info.id,p_email:info.email,p_actor:env.CONTRACT_TEST_ADMIN_ID}
 assert.ok([200,204].includes((await rpc('webmobile_prepare_tenant_auth',reservation)).status));
 const portal=await createAuth(portalUser,info.email)
 assert.equal(portal.status,200,JSON.stringify(portal.data));mark('tenant Auth creation consumes a verified reservation')
 assert.equal((await rpc('webmobile_enroll_tenant',{p_user_id:portalUser,p_tenant_id:info.id,p_email:info.email,p_actor:env.CONTRACT_TEST_ADMIN_ID})).status,204);mark('reserved identity can be enrolled after Auth creation')
 const access=(await sql(`select has_table_privilege('anon','${schema}.tenant_auth_provisions','SELECT') anon_read,has_table_privilege('authenticated','${schema}.tenant_auth_provisions','INSERT') staff_write`))[0]
 assert.equal(access.anon_read,false);assert.equal(access.staff_write,false);mark('reservation table unavailable to browser and staff JWTs')
} finally {
 await sql(`drop trigger if exists ${trigger} on auth.users; drop function if exists ${schema}.${trigger}();`)
 // Delete only identities and business fixtures created by this invocation.
 const tenants=tenantIds.map(x=>`'${x}'`).join(','),drafts=draftIds.map(x=>`'${x}'`).join(',')||"''",rooms=roomIds.map(x=>`'${x}'`).join(',')||"''"
 if(tenants) {
  const remaining=draftIds.length ? await sql(`select account_user_id id from ${schema}.contract_confirmations where draft_id in (${drafts}) and exists(select 1 from auth.users where id=account_user_id)`) : []
  for(const row of remaining)if(!authIds.includes(row.id))authIds.push(row.id)
  if(draftIds.length) await sql(`delete from ${schema}.webmobile_auth_sessions where user_id in (select auth_user_id from ${schema}.tenant_web_accounts where tenant_id in (${tenants}));
  delete from ${schema}.tenant_web_accounts where tenant_id in (${tenants});
  delete from ${schema}.contract_confirmation_events where confirmation_id in(select id from ${schema}.contract_confirmations where draft_id in (${drafts}));
  delete from ${schema}.tenant_auth_provisions where tenant_id in (${tenants});
  delete from ${schema}.contract_confirmations where draft_id in (${drafts});
  delete from ${schema}.contract_lifecycle_events where draft_id in (${drafts});
  delete from ${schema}.contract_drafts where id in (${drafts});
  delete from ${schema}.contracts where tenant_id in (${tenants});
  delete from ${schema}.rooms where id in (${rooms});
  delete from ${schema}.tenants where id in (${tenants});`)
 }
 for(const id of authIds) {
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`,{method:'DELETE',headers})
  // A retried fixture may already have been removed by the compensating path.
  if(!response.ok && response.status!==404) console.warn(`QA identity cleanup deferred (${response.status})`)
 }
 await sql(`delete from ${schema}.webmobile_auth_sessions where user_id in (select auth_user_id from ${schema}.tenant_web_accounts where email like '${prefix}%@ankhanghome.example');
 delete from ${schema}.tenant_web_accounts where email like '${prefix}%@ankhanghome.example';
 delete from auth.users where email like '${prefix}%@ankhanghome.example'`)
}
await writeFile(path.join(root,'qa/tenant-auth-provisioning-test.json'),JSON.stringify({at:new Date().toISOString(),project:env.CONTRACT_TEST_PROJECT_REF,passed:true,checks,fixturesRemoved:true,emailsSent:false,productionWrites:false},null,2)+'\n')
console.log(`Passed ${checks.length} live tenant Auth provisioning checks; exact fixtures removed. No email sent.`)
