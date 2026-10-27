const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')

function storage(initial = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: key => items.delete(key)
  }
}

function harness(file, stores = {}) {
  const window = {
    localStorage: stores.localStorage || storage(),
    sessionStorage: stores.sessionStorage || storage()
  }
  const context = vm.createContext({ window, URL, exports: {} })
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { window, ...context.exports }
}

for (const file of ['src/renderer/src/lib/auth-storage.ts', 'adminpwa/src/renderer/src/lib/auth-storage.ts']) {
  test(file + ' persists management auth locally across a browser reload', () => {
    const first = harness(file)
    first.authStorage.setItem(first.authStorageKey, 'test-session')
    assert.equal(first.window.localStorage.getItem(first.authStorageKey), 'test-session')
    assert.equal(first.window.sessionStorage.getItem(first.authStorageKey), null)

    // A reload has fresh sessionStorage but retains the browser-local auth token.
    const reloaded = harness(file, { localStorage: first.window.localStorage })
    assert.equal(reloaded.authStorage.getItem(reloaded.authStorageKey), 'test-session')
    assert.equal(reloaded.window.sessionStorage.getItem(reloaded.authStorageKey), null)
  })

  test(file + ' upgrades an older tab-only token to the persistent six-hour policy', () => {
    const h = harness(file)
    h.window.sessionStorage.setItem(h.authStorageKey, 'legacy-tab-session')
    assert.equal(h.authStorage.getItem(h.authStorageKey), 'legacy-tab-session')
    assert.equal(h.window.localStorage.getItem(h.authStorageKey), 'legacy-tab-session')
    assert.equal(h.window.sessionStorage.getItem(h.authStorageKey), null)
  })

  test(file + ' records the server six-hour deadline without extending it on reload', () => {
    const h = harness(file)
    const issuedAt = Date.UTC(2032, 0, 2, 3, 4, 5)
    const serverDeadline = issuedAt + 6 * 60 * 60 * 1000
    const serverExpiry = new Date(serverDeadline).toISOString()

    h.recordManagementSessionExpiry(serverExpiry)
    assert.equal(h.getManagementSessionExpiry(), serverDeadline)
    assert.equal(h.isManagementSessionExpired(serverDeadline - 1), false)
    assert.equal(h.isManagementSessionExpired(serverDeadline), true)

    const reloaded = harness(file, { localStorage: h.window.localStorage })
    assert.equal(reloaded.getManagementSessionExpiry(), serverDeadline)
    assert.equal(reloaded.isManagementSessionExpired(serverDeadline - 1), false)
    assert.equal(reloaded.isManagementSessionExpired(serverDeadline), true)
  })

  test(file + ' fails closed for an invalid server deadline and clears deadline with logout', () => {
    const h = harness(file)
    h.authStorage.setItem(h.authStorageKey, 'test-session')
    h.recordManagementSessionExpiry('2032-01-02T09:04:05.000Z')
    assert.notEqual(h.getManagementSessionExpiry(), null)

    h.recordManagementSessionExpiry('not-a-server-date')
    assert.equal(h.getManagementSessionExpiry(), null)

    h.recordManagementSessionExpiry('2032-01-02T09:04:05.000Z')
    h.authStorage.removeItem(h.authStorageKey)
    assert.equal(h.window.localStorage.getItem(h.authStorageKey), null)
    assert.equal(h.window.sessionStorage.getItem(h.authStorageKey), null)
    assert.equal(h.getManagementSessionExpiry(), null)
  })
}

test('desktop migrates the previous Supabase key without replacing a newer persistent login', () => {
  const h = harness('src/renderer/src/lib/auth-storage.ts')
  const legacyKey = 'sb-fixture-auth-token'
  h.window.localStorage.setItem(legacyKey, 'old-session')
  h.migrateLegacyAuthStorage('https://fixture.supabase.co')
  assert.equal(h.authStorage.getItem(h.authStorageKey), 'old-session')
  assert.equal(h.window.localStorage.getItem(h.authStorageKey), 'old-session')
  assert.equal(h.window.localStorage.getItem(legacyKey), null)

  h.authStorage.setItem(h.authStorageKey, 'new-session')
  h.window.localStorage.setItem(legacyKey, 'stale-session')
  h.migrateLegacyAuthStorage('https://fixture.supabase.co')
  assert.equal(h.authStorage.getItem(h.authStorageKey), 'new-session')
  assert.equal(h.window.localStorage.getItem(legacyKey), null)
})
