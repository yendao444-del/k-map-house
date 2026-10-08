import test from 'node:test'
import assert from 'node:assert/strict'
import { tenantAdminHandler } from '../cloud/tenant-admin.mjs'
import { authService } from '../cloud/auth.mjs'
import { cloudHandler } from '../cloud/handler.mjs'

const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'}
const userId='bbd2a643-0268-4f41-973c-5ce142f2abae'
const tenantId='tenant-fixture'
const account={tenant_id:tenantId,auth_user_id:userId,email:'fixture@example.invalid',status:'pending',session_version:0}
const user={id:userId,role:'anon',app_metadata:{portal_role:'webmobile_tenant'}}
function request(data,token='fixture-staff') {return new Request('https://fixture.invalid',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)})}
function adminMock({role='admin',exists=false,enrollFail=false}={}) {
  const calls=[]
  let createdId=userId
  const fetcher=async(url,options={})=>{
    const path=new URL(url).pathname, body=options.body?JSON.parse(options.body):null
    calls.push({url,path,method:options.method||'GET',body})
    if(path==='/auth/v1/user')return Response.json({id:'staff-fixture'})
    if(path==='/rest/v1/users')return Response.json([{role,status:'active'}])
    if(path==='/rest/v1/tenant_web_accounts')return Response.json(exists?[account]:[])
    if(path==='/rest/v1/tenants')return Response.json([{id:tenantId,full_name:'Khách kiểm thử',email:account.email,is_active:true}])
    if(path==='/rest/v1/rpc/tenant_system_email_conflict')return Response.json(false)
    if(path==='/rest/v1/rpc/webmobile_prepare_tenant_auth')return Response.json(null)
    if(path==='/auth/v1/admin/users'&&options.method==='POST'){exists=true;createdId=body.id;return Response.json({id:createdId})}
    if(path==='/rest/v1/rpc/webmobile_enroll_tenant')return Response.json(null,{status:enrollFail?409:200})
    if(path.startsWith('/auth/v1/admin/users/')||path==='/rest/v1/rpc/webmobile_revoke_tenant')return Response.json(null)
    throw new Error('Unexpected fixture route '+path)
  }
  return {calls,handler:tenantAdminHandler(env,fetcher)}
}
test('missing authentication and non-admin callers cannot mutate tenant accounts',async()=>{
  const none=adminMock();assert.equal((await none.handler(request({action:'create',tenantId},null))).status,401);assert.equal(none.calls.length,0)
  const staff=adminMock({role:'user'});assert.equal((await staff.handler(request({action:'create',tenantId}))).status,403);assert.equal(staff.calls.length,2)
})
test('provisioning uses server tenant email, trusted role and returned Auth id',async()=>{
  const fixture=adminMock()
  const response=await fixture.handler(request({action:'create',tenantId,password:'Fixture-password-123',email:'spoof@example.invalid',auth_user_id:'staff-id',role:'admin'}))
  assert.equal(response.status,200)
  const created=fixture.calls.find(c=>c.path==='/auth/v1/admin/users').body
  assert.equal(created.email,account.email);assert.equal(created.app_metadata.portal_role,'webmobile_tenant')
  assert.equal(fixture.calls.find(c=>c.path.endsWith('webmobile_enroll_tenant')).body.p_user_id,created.id)
  const reserved=fixture.calls.find(c=>c.path.endsWith('webmobile_prepare_tenant_auth'))
  assert.equal(reserved.body.p_user,created.id);assert.equal(reserved.body.p_actor,'staff-fixture')
  assert.equal(created.role,'anon')
  assert.ok(fixture.calls.indexOf(reserved)<fixture.calls.findIndex(c=>c.path==='/auth/v1/admin/users'))
  assert.ok(!(await response.text()).includes('Fixture-password'))
})
test('failed enrollment compensates by deleting only the newly created Auth identity',async()=>{
  const fixture=adminMock({enrollFail:true})
  assert.equal((await fixture.handler(request({action:'create',tenantId,password:'Fixture-password-123'}))).status,409)
  const created=fixture.calls.find(c=>c.path==='/auth/v1/admin/users').body
  assert.ok(fixture.calls.some(c=>c.path===`/auth/v1/admin/users/${created.id}`&&c.method==='DELETE'))
})
test('invalid password cannot create/reset and duplicate accounts are rejected',async()=>{
  for(const action of ['create','reset_password']) {
    const fixture=adminMock({exists:action==='reset_password'})
    assert.equal((await fixture.handler(request({action,tenantId,password:'short'}))).status,400)
    assert.ok(!fixture.calls.some(c=>c.path.startsWith('/auth/v1/admin/')))
  }
  const fixture=adminMock({exists:true})
  assert.equal((await fixture.handler(request({action:'create',tenantId,password:'Fixture-password-123'}))).status,409)
})
test('lock/unlock/revoke use atomic version revocation and reset revokes after changing password',async()=>{
  for(const action of ['lock','unlock','revoke_sessions','reset_password']) {
    const fixture=adminMock({exists:true})
    assert.equal((await fixture.handler(request({action,tenantId,password:'Fixture-password-123'}))).status,200)
    const index=fixture.calls.findIndex(c=>c.path.endsWith('webmobile_revoke_tenant'))
    assert.deepEqual(fixture.calls[index].body,{p_tenant_id:tenantId,p_status:['lock','unlock'].includes(action)?action:null})
    if(action==='reset_password')assert.ok(fixture.calls.findIndex(c=>c.method==='PUT')<index)
  }
})
function portalMock({status='pending',active=true,version=0,sessionVersion=0,saveFail=false}={}) {
  const calls=[]
  const fetcher=async(url,options={})=>{
    const u=new URL(url),path=u.pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,search:u.search,body})
    if(path==='/auth/v1/token')return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,user})
    if(path==='/auth/v1/user')return Response.json(user)
    if(path==='/rest/v1/tenant_web_accounts')return Response.json([{...account,status,session_version:version}])
    if(path==='/rest/v1/tenants')return Response.json([{id:tenantId,full_name:'Khách kiểm thử',is_active:active}])
    if(path==='/rest/v1/contracts')return Response.json([{id:'contract-fixture',room_id:'room-fixture',move_in_date:'2026-10-01',base_rent:3000000}])
    if(path==='/rest/v1/rooms')return Response.json([{name:'101',floor:1,area:22}])
    if(path==='/rest/v1/rpc/webmobile_save_tenant_session')return Response.json(null,{status:saveFail?409:200})
    if(path==='/rest/v1/webmobile_auth_sessions')return Response.json([{id:userId,user_id:userId,account_version:sessionVersion,access_token:'fixture-access',token_expires_at:new Date(Date.now()+3600000).toISOString()}])
    throw new Error('Unexpected fixture route '+path)
  }
  return {calls,auth:authService(env,async()=>true,fetcher)}
}
test('real tenant login reads only its active contract, saves restricted session, never uses demo bindings',async()=>{
  const fixture=portalMock(),signed=await fixture.auth.login({email:account.email,password:'Fixture-password'},'a'.repeat(64))
  assert.equal(signed.profile.mode,'tenant');assert.equal(signed.profile.tenantId,tenantId);assert.equal(signed.profile.contractId,'contract-fixture')
  assert.ok(fixture.calls.find(c=>c.path==='/rest/v1/contracts').search.includes('tenant_id=eq.tenant-fixture&status=eq.active'))
  assert.ok(fixture.calls.some(c=>c.path.endsWith('webmobile_save_tenant_session')))
  assert.ok(!fixture.calls.some(c=>c.path.includes('demo_accounts')))
})
test('locked/inactive tenant and concurrently revoked login cannot create a valid session',async()=>{
  for(const options of [{status:'locked'},{active:false},{saveFail:true}]) {
    const fixture=portalMock(options)
    await assert.rejects(fixture.auth.login({email:account.email,password:'Fixture-password'},'a'.repeat(64)),cause=>[401,403].includes(cause.status))
  }
  const fixture=portalMock({version:1,sessionVersion:0})
  await assert.rejects(fixture.auth.session(userId),cause=>cause.status===401)
})
test('real identities cannot access OCR/demo invoices, before storage/provider calls',async()=>{
  const shouldNotRun=()=>{throw new Error('Accessed demo storage')}
  const handler=cloudHandler({...env,WEBMOBILE_GATEWAY_SECRET:'fixture',WEBMOBILE_AUTH_REQUIRED:'true'},shouldNotRun,shouldNotRun,{session:async()=>({mode:'tenant',userId,contractId:'contract-fixture'})})
  for(const endpoint of ['meter-ocr','demo-payments']) {
    const r=new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json','x-webmobile-endpoint':endpoint,'x-webmobile-session':userId,'x-webmobile-ip':'a'.repeat(64)},body:JSON.stringify({contractId:'contract-fixture'})})
    assert.equal((await handler(r)).status,403)
  }
})
