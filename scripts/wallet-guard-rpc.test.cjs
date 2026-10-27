const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')

// Compile the actual production guard and its error normalizer without loading
// auth storage or invoking a real wallet transaction.
function harness(file, response = { data: 2, error: null, status: 200 }, rpcImpl) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const names = new Set(['normalizeRemoteErrorMessage', 'requireWalletGuards'])
  const declarations = source.statements.filter(node =>
    ts.isFunctionDeclaration(node) ? names.has(node.name?.text)
      : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(source))))
  assert.equal(declarations.length, 2)
  const code = ts.transpileModule(declarations.map(d => d.getText(source)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const calls = []
  const supabase = { rpc: async (...args) => {
    calls.push(args)
    if (rpcImpl) return rpcImpl(...args)
    if (response instanceof Error) throw response
    return response
  } }
  return { guard: new Function('supabase', code + '\nreturn requireWalletGuards;')(supabase), calls }
}

for (const file of ['src/renderer/src/lib/db.ts', 'adminpwa/src/renderer/src/lib/db.ts']) {
  test(file + ': actual Supabase SDK emits a GET, not a security-sensitive POST', async () => {
    const requests = []
    const client = createClient('https://wallet-guard-fixture.invalid', 'fixture-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (input, options) => {
        const url = new URL(String(input))
        requests.push({ path: url.pathname, method: options.method })
        // Simulate a valid management session with stale step-up: a stable read
        // is allowed, but POST is denied. No actual network/auth requests.
        assert.equal(url.pathname, '/rest/v1/rpc/wallet_guard_version')
        return options.method === 'GET' ? Response.json(2)
          : Response.json({ code: '42501', message: 'Management MFA/session verification required' }, { status: 403 })
      } }
    })
    await harness(file, undefined, (...args) => client.rpc(...args)).guard()
    assert.deepEqual(requests, [{ path: '/rest/v1/rpc/wallet_guard_version', method: 'GET' }])
  })

  test(file + ': stable wallet-version read uses GET; accepts only supported versions', async () => {
    for (const version of [1, 2]) {
      const h = harness(file, { data: version, error: null, status: 200 })
      await h.guard()
      assert.deepEqual(h.calls, [['wallet_guard_version', undefined, { get: true }]])
    }
    for (const version of [null, undefined, 0, 3, '2', {}, []]) {
      await assert.rejects(harness(file, { data: version, error: null, status: 200 }).guard(), /chưa tương thích/)
    }
  })

  test(file + ': distinguishes security step-up, expired sessions and permissions from missing migration', async () => {
    for (const [error, status, pattern] of [
      [{ code: '42501', message: 'Management MFA/session verification required' }, 403, /Phiên bảo mật/],
      [{ code: 'PGRST303', message: 'JWT expired' }, 401, /Phiên đăng nhập/],
      [{ code: 'PGRST301', message: 'JWT verification failed' }, 401, /Phiên đăng nhập/],
      [{ code: 'PGRST302', message: 'Anonymous requests disabled' }, 401, /Phiên đăng nhập/],
      [{ code: '42501', message: 'permission denied for function wallet_guard_version' }, 403, /không có quyền/]
    ]) {
      const h = harness(file, { data: 2, error, status })
      await assert.rejects(h.guard(), cause => {
        assert.match(cause.message, pattern)
        assert.doesNotMatch(cause.message, /migration|Database chưa cập nhật/)
        return true
      })
      assert.equal(h.calls.length, 1, 'never retries a guard or attempts any write')
    }
  })

  test(file + ': only missing-function responses request migration; outages stay blocked', async () => {
    for (const code of ['PGRST202', '42883']) {
      await assert.rejects(harness(file, { data: null, error: { code, message: 'Missing function' }, status: 404 }).guard(), /migration/)
    }
    for (const response of [
      { data: null, error: { code: '', message: 'TypeError: Failed to fetch' }, status: 0 },
      { data: null, error: { code: '', message: 'NetworkError when attempting to fetch resource' }, status: 0 },
      new TypeError('fetch failed')
    ]) await assert.rejects(harness(file, response).guard(), /Không kết nối được máy chủ/)
    for (const [code, message] of [['PGRST002', 'Schema cache unavailable'], ['XX000', 'Database unavailable']]) {
      await assert.rejects(harness(file, { data: 2, error: { code, message }, status: 503 }).guard(), cause => {
        assert.equal(cause.message, message)
        assert.doesNotMatch(cause.message, /migration/)
        return true
      })
    }
  })

  test(file + ': financial entry points still await wallet protection before writing', () => {
    const source = fs.readFileSync(file, 'utf8')
    for (const name of ['createCashTransaction', 'updateCashTransaction', 'deleteCashTransaction', 'recordInvoicePayment', 'reconcileWalletBalances', 'transferBetweenWallets']) {
      const start = source.indexOf('export const ' + name + ' =')
      assert.notEqual(start, -1, name)
      const next = source.indexOf('\nexport ', start + 1)
      const body = source.slice(start, next < 0 ? undefined : next)
      assert.match(body, /await requireWalletGuards\(\)/, name)
      const write = body.search(/supabase(?:\s*\n\s*)?(?:\.from\(|\.rpc\()/)
      assert.ok(write < 0 || body.indexOf('await requireWalletGuards()') < write, name + ' guard precedes database access')
    }
  })
}
