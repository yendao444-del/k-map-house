import { useState } from 'react'
import { Plus } from 'lucide-react'
import { MobileRooms } from '../components/MobileRooms'
import { MobileNavigation, type MobileTab } from '../components/MobileNavigation'
import type { Room, Invoice, ActiveContractListItem } from '../lib/db'
import logo from '../assets/an_khang_home_logo.png'

// DEV ONLY component test surface. It never creates an Auth session, calls a
// backend, or appears in production; it renders the actual room/nav components.
const names = ['151', '152', '161', '221', '222', '231', '232']
const rents = [2900000, 3000000, 3000000, 2400000, 2500000, 2600000, 2600000]
const debts = [3551000, 8584000, 3081000, 2534400, 0, 0, 3286000]
const rooms = names.map((name, index) => ({ id: name, name, floor: Number(name[0]), base_rent: rents[index], status: 'occupied', created_at: '2026-09-01', max_occupants: 2 } as Room))
const contracts = new Map(rooms.map(room => [room.id, { id: `contract-${room.id}`, room_id: room.id, tenant_id: `tenant-${room.id}`, occupant_count: 2, move_in_date: '2026-09-01', created_at: '2026-09-01', status: 'active' } as ActiveContractListItem]))
const invoices = new Map(rooms.map((room, index) => [room.id, [{ id: `invoice-${room.id}`, room_id: room.id, tenant_id: `tenant-${room.id}`, month: 10, year: 2026, total_amount: debts[index] || room.base_rent, paid_amount: debts[index] ? 0 : room.base_rent, payment_status: debts[index] ? 'unpaid' : 'paid', created_at: '2026-10-01' } as Invoice]]))
export default function RoomVisualHarness(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ occupied: false, vacant: false, ending: false, expiring: false })
  const [activeTab, setActiveTab] = useState<MobileTab>('rooms')
  const [notice, setNotice] = useState('')
  const [listState, setListState] = useState(new URLSearchParams(window.location.search).get('state') || '')
  const all = [...rooms, ...Array.from({ length: 17 }, (_, index) => ({ ...rooms[0], id: `other-${index}`, name: `Khác ${index + 1}`, status: index < 3 ? 'vacant' : 'occupied' } as Room))]
  const filtered = rooms.filter(room => (!search.trim() || room.name.includes(search.trim())) && (!Object.values(filters).some(Boolean) || filters.occupied))
  return <div className="pwa-app flex flex-col overflow-hidden">
    <header className="pwa-app-header flex shrink-0 items-center justify-between border-b border-[#e5eee8] bg-white"><div className="flex items-center"><div className="flex items-center"><div className="investment-titlebar-logo border border-[#e5eee8] bg-white p-1"><img src={logo} alt="AN KHANG HOME" className="h-full w-full object-contain" /></div><div className="flex flex-col leading-none"><span className="investment-titlebar-brand">AN KHANG HOME</span><span className="investment-titlebar-subtitle">QUẢN LÝ PHÒNG TRỌ</span></div></div></div><button type="button" className="pwa-add-room" onClick={() => setNotice('Thêm phòng: kiểm tra mở biểu mẫu riêng trong luồng tích hợp.')}><Plus size={18} />Thêm phòng</button></header>
    <div className="pwa-main-content flex min-h-0 flex-1 flex-col overflow-hidden">
      {activeTab === 'rooms' ? <MobileRooms rooms={all} filteredRooms={filtered} contractsByRoom={contracts} invoicesByRoom={invoices} filters={filters} search={search} loading={listState === 'loading'} error={listState === 'error' ? 'Lỗi kết nối thử nghiệm' : ''} onSearch={setSearch} onFilter={key => setFilters(previous => ({ ...previous, [key]: !previous[key] }))} onAll={() => setFilters({ occupied: false, vacant: false, ending: false, expiring: false })} onRetry={() => setListState('')} onAdd={() => setNotice('Thêm phòng')} onOpen={room => setNotice(`Mở chi tiết phòng ${room.name}`)} onFinance={(room, invoice) => setNotice(invoice ? `Mở thanh toán hóa đơn ${invoice.id}` : `Mở chi tiết phòng ${room.name}`)} /> : <div className="pwa-list-state"><h1>{activeTab}</h1><p>Kiểm tra điều hướng component; không đại diện cho nghiệp vụ đã nghiệm thu.</p></div>}
    </div>
    {notice && <div role="dialog" aria-modal="true" aria-label="Kết quả thao tác thử nghiệm" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-6"><section className="rounded-xl bg-white p-6"><p>{notice}</p><button type="button" className="mt-4 rounded-lg bg-primary px-4 py-2 text-white" onClick={() => setNotice('')}>Đóng</button></section></div>}
    <MobileNavigation activeTab={activeTab} onNavigate={({ tab }) => setActiveTab(tab)} />
  </div>
}
