import assert from 'node:assert/strict'
import {readFile,readdir,writeFile} from 'node:fs/promises'
import sharp from 'sharp'
import path from 'node:path'
import {privateConfig,root} from './private-config.mjs'
import {contractTestConfig,testManagement} from './contract-test-config.mjs'
import {cloudHandler} from '../cloud/handler.mjs'
import {readCloudMeter} from '../cloud/online-reader.mjs'
const testEnv=await contractTestConfig(), env=await privateConfig(), schema='ankhang_payment_e2e_qa'
assert.equal(testEnv.CONTRACT_TEST_PROJECT_REF,'gsianbstkmyutnhromwc')
const query=sql=>testManagement(testEnv,'/database/query',{query:sql})
const translate=s=>s.replaceAll('public.',schema+'.').replace(/search_path\s*=\s*public/g,`search_path=${schema}`).replace(/^begin;\s*/,'').replace(/commit;\s*$/,'')
const tables=['users','rooms','tenants','service_zones','invoices','contracts','app_settings','tenant_web_accounts','email_notification_deliveries','payment_events','payment_event_keys']
let setup=`begin;create schema ${schema};${tables.map(t=>`create table ${schema}.${t} (like ankhang_contract_test.${t} including all);`).join('\n')}create unique index e2e_mail_dedupe on ${schema}.email_notification_deliveries(dedupe_key);`
for(const f of [path.join(root,'../supabase/migrations/20260823194717_atomic_invoice_payments.sql'),path.join(root,'../supabase/migrations/20261009010000_server_email_automation.sql'),path.join(root,'../supabase/migrations/20261009020000_tenant_monthly_payment.sql'),path.join(root,'../supabase/migrations/20261009100000_tenant_meter_manual_fallback.sql'),path.join(root,'cloud/schema.sql')])setup+=translate(await readFile(f,'utf8'))
setup+=`set search_path=${schema},pg_temp;insert into users(id,full_name,role,status) values('11111111-1111-4111-8111-111111111111','QA Admin','admin','active');
insert into tenants(id,full_name,is_active) values('qa-tenant','QA Tenant',true);
insert into service_zones(id,name,electric_price,water_price,internet_price,cleaning_price) values('qa-zone','QA',3200,35000,50000,70000);
insert into rooms(id,name,status,base_rent,service_zone_id) values('qa-room','999','occupied',3500000,'qa-zone');
insert into contracts(id,room_id,tenant_id,tenant_name,move_in_date,status,base_rent,electric_init,water_init,invoice_day,billing_cycle,is_migration,created_at,revision_no)
 values('qa-contract','qa-room','qa-tenant','QA Tenant','2026-01-01','active',3500000,12600,280,1,1,true,'2026-01-01',1);
insert into tenant_web_accounts(tenant_id,auth_user_id,email,status) values('qa-tenant','22222222-2222-4222-8222-222222222222','synthetic@example.invalid','active');
insert into app_settings(id,bank_id,account_no,account_name) values('default','BIDV','123456789','DO KIM NGAN');
update email_automation_settings set enabled=true,enabled_at=now()-interval '1 hour',sepay_enabled=true,sepay_started_at=now()-interval '1 hour';commit;`
const qstr=s=>`'${String(s).replaceAll("'","''")}'`
const rpc=async(name,args={})=>{
 assert.match(name,/^[a-z_]+$/)
 const sqlArgs=Object.entries(args).map(([k,v])=>`${k}=>${typeof v==='object'?qstr(JSON.stringify(v))+'::jsonb':qstr(v)}`).join(',')
 const rows=await query(`begin;select set_config('request.jwt.claims','{"role":"service_role"}',true);select ${schema}.${name}(${sqlArgs}) result;commit;`)
 return rows[0]?.result
}
const profile={mode:'tenant',tenantId:'qa-tenant',userId:'22222222-2222-4222-8222-222222222222',contractId:'qa-contract',room:'999'}
const gateway='qa-only-secret',handler=cloudHandler({...env,WEBMOBILE_AUTH_REQUIRED:'true',WEBMOBILE_GATEWAY_SECRET:gateway},rpc,async(...args)=>{
 try{return await readCloudMeter(...args)}catch(cause){console.log('QA OCR provider: '+cause.name+' '+cause.message);throw cause}
},{session:async()=>profile})
const api=async(endpoint,data)=>{
 const response=await handler(new Request('https://qa.invalid/api',{method:'POST',headers:{authorization:`Bearer ${gateway}`,'content-type':'application/json','x-webmobile-endpoint':endpoint,'x-webmobile-session':'33333333-3333-4333-8333-333333333333','x-webmobile-ip':'a'.repeat(64)},body:JSON.stringify(data)}))
 const result=await response.json();assert.equal(response.status,200,result.reason);return result
}
let installed=false
try {
 await query(setup);installed=true
 let s=await api('tenant-payments',{action:'state'});assert.ok(s.cycle);assert.equal(s.cycle.electric_old,12600)
 const images=(await readdir('C:/Users/Admin/Downloads/dien nuoc')).filter(f=>f.endsWith('.jpg')).sort().slice(0,2),readings=[]
 for(const [i,f] of images.entries()) {
  const meter=i===0?'electric':'water',raw=await sharp(await readFile('C:/Users/Admin/Downloads/dien nuoc/'+f)).rotate().resize({width:2560,height:2560,fit:'inside'}).jpeg({quality:95}).toBuffer()
  const result=await api('meter-ocr',{meter,contractId:profile.contractId,image:'data:image/jpeg;base64,'+raw.toString('base64')})
  assert.equal(result.ok,true,result.reason);assert.equal(result.assessment.status,'pass');assert.equal(result.reading,i===0?12692:287);assert.ok(result.reviewToken);assert.notEqual(result.autoConfirmed,true)
  const pending=await api('tenant-payments',{action:'state'});assert.equal(pending.cycle[`${meter}_new`],null,'OCR must not save before tenant confirmation')
  const confirmed=await api('meter-ocr',{mode:'check',meter,contractId:profile.contractId,reading:result.reading,reviewToken:result.reviewToken,source:'ai-ocr'});assert.equal(confirmed.ok,true)
  const saved=await api('tenant-payments',{action:'state'});assert.equal(saved.cycle[`${meter}_new`],result.reading)
  readings.push({meter,reading:result.reading,elapsedMs:result.elapsedMs})
 }
 await api('tenant-payments',{action:'create'});s=await api('tenant-payments',{action:'state'})
 const invoice=s.invoices[0];assert.equal(invoice.total_amount,4159400);assert.equal(invoice.payment_status,'unpaid');assert.ok(invoice.qr);assert.equal(s.bank.owner,'Đỗ Kim Ngân')
 await api('tenant-payments',{action:'create'});assert.equal((await api('tenant-payments',{action:'state'})).invoices.length,1)
 const paid=await rpc('process_server_sepay',{p_tx:{id:'qa-exact',amount_in:invoice.total_amount,transaction_date:new Date().toISOString(),account_number:'123456789',transaction_content:invoice.transferContent}})
 assert.equal(paid.status,'recorded');s=await api('tenant-payments',{action:'state'});assert.equal(s.invoices[0].payment_status,'paid');assert.equal(s.invoices[0].remaining,0)
 await rpc('queue_tenant_payment_emails')
 const queued=await query(`select kind,status from ${schema}.tenant_payment_emails`);assert.equal(queued[0].kind,'receipt')
 await writeFile(path.join(root,'qa/tenant-payment-e2e.json'),JSON.stringify({at:new Date().toISOString(),project:testEnv.CONTRACT_TEST_PROJECT_REF,passed:true,readings,invoiceTotal:invoice.total_amount,qrConfigured:true,duplicateInvoicePrevented:true,sepayMatched:true,paidStatusVerified:true,receiptQueued:true,realEmailSent:false,realBankTransfer:false,productionDataChanged:false},null,2)+'\n')
 console.log('PASS: real Gemini → persisted readings → Electron invoice → SePay test event → paid status → receipt queue. Production was not used.')
} finally {if(installed)await query(`drop schema ${schema} cascade;`)}
