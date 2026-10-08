const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const { test } = require('node:test')

function evaluate(source, context = {}) {
  const exports = {}
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(js, { exports, ...context })
  return exports
}
const read = file => fs.readFileSync(file, 'utf8')
const accounting = evaluate(read('src/renderer/src/lib/wallet-accounting.ts'))
const flows = evaluate(read('src/renderer/src/lib/invoice-payment-flow.ts'))
const db = read('src/renderer/src/lib/db.ts')
const build = evaluate(db.slice(db.indexOf('export const buildWalletBalanceSummary'), db.indexOf('export const updateAppSettings')), {
  ...accounting, ...flows,
  getInvoicePaymentRecords: invoice => invoice.payment_records || [],
  DEFAULT_EXPENSE_CATEGORIES: []
}).buildWalletBalanceSummary
const tx = (id, amount, method, type = 'expense', category = 'electric') => ({
  id, amount, type, category, payment_method: method, transaction_date: '2026-10-05', created_at: '2026-10-05'
})

test('100K cash + 150K bank cannot fund a 250K expense from either wallet', () => {
  const balances = build([], [], { opening_balance_cash: 100000, opening_balance_bank: 150000 })
  for (const method of ['cash', 'transfer']) {
    assert.throws(() => accounting.assertSingleWalletExpense(250000, method, balances), /không đủ tiền/)
  }
  assert.equal(balances.cashBalance, 100000)
  assert.equal(balances.bankBalance, 150000)
})

test('a recorded cash-to-bank transfer allows 250K expense only from the bank', () => {
  const transfer = [tx('out', 100000, 'cash', 'expense', 'wallet_transfer'), tx('in', 100000, 'transfer', 'income', 'wallet_transfer')]
  const settings = { opening_balance_cash: 100000, opening_balance_bank: 150000 }
  const balances = build(transfer, [], settings)
  assert.equal(balances.totalBalance, 250000)
  assert.equal(balances.cashBalance, 0)
  assert.equal(balances.bankBalance, 250000)
  accounting.assertSingleWalletExpense(250000, 'transfer', balances)
  assert.throws(() => accounting.assertSingleWalletExpense(1, 'cash', balances), /không đủ tiền/)
  const paid = build([...transfer, tx('paid', 250000, 'transfer')], [], settings)
  assert.equal(paid.cashBalance, 0)
  assert.equal(paid.bankBalance, 0)
})

test('missing manual method is unresolved, never automatically debited from cash or bank', () => {
  const balances = build([tx('electric', 2954124)], [], {})
  assert.equal(balances.cashBalance, 0)
  assert.equal(balances.bankBalance, 0)
  assert.equal(balances.unassignedBalance, -2954124)
  assert.equal(balances.totalBalance, -2954124)
  assert.equal(balances.unassignedCount, 1)
  assert.equal(balances.entries[0].paymentMethod, 'unknown')
  assert.equal(balances.reconciliationRequired, true)
  assert.equal(balances.availableBalance, 0)
  assert.throws(() => accounting.assertSingleWalletExpense(1, 'cash', balances), /chưa xác định ví/)
})

test('legacy negative cash is preserved for reconciliation, not clamped or reassigned to BIDV', () => {
  const balances = build([tx('legacy', 4389669, 'cash')], [], { opening_balance_bank: 11203732 })
  assert.equal(balances.cashBalance, -4389669)
  assert.equal(balances.bankBalance, 11203732)
  assert.equal(balances.totalBalance, 6814063)
  assert.equal(balances.reconciliationRequired, true)
  assert.equal(balances.availableBalance, 0)
  assert.throws(() => accounting.assertSingleWalletExpense(1, 'cash', balances), /đối soát/)
})

test('unknown invoice method does not imply bank; SePay origin can establish bank', () => {
  const invoice = { id: 'invoice', payment_status: 'paid', payment_records: [{ id: 'record', amount: 100000, payment_date: '2026-10-05' }] }
  assert.equal(build([], [invoice], {}).unassignedCount, 1)
  invoice.payment_records[0].source = 'sepay'
  const balances = build([], [invoice], {})
  assert.equal(balances.unassignedCount, 0)
  assert.equal(balances.bankBalance, 100000)
  assert.equal(balances.cashBalance, 0)
})

