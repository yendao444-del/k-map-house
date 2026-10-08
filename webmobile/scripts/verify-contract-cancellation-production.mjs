import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { privateConfig,management,root } from './private-config.mjs'
import { contractTestConfig,testManagement } from './contract-test-config.mjs'
const prod=await privateConfig(),test=await contractTestConfig()
assert.equal(new URL(prod.SUPABASE_URL).hostname.split('.')[0],'wtrycmiojsiliyjxsewz')
const query=(env,isTest,sql)=>(isTest?testManagement:management)(env,'/database/query',{query:sql})
const names=['contract_cancellation_check','contract_cancel','contract_cancel_internal','contract_capture_usage','contract_original_confirmation','guard_contract_cancellation_metadata','contract_cancellation_notice']
const sources=async(env,isTest)=>query(env,isTest,`select proname,prosrc,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='${isTest?test.CONTRACT_DB_SCHEMA:'public'}' and proname in (${names.map(n=>`'${n}'`).join(',')}) order by proname`)
const [ps,ts]=await Promise.all([sources(prod,false),sources(test,true)])
const normalize=rows=>rows.map(r=>({name:r.proname,body:r.prosrc.replaceAll(test.CONTRACT_DB_SCHEMA,'public'),config:r.proconfig?.map(c=>c.replaceAll(test.CONTRACT_DB_SCHEMA,'public'))}))
assert.deepEqual(normalize(ps),normalize(ts),'Production policy must match the verified TEST source exactly')
const fingerprints=normalize(ps).map(r=>({name:r.name,sha256:createHash('sha256').update(r.body).digest('hex')}))
const access=await query(prod,false,`select tablename,rowsecurity,has_table_privilege('anon','public.'||tablename,'SELECT') anon_select,has_table_privilege('authenticated','public.'||tablename,'UPDATE') staff_update from pg_tables where schemaname='public' and tablename in ('contract_usage_evidence','contract_cancellation_notices','contract_lifecycle_events')`)
assert.equal(access.length,3);for(const x of access){assert.ok(x.rowsecurity);assert.equal(x.anon_select,false);assert.equal(x.staff_update,false)}
const internal=(await query(prod,false,"select has_function_privilege('service_role','public.contract_cancel_internal(text,uuid,text)','EXECUTE') unsafe_direct,to_regprocedure('public.contract_cancel(text,uuid,text)') is null legacy_removed"))[0];assert.equal(internal.unsafe_direct,false);assert.equal(internal.legacy_removed,true)
const endpoints=[]
for(const action of ['cancel','cancel_check','cancel_notice','cancel_notices']){
 const response=await fetch(`${prod.SUPABASE_URL}/functions/v1/contract-confirmation`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,contractId:'no-write-test'})});assert.equal(response.status,401);endpoints.push({action,status:response.status})
 const gateway=await fetch('https://pay.phongtroankhang.com/api/contract-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,contractId:'no-write-test'})});assert.equal(gateway.status,400)
}
const counts=(await query(prod,false,"select jsonb_build_object('rooms',(select count(*) from public.rooms),'tenants',(select count(*) from public.tenants),'contracts',(select count(*) from public.contracts),'drafts',(select count(*) from public.contract_drafts),'notices',(select count(*) from public.contract_cancellation_notices)) counts"))[0].counts
const room999=await query(prod,false,"select r.name,public.contract_cancellation_check(c.id) eligibility from public.contracts c join public.rooms r on r.id=c.room_id where r.name like '%999%' and c.status='active'")
await writeFile(path.join(root,'qa/contract-cancellation-policy-production-verification.json'),JSON.stringify({at:new Date().toISOString(),project:'wtrycmiojsiliyjxsewz',fingerprints,access,internal,endpoints,counts,room999,wroteBusinessData:false,sentEmail:false},null,2)+'\n')
console.log('Production cancellation functions match verified TEST exactly; private tables and public gateway isolated. '+JSON.stringify(counts))
