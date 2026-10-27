import assert from 'node:assert/strict'
import { randomBytes, createHmac } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
const service = env.SUPABASE_SERVICE_ROLE_KEY
const privateAuth = JSON.parse(await readFile(new URL('../adminpwa/.env.auth-private.json', import.meta.url), 'utf8'))
const bundle = await build({ entryPoints: [fileURLToPath(new URL('../adminpwa/backend/functions/admin-pwa-auth/handler.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node' })
const { createManagementAuthHandler } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const email = `full-mfa-${randomBytes(8).toString('hex')}@example.invalid`
const password = randomBytes(24).toString('base64url')
let uid, emailCode, access, refresh, deviceToken
const checks = []
const fixtureIp = randomBytes(32).toString('hex')
const fixtureRole = process.argv.includes('--staff') ? 'user' : 'admin'
const auth = async (path, body, token = service, method = body === undefined ? 'GET' : 'POST', expected = true) => {
  const response = await fetch(url + '/auth/v1/' + path, { method, headers: { apikey: token === service ? service : anon, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) })
  const data = await response.json().catch(() => null)
  if (expected) assert.ok(response.ok, `Auth ${path} HTTP ${response.status}`)
  return { response, data }
}
const handler = createManagementAuthHandler({ supabaseUrl: url, anonKey: anon, serviceKey: service, gatewaySecret: privateAuth.gatewaySecret, resendApiKey: 'fixture-provider', mailFrom: 'fixture@example.invalid' }, async (target, init) => {
  if (target === 'https://api.resend.com/emails') {
    const message = JSON.parse(init.body)
    assert.deepEqual(message.to, [email])
    emailCode = message.text.match(/: (\d{6})/)[1]
    return Response.json({ id: crypto.randomUUID() })
  }
  return fetch(target, init)
})
const call = async (action, data = {}, token = access, allowFailure = false) => {
  const request = new Request(url + '/functions/v1/admin-pwa-auth', { method: 'POST', headers: { authorization: 'Bearer ' + privateAuth.gatewaySecret, 'x-management-ip': fixtureIp, 'x-management-agent': 'Full MFA fixture', 'Content-Type': 'application/json', ...(token ? { 'x-management-session': token } : {}) }, body: JSON.stringify(action === 'login' ? { action, ...data } : { action: 'security', security_action: action, data }) })
  // Real deployed Edge for every action except mocked mailbox delivery.
  const response = action === 'email_send' || action === 'email_verify' ? await handler(request) : await fetch(request)
  const value = await response.json()
  if (!allowFailure) assert.ok(response.ok && value.ok === true, `${action} HTTP ${response.status}`)
  return { response, value }
}
const login = async (trusted = false) => {
  const { value } = await call('login', { login: email, password, ...(trusted ? { device_token: deviceToken } : {}) }, undefined)
  access = value.session.access_token; refresh = value.session.refresh_token
}
const totp = secret => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''
  for (const c of secret.toUpperCase().replace(/=+$/, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const key = Buffer.from((bits.match(/.{8}/g) || []).map(x => parseInt(x, 2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const hash = createHmac('sha1', key).update(counter).digest(); const offset = hash.at(-1) & 15
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
}
const verifyFactor = async factor => {
  const { value: challenge } = await call('totp_challenge', { factor_id: factor.id })
  const { value } = await call('totp_verify', { factor_id: factor.id, challenge_id: challenge.challenge_id, code: totp(factor.totp.secret) })
  access = value.session.access_token; refresh = value.session.refresh_token
}
const verifyEmail = async purpose => {
  const { value } = await call('email_send', { purpose })
  assert.equal(Object.hasOwn(value, 'code'), false)
  await call('email_verify', { purpose, challenge_id: value.challenge_id, code: emailCode })
  emailCode = undefined
}
try {
  uid = (await auth('admin/users', { email, password, email_confirm: true, user_metadata: { purpose: 'management-mfa-disposable-verification' } })).data.id
  await management(env, '/database/query', { query: `insert into public.users(id,email,username,full_name,role,status) values('${uid}','${email}','${uid}','Rotation test','user','active') on conflict(id) do update set role='user',status='active';` })
  await login()
  const old = (await auth('factors', { factor_type: 'totp', friendly_name: 'Old disposable factor' }, access)).data
  await verifyFactor(old); await verifyEmail('signin')
  let codes=(await call('recovery_issue')).value
  await call('recovery_ack',{batch_id:codes.batch_id}); await call('authorize')
  const previousSession=JSON.parse(Buffer.from(access.split('.')[1],'base64url').toString()).session_id
  await call('totp_replace_begin',{factor_id:old.id})
  let next=(await auth('factors',{factor_type:'totp',friendly_name:'New disposable factor'},access)).data
  await call('totp_replace_register',{factor_id:next.id})
  assert.equal((await call('totp_retire',{old_factor_id:old.id,new_factor_id:next.id},access,true)).value.ok,false)
  await call('totp_replace_cancel')
  let user=(await auth('user',undefined,access)).data
  assert.ok(user.factors.some(f=>f.id===old.id && f.status==='verified'))
  assert.ok(!user.factors.some(f=>f.id===next.id))
  checks.push('Real Auth: cancel removes only unverified replacement; premature retirement denied')
  await verifyFactor(old); await call('totp_replace_begin',{factor_id:old.id})
  next=(await auth('factors',{factor_type:'totp',friendly_name:'New disposable factor'},access)).data
  await call('totp_replace_register',{factor_id:next.id})
  await verifyFactor(next)
  user=(await auth('user',undefined,access)).data
  assert.equal(user.factors.filter(f=>f.factor_type==='totp').length,1)
  assert.equal(user.factors.find(f=>f.factor_type==='totp').id,next.id)
  assert.equal(JSON.parse(Buffer.from(access.split('.')[1],'base64url').toString()).session_id,previousSession)
  assert.equal((await call('status')).value.state,'recovery_codes')
  codes=(await call('recovery_issue')).value
  await call('recovery_ack',{batch_id:codes.batch_id}); await call('authorize')
  assert.equal((await call('status')).value.state,'ready')
  checks.push('Real Auth: new code verified; old factor removed atomically; current session survives; saved new recovery codes restore ready state')
  codes=(await call('recovery_issue')).value
  await call('recovery_ack',{batch_id:codes.batch_id})
  assert.equal((await call('status')).value.state,'ready')
  checks.push('Real Auth/DB: recovery regeneration and acknowledgement complete without a new login')
  await management(env,'/database/query',{query:`update auth.mfa_amr_claims set updated_at=clock_timestamp()-interval '6 minutes' where session_id='${previousSession}' and authentication_method='totp';`})
  const overview=(await call('overview')).value
  assert.ok(Array.isArray(overview.devices) && Array.isArray(overview.events))
  assert.ok(!JSON.stringify(overview).includes('token_hash'))
  const remembered=(await call('device_create',{label:'Completed login browser'})).value
  assert.equal(typeof remembered.device_token,'string')
  assert.ok((await call('device_revoke',{device_id:remembered.device_id},access,true)).response.status>=400)
  checks.push('Deployed Edge: completed AAL2 login reads history and remembers this browser outside fresh-MFA window; revocation still requires fresh proof')
  await writeFile(new URL('../docs/security/qa/totp-replacement-auth-e2e.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),checks,customerDataChanged:false,emailProvider:'intercepted for disposable identity only',secretsLogged:false},null,2)+'\n')
  console.log(JSON.stringify(checks))
} finally {
  emailCode=access=refresh=deviceToken=undefined
  if(uid){await management(env,'/database/query',{query:`delete from public.users where id='${uid}' and username='${uid}';`});await auth('admin/users/'+uid,undefined,service,'DELETE');console.log('Disposable rotation account removed')}
}
