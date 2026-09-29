import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  findDebtToConfirm,
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
