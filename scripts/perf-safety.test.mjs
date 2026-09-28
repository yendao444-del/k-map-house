import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import {
  buildInvoiceTransferDescription,
  createInvoiceTransferIndex,
  findInvoiceTransferMatches,
  normalizeTransferText
} from '../src/renderer/src/lib/invoiceTransfer.ts'

const app = readFileSync(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
const invoiceTab = readFileSync(new URL('../src/renderer/src/components/InvoicesTab.tsx', import.meta.url), 'utf8')
const invoice = (id) => ({ id, room_id: 'room', month: 9, year: 2026, total_amount: 100, paid_amount: 0, payment_records: [] })
const code = (item) => buildInvoiceTransferDescription(item, '101')
const legacy = (items, text) => items.filter(item => normalizeTransferText(text).includes(normalizeTransferText(code(item))))

// Compile only pure callbacks/handlers with explicit mocks, never import App,
// Electron or the database module (which could start effects/connections).
function evaluate(source, dependencies) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  return new Function(...Object.keys(dependencies), js)(...Object.values(dependencies))
}

function backgroundMatches(items, transactions) {
  const start = app.indexOf('  const sepayBackgroundMatches = useMemo<')
  assert.ok(start >= 0)
  const end = app.indexOf('\n  useEffect(', start)
  return evaluate(app.slice(start, end) + '\nreturn sepayBackgroundMatches;', {
    useMemo: fn => fn(),
    roomById: new Map([['room', { name: '101' }]]),
    sepayBackgroundTransactions: transactions,
    sepayInvoicesByTransferSuffix: createInvoiceTransferIndex(items, () => '101'),
    findInvoiceTransferMatches,
    normalizeTransferText
  })
}

test('indexed matching preserves legacy ambiguity, order and overlapping codes', () => {
  const items = ['A', 'AB', 'ABC', 'ABCD', '00000000-0000-0000-0000-123456789012', 'other123456789012', '---'].map(invoice)
  const index = createInvoiceTransferIndex(items, () => '101')
  const texts = ['', 'OTHER PAYMENT', ...items.map(code)]
  for (const left of items) for (const right of items) {
    texts.push(code(right) + code(left), `${code(left)} / ${code(right)} / ${code(left)}`)
  }
  for (const text of texts) assert.deepEqual(findInvoiceTransferMatches(index, text), legacy(items, text))
  const ambiguous = `${code(items[0])} ${code(items[4])}`
  assert.equal(backgroundMatches(items, [{ id: 'tx', amount_in: 100, transaction_content: ambiguous }]).length, 0)
})

test('generated mixed legacy IDs agree with the old substring matcher', () => {
  let seed = 42
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)
  const items = Array.from({ length: 300 }, (_, i) => invoice(`${next().toString(36)}-${next().toString(36)}`.slice(0, 1 + i % 18)))
  const index = createInvoiceTransferIndex(items, () => '101')
  for (let i = 0; i < 400; i++) {
    const text = `BANK ${code(items[next() % items.length])} ${i % 3 ? code(items[next() % items.length]) : ''} END`.toLowerCase()
    assert.deepEqual(findInvoiceTransferMatches(index, text), legacy(items, text))
  }
})

test('unmatched content does not traverse invoice candidates', () => {
  const index = createInvoiceTransferIndex(Array.from({ length: 5000 }, (_, i) => invoice(`invoice-${i}`)), () => '101')
  for (const entries of index.values()) for (const candidate of entries) {
    Object.defineProperty(candidate, 'code', { get() { throw new Error('Unexpected full scan') } })
  }
  assert.deepEqual(findInvoiceTransferMatches(index, 'CZZZZZZZZZZZZ unrelated payment'), [])
})

test('tenth exact payment reaches mocked writer; repeats and recorded payments are skipped', async () => {
  const items = Array.from({ length: 10 }, (_, i) => invoice(`00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`))
  const transactions = items.map((item, i) => ({ id: `tx-${i}`, amount_in: i < 9 ? 50 : 100, transaction_content: code(item) }))
  const matches = backgroundMatches(items, transactions)
  assert.equal(matches.length, 10)
  const writes = []
  const start = app.indexOf('    const syncMatchedPayments = async () => {')
  const end = app.indexOf('    void syncMatchedPayments()', start)
  assert.ok(start >= 0 && end > start)
  const run = evaluate(app.slice(start, end) + '\nreturn syncMatchedPayments;', {
    sepayBackgroundMatches: [...matches, matches[9]],
    sepayAutoPaymentKeysRef: { current: new Set() },
    disposed: false,
    recordInvoicePayment: async (id) => { writes.push(id); return items.find(item => item.id === id) },
    queryClient: { setQueryData() {}, refetchQueries: async () => {} }
  })
  await run()
  await run()
  assert.deepEqual(writes, [items[9].id])
  items[9].payment_records = [{ external_id: 'tx-9' }]
  assert.equal(backgroundMatches(items, transactions).filter(match => match.matchType === 'exact').length, 0)
  assert.match(app, /sepayNotificationItems = sepayBackgroundMatches\.slice\(0, 9\)/)
})

test('SePay shares full-history requests and refreshes stale cache', async () => {
  const keyMatch = invoiceTab.match(/data: sepayInvoices = \[\][\s\S]*?queryKey: (\[[^\n]+\])/)
  assert.ok(keyMatch)
  const key = evaluate(`return ${keyMatch[1]};`, {})
  assert.deepEqual(key, ['invoices'])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let calls = 0
  let complete
  const queryFn = () => { calls++; return new Promise(resolve => { complete = resolve }) }
  const first = new QueryObserver(client, { queryKey: ['invoices'], queryFn })
  const second = new QueryObserver(client, { queryKey: key, queryFn, staleTime: 15000 })
  const stopFirst = first.subscribe(() => {})
  const stopSecond = second.subscribe(() => {})
  try {
    assert.equal(calls, 1)
    complete([invoice('A')])
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(second.getCurrentResult().data[0].id, 'A')
    stopSecond()
    client.setQueryData(key, [invoice('A')], { updatedAt: Date.now() - 16000 })
    const stopAgain = second.subscribe(() => {})
    try {
      assert.equal(calls, 2)
      complete([invoice('B')])
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(first.getCurrentResult().data[0].id, 'B')
    } finally { stopAgain() }
  } finally { stopFirst(); stopSecond(); client.clear() }
})

test('export write failure destroys its hidden window', async () => {
  const start = main.indexOf('  const captureInvoiceImage = async')
  const end = main.indexOf('\n  ipcMain.handle(', start)
  assert.ok(start >= 0 && end > start)
  let created = 0
  let destroyed = 0
  const capture = evaluate(main.slice(start, end) + '\nreturn captureInvoiceImage;', {
    join,
    app: { getPath: () => 'test-temp' },
    mkdirSync() {},
    BrowserWindow: class { constructor() { created++ } destroy() { destroyed++ } },
    secureExportHtml: value => value,
    writeFileSync() { throw new Error('Simulated disk full') }
  })
  await assert.rejects(capture('<html></html>', 'test.jpg'), /Simulated disk full/)
  assert.equal(created, 1)
  assert.equal(destroyed, 1)
})
