import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCashTransaction,
  deleteCashTransaction,
  getCashTransactions,
  getAppSettings,
  getInvoices,
  getInvoicePaymentRecords,
  getRooms,
  updateCashTransaction,
  type CashTransaction,
  type CashTransactionCategory,
  type CashTransactionType,
  type Invoice,
  type InvoicePaymentRecord,
  type PaymentMethod,
} from '../lib/db'

const formatVND = (value: number) => new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))
const todayIso = () => new Date().toISOString().split('T')[0]

const CATEGORY_OPTIONS: Array<{ value: CashTransactionCategory; label: string; type: CashTransactionType }> = [
  { value: 'electric', label: 'Hóa đơn điện tổng', type: 'expense' },
  { value: 'water', label: 'Hóa đơn nước tổng', type: 'expense' },
  { value: 'internet', label: 'Internet / wifi', type: 'expense' },
  { value: 'cleaning', label: 'Rác / vệ sinh / môi trường', type: 'expense' },
  { value: 'maintenance', label: 'Bảo trì / sửa chữa', type: 'expense' },
  { value: 'management', label: 'Lương / quản lý', type: 'expense' },
  { value: 'software', label: 'Phần mềm / công cụ', type: 'expense' },
  { value: 'other_expense', label: 'Chi phí khác', type: 'expense' },
  { value: 'other_income', label: 'Khoản thu khác', type: 'income' },
]

const categoryLabel = (category: CashTransactionCategory) =>
  CATEGORY_OPTIONS.find(item => item.value === category)?.label || 'Khác'

type CashFlowRow =
  | (CashTransaction & { source: 'manual' })
  | (CashTransaction & {
      source: 'invoice'
      invoiceId: string
      invoiceStatus: Invoice['payment_status']
      paymentRecordId: string
    })

const buildInvoiceIncomeRows = (invoices: Invoice[]): CashFlowRow[] =>
  invoices
    .filter(invoice => invoice.payment_status !== 'cancelled' && invoice.payment_status !== 'merged')
    .flatMap(invoice =>
      getInvoicePaymentRecords(invoice).map((record: InvoicePaymentRecord) => ({
        id: `invoice-income-${invoice.id}-${record.id}`,
        source: 'invoice' as const,
        invoiceId: invoice.id,
        invoiceStatus: invoice.payment_status,
        paymentRecordId: record.id,
        type: 'income' as const,
        category: 'other_income' as const,
        transaction_date: record.payment_date,
        amount: record.amount || 0,
        room_id: invoice.room_id,
        payment_method: record.payment_method,
        note: record.note || `Thu từ hóa đơn T${String(invoice.month).padStart(2, '0')}/${invoice.year}`,
        created_at: record.created_at || invoice.created_at,
        updated_at: record.created_at || invoice.created_at,
      }))
    )

