import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const migration = await readFile(new URL('../supabase/migrations/20261012133000_security_mfa_authenticator_rotation.sql', import.meta.url), 'utf8')
const overviewMigration = await readFile(new URL('../supabase/migrations/20261012140000_security_overview_read.sql', import.meta.url), 'utf8')
const test = await readFile(new URL('../adminpwa/backend/tests/totp-replacement-rollback.sql', import.meta.url), 'utf8')
const query = migration.replace(/\bcommit;/i, '') + '\n' + overviewMigration.replace(/\bbegin;/i, '').replace(/\bcommit;/i, '') + '\n' + test + '\nrollback;'
const result = await management(env, '/database/query', { query })
const report = { at: new Date().toISOString(), result, customerDataChanged: false, transaction: 'rollback', tests: 'Ownership, fresh old proof, concurrency, invalid/unverified new factor, cancellation, atomic retirement, other-session revocation, recovery acknowledgement, six-hour deadline, RPC permissions.' }
await writeFile(new URL('../docs/security/qa/totp-replacement-database.json', import.meta.url), JSON.stringify(report, null, 2)+'\n')
console.log(JSON.stringify(report))
