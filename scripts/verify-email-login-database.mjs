import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL).hostname.split('.')[0], 'wtrycmiojsiliyjxsewz')
const migration = (await readFile(new URL('../supabase/migrations/20261013100000_security_email_login_fallback.sql', import.meta.url), 'utf8')).replace(/^\uFEFF/, '')
const fixture = await readFile(new URL('../adminpwa/backend/tests/email-login-rollback.sql', import.meta.url), 'utf8')
const priorTests = await Promise.all(['password-confirmation-rollback.sql','remember-device-rollback.sql','totp-replacement-rollback.sql'].map(name => readFile(new URL('../adminpwa/backend/tests/' + name, import.meta.url), 'utf8')))
const safetyQuery = `select (select row_to_json(s) from management_security.settings s where singleton) settings,
  (select count(*) from public.users) profiles,
  (select count(*) from auth.users) auth_users,
  (select count(*) from management_security.accounts) accounts,
  md5(coalesce((select proacl::text from pg_proc where oid='public.security_service(text,uuid,uuid,text,text,jsonb)'::regprocedure),'')) dispatcher_acl;`
const before = await management(env, '/database/query', { query: safetyQuery })
const tests = fixture + '\n' + priorTests.map(t => t.replace(/^begin;/i, '').replace(/rollback;\s*$/i, '')).join('\n') + "\nselect 'passed' email_login_invariants, 'passed' password_remember_device_and_totp_regressions;"
const result = await management(env, '/database/query', { query: migration.replace(/commit;\s*$/i, '') + '\n' + tests + '\nrollback;' })
assert.ok(result.some(r => r.email_login_invariants === 'passed'))
const after = await management(env, '/database/query', { query: safetyQuery })
assert.deepEqual(after, before)
const report = { at: new Date().toISOString(), invariantsPassed: true, fixtureDataRolledBack: true, settingsRolesAndCountsUnchanged: true, results: result }
await writeFile(new URL('../docs/security/qa/email-login-database.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
