import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root } from './private-config.mjs'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
const env=await contractTestConfig(),s=env.CONTRACT_DB_SCHEMA,actor=env.CONTRACT_TEST_ADMIN_ID
assert.equal(s,'ankhang_contract_test')
const run=crypto.randomUUID().slice(0,8),tenant=`qa-no-notice-${run}`,room=`${tenant}-room`,draft=crypto.randomUUID(),email=`${tenant}@ankhanghome.example`,hash='b'.repeat(56)+run
const snap={version:1,room:{id:room,name:'Phòng 999 QA'},tenant:{id:tenant,full_name:'QA test cancellation',email},settings:{property_name:'QA'},form:{baseRent:2500000,depositAmount:2500000,moveInDate:'2026-10-08',durationMonths:12,invoiceDay:5,occupantCount:1,electricInitial:100,waterInitial:20,additionalTerms:''},services:{electricPrice:3500,waterPrice:18000},assets:[]}
await testManagement(env,'/database/query',{query:`begin;set local search_path=${s},pg_temp;
 insert into rooms(id,name,base_rent,status) values('${room}','Phòng 999 QA',2500000,'vacant');
 insert into tenants(id,full_name,email,is_active) values('${tenant}','QA test cancellation','${email}',true);
 insert into contract_drafts(id,room_id,tenant_id,recipient_email,snapshot,created_by) values('${draft}','${room}','${tenant}','${email}','${JSON.stringify(snap)}'::jsonb,'${actor}');
 do $$ declare result jsonb; cid text;blocked boolean; begin
 perform contract_confirmation_create('${draft}',1,'${hash}','${actor}',repeat('QA document ',20));
 result:=contract_confirmation_accept('${hash}');cid:=result->>'contractId';
 blocked:=false;begin perform contract_cancel(cid,'${actor}',null,'test_reset',null);exception when others then if sqlerrm not like '%đánh dấu thử nghiệm%' then raise;end if;blocked:=true;end;
 if not blocked then raise exception 'unmarked contract accepted as test';end if;
 insert into contract_test_designations(contract_id,room_id,tenant_id,reason) values(cid,'${room}','${tenant}','QA isolated fixture');
 insert into invoices(id,room_id,tenant_id,month,year,total_amount,payment_status,paid_amount) values('${tenant}-invoice','${room}','${tenant}',10,2026,2500000,'unpaid',0);
 blocked:=false;begin perform contract_cancel(cid,'${actor}',null,'test_reset',null);exception when others then if sqlerrm not like '%hóa đơn%' then raise;end if;blocked:=true;end;
 if not blocked then raise exception 'test bypassed invoice guard';end if;
 update invoices set payment_status='cancelled' where id='${tenant}-invoice';
 perform contract_cancel(cid,'${actor}',null,'test_reset',null);
 if not exists(select 1 from contracts where id=cid and status='cancelled' and cancellation_kind='test_reset' and cancellation_reason like '%Đang kiểm thử hệ thống.%') then raise exception 'fixed test reason missing';end if;
 if exists(select 1 from contract_cancellation_notices where contract_id=cid) then raise exception 'test created a notification outbox row';end if;
 if (select status from rooms where id='${room}')<>'vacant' then raise exception 'room not released';end if;
 if not exists(select 1 from contract_confirmations where draft_id='${draft}' and status='revoked') then raise exception 'old link not revoked';end if;
 perform contract_cancel(cid,'${actor}',null,'test_reset',null);
 if (select count(*) from contract_lifecycle_events where contract_id=cid and event_type='cancelled')<>1 then raise exception 'duplicate cancellation event';end if;
 -- Simulate legacy queued test notification; no sender may claim it.
 insert into contract_cancellation_notices(contract_id,recipient,tenant_name,room_name,reason,cancelled_at) values(cid,'${email}','QA','999','Legacy test',now());
 result:=contract_cancellation_notice('', '${actor}', 'list');
 if result @> jsonb_build_array(cid) then raise exception 'legacy test notice still listed';end if;
 result:=contract_cancellation_notice(cid,'${actor}','claim');
 if (result->>'claimed')::boolean or result->>'status'<>'suppressed' then raise exception 'legacy test notice still claimable';end if;
 end $$;rollback;`})
const checks=['unmarked contracts cannot use test reason','test cannot bypass invoice checks','no custom reason or reference needed','fixed reason audited','no test notification outbox row','room released and old link revoked','retry does not duplicate cancellation','legacy pending test notice excluded from list','legacy test notice cannot be claimed']
await writeFile(path.join(root,'qa/contract-test-without-notice-test.json'),JSON.stringify({at:new Date().toISOString(),passed:true,project:env.CONTRACT_TEST_PROJECT_REF,checks,fixturesRolledBack:true,emailsSent:false},null,2)+'\n')
console.log(`${checks.length} live TEST cancellation checks passed; fixtures rolled back; no email sent.`)
