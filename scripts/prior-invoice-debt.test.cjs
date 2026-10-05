const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')

// Exercise the actual reminder component without writing real invoice payments.
function harness(overrides = {}) {
  const invoice = {
    id: 'september-debt', room_id: '152', tenant_id: 'old-tenant',
    month: 9, year: 2026, total_amount: 4388000, paid_amount: 1000000,
    payment_status: 'partial', debt_confirmed_at: '2026-10-05T00:00:00Z'
  }
  const paid = []
  let retries = 0
  const props = {
    invoices: [invoice], month: 10, year: 2026,
    roomById: new Map([['152', { id: '152', name: 'Phòng 152' }]]),
    tenantById: new Map([['old-tenant', { id: 'old-tenant', full_name: 'Khách cũ' }]]),
    searchQuery: '', loading: false, error: null,
    onPay: (value) => paid.push(value), onView: () => {}, onRetry: () => retries++,
    ...overrides
  }
  const state = []
  let cursor = 0
  const hooks = {
    ...React,
    useEffect: () => {}, useMemo: (fn) => fn(),
    useState(initial) {
      const slot = cursor++
      if (!(slot in state)) state[slot] = initial
      return [state[slot], (next) => { state[slot] = typeof next === 'function' ? next(state[slot]) : next }]
    }
  }
  const code = ts.transpileModule(readFileSync('src/renderer/src/components/PriorInvoiceDebt.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  const exports = {}
  new Function('require', 'exports', code)((name) => name === 'react' ? hooks : require(name), exports)
  const render = () => { cursor = 0; return exports.PriorInvoiceDebt(props) }
  const nodes = (node) => !node || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  const label = (node) => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object'
    ? String(node) : Array.isArray(node) ? node.map(label).join('') : label(node.props?.children)
  return { props, invoice, paid, render, label, nodes, retries: () => retries }
}

test('confirmed partial debt displays remaining amount and collects the exact old invoice', () => {
  const h = harness()
  assert.match(h.label(h.render()), /3\.388\.000 đ/)
  assert.match(h.label(h.render()), /09\/2026/)
  assert.match(h.label(h.render()), /Thu thiếuĐã chốt nợ/)
  const pay = h.nodes(h.render()).find((n) => n.type === 'button' && h.label(n) === 'Thu tiền')
  pay.props.onClick()
  assert.equal(h.paid[0], h.invoice)
  h.props.invoices = []
  assert.match(h.label(h.render()), /Không có hóa đơn còn nợ/)
  assert.equal(h.nodes(h.render()).some((n) => n.type === 'button' && h.label(n) === 'Thu tiền'), false)
})

test('search narrows rows while the reminder keeps the complete old debt total', () => {
  const h = harness({ searchQuery: 'Phòng 141' })
  assert.match(h.label(h.render()), /Tổng nợ cũ: 3\.388\.000 đ/)
  assert.match(h.label(h.render()), /Không có nợ cũ khớp tìm kiếm/)
  h.props.searchQuery = 'Khách cũ'
  assert.match(h.label(h.render()), /Thu tiền/)
})

test('loading and query failure are never presented as zero debt', () => {
  const h = harness({ invoices: [], loading: true })
  assert.match(h.label(h.render()), /Đang tải nợ/)
  assert.doesNotMatch(h.label(h.render()), /Tổng nợ cũ: 0/)
  h.props.loading = false
  h.props.error = new Error('Mất kết nối')
  assert.match(h.label(h.render()), /Không tải được nợ cũ/)
  const retry = h.nodes(h.render()).find((n) => n.type === 'button' && h.label(n) === 'Thử lại')
  retry.props.onClick()
  assert.equal(h.retries(), 1)
})

test('large history keeps full totals and reveals additional rows', () => {
  const h = harness()
  h.props.invoices = Array.from({ length: 61 }, (_, i) => ({ ...h.invoice, id: `debt-${i}` }))
  const payButtons = () => h.nodes(h.render()).filter((n) => n.type === 'button' && h.label(n) === 'Thu tiền')
  assert.equal(payButtons().length, 50)
  assert.match(h.label(h.render()), /61 hóa đơn/)
  h.nodes(h.render()).find((n) => n.type === 'button' && h.label(n) === 'Hiển thị thêm').props.onClick()
  assert.equal(payButtons().length, 61)
})
