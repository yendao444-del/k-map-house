import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'

const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const migration = await readFile(new URL('../supabase/migrations/20261012110000_management_user_security_directory.sql', import.meta.url), 'utf8')
const tests = await readFile(new URL('./test-user-security-directory.sql', import.meta.url), 'utf8')
const query = sql => management(env, '/database/query', { query: sql })
// Compile and verify the migration and all access checks before committing it.
await query(migration.replace(/commit;\s*$/, '') + tests.replace(/^begin;\s*/, ''))
console.log('Pre-deployment transaction/rollback checks passed.')
if (process.argv.includes('--apply')) {
await query(migration)
await query(tests)
const definitions = await query("select has_function_privilege('anon','public.management_user_directory()','execute') as anon_execute,has_function_privilege('authenticated','public.management_user_directory()','execute') as authenticated_execute")
assert.equal(definitions[0].anon_execute, false)
assert.equal(definitions[0].authenticated_execute, true)
const report = {
  appliedAt: new Date().toISOString(),
  checks: ['verified TOTP only', 'email provisioning is not OTP proof', 'OTP survives session cleanup', 'changed email invalidates old proof', 'fixed projection without secrets', 'admin directory', 'staff self only', 'anonymous/unknown/inactive denied', 'revoked session denied', 'client cannot forge verification'],
  profileOrPermissionChanges: false,
  backfill: 'Existing successful OTP evidence for current login emails only',
  testData: 'Transaction-local synthetic users/sessions/factors; rollback only'
}
await mkdir(new URL('../docs/security/qa/', import.meta.url), { recursive: true })
await writeFile(new URL('../docs/security/qa/user-security-directory-deployment.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
}
