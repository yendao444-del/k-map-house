import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractConfirmationHandler } from './cloud/contract-confirmation.mjs'
const prod={SUPABASE_URL:'https://wtrycmiojsiliyjxsewz.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock',CONTRACT_ENVIRONMENT:'production',CONTRACT_DB_SCHEMA:'public',CONTRACT_PUBLIC_URL:'https://pay.phongtroankhang.com',CONTRACT_GATEWAY_SECRET:'mock-gateway'}
const draft='00000000-0000-4000-8000-000000000001'
const request=(data,token='staff')=>new Request('https://edge.example',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)})
function mock() {
 const calls=[]
 const fetcher=async (url,options)=>{
  calls.push({url,options})
  if(url.endsWith('/auth/v1/user')) return options.headers.Authorization === 'Bearer staff' ? Response.json({id:'admin'}) : Response.json({error:'unauthorized'},{status:401})
  if(url.includes('/users?')) return Response.json([{role:'admin',status:'active'}])
  if(url.endsWith('/rpc/tenant_system_email_conflict')) return Response.json(false)
  if(url.includes('/contract_drafts?')) return Response.json([{id:draft,revision:1,recipient_email:'tenant@example.com',created_at:'2026-10-07',snapshot:{room:{name:'999'},tenant:{full_name:'Tenant'}}}])
  return Response.json({id:draft,status:'prepared'})
 }
 return {calls,fetcher}
}
test('production requires its exact project, schema, HTTPS and pay domain',async()=>{
 for (const changes of [{SUPABASE_URL:'https://gsianbstkmyutnhromwc.supabase.co'},{CONTRACT_DB_SCHEMA:'ankhang_contract_test'},{CONTRACT_PUBLIC_URL:'http://pay.phongtroankhang.com'},{CONTRACT_PUBLIC_URL:'https://other.example'},{CONTRACT_ENVIRONMENT:''}]) {
  const m=mock(),h=contractConfirmationHandler({...prod,...changes},()=>'',m.fetcher)
  assert.equal((await h(request({action:'availability'}))).status,503)
  assert.equal(m.calls.length,0)
 }
})
test('test mode cannot operate on the production database or real pay domain',async()=>{
 for (const changes of [{},{SUPABASE_URL:'https://gsianbstkmyutnhromwc.supabase.co',CONTRACT_TEST_PROJECT_REF:'gsianbstkmyutnhromwc'}]) {
  const m=mock(),h=contractConfirmationHandler({...prod,CONTRACT_ENVIRONMENT:'test',CONTRACT_TEST_PROJECT_REF:'wtrycmiojsiliyjxsewz',...changes},()=>'',m.fetcher)
  assert.equal((await h(request({action:'availability'}))).status,503)
  assert.equal(m.calls.length,0)
 }
})
test('staff authentication remains required in production',async()=>{
 const m=mock(),h=contractConfirmationHandler(prod,()=>'',m.fetcher)
 assert.equal((await h(request({action:'availability'},''))).status,401)
 const reply=await (await h(request({action:'availability'}))).json()
 assert.equal(reply.environment,'production');assert.equal(reply.ready,true)
})
test('production generates links on the real pay domain and does not apply test recipient rules',async()=>{
 const m=mock(),h=contractConfirmationHandler(prod,()=>'<article>Contract</article>',m.fetcher)
 const response=await h(request({action:'create',draftId:draft,revision:1})),data=await response.json()
 assert.equal(response.status,200)
 assert.match(data.url,/^https:\/\/pay\.phongtroankhang\.com\/contract-confirmation#token=[a-f0-9]{64}$/)
 const created=m.calls.find(x=>x.url.endsWith('contract_confirmation_create'))
 assert.equal(created.options.headers['Content-Profile'],'public')
 assert.notEqual(JSON.parse(created.options.body).p_hash,new URL(data.url).hash.slice(7))
})
test('test mode still refuses recipient outside the allowlist',async()=>{
 const m=mock(),h=contractConfirmationHandler({...prod,CONTRACT_ENVIRONMENT:'test',SUPABASE_URL:'https://gsianbstkmyutnhromwc.supabase.co',CONTRACT_TEST_PROJECT_REF:'gsianbstkmyutnhromwc',CONTRACT_PUBLIC_URL:'https://ankhanghome-contract-test.pages.dev'},()=>'',m.fetcher)
 assert.equal((await h(request({action:'create',draftId:draft,revision:1}))).status,403)
 assert.ok(!m.calls.some(x=>x.url.endsWith('contract_confirmation_create')))
})
test('public confirmation rejects missing gateway permission and malformed link before any RPC',async()=>{
 const m=mock(),h=contractConfirmationHandler(prod,()=>'',m.fetcher)
 assert.equal((await h(request({action:'confirm',token:'a'.repeat(64),accepted:true},''))).status,403)
 assert.equal((await h(request({action:'view',token:'invalid'},'mock-gateway'))).status,410)
 assert.equal(m.calls.length,0)
})
test('history is staff-only and cannot be queried through public link actions',async()=>{
 const m=mock(),h=contractConfirmationHandler(prod,()=>'',m.fetcher)
 assert.equal((await h(request({action:'history',draftId:draft},''))).status,401)
 assert.equal((await h(request({action:'history',draftId:draft},'mock-gateway'))).status,401)
 assert.equal((await h(request({action:'history',draftId:draft}))).status,200)
 assert.ok(m.calls.some(x=>x.url.endsWith('/rpc/contract_confirmation_history')))
})
test('display telemetry requires a UUID visit and a valid public gateway',async()=>{
 const m=mock(),h=contractConfirmationHandler(prod,()=>'',m.fetcher)
 const req=data=>new Request('https://edge.example',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer mock-gateway','x-contract-ip':'a'.repeat(64)},body:JSON.stringify(data)})
 assert.equal((await h(req({action:'document_viewed',token:'a'.repeat(64)}))).status,400)
 assert.equal((await h(req({action:'document_viewed',token:'a'.repeat(64),visitId:'wrong'}))).status,400)
 assert.equal((await h(req({action:'document_viewed',token:'a'.repeat(64),visitId:draft}))).status,200)
 assert.ok(m.calls.some(x=>x.url.endsWith('/rpc/contract_confirmation_document_view')))
})
test('amendment and cancellation actions require staff auth and valid contract identifiers/reasons',async()=>{
 for(const action of ['amendment_start','cancel_check','cancel','contract_history']) {
  const m=mock(),h=contractConfirmationHandler(prod,()=>'',m.fetcher)
  const input={action,contractId:'contract_valid',reason:'Nhập nhầm thông tin',kind:'wrong_room',referenceId:'room_correct'}
  assert.equal((await h(request(input,''))).status,401)
  assert.equal((await h(request(input,'mock-gateway'))).status,401)
  assert.equal((await h(request({...input,contractId:'invalid?or=all'}))).status,400)
  if(['amendment_start','cancel'].includes(action)) assert.equal((await h(request({...input,reason:''}))).status,400)
  assert.equal((await h(request(input))).status,200)
  const expected={amendment_start:'contract_amendment_start',cancel_check:'contract_cancellation_check',cancel:'contract_cancel',contract_history:'contract_history'}[action]
  const called=m.calls.find(x=>x.url.endsWith(`/rpc/${expected}`));assert.ok(called)
  if(action==='cancel'||action==='amendment_start') assert.equal(JSON.parse(called.options.body).p_actor,'admin')
 }
})

test('notice delivery actions are staff-only and strictly scoped to a claimed attempt',async()=>{
 const m=mock(),h=contractConfirmationHandler(prod,()=>'',m.fetcher)
 for(const action of ['cancel_notices','cancel_notice']) for(const auth of ['', 'mock-gateway']) assert.equal((await h(request({action,contractId:'contract_valid',noticeAction:'claim'},auth))).status,401)
 assert.equal((await h(request({action:'cancel_notice',contractId:'contract_valid',noticeAction:'sent',attemptId:'bad'}))).status,400)
 assert.equal((await h(request({action:'cancel_notice',contractId:'contract_valid',noticeAction:'claim'}))).status,200)
 const call=m.calls.find(x=>x.url.endsWith('/rpc/contract_cancellation_notice'));assert.equal(JSON.parse(call.options.body).p_actor,'admin')
 assert.equal((await h(request({action:'cancel',contractId:'contract_valid',reason:'Sai phòng'}))).status,400)
})

test('test cancellation forwards no comparison record and remains staff-only',async()=>{
 const m=mock(),h=contractConfirmationHandler(prod,()=>'',m.fetcher)
 const input={action:'cancel',contractId:'contract_test',reason:'Kết thúc thử nghiệm luồng hợp đồng',kind:'test_reset'}
 for(const auth of ['', 'mock-gateway']) assert.equal((await h(request(input,auth))).status,401)
 assert.equal((await h(request(input))).status,200)
 const called=m.calls.find(x=>x.url.endsWith('/rpc/contract_cancel'))
 const args=JSON.parse(called.options.body)
 assert.equal(args.p_kind,'test_reset');assert.equal(args.p_reference,null);assert.equal(args.p_actor,'admin')
})

test('activation distinguishes duplicate email from an Auth database failure',async()=>{
 for(const [providerStatus,code,expectedStatus,pattern] of [[422,'email_exists',409,/đã có tài khoản/],[500,'unexpected_failure',503,/chưa tạo được/],[422,'weak_password',400,/Mật khẩu/]]) {
  const calls=[]
  const h=contractConfirmationHandler(prod,()=>'',async(url,options)=>{
   calls.push(url)
   if(url.endsWith('/rpc/webmobile_auth_rate'))return Response.json(true)
   if(url.endsWith('/rpc/contract_account_claim'))return Response.json({userId:draft,id:draft,email:'tenant@example.com',name:'Tenant',lease:draft})
   if(url.endsWith(`/admin/users/${draft}`))return Response.json({},{status:404})
   if(url.endsWith('/admin/users'))return Response.json({code,msg:'private provider details'},{status:providerStatus})
   throw new Error('Unexpected activation API call')
  })
  const r=await h(new Request('https://edge.example',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer mock-gateway','x-contract-ip':'a'.repeat(64)},body:JSON.stringify({action:'activate',token:'b'.repeat(64),password:'valid-password'})}))
  assert.equal(r.status,expectedStatus);const body=await r.json();assert.match(body.error,pattern)
  assert.ok(!JSON.stringify(body).includes('private provider details'))
  assert.ok(!calls.some(url=>url.endsWith('/rpc/contract_account_finish')))
 }
})
