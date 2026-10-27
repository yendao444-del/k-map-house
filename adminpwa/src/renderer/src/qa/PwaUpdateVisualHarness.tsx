import { useState } from 'react'
import { Bell, Settings, Home, FileText, Users } from 'lucide-react'
import { PwaUpdateStatus } from '../components/PwaStatus'
import logo from '../assets/logo_navbar.png'

// DEV-only fixture; no Auth session, customer records or service worker mutation.
export default function PwaUpdateVisualHarness(): React.JSX.Element {
  const params = new URLSearchParams(window.location.search)
  const [update, setUpdate] = useState(params.get('state') !== 'current')
  const [actions, setActions] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const rows = ['151', '241', '242', '252', '261', '262', '321', '341', '342', '999', '141', '142', '152']
  const act = () => setActions(value => value + 1)
  return <>
    <div className="pwa-app flex flex-col overflow-hidden bg-gray-50 text-sm text-slate-800">
      <header className="pwa-app-header flex h-14 shrink-0 items-center justify-between border-b bg-white px-4">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2"><img src={logo} alt="AN KHANG HOME" className="h-8 w-8 object-contain" /><div><b className="investment-titlebar-brand text-xs">AN KHANG HOME</b><p className="investment-titlebar-subtitle text-[9px] text-slate-500">QUẢN LÝ PHÒNG TRỌ</p></div></div>
          <nav className="pwa-desktop-nav flex gap-3"><button className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-white" onClick={act}><Home size={16} />Phòng</button><button className="flex items-center gap-2" onClick={act}><FileText size={16} />Hóa đơn</button><button className="flex items-center gap-2" onClick={act}><Users size={16} />Quản lý cho thuê</button></nav>
        </div>
        <div className="flex items-center gap-4"><button aria-label="Thông báo" onClick={act}><Bell size={18} /></button><button aria-label="Cài đặt" onClick={act}><Settings size={18} /></button><button className="h-8 w-8 rounded-lg bg-emerald-50 text-xs font-bold" onClick={act}>AK</button></div>
      </header>
      <main className="flex-1 overflow-auto p-4">
        <div className="mb-3 rounded-lg border border-red-100 bg-red-50 p-3 text-xs text-red-600">Đến kỳ lập hóa đơn!<p className="mt-1 text-[10px]">Có 1 phòng cần lập hóa đơn của tháng 10/2026.</p></div>
        <section className="rounded-xl border border-slate-100 bg-white">
          <div className="flex items-center justify-between p-4"><div><h1 className="font-bold">Danh sách phòng</h1><p className="text-[10px] text-slate-500">Hệ thống đang quản lý 25 phòng tại AN KHANG HOME</p></div><button className="rounded-lg bg-emerald-500 px-3 py-2 text-xs text-white" onClick={act}>Thêm phòng</button></div>
          <div className="flex items-center justify-between gap-4 px-4 pb-4"><button className="rounded-lg bg-emerald-500 px-3 py-1 text-xs text-white" onClick={act}>Tất cả</button><input className="rounded-lg border px-3 py-2 text-xs" placeholder="Tìm kiếm số phòng..." aria-label="Tìm kiếm số phòng" /></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-[11px]"><thead className="border-b text-[9px] text-slate-500"><tr>{['TÊN PHÒNG','GIÁ THUÊ','PHÍ DV','TIỀN CỌC','TỔNG NỢ','KỲ THUÊ','NGÀY VÀO','TÌNH TRẠNG','TÀI CHÍNH'].map(label => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{rows.map((room, index) => <tr key={room} className="border-b border-slate-50"><td className="px-4 py-3 font-semibold">Phòng {room}</td><td className="px-4 font-semibold">2.900.000 đ</td><td className="px-4"><span className="rounded bg-violet-50 px-2 py-1 text-violet-600">120.000 đ</span></td><td className="px-4 font-semibold">2.800.000 đ</td><td className="px-4 text-red-500">{index < 9 ? '3.551.000 đ' : '0 đ'}</td><td className="px-4">2 người</td><td className="px-4">06/05/2026</td><td className="px-4"><span className="rounded-full bg-emerald-500 px-2 py-1 text-[9px] text-white">ĐANG Ở</span></td><td className="px-4"><button className={`rounded px-3 py-1 text-[9px] font-bold text-white ${index < 9 ? 'bg-orange-500' : 'bg-emerald-500'}`} onClick={act}>{index < 9 ? 'CHƯA THU THÁNG 10' : 'ĐÃ THU'}</button></td></tr>)}</tbody></table></div>
        </section>
        <output data-testid="fixture-actions">Thao tác thử nghiệm: {actions}</output>
      </main>
    </div>
    <PwaUpdateStatus offline={params.get('state') === 'offline'} update={update} installUpdate={async () => {
      setAttempts(value => value + 1)
      await new Promise(resolve => window.setTimeout(resolve, 700))
      if (params.get('state') === 'error' && attempts === 0) return { success: false, error: 'Không thể áp dụng bản cập nhật. Vui lòng thử lại.' }
      setUpdate(false)
      return { success: true, data: { version: 'fixture', latestVersion: 'fixture-new', applied: true } }
    }} />
  </>
}
