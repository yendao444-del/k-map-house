import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getInvoicePaymentFlow } from '../src/renderer/src/lib/invoice-payment-flow.ts'

const settlement = { billing_reason: 'contract_end', is_settlement: true, deposit_amount: -2200000 }

test('settlement refund uses actual cash payment, not gross deposit or offsets', () => {
  const record = { amount: -1587000 }
  const flow = getInvoicePaymentFlow(settlement, record)
  assert.deepEqual(flow, {
    type: 'expense',
    amount: 1587000,
    category: 'deposit_settlement_refund',
    label: 'Hoàn cọc sau tất toán',
    isDepositRefund: true
  })
  assert.equal(flow.type === 'expense' ? -flow.amount : flow.amount, record.amount)
})

test('partial deposit refunds each count only money actually returned', () => {
  const flows = [-1000000, -587000].map((amount) => getInvoicePaymentFlow(settlement, { amount }))
  assert.equal(
    flows.reduce((sum, flow) => sum + flow.amount, 0),
    1587000
  )
  assert.ok(flows.every((flow) => flow.type === 'expense' && flow.isDepositRefund))
})

test('regular payment, direct deposit refund and other refunds remain distinct', () => {
  assert.equal(getInvoicePaymentFlow({}, { amount: 2200000 }).type, 'income')
  assert.equal(
    getInvoicePaymentFlow({ billing_reason: 'deposit_refund' }, { amount: -500000 }).category,
    'deposit_refund'
  )
  const refund = getInvoicePaymentFlow({}, { amount: -120000 })
  assert.equal(refund.category, 'invoice_refund')
  assert.equal(refund.isDepositRefund, false)
  // A positive collection on a settlement invoice is still incoming money.
  assert.equal(getInvoicePaymentFlow(settlement, { amount: 200000 }).type, 'income')
})

test('reclassification increases both gross totals and preserves net cash', () => {
  const records = [3216000, -1587000, 2200000]
  const flows = records.map((amount) => getInvoicePaymentFlow(settlement, { amount }))
  const income = flows
    .filter((flow) => flow.type === 'income')
    .reduce((sum, flow) => sum + flow.amount, 0)
  const expense = flows
    .filter((flow) => flow.type === 'expense')
    .reduce((sum, flow) => sum + flow.amount, 0)
  assert.equal(income, 5416000)
  assert.equal(expense, 1587000)
  assert.equal(
    income - expense,
    records.reduce((sum, amount) => sum + amount, 0)
  )
})
