import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const query = sql => management(env, '/database/query', { query: sql })
const migration = await readFile(new URL('../backend/migrations/20261008130000_storage_upload_guard.sql', import.meta.url), 'utf8')
const tests = await readFile(new URL('../backend/tests/storage-security-rollback.sql', import.meta.url), 'utf8')
const before = await query("select policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects'")
if (!before.some(p => p.policyname === 'room_images_management_insert_guard')) {
  // Verify proposed policies and access in one transaction that always rolls back.
  await query(migration.replace(/commit;\s*$/, '') + tests.replace(/^begin;\s*/, ''))
  await query(migration)
}
await query(tests)
const after = await query("select policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects'")
assert.ok(after.some(p => p.policyname === 'room_images_management_insert_guard' && p.permissive === 'RESTRICTIVE'))
assert.ok(after.some(p => p.policyname === 'room_images_management_delete_guard' && p.permissive === 'RESTRICTIVE'))
const report = { appliedAt: new Date().toISOString(), before, after, rollbackRoleTests: 'passed: anon/unknown denied; available active admin/staff can upload and delete', scope: 'Storage room-images only; no manager roles or business table policies changed; no physical files touched.' }
await writeFile(new URL('../qa/security-storage-fix.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ appliedAt: report.appliedAt, rollbackRoleTests: report.rollbackRoleTests, scope: report.scope }, null, 2))
