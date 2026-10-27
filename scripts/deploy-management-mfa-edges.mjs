import assert from 'node:assert/strict'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref, 'wtrycmiojsiliyjxsewz')
const existing = await management(env, '/functions')
const deployed = []
for (const [slug, entry] of [
  ['admin-pwa-sepay', '../adminpwa/backend/functions/admin-pwa-sepay/index.ts'],
  ['admin-sepay-bridge', '../supabase/functions/admin-sepay-bridge/index.ts'],
  ['send-email-notification', '../supabase/functions/send-email-notification/index.ts'],
  ['tenant-web-admin', '../webmobile/cloud/tenant-admin-edge.mjs'],
  ['contract-confirmation', '../webmobile/cloud/contract-confirmation-edge.mjs']
]) {
  if (process.argv.includes('--tenant-admin-only') && !['tenant-web-admin', 'contract-confirmation'].includes(slug)) continue
  const bundle = await build({ entryPoints: [fileURLToPath(new URL(entry, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['https://*', 'http://*'], jsx: 'automatic', alias: { 'react-dom/server': 'react-dom/server.browser' }, define: { 'process.env.NODE_ENV': '"production"' } })
  const prior = existing.find(item => item.slug === slug || item.name === slug)
  assert.ok(prior, 'Existing function required: ' + slug)
  const form = new FormData()
  form.set('metadata', JSON.stringify({ name: slug, entrypoint_path: 'index.js', verify_jwt: prior.verify_jwt ?? false }))
  form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${slug}`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(60000) })
  assert.ok(response.ok, `Deploy ${slug} HTTP ${response.status}`)
  const info = await response.json()
  deployed.push({ slug, version: info.version, status: info.status })
  console.log('Deployed MFA guard: ' + slug)
}
const report = { at: new Date().toISOString(), deployed, customerDataChanged: false, emailsSentByDeployment: false }
await writeFile(new URL(`../docs/security/qa/mfa-${process.argv.includes('--tenant-admin-only') ? 'tenant-admin-' : ''}edge-deployment-2026-10-10.json`, import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