test('BIDV deposit refund does not reduce cash; opening cutoff and cancelled invoices remain respected', () => {
  const invoice = { id: 'refund', payment_status: 'paid', billing_reason: 'contract_end', deposit_amount: -2200000, payment_records: [{ id: 'record', amount: -1587000, payment_method: 'transfer', payment_date: '2026-10-05' }] }
  const balances = build([{ ...tx('old', 999, undefined), transaction_date: '2026-09-01' }], [invoice, { ...invoice, id: 'cancelled', payment_status: 'cancelled' }], { opening_balance_bank: 2000000, opening_balance_date: '2026-10-01' })
  assert.equal(balances.bankBalance, 413000)
  assert.equal(balances.cashBalance, 0)
  assert.equal(balances.unassignedCount, 0)
  assert.equal(balances.reconciliationRequired, false)
})

test('negative payments (including deposit refunds) pass the same one-wallet check before the RPC', () => {
  const source = db.slice(db.indexOf('export const recordInvoicePayment ='), db.indexOf('const normalizedPaymentDate', db.indexOf('export const recordInvoicePayment =')))
  assert.match(source, /if \(amount < 0\)/)
  assert.match(source, /assertSingleWalletExpense\(Math\.abs\(amount\), data\.payment_method, await getWalletBalanceSummary\(\)\)/)
  assert.throws(() => accounting.assertSingleWalletExpense(1587000, 'cash', { cashBalance: 0, bankBalance: 2000000 }), /không đủ tiền/)
})

test('non-finite amounts and missing wallet are rejected', () => {
  const balances = { cashBalance: 100000, bankBalance: 150000 }
  for (const amount of [0, -1, NaN, Infinity]) assert.throws(() => accounting.assertSingleWalletExpense(amount, 'cash', balances))
  assert.throws(() => accounting.assertSingleWalletExpense(1, undefined, balances), /chọn một ví/)
})

test('reconciliation can reclassify legacy expenses one at a time without creating cash', async () => {
  const guardSource = db.slice(db.indexOf('async function validateCashExpenseBalance('), db.indexOf('export const getMoveInReceipts =')).replace(/\r\n/g, '\n')
  const guard = evaluate(guardSource + '\nexports.validate = validateCashExpenseBalance', {
    ...accounting,
    getWalletBalanceSummary: async () => ({ cashBalance: 0, bankBalance: 5000000, unassignedCount: 2 }),
    getAppSettings: async () => ({})
  }).validate
  const legacy = tx('legacy', 2954124)
  await guard({ ...legacy, payment_method: 'transfer' }, legacy)
  await assert.rejects(() => guard({ ...legacy, payment_method: 'transfer' }), /chưa xác định ví/)
  await assert.rejects(() => guard({ ...legacy, amount: 6000000, payment_method: 'transfer' }, legacy))
})

function renderWallet(cash, invoices = [], settings = {}) {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const component = evaluate(read('src/renderer/src/components/WalletTab.tsx'), {
    crypto: require('node:crypto').webcrypto,
    require(name) {
      if (name === '../lib/db') return { DEFAULT_EXPENSE_CATEGORIES: [], getInvoicePaymentRecords: invoice => invoice.payment_records || [] }
      if (name === '../lib/invoice-payment-flow') return flows
      if (name === '../lib/wallet-accounting') return accounting
      if (name === '@tanstack/react-query') return {
        useQuery: ({ queryKey }) => ({ data: ({ cashTransactions: cash, invoices, rooms: [], appSettings: settings })[queryKey[0]], isLoading: false }),
        useQueryClient: () => ({}), useMutation: () => ({})
      }
      return require(name)
    }
  }).WalletTab
  return renderToStaticMarkup(React.createElement(component, { onRecordTransaction() {}, onReconcile() {}, onSyncSepay() {} }))
}

