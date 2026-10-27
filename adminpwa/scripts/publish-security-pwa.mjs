import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { privateConfig } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const production = process.argv.includes('--production')
const project = 'ankhanghome-admin-pwa'
const root = fileURLToPath(new URL('../', import.meta.url))
const version = JSON.parse(await readFile(new URL('../dist/version.json', import.meta.url), 'utf8'))
const api = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${project}`
async function cf(path='') {
  const r = await fetch(api+path, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(20000) })
  const data = await r.json(); assert.ok(r.ok && data.success, `Pages read HTTP ${r.status}`); return data.result
}
const before = await cf()
assert.ok(before.domains.includes('app.phongtroankhang.com'))
const executable = fileURLToPath(new URL('../../webmobile/node_modules/wrangler/bin/wrangler.js', import.meta.url))
await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[executable,'pages','deploy','dist','--project-name',project,'--branch',production?'main':'codex/security-fix','--commit-dirty=true'],{cwd:root,env:{...process.env,CLOUDFLARE_API_TOKEN:env.CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID:env.CLOUDFLARE_ACCOUNT_ID,WRANGLER_SEND_METRICS:'false',NODE_USE_SYSTEM_CA:'1'},windowsHide:true,stdio:'inherit'})
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Pages publish exit ${code}`)))
})
const after = await cf()
const deployments = await cf('/deployments')
const deployment = deployments.find(d=>d.environment===(production?'production':'preview') && d.deployment_trigger?.metadata?.branch===(production?'main':'codex/security-fix'))
assert.ok(deployment, 'Could not identify the published deployment')
const url = production?'https://app.phongtroankhang.com':deployment.url
let remote
for(let attempt=0;attempt<5;attempt++){
  const r=await fetch(url+'/version.json?verify='+Date.now(),{signal:AbortSignal.timeout(20000)});remote=await r.json();if(remote.buildId===version.buildId)break;await new Promise(resolve=>setTimeout(resolve,2000))
}
assert.equal(remote.buildId,version.buildId,'Published build differs from validated dist')
const report={publishedAt:new Date().toISOString(),environment:production?'production':'preview',project,url,deploymentId:deployment.id,priorProductionDeployment:before.canonical_deployment?.id,buildId:version.buildId,productionDeployment:after.canonical_deployment?.id}
await writeFile(new URL(`../qa/security-pages-${production?'production':'preview'}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
