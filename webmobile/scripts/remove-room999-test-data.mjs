import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { privateConfig, management, root } from './private-config.mjs'

const env = await privateConfig()
const project = new URL(env.SUPABASE_URL).hostname.split('.')[0]
assert.equal(project, 'wtrycmiojsiliyjxsewz', 'Refuse to clean any non-production project.')

const roomId = 'room-1791197579415-sgwfup89'
const contractId = 'contract_991899c7-4db7-4df7-8c1e-8bcac2f511e9'
const tenantId = 'tenant-1791206769026-rqk3wsos'
const authUserId = '536f6508-f780-4fb7-9e27-da9573841b34'
const email = 'yendao444@gmail.com'
const query = sql => management(env, '/database/query', { query: sql })
const q = value => `'${String(value).replaceAll("'", "''")}'`

const snapshotSql = `select jsonb_build_object(
  'rooms',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.rooms x where x.id=${q(roomId)}),
  'tenants',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.tenants x where x.id=${q(tenantId)}),
  'contracts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.contracts x where x.id=${q(contractId)}),
  'drafts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.contract_drafts x where x.room_id=${q(roomId)}),
  'confirmations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.contract_confirmations x where x.contract_id=${q(contractId)} or x.draft_id in(select id from public.contract_drafts where room_id=${q(roomId)})),
  'confirmation_events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.contract_confirmation_events x where x.confirmation_id in(select id from public.contract_confirmations where contract_id=${q(contractId)} or draft_id in(select id from public.contract_drafts where room_id=${q(roomId)}))),
  'lifecycle_events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.contract_lifecycle_events x where x.contract_id=${q(contractId)} or x.draft_id in(select id from public.contract_drafts where room_id=${q(roomId)})),
  'usage_evidence',(select coalesce(jsonb_agg(to_jsonb(x) order by x.contract_id,x.source_id),'[]'::jsonb) from public.contract_usage_evidence x where x.contract_id=${q(contractId)}),
  'test_designations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.contract_id),'[]'::jsonb) from public.contract_test_designations x where x.room_id=${q(roomId)}),
  'cancellation_notices',(select coalesce(jsonb_agg(to_jsonb(x) order by x.contract_id),'[]'::jsonb) from public.contract_cancellation_notices x where x.contract_id=${q(contractId)}),
  'tenant_account',(select coalesce(jsonb_agg(to_jsonb(x) order by x.tenant_id),'[]'::jsonb) from public.tenant_web_accounts x where x.tenant_id=${q(tenantId)}),
  'room_assets',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.room_assets x where x.room_id=${q(roomId)}),
  'room_asset_adjustments',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.room_asset_adjustments x where x.room_id=${q(roomId)}),
  'room_vehicles',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.room_vehicles x where x.room_id=${q(roomId)}),
  'asset_snapshots',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) from public.asset_snapshots x where x.room_id=${q(roomId)}),
  'auth_user',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'role',role,'created_at',created_at) order by id),'[]'::jsonb) from auth.users where id=${q(authUserId)})
) snapshot`

const [{ snapshot }] = await query(snapshotSql)
assert.equal(snapshot.rooms.length, 1, 'Target room was not found exactly once.')
assert.equal(snapshot.rooms[0].name, 'Phòng 999', 'Target room name changed; cleanup aborted.')
assert.equal(snapshot.tenants.length, 1)
assert.equal(snapshot.tenants[0].email.toLowerCase(), email)
assert.equal(snapshot.contracts.length, 1)
assert.equal(snapshot.contracts[0].id, contractId)
assert.equal(snapshot.drafts.length, 2)
assert.equal(snapshot.confirmations.length, 1)
assert.equal(snapshot.tenant_account.length, 1)
assert.equal(snapshot.tenant_account[0].auth_user_id, authUserId)
assert.equal(snapshot.auth_user.length, 1)
assert.equal(snapshot.auth_user[0].email.toLowerCase(), email)
assert.equal(snapshot.auth_user[0].role, 'anon')

