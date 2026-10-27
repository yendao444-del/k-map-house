import assert from 'node:assert/strict'
import { randomBytes, createHmac } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig(), url = env.SUPABASE_URL || env.VITE_SUPABASE_URL, anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY, serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const email = 'delivered@resend.dev', password = randomBytes(24).toString('base64url')
const auth = async (path, body, token=serviceKey, method=body===undefined?'GET':'POST') => { const r=await fetch(url+'/auth/v1/'+path,{method,headers:{apikey:token===serviceKey?serviceKey:anonKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});const d=await r.json().catch(()=>null);assert.ok(r.ok,'Auth '+path+' HTTP '+r.status);return d }
const totp = secret => { const alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.toUpperCase().replace(/=+$/,''))bits+=alpha.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from((bits.match(/.{8}/g)||[]).map(x=>parseInt(x,2)));const ctr=Buffer.alloc(8);ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(ctr).digest(),o=h.at(-1)&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0')}
const decode=t=>JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString('utf8'))
let uid, factor
const request=async(action,data,token)=>{const r=await fetch('https://app.phongtroankhang.com/api/management-auth',{method:'POST',headers:{'Content-Type':'application/json','x-management-session':token},body:JSON.stringify({action:'security',security_action:action,data}),signal:AbortSignal.timeout(30000)});const d=await r.json();assert.ok(r.ok&&d.ok===true,action+' HTTP '+r.status+' '+JSON.stringify(d));return d}
try {
  const created=await auth('admin/users',{email,password,email_confirm:true,user_metadata:{purpose:'management-mfa-email-disposable-verification'}});uid=created.id
  await management(env,'/database/query',{query:`insert into public.users(id,email,username,full_name,role,status) values('${uid}','${email}','${uid}','Resend disposable verifier','admin','active') on conflict(id) do update set role='admin',status='active';`})
  const logged=await (await fetch('https://app.phongtroankhang.com/api/management-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',login:email,password}),signal:AbortSignal.timeout(30000)})).json();assert.equal(logged.ok,true);let access=logged.session.access_token;const claims=decode(access)
  const enrolled=await auth('factors',{factor_type:'totp',friendly_name:'Email disposable verifier'},access);factor=enrolled.id
  const challenge=await request('totp_challenge',{factor_id:factor},access)
  // Both TOTP requests use the deployed gateway. The verifier does not
  // disclose the seed or OTP and sends mail only to Resend's test recipient.
  const verified=await request('totp_verify',{factor_id:factor,challenge_id:challenge.challenge_id,code:totp(enrolled.totp.secret)},access)
  access=verified.session.access_token;assert.equal(decode(access).aal,'aal2')
  const sent=await request('email_send',{purpose:'signin'},access)
  assert.match(sent.masked_email,/^d\*\*\*@resend\.dev$/)
  assert.match(sent.challenge_id,/^[0-9a-f-]{36}$/)
  let delivery
  for(let attempt=0;attempt<10;attempt++) {
    const rows=await management(env,'/database/query',{query:`select provider_accepted_at is not null as accepted,delivery_status from management_security.email_delivery_status where challenge_id='${sent.challenge_id}' and user_id='${uid}';`})
    delivery=rows[0]
    if(delivery?.delivery_status==='email.delivered') break
    await new Promise(resolve=>setTimeout(resolve,2000))
  }
  assert.equal(delivery?.accepted,true,'Provider acceptance not linked to the challenge')
  assert.equal(delivery?.delivery_status,'email.delivered','Signed delivered webhook not linked to the challenge')
  const report={verifiedAt:new Date().toISOString(),recipient:email,maskedRecipient:sent.masked_email,securitySender:'baomat@phongtroankhang.com',challengeIdReturned:true,customerDataChanged:false,delivery:'Resend simulation accepted and delivered; signed webhook persisted and joined to the challenge. Does not prove Gmail Inbox placement.',deliveryStatus:delivery.delivery_status,providerAccepted:true,factorVerifiedInDisposableAccount:true}
  await writeFile(new URL('../docs/security/qa/mfa-email-live-2026-10-09.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
} finally { if(uid){await management(env,'/database/query',{query:`delete from public.users where id='${uid}' and username='${uid}';`});const r=await fetch(url+'/auth/v1/admin/users/'+uid,{method:'DELETE',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey}});assert.ok(r.ok,'fixture cleanup HTTP '+r.status);console.log('Disposable email MFA fixture removed')} }
