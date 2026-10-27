import assert from 'node:assert/strict'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'

assert.ok(process.argv.includes('--production'), 'Pass --production to publish the validated SePay read-session fix.')
const env = await privateConfig()
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref, 'wtrycmiojsiliyjxsewz')
const existing = await management(env, '/functions')
const deployed = []
for (const [slug, entry, action] of [
  ['admin-sepay-bridge', '../supabase/functions/admin-sepay-bridge/index.ts', 'sepay_status'],
  ['admin-pwa-sepay', '../adminpwa/backend/functions/admin-pwa-sepay/index.ts', 'list']
]) {
  const prior = existing.find(item => item.slug === slug || item.name === slug)
  assert.ok(prior, 'Existing function required: ' + slug)
  const bundle = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['https://*', 'http://*'] })
  const form = new FormData()
  form.set('metadata', JSON.stringify({ name: slug, entrypoint_path: 'index.js', verify_jwt: prior.verify_jwt }))
  form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(60000) })
  assert.ok(response.ok, `Deploy ${slug} HTTP ${response.status}`)
  const info = await response.json()
  const denied = await fetch(`${env.SUPABASE_URL}/functions/v1/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }), signal: AbortSignal.timeout(15000) })
  assert.equal(denied.status, 401, `Anonymous ${slug} must stay denied`)
  deployed.push({ slug, priorVersion: prior.version, version: info.version, status: info.status, verifyJwt: prior.verify_jwt, anonymousStatus: denied.status })
  console.log('Published SePay session fix: ' + slug)
}
const report = { at: new Date().toISOString(), deployed, scope: 'Read-only SePay operations require a fully authorized live AAL2 session; writes retain recent MFA. No migrations or business API actions executed.', customerDataChanged: false, emailsSent: false }
await writeFile(new URL('../docs/security/qa/sepay-read-session-deployment-2026-10-11.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
