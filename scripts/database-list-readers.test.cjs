const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

// Evaluate the actual database exports with only local query builders. Every
// runtime import is explicit; no Supabase client, auth, network or writer loads.
async function fixture(tables, override) {
  const { fetchAllPages } = await import('../src/renderer/src/lib/paged-query.ts')
  const requests = []
  const supabase = { from(table) {
    const filters = []
    const orders = []
    let columns = '*'
    let start = 0
    let end = 999 // Model the PostgREST default row cap.
    const query = {
      select(value) { columns = value; return query },
      order(field, options) { orders.push([field, options?.ascending !== false]); return query },
      eq(field, value) { filters.push(row => row[field] === value); return query },
      gt(field, value) { filters.push(row => row[field] > value); return query },
      gte(field, value) { filters.push(row => row[field] >= value); return query },
      lt(field, value) { filters.push(row => row[field] < value); return query },
      lte(field, value) { filters.push(row => row[field] <= value); return query },
      in(field, values) { filters.push(row => values.includes(row[field])); return query },
      range(left, right) { start = left; end = right; return query },
      then(resolve, reject) {
        const request = { table, columns, orders, start, end }
        requests.push(request)
        return Promise.resolve().then(() => {
          const replacement = override?.(request)
          if (replacement !== undefined) return { data: replacement }
          const rows = (tables[table] || []).filter(row => filters.every(filter => filter(row)))
          rows.sort((left, right) => {
            for (const [field, ascending] of orders) {
              if (left[field] === right[field]) continue
              return (left[field] < right[field] ? -1 : 1) * (ascending ? 1 : -1)
            }
            return 0
          })
          const selected = rows.slice(start, Math.min(end + 1, start + 1000))
          return { data: columns === '*' ? selected : selected.map(row =>
            Object.fromEntries(columns.split(',').map(field => [field, row[field]]))) }
        }).then(resolve, reject)
      }
    }
    return query
  } }
  const exports = {}
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/src/lib/db.ts'), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText
  vm.runInNewContext(compiled, { exports, console, require(name) {
    if (name === './paged-query') return { fetchAllPages }
    if (name === './supabase') return { supabase, safeQuery: async read => (await read()).data }
    if (name === './email-notification-preferences') return { normalizeEmailNotificationPreferences: value => value }
    throw Error(`Forbidden runtime import: ${name}`)
  } })
  return { api: exports, requests }
}

test('actual list readers preserve all rows beyond the PostgREST cap', async () => {
  const source = Array.from({ length: 2505 }, (_, index) => ({
    id: String(index).padStart(5, '0'), room_id: index % 2 ? 'a' : 'b',
    created_at: '2026-10-01', transaction_date: '2026-10-01',
    sort_order: 1, quantity: 1, status: 'active'
  }))
  const { api, requests } = await fixture(Object.fromEntries(
    ['invoices', 'tenants', 'contracts', 'room_assets', 'move_in_receipts', 'cash_transactions']
      .map(table => [table, source])))
  for (const [name, ascending] of [
    ['getInvoices', false], ['getRoomInvoices', false], ['getCashTransactions', false],
    ['getTenants', false], ['getContracts', false], ['getActiveContracts', false],
    ['getAllRoomAssets', true], ['getRoomMoveInReceiptRefs', false]
  ]) {
    const result = await api[name]()
    assert.equal(result.length, source.length, name)
    const expectedIds = source.map(row => row.id)
    if (!ascending) expectedIds.reverse()
    assert.deepEqual(Array.from(result, row => row.id), expectedIds, name)
  }
  const roomRows = await api.getInvoicesByRoom('a')
  assert.deepEqual(Array.from(roomRows, row => row.id), source.filter(row => row.room_id === 'a').map(row => row.id).reverse())
  assert.ok(requests.every(request => request.end - request.start < 1000))
  assert.ok(requests.every(request => request.orders.some(([field]) => field === 'id')))
})

test('counts and summaries discard speculative rows after a short page', async () => {
  const row = { month: 10, year: 2026, payment_status: 'unpaid' }
  const source = Array.from({ length: 1001 }, () => row)
  const { api } = await fixture({ invoices: source }, request =>
    request.start >= 2000 ? [{ ...row, is_settlement: true, payment_status: 'paid' }] : undefined)
  assert.equal((await api.getInvoiceMonthCounts())['2026-10'], 1001)
  const summary = await api.getInvoiceMonthSummary(10, 2026)
  assert.equal(summary.total, 1001)
  assert.equal(summary.unpaid, 1001)
  assert.equal(summary.paid, 0)
  assert.equal(summary.settlement, 0)
})

test('cash date boundaries and limited paging keep their read semantics', async () => {
  const source = Array.from({ length: 3005 }, (_, index) => ({
    id: String(index).padStart(5, '0'), transaction_date: index < 2005 ? '2026-10-01' : '2026-10-02'
  }))
  const { api } = await fixture({ cash_transactions: source })
  const filtered = await api.getCashTransactions({ startDate: '2026-10-01', endDateExclusive: '2026-10-02' })
  assert.equal(filtered.length, 2005)
  assert.ok(filtered.every(row => row.transaction_date === '2026-10-01'))
  const limited = await api.getCashTransactions({ limit: 10, offset: 5, endDate: '2026-10-01' })
  assert.deepEqual(Array.from(limited, row => row.id), source.slice(0, 2005).map(row => row.id).reverse().slice(5, 15))
})
