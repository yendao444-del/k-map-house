import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root, privateConfig, management } from './private-config.mjs'

const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL).hostname.split('.')[0], 'wtrycmiojsiliyjxsewz')
const query = sql => management(env, '/database/query', { query: sql })
const id = 'contract_5f951395-b5a5-4f2c-9fd2-766b0aa388de'
const inspect = () => query(`select c.id,c.status,c.room_id,c.tenant_id,r.name room,public.contract_cancellation_check(c.id) eligibility from public.contracts c join public.rooms r on r.id=c.room_id where c.id='${id}'`)
const counts = () => query("select jsonb_build_object('contracts',(select count(*) from public.contracts),'notices',(select count(*) from public.contract_cancellation_notices),'invoices',(select count(*) from public.invoices),'designations',(select count(*) from public.contract_test_designations)) counts")
const [before] = await inspect()
assert.equal(before?.status, 'active')
assert.equal(before.room, 'Phòng 999')
assert.equal(before.room_id, 'room-1791197579415-sgwfup89')
assert.equal(before.tenant_id, 'tenant-1791206769026-rqk3wsos')
assert.equal(before.eligibility.allowed, true)
const [beforeCounts] = await counts()
await query(await readFile(path.join(root, '../supabase/migrations/20261008230000_designate_current_contract_test.sql'), 'utf8'))
const [after] = await inspect()
const [afterCounts] = await counts()
assert.equal(after.status, 'active')
assert.equal(after.eligibility.isTestContract, true)
assert.equal(after.eligibility.allowed, true)
for (const name of ['contracts', 'notices', 'invoices']) assert.equal(afterCounts.counts[name], beforeCounts.counts[name])
assert.equal(afterCounts.counts.designations, beforeCounts.counts.designations + (before.eligibility.isTestContract ? 0 : 1))
await writeFile(path.join(root, 'qa/contract-test-reason-verification.json'), JSON.stringify({at:new Date().toISOString(), before, after, beforeCounts:beforeCounts.counts, afterCounts:afterCounts.counts, contractCancelled:false, emailsSent:false}, null, 2)+'\n')
console.log(JSON.stringify({contractId:id,status:after.status,eligibility:after.eligibility,contractCancelled:false,emailsSent:false}))
