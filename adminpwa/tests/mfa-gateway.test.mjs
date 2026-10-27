import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../backend/functions/admin-pwa-auth/handler.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' })
const { createManagementAuthHandler } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const uid = '12345678-1234-1234-1234-123456789abc', sid = '87654321-1234-1234-1234-123456789abc'
const factor = 'abcdefab-1234-1234-1234-123456789abc', challenge = 'abcdefab-5678-1234-1234-123456789abc'
const config = { supabaseUrl: 'https://fixture.supabase.co', anonKey: 'fixture-anon', serviceKey: 'fixture-service', gatewaySecret: 'fixture-gateway-secret-123456789', resendApiKey: 'fixture-mail-key', mailFrom: 'Fixture <fixture@example.invalid>' }
const jwt = (aal = 'aal1', user = uid, session = sid) => 'fixture.' + Buffer.from(JSON.stringify({ sub: user, session_id: session, aal, aud: 'authenticated' })).toString('base64url') + '.signature'
function harness(options = {}) {
  const calls = []
  const handler = createManagementAuthHandler(config, async (url, init) => {
    calls.push({ url, init })
    const body = init.body ? JSON.parse(init.body) : null
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: options.user ?? uid, email: 'auth-identity@example.invalid', email_confirmed_at: '2026-10-09' }, { status: options.authStatus ?? 200 })
    if (url.endsWith('/rpc/security_email_accepted')) return Response.json(options.recordFailed ? false : true)
    if (url.endsWith('/rpc/security_email_login_start')) return Response.json({ ok: options.emailEligible !== false, reason: 'unavailable' })
    if (url.endsWith('/rpc/security_email_login_verify')) return Response.json({ ok: options.emailValid !== false })
    if (url.endsWith('/rpc/security_email_login_status')) return Response.json({ ok: options.emailProof === true })
    if (url.endsWith('/rpc/security_dev_device_status')) return Response.json({ ok: options.devProof === true })
    if (url.endsWith('/rpc/security_totp_replacement')) return Response.json({ok:options.rotation !== false})
    if (url.endsWith('/rpc/security_totp_replacement')) return Response.json({ ok: options.rotation !== false })
    if (url.endsWith('/rpc/security_overview_read')) return Response.json({ ok: options.overview !== false, devices: [], sessions: [], events: [] })
    if (url.endsWith('/rpc/security_service')) {
      if (body.p_action === 'rate') return Response.json({ ok: options.rate !== false })
      if (body.p_action === 'email_create') return Response.json({ ok: true })
      if (body.p_action === 'status') return Response.json({ ok:true, state:'ready', expires_at:'2026-10-13T10:00:00Z', second_factor_verified:true, login_method:options.emailProof ? 'email' : 'totp' })
      return Response.json({ ok: options.transition !== false, state: 'ready' })
    }
    if (url.endsWith('/challenge')) return Response.json({ id: challenge })
    if (url.endsWith('/verify')) return Response.json(options.totp === false ? { error: 'invalid' } : { access_token: jwt('aal2', uid, options.nextSession ?? sid), refresh_token: 'fixture-refresh' }, { status: options.totp === false ? 400 : 200 })
    if (url === 'https://api.resend.com/emails') return Response.json(options.invalidProvider ? {} : { id: challenge }, { status: options.mailFailed ? 503 : 200 })
    throw new Error('Unexpected request')
  })
  const run = (action, data = {}, token = jwt()) => handler(new Request('https://fixture.supabase.co/functions/v1/admin-pwa-auth', {
    method: 'POST', headers: { authorization: `Bearer ${config.gatewaySecret}`, 'x-management-ip': 'a'.repeat(64), 'x-management-agent': 'fixture-browser', 'x-management-session': token },
    body: JSON.stringify({ action: 'security', security_action: action, data })
  }))
  return { calls, run }
}
test('security rejects bad JWT and mismatched verified Auth identity before any state transition', async () => {
  for (const [options, token] of [[{}, 'invalid'], [{ user: sid }, jwt()], [{ authStatus: 401 }, jwt()]]) {
    const h = harness(options); assert.equal((await h.run('status', {}, token)).status, 401)
    assert.ok(!h.calls.some(c => c.url.includes('security_service')))
  }
})
test('browser cannot forge success events, internal transitions, actors, hashes or factor state', async () => {
  for (const [action, data] of [['mfa_event', { success: true }], ['email_create', { code_hash: 'a'.repeat(64) }], ['authorize', { p_user: sid }], ['register', {}], ['device_create', { token_hash: 'a'.repeat(64) }]]) {
    const h = harness(); assert.equal((await h.run(action, data)).status, 400)
    assert.ok(!h.calls.some(c => c.url.includes('security_service')))
  }
})
test('TOTP rate denial precedes Auth challenge/verify and invalid codes audit failure', async () => {
  const limited = harness({ rate: false }); assert.equal((await limited.run('totp_verify', { factor_id: factor, challenge_id: challenge, code: '123456' })).status, 429)
  assert.ok(!limited.calls.some(c => c.url.endsWith('/verify')))
  const invalid = harness({ totp: false }); assert.equal((await invalid.run('totp_verify', { factor_id: factor, challenge_id: challenge, code: '123456' })).status, 401)
  assert.ok(invalid.calls.some(c => c.init.body && JSON.parse(c.init.body).p_action === 'mfa_event' && JSON.parse(c.init.body).p_data.success === false))
})
test('MFA result must preserve identity and session before returning verified tokens', async () => {
  assert.equal((await harness({rotation:false}).run('totp_verify', {factor_id:factor,challenge_id:challenge,code:'123456'})).status,503)
  assert.equal((await harness({ nextSession: uid }).run('totp_verify', { factor_id: factor, challenge_id: challenge, code: '123456' })).status, 503)
  const h = harness(), result = await h.run('totp_verify', { factor_id: factor, challenge_id: challenge, code: '123456' })
  assert.equal(result.status, 200)
  assert.equal((await result.json()).session.access_token, jwt('aal2'))
  const verify = h.calls.find(c => c.url.endsWith('/verify'))
  assert.equal(verify.init.headers.apikey, config.anonKey)
  assert.equal(verify.init.headers.Authorization, 'Bearer ' + jwt())
})
test('security email goes only to verified Auth identity, never a browser address or notification preferences', async () => {
  const h = harness(), response = await h.run('email_send', { purpose: 'signin' }), value = await response.json()
  assert.equal(response.status, 200)
  const delivered = h.calls.find(c => c.url === 'https://api.resend.com/emails'), mail = JSON.parse(delivered.init.body)
  assert.deepEqual(mail.to, ['auth-identity@example.invalid'])
  assert.match(mail.text, /\b\d{6}\b/)
  assert.ok(!JSON.stringify(value).includes(mail.text.match(/\b\d{6}\b/)[0]))
  const created = JSON.parse(h.calls.find(c => c.init.body && JSON.parse(c.init.body).p_action === 'email_create').init.body)
  assert.match(created.p_data.code_hash, /^[a-f0-9]{64}$/)
  const recorded = JSON.parse(h.calls.find(c => c.url.endsWith('/rpc/security_email_accepted')).init.body)
  assert.equal(recorded.p_provider, challenge)
  assert.equal(recorded.p_challenge, value.challenge_id)
  assert.equal(recorded.p_user, uid)
  assert.equal(recorded.p_session, sid)
  assert.ok(!JSON.stringify(value).includes('provider'))
  assert.equal((await h.run('email_send', { purpose: 'signin', email: 'attacker@example.invalid' })).status, 400)
})
test('provider failure invalidates the generated email challenge', async () => {
  const h = harness({ mailFailed: true }); assert.equal((await h.run('email_send', { purpose: 'signin' })).status, 503)
  assert.ok(h.calls.some(c => c.init.body && JSON.parse(c.init.body).p_action === 'email_failed'))
})

