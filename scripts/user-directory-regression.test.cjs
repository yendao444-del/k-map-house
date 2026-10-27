const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Execute the actual query and mapping functions from both clients with a
// projection-aware API fixture: missing fields reproduce the UI regression.
function harness(file) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const names = new Set(['USER_PROFILE_SELECT', 'resolveUserRole', 'resolveUserStatus',
    'buildAppUser', 'getUsers', 'getNotificationRecipients'])
  const selected = ast.statements.filter(statement => ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(declaration => names.has(declaration.name.getText(ast))))
  assert.equal(selected.length, names.size)
  const rows = [
    { id: 'admin-id', username: 'admin.fixture', email: 'admin@example.invalid', full_name: 'Admin',
      role: 'admin', status: 'active', authenticator_verified: true, email_verified: true,
      last_login_at: '2026-10-11T01:00:00Z', created_at: '2026-10-01T00:00:00Z' },
    { id: 'inactive-id', username: 'disabled.fixture', full_name: 'Disabled', role: 'user', status: 'inactive',
      authenticator_verified: false, email_verified: false, created_at: '2026-10-02T00:00:00Z' }
  ]
  const calls = []
  const context = vm.createContext({ exports: {}, normalizeEmailNotificationPreferences: value => value || {},
    safeQuery: async query => (await query()).data,
    supabase: {
      from(table) {
        assert.equal(table, 'users')
        return { select(columns) {
          assert.notEqual(columns, '*')
          assert.ok(!columns.split(',').includes('password_hash'))
          calls.push({ table, columns })
          return { order: async () => ({ data: rows.map(row => Object.fromEntries(columns.split(',').map(key => [key, row[key]]))) }) }
        } }
      },
      rpc(name, args, options) {
        if (name === 'management_user_directory') {
          assert.equal(args, undefined)
          assert.equal(options.get, true, 'Directory must be sent as an HTTP read')
          calls.push({ rpc: name })
          return { order: async (column, options) => {
            assert.equal(column, 'created_at')
            assert.equal(options.ascending, false)
            return { data: rows }
          } }
        }
        assert.equal(name, 'notification_recipients')
        calls.push({ rpc: name })
        return Promise.resolve({ data: [{ id: 'recipient', full_name: 'Recipient', notification_email: 'recipient@example.invalid', email_notifications_enabled: true }] })
      }
    }
  })
  vm.runInContext(ts.transpileModule(selected.map(statement => statement.getText(ast)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, context)
  return { ...context.exports, calls, rows }
}

for (const file of ['src/renderer/src/lib/db.ts', 'adminpwa/src/renderer/src/lib/db.ts']) {
  test(file + ' account screen preserves identity, admin role, disabled accounts and login time', async () => {
    const h = harness(file)
    const accounts = await h.getUsers()
    assert.equal(accounts.length, 2)
    for (let index = 0; index < accounts.length; index++) {
      for (const field of ['username', 'role', 'status', 'last_login_at', 'created_at', 'authenticator_verified', 'email_verified']) {
        assert.equal(accounts[index][field], h.rows[index][field])
      }
    }
    assert.equal(h.calls.length, 1)
    assert.equal(h.calls[0].rpc, 'management_user_directory')
    assert.equal(accounts[0].password_hash, undefined)
  })
  test(file + ' absent security flags stay unknown instead of displaying a false verification', async () => {
    const h = harness(file)
    delete h.rows[0].authenticator_verified
    delete h.rows[0].email_verified
    const accounts = await h.getUsers()
    assert.equal(accounts[0].authenticator_verified, undefined)
    assert.equal(accounts[0].email_verified, undefined)
  })
  test(file + ' email observer uses limited recipients without loading the account directory', async () => {
    const h = harness(file)
    const recipients = await h.getNotificationRecipients()
    assert.equal(recipients[0].notification_email, 'recipient@example.invalid')
    assert.deepEqual(h.calls, [{ rpc: 'notification_recipients' }])
  })
}
