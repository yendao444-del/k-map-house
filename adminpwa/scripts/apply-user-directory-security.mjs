import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const migration = await readFile(new URL('../backend/migrations/20261009130000_user_directory_read_guard.sql', import.meta.url), 'utf8')
const tests = await readFile(new URL('../backend/tests/user-directory-security-rollback.sql', import.meta.url), 'utf8')
const query = sql => management(env, '/database/query', { query: sql })
// Verify on production roles in a rolled-back transaction before committing.
await query(migration.replace(/commit;\s*$/, '') + tests.replace(/^begin;\s*/, ''))
await query(migration)
await query(tests)
const rows = await query("select policyname,permissive,cmd,roles::text,qual from pg_policies where schemaname='public' and tablename='users' and policyname='management_directory_read_guard'")
assert.equal(rows.length, 1)
assert.equal(rows[0].permissive, 'RESTRICTIVE')
const report = { appliedAt: new Date().toISOString(), production: true, policies: rows, rollbackChecks: ['active admin and staff can read directory', 'self-profile update allowed', 'staff cannot promote itself', 'inactive profile cannot read other profiles or settings', 'unknown authenticated subject sees no directory', 'anonymous cannot execute helper'], dataChanges: 'Policy and boolean helper only; role/status/profile test changes rolled back.' }
await writeFile(new URL('../qa/user-directory-security-production.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
