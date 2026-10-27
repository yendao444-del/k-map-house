import { approvedEmailBanners, type EmailTemplateId } from './approved-email-banners'

export type InvoiceEmailLine = {
  label: string
  amount: number
  details?: Array<[string, string]>
}

export type NotificationEmailLayout = {
  title: string
  template?: EmailTemplateId
  recipientName?: string
  introduction: string
  highlight?: string
  rows: Array<[string, string]>
  conclusion: string
  success?: boolean
  tone?: 'success' | 'danger' | 'warning' | 'info' | 'reminder'
  statusLabel?: string
  date?: string
  compact?: boolean
  highlightLabel?: string
  invoiceLines?: InvoiceEmailLine[]
  invoiceTotal?: number
  paidAmount?: number
  remaining?: number
  action?: { label: string; url: string; note?: string }
}

const escape = (v: string) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c)
const cash = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'

function templateFor(c: NotificationEmailLayout): EmailTemplateId {
  if (c.template) return c.template
  if (c.title.includes('nợ cũ')) return '12-nhac-no-cu'
  if (c.title.includes('Lâu')) return '11-lau-chua-thanh-toan'
  if (c.title.includes('hết hạn')) return '14-hop-dong-sap-het-han'
  if (c.title.includes('trả phòng')) return '13-den-han-tra-phong'
  if (c.tone === 'danger') return '04-giao-dich-chua-khop'
  if (c.tone === 'warning') return '10-tien-phong-qua-han'
  if (c.success || c.tone === 'success') return c.remaining && c.remaining > 0 ? '08-da-ghi-nhan-mot-phan' : '02-thanh-toan-thanh-cong'
  return '09-hoa-don-va-dich-vu'
}

