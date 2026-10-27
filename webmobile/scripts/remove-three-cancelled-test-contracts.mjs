import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root, privateConfig, management } from './private-config.mjs'

// One-off owner-authorized cleanup of the three cancelled leases shown in the
// screenshot on 08/10/2026. This is deliberately not a general deletion API.
const ids=['contract_fc8c6ddc-ad62-41d4-a26a-0b750f1ee24f','contract_5f951395-b5a5-4f2c-9fd2-766b0aa388de','contract_66753eca-d4f6-4e5d-8ab0-913dc588570e']
const room='room-1791197579415-sgwfup89',tenant='tenant-1791206769026-rqk3wsos'
const list=ids.map(id=>`'${id}'`).join(',')
const env=await privateConfig()
assert.equal(new URL(env.SUPABASE_URL).hostname.split('.')[0],'wtrycmiojsiliyjxsewz')
const query=sql=>management(env,'/database/query',{query:sql})
const drafts=`select draft_id from public.contract_confirmations where contract_id in (${list}) union select id from public.contract_drafts where parent_contract_id in (${list})`
const confirmations=`select id from public.contract_confirmations where contract_id in (${list}) or draft_id in (${drafts})`
const scopes={
 contracts:`id in (${list})`,
 contract_drafts:`id in (${drafts})`,
 contract_confirmations:`id in (${confirmations})`,
 contract_confirmation_events:`confirmation_id in (${confirmations})`,
 contract_lifecycle_events:`contract_id in (${list}) or draft_id in (${drafts})`,
 contract_test_designations:`contract_id in (${list})`,
 contract_cancellation_notices:`contract_id in (${list})`,
 tenant_auth_provisions:`confirmation_id in (${confirmations})`
}
const snapshot=`select jsonb_build_object(${Object.entries(scopes).map(([table,scope])=>`'${table}',(select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) from public.${table} x where ${scope})`).join(',')}) snapshot`
const capture=`select snapshot,md5(snapshot::text) fingerprint from (${snapshot}) captured`
const totalCounts=`select jsonb_build_object(${[...Object.keys(scopes),'rooms','tenants','invoices','move_in_receipts','cash_transactions','auth.users'].map(table=>`'${table}',(select count(*) from ${table.includes('.')?table:'public.'+table})`).join(',')}) counts`
const [{snapshot:backup,fingerprint}]=await query(capture)
assert.equal(backup.contracts.length,3,'Exactly the three requested contracts must exist')
for(const row of backup.contracts) {
 assert.equal(row.status,'cancelled');assert.equal(row.room_id,room);assert.equal(row.tenant_id,tenant);assert.equal(row.tenant_name,'Đỗ Kim Ngân')
 assert.ok(backup.contract_test_designations.some(d=>d.contract_id===row.id&&d.room_id===room&&d.tenant_id===tenant),'Each contract must have an explicit test designation')
}
for(const row of backup.contract_drafts){assert.equal(row.room_id,room);assert.equal(row.tenant_id,tenant);assert.ok(['confirmed','cancelled'].includes(row.status))}
for(const row of backup.contract_confirmations){assert.equal(row.status,'revoked');assert.ok(!row.contract_id||ids.includes(row.contract_id));assert.equal(row.account_ready_at,null)}
const [{counts:before}]=await query(totalCounts)
await mkdir(path.join(root,'qa/private'),{recursive:true})
const backupPath=path.join(root,'qa/private',`three-test-contracts-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
await writeFile(backupPath,JSON.stringify({at:new Date().toISOString(),project:'wtrycmiojsiliyjxsewz',ids,fingerprint,before,rows:backup},null,2)+'\n',{flag:'wx'})
assert.equal(JSON.parse(await readFile(backupPath,'utf8')).fingerprint,fingerprint)
console.log(`Backed up ${backup.contracts.length} contracts and ${backup.contract_drafts.length} related drafts to a private local file.`)
if(!process.argv.includes('--execute'))process.exit(0)
const draftIds=backup.contract_drafts.map(r=>`'${r.id}'`).join(',')||'null'
const confirmationIds=backup.contract_confirmations.map(r=>`'${r.id}'`).join(',')||'null'
const userIds=backup.contract_confirmations.map(r=>`'${r.account_user_id}'`).join(',')||'null'
await query(`begin;
 select pg_advisory_xact_lock(hashtext('contract-lifecycle'));
 lock table public.contracts,public.contract_drafts,public.contract_confirmations,public.contract_confirmation_events,
 public.contract_lifecycle_events,public.contract_test_designations,public.contract_cancellation_notices,public.tenant_auth_provisions,
 public.rooms,public.tenants,public.invoices,public.move_in_receipts,public.cash_transactions,public.payment_events,
 public.asset_snapshots,public.contract_usage_evidence,public.tenant_web_accounts,public.webmobile_demo_accounts in share row exclusive mode;
 do $$ declare actual text; begin
 select fingerprint into actual from (${capture}) x;
 if actual<>'${fingerprint}' then raise exception 'Test data changed after backup; deletion aborted'; end if;
 if exists(select 1 from public.invoices where room_id='${room}' and tenant_id='${tenant}')
 or exists(select 1 from public.move_in_receipts where room_id='${room}' and tenant_id='${tenant}')
 or exists(select 1 from public.cash_transactions where room_id='${room}')
 or exists(select 1 from public.asset_snapshots where contract_id in (${list}) or room_id='${room}' and tenant_id='${tenant}')
 or exists(select 1 from public.contract_usage_evidence where contract_id in (${list})) then raise exception 'Financial/handover data present; deletion aborted';end if;
 if exists(select 1 from auth.users where id in (${userIds}))
 or exists(select 1 from public.tenant_web_accounts where auth_user_id in (${userIds}))
 or exists(select 1 from public.webmobile_demo_accounts where contract_id in (${list})) then raise exception 'Account references present; deletion aborted';end if;
 if exists(select 1 from public.contracts where id not in (${list}) and cancellation_reference in (${list})) then raise exception 'Other contract references test data; deletion aborted';end if;
 end $$;
 delete from public.tenant_auth_provisions where confirmation_id in (${confirmationIds});
 delete from public.contract_confirmation_events where confirmation_id in (${confirmationIds});
 delete from public.contract_lifecycle_events where contract_id in (${list}) or draft_id in (${draftIds});
 delete from public.contract_cancellation_notices where contract_id in (${list});
 delete from public.contract_test_designations where contract_id in (${list});
 delete from public.contract_confirmations where id in (${confirmationIds});
 delete from public.contract_drafts where id in (${draftIds});
 delete from public.contracts where id in (${list});
 commit;`)
const [{counts:after}]=await query(totalCounts)
for(const key of Object.keys(before))assert.equal(after[key],before[key]-(backup[key]?.length||0),`Unexpected ${key} count change`)
assert.equal((await query(`select count(*)::int n from public.contracts where id in (${list})`))[0].n,0)
await writeFile(path.join(root,'qa/three-test-contracts-cleanup.json'),JSON.stringify({at:new Date().toISOString(),project:'wtrycmiojsiliyjxsewz',ids,before,after,backupFile:path.basename(backupPath),passed:true,emailsSent:false},null,2)+'\n')
console.log('Removed exactly the three cancelled test contracts and their linked test records. Rooms, tenants, invoices and Auth users unchanged. No email sent.')
