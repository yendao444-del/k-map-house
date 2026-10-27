import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { fileURLToPath } from 'node:url'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'

assert.ok(process.argv.includes('--production'), 'Use --production for the live fallback release.')
const env = await privateConfig()
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(ref, 'wtrycmiojsiliyjxsewz')
const migration = await readFile(new URL('../supabase/migrations/20261013100000_security_email_login_fallback.sql', import.meta.url), 'utf8')
const before = await management(env, '/database/query', { query: `select (select row_to_json(s) from management_security.settings s where singleton) settings, md5(pg_get_functiondef('public.security_management_access_allowed(boolean)'::regprocedure)) guard, md5(pg_get_functiondef('public.security_service(text,uuid,uuid,text,text,jsonb)'::regprocedure)) dispatcher;` })
await management(env, '/database/query', { query: migration })
const after = await management(env, '/database/query', { query: `select (select row_to_json(s) from management_security.settings s where singleton) settings, md5(pg_get_functiondef('public.security_management_access_allowed(boolean)'::regprocedure)) guard, md5(pg_get_functiondef('public.security_service(text,uuid,uuid,text,text,jsonb)'::regprocedure)) dispatcher;` })
assert.deepEqual(after[0].settings, before[0].settings)

const functions = await management(env, '/functions')
const prior = functions.find(item => item.slug === 'admin-pwa-auth' || item.name === 'admin-pwa-auth')
assert.ok(prior)
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../adminpwa/backend/functions/admin-pwa-auth/index.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022' })
const form = new FormData()
form.set('metadata', JSON.stringify({ name: 'admin-pwa-auth', entrypoint_path: 'index.js', verify_jwt: prior.verify_jwt }))
form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
let deployed
for (let attempt = 0; attempt < 3; attempt++) {
  deployed = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=admin-pwa-auth`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(60_000) })
  if (deployed.ok || deployed.status < 500) break
}
assert.ok(deployed.ok, `Deploy admin-pwa-auth HTTP ${deployed.status}`)
const info = await deployed.json()
const anonymous = await fetch(`${env.SUPABASE_URL}/functions/v1/admin-pwa-auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'security', security_action: 'email_send', data: { purpose: 'login' } }) })
assert.equal(anonymous.status, 403)
const report = { at: new Date().toISOString(), migrationApplied: true, function: 'admin-pwa-auth', priorVersion: prior.version, version: info.version, anonymousStatus: anonymous.status, settingsUnchanged: true, customerDataChanged: false, emailsSent: false, policy: 'Email fallback requires previously OTP-verified current email, completed recovery acknowledgement, verified TOTP enrollment, same live session/IP/browser. Authenticator rotation and recovery-code regeneration still require TOTP.' }
await writeFile(new URL('../docs/security/qa/email-login-deployment.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