test('Wallet UI replaces legacy negative balance with reconciliation, not a fabricated zero', () => {
  const html = renderWallet([tx('legacy', 4389669, 'cash')], [], { opening_balance_bank: 11203732 })
  assert.match(html, /Cần đối soát/)
  assert.match(html, /Chưa xác nhận số dư/)
  assert.match(html, /11\.203\.732/)
  assert.doesNotMatch(html, /-4\.389\.669/)
  assert.doesNotMatch(html, /6\.814\.063/)
})

test('one checkpoint corrects allocation without changing existing transactions or total', () => {
  const cash = [tx('legacy', 4389669, 'cash')]
  const original = JSON.stringify(cash)
  const checkpoint = {
    id: 'initial-wallet-reconciliation', bank_balance: 6814063, cash_balance: 0,
    bank_balance_before: 11203732, cash_balance_before: -4389669, total_before: 6814063,
    entry_ids: ['cash-legacy'], confirmed_at: '2026-10-05T10:00:00Z',
    confirmed_by: 'admin', reason: 'Đối soát thực tế'
  }
  const settings = { opening_balance_bank: 11203732, wallet_checkpoint: checkpoint }
  const result = build(cash, [], settings)
  assert.equal(result.bankBalance, 6814063)
  assert.equal(result.cashBalance, 0)
  assert.equal(result.totalBalance, 6814063)
  assert.equal(result.reconciliationRequired, false)
  assert.equal(JSON.stringify(cash), original)
  const after = build([...cash, tx('new', 100000, 'transfer')], [], settings)
  assert.equal(after.bankBalance, 6714063)
  assert.equal(build(cash, [], settings).bankBalance, 6814063)
  const html = renderWallet(cash, [], settings)
  assert.match(html, /6\.814\.063/)
  assert.match(html, /Điều chỉnh phân bổ số dư/)
  assert.match(html, /Tổng không đổi/)
  assert.doesNotMatch(html, /11\.203\.732/)
})

test('Wallet UI labels unknown transaction instead of falsely displaying BIDV', () => {
  const html = renderWallet([tx('legacy', 2954124)], [], { bank_id: 'BIDV', account_no: '96247Q3PE9' })
  assert.match(html, /1 giao dịch chưa xác định ví/)
  assert.match(html, /Chưa xác định ví/)
  assert.match(html, /Cần đối soát/)
})

test('CashFlow main balance is the period net, while wallet balance stays separate', () => {
  const source = read('src/renderer/src/components/CashFlowTab.tsx')
  const header = source.slice(source.indexOf('Dòng tiền ròng trong kỳ'), source.indexOf('Tổng thu'))
  assert.match(header, /totalIncome - totalExpense/)
  assert.doesNotMatch(header, /walletSummary\.totalBalance/)
})

test('CashFlow renders 7,834,876 from actual period transactions even with a 6,814,063 wallet checkpoint', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const cash = [
    tx('income', 12376000, 'transfer', 'income', 'other_income'),
    tx('electric', 2954124, 'transfer'),
    tx('refund', 1587000, 'transfer', 'expense', 'other_expense')
  ]
  const settings = { wallet_checkpoint: {
    bank_balance: 6814063, cash_balance: 0,
    entry_ids: cash.map(row => `cash-${row.id}`), confirmed_at: '2026-10-05T10:00:00Z'
  } }
  const component = evaluate(read('src/renderer/src/components/CashFlowTab.tsx'), {
    require(name) {
      if (name === 'react') return { ...React, default: React }
      if (name === '../lib/db') return {
        DEFAULT_EXPENSE_CATEGORIES: [], buildWalletBalanceSummary: build,
        getInvoicePaymentRecords: invoice => invoice.payment_records || []
      }
      if (name === '../lib/invoice-payment-flow') return flows
      if (name === '../lib/wallet-accounting') return accounting
      if (name === '@tanstack/react-query') return {
        useQuery: ({ queryKey }) => ({ data: ({ cashTransactions: cash, invoices: [], rooms: [], appSettings: settings })[queryKey[0]], isLoading: false, isError: false }),
        useQueryClient: () => ({}), useMutation: () => ({})
      }
      return require(name)
    }
  }).CashFlowTab
  const html = renderToStaticMarkup(React.createElement(component, {
    embedded: true, currentUser: { role: 'admin' },
    period: { start: new Date(2026, 9, 1), end: new Date(2026, 9, 5), label: 'Tháng này' }
  }))
  const header = html.slice(html.indexOf('Dòng tiền ròng trong kỳ'), html.indexOf('Tổng thu'))
  assert.match(header, /7\.834\.876/)
  assert.doesNotMatch(header, /6\.814\.063/)
  assert.match(html, /12\.376\.000/)
  assert.match(html, /4\.541\.124/)
})

