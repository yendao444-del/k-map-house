import assert from 'node:assert/strict'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
assert.ok(process.argv.includes('--production'), 'Use --production for the scoped password confirmation release.')
const env=await privateConfig(), ref=new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref,'wtrycmiojsiliyjxsewz')
const existing=await management(env,'/functions'), deployed=[]
for (const [slug,entry,body,status] of [
  ['admin-pwa-auth','../adminpwa/backend/functions/admin-pwa-auth/index.ts',{action:'security',security_action:'password_confirm',data:{password:'invalid-probe'}},403],
  ['admin-sepay-bridge','../supabase/functions/admin-sepay-bridge/index.ts',{action:'sepay_status'},401],
  ['admin-pwa-sepay','../adminpwa/backend/functions/admin-pwa-sepay/index.ts',{action:'list'},401]
]) {
  const prior=existing.find(item=>item.slug===slug||item.name===slug)
  assert.ok(prior,'Existing function required: '+slug)
  const bundle=await build({entryPoints:[fileURLToPath(new URL(entry,import.meta.url))],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['https://*','http://*']})
  const form=new FormData()
  form.set('metadata',JSON.stringify({name:slug,entrypoint_path:'index.js',verify_jwt:prior.verify_jwt}))
  form.set('file',new Blob([bundle.outputFiles[0].text],{type:'application/javascript'}),'index.js')
  const res=await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`},body:form,signal:AbortSignal.timeout(60000)})
  assert.ok(res.ok,`Deploy ${slug} HTTP ${res.status}`)
  const info=await res.json()
  const probe=await fetch(`${env.SUPABASE_URL}/functions/v1/${slug}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)})
  assert.equal(probe.status,status,`Anonymous ${slug} still denied`)
  deployed.push({slug,priorVersion:prior.version,version:info.version,status:info.status,anonymousStatus:probe.status})
  console.log('Published: '+slug)
}
const report={at:new Date().toISOString(),deployed,scope:'Password confirmation and SePay messages only; roles, Auth config and gateway secrets unchanged.',customerDataChanged:false,emailsSent:false}
await writeFile(new URL('../docs/security/qa/password-confirmation-edge-deployment-2026-10-11.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
