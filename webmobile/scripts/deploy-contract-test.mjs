import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { root, privateConfig } from './private-config.mjs'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
const env = await contractTestConfig(), shared = await privateConfig()
const project = 'ankhanghome-contract-test'
env.CONTRACT_PUBLIC_URL = `https://${project}.pages.dev`
env.CONTRACT_GATEWAY_SECRET ||= randomBytes(32).toString('hex')
env.WEBMOBILE_GATEWAY_SECRET ||= randomBytes(32).toString('hex')
env.VITE_CONTRACT_CONFIRMATION_API_URL = `${env.SUPABASE_URL}/functions/v1/contract-confirmation`
const secrets = Object.entries(env).filter(([key]) => key.startsWith('CONTRACT_') && !key.includes('ADMIN_') || key === 'WEBMOBILE_GATEWAY_SECRET').map(([name,value]) => ({ name,value }))
await testManagement(env, '/secrets', secrets)
for (const [slug, entry] of [['contract-confirmation','contract-confirmation-edge.mjs'],['contract-test-auth','contract-test-auth-edge.mjs'],['tenant-web-admin','tenant-admin-edge.mjs']]) {
  const bundle = await build({ entryPoints: [path.join(root,'cloud',entry)], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', jsx: 'automatic', alias: { 'react-dom/server':'react-dom/server.browser' }, define: { 'process.env.NODE_ENV': '"production"' } })
  const form = new FormData()
  form.set('metadata', JSON.stringify({ name: slug, entrypoint_path: 'index.js', verify_jwt: false }))
  form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
  const result = await fetch(`https://api.supabase.com/v1/projects/${env.CONTRACT_TEST_PROJECT_REF}/functions/deploy?slug=${slug}`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(30000) })
  if (!result.ok) throw new Error(`TEST edge deployment ${slug} ${result.status}: ${(await result.text()).slice(0,200)}`)
}
const cf = `https://api.cloudflare.com/client/v4/accounts/${shared.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${project}`
async function cloudflare(url, data, method = 'GET') {
  const result = await fetch(url,{method,headers:{Authorization:`Bearer ${shared.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})})
  const json = await result.json()
  if (!json.success && result.status!==404) throw new Error(`Cloudflare TEST ${result.status}: ${JSON.stringify(json.errors?.map(x=>x.message))}`)
  return json
}
let current = await cloudflare(cf)
if (!current.success) current = await cloudflare(cf.slice(0,cf.lastIndexOf('/')), { name:project,production_branch:'main' }, 'POST')
const configs = {...current.result.deployment_configs}
for (const name of ['production','preview']) configs[name] = { ...configs[name], env_vars: { ...configs[name]?.env_vars,
  CONTRACT_EDGE_URL:{type:'plain_text',value:env.VITE_CONTRACT_CONFIRMATION_API_URL}, CONTRACT_GATEWAY_SECRET:{type:'secret_text',value:env.CONTRACT_GATEWAY_SECRET},
  WEBMOBILE_EDGE_URL:{type:'plain_text',value:`${env.SUPABASE_URL}/functions/v1/contract-test-auth`}, WEBMOBILE_GATEWAY_SECRET:{type:'secret_text',value:env.WEBMOBILE_GATEWAY_SECRET}
} }
await cloudflare(cf,{deployment_configs:configs},'PATCH')
await writeFile(path.join(root,'.env.contract-test.local'),Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n')
async function run(args) {
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,...env,CLOUDFLARE_API_TOKEN:shared.CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID:shared.CLOUDFLARE_ACCOUNT_ID,NODE_USE_SYSTEM_CA:'1',WRANGLER_SEND_METRICS:'false'},stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`TEST deploy command ${code}`)))})
}
await run([path.join(root,'node_modules/vite/bin/vite.js'),'build','--mode','contract-test','--outDir','dist-contract-test'])
await run([path.join(root,'scripts/check-public-build.mjs'),'dist-contract-test'])
await run([path.join(root,'node_modules/wrangler/bin/wrangler.js'),'pages','deploy','dist-contract-test','--project-name',project,'--branch','main','--commit-dirty=true'])
console.log(`Contract TEST website deployed: ${env.CONTRACT_PUBLIC_URL}`)