test('saving transaction changes rechecks the authenticated admin role', async () => {
  const guardSource = db.slice(db.indexOf('async function requireAdminCashTransactionChange'), db.indexOf('export const updateCashTransaction'))
  async function check(user, profile, profileError = null, authError = null) {
    const query = {
      select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: profile, error: profileError })
    }
    const guard = evaluate(guardSource + '\nexports.guard = requireAdminCashTransactionChange', {
      supabase: { auth: { getUser: async () => ({ data: { user }, error: authError }) }, from: () => query }
    }).guard
    return guard()
  }
  await check({ id: 'admin' }, { role: 'admin', status: 'active' })
  await assert.rejects(() => check(null, null), /đăng nhập/)
  await assert.rejects(() => check({ id: 'user' }, { role: 'user', status: 'active' }), /Chỉ admin/)
  await assert.rejects(() => check({ id: 'admin' }, { role: 'admin', status: 'inactive' }), /Chỉ admin/)
  await assert.rejects(() => check({ id: 'admin' }, { role: 'admin', status: 'active' }, { message: 'Offline' }), /Chỉ admin/)
  for (const name of ['updateCashTransaction', 'deleteCashTransaction']) {
    const source = db.slice(db.indexOf(`export const ${name}`))
    assert.ok(source.indexOf('await requireAdminCashTransactionChange()') < source.indexOf('await requireWalletGuards()'))
  }
})

test('wallet basis displays transaction-derived 7,834,876 and supersedes the old checkpoint without rewriting history', () => {
  const cash = [
    { ...tx('old', 1020813, 'transfer'), transaction_date: '2026-09-30' },
    tx('income', 12376000, 'transfer', 'income', 'other_income'),
    tx('tx-1791183015353-6iy1odkx', 2954124, 'cash'),
    tx('refund', 1587000, 'transfer', 'expense', 'other_expense')
  ]
  const original = JSON.stringify(cash)
  const settings = {
    wallet_checkpoint: { bank_balance: 6814063, cash_balance: 0, entry_ids: cash.map(row => `cash-${row.id}`) },
    wallet_accounting_basis: {
      id: 'operating-cashflow-2026-10', starts_on: '2026-10-01',
      method_overrides: { 'cash-tx-1791183015353-6iy1odkx': 'transfer' },
      reason: 'Tính theo giao dịch từ 01/10', confirmed_at: '2026-10-05T12:00:00Z'
    }
  }
  const result = build(cash, [], settings)
  assert.equal(result.totalBalance, 7834876)
  assert.equal(result.bankBalance, 7834876)
  assert.equal(result.cashBalance, 0)
  assert.equal(result.reconciliationRequired, false)
  assert.equal(JSON.stringify(cash), original)
  const html = renderWallet(cash, [], settings)
  assert.match(html, /7\.834\.876/)
  assert.doesNotMatch(html, /6\.814\.063/)
  assert.match(html, /Thu − chi từ 01\/10\/2026/)
  assert.doesNotMatch(html, /Điều chỉnh phân bổ số dư/)
  assert.equal(build([...cash, tx('new', 100000, 'transfer')], [], settings).totalBalance, 7734876)
})
