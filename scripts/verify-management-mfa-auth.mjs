import assert from 'node:assert/strict'
import { randomBytes, createHmac } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
assert.ok(url && anonKey && serviceKey)
const privateAuth = JSON.parse(await readFile(new URL('../adminpwa/.env.auth-private.json', import.meta.url), 'utf8'))
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../adminpwa/backend/functions/admin-pwa-auth/handler.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' })
const { createManagementAuthHandler } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const checks = [], password = randomBytes(24).toString('base64url')
const email = 'mfa-fixture-' + randomBytes(8).toString('hex') + '@example.invalid'
const ip = 'a'.repeat(64), agent = 'Management MFA disposable verifier'
let uid, factors = []
const auth = async (path, body, token = serviceKey, method = body === undefined ? 'GET' : 'POST') => {
  const response = await fetch(url + '/auth/v1/' + path, {
    method, headers: { apikey: token === serviceKey ? serviceKey : anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000)
  })
  const data = await response.json().catch(() => null)
  assert.ok(response.ok, 'Auth HTTP ' + response.status + ' at ' + path)
  return data
}
const decode = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
const totp = secret => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''
  for (const char of secret.toUpperCase().replace(/=+$/,'')) bits += alphabet.indexOf(char).toString(2).padStart(5,'0')
  const key = Buffer.from((bits.match(/.{8}/g) || []).map(byte => parseInt(byte,2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)))
  const hash = createHmac('sha1',key).update(counter).digest(), offset = hash[hash.length-1]&15
  return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')
}
const handler = createManagementAuthHandler({ supabaseUrl: url, anonKey, serviceKey, gatewaySecret: privateAuth.gatewaySecret })
const request = async (action, data, token) => {
  const payload = JSON.stringify({ action:'security',security_action:action,data })
  const response = process.argv.includes('--live') ? await fetch('https://app.phongtroankhang.com/api/management-auth', {
    method:'POST', headers:{'Content-Type':'application/json','x-management-session':token},body:payload,signal:AbortSignal.timeout(30000)
  }) : await handler(new Request(url + '/functions/v1/admin-pwa-auth', {
    method: 'POST', headers: { authorization: 'Bearer '+privateAuth.gatewaySecret, 'x-management-ip': ip, 'x-management-agent': agent, 'x-management-session': token },
    body: payload
  }))
  const value = await response.json()
  assert.ok(response.ok && value.ok === true, 'Gateway security action ' + action + ' HTTP ' + response.status + ' ' + JSON.stringify(value))
  return value
}
try {
  const created = await auth('admin/users',{ email,password,email_confirm:true,user_metadata:{ purpose:'management-mfa-disposable-verification' } })
  uid = created.id
  assert.match(uid,/^[0-9a-f-]{36}$/)
  await management(env,'/database/query',{query:`insert into public.users(id,email,username,full_name,role,status) values('${uid}','${email}','${uid}','MFA disposable verifier','admin','active') on conflict(id) do update set role='admin',status='active';`})
  const loginPayload = JSON.stringify({ action:'login',login:email,password })
  const logged = process.argv.includes('--live') ? await fetch('https://app.phongtroankhang.com/api/management-auth', {method:'POST',headers:{'Content-Type':'application/json'},body:loginPayload,signal:AbortSignal.timeout(30000)}) : await handler(new Request(url+'/functions/v1/admin-pwa-auth',{method:'POST',headers:{authorization:'Bearer '+privateAuth.gatewaySecret,'x-management-ip':ip,'x-management-agent':agent},body:loginPayload}))
  assert.ok(logged.ok, 'Password gateway HTTP '+logged.status)
  const signed = await logged.json()
  let access = signed.session.access_token
  const claims = decode(access)
  assert.match(claims.session_id,/^[0-9a-f-]{36}$/)
  const registered = await request('status',{},access)
  assert.equal(registered.state,'optional'); checks.push('Real password session registered against auth.sessions and password AMR')
  const enrolled = await auth('factors',{factor_type:'totp',friendly_name:'Disposable verifier'},access)
  factors.push(enrolled.id)
  const challenged = await request('totp_challenge',{factor_id:enrolled.id},access)
  const verified = await request('totp_verify',{factor_id:enrolled.id,challenge_id:challenged.challenge_id,code:totp(enrolled.totp.secret)},access)
  access = verified.session.access_token
  assert.equal(decode(access).aal,'aal2'); assert.equal(decode(access).session_id,claims.session_id)
  checks.push('Real Auth challenge/verify creates AAL2 in the same session')
  const metadata = await management(env,'/database/query',{query:`select s.aal,s.factor_id is not null as factor_bound,c.authentication_method,c.updated_at is not null as amr_timestamp,management_security.mfa_at('${uid}','${claims.session_id}') is not null as server_mfa_proven from auth.sessions s join auth.mfa_amr_claims c on c.session_id=s.id where s.id='${claims.session_id}' and c.authentication_method<>'password';`})
  assert.ok(metadata.length>0 && metadata[0].server_mfa_proven)
  const status = await request('status',{},access)
  assert.equal(status.state,'email'); checks.push('Real AAL2 new device still requires email step-up')
  const report = { verifiedAt:new Date().toISOString(), checks, authMetadata:metadata, customerDataChanged:false, emailSent:false, gateway:process.argv.includes('--live') ? 'Live Pages -> deployed Edge -> real Auth/DB' : 'Local handler against real production Auth/DB', enforcementEnabled:false }
  await writeFile(new URL('../docs/security/qa/mfa-real-auth-2026-10-09.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
} finally {
  if(uid) {
    // Remove only the newly created, explicitly disposable fixture identity.
    await management(env,'/database/query',{query:`delete from public.users where id='${uid}' and username='${uid}';`})
    await auth('admin/users/'+uid,undefined,serviceKey,'DELETE')
    console.log('Disposable MFA fixture removed')
  }
}
