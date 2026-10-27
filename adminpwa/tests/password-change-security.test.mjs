import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../backend/functions/admin-pwa-auth/handler.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' })
const { createManagementAuthHandler } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const uid = '12345678-1234-1234-1234-123456789abc', sid = '87654321-1234-1234-1234-123456789abc', temporarySid = 'abcdefab-5678-1234-1234-123456789abc'
const jwt = (session = sid, aal = 'aal2', subject = uid) => 'fixture.' + Buffer.from(JSON.stringify({ sub: subject, session_id: session, aal, aud: 'authenticated' })).toString('base64url') + '.signature'
const config = { supabaseUrl: 'https://fixture.supabase.co', anonKey: 'fixture-anon', serviceKey: 'fixture-service', gatewaySecret: 'fixture-gateway-secret-123456789' }
function harness(options = {}) {
  const calls = []
  const handler = createManagementAuthHandler(config, async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null
    calls.push({ url, init, body })
    if (url.endsWith('/auth/v1/user') && init.method === 'GET') return Response.json({ id: uid, email: 'caller@example.invalid' }, { status: options.authStatus || 200 })
    if (url.endsWith('/rpc/security_password_stepup')) return Response.json({ ok: options[body.p_action] !== false, reason: options.reason || 'session', recent_password: true })
    if (url.endsWith('/rpc/security_email_login_status')) return Response.json({ ok: options.emailProof === true })
    if (url.endsWith('/rpc/security_dev_device_status')) return Response.json({ ok: options.devProof === true })
    if (url.includes('/auth/v1/token?')) return Response.json(options.wrongPassword ? { error: 'wrong' } : { access_token: jwt(options.temporarySid || temporarySid, 'aal1', options.temporaryUser || uid), user: { id: options.temporaryUser || uid }, refresh_token: 'temporary-secret' }, { status: options.wrongPassword ? 400 : 200 })
    if (url.includes('/auth/v1/logout')) return Response.json({}, { status: options.cleanupFails ? 503 : 200 })
    if (url.endsWith('/auth/v1/user') && init.method === 'PUT') return Response.json({ id: uid }, { status: options.changeFails ? 400 : 200 })
    throw new Error('Unexpected request')
  })
  const run = (action = 'password_confirm', data = { password: 'fixture-current-password' }, token = jwt()) => handler(new Request('https://fixture', {
    method: 'POST', headers: { authorization: `Bearer ${config.gatewaySecret}`, 'x-management-ip': 'a'.repeat(64), 'x-management-agent': 'fixture-browser', 'x-management-session': token },
    body: JSON.stringify({ action: 'security', security_action: action, data })
  }))
  return { calls, run }
}
test('password proof requires a verified AAL2 identity and a ready session before checking password', async () => {
  for (const [options, token, status] of [[{ authStatus: 401 }, jwt(), 401], [{ prepare: false }, jwt(), 403], [{}, jwt(sid, 'aal1'), 403]]) {
    const h = harness(options); assert.equal((await h.run('password_confirm', { password: 'valid-password' }, token)).status, status)
    assert.ok(!h.calls.some(c => c.url.includes('/token?')))
  }
})
test('wrong password and rate denial never record confirmation or change password', async () => {
  for (const [options, status] of [[{ wrongPassword: true }, 401], [{ prepare: false, reason: 'rate' }, 429]]) {
    const h = harness(options); assert.equal((await h.run()).status, status)
    assert.ok(!h.calls.some(c => c.body?.p_action === 'confirm' || c.init.method === 'PUT'))
    if (status === 429) assert.ok(!h.calls.some(c => c.url.includes('/token?')))
  }
})

