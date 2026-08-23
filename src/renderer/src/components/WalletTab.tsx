import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  FileSearch,
  History,
  Search,
  X,
  TrendingUp
} from 'lucide-react'
import {
  DEFAULT_EXPENSE_CATEGORIES,
  getCashTransactions,
  getInvoicePaymentRecords,
  getInvoices,
  getRooms,
  type CashTransactionType
} from '../lib/db'
import walletHeroGreen from '../assets/wallet-hero-green.png'

type WalletRow = {
  id: string
  type: CashTransactionType
  date: string
  title: string
  subtitle: string
  amount: number
  icon: string
  source: 'invoice' | 'manual'
  category: string
  roomName: string
  paymentMethod: string
  note: string
  reference: string
  createdAt: string
}

type HistoryRange = 1 | 3 | 6 | 'all'

const formatVND = (value: number) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(Number(value) || 0))

const formatDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

const formatDateTime = (value: string) => {
  if (!value) return 'Không ghi nhận'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date)
}

const categoryMeta = new Map(
  DEFAULT_EXPENSE_CATEGORIES.map((item) => [
    item.value,
    {
      label: item.name
        .replace('Hóa đơn ', '')
        .replace(' tổng', '')
        .replace(' / wifi', '')
        .replace(' / môi trường', ''),
      icon: item.icon || 'fa-receipt'
    }
  ])
)

