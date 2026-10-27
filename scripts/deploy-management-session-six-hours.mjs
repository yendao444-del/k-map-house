import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'

const env = await privateConfig()
const migration = await readFile(
  new URL('../supabase/migrations/20261010120000_management_session_six_hours.sql', import.meta.url),
  'utf8'
)

await management(env, '/database/query', { query: migration })
const rows = await management(env, '/database/query', {
  query: `select idle_seconds, lifetime_seconds,
    (select count(*) from management_security.sessions where expires_at > created_at + interval '6 hours') as over_six_hours
    from management_security.settings where singleton;`
})
const settings = rows?.[0]
assert.equal(Number(settings?.idle_seconds), 21600)
assert.equal(Number(settings?.lifetime_seconds), 21600)
assert.equal(Number(settings?.over_six_hours), 0)

console.log(JSON.stringify({
  deployedAt: new Date().toISOString(),
  idleSeconds: Number(settings.idle_seconds),
  lifetimeSeconds: Number(settings.lifetime_seconds),
  sessionsOverSixHours: Number(settings.over_six_hours),
  customerDataChanged: false
}, null, 2))