const guardSql = `
select jsonb_build_object(
 'room_invoice',(select count(*) from public.invoices where room_id=${q(roomId)}),
 'room_cash',(select count(*) from public.cash_transactions where room_id=${q(roomId)}),
 'room_payment',(select count(*) from public.payment_events where invoice_id in(select id from public.invoices where room_id=${q(roomId)})),
 'room_sepay',(select count(*) from public.sepay_server_transactions where invoice_id in(select id from public.invoices where room_id=${q(roomId)})),
 'room_receipt',(select count(*) from public.move_in_receipts where room_id=${q(roomId)}),
 'room_cycle',(select count(*) from public.tenant_payment_cycles where room_id=${q(roomId)}),
 'tenant_receipt',(select count(*) from public.tenant_payment_receipts where tenant_id=${q(tenantId)}),
 'tenant_email',(select count(*) from public.tenant_payment_emails where cycle_id in(select id from public.tenant_payment_cycles where tenant_id=${q(tenantId)})),
 'tenant_photo',(select count(*) from public.tenant_meter_photos where user_id=${q(authUserId)}),
 'tenant_manual',(select count(*) from public.tenant_meter_manual_entries where user_id=${q(authUserId)}),
 'other_contract',(select count(*) from public.contracts where tenant_id=${q(tenantId)} and id<>${q(contractId)}),
 'other_draft',(select count(*) from public.contract_drafts where tenant_id=${q(tenantId)} and room_id<>${q(roomId)}),
 'other_room_ref',(select count(*) from public.contracts where room_id<>${q(roomId)} and cancellation_reference=${q(contractId)}),
 'other_account',(select count(*) from public.tenant_web_accounts where auth_user_id=${q(authUserId)} and tenant_id<>${q(tenantId)})
) guard`
const [{ guard }] = await query(guardSql)
for (const [key, value] of Object.entries(guard)) assert.equal(Number(value), 0, `${key} is not empty; cleanup aborted.`)

const qaDir = path.join(root, 'qa', 'private')
await mkdir(qaDir, { recursive: true })
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const backupFile = `room999-cleanup-backup-${stamp}.json`
await writeFile(path.join(qaDir, backupFile), JSON.stringify({ at: new Date().toISOString(), project, roomId, contractId, tenantId, authUserId, snapshot, guard }, null, 2) + '\n', { flag: 'wx' })