const makeMonthOptions = () => {
  const now = new Date()
  return Array.from({ length: 24 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return {
      value,
      label: `Tháng ${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
    }
  })
}

function LedgerSide({
  type,
  rows,
  total,
  onSelectRow
}: {
  type: CashTransactionType
  rows: WalletRow[]
  total: number
  onSelectRow: (row: WalletRow) => void
}) {
  const isIncome = type === 'income'
  const accent = isIncome ? 'text-[#008F5A]' : 'text-[#E04444]'

  return (
    <section className="flex min-w-[430px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
        <div className={`flex items-center gap-3 text-xl font-black ${accent}`}>
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${isIncome ? 'bg-[#008F5A]' : 'bg-[#E04444]'}`}
          >
            {isIncome ? (
              <ArrowDown size={20} strokeWidth={2.5} />
            ) : (
              <ArrowUp size={20} strokeWidth={2.5} />
            )}
          </span>
          {isIncome ? 'Tiền vào' : 'Tiền ra'}
        </div>
        <div className={`text-xl font-black tabular-nums ${accent}`}>{formatVND(total)} đ</div>
      </div>

      <div className="grid grid-cols-[118px_1fr_128px] border-b border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-500">
        <span>Ngày</span>
        <span>Nội dung</span>
        <span className="text-right">Số tiền</span>
      </div>

      <div className="max-h-[520px] min-h-[352px] flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain">
        {rows.length ? (
          rows.map((row) => (
            <button
              type="button"
              key={row.id}
              onClick={() => onSelectRow(row)}
              className="grid min-h-[54px] w-full grid-cols-[118px_1fr_128px] items-center px-4 py-2 text-left transition-colors hover:bg-[#F4F8F6] focus:bg-emerald-50 focus:outline-none"
            >
              <span className="text-sm font-medium text-slate-500">{formatDate(row.date)}</span>
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${isIncome ? 'border-emerald-100 bg-emerald-50 text-[#008F5A]' : 'border-red-100 bg-red-50 text-[#E04444]'}`}
                >
                  <i className={`fa-solid ${row.icon} text-sm`} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-800">{row.title}</div>
                  <div className="truncate text-xs text-slate-500">{row.subtitle}</div>
                </div>
              </div>
              <span className={`text-right text-sm font-black tabular-nums ${accent}`}>
                {isIncome ? '' : '-'}
                {formatVND(row.amount)} đ
              </span>
            </button>
          ))
        ) : (
          <div className="flex h-[352px] flex-col items-center justify-center gap-2 text-center text-slate-400">
            <i className="fa-regular fa-folder-open text-3xl" />
            <div className="text-sm font-semibold">Chưa có giao dịch trong kỳ này</div>
          </div>
        )}
      </div>

      <div className="flex h-12 items-center justify-between border-t border-slate-200 px-4">
        <div>
          <div className="text-sm font-bold text-slate-800">Tổng cộng</div>
          <div className="text-[10px] font-semibold text-slate-400">{rows.length} giao dịch</div>
        </div>
        <span className={`text-base font-black tabular-nums ${accent}`}>{formatVND(total)} đ</span>
      </div>
    </section>
  )
}

export function WalletTab({
  onRecordTransaction,
  onReconcile
}: {
  onRecordTransaction: () => void
  onReconcile: () => void
}) {
  const monthOptions = useMemo(makeMonthOptions, [])
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.value || '')
  const [historyRange, setHistoryRange] = useState<HistoryRange>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRow, setSelectedRow] = useState<WalletRow | null>(null)
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ['cashTransactions'],
    queryFn: getCashTransactions
  })
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: getInvoices
  })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })

  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room.name])), [rooms])

  const allRows = useMemo<WalletRow[]>(() => {
    const invoiceRows = invoices
      .filter(
        (invoice) => invoice.payment_status !== 'cancelled' && invoice.payment_status !== 'merged'
      )
      .flatMap((invoice) =>
        getInvoicePaymentRecords(invoice).map((record) => ({
          id: `wallet-invoice-${invoice.id}-${record.id}`,
          type: 'income' as const,
          date: record.payment_date,
          title: `Thu tiền phòng ${roomById.get(invoice.room_id) || ''}`.trim(),
          subtitle:
            record.note ||
            `Thanh toán tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`,
          amount: Number(record.amount) || 0,
          icon: 'fa-door-open',
          source: 'invoice' as const,
          category: 'Thu tiền phòng',
          roomName: roomById.get(invoice.room_id) || 'Không xác định',
          paymentMethod:
            record.payment_method === 'cash'
              ? 'Tiền mặt'
              : record.payment_method === 'transfer'
                ? 'Chuyển khoản'
                : 'Không ghi nhận',
          note: record.note || '',
          reference: record.external_ref || record.external_id || record.id,
          createdAt: record.created_at || invoice.created_at
        }))
      )

    const manualRows = transactions.map((item) => {
      const meta = categoryMeta.get(item.category)
      const roomName = item.room_id ? roomById.get(item.room_id) : ''
      const fallbackTitle = item.type === 'income' ? 'Khoản thu khác' : 'Khoản chi khác'
      return {
        id: `wallet-cash-${item.id}`,
        type: item.type,
        date: item.transaction_date,
        title: meta?.label || fallbackTitle,
        subtitle: item.note || (roomName ? `Gắn với ${roomName}` : 'Giao dịch ghi nhận thủ công'),
        amount: Number(item.amount) || 0,
        icon: meta?.icon || (item.type === 'income' ? 'fa-hand-holding-dollar' : 'fa-receipt'),
        source: 'manual' as const,
        category: meta?.label || fallbackTitle,
        roomName: roomName || item.room_id || 'Không gắn phòng',
        paymentMethod:
          item.payment_method === 'cash'
            ? 'Tiền mặt'
            : item.payment_method === 'transfer'
              ? 'Chuyển khoản'
              : 'Không ghi nhận',
        note: item.note || '',
        reference: item.id,
        createdAt: item.created_at
      }
    })

    return [...invoiceRows, ...manualRows].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    )
  }, [invoices, roomById, transactions])

  const filteredRows = useMemo(() => {
    const [endYear, endMonth] = selectedMonth.split('-').map(Number)
    const periodEnd = new Date(endYear, endMonth, 0, 23, 59, 59, 999)
    const periodStart =
      historyRange === 'all' ? null : new Date(endYear, endMonth - Number(historyRange), 1)
    const query = searchQuery.trim().toLocaleLowerCase('vi-VN')

    return allRows.filter((row) => {
      const rowDate = new Date(`${row.date.slice(0, 10)}T00:00:00`)
      if (rowDate > periodEnd || (periodStart && rowDate < periodStart)) return false
      if (!query) return true
      return [row.title, row.subtitle, row.category, row.roomName, row.note, row.reference]
        .join(' ')
        .toLocaleLowerCase('vi-VN')
        .includes(query)
    })
  }, [allRows, historyRange, searchQuery, selectedMonth])

  const incomeRows = filteredRows.filter((item) => item.type === 'income')
  const expenseRows = filteredRows.filter((item) => item.type === 'expense')
  const totalIncome = incomeRows.reduce((sum, item) => sum + item.amount, 0)
  const totalExpense = expenseRows.reduce((sum, item) => sum + item.amount, 0)
  const balance = totalIncome - totalExpense

  const forecast = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const now = new Date()
    const daysInMonth = new Date(year, month, 0).getDate()
    const isCurrentMonth =
      historyRange === 1 && year === now.getFullYear() && month === now.getMonth() + 1
    if (!isCurrentMonth || totalExpense <= 0) return balance
    const elapsedDays = Math.max(1, Math.min(now.getDate(), daysInMonth))
    const futureExpense = (totalExpense / elapsedDays) * (daysInMonth - elapsedDays)
    return balance - futureExpense
  }, [balance, historyRange, selectedMonth, totalExpense])

  const isLoading = transactionsLoading || invoicesLoading
  const periodLabel =
    historyRange === 'all'
      ? 'Toàn bộ lịch sử'
      : historyRange === 1
        ? monthOptions.find((option) => option.value === selectedMonth)?.label || 'Tháng đã chọn'
        : `${historyRange} tháng gần nhất`

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F8F6] p-4">
      <div className="mx-auto min-w-[1120px] max-w-[1540px] space-y-3">
        <div className="flex h-10 items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-[#12372A]">Ví</h1>
            <p className="text-xs text-slate-500">Theo dõi dòng tiền và số dư vận hành</p>
          </div>
          <label className="relative flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm focus-within:border-[#17A673] focus-within:ring-2 focus-within:ring-emerald-100">
            <CalendarDays size={17} className="text-[#007A4D]" />
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="appearance-none bg-transparent pr-6 outline-none"
              aria-label="Chọn tháng xem ví"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <i className="fa-solid fa-chevron-down pointer-events-none absolute right-3 text-[10px] text-slate-400" />
          </label>
        </div>

        <section className="relative flex h-[218px] overflow-hidden rounded-2xl bg-[#005B3C] shadow-[0_12px_28px_rgba(0,91,60,0.16)]">
          <img
            src={walletHeroGreen}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div className="relative z-10 flex w-full flex-col items-center justify-center text-white">
            <div className="text-base font-semibold text-white/85">Số dư khả dụng</div>
            <div
              className={`mt-1 text-5xl font-black tracking-tight tabular-nums ${balance < 0 ? 'text-red-200' : 'text-white'}`}
            >
              {formatVND(balance)} đ
            </div>
            <div className="mt-2 text-sm font-semibold text-white/80">
              Thu <span className="text-[#8FF0C6]">{formatVND(totalIncome)} đ</span>
              <span className="mx-3 text-white/60">−</span>
              Chi <span className="text-[#FF9C9C]">{formatVND(totalExpense)} đ</span>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={onRecordTransaction}
                className="flex h-11 items-center gap-2 rounded-xl bg-white px-6 text-sm font-black text-[#006B4F] shadow-lg transition hover:-translate-y-0.5 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                <CirclePlus size={18} /> Ghi thu / chi
              </button>
              <button
                type="button"
                onClick={onReconcile}
                className="flex h-11 items-center gap-2 rounded-xl border border-white/70 bg-white/10 px-6 text-sm font-black text-white backdrop-blur-sm transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70"
              >
                <FileSearch size={18} /> Đối soát
              </button>
            </div>
          </div>
        </section>

        <div className="flex min-h-12 items-center gap-3 rounded-xl border border-emerald-100 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2 pr-2 text-sm font-bold text-[#12372A]">
            <History size={17} className="text-[#007A4D]" />
            Lịch sử
          </div>
          <div className="flex rounded-lg bg-[#F0F7F3] p-1">
            {(
              [
                { value: 1, label: '1 tháng' },
                { value: 3, label: '3 tháng' },
                { value: 6, label: '6 tháng' },
                { value: 'all', label: 'Tất cả' }
              ] as const
            ).map((option) => (
              <button
                type="button"
                key={String(option.value)}
                onClick={() => setHistoryRange(option.value)}
                className={
                  'rounded-md px-3 py-1.5 text-xs font-bold transition ' +
                  (historyRange === option.value
                    ? 'bg-[#007A4D] text-white shadow-sm'
                    : 'text-slate-500 hover:bg-white hover:text-[#007A4D]')
                }
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="relative ml-auto flex h-9 w-[300px] items-center rounded-lg border border-slate-200 bg-white focus-within:border-[#17A673] focus-within:ring-2 focus-within:ring-emerald-100">
            <Search size={16} className="ml-3 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm nội dung, phòng, ghi chú..."
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-xs text-slate-700 outline-none placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mr-2 flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Xóa tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </label>
          <div className="min-w-[165px] text-right">
            <div className="text-xs font-black text-[#007A4D]">{periodLabel}</div>
            <div className="text-[10px] font-semibold text-slate-400">
              {filteredRows.length} giao dịch được tìm thấy
            </div>
          </div>
        </div>
        {isLoading ? (
          <div className="flex h-[464px] items-center justify-center rounded-xl border border-emerald-100 bg-white">
            <div className="flex items-center gap-3 text-sm font-bold text-[#007A4D]">
              <i className="fa-solid fa-spinner fa-spin" /> Đang tổng hợp dòng tiền...
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(430px,1fr)_150px_minmax(430px,1fr)] gap-3">
            <LedgerSide
              type="income"
              rows={incomeRows}
              total={totalIncome}
              onSelectRow={setSelectedRow}
            />

            <aside className="relative flex min-h-[464px] flex-col items-center overflow-hidden rounded-xl border border-emerald-100 bg-white shadow-sm">
              <div className="mt-9 w-full border-t border-dashed border-[#008F5A]" />
              <div className="mt-[-22px] bg-white px-2 text-xs font-bold text-[#008F5A]">
                {formatVND(totalIncome)} đ
              </div>
              <div className="absolute bottom-12 top-14 border-l border-dashed border-emerald-200" />
              <div className="relative z-10 my-auto flex items-center bg-white py-3 pl-3 text-center">
                <div>
                  <div className="text-sm font-bold text-slate-800">Còn lại</div>
                  <div
                    className={`mt-1 text-base font-black tabular-nums ${balance >= 0 ? 'text-[#007A4D]' : 'text-[#E04444]'}`}
                  >
                    {formatVND(balance)} đ
                  </div>
                </div>
                <ChevronLeft
                  size={22}
                  className={balance >= 0 ? 'text-[#007A4D]' : 'text-[#E04444]'}
                />
              </div>
              <div className="mb-9 w-full border-t border-dashed border-[#E04444]" />
              <div className="mb-4 mt-[-22px] bg-white px-2 text-xs font-bold text-[#E04444]">
                {formatVND(totalExpense)} đ
              </div>
            </aside>

            <LedgerSide
              type="expense"
              rows={expenseRows}
              total={totalExpense}
              onSelectRow={setSelectedRow}
            />
          </div>
        )}

        <button
          type="button"
          onClick={onRecordTransaction}
          className="flex h-[70px] w-full items-center rounded-xl border border-emerald-200 bg-white px-6 text-left shadow-sm transition hover:border-[#17A673] hover:bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#007A4D] text-white">
            <TrendingUp size={21} />
          </span>
          <span className="ml-4 text-base font-bold text-[#12372A]">
            {historyRange === 1 ? 'Dự kiến cuối tháng:' : 'Chênh lệch kỳ đã chọn:'}{' '}
            <strong className={forecast >= 0 ? 'text-[#007A4D]' : 'text-[#E04444]'}>
              {formatVND(forecast)} đ
            </strong>
          </span>
          <span className="ml-auto mr-8 text-sm text-slate-500">
            {historyRange === 1
              ? 'Dựa trên số tiền đã thu và nhịp chi phí hiện tại.'
              : 'Tổng tiền vào trừ tổng tiền ra trong khoảng lịch sử đang xem.'}
          </span>
          <ChevronRight size={21} className="text-[#007A4D]" />
        </button>
      </div>

      {selectedRow && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4 border-b border-slate-100 px-6 py-5">
              <span
                className={
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white ' +
                  (selectedRow.type === 'income' ? 'bg-[#008F5A]' : 'bg-[#E04444]')
                }
              >
                {selectedRow.type === 'income' ? (
                  <ArrowDown size={23} strokeWidth={2.5} />
                ) : (
                  <ArrowUp size={23} strokeWidth={2.5} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Chi tiết giao dịch
                </div>
                <h2 className="mt-1 truncate text-lg font-black text-slate-900">
                  {selectedRow.title}
                </h2>
                <div
                  className={
                    'mt-1 text-2xl font-black tabular-nums ' +
                    (selectedRow.type === 'income' ? 'text-[#008F5A]' : 'text-[#E04444]')
                  }
                >
                  {selectedRow.type === 'income' ? '+' : '-'}
                  {formatVND(selectedRow.amount)} đ
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Đóng chi tiết giao dịch"
              >
                <X size={19} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-8 px-6 py-2">
              {[
                { label: 'Ngày giao dịch', value: formatDate(selectedRow.date) },
                { label: 'Nhóm giao dịch', value: selectedRow.category },
                { label: 'Phòng / Tòa', value: selectedRow.roomName },
                { label: 'Phương thức', value: selectedRow.paymentMethod },
                {
                  label: 'Nguồn dữ liệu',
                  value:
                    selectedRow.source === 'invoice' ? 'Thanh toán hóa đơn' : 'Ghi nhận thủ công'
                },
                { label: 'Ngày tạo', value: formatDateTime(selectedRow.createdAt) }
              ].map((item) => (
                <div key={item.label} className="border-b border-slate-100 py-3">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {item.label}
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-800">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="space-y-3 px-6 pb-5 pt-3">
              <div className="rounded-xl bg-[#F4F8F6] px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Nội dung / Ghi chú
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {selectedRow.note || selectedRow.subtitle || 'Không có ghi chú'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Mã tham chiếu
                </div>
                <div className="mt-1 break-all font-mono text-xs text-slate-600">
                  {selectedRow.reference}
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="rounded-xl bg-[#007A4D] px-5 py-2.5 text-sm font-black text-white transition hover:bg-[#006B42]"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
