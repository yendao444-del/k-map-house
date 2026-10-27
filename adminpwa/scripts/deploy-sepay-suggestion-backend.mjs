import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref, 'wtrycmiojsiliyjxsewz')
const existing = await management(env, '/functions')
const prior = existing.find((item) => item.slug === 'admin-pwa-sepay' || item.name === 'admin-pwa-sepay')
assert.ok(prior)
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../backend/functions/admin-pwa-sepay/index.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', external: ['https://*', 'http://*'] })
const form = new FormData()
form.set('metadata', JSON.stringify({ name: 'admin-pwa-sepay', entrypoint_path: 'index.js', verify_jwt: prior.verify_jwt }))
form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=admin-pwa-sepay`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(60000) })
const responseText = await response.text()
assert.ok(response.ok, `Deploy failed HTTP ${response.status}: ${responseText}`)
const info = JSON.parse(responseText)
const denied = await fetch(`${env.SUPABASE_URL}/functions/v1/admin-pwa-sepay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list' }) })
assert.equal(denied.status, 401)
console.log(JSON.stringify({ slug: 'admin-pwa-sepay', priorVersion: prior.version, version: info.version, verifyJwt: prior.verify_jwt, anonymousStatus: denied.status }))
