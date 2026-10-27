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
  const response = await handler(new Request(url + '/functions/v1/admin-pwa-auth', { method: 'POST', headers: { authorization: 'Bearer ' + privateAuth.gatewaySecret, 'x-management-ip': fixtureIp, 'x-management-agent': 'Full MFA fixture', ...(token ? { 'x-management-session': token } : {}) }, body: JSON.stringify(action === 'login' ? { action, ...data } : { action: 'security', security_action: action, data }) }))
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
const probe = async allowed => {
  for (const [path, method, body] of [['users?select=id&limit=1', 'GET'], ['rpc/admin_pwa_investment_read', 'POST', {}], [`users?id=eq.${uid}`, 'PATCH', { full_name: 'Complete MFA fixture' }]]) {
    const response = await fetch(url + '/rest/v1/' + path, { method, headers: { apikey: anon, Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) })
    const resultText = await response.text()
    if (response.status !== 403 && !response.ok) console.log(JSON.stringify({ path, status: response.status, diagnostic: resultText.slice(0, 600) }))
    if (allowed) assert.ok(response.ok, `Authorized ${path} HTTP ${response.status}`)
    else if (response.status === 200) { assert.equal(resultText.trim(), '[]', `Unauthorized ${path} returned data`); }
    else assert.equal(response.status, 403, `Unauthorized ${path} must be blocked by pre-request`)
  }
  if (!allowed) {
    for (const slug of ['admin-pwa-sepay', 'admin-sepay-bridge', 'send-email-notification', 'admin-pwa-market', 'tenant-web-admin', 'contract-confirmation']) {
      const response = await fetch(url + '/functions/v1/' + slug, { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' }, body: JSON.stringify(slug === 'contract-confirmation' ? { action: 'history' } : {}), signal: AbortSignal.timeout(20000) })
      // Only an empty request is used; no payment, email or account action.
      assert.equal(response.status, 403, `Unverified ${slug} must deny before business processing`)
    }
  }
}
try {
  uid = (await auth('admin/users', { email, password, email_confirm: true, user_metadata: { purpose: 'management-mfa-disposable-verification' } })).data.id
  await management(env, '/database/query', { query: `insert into public.users(id,email,username,full_name,role,status) values('${uid}','${email}','${uid}','Complete MFA fixture','${fixtureRole}','active') on conflict(id) do update set role='${fixtureRole}',status='active';` })
  // Exercise the deployed Pages/Edge gateway before the local handler flow.
  const liveLogin = await fetch('https://app.phongtroankhang.com/api/management-auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', login: email, password }), signal: AbortSignal.timeout(30000)
  })
  const live = await liveLogin.json()
  assert.ok(liveLogin.ok && live.ok && live.session?.access_token, 'Live password login must allow enrollment access')
  access = live.session.access_token
  const liveStatus = await fetch('https://app.phongtroankhang.com/api/management-auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-management-session': access },
    body: JSON.stringify({ action: 'security', security_action: 'status', data: {} }), signal: AbortSignal.timeout(30000)
  })
  assert.equal((await liveStatus.json()).state, 'enroll')
  await probe(false)
  const readiness = await fetch(url + '/rest/v1/rpc/security_mfa_readiness', { method: 'POST', headers: { apikey: anon, Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' }, body: '{}' })
  const ready = await readiness.json()
  assert.ok(readiness.ok && ready.enrollment_enabled === true && ready.enforcement_enabled === true)
  checks.push('Deployed gateway directs an unenrolled account to setup; REST reads, writes and business RPC denied; enrollment readiness stays available')
  await login()
  assert.equal((await call('status')).value.state, 'enroll')
  assert.equal((await call('authorize', {}, access, true)).value.ok, false)
  await probe(false)
  checks.push('Password-only unenrolled account cannot authorize or access business data')
  const factor = (await auth('factors', { factor_type: 'totp', friendly_name: 'Full disposable factor' }, access)).data
  await verifyFactor(factor)
  assert.equal((await call('status')).value.state, 'email')
  await probe(false); checks.push('AAL2 alone cannot bypass email step-up')
  await login()
  await probe(false); checks.push('Direct REST and SECURITY DEFINER RPC deny a fresh AAL1 session')
  await verifyFactor(factor)
  await verifyEmail('signin')
  const codes = (await call('recovery_issue')).value
  assert.equal(codes.codes.length, 10)
  assert.equal((await call('authorize', {}, access, true)).value.ok, false)
  await call('recovery_ack', { batch_id: codes.batch_id }); await call('authorize')
  await probe(true); checks.push('Email + TOTP + acknowledged recovery bundle authorizes business access')
  // Changing password must preserve the existing AAL2 session and reject wrong current password.
  const badPassword = await auth('user', { password: randomBytes(24).toString('base64url'), current_password: 'wrong-current' }, access, 'PUT', false)
  assert.equal(badPassword.response.ok, false); checks.push('Auth rejects a wrong current password at AAL2')
  const createdDevice = (await call('device_create', { label: 'Disposable browser' })).value
  deviceToken = createdDevice.device_token
  await login(true)
  assert.equal((await call('status')).value.email_required, false)
  await verifyFactor(factor); await call('authorize'); await probe(true)
  checks.push('Trusted browser still needs TOTP and skips email only with matching server-issued device token')
  await call('device_revoke', { device_id: createdDevice.device_id })
  await probe(false); checks.push('Device revocation invalidates attached business sessions')
  await login()
  // Avoid the per-user 60-second email cooldown using only this disposable row.
  await management(env, '/database/query', { query: `update management_security.email_challenges set created_at=created_at-interval '61 seconds' where user_id='${uid}';` })
  await verifyEmail('recovery')
  await call('recovery_consume', { code: codes.codes[0] })
  assert.equal((await call('recovery_consume', { code: codes.codes[0] }, access, true)).value.ok, false)
  await probe(false)
  await call('recovery_reset')
  assert.equal((await call('status')).value.state, 'enroll')
  const nextFactor = (await auth('factors', { factor_type: 'totp', friendly_name: 'Replacement disposable factor' }, access)).data
  await verifyFactor(nextFactor)
  assert.equal((await call('status')).value.state, 'recovery_codes')
  assert.equal((await call('recovery_reset', {}, access, true)).response.status, 403)
  const newCodes = (await call('recovery_issue')).value
  await call('recovery_ack', { batch_id: newCodes.batch_id }); await call('authorize'); await probe(true)
  checks.push('Single-use recovery only permits re-enrollment; new verified factor and saved codes restore access')
  await call('revoke_session', { all: true }); await probe(false)
  checks.push('Sign-out-all revokes business access')
  const report = { at: new Date().toISOString(), role: fixtureRole, checks, customerDataChanged: false, evidenceScope: 'Deployed gateway login/status plus local gateway handler with real production Auth/DB and real HTTP REST read/write/RPC hook; email provider intercepted only for disposable mailbox. Live provider delivery is separately verified.', secretsLogged: false }
  await writeFile(new URL(`../docs/security/qa/mfa-mandatory-${fixtureRole}-2026-10-10.json`, import.meta.url), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  emailCode = access = refresh = deviceToken = undefined
  if (uid) {
    await management(env, '/database/query', { query: `delete from public.users where id='${uid}' and username='${uid}';` })
    await auth('admin/users/' + uid, undefined, service, 'DELETE')
    console.log('Disposable full-flow account removed')
  }
}
