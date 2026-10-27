import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
import assert from 'node:assert/strict'
const env=await privateConfig()
assert.equal(new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname,'wtrycmiojsiliyjxsewz.supabase.co')
const migration=await readFile(new URL('../supabase/migrations/20261012120000_user_directory_read_request.sql',import.meta.url),'utf8')
const tests=await readFile(new URL('./test-user-security-directory.sql',import.meta.url),'utf8')
const query=sql=>management(env,'/database/query',{query:sql})
await query(migration.replace(/commit;\s*$/,'')+tests.replace(/^begin;\s*/,''))
console.log('POST/GET directory reads with aged MFA and sensitive-write denial passed in rollback.')
if(process.argv.includes('--apply')){
  await query(migration)
  await query(tests)
  const report={appliedAt:new Date().toISOString(),cause:'Default POST directory RPC classified as sensitive by the PostgREST pre-request hook',checks:['aged authorized MFA permits GET and POST directory reads','sensitive writes still require recent proof','revoked session denied at hook and RPC','existing admin/staff scope and safe projection checks passed'],profileAndRoleChanges:false,testFixtures:'Synthetic transaction-local records, rolled back'}
  await writeFile(new URL('../docs/security/qa/user-directory-read-fix.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
}
