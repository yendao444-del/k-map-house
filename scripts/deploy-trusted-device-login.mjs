import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { fileURLToPath } from 'node:url'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'

// Facebook-style trusted device login: DB migration + admin-pwa-auth function.
// Pages (gateway + PWA) is published separately with adminpwa/scripts/publish-security-pwa.mjs.
const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const migration = await readFile(new URL('../supabase/migrations/20261118100000_security_trusted_device_login.sql', import.meta.url), 'utf8')
const safety = `select (select row_to_json(s) from management_security.settings s where singleton) settings,
  (select md5(string_agg(id::text||role||status,',' order by id)) from public.users) roles,
  (select count(*) from auth.users) auth_users,
  (select count(*) from management_security.devices where revoked_at is null) active_devices;`
const before = await management(env, '/database/query', { query: safety })
// Dry run inside a rolled-back transaction first.
const dry = await management(env, '/database/query', { query: migration.replace(/notify pgrst,'reload schema';\s*commit;\s*$/i, '') + "\nselect array_length(management_security.merge_networks(array[repeat('a',64),repeat('b',64)],array[repeat('b',64)]),1) merged;\nrollback;" })
assert.ok(dry.some(r => r.merged === 2), 'Dry run failed')
const report = { at: new Date().toISOString(), dryRunRolledBack: true, productionApplied: false }
if (process.argv.includes('--production')) {
  await management(env, '/database/query', { query: migration })
  const check = await management(env, '/database/query', { query: `select
    to_regprocedure('public.security_trusted_device_login(uuid,uuid,text,text,text,text,text)') is not null login_fn,
    to_regprocedure('public.security_trusted_device_remember(uuid,uuid,text,text,text,text,text,text,text)') is not null remember_fn,
    (select count(*) from information_schema.columns where table_schema='management_security' and table_name='devices' and column_name in ('agent_family_hash','known_networks')) new_columns;` })
  assert.equal(check[0].login_fn, true); assert.equal(check[0].remember_fn, true); assert.equal(Number(check[0].new_columns), 2)
  const functions = await management(env, '/functions'), prior = functions.find(f => f.slug === 'admin-pwa-auth' || f.name === 'admin-pwa-auth')
  assert.ok(prior)
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../adminpwa/backend/functions/admin-pwa-auth/index.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022' })
  const form = new FormData(); form.set('metadata', JSON.stringify({ name: 'admin-pwa-auth', entrypoint_path: 'index.js', verify_jwt: prior.verify_jwt })); form.set('file', new Blob([bundle.outputFiles[0].text], { type: 'application/javascript' }), 'index.js')
  const response = await fetch('https://api.supabase.com/v1/projects/wtrycmiojsiliyjxsewz/functions/deploy?slug=admin-pwa-auth', { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }, body: form, signal: AbortSignal.timeout(60000) })
  assert.ok(response.ok, 'Function deployment HTTP ' + response.status)
  report.priorFunctionVersion = prior.version
  report.functionVersion = (await response.json()).version
  report.productionApplied = true
}
assert.deepEqual(await management(env, '/database/query', { query: safety }), before)
report.rolesSettingsDevicesUnchanged = true
await mkdir(new URL('../docs/security/qa/', import.meta.url), { recursive: true })
await writeFile(new URL('../docs/security/qa/trusted-device-login-deployment.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
