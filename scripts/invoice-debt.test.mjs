import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  findDebtToConfirm,
  getPriorOutstandingInvoices,
  invoicePeriodNumber,
  isBillingPeriodInvoice,
  isOutstandingInvoice
} from '../src/renderer/src/lib/invoiceDebt.ts'

const base = {
  room_id: 'room',
  tenant_id: 'tenant',
  month: 9,
  year: 2026,
  payment_status: 'unpaid',
  total_amount: 4_388_000,
  paid_amount: 0,
  billing_reason: 'monthly',
  is_settlement: false,
  created_at: '2026-09-30T10:00:00Z'
}

test('debt closing selects the oldest unconfirmed previous billing period', () => {
  const selected = findDebtToConfirm(
    [
      { ...base, id: 'oct', month: 10, created_at: '2026-10-31T10:00:00Z' },
      { ...base, id: 'sep', month: 9 },
      { ...base, id: 'aug', month: 8, debt_confirmed_at: '2026-09-01T10:00:00Z' }
    ],
    'tenant',
    '2026-01-01T00:00:00Z',
    10,
    2026
  )
  assert.equal(selected?.id, 'sep')
})

test('confirmed debt is still outstanding but is no longer a closing candidate', () => {
  const invoice = { ...base, debt_confirmed_at: '2026-10-01T08:00:00Z' }
  assert.equal(isOutstandingInvoice(invoice), true)
  assert.equal(isBillingPeriodInvoice(invoice), true)
  assert.equal(findDebtToConfirm([invoice], 'tenant', undefined, 10, 2026), null)
})

test('period ordering crosses years correctly', () => {
  assert.ok(invoicePeriodNumber({ year: 2027, month: 1 }) > invoicePeriodNumber({ year: 2026, month: 12 }))
})

test('previous-month reminders retain confirmed and partially paid debt, excluding current and future periods', () => {
  const invoices = [
    { ...base, id: 'current', month: 10 },
    { ...base, id: 'future', month: 11 },
    { ...base, id: 'confirmed', month: 9, debt_confirmed_at: '2026-10-01T08:00:00Z' },
    { ...base, id: 'partial', month: 8, payment_status: 'partial', paid_amount: 1_000_000 },
    { ...base, id: 'paid', month: 7, payment_status: 'paid', paid_amount: base.total_amount },
    { ...base, id: 'cancelled', month: 6, payment_status: 'cancelled' },
    { ...base, id: 'merged', month: 5, payment_status: 'merged' },
    { ...base, id: 'fully-paid-unpaid-status', month: 4, paid_amount: base.total_amount },
    { ...base, id: 'refund', month: 3, total_amount: -100_000 },
    { ...base, id: 'old-tenant', tenant_id: 'departed-tenant', month: 2 }
  ]
  assert.deepEqual(getPriorOutstandingInvoices(invoices, 10, 2026).map((i) => i.id), [
    'old-tenant', 'partial', 'confirmed'
  ])
  assert.deepEqual(getPriorOutstandingInvoices(invoices, 9, 2026).map((i) => i.id), [
    'old-tenant', 'partial'
  ])
  // Sorting must not mutate the shared outstanding query used by the all-month tab.
  assert.equal(invoices[0].id, 'current')
})

test('prior debt crosses December/January and disappears after full collection', () => {
  const invoices = [
    { ...base, id: 'dec', year: 2025, month: 12 },
    { ...base, id: 'jan', year: 2026, month: 1 }
  ]
  assert.deepEqual(getPriorOutstandingInvoices(invoices, 1, 2026).map((i) => i.id), ['dec'])
  invoices[0] = { ...invoices[0], paid_amount: base.total_amount, payment_status: 'paid' }
  assert.deepEqual(getPriorOutstandingInvoices(invoices, 1, 2026), [])
})
