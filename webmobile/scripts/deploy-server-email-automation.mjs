import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { privateConfig, management } from './private-config.mjs'

const env = await privateConfig()
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref,'wtrycmiojsiliyjxsewz')
const evidence = JSON.parse(await readFile('docs/email-automation/database-test.json','utf8'))
assert.equal(evidence.passed,true)
assert.equal(evidence.project,'gsianbstkmyutnhromwc')
const query = sql => management(env,'/database/query',{query:sql})
const counts = async () => (await query(`select jsonb_build_object('invoices',(select count(*) from invoices),'payments',(select count(*) from payment_events),'rooms',(select count(*) from rooms),'contracts',(select count(*) from contracts)) counts`))[0].counts
const before = await counts()
for(const file of ['20261009010000_server_email_automation.sql','20261009011000_email_automation_schedule.sql']) {
  await query(await readFile('supabase/migrations/'+file,'utf8'))
}
for(const slug of ['email-automation','sepay-webhook','send-email-notification']) {
  const bundle = await build({entryPoints:[`supabase/functions/${slug}/index.ts`],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['https://*','http://*']})
  const form = new FormData()
  form.set('metadata',JSON.stringify({name:slug,entrypoint_path:'index.js',verify_jwt:false}))
  form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(60000)})
  assert.ok(response.ok,`Deploy ${slug}: HTTP ${response.status}`)
  console.log('Deployed '+slug)
}
const after = await counts()
assert.deepEqual(after,before,'Business row counts changed during deployment')
const names = (await management(env,'/secrets')).map(s=>s.name)
const required = ['RESEND_API_KEY','MAIL_FROM','EMAIL_AUTOMATION_SECRET','SEPAY_WEBHOOK_API_KEY']
for(const name of required)assert.ok(names.includes(name),`Missing secret ${name}`)
const [vault] = await query(`select decrypted_secret from vault.decrypted_secrets where name='EMAIL_AUTOMATION_SECRET' order by created_at desc limit 1`)
assert.ok(vault?.decrypted_secret,'Missing schedule secret')
await query(`begin; select set_config('request.jwt.claims','{"role":"service_role"}',true); select install_email_automation_schedule(); commit;`)
const response = await fetch(`${env.SUPABASE_URL}/functions/v1/email-automation`,{method:'POST',headers:{Authorization:`Bearer ${vault.decrypted_secret}`,'Content-Type':'application/json'},body:JSON.stringify({action:'status'})})
const status = await response.json()
assert.ok(response.ok&&status.ok&&status.configured,'Worker is not configured')
await mkdir('docs/email-automation',{recursive:true})
await writeFile('docs/email-automation/production-deployment.json',JSON.stringify({at:new Date().toISOString(),project:ref,before,after,secrets:required,status,emailsSentByDeployment:false},null,2)+'\n')
console.log('Deployment verified; configured server and schedule; business rows unchanged.')
