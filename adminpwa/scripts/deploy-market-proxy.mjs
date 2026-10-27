// Only the isolated, read-only PWA NAV function is in scope. Never redeploy
// shared contract, payment, email or tenant-portal functions from this script.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'

const env = await privateConfig()
assert.ok(env.SUPABASE_ACCESS_TOKEN, 'Missing private deployment credential.')
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const project = new URL(supabaseUrl).hostname.split('.')[0]
assert.equal(project, 'wtrycmiojsiliyjxsewz', 'Unexpected shared backend; deployment stopped.')
const slug = 'admin-pwa-market'
const before = await management(env, '/functions')
const unrelated = functions => functions.filter(item => item.slug !== slug && item.name !== slug).map(item => ({ id: item.id, name: item.name, version: item.version, status: item.status })).sort((a, b) => a.name.localeCompare(b.name))
const bundle = await build({ entryPoints: [fileURLToPath(new URL(`../backend/functions/${slug}/index.ts`, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022' })
const form = new FormData()
// Gateway verification is disabled because the handler validates with Auth
// and the exact active management profile on every call, including cache hits.
form.set('metadata', JSON.stringify({ name: slug, entrypoint_path: 'index.js', verify_jwt: false }))
form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/functions/deploy?slug=${slug}`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(30000) })
assert.ok(response.ok, `Isolated function deployment returned HTTP ${response.status}`)
const deployed = await response.json()
const after = await management(env, '/functions')
assert.deepEqual(unrelated(after), unrelated(before), 'An unrelated function changed concurrently; inspect before proceeding.')
const checks = []
for (const headers of [{}, { Authorization: 'Bearer invalid-header.invalid-payload.invalid-signature' }, { Origin: 'https://untrusted.invalid' }]) {
  const result = await fetch(`${supabaseUrl}/functions/v1/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action: 'fund-nav', symbol: 'VFF' }), signal: AbortSignal.timeout(20000) })
  const payload = await result.json()
  assert.equal(result.status, headers.Origin ? 403 : 401)
  assert.equal(payload.ok, false)
  assert.equal(payload.data, undefined)
  checks.push({ case: headers.Origin ? 'untrusted-origin' : headers.Authorization ? 'invalid-session' : 'anonymous', status: result.status, rejected: true })
}
const parser = await build({ entryPoints: [fileURLToPath(new URL(`../backend/functions/${slug}/fund-nav.ts`, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' })
const { parseFmarketNav, funds } = await import(`data:text/javascript;base64,${Buffer.from(parser.outputFiles[0].text).toString('base64')}`)
const upstream = []
for (const symbol of funds) {
  try {
    const source = await fetch(`https://fmarket.vn/quy/${symbol}`, { signal: AbortSignal.timeout(12000) })
    assert.ok(source.ok, `Source HTTP ${source.status}`)
    const quote = parseFmarketNav(await source.text(), symbol)
    upstream.push({ symbol, ok: true, ...quote })
  } catch {
    upstream.push({ symbol, ok: false, fallback: 'Require actual published NAV; never simulate a price.' })
  }
}
const report = { verifiedAt: new Date().toISOString(), project, slug, version: deployed.version, status: deployed.status, checks, upstream, unrelatedFunctionsUnchanged: true, limitations: ['Authorized HTTP management-session quote remains unverified.', 'No emails, money transfers, frontend publication or DNS mutations were performed.'] }
await writeFile(new URL('../qa/market-proxy-deployment.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
