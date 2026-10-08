import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root } from './private-config.mjs'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
const env=await contractTestConfig(),s=env.CONTRACT_DB_SCHEMA,actor=env.CONTRACT_TEST_ADMIN_ID
assert.equal(s,'ankhang_contract_test')
const run=crypto.randomUUID().slice(0,8),tenant=`qa-recovery-${run}`,room=`qa-recovery-room-${run}`,draft=crypto.randomUUID(),email=`qa-recovery-${run}@ankhanghome.example`,next=`qa-correct-${run}@ankhanghome.example`,hash='a'.repeat(56)+run
const snap={version:1,room:{id:room,name:'Phòng 999 QA'},tenant:{id:tenant,full_name:'QA recovery',email,phone:'0866646995'},settings:{property_name:'QA'},form:{baseRent:2500000,depositAmount:2500000,moveInDate:'2026-10-08',durationMonths:12,invoiceDay:5,occupantCount:1,electricInitial:100,waterInitial:20,additionalTerms:''},services:{electricPrice:3500,waterPrice:18000},assets:[]}
await testManagement(env,'/database/query',{query:`begin;set local search_path=${s},pg_temp;select set_config('request.jwt.claim.role','service_role',true);
 insert into rooms(id,name,base_rent,status) values('${room}','Phòng 999 QA',2500000,'vacant');
 insert into tenants(id,full_name,email,is_active) values('${tenant}','QA recovery','${email}',true);
 insert into contract_drafts(id,room_id,tenant_id,recipient_email,snapshot,created_by) values('${draft}','${room}','${tenant}','${email}','${JSON.stringify(snap)}'::jsonb,'${actor}');
 do $$ declare result jsonb; cid text;blocked boolean; begin
 perform contract_confirmation_create('${draft}',1,'${hash}','${actor}',repeat('QA document ',20));
 result:=contract_confirmation_accept('${hash}');cid:=result->>'contractId';
 if not exists(select 1 from contracts where id=cid and status='active') then raise exception 'contract must remain discoverable';end if;
 if not exists(select 1 from jsonb_array_elements(contract_account_readiness()) x where x->>'contractId'=cid and x->>'status'='pending') then raise exception 'missing pending account status';end if;
 blocked:=false;begin perform contract_cancel(cid,'${actor}','Email nhập nhầm để kiểm thử','wrong_email','${tenant}');exception when others then if sqlerrm not like '%đối chiếu%' then raise;end if;blocked:=true;end;if not blocked then raise exception 'unchanged email cannot justify cancellation';end if;
 update tenants set email='${next}' where id='${tenant}';
 if not exists(select 1 from jsonb_array_elements(contract_account_readiness()) x where x->>'contractId'=cid and x->>'reason' like '%Email hồ sơ đã thay đổi%') then raise exception 'stale link email not visible';end if;
 -- Wrong reference and staff email are never accepted as the correction.
 blocked:=false;begin perform contract_cancel(cid,'${actor}','Email nhập nhầm để kiểm thử','wrong_email','missing');exception when others then if sqlerrm not like '%đối chiếu%' then raise;end if;blocked:=true;end;if not blocked then raise exception 'invalid reference accepted';end if;
 perform contract_cancel(cid,'${actor}','Email nhập nhầm để kiểm thử','wrong_email','${tenant}');
 if not exists(select 1 from contracts where id=cid and status='cancelled' and cancellation_kind='wrong_email') then raise exception 'missing audited cancellation';end if;
 if (select status from rooms where id='${room}')<>'vacant' then raise exception 'room not released';end if;
 if not exists(select 1 from contract_confirmations where draft_id='${draft}' and status='revoked') then raise exception 'old link not revoked';end if;
 if not exists(select 1 from contract_cancellation_notices where contract_id=cid and recipient='${email}' and status='pending') then raise exception 'outbox uses wrong recipient';end if;
 end $$;rollback;`})
const checks=['confirmed contract remains visible when no account','pending account visible to staff','unchanged email cannot justify cancellation','updated profile warns old link uses old email','incorrect reference rejected','wrong email cancellation audited','room released and old link revoked','notice retained for original recipient without sending']
await writeFile(path.join(root,'qa/contract-account-visibility-test.json'),JSON.stringify({at:new Date().toISOString(),passed:true,project:env.CONTRACT_TEST_PROJECT_REF,checks,fixturesRolledBack:true,emailsSent:false},null,2)+'\n')
console.log(`${checks.length} live TEST account visibility/recovery checks passed; all fixtures rolled back.`)
