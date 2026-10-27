import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const sql = await readFile(new URL('../adminpwa/backend/tests/mfa-foundation-rollback.sql', import.meta.url), 'utf8')
const result = await management(env, '/database/query', { query: sql })
const report = { testedAt: new Date().toISOString(), verification: result, customerDataChanged: false, fixtures: 'Transaction-local Auth/profile/security fixtures; rollback only.', limits: 'Database invariants, not real Auth endpoint or delivered email end-to-end verification.' }
await writeFile(new URL('../docs/security/qa/mfa-database-rollback-2026-10-09.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
