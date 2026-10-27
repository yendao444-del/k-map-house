import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { management, privateConfig } from '../webmobile/scripts/private-config.mjs'

const env = await privateConfig()
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref, 'wtrycmiojsiliyjxsewz')

const evidence = JSON.parse(await readFile('docs/email-automation/database-test.json', 'utf8'))
assert.equal(evidence.project, 'gsianbstkmyutnhromwc')
assert.equal(evidence.passed, true)

const migration = await readFile('supabase/migrations/20261010123000_email_delivery_reliability.sql', 'utf8')
const query = (sql) => management(env, '/database/query', { query: sql })
const counts = async () =>
  (await query(`select jsonb_build_object(
    'rooms',(select count(*) from rooms),
    'tenants',(select count(*) from tenants),
    'contracts',(select count(*) from contracts),
    'invoices',(select count(*) from invoices),
    'payments',(select count(*) from payment_events),
    'tenantReceipts',(select count(*) from tenant_payment_receipts),
    'tenantMonthlyEmails',(select count(*) from tenant_payment_emails)
  ) counts`))[0].counts

const deploy = async (slug) => {
  const bundle = await build({
    entryPoints: [`supabase/functions/${slug}/index.ts`],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['https://*', 'http://*']
  })
  const form = new FormData()
  form.set('metadata', JSON.stringify({ name: slug, entrypoint_path: 'index.js', verify_jwt: false }))
  form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
    body: form,
    signal: AbortSignal.timeout(60_000)
  })
  if (!response.ok) throw new Error(`${slug} deployment failed: HTTP ${response.status} ${await response.text()}`)
  return { slug, sha256: createHash('sha256').update(bundle.outputFiles[0].text).digest('hex') }
}

const before = await counts()
await query(migration)
const deployed = []
for (const slug of ['email-automation', 'admin-pwa-bridge']) deployed.push(await deploy(slug))
const after = await counts()
assert.deepEqual(after, before, 'Migration changed business rows')

const [checks] = await query(`select jsonb_build_object(
  'monthlyAttemptColumns',(
    select count(*)=2 from information_schema.columns
    where table_schema='public' and table_name='tenant_payment_emails'
      and column_name in ('first_attempt_at','last_attempt_at')
  ),
  'historyFunction',(select to_regprocedure('public.email_delivery_history(integer)') is not null),
  'anonHistory',(select has_function_privilege('anon','public.email_delivery_history(integer)','EXECUTE')),
  'authenticatedHistory',(select has_function_privilege('authenticated','public.email_delivery_history(integer)','EXECUTE')),
  'anonRequeue',(select has_function_privilege('anon','public.release_blocked_tenant_payment_receipts()','EXECUTE')),
  'serviceRequeue',(select has_function_privilege('service_role','public.release_blocked_tenant_payment_receipts()','EXECUTE'))
) checks`)
assert.equal(checks.checks.monthlyAttemptColumns, true)
assert.equal(checks.checks.historyFunction, true)
assert.equal(checks.checks.anonHistory, false)
assert.equal(checks.checks.authenticatedHistory, true)
assert.equal(checks.checks.anonRequeue, false)
assert.equal(checks.checks.serviceRequeue, true)

const names = (await management(env, '/functions')).map((item) => item.name)
for (const slug of ['email-automation', 'admin-pwa-bridge']) assert.ok(names.includes(slug), `${slug} is missing`)
const secretNames = (await management(env, '/secrets')).map((item) => item.name)
for (const name of ['RESEND_API_KEY', 'MAIL_FROM', 'EMAIL_AUTOMATION_SECRET']) assert.ok(secretNames.includes(name), `Missing ${name}`)

const [vault] = await query(`select decrypted_secret from vault.decrypted_secrets where name='EMAIL_AUTOMATION_SECRET' order by created_at desc limit 1`)
assert.ok(vault?.decrypted_secret)
const worker = await fetch(`${env.SUPABASE_URL}/functions/v1/email-automation`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${vault.decrypted_secret}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'status' }),
  signal: AbortSignal.timeout(15_000)
})
const workerStatus = await worker.json()
assert.ok(worker.ok && workerStatus.ok && workerStatus.configured)

await mkdir('docs/email-automation', { recursive: true })
await writeFile('docs/email-automation/production-reliability-deployment.json', JSON.stringify({
  at: new Date().toISOString(),
  project: ref,
  migrationSha256: createHash('sha256').update(migration).digest('hex'),
  deployed,
  before,
  after,
  checks: checks.checks,
  workerStatus,
  businessRowsUnchanged: true,
  workerInvoked: false,
  emailSentByDeployment: false
}, null, 2) + '\n')
console.log('Reliability migration and Edge Functions deployed; business rows unchanged; no delivery worker run.')