function CashTransactionModal({
  transaction,
  onClose,
}: {
  transaction: CashTransaction | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const [type, setType] = useState<CashTransactionType>(transaction?.type || 'expense')
  const [amountDisplay, setAmountDisplay] = useState(transaction ? formatVND(transaction.amount) : '')
  const [error, setError] = useState('')

  const isExpense = type === 'expense'

  const mutation = useMutation({
    mutationFn: (payload: Partial<CashTransaction>) =>
      transaction ? updateCashTransaction(transaction.id, payload) : createCashTransaction(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashTransactions'] })
      onClose()
    },
    onError: (err: Error) => setError(err.message || 'Không thể lưu chứng từ.'),
  })

  const categories = CATEGORY_OPTIONS.filter(item => item.type === type)

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '')
    setAmountDisplay(raw ? formatVND(Number(raw)) : '')
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(amountDisplay.replace(/\D/g, '')) || 0
    if (amount <= 0) {
      setError('Số tiền phải lớn hơn 0.')
      return
    }
    setError('')
    mutation.mutate({
      type,
      category: form.get('category') as CashTransactionCategory,
      transaction_date: String(form.get('transaction_date') || todayIso()),
      amount,
      room_id: String(form.get('room_id') || '') || undefined,
      payment_method: (String(form.get('payment_method') || '') || undefined) as PaymentMethod | undefined,
      note: String(form.get('note') || ''),
    })
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* ── Colored header ── */}
        <div className={`px-6 pt-5 pb-10 transition-colors duration-200 ${isExpense ? 'bg-red-500' : 'bg-emerald-500'}`}>
          <div className="flex items-center justify-between mb-5">
            <span className="text-white/80 text-sm font-semibold">
              {transaction ? 'Sửa chứng từ' : 'Thêm chứng từ'}
            </span>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white transition flex items-center justify-center">
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>

          {/* Type toggle */}
          <div className="flex bg-black/15 rounded-2xl p-1 mb-6">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-all ${
                isExpense ? 'bg-white text-red-600 shadow-sm' : 'text-white/70 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-arrow-up text-xs" /> Chi tiền
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-all ${
                !isExpense ? 'bg-white text-emerald-600 shadow-sm' : 'text-white/70 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-arrow-down text-xs" /> Thu tiền
            </button>
          </div>

          {/* Amount — hero */}
          <div className="text-center">
            <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-3">Số tiền</p>
            <div className="relative flex items-center justify-center">
              {/* Input ẩn — chỉ bắt phím, không hiển thị */}
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={amountDisplay}
                onChange={handleAmountChange}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }}
                className="absolute inset-0 opacity-0 cursor-text w-full"
              />
              {/* Display số tiền + cursor nhấp nháy */}
              <div className="flex items-center gap-3 pointer-events-none select-none">
                <div className="flex items-baseline">
                  <span className="text-4xl font-black tabular-nums leading-none text-white min-w-[1ch]">
                    {amountDisplay}
                  </span>
                  <span className="cursor-blink text-white text-3xl font-thin leading-none">|</span>
                </div>
                <span className="text-white/60 text-xl font-bold shrink-0">đ</span>
              </div>
            </div>
            <div className="mt-3 h-px bg-white/25" />
          </div>
        </div>

        {/* ── Body card (pulled up) ── */}
        <form onSubmit={handleSubmit}>
          <div className="-mt-5 mx-4 rounded-2xl bg-white shadow-lg border border-slate-100 divide-y divide-slate-100 overflow-hidden">

            <div className="grid grid-cols-2">
              <div className="p-4 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nhóm</p>
                <select
                  key={type}
                  name="category"
                  defaultValue={transaction?.category || categories[0]?.value}
                  className="w-full text-sm font-semibold text-slate-800 bg-transparent outline-none"
                >
                  {categories.map(item => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div className="p-4 space-y-1 border-l border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ngày phát sinh</p>
                <input
                  name="transaction_date"
                  type="date"
                  defaultValue={transaction?.transaction_date || todayIso()}
                  className="w-full text-sm font-semibold text-slate-800 bg-transparent outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2">
              <div className="p-4 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phương thức</p>
                <select
                  name="payment_method"
                  defaultValue={transaction?.payment_method || 'transfer'}
                  className="w-full text-sm font-semibold text-slate-800 bg-transparent outline-none"
                >
                  <option value="">Không ghi nhận</option>
                  <option value="cash">Tiền mặt</option>
                  <option value="transfer">Chuyển khoản</option>
                </select>
              </div>
              <div className="p-4 space-y-1 border-l border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gắn phòng</p>
                <select
                  name="room_id"
                  defaultValue={transaction?.room_id || ''}
                  className="w-full text-sm font-semibold text-slate-800 bg-transparent outline-none"
                >
                  <option value="">Không gắn phòng</option>
                  {rooms.map(room => (
                    <option key={room.id} value={room.id}>{room.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ghi chú</p>
              <textarea
                name="note"
                defaultValue={transaction?.note || ''}
                rows={2}
                className="w-full text-sm text-slate-700 bg-transparent outline-none resize-none placeholder-slate-300"
                placeholder="VD: Hóa đơn điện tháng 04/2026, sửa vòi nước phòng 101..."
              />
            </div>

            {error && (
              <div className="px-4 py-3 text-sm font-semibold text-red-600 bg-red-50 flex items-center gap-2">
                <i className="fa-solid fa-circle-exclamation" /> {error}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="px-4 py-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white transition flex items-center justify-center gap-2 disabled:opacity-60 ${
                isExpense ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
              }`}
            >
              {mutation.isPending
                ? <i className="fa-solid fa-spinner fa-spin" />
                : <i className={`fa-solid ${isExpense ? 'fa-arrow-up' : 'fa-arrow-down'} text-xs`} />
              }
              {isExpense ? 'Xác nhận chi' : 'Xác nhận thu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function CashFlowTab({
  embedded = false,
  onNavigateToInvoices,
}: {
  embedded?: boolean
  onNavigateToInvoices?: () => void
} = {}) {
  const queryClient = useQueryClient()
  const { data: transactions = [] } = useQuery({ queryKey: ['cashTransactions'], queryFn: getCashTransactions })
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: appSettings } = useQuery({ queryKey: ['appSettings'], queryFn: getAppSettings })
  const [editing, setEditing] = useState<CashTransaction | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | CashTransactionType>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | CashTransactionCategory>('all')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())

  const deleteMutation = useMutation({
    mutationFn: deleteCashTransaction,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cashTransactions'] }),
  })

  const monthOptions = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
      return { month: date.getMonth() + 1, year: date.getFullYear() }
    })
  }, [])

  const roomById = useMemo(() => new Map(rooms.map(room => [room.id, room])), [rooms])
  const invoiceIncomeRows = useMemo(() => buildInvoiceIncomeRows(invoices), [invoices])
  const allRows = useMemo<CashFlowRow[]>(
    () =>
      [...invoiceIncomeRows, ...transactions.map(item => ({ ...item, source: 'manual' as const }))].sort((a, b) => {
        const dateDiff = new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
        if (dateDiff !== 0) return dateDiff
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }),
    [invoiceIncomeRows, transactions]
  )

  const filtered = useMemo(() => allRows.filter(item => {
    const date = new Date(item.transaction_date)
    if (date.getMonth() + 1 !== month || date.getFullYear() !== year) return false
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
    return true
  }), [allRows, categoryFilter, month, typeFilter, year])

  const totalIncome = filtered.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)
  const totalExpense = filtered.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)

  const openingDate = appSettings?.opening_balance_date || ''
  const openingCash = appSettings?.opening_balance_cash ?? 0
  const openingBank = appSettings?.opening_balance_bank ?? 0
  const hasOpeningBalance = Boolean(openingDate)

  // All rows from opening date onwards sorted ascending for running balance
  const rowsFromOpening = useMemo(() => {
    if (!openingDate) return []
    return [...allRows]
      .filter(r => r.transaction_date >= openingDate)
      .sort((a, b) => {
        const d = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
        return d !== 0 ? d : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })
  }, [allRows, openingDate])

  const { balanceMap, currentCashBalance, currentBankBalance } = useMemo(() => {
    let cashBal = openingCash
    let bankBal = openingBank
    let totalBal = openingCash + openingBank
    const map = new Map<string, number>()
    for (const row of rowsFromOpening) {
      const delta = row.type === 'income' ? row.amount : -row.amount
      totalBal += delta
      if (row.payment_method === 'cash') cashBal += delta
      else if (row.payment_method === 'transfer') bankBal += delta
      map.set(row.id, totalBal)
    }
    return { balanceMap: map, currentCashBalance: cashBal, currentBankBalance: bankBal }
  }, [rowsFromOpening, openingCash, openingBank])

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (transaction: CashTransaction) => {
    setEditing(transaction)
    setModalOpen(true)
  }

  return (
    <div className={embedded ? 'space-y-4' : 'flex-1 overflow-y-auto p-4 space-y-4 bg-[#f5f6f8]'}>

      {/* Balance widget — hiện khi đã setup số dư ban đầu */}
      {hasOpeningBalance && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <i className="fa-solid fa-money-bill-wave" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tiền mặt</p>
              <p className={`text-lg font-black tabular-nums ${currentCashBalance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                {formatVND(currentCashBalance)} đ
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <i className="fa-solid fa-building-columns" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Ngân hàng</p>
              <p className={`text-lg font-black tabular-nums ${currentBankBalance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                {formatVND(currentBankBalance)} đ
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <i className="fa-solid fa-wallet" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Tổng tồn quỹ</p>
              <p className={`text-lg font-black tabular-nums ${currentCashBalance + currentBankBalance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {formatVND(currentCashBalance + currentBankBalance)} đ
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-emerald-100 flex items-center justify-center text-emerald-600 text-xl">
              <i className="fa-solid fa-wallet"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Thu / Chi</h2>
              <p className="text-xs text-gray-500">Khoản thu được lấy tự động từ tab Hóa đơn theo từng lần thu; tại đây bạn quản lý thêm các chứng từ chi và khoản thu khác.</p>
            </div>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-bold text-sm transition">
            <i className="fa-solid fa-plus"></i>
            Thêm thu/chi
          </button>
        </div>

        <div className="px-4 pt-3 overflow-x-auto border-b border-gray-100">
          <div className="flex gap-1.5 pb-0 min-w-max">
            {monthOptions.map(opt => {
              const active = month === opt.month && year === opt.year
              return (
                <button
                  key={`${opt.month}-${opt.year}`}
                  onClick={() => { setMonth(opt.month); setYear(opt.year) }}
                  className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${active ? 'bg-green-100 text-green-700 border-b-2 border-green-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                >
                  T.{opt.month} {opt.year}
                </button>
              )
            })}
          </div>
        </div>

        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <select value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)} className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none focus:border-green-400">
            <option value="all">Tất cả thu/chi</option>
            <option value="income">Chỉ thu</option>
            <option value="expense">Chỉ chi</option>
          </select>
          <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value as typeof categoryFilter)} className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none focus:border-green-400">
            <option value="all">Tất cả nhóm</option>
            {CATEGORY_OPTIONS.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <div className="font-bold text-emerald-700">Thu: {formatVND(totalIncome)} đ</div>
            <div className="font-bold text-red-600">Chi: {formatVND(totalExpense)} đ</div>
            <div className={`font-black ${totalIncome - totalExpense >= 0 ? 'text-sky-700' : 'text-red-700'}`}>
              Chênh lệch: {formatVND(totalIncome - totalExpense)} đ
            </div>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[320px]">
          <table className="w-full text-left text-sm">
            <thead className="bg-blue-50 text-gray-600 text-xs font-semibold sticky top-0 z-10 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Loại</th>
                <th className="px-4 py-3">Nhóm</th>
                <th className="px-4 py-3">Phòng</th>
                <th className="px-4 py-3 text-right">Số tiền</th>
                <th className="px-4 py-3">Phương thức</th>
                {hasOpeningBalance && <th className="px-4 py-3 text-right">Số dư</th>}
                <th className="px-4 py-3">Ghi chú</th>
                <th className="px-4 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-700">{new Date(item.transaction_date).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded text-[11px] font-black ${item.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {item.type === 'income' ? 'Thu' : 'Chi'}
                      </span>
                      {item.source === 'invoice' && (
                        onNavigateToInvoices ? (
                          <button
                            onClick={onNavigateToInvoices}
                            className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-[10px] font-black hover:bg-blue-200 transition flex items-center gap-1"
                            title="Xem hóa đơn"
                          >
                            <i className="fa-solid fa-link text-[9px]" />
                            Hóa đơn
                          </button>
                        ) : (
                          <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-[10px] font-black">
                            Hóa đơn
                          </span>
                        )
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-800">{categoryLabel(item.category)}</td>
                  <td className="px-4 py-3 text-gray-600">{item.room_id ? roomById.get(item.room_id)?.name || 'Không rõ' : 'Không gắn phòng'}</td>
                  <td className={`px-4 py-3 text-right font-black tabular-nums ${item.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {item.type === 'expense' ? '-' : ''}{formatVND(item.amount)} đ
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.payment_method === 'cash' ? 'Tiền mặt' : item.payment_method === 'transfer' ? 'Chuyển khoản' : '—'}</td>
                  {hasOpeningBalance && (
                    <td className="px-4 py-3 text-right tabular-nums">
                      {balanceMap.has(item.id) ? (
                        <span className={`font-bold text-xs ${(balanceMap.get(item.id) ?? 0) >= 0 ? 'text-sky-700' : 'text-red-600'}`}>
                          {formatVND(balanceMap.get(item.id) ?? 0)} đ
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-500 max-w-[260px] truncate">{item.note || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      {item.source === 'manual' ? (
                        <>
                          <button onClick={() => openEdit(item)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-blue-50 hover:text-blue-600 transition">
                            <i className="fa-solid fa-pen text-xs"></i>
                          </button>
                          <button onClick={() => deleteMutation.mutate(item.id)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-red-50 hover:text-red-600 transition">
                            <i className="fa-solid fa-trash text-xs"></i>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          title="Dòng này lấy tự động từ lịch sử thanh toán hóa đơn."
                          className="w-8 h-8 rounded-lg border border-gray-200 text-gray-400 cursor-default"
                        >
                          <i className="fa-solid fa-ellipsis"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={hasOpeningBalance ? 9 : 8} className="px-4 py-12 text-center text-gray-400">Chưa có chứng từ thu/chi trong kỳ này.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <CashTransactionModal
          transaction={editing}
          onClose={() => {
            setModalOpen(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
