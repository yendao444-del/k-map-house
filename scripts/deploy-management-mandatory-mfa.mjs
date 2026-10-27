import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
await management(env, '/database/query', { query: await readFile(new URL('../supabase/migrations/20261010110000_security_mandatory_enrollment.sql', import.meta.url), 'utf8') })
const enabling = process.argv.includes('--enable')
if (enabling) {
  const auth = await management(env, '/config/auth')
  assert.equal(auth.mfa_totp_enroll_enabled, true, 'Auth TOTP enrollment must be enabled')
  assert.equal(auth.mfa_totp_verify_enabled, true, 'Auth TOTP verification must be enabled')
  await management(env, '/database/query', { query: 'update management_security.settings set enrollment_enabled=true,enforce_management=true where singleton;' })
}
const status = await management(env, '/database/query', { query: "select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true); select public.security_rollout_status() as status;" })
const value = status.find(row => row.status)?.status
assert.ok(value?.ready_for_enforcement)
if (enabling) assert.equal(value.enforce_management, true)
const report = { at: new Date().toISOString(), mandatoryEnabled: enabling, status: value, scope: 'All current and future active management admins/staff. Tenant portal uses separate authentication.', customerDataChanged: false }
await writeFile(new URL('../docs/security/qa/mfa-mandatory-rollout-2026-10-10.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
