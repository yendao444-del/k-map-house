import { Search, ChevronRight, Circle, Plus } from 'lucide-react'
import type { Room, Invoice, ActiveContractListItem } from '../lib/db'
import { getMobileRoomFinance } from '../lib/mobile-room-finance'
type Filters = { occupied: boolean; vacant: boolean; ending: boolean; expiring: boolean }
const currency = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`

export function MobileRooms({ rooms, filteredRooms, invoicesByRoom, contractsByRoom, filters, search, loading, error, onSearch, onFilter, onAll, onRetry, onOpen, onFinance, onAdd }: {
  rooms: Room[]; filteredRooms: Room[]; invoicesByRoom: Map<string, Invoice[]>; contractsByRoom: Map<string, ActiveContractListItem>;
  filters: Filters; search: string; loading: boolean; error: string;
  onSearch: (query: string) => void; onFilter: (key: keyof Filters) => void; onAll: () => void; onRetry: () => void;
  onOpen: (room: Room) => void; onFinance: (room: Room, invoice?: Invoice) => void; onAdd: () => void
}): React.JSX.Element {
  const filterItems: Array<{ key: keyof Filters; label: string; className: string }> = [
    { key: 'occupied', label: 'Đang ở', className: 'occupied' }, { key: 'vacant', label: 'Đang trống', className: 'vacant' },
    { key: 'ending', label: 'Sắp chuyển', className: 'ending' }, { key: 'expiring', label: 'Hết hạn', className: 'expiring' }
  ]
  const noFilters = !Object.values(filters).some(Boolean)
  return <section className="pwa-mobile-rooms" aria-label="Danh sách phòng">
    <div className="pwa-room-heading">
      <div className="pwa-room-heading-line"><span className="pwa-heading-icon"><i className="fa-solid fa-house" aria-hidden="true" /></span><div><h1>Danh sách phòng</h1><p>{rooms.length} phòng <span>·</span> <strong>{rooms.filter(room => room.status === 'occupied').length} đang ở</strong> <span>·</span> {rooms.filter(room => room.status === 'vacant').length} trống</p></div></div>
      <div className="pwa-room-search"><label><Search size={19} /><input type="search" aria-label="Tìm kiếm số phòng" value={search} onChange={event => onSearch(event.target.value)} placeholder="Tìm kiếm số phòng..." /></label><button type="button" aria-label="Đặt lại bộ lọc" onClick={onAll}><i className="fa-solid fa-filter" aria-hidden="true" /></button></div>
    </div>
    <div className="pwa-room-filters" aria-label="Lọc trạng thái phòng"><button type="button" aria-pressed={noFilters} className={noFilters ? 'selected' : ''} onClick={onAll}>Tất cả</button>{filterItems.map(item => <button type="button" key={item.key} aria-pressed={filters[item.key]} className={`${item.className} ${filters[item.key] ? 'selected' : ''}`} onClick={() => onFilter(item.key)}><Circle size={8} fill="currentColor" />{item.label}</button>)}</div>
    {error ? <div role="alert" className="pwa-list-state"><h2>Chưa tải được danh sách</h2><p>{error}</p><button type="button" onClick={onRetry}>Thử lại</button></div>
      : loading ? <div role="status" className="pwa-list-state">Đang tải phòng và tình trạng thu tiền…</div>
      : filteredRooms.length === 0 ? <div className="pwa-list-state"><h2>{rooms.length ? 'Không tìm thấy phòng phù hợp' : 'Chưa có phòng'}</h2><p>{rooms.length ? 'Thử thay đổi tìm kiếm hoặc bộ lọc.' : 'Thêm phòng đầu tiên để bắt đầu quản lý.'}</p><button type="button" onClick={rooms.length ? () => { onSearch(''); onAll() } : onAdd}>{rooms.length ? 'Xóa tìm kiếm và bộ lọc' : <><Plus size={16} /> Thêm phòng</>}</button></div>
      : <div className="pwa-room-list">{filteredRooms.map(room => {
        const contract = contractsByRoom.get(room.id)
        const finance = getMobileRoomFinance(room, contract, invoicesByRoom.get(room.id) || [])
        const statusLabel = room.status === 'vacant' ? 'Đang trống' : room.status === 'ending' ? 'Sắp chuyển' : room.status === 'maintenance' ? 'Bảo trì' : 'Đang ở'
        return <article key={room.id} className="pwa-room-row">
          <button type="button" className="pwa-room-identity" onClick={() => onOpen(room)} aria-label={`Xem ${room.name}`}>
            <span className={`pwa-room-icon ${room.status}`}><i className="fa-solid fa-building" aria-hidden="true" /></span>
            <span className="pwa-room-info"><strong>{/^phòng\s/i.test(room.name) ? room.name : `Phòng ${room.name}`}</strong><span className={`pwa-room-occupancy ${room.status}`}><Circle size={7} fill="currentColor" />{statusLabel}{contract && <><span className="pwa-room-separator">·</span><span className="pwa-room-people">{contract.occupant_count || 1} người</span></>}</span><b>{currency(room.base_rent)}</b></span>
          </button>
          <button type="button" className={`pwa-room-finance ${finance.kind}`} onClick={() => onFinance(room, finance.invoice)} aria-label={`${room.name}: ${finance.label}${finance.balance ? `, ${currency(finance.balance)}` : ''}`}>
            <span><Circle size={7} fill="currentColor" />{finance.label}</span>{finance.balance > 0 && <b>{currency(finance.balance)}</b>}
            {finance.totalDebt > 0 && finance.totalDebt !== finance.balance && <small>Tổng nợ {currency(finance.totalDebt)}</small>}
          </button>
          <button type="button" className="pwa-room-chevron" aria-label={`Mở chi tiết ${room.name}`} onClick={() => onOpen(room)}><ChevronRight size={21} /></button>
        </article>
      })}</div>}
  </section>
}
