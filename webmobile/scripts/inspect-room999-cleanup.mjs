import assert from 'node:assert/strict'
import { privateConfig, management } from './private-config.mjs'
const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const queries = {
  contracts: "select id,room_id,tenant_id,tenant_name,status,deposit_amount,move_in_date,created_at from public.contracts where room_id='room-1791197579415-sgwfup89'",
  invoices: "select id,tenant_id,billing_reason,total_amount,paid_amount,payment_status,deposit_amount,deposit_applied,created_at from public.invoices where room_id='room-1791197579415-sgwfup89'",
  cash: "select id,type,category,amount,note from public.cash_transactions where room_id='room-1791197579415-sgwfup89'",
  receipt: "select * from public.move_in_receipts where room_id='room-1791197579415-sgwfup89'",
  payments: "select * from public.payment_events where invoice_id in (select id from public.invoices where room_id='room-1791197579415-sgwfup89')",
  bank: "select * from public.sepay_server_transactions where invoice_id in (select id from public.invoices where room_id='room-1791197579415-sgwfup89')",
  designations: "select * from public.contract_test_designations where room_id='room-1791197579415-sgwfup89'",
  drafts: `select id,room_id,tenant_id,parent_contract_id,status from public.contract_drafts where room_id='room-1791197579415-sgwfup89'`,
  confirmations: `select id,draft_id,contract_id,status,account_user_id,account_ready_at from public.contract_confirmations where contract_id in(select id from public.contracts where room_id='room-1791197579415-sgwfup89') or draft_id in(select id from public.contract_drafts where room_id='room-1791197579415-sgwfup89')`,
  cycles: `select id,contract_id,room_id,tenant_id,invoice_id,electric_old,electric_new,water_old,water_new from public.tenant_payment_cycles where room_id='room-1791197579415-sgwfup89'`,
  assets: `select id,name,quantity from public.room_assets where room_id='room-1791197579415-sgwfup89'`,
  snapshots: `select id,room_id,tenant_id,contract_id,type,deduction from public.asset_snapshots where room_id='room-1791197579415-sgwfup89'`,
  tenantOtherContracts: `select id,room_id,status from public.contracts where tenant_id='tenant-1791206769026-rqk3wsos' and room_id<>'room-1791197579415-sgwfup89'`,
  tenantOtherDrafts: `select id,room_id,status from public.contract_drafts where tenant_id='tenant-1791206769026-rqk3wsos' and room_id<>'room-1791197579415-sgwfup89'`,
  tenantAccount: `select tenant_id,auth_user_id,status,activated_at from public.tenant_web_accounts where tenant_id='tenant-1791206769026-rqk3wsos'`,
  tenant: `select id,full_name,email,phone,is_active,last_room_name from public.tenants where id='tenant-1791206769026-rqk3wsos'`,
  authProfile: `select id,email,role,created_at,last_sign_in_at from auth.users where id='536f6508-f780-4fb7-9e27-da9573841b34'`,
  tenantEmailDuplicates: `select id,full_name,email,is_active from public.tenants where lower(email)=lower((select email from public.tenants where id='tenant-1791206769026-rqk3wsos'))`,
  otherReferences: `select id,room_id from public.contracts where room_id<>'room-1791197579415-sgwfup89' and cancellation_reference in(select id from public.contracts where room_id='room-1791197579415-sgwfup89')`,
  evidence: `select * from public.contract_usage_evidence where contract_id in(select id from public.contracts where room_id='room-1791197579415-sgwfup89')`,
  lifecycle: `select count(*) n from public.contract_lifecycle_events where contract_id='contract_991899c7-4db7-4df7-8c1e-8bcac2f511e9' or draft_id in(select id from public.contract_drafts where room_id='room-1791197579415-sgwfup89')`,
  auth: `select id,role from public.users where id='536f6508-f780-4fb7-9e27-da9573841b34'`,
  mappings: `select user_id,contract_id,active from public.webmobile_demo_accounts where contract_id='contract_991899c7-4db7-4df7-8c1e-8bcac2f511e9' or user_id='536f6508-f780-4fb7-9e27-da9573841b34'`,
  emails: `select id,event_type,status,server_queue,dedupe_key,jsonb_build_object('roomId',payload->>'roomId','contractId',payload->>'contractId','snapshotRoomId',payload#>>'{snapshot,room,id}') scope from public.email_notification_deliveries where payload::text like '%room-1791197579415-sgwfup89%' or payload::text like '%contract_991899c7-4db7-4df7-8c1e-8bcac2f511e9%' or dedupe_key like '%room-1791197579415-sgwfup89%'`,
  roomImages: `select jsonb_build_object('image_url',to_jsonb(r)->'image_url','images',to_jsonb(r)->'images') images from public.rooms r where id='room-1791197579415-sgwfup89'`,
  alternateDraftRefs: `select id,room_id,parent_contract_id from public.contract_drafts where room_id<>'room-1791197579415-sgwfup89' and (parent_contract_id='contract_991899c7-4db7-4df7-8c1e-8bcac2f511e9' or snapshot::text like '%room-1791197579415-sgwfup89%')`,
  otherRoomColumns: `select table_schema,table_name,column_name from information_schema.columns where table_schema not in ('pg_catalog','information_schema','auth') and (column_name like '%room%' or column_name like '%contract%' or column_name like '%asset%' or column_name like '%confirmation%') order by table_schema,table_name`,
  deleteTriggers: `select c.relname table_name,t.tgname,pg_get_triggerdef(t.oid) definition,p.prosrc from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and not t.tgisinternal and (t.tgtype & 8)>0 and c.relname in ('rooms','contracts','contract_drafts','contract_confirmations','contract_confirmation_events','contract_lifecycle_events','contract_test_designations','contract_cancellation_notices','contract_usage_evidence','tenant_auth_provisions','tenant_payment_cycles','tenant_payment_emails','tenant_meter_photos','tenant_meter_manual_entries','tenant_web_accounts','asset_snapshots','room_assets','room_asset_adjustments','room_vehicles')`,
}
for (const [name, query] of Object.entries(queries)) { if(process.argv.includes('--last') && !['tenant','authProfile','tenantEmailDuplicates','lifecycle','auth','mappings','emails','roomImages','alternateDraftRefs'].includes(name)) continue; console.log(JSON.stringify({name, rows: await management(env, '/database/query', {query})})) }
