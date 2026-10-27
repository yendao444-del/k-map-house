const assert = require('node:assert/strict')
const { test } = require('node:test')
const { buildSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const bundle = buildSync({
  entryPoints: ['src/renderer/src/components/investment-trackers/GoldPortfolioPanel.tsx'],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic'
})
const loaded = { exports: {} }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, loaded, loaded.exports)
const { GoldPortfolioPanel } = loaded.exports
const noop = () => {}
const defaults = { tab: 'holdings', onTabChange: noop, rows: [], transactions: [], holdings: [], onAdd: noop, onTrade: noop, onEdit: noop, onDelete: noop }
const render = props => renderToStaticMarkup(React.createElement(GoldPortfolioPanel, { ...defaults, ...props }))

test('empty gold workspace has two counted tabs and no unusable or duplicate actions', () => {
  const html = render()
  assert.equal((html.match(/role="tab"/g) || []).length, 2)
  assert.match(html, /Vàng đang nắm giữ/)
  assert.match(html, /Giao dịch gần đây/)
  assert.match(html, /Chưa có vàng đang nắm giữ/)
  assert.doesNotMatch(html, /Xem chi tiết|>Thêm<|<table/)
})

test('history selection shows a distinct empty state, not a second empty holdings block', () => {
  const html = render({ tab: 'history' })
  assert.match(html, /Chưa có giao dịch/)
  assert.doesNotMatch(html, /Chưa có vàng đang nắm giữ/)
  assert.equal((html.match(/id="investment-category-history"/g) || []).length, 1)
})

test('tabs keep accessible labels, panels and one roving keyboard stop', () => {
  const html = render({ tab: 'history' })
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1)
  assert.equal((html.match(/role="tab"[^>]*tabindex="0"/g) || []).length, 1)
  for (const [, target] of html.matchAll(/aria-controls="([^"]+)"/g)) assert.ok(html.includes(`id="${target}"`))
  for (const [, label] of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(html.includes(`id="${label}"`))
})

test('populated holdings retain detail, purchase and sale actions without duplicate add', () => {
  const row = { symbol: 'MH9999', name: 'Vàng Mỹ Hạnh', category: 'gold', group: 'Vàng', quantity: '2 chỉ', valueVnd: 27100000, pnlPercent: 0, allocationPercent: 100, targetPercent: 100 }
  const html = render({ rows: [row], holdings: [row] })
  assert.match(html, /Xem chi tiết/)
  assert.match(html, />Mua</)
  assert.match(html, />Bán</)
  assert.match(html, /27\.100\.000/)
  assert.doesNotMatch(html, />Thêm</)
})

test('closed position transaction remains actionable even when no holdings exist', () => {
  const tx = { id: 'test-closed', date: '2026-10-20', assetSymbol: 'MH9999', transactionType: 'sell', quantity: 1, amountVnd: 13250000, unitPriceVnd: 13250000, status: 'done', note: '' }
  const html = render({ tab: 'history', transactions: [tx] })
  assert.match(html, /test-closed/)
  assert.match(html, /13\.250\.000/)
  assert.match(html, /Sửa giao dịch test-closed/)
  assert.match(html, /Xóa giao dịch test-closed/)
})

test('holdings show cost, dealer bid and live PnL as separate fields', () => {
  const row = { symbol: 'MH9999', name: 'Vàng Mỹ Hạnh', category: 'gold', quantity: '1 chỉ', valueVnd: 13400000, pnlPercent: .525, allocationPercent: 100, targetPercent: 70 }
  const html = render({ rows: [row], holdings: [row], valuations: { MH9999: {
    costVnd: 13330000, unitCostVnd: 13330000, unitPriceVnd: 13400000, valueVnd: 13400000, pnlVnd: 70000, pnlPercent: .525
  } } })
  assert.match(html, /13\.330\.000 đ\/chỉ/)
  assert.match(html, /data-label="Giá tiệm mua vào"><strong>13\.400\.000 đ/)
  assert.match(html, /\+70\.000 đ/)
  assert.match(html, /\+0\.53%/)
  assert.doesNotMatch(html, /13\.550\.000/)
})

test('unavailable quotes have an honest pending mark instead of a fake +0%', () => {
  const row = { symbol: 'MH9999', name: 'Vàng Mỹ Hạnh', category: 'gold', quantity: '1 chỉ', valueVnd: 13330000, pnlPercent: 0, allocationPercent: 100, targetPercent: 70 }
  const html = render({ rows: [row], holdings: [row] })
  assert.match(html, /Chưa có giá mới/)
  assert.match(html, /Chưa đủ dữ liệu định giá/)
  assert.doesNotMatch(html, /\+0\.00%/)
})

test('entering gold and successful purchases select holdings; explicit history remains available', () => {
  const source = require('node:fs').readFileSync('src/renderer/src/components/InvestmentsTab.tsx', 'utf8')
  assert.match(source, /useState<GoldPortfolioTab>\('holdings'\)/)
  assert.match(source, /if \(screen === 'gold'\) setGoldPortfolioTab\('holdings'\)/)
  const save = source.slice(source.indexOf('{goldTradeMode &&'))
  assert.match(save, /await saveTransaction\(input\)[\s\S]*setGoldPortfolioTab\('holdings'\)/)
  assert.doesNotMatch(save, /setGoldPortfolioTab\('history'\)|scrollIntoView/)
  assert.match(source, /setGoldPortfolioTab\('history'\)/)
})
