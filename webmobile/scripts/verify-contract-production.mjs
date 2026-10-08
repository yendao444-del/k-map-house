import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root, privateConfig, management } from './private-config.mjs'
const env=await privateConfig()
const cfUrl=`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/ankhanghome-payment`
let r=await fetch(cfUrl,{headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`}}),json=await r.json()
assert.equal(json.success,true)
console.log(JSON.stringify({configs:Object.fromEntries(Object.entries(json.result.deployment_configs).map(([name,c])=>[name,Object.fromEntries(Object.entries(c.env_vars||{}).map(([key,v])=>[key,{type:v.type,hasValue:!!v.value}]))]))}))
console.log(JSON.stringify({functions:(await management(env,'/functions')).map(x=>({name:x.name,status:x.status,verifyJwt:x.verify_jwt}))}))
const results=[]
for(const [url,options,expected] of [
 ['https://pay.phongtroankhang.com/contract-confirmation',{},200],
 ['https://pay.phongtroankhang.com/api/contract-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'view',token:'invalid'})},410],
 ['https://pay.phongtroankhang.com/api/contract-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'history',draftId:'00000000-0000-4000-8000-000000000001'})},400],
 [`${env.SUPABASE_URL}/functions/v1/contract-confirmation/availability`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'availability'})},401],
 [`${env.SUPABASE_URL}/rest/v1/rpc/contract_confirmation_accept`,{method:'POST',headers:{'Content-Type':'application/json',apikey:env.VITE_SUPABASE_ANON_KEY},body:JSON.stringify({p_hash:'0'.repeat(64)})},401]
]) {
 const response=await fetch(url,options),text=await response.text()
 assert.equal(response.status,expected,text.slice(0,150))
 results.push({url,status:response.status})
}
await writeFile(path.join(root,'qa/contract-production-verification.json'),JSON.stringify({at:new Date().toISOString(),checks:results,wroteBusinessData:false,sentEmail:false},null,2)+'\n')
console.log('Production public route, gateway, admin authentication and RPC isolation checks passed. No business data written.')
