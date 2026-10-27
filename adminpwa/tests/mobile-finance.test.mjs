import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

async function load(file) {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL(`../src/renderer/src/${file}`, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react/jsx-runtime'], loader: { '.css': 'empty' }, jsx: 'automatic' })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
  return module.exports
}
const { normalizeFinanceSearch, fitInvoicePaperScale } = await load('lib/mobile-finance-presentation.ts')
const { MobileCashFlow } = await load('components/MobileCashFlow.tsx')
const { MobilePnl } = await load('components/MobilePnl.tsx')
const record = { id: 'one', type: 'expense', source: 'manual', category: 'electric', amount: 100000, transaction_date: '2026-10-09', note: 'ĐIỆN TỔNG' }
const props = { rows: [record], income: 0, expense: 100000, loading: false, error: false, typeFilter: 'all', categoryFilter: 'all', categories: [{ value: 'electric', label: 'Hóa đơn điện tổng', type: 'expense' }], targetLabel: () => 'Phòng 999', setTypeFilter() {}, setCategoryFilter() {}, onCreate() {}, onEdit() {}, onDelete() {}, isAdmin: false }
const renderCash = extra => renderToStaticMarkup(React.createElement(MobileCashFlow, { ...props, ...extra }))

test('finance search folds both Đ and đ, uppercase and decomposed accents', () => {
  for (const text of ['ĐIỆN TỔNG', 'điện tổng', 'ĐiỆn Tổng']) assert.equal(normalizeFinanceSearch(text), 'dien tong')
})
test('linked paper preview fits available phone width without growing desktop', () => {
  for (const available of [256, 306, 346, 716, 852]) assert.ok(768 * fitInvoicePaperScale(available) <= available + .001)
  for (const available of [0, NaN, Infinity, -1]) assert.equal(fitInvoicePaperScale(available), 1)
  assert.equal(fitInvoicePaperScale(900), 1)
})
test('staff cannot see manual edit/delete actions', () => {
  const html = renderCash({}); assert.match(html, /Chỉ quản trị viên/); assert.doesNotMatch(html, />Sửa chứng từ<|>Xóa chứng từ</)
})
test('admin can edit manual voucher, never linked wallet/investment or invoice flows', () => {
  assert.match(renderCash({ isAdmin: true }), />Sửa chứng từ</)
  for (const category of ['wallet_transfer', 'investment_transfer']) assert.doesNotMatch(renderCash({ isAdmin: true, rows: [{ ...record, category }] }), />Sửa chứng từ<|>Xóa chứng từ</)
  const html = renderCash({ isAdmin: true, rows: [{ ...record, source: 'invoice' }], onInvoices() {} }); assert.match(html, /Xem hóa đơn/); assert.doesNotMatch(html, />Sửa chứng từ<|>Xóa chứng từ</)
})
test('loading and error hide rows, totals and load more even with stale cached rows', () => {
  for (const extra of [{ loading: true }, { error: true }]) {
    const html = renderCash({ rows: Array.from({length: 50}, (_, i) => ({...record, id: String(i)})), ...extra })
    assert.doesNotMatch(html, /finance-cash-entry|Xem thêm giao dịch|−100\.000 đ/)
    assert.match(html, /role="status"/)
  }
})
test('empty period is explicit and rows are paged in groups of 24', () => {
  assert.match(renderCash({ rows: [] }), /Chưa có giao dịch trong kỳ này/)
  const html = renderCash({ rows: Array.from({length: 50}, (_, i) => ({...record, id: String(i)})) })
  assert.equal((html.match(/class="finance-cash-entry"/g) || []).length, 24)
  assert.match(html, /Xem thêm giao dịch \(26\)/)
})
test('mobile P&L preserves negative profit, zero expense categories and error states', () => {
  const extra = { rows: [{ key: 'zero', label: 'Chi phí chưa phát sinh', amount: 0, section: 'opex', cashType: 'expense' }], revenue: 0, cost: 100000, profit: -100000, loading: false, error: false, onDrill() {}, chart: null }
  const render = value => renderToStaticMarkup(React.createElement(MobilePnl, { ...extra, ...value }))
  assert.match(render({}), /−100\.000 đ/); assert.match(render({}), /Chi phí chưa phát sinh/)
  assert.match(render({ error: true }), /Không tải được báo cáo/); assert.match(render({ loading: true }), /Đang tải báo cáo/)
})
test('finance fixture is dev-gated and period control is mounted in exactly one branch', async () => {
  const main = await readFile(new URL('../src/renderer/src/main.tsx', import.meta.url), 'utf8')
  const report = await readFile(new URL('../src/renderer/src/components/BusinessReport.tsx', import.meta.url), 'utf8')
  assert.match(main, /QaFinance = import\.meta\.env\.DEV \? lazy/); assert.match(main, /qaFinanceRequested = import\.meta\.env\.DEV/)
  assert.match(report, /!\(activeTab === 'cashflow' && compactFinance\) && periodToolbar/)
  assert.match(report, /mobilePeriodControl=\{compactFinance \? periodToolbar : undefined\}/)
})
test('voucher wallet loading, failure and ready balance render distinctly without a financial write', async () => {
  const cashflow = await readFile(new URL('../src/renderer/src/components/CashFlowTab.tsx', import.meta.url), 'utf8')
  const { outputFiles } = await build({
    stdin: { contents: cashflow + '\nexport { CashTransactionModal };', resolveDir: fileURLToPath(new URL('../src/renderer/src/components/', import.meta.url)), loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' },
    external: ['react', 'react/jsx-runtime', '@tanstack/react-query'],
    plugins: [{ name: 'isolated-voucher', setup(builder) {
      builder.onResolve({ filter: /^\.\.\/lib\/db$/ }, () => ({ path: 'db', namespace: 'voucher-fixture' }))
      builder.onResolve({ filter: /^\.\/InvoiceDetailModal$/ }, () => ({ path: 'invoice', namespace: 'voucher-fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'voucher-fixture' }, args => {
        if (args.path === 'invoice') return { contents: 'export const InvoiceDetailModal = () => null;' }
        const names = ['createCashTransaction', 'deleteCashTransaction', 'getCashTransactions', 'getWalletBalanceSummary', 'buildWalletBalanceSummary', 'getAppSettings', 'getInvoices', 'getInvoicePaymentRecords', 'getRooms', 'getTenants', 'updateCashTransaction']
        return { contents: 'export const DEFAULT_EXPENSE_CATEGORIES = [];\n' + names.map(name => `export const ${name} = () => { throw new Error("Unexpected backend call: ${name}"); };`).join('\n') }
      })
    } }]
  })
  let state = { data: undefined, isLoading: true, isError: false }
  const hooks = {
    useQuery: options => options.queryKey[0] === 'walletExpenseBalances' ? state : { data: [], isLoading: false, isError: false },
    useQueryClient: () => ({}),
    useMutation: () => ({ mutate() { throw new Error('Financial writes are forbidden in this test') }, isPending: false })
  }
  const module = { exports: {} }, require = createRequire(import.meta.url)
  new Function('require', 'module', 'exports', outputFiles[0].text)(name => name === '@tanstack/react-query' ? hooks : require(name), module, module.exports)
  const render = () => renderToStaticMarkup(React.createElement(module.exports.CashTransactionModal, { transaction: null, categoryOptions: [{ value: 'electric', label: 'Hóa đơn điện tổng', type: 'expense' }], onClose() {} }))
  const loading = render()
  assert.match(loading, /Tiền mặt · Đang tải số dư…/)
  assert.match(loading, /Tài khoản ngân hàng · Đang tải số dư…/)
  assert.doesNotMatch(loading, /Chưa tải được số dư|Không tải được số dư/)
  state = { data: undefined, isLoading: false, isError: true }
  const failure = render()
  assert.match(failure, /Chưa tải được số dư/)
  assert.match(failure, /Không tải được số dư\. Khi lưu sẽ kiểm tra lại\./)
  assert.doesNotMatch(failure, /Đang tải số dư/)
  state = { data: { cashBalance: 0, bankBalance: 11894676 }, isLoading: false, isError: false }
  const ready = render()
  assert.match(ready, /Tiền mặt · 0 đ/)
  assert.match(ready, /Tài khoản ngân hàng · 11\.894\.676 đ/)
  assert.doesNotMatch(ready, /Chưa tải được số dư|Đang tải số dư/)
  state = { data: { cashBalance: -1, bankBalance: -2 }, isLoading: false, isError: false }
  assert.equal((render().match(/Cần đối soát/g) || []).length, 2)
})
test('voucher saving retains fresh remote balance validation', async () => {
  const db = await readFile(new URL('../src/renderer/src/lib/db.ts', import.meta.url), 'utf8')
  assert.match(db, /const summary = await getWalletBalanceSummary\(\)/)
  assert.match(db, /assertSingleWalletExpense\(amount, next\.payment_method, balances\)/)
})