const ids = snapshot.drafts.map(x => q(x.id)).join(',') || 'null'
const confirmationIds = snapshot.confirmations.map(x => q(x.id)).join(',') || 'null'
const assetIds = snapshot.room_assets.map(x => q(x.id)).join(',') || 'null'
const scopes = {
  rooms: `id=${q(roomId)}`,
  tenants: `id=${q(tenantId)}`,
  contracts: `id=${q(contractId)}`,
  contract_drafts: `id in(${ids})`,
  contract_confirmations: `id in(${confirmationIds})`,
  contract_confirmation_events: `confirmation_id in(${confirmationIds})`,
  contract_lifecycle_events: `contract_id=${q(contractId)} or draft_id in(${ids})`,
  contract_cancellation_notices: `contract_id=${q(contractId)}`,
  contract_usage_evidence: `contract_id=${q(contractId)}`,
  contract_test_designations: `contract_id=${q(contractId)} or room_id=${q(roomId)}`,
  tenant_auth_provisions: `tenant_id=${q(tenantId)} or confirmation_id in(${confirmationIds})`,
  tenant_web_accounts: `tenant_id=${q(tenantId)} and auth_user_id=${q(authUserId)}`,
  webmobile_auth_sessions: `user_id=${q(authUserId)}`,
  webmobile_demo_accounts: `user_id=${q(authUserId)} or contract_id=${q(contractId)}`,
  tenant_payment_cycles: `room_id=${q(roomId)}`,
  tenant_payment_emails: `false`,
  tenant_payment_receipts: `tenant_id=${q(tenantId)}`,
  tenant_meter_manual_entries: `user_id=${q(authUserId)}`,
  tenant_meter_photos: `user_id=${q(authUserId)}`,
  asset_snapshots: `room_id=${q(roomId)}`,
  room_asset_adjustments: `room_id=${q(roomId)}`,
  room_vehicles: `room_id=${q(roomId)}`,
  room_assets: `id in(${assetIds})`,
  invoices: `false`, cash_transactions: `false`, move_in_receipts: `false`,
  payment_events: `false`, sepay_server_transactions: `false`,
  debt_entries: `false`, wallet_reconciliations: `false`,
  users: `false`, app_settings: `false`, service_zones: `false`,
}
const protectedSql = `select jsonb_build_object(${Object.entries(scopes).map(([table, scope]) => `${q(table)},(select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb)::text) from public.${table} x where not (${scope}))`).join(',')}) fingerprint`
const captureSql = `select snapshot, md5(snapshot::text) fingerprint from (${snapshotSql}) captured`
const [{ fingerprint: snapshotFingerprint }] = await query(captureSql)
const sql = `begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
select pg_advisory_xact_lock(20261005,120000);
select pg_advisory_xact_lock(hashtext('contract-lifecycle'));
select pg_advisory_xact_lock(hashtext('ankhang-room999-test-cleanup'));
lock table ${Object.keys(scopes).sort().map(t=>`public.${t}`).join(',')}, auth.users in share row exclusive mode;
create temporary table room999_protected_before on commit drop as ${protectedSql};
do $$ begin
 if (select fingerprint from (${captureSql}) x)<>${q(snapshotFingerprint)} then raise exception 'Room test data changed since backup'; end if;
 if exists(select 1 from (${guardSql}) g cross join lateral jsonb_each_text(g.guard) v where v.value::int<>0) then raise exception 'New financial/shared data detected'; end if;
 if (select count(*) from public.rooms where id=${q(roomId)})<>1 then raise exception 'Room changed'; end if;
 if (select count(*) from public.contracts where id=${q(contractId)} and room_id=${q(roomId)} and tenant_id=${q(tenantId)})<>1 then raise exception 'Contract changed'; end if;
 if (exists(select 1 from public.invoices where room_id=${q(roomId)}) or exists(select 1 from public.cash_transactions where room_id=${q(roomId)}) or exists(select 1 from public.move_in_receipts where room_id=${q(roomId)}) or exists(select 1 from public.payment_events where invoice_id in(select id from public.invoices where room_id=${q(roomId)})) or exists(select 1 from public.sepay_server_transactions where invoice_id in(select id from public.invoices where room_id=${q(roomId)}))) then raise exception 'Financial data appeared; cleanup aborted'; end if;
 if exists(select 1 from public.contracts where tenant_id=${q(tenantId)} and id<>${q(contractId)}) then raise exception 'Tenant has another contract'; end if;
 if exists(select 1 from public.contract_drafts where tenant_id=${q(tenantId)} and room_id<>${q(roomId)}) then raise exception 'Tenant has another draft'; end if;
 if exists(select 1 from public.tenant_web_accounts where auth_user_id=${q(authUserId)} and tenant_id<>${q(tenantId)}) then raise exception 'Auth user is reused'; end if;
 if exists(select 1 from public.users where id=${q(authUserId)}) then raise exception 'Auth identity is a management account'; end if;
 if exists(select 1 from public.contracts where id<>${q(contractId)} and room_id=${q(roomId)}) then raise exception 'Other room contract detected'; end if;
 if exists(select 1 from public.contract_drafts where room_id<>${q(roomId)} and parent_contract_id=${q(contractId)}) then raise exception 'Other draft references contract'; end if;
 if exists(select 1 from public.asset_snapshots where room_id<>${q(roomId)} and (contract_id=${q(contractId)} or room_asset_id in(${assetIds}))) then raise exception 'Shared asset snapshot detected'; end if;
 if exists(select 1 from public.room_asset_adjustments where room_id<>${q(roomId)} and room_asset_id in(${assetIds})) then raise exception 'Shared asset adjustment detected'; end if;
end $$;
delete from public.tenant_meter_manual_entries where user_id=${q(authUserId)};
delete from public.tenant_meter_photos where user_id=${q(authUserId)};
delete from public.tenant_payment_receipts where tenant_id=${q(tenantId)};
delete from public.tenant_payment_emails where cycle_id in(select id from public.tenant_payment_cycles where tenant_id=${q(tenantId)});
delete from public.tenant_payment_cycles where room_id=${q(roomId)};
delete from public.tenant_auth_provisions where tenant_id=${q(tenantId)} or confirmation_id in(${confirmationIds});
delete from public.webmobile_demo_accounts where user_id=${q(authUserId)} or contract_id=${q(contractId)};
delete from public.tenant_web_accounts where tenant_id=${q(tenantId)} and auth_user_id=${q(authUserId)};
delete from public.contract_confirmation_events where confirmation_id in(${confirmationIds});
delete from public.contract_lifecycle_events where contract_id=${q(contractId)} or draft_id in(${ids});
delete from public.contract_cancellation_notices where contract_id=${q(contractId)};
delete from public.contract_test_designations where contract_id=${q(contractId)} or room_id=${q(roomId)};
delete from public.contract_confirmations where id in(${confirmationIds});
delete from public.contract_drafts where id in(${ids});
delete from public.asset_snapshots where room_id=${q(roomId)};
delete from public.contract_usage_evidence where contract_id=${q(contractId)};
delete from public.room_asset_adjustments where room_id=${q(roomId)};
delete from public.room_vehicles where room_id=${q(roomId)};
delete from public.room_assets where id in(${assetIds});
delete from public.contracts where id=${q(contractId)};
delete from public.tenants where id=${q(tenantId)};
delete from public.rooms where id=${q(roomId)};
delete from auth.users where id=${q(authUserId)} and email=${q(email)};
do $$ begin
 if (select count(*) from auth.users where id=${q(authUserId)})<>0 then raise exception 'Auth test account was not deleted'; end if;
 if (select fingerprint from (${protectedSql}) x) is distinct from (select fingerprint from room999_protected_before) then raise exception 'Other room/business data changed: rolling back'; end if;
end $$;
select jsonb_build_object('otherBusinessDataUnchanged',true,'financialDataUnchanged',true,'removedRoomCount',1) result;
commit;`
const transactionResult = await query(sql)
assert.equal(transactionResult[0]?.result?.otherBusinessDataUnchanged, true)

