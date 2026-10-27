import assert from 'node:assert/strict'
import { randomBytes,createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import {privateConfig,management} from '../webmobile/scripts/private-config.mjs'
const env=await privateConfig(),url=env.SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY,anon=env.VITE_SUPABASE_ANON_KEY||env.SUPABASE_ANON_KEY
assert.equal(new URL(url).hostname,'wtrycmiojsiliyjxsewz.supabase.co')
const email='dev-device-fixture-'+randomBytes(8).toString('hex')+'@example.invalid',password=randomBytes(24).toString('hex')
const token=randomBytes(32).toString('hex')+'.'+randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex')
const agent='Electron/44.4.5 LocalDevDeviceFixture',calls=[],checks=[]
let uid
async function gateway(body,access) {
  const response=await fetch('https://app.phongtroankhang.com/api/management-auth',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':agent,...(access?{'x-management-session':access}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
  return {response,data:await response.json()}
}
async function state(access) {return gateway({action:'security',security_action:'status',data:{}},access)}
try {
  const created=await fetch(url+'/auth/v1/admin/users',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{purpose:'dev-device-disposable-verification'}})})
  assert.ok(created.ok,'Create fixture HTTP '+created.status);uid=(await created.json()).id;assert.match(uid,/^[a-f0-9-]{36}$/)
  await management(env,'/database/query',{query:`begin;
    insert into public.users(id,email,username,full_name,role,status) values('${uid}','${email}','${uid}','Dev device disposable verifier','admin','active') on conflict(id) do update set role='admin',status='active';
    insert into management_security.accounts(user_id,mfa_required,recovery_ack_at) values('${uid}',true,clock_timestamp()) on conflict(user_id) do update set recovery_ack_at=clock_timestamp();
    insert into management_security.devices(user_id,token_hash,ip_hash,agent_hash,label,expires_at,local_dev) values('${uid}','${hash}',repeat('0',64),repeat('0',64),'Disposable verifier',clock_timestamp()+interval '5 minutes',true);
    commit;`})
  const wrong=await gateway({action:'login',login:email,password:'incorrect',device_token:token});assert.equal(wrong.response.status,401);checks.push('Device token does not replace password')
  const ordinary=await gateway({action:'login',login:email,password});assert.equal(ordinary.response.status,200)
  const blocked=await state(ordinary.data.session.access_token);assert.notEqual(blocked.data.state,'ready');checks.push('Password alone still requests MFA on other devices')
  const logged=await gateway({action:'login',login:email,password,device_token:token});assert.equal(logged.response.status,200)
  const access=logged.data.session.access_token,ready=await state(access)
  assert.equal(ready.response.status,200);assert.equal(ready.data.state,'ready');assert.equal(ready.data.login_method,'dev_device');assert.equal(ready.data.device_verified,true)
  checks.push('Real password login and service-recorded dev proof skip both OTP prompts')
  const claims=JSON.parse(Buffer.from(access.split('.')[1],'base64url').toString());assert.equal(claims.aal,'aal1');checks.push('No fabricated AAL2 or Authenticator proof')
  async function guard(sensitive) {
    const response=await fetch(url+'/rest/v1/rpc/security_management_access_allowed?p_sensitive='+sensitive,{headers:{apikey:anon,Authorization:'Bearer '+access}})
    const data=await response.json();return response.ok&&data===true
  }
  assert.equal(await guard(false),true);assert.equal(await guard(true),false);checks.push('Real data read allowed; sensitive actions still require current password')
  const confirmed=await gateway({action:'security',security_action:'password_confirm',data:{password}},access);assert.equal(confirmed.response.status,200);assert.equal(await guard(true),true)
  checks.push('Server checks real password before sensitive access')
  const otherAgent=await fetch('https://app.phongtroankhang.com/api/management-auth',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':agent+' changed','x-management-session':access},body:JSON.stringify({action:'security',security_action:'status',data:{}})})
  assert.notEqual((await otherAgent.json()).state,'ready');checks.push('Changed browser invalidates dev proof')
  await management(env,'/database/query',{query:`update management_security.devices set revoked_at=clock_timestamp() where user_id='${uid}';`})
  assert.notEqual((await state(access)).data.state,'ready');assert.equal(await guard(false),false);checks.push('Revoked device denied')
} finally {
  if(uid) {
    const response=await fetch(url+'/auth/v1/admin/users/'+uid,{method:'DELETE',headers:{apikey:key,Authorization:'Bearer '+key}})
    assert.ok(response.ok,'Fixture cleanup failed')
  }
}
const report={at:new Date().toISOString(),checks,fixtureDeleted:true,realEmailsSent:false,customerDataChanged:false}
await writeFile(new URL('../docs/security/qa/local-dev-device-live.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
