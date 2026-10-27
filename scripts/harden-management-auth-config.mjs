import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const before = await management(env, '/config/auth')
const requested = {
  password_min_length: Math.max(12, Number(before.password_min_length || 0)),
  password_hibp_enabled: true,
  sessions_timebox: 21600,
  sessions_inactivity_timeout: 21600,
  security_update_password_require_reauthentication: true,
  security_update_password_require_current_password: true
}
let patchError = null
try { await management(env, '/config/auth', requested, 'PATCH') } catch (error) { patchError = error instanceof Error ? error.message : 'unsupported' }
const after = await management(env, '/config/auth')
const authPatchApplied = Number(after.password_min_length) >= 12 && Number(after.sessions_timebox) === 21600 && Number(after.sessions_inactivity_timeout) === 21600
assert.equal(after.security_update_password_require_reauthentication, true)
assert.equal(after.security_update_password_require_current_password, true)
const report = {
  at: new Date().toISOString(),
  before: { password_min_length: before.password_min_length, password_hibp_enabled: before.password_hibp_enabled, sessions_timebox: before.sessions_timebox, sessions_inactivity_timeout: before.sessions_inactivity_timeout },
  after: { password_min_length: after.password_min_length, password_hibp_enabled: after.password_hibp_enabled, sessions_timebox: after.sessions_timebox, sessions_inactivity_timeout: after.sessions_inactivity_timeout, reauthentication: after.security_update_password_require_reauthentication, currentPassword: after.security_update_password_require_current_password },
  authPatchApplied, hibpRequested: true, hibpEnabled: after.password_hibp_enabled === true, patchError, customerDataChanged: false
}
await writeFile(new URL('../docs/security/qa/auth-hardening-2026-10-10.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
