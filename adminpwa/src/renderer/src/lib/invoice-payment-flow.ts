import type { Invoice, InvoicePaymentRecord } from './db'

export const INVOICE_REFUND_LABELS: Record<string, string> = {
  deposit_settlement_refund: 'Hoàn cọc sau tất toán',
  deposit_refund: 'Hoàn tiền cọc',
  invoice_refund: 'Hoàn tiền hóa đơn'
}

/** Payment signs describe cash movement; invoice totals also contain non-cash offsets. */
export function getInvoicePaymentFlow(
  invoice: Pick<Invoice, 'billing_reason' | 'is_settlement' | 'deposit_amount'>,
  record: Pick<InvoicePaymentRecord, 'amount'>
): {
  type: 'income' | 'expense'
  amount: number
  category: string
  label: string
  isDepositRefund: boolean
} {
  const signedAmount = Number(record.amount) || 0
  const isRefund = signedAmount < 0
  const isSettlement = invoice.is_settlement || invoice.billing_reason === 'contract_end'
  const isDepositRefund =
    isRefund &&
    (invoice.billing_reason === 'deposit_refund' || Number(invoice.deposit_amount || 0) < 0)
  const category = !isRefund
    ? 'other_income'
    : isDepositRefund
      ? isSettlement
        ? 'deposit_settlement_refund'
        : 'deposit_refund'
      : 'invoice_refund'
  return {
    type: isRefund ? 'expense' : 'income',
    amount: Math.abs(signedAmount),
    category,
    label: INVOICE_REFUND_LABELS[category] || 'Thu tiền phòng',
    isDepositRefund
  }
}
