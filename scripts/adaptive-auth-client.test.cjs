const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
const token = 'a'.repeat(64) + '.' + 'b'.repeat(64)
const expiry = '2032-01-30T00:00:00Z'
function load(base, file, extra) {
  const source = fs.readFileSync(path.join(__dirname, '..', base, 'lib', file), 'utf8').replaceAll('import.meta.env.DEV', extra.devMode ? 'true' : 'false')
  const context = { exports: {}, AbortSignal, navigator: { userAgent: 'Chrome/132 Windows/10' }, ...extra }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.exports
}
for (const base of ['src/renderer/src', 'adminpwa/src/renderer/src']) {
  if (base === 'src/renderer/src') {
    test('desktop remembered credential wins over stale development credential', async () => {
      let devCalls = 0, payload
      const client = load(base, 'management-auth-client.ts', {
        devMode: true,
        window: { localStorage: { getItem: () => token }, api: { devDevice: { credential: async () => { devCalls++; return 'c'.repeat(64)+'.'+'d'.repeat(64) } } } },
        fetch: async (_url,init) => { payload=JSON.parse(init.body); return {ok:true,json:async()=>({ok:true,session:{access_token:'access',refresh_token:'refresh'}})} }
      })
      await client.managementLogin('user','password')
      assert.equal(payload.device_token,token); assert.equal(devCalls,0)
    })
    test('desktop restores native encrypted device credential when renderer origin storage is empty', async () => {
      let devCalls = 0, payload
      const client = load(base, 'management-auth-client.ts', {
        devMode: true,
        window: { localStorage: { getItem: () => null }, api: { trustedDevice: { read: async()=>token }, devDevice: { credential:async()=>{devCalls++;return null} } } },
        fetch: async (_url,init) => { payload=JSON.parse(init.body); return {ok:true,json:async()=>({ok:true,session:{access_token:'access',refresh_token:'refresh'}})} }
      })
      await client.managementLogin('user','password')
      assert.equal(payload.device_token,token); assert.equal(devCalls,0)
    })
  }
  function mfaHarness(backend) {
    const stored = new Map([['ankhang-management-device', token]])
    const calls = []
    const mfa = load(base, 'mfa.ts', {
      window: { localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) } },
      require: name => {
        if (name === './supabase') return { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'session' } } }), mfa: { listFactors: async () => { throw new Error('Unexpected TOTP lookup') } } } } }
        if (name === './security-request') return { securityRead: read => read() }
        if (name === './management-auth-client') return { managementSecurity: async (action, data, access) => { calls.push({ action, data, access }); return backend() } }
        throw new Error(name)
      }
    })
    return { mfa, stored, calls }
  }
  test(base + ' coalesces remembering and returns the authoritative extended session deadline', async () => {
    const h = mfaHarness(async () => ({ ok: true, device_token: token, session_expires_at: expiry }))
    const state = { second_factor_verified: true, login_method: 'totp' }
    assert.deepEqual(await Promise.all([h.mfa.rememberVerifiedDevice(state, 'old:user'), h.mfa.rememberVerifiedDevice(state, 'old:user')]), [expiry, expiry])
    assert.equal(await h.mfa.rememberVerifiedDevice(state, expiry + ':user'), expiry)
    assert.equal(h.calls.length, 1)
    assert.equal(h.calls[0].data.device_token, token)
    assert.equal(h.calls[0].access, 'session')
  })
  test(base + ' only actual completed TOTP/email proof creates trust', async () => {
    const h = mfaHarness(async () => { throw new Error('must not call') })
    for (const state of [{}, { second_factor_verified: false, login_method: 'totp' }, { second_factor_verified: true, login_method: 'dev_device' }, { second_factor_verified: true, login_method: 'recovery' }]) {
      assert.equal(await h.mfa.rememberVerifiedDevice(state, 'session:user'), undefined)
    }
    assert.equal(h.calls.length, 0)
  })
  test(base + ' remembering failure preserves existing credential and can retry', async () => {
    let count = 0
    const h = mfaHarness(async () => { if (++count === 1) throw new Error('offline'); return { ok: true, device_token: token, session_expires_at: expiry } })
    const state = { second_factor_verified: true, login_method: 'email' }
    assert.equal(await h.mfa.rememberVerifiedDevice(state, 'session:user'), undefined)
    assert.equal(h.stored.get('ankhang-management-device'), token)
    assert.equal(await h.mfa.rememberVerifiedDevice(state, 'session:user'), expiry)
    assert.equal(count, 2)
  })
  test(base + ' a service-verified trusted session passes the local MFA guard', async () => {
    const h = mfaHarness(async () => ({}))
    await h.mfa.requireSessionMfa({ state: 'ready', device_verified: true, login_method: 'dev_device' })
    await assert.rejects(h.mfa.requireSessionMfa({ state: 'totp', device_verified: false, login_method: 'dev_device' }), /Unexpected TOTP/)
  })
  test(base + ' malformed or unavailable device storage does not break password login', async () => {
    for (const stored of [token, 'corrupt-device', null, new Error('storage denied')]) {
      const calls = []
      const client = load(base, 'management-auth-client.ts', {
        window: { localStorage: { getItem: () => { if (stored instanceof Error) throw stored; return stored } } },
        fetch: async (_url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ ok: true, session: { access_token: 'access', refresh_token: 'refresh' } }) } }
      })
      await client.managementLogin('user', 'password')
      assert.equal(calls[0].device_token, stored === token ? token : undefined)
    }
  })
}
