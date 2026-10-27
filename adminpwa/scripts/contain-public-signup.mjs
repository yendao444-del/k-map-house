import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'

const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const before = await management(env, '/config/auth')
await management(env, '/config/auth', { disable_signup: true, password_min_length: Math.max(8, before.password_min_length || 0) }, 'PATCH')
const after = await management(env, '/config/auth')
assert.equal(after.disable_signup, true)
assert.ok(after.password_min_length >= 8)
for (const key of ['site_url', 'uri_allow_list', 'mailer_autoconfirm', 'external_email_enabled']) assert.deepEqual(after[key], before[key], `Unexpected Auth change: ${key}`)
const report = {
  appliedAt: new Date().toISOString(),
  before: { disable_signup: before.disable_signup, password_min_length: before.password_min_length },
  after: { disable_signup: after.disable_signup, password_min_length: after.password_min_length },
  scope: 'Public signup disabled; password minimum strengthened; admin provisioning, existing accounts and redirects unchanged.'
}
await writeFile(new URL('../qa/security-signup-containment.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
