import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {build} from 'esbuild'
import path from 'node:path'
import ts from 'typescript'
import {privateConfig,management,root} from './private-config.mjs'
const env=await privateConfig(),ref=new URL(env.SUPABASE_URL).hostname.split('.')[0]
const edgeOnly=process.argv.includes('--edge-only')
assert.equal(ref,'wtrycmiojsiliyjxsewz')
for(const f of ['tenant-payment-e2e.json','tenant-payment-database.json']) {
 const proof=JSON.parse(await readFile(path.join(root,'qa',f),'utf8'))
 assert.equal(proof.project,'gsianbstkmyutnhromwc');assert.equal(proof.passed,true)
}
const query=sql=>management(env,'/database/query',{query:sql})
const counts=async()=>(await query(`select jsonb_build_object('rooms',(select count(*) from rooms),'tenants',(select count(*) from tenants),'contracts',(select count(*) from contracts),'invoices',(select count(*) from invoices),'payments',(select count(*) from payment_events),'accounts',(select count(*) from tenant_web_accounts)) counts`))[0].counts
const before=await counts()
if(!edgeOnly){
 await query(await readFile(path.join(root,'../supabase/migrations/20261009020000_tenant_monthly_payment.sql'),'utf8'))
 await query(await readFile(path.join(root,'../supabase/migrations/20261009100000_tenant_meter_manual_fallback.sql'),'utf8'))
}
const afterMigration=await counts();assert.deepEqual(afterMigration,before,'Migration changed business records')
const transfer=await readFile(path.join(root,'../src/renderer/src/lib/invoiceTransfer.ts'),'utf8')
const modal=await readFile(path.join(root,'../src/renderer/src/components/InvoiceDetailModal.tsx'),'utf8')
const ast=ts.createSourceFile('InvoiceDetailModal.tsx',modal,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX)
const words=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='numberToWords');assert.ok(words)
const helper=ts.transpileModule(`${transfer}\nexport ${words.getText(ast)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
const plugins=[{name:'electron-pure',setup(p){p.onResolve({filter:/electron-transfer-adapter\.mjs$/},()=>({path:'electron-pure',namespace:'pure'}));p.onLoad({filter:/.*/,namespace:'pure'},()=>({contents:helper,loader:'js'}));p.onResolve({filter:/^(qrcode|jpeg-js)$/},a=>({path:a.path==='qrcode'?'npm:qrcode@1.5.4':'npm:jpeg-js@0.4.4',external:true}))}}]
for(const [slug,entry] of [['webmobile-demo',path.join(root,'cloud/edge.mjs')],['email-automation',path.join(root,'../supabase/functions/email-automation/index.ts')]]) {
 if(edgeOnly&&slug!=='webmobile-demo')continue
 const bundle=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:slug==='webmobile-demo'?'node':'neutral',target:'es2022',external:['node:*','https://*','http://*'],plugins:slug==='webmobile-demo'?plugins:[]})
 const form=new FormData();form.set('metadata',JSON.stringify({name:slug,entrypoint_path:'index.js',verify_jwt:false}));form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
 const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(30000)})
 assert.ok(response.ok,`Deploy ${slug}: ${response.status}`);console.log('Deployed '+slug)
}
const after=await counts()
const cron=await query(`select jobname,active from cron.job where jobname='ankhang-email-automation'`)
assert.equal(cron[0]?.active,true,'Cloud scheduler is not active')
const healthResponse=await fetch(`${env.SUPABASE_URL}/functions/v1/webmobile-demo`,{headers:{authorization:`Bearer ${env.WEBMOBILE_GATEWAY_SECRET}`,'x-webmobile-endpoint':'health'}})
const health=await healthResponse.json();assert.ok(healthResponse.ok&&health.mode==='tenant'&&health.authRequired&&health.ocrConfigured)
const unauthorized=await fetch(`${env.SUPABASE_URL}/functions/v1/webmobile-demo`,{headers:{'x-webmobile-endpoint':'health'}});assert.equal(unauthorized.status,403)
await writeFile(path.join(root,'qa/tenant-payment-production-deployment.json'),JSON.stringify({at:new Date().toISOString(),project:ref,edgeOnly,before,afterMigration,after,health,scheduler:cron[0],providerSecretsChanged:false,productionTestInvoicesCreated:false,realPaymentsMade:false},null,2)+'\n')
console.log(edgeOnly?'Tenant payment edge deployed; existing schema and mail worker preserved.':'Tenant payment backend/schema/cloud mail worker deployed; no business rows changed by migration; scheduler and Gemini configured.')
