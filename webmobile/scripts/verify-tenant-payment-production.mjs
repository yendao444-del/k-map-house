import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import {privateConfig,management,root} from './private-config.mjs'
const env=await privateConfig(),origin='https://pay.phongtroankhang.com'
const healthResponse=await fetch(origin+'/api/health');assert.ok(healthResponse.ok)
const health=await healthResponse.json();assert.deepEqual(Object.keys(health).sort(),['backend','ocrConfigured','ok']);assert.equal(health.ok,true);assert.equal(health.backend,'online');assert.equal(health.ocrConfigured,true)
const unauthorized=await fetch(origin+'/api/tenant-payments',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:'{"action":"state"}'})
assert.equal(unauthorized.status,401)
const csrf=await fetch(origin+'/api/tenant-payments',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://foreign.invalid'},body:'{"action":"create"}'})
assert.equal(csrf.status,403)
const query=sql=>management(env,'/database/query',{query:sql})
const permissions=(await query(`select has_function_privilege('anon','public.tenant_payment_state(uuid,text)','execute') anon_rpc,
 has_function_privilege('authenticated','public.tenant_payment_write(uuid,text,uuid,text,jsonb)','execute') browser_write,
 has_table_privilege('anon','public.tenant_meter_photos','select') public_photo,
 has_table_privilege('authenticated','public.tenant_payment_cycles','update') browser_cycle`))[0]
for(const v of Object.values(permissions))assert.equal(v,false)
const worker=(await query(`select enabled,sepay_enabled,last_worker_at,last_poll_at,last_poll_error from email_automation_settings`))[0]
assert.equal(worker.enabled,true);assert.equal(worker.sepay_enabled,true);assert.equal(worker.last_poll_error,null)
const delivery=await query(`select status_code,content::jsonb->'tenantDelivery' tenant_delivery from net._http_response where content like '%tenantDelivery%' order by created desc limit 1`)
assert.equal(delivery[0]?.status_code,200,'Latest scheduled worker has not completed successfully')
assert.equal(delivery[0].tenant_delivery.configured,true)
const counts=(await query(`select count(*) cycle_count from tenant_payment_cycles`))[0]
await writeFile(path.join(root,'qa/tenant-payment-production-verification.json'),JSON.stringify({at:new Date().toISOString(),health,unauthenticatedStatus:unauthorized.status,csrfStatus:csrf.status,permissions,worker,schedulerDelivery:delivery[0],...counts},null,2)+'\n')
console.log('Public payment API/auth/CSRF/RLS verified; latest cron run successfully executed the configured tenant mail worker.')
