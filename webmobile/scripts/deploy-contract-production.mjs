import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { root, privateConfig, management } from './private-config.mjs'
const env=await privateConfig(),ref=new URL(env.SUPABASE_URL).hostname.split('.')[0]
if(ref!=='wtrycmiojsiliyjxsewz') throw new Error('Wrong production project')
const before=JSON.parse(await readFile(path.join(root,'qa/private/contract-production-before.json'),'utf8'))
const query=async sql=>management(env,'/database/query',{query:sql})
const migration=await readFile(path.join(root,'../supabase/migrations/20261007170000_contract_confirmation.sql'),'utf8')
await query(migration)
await query(await readFile(path.join(root,'../supabase/migrations/20261007180000_contract_confirmation_history.sql'),'utf8'))
await query(await readFile(path.join(root,'../supabase/migrations/20261007190000_contract_revisions_and_cancellation.sql'),'utf8'))
await query(await readFile(path.join(root,'../supabase/migrations/20261007200000_contract_cancellation_policy.sql'),'utf8'))
await query(await readFile(path.join(root,'../supabase/migrations/20261008210000_contract_test_cancellation.sql'),'utf8'))
await query(await readFile(path.join(root,'../supabase/migrations/20261008220000_tenant_system_email_separation.sql'),'utf8'))
await query(await readFile(path.join(root,'../supabase/migrations/20261008223000_contract_account_visibility.sql'),'utf8'))
await query(await readFile(path.join(root,'../supabase/migrations/20261008224000_contract_wrong_email_cancellation.sql'),'utf8'))
await query(await readFile(path.join(root,'../supabase/migrations/20261008233000_tenant_auth_provisioning.sql'),'utf8'))
const counts=(await query(`select jsonb_build_object('contracts',(select count(*) from public.contracts),'drafts',(select count(*) from public.contract_drafts),'rooms',(select count(*) from public.rooms),'tenants',(select count(*) from public.tenants)) as counts;`))[0].counts
if(JSON.stringify(counts)!==JSON.stringify(before.counts)) throw new Error('Business row counts changed; inspect before continuing')
const privateFile=path.join(root,'.env.production.local')
let content=await readFile(privateFile,'utf8')
const secret=env.CONTRACT_GATEWAY_SECRET || randomBytes(32).toString('hex')
if(!env.CONTRACT_GATEWAY_SECRET) await writeFile(privateFile,content.trimEnd()+`\nCONTRACT_GATEWAY_SECRET=${secret}\n`)
await management(env,'/secrets',[
 {name:'CONTRACT_ENVIRONMENT',value:'production'}, {name:'CONTRACT_DB_SCHEMA',value:'public'},
 {name:'CONTRACT_PUBLIC_URL',value:'https://pay.phongtroankhang.com'}, {name:'CONTRACT_GATEWAY_SECRET',value:secret}
])
const slug='contract-confirmation'
const bundle=await build({entryPoints:[path.join(root,'cloud/contract-confirmation-edge.mjs')],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',jsx:'automatic',alias:{'react-dom/server':'react-dom/server.browser'},define:{'process.env.NODE_ENV':'"production"'}})
const form=new FormData()
form.set('metadata',JSON.stringify({name:slug,entrypoint_path:'index.js',verify_jwt:false}))
form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(30000)})
if(!response.ok) throw new Error(`Contract production edge deployment ${response.status}`)
const cf=`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/ankhanghome-payment`
async function cloudflare(data) {
 const r=await fetch(cf,{method:data?'PATCH':'GET',headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})})
 const j=await r.json()
 if(!j.success) throw new Error(`Cloudflare ${r.status}: ${j.errors?.map(x=>x.message).join('; ')}`)
 return j.result
}
const current=await cloudflare(),configs={...current.deployment_configs}
for(const name of ['production','preview']) configs[name]={...configs[name],env_vars:{...configs[name]?.env_vars,
 CONTRACT_EDGE_URL:{type:'plain_text',value:`${env.SUPABASE_URL}/functions/v1/${slug}`},CONTRACT_GATEWAY_SECRET:{type:'secret_text',value:secret},
 // Cloudflare redacts secret values on GET. Restore the existing gateway
 // explicitly instead of writing its redacted representation back as empty.
 WEBMOBILE_GATEWAY_SECRET:{type:'secret_text',value:env.WEBMOBILE_GATEWAY_SECRET}
}}
await cloudflare({deployment_configs:configs})
const access=(await query(`select relrowsecurity as rls,has_table_privilege('anon','public.contract_confirmations','SELECT') as anon_select,has_function_privilege('anon','public.contract_confirmation_accept(text)','EXECUTE') as anon_accept from pg_class where oid='public.contract_confirmations'::regclass`))[0]
if(!access.rls||access.anon_select||access.anon_accept) throw new Error('Contract access isolation failed')
await writeFile(path.join(root,'qa/contract-production-deployment.json'),JSON.stringify({at:new Date().toISOString(),project:ref,website:'https://pay.phongtroankhang.com',function:slug,counts,access,gmailSent:false,contractsCreated:false},null,2)+'\n')
console.log('Production contract schema, edge and Pages gateway configured. Business counts unchanged; anonymous table/RPC access denied. No email sent or contract activated.')
