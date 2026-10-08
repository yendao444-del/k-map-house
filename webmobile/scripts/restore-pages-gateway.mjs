import { privateConfig } from './private-config.mjs'
const env=await privateConfig()
if(!env.CONTRACT_GATEWAY_SECRET||!env.WEBMOBILE_GATEWAY_SECRET) throw new Error('Missing gateway secrets')
const edge=await fetch(`${env.SUPABASE_URL}/functions/v1/webmobile-demo`,{method:'GET',headers:{Authorization:`Bearer ${env.WEBMOBILE_GATEWAY_SECRET}`,'x-webmobile-endpoint':'health'}})
console.log(JSON.stringify({edgeStatus:edge.status,edgeHealth:await edge.json()}))
if(!edge.ok) throw new Error('Existing webmobile secret does not authenticate the backend')
const url=`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/ankhanghome-payment`
const headers={Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'}
const current=await (await fetch(url,{headers})).json()
if(!current.success) throw new Error('Cannot inspect Pages')
const configs={...current.result.deployment_configs}
for(const name of ['production','preview']) configs[name]={...configs[name],env_vars:{...configs[name]?.env_vars,
 CONTRACT_GATEWAY_SECRET:{type:'secret_text',value:env.CONTRACT_GATEWAY_SECRET},WEBMOBILE_GATEWAY_SECRET:{type:'secret_text',value:env.WEBMOBILE_GATEWAY_SECRET}
}}
const result=await (await fetch(url,{method:'PATCH',headers,body:JSON.stringify({deployment_configs:configs})})).json()
if(!result.success) throw new Error('Cannot restore Pages gateway')
console.log('Both gateway secrets restored. Redeploy Pages to activate bindings.')
