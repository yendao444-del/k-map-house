import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { contractTestConfig, testManagement } from '../webmobile/scripts/contract-test-config.mjs'

const env = await contractTestConfig()
const schema = 'ankhang_receipt_test'
const source = await readFile('supabase/migrations/20261009140000_tenant_payment_receipts.sql', 'utf8')
const migration = source.replaceAll('public.', `${schema}.`).replaceAll('search_path=public', `search_path=${schema}`)
  .replace(/^begin;\s*/, '').replace(/commit;\s*$/, '')
const fixtures = `
begin;
create schema ${schema};
set search_path=${schema},pg_temp;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create table users(id uuid primary key,email text,notification_email text);
create table tenants(id text primary key,full_name text,email text,is_active boolean);
create table rooms(id text primary key,name text);
create table tenant_web_accounts(tenant_id text primary key,email text,status text);
create table invoices(id text primary key,room_id text,tenant_id text,month int,year int,total_amount int,
 paid_amount int,payment_status text,payment_records jsonb default '[]');
create table email_automation_settings(id boolean primary key,enabled boolean,daily_limit int);
create table email_send_budget(day date primary key,reservations int default 0);
insert into email_automation_settings values(true,false,3);
insert into tenants values('tenant','Synthetic Tenant','tenant@example.invalid',true),
 ('missing','Missing Email','',true),('inactive','Inactive','inactive@example.invalid',false),
 ('portal','Portal Tenant','older@example.invalid',true),('system','System conflict','owner@example.invalid',true);
insert into users values('11111111-1111-4111-8111-111111111111','admin@example.invalid','owner@example.invalid');
insert into rooms values('room','Phòng 999');
insert into tenant_web_accounts values('portal','portal@example.invalid','active');
${migration}
do $checks$ declare jobs int; j record; token uuid; begin
 if tenant_receipt_address('tenant')<>'tenant@example.invalid' then raise exception 'Contact-only tenant address missing';end if;
 if tenant_receipt_address('portal')<>'portal@example.invalid' then raise exception 'Portal address not preferred';end if;
 if tenant_receipt_address('missing') is not null then raise exception 'Missing email allowed';end if;
 if tenant_receipt_address('inactive') is not null then raise exception 'Inactive tenant allowed';end if;
 if tenant_receipt_address('system') is not null then raise exception 'Landlord contact treated as tenant';end if;
 update tenant_web_accounts set status='locked' where tenant_id='portal';
 if tenant_receipt_address('portal') is not null then raise exception 'Locked portal fell back to contact';end if;
 update tenant_web_accounts set status='active' where tenant_id='portal';
 insert into invoices values('bill','room','tenant',9,2026,1000,0,'unpaid','[]');
 update invoices set payment_records=jsonb_build_array(jsonb_build_object('id','disabled','source','sepay','amount',1000,'created_at',now(),'external_ref','disabled')) where id='bill';
 if exists(select 1 from tenant_payment_receipts) then raise exception 'Disabled automation queued tenant mail';end if;
 update email_automation_settings set enabled=true;
 update tenant_payment_receipt_settings set started_at=now()-interval '1 hour';
 update invoices set payment_records=payment_records||jsonb_build_array(jsonb_build_object('id','history','source','sepay','amount',1000,'created_at',now()-interval '2 hours','external_ref','history')) where id='bill';
 if exists(select 1 from tenant_payment_receipts) then raise exception 'Historical payment replayed';end if;
 update invoices set payment_records=payment_records||jsonb_build_array(jsonb_build_object('id','cash','source','manual','amount',1000,'created_at',now(),'external_ref','cash')) where id='bill';
 if exists(select 1 from tenant_payment_receipts) then raise exception 'Manual payment mislabeled SePay';end if;
 update invoices set paid_amount=1000,payment_status='paid',payment_records=payment_records||jsonb_build_array(jsonb_build_object('id','match','source','sepay','amount',1000,'created_at',now(),'external_ref','bank match')) where id='bill';
 if (select count(*) from tenant_payment_receipts)<>1 then raise exception 'New payment not queued once';end if;
 if (select recipient_email from tenant_payment_receipts)<>'tenant@example.invalid' then raise exception 'Wrong tenant recipient';end if;
 if (select payload->'invoice'->>'month' from tenant_payment_receipts)<>'9' then raise exception 'Old invoice snapshot lost';end if;
 update invoices set payment_records=payment_records where id='bill';
 if (select count(*) from tenant_payment_receipts)<>1 then raise exception 'Repeated invoice update duplicated mail';end if;
 if not tenant_receipt_supersedes('bill') then raise exception 'Monthly receipt could duplicate';end if;
 select * into j from claim_tenant_payment_receipts(1);
 if j.id is null or j.lease_token is null then raise exception 'Lease missing';end if;
 if not tenant_payment_receipt_valid(j.id,j.lease_token) then raise exception 'Correct payment invalid';end if;
 if exists(select 1 from claim_tenant_payment_receipts(1)) then raise exception 'Active lease reclaimed';end if;
 if tenant_payment_receipt_valid(j.id,gen_random_uuid()) then raise exception 'Wrong lease validates';end if;
 update tenants set email='changed@example.invalid' where id='tenant';
 if tenant_payment_receipt_valid(j.id,j.lease_token) then raise exception 'Changed email redirected queued invoice';end if;
 update tenants set email='tenant@example.invalid' where id='tenant';
 update invoices set tenant_id='missing' where id='bill';
 if tenant_payment_receipt_valid(j.id,j.lease_token) then raise exception 'Changed invoice tenant received old mail';end if;
 update invoices set tenant_id='tenant',payment_status='cancelled' where id='bill';
 if tenant_payment_receipt_valid(j.id,j.lease_token) then raise exception 'Cancelled invoice sent';end if;
 update invoices set payment_status='paid' where id='bill';
 if finish_tenant_payment_receipt(j.id,gen_random_uuid(),'sent','wrong') then raise exception 'Wrong finish lease accepted';end if;
 if not finish_tenant_payment_receipt(j.id,j.lease_token,'failed',null,'Synthetic rejection') then raise exception 'Valid finish rejected';end if;
 if exists(select 1 from claim_tenant_payment_receipts(1)) then raise exception 'Backoff ignored';end if;
 update tenant_payment_receipts set next_attempt_at=now()-interval '1 second' where id=j.id;
 select lease_token into token from claim_tenant_payment_receipts(1);
 if token is null then raise exception 'Retry not claimed';end if;
 if not finish_tenant_payment_receipt(j.id,token,'sent','synthetic-provider') then raise exception 'Sent persistence failed';end if;
 insert into invoices values('missing-bill','room','missing',10,2026,1000,1000,'paid',
  jsonb_build_array(jsonb_build_object('id','missing-match','source','sepay','amount',1000,'created_at',now(),'external_ref','missing-bank')));
 if (select status from tenant_payment_receipts where invoice_id='missing-bill')<>'blocked' then raise exception 'Missing email not recorded as blocked';end if;
 if exists(select 1 from claim_tenant_payment_receipts(25)) then raise exception 'Missing email job claimed';end if;
 insert into invoices values('second','room','tenant',10,2026,1000,1000,'paid',
  jsonb_build_array(jsonb_build_object('id','second-match','source','sepay','amount',1000,'created_at',now(),'external_ref','second-bank')));
 perform * from claim_tenant_payment_receipts(25);
 if (select reservations from email_send_budget)<>3 then raise exception 'Shared daily budget wrong';end if;
 insert into invoices values('third','room','tenant',10,2026,1000,1000,'paid',
  jsonb_build_array(jsonb_build_object('id','third-match','source','sepay','amount',1000,'created_at',now(),'external_ref','third-bank')));
 if exists(select 1 from claim_tenant_payment_receipts(25)) then raise exception 'Shared daily limit exceeded';end if;
 update email_automation_settings set daily_limit=90;
 update tenant_payment_receipts set first_attempt_at=now()-interval '24 hours' where invoice_id='third';
 if exists(select 1 from claim_tenant_payment_receipts(25)) then raise exception 'Expired provider idempotency replayed';end if;
 if has_table_privilege('authenticated','${schema}.tenant_payment_receipts','SELECT') or has_function_privilege('anon','${schema}.claim_tenant_payment_receipts(integer)','EXECUTE') then raise exception 'Private tenant invoice exposed';end if;
end $checks$;
select jsonb_build_object('passed',true,'assertions',35,'rollback',true,'emailSent',false) result;
rollback;
`
const assertions = (fixtures.match(/raise exception/g) || []).length
const result = await testManagement(env, '/database/query', { query: fixtures.replace("'assertions',35", "'assertions'," + assertions) })
assert.equal(result[0]?.result?.passed, true)
await writeFile('docs/email-automation/tenant-receipt-database-test.json', JSON.stringify({
  project: env.CONTRACT_TEST_PROJECT_REF, at: new Date().toISOString(),
  migrationSha256: createHash('sha256').update(source).digest('hex'), ...result[0].result
}, null, 2) + '\n')
console.log(`${assertions} tenant receipt SQL assertions passed in isolated test schema; rolled back; no email sent.`)
