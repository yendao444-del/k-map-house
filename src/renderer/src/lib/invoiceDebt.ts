import type { Invoice } from './db'

export const invoicePeriodNumber = (invoice: Pick<Invoice, 'year' | 'month'>): number =>
  invoice.year * 12 + invoice.month

export const isOutstandingInvoice = (
  invoice: Pick<Invoice, 'payment_status' | 'total_amount' | 'paid_amount'>
): boolean =>
  (invoice.payment_status === 'unpaid' || invoice.payment_status === 'partial') &&
  Number(invoice.total_amount || 0) > Number(invoice.paid_amount || 0)

export const getPriorOutstandingInvoices = (
  invoices: Invoice[],
  month: number,
  year: number
): Invoice[] =>
  invoices
    .filter(
      (invoice) =>
        isOutstandingInvoice(invoice) && invoicePeriodNumber(invoice) < year * 12 + month
    )
    .sort(
      (left, right) =>
        invoicePeriodNumber(left) - invoicePeriodNumber(right) ||
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id)
    )

export const isBillingPeriodInvoice = (
  invoice: Pick<Invoice, 'billing_reason' | 'is_first_month' | 'is_settlement'>
): boolean =>
  !invoice.is_settlement &&
  (invoice.is_first_month === true ||
    ['first_month', 'monthly', 'room_cycle'].includes(invoice.billing_reason || ''))

export const findDebtToConfirm = (
  invoices: Invoice[],
  tenantId: string | undefined,
  contractStartedAt: string | undefined,
  targetMonth: number,
  targetYear: number
): Invoice | null => {
  const targetPeriod = targetYear * 12 + targetMonth
  return (
    invoices
      .filter(
        (invoice) =>
          (!tenantId || invoice.tenant_id === tenantId) &&
          (!contractStartedAt || invoice.created_at >= contractStartedAt) &&
          isBillingPeriodInvoice(invoice) &&
          isOutstandingInvoice(invoice) &&
          !invoice.debt_confirmed_at &&
          invoicePeriodNumber(invoice) < targetPeriod
      )
      .sort(
        (left, right) =>
          invoicePeriodNumber(left) - invoicePeriodNumber(right) ||
          left.created_at.localeCompare(right.created_at)
      )[0] || null
  )
}
