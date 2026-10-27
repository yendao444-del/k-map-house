import { useState } from 'react'
import { confirmInvoiceDebt, type Invoice, type Room } from '../lib/db'

const formatVND = (value: number) => new Intl.NumberFormat('vi-VN').format(value)

export function DebtClosingModal({
  invoice,
  room,
  onClose,
  onConfirmed,
  onPay
}: {
  invoice: Invoice
  room: Room
  onClose: () => void
  onConfirmed: () => Promise<void>
  onPay: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount)

  const confirm = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await confirmInvoiceDebt(invoice)
      await onConfirmed()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chốt nợ. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-emerald-800">Chốt nợ tháng {invoice.month}/{invoice.year}</h2>
            <p className="mt-1 text-sm text-slate-600">{room.name} · Xác nhận hóa đơn và chỉ số trước khi lập kỳ mới</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Đóng" className="rounded-lg px-2 text-xl text-slate-400 hover:bg-slate-100">×</button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm">
          <div className="rounded-xl bg-rose-50 px-4 py-3 font-bold text-rose-700">Còn nợ: {formatVND(remaining)} đ</div>
          <div className="flex justify-between"><span>Tổng hóa đơn</span><strong>{formatVND(invoice.total_amount)} đ</strong></div>
          <div className="flex justify-between"><span>Đã thu</span><strong>{formatVND(invoice.paid_amount)} đ</strong></div>
          <div className="border-t border-slate-100 pt-3 text-slate-700">
            <div className="flex justify-between"><span>Điện</span><strong>{invoice.electric_old} → {invoice.electric_new}</strong></div>
            <div className="mt-2 flex justify-between"><span>Nước</span><strong>{invoice.water_old} → {invoice.water_new}</strong></div>
          </div>
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Chốt nợ không ghi nhận thanh toán. Chỉ số cuối kỳ này sẽ là mốc đầu kỳ tiếp theo. Hãy sửa hoặc hủy hóa đơn nếu thông tin chưa đúng.</p>
          {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onPay} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Thu tiền</button>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Để sau</button>
          <button type="button" onClick={() => void confirm()} disabled={saving} className="ml-auto rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Đang chốt...' : 'Xác nhận chốt nợ'}</button>
        </div>
      </div>
    </div>
  )
}
