const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const read = path => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim()
function load(path, window) {
  const code = ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  }}).outputText
  const exports = {}
  new Function('require', 'exports', 'window', code)(name => {
    if (name === '../lib/sepay-read-state') return load('src/renderer/src/lib/sepay-read-state.ts', window)
    if (name === '../lib/sepay-transaction-time') return load('src/renderer/src/lib/sepay-transaction-time.ts', window)
    return require(name)
  }, exports, window)
  return exports
}
const storage = () => {
  const values = new Map()
  return { localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }, values }
}

test('stable IDs distinguish bank transactions and fall back to reference only when necessary', () => {
  const lib = load('src/renderer/src/lib/sepay-read-state.ts', storage())
  assert.equal(lib.sepayReadKey({ id: 'tx1', reference_number: 'ref1' }), 'id:tx1')
  assert.equal(lib.sepayReadKey({ reference_number: 'ref1' }), 'ref:ref1')
  assert.equal(lib.sepayReadKey({}), '')
})

test('read markers persist per user, merge across tabs and never store financial/contact content', () => {
  const window = storage()
  const lib = load('src/renderer/src/lib/sepay-read-state.ts', window)
  assert.deepEqual(lib.loadSepayReadKeys('alice'), [])
  assert.equal(lib.saveSepayReadKey('alice', 'id:1', []).persisted, true)
  lib.saveSepayReadKey('alice', 'id:2', []) // A stale second tab merges current storage.
  assert.deepEqual(lib.loadSepayReadKeys('alice'), ['id:1', 'id:2'])
  assert.deepEqual(lib.loadSepayReadKeys('bob'), [])
  lib.saveSepayReadKey('bob', 'id:3', [])
  assert.deepEqual(lib.loadSepayReadKeys('alice'), ['id:1', 'id:2'])
  assert.equal(window.values.get(lib.sepayReadStorageKey('alice')), '["id:1","id:2"]')
})

test('corrupt/unavailable storage is safe and never claims persistence', () => {
  const lib = load('src/renderer/src/lib/sepay-read-state.ts', { localStorage: {
    getItem() { throw Error('denied') }, setItem() { throw Error('denied') }
  }})
  assert.deepEqual(lib.loadSepayReadKeys('alice'), [])
  assert.deepEqual(lib.saveSepayReadKey('alice', 'id:1', []), { keys: ['id:1'], persisted: false })
  assert.deepEqual(lib.parseSepayReadKeys('not-json'), [])
  assert.deepEqual(lib.parseSepayReadKeys('{"id":"1"}'), [])
  assert.deepEqual(lib.parseSepayReadKeys('["id:1","id:1",5,"bad",null]'), ['id:1'])
  assert.equal(lib.saveSepayReadKey(undefined, 'id:1', []).persisted, false)
})

test('storage stays bounded without saving entire transactions', () => {
  const lib = load('src/renderer/src/lib/sepay-read-state.ts', storage())
  const keys = lib.parseSepayReadKeys(JSON.stringify(Array.from({ length: 5010 }, (_, index) => `id:${index}`)))
  assert.equal(keys.length, 5000)
  assert.equal(keys[0], 'id:10')
})

test('history renders independent unread/seen groups without marking transactions on mount', () => {
  const window = storage()
  const state = load('src/renderer/src/lib/sepay-read-state.ts', window)
  state.saveSepayReadKey('alice', 'id:seen', [])
  const { SePayTransactionHistory } = load('src/renderer/src/components/SePayTransactionHistory.tsx', window)
  const item = { tx: { id: 'new', reference_number: 'BANK-1', amount_in: '1500000', account_number: '••12', bank_brand_name: 'BIDV', transaction_date: '2026-10-12 13:34:40', transaction_content: 'test' }, amount: 1500000, accountLabel: 'BIDV', accountNumber: '••12', status: 'ok', title: 'Đã chuyển khoản', detail: '', roomName: 'Phòng 151', tenantName: 'Nguyễn An', tenantPhone: '0900000001', invoiceTitle: 'Thu tiền tháng 10/2026', periodText: '', transferCode: '' }
  const html = renderToStaticMarkup(React.createElement(SePayTransactionHistory, { diagnostics: [item, { ...item, tx: { ...item.tx, id: 'seen' } }], userId: 'alice', onRecord: () => { throw Error('Must not write') }, processingKeys: [], recordedKeys: [] }))
  assert.match(html, /aria-label="Chưa xem"/)
  assert.match(html, /aria-label="Đã xem"/)
  assert.match(html, /data-sepay-seen="false"/)
  assert.match(html, /data-sepay-seen="true"/)
  assert.equal((html.match(/Đã chuyển khoản/g) || []).length, 2)
  assert.match(html, /13:34:40/)
  assert.deepEqual(state.loadSepayReadKeys('alice'), ['id:seen'])
})

for (const suffix of ['lib/sepay-read-state.ts', 'components/SePayTransactionHistory.tsx']) {
  test(`${suffix} stays identical across Electron and PWA`, () => {
    assert.equal(read(`src/renderer/src/${suffix}`), read(`adminpwa/src/renderer/src/${suffix}`))
  })
}

for (const root of ['src/renderer/src', 'adminpwa/src/renderer/src']) {
  test(`${root}: actual modal passes account identity and shows history even when matches exist`, () => {
    assert.match(read(`${root}/components/InvoicesTab.tsx`), /userId=\{currentUser\?\.id\}/)
    const modal = read(`${root}/components/SePaySyncModal.tsx`)
    assert.match(modal, /matches.length > 0 &&/)
    assert.equal((modal.match(/<SePayTransactionHistory /g) || []).length, 2)
    assert.doesNotMatch(modal, /text-center opacity-70/)
  })
}
