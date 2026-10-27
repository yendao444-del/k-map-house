import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from './private-config.mjs'

const env = await privateConfig()
const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const ref = new URL(base).hostname.split('.')[0]
assert.equal(ref, 'wtrycmiojsiliyjxsewz')
const query = sql => management(env, '/database/query', { query: sql })
const [access] = await query(`select
 has_table_privilege('authenticated','vault.decrypted_secrets','SELECT') authenticated_vault,
 has_table_privilege('anon','vault.decrypted_secrets','SELECT') anon_vault,
 has_table_privilege('authenticated','net.http_request_queue','SELECT') authenticated_queue,
 has_table_privilege('anon','net.http_request_queue','SELECT') anon_queue,
 has_table_privilege('authenticated','cron.job','SELECT') authenticated_cron,
 has_table_privilege('anon','cron.job','SELECT') anon_cron`)
assert.equal(access.authenticated_vault, false)
assert.equal(access.anon_vault, false)
const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
assert.ok(anon)
const apiBoundary = []
for (const [schema, table] of [['net', 'http_request_queue'], ['net', '_http_response'], ['cron', 'job'], ['cron', 'job_run_details'], ['vault', 'decrypted_secrets']]) {
  const response = await fetch(`${base}/rest/v1/${table}`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Accept-Profile': schema },
    signal: AbortSignal.timeout(15000)
  })
  const result = await response.json()
  assert.equal(response.status, 406, `${schema}.${table} must not be exposed`)
  assert.equal(result.code, 'PGRST106')
  apiBoundary.push({ schema, table, status: response.status, code: result.code })
}
const [health] = await query(`select jsonb_build_object(
 'enabled',enabled,'sepayEnabled',sepay_enabled,'workerAt',last_worker_at,
 'pollAt',last_poll_at,'pollError',last_poll_error,'reminderHour',reminder_hour,
 'repeatDays',repeat_days,'dailyLimit',daily_limit,
 'cronActive',(select active from cron.job where jobname='ankhang-email-automation'),
 'lastCronRun',(select jsonb_build_object('start',start_time,'end',end_time,'status',status)
   from cron.job_run_details where jobid=(select jobid from cron.job where jobname='ankhang-email-automation') order by start_time desc limit 1),
 'lastHttpResponse',(select jsonb_build_object('status',status_code,'created',created,'timedOut',timed_out)
   from net._http_response where status_code is not null order by created desc limit 1)
 ) health from public.email_automation_settings where id=true`)
assert.ok(health.health.enabled && health.health.sepayEnabled && health.health.cronActive)
assert.equal(health.health.lastCronRun.status, 'succeeded')
assert.equal(health.health.pollError, null)
assert.ok(Date.now() - Date.parse(health.health.workerAt) < 6 * 60000, 'Worker heartbeat is stale')
assert.ok(Date.now() - Date.parse(health.health.pollAt) < 6 * 60000, 'SePay heartbeat is stale')
const [vault] = await query(`select decrypted_secret from vault.decrypted_secrets where name='EMAIL_AUTOMATION_SECRET' order by created_at desc limit 1`)
assert.ok(vault?.decrypted_secret)
const response = await fetch(`${base}/functions/v1/email-automation`, {
  method: 'POST', headers: { Authorization: `Bearer ${vault.decrypted_secret}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'status' }), signal: AbortSignal.timeout(15000)
})
const status = await response.json()
assert.ok(response.ok && status.ok && status.configured)
const at = new Date().toISOString()
await writeFile('docs/email-automation/scheduler-access.json', JSON.stringify({
  at, project: ref, passed: true, access, apiBoundary,
  note: 'Supabase extension tables retain owner-managed PUBLIC grants; net, cron and vault are not exposed by PostgREST. This verifies the application API boundary, not removal of platform-owned SQL grants.'
}, null, 2) + '\n')
await writeFile('docs/email-automation/server-health.json', JSON.stringify({ at, project: ref, ...health.health, workerStatus: status }, null, 2) + '\n')
console.log('Verified: internal schemas denied over API; Vault server-only; scheduled worker and SePay healthy; provider configured.')
