import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCashTransaction,
  deleteCashTransaction,
  DEFAULT_EXPENSE_CATEGORIES,
  getCashTransactions,
  getAppSettings,
  getInvoices,
  getInvoicePaymentRecords,
  getRooms,
  updateCashTransaction,
  type CashTransaction,
  type CashTransactionCategory,
  type CashTransactionType,
  type ExpenseCategory,
  type Invoice,
  type InvoicePaymentRecord,
  type PaymentMethod,
  type AppUser
} from '../lib/db'
import type { ReportPeriod } from './BusinessReport'

const formatVND = (value: number) => new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))
const todayIso = () => new Date().toISOString().split('T')[0]

const formatDateToDDMMYYYY = (date: Date | string | number) => {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

type CategoryOption = { value: CashTransactionCategory; label: string; type: CashTransactionType }

type BuildingOption = { value: string; label: string }

const toCategoryOptions = (categories: ExpenseCategory[]): CategoryOption[] =>
  categories.map((item) => ({ value: item.value, label: item.name, type: item.type }))

const categoryLabel = (category: CashTransactionCategory, options: CategoryOption[]) =>
  options.find((item) => item.value === category)?.label || 'Khác'

const isUtilityBuildingCategory = (category?: string) =>
  category === 'electric' || category === 'water'

const getBuildingLabelFromToken = (value?: string) => {
  const match = (value || '').match(/^building:(\d+)$/i)
  return match ? `Tòa ${match[1]}` : ''
}

const getBuildingNumberFromRoomName = (roomName?: string) => roomName?.match(/\d+/)?.[0]?.[0] || ''

const getCashTargetLabel = (
  item: Pick<CashTransaction, 'room_id' | 'category'>,
  roomById: Map<string, { name: string }>
) => {
  const buildingLabel = getBuildingLabelFromToken(item.room_id)
  if (buildingLabel) return buildingLabel
  if (item.room_id) return roomById.get(item.room_id)?.name || 'Không rõ'
  return isUtilityBuildingCategory(item.category) ? 'Không gắn tòa' : 'Không gắn phòng'
}

type CashFlowRow =
  | (CashTransaction & { source: 'manual' })
  | (CashTransaction & {
      source: 'invoice'
      invoiceId: string
      invoiceStatus: Invoice['payment_status']
      paymentRecordId: string
    })

type ConfirmAction =
  | { type: 'edit'; transaction: CashTransaction }
  | { type: 'delete'; transaction: CashTransaction }

function ConfirmActionModal({
  action,
  isPending,
  onCancel,
  onConfirm
}: {
  action: ConfirmAction
  isPending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const isDelete = action.type === 'delete'
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${isDelete ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}
          >
            <i className={`fa-solid ${isDelete ? 'fa-trash' : 'fa-pen'} text-base`} />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900">
              {isDelete ? 'Xác nhận xóa chứng từ' : 'Xác nhận sửa chứng từ'}
            </h3>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              {isDelete
                ? 'Chứng từ này sẽ bị xóa khỏi sổ thu/chi. Thao tác này chỉ dành cho admin.'
                : 'Bạn sắp sửa thông tin chứng từ thu/chi. Thao tác này chỉ dành cho admin.'}
            </p>
          </div>
        </div>
        <div className="space-y-2 px-5 py-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Loại</span>
            <span
              className={`font-bold ${action.transaction.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}
            >
              {action.transaction.type === 'income' ? 'Thu' : 'Chi'}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Số tiền</span>
            <span className="font-black text-slate-900">
              {formatVND(action.transaction.amount)} đ
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Ngày</span>
            <span className="font-semibold text-slate-800">
              {formatDateToDDMMYYYY(action.transaction.transaction_date)}
            </span>
          </div>
        </div>
        <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:opacity-60 ${isDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {isPending ? 'Đang xử lý...' : isDelete ? 'Xóa chứng từ' : 'Tiếp tục sửa'}
          </button>
        </div>
      </div>
    </div>
  )
}

const buildInvoiceIncomeRows = (invoices: Invoice[]): CashFlowRow[] =>
  invoices
    .filter(
      (invoice) => invoice.payment_status !== 'cancelled' && invoice.payment_status !== 'merged'
    )
    .flatMap((invoice) =>
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
        note:
          record.note ||
          `Thu từ hóa đơn T${String(invoice.month).padStart(2, '0')}/${invoice.year}`,
        created_at: record.created_at || invoice.created_at,
        updated_at: record.created_at || invoice.created_at
      }))
    )

function CashTransactionModal({
  transaction,
  categoryOptions,
  onClose
}: {
  transaction: CashTransaction | null
  categoryOptions: CategoryOption[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const [type, setType] = useState<CashTransactionType>(transaction?.type || 'expense')
  const [category, setCategory] = useState<CashTransactionCategory>(
    transaction?.category ||
      categoryOptions.find((item) => item.type === (transaction?.type || 'expense'))?.value ||
      'other_expense'
  )
  const [amountDisplay, setAmountDisplay] = useState(
    transaction ? formatVND(transaction.amount) : ''
  )
  const [error, setError] = useState('')
  const [transactionDate, setTransactionDate] = useState(
    transaction?.transaction_date || todayIso()
  )

  const isExpense = type === 'expense'

  const mutation = useMutation({
    mutationFn: (payload: Partial<CashTransaction>) =>
      transaction ? updateCashTransaction(transaction.id, payload) : createCashTransaction(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashTransactions'] })
      onClose()
    },
    onError: (err: Error) => setError(err.message || 'Không thể lưu chứng từ.')
  })

  const categories = categoryOptions.filter((item) => item.type === type)
  const buildingOptions = useMemo<BuildingOption[]>(() => {
    const seen = new Set<string>()
    return rooms
      .map((room) => getBuildingNumberFromRoomName(room.name))
      .filter(Boolean)
      .sort()
      .filter((buildingNo) => {
        if (seen.has(buildingNo)) return false
        seen.add(buildingNo)
        return true
      })
      .map((buildingNo) => ({
        value: `building:${buildingNo}`,
        label: `Tòa ${buildingNo}`
      }))
  }, [rooms])

  const isBuildingTarget = isExpense && isUtilityBuildingCategory(category)

  React.useEffect(() => {
    const nextCategory =
      categories.find((item) => item.value === category)?.value || categories[0]?.value
    if (nextCategory && nextCategory !== category) {
      setCategory(nextCategory)
    }
  }, [categories, category])

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
      category,
      transaction_date: String(form.get('transaction_date') || todayIso()),
      amount,
      room_id: String(form.get(isBuildingTarget ? 'building_id' : 'room_id') || '') || undefined,
      payment_method: (String(form.get('payment_method') || '') || undefined) as
        | PaymentMethod
        | undefined,
      note: String(form.get('note') || '')
    })
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Colored header ── */}
        <div
          className={`px-6 pt-5 pb-10 transition-colors duration-200 ${isExpense ? 'bg-red-500' : 'bg-emerald-500'}`}
        >
          <div className="flex items-center justify-between mb-5">
            <span className="text-white/80 text-sm font-semibold">
              {transaction ? 'Sửa chứng từ' : 'Thêm chứng từ'}
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white transition flex items-center justify-center"
            >
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
                !isExpense
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-arrow-down text-xs" /> Thu tiền
            </button>
          </div>

          {/* Amount — hero */}
          <div className="text-center">
            <p className="text-white/60 text-[11px] font-bold uppercase tracking-widest mb-3">
              Số tiền
            </p>
            <div className="relative flex items-center justify-center">
              {/* Input ẩn — chỉ bắt phím, không hiển thị */}
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                value={amountDisplay}
                onChange={handleAmountChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.currentTarget.form?.requestSubmit()
                  }
                }}
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Nhóm
                </p>
                <select
                  key={type}
                  name="category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as CashTransactionCategory)}
                  className="w-full text-sm font-semibold text-slate-800 bg-transparent outline-none"
                >
                  {categories.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="p-4 space-y-1 border-l border-slate-100 focus-within:bg-slate-50/30 transition">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Ngày phát sinh
                </p>
                <SegmentedDateInput
                  name="transaction_date"
                  value={transactionDate}
                  onChange={setTransactionDate}
                />
              </div>
            </div>

            <div className="grid grid-cols-2">
              <div className="p-4 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Phương thức
                </p>
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {isBuildingTarget ? 'Gắn tòa' : 'Gắn phòng'}
                </p>
                {isBuildingTarget ? (
                  <select
                    name="building_id"
                    defaultValue={
                      getBuildingLabelFromToken(transaction?.room_id)
                        ? transaction?.room_id || ''
                        : ''
                    }
                    className="w-full text-sm font-semibold text-slate-800 bg-transparent outline-none"
                  >
                    <option value="">Không gắn tòa</option>
                    {buildingOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    name="room_id"
                    defaultValue={transaction?.room_id || ''}
                    className="w-full text-sm font-semibold text-slate-800 bg-transparent outline-none"
                  >
                    <option value="">Không gắn phòng</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="p-4 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Ghi chú
              </p>
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
              {mutation.isPending ? (
                <i className="fa-solid fa-spinner fa-spin" />
              ) : (
                <i className={`fa-solid ${isExpense ? 'fa-arrow-up' : 'fa-arrow-down'} text-xs`} />
              )}
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
  currentUser,
  onNavigateToInvoices,
  period
}: {
  embedded?: boolean
  currentUser?: AppUser | null
  onNavigateToInvoices?: () => void
  period?: ReportPeriod
} = {}) {
  const queryClient = useQueryClient()
  const { data: transactions = [] } = useQuery({
    queryKey: ['cashTransactions'],
    queryFn: getCashTransactions
  })
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: appSettings } = useQuery({ queryKey: ['appSettings'], queryFn: getAppSettings })
  const [editing, setEditing] = useState<CashTransaction | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | CashTransactionType>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | CashTransactionCategory>('all')

  const deleteMutation = useMutation({
    mutationFn: deleteCashTransaction,
    onSuccess: () => {
      setConfirmAction(null)
      queryClient.invalidateQueries({ queryKey: ['cashTransactions'] })
    }
  })
  const isAdmin = currentUser?.role === 'admin'

  const categoryOptions = useMemo(() => toCategoryOptions(DEFAULT_EXPENSE_CATEGORIES), [])

  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms])
  const invoiceIncomeRows = useMemo(() => buildInvoiceIncomeRows(invoices), [invoices])
  const allRows = useMemo<CashFlowRow[]>(
    () =>
      [
        ...invoiceIncomeRows,
        ...transactions.map((item) => ({ ...item, source: 'manual' as const }))
      ].sort((a, b) => {
        const dateDiff =
          new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
        if (dateDiff !== 0) return dateDiff
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }),
    [invoiceIncomeRows, transactions]
  )

  const filtered = useMemo(
    () =>
      allRows.filter((item) => {
        const date = new Date(item.transaction_date)
        date.setHours(0, 0, 0, 0)
        if (period?.start && period?.end && (date < period.start || date > period.end)) return false
        if (typeFilter !== 'all' && item.type !== typeFilter) return false
        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
        return true
      }),
    [allRows, categoryFilter, period, typeFilter]
  )

  const totalIncome = filtered
    .filter((item) => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0)
  const totalExpense = filtered
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0)

  const openingDate = appSettings?.opening_balance_date || ''
  const openingCash = appSettings?.opening_balance_cash ?? 0
  const openingBank = appSettings?.opening_balance_bank ?? 0
  const hasOpeningBalance = Boolean(openingDate)

  // All rows from opening date onwards sorted ascending for running balance
  const rowsFromOpening = useMemo(() => {
    if (!openingDate) return []
    return [...allRows]
      .filter((r) => r.transaction_date >= openingDate)
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

  const requestEdit = (transaction: CashTransaction) => {
    if (!isAdmin) return
    setConfirmAction({ type: 'edit', transaction })
  }

  const requestDelete = (transaction: CashTransaction) => {
    if (!isAdmin) return
    setConfirmAction({ type: 'delete', transaction })
  }

  const confirmPendingAction = () => {
    if (!confirmAction || !isAdmin) return
    if (confirmAction.type === 'edit') {
      const transaction = confirmAction.transaction
      setConfirmAction(null)
      openEdit(transaction)
      return
    }
    deleteMutation.mutate(confirmAction.transaction.id)
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
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Tiền mặt
              </p>
              <p
                className={`text-lg font-black tabular-nums ${currentCashBalance >= 0 ? 'text-gray-800' : 'text-red-600'}`}
              >
                {formatVND(currentCashBalance)} đ
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <i className="fa-solid fa-building-columns" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Ngân hàng
              </p>
              <p
                className={`text-lg font-black tabular-nums ${currentBankBalance >= 0 ? 'text-gray-800' : 'text-red-600'}`}
              >
                {formatVND(currentBankBalance)} đ
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <i className="fa-solid fa-wallet" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                Tổng tồn quỹ
              </p>
              <p
                className={`text-lg font-black tabular-nums ${currentCashBalance + currentBankBalance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
              >
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
              <p className="text-xs text-gray-500">
                Khoản thu được lấy tự động từ tab Hóa đơn theo từng lần thu; tại đây bạn quản lý
                thêm các chứng từ chi và khoản thu khác.
              </p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-bold text-sm transition"
          >
            <i className="fa-solid fa-plus"></i>
            Thêm thu/chi
          </button>
        </div>

        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
            <i className="fa-regular fa-calendar mr-1 text-slate-400"></i>
            {period?.label || 'Toàn thời gian'}
          </div>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none focus:border-green-400"
          >
            <option value="all">Tất cả thu/chi</option>
            <option value="income">Chỉ thu</option>
            <option value="expense">Chỉ chi</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none focus:border-green-400"
          >
            <option value="all">Tất cả nhóm</option>
            {categoryOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <div className="font-bold text-emerald-700">Thu: {formatVND(totalIncome)} đ</div>
            <div className="font-bold text-red-600">Chi: {formatVND(totalExpense)} đ</div>
            <div
              className={`font-black ${totalIncome - totalExpense >= 0 ? 'text-sky-700' : 'text-red-700'}`}
            >
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
                <th className="px-4 py-3">Phòng / Tòa</th>
                <th className="px-4 py-3 text-right">Số tiền</th>
                <th className="px-4 py-3">Phương thức</th>
                {hasOpeningBalance && <th className="px-4 py-3 text-right">Số dư</th>}
                <th className="px-4 py-3">Ghi chú</th>
                <th className="px-4 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-700">
                    {formatDateToDDMMYYYY(item.transaction_date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 rounded text-[11px] font-black ${item.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                      >
                        {item.type === 'income' ? 'Thu' : 'Chi'}
                      </span>
                      {item.source === 'invoice' &&
                        (onNavigateToInvoices ? (
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
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-800">
                    {categoryLabel(item.category, categoryOptions)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {getCashTargetLabel(item, roomById as Map<string, { name: string }>)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-black tabular-nums ${item.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}
                  >
                    {item.type === 'expense' ? '-' : ''}
                    {formatVND(item.amount)} đ
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.payment_method === 'cash'
                      ? 'Tiền mặt'
                      : item.payment_method === 'transfer'
                        ? 'Chuyển khoản'
                        : '—'}
                  </td>
                  {hasOpeningBalance && (
                    <td className="px-4 py-3 text-right tabular-nums">
                      {balanceMap.has(item.id) ? (
                        <span
                          className={`font-bold text-xs ${(balanceMap.get(item.id) ?? 0) >= 0 ? 'text-sky-700' : 'text-red-600'}`}
                        >
                          {formatVND(balanceMap.get(item.id) ?? 0)} đ
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  )}
                  <td
                    className="min-w-[280px] max-w-[520px] px-4 py-3 align-top leading-5 text-gray-500 whitespace-normal break-words"
                    title={item.note || undefined}
                  >
                    {item.note || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      {item.source === 'manual' ? (
                        <>
                          <button
                            onClick={() => requestEdit(item)}
                            disabled={!isAdmin}
                            title={isAdmin ? 'Sửa chứng từ' : 'Chỉ admin mới được sửa'}
                            className="w-8 h-8 rounded-lg border border-gray-200 transition hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-inherit"
                          >
                            <i className="fa-solid fa-pen text-xs"></i>
                          </button>
                          <button
                            onClick={() => requestDelete(item)}
                            disabled={!isAdmin}
                            title={isAdmin ? 'Xóa chứng từ' : 'Chỉ admin mới được xóa'}
                            className="w-8 h-8 rounded-lg border border-gray-200 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-inherit"
                          >
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
                  <td
                    colSpan={hasOpeningBalance ? 9 : 8}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    Chưa có chứng từ thu/chi trong kỳ này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <CashTransactionModal
          transaction={editing}
          categoryOptions={categoryOptions}
          onClose={() => {
            setModalOpen(false)
            setEditing(null)
          }}
        />
      )}
      {confirmAction && (
        <ConfirmActionModal
          action={confirmAction}
          isPending={deleteMutation.isPending}
          onCancel={() => {
            if (!deleteMutation.isPending) setConfirmAction(null)
          }}
          onConfirm={confirmPendingAction}
        />
      )}
    </div>
  )
}

export function SegmentedDateInput({
  value,
  onChange,
  name
}: {
  value: string
  onChange: (value: string) => void
  name?: string
}) {
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')

  const dayRef = React.useRef<HTMLInputElement>(null)
  const monthRef = React.useRef<HTMLInputElement>(null)
  const yearRef = React.useRef<HTMLInputElement>(null)
  const dateInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (value) {
      const parts = value.split('-')
      if (parts.length === 3) {
        setYear(parts[0])
        setMonth(parts[1])
        setDay(parts[2])
      }
    } else {
      setDay('')
      setMonth('')
      setYear('')
    }
  }, [value])

  const triggerChange = (newDay: string, newMonth: string, newYear: string) => {
    const d = newDay.padStart(2, '0')
    const m = newMonth.padStart(2, '0')
    const y = newYear
    if (d && m && y && y.length === 4) {
      const dateStr = `${y}-${m}-${d}`
      const dateObj = new Date(dateStr)
      if (!isNaN(dateObj.getTime())) {
        onChange(dateStr)
      }
    }
  }

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2)
    setDay(val)
    if (val.length === 2) {
      monthRef.current?.focus()
      monthRef.current?.select()
    }
    triggerChange(val, month, year)
  }

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2)
    setMonth(val)
    if (val.length === 2) {
      yearRef.current?.focus()
      yearRef.current?.select()
    }
    triggerChange(day, val, year)
  }

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
    setYear(val)
    triggerChange(day, month, val)
  }

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    type: 'day' | 'month' | 'year'
  ) => {
    const isUp = e.key === 'ArrowUp'
    const isDown = e.key === 'ArrowDown'
    const isLeft = e.key === 'ArrowLeft'
    const isRight = e.key === 'ArrowRight'

    if (isUp || isDown) {
      e.preventDefault()
      let currentVal = parseInt(type === 'day' ? day : type === 'month' ? month : year, 10) || 0
      const delta = isUp ? 1 : -1

      if (type === 'day') {
        let maxDays = 31
        if (month) {
          const m = parseInt(month, 10)
          const y = parseInt(year, 10) || new Date().getFullYear()
          maxDays = new Date(y, m, 0).getDate()
        }
        currentVal = ((currentVal - 1 + delta + maxDays) % maxDays) + 1
        const nextDay = String(currentVal).padStart(2, '0')
        setDay(nextDay)
        triggerChange(nextDay, month, year)
      } else if (type === 'month') {
        currentVal = ((currentVal - 1 + delta + 12) % 12) + 1
        const nextMonth = String(currentVal).padStart(2, '0')
        setMonth(nextMonth)
        triggerChange(day, nextMonth, year)
      } else if (type === 'year') {
        currentVal += delta
        if (currentVal < 1000) currentVal = new Date().getFullYear()
        const nextYear = String(currentVal)
        setYear(nextYear)
        triggerChange(day, month, nextYear)
      }
      setTimeout(() => e.currentTarget.select(), 0)
    }

    if (isLeft && e.currentTarget.selectionStart === 0) {
      e.preventDefault()
      if (type === 'month') {
        dayRef.current?.focus()
        dayRef.current?.select()
      } else if (type === 'year') {
        monthRef.current?.focus()
        monthRef.current?.select()
      }
    }
    if (isRight && e.currentTarget.selectionEnd === e.currentTarget.value.length) {
      e.preventDefault()
      if (type === 'day') {
        monthRef.current?.focus()
        monthRef.current?.select()
      } else if (type === 'month') {
        yearRef.current?.focus()
        yearRef.current?.select()
      }
    }
  }

  const handleBlur = (type: 'day' | 'month' | 'year') => {
    if (type === 'day' && day) {
      const d = String(Math.max(1, Math.min(31, parseInt(day, 10) || 1))).padStart(2, '0')
      setDay(d)
      triggerChange(d, month, year)
    } else if (type === 'month' && month) {
      const m = String(Math.max(1, Math.min(12, parseInt(month, 10) || 1))).padStart(2, '0')
      setMonth(m)
      triggerChange(day, m, year)
    } else if (type === 'year' && year) {
      let y = year
      if (y.length < 4) {
        y = String(new Date().getFullYear())
      }
      setYear(y)
      triggerChange(day, month, y)
    }
  }

  return (
    <div className="flex items-center w-full justify-between">
      <div className="flex items-center text-sm font-semibold text-slate-800 bg-transparent outline-none">
        <input
          ref={dayRef}
          type="text"
          value={day}
          onChange={handleDayChange}
          onKeyDown={(e) => handleKeyDown(e, 'day')}
          onBlur={() => handleBlur('day')}
          onFocus={(e) => e.target.select()}
          placeholder="dd"
          className="w-6 text-center bg-transparent outline-none focus:bg-slate-100 rounded select-all"
        />
        <span className="text-slate-400 mx-0.5">/</span>
        <input
          ref={monthRef}
          type="text"
          value={month}
          onChange={handleMonthChange}
          onKeyDown={(e) => handleKeyDown(e, 'month')}
          onBlur={() => handleBlur('month')}
          onFocus={(e) => e.target.select()}
          placeholder="mm"
          className="w-6 text-center bg-transparent outline-none focus:bg-slate-100 rounded select-all"
        />
        <span className="text-slate-400 mx-0.5">/</span>
        <input
          ref={yearRef}
          type="text"
          value={year}
          onChange={handleYearChange}
          onKeyDown={(e) => handleKeyDown(e, 'year')}
          onBlur={() => handleBlur('year')}
          onFocus={(e) => e.target.select()}
          placeholder="yyyy"
          className="w-10 text-center bg-transparent outline-none focus:bg-slate-100 rounded select-all"
        />
      </div>
      <div className="relative w-5 h-5 flex items-center justify-center ml-2 shrink-0">
        <i className="fa-regular fa-calendar text-slate-400 text-xs pointer-events-none" />
        <input
          ref={dateInputRef}
          name={name}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
    </div>
  )
}
