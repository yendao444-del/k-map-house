const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

for (const file of ['src/renderer/src/lib/admin-bridge-error.ts', 'adminpwa/src/renderer/src/lib/admin-bridge-error.ts']) {
  const context = vm.createContext({ exports: {} })
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  vm.runInContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, context)
  const { adminBridgeError } = context.exports

  test(file + ' distinguishes session, MFA, missing service and server failures', async () => {
    for (const [status, pattern] of [[401, /Phiên đăng nhập/], [403, /Google Authenticator/],
      [404, /Không tìm thấy/], [429, /Quá nhiều/], [502, /Máy chủ quản trị/]]) {
      const message = await adminBridgeError({ context: new Response('', { status }) })
      assert.match(message, pattern)
      assert.doesNotMatch(message, /send-email-notification|chưa được triển khai/)
    }
  })

  test(file + ' preserves application errors without consuming the original response', async () => {
    const response = Response.json({ ok: false, error: 'Bạn không có quyền quản trị.' }, { status: 403 })
    assert.equal(await adminBridgeError({ context: response }), 'Bạn không có quyền quản trị.')
    assert.equal(response.bodyUsed, false)
    assert.equal((await response.json()).error, 'Bạn không có quyền quản trị.')
  })

  test(file + ' safely handles gateway JSON, malformed bodies and transport failures', async () => {
    assert.match(await adminBridgeError({ context: Response.json({ message: 'Invalid JWT' }, { status: 401 }) }), /Phiên đăng nhập/)
    assert.match(await adminBridgeError({ context: Response.json({ error: 'Internal database details' }, { status: 500 }) }), /Máy chủ quản trị/)
    assert.match(await adminBridgeError({ context: Response.json({ error: ' ' }, { status: 403 }) }), /Google Authenticator/)
    assert.match(await adminBridgeError(null), /Không kết nối/)
    assert.match(await adminBridgeError(new Error('Failed to fetch')), /Không kết nối/)
  })

  test(file + ' explains a stale MFA step-up without hiding ordinary authorization failures', async () => {
    const message = 'Thao tác này cần xác minh Google Authenticator trong 5 phút gần nhất. Mở Hồ sơ → Bảo mật → Google Authenticator → Quản lý để xác minh lại.'
    const stale = await adminBridgeError({ context: Response.json({ error: message }, { status: 403 }) })
    assert.equal(stale, message)
    assert.match(stale, /Hồ sơ.*Bảo mật/)
    assert.equal(await adminBridgeError({ context: Response.json({ error: 'Bạn không có quyền quản trị.' }, { status: 403 }) }), 'Bạn không có quyền quản trị.')
  })
}