test('AAL1 password operations require live server-side email login proof', async () => {
  const h=harness({emailProof:true}),response=await h.run('password_confirm',{password:'fixture-current-password'},jwt(sid,'aal1'))
  assert.equal(response.status,200)
  assert.ok(h.calls.some(c=>c.url.endsWith('/security_email_login_status') && c.body.p_session===sid))
  const denied=harness({emailProof:false})
  assert.equal((await denied.run('password_confirm',{password:'fixture-current-password'},jwt(sid,'aal1'))).status,403)
  assert.ok(!denied.calls.some(c=>c.url.includes('/token?')))
})
test('confirmation uses the server identity, revokes only temporary login and never returns tokens', async () => {
  const h = harness(), result = await h.run(), body = await result.json()
  assert.equal(result.status, 200); assert.deepEqual(body, { ok: true, recent_password: true })
  const login = h.calls.find(c => c.url.includes('/token?'))
  assert.equal(login.body.email, 'caller@example.invalid')
  const logout = h.calls.find(c => c.url.includes('/logout'))
  assert.equal(logout.init.headers.Authorization, 'Bearer ' + jwt(temporarySid, 'aal1'))
  assert.match(logout.url, /scope=local/)
  assert.equal(h.calls.findIndex(c => c.body?.p_action === 'confirm') > h.calls.indexOf(logout), true)
  assert.equal(h.calls.find(c => c.body?.p_action === 'confirm').body.p_session, sid)
})
test('dev device still requires the real current password for sensitive operations', async () => {
  assert.equal((await harness({devProof:true}).run('password_confirm',{password:'fixture-current-password'},jwt(sid,'aal1'))).status,200)
  assert.equal((await harness({devProof:true,wrongPassword:true}).run('password_confirm',{password:'wrong'},jwt(sid,'aal1'))).status,401)
})
test('mismatched temporary identity, reused caller session or failed cleanup cannot grant proof', async () => {
  for (const options of [{ temporaryUser: sid }, { temporarySid: sid }, { cleanupFails: true }, { confirm: false }]) {
    const h = harness(options), result = await h.run()
    assert.ok(result.status >= 400)
    if (options.confirm !== false) assert.ok(!h.calls.some(c => c.body?.p_action === 'confirm'))
    assert.ok(!h.calls.some(c => c.init.method === 'PUT'))
  }
})
test('browser cannot choose actor, email, target account or confirmation time', async () => {
  for (const field of ['userId', 'email', 'p_user', 'confirmed_at', 'recent_password']) {
    const h = harness(); assert.equal((await h.run('password_confirm', { password: 'valid-password', [field]: uid })).status, 400)
    assert.ok(!h.calls.some(c => c.url.includes('/token?') || c.body?.p_action === 'confirm'))
  }
})
test('own password change preserves current AAL2 session and native Auth password policy', async () => {
  const h = harness(), result = await h.run('password_change', { password: 'current-password', new_password: 'new-password-long' })
  assert.equal(result.status, 200)
  const change = h.calls.find(c => c.init.method === 'PUT')
  assert.equal(change.url, config.supabaseUrl + '/auth/v1/user')
  assert.equal(change.init.headers.apikey, config.anonKey)
  assert.equal(change.init.headers.Authorization, 'Bearer ' + jwt())
  assert.deepEqual(change.body, { password: 'new-password-long', current_password: 'current-password' })
  assert.ok(!h.calls.some(c => c.url.includes('/admin/users/')))
})
test('invalid or oversized passwords never reach password verification or mutation', async () => {
  for (const data of [{ password: '' }, { password: 'x'.repeat(257) }, { password: 'current', new_password: 'short' }, { password: 'current', new_password: 'x'.repeat(257) }]) {
    const h = harness(); assert.equal((await h.run(data.new_password ? 'password_change' : 'password_confirm', data)).status, 400)
    assert.ok(!h.calls.some(c => c.url.includes('/token?') || c.init.method === 'PUT'))
  }
})
for (const base of ['adminpwa', 'electron']) {
  async function clientHarness(failure = false) {
    const file = base === 'adminpwa' ? '../src/renderer/src/lib/mfa.ts' : '../../src/renderer/src/lib/mfa.ts'
    const source = await readFile(new URL(file, import.meta.url), 'utf8')
    const start = source.indexOf('export async function confirmSensitivePassword'), end = source.indexOf('export async function sendSecurityEmailCode', start)
    const js = ts.transpileModule(source.slice(start, end).replaceAll('export async function', 'async function'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    const calls = [], context = vm.createContext({ securityCall: async (action, data) => { calls.push([action, data]); if (failure) throw new Error('server-denied'); return { ok: true } } })
    vm.runInContext(js, context)
    return { calls, confirm: context.confirmSensitivePassword, change: context.changeOwnPasswordWithConfirmation }
  }
  test(base + ' sends password to server without replacing AAL2; rejects locally invalid fields and server failures', async () => {
    const h = await clientHarness()
    await assert.rejects(h.confirm('')); await assert.rejects(h.confirm('x'.repeat(257))); await assert.rejects(h.change('short', 'current'))
    assert.equal(h.calls.length, 0)
    await h.confirm('current-password'); await h.change('new-password-long', 'current-password')
    assert.equal(h.calls[0][0], 'password_confirm'); assert.equal(h.calls[1][0], 'password_change')
    assert.equal(h.calls[1][1].password, 'current-password'); assert.equal(h.calls[1][1].new_password, 'new-password-long')
    const failing = await clientHarness(true); await assert.rejects(failing.confirm('current')); await assert.rejects(failing.change('new-password-long', 'current'))
  })
}
