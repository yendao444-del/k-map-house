import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { contractTestConfig, testManagement } from '../webmobile/scripts/contract-test-config.mjs'

const env = await contractTestConfig()
assert.equal(env.CONTRACT_TEST_PROJECT_REF, 'gsianbstkmyutnhromwc')
const schema = 'ankhang_email_test'
const tables = ['users', 'rooms', 'invoices', 'contracts', 'tenants', 'app_settings', 'email_notification_deliveries', 'payment_events', 'payment_event_keys']
const translate = s => s.replaceAll('public.', `${schema}.`).replaceAll('search_path=public', `search_path=${schema}`)
const base = translate(await readFile('supabase/migrations/20260823194717_atomic_invoice_payments.sql', 'utf8'))
const email = translate(await readFile('supabase/migrations/20261009010000_server_email_automation.sql', 'utf8')).replace(/^begin;\s*/, '').replace(/commit;\s*$/, '')
const receipts = translate(await readFile('supabase/migrations/20261009140000_tenant_payment_receipts.sql', 'utf8')).replace(/^begin;\s*/, '').replace(/commit;\s*$/, '')
const reliability = translate(await readFile('supabase/migrations/20261010123000_email_delivery_reliability.sql', 'utf8')).replace(/^begin;\s*/, '').replace(/commit;\s*$/, '')
const fixtures = `
set search_path=${schema},pg_temp;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into users(id,full_name,role,status,notification_email,email_notifications_enabled,email_notification_preferences)
values ('11111111-1111-4111-8111-111111111111','Synthetic Admin','admin','active','synthetic@example.invalid',true,'{"sepay_matched":true,"sepay_unmatched":true,"rent_overdue":true,"rent_long_unpaid":true,"room_checkout_due":true,"contract_expiring":true}');
insert into app_settings(id,account_no) values('settings','123456789');
insert into tenants(id,full_name,email,is_active) values('tenant-test','Synthetic Tenant','tenant@example.invalid',true);
insert into rooms(id,name,status,old_debt,expected_end_date) values('room-test','Phòng 999','ending',500,(now() at time zone 'Asia/Ho_Chi_Minh')::date-1);
insert into contracts(id,room_id,tenant_id,tenant_name,move_in_date,status,expiration_date)
values('contract-test','room-test','tenant-test','Synthetic Tenant','2026-01-01','active',(now() at time zone 'Asia/Ho_Chi_Minh')::date+3);
insert into invoices(id,room_id,tenant_id,month,year,total_amount,paid_amount,payment_status,payment_records,due_date,debt_confirmed_at,is_settlement)
values('olddebt001','room-test','tenant-test',9,2026,1000,0,'unpaid','[]',(now() at time zone 'Asia/Ho_Chi_Minh')::date-40,now(),false);
do $check$ declare a jsonb; count1 int; released int; claimed record; lease uuid; test_day date:=greatest((now() at time zone 'Asia/Ho_Chi_Minh')::date,date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date+14); begin
  a:=process_server_sepay(jsonb_build_object('id','disabled','amount_in',1000));
  if a->>'status'<>'disabled' then raise exception 'Disabled function wrote'; end if;
  if exists(select 1 from email_notification_deliveries) then raise exception 'Disabled trigger queued mail'; end if;
  update email_automation_settings set enabled=true,enabled_at=now()-interval '1 hour',sepay_enabled=true,sepay_started_at=now()-interval '1 hour',daily_limit=3;
  if enqueue_due_server_emails(test_day::timestamp at time zone 'Asia/Ho_Chi_Minh'+interval '7 hours')<>0 then raise exception 'Before 8AM'; end if;
  perform enqueue_due_server_emails(test_day::timestamp at time zone 'Asia/Ho_Chi_Minh'+interval '9 hours');
  if not exists(select 1 from email_notification_deliveries where payload->>'oldDebt'='true') then raise exception 'Old room debt missing alongside unpaid invoice'; end if;
  select count(*) into count1 from email_notification_deliveries;
  perform enqueue_due_server_emails(test_day::timestamp at time zone 'Asia/Ho_Chi_Minh'+interval '9 hours');
  if (select count(*) from email_notification_deliveries)<>count1 then raise exception 'Reminder duplicated'; end if;
  a:=process_server_sepay(jsonb_build_object('id','wrong-account','amount_in',1000,'transaction_date',now(),'account_number','other','transaction_content','P999T092026COLDDEBT001'));
  if a->>'status'<>'wrong_account' then raise exception 'Wrong account accepted'; end if;
  a:=process_server_sepay(jsonb_build_object('id','history','amount_in',1000,'transaction_date',now()-interval '2 hours','account_number','123456789','transaction_content','P999T092026COLDDEBT001'));
  if a->>'status'<>'historical' then raise exception 'History replayed'; end if;
  a:=process_server_sepay(jsonb_build_object('id','fraction','amount_in',1.5,'transaction_date',now(),'account_number','123456789'));
  if a->>'status'<>'ignored' then raise exception 'Fractional VND accepted'; end if;
  a:=process_server_sepay(jsonb_build_object('id','missing-amount','transaction_date',now(),'account_number','123456789'));
  if a->>'status'<>'ignored' then raise exception 'Missing amount accepted'; end if;
  a:=process_server_sepay(jsonb_build_object('id','partial','amount_in',500,'transaction_date',now(),'account_number','123456789','transaction_content','P999T092026COLDDEBT001'));
  if a->>'status'<>'partial' then raise exception 'Partial wrong'; end if;
  a:=process_server_sepay(jsonb_build_object('id','over','amount_in',1500,'transaction_date',now(),'account_number','123456789','transaction_content','P999T092026COLDDEBT001'));
  if a->>'status'<>'over' then raise exception 'Over wrong'; end if;
  if (select paid_amount from invoices where id='olddebt001')<>0 then raise exception 'Partial/over changed financial balance'; end if;
  a:=process_server_sepay(jsonb_build_object('id','match','reference_number','BANK-MATCH','amount_in',1000,'transaction_date',now(),'account_number','123456789','transaction_content','P999T092026COLDDEBT001'));
  if a->>'status'<>'recorded' or (select paid_amount from invoices where id='olddebt001')<>1000 then raise exception 'Old confirmed debt not paid'; end if;
  if (select count(*) from email_notification_deliveries where event_type='sepay_matched')<>1 then raise exception 'Receipt not queued'; end if;
  if (select count(*) from tenant_payment_receipts where status='queued')<>1
   or (select recipient_email from tenant_payment_receipts limit 1)<>'tenant@example.invalid'
   or (select recipient_email from email_notification_deliveries where event_type='sepay_matched' limit 1)<>'synthetic@example.invalid'
   then raise exception 'One payment did not produce independent tenant and landlord copies';end if;
  a:=process_server_sepay(jsonb_build_object('id','match','reference_number','bank match','amount_in',1000,'transaction_date',now(),'account_number','123456789','transaction_content','P999T092026COLDDEBT001'));
  if a->>'status'<>'duplicate' or (select count(*) from payment_events)<>1 then raise exception 'Payment duplicated'; end if;
  insert into invoices(id,room_id,tenant_id,month,year,total_amount,paid_amount,payment_status,payment_records,is_settlement) values('settlement01','room-test','tenant-test',10,2026,1000,0,'unpaid','[]',true);
  a:=process_server_sepay(jsonb_build_object('id','settlement','amount_in',1000,'transaction_date',now(),'account_number','123456789','transaction_content','P999T102026CSETTLEMENT01'));
  if a->>'status'<>'recorded' or (select status from rooms where id='room-test')<>'vacant' or (select status from contracts where id='contract-test')<>'terminated' then raise exception 'Settlement transition incomplete'; end if;
  select * into claimed from claim_server_emails(1);
  if claimed.id is null or claimed.lease_token is null then raise exception 'Queue lease missing'; end if;
  if (select reservations from email_send_budget)<>1 then raise exception 'Budget did not reserve claim'; end if;
  if exists(select 1 from claim_server_emails(1,claimed.id)) then raise exception 'Active lease claimed twice'; end if;
  if finish_server_email(claimed.id,gen_random_uuid(),'sent','fake') then raise exception 'Wrong lease accepted'; end if;
  if not finish_server_email(claimed.id,claimed.lease_token,'failed',null,'synthetic provider error') then raise exception 'Valid lease rejected'; end if;
  if exists(select 1 from claim_server_emails(1,claimed.id)) then raise exception 'Failed job retry ignored backoff'; end if;
  update email_notification_deliveries set next_attempt_at=now()-interval '1 second' where id=claimed.id;
  select lease_token into lease from claim_server_emails(1,claimed.id);
  if lease is null then raise exception 'Retry not claimed'; end if;
  if not finish_server_email(claimed.id,lease,'sent','synthetic-message') then raise exception 'Retry result not saved'; end if;
  perform * from claim_server_emails(25);
  if (select reservations from email_send_budget)<>3 or exists(select 1 from claim_server_emails(25)) then raise exception 'Daily cap exceeded'; end if;
  update users set email_notifications_enabled=false;
  if enqueue_server_email('rent_overdue','disabled-recipient','{}')<>0 then raise exception 'Opt-out ignored'; end if;
  insert into invoices(id,room_id,tenant_id,month,year,total_amount,paid_amount,payment_status,payment_records,is_settlement)
   values('tenant-only','room-test','tenant-test',10,2026,500,500,'paid',jsonb_build_array(jsonb_build_object(
    'id','tenant-only-payment','source','sepay','amount',500,'created_at',now(),'external_ref','TENANT-ONLY')),false);
  if not exists(select 1 from tenant_payment_receipts where invoice_id='tenant-only' and status='queued')
   or exists(select 1 from email_notification_deliveries where payload->>'invoiceId'='tenant-only')
   then raise exception 'Landlord opt-out incorrectly disabled tenant receipt';end if;
  update users set email_notifications_enabled=true;
  if email_preference_allowed('11111111-1111-4111-8111-111111111111','invoices_services') then raise exception 'Opt-in default wrong'; end if;
  update tenants set email='recovered@example.invalid' where id='tenant-test';
  if release_blocked_tenant_payment_receipts()<>0 then raise exception 'Unrelated blocked receipt was released'; end if;
  insert into invoices(id,room_id,tenant_id,month,year,total_amount,paid_amount,payment_status,payment_records,is_settlement)
   values('blocked-receipt','room-test','tenant-test',11,2026,600,600,'paid',jsonb_build_array(jsonb_build_object(
    'id','blocked-payment','source','sepay','amount',600,'created_at',now(),'external_ref','BLOCKED-RECEIPT')),false);
  update tenants set email='' where id='tenant-test';
  insert into invoices(id,room_id,tenant_id,month,year,total_amount,paid_amount,payment_status,payment_records,is_settlement)
   values('needs-email','room-test','tenant-test',12,2026,700,700,'paid',jsonb_build_array(jsonb_build_object(
    'id','needs-email-payment','source','sepay','amount',700,'created_at',now(),'external_ref','NEEDS-EMAIL')),false);
  if (select status from tenant_payment_receipts where invoice_id='needs-email')<>'blocked' then raise exception 'Receipt without tenant email was not blocked'; end if;
  update tenants set email='recovered@example.invalid' where id='tenant-test';
  released:=release_blocked_tenant_payment_receipts();
  if released<>1
   or (select recipient_email from tenant_payment_receipts where invoice_id='needs-email')<>'recovered@example.invalid'
   or (select status from tenant_payment_receipts where invoice_id='needs-email')<>'queued'
   then raise exception 'Blocked receipt was not requeued after tenant email was saved'; end if;
  insert into tenant_payment_cycles(id,contract_id,tenant_id,room_id,period)
   values('55555555-5555-4555-8555-555555555555','contract-test','tenant-test','room-test','2026-10-01');
  insert into tenant_payment_emails(cycle_id,kind,recipient,status,first_attempt_at,next_attempt_at)
   values('55555555-5555-4555-8555-555555555555','invoice','recovered@example.invalid','queued',now()-interval '24 hours',now()-interval '1 second');
  perform * from claim_tenant_payment_emails();
  if (select status from tenant_payment_emails where cycle_id='55555555-5555-4555-8555-555555555555')<>'failed'
   or (select next_attempt_at='infinity'::timestamptz from tenant_payment_emails where cycle_id='55555555-5555-4555-8555-555555555555') is not true
   then raise exception 'Expired monthly idempotency key was replayed'; end if;
  if has_function_privilege('authenticated','${schema}.process_server_sepay(jsonb)','EXECUTE') or has_table_privilege('anon','${schema}.email_automation_settings','SELECT') then raise exception 'Server permissions exposed'; end if;
end $check$;
grant usage on schema ${schema} to authenticated;
grant select on ${schema}.users to authenticated;
grant select,insert,update,delete on ${schema}.email_notification_deliveries to authenticated;
alter table ${schema}.email_notification_deliveries enable row level security;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',true);
set local role authenticated;
do $rls$ declare changed integer; begin
  if not exists(select 1 from ${schema}.email_notification_deliveries where server_queue) then raise exception 'Admin cannot read server history'; end if;
  update ${schema}.email_notification_deliveries set status='sent' where server_queue;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Old Electron can steal server delivery'; end if;
  insert into ${schema}.email_notification_deliveries(recipient_user_id,recipient_email,recipient_name,event_type,dedupe_key,subject)
    values('11111111-1111-4111-8111-111111111111','synthetic@example.invalid','Synthetic Admin','email_test','local-test','Synthetic local');
  if not exists(select 1 from email_delivery_history(100) where event_type='sepay_matched' and recipient_email='recovered@example.invalid') then raise exception 'Admin history omitted tenant receipts'; end if;
end $rls$;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"22222222-2222-4222-8222-222222222222"}',true);
set local role authenticated;
do $private$ begin
  perform * from email_delivery_history(1);
  raise exception 'Non-admin read tenant mail history';
exception when insufficient_privilege then null;
end $private$;
reset role;
select jsonb_build_object('passed',true,'assertions',26,'syntheticPayments',(select count(*) from payment_events),'syntheticEmailsQueued',(select count(*) from email_notification_deliveries),'rollback',true) result;
rollback;
`
const checks = (fixtures.match(/raise exception/g) || []).length
const query = `begin; create schema ${schema}; ${tables.map(t=>`create table ${schema}.${t} (like ankhang_contract_test.${t} including all);`).join('\n')} create table ${schema}.tenant_web_accounts(tenant_id text primary key,email text,status text); create table ${schema}.tenant_payment_cycles(id uuid primary key,contract_id text,tenant_id text,room_id text,period date); create table ${schema}.tenant_payment_emails(id uuid primary key default gen_random_uuid(),cycle_id uuid,kind text,recipient text,status text,attempts integer default 0,lease uuid,lease_until timestamptz,next_attempt_at timestamptz default now(),provider_id text,sent_at timestamptz,error text,created_at timestamptz default now()); create unique index email_test_dedupe on ${schema}.email_notification_deliveries(dedupe_key); ${base}\n${email}\n${receipts}\n${reliability}\n${fixtures.replace("'assertions',26", "'assertions',"+checks)}`
const result = await testManagement(env, '/database/query', {query})
assert.equal(result[0]?.result?.passed, true)
await mkdir('docs/email-automation', {recursive:true})
await writeFile('docs/email-automation/database-test.json',JSON.stringify({project:env.CONTRACT_TEST_PROJECT_REF,at:new Date().toISOString(),...result[0].result},null,2)+'\n')
console.log(`${checks} isolated database assertions passed; synthetic schema and data rolled back; no mail sent.`)