const [{ left }] = await query(`select jsonb_build_object('room',(select count(*) from public.rooms where id=${q(roomId)}),'tenant',(select count(*) from public.tenants where id=${q(tenantId)}),'contract',(select count(*) from public.contracts where id=${q(contractId)}),'invoice',(select count(*) from public.invoices where room_id=${q(roomId)}),'account',(select count(*) from public.tenant_web_accounts where tenant_id=${q(tenantId)}),'auth',(select count(*) from auth.users where id=${q(authUserId)})) left`)
for (const value of Object.values(left)) assert.equal(Number(value), 0)
await writeFile(path.join(root, 'qa', 'room999-cleanup-result.json'), JSON.stringify({ at: new Date().toISOString(), project, roomId, contractId, tenantId, authUserId, backupFile, guard, left, removed: true, financialRowsBefore: guard.room_invoice + guard.room_cash + guard.room_payment + guard.room_sepay + guard.room_receipt, atomicTransaction: true, otherBusinessDataUnchanged: true, financialDataUnchanged: true, emailsSent: false, deleted: Object.fromEntries(Object.entries(snapshot).map(([table, rows])=>[table, rows.length])) }, null, 2) + '\n')
console.log(`Removed test Room 999 and isolated test records. Backup: qa/private/${backupFile}. No invoice, cash, payment or SePay rows existed.`)
