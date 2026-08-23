import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getCashTransactions,
  getContracts,
  getInvoices,
  getRooms,
  type CashTransaction,
  type Invoice,
  type Room
} from '../lib/db'
import revenueGrowthHero from '../assets/ai/revenue-growth-hero.png'
import { MarketDataPanel } from './MarketDataPanel'
import { RoomPricingPanel } from './RoomPricingPanel'

type OpportunityKind = 'renewal' | 'vacancy' | 'maintenance'
type AiSection = 'overview' | 'pricing' | 'occupancy' | 'costs' | 'forecast' | 'sources'
type Opportunity = {
  kind: OpportunityKind
  title: string
  description: string
  impact: string
  icon: string
  tone: 'emerald' | 'amber' | 'blue'
  rooms: Room[]
}

const AI_SECTIONS: Array<{ id: AiSection; label: string; description: string; icon: string }> = [
  {
    id: 'overview',
    label: 'Tổng quan',
    description: 'Cơ hội và đề xuất nổi bật',
    icon: 'fa-table-cells-large'
  },
  {
    id: 'pricing',
    label: 'Định giá phòng AI',
    description: 'So sánh và đề xuất giá',
    icon: 'fa-tags'
  },
  {
    id: 'occupancy',
    label: 'Doanh thu & lấp đầy',
    description: 'Hiệu suất khai thác phòng',
    icon: 'fa-chart-column'
  },
  {
    id: 'costs',
    label: 'Chi phí vận hành',
    description: 'Bảo trì và chi phí bất thường',
    icon: 'fa-screwdriver-wrench'
  },
  {
    id: 'forecast',
    label: 'Dự báo & cảnh báo',
    description: 'Tín hiệu cần theo dõi',
    icon: 'fa-bell'
  },
  {
    id: 'sources',
    label: 'Nguồn dữ liệu',
    description: 'Thu thập giá thị trường',
    icon: 'fa-database'
  }
]

