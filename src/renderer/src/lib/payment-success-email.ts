import type { Invoice } from './db'
import type { SepayEmailEvent } from './sepay-email'
import { buildNotificationEmailLayout } from '../../../shared/notification-email-layout'
import type { InvoiceEmailLine } from '../../../shared/notification-email-layout'
export { buildNotificationEmailLayout } from '../../../shared/notification-email-layout'
export type { NotificationEmailLayout } from '../../../shared/notification-email-layout'

export type InvoiceEmailSnapshot = {
  invoiceLines: InvoiceEmailLine[]
  invoiceTotal: number
  paidAmount: number
}

// Use the stored invoice amounts; displaying a receipt must never recalculate debt.
export function getInvoiceEmailSnapshot(invoice: Invoice): InvoiceEmailSnapshot {
  const lines: InvoiceEmailLine[] = []
  const add = (label: string, amount: number | undefined, always = false, details?: Array<[string, string]>): void => {
    const value = Number(amount || 0)
    if (always || value !== 0) lines.push({ label, amount: value, ...(details ? { details } : {}) })
  }
  const reading = (value: unknown): number | undefined =>
    value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
      ? Number(value) : undefined
  const unitValue = (value: unknown, unit: string): string => {
    const number = reading(value)
    return number === undefined ? 'Chưa có dữ liệu' : `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(number)} ${unit}`
  }
  const meterDetails = (kind: 'electric' | 'water'): Array<[string, string]> => {
    const unit = kind === 'electric' ? 'kWh' : 'm³'
    const old = reading(invoice[`${kind}_old`]), current = reading(invoice[`${kind}_new`])
    const usage = reading(invoice[`${kind}_usage`]) ??
      (old !== undefined && current !== undefined && current >= old ? current - old : undefined)
    return [
      ['Chỉ số đầu kỳ', unitValue(old, unit)],
      ['Chỉ số cuối kỳ', unitValue(current, unit)],
      ['Sử dụng', unitValue(usage, unit)],
      ['Đơn giá', unitValue(invoice[`${kind}_price_snapshot`], `đ/${unit}`)]
    ]
  }
  if (invoice.has_transfer) {
    add(
      `Tiền phòng cũ${invoice.transfer_old_room_name ? ` (${invoice.transfer_old_room_name})` : ''}`,
      invoice.transfer_room_cost
    )
    // Transfer snapshots only retain usage, not the old room's meter readings/rates.
    add('Tiền điện phòng cũ', invoice.transfer_electric_cost, false,
      [['Sử dụng', unitValue(invoice.transfer_electric_usage, 'kWh')]])
    add('Tiền nước phòng cũ', invoice.transfer_water_cost, false,
      [['Sử dụng', unitValue(invoice.transfer_water_usage, 'm³')]])
    add('Dịch vụ phòng cũ', invoice.transfer_service_cost)
  }
  add(invoice.has_transfer ? 'Tiền phòng mới' : 'Tiền phòng', invoice.room_cost, true)
  add('Tiền điện', invoice.electric_cost, true, meterDetails('electric'))
  add('Tiền nước', invoice.water_cost, true, meterDetails('water'))
  add('Internet', invoice.wifi_cost)
  add('Vệ sinh', invoice.garbage_cost)
  add('Nợ kỳ trước', invoice.old_debt)
  add('Nợ hóa đơn gộp', invoice.merged_debt_total)
  add(
    Number(invoice.deposit_amount || 0) < 0 ? 'Trừ / hoàn tiền cọc' : 'Thu tiền cọc',
    invoice.deposit_amount
  )
  add(
    invoice.adjustment_note ? `Điều chỉnh (${invoice.adjustment_note})` : 'Điều chỉnh',
    invoice.adjustment_amount
  )
  return {
    invoiceLines: lines,
    invoiceTotal: Number(invoice.total_amount),
    paidAmount: Number(invoice.paid_amount)
  }
}

const money = (value: number): string => new Intl.NumberFormat('vi-VN').format(value) + ' đ'

export function buildPaymentSuccessEmail(event: SepayEmailEvent): {
  subject: string
  html: string
} {
  const partial = Number(event.remaining || 0) > 0
  const landlord = event.audience !== 'tenant'
  const title = partial ? 'Đã ghi nhận thanh toán một phần' : landlord ? 'Đã nhận thanh toán' : 'Thanh toán thành công'
  return {
    subject: `[AN KHANG HOME] ${title}${event.roomName ? ` · ${event.roomName}` : ''}`,
    html: buildNotificationEmailLayout({
      title,
      template: partial ? '08-da-ghi-nhan-mot-phan' : landlord ? '03-bien-nhan-chu-nha' : '02-thanh-toan-thanh-cong',
      tone: partial ? 'warning' : 'success',
      recipientName: event.recipientName,
      introduction: partial
        ? 'Khoản thanh toán một phần cho ' + (event.roomName || 'phòng') + ' đã được duyệt và ghi nhận.'
        : 'Khoản thanh toán cho ' + (event.roomName || 'phòng') + ' đã được ghi nhận.',
      highlight: money(event.amount),
      highlightLabel: partial ? 'Đã ghi nhận' : landlord ? 'Khoản thu đã ghi nhận' : 'Đã thanh toán',
      rows: [
        ['Phòng', event.roomName || 'Chưa có thông tin'],
        [
          'Hóa đơn',
          event.month && event.year
            ? `Hóa đơn tháng ${event.month}/${event.year}`
            : 'Chưa có thông tin'
        ],
        ['Mã giao dịch', event.transactionKey],
        ['Kênh', 'SePay']
      ],
      conclusion: partial
        ? `Hóa đơn vẫn còn dư nợ ${money(event.remaining!)}. Vui lòng thanh toán phần còn lại.`
        : 'Cảm ơn bạn. Khoản thanh toán đã được đối soát và khớp với hóa đơn của phòng.',
      success: true,
      invoiceLines: event.invoiceLines || [],
      invoiceTotal: event.invoiceTotal,
      paidAmount: event.paidAmount,
      remaining: event.remaining
    })
  }
}