// One HTML renderer for Gmail MIME, Resend and local previews. All text is live;
// only the illustrated header is cropped from the user-approved visual demo.
export function buildNotificationEmailLayout(c: NotificationEmailLayout): string {
  const id = templateFor(c), banner = approvedEmailBanners[id]
  const color = ['04','05','06','07'].includes(id.slice(0,2)) ? '#c81e25'
    : ['08','10','11','12'].includes(id.slice(0,2)) ? '#a95700'
    : ['13','14'].includes(id.slice(0,2)) ? '#5b31a4'
    : id.startsWith('17') ? '#455b6b' : ['09','15'].includes(id.slice(0,2)) ? '#075ab5' : '#007749'
  const pad = id.startsWith('15') ? 12 : 6
  const row = (label: string, value: string, summary = false, right = false, balance = false) => `<tr${balance ? ` style="background:${remaining && remaining > 0 ? '#fff4df' : '#e6f7ef'};color:${color}"` : ''}><td style="width:42%;padding:${pad}px 0;border-bottom:1px solid #dce5df;color:${summary ? color : '#697a72'};vertical-align:top">${escape(label)}</td><td${right ? ' align="right"' : ''} style="padding:${pad}px 0;border-bottom:1px solid #dce5df;font-weight:700;vertical-align:top;overflow-wrap:anywhere">${escape(value)}</td></tr>`
  const facts = c.rows.map(([l,v]) => row(l,v)).join('')
  const remaining = c.remaining ?? (c.invoiceTotal !== undefined && c.paidAmount !== undefined ? Math.max(0, c.invoiceTotal - c.paidAmount) : undefined)
  const invoiceLine = (line: InvoiceEmailLine) => {
    const detail = line.details?.map(([label, value]) => `${escape(label)}: ${escape(value)}`).join('<br>')
    const border = detail ? '' : 'border-bottom:1px solid #dce5df;'
    return `<tr><td style="padding:9px 0;${border}color:#697a72;vertical-align:top;overflow-wrap:anywhere">${escape(line.label)}</td><td align="right" style="padding:9px 0 9px 12px;${border}vertical-align:top;white-space:nowrap">${cash(line.amount)}</td></tr>${detail ? `<tr><td colspan="2" style="padding:0 0 9px;border-bottom:1px solid #dce5df;font-size:14px;line-height:1.6;color:#697a72">${detail}</td></tr>` : ''}`
  }
  const invoice = c.invoiceLines ? `<h2 style="margin:24px 0 8px;font-size:17px">Chi tiết hóa đơn</h2>${c.invoiceLines.length ? `<table aria-label="Chi tiết hóa đơn" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:15px;line-height:1.5">${c.invoiceLines.map(invoiceLine).join('')}${c.invoiceTotal !== undefined ? row('Tổng hóa đơn',cash(c.invoiceTotal),true,true) : ''}${c.paidAmount !== undefined ? row('Đã thanh toán',cash(c.paidAmount),false,true) : ''}${remaining !== undefined ? row(remaining > 0 ? 'Còn phải thanh toán' : 'Còn lại',cash(remaining),true,true,true) : ''}</table>` : '<p style="color:#697a72">Chưa có dữ liệu chi tiết hóa đơn trong thông báo này.</p>'}` : ''
  const extraBalance = remaining !== undefined && !c.invoiceLines && !c.compact && !c.rows.some(([l])=>l.includes('Còn phải')) ? row('Còn phải thu',cash(remaining)) : ''
  // Contract URLs contain a per-recipient token; no URL is ever invented here.
  const action = c.action && /^https:\/\//i.test(c.action.url) ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding-top:24px"><a class="email-action" href="${escape(c.action.url)}" style="display:inline-block;box-sizing:border-box;max-width:100%;padding:16px 26px;background:#00ab60;color:white;border-radius:9px;text-decoration:none;font-size:18px;line-height:1.4;font-weight:700;text-align:center">${escape(c.action.label)}</a></td></tr></table>${c.action.note ? `<p style="margin:12px 0 0;text-align:center;font-size:13px;color:#697a72;overflow-wrap:anywhere">${escape(c.action.note)}</p>` : ''}` : ''
  return `<style>@media only screen and (max-width:480px){.email-card-content{padding:22px 20px!important}.email-action{display:block!important;font-size:16px!important}.email-highlight{font-size:26px!important}.email-shell{border-radius:0!important}}</style>
<table role="presentation" lang="vi" width="100%" cellspacing="0" cellpadding="0" style="background:white;font-family:Arial,Helvetica,sans-serif;color:#15231d"><tr><td align="center" style="padding:12px 0">
<table class="email-shell" role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;border:1px solid #edf0ee;border-spacing:0;border-radius:6px;overflow:hidden;background:white">
<tr><td><img src="cid:${banner.cid}" width="600" alt="${escape(banner.alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
<tr><td class="email-card-content" style="padding:${c.compact ? '22px 32px' : '24px 40px 28px'};font-size:16px;line-height:1.65;overflow-wrap:anywhere">
<h1 style="display:none;margin:0;font-size:20px">${escape(c.title)}</h1>
<p style="margin:0 0 14px">${c.recipientName?.trim() ? 'Xin chào <strong>' + escape(c.recipientName.trim()) + '</strong>,' : 'Xin chào,'}</p>
<p style="margin:0 0 20px">${escape(c.introduction).replaceAll('\n','<br>')}</p>
${c.highlight ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;color:${color}"><tr>${c.highlightLabel ? `<td style="width:42%;font-size:18px;font-weight:700;vertical-align:middle">${escape(c.highlightLabel)}</td>` : ''}<td><strong class="email-highlight" style="font-size:${c.compact ? '28' : '32'}px;line-height:1.35">${escape(c.highlight)}</strong></td></tr></table>` : ''}
<table aria-label="Thông tin thông báo" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:16px;line-height:1.5">${facts}${extraBalance}</table>
${invoice}<p style="margin:24px 0 0">${escape(c.conclusion).replaceAll('\n','<br>')}</p>${action}
<p style="margin:26px 0 0;padding-top:20px;border-top:1px solid #dce5df">Trân trọng,<br><strong>Đội ngũ An Khang Home</strong></p>
<p style="margin:20px 0 0;font-size:12px;color:#697a72">Email tự động từ AN KHANG HOME${c.date ? ' · ' + escape(c.date) : ''}</p>
</td></tr></table></td></tr></table>`
}

export function buildMonthlyPaymentReminder(input: { tenantName: string; room: string; period: string }) {
  return buildNotificationEmailLayout({
    template: '15-den-ky-thanh-toan', title: 'Đến kỳ thanh toán', recipientName: input.tenantName,
    introduction: `Đã đến kỳ thanh toán của ${input.room}. Vui lòng vào pay.phongtroankhang.com để bắt đầu.`,
    rows: [['Phòng', input.room], ['Kỳ thanh toán', input.period]],
    conclusion: 'Bạn cần chụp số điện và nước trước. Sau khi hệ thống cập nhật chỉ số, hóa đơn sẽ được lập để bạn kiểm tra và thanh toán.',
    action: { label: 'Bắt đầu thanh toán', url: 'https://pay.phongtroankhang.com/?screen=payment', note: 'pay.phongtroankhang.com' }
  })
}

