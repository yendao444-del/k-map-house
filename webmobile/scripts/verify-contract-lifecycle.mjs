import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
import { root } from './private-config.mjs'
import { newContractToken, hashContractToken } from '../cloud/contract-confirmation.mjs'
const env = await contractTestConfig(), schema = env.CONTRACT_DB_SCHEMA, actor = env.CONTRACT_TEST_ADMIN_ID
const suffix = crypto.randomUUID().slice(0,8), room = `qa-lifecycle-room-${suffix}`, tenant = `qa-lifecycle-tenant-${suffix}`, draft = crypto.randomUUID(), email = `lifecycle-${suffix}@ankhanghome.example`
const query = sql => testManagement(env, '/database/query', { query: sql })
const escaped = value => String(value).replaceAll("'", "''")
const referenceRoom=`qa-lifecycle-reference-room-${suffix}`
const checks = []
async function rpc(name, args, token = env.SUPABASE_SERVICE_ROLE_KEY) {
 if(name==='contract_cancel') args={...args,p_kind:'wrong_room',p_reference:referenceRoom}
 const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method:'POST', headers:{ apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json','Accept-Profile':schema,'Content-Profile':schema },body:JSON.stringify(args) })
 return { response, data:await response.json().catch(()=>null) }
}
const ok = async (name,args) => { const result=await rpc(name,args);assert.ok(result.response.ok,`${name}: ${JSON.stringify(result.data)}`);return result.data }
const denied = async (name,args) => assert.ok(!(await rpc(name,args)).response.ok,`${name} must fail`)
const snapshot = { version:1,room:{id:room,name:`QA ${suffix}`,area:25},tenant:{id:tenant,full_name:'Khách test bản sửa',email},settings:{property_name:'AN KHANG HOME TEST'},form:{baseRent:2500000,depositAmount:2500000,moveInDate:'2026-10-07',durationMonths:12,invoiceDay:5,occupantCount:1,electricInitial:1200,waterInitial:80,readingEditReason:'',additionalTerms:'Thỏa thuận ban đầu'},services:{electricPrice:3500,waterPrice:18000,internetPrice:100000,cleaningPrice:30000},assets:[] }
await query(`insert into ${schema}.rooms(id,name,base_rent,status) values('${room}','QA ${suffix}',2500000,'vacant');insert into ${schema}.tenants(id,full_name,email,is_active) values('${tenant}','Khách test bản sửa','${email}',true);insert into ${schema}.contract_drafts(id,room_id,tenant_id,recipient_email,snapshot,created_by) values('${draft}','${room}','${tenant}','${email}','${escaped(JSON.stringify(snapshot))}'::jsonb,'${actor}');`)
const document = '<article><h1>HỢP ĐỒNG THUÊ NHÀ</h1><p>Đây là toàn bộ thông tin kiểm thử riêng trên database TEST. Không phải hợp đồng thật.</p></article>'
async function prepare(d) {
 const token=newContractToken(),hash=await hashContractToken(token)
 await ok('contract_confirmation_create',{p_draft:d.id,p_revision:d.revision,p_hash:hash,p_actor:actor,p_document:document})
 return { token,hash }
}
await query(`insert into ${schema}.rooms(id,name,base_rent,status) values('${referenceRoom}','QA đối chiếu ${suffix}',2500000,'vacant')`)
const first=await prepare({id:draft,revision:1})
const initial=await ok('contract_confirmation_accept',{p_hash:first.hash}),cid=initial.contractId
assert.equal(initial.requirePassword,true)
const start=reason=>ok('contract_amendment_start',{p_contract:cid,p_actor:actor,p_reason:reason})
await denied('contract_amendment_start',{p_contract:cid,p_actor:crypto.randomUUID(),p_reason:'Sai quyền quản trị'})
await denied('contract_amendment_start',{p_contract:cid,p_actor:actor,p_reason:'x'})
checks.push('admin and reason required')
let d=await start('Nhập nhầm tiền thuê và tiền cọc')
assert.equal((await start('Mở lại bản sửa đang chờ')).id,d.id)
assert.equal(d.parent_contract_id,cid)
checks.push('one pending amendment per contract')
const login = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:env.CONTRACT_TEST_ADMIN_EMAIL,password:env.CONTRACT_TEST_ADMIN_PASSWORD})})
const staff=(await login.json()).access_token;assert.ok(staff)
const patch=async (body)=>{
 const response=await fetch(`${env.SUPABASE_URL}/rest/v1/contract_drafts?id=eq.${d.id}`,{method:'PATCH',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${staff}`,'Content-Type':'application/json','Accept-Profile':schema,'Content-Profile':schema,Prefer:'return=representation'},body:JSON.stringify(body)})
 return {response,data:await response.json()}
}
let bad=await patch({revision:d.revision+1,snapshot:{...d.snapshot,tenant:{...d.snapshot.tenant,full_name:'Người khác'}}});assert.ok(!bad.response.ok)
bad=await patch({revision:d.revision+1,snapshot:{...d.snapshot,form:{...d.snapshot.form,electricInitial:0}}});assert.ok(!bad.response.ok)
checks.push('cannot replace tenant or handover readings')
let updated=await patch({revision:d.revision+1,snapshot:{...d.snapshot,form:{...d.snapshot.form,baseRent:2700000,depositAmount:2000000,invoiceDay:7,additionalTerms:'Điều khoản được sửa'}}});assert.ok(updated.response.ok,JSON.stringify(updated.data));d=updated.data[0]
let rows=await query(`select base_rent,deposit_amount from ${schema}.contracts where id='${cid}'`);assert.equal(rows[0].base_rent,2500000);assert.equal(rows[0].deposit_amount,2500000)
checks.push('saving amendment leaves active terms intact')
const direct=await fetch(`${env.SUPABASE_URL}/rest/v1/contracts?id=eq.${cid}`,{method:'PATCH',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${staff}`,'Content-Type':'application/json','Content-Profile':schema},body:JSON.stringify({base_rent:1})});assert.ok(!direct.ok)
checks.push('direct overwrite of confirmed terms denied')
const link=await prepare(d), view=await ok('contract_confirmation_view',{p_hash:link.hash});assert.equal(view.amendment.previousForm.baseRent,2500000);assert.equal(view.newForm.baseRent,2700000)
checks.push('tenant sees old and proposed terms')
const accept=await ok('contract_confirmation_accept',{p_hash:link.hash});assert.equal(accept.contractId,cid)
assert.equal((await ok('contract_confirmation_accept',{p_hash:link.hash})).contractId,cid)
rows=await query(`select base_rent,deposit_amount,revision_no from ${schema}.contracts where id='${cid}'`);assert.equal(rows[0].base_rent,2700000);assert.equal(rows[0].deposit_amount,2000000);assert.equal(rows[0].revision_no,2)
rows=await query(`select base_rent,electric_new,water_new from ${schema}.rooms where id='${room}'`);assert.equal(rows[0].base_rent,2700000);assert.equal(rows[0].electric_new,1200);assert.equal(rows[0].water_new,80)
rows=await query(`select count(*)::integer as count from ${schema}.contracts where tenant_id='${tenant}'`);assert.equal(rows[0].count,1)
checks.push('atomic and idempotent amendment keeps contract ID and meters')
assert.ok(!(await rpc('contract_history',{p_contract:cid},env.VITE_SUPABASE_ANON_KEY)).response.ok)
let history=await ok('contract_history',{p_contract:cid});assert.equal(history.filter(x=>x.type==='amendment_applied').length,1);assert.equal(history.find(x=>x.type==='amendment_applied').afterForm.baseRent,2700000);assert.ok(!JSON.stringify(history).includes(link.hash))
checks.push('private history with immutable old/new and reason')
assert.ok((await ok('contract_cancellation_check',{p_contract:cid})).allowed)
const password = `Qa!${crypto.randomUUID()}Aa`
const activation = await fetch(`${env.SUPABASE_URL}/functions/v1/contract-confirmation`, { method:'POST', headers:{Authorization:`Bearer ${env.CONTRACT_GATEWAY_SECRET}`,'Content-Type':'application/json','x-contract-ip':'b'.repeat(64)},body:JSON.stringify({action:'activate',token:link.token,password}) })
assert.ok(activation.ok,JSON.stringify(await activation.json()))
async function portalLogin() {
 const response=await fetch(`${env.CONTRACT_PUBLIC_URL}/api/auth`, {method:'POST',headers:{'Content-Type':'application/json',Origin:env.CONTRACT_PUBLIC_URL},body:JSON.stringify({action:'login',email,password})})
 const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.profile.contractId,cid)
 return response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')
}
const cookie=await portalLogin()
d=await start('Điều chỉnh số người ở theo thỏa thuận mới')
updated=await patch({revision:d.revision+1,snapshot:{...d.snapshot,form:{...d.snapshot.form,occupantCount:2}}});assert.ok(updated.response.ok,JSON.stringify(updated.data));d=updated.data[0]
const accountLink=await prepare(d)
assert.equal((await ok('contract_confirmation_accept',{p_hash:accountLink.hash})).requirePassword,false)
await portalLogin()
checks.push('existing account and password retained after amendment')
const financeRoom=`qa-lifecycle-finance-room-${suffix}`,financeTenant=`qa-lifecycle-finance-tenant-${suffix}`,financeCid=`qa-lifecycle-finance-contract-${suffix}`
await query(`insert into ${schema}.rooms(id,name,base_rent,status,electric_new,water_new) values('${financeRoom}','QA tài chính ${suffix}',2500000,'occupied',1200,80);insert into ${schema}.tenants(id,full_name,email,is_active) values('${financeTenant}','Khách kiểm tra tài chính','finance-${suffix}@ankhanghome.example',true);insert into ${schema}.contracts select (jsonb_populate_record(null::${schema}.contracts,to_jsonb(c)||jsonb_build_object('id','${financeCid}','room_id','${financeRoom}','tenant_id','${financeTenant}'))).* from ${schema}.contracts c where id='${cid}'`)
await query(`insert into ${schema}.invoices(id,room_id,tenant_id,month,year,total_amount,payment_status,paid_amount) values('qa-lifecycle-invoice-${suffix}','${financeRoom}','${financeTenant}',10,2026,2700000,'unpaid',0)`)
assert.equal((await ok('contract_cancellation_check',{p_contract:financeCid})).allowed,false)
await denied('contract_cancel',{p_contract:financeCid,p_actor:actor,p_reason:'Hủy hợp đồng kiểm thử'})
rows=await query(`select status from ${schema}.contracts where id='${financeCid}'`);assert.equal(rows[0].status,'active')
checks.push('unpaid invoice blocks cancellation with no partial writes')
await query(`update ${schema}.invoices set payment_status='cancelled',paid_amount=100 where id='qa-lifecycle-invoice-${suffix}'`)
assert.equal((await ok('contract_cancellation_check',{p_contract:financeCid})).allowed,false)
checks.push('recorded money blocks even on cancelled invoice')
await query(`update ${schema}.invoices set paid_amount=0 where id='qa-lifecycle-invoice-${suffix}'`)
await query(`insert into ${schema}.cash_transactions(id,type,category,transaction_date,amount,room_id) values('qa-lifecycle-cash-${suffix}','income','other','2026-10-07',100,'${financeRoom}')`)
await denied('contract_cancel',{p_contract:financeCid,p_actor:actor,p_reason:'Chặn khi có giao dịch tiền'})
await query(`update ${schema}.cash_transactions set amount=0 where id='qa-lifecycle-cash-${suffix}'`)
await query(`insert into ${schema}.move_in_receipts(id,room_id,tenant_id,move_in_date,total_amount,payment_status) values('qa-lifecycle-receipt-${suffix}','${financeRoom}','${financeTenant}','2026-10-07',100,'paid')`)
await denied('contract_cancel',{p_contract:financeCid,p_actor:actor,p_reason:'Chặn khi có tiền vào phòng'})
await query(`update ${schema}.move_in_receipts set payment_status='cancelled' where id='qa-lifecycle-receipt-${suffix}'`)
checks.push('cash transactions and move-in receipts block cancellation')
d=await start('Tạo bản sửa trước khi hủy để kiểm tra thu hồi')
updated=await patch({revision:d.revision+1,snapshot:{...d.snapshot,form:{...d.snapshot.form,baseRent:2800000}}});assert.ok(updated.response.ok,JSON.stringify(updated.data));d=updated.data[0]
const next=await prepare(d)
await denied('contract_cancel',{p_contract:cid,p_actor:crypto.randomUUID(),p_reason:'Không đủ quyền hủy'})
await denied('contract_cancel',{p_contract:cid,p_actor:actor,p_reason:''})
const raced = await Promise.all([rpc('contract_confirmation_accept',{p_hash:next.hash}),rpc('contract_cancel',{p_contract:cid,p_actor:actor,p_reason:'Hủy hợp đồng kiểm thử do lập nhầm'})])
assert.ok(raced[1].response.ok,JSON.stringify(raced[1].data))
checks.push('concurrent confirmation/cancellation never revives cancelled contract')
await ok('contract_cancel',{p_contract:cid,p_actor:actor,p_reason:'Không được đổi lý do lần đầu'})
rows=await query(`select status,cancellation_reason from ${schema}.contracts where id='${cid}'`);assert.equal(rows[0].status,'cancelled');assert.equal(rows[0].cancellation_reason,`Chọn nhầm phòng; phòng đúng: QA đối chiếu ${suffix}. Hủy hợp đồng kiểm thử do lập nhầm`)
rows=await query(`select status,tenant_email,electric_new from ${schema}.rooms where id='${room}'`);assert.equal(rows[0].status,'vacant');assert.equal(rows[0].tenant_email,null);assert.equal(rows[0].electric_new,1200)
await denied('contract_confirmation_accept',{p_hash:next.hash})
await denied('contract_confirmation_view',{p_hash:link.hash})
await denied('contract_account_claim',{p_hash:link.hash})
const session=await fetch(`${env.CONTRACT_PUBLIC_URL}/api/auth`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({action:'session'})});assert.equal(session.status,401)
const afterLogin=await fetch(`${env.CONTRACT_PUBLIC_URL}/api/auth`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',email,password})});assert.equal(afterLogin.status,403)
checks.push('cancellation locks tenant access and existing sessions')
history=await ok('contract_history',{p_contract:cid});assert.equal(history.filter(x=>x.type==='cancelled').length,1)
rows=await query(`select count(*)::integer as count from ${schema}.invoices where id='qa-lifecycle-invoice-${suffix}'`);assert.equal(rows[0].count,1)
checks.push('cancellation is idempotent; preserves finance/history and revokes all links')
const correctedDraft=crypto.randomUUID()
await query(`insert into ${schema}.contract_drafts(id,room_id,tenant_id,recipient_email,snapshot,created_by) values('${correctedDraft}','${room}','${tenant}','${email}','${escaped(JSON.stringify(snapshot))}'::jsonb,'${actor}')`)
const corrected=await prepare({id:correctedDraft,revision:1}), correctedResult=await ok('contract_confirmation_accept',{p_hash:corrected.hash})
assert.notEqual(correctedResult.contractId,cid);assert.equal(correctedResult.requirePassword,false)
const correctedLogin=await fetch(`${env.CONTRACT_PUBLIC_URL}/api/auth`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',email,password})})
assert.equal(correctedLogin.status,200);assert.equal((await correctedLogin.json()).profile.contractId,correctedResult.contractId)
assert.equal((await ok('contract_history',{p_contract:cid})).filter(x=>x.type==='cancelled').length,1)
checks.push('corrected contract reuses same tenant account only after new confirmation')
await ok('contract_cancel',{p_contract:correctedResult.contractId,p_actor:actor,p_reason:'Hủy lần hai để kiểm tra khóa chủ động'})
await ok('webmobile_revoke_tenant',{p_tenant_id:tenant,p_status:'lock'})
const lockedDraft=crypto.randomUUID()
await query(`insert into ${schema}.contract_drafts(id,room_id,tenant_id,recipient_email,snapshot,created_by) values('${lockedDraft}','${room}','${tenant}','${email}','${escaped(JSON.stringify(snapshot))}'::jsonb,'${actor}')`)
const lockedLink=await prepare({id:lockedDraft,revision:1})
await denied('contract_confirmation_accept',{p_hash:lockedLink.hash})
assert.equal((await query(`select status from ${schema}.tenant_web_accounts where tenant_id='${tenant}'`))[0].status,'locked')
await query(`update ${schema}.contract_drafts set status='cancelled',revision=revision+1 where id='${lockedDraft}'`)
checks.push('deliberate admin lock survives new contract confirmation attempt')
const legacyRoom=`qa-lifecycle-legacy-room-${suffix}`,legacyTenant=`qa-lifecycle-legacy-tenant-${suffix}`,legacyId=`qa-lifecycle-legacy-contract-${suffix}`
await query(`insert into ${schema}.rooms(id,name,base_rent,status) values('${legacyRoom}','QA legacy ${suffix}',2000000,'occupied');insert into ${schema}.tenants(id,full_name,email,is_active) values('${legacyTenant}','Khách hợp đồng cũ','legacy-${suffix}@ankhanghome.example',true);insert into ${schema}.contracts(id,room_id,tenant_id,tenant_name,base_rent,deposit_amount,move_in_date,duration_months,invoice_day,occupant_count,electric_init,water_init,status) values('${legacyId}','${legacyRoom}','${legacyTenant}','Khách hợp đồng cũ',2000000,2000000,'2026-10-07',12,5,1,10,20,'active');insert into ${schema}.room_assets(id,room_id,name,quantity,sort_order,status) values('qa-lifecycle-asset-${suffix}','${legacyRoom}','Tủ thử nghiệm',1,1,'ok')`)
const legacy=await ok('contract_amendment_start',{p_contract:legacyId,p_actor:actor,p_reason:'Sửa hợp đồng cũ theo quy trình xác nhận mới'})
assert.equal(legacy.snapshot.tenant.full_name,'Khách hợp đồng cũ');assert.equal(legacy.before_snapshot.form.baseRent,2000000);assert.ok(Array.isArray(legacy.snapshot.assets))
assert.equal(legacy.snapshot.assets[0].name,'Tủ thử nghiệm')
assert.ok(!JSON.stringify(legacy.snapshot).includes('sepay_api_token'))
await query(`update ${schema}.contract_drafts set status='cancelled',revision=revision+1 where id='${legacy.id}'`)
checks.push('legacy contracts create sanitized amendment without changing source')
await writeFile(path.join(root,'qa/contract-lifecycle-test-results.json'),JSON.stringify({at:new Date().toISOString(),project:env.CONTRACT_TEST_PROJECT_REF,schema,checks,gmailSent:false,sepayUsed:false},null,2)+'\n')
await query(`update ${schema}.contracts set status='expired' where id in('${legacyId}','${correctedResult.contractId}','${financeCid}') and status='active';update ${schema}.rooms set status='maintenance' where id in('${room}','${legacyRoom}','${financeRoom}','${referenceRoom}');update ${schema}.tenants set is_active=false where id in('${tenant}','${legacyTenant}','${financeTenant}')`)
await query(`update ${schema}.contract_cancellation_notices set status='uncertain',error='QA chỉ mô phỏng; không gửi email' where status='pending' and contract_id in ('${cid}','${correctedResult.contractId}')`)
console.log(`Passed ${checks.length} live TEST lifecycle checks. No production records, emails or bank transactions touched.`)
