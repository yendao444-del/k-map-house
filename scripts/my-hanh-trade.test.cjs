const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { loadTs } = require('./load-email-test-module.cjs')
const { suggestedMyHanhPricePerChi } = loadTs('src/renderer/src/lib/goldApi.ts')

const quote = {
  success: true, stale: false, unit: 'VND/chi',
  products: [
    { code: 'MH9999', name: 'Vàng MH 9999', metal: 'gold', buyPerChi: 13250000, sellPerChi: 13550000 },
    { code: 'MH999', name: 'Vàng khác', metal: 'gold', buyPerChi: 10000000, sellPerChi: 11000000 }
  ]
}

test('Mỹ Hạnh trade uses per-chỉ dealer sell for buy, dealer buy for sell', () => {
  assert.equal(suggestedMyHanhPricePerChi(quote, 'buy'), 13550000)
  assert.equal(suggestedMyHanhPricePerChi(quote, 'sell'), 13250000)
})

test('never substitutes another product or stale/invalid quote for MH9999', () => {
  for (const response of [null, { ...quote, success: false }, { ...quote, stale: true },
    { ...quote, products: quote.products.slice(1) },
    { ...quote, products: [{ ...quote.products[0], metal: 'silver' }] }]) {
    assert.equal(suggestedMyHanhPricePerChi(response, 'buy'), 0)
    assert.equal(suggestedMyHanhPricePerChi(response, 'sell'), 0)
  }
  for (const price of [0, -1, NaN, Infinity]) {
    assert.equal(suggestedMyHanhPricePerChi({ ...quote, products: [{ ...quote.products[0], sellPerChi: price }] }, 'buy'), 0)
  }
})

