import type { Contract, Invoice, Room } from './db'
import { isOutstandingInvoice } from './invoiceDebt'
import { isDepositOnlyInvoice } from './invoice-kind'

export function getMobileRoomFinance(room: Room, contract: Pick<Contract, 'tenant_id' | 'created_at' | 'move_in_date'> | undefined, invoices: Invoice[], now = new Date()) {
  if (room.status === 'vacant') return { kind: 'vacant' as const, label: 'Sẵn sàng cho thuê', totalDebt: 0, balance: 0, invoice: undefined }
  const active = invoices.filter(invoice => invoice.payment_status !== 'cancelled' && invoice.payment_status !== 'merged' && (!contract?.tenant_id || invoice.tenant_id === contract.tenant_id))
  // Total tenant debt mirrors the desktop total-debt column, not just this month.
  const outstanding = active.filter(isOutstandingInvoice)
  const totalDebt = outstanding.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount)), 0)
  const started = contract?.created_at || contract?.move_in_date
  const current = active.filter(invoice => (!started || invoice.created_at >= started))
  const refund = current.find(invoice => (invoice.payment_status === 'unpaid' || invoice.payment_status === 'partial') && Number(invoice.total_amount) < 0 && Number(invoice.paid_amount) > Number(invoice.total_amount))
  if (refund) return { kind: 'refund' as const, label: 'Cần hoàn tiền', totalDebt, balance: Number(refund.paid_amount) - Number(refund.total_amount), invoice: refund }
  const invoice = outstanding.filter(item => !item.debt_confirmed_at && (!started || item.created_at >= started))
    .sort((a, b) => Number(!!b.is_first_month) - Number(!!a.is_first_month) || b.year - a.year || b.month - a.month || b.created_at.localeCompare(a.created_at))[0]
  if (invoice) return {
    kind: 'unpaid' as const,
    label: invoice.is_settlement || invoice.billing_reason === 'contract_end' ? 'Còn nợ tất toán' : isDepositOnlyInvoice(invoice) ? (invoice.payment_status === 'partial' ? 'Còn thiếu tiền cọc' : 'Chưa thu tiền cọc') : invoice.is_first_month ? `${invoice.payment_status === 'partial' ? 'Còn thiếu' : 'Chưa thu'} tháng đầu` : `${invoice.payment_status === 'partial' ? 'Còn thiếu' : 'Chưa thu'} tháng ${invoice.month}${invoice.year !== now.getFullYear() ? `/${invoice.year}` : ''}`,
    totalDebt, balance: Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount)), invoice
  }
  if (totalDebt > 0) return { kind: 'debt' as const, label: 'Nợ đã xác nhận', totalDebt, balance: totalDebt, invoice: outstanding[0] }
  const periodInvoices = current.filter(item => item.year === now.getFullYear() && item.month === now.getMonth() + 1 && !item.is_settlement && !isDepositOnlyInvoice(item))
  if (periodInvoices.length > 0 && periodInvoices.every(item => item.payment_status === 'paid' || Number(item.total_amount) === Number(item.paid_amount))) {
    return { kind: 'paid' as const, label: 'Đã thu đủ', totalDebt, balance: 0, invoice: undefined }
  }
  return { kind: 'pending' as const, label: contract ? 'Chưa lập hóa đơn kỳ này' : 'Chờ lập hợp đồng', totalDebt, balance: 0, invoice: undefined }
}
