import { useMemo, useState, type ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Eye,
  EyeOff,
  Landmark,
  MoreHorizontal,
  PieChart,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  WalletCards
} from 'lucide-react'
import {
  DEFAULT_EXPENSE_CATEGORIES,
  getAppSettings,
  createCashTransaction,
  deleteCashTransaction,
  getCashTransactions,
  getInvoicePaymentRecords,
  getInvoices,
  getRooms
} from '../lib/db'

type WalletRow = {
  id: string
  date: string
  title: string
  subtitle: string
  amount: number
  type: 'income' | 'expense'
  paymentMethod: string
  source: string
}
const formatVND = (value: number): string =>
  `${new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))} đ`
const formatDate = (value: string): string => {
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}
const paymentLabel = (value: string): string =>
  value === 'cash'
    ? 'Tiền mặt tại quỹ'
    : value === 'transfer'
      ? 'Chuyển khoản ngân hàng'
      : 'Chưa xác định'

export function WalletTab({
  onRecordTransaction,
  onReconcile,
  onSyncSepay,
  onOpenInvestments
}: {
  onRecordTransaction: () => void
  onReconcile: () => void
  onSyncSepay: () => void
  onOpenInvestments?: () => void
}): ReactElement {
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [search, setSearch] = useState('')
  const [showBalance, setShowBalance] = useState(true)
  const [selectedWallet, setSelectedWallet] = useState('bank')
  const [copiedMessage, setCopiedMessage] = useState('')
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferDirection, setTransferDirection] = useState<'cash-to-bank' | 'bank-to-cash'>(
    'cash-to-bank'
  )
  const [transferAmount, setTransferAmount] = useState('')
  const [transferError, setTransferError] = useState('')
  const queryClient = useQueryClient()
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
  const rows = useMemo<WalletRow[]>(() => {
    const invoiceRows = invoices
      .filter(
        (invoice) => invoice.payment_status !== 'cancelled' && invoice.payment_status !== 'merged'
      )
      .flatMap((invoice) =>
        getInvoicePaymentRecords(invoice).map((record) => ({
          id: `invoice-${invoice.id}-${record.id}`,
          date: record.payment_date,
          title: `Thu tiền phòng · ${roomById.get(invoice.room_id) || 'Không xác định'}`,
          subtitle: record.note || `Thu qua ${paymentLabel(record.payment_method || 'transfer')}`,
          amount: Number(record.amount) || 0,
          type: 'income' as const,
          paymentMethod: record.payment_method || 'transfer',
          source: 'Sepay'
        }))
      )
    const manualRows = transactions.map((item) => ({
      id: `cash-${item.id}`,
      date: item.transaction_date,
      title:
        item.category === 'wallet_transfer'
          ? 'Chuyển giữa các ví'
          : categoryMap.get(item.category) ||
            (item.type === 'income' ? 'Khoản thu khác' : 'Chi phí vận hành'),
      subtitle: item.note || 'Giao dịch ghi nhận thủ công',
      amount: Number(item.amount) || 0,
      type: item.type,
      paymentMethod: item.payment_method || 'transfer',
      source: 'Thủ công'
    }))
    return [...invoiceRows, ...manualRows].sort(
      (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
    )
  }, [categoryMap, invoices, roomById, transactions])
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('vi-VN')
    return rows.filter(
      (row) =>
        (selectedMonth === 'all' || row.date.startsWith(selectedMonth)) &&
        (!query ||
          `${row.title} ${row.subtitle} ${row.source}`.toLocaleLowerCase('vi-VN').includes(query))
    )
  }, [rows, search, selectedMonth])
  const openingDate = appSettings?.opening_balance_date || ''
  const openingBank = Number(appSettings?.opening_balance_bank || 0)
  const openingCash = Number(appSettings?.opening_balance_cash || 0)
  const ledgerRows = rows.filter((row) => !openingDate || row.date >= openingDate)
  const bankBalance = ledgerRows.reduce(
    (sum, row) =>
      row.paymentMethod === 'cash' ? sum : sum + (row.type === 'income' ? row.amount : -row.amount),
    openingBank
  )
  const cashBalance = ledgerRows.reduce(
    (sum, row) =>
      row.paymentMethod !== 'cash' ? sum : sum + (row.type === 'income' ? row.amount : -row.amount),
    openingCash
  )
  const totalBalance = bankBalance + cashBalance
  const safeTotal = Math.max(0, totalBalance)
  const availableBalance = safeTotal
  const safeBankBalance = Math.max(0, bankBalance)
  const safeCashBalance = Math.max(0, cashBalance)
  const bankPercent =
    availableBalance > 0 ? ((safeBankBalance / availableBalance) * 100).toFixed(1) : '0'
  const cashPercent =
    availableBalance > 0 ? ((safeCashBalance / availableBalance) * 100).toFixed(1) : '0'
  const copyWalletValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedMessage(`${label} đã được sao chép`)
      window.setTimeout(() => setCopiedMessage(''), 1800)
    } catch {
      setCopiedMessage('Không thể sao chép trên thiết bị này')
      window.setTimeout(() => setCopiedMessage(''), 1800)
    }
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
  const bankName = appSettings?.bank_id
    ? bankNames[appSettings.bank_id] || appSettings.bank_id
    : 'Tài khoản ngân hàng'
  const accountNo = appSettings?.account_no?.trim() || 'Chưa cấu hình số tài khoản'
  const isLoading = transactionsLoading || invoicesLoading
  const transferMutation = useMutation({
    mutationFn: async ({
      amount,
      direction
    }: {
      amount: number
      direction: 'cash-to-bank' | 'bank-to-cash'
    }) => {
      const stamp = new Date().toISOString()
      const cashToBank = direction === 'cash-to-bank'
      const sourceLabel = cashToBank ? 'Tiền mặt tại quỹ' : `${bankName} · ${accountNo}`
      const targetLabel = cashToBank ? `${bankName} · ${accountNo}` : 'Tiền mặt tại quỹ'
      const note = `Chuyển giữa các ví: ${sourceLabel} → ${targetLabel}`
      const sourceRow = await createCashTransaction({
        type: 'expense',
        category: 'wallet_transfer',
        transaction_date: stamp,
        amount,
        payment_method: cashToBank ? 'cash' : 'transfer',
        note
      })
      try {
        return await createCashTransaction({
          type: 'income',
          category: 'wallet_transfer',
          transaction_date: stamp,
          amount,
          payment_method: cashToBank ? 'transfer' : 'cash',
          note
        })
      } catch (error) {
        await deleteCashTransaction(sourceRow.id)
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashTransactions'] })
      setTransferOpen(false)
      setTransferAmount('')
      setTransferError('')
    },
    onError: (error: Error) => setTransferError(error.message || 'Không thể ghi nhận chuyển tiền.')
  })
  const submitTransfer = () => {
    const amount = Number(transferAmount.replace(/\D/g, ''))
    if (!amount || amount <= 0) {
      setTransferError('Nhập số tiền lớn hơn 0.')
      return
    }
    const sourceBalance = transferDirection === 'cash-to-bank' ? cashBalance : bankBalance
    if (amount > sourceBalance) {
      setTransferError('Số tiền chuyển lớn hơn số dư của ví nguồn.')
      return
    }
    transferMutation.mutate({ amount, direction: transferDirection })
  }
  return (
    <div className="flex-1 overflow-y-auto bg-[#F5F9F7] p-4 sm:p-5">
      <div className="mx-auto flex w-full min-w-0 max-w-[1540px] flex-col gap-4">
        {/* Top Header */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#008F68]">
              Tài chính · Dòng tiền
            </div>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-[#12372A]">Ví tiền</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Quản lý số dư ngân hàng, tiền mặt và luân chuyển giữa các ví.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onOpenInvestments && (
              <button
                type="button"
                onClick={onOpenInvestments}
                className="flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3.5 text-xs font-black text-[#008F68] shadow-sm transition hover:bg-emerald-50"
              >
                <PieChart size={15} />
                Danh mục đầu tư
              </button>
            )}
            <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm">
              <CalendarDays size={15} className="text-[#007A4D]" />
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="cursor-pointer bg-transparent outline-none"
                aria-label="Chọn tháng xem ví"
              >
                <option value="all">Toàn thời gian</option>
                {Array.from({ length: 12 }, (_, index) => {
                  const date = new Date(new Date().getFullYear(), new Date().getMonth() - index, 1)
                  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                  return (
                    <option key={value} value={value}>
                      Tháng {String(date.getMonth() + 1).padStart(2, '0')}/{date.getFullYear()}
                    </option>
                  )
                })}
              </select>
              <ChevronDown size={13} className="text-slate-400" />
            </label>
            <button
              type="button"
              onClick={() => setTransferOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 text-xs font-black text-[#00775C] shadow-sm transition hover:bg-emerald-100/70"
            >
              <ArrowUpRight size={14} />
              Chuyển giữa các ví
            </button>
            <button
              type="button"
              onClick={onSyncSepay}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-[#FFFDF5] px-3.5 text-xs font-black text-[#8B5E13] shadow-sm transition hover:bg-amber-100/60"
            >
              <RefreshCw size={13} />
              Đồng bộ / xử lý Sepay
            </button>
            <button
              type="button"
              onClick={onRecordTransaction}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-[#008F68] px-3.5 text-xs font-black text-white shadow-sm transition hover:bg-[#007653]"
            >
              <CirclePlus size={15} />
              Ghi nhận thủ công
            </button>
            <button
              type="button"
              onClick={onReconcile}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw size={13} className="text-[#008F68]" />
              Đối soát ngay
            </button>
          </div>
        </div>

        {/* 1. MỤC TIỀN ĐANG NẰM Ở ĐÂU - LÊN ĐẦU TIÊN THEO YÊU CẦU */}
        <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F8F0] text-[#008F68]">
                <WalletCards size={18} />
              </div>
              <div>
                <h2 className="text-base font-black text-[#12372A]">Tiền đang nằm ở đâu?</h2>
                <p className="text-[11px] text-slate-400">Số dư tại từng tài khoản ngân hàng và quỹ tiền mặt</p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
              <CheckCircle2 size={13} className="text-emerald-600" />
              Khớp sổ sách
            </span>
          </div>

          {/* BANNER SỐ DƯ KHẢ DỤNG TO RÕ RÀNG */}
          <div className="mb-5 rounded-2xl bg-gradient-to-br from-[#006e53] via-[#005e46] to-[#014936] p-5 sm:p-6 text-white shadow-lg shadow-emerald-950/10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-200">
                  <WalletCards size={16} />
                  <span>Số dư khả dụng</span>
                  <span className="text-emerald-300/60">•</span>
                  <span className="text-[11px] font-bold normal-case text-emerald-100/80">Tổng tài sản thanh khoản</span>
                </div>
                <div className="mt-2.5 flex items-baseline gap-3">
                  <span className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight tabular-nums text-white drop-shadow-sm">
                    {showBalance ? formatVND(availableBalance) : '••••••••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowBalance((v) => !v)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-emerald-200 transition hover:bg-white/20 hover:text-white"
                    title={showBalance ? 'Ẩn số dư' : 'Hiện số dư'}
                    aria-label="Ẩn hiện số dư"
                  >
                    {showBalance ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
                <div className="mt-2 text-xs text-emerald-100/70">
                  {selectedMonth === 'all'
                    ? 'Cập nhật theo toàn bộ sổ giao dịch thực tế'
                    : `Cập nhật theo giao dịch trong ${selectedMonth.slice(5)}/${selectedMonth.slice(0, 4)}`}
                </div>
              </div>

              {/* Tỷ trọng phân bổ nhanh 2 ví */}
              <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
                <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-sm">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                    Ngân hàng ({bankPercent}%)
                  </div>
                  <div className="mt-0.5 text-base sm:text-lg font-black tabular-nums text-white">
                    {showBalance ? formatVND(safeBankBalance) : '••••••••••'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 backdrop-blur-sm">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200">
                    Tiền mặt ({cashPercent}%)
                  </div>
                  <div className="mt-0.5 text-base sm:text-lg font-black tabular-nums text-white">
                    {showBalance ? formatVND(safeCashBalance) : '••••••••••'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lưới các thẻ ví */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {/* Thẻ Ngân hàng */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSelectedWallet('bank')}
              onDoubleClick={() => copyWalletValue(accountNo, 'Số tài khoản')}
              title="Click để chọn · Double-click để sao chép số tài khoản"
              className={`group relative flex flex-col justify-between rounded-xl border p-4 text-left transition cursor-pointer ${
                selectedWallet === 'bank'
                  ? 'border-[#17A673] bg-[#F3FCF8] shadow-[0_0_0_3px_rgba(23,166,115,.1)]'
                  : 'border-slate-200 bg-white hover:border-emerald-200 hover:shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#DDF8EC] text-[#008F68] shadow-sm">
                    <Landmark size={20} />
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyWalletValue(accountNo, 'Số tài khoản')
                      }}
                      title="Sao chép số tài khoản"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <i className="fa-regular fa-copy text-xs"></i>
                    </button>
                    <MoreHorizontal size={16} className="text-slate-400" />
                  </div>
                </div>
                <div className="mt-3 truncate text-sm font-black text-[#12372A]">
                  {bankName} · {accountNo}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {appSettings?.bank_id && appSettings.account_no
                    ? 'Tài khoản nhận tiền · Đồng bộ qua Sepay'
                    : 'Chưa cấu hình tài khoản nhận tiền'}
                </div>
                <div className="mt-3 text-2xl font-black tabular-nums text-[#12372A]">
                  {showBalance ? formatVND(safeBankBalance) : '••••••••••'}
                </div>
              </div>
              <div className="mt-3.5 flex items-center justify-between border-t border-slate-100/80 pt-2.5 text-[11px]">
                <div className="flex items-center gap-1.5 font-bold text-[#008F68]">
                  <CheckCircle2 size={13} />
                  {appSettings?.bank_id && appSettings.account_no ? 'Đang hoạt động' : 'Cần cấu hình'}
                </div>
                <span className="font-bold text-slate-500">{bankPercent}% tổng ví</span>
              </div>
            </div>

            {/* Thẻ Tiền mặt tại quỹ */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSelectedWallet('cash')}
              onDoubleClick={() => copyWalletValue(String(safeCashBalance), 'Số dư tiền mặt')}
              title="Click để chọn · Double-click để sao chép số dư"
              className={`group relative flex flex-col justify-between rounded-xl border p-4 text-left transition cursor-pointer ${
                selectedWallet === 'cash'
                  ? 'border-[#F4B641] bg-[#FFFBF4] shadow-[0_0_0_3px_rgba(244,182,65,.12)]'
                  : 'border-slate-200 bg-white hover:border-amber-200 hover:shadow-sm'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0DB] text-[#D27B20] shadow-sm">
                    <Banknote size={20} />
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyWalletValue(String(safeCashBalance), 'Số dư tiền mặt')
                      }}
                      title="Sao chép số dư"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <i className="fa-regular fa-copy text-xs"></i>
                    </button>
                    <MoreHorizontal size={16} className="text-slate-400" />
                  </div>
                </div>
                <div className="mt-3 text-sm font-black text-[#12372A]">Tiền mặt tại quỹ</div>
                <div className="mt-0.5 text-[11px] text-slate-500">Tiền mặt · Cập nhật thủ công</div>
                <div className="mt-3 text-2xl font-black tabular-nums text-[#12372A]">
                  {showBalance ? formatVND(safeCashBalance) : '••••••••••'}
                </div>
              </div>
              <div className="mt-3.5 flex items-center justify-between border-t border-slate-100/80 pt-2.5 text-[11px]">
                <div className="flex items-center gap-1.5 font-bold text-[#D27B20]">
                  <CheckCircle2 size={13} />
                  Đang hoạt động
                </div>
                <span className="font-bold text-slate-500">{cashPercent}% tổng ví</span>
              </div>
            </div>

            {/* Thẻ Thêm ví hoặc tài khoản */}
            <button
              type="button"
              onClick={onRecordTransaction}
              className="group flex min-h-[160px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-200 bg-[#FBFEFC] p-4 text-[#008F68] transition hover:border-emerald-300 hover:bg-emerald-50/50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E2F8EE] shadow-sm transition group-hover:scale-105">
                <Plus size={20} />
              </span>
              <span className="mt-3 text-sm font-black">Thêm ví hoặc tài khoản</span>
              <span className="mt-0.5 text-[10px] text-slate-400">
                Ngân hàng · Tiền mặt · Ví điện tử
              </span>
            </button>
          </div>
        </section>

        {/* 2. MỤC BIẾN ĐỘNG GẦN ĐÂY */}
        <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-2 text-base font-black text-[#12372A]">
              <ReceiptText size={18} className="text-[#008F68]" />
              Biến động gần đây
            </div>
            <button
              type="button"
              onClick={onRecordTransaction}
              className="inline-flex items-center gap-1 text-xs font-black text-[#008F68] transition hover:text-[#007653]"
            >
              Xem tất cả <ChevronRight size={14} />
            </button>
          </div>
          <div className="border-b border-slate-100 px-4 py-2.5">
            <label className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50">
              <Search size={14} className="ml-3 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm giao dịch..."
                className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none placeholder:text-slate-400"
              />
            </label>
          </div>
          {isLoading ? (
            <div className="flex h-44 items-center justify-center text-xs font-bold text-[#008F68]">
              <i className="fa-solid fa-spinner fa-spin mr-2"></i> Đang tổng hợp ví...
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredRows.slice(0, 5).map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[34px_1fr_auto] items-center gap-3 px-5 py-3 transition hover:bg-slate-50/50"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${row.type === 'income' ? 'bg-emerald-50 text-[#008F68]' : 'bg-red-50 text-[#E04444]'}`}
                  >
                    {row.type === 'income' ? (
                      <ArrowDownLeft size={16} />
                    ) : (
                      <ArrowUpRight size={16} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-black text-[#12372A]">{row.title}</div>
                    <div className="truncate text-[10px] text-slate-500">
                      {formatDate(row.date)} ·{' '}
                      {row.paymentMethod === 'cash'
                        ? 'Tiền mặt tại quỹ'
                        : `${bankName} · ${accountNo}`}
                    </div>
                  </div>
                  <div
                    className={`text-xs font-black tabular-nums ${row.type === 'income' ? 'text-[#008F68]' : 'text-[#E04444]'}`}
                  >
                    {row.type === 'income' ? '+' : '−'}
                    {formatVND(row.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {copiedMessage && (
          <div className="fixed bottom-5 left-1/2 z-[140] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-xl">
            <i className="fa-solid fa-check mr-2 text-emerald-300" />
            {copiedMessage}
          </div>
        )}
        {transferOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-black text-[#12372A]">Chuyển giữa các ví</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Di chuyển tiền giữa các ví của bạn. Tổng tiền không đổi.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTransferOpen(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <div className="mt-5 grid grid-cols-[1fr_42px_1fr] items-center gap-2">
                {[
                  {
                    key: 'cash-to-bank' as const,
                    icon: <Banknote size={18} />,
                    label: 'Tiền mặt tại quỹ',
                    balance: cashBalance,
                    tone: 'amber'
                  },
                  {
                    key: 'bank-to-cash' as const,
                    icon: <Landmark size={18} />,
                    label: `${bankName} · ${accountNo}`,
                    balance: bankBalance,
                    tone: 'emerald'
                  }
                ].map((wallet, index) => (
                  <button
                    key={wallet.key}
                    type="button"
                    onClick={() => setTransferDirection(wallet.key)}
                    className={`rounded-2xl border p-3 text-left transition ${
                      transferDirection === wallet.key ||
                      (index === 1 && transferDirection === 'cash-to-bank') ||
                      (index === 0 && transferDirection === 'bank-to-cash')
                        ? wallet.tone === 'amber'
                          ? 'border-amber-300 bg-amber-50 ring-2 ring-amber-100'
                          : 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100'
                        : 'border-slate-200 bg-white opacity-60'
                    }`}
                    title="Chọn ví nguồn bằng cách bấm vào thẻ"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={wallet.tone === 'amber' ? 'text-amber-600' : 'text-emerald-700'}
                      >
                        {wallet.icon}
                      </span>
                      {((transferDirection === 'cash-to-bank' && index === 0) ||
                        (transferDirection === 'bank-to-cash' && index === 1)) && (
                        <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[9px] font-black text-white">
                          NGUỒN
                        </span>
                      )}
                    </div>
                    <div className="mt-2 truncate text-[11px] font-black text-slate-800">
                      {wallet.label}
                    </div>
                    <div className="mt-1 text-[10px] font-semibold text-slate-500">
                      Số dư {formatVND(wallet.balance)}
                    </div>
                  </button>
                ))}
                <div className="pointer-events-none absolute" />
                <button
                  type="button"
                  onClick={() =>
                    setTransferDirection((direction) =>
                      direction === 'cash-to-bank' ? 'bank-to-cash' : 'cash-to-bank'
                    )
                  }
                  className="col-start-2 row-start-1 flex h-10 w-10 items-center justify-center justify-self-center rounded-full bg-[#00775C] text-white shadow-lg transition hover:scale-105 hover:bg-[#00634D] focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  title="Đảo chiều chuyển giữa các ví"
                  aria-label="Đảo chiều chuyển giữa các ví"
                >
                  <ArrowLeftRight size={18} />
                </button>
              </div>
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-center text-[11px] font-bold text-slate-500">
                {transferDirection === 'cash-to-bank'
                  ? 'Tiền mặt tại quỹ'
                  : `${bankName} · ${accountNo}`}
                <span className="mx-2 text-[#008F68]">→</span>
                {transferDirection === 'cash-to-bank'
                  ? `${bankName} · ${accountNo}`
                  : 'Tiền mặt tại quỹ'}
              </div>
              <label className="mt-4 block text-xs font-black text-slate-600">
                Số tiền chuyển
                <input
                  value={
                    transferAmount
                      ? new Intl.NumberFormat('vi-VN').format(
                          Number(transferAmount.replace(/\D/g, ''))
                        )
                      : ''
                  }
                  onChange={(event) => setTransferAmount(event.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder="Ví dụ: 5.000.000"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-base font-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              {transferError && (
                <div className="mt-2 text-xs font-bold text-red-600">{transferError}</div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTransferOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={submitTransfer}
                  disabled={transferMutation.isPending}
                  className="rounded-xl bg-[#008F68] px-4 py-2.5 text-xs font-black text-white hover:bg-[#007653] disabled:opacity-60"
                >
                  {transferMutation.isPending ? 'Đang ghi nhận...' : 'Xác nhận chuyển giữa các ví'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
