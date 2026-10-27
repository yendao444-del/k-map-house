import type { Invoice } from '../lib/db'
import { getMobileInvoiceState } from '../lib/mobile-invoice-state'

const money = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)} đ`
const tones = { neutral: 'bg-slate-100 text-slate-500', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-rose-50 text-rose-700', blue: 'bg-blue-50 text-blue-700' }

export function MobileInvoiceCard({ invoice, roomName, tenantName, label, onView, onPay, onMenu }: {
  invoice: Invoice; roomName: string; tenantName: string; label: string
  onView: () => void; onPay: () => void; onMenu: (button: HTMLButtonElement) => void
}) {
  const state = getMobileInvoiceState(invoice)
  const detailRows = [
    ['Tiền phòng', invoice.room_cost], ['Điện', invoice.electric_cost], ['Nước', invoice.water_cost],
    ['Wifi / Rác', Number(invoice.wifi_cost || 0) + Number(invoice.garbage_cost || 0)],
    ['Thu / Trả cọc', invoice.deposit_amount], ['Nợ kỳ trước', invoice.old_debt], ['Điều chỉnh', invoice.adjustment_amount],
    ['Phòng cũ / Chuyển phòng', Number(invoice.transfer_room_cost || 0) + Number(invoice.transfer_electric_cost || 0) + Number(invoice.transfer_water_cost || 0) + Number(invoice.transfer_service_cost || 0)],
    ['Phòng mới', Number(invoice.new_room_cost || 0) + Number(invoice.new_room_service_cost || 0)]
  ] as [string, number | undefined][]
  return <article className={`rounded-2xl border bg-white p-3.5 shadow-sm ${state.inactive ? 'border-slate-200' : state.canPay ? 'border-rose-100' : 'border-slate-200'}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><h3 className="mt-1 break-words text-[15px] font-extrabold text-slate-900">{roomName}</h3><p className="mt-1 break-words text-xs text-slate-500">{tenantName}</p></div>
      <span className={`max-w-[45%] shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold ${tones[state.tone]}`}>{state.label}</span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tổng cộng</div><div className="mt-1 break-words font-bold tabular-nums text-slate-800">{money(invoice.total_amount)}</div></div>
      <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{state.inactive ? 'Còn xử lý' : state.isRefund ? 'Cần hoàn' : 'Cần thu'}</div><div className={`mt-1 break-words font-bold tabular-nums ${state.inactive ? 'text-slate-500' : state.isRefund ? 'text-blue-600' : state.canPay ? 'text-rose-600' : 'text-emerald-700'}`}>{money(state.amount)}</div></div>
    </div>
    <details className="mt-3 text-xs text-slate-600"><summary className="min-h-10 cursor-pointer py-2 font-semibold">Chi tiết các khoản</summary><dl className="space-y-2 border-t border-slate-100 py-2">{detailRows.filter(([, value]) => Number(value || 0) !== 0).map(([name, value]) => <div key={name} className="flex justify-between gap-3"><dt>{name}</dt><dd className="text-right tabular-nums">{money(Number(value))}</dd></div>)}<div className="flex justify-between gap-3"><dt>{invoice.total_amount < 0 ? 'Đã hoàn' : 'Đã thu'}</dt><dd className="text-right tabular-nums">{money(Math.abs(invoice.paid_amount))}</dd></div>{invoice.adjustment_note && <p className="break-words text-slate-500">{invoice.adjustment_note}</p>}</dl></details>
    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
      <button type="button" onClick={onView} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600">Xem</button>
      {state.canPay && <button type="button" onClick={onPay} className="min-h-11 rounded-lg bg-primary px-3 text-xs font-bold text-white">{state.actionLabel}</button>}
      <button type="button" aria-label={`Thao tác hóa đơn ${roomName}`} onClick={event => onMenu(event.currentTarget)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600"><i className="fa-solid fa-ellipsis-vertical" aria-hidden="true" /></button>
    </div>
  </article>
}
