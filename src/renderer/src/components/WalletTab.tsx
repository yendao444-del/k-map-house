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
    <div className="flex-1 overflow-y-auto bg-[#F5F9F7] p-4">
      <div className="mx-auto flex min-w-[1120px] max-w-[1540px] flex-col gap-4">
        <div className="order-1 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#008F68]">
              Tài sản thanh khoản
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#12372A]">Ví tiền</h1>
            <p className="mt-1 text-xs text-slate-500">
              Quản lý số dư ngân hàng, tiền mặt và luân chuyển giữa các ví.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onOpenInvestments && (
              <button
                type="button"
                onClick={onOpenInvestments}
                className="flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 text-xs font-black text-[#008F68] shadow-sm transition hover:bg-emerald-50"
              >
                <PieChart size={16} />
                Danh mục đầu tư
              </button>
            )}
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm">
              <CalendarDays size={16} className="text-[#007A4D]" />
              <select
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="bg-transparent outline-none"
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
              <ChevronDown size={14} className="text-slate-400" />
            </label>
            <button
              type="button"
              onClick={onRecordTransaction}
              className="flex h-10 items-center gap-2 rounded-lg bg-[#008F68] px-4 text-xs font-black text-white shadow-sm transition hover:bg-[#007653]"
            >
              <CirclePlus size={16} />
              Thêm giao dịch
            </button>
          </div>
        </div>
        <section className="relative order-2 overflow-hidden rounded-2xl bg-[#00775C] p-6 text-white shadow-[0_12px_30px_rgba(0,119,92,.16)]">
          <div className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full border border-white/10 shadow-[0_0_0_28px_rgba(255,255,255,.04),0_0_0_56px_rgba(255,255,255,.025)]" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.12em] text-white/75">
                Tiền hiện có
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="text-4xl font-black tracking-tight tabular-nums">
                  {showBalance ? formatVND(availableBalance) : '••••••••••'}
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#41D59B]/20 px-3 py-1.5 text-[11px] font-black text-[#C5FFE5]">
                  <CheckCircle2 size={14} />
                  Khớp sổ sách
                </span>
              </div>
              <div className="mt-2 text-xs text-white/65">
                {selectedMonth === 'all'
                  ? 'Cập nhật theo toàn bộ sổ giao dịch'
                  : `Cập nhật theo giao dịch trong ${selectedMonth.slice(5)}/${selectedMonth.slice(0, 4)}`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowBalance((value) => !value)}
              className="rounded-lg border border-white/25 bg-white/10 p-2.5 text-white hover:bg-white/20"
              aria-label="Ẩn hiện số dư"
            >
              {showBalance ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>
          </div>
        </section>
        <section className="order-5 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-base font-black text-[#12372A]">
              <WalletCards size={19} className="text-[#008F68]" />
              Tiền đang nằm ở đâu?
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTransferOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-[#008F68] px-3 py-2 text-xs font-black text-white hover:bg-[#007653]"
              >
                <ArrowUpRight size={14} />
                Chuyển giữa các ví
              </button>
              <button
                type="button"
                onClick={onReconcile}
                className="flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-black text-[#008F68] hover:bg-emerald-50"
              >
                <RefreshCw size={14} />
                Đối soát ngay
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setSelectedWallet('bank')}
              onDoubleClick={() => copyWalletValue(accountNo, 'Số tài khoản')}
              title="Double-click để sao chép số tài khoản"
              className={`rounded-xl border p-4 text-left transition ${selectedWallet === 'bank' ? 'border-[#17A673] bg-[#F3FCF8] shadow-[0_0_0_3px_rgba(23,166,115,.1)]' : 'border-slate-200 bg-white hover:border-emerald-200'}`}
            >
              <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#DDF8EC] text-[#008F68]">
                  <Landmark size={21} />
                </span>
                <MoreHorizontal size={17} className="text-slate-400" />
              </div>
              <div className="mt-3 text-sm font-black text-[#12372A]">
                {bankName} · {accountNo}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {appSettings?.bank_id && appSettings.account_no
                  ? 'Tài khoản nhận tiền · Đồng bộ qua Sepay'
                  : 'Chưa cấu hình tài khoản nhận tiền'}
              </div>
              <div className="mt-3 text-xl font-black tabular-nums text-[#12372A]">
                {formatVND(Math.max(0, bankBalance))}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-[#008F68]">
                <CheckCircle2 size={13} />
                {appSettings?.bank_id && appSettings.account_no ? 'Đang hoạt động' : 'Cần cấu hình'}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSelectedWallet('cash')}
              onDoubleClick={() =>
                copyWalletValue(String(Math.max(0, cashBalance)), 'Số dư tiền mặt')
              }
              title="Double-click để sao chép số dư tiền mặt"
              className={`rounded-xl border p-4 text-left transition ${selectedWallet === 'cash' ? 'border-[#F4B641] bg-[#FFFBF4] shadow-[0_0_0_3px_rgba(244,182,65,.12)]' : 'border-slate-200 bg-white hover:border-amber-200'}`}
            >
              <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0DB] text-[#D27B20]">
                  <Banknote size={21} />
                </span>
                <MoreHorizontal size={17} className="text-slate-400" />
              </div>
              <div className="mt-3 text-sm font-black text-[#12372A]">Tiền mặt tại quỹ</div>
              <div className="mt-1 text-[11px] text-slate-500">Tiền mặt · Cập nhật thủ công</div>
              <div className="mt-3 text-xl font-black tabular-nums text-[#12372A]">
                {formatVND(Math.max(0, cashBalance))}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-[#D27B20]">
                <CheckCircle2 size={13} />
                Đang hoạt động
              </div>
            </button>
            <button
              type="button"
              onClick={onRecordTransaction}
              className="flex min-h-[166px] flex-col items-center justify-center rounded-xl border border-dashed border-emerald-200 bg-[#FBFEFC] text-[#008F68] transition hover:bg-emerald-50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E2F8EE]">
                <Plus size={21} />
              </span>
              <span className="mt-3 text-sm font-black">Thêm ví hoặc tài khoản</span>
              <span className="mt-1 text-[10px] text-slate-400">
                Ngân hàng · Tiền mặt · Ví điện tử
              </span>
            </button>
          </div>
        </section>
        <section className="order-6 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-[#FFF9ED] px-5 py-3.5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <ReceiptText size={16} />
            </div>
            <div>
              <div className="text-xs font-black text-[#7B5311]">
                Khoản chuyển khoản không qua Sepay hoặc tiền mặt?
              </div>
              <div className="mt-1 text-[11px] leading-5 text-[#99773A]">
                Ghi nhận thủ công trong Giao dịch, chọn đúng phương thức để số dư được cộng vào ngân
                hàng hoặc quỹ tiền mặt.
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onSyncSepay}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-[11px] font-black text-[#8B5E13] hover:bg-amber-50"
            >
              <RefreshCw size={14} />
              Đồng bộ / xử lý Sepay
            </button>
            <button
              type="button"
              onClick={onRecordTransaction}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-[11px] font-black text-[#8B5E13] hover:bg-amber-50"
            >
              <CirclePlus size={14} />
              Ghi nhận thủ công
            </button>
          </div>
        </section>
        <section className="order-3 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2 text-base font-black text-[#12372A]">
                <ReceiptText size={19} className="text-[#008F68]" />
                Biến động gần đây
              </div>
              <button
                type="button"
                onClick={onRecordTransaction}
                className="flex items-center gap-1 text-xs font-black text-[#008F68]"
              >
                Xem tất cả <ChevronRight size={14} />
              </button>
            </div>
            <div className="border-b border-slate-100 px-4 py-3">
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
              <div className="flex h-56 items-center justify-center text-xs font-bold text-[#008F68]">
                Đang tổng hợp ví...
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredRows.slice(0, 5).map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[34px_1fr_auto] items-center gap-3 px-5 py-3"
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
