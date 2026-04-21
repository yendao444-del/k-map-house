import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCashTransaction,
  deleteCashTransaction,
  getCashTransactions,
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
  const [error, setError] = useState('')

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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(String(form.get('amount') || '').replace(/\D/g, '')) || 0
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
    <div className="fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-lg font-black text-slate-900">{transaction ? 'Sửa chứng từ' : 'Thêm chứng từ thu / chi'}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Dữ liệu này dùng cho khoản chi thực tế và khoản thu ngoài hóa đơn.</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-slate-200 text-slate-500 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">Loại chứng từ</span>
                <select
                  value={type}
                  onChange={event => setType(event.target.value as CashTransactionType)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold bg-white outline-none focus:border-primary"
                >
                  <option value="expense">Chi</option>
                  <option value="income">Thu</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">Nhóm</span>
                <select
                  name="category"
                  defaultValue={transaction?.category || categories[0]?.value}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold bg-white outline-none focus:border-primary"
                >
                  {categories.map(item => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">Ngày phát sinh</span>
                <input
                  name="transaction_date"
                  type="date"
                  defaultValue={transaction?.transaction_date || todayIso()}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">Số tiền</span>
                <div className="relative">
                  <input
                    name="amount"
                    type="text"
                    defaultValue={transaction ? formatVND(transaction.amount) : ''}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-lg px-3 pr-10 py-2.5 text-sm font-black tabular-nums outline-none focus:border-primary"
                  />
                  <span className="absolute right-3 top-3 text-[10px] font-bold text-slate-400">VNĐ</span>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">Gắn phòng</span>
                <select
                  name="room_id"
                  defaultValue={transaction?.room_id || ''}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold bg-white outline-none focus:border-primary"
                >
                  <option value="">Không gắn phòng</option>
                  {rooms.map(room => (
                    <option key={room.id} value={room.id}>{room.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold text-slate-600">Phương thức</span>
                <select
                  name="payment_method"
                  defaultValue={transaction?.payment_method || ''}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold bg-white outline-none focus:border-primary"
                >
                  <option value="">Không ghi nhận</option>
                  <option value="cash">Tiền mặt</option>
                  <option value="transfer">Chuyển khoản</option>
                </select>
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs font-bold text-slate-600">Ghi chú</span>
              <textarea
                name="note"
                defaultValue={transaction?.note || ''}
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary resize-none"
                placeholder="VD: Hóa đơn điện tháng 04/2026, sửa vòi nước phòng 101..."
              />
            </label>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100">Hủy</button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-60 flex items-center gap-2"
            >
              {mutation.isPending ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-floppy-disk"></i>}
              Lưu chứng từ
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function CashFlowTab() {
  const queryClient = useQueryClient()
  const { data: transactions = [] } = useQuery({ queryKey: ['cashTransactions'], queryFn: getCashTransactions })
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
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

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (transaction: CashTransaction) => {
    setEditing(transaction)
    setModalOpen(true)
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f5f6f8]">
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
            Thêm chứng từ
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
                        <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-[10px] font-black">
                          Hóa đơn
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-800">{categoryLabel(item.category)}</td>
                  <td className="px-4 py-3 text-gray-600">{item.room_id ? roomById.get(item.room_id)?.name || 'Không rõ' : 'Không gắn phòng'}</td>
                  <td className={`px-4 py-3 text-right font-black tabular-nums ${item.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {item.type === 'expense' ? '-' : ''}{formatVND(item.amount)} đ
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.payment_method === 'cash' ? 'Tiền mặt' : item.payment_method === 'transfer' ? 'Chuyển khoản' : '—'}</td>
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
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">Chưa có chứng từ thu/chi trong kỳ này.</td>
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
