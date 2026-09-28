const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')

// Render the actual component with isolated hooks; never connect to Supabase.
function harness(props) {
  const state = []
  let cursor = 0
  const writes = []
  const hooks = {
    ...React,
    useState(initial) {
      const slot = cursor++
      if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial
      return [state[slot], (value) => {
        state[slot] = typeof value === 'function' ? value(state[slot]) : value
      }]
    },
    useRef: (value) => ({ current: value }),
    useEffect: () => {},
    useMemo: (fn) => fn()
  }
  const source = readFileSync('src/renderer/src/components/DebtReport.tsx', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022
  } }).outputText
  const exports = {}
  new Function('require', 'exports', code)((name) => {
    if (name === 'react') return hooks
    if (name === 'react/jsx-runtime') return require(name)
    if (name === 'recharts') return new Proxy({}, { get: (_, key) => String(key) })
    if (name === '../lib/supabase') return { supabase: {} }
    if (name === '../lib/db') return {
      createDebtEntry: async (entry) => { writes.push(entry); return entry }
    }
    throw new Error(`Unexpected import: ${name}`)
  }, exports)
  const render = () => { cursor = 0; return exports.DebtReport(props) }
  const nodes = (node) => {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(nodes)
    return [node, ...nodes(node.props?.children)]
  }
  const label = (node) => {
    if (node == null || typeof node === 'boolean') return ''
    if (typeof node !== 'object') return String(node)
    if (Array.isArray(node)) return node.map(label).join('')
    return label(node.props?.children)
  }
  const find = (predicate) => nodes(render()).find(predicate)
  const button = (text) => find((node) => node.type === 'button' && label(node) === text)
  return { render, find, button, label, writes }
}

for (const isAdmin of [false, true]) {
  for (const totalDebt of [0, 1000]) {
    test(`borrow via transaction selector: admin=${isAdmin}, principal=${totalDebt}`, () => {
      const h = harness({ canCreate: true, isAdmin, summary: { totalDebt, paid: 0, offset: 0 } })
      // Admin without opening debt sees setup in the header; row action covers setup.
      const entry = h.button('Thêm giao dịch') || h.button('Thiết lập nợ gốc')
      entry.props.onClick({ stopPropagation() {} })
      const paid = h.find((n) => n.type === 'button' && h.label(n).includes('B. An Khang đã trả nợ'))
      paid.props.onClick()
      const borrow = h.find((n) => n.type === 'button' && h.label(n).includes('A. An Khang Home nợ'))
      assert.equal(borrow.props.disabled, false)
      borrow.props.onClick()
      assert.ok(!h.label(h.render()).includes('Giảm tổng nợ'))
      assert.ok(!h.label(h.render()).includes('Hướng điều chỉnh'))
      h.find((n) => n.props?.id === 'debt-amount').props.onChange({ target: { value: '250' } })
      h.find((n) => n.type === 'form').props.onSubmit({ preventDefault() {} })
      assert.ok(h.label(h.render()).includes('Xác nhận vay thêm'))
      h.button('Xác nhận').props.onClick()
      assert.equal(h.writes.length, 1)
      assert.equal(h.writes[0].amount, 250)
      assert.equal(h.writes[0].reason, 'Vay thêm')
    })
  }
}

test('read-only viewer has no create entry points', () => {
  const h = harness({ canCreate: false, isAdmin: false })
  assert.equal(h.button('Vay thêm'), undefined)
  assert.equal(h.button('Thêm giao dịch'), undefined)
})
