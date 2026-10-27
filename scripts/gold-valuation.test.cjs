const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadTs } = require('./load-email-test-module.cjs')
const { valueGoldHolding } = loadTs('src/renderer/src/lib/gold-valuation.ts')
const holding = { symbol: 'MH9999', category: 'gold', quantity: '1 chỉ', valueVnd: 13330000, pnlPercent: 0 }
const quote = (buy = 13400000, sell = 13700000) => ({ success: true, stale: false,
  products: [{ code: 'MH9999', metal: 'gold', buyPerChi: buy, sellPerChi: sell }] })

test('live gold PnL uses dealer buy price, retaining actual purchase cost', () => {
  const before = structuredClone(holding)
  const mark = valueGoldHolding(holding, quote())
  assert.equal(mark.costVnd, 13330000)
  assert.equal(mark.unitCostVnd, 13330000)
  assert.equal(mark.valueVnd, 13400000)
  assert.equal(mark.pnlVnd, 70000)
  assert.ok(Math.abs(mark.pnlPercent - 70000 / 13330000 * 100) < 1e-8)
  assert.deepEqual(holding, before)
})
test('a higher dealer sell quote does not hide the bid/ask spread loss', () => {
  const mark = valueGoldHolding(holding, quote(13250000, 13550000))
  assert.equal(mark.pnlVnd, -80000)
  assert.ok(mark.pnlPercent < 0)
})
test('remaining partial-sale cost and quantity are valued, not lifetime purchases', () => {
  const mark = valueGoldHolding({ ...holding, quantity: '0,5 chỉ', valueVnd: 6665000 }, quote())
  assert.equal(mark.costVnd, 6665000)
  assert.equal(mark.unitCostVnd, 13330000)
  assert.equal(mark.valueVnd, 6700000)
  assert.equal(mark.pnlVnd, 35000)
})
test('missing, stale, invalid or foreign quotes never manufacture zero PnL', () => {
  for (const data of [null, { ...quote(), stale: true }, { ...quote(), success: false },
    quote(0), quote(NaN), quote(Infinity), { ...quote(), products: [] }]) {
    const mark = valueGoldHolding(holding, data)
    assert.equal(mark.costVnd, 13330000)
    assert.equal(mark.valueVnd, null)
    assert.equal(mark.pnlVnd, null)
    assert.equal(mark.pnlPercent, null)
  }
  assert.equal(valueGoldHolding({ ...holding, symbol: 'VNHAN' }, quote()).valueVnd, null)
})
test('legacy marked portfolios recover cost; repeated refresh does not compound profit', () => {
  const legacy = { ...holding, valueVnd: 14663000, pnlPercent: 10 }
  const mark = valueGoldHolding(legacy, quote())
  assert.ok(Math.abs(mark.costVnd - 13330000) < .01)
  assert.deepEqual(valueGoldHolding(legacy, quote()), mark)
  assert.equal(valueGoldHolding(legacy, quote(13500000)).pnlVnd.toFixed(), '170000')
})
test('bad legacy basis and empty quantity are not displayed as valid profit', () => {
  assert.equal(valueGoldHolding({ ...holding, pnlPercent: -100 }, quote()).pnlPercent, null)
  assert.equal(valueGoldHolding({ ...holding, quantity: '0 chỉ' }, quote()).valueVnd, null)
})
