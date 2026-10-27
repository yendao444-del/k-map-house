import type { Invoice } from './db'

export function exportableInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.filter(invoice => invoice.payment_status !== 'cancelled' && invoice.payment_status !== 'merged')
}

export function selectedExportInvoice(invoices: Invoice[], roomId: string, invoiceId: string): Invoice {
  if (!roomId || !invoiceId) throw new Error('Hãy chọn phòng và hóa đơn cần xuất.')
  const invoice = exportableInvoices(invoices).find(item => item.id === invoiceId && item.room_id === roomId)
  if (!invoice) throw new Error('Hóa đơn đã chọn không còn hợp lệ. Hãy tải lại danh sách.')
  return invoice
}
