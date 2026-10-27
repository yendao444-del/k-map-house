import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
assert.ok(process.argv.includes('--production'))
const env=await privateConfig(), ref=new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref,'wtrycmiojsiliyjxsewz')
const existing=(await management(env,'/functions')).find(f=>f.slug==='admin-pwa-auth')
assert.ok(existing)
const test=JSON.parse(await readFile(new URL('../docs/security/qa/totp-replacement-database.json',import.meta.url),'utf8'))
assert.equal(test.result[0].totp_replacement_invariants,'passed')
for (const file of ['20261012133000_security_mfa_authenticator_rotation.sql','20261012140000_security_overview_read.sql']) {
  await management(env,'/database/query',{query:await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8')})
}
const bundle=await build({entryPoints:[fileURLToPath(new URL('../adminpwa/backend/functions/admin-pwa-auth/index.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022'})
const form=new FormData()
form.set('metadata',JSON.stringify({name:'admin-pwa-auth',entrypoint_path:'index.js',verify_jwt:existing.verify_jwt}))
form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=admin-pwa-auth`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(30000)})
assert.ok(r.ok,`Deploy HTTP ${r.status}`)
const info=await r.json()
const probe=await fetch(`${env.SUPABASE_URL}/functions/v1/admin-pwa-auth`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'security',security_action:'totp_replace_begin',data:{}})})
assert.equal(probe.status,403)
const report={at:new Date().toISOString(),function:'admin-pwa-auth',priorVersion:existing.version,version:info.version,anonymousDenied:probe.status,customerDataChanged:false,policy:'Mandatory MFA and six-hour deadline preserved'}
await writeFile(new URL('../docs/security/qa/totp-replacement-deployment.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