function AiSidebar({
  activeSection,
  onChange
}: {
  activeSection: AiSection
  onChange: (section: AiSection) => void
}) {
  return (
    <aside className="hidden min-h-[calc(100vh-56px)] w-[238px] shrink-0 border-r border-slate-200 bg-white px-3 py-6 lg:block">
      <div className="px-3 pb-4">
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
          Trung tâm AI
        </p>
        <p className="mt-1 text-sm font-bold text-slate-700">Phân tích vận hành</p>
      </div>
      <nav className="space-y-1.5" aria-label="Điều hướng phân tích AI">
        {AI_SECTIONS.map((item) => {
          const isActive = activeSection === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`group flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${isActive ? 'bg-emerald-50 text-[#007A4D] shadow-[inset_0_0_0_1px_rgba(0,122,77,0.12)]' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-white text-[#007A4D] shadow-sm' : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:shadow-sm'}`}
              >
                <i className={`fa-solid ${item.icon}`} />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm ${isActive ? 'font-black' : 'font-bold'}`}>
                  {item.label}
                </span>
                <span
                  className={`mt-0.5 block text-[11px] leading-4 ${isActive ? 'text-emerald-700/70' : 'text-slate-400'}`}
                >
                  {item.description}
                </span>
              </span>
            </button>
          )
        })}
      </nav>
      <div className="mx-3 mt-6 rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
        <div className="flex items-center gap-2 text-xs font-black text-violet-700">
          <i className="fa-solid fa-wand-magic-sparkles" /> Trợ lý DeepSeek
        </div>
        <p className="mt-2 text-[11px] leading-4 text-violet-600">
          AI chỉ giải thích và đề xuất dựa trên dữ liệu đã được kiểm chứng.
        </p>
      </div>
    </aside>
  )
}

function MobileSectionNav({
  activeSection,
  onChange
}: {
  activeSection: AiSection
  onChange: (section: AiSection) => void
}) {
  return (
    <div className="mb-5 lg:hidden">
      <label className="block text-xs font-bold text-slate-500">
        Mục phân tích
        <select
          value={activeSection}
          onChange={(event) => onChange(event.target.value as AiSection)}
          className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-emerald-500"
        >
          {AI_SECTIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function SectionPlaceholder({
  section,
  rooms
}: {
  section: Exclude<AiSection, 'overview' | 'pricing' | 'sources'>
  rooms: Room[]
}) {
  const content = {
    occupancy: {
      title: 'Doanh thu & lấp đầy',
      description: 'Theo dõi doanh thu bỏ lỡ, số ngày phòng trống và cơ hội tăng tỷ lệ lấp đầy.',
      icon: 'fa-chart-column',
      action: 'Xem hiệu suất phòng'
    },
    costs: {
      title: 'Chi phí vận hành',
      description: 'Phát hiện phòng có chi phí bảo trì hoặc vận hành cao bất thường.',
      icon: 'fa-screwdriver-wrench',
      action: 'Phân tích chi phí'
    },
    forecast: {
      title: 'Dự báo & cảnh báo',
      description: 'Tổng hợp các tín hiệu cần theo dõi; công nợ chỉ là một cảnh báo phụ.',
      icon: 'fa-bell',
      action: 'Tạo dự báo mới'
    }
  }[section]

  return (
    <div>
      <header className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <i className={`fa-solid ${content.icon}`} />
          </span>
          <div>
            <h1 className="text-[26px] font-black tracking-[-0.04em] text-slate-950">
              {content.title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{content.description}</p>
          </div>
        </div>
      </header>
      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-xs font-bold text-emerald-700">Tổng số phòng</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{rooms.length}</p>
          </div>
          <div className="rounded-2xl bg-blue-50 p-4">
            <p className="text-xs font-bold text-blue-700">Đang cho thuê</p>
            <p className="mt-2 text-3xl font-black text-slate-950">
              {rooms.filter((room) => room.status === 'occupied').length}
            </p>
          </div>
          <div className="rounded-2xl bg-amber-50 p-4">
            <p className="text-xs font-bold text-amber-700">Đang trống</p>
            <p className="mt-2 text-3xl font-black text-slate-950">
              {rooms.filter((room) => room.status === 'vacant').length}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-xl text-violet-600 shadow-sm">
            <i className={`fa-solid ${content.icon}`} />
          </span>
          <h2 className="mt-4 text-lg font-black text-slate-900">{content.action}</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
            Dữ liệu nền đã được tách riêng. Luồng phân tích chi tiết sẽ sử dụng đúng phòng và nguồn
            dữ liệu do người dùng lựa chọn.
          </p>
        </div>
      </section>
    </div>
  )
}

function DataSourcesSection({ propertyAddress }: { propertyAddress: string }) {
  return (
    <div>
      <header className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <i className="fa-solid fa-database" />
          </span>
          <div>
            <h1 className="text-[26px] font-black tracking-[-0.04em] text-slate-950">
              Nguồn dữ liệu
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Thu thập và chuẩn hóa giá thị trường trước khi AI đề xuất giá phòng.
            </p>
          </div>
        </div>
      </header>
      <div className="mt-6">
        <MarketDataPanel propertyAddress={propertyAddress} />
      </div>
    </div>
  )
}

const fmt = (value: number) => new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))
const startOfDay = (value: Date | string) => {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
const daysUntil = (value?: string) => {
  if (!value) return null
  return Math.ceil((startOfDay(value).getTime() - startOfDay(new Date()).getTime()) / 86_400_000)
}
const outstandingAmount = (invoice: Invoice) =>
  Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0))
const getOpportunityTone = (tone: Opportunity['tone']) =>
  tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-600'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-600'
      : 'bg-blue-50 text-blue-600'

function DetailModal({
  opportunity,
  onClose,
  onNavigateToRooms
}: {
  opportunity: Opportunity
  onClose: () => void
  onNavigateToRooms?: () => void
}) {
  const actionLabel =
    opportunity.kind === 'renewal'
      ? 'Xem hợp đồng sắp gia hạn'
      : opportunity.kind === 'vacancy'
        ? 'Xem phòng đang trống'
        : 'Xem lịch sử bảo trì'
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex gap-3">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg ${getOpportunityTone(opportunity.tone)}`}
            >
              <i className={`fa-solid ${opportunity.icon}`} />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-900">{opportunity.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{opportunity.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-auto px-6 py-4">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">
            Phòng liên quan
          </p>
          <div className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100">
            {opportunity.rooms.map((room) => (
              <div key={room.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-black text-slate-800">{room.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {room.status === 'vacant' ? 'Đang trống' : room.tenant_name || 'Đang cho thuê'}
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-500">
                  {fmt(room.base_rent)} đ/tháng
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={onNavigateToRooms}
            className="flex-1 rounded-xl bg-[#007A4D] px-4 py-2.5 text-sm font-black text-white hover:bg-[#00633F]"
          >
            {actionLabel}
          </button>
        </div>
      </section>
    </div>
  )
}

export function AiAnalysisTab({
  onNavigateToRooms,
  propertyAddress = ''
}: {
  onNavigateToRooms?: () => void
  propertyAddress?: string
}) {
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })
  const { data: cashTransactions = [] } = useQuery({
    queryKey: ['cashTransactions'],
    queryFn: getCashTransactions
  })
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null)
  const [activeSection, setActiveSection] = useState<AiSection>('overview')
  const [periodLabel, setPeriodLabel] = useState('30 ngày tới')

  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms])
  const activeContracts = useMemo(
    () => contracts.filter((contract) => contract.status === 'active'),
    [contracts]
  )
  const expiringContracts = useMemo(
    () =>
      activeContracts.filter((contract) => {
        const days = daysUntil(contract.expiration_date)
        return days !== null && days >= 0 && days <= 30
      }),
    [activeContracts]
  )
  const vacantRooms = useMemo(() => rooms.filter((room) => room.status === 'vacant'), [rooms])
  const maintenanceRooms = useMemo(() => {
    const map = new Map<string, number>()
    cashTransactions
      .filter((item) => item.type === 'expense' && item.category === 'maintenance' && item.room_id)
      .forEach((item: CashTransaction) =>
        map.set(item.room_id!, (map.get(item.room_id!) || 0) + Number(item.amount || 0))
      )
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([roomId]) => roomById.get(roomId))
      .filter((room): room is Room => !!room)
  }, [cashTransactions, roomById])
  const debtSummary = useMemo(() => {
    const outstanding = invoices
      .filter((invoice) => !['cancelled', 'merged'].includes(invoice.payment_status))
      .reduce((sum, invoice) => sum + outstandingAmount(invoice), 0)
    const overdueCount = invoices.filter(
      (invoice) =>
        invoice.due_date &&
        outstandingAmount(invoice) > 0 &&
        startOfDay(invoice.due_date) < startOfDay(new Date())
    ).length
    return { outstanding, overdueCount }
  }, [invoices])
  const occupancy = rooms.length
    ? (rooms.filter((room) => room.status === 'occupied').length / rooms.length) * 100
    : 0
  const protectedRevenue = expiringContracts.reduce(
    (sum, contract) => sum + Number(contract.base_rent || 0),
    0
  )
  const maintenanceSpend = cashTransactions
    .filter((item) => item.type === 'expense' && item.category === 'maintenance')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const opportunities = useMemo<Opportunity[]>(
    () => [
      {
        kind: 'renewal',
        title: `${expiringContracts.length} hợp đồng sắp gia hạn`,
        description: expiringContracts.length
          ? 'Chủ động trao đổi để giữ khách tốt và cập nhật mức giá phù hợp.'
          : 'Chưa có hợp đồng nào hết hạn trong 30 ngày tới.',
        impact: expiringContracts.length
          ? `Bảo vệ ${fmt(protectedRevenue)} đ/tháng`
          : 'Lịch gia hạn ổn định',
        icon: 'fa-file-signature',
        tone: 'emerald',
        rooms: expiringContracts
          .map((contract) => roomById.get(contract.room_id))
          .filter((room): room is Room => !!room)
      },
      {
        kind: 'vacancy',
        title: `${vacantRooms.length} phòng đang trống`,
        description: vacantRooms.length
          ? 'Ưu tiên hiển thị và theo dõi ngày trống để hạn chế doanh thu bị bỏ lỡ.'
          : 'Tỷ lệ lấp đầy đang ở mức tốt.',
        impact: vacantRooms.length
          ? `Tiềm năng ${fmt(vacantRooms.reduce((sum, room) => sum + Number(room.base_rent || 0), 0))} đ/tháng`
          : `${occupancy.toFixed(1).replace('.', ',')}% lấp đầy`,
        icon: 'fa-door-open',
        tone: 'blue',
        rooms: vacantRooms
      },
      {
        kind: 'maintenance',
        title: `${maintenanceRooms.length} phòng cần tối ưu bảo trì`,
        description: maintenanceRooms.length
          ? 'Xem lại các phòng phát sinh chi phí sửa chữa cao để ưu tiên bảo trì phòng ngừa.'
          : 'Chưa có phòng nào phát sinh bảo trì cần theo dõi.',
        impact: maintenanceRooms.length
          ? `Đã chi ${fmt(maintenanceSpend)} đ`
          : 'Không có điểm nóng',
        icon: 'fa-screwdriver-wrench',
        tone: 'amber',
        rooms: maintenanceRooms
      }
    ],
    [
      expiringContracts,
      maintenanceRooms,
      maintenanceSpend,
      occupancy,
      protectedRevenue,
      roomById,
      vacantRooms
    ]
  )
  const leadingOpportunity =
    opportunities.find((item) => item.kind === 'renewal' && item.rooms.length > 0) ||
    opportunities.find((item) => item.rooms.length > 0) ||
    opportunities[0]

  return (
    <div className="min-h-full bg-[#f7faf8] text-slate-900">
      <div className="mx-auto flex max-w-[1760px]">
        <AiSidebar activeSection={activeSection} onChange={setActiveSection} />
        <div className="min-w-0 flex-1 px-5 py-6 sm:px-7 lg:px-8">
          <MobileSectionNav activeSection={activeSection} onChange={setActiveSection} />
          {activeSection === 'overview' ? (
            <>
              <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-lg text-violet-600">
                      <i className="fa-solid fa-wand-magic-sparkles" />
                    </span>
                    <div>
                      <h1 className="text-[26px] font-black tracking-[-0.04em] text-slate-950">
                        Trung tâm Phân tích AI
                      </h1>
                      <p className="mt-1 text-sm text-slate-500">
                        AI đồng hành để tối ưu vận hành và tăng dòng tiền.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-600 shadow-sm">
                    <i className="fa-regular fa-calendar text-slate-400" />
                    <select
                      value={periodLabel}
                      onChange={(event) => setPeriodLabel(event.target.value)}
                      className="bg-transparent outline-none"
                    >
                      <option>30 ngày tới</option>
                      <option>90 ngày tới</option>
                      <option>6 tháng tới</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setActiveSection('pricing')}
                    className="rounded-xl bg-[#007A4D] px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-[#00633F]"
                  >
                    <i className="fa-solid fa-sparkles mr-2" />
                    Phân tích mới
                  </button>
                </div>
              </header>
              <main className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_340px]">
                <section className="overflow-hidden rounded-3xl border border-[#cdebd9] bg-[#f1fbf5] shadow-[0_16px_36px_rgba(0,91,60,0.08)]">
                  <div className="grid min-h-[360px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="p-6 sm:p-8">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] text-emerald-700 shadow-sm">
                        <i className="fa-solid fa-sparkles" /> Cơ hội tốt nhất
                      </span>
                      <h2 className="mt-5 max-w-[570px] text-3xl font-black leading-tight tracking-[-0.04em] text-slate-950">
                        Cơ hội vận hành hôm nay
                      </h2>
                      <p className="mt-4 max-w-[540px] text-base leading-7 text-slate-600">
                        {leadingOpportunity.description}
                      </p>
                      <div className="mt-7 border-t border-emerald-200 pt-5">
                        <p className="text-xs font-bold text-slate-500">Tác động vận hành</p>
                        <p className="mt-1 text-3xl font-black tracking-[-0.04em] text-[#007A4D]">
                          {leadingOpportunity.impact}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          Theo dữ liệu nội bộ và lựa chọn kỳ {periodLabel.toLowerCase()}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSection('pricing')}
                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#007A4D] px-5 py-3 text-sm font-black text-white transition hover:bg-[#00633F]"
                      >
                        Xem đề xuất giá <i className="fa-solid fa-arrow-right" />
                      </button>
                    </div>
                    <div className="relative min-h-[260px] overflow-hidden lg:min-h-0">
                      <img
                        src={revenueGrowthHero}
                        alt="Minh họa tăng trưởng doanh thu"
                        className="h-full w-full object-cover object-center"
                      />
                    </div>
                  </div>
                </section>
                <aside className="space-y-5">
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                        <i className="fa-solid fa-circle-check text-lg" />
                      </span>
                      <div>
                        <h2 className="font-black text-slate-900">
                          Công nợ: {debtSummary.overdueCount > 0 ? 'cần theo dõi' : 'ổn định'}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">Tín hiệu vận hành phụ</p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      {debtSummary.overdueCount > 0
                        ? `${debtSummary.overdueCount} hóa đơn quá hạn, tổng cần theo dõi ${fmt(debtSummary.outstanding)} đ.`
                        : 'Không có hóa đơn quá hạn cần can thiệp ngay.'}
                    </p>
                    <button
                      type="button"
                      onClick={onNavigateToRooms}
                      className="mt-4 flex items-center gap-2 text-sm font-black text-[#007A4D] hover:text-[#00633F]"
                    >
                      Xem chi tiết công nợ <i className="fa-solid fa-arrow-right text-xs" />
                    </button>
                  </section>
                  <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-black text-slate-900">Giá thuê thị trường</h2>
                      <i className="fa-solid fa-circle-info text-slate-400" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-500">
                      Kết nối nguồn dữ liệu hợp lệ để AI so sánh giá thuê theo khu vực, diện tích và
                      tiện ích.
                    </p>
                    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-violet-50 px-3 py-3 text-sm font-bold text-violet-700">
                      <i className="fa-solid fa-plug-circle-xmark" /> Chưa kết nối nguồn
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection('sources')}
                      className="mt-4 flex items-center gap-2 text-sm font-black text-[#007A4D] hover:text-[#00633F]"
                    >
                      Thiết lập nguồn dữ liệu <i className="fa-solid fa-arrow-right text-xs" />
                    </button>
                  </section>
                </aside>
              </main>
              <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_340px]">
                <div>
                  <h2 className="text-xl font-black tracking-[-0.03em] text-slate-950">
                    Danh sách cơ hội theo mức ưu tiên
                  </h2>
                  <div className="mt-4 space-y-3">
                    {opportunities.map((opportunity, index) => (
                      <button
                        key={opportunity.kind}
                        type="button"
                        onClick={() => setSelectedOpportunity(opportunity)}
                        className="grid w-full grid-cols-[44px_minmax(0,1fr)_minmax(150px,0.5fr)_24px] items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                      >
                        <span
                          className={`flex h-11 w-11 items-center justify-center rounded-xl font-black ${getOpportunityTone(opportunity.tone)}`}
                        >
                          {index + 1}
                        </span>
                        <span className="flex min-w-0 items-center gap-3">
                          <i
                            className={`fa-solid ${opportunity.icon} text-lg ${opportunity.tone === 'emerald' ? 'text-emerald-600' : opportunity.tone === 'amber' ? 'text-amber-500' : 'text-blue-600'}`}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-slate-800">
                              {opportunity.title}
                            </span>
                            <span className="mt-1 block truncate text-xs text-slate-500">
                              {opportunity.description}
                            </span>
                          </span>
                        </span>
                        <span
                          className={`text-right text-sm font-black ${opportunity.tone === 'emerald' ? 'text-emerald-700' : opportunity.tone === 'amber' ? 'text-amber-600' : 'text-blue-700'}`}
                        >
                          {opportunity.impact}
                        </span>
                        <i className="fa-solid fa-chevron-right text-xs text-slate-400" />
                      </button>
                    ))}
                  </div>
                </div>
                <section className="rounded-3xl border border-violet-200 bg-violet-50/50 p-5 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm">
                    <i className="fa-solid fa-wand-magic-sparkles text-lg" />
                  </div>
                  <h2 className="mt-4 text-lg font-black text-slate-950">
                    AI sẽ làm gì tiếp theo?
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Khi kết nối DeepSeek an toàn ở máy chủ, AI sẽ diễn giải số liệu, trả lời câu hỏi
                    tự nhiên và nêu rõ bằng chứng cho từng đề xuất.
                  </p>
                  <div className="mt-5 border-t border-violet-200 pt-4 text-xs font-bold leading-5 text-violet-800">
                    Dữ liệu thị trường được quản lý riêng để mọi đề xuất giá thuê đều có nguồn và
                    mức độ tin cậy.
                  </div>
                </section>
              </section>
            </>
          ) : activeSection === 'pricing' ? (
            <RoomPricingPanel
              rooms={rooms}
              propertyAddress={propertyAddress}
              onNavigateToSources={() => setActiveSection('sources')}
              onNavigateToRooms={onNavigateToRooms}
            />
          ) : activeSection === 'sources' ? (
            <DataSourcesSection propertyAddress={propertyAddress} />
          ) : (
            <SectionPlaceholder section={activeSection} rooms={rooms} />
          )}
        </div>
      </div>
      {selectedOpportunity && (
        <DetailModal
          opportunity={selectedOpportunity}
          onClose={() => setSelectedOpportunity(null)}
          onNavigateToRooms={onNavigateToRooms}
        />
      )}
    </div>
  )
}
