const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')

function harness(initial = '2026-09-24T09:45') {
  const state = []
  let cursor = 0
  let value = initial
  const code = ts.transpileModule(readFileSync('src/renderer/src/components/DebtDateTimePicker.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const api = {}
  new Function('require', 'exports', 'document', code)((name) => {
    if (name === 'react') return {
      ...React, memo: fn => fn, useId: () => 'test', useRef: () => ({ current: null }), useLayoutEffect: () => {},
      useState(initialValue) {
        const slot = cursor++
        if (!(slot in state)) state[slot] = typeof initialValue === 'function' ? initialValue() : initialValue
        return [state[slot], next => { state[slot] = typeof next === 'function' ? next(state[slot]) : next }]
      }
    }
    if (name === 'react-dom') return { createPortal: node => node }
    return require(name)
  }, api, { body: {} })
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  const render = () => { cursor = 0; return api.DebtDateTimePicker({ value, onChange: next => { value = next } }) }
  const find = label => nodes(render()).find(n => n.props?.['aria-label'] === label || n.props?.children === label)
  return { api, find, nodes: () => nodes(render()), value: () => value }
}

test('calendar starts Monday, includes leap day and crosses years', () => {
  const { api } = harness()
  for (const month of [new Date(2024, 1, 1), new Date(2026, 11, 1), new Date(2027, 0, 1)]) {
    const days = api.calendarDays(month)
    assert.equal(days.length, 42)
    assert.equal(days[0].getDay(), 1)
    for (let i = 1; i < days.length; i++) {
      const next = new Date(days[i - 1])
      next.setDate(next.getDate() + 1)
      assert.equal(days[i].getTime(), next.getTime())
    }
  }
  assert.ok(api.calendarDays(new Date(2024, 1, 1)).some(d => d.getMonth() === 1 && d.getDate() === 29))
})

test('popup is hidden and cannot receive clicks before its position is measured', () => {
  const h = harness()
  for (let i = 0; i < 3; i++) {
    h.find('Chọn ngày giao dịch').props.onClick()
    const popup = h.nodes().find(n => n.props?.role === 'dialog')
    assert.equal(popup.props.style.visibility, 'hidden')
    assert.equal(popup.props.style.pointerEvents, 'none')
    h.find('Chọn ngày giao dịch').props.onClick()
    assert.equal(h.nodes().some(n => n.props?.role === 'dialog'), false)
  }
})

test('hour/minute steppers wrap without changing the selected day', () => {
  const { api } = harness()
  assert.equal(api.stepTime('2026-12-31T23:59', 'minutes', 1), '2026-12-31T23:00')
  assert.equal(api.stepTime('2026-12-31T23:59', 'hours', 1), '2026-12-31T00:59')
  assert.equal(api.stepTime('2026-01-01T00:00', 'minutes', -1), '2026-01-01T00:59')
  assert.equal(api.stepTime('2026-01-01T00:00', 'hours', -1), '2026-01-01T23:00')
})

test('calendar navigation and picking preserve time and close the popup', () => {
  const h = harness()
  h.find('Chọn ngày giao dịch').props.onClick()
  h.find('Tháng sau').props.onClick()
  h.find('03/10/2026').props.onClick()
  assert.equal(h.value(), '2026-10-03T09:45')
  assert.equal(h.find('Chọn ngày giao dịch').props['aria-expanded'], false)
  h.find('Tăng phút').props.onClick()
  assert.equal(h.value(), '2026-10-03T09:46')
})

test('shortcuts select yesterday with preserved time and now with current time', () => {
  const h = harness()
  h.find('Chọn ngày giao dịch').props.onClick()
  h.find('Hôm qua').props.onClick()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(9, 45, 0, 0)
  assert.equal(h.value(), h.api.formatLocalDateTime(yesterday))
  h.find('Chọn ngày giao dịch').props.onClick()
  const before = h.api.formatLocalDateTime(new Date())
  h.find('Bây giờ').props.onClick()
  const after = h.api.formatLocalDateTime(new Date())
  assert.ok([before, after].includes(h.value()))
})
