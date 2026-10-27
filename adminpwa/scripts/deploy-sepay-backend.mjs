import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env=await privateConfig(), ref=new URL(env.SUPABASE_URL||env.VITE_SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref,'wtrycmiojsiliyjxsewz','Unexpected production backend; stop.')
const query=sql=>management(env,'/database/query',{query:sql})
const before=await query("select (select count(*) from public.payment_events)::int payment_events,(select count(*) from public.invoices)::int invoices,(select count(*) from public.cash_transactions)::int cash_transactions")
for(const name of ['20261008_verified_bank_reconciliation.sql','20261008_sepay_provenance_guard.sql','20261008110000_sepay_secret_column_guard.sql']) await query(await readFile(new URL(`../backend/migrations/${name}`,import.meta.url),'utf8'))
const slug='admin-pwa-sepay', bundle=await build({entryPoints:[fileURLToPath(new URL(`../backend/functions/${slug}/index.ts`,import.meta.url))],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022'})
const form=new FormData(); form.set('metadata',JSON.stringify({name:slug,entrypoint_path:'index.js',verify_jwt:false})); form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
const deploy=await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(60000)}); assert.ok(deploy.ok,`HTTP ${deploy.status}`); const info=await deploy.json()
const after=await query("select (select count(*) from public.payment_events)::int payment_events,(select count(*) from public.invoices)::int invoices,(select count(*) from public.cash_transactions)::int cash_transactions"); assert.deepEqual(after,before,'Business counts changed during deploy')
const url=`${env.SUPABASE_URL}/functions/v1/${slug}`; const checks=[]
for(const headers of [{},{Authorization:'Bearer invalid.invalid.invalid'},{Authorization:'Bearer invalid.invalid.invalid',Origin:'https://evil.test'}]) { const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action:'reconcile',transactionId:'x',invoiceId:'x'})}); checks.push({status:res.status,ok:(await res.json()).ok}) }
const report={deployedAt:new Date().toISOString(),project:ref,slug,version:info.version,status:info.status,before,after,checks,scope:'server-side SePay list/reconciliation; list is sanitized and account-masked, writes re-fetch provider data; no bank posting or customer/payment test performed'}
await writeFile(new URL('../qa/sepay-backend-deployment.json',import.meta.url),JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2))
