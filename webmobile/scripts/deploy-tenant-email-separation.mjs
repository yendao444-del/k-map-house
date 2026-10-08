import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root, privateConfig, management } from './private-config.mjs'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
const test = process.argv.includes('--test')
const env = test ? await contractTestConfig() : await privateConfig()
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0], schema = test ? env.CONTRACT_DB_SCHEMA : 'public'
assert.equal(ref, test ? 'gsianbstkmyutnhromwc' : 'wtrycmiojsiliyjxsewz')
assert.equal(schema, test ? 'ankhang_contract_test' : 'public')
if (!test) {
 const evidence = JSON.parse(await readFile(path.join(root,'qa/tenant-email-separation-test.json'),'utf8'))
 assert.equal(evidence.passed,true); assert.equal(evidence.project,'gsianbstkmyutnhromwc')
 const recovery = JSON.parse(await readFile(path.join(root,'qa/contract-account-visibility-test.json'),'utf8'))
 assert.equal(recovery.passed,true); assert.equal(recovery.project,'gsianbstkmyutnhromwc')
 const provisioning = JSON.parse(await readFile(path.join(root,'qa/tenant-auth-provisioning-test.json'),'utf8'))
 assert.equal(provisioning.passed,true); assert.equal(provisioning.project,'gsianbstkmyutnhromwc')
}
const query = sql => (test ? testManagement : management)(env,'/database/query',{query:sql})
const counts = async () => (await query(`select jsonb_build_object('tenants',(select count(*) from ${schema}.tenants),'rooms',(select count(*) from ${schema}.rooms),'contracts',(select count(*) from ${schema}.contracts),'drafts',(select count(*) from ${schema}.contract_drafts),'confirmations',(select count(*) from ${schema}.contract_confirmations),'accounts',(select count(*) from ${schema}.tenant_web_accounts),'authUsers',(select count(*) from auth.users)) counts`))[0].counts
const before=await counts()
for (const file of ['20261008220000_tenant_system_email_separation.sql','20261008223000_contract_account_visibility.sql','20261008224000_contract_wrong_email_cancellation.sql','20261008233000_tenant_auth_provisioning.sql']) {
 let sql=await readFile(path.join(root,'../supabase/migrations',file),'utf8')
 if (test) sql=sql.replaceAll('public.',`${schema}.`).replaceAll('search_path=public',`search_path=${schema}`)
 await query(sql)
}
for (const [slug,entry] of [['contract-confirmation','contract-confirmation-edge.mjs'],['tenant-web-admin','tenant-admin-edge.mjs']]) {
 const bundle=await build({entryPoints:[path.join(root,'cloud',entry)],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',jsx:'automatic',alias:{'react-dom/server':'react-dom/server.browser'},define:{'process.env.NODE_ENV':'"production"'}})
 const form=new FormData()
 form.set('metadata',JSON.stringify({name:slug,entrypoint_path:'index.js',verify_jwt:false}))
 form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
 const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(30000)})
 assert.ok(r.ok,`Deploy ${slug}: ${r.status}`)
}
const after=await counts();assert.deepEqual(after,before)
await writeFile(path.join(root,`qa/tenant-email-separation-${test?'test':'production'}-deployment.json`),JSON.stringify({at:new Date().toISOString(),project:ref,schema,before,after,emailsSent:false},null,2)+'\n')
console.log(`${test?'TEST':'Production'} email guards and both account endpoints deployed; row counts unchanged.`)
