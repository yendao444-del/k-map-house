import { cloudHandler } from './handler.mjs'
const env = Deno.env.toObject()
env.METER_CLOUD_PROVIDER = env.WEBMOBILE_CLOUD_PROVIDER
env.METER_CLOUD_MODEL = env.WEBMOBILE_CLOUD_MODEL
env.METER_CLOUD_API_KEY = env.WEBMOBILE_CLOUD_API_KEY
env.METER_CLOUD_BASE_URL = env.WEBMOBILE_CLOUD_BASE_URL
async function rpc(name, data) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(10000) })
  if (!response.ok) {
    const data=await response.json().catch(()=>null)
    const trusted=name.startsWith('tenant_')||name==='ensure_tenant_payment_cycle'
    throw Object.assign(new Error(trusted && data?.code==='P0001' ? data.message : 'state_unavailable'),trusted && data?.code==='P0001'?{status:409}:{})
  }
  return response.json()
}
Deno.serve(cloudHandler(env, rpc))
