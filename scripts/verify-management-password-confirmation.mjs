import assert from 'node:assert/strict'
import { randomBytes, createHmac, createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env=await privateConfig(), config=JSON.parse(await readFile(new URL('../adminpwa/.env.auth-private.json',import.meta.url),'utf8'))
const url=env.SUPABASE_URL, service=env.SUPABASE_SERVICE_ROLE_KEY, anon=env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
assert.equal(new URL(url).hostname,'wtrycmiojsiliyjxsewz.supabase.co'); assert.ok(service&&anon&&config.gatewaySecret)
const password=randomBytes(24).toString('base64url'), newPassword=randomBytes(24).toString('base64url'), email=`password-qa-${randomBytes(8).toString('hex')}@example.invalid`
let uid, token, refresh, factor, sid
const agent='password-confirmation-disposable-qa', ip=randomBytes(32).toString('hex'), agentHash=createHash('sha256').update(agent).digest('hex')
const call=async(path,body,key=anon,bearer=key,method=body?'POST':'GET')=>{
 const res=await fetch(url+path,{method,headers:{apikey:key,Authorization:'Bearer '+bearer,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)})
 return {status:res.status,data:await res.json().catch(()=>null)}
}
const security=async(action,data={})=>{
 const res=await fetch(url+'/functions/v1/admin-pwa-auth',{method:'POST',headers:{Authorization:'Bearer '+config.gatewaySecret,'x-management-session':token,'x-management-ip':ip,'x-management-agent':agent,'Content-Type':'application/json'},body:JSON.stringify({action:'security',security_action:action,data}),signal:AbortSignal.timeout(25000)})
 return {status:res.status,data:await res.json().catch(()=>null)}
}
const claims=t=>JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString('utf8'))
const totp=secret=>{
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits=''
 for(const c of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(c).toString(2).padStart(5,'0')
 const key=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2))), counter=Buffer.alloc(8)
 counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
 const hash=createHmac('sha1',key).update(counter).digest(), offset=hash[19]&15
 return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
}
const checks={}
try {
 const created=await call('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{purpose:'password-confirmation-disposable-qa'}},service)
 assert.equal(created.status,200,'Create disposable account'); uid=created.data.id; assert.match(uid,/^[a-f0-9-]{36}$/)
 await management(env,'/database/query',{query:`insert into public.users(id,email,username,full_name,role,status) values('${uid}','${email}','${uid}','Disposable password QA','user','active') on conflict(id) do update set role='user',status='active';`})
 const login=await call('/auth/v1/token?grant_type=password',{email,password}); assert.equal(login.status,200,'Fixture login');token=login.data.access_token;refresh=login.data.refresh_token;sid=claims(token).session_id;assert.match(sid,/^[a-f0-9-]{36}$/)
 const enrolled=await call('/auth/v1/factors',{factor_type:'totp',friendly_name:'Disposable password QA'},anon,token);assert.equal(enrolled.status,200,'Fixture enroll');factor=enrolled.data.id
 const challenge=await call(`/auth/v1/factors/${factor}/challenge`,{},anon,token);assert.equal(challenge.status,200,'Fixture challenge')
 const verified=await call(`/auth/v1/factors/${factor}/verify`,{challenge_id:challenge.data.id,code:totp(enrolled.data.totp.secret)},anon,token);assert.equal(verified.status,200,'Fixture TOTP verify');token=verified.data.access_token;refresh=verified.data.refresh_token;assert.equal(claims(token).aal,'aal2')
 await management(env,'/database/query',{query:`begin;
 insert into management_security.accounts(user_id,mfa_required,recovery_ack_at) values('${uid}',true,clock_timestamp()) on conflict(user_id) do update set mfa_required=true,recovery_ack_at=clock_timestamp();
 insert into management_security.sessions(session_id,user_id,ip_hash,agent_hash,password_verified_at,email_required,email_verified_at,email_identity_hash,authorized_at,expires_at) values('${sid}','${uid}','${ip}','${agentHash}',clock_timestamp(),true,clock_timestamp(),management_security.email_hash('${uid}'),clock_timestamp(),clock_timestamp()+interval '6 hours');
 update auth.mfa_amr_claims set updated_at=clock_timestamp()-interval '10 minutes' where session_id='${sid}' and authentication_method='totp';commit;`})
 const stale=await call('/rest/v1/rpc/security_management_access_allowed?p_sensitive=true',undefined,anon,token);assert.equal(stale.status,200);assert.equal(stale.data,false);checks.staleMfaWriteDenied=true
 const wrong=await security('password_confirm',{password:'incorrect-disposable-password'});assert.equal(wrong.status,401,'Wrong password denied');checks.wrongPasswordDenied=true
 const confirmed=await security('password_confirm',{password});assert.equal(confirmed.status,200,'Correct password accepted');assert.deepEqual(confirmed.data,{ok:true,recent_password:true});checks.correctPasswordAccepted=true
 const allowed=await call('/rest/v1/rpc/security_management_access_allowed?p_sensitive=true',undefined,anon,token);assert.equal(allowed.data,true);checks.serverWriteProofAccepted=true
 const denied=await call('/rest/v1/rpc/security_password_stepup',{p_action:'confirm',p_user:uid,p_session:sid,p_ip:ip,p_agent:agentHash},anon,token);assert.ok(denied.status>=400);checks.directProofForgeryDenied=true
 const changed=await security('password_change',{password,new_password:newPassword});assert.equal(changed.status,200,'Self password change');checks.selfPasswordChanged=true
 const current=await call('/auth/v1/user',undefined,anon,token);assert.equal(current.status,200);assert.equal(current.data.id,uid);checks.originalAal2SessionKept=true
 const refreshed=await call('/auth/v1/token?grant_type=refresh_token',{refresh_token:refresh});assert.equal(refreshed.status,200,'Original refresh session survives');assert.equal(claims(refreshed.data.access_token).aal,'aal2');assert.equal(claims(refreshed.data.access_token).session_id,sid);checks.originalRefreshSessionKept=true
 const old=await call('/auth/v1/token?grant_type=password',{email,password});assert.equal(old.status,400);checks.oldPasswordRejected=true
 const fresh=await call('/auth/v1/token?grant_type=password',{email,password:newPassword});assert.equal(fresh.status,200);await call('/auth/v1/logout?scope=local',{},anon,fresh.data.access_token);checks.newPasswordAccepted=true
} finally {
 if(uid) {
  const rows=await management(env,'/database/query',{query:`select count(*)::int n from auth.users where id='${uid}' and raw_user_meta_data->>'purpose'='password-confirmation-disposable-qa';`});assert.equal(rows[0].n,1)
  await management(env,'/database/query',{query:`delete from public.users where id='${uid}' and username='${uid}';`})
  const deleted=await call('/auth/v1/admin/users/'+uid,undefined,service,service,'DELETE');assert.equal(deleted.status,200)
  const cleaned=await management(env,'/database/query',{query:`select (select count(*) from auth.users where id='${uid}')+(select count(*) from public.users where id='${uid}')+(select count(*) from management_security.sessions where user_id='${uid}') as n;`});assert.equal(Number(cleaned[0].n),0);checks.disposableAccountRemoved=true
 }
}
const report={verifiedAt:new Date().toISOString(),checks,customerDataChanged:false,paymentWritesExecuted:false,emailsSent:false,secretsStored:false,scope:'Real Auth and deployed Edge flow using a disposable staff account; simulated verified mailbox/recovery only for the fixture.'}
await writeFile(new URL('../docs/security/qa/password-confirmation-auth-e2e-2026-10-11.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
