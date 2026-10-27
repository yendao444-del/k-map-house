import { useState } from 'react'
import { useMobile } from '../lib/use-mobile'

export function InvoiceToolbar({ onExport, onSync, busy, settingsLoading }: {
  onExport: () => void; onSync: () => void; busy: boolean; settingsLoading: boolean
}) {
  const isMobile = useMobile()
  const [more, setMore] = useState(false)
  return <header className="invoice-toolbar flex items-center justify-between gap-3 border-b border-gray-100 p-4">
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-green-100 text-lg text-green-600"><i className="fa-solid fa-file-invoice-dollar" /></div>
      <div className="min-w-0"><h2 className="text-base font-bold text-gray-800">Quản lý hóa đơn</h2><p className="text-xs text-gray-500">{isMobile ? 'Tra cứu và thu tiền' : 'Tra cứu và quản lý tất cả hóa đơn các tháng'}</p></div>
    </div>
    <div className="relative flex shrink-0 gap-2">
      {!isMobile && <button type="button" onClick={onSync} disabled={settingsLoading} className="flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><i className="fa-solid fa-rotate" />Đồng bộ SePay</button>}
      <button type="button" onClick={onExport} disabled={busy} aria-label="Chọn phòng để xuất hóa đơn" title="Chọn phòng để xuất hóa đơn" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white disabled:opacity-50"><i className="fa-solid fa-file-arrow-down" />{!isMobile && 'Xuất HĐ'}</button>
      {isMobile && <>
        <button type="button" aria-label="Thao tác hóa đơn khác" aria-expanded={more} onClick={() => setMore(value => !value)} className="grid h-11 w-11 place-items-center rounded-lg border border-slate-200 text-slate-600"><i className="fa-solid fa-ellipsis-vertical" /></button>
        {more && <>
          <button type="button" aria-label="Đóng thao tác hóa đơn" onClick={() => setMore(false)} className="fixed inset-0 z-40 cursor-default" />
          <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"><button type="button" disabled={settingsLoading} onClick={() => { setMore(false); onSync() }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-700 disabled:opacity-50"><i className="fa-solid fa-rotate text-violet-600" />Đồng bộ SePay</button></div>
        </>}
      </>}
      {!isMobile && <button type="button" className="flex items-center gap-2 rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white"><i className="fa-solid fa-file-export" />Xuất excel</button>}
    </div>
  </header>
}
