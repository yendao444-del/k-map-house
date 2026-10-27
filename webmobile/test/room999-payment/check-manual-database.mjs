import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {root} from '../../scripts/private-config.mjs'
import {contractTestConfig,testManagement} from '../../scripts/contract-test-config.mjs'
const env=await contractTestConfig(),schema='ankhang_manual_qa'
const translate=s=>s.replaceAll('public.',schema+'.').replaceAll('search_path=public',`search_path=${schema}`).replace(/^\s*(?:begin|commit);\s*$/gmi,'')
const oldTest=await readFile(path.join(root,'scripts/test-tenant-payment-database.mjs'),'utf8')
const fixtures=oldTest.split('const fixtures=`')[1].split('do $check$')[0].replaceAll('${schema}',schema)
const files=['20260823194717_atomic_invoice_payments.sql','20261009010000_server_email_automation.sql','20261009020000_tenant_monthly_payment.sql','20261009100000_tenant_meter_manual_fallback.sql']
const migrations=[];for(const file of files)migrations.push(translate(await readFile(path.join(root,'../supabase/migrations',file),'utf8')))
const tables=['users','rooms','tenants','service_zones','invoices','contracts','app_settings','tenant_web_accounts','email_notification_deliveries','payment_events','payment_event_keys']
const checks=`
do $check$ declare cy uuid; r jsonb; begin
 cy:=ensure_tenant_payment_cycle('22222222-2222-4222-8222-222222222222','contract-qa');
 begin perform tenant_payment_fallback('22222222-2222-4222-8222-222222222222','contract-qa',cy,'manual','{"meter":"electric","reading":121}');raise exception 'Early manual accepted';exception when others then if sqlerrm='Early manual accepted' then raise;end if;end;
 perform tenant_payment_fallback('22222222-2222-4222-8222-222222222222','contract-qa',cy,'ocr_failure','{"meter":"electric"}');
 begin perform tenant_payment_fallback('22222222-2222-4222-8222-222222222222','contract-qa',cy,'manual','{"meter":"electric","reading":121}');raise exception 'One failure accepted';exception when others then if sqlerrm='One failure accepted' then raise;end if;end;
 perform tenant_payment_fallback('22222222-2222-4222-8222-222222222222','contract-qa',cy,'ocr_failure','{"meter":"electric"}');
 r:=tenant_payment_fallback('22222222-2222-4222-8222-222222222222','contract-qa',cy,'manual','{"meter":"electric","reading":121}');
 if r->>'source'<>'manual' or (select electric_new from tenant_payment_cycles where id=cy)<>121 then raise exception 'Manual not stored';end if;
 if (select count(*) from tenant_meter_manual_entries)<>1 or exists(select 1 from tenant_meter_photos) then raise exception 'Audit or photo wrong';end if;
 begin perform tenant_payment_fallback('22222222-2222-4222-8222-222222222222','contract-qa',cy,'manual','{"meter":"water","reading":13}');raise exception 'Meter gate leaked';exception when others then if sqlerrm='Meter gate leaked' then raise;end if;end;
 begin perform tenant_payment_fallback('22222222-2222-4222-8222-222222222222','contract-qa',cy,'manual','{"meter":"water","reading":1,"cameraError":true}');raise exception 'Lower accepted';exception when others then if sqlerrm='Lower accepted' then raise;end if;end;
 begin perform tenant_payment_fallback('22222222-2222-4222-8222-222222222222','contract-qa',cy,'manual','{"meter":"water","reading":99999,"cameraError":true}');raise exception 'Spike accepted';exception when others then if sqlerrm='Spike accepted' then raise;end if;end;
 begin perform tenant_payment_fallback('33333333-3333-4333-8333-333333333333','contract-qa',cy,'manual','{"meter":"water","reading":13,"cameraError":true}');raise exception 'Wrong user accepted';exception when others then if sqlerrm='Wrong user accepted' then raise;end if;end;
 r:=tenant_payment_fallback('22222222-2222-4222-8222-222222222222','contract-qa',cy,'manual','{"meter":"water","reading":13,"cameraError":true}');
 if (select water_source from tenant_payment_cycles where id=cy)<>'manual' or not exists(select 1 from tenant_meter_manual_entries where reason='camera_unavailable') then raise exception 'Camera audit missing';end if;
 update contracts set revision_no=2 where id='contract-qa';
 begin perform tenant_payment_fallback('22222222-2222-4222-8222-222222222222','contract-qa',cy,'manual','{"meter":"electric","reading":121}');raise exception 'Revision accepted';exception when others then if sqlerrm='Revision accepted' then raise;end if;end;
end $check$;
select jsonb_build_object('passed',true,'rollback',true,'manualEntries',(select count(*) from tenant_meter_manual_entries)) result;
rollback;`
const sql=`begin;drop schema if exists ${schema} cascade;create schema ${schema};${tables.map(t=>`create table ${schema}.${t} (like ankhang_contract_test.${t} including all);`).join('\n')}create unique index manual_qa_email_dedupe on ${schema}.email_notification_deliveries(dedupe_key);${migrations.join('\n')}${fixtures}${checks}`
// Only this script's disposable schema on the explicitly guarded TEST project.
await testManagement(env,'/database/query',{query:`drop schema if exists ${schema} cascade`})
const result=await testManagement(env,'/database/query',{query:sql})
assert.equal(result[0]?.result?.passed,true)
const remains=await testManagement(env,'/database/query',{query:`select exists(select 1 from pg_namespace where nspname='${schema}') present`})
assert.equal(remains[0]?.present,false,'Synthetic schema was not rolled back')
await writeFile(path.join(root,'test/room999-payment/artifacts/manual-database.json'),JSON.stringify({project:env.CONTRACT_TEST_PROJECT_REF,...result[0].result,at:new Date().toISOString(),productionChanged:false},null,2))
console.log('Manual fallback SQL checks passed in isolated test project; all test data rolled back.')
