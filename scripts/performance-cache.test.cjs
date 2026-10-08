const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const { QueryClient } = require('@tanstack/react-query')
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n')
const db = read('src/renderer/src/lib/db.ts')
const plain = value => JSON.parse(JSON.stringify(value))

function evaluate(source, context = {}) {
  const exports = {}
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(js, { exports, Promise, Error, ...context })
  return exports
}
function load(file, mockedDb) {
  return evaluate(read(file), { require(name) {
    if (name === './db') return mockedDb
    throw Error(`Unexpected runtime import ${name}`)
  } })
}
function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
}
function builder() {
  const source = db.slice(db.indexOf('export const buildWalletBalanceSummary'), db.indexOf('export const updateAppSettings'))
  return evaluate(source, {
    ...evaluate(read('src/renderer/src/lib/wallet-accounting.ts')),
    ...evaluate(read('src/renderer/src/lib/invoice-payment-flow.ts')),
    getInvoicePaymentRecords: invoice => invoice.payment_records || [],
    DEFAULT_EXPENSE_CATEGORIES: [{ value: 'maintenance', name: 'Bảo trì' }]
  }).buildWalletBalanceSummary
}

test('wallet display retains ledger dates, cancellations, transfers, deposits and negative balance semantics', () => {
  const payments = (id, amount, method, date = '2026-10-01') => ({ id, amount, payment_method: method, payment_date: date })
  const invoices = [
    { id: 'paid', payment_status: 'paid', payment_records: [payments('a', 200, 'cash'), payments('b', 300, 'transfer')] },
    { id: 'old', payment_status: 'partial', payment_records: [payments('c', 99, 'cash', '2026-09-01')] },
    { id: 'cancelled', payment_status: 'cancelled', payment_records: [payments('d', 900, 'transfer')] },
    { id: 'merged', payment_status: 'merged', payment_records: [payments('e', 1000, 'transfer')] },
    { id: 'settlement', payment_status: 'paid', is_settlement: true, payment_records: [payments('f', -50, 'transfer')] }
  ]
  const cash = [
    { id: 'one', type: 'income', category: 'wallet_transfer', amount: 1000, payment_method: 'transfer' },
    { id: 'two', type: 'expense', category: 'wallet_transfer', amount: 1000, payment_method: 'cash' },
    { id: 'three', type: 'expense', category: 'investment_transfer', amount: 400, payment_method: 'cash', note: '[Đầu tư] Chuyển vốn' },
    { id: 'four', type: 'expense', category: 'maintenance', amount: 50 },
    { id: 'five', type: 'income', category: 'investment_transfer', amount: 200, payment_method: 'transfer' }
  ].map(row => ({ ...row, transaction_date: '2026-10-01' }))
  const before = JSON.stringify({ invoices, cash })
  const result = builder()(cash, invoices, { opening_balance_cash: 100, opening_balance_bank: 1000, opening_balance_date: '2026-10-01' })
  assert.equal(result.cashBalance, -1100)
  assert.equal(result.bankBalance, 2450)
  assert.equal(result.totalBalance, 1300)
  assert.equal(result.availableBalance, 0)
  assert.equal(result.unassignedCount, 1)
  assert.equal(result.unassignedBalance, -50)
  assert.equal(result.entries.length, 8)
  assert.equal(result.entries.find(entry => entry.id === 'cash-three').title, 'Chuyển vốn')
  assert.equal(result.entries.find(entry => entry.id === 'cash-four').title, 'Bảo trì')
  assert.equal(JSON.stringify({ invoices, cash }), before)
  const negative = builder()(cash, [], {})
  assert.ok(negative.totalBalance < 0)
  assert.equal(negative.availableBalance, 0)
})

