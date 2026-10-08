import type { Invoice } from './db'
import type { SepayEmailEvent } from './sepay-email'
import { escapeEmailHtml } from './email-html'
import { notificationEmailIcons } from '../../../shared/notification-email-assets'

export type InvoiceEmailSnapshot = {
  invoiceLines: Array<{ label: string; amount: number }>
  invoiceTotal: number
  paidAmount: number
}

// Use the stored invoice amounts; displaying a receipt must never recalculate debt.
export function getInvoiceEmailSnapshot(invoice: Invoice): InvoiceEmailSnapshot {
  const lines: Array<{ label: string; amount: number }> = []
  const add = (label: string, amount: number | undefined, always = false): void => {
    const value = Number(amount || 0)
    if (always || value !== 0) lines.push({ label, amount: value })
  }
  if (invoice.has_transfer) {
    add(
      `Tiền phòng cũ${invoice.transfer_old_room_name ? ` (${invoice.transfer_old_room_name})` : ''}`,
      invoice.transfer_room_cost
    )
    add('Tiền điện phòng cũ', invoice.transfer_electric_cost)
    add('Tiền nước phòng cũ', invoice.transfer_water_cost)
    add('Dịch vụ phòng cũ', invoice.transfer_service_cost)
  }
  add(invoice.has_transfer ? 'Tiền phòng mới' : 'Tiền phòng', invoice.room_cost, true)
  add('Tiền điện', invoice.electric_cost)
  add('Tiền nước', invoice.water_cost)
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

export type NotificationEmailLayout = {
  title: string
  recipientName?: string
  introduction: string
  highlight: string
  rows: Array<[string, string]>
  conclusion: string
  success?: boolean
  tone?: keyof typeof notificationEmailIcons
  statusLabel?: string
  date?: string
  compact?: boolean
  highlightLabel?: string
  invoiceLines?: InvoiceEmailSnapshot['invoiceLines']
  invoiceTotal?: number
  paidAmount?: number
  remaining?: number
}

export function buildNotificationEmailLayout(content: NotificationEmailLayout): string {
  const tone = content.tone || (content.success ? 'success' : 'info')
  const palette = {
    success: { color: '#00765a', background: '#e6f5ef', label: 'ĐÃ THANH TOÁN' },
    danger: { color: '#c81e25', background: '#fdecee', label: 'CẦN ĐỐI SOÁT' },
    warning: { color: '#b45309', background: '#fff5e6', label: 'NHẮC CÔNG NỢ' },
    info: { color: '#1d4ed8', background: '#eff6ff', label: 'THÔNG TIN HÓA ĐƠN' },
    reminder: { color: '#6d28d9', background: '#f5f0ff', label: 'NHẮC LỊCH' }
  }[tone]
  const icon = notificationEmailIcons[tone]
  const escape = escapeEmailHtml
  const name = content.recipientName?.trim()
  const date =
    content.date ||
    new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
  const rows = [...content.rows]
  if (content.remaining !== undefined && !content.compact)
    rows.push(['Còn phải thu', money(content.remaining)])
  const facts = rows
    .map(
      ([label, value]) =>
        '<tr><td style="width:42%;padding:12px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:20px;vertical-align:top;">' +
        escape(label) +
        '</td><td align="right" style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#10233f;font-size:20px;line-height:28px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">' +
        escape(value) +
        '</td></tr>'
    )
    .join('')
  const invoiceRows = (content.invoiceLines || [])
    .map(
      (line) =>
        '<tr><td style="padding:9px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:15px;line-height:22px;overflow-wrap:anywhere;">' +
        escape(line.label) +
        '</td><td align="right" style="padding:9px 0;border-bottom:1px solid #e2e8f0;color:#10233f;font-size:15px;vertical-align:top;white-space:nowrap;">' +
        money(line.amount) +
        '</td></tr>'
    )
    .join('')
  const invoice = content.invoiceLines
    ? '<tr><td style="padding-top:24px;"><h2 style="margin:0 0 8px;color:#10233f;font-size:18px;line-height:26px;">Chi tiết hóa đơn</h2>' +
      (invoiceRows
        ? '<table aria-label="Chi tiết hóa đơn" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;">' +
          invoiceRows +
          (content.invoiceTotal !== undefined
            ? '<tr><td style="padding:12px 0;color:#10233f;font-size:20px;font-weight:700;">Tổng hóa đơn</td><td align="right" style="padding:12px 0;color:#10233f;font-size:20px;font-weight:700;white-space:nowrap;">' +
              money(content.invoiceTotal) +
              '</td></tr>'
            : '') +
          (content.paidAmount !== undefined
            ? '<tr><td style="padding:8px 0;color:#64748b;font-size:15px;">Đã thanh toán</td><td align="right" style="padding:8px 0;color:#10233f;font-size:15px;white-space:nowrap;">' +
              money(content.paidAmount) +
              '</td></tr>'
            : '') +
          '</table>'
        : '<p style="margin:0;color:#64748b;font-size:15px;line-height:22px;">Chưa có dữ liệu chi tiết hóa đơn trong thông báo này.</p>') +
      '</td></tr>'
    : ''
  const highlight = content.compact
    ? '<tr><td style="padding:20px 0 22px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="' +
      palette.background +
      '" style="background:' +
      palette.background +
      ';border-radius:10px;table-layout:fixed;"><tr><td class="email-compact-label" width="42%" style="padding:18px;color:' +
      palette.color +
      ';font-size:20px;font-weight:700;">' +
      escape(content.highlightLabel || 'Còn phải thu') +
      '</td><td class="email-compact-amount" align="right" style="padding:18px;color:' +
      palette.color +
      ';font-size:30px;font-weight:700;overflow-wrap:anywhere;">' +
      escape(content.highlight) +
      '</td></tr></table></td></tr>'
    : '<tr><td style="padding:0 0 20px;border-bottom:1px solid #e2e8f0;color:' +
      palette.color +
      ';font-size:50px;line-height:58px;font-weight:700;letter-spacing:-1px;overflow-wrap:anywhere;">' +
      escape(content.highlight) +
      '</td></tr>'
  const greeting =
    '<tr><td style="padding-top:22px;color:#10233f;font-size:20px;line-height:30px;">' +
    (name ? 'Xin chào ' + escape(name) + ',' : 'Xin chào,') +
    '</td></tr><tr><td style="padding:16px 0 26px;color:#475569;font-size:20px;line-height:30px;">' +
    escape(content.introduction).replaceAll('\n', '<br>') +
    '</td></tr>'
  return (
    '<style>@media(max-width:420px){.email-card-content{padding:24px 20px!important}.email-compact-label{font-size:16px!important;padding:12px!important;width:38%!important}.email-compact-amount{font-size:23px!important;padding:12px!important}}</style><table role="presentation" lang="vi" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f4f7fa" style="background:#f4f7fa;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center" style="padding:20px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="width:100%;max-width:528px;table-layout:fixed;background:#ffffff;border-top:6px solid ' +
    palette.color +
    ';border-radius:14px;"><tr><td class="email-card-content" style="padding:28px 28px 24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;">' +
    '<tr><td style="padding-bottom:24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="color:#10233f;font-size:20px;font-weight:700;">AN KHANG HOME</td><td align="right" style="color:#64748b;font-size:18px;">' +
    escape(date) +
    '</td></tr></table></td></tr>' +
    '<tr><td style="padding-bottom:22px;"><table role="presentation" cellspacing="0" cellpadding="0" bgcolor="' +
    palette.background +
    '" style="background:' +
    palette.background +
    ';border-radius:10px;"><tr><td style="padding:9px 8px 9px 12px;"><img src="cid:' +
    icon.cid +
    '" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;"></td><td style="padding:9px 14px 9px 0;color:' +
    palette.color +
    ';font-size:18px;font-weight:700;">' +
    escape(content.statusLabel || palette.label) +
    '</td></tr></table></td></tr>' +
    '<tr><td style="padding-bottom:14px;"><h1 style="margin:0;color:#10233f;font-size:36px;line-height:44px;font-weight:700;letter-spacing:-0.5px;overflow-wrap:anywhere;">' +
    escape(content.title) +
    '</h1></td></tr>' +
    (content.compact ? greeting + highlight : highlight + greeting) +
    '<tr><td style="border-top:1px solid #e2e8f0;"><table aria-label="' +
    (content.success ? 'Thông tin thanh toán' : 'Thông tin thông báo') +
    '" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;">' +
    facts +
    '</table></td></tr>' +
    '<tr><td style="padding-top:22px;color:#475569;font-size:20px;line-height:30px;">' +
    escape(content.conclusion) +
    '</td></tr>' +
    invoice +
    '<tr><td style="padding-top:28px;"><p style="margin:0;padding-top:16px;border-top:1px solid #e2e8f0;color:#7c8ba1;font-size:14px;line-height:20px;">Email tự động từ AN KHANG HOME</p></td></tr></table></td></tr></table></td></tr></table>'
  )
}

export function buildPaymentSuccessEmail(event: SepayEmailEvent): {
  subject: string
  html: string
} {
  return {
    subject: `[AN KHANG HOME] Thanh toán đã ghi nhận${event.roomName ? ` · ${event.roomName}` : ''}`,
    html: buildNotificationEmailLayout({
      title: 'Thanh toán thành công',
      recipientName: event.recipientName,
      introduction: 'Khoản thanh toán cho ' + (event.roomName || 'phòng') + ' đã được ghi nhận.',
      highlight: money(event.amount),
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
      conclusion: 'Cảm ơn bạn. Khoản thanh toán đã được đối soát và khớp với hóa đơn của phòng.',
      success: true,
      invoiceLines: event.invoiceLines || [],
      invoiceTotal: event.invoiceTotal,
      paidAmount: event.paidAmount,
      remaining: event.remaining
    })
  }
}
