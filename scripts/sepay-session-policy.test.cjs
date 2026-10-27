const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function harness({ allowed = sensitive => !sensitive, error = null, role = 'admin', authenticated = true } = {}) {
  const calls = []
  let handler
  const query = { select() { return query }, eq() { return query }, maybeSingle: async () => ({ data: { role, status: 'active', sepay_api_token: 'fixture-provider-token' }, error: null }) }
  const source = fs.readFileSync(path.join(__dirname, '..', 'supabase/functions/admin-sepay-bridge/index.ts'), 'utf8').replace(/^import .*\r?\n/gm, '')
  const context = vm.createContext({ Response, console,
    Deno: { env: { get: name => name }, serve: fn => { handler = fn } },
    fetch: async () => { calls.push('provider'); return Response.json({status:200,transactions:[]}) },
    createClient: (url, key, options) => ({
      auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'fixture-user' } : null }, error: null }) },
      rpc: async (name, args, rpcOptions) => { calls.push({name, args, rpcOptions, authorization:options.global.headers.Authorization}); return { data: allowed(args.p_sensitive), error } },
      from: () => { calls.push('privileged-read'); return query }
    })
  })
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { handler, calls }
}
const request = action => new Request('https://fixture', { method: 'POST', headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' }, body: JSON.stringify({action}) })

test('SePay status and history retain full session checks without requiring recent MFA', async () => {
  for (const action of ['sepay_status','sepay_fetch']) {
    const h = harness()
    assert.equal((await h.handler(request(action))).status,200)
    const guard = h.calls[0]
    assert.equal(guard.name,'security_management_access_allowed')
    assert.equal(guard.args.p_sensitive,false)
    assert.equal(guard.rpcOptions.get,true)
    assert.equal(guard.authorization,'Bearer fixture-token')
  }
})

test('stale MFA cannot change SePay token, create/reset/delete accounts or bypass with unknown actions', async () => {
  for (const action of ['sepay_set','admin_create','admin_reset_password','admin_delete','unknown']) {
    const h = harness()
    const response = await h.handler(request(action))
    assert.equal(response.status,403)
    assert.match((await response.json()).error,/xác nhận mật khẩu hiện tại/)
    assert.equal(h.calls[0].args.p_sensitive,true)
    assert.equal(h.calls.length,1)
  }
})

test('history rejects incomplete sessions, unauthenticated callers, staff and guard outages', async () => {
  for (const [options,status] of [[{allowed:()=>false},403],[{authenticated:false},401],[{role:'user'},403],[{error:{code:'42501'}},403],[{error:{code:'XX000'}},503]]) {
    const h=harness(options)
    assert.equal((await h.handler(request('sepay_fetch'))).status,status)
    assert.equal(h.calls.includes('provider'),false)
  }
})