test('invoice cache aggregation agrees with current paged database algorithms over 10k records', async () => {
  const statuses = ['paid', 'unpaid', 'partial', 'merged', 'cancelled']
  const invoices = Array.from({ length: 10005 }, (_, i) => ({
    id: String(i), month: i % 12 + 1, year: 2024 + i % 3,
    payment_status: statuses[i % statuses.length], is_settlement: i % 7 === 0
  }))
  invoices.push({ id: 'missing-period' })
  const legacySource = db.slice(db.indexOf('export const getInvoiceMonthCounts'), db.indexOf('export const getRoomInvoices'))
  const { fetchAllPages } = await import('../src/renderer/src/lib/paged-query.ts')
  const legacy = evaluate(legacySource, {
    fetchAllPages,
    supabase: { from: () => {
      const filters = []
      const query = {
        select: () => query,
        order: () => query,
        eq(field, value) { filters.push([field, value]); return query },
        range(start, end) { return Promise.resolve({ data: invoices.filter(row => filters.every(([key, value]) => row[key] === value)).slice(start, end + 1) }) }
      }
      return query
    } },
    safeQuery: async fn => (await fn()).data
  })
  const summary = load('src/renderer/src/lib/invoice-summary-query.ts', {})
  assert.deepEqual(plain(summary.summarizeInvoiceMonths(invoices)), plain(await legacy.getInvoiceMonthCounts()))
  for (let year = 2024; year <= 2026; year++) for (let month = 1; month <= 12; month++) {
    assert.deepEqual(plain(summary.summarizeInvoiceMonth(invoices, month, year)), plain(await legacy.getInvoiceMonthSummary(month, year)))
  }
})

test('invoice counts and summary reuse complete cache; simultaneous refresh shares one request', async () => {
  const queryClient = client()
  let calls = 0
  let resolve
  const getInvoices = () => { calls++; return new Promise(done => { resolve = done }) }
  const api = load('src/renderer/src/lib/invoice-summary-query.ts', { getInvoices })
  const invoices = [{ id: 'a', month: 10, year: 2026, payment_status: 'partial' }]
  queryClient.setQueryData(['invoices'], invoices)
  assert.equal((await api.readInvoiceMonthCounts(queryClient))['2026-10'], 1)
  assert.equal((await api.readInvoiceMonthSummary(queryClient, 10, 2026)).partial, 1)
  assert.equal(calls, 0)
  await queryClient.invalidateQueries({ queryKey: ['invoices'], refetchType: 'none' })
  const pending = [api.readInvoiceMonthCounts(queryClient), api.readInvoiceMonthSummary(queryClient, 10, 2026)]
  assert.equal(calls, 1)
  resolve([...invoices, { id: 'b', month: 10, year: 2026, payment_status: 'cancelled', is_settlement: true }])
  const [counts, summary] = await Promise.all(pending)
  assert.equal(counts['2026-10'], 2)
  assert.equal(summary.total, 2)
  assert.equal(summary.cancelled, 1)
  assert.equal(summary.settlement, 1)
  queryClient.clear()
})

test('monthly seed contains only the first ordered page and refuses stale/invalidated data', async () => {
  const queryClient = client()
  const api = load('src/renderer/src/lib/invoice-summary-query.ts', {})
  const invoices = Array.from({ length: 105 }, (_, i) => ({ id: String(i), month: i < 101 ? 10 : 9, year: 2026 }))
  queryClient.setQueryData(['invoices'], invoices)
  const seed = api.seedInvoiceMonthPage(queryClient, 10, 2026, 50)
  assert.deepEqual(plain(seed.pages[0]), invoices.slice(0, 50))
  assert.deepEqual(plain(seed.pageParams), [0])
  assert.equal(invoices.length, 105)
  await queryClient.invalidateQueries({ queryKey: ['invoices'], refetchType: 'none' })
  assert.equal(api.seedInvoiceMonthPage(queryClient, 10, 2026, 50), undefined)
  queryClient.setQueryData(['invoices'], invoices, { updatedAt: Date.now() - 61_000 })
  assert.equal(api.seedInvoiceMonthPage(queryClient, 10, 2026, 50), undefined)
  queryClient.clear()
})

