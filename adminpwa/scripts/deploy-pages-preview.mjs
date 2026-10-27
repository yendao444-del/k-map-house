import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateConfig } from '../../webmobile/scripts/private-config.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)), env=await privateConfig(), project='ankhanghome-admin-pwa'
assert.ok(env.CLOUDFLARE_API_TOKEN&&env.CLOUDFLARE_ACCOUNT_ID,'Missing Cloudflare deployment credential.')
const api=`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`
async function cf(url,options={}) { const res=await fetch(url,{...options,headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(30000)}); const data=await res.json().catch(()=>null); if(!data?.success&&res.status!==404) throw new Error(`Cloudflare HTTP ${res.status}`); return {res,data} }
const current=await cf(`${api}/${project}`)
if(current.res.status===404||!current.data?.success) { const created=await cf(api,{method:'POST',body:JSON.stringify({name:project,production_branch:'main'})}); assert.ok(created.data?.success,'Pages project creation failed.') }
const childEnv={...process.env,VITE_PWA_ORIGIN:'https://app.phongtroankhang.com',NODE_USE_SYSTEM_CA:'1'}
await new Promise((resolve,reject)=>{const proc=spawn(process.execPath,[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),'run','build'],{cwd:root,env:childEnv,stdio:'inherit',windowsHide:true});proc.on('error',reject);proc.on('exit',code=>code===0?resolve():reject(new Error(`build exit ${code}`)))})
const wrangler=path.join(root,'..','webmobile','node_modules','wrangler','bin','wrangler.js')
await new Promise((resolve,reject)=>{const proc=spawn(process.execPath,[wrangler,'pages','deploy','dist','--project-name',project,'--branch','main','--commit-dirty=true'],{cwd:root,env:{...childEnv,CLOUDFLARE_API_TOKEN:env.CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID:env.CLOUDFLARE_ACCOUNT_ID,WRANGLER_SEND_METRICS:'false'},stdio:'inherit',windowsHide:true});proc.on('error',reject);proc.on('exit',code=>code===0?resolve():reject(new Error(`Pages deploy exit ${code}`)))})
const target=`https://${project}.pages.dev`, releaseId=Date.now()
const localHtml=await readFile(path.join(root,'dist','index.html'),'utf8')
const entry=localHtml.match(/src="([^" ]+\.js)"/)?.[1]
assert.ok(entry&&localHtml.includes('AN KHANG HOME'),'Built PWA entry is missing.')
const home=await fetch(`${target}/?qa=release-${releaseId}`,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)})
const html=await home.text(); assert.ok(home.ok&&html.includes('AN KHANG HOME'),'Preview did not serve the PWA shell.')
const checks=[]; const response=await fetch(`${target}${entry}?qa=release-${releaseId}`,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)}); checks.push({url:target,status:home.status,entry,assetStatus:response.status,contentType:response.headers.get('content-type')}); assert.ok(response.ok)
const domains=(await cf(`${api}/${project}/domains`)).data?.result||[]
const customDomains=domains.map(item=>({name:item.name,status:item.status,validation:item.validation_data?.status}))
const report={deployedAt:new Date().toISOString(),project,url:target,entry,checks,customDomains,customDomainAttached:customDomains.some(item=>item.name==='app.phongtroankhang.com'&&item.status==='active'),dnsNote:customDomains.some(item=>item.name==='app.phongtroankhang.com'&&item.status==='active')?'app.phongtroankhang.com is active on this Pages project.':'app.phongtroankhang.com is pending the scoped CNAME record in Cloudflare.',scope:'PWA frontend only; pay/root/www and Electron untouched'}
await writeFile(new URL('../qa/pages-preview-deployment.json',import.meta.url),JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2))
