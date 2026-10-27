import assert from 'node:assert/strict'
import { randomBytes, createHmac } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env=await privateConfig(),url=env.SUPABASE_URL || env.VITE_SUPABASE_URL
const service=env.SUPABASE_SERVICE_ROLE_KEY,anon=env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
assert.equal(new URL(url).hostname,'wtrycmiojsiliyjxsewz.supabase.co')
assert.ok(service&&anon)
const purpose='directory-read-http-disposable-qa',password=randomBytes(24).toString('base64url'),email=`directory-http-${randomBytes(8).toString('hex')}@example.invalid`
let uid,token,sid,factor
const checks={}
const call=async(path,body,key=anon,bearer=key,method=body?'POST':'GET')=>{
  const res=await fetch(url+path,{method,headers:{apikey:key,Authorization:'Bearer '+bearer,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)})
  return {status:res.status,data:await res.json().catch(()=>null)}
}
const totp=secret=>{
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=''
  for(const c of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0')
  const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2))),counter=Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
  const hash=createHmac('sha1',key).update(counter).digest(),offset=hash[19]&15
  return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
}
try{
  const created=await call('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{purpose}},service)
  assert.equal(created.status,200,'Create disposable fixture');uid=created.data.id;assert.match(uid,/^[a-f0-9-]{36}$/)
  await management(env,'/database/query',{query:`insert into public.users(id,email,username,full_name,role,status) values('${uid}','${email}','${uid}','Disposable directory read QA','user','active') on conflict(id) do update set role='user',status='active';`})
  const login=await call('/auth/v1/token?grant_type=password',{email,password});assert.equal(login.status,200);token=login.data.access_token
  const enrolled=await call('/auth/v1/factors',{factor_type:'totp',friendly_name:'Disposable directory QA'},anon,token);assert.equal(enrolled.status,200);factor=enrolled.data.id
  const challenge=await call(`/auth/v1/factors/${factor}/challenge`,{},anon,token);assert.equal(challenge.status,200)
  const verified=await call(`/auth/v1/factors/${factor}/verify`,{challenge_id:challenge.data.id,code:totp(enrolled.data.totp.secret)},anon,token)
  assert.equal(verified.status,200);token=verified.data.access_token;sid=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id;assert.match(sid,/^[a-f0-9-]{36}$/)
  // Simulated authorized mailbox/recovery state is restricted to this fixture.
  await management(env,'/database/query',{query:`begin;
    insert into management_security.accounts(user_id,mfa_required,recovery_ack_at) values('${uid}',true,clock_timestamp()) on conflict(user_id) do update set recovery_ack_at=clock_timestamp();
    insert into management_security.sessions(session_id,user_id,ip_hash,agent_hash,password_verified_at,email_required,email_verified_at,email_identity_hash,authorized_at,expires_at)
      values('${sid}','${uid}',repeat('a',64),repeat('b',64),clock_timestamp(),true,clock_timestamp(),management_security.email_hash('${uid}'),clock_timestamp(),clock_timestamp()+interval '6 hours');
    update auth.mfa_amr_claims set updated_at=clock_timestamp()-interval '30 minutes' where session_id='${sid}' and authentication_method='totp';commit;`})
  for(const method of ['GET','POST']){
    const result=await call('/rest/v1/rpc/management_user_directory?order=created_at.desc',method==='POST'?{}:undefined,anon,token,method)
    assert.equal(result.status,200,method+' directory read with aged MFA');assert.equal(result.data.length,1,'Staff must see self only')
    assert.equal(result.data[0].id,uid);assert.equal(result.data[0].authenticator_verified,true);assert.equal(result.data[0].email_verified,true)
    assert.equal(Object.keys(result.data[0]).length,15);checks[method.toLowerCase()+'ReadWithAgedMfa']=true
  }
  const sensitive=await call('/rest/v1/rpc/security_management_access_allowed',{p_sensitive:true},anon,token,'POST')
  assert.equal(sensitive.status,403,'Sensitive POST/requests must not be relaxed')
  checks.sensitiveOperationsStillDeniedWithoutRecentProof=true
  const anonymous=await call('/rest/v1/rpc/management_user_directory',undefined)
  assert.ok(anonymous.status>=400);checks.anonymousDirectoryDenied=true
  await management(env,'/database/query',{query:`update management_security.sessions set revoked_at=clock_timestamp() where session_id='${sid}' and user_id='${uid}';`})
  const revoked=await call('/rest/v1/rpc/management_user_directory',undefined,anon,token)
  assert.equal(revoked.status,403);checks.revokedSessionDenied=true
}finally{
  if(uid){
    const owned=await management(env,'/database/query',{query:`select count(*)::int n from auth.users where id='${uid}' and raw_user_meta_data->>'purpose'='${purpose}'`})
    assert.equal(owned[0].n,1,'Cleanup only the owned fixture')
    await management(env,'/database/query',{query:`delete from public.users where id='${uid}' and username='${uid}';`})
    const removed=await call('/auth/v1/admin/users/'+uid,undefined,service,service,'DELETE');assert.equal(removed.status,200)
    checks.disposableFixtureRemoved=true
  }
}
const report={verifiedAt:new Date().toISOString(),checks,customerAccountsChanged:false,emailsSent:false,scope:'Actual Auth TOTP and PostgREST HTTP using a disposable staff account; mailbox/recovery authorization simulated only for this fixture.'}
await writeFile(new URL('../docs/security/qa/user-directory-read-http.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
