import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
import { hashContractToken, newContractToken } from '../cloud/contract-confirmation.mjs'
import { root } from './private-config.mjs'
const env = await contractTestConfig(), schema = env.CONTRACT_DB_SCHEMA
const id = crypto.randomUUID(), suffix = id.slice(0,8), email = `contract-qa-${suffix}@ankhanghome.example`
const roomId = `qa-room-${suffix}`, tenantId = `qa-tenant-${suffix}`, password = `Qa!${randomBytes(18).toString('base64url')}`
async function rest(route, body, token = env.SUPABASE_SERVICE_ROLE_KEY) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${route}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${token}`, 'Content-Type':'application/json', 'Content-Profile':schema, 'Accept-Profile':schema }, body:JSON.stringify(body) })
  return { response, data:await response.json().catch(()=>null) }
}
const sql = query => testManagement(env,'/database/query',{query})
const snap = {version:1,room:{id:roomId,name:`QA ${suffix}`,area:25},tenant:{id:tenantId,full_name:'Khách thử nghiệp vụ',email,phone:'0900000000'},settings:{property_name:'AN KHANG HOME TEST'},form:{baseRent:2500000,depositAmount:2500000,moveInDate:'2026-10-07',durationMonths:12,invoiceDay:5,occupantCount:1,electricInitial:1200,waterInitial:80,additionalTerms:'Điều khoản kiểm thử'},services:{electricPrice:3500,waterPrice:18000,internetPrice:100000,cleaningPrice:30000},assets:[]}
await sql(`insert into ${schema}.rooms(id,name,base_rent,status) values('${roomId}','QA ${suffix}',2500000,'vacant'); insert into ${schema}.tenants(id,full_name,email,is_active) values('${tenantId}','Khách thử nghiệp vụ','${email}',true); insert into ${schema}.contract_drafts(id,room_id,tenant_id,recipient_email,snapshot,created_by) values('${id}','${roomId}','${tenantId}','${email}','${JSON.stringify(snap).replaceAll("'","''")}'::jsonb,'${env.CONTRACT_TEST_ADMIN_ID}');`)
let token = newContractToken(), hash = await hashContractToken(token)
const actor = env.CONTRACT_TEST_ADMIN_ID
const create = (revision=1) => rest('rpc/contract_confirmation_create',{p_draft:id,p_revision:revision,p_hash:hash,p_actor:actor,p_document:'<article><h1>HỢP ĐỒNG THUÊ NHÀ</h1><p>Kiểm tra thông tin phòng, giá thuê, điện nước và điều khoản của người thuê.</p></article>'})
const created = await create(); assert.equal(created.response.status,200,JSON.stringify(created.data))
const duplicate = await create(); assert.ok(!duplicate.response.ok,'duplicate send must fail')
const dataQuery = await sql(`select token_hash, status from ${schema}.contract_confirmations where draft_id='${id}'`)
assert.equal(dataQuery[0].token_hash,hash);assert.notEqual(dataQuery[0].token_hash,token)
const denied = await rest('rpc/contract_confirmation_view',{p_hash:hash},env.VITE_SUPABASE_ANON_KEY); assert.ok(!denied.response.ok,'anonymous RPC must be denied')
const browser = async (action, extra = {}) => {
  const response = await fetch(`${env.CONTRACT_PUBLIC_URL}/api/contract-confirmation`,{method:'POST',headers:{'Content-Type':'application/json','Origin':env.CONTRACT_PUBLIC_URL},body:JSON.stringify({action,token,...extra})})
  return {response,data:await response.json()}
}
const visitId=crypto.randomUUID(),anotherVisit=crypto.randomUUID()
const view = await browser('view',{visitId}); assert.equal(view.response.status,200,JSON.stringify(view.data));assert.equal(view.data.contract.room,snap.room.name)
assert.ok(!JSON.stringify(view.data).includes('token_hash'),'hash never exposed to browser')
// Exercise history on a disposable TEST contract only, without sending Gmail.
async function event(action, visit) {
  const response=await fetch(`${env.SUPABASE_URL}/functions/v1/contract-confirmation`,{method:'POST',headers:{Authorization:`Bearer ${env.CONTRACT_GATEWAY_SECRET}`,'Content-Type':'application/json','x-contract-ip':'a'.repeat(64)},body:JSON.stringify({action,token,visitId:visit})})
  return {response,data:await response.json()}
}
for (let retry=0;retry<2;retry++) {
  assert.equal((await event('view',visitId)).response.status,200)
  assert.equal((await event('document_viewed',visitId)).response.status,200)
}
assert.equal((await event('view',anotherVisit)).response.status,200)
assert.equal((await event('document_viewed',anotherVisit)).response.status,200)
const history=await rest('rpc/contract_confirmation_history',{p_draft:id})
assert.equal(history.response.status,200)
assert.equal(history.data.filter(x=>x.type==='created').length,1)
assert.equal(history.data.filter(x=>x.type==='link_opened').length,2,'two unique page visits')
assert.equal(history.data.filter(x=>x.type==='document_viewed').length,2,'repeated iframe reports are deduplicated')
assert.ok(history.data.every(x=>!x.historical),'new events must not be marked as imported')
const anonymousHistory=await rest('rpc/contract_confirmation_history',{p_draft:id},env.VITE_SUPABASE_ANON_KEY)
assert.ok(!anonymousHistory.response.ok,'anonymous history RPC must be denied')
assert.ok(!JSON.stringify(history.data).includes(hash),'history must not disclose token hashes')
await sql(`update ${schema}.contract_drafts set revision=revision+1 where id='${id}'`)
const changed = await browser('confirm',{accepted:true});assert.ok(!changed.response.ok,'edited drafts invalidate old links')
token=newContractToken(); hash=await hashContractToken(token)
assert.equal((await create(2)).response.status,200)
await sql(`update ${schema}.contract_confirmations set expires_at=now()-interval '1 second' where draft_id='${id}'`)
const expired = await browser('view');assert.ok(!expired.response.ok,'expired link fails')
await sql(`update ${schema}.contract_confirmations set expires_at=now()+interval '72 hours' where draft_id='${id}'`)
const confirmed = await browser('confirm',{accepted:true});assert.equal(confirmed.response.status,200,JSON.stringify(confirmed.data));assert.equal(confirmed.data.requirePassword,true)
const repeated = await browser('confirm',{accepted:true});assert.equal(repeated.response.status,200);assert.equal(repeated.data.contractId,confirmed.data.contractId)
const contracts = await sql(`select count(*)::integer as count from ${schema}.contracts where tenant_id='${tenantId}'`);assert.equal(contracts[0].count,1)
const activation = await browser('activate',{password});assert.equal(activation.response.status,200,JSON.stringify(activation.data))
const activatedHistory=(await rest('rpc/contract_confirmation_history',{p_draft:id})).data
assert.equal(activatedHistory.filter(x=>x.type==='confirmed').length,1,'repeated confirmation logs once')
assert.equal(activatedHistory.filter(x=>x.type==='account_ready').length,1)
assert.ok(Date.parse(activatedHistory.find(x=>x.type==='confirmed').at)<=Date.parse(activatedHistory.find(x=>x.type==='account_ready').at))
const twice = await browser('activate',{password:'changed-password!'});assert.ok(!twice.response.ok,'used token cannot reset password')
const login = await fetch(`${env.CONTRACT_PUBLIC_URL}/api/auth`,{method:'POST',headers:{'Content-Type':'application/json','Origin':env.CONTRACT_PUBLIC_URL},body:JSON.stringify({action:'login',email,password})})
const signed = await login.json();assert.equal(login.status,200,JSON.stringify(signed));assert.equal(signed.profile.tenantId,tenantId);assert.equal(signed.profile.contractId,confirmed.data.contractId);assert.equal(signed.profile.room,snap.room.name)
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const role = await sql(`select role, raw_app_meta_data->>'portal_role' as portal from auth.users where id=(select auth_user_id from ${schema}.tenant_web_accounts where tenant_id='${tenantId}');`)
assert.equal(role[0].role,'anon');assert.equal(role[0].portal,'webmobile_tenant')
await sql(`update ${schema}.contracts set status='expired' where id='${confirmed.data.contractId}'; update ${schema}.rooms set status='vacant' where id='${roomId}';`)
const locked = await fetch(`${env.CONTRACT_PUBLIC_URL}/api/auth`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',email,password})});assert.equal(locked.status,403)
const oldSession = await fetch(`${env.CONTRACT_PUBLIC_URL}/api/auth`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({action:'session'})});assert.equal(oldSession.status,401,'checkout revokes existing browser session')
assert.equal((await rest('rpc/contract_confirmation_history',{p_draft:id})).data.filter(x=>x.type==='revoked').length,2,'draft edit and checkout revocations are recorded')
await mkdir(path.join(root,'qa/private'),{recursive:true})
await writeFile(path.join(root,'qa/private/contract-test-results.json'),JSON.stringify({at:new Date().toISOString(),project:env.CONTRACT_TEST_PROJECT_REF,schema,website:env.CONTRACT_PUBLIC_URL,passed:['no duplicate send','hashed token only','anonymous RPC denied','public view','revision mismatch denied','expiry denied','atomic activation','idempotent confirmation','password self setup','used activation token denied','tenant-scoped login','anon role','checkout access locked','checkout revokes session','history separates link/document','history deduplicates per visit','history records repeat visits','history anonymous denied','history excludes hashes','confirmation/account events once','checkout revocation event'],gmailSent:false,sepayUsed:false},null,2)+'\n')
await sql(`update ${schema}.contract_drafts set status='cancelled',revision=revision+1 where room_id like 'qa-room-%' and status='draft'; update ${schema}.rooms set status='maintenance' where id like 'qa-room-%'; update ${schema}.tenants set is_active=false where id like 'qa-tenant-%';`)
console.log('Passed 21 live TEST checks including history. No Gmail sent, no SePay payment, room 999 remains available for your test.')
