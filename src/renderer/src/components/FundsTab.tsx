import { useMemo, useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  PieChart,
  Plus,
  ReceiptText,
  Search
} from 'lucide-react'
import jarAmberImage from '../assets/financial-jar-amber.png'
import jarCoralImage from '../assets/financial-jar-coral.png'
import jarEmeraldImage from '../assets/financial-jar-emerald.png'
import {
  DEFAULT_EXPENSE_CATEGORIES,
  getAppSettings,
  getCashTransactions,
  getInvoicePaymentRecords,
  getInvoices,
  getRooms
} from '../lib/db'

type FundRow = {
  id: string
  date: string
  title: string
  subtitle: string
  amount: number
  type: 'income' | 'expense'
  paymentMethod: string
}

const formatVND = (value: number): string =>
  `${new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))} đ`

const formatDate = (value: string): string => {
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

const bankNames: Record<string, string> = {
  VCB: 'Vietcombank',
  TCB: 'Techcombank',
  BIDV: 'BIDV',
  AGRIBANK: 'Agribank',
  MB: 'MB Bank',
  ACB: 'ACB',
  VPBANK: 'VPBank',
  SACOMBANK: 'Sacombank',
  EXIMBANK: 'Eximbank'
}

export function FundsTab(): ReactElement {
  const [selectedJar, setSelectedJar] = useState('Sinh hoạt')
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [search, setSearch] = useState('')

  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ['cashTransactions'],
    queryFn: getCashTransactions
  })
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: getInvoices
  })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: appSettings } = useQuery({ queryKey: ['appSettings'], queryFn: getAppSettings })

  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room.name])), [rooms])
  const categoryMap = useMemo(
    () => new Map(DEFAULT_EXPENSE_CATEGORIES.map((item) => [item.value, item.name])),
    []
  )
  const rows = useMemo<FundRow[]>(() => {
    const invoiceRows = invoices
      .filter(
        (invoice) => invoice.payment_status !== 'cancelled' && invoice.payment_status !== 'merged'
      )
      .flatMap((invoice) =>
        getInvoicePaymentRecords(invoice).map((record) => ({
          id: `invoice-${invoice.id}-${record.id}`,
          date: record.payment_date,
          title: `Thu tiền phòng · ${roomById.get(invoice.room_id) || 'Không xác định'}`,
          subtitle: record.note || 'Thu tiền phòng',
          amount: Number(record.amount) || 0,
          type: 'income' as const,
          paymentMethod: record.payment_method || 'transfer'
        }))
      )
    const manualRows = transactions.map((item) => ({
      id: `cash-${item.id}`,
      date: item.transaction_date,
      title:
        categoryMap.get(item.category) ||
        (item.type === 'income' ? 'Khoản thu khác' : 'Chi phí vận hành'),
      subtitle: item.note || 'Giao dịch ghi nhận thủ công',
      amount: Number(item.amount) || 0,
      type: item.type,
      paymentMethod: item.payment_method || 'transfer'
    }))
    return [...invoiceRows, ...manualRows].sort(
      (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
    )
  }, [categoryMap, invoices, roomById, transactions])

  const openingDate = appSettings?.opening_balance_date || ''
  const openingBank = Number(appSettings?.opening_balance_bank || 0)
  const openingCash = Number(appSettings?.opening_balance_cash || 0)
  const ledgerRows = rows.filter((row) => !openingDate || row.date >= openingDate)
  const availableBalance = Math.max(
    0,
    ledgerRows.reduce(
      (sum, row) => sum + (row.type === 'income' ? row.amount : -row.amount),
      openingBank + openingCash
    )
  )
  const bankName = appSettings?.bank_id
    ? bankNames[appSettings.bank_id] || appSettings.bank_id
    : 'Tài khoản ngân hàng'
  const allocations = [
    {
      label: 'Sinh hoạt',
      amount: availableBalance * 0.3,
      note: 'Chi tiêu sinh hoạt hàng ngày',
      image: jarEmeraldImage,
      icon: 'fa-house'
    },
    {
      label: 'Trả nợ',
      amount: availableBalance * 0.2,
      note: 'Thanh toán các khoản nợ',
      image: jarCoralImage,
      icon: 'fa-coins'
    },
    {
      label: 'Bảo trì',
      amount: availableBalance * 0.15,
      note: 'Sửa chữa và bảo trì tài sản',
      image: jarAmberImage,
      icon: 'fa-screwdriver-wrench'
    },
    {
      label: 'Dự phòng',
      amount: availableBalance * 0.2,
      note: 'Quỹ dự phòng rủi ro',
      image: jarEmeraldImage,
      icon: 'fa-shield-halved'
    },
    {
      label: 'Tái đầu tư',
      amount: availableBalance * 0.15,
      note: 'Nâng cấp, sửa chữa, mở rộng',
      image: jarAmberImage,
      icon: 'fa-chart-column'
    }
  ]
  const query = search.trim().toLocaleLowerCase('vi-VN')
  const filteredRows = rows.filter(
    (row) =>
      (selectedMonth === 'all' || row.date.startsWith(selectedMonth)) &&
      (!query || `${row.title} ${row.subtitle}`.toLocaleLowerCase('vi-VN').includes(query))
  )
  const selectedAllocation = allocations.find((item) => item.label === selectedJar) || allocations[0]
  const isLoading = transactionsLoading || invoicesLoading
  const allocationDateLabel = new Intl.DateTimeFormat('vi-VN').format(new Date())

  return (
    <div className="flex-1 overflow-y-auto bg-[#F5F9F7] p-4">
      <div className="mx-auto min-w-[1120px] max-w-[1540px] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#008F68]">
              Tài chính &amp; kế hoạch
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#12372A]">Hũ tài chính</h1>
            <p className="mt-1 text-xs text-slate-500">
              Chia tiền hiện có thành các mục tiêu rõ ràng trước khi chi tiêu và tái đầu tư.
            </p>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm">
            <CalendarDays size={16} className="text-[#007A4D]" />
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="bg-transparent outline-none"
              aria-label="Chọn tháng xem hũ tài chính"
            >
              <option value="all">Toàn thời gian</option>
              {Array.from({ length: 12 }, (_, index) => {
                const date = new Date(new Date().getFullYear(), new Date().getMonth() - index, 1)
                const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                return <option key={value} value={value}>{`Tháng ${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`}</option>
              })}
            </select>
            <ChevronDown size={14} className="text-slate-400" />
          </label>
        </div>

        <section className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Tiền hiện có</div>
            <div className="mt-1 text-4xl font-black tracking-tight tabular-nums text-[#007A5A]">
              {formatVND(availableBalance)}
            </div>
          </div>
          <div className="text-right text-xs font-bold leading-5 text-slate-500">
            <div>Hôm nay, {allocationDateLabel}</div>
            <div className="text-[#008F68]">Phân bổ nội bộ — không phải chi phí</div>
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-base font-black text-[#12372A]">
                <PieChart size={20} className="text-[#008F68]" />
                Phân bổ theo hũ
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Tổng ngân sách phân bổ: {formatVND(availableBalance)}</p>
            </div>
            <button type="button" onClick={() => setSelectedJar('Sinh hoạt')} className="flex items-center gap-2 rounded-xl bg-[#008F68] px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-[#007653]"><Plus size={15} />Phân bổ vào hũ</button>
          </div>
          <div className="mt-6 grid grid-cols-5 gap-3">
            {allocations.map((item) => {
              const isSelected = selectedJar === item.label
              return (
                <button key={item.label} type="button" aria-pressed={isSelected} onClick={() => setSelectedJar(item.label)} className={`group rounded-2xl border px-2 pb-3 pt-2 text-center transition ${isSelected ? 'border-[#17A673] bg-[#F3FCF8] shadow-[0_0_0_3px_rgba(23,166,115,.1)]' : 'border-transparent hover:border-emerald-100 hover:bg-emerald-50/40'}`}>
                  <div className="relative mx-auto h-[280px] w-full max-w-[215px] overflow-hidden rounded-xl">
                    <img src={item.image} alt="" className="h-full w-full scale-[1.08] object-contain mix-blend-multiply transition duration-300 group-hover:scale-[1.12]" />
                    <span className="absolute left-1/2 top-[54%] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/75 text-[#12372A] shadow-sm backdrop-blur-sm"><i className={`fa-solid ${item.icon} text-xs`} /></span>
                    <span className="absolute inset-x-0 bottom-[12%] px-2 text-center drop-shadow-[0_1px_2px_rgba(255,255,255,.95)]"><span className="block truncate text-[13px] font-black text-[#12372A]">{item.label}</span><span className="mt-0.5 block truncate text-[13px] font-black tabular-nums text-[#007A5A]">{formatVND(item.amount)}</span></span>
                  </div>
                  <span className="mt-1 block truncate text-[10px] font-bold text-slate-500">{Math.round((item.amount / Math.max(availableBalance, 1)) * 100)}% kế hoạch</span>
                </button>
              )
            })}
          </div>
          <div className="mt-5 flex items-center justify-between rounded-xl border border-emerald-100 bg-[#F3FCF8] px-4 py-3">
            <div><div className="text-xs font-black text-[#12372A]">Hũ {selectedAllocation.label}</div><div className="mt-0.5 text-[10px] text-slate-500">{selectedAllocation.note}</div></div>
            <div className="text-sm font-black tabular-nums text-[#008F68]">{formatVND(selectedAllocation.amount)}</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2 text-base font-black text-[#12372A]"><ReceiptText size={19} className="text-[#008F68]" />Hoạt động phân bổ gần đây</div><button type="button" className="flex items-center gap-1 text-xs font-black text-[#008F68]">Xem tất cả <ChevronRight size={14} /></button></div>
          <div className="border-b border-slate-100 px-4 py-3"><label className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50"><Search size={14} className="ml-3 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm giao dịch..." className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none placeholder:text-slate-400" /></label></div>
          {isLoading ? <div className="flex h-40 items-center justify-center text-xs font-bold text-[#008F68]">Đang tổng hợp hoạt động...</div> : filteredRows.length === 0 ? <div className="flex h-40 items-center justify-center text-xs text-slate-400">Chưa có hoạt động phân bổ.</div> : <div className="divide-y divide-slate-100">{filteredRows.slice(0, 5).map((row) => <div key={row.id} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 px-5 py-3"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${row.type === 'income' ? 'bg-emerald-50 text-[#008F68]' : 'bg-red-50 text-[#E04444]'}`}>{row.type === 'income' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div className="min-w-0"><div className="truncate text-xs font-black text-[#12372A]">{row.title}</div><div className="truncate text-[10px] text-slate-500">{formatDate(row.date)} · {row.paymentMethod === 'cash' ? 'Tiền mặt tại quỹ' : `${bankName} · Sepay`}</div></div><div className={`text-xs font-black tabular-nums ${row.type === 'income' ? 'text-[#008F68]' : 'text-[#E04444]'}`}>{row.type === 'income' ? '+' : '−'}{formatVND(row.amount)}</div></div>)}</div>}
        </section>
      </div>
    </div>
  )
}