const modalFile = path.resolve('src/renderer/src/components/investment-trackers/GoldTradeModal.tsx')
const modalSource = fs.readFileSync(modalFile, 'utf8')
const compiled = ts.transpileModule(modalSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText
function loadModal(react = React) {
  const exports = {}
  new Function('require', 'exports', compiled)(name => name === 'react' ? react : name.endsWith('.css') ? {} : name.startsWith('.')
    ? loadTs(path.resolve(path.dirname(modalFile), name + '.ts'))
    : createRequire(modalFile)(name), exports)
  return exports.GoldTradeModal
}
const modalExports = { GoldTradeModal: loadModal() }
const holding = (symbol, quantity) => ({ category: 'gold', symbol, name: symbol, quantity })
const render = (mode, holdings) => renderToStaticMarkup(React.createElement(modalExports.GoldTradeModal, {
  mode, holdings, walletSummary: { bankBalance: 100000000, cashBalance: 0, totalBalance: 100000000 },
  operatingWalletSummary: { bankBalance: 0, cashBalance: 0, totalBalance: 0 },
  onClose() {}, onSave() { throw new Error('Do not save in QA') }
}))

test('both buy and sell forms have one fixed Mỹ Hạnh product, no brand chooser', () => {
  for (const mode of ['buy', 'sell']) {
    const html = render(mode, [holding('MH9999', '2 chỉ'), holding('VNHAN', '9 chỉ')])
    assert.match(html, /Vàng MH 9999 · Mỹ Hạnh/)
    assert.doesNotMatch(html, /SJC|PNJ|Bảo Tín|Chọn loại vàng/)
    assert.match(html, /aria-label="Số lượng nhanh"/)
    assert.doesNotMatch(html, /Thanh toán từ Ví đầu tư|Tổng tiền khả dụng|Ví đầu tư thiếu/)
    assert.match(html, /id="gold-trade-quantity"[^>]*max="(?:2|100)"/)
  }
})

test('approved premium sheet has concise action labels and Enter support', () => {
  assert.match(render('buy', []), />Mua vàng<\/button>/)
  assert.match(render('sell', [holding('MH9999', '2 chỉ')]), />Bán vàng<\/button>/)
  assert.match(modalSource, /event\.currentTarget\.requestSubmit\(\)/)
  assert.match(modalSource, /event\.repeat \|\| savingRef\.current/)
  assert.match(modalSource, /event\.nativeEvent\.isComposing/)
  assert.doesNotMatch(modalSource, /fundingError/)
  const submit = modalSource.slice(modalSource.indexOf('const submit = async'))
  assert.ok(submit.indexOf('planInvestmentTopUp(') < submit.indexOf('await onSave('))
  assert.ok(submit.indexOf('validateFunding(') < submit.indexOf('await onSave('))
})

// Exercise the actual component handlers without a database or browser. Hooks
// are seeded with a completed quote; the UI interactions are also tested in the browser fixture.
function controller({ balance = 100000000, operating = 0, onSave = async () => {} } = {}) {
  const values = ['1', null, quote, false, false, '']
  let index = 0
  const Modal = loadModal({
    ...React, useEffect() {}, useMemo: fn => fn(), useRef: current => ({ current }),
    useState(initial) {
      const slot = index++
      if (!(slot in values)) values[slot] = initial
      return [values[slot], value => { values[slot] = value }]
    }
  })
  const element = Modal({ mode: 'buy', holdings: [],
    walletSummary: { bankBalance: balance, cashBalance: 0, totalBalance: balance },
    operatingWalletSummary: { bankBalance: operating, cashBalance: 0, totalBalance: operating },
    onClose() {}, onSave })
  const form = element.props.children
  return { values, form, submit: () => form.props.onSubmit({ preventDefault() {} }) }
}

test('zero funds is quiet until submit, then blocks save and reports the shortage', () => {
  let calls = 0
  const state = controller({ balance: 0, onSave: async () => { calls++ } })
  assert.equal(state.values[5], '')
  state.submit()
  assert.equal(calls, 0)
  assert.match(state.values[5], /Ví đầu tư thiếu 13\.550\.000 đ/)
})

test('existing approved top-up flow can proceed to save; no transfer is performed by the modal', () => {
  let calls = 0
  const state = controller({ balance: 0, operating: 20000000, onSave: async () => { calls++ } })
  state.submit()
  assert.equal(calls, 1)
  assert.equal(state.values[5], '')
})

test('simultaneous click/Enter submissions save once while a save is pending', async () => {
  let finish
  const pending = new Promise(resolve => { finish = resolve })
  let calls = 0
  const state = controller({ onSave: async input => { calls++; assert.equal(input.symbol, 'MH9999'); assert.equal(input.amount, 13550000); await pending } })
  state.submit()
  state.submit()
  assert.equal(calls, 1)
  let prevented = 0
  state.form.props.onKeyDown({ key: 'Enter', repeat: true, nativeEvent: { isComposing: false }, preventDefault() { prevented++ } })
  assert.equal(prevented, 1)
  finish()
  await pending
})

test('legacy gold stock is not counted as Mỹ Hạnh stock for sales', () => {
  const html = render('sell', [holding('VNHAN', '9 chỉ')])
  assert.match(html, /Chưa có vàng Mỹ Hạnh đủ 1 chỉ/)
  assert.match(html, /type="submit" disabled=""/)
})

test('only MH9999 holding actions open the fixed-product modal; legacy keeps its identity', () => {
  const source = fs.readFileSync('src/renderer/src/components/InvestmentsTab.tsx', 'utf8')
  assert.match(source, /if \(holding\.symbol\.toUpperCase\(\) === 'MH9999'\) \{\s*setGoldTradeMode\(initialType\)\s*\} else setModal\(\{ holding, initialType, forceTransaction: true \}\)/)
  assert.doesNotMatch(source, /goldTradeSymbol/)
  assert.match(modalSource, /fetchMyHanhPrices\(\)/)
  assert.doesNotMatch(modalSource, /fetchCurrentGoldPrices|initialSymbol|selectedSymbol/)
})
