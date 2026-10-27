import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const project = 'wtrycmiojsiliyjxsewz'
const pagesProject = 'ankhanghome-admin-pwa'
assert.equal(new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname, `${project}.supabase.co`)
const secretFile = new URL('../.env.auth-private.json', import.meta.url)
let privateAuth
try { privateAuth = JSON.parse(await readFile(secretFile, 'utf8')) }
catch (error) { if (error.code !== 'ENOENT') throw error; privateAuth = { gatewaySecret: randomBytes(32).toString('hex') }; await writeFile(secretFile, JSON.stringify(privateAuth), { mode: 0o600 }) }
assert.ok(privateAuth.gatewaySecret.length >= 32)
const migration = await readFile(new URL('../backend/migrations/20261008131000_management_auth_gateway.sql', import.meta.url), 'utf8')
const tests = await readFile(new URL('../backend/tests/auth-rate-rollback.sql', import.meta.url), 'utf8')
// Rollback test first, then apply only the additive gateway schema.
await management(env, '/database/query', { query: migration.replace(/commit;\s*$/, '') + tests.replace(/^begin;\s*/, '') })
await management(env, '/database/query', { query: migration })
await management(env, '/secrets', [{ name: 'ADMIN_PWA_AUTH_GATEWAY_SECRET', value: privateAuth.gatewaySecret }])
const slug = 'admin-pwa-auth'
const bundle = await build({ entryPoints: [fileURLToPath(new URL(`../backend/functions/${slug}/index.ts`, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022' })
const form = new FormData()
form.set('metadata', JSON.stringify({ name: slug, entrypoint_path: 'index.js', verify_jwt: false }))
form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
const deployed = await fetch(`https://api.supabase.com/v1/projects/${project}/functions/deploy?slug=${slug}`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(30000) })
assert.ok(deployed.ok, `Auth function deployment HTTP ${deployed.status}`)
const fn = await deployed.json()
const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${pagesProject}`
async function cf(options = {}) {
  const response = await fetch(cfUrl, { ...options, headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000) })
  const data = await response.json()
  assert.ok(response.ok && data.success, `Pages configuration HTTP ${response.status}`)
  return data.result
}
const before = await cf()
assert.ok(before.domains.includes('app.phongtroankhang.com'))
const deployment_configs = { ...before.deployment_configs }
for (const name of ['production','preview']) {
  deployment_configs[name] = { ...deployment_configs[name], env_vars: { ...deployment_configs[name]?.env_vars,
    ADMIN_PWA_AUTH_EDGE_URL: { type: 'plain_text', value: `https://${project}.supabase.co/functions/v1/${slug}` },
    ADMIN_PWA_AUTH_GATEWAY_SECRET: { type: 'secret_text', value: privateAuth.gatewaySecret }
  } }
}
await cf({ method: 'PATCH', body: JSON.stringify({ deployment_configs }) })
const after = await cf()
assert.deepEqual(after.domains, before.domains)
assert.equal(after.deployment_configs.production.env_vars.ADMIN_PWA_AUTH_EDGE_URL.value, `https://${project}.supabase.co/functions/v1/${slug}`)
const publicProbe = await fetch(`https://${project}.supabase.co/functions/v1/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', login: 'unknown', password: 'invalid' }), signal: AbortSignal.timeout(20000) })
assert.equal(publicProbe.status, 403)
const report = { deployedAt: new Date().toISOString(), function: slug, version: fn.version, status: fn.status, pagesProject, priorProductionDeployment: before.canonical_deployment?.id, rateRollbackTests: 'passed', directEdgeCall: publicProbe.status, scope: 'New private Auth function and dedicated PWA gateway env only; public resolver remains open until frontend verification.' }
await writeFile(new URL('../qa/security-auth-backend-deployment.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