test('alternate email login uses service-verified mailbox and a separate session-bound proof', async () => {
  const h = harness(), response = await h.run('email_send', { purpose: 'login' })
  assert.equal(response.status, 200)
  const start = JSON.parse(h.calls.find(c => c.url.endsWith('/security_email_login_start')).init.body)
  assert.equal(start.p_user, uid); assert.equal(start.p_session, sid)
  assert.match(start.p_code_hash, /^[a-f0-9]{64}$/)
  assert.deepEqual(JSON.parse(h.calls.find(c => c.url === 'https://api.resend.com/emails').init.body).to, ['auth-identity@example.invalid'])
  const denied = harness({emailEligible:false})
  assert.equal((await denied.run('email_send', { purpose: 'login' })).status, 403)
  assert.ok(!denied.calls.some(c => c.url === 'https://api.resend.com/emails'))
  assert.equal((await h.run('email_send', { purpose:'login', email:'attacker@example.invalid' })).status,400)
  assert.equal((await h.run('email_verify', { purpose:'login', challenge_id:challenge, code:'123456' })).status,200)
  const proof = JSON.parse(h.calls.find(c => c.url.endsWith('/security_email_login_verify')).init.body)
  assert.equal(proof.p_user,uid); assert.equal(proof.p_session,sid)
  assert.equal((await harness({emailValid:false}).run('email_verify', {purpose:'login',challenge_id:challenge,code:'123456'})).status,401)
})

test('failed/rate-limited alternate email sends do not return a usable login challenge', async () => {
  for (const [options,status] of [[{mailFailed:true},503],[{recordFailed:true},503],[{rate:false},429]]) {
    const h=harness(options),response=await h.run('email_send',{purpose:'login'})
    assert.equal(response.status,status);assert.ok(!(await response.json()).challenge_id)
  }
})

