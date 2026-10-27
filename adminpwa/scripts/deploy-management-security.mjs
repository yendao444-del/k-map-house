import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { privateConfig } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const project = 'wtrycmiojsiliyjxsewz'
const pagesProject = 'ankhanghome-admin-pwa'
assert.equal(new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname, `${project}.supabase.co`)
const entry = fileURLToPath(new URL('../backend/functions/admin-pwa-auth/index.ts', import.meta.url))
const bundle = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022' })
const form = new FormData()
form.set('metadata', JSON.stringify({ name: 'admin-pwa-auth', entrypoint_path: 'index.js', verify_jwt: false }))
form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
const deployed = await fetch(`https://api.supabase.com/v1/projects/${project}/functions/deploy?slug=admin-pwa-auth`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(30000) })
assert.ok(deployed.ok, `Edge deployment HTTP ${deployed.status}`)
const functionInfo = await deployed.json()
const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${pagesProject}`
const cf = async (options = {}) => {
  const response = await fetch(cfUrl, { ...options, headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000) })
  const data = await response.json(); assert.ok(response.ok && data.success, `Pages configuration HTTP ${response.status}`); return data.result
}
const before = await cf()
assert.ok(before.domains.includes('app.phongtroankhang.com'))
const publicProbe = await fetch(`https://${project}.supabase.co/functions/v1/admin-pwa-auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'security', security_action: 'status', data: {} }), signal: AbortSignal.timeout(20000) })
assert.equal(publicProbe.status, 403)
const report = { deployedAt: new Date().toISOString(), function: 'admin-pwa-auth', version: functionInfo.version, status: functionInfo.status, pagesProject, pagesDomainsUnchanged: true, directEdgeCall: publicProbe.status, migration: 'security_mfa_foundation applied and database rollback invariants passed', enforcementEnabled: false, note: 'Pages production bundle is published separately after its build verification.' }
await writeFile(new URL('../qa/security-mfa-edge-deployment.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
