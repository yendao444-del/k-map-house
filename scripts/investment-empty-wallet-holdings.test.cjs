const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

// Execute the actual presentation selector, without auth, wallet writes or React.
function selectHoldings(base, holdings, availableBalance) {
  const file = `${base}/components/InvestmentsTab.tsx`
  const source = fs.readFileSync(file, 'utf8')
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let callback
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'holdings' &&
      ts.isCallExpression(node.initializer) && node.initializer.expression.getText(tree) === 'useMemo') {
      callback = node.initializer.arguments[0]
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.ok(callback, 'production holdings selector exists')
  const compiled = ts.transpileModule(`const select = ${callback.getText(tree)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText
  const store = { holdings, categoryTargets: {} }
  const before = structuredClone(store)
  const result = new Function('store', 'walletSummary', 'goldValuations', 'compactMoney',
    `${compiled}\nreturn select();`)(store, { availableBalance }, {}, String)
  assert.deepEqual(store, before, 'display selector must not mutate stored data')
  return result
}

const gold = { symbol: 'MH9999', name: 'Vàng Mỹ Hạnh', category: 'gold', quantity: '1 chỉ',
  valueVnd: 13330000, pnlPercent: 0, allocationPercent: 100, targetPercent: 70 }

for (const base of ['src/renderer/src', 'adminpwa/src/renderer/src']) {
  test(`${base}: empty wallet is not a holding or part of the asset count`, () => {
    const rows = selectHoldings(base, [gold], 0)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows.map(row => row.symbol), ['MH9999'])
    assert.equal(rows.reduce((sum, row) => sum + row.valueVnd, 0), 13330000)
  })
  test(`${base}: positive available cash is still shown with its exact balance`, () => {
    const rows = selectHoldings(base, [gold], 400000)
    assert.equal(rows.length, 2)
    assert.equal(rows.find(row => row.symbol === 'CASH').valueVnd, 400000)
    assert.equal(rows.reduce((sum, row) => sum + row.valueVnd, 0), 13730000)
  })
  test(`${base}: an entirely empty portfolio has no synthetic wallet holding`, () => {
    assert.deepEqual(selectHoldings(base, [], 0), [])
    assert.equal(selectHoldings(base, [], 400000).length, 1)
  })
  test(`${base}: stale stored CASH does not create a duplicate or resurrect zero cash`, () => {
    const cash = { ...gold, symbol: 'CASH', category: 'cash', valueVnd: 5000000 }
    assert.deepEqual(selectHoldings(base, [gold, cash], 0).map(row => row.symbol), ['MH9999'])
    const rows = selectHoldings(base, [gold, cash], 400000)
    assert.equal(rows.filter(row => row.symbol === 'CASH').length, 1)
    assert.equal(rows.find(row => row.symbol === 'CASH').valueVnd, 400000)
  })
}