test('email login status retains the authoritative session deadline', async () => {
  const h=harness({emailProof:true}),response=await h.run('status'),state=await response.json()
  assert.equal(response.status,200);assert.equal(state.expires_at,'2026-10-13T10:00:00Z')
  assert.equal(state.login_method,'email');assert.equal(state.second_factor_verified,true)
  assert.ok(h.calls.some(c=>c.url.endsWith('/security_service') && JSON.parse(c.init.body).p_action==='status'))
  assert.ok(!h.calls.some(c=>c.url.endsWith('/security_totp_replacement')))
})
test('AAL1 email verification status does not require TOTP rotation resume', async () => {
  const h = harness({ rotation: false }), response = await h.run('status', {}, jwt('aal1'))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).state, 'ready')
  assert.ok(h.calls.some(c => c.url.endsWith('/rpc/security_service') && JSON.parse(c.init.body).p_action === 'status'))
  assert.ok(!h.calls.some(c => c.url.endsWith('/rpc/security_totp_replacement')))
})
test('dev device status requires a service-recorded proof and never runs TOTP lookup', async () => {
  const h = harness({ devProof: true }), response = await h.run('status')
  assert.equal(response.status, 200)
  assert.ok(h.calls.some(c => c.url.endsWith('/security_dev_device_status')))
  assert.ok(!h.calls.some(c => c.url.endsWith('/security_totp_replacement')))
  assert.equal((await harness().run('overview')).status, 403)
  assert.equal((await harness({ devProof: true }).run('overview')).status, 200)
  assert.equal((await harness().run('status', { dev: true })).status, 400)
})
test('invalid provider acceptance or failed metadata persistence cannot return a usable challenge', async () => {
  for (const options of [{ invalidProvider: true }, { recordFailed: true }]) {
    const h = harness(options), response = await h.run('email_send', { purpose: 'signin' })
    assert.equal(response.status, 503)
    assert.ok(!(await response.json()).challenge_id)
    assert.ok(h.calls.some(c => c.init.body && JSON.parse(c.init.body).p_action === 'email_failed'))
  }
})
test('trusted device bearer is generated by server and only its hash reaches the database', async () => {
  const h = harness(), result = await (await h.run('device_create', { label: 'Fixture browser' })).json()
  assert.match(result.device_token, /^[a-f0-9]{64}\.[a-f0-9]{64}$/)
  const body = JSON.parse(h.calls.find(c => c.init.body && JSON.parse(c.init.body).p_action === 'device_create').init.body)
  assert.match(body.p_data.token_hash, /^[a-f0-9]{64}$/)
  assert.ok(!JSON.stringify(body).includes(result.device_token))
})

test('rotation controls reject AAL1, malformed/forged fields and mismatched factor IDs', async () => {
  for (const [action,data] of [['totp_replace_begin',{factor_id:factor}], ['totp_replace_register',{factor_id:factor}], ['totp_replace_cancel',{}], ['totp_retire',{old_factor_id:factor,new_factor_id:challenge}]]) {
    const h=harness(); assert.ok((await h.run(action,data)).status>=400)
    assert.ok(!h.calls.some(c=>c.url.endsWith('/rpc/security_totp_replacement')))
  }
  assert.equal((await harness().run('totp_retire',{old_factor_id:factor,new_factor_id:factor},jwt('aal2'))).status,400)
  assert.equal((await harness().run('totp_replace_begin',{factor_id:factor,p_user:sid},jwt('aal2'))).status,400)
})
test('rotation RPC uses only verified caller identity; rejection never deletes a factor', async () => {
  const h=harness({rotation:false}); const response=await h.run('totp_retire',{old_factor_id:factor,new_factor_id:challenge},jwt('aal2'))
  assert.equal(response.status,503)
  const request=h.calls.find(c=>c.url.endsWith('/rpc/security_totp_replacement')); const body=JSON.parse(request.init.body)
  assert.equal(body.p_user,uid); assert.equal(body.p_session,sid); assert.equal(body.p_action,'finish')
  assert.ok(!h.calls.some(c=>c.init.method==='DELETE'))
})
test('successful new TOTP verification must finish atomic retirement before tokens are returned', async () => {
  const h=harness(); const response=await h.run('totp_verify',{factor_id:factor,challenge_id:challenge,code:'123456'})
  assert.equal(response.status,200)
  const body=JSON.parse(h.calls.find(c=>c.url.endsWith('/rpc/security_totp_replacement')).init.body)
  assert.equal(body.p_action,'verified'); assert.equal(body.p_new,factor)
  assert.equal((await harness({rotation:false}).run('totp_verify',{factor_id:factor,challenge_id:challenge,code:'123456'})).status,503)
})

test('overview reads use verified login without fresh OTP; AAL1 and unapproved sessions remain denied',async()=>{
  const h=harness();const response=await h.run('overview',{},jwt('aal2'));assert.equal(response.status,200)
  assert.ok(h.calls.some(c=>c.url.endsWith('/rpc/security_overview_read')))
  assert.ok(!h.calls.some(c=>c.url.endsWith('/challenge')||c.url.endsWith('/verify')))
  const a=harness();assert.equal((await a.run('overview')).status,403)
  assert.ok(!a.calls.some(c=>c.url.endsWith('/rpc/security_overview_read')))
  assert.equal((await harness({overview:false}).run('overview',{},jwt('aal2'))).status,403)
})
