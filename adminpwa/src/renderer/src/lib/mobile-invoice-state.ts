import type { Invoice } from './db'

type InvoiceStateInput = Pick<Invoice, 'total_amount' | 'paid_amount' | 'payment_status' | 'debt_confirmed_at'>

export function getMobileInvoiceState(invoice: InvoiceStateInput) {
  // Refund transactions have signed (negative) paid_amount, as in the
  // atomic payment RPC and PaymentModal. Never use remaining <= 0 as paid.
  const balance = Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)
  const isRefund = balance < 0 || Number(invoice.total_amount) < 0
  const inactive = invoice.payment_status === 'cancelled' || invoice.payment_status === 'merged'
  const paid = invoice.payment_status === 'paid'
  const canPay = !inactive && !paid && balance !== 0
  let label: string
  let tone: 'neutral' | 'green' | 'amber' | 'red' | 'blue'
  if (invoice.payment_status === 'cancelled') { label = 'Đã hủy'; tone = 'neutral' }
  else if (invoice.payment_status === 'merged') { label = 'Đã gộp'; tone = 'neutral' }
  else if (paid) { label = isRefund ? 'Đã hoàn đủ' : 'Đã thu đủ'; tone = 'green' }
  else if (balance === 0) { label = 'Không còn số dư'; tone = 'neutral' }
  else if (isRefund) { label = invoice.paid_amount !== 0 ? 'Hoàn còn thiếu' : 'Cần hoàn tiền'; tone = 'blue' }
  else if (invoice.debt_confirmed_at) { label = 'Đã chốt · Đang nợ'; tone = 'red' }
  else if (invoice.payment_status === 'partial' || invoice.paid_amount > 0) { label = 'Thu thiếu'; tone = 'amber' }
  else { label = 'Chưa thu'; tone = 'red' }
  return { label, tone, inactive, canPay, isRefund, balance, amount: inactive ? 0 : Math.abs(balance), actionLabel: isRefund ? 'Hoàn tiền' : 'Thu tiền' }
}

export function getInvoiceMenuPermissions(invoice: InvoiceStateInput, isAdmin: boolean) {
  const state = getMobileInvoiceState(invoice)
  const isPaid = invoice.payment_status === 'paid'
  // Reuse Electron's edit/cancel conditions, with terminal-state protection.
  const unlocked = !state.inactive && !invoice.debt_confirmed_at
  return {
    canPay: state.canPay,
    canEdit: unlocked && ((invoice.payment_status === 'unpaid' && Number(invoice.paid_amount || 0) <= 0) || (isPaid && isAdmin)),
    canCancel: unlocked && (!isPaid || isAdmin),
    canReopen: !state.inactive && !!invoice.debt_confirmed_at && isAdmin && invoice.payment_status === 'unpaid' && invoice.paid_amount === 0
  }
}

export function getInvoiceMenuPosition(rect: { bottom: number; right: number }, width: number, height: number) {
  return { top: Math.max(8, Math.min(rect.bottom + 4, height - 268)), right: Math.max(8, Math.min(width - rect.right, width - 184)) }
}