test('wallet display cache removes three startup reads; invalidation and forced refresh still read', async () => {
  const queryClient = client()
  const calls = { cash: 0, invoices: 0, settings: 0 }
  const reads = {
    getCashTransactions: async () => { calls.cash++; return [] },
    getInvoices: async () => { calls.invoices++; return [] },
    getAppSettings: async () => { calls.settings++; return { opening_balance_cash: 200 } },
    buildWalletBalanceSummary: builder()
  }
  const api = load('src/renderer/src/lib/wallet-summary-query.ts', reads)
  queryClient.setQueryData(['cashTransactions'], [])
  queryClient.setQueryData(['invoices'], [])
  queryClient.setQueryData(['appSettings'], { opening_balance_cash: 100 })
  assert.equal((await api.readCachedWalletBalanceSummary(queryClient)).cashBalance, 100)
  assert.deepEqual(calls, { cash: 0, invoices: 0, settings: 0 })
  await queryClient.invalidateQueries({ queryKey: ['cashTransactions'], refetchType: 'none' })
  await api.readCachedWalletBalanceSummary(queryClient)
  assert.deepEqual(calls, { cash: 1, invoices: 0, settings: 0 })
  assert.equal((await api.readCachedWalletBalanceSummary(queryClient, true)).cashBalance, 200)
  assert.deepEqual(calls, { cash: 2, invoices: 1, settings: 1 })
  queryClient.clear()
})

test('a failed raw query does not produce a successful wallet summary', async () => {
  const queryClient = client()
  let calculated = false
  const api = load('src/renderer/src/lib/wallet-summary-query.ts', {
    getCashTransactions: async () => { throw Error('offline') },
    getInvoices: async () => [], getAppSettings: async () => ({}),
    buildWalletBalanceSummary() { calculated = true; return {} }
  })
  await assert.rejects(api.readCachedWalletBalanceSummary(queryClient), /offline/)
  assert.equal(calculated, false)
  queryClient.clear()
})

test('investment load deduplicates overlapping reads and clears loading on failure without replacing the portfolio', async () => {
  const source = read('src/renderer/src/components/InvestmentsTab.tsx')
  const loader = source.slice(source.indexOf('  const load = useCallback('), source.indexOf('\n  useEffect(() => {\n    loadMounted.current = true'))
  const state = { loading: false, error: '', portfolio: { transactions: [{ id: 'existing' }] } }
  const pendingLoad = { current: null }
  const loadMounted = { current: true }
  let calls = 0
  let complete
  const getLoad = ts.transpileModule(loader + '\nexports.load = load;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(getLoad, {
    exports, Promise, Error,
    useCallback: fn => fn, queryClient: {}, savingTransaction: { current: false }, pendingLoad, loadMounted,
    setLoading: value => { state.loading = value }, setLoadError: value => { state.error = value },
    setStore: value => { state.portfolio = value }, setSource() {}, setWalletSummary() {},
    readInvestmentStore: () => { calls++; return new Promise(resolve => { complete = resolve }) },
    readCachedWalletBalanceSummary: async () => { throw Error('offline') }
  })
  const first = exports.load()
  const second = exports.load()
  assert.equal(first, second)
  assert.equal(calls, 1)
  assert.equal(state.loading, true)
  complete({ data: { transactions: [] } })
  await first
  assert.equal(state.loading, false)
  assert.equal(state.error, 'offline')
  assert.equal(state.portfolio.transactions[0].id, 'existing')
  assert.equal(pendingLoad.current, null)
})

test('live wallet read remains uncached and operating transfer validation uses it', async () => {
  const source = db.slice(db.indexOf('export const getWalletBalanceSummary ='), db.indexOf('/** Pure display calculation.'))
  let calls = 0
  const live = evaluate(source, {
    getCashTransactions: async () => { calls++; return [] },
    getInvoices: async () => { calls++; return [] },
    getAppSettings: async () => { calls++; return { opening_balance_cash: calls } },
    buildWalletBalanceSummary: builder()
  }).getWalletBalanceSummary
  await live()
  await live()
  assert.equal(calls, 6)
  const investmentSource = read('src/renderer/src/components/InvestmentsTab.tsx')
  assert.match(investmentSource, /readOperating: getWalletBalanceSummary/)
  assert.match(investmentSource, /if \(loading \|\| loadError\) throw new Error/)
})
