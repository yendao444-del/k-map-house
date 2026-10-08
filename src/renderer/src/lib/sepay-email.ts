import type { AppUser, Invoice } from './db'
import {
  findInvoiceTransferMatches,
  normalizeTransferText,
  type InvoiceTransferIndex
} from './invoiceTransfer'
import { emailRecipientDecision } from './notification-email'
import {
  buildNotificationEmailLayout,
  buildPaymentSuccessEmail,
  getInvoiceEmailSnapshot
} from './payment-success-email'

export type SepayEmailEvent = {
  type: 'sepay_matched' | 'sepay_unmatched'
  transactionKey: string
  amount: number
  roomName?: string
  month?: number
  year?: number
  invoiceId?: string
  content?: string
  remaining?: number
  recipientName?: string
  invoiceLines?: Array<{ label: string; amount: number }>
  invoiceTotal?: number
  paidAmount?: number
}

export const sepayEmailKey = (event: SepayEmailEvent, userId: string): string =>
  `${userId}:${event.type}:${normalizeTransferText(event.transactionKey)}`

export const canReceiveSepayEmail = (user: AppUser, event: SepayEmailEvent): boolean =>
  emailRecipientDecision(user, event.type).allowed

export type SepayNotificationTransaction = {
  id: string
  reference_number?: string
  amount_in: string | number
  transaction_content?: string
  transaction_date?: string
}

// Pure notification decision, shared by the live observer and the testing panel.
// This does not record or approve a payment.
export function evaluateSepayNotificationTransaction(
  tx: SepayNotificationTransaction,
  invoices: Invoice[],
  index: InvoiceTransferIndex
): {
  status:
    | 'ignored'
    | 'recorded'
    | 'awaiting_record'
    | 'partial'
    | 'over'
    | 'unmatched'
    | 'ambiguous'
  event?: SepayEmailEvent
} {
  const key = normalizeTransferText(tx.reference_number || tx.id)
  const amount = Number(tx.amount_in)
  if (!key || !Number.isFinite(amount) || amount <= 0) return { status: 'ignored' }
  const matches = findInvoiceTransferMatches(index, tx.transaction_content || '')
  if (
    invoices.some((invoice) =>
      invoice.payment_records?.some((record) =>
        [record.external_ref, record.external_id].some(
          (value) => value && normalizeTransferText(value) === key
        )
      )
    )
  )
    return { status: 'recorded' }
  if (
    matches.length === 1 &&
    Math.abs(amount - Math.max(0, matches[0].total_amount - matches[0].paid_amount)) < 1
  )
    return { status: 'awaiting_record' }
  const status =
    matches.length === 0
      ? 'unmatched'
      : matches.length > 1
        ? 'ambiguous'
        : amount < Math.max(0, matches[0].total_amount - matches[0].paid_amount)
          ? 'partial'
          : 'over'
  return {
    status,
    event: {
      type: 'sepay_unmatched',
      transactionKey: tx.reference_number || tx.id,
      amount,
      content: tx.transaction_content
    }
  }
}

export function buildSepayEmail(event: SepayEmailEvent): { subject: string; html: string } {
  if (event.type === 'sepay_matched') return buildPaymentSuccessEmail(event)
  const rows: Array<[string, string]> = [
    ['Mã giao dịch', event.transactionKey],
    ['Trạng thái', 'Cần đối soát'],
    ['Kênh', 'SePay']
  ]
  if (event.roomName) rows.push(['Phòng', event.roomName])
  if (event.month && event.year) rows.push(['Hóa đơn tham chiếu', event.month + '/' + event.year])
  if (event.content) rows.push(['Nội dung chuyển khoản', event.content])
  return {
    subject:
      '[AN KHANG HOME] Giao dịch SePay cần đối soát' +
      (event.roomName ? ' · ' + event.roomName : ''),
    html: buildNotificationEmailLayout({
      title: 'Giao dịch chưa khớp',
      tone: 'danger',
      recipientName: event.recipientName,
      introduction: 'Hệ thống nhận được giao dịch nhưng chưa khớp với hóa đơn phòng.',
      highlight: new Intl.NumberFormat('vi-VN').format(event.amount) + ' đ',
      rows,
      remaining: event.remaining,
      conclusion:
        'Vui lòng kiểm tra giao dịch trong mục Đồng bộ SePay trước khi ghi nhận khoản thu.'
    })
  }
}
// Only notify new payment records observed during this app session. Opening
// the app must not send an entire historical ledger of financial emails.
export function getNewSepayPaymentEmails(
  invoices: Invoice[],
  since: number,
  roomName: (roomId: string) => string | undefined
): SepayEmailEvent[] {
  return invoices.flatMap((invoice) =>
    (invoice.payment_records || []).flatMap((record) => {
      const key = record.external_ref || record.external_id
      if (
        record.source !== 'sepay' ||
        !key ||
        record.amount <= 0 ||
        !(Date.parse(record.created_at) >= since)
      )
        return []
      return [
        {
          type: 'sepay_matched' as const,
          transactionKey: key,
          amount: record.amount,
          invoiceId: invoice.id,
          month: invoice.month,
          year: invoice.year,
          roomName: roomName(invoice.room_id),
          remaining: Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount)),
          ...getInvoiceEmailSnapshot(invoice)
        }
      ]
    })
  )
}
