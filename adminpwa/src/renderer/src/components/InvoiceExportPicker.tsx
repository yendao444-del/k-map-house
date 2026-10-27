import { useEffect, useRef, useState } from 'react'
import type { Invoice, Room } from '../lib/db'
import { exportableInvoices } from '../lib/invoice-export-selection'

export function InvoiceExportPicker({ invoices, rooms, period, loading, busy, error, onClose, onExport }: {
  invoices: Invoice[]; rooms: Room[]; period: string; loading: boolean; busy: boolean; error: string;
  onClose: () => void; onExport: (roomId: string, invoiceId: string) => void
}) {
  const [roomId, setRoomId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [search, setSearch] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const eligible = exportableInvoices(invoices)
  const availableRooms = rooms.filter(room => eligible.some(invoice => invoice.room_id === room.id) && room.name.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))).sort((a,b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))
  const roomInvoices = eligible.filter(invoice => invoice.room_id === roomId)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => previous?.focus()
  }, [])
  return <div className="fixed inset-0 z-[350] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="invoice-export-title" className="flex max-h-[calc(100dvh-24px)] w-full max-w-md flex-col rounded-2xl bg-white p-4 shadow-2xl" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key !== 'Tab') return
      const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select') || [])
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
      <div className="flex shrink-0 items-start justify-between gap-3"><div><h3 id="invoice-export-title" className="text-base font-bold text-slate-900">Chọn phòng để xuất</h3><p className="mt-1 text-xs text-slate-500">{period} · Không tự chọn tất cả phòng</p></div><button type="button" disabled={busy} onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500" aria-label="Đóng chọn phòng"><i className="fa-solid fa-xmark" /></button></div>
      <div className="min-h-0 overflow-y-auto">
        <label className="mt-3 block text-sm text-slate-600">Tìm phòng<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nhập số phòng…" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-base" /></label>
        <label className="mt-3 block text-sm text-slate-600">Phòng<select value={roomId} disabled={loading || busy} onChange={event => { setRoomId(event.target.value); setInvoiceId('') }} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base"><option value="">{loading ? 'Đang tải hóa đơn…' : 'Chọn phòng cần xuất'}</option>{availableRooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        {roomId && <fieldset className="mt-3"><legend className="text-sm text-slate-600">Chọn hóa đơn</legend>{roomInvoices.map(invoice => <label key={invoice.id} className="flex min-h-12 items-center gap-3 border-b border-slate-100 py-2 text-sm"><input type="radio" name="export-invoice" value={invoice.id} checked={invoiceId === invoice.id} disabled={busy} onChange={() => setInvoiceId(invoice.id)} /><span className="min-w-0">Tháng {invoice.month}/{invoice.year}{invoice.is_settlement ? ' · Tất toán' : invoice.billing_reason === 'deposit_collect' ? ' · Tiền cọc' : ''}<small className="block text-slate-500">{new Intl.NumberFormat('vi-VN').format(invoice.total_amount)} đ · {invoice.payment_status === 'paid' ? 'Đã thu' : invoice.payment_status === 'partial' ? 'Thu thiếu' : 'Chưa thu'} · {invoice.id.slice(-8)}</small></span></label>)}</fieldset>}
        {!loading && !eligible.length && <p className="mt-3 text-sm text-slate-500">Không có hóa đơn hợp lệ trong kỳ này.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      </div>
      <div className="mt-4 flex shrink-0 gap-2"><button type="button" onClick={onClose} disabled={busy} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600">Hủy</button><button type="button" onClick={() => onExport(roomId, invoiceId)} disabled={!roomId || !invoiceId || loading || busy} className="min-h-11 flex-1 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Đang tạo ảnh…' : 'Tải hóa đơn đã chọn'}</button></div>
    </div>
  </div>
}
