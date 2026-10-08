import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root, privateConfig, management } from './private-config.mjs'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
const test=process.argv.includes('--test')
const env=test?await contractTestConfig():await privateConfig()
const ref=new URL(env.SUPABASE_URL).hostname.split('.')[0],schema=test?env.CONTRACT_DB_SCHEMA:'public'
if(test?ref!=='gsianbstkmyutnhromwc'||schema!=='ankhang_contract_test':ref!=='wtrycmiojsiliyjxsewz') throw new Error('Wrong history deployment target')
const query=sql=>(test?testManagement:management)(env,'/database/query',{query:sql})
const before=(await query(`select jsonb_build_object('contracts',(select count(*) from ${schema}.contracts),'drafts',(select count(*) from ${schema}.contract_drafts),'rooms',(select count(*) from ${schema}.rooms),'tenants',(select count(*) from ${schema}.tenants)) as counts`))[0].counts
let sql=await readFile(path.join(root,'../supabase/migrations/20261007180000_contract_confirmation_history.sql'),'utf8')
if(test) sql=sql.replaceAll('public.',`${schema}.`).replaceAll('search_path=public',`search_path=${schema}`)
await query(sql)
const bundle=await build({entryPoints:[path.join(root,'cloud/contract-confirmation-edge.mjs')],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',jsx:'automatic',alias:{'react-dom/server':'react-dom/server.browser'},define:{'process.env.NODE_ENV':'"production"'}})
const form=new FormData()
form.set('metadata',JSON.stringify({name:'contract-confirmation',entrypoint_path:'index.js',verify_jwt:false}))
form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=contract-confirmation`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(30000)})
if(!response.ok) throw new Error(`History edge deploy HTTP ${response.status}`)
const after=(await query(`select jsonb_build_object('contracts',(select count(*) from ${schema}.contracts),'drafts',(select count(*) from ${schema}.contract_drafts),'rooms',(select count(*) from ${schema}.rooms),'tenants',(select count(*) from ${schema}.tenants)) as counts`))[0].counts
const access=(await query(`select relrowsecurity as rls,has_table_privilege('anon','${schema}.contract_confirmation_events','SELECT') as anon_select,has_function_privilege('authenticated','${schema}.contract_confirmation_history(uuid)','EXECUTE') as staff_direct from pg_class where oid='${schema}.contract_confirmation_events'::regclass`))[0]
if(!access.rls||access.anon_select||access.staff_direct) throw new Error('History isolation failed')
await writeFile(path.join(root,`qa/contract-history-${test?'test':'production'}-deployment.json`),JSON.stringify({at:new Date().toISOString(),project:ref,schema,before,after,access,emailsSent:false,contractsCreated:false},null,2)+'\n')
console.log(`${test?'TEST':'Production'} history schema/edge deployed. Counts: ${JSON.stringify({before,after})}. History table/RPC access isolated.`)
