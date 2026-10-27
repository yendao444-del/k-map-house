import assert from 'node:assert/strict'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig(), ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref, 'wtrycmiojsiliyjxsewz')
const evidence = JSON.parse(await readFile('docs/security/qa/security-email-delivery-database.json', 'utf8'))
assert.equal(evidence.passed, true)
const names = (await management(env, '/secrets')).map(s => s.name)
for (const name of ['RESEND_API_KEY','MAIL_FROM','SECURITY_MAIL_FROM','RESEND_SECURITY_WEBHOOK_SECRET']) assert.ok(names.includes(name), 'Missing ' + name)
await management(env, '/database/query', { query: await readFile('supabase/migrations/20261011150000_security_email_delivery.sql', 'utf8') })
const deployed = []
for (const [slug, entry] of [['admin-pwa-auth','adminpwa/backend/functions/admin-pwa-auth/index.ts'],['resend-security-webhook','supabase/functions/resend-security-webhook/index.ts']]) {
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022' })
  const form = new FormData(); form.set('metadata', JSON.stringify({ name: slug, entrypoint_path: 'index.js', verify_jwt: false }))
  form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
  const response = await fetch('https://api.supabase.com/v1/projects/' + ref + '/functions/deploy?slug=' + slug, { method: 'POST', headers: { Authorization: 'Bearer ' + env.SUPABASE_ACCESS_TOKEN }, body: form, signal: AbortSignal.timeout(60000) })
  assert.ok(response.ok, 'Deploy ' + slug + ' HTTP ' + response.status)
  const info = await response.json(); deployed.push({ slug, version: info.version, status: info.status })
}
const report = { at: new Date().toISOString(), project: ref, deployed, securitySender: 'baomat@phongtroankhang.com', notificationSenderUnchanged: true, emailSentByDeployment: false }
await writeFile('docs/security/qa/security-email-delivery-deployment.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
