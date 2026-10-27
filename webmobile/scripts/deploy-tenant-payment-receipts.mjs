import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { privateConfig, management } from './private-config.mjs'

const env = await privateConfig()
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref, 'wtrycmiojsiliyjxsewz')
const migration = await readFile('supabase/migrations/20261009140000_tenant_payment_receipts.sql', 'utf8')
const evidence = JSON.parse(await readFile('docs/email-automation/tenant-receipt-database-test.json', 'utf8'))
assert.equal(evidence.project, 'gsianbstkmyutnhromwc')
assert.equal(evidence.passed, true)
assert.equal(evidence.migrationSha256, createHash('sha256').update(migration).digest('hex'))
const query = sql => management(env, '/database/query', { query: sql })
const counts = async () => (await query(`select jsonb_build_object(
 'invoices',(select count(*) from invoices),'payments',(select count(*) from payment_events),
 'rooms',(select count(*) from rooms),'contracts',(select count(*) from contracts)) counts`))[0].counts
const before = await counts()
// Build before changing the live database. Deploy only the scheduled worker.
const bundle = await build({ entryPoints: ['supabase/functions/email-automation/index.ts'], bundle: true,
  write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['https://*', 'http://*'] })
await query(migration)
const form = new FormData()
form.set('metadata', JSON.stringify({ name: 'email-automation', entrypoint_path: 'index.js', verify_jwt: false }))
form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
const deployed = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=email-automation`, {
  method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form,
  signal: AbortSignal.timeout(60000)
})
assert.ok(deployed.ok, `Worker deployment HTTP ${deployed.status}`)
const after = await counts()
assert.deepEqual(after, before, 'Business row counts changed during deployment')
const [access] = await query(`select
 has_table_privilege('authenticated','public.tenant_payment_receipts','SELECT') browser_receipts,
 has_function_privilege('anon','public.claim_tenant_payment_receipts(integer)','EXECUTE') anon_claim`)
assert.equal(access.browser_receipts, false)
assert.equal(access.anon_claim, false)
const [vault] = await query(`select decrypted_secret from vault.decrypted_secrets where name='EMAIL_AUTOMATION_SECRET' order by created_at desc limit 1`)
const response = await fetch(`${env.SUPABASE_URL}/functions/v1/email-automation`, {
  method: 'POST', headers: { Authorization: `Bearer ${vault.decrypted_secret}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'status' }), signal: AbortSignal.timeout(15000)
})
const status = await response.json()
assert.ok(response.ok && status.ok && status.configured)
const [cutover] = await query(`select started_at from public.tenant_payment_receipt_settings where id=true`)
await writeFile('docs/email-automation/tenant-receipt-deployment.json', JSON.stringify({
  at: new Date().toISOString(), project: ref, before, after, access, status, cutover,
  migrationSha256: evidence.migrationSha256, workerSha256: createHash('sha256').update(bundle.outputFiles[0].text).digest('hex'),
  businessRowsUnchanged: true, historicalReceiptsReplayed: false, testEmailSent: false
}, null, 2) + '\n')
console.log('Tenant receipt worker deployed; private queue verified; business rows unchanged; no historical replay or test email.')
