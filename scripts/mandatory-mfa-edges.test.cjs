const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')

for (const slug of ['admin-sepay-bridge', 'send-email-notification']) {
  function harness(allowed, error = null) {
    let handler
    const calls = []
    const query = { select() { return query }, eq() { return query }, maybeSingle: async () => ({ data: { role: 'admin', status: 'active' }, error: null }) }
    const source = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions', slug, 'index.ts'), 'utf8').replace(/^import .*\r?\n/gm, '')
    const context = vm.createContext({ Response, crypto: globalThis.crypto, console,
      Deno: { env: { get: name => name }, serve: fn => { handler = fn } },
      createClient: (url, key, options) => ({
        auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }) },
        rpc: async (name, data) => { calls.push(['guard', key, options.global.headers.Authorization, name, data]); return { data: allowed, error } },
        from: () => { calls.push(['privileged-read']); return query }
      })
    })
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
    return { handler, calls }
  }
  const request = () => new Request('https://fixture', { method: 'POST', headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' }, body: '{}' })
  test(slug + ' denies unverified and unavailable MFA before service-role operations', async () => {
    for (const [allowed, error] of [[false, null], [null, null], [true, new Error('unavailable')]]) {
      const h = harness(allowed, error)
      assert.equal((await h.handler(request())).status, slug === 'admin-sepay-bridge' && error ? 503 : 403)
      assert.equal(h.calls.length, 1)
      assert.deepEqual(h.calls[0].slice(0, 4), ['guard', 'SUPABASE_ANON_KEY', 'Bearer fixture-token', 'security_management_access_allowed'])
      assert.equal(h.calls[0][4].p_sensitive, true)
    }
  })
  test(slug + ' checks verified sessions before checking the administrator profile', async () => {
    const h = harness(true)
    assert.equal((await h.handler(request())).status, 400)
    assert.deepEqual(h.calls.map(call => call[0]), ['guard', 'privileged-read'])
  })
}
