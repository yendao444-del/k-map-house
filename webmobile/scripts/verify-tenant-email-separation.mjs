import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { root } from './private-config.mjs'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
const env=await contractTestConfig(),s=env.CONTRACT_DB_SCHEMA,actor=env.CONTRACT_TEST_ADMIN_ID
assert.equal(s,'ankhang_contract_test')
const run=crypto.randomUUID().slice(0,8),tenant=`qa-email-${run}`,room=`qa-email-room-${run}`,draft=crypto.randomUUID(),portal=crypto.randomUUID()
const email=`qa-email-${run}@ankhanghome.example`,hash='e'.repeat(56)+run
const snapshot={version:1,room:{id:room,name:'QA email'},tenant:{id:tenant,full_name:'QA email',email},settings:{property_name:'QA'},form:{baseRent:2500000,depositAmount:2500000,moveInDate:'2026-10-08',durationMonths:12,invoiceDay:5,occupantCount:1,electricInitial:100,waterInitial:20,additionalTerms:''},services:{electricPrice:3500,waterPrice:18000},assets:[]}
const esc=x=>String(x).replaceAll("'","''")
const denied=sql=>`blocked:=false;begin ${sql}; exception when others then if sqlerrm not like '%tài khoản hệ thống%' and sqlerrm not like '%Tài khoản hệ thống%' then raise; end if; blocked:=true;end;if not blocked then raise exception 'Expected system-email rejection';end if;`
const query=`begin;set local search_path=${s},pg_temp;
do $$ declare staff_email text;blocked boolean;answer jsonb;cid text; begin
 select email into staff_email from users where id='${actor}';
 if not tenant_system_email_conflict('  '||upper(staff_email)||'  ') then raise exception 'case/trim lookup failed';end if;
 update users set status='inactive' where id='${actor}';
 if not tenant_system_email_conflict(staff_email) then raise exception 'inactive staff must reserve email';end if;
 update users set status='active' where id='${actor}';
 ${denied(`insert into tenants(id,full_name,email,is_active) values('${tenant}','QA',upper(staff_email),true)`)}
 insert into tenants(id,full_name,email,is_active) values('${tenant}','QA','${email}',true);
 ${denied(`update tenants set email='  '||upper(staff_email)||'  ' where id='${tenant}'`)}
 insert into rooms(id,name,base_rent,status) values('${room}','QA email',2500000,'vacant');
 ${denied(`insert into contract_drafts(room_id,tenant_id,recipient_email,snapshot,created_by) values('${room}','${tenant}',staff_email,'${esc(JSON.stringify(snapshot))}'::jsonb,'${actor}')`)}
 insert into contract_drafts(id,room_id,tenant_id,recipient_email,snapshot,created_by) values('${draft}','${room}','${tenant}','${email}','${esc(JSON.stringify(snapshot))}'::jsonb,'${actor}');
 ${denied(`update contract_drafts set recipient_email=staff_email,revision=revision+1 where id='${draft}'`)}
 -- Manufacture one old invalid profile only inside a rolled-back TEST transaction.
 alter table tenants disable trigger guard_tenant_system_email;
 update tenants set email=staff_email where id='${tenant}';
 alter table tenants enable trigger guard_tenant_system_email;
 alter table contract_drafts disable trigger guard_draft_system_email;
 update contract_drafts set recipient_email=staff_email,snapshot=jsonb_set(snapshot,'{tenant,email}',to_jsonb(staff_email)),revision=revision+1 where id='${draft}';
 alter table contract_drafts enable trigger guard_draft_system_email;
 ${denied(`perform contract_confirmation_create('${draft}',2,'${hash}','${actor}',repeat('QA document ',20))`)}
 if exists(select 1 from contract_confirmations where draft_id='${draft}') then raise exception 'blocked send wrote confirmation';end if;
 update tenants set email='${email}' where id='${tenant}';
 update contract_drafts set recipient_email='${email}',snapshot=jsonb_set(snapshot,'{tenant,email}','"${email}"'::jsonb),revision=revision+1 where id='${draft}';
 perform contract_confirmation_create('${draft}',3,'${hash}','${actor}',repeat('QA document ',20));
 -- Legacy link generated before this policy: confirmation must roll back room activation.
 alter table tenants disable trigger guard_tenant_system_email;
 update tenants set email=staff_email where id='${tenant}';
 alter table tenants enable trigger guard_tenant_system_email;
 alter table contract_confirmations disable trigger guard_confirmation_system_email;
 update contract_confirmations set recipient_email=staff_email where draft_id='${draft}';
 alter table contract_confirmations enable trigger guard_confirmation_system_email;
 ${denied(`perform contract_confirmation_accept('${hash}')`)}
 if (select status from rooms where id='${room}')<>'vacant' then raise exception 'blocked confirmation changed room';end if;
 update tenants set email='${email}' where id='${tenant}';
 update contract_confirmations set recipient_email='${email}' where draft_id='${draft}';
 answer:=contract_confirmation_accept('${hash}');cid:=answer->>'contractId';
 if not (answer->>'confirmed')::boolean then raise exception 'normal confirmation failed';end if;
 alter table contract_confirmations disable trigger guard_confirmation_system_email;
 update contract_confirmations set recipient_email=staff_email where draft_id='${draft}';
 alter table contract_confirmations enable trigger guard_confirmation_system_email;
 ${denied(`perform contract_account_claim('${hash}')`)}
 if exists(select 1 from contract_confirmations where draft_id='${draft}' and account_lease is not null) then raise exception 'rejected claim wrote lease';end if;
 update contract_confirmations set recipient_email='${email}' where draft_id='${draft}';
 -- Reciprocal staff creation also fails, while Auth portal provision still works.
 ${denied(`insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data) values('${portal}','${email}','authenticated','{}','{}')`)}
 insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data) values('${portal}','${email}','anon','{"portal_role":"webmobile_tenant"}','{"full_name":"QA","username":"qa_${run}"}');
 insert into users(id,email,username,full_name,role,status) values('${portal}','${email}','qa_${run}','QA portal','user','active') on conflict(id) do nothing;
 if tenant_system_email_conflict('${email}') then raise exception 'portal auth profile incorrectly classified as staff';end if;
 perform webmobile_enroll_tenant('${portal}','${tenant}','${email}','${actor}');
 if not exists(select 1 from tenant_web_accounts where tenant_id='${tenant}') then raise exception 'portal enroll failed';end if;
end $$;
rollback;`
await testManagement(env,'/database/query',{query})
const access=(await testManagement(env,'/database/query',{query:`select has_function_privilege('anon','${s}.tenant_email_check(text)','EXECUTE') anon_check,has_function_privilege('authenticated','${s}.tenant_system_email_conflict(text)','EXECUTE') staff_internal,has_function_privilege('authenticated','${s}.tenant_email_check(text)','EXECUTE') staff_check` }))[0]
assert.equal(access.anon_check,false);assert.equal(access.staff_internal,false);assert.equal(access.staff_check,true)
const anon=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/tenant_email_check`,{method:'POST',headers:{apikey:env.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json','Content-Profile':s},body:JSON.stringify({p_email:env.CONTRACT_TEST_ADMIN_EMAIL})})
assert.ok(!anon.ok)
const login=await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:env.CONTRACT_TEST_ADMIN_EMAIL,password:env.CONTRACT_TEST_ADMIN_PASSWORD})})
const token=(await login.json()).access_token;assert.ok(token)
const result=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/tenant_email_check`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Profile':s},body:JSON.stringify({p_email:' '+env.CONTRACT_TEST_ADMIN_EMAIL.toUpperCase()+' '})})
assert.ok(result.ok);assert.equal((await result.json()).allowed,false)
const checks=['case/trim normalization','inactive staff reserved','tenant insert and update','draft insert and update','legacy send blocked without confirmation row','legacy acceptance rolls back room activation','legacy claim blocked before Auth creation','reciprocal staff creation blocked','portal provision and enrollment allowed','anonymous lookup denied','staff-only verdict RPC']
await writeFile(path.join(root,'qa/tenant-email-separation-test.json'),JSON.stringify({at:new Date().toISOString(),project:env.CONTRACT_TEST_PROJECT_REF,passed:true,checks,access,fixturesRolledBack:true,emailsSent:false},null,2)+'\n')
console.log(`${checks.length} live TEST email separation checks passed. Fixtures rolled back; no email sent.`)
