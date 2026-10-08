import { buildNotificationEmailLayout, buildPaymentSuccessEmail, getInvoiceEmailSnapshot } from '../../../src/renderer/src/lib/payment-success-email.ts'
import { buildSepayEmail } from '../../../src/renderer/src/lib/sepay-email.ts'
import { notificationEmailIcons } from '../../../src/shared/notification-email-assets.ts'
import type { Invoice } from '../../../src/renderer/src/lib/db.ts'

type Data = Record<string, any>
export const money = (amount: number): string => new Intl.NumberFormat('vi-VN').format(amount) + ' đ'
export const vietnamDate = (date: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
const dateLabel = (value: string): string => value?.split('-').reverse().join('/') || ''

export function renderServerEmail(job: Data, invoice?: Invoice | null, room?: Data | null, now = new Date()): {subject: string; html: string; text: string} {
  const p = job.payload || {}
  let mail: {subject: string; html: string}
  if (p.manualHtml) mail = { subject: job.subject, html: p.manualHtml }
  else if (job.event_type === 'sepay_matched') {
    const snapshot = p.invoice as Invoice
    mail = buildPaymentSuccessEmail({ type: 'sepay_matched', transactionKey: p.transactionKey,
      amount: Number(p.record.amount), roomName: p.roomName, month: snapshot.month, year: snapshot.year,
      recipientName: job.recipient_name, remaining: Math.max(0,snapshot.total_amount-snapshot.paid_amount),
      ...getInvoiceEmailSnapshot(snapshot) })
  } else if (job.event_type === 'sepay_unmatched') {
    mail = buildSepayEmail({type:'sepay_unmatched', transactionKey:p.transactionKey, amount:p.amount,
      content:p.content,roomName:p.roomName,recipientName:job.recipient_name})
  } else {
    const roomName = room?.name || p.roomName || 'Phòng'
    const balance = invoice ? Math.max(0,invoice.total_amount-invoice.paid_amount) : Number(room?.old_debt || 0)
    const date = dateLabel(p.dueDate || invoice?.due_date || '')
    const days = p.dueDate ? Math.max(0,Math.floor((Date.parse(vietnamDate(now))-Date.parse(p.dueDate))/86400000)) : 0
    const rows: Array<[string,string]> = [['Phòng',roomName]]
    let title = 'Nhắc thanh toán tiền phòng', tone: 'warning'|'info'|'reminder' = 'warning'
    let introduction = `${roomName} còn khoản nợ chưa thanh toán.`
    let conclusion = 'Vui lòng kiểm tra và thu hồi công nợ.'
    let highlight = money(balance), label = 'Còn phải thu', compact = true
    let statusLabel = 'NHẮC CÔNG NỢ'
    let snapshot: Partial<ReturnType<typeof getInvoiceEmailSnapshot>> = {}
    if (job.event_type === 'rent_long_unpaid') {
      title='Lâu chưa thanh toán'; rows.push(['Chưa thanh toán',`${days} ngày`])
    } else if (job.event_type === 'room_checkout_due') {
      title='Đến hạn trả phòng'; tone='reminder';statusLabel='NHẮC TRẢ PHÒNG';label='Hạn trả phòng';highlight=date
      introduction=`${roomName} đã đến hạn trả phòng.`;conclusion='Vui lòng kiểm tra kế hoạch trả phòng và bàn giao.'
    } else if (job.event_type === 'contract_expiring') {
      title='Hợp đồng sắp hết hạn';tone='reminder';statusLabel='NHẮC HỢP ĐỒNG';compact=false
      highlight='Còn '+Math.max(0,Math.floor((Date.parse(p.dueDate)-Date.parse(vietnamDate(now)))/86400000))+' ngày'
      introduction=`Hợp đồng của ${roomName} sắp hết hạn.`;rows.push(['Ngày hết hạn',date])
      conclusion='Vui lòng liên hệ người thuê để thống nhất gia hạn hoặc bàn giao phòng.'
    } else if (job.event_type === 'invoices_services' && invoice) {
      title='Hóa đơn và dịch vụ';tone='info';statusLabel='HÓA ĐƠN MỚI';compact=false;highlight=money(invoice.total_amount)
      introduction=`Hóa đơn tháng ${invoice.month}/${invoice.year} của ${roomName} đã được lập.`
      rows.push(['Hóa đơn',`${invoice.month}/${invoice.year}`],['Hạn thanh toán',dateLabel(invoice.due_date || '')])
      conclusion='Vui lòng kiểm tra thông tin hóa đơn trong ứng dụng.';snapshot=getInvoiceEmailSnapshot(invoice)
    } else {
      if (invoice) rows.push(['Hóa đơn',`${invoice.month}/${invoice.year}`])
      else rows.push(['Nguồn nợ','Nợ cũ của phòng'])
      rows.push(['Hạn thanh toán',date])
    }
    mail={subject:`[AN KHANG HOME] ${title} · ${roomName}`,html:buildNotificationEmailLayout({title,tone,statusLabel,
      recipientName:job.recipient_name,introduction,conclusion,highlight,highlightLabel:label,compact,rows,...snapshot})}
  }
  return {...mail,text:emailPlainText(mail.html)}
}

export function emailPlainText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<(?:br\s*\/|\/tr|\/p|\/h[1-6])>/gi,'\n')
    .replace(/<\/td>/gi,' · ').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim()
}

export function inlineEmailAttachments(html: string): Array<{filename: string;content: string;content_id: string}> {
  return Object.entries(notificationEmailIcons).filter(([,icon])=>html.includes('cid:'+icon.cid))
    .map(([tone,icon])=>({filename:`email-${tone}.png`,content:icon.base64,content_id:icon.cid}))
}
