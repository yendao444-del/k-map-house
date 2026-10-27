import { writeFile } from 'node:fs/promises'
import { privateConfig } from '../../webmobile/scripts/private-config.mjs'
const env=await privateConfig(), project='ankhanghome-admin-pwa', domain='app.phongtroankhang.com'
const url=`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${project}/domains`
const res=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({name:domain}),signal:AbortSignal.timeout(30000)})
const data=await res.json().catch(()=>null)
const report={attemptedAt:new Date().toISOString(),project,domain,httpStatus:res.status,success:data?.success===true,result:data?.result?{name:data.result.name,status:data.result.status,validation:data.result.validation_data}:undefined,errors:data?.errors?.map(item=>({code:item.code,message:item.message})),dnsMutation:false,note:'Only Pages custom-domain attachment was attempted; no nameserver or DNS-record mutation.'}
await writeFile(new URL('../qa/pages-custom-domain-attachment.json',import.meta.url),JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2)); if(!data?.success&&res.status>=500) process.exitCode=1
