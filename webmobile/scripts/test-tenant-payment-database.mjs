import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {contractTestConfig,testManagement} from './contract-test-config.mjs'
const env=await contractTestConfig(), schema='ankhang_payment_qa'
const translate=s=>s.replaceAll('public.',schema+'.').replaceAll('search_path=public',`search_path=${schema}`).replace(/^begin;\s*/,'').replace(/commit;\s*$/,'')
const tables=['users','rooms','tenants','service_zones','invoices','contracts','app_settings','tenant_web_accounts','email_notification_deliveries','payment_events','payment_event_keys']
const base=translate(await readFile('supabase/migrations/20260823194717_atomic_invoice_payments.sql','utf8'))
const email=translate(await readFile('supabase/migrations/20261009010000_server_email_automation.sql','utf8'))
const payment=translate(await readFile('supabase/migrations/20261009020000_tenant_monthly_payment.sql','utf8'))
const manual=translate(await readFile('supabase/migrations/20261009100000_tenant_meter_manual_fallback.sql','utf8'))
const fixtures=`
set search_path=${schema},pg_temp;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into users(id,full_name,role,status) values('11111111-1111-4111-8111-111111111111','QA Admin','admin','active');
insert into tenants(id,full_name,is_active) values('tenant-qa','QA Tenant',true),('old-tenant','Old Tenant',true);
insert into service_zones(id,name,electric_price,water_price,internet_price,cleaning_price) values('zone-qa','QA',3200,35000,50000,70000);
insert into rooms(id,name,status,base_rent,service_zone_id,electric_new,water_new) values('room-qa','999','occupied',3500000,'zone-qa',999,999);
insert into contracts(id,room_id,tenant_id,tenant_name,move_in_date,status,base_rent,electric_init,water_init,invoice_day,billing_cycle,is_migration,created_at,revision_no)
 values('contract-qa','room-qa','tenant-qa','QA Tenant','2026-01-01','active',3500000,100,10,1,1,true,'2026-01-01',1);
insert into tenant_web_accounts(tenant_id,auth_user_id,email,status) values('tenant-qa','22222222-2222-4222-8222-222222222222','synthetic@example.invalid','active');
insert into app_settings(id,bank_id,account_no,account_name) values('default','BIDV','123456789','DO KIM NGAN');
insert into invoices(id,room_id,tenant_id,month,year,billing_reason,billing_period_start,billing_period_end,electric_new,water_new,total_amount,paid_amount,payment_status,created_at)
 values('old-tenant-invoice','room-qa','old-tenant',9,2026,'monthly','2026-09-01','2026-09-30',999,999,999,0,'paid','2026-09-01');
insert into invoices(id,room_id,tenant_id,month,year,billing_reason,billing_period_start,billing_period_end,electric_old,electric_new,electric_usage,water_old,water_new,water_usage,total_amount,paid_amount,payment_status,created_at)
 values('qa-prev','room-qa','tenant-qa',extract(month from now()-interval '1 month'),extract(year from now()-interval '1 month'),'monthly',(date_trunc('month',now())-interval '1 month')::date,date_trunc('month',now())::date-1,100,120,20,10,12,2,1000,1000,'paid',now()-interval '1 month');
update email_automation_settings set enabled=true,enabled_at=now()-interval '1 hour',sepay_enabled=true,sepay_started_at=now()-interval '1 hour';
do $check$ declare s jsonb; cy uuid; a jsonb; e uuid; w uuid; inv text; n int; amount int; code text; begin
 s:=tenant_payment_state('22222222-2222-4222-8222-222222222222','contract-qa');
 cy:=(s->'cycle'->>'id')::uuid;
 if cy is null or (s->'cycle'->>'electric_old')::int<>120 or (s->'cycle'->>'water_old')::int<>12 then raise exception 'Wrong initial scope/readings';end if;
 if exists(select 1 from jsonb_array_elements(s->'invoices') v where v->>'id'='old-tenant-invoice') then raise exception 'Old tenancy leaked';end if;
 if ensure_tenant_payment_cycle('22222222-2222-4222-8222-222222222222','contract-qa')<>cy then raise exception 'Cycle duplicated';end if;
 begin perform tenant_payment_state('33333333-3333-4333-8333-333333333333','contract-qa');raise exception 'wrong account accepted';exception when others then if sqlerrm='wrong account accepted' then raise;end if;end;
 begin perform tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'create');raise exception 'unconfirmed accepted';exception when others then if sqlerrm='unconfirmed accepted' then raise;end if;end;
 begin perform tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'photo','{"meter":"electric","reading":119,"image":"qa"}');raise exception 'lower reading accepted';exception when others then if sqlerrm='lower reading accepted' then raise;end if;end;
 begin perform tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'photo','{"meter":"water","reading":99999,"image":"qa"}');raise exception 'abnormal accepted';exception when others then if sqlerrm='abnormal accepted' then raise;end if;end;
 a:=tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'photo','{"meter":"electric","reading":130,"image":"qa"}');e:=(a->>'reviewToken')::uuid;
 begin perform tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'confirm',jsonb_build_object('meter','water','reading',13,'reviewToken',e));raise exception 'swapped photo accepted';exception when others then if sqlerrm='swapped photo accepted' then raise;end if;end;
 perform tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'confirm',jsonb_build_object('meter','electric','reading',131,'reviewToken',e));
 if (select electric_source from tenant_payment_cycles where id=cy)<>'manual' then raise exception 'Correction audit missing';end if;
 s:=tenant_payment_state('22222222-2222-4222-8222-222222222222','contract-qa');
 if (s->'cycle'->>'electric_new')::int<>131 then raise exception 'Progress not durable';end if;
 a:=tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'photo','{"meter":"water","reading":13,"image":"qa"}');w:=(a->>'reviewToken')::uuid;
 update tenant_meter_photos set expires_at=now()-interval '1 minute' where token=w;
 begin perform tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'confirm',jsonb_build_object('meter','water','reading',13,'reviewToken',w));raise exception 'expired accepted';exception when others then if sqlerrm='expired accepted' then raise;end if;end;
 update tenant_meter_photos set expires_at=now()+interval '1 minute' where token=w;
 perform tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'confirm',jsonb_build_object('meter','water','reading',13,'reviewToken',w));
 update contracts set revision_no=2 where id='contract-qa';
 begin perform tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'create');raise exception 'changed contract accepted';exception when others then if sqlerrm='changed contract accepted' then raise;end if;end;
 update contracts set revision_no=1 where id='contract-qa';
 a:=tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'create');inv:=a->>'invoiceId';
 select total_amount into amount from invoices where id=inv;
 if amount<>3500000+50000+70000+11*3200+35000 then raise exception 'Incorrect total';end if;
 a:=tenant_payment_write('22222222-2222-4222-8222-222222222222','contract-qa',cy,'create');
 if a->>'invoiceId'<>inv or (select count(*) from invoices where web_contract_id='contract-qa')<>1 then raise exception 'Invoice duplicated';end if;
 code:='P999T'||to_char(now() at time zone 'Asia/Ho_Chi_Minh','MMYYYY')||'C'||right(regexp_replace(upper(inv),'[^A-Z0-9]','','g'),12);
 a:=process_server_sepay(jsonb_build_object('id','wrong-account','amount_in',amount,'transaction_date',now(),'account_number','wrong','transaction_content',code));
 if a->>'status'<>'wrong_account' then raise exception 'Wrong bank accepted';end if;
 a:=process_server_sepay(jsonb_build_object('id','partial','amount_in',amount-1,'transaction_date',now(),'account_number','123456789','transaction_content',code));
 if a->>'status'<>'partial' or (select paid_amount from invoices where id=inv)<>0 then raise exception 'Partial marked paid';end if;
 a:=process_server_sepay(jsonb_build_object('id','over','amount_in',amount+1,'transaction_date',now(),'account_number','123456789','transaction_content',code));
 if a->>'status'<>'over' then raise exception 'Overpayment mishandled';end if;
 a:=process_server_sepay(jsonb_build_object('id','exact','amount_in',amount,'transaction_date',now(),'account_number','123456789','transaction_content',code));
 if a->>'status'<>'recorded' or (select payment_status from invoices where id=inv)<>'paid' then raise exception 'Exact payment not recorded';end if;
 a:=process_server_sepay(jsonb_build_object('id','exact','amount_in',amount,'transaction_date',now(),'account_number','123456789','transaction_content',code));
 if a->>'status'<>'duplicate' or (select count(*) from payment_events where invoice_id=inv)<>1 then raise exception 'SePay duplicated';end if;
 perform queue_tenant_payment_emails();select count(*) into n from tenant_payment_emails;perform queue_tenant_payment_emails();
 if (select count(*) from tenant_payment_emails)<>n or not exists(select 1 from tenant_payment_emails where kind='receipt') then raise exception 'Receipt queue wrong';end if;
 update tenant_web_accounts set status='locked' where tenant_id='tenant-qa';
 begin perform tenant_payment_state('22222222-2222-4222-8222-222222222222','contract-qa');raise exception 'locked account accepted';exception when others then if sqlerrm='locked account accepted' then raise;end if;end;
end $check$;
select jsonb_build_object('passed',true,'invoiceCount',(select count(*) from invoices where web_contract_id='contract-qa'),'paymentCount',(select count(*) from payment_events),'rollback',true) result;
rollback;`
const sql=`begin; create schema ${schema}; ${tables.map(t=>`create table ${schema}.${t} (like ankhang_contract_test.${t} including all);`).join('\n')} create unique index payment_qa_email_dedupe on ${schema}.email_notification_deliveries(dedupe_key); ${base}\n${email}\n${payment}\n${manual}\n${fixtures}`
const result=await testManagement(env,'/database/query',{query:sql})
assert.equal(result[0]?.result?.passed,true)
const assertions=(fixtures.match(/raise exception/g)||[]).length
await writeFile('webmobile/qa/tenant-payment-database.json',JSON.stringify({project:env.CONTRACT_TEST_PROJECT_REF,at:new Date().toISOString(),assertions,...result[0].result,emailsSent:false},null,2)+'\n')
console.log('Tenant billing, scope, OCR evidence, receipt and SePay checks passed on isolated project; all synthetic data rolled back.')
