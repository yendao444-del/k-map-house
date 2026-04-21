import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getCashTransactions,
  getInvoices,
  getInvoicePaymentRecords,
  getRooms,
  getTenants,
  type CashTransaction,
  type CashTransactionCategory,
  type Invoice,
  type InvoicePaymentRecord,
} from '../lib/db'

type InvoiceDrillType =
  | 'roomMonthly'
  | 'roomFirstMonth'
  | 'roomTransfer'
  | 'electric'
  | 'water'
  | 'internet'
  | 'cleaning'
  | 'transferService'
  | 'adjustment'
  | 'damage'
  | 'oldDebt'
  | 'deposit'
  | 'refund'
  | 'cash'
  | 'receivable'

type Drill =
  | { mode: 'invoice'; type: InvoiceDrillType; title: string }
  | { mode: 'cash'; type: 'income' | 'expense'; category?: CashTransactionCategory; title: string }

type PnlSection = 'revenue' | 'deposit' | 'opex' | 'result'

type PnlRow = {
  key: string
  label: string
  amount: number
  section: PnlSection
  invoiceType?: InvoiceDrillType
  cashType?: 'income' | 'expense'
  cashCategory?: CashTransactionCategory
  group?: boolean
  total?: boolean
  indent?: boolean
  color?: string
}

type InvoiceCashRow = {
  invoice: Invoice
  record: InvoicePaymentRecord
}

const fmt = (value: number) => new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))
const iso = (date: Date) => date.toISOString().split('T')[0]

const EXPENSE_CATEGORIES: Array<{ value: CashTransactionCategory; label: string }> = [
  { value: 'electric', label: 'Hóa đơn điện tổng' },
  { value: 'water', label: 'Hóa đơn nước tổng' },
  { value: 'internet', label: 'Internet / wifi' },
  { value: 'cleaning', label: 'Rác / vệ sinh / môi trường' },
  { value: 'maintenance', label: 'Bảo trì / sửa chữa' },
  { value: 'management', label: 'Lương / quản lý' },
  { value: 'software', label: 'Phần mềm / công cụ' },
  { value: 'other_expense', label: 'Chi phí khác' },
]

const categoryLabel = (category: CashTransactionCategory) =>
  EXPENSE_CATEGORIES.find(item => item.value === category)?.label || (category === 'other_income' ? 'Khoản thu khác' : 'Khác')

const getInvoiceDate = (invoice: Invoice) =>
  invoice.invoice_date || invoice.payment_date || invoice.created_at?.split('T')[0] || `${invoice.year}-${String(invoice.month).padStart(2, '0')}-01`

const toDate = (value: string) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const getInvoiceDrillAmount = (invoice: Invoice, type: InvoiceDrillType) => {
  switch (type) {
    case 'roomMonthly':
      return invoice.is_first_month ? 0 : (invoice.room_cost || 0)
    case 'roomFirstMonth':
      return invoice.is_first_month ? (invoice.room_cost || 0) + (invoice.new_room_cost || 0) : 0
    case 'roomTransfer':
      return invoice.transfer_room_cost || 0
    case 'electric':
      return (invoice.electric_cost || 0) + (invoice.transfer_electric_cost || 0)
    case 'water':
      return (invoice.water_cost || 0) + (invoice.transfer_water_cost || 0)
    case 'internet':
      return invoice.wifi_cost || 0
    case 'cleaning':
      return invoice.garbage_cost || 0
    case 'transferService':
      return (invoice.new_room_service_cost || 0) + (invoice.transfer_service_cost || 0)
    case 'adjustment':
      return invoice.adjustment_amount || 0
    case 'damage':
      return invoice.damage_amount || 0
    case 'oldDebt':
      return (invoice.old_debt || 0) + (invoice.merged_debt_total || 0)
    case 'deposit':
      return Math.max(0, invoice.deposit_amount || 0)
    case 'refund':
      return Math.abs(Math.min(0, invoice.deposit_amount || 0)) + Math.abs(Math.min(0, invoice.total_amount || 0))
    case 'cash':
      return invoice.paid_amount || 0
    case 'receivable':
      return Math.max(0, (invoice.total_amount || 0) - (invoice.paid_amount || 0))
    default:
      return 0
  }
}

export function BusinessReport() {
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })
  const { data: cashTransactions = [] } = useQuery({ queryKey: ['cashTransactions'], queryFn: getCashTransactions })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: getTenants })

  const today = new Date()
  const [viewMode, setViewMode] = useState<'range' | 'daily'>('range')
  const [startDate, setStartDate] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [endDate, setEndDate] = useState(iso(today))
  const [selectedDate, setSelectedDate] = useState(iso(today))
  const [drill, setDrill] = useState<Drill | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<PnlSection>>(
    () => new Set(['revenue', 'deposit', 'opex'])
  )

  const period = useMemo(() => {
    const start = viewMode === 'daily' ? selectedDate : startDate
    const end = viewMode === 'daily' ? selectedDate : endDate
    const startObj = toDate(start)
    const endObj = toDate(end)
    const safeStart = startObj <= endObj ? startObj : endObj
    const safeEnd = startObj <= endObj ? endObj : startObj
    const days = Math.max(1, Math.round((safeEnd.getTime() - safeStart.getTime()) / 86400000) + 1)
    return { start: safeStart, end: safeEnd, days }
  }, [endDate, selectedDate, startDate, viewMode])

  const filteredInvoices = useMemo(() => invoices.filter(invoice => {
    if (invoice.payment_status === 'cancelled' || invoice.payment_status === 'merged') return false
    const date = toDate(getInvoiceDate(invoice))
    return date >= period.start && date <= period.end
  }), [invoices, period.end, period.start])

  const filteredCash = useMemo(() => cashTransactions.filter(item => {
    const date = toDate(item.transaction_date || item.created_at)
    return date >= period.start && date <= period.end
  }), [cashTransactions, period.end, period.start])

  const invoiceCashRows = useMemo<InvoiceCashRow[]>(() => invoices.flatMap(invoice => {
    if (invoice.payment_status === 'cancelled' || invoice.payment_status === 'merged') return []
    return getInvoicePaymentRecords(invoice)
      .filter(record => {
        const date = toDate(record.payment_date || record.created_at)
        return date >= period.start && date <= period.end
      })
      .map(record => ({ invoice, record }))
  }), [invoices, period.end, period.start])

  const roomById = useMemo(() => new Map(rooms.map(room => [room.id, room])), [rooms])
  const tenantById = useMemo(() => new Map(tenants.map(tenant => [tenant.id, tenant])), [tenants])

  const expenseByCategory = useMemo(() => {
    const map = new Map<CashTransactionCategory, number>()
    for (const category of EXPENSE_CATEGORIES) map.set(category.value, 0)
    for (const item of filteredCash) {
      if (item.type !== 'expense') continue
      map.set(item.category, (map.get(item.category) || 0) + item.amount)
    }
    return map
  }, [filteredCash])

  const pnl = useMemo(() => {
    const sumInvoice = (type: InvoiceDrillType) => filteredInvoices.reduce((sum, invoice) => sum + getInvoiceDrillAmount(invoice, type), 0)
    const sumExpense = EXPENSE_CATEGORIES.reduce((sum, item) => sum + (expenseByCategory.get(item.value) || 0), 0)
    const cashIncome = filteredCash.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)

    const roomMonthly = sumInvoice('roomMonthly')
    const roomFirstMonth = sumInvoice('roomFirstMonth')
    const roomTransfer = sumInvoice('roomTransfer')
    const electricRevenue = sumInvoice('electric')
    const waterRevenue = sumInvoice('water')
    const internetRevenue = sumInvoice('internet')
    const cleaningRevenue = sumInvoice('cleaning')
    const transferServiceRevenue = sumInvoice('transferService')
    const adjustmentRevenue = sumInvoice('adjustment')
    const damageRevenue = sumInvoice('damage')
    const oldDebtRevenue = sumInvoice('oldDebt')
    const invoiceRevenue = roomMonthly + roomFirstMonth + roomTransfer + electricRevenue + waterRevenue + internetRevenue + cleaningRevenue + transferServiceRevenue + adjustmentRevenue + damageRevenue + oldDebtRevenue
    const operatingRevenue = invoiceRevenue + cashIncome

    const depositCollected = sumInvoice('deposit')
    const refundPayable = sumInvoice('refund')
    const cashCollected = invoiceCashRows.reduce((sum, item) => sum + item.record.amount, 0)
    const receivable = sumInvoice('receivable')
    const netProfit = operatingRevenue - sumExpense
    const cashFlow = cashCollected + cashIncome - sumExpense - refundPayable
    const margin = operatingRevenue > 0 ? (netProfit / operatingRevenue) * 100 : 0

    return {
      roomMonthly,
      roomFirstMonth,
      roomTransfer,
      electricRevenue,
      waterRevenue,
      internetRevenue,
      cleaningRevenue,
      transferServiceRevenue,
      adjustmentRevenue,
      damageRevenue,
      oldDebtRevenue,
      invoiceRevenue,
      cashIncome,
      operatingRevenue,
      depositCollected,
      refundPayable,
      cashCollected,
      receivable,
      operatingCost: sumExpense,
      netProfit,
      cashFlow,
      margin,
      invoiceCount: filteredInvoices.length,
      cashCount: filteredCash.length + invoiceCashRows.length,
    }
  }, [expenseByCategory, filteredCash, filteredInvoices, invoiceCashRows])

  const expenseRows: PnlRow[] = EXPENSE_CATEGORIES.map(item => ({
    key: `expense-${item.value}`,
    label: item.label,
    amount: -(expenseByCategory.get(item.value) || 0),
    section: 'opex',
    cashType: 'expense',
    cashCategory: item.value,
    indent: true,
  }))

  const rows: PnlRow[] = [
    { key: 'rev', label: 'A. Doanh thu vận hành', amount: pnl.operatingRevenue, section: 'revenue', group: true, color: 'text-emerald-700' },
    { key: 'roomMonthly', label: 'Tiền phòng hàng tháng', amount: pnl.roomMonthly, section: 'revenue', invoiceType: 'roomMonthly', indent: true },
    { key: 'roomFirstMonth', label: 'Tiền phòng tháng đầu', amount: pnl.roomFirstMonth, section: 'revenue', invoiceType: 'roomFirstMonth', indent: true },
    { key: 'roomTransfer', label: 'Tiền phòng chuyển đổi', amount: pnl.roomTransfer, section: 'revenue', invoiceType: 'roomTransfer', indent: true },
    { key: 'electric', label: 'Tiền điện thu khách', amount: pnl.electricRevenue, section: 'revenue', invoiceType: 'electric', indent: true },
    { key: 'water', label: 'Tiền nước thu khách', amount: pnl.waterRevenue, section: 'revenue', invoiceType: 'water', indent: true },
    { key: 'internet', label: 'Internet / wifi thu khách', amount: pnl.internetRevenue, section: 'revenue', invoiceType: 'internet', indent: true },
    { key: 'cleaning', label: 'Rác / vệ sinh thu khách', amount: pnl.cleaningRevenue, section: 'revenue', invoiceType: 'cleaning', indent: true },
    { key: 'transferService', label: 'Dịch vụ tháng đầu / chuyển phòng', amount: pnl.transferServiceRevenue, section: 'revenue', invoiceType: 'transferService', indent: true },
    { key: 'adjustment', label: 'Phụ thu / điều chỉnh', amount: pnl.adjustmentRevenue, section: 'revenue', invoiceType: 'adjustment', indent: true },
    { key: 'damage', label: 'Đền bù tài sản', amount: pnl.damageRevenue, section: 'revenue', invoiceType: 'damage', indent: true },
    { key: 'oldDebt', label: 'Nợ cũ / nợ gộp', amount: pnl.oldDebtRevenue, section: 'revenue', invoiceType: 'oldDebt', indent: true },
    { key: 'cashIncome', label: 'Khoản thu khác từ Thu / Chi', amount: pnl.cashIncome, section: 'revenue', cashType: 'income', indent: true },
    { key: 'depositGroup', label: 'B. Tiền cọc & tất toán', amount: pnl.depositCollected - pnl.refundPayable, section: 'deposit', group: true, color: 'text-blue-700' },
    { key: 'deposit', label: 'Tiền cọc đã ghi nhận', amount: pnl.depositCollected, section: 'deposit', invoiceType: 'deposit', indent: true },
    { key: 'refund', label: 'Hoàn cọc / khoản âm cần trả', amount: -pnl.refundPayable, section: 'deposit', invoiceType: 'refund', indent: true },
    { key: 'cost', label: 'C. Chi phí vận hành thực tế', amount: -pnl.operatingCost, section: 'opex', group: true, color: 'text-red-700' },
    ...expenseRows,
    { key: 'net', label: 'D. Lợi nhuận vận hành', amount: pnl.netProfit, section: 'result', total: true, color: pnl.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700' },
    { key: 'cash', label: 'E. Dòng tiền thực thu sau chi phí', amount: pnl.cashFlow, section: 'result', invoiceType: 'cash', total: true, color: pnl.cashFlow >= 0 ? 'text-sky-700' : 'text-red-700' },
  ]

  const visibleRows = rows.filter(row => row.group || row.total || !collapsedSections.has(row.section))

  const drillInvoices = useMemo(() => {
    if (!drill || drill.mode !== 'invoice') return []
    if (drill.type === 'cash') return []
    return filteredInvoices.filter(invoice => getInvoiceDrillAmount(invoice, drill.type) !== 0)
  }, [drill, filteredInvoices])

  const drillInvoiceCashRows = useMemo(() => {
    if (!drill || drill.mode !== 'invoice' || drill.type !== 'cash') return []
    return invoiceCashRows
  }, [drill, invoiceCashRows])

  const drillCash = useMemo(() => {
    if (!drill || drill.mode !== 'cash') return []
    return filteredCash.filter(item =>
      item.type === drill.type &&
      (!drill.category || item.category === drill.category)
    )
  }, [drill, filteredCash])

  const drillTotal = drill?.mode === 'invoice'
    ? (drill.type === 'cash'
      ? drillInvoiceCashRows.reduce((sum, item) => sum + item.record.amount, 0)
      : drillInvoices.reduce((sum, invoice) => sum + getInvoiceDrillAmount(invoice, drill.type), 0))
    : drillCash.reduce((sum, item) => sum + item.amount, 0)

  const toggleSection = (section: PnlSection) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const quickRange = (kind: 'today' | 'week' | 'month') => {
    const now = new Date()
    if (kind === 'today') {
      setViewMode('daily')
      setSelectedDate(iso(now))
      return
    }
    setViewMode('range')
    if (kind === 'month') {
      setStartDate(iso(new Date(now.getFullYear(), now.getMonth(), 1)))
      setEndDate(iso(now))
    } else {
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      setStartDate(iso(start))
      setEndDate(iso(now))
    }
  }

  const openRowDrill = (row: PnlRow) => {
    if (row.invoiceType) setDrill({ mode: 'invoice', type: row.invoiceType, title: row.label })
    if (row.cashType) setDrill({ mode: 'cash', type: row.cashType, category: row.cashCategory, title: row.label })
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f6f8] p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <i className="fa-solid fa-chart-line text-primary"></i>
            Báo cáo Kinh doanh (P&L)
          </h1>
          <p className="text-sm text-slate-500 mt-1">Doanh thu lấy từ hóa đơn, chi phí lấy từ chứng từ trong module Thu / Chi.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button onClick={() => setViewMode('range')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${viewMode === 'range' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>Theo khoảng</button>
          <button onClick={() => setViewMode('daily')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${viewMode === 'daily' ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>Theo ngày</button>
        </div>
        {viewMode === 'range' ? (
          <>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold" />
            <span className="text-slate-400 text-xs">đến</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold" />
          </>
        ) : (
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold" />
        )}
        <div className="flex gap-2">
          <button onClick={() => quickRange('today')} className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">Hôm nay</button>
          <button onClick={() => quickRange('week')} className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">7 ngày</button>
          <button onClick={() => quickRange('month')} className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">Tháng này</button>
        </div>
        <div className="ml-auto text-xs font-semibold text-slate-500">
          <i className="fa-regular fa-calendar mr-1"></i>
          {period.days} ngày | {pnl.invoiceCount} hóa đơn | {pnl.cashCount} chứng từ
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-black text-slate-900 flex items-center gap-2">
            <i className="fa-solid fa-table-list text-primary"></i>
            Bảng Kết quả Kinh doanh (P&L)
          </h2>
          <span className="text-xs text-slate-400">Click số tiền để xem chi tiết</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-5 py-3">Hạng mục</th>
              <th className="text-right px-5 py-3">Số tiền</th>
              <th className="text-center px-5 py-3">% DT</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const pct = pnl.operatingRevenue ? Math.abs(row.amount) / pnl.operatingRevenue * 100 : 0
              const isCollapsed = collapsedSections.has(row.section)
              const canDrill = !!row.invoiceType || !!row.cashType
              return (
                <tr key={row.key} className={`${row.group || row.total ? 'bg-slate-50 font-bold' : 'border-t border-slate-100'} ${row.total ? 'text-base' : ''}`}>
                  <td className={`px-5 py-3 ${row.group || row.total ? row.color : 'text-slate-700'} ${row.indent ? 'pl-10' : ''}`}>
                    {row.group ? (
                      <button onClick={() => toggleSection(row.section)} className={`flex items-center gap-2 font-black ${row.color}`}>
                        <i className={`fa-solid ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'} text-[10px]`}></i>
                        {row.label}
                      </button>
                    ) : row.label}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {canDrill ? (
                      <button onClick={() => openRowDrill(row)} className={`${row.color || (row.amount < 0 ? 'text-red-600' : 'text-slate-900')} font-bold border-b border-dashed border-slate-300 hover:border-primary`}>
                        {row.amount < 0 ? '-' : ''}{fmt(Math.abs(row.amount))} đ <i className="fa-regular fa-eye text-[10px] opacity-50 ml-1"></i>
                      </button>
                    ) : (
                      <span className={`${row.color || (row.amount < 0 ? 'text-red-600' : 'text-slate-900')} font-black`}>
                        {row.amount < 0 ? '-' : ''}{fmt(Math.abs(row.amount))} đ
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {row.key === 'rev' ? (
                      <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 font-black">100%</span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 font-bold">{pct.toFixed(1)}%</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {drill && (
        <div className="fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDrill(null)}>
          <div className="w-full max-w-6xl max-h-[86vh] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-lg font-black text-slate-900">{drill.title}</h3>
                <p className="text-xs text-slate-500">Tổng hạng mục: {fmt(drillTotal)} đ</p>
              </div>
              <button onClick={() => setDrill(null)} className="w-9 h-9 rounded-full hover:bg-slate-200 text-slate-500 transition">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="overflow-auto">
              {drill.mode === 'invoice' && drill.type !== 'cash' ? (
                <table className="w-full text-sm">
                  <thead className="bg-white sticky top-0 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="text-left px-5 py-3">Ngày</th>
                      <th className="text-left px-5 py-3">Phòng</th>
                      <th className="text-left px-5 py-3">Khách thuê</th>
                      <th className="text-left px-5 py-3">Loại phiếu</th>
                      <th className="text-right px-5 py-3">Giá trị hạng mục</th>
                      <th className="text-right px-5 py-3">Tổng phiếu</th>
                      <th className="text-right px-5 py-3">Đã thu</th>
                      <th className="text-center px-5 py-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drillInvoices.map(invoice => {
                      const amount = getInvoiceDrillAmount(invoice, drill.type)
                      return (
                        <tr key={invoice.id} className="hover:bg-slate-50">
                          <td className="px-5 py-3 font-semibold text-slate-600">{new Date(getInvoiceDate(invoice)).toLocaleDateString('vi-VN')}</td>
                          <td className="px-5 py-3 font-bold text-slate-800">{roomById.get(invoice.room_id)?.name || 'Không rõ'}</td>
                          <td className="px-5 py-3 text-slate-600">{tenantById.get(invoice.tenant_id)?.full_name || 'Không rõ'}</td>
                          <td className="px-5 py-3 text-slate-600">{invoice.is_settlement ? 'Tất toán' : invoice.is_first_month ? 'Tháng đầu' : invoice.billing_reason || 'Hàng tháng'}</td>
                          <td className={`px-5 py-3 text-right font-black tabular-nums ${amount < 0 ? 'text-red-600' : 'text-primary'}`}>{amount < 0 ? '-' : ''}{fmt(Math.abs(amount))} đ</td>
                          <td className="px-5 py-3 text-right font-black tabular-nums">{fmt(invoice.total_amount)} đ</td>
                          <td className="px-5 py-3 text-right font-bold text-emerald-700 tabular-nums">{fmt(invoice.paid_amount)} đ</td>
                          <td className="px-5 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-[11px] font-black ${invoice.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : invoice.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                              {invoice.payment_status === 'paid' ? 'Đã thu' : invoice.payment_status === 'partial' ? 'Thu một phần' : 'Chưa thu'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {drillInvoices.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-12 text-center text-slate-400">Không có dữ liệu chi tiết trong kỳ này.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : drill.mode === 'invoice' ? (
                <table className="w-full text-sm">
                  <thead className="bg-white sticky top-0 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="text-left px-5 py-3">Ngày thu</th>
                      <th className="text-left px-5 py-3">Phòng</th>
                      <th className="text-left px-5 py-3">Khách thuê</th>
                      <th className="text-left px-5 py-3">Kỳ hóa đơn</th>
                      <th className="text-left px-5 py-3">Phương thức</th>
                      <th className="text-right px-5 py-3">Số tiền thu</th>
                      <th className="text-left px-5 py-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drillInvoiceCashRows.map(({ invoice, record }) => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-semibold text-slate-600">{new Date(record.payment_date).toLocaleDateString('vi-VN')}</td>
                        <td className="px-5 py-3 font-bold text-slate-800">{roomById.get(invoice.room_id)?.name || 'Không rõ'}</td>
                        <td className="px-5 py-3 text-slate-600">{tenantById.get(invoice.tenant_id)?.full_name || 'Không rõ'}</td>
                        <td className="px-5 py-3 text-slate-600">T{String(invoice.month).padStart(2, '0')}/{invoice.year}</td>
                        <td className="px-5 py-3 text-slate-600">{record.payment_method === 'cash' ? 'Tiền mặt' : record.payment_method === 'transfer' ? 'Chuyển khoản' : '—'}</td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-700 tabular-nums">{fmt(record.amount)} đ</td>
                        <td className="px-5 py-3 text-slate-500">{record.note || invoice.note || '—'}</td>
                      </tr>
                    ))}
                    {drillInvoiceCashRows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-12 text-center text-slate-400">Không có dữ liệu thu tiền trong kỳ này.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-white sticky top-0 text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="text-left px-5 py-3">Ngày</th>
                      <th className="text-left px-5 py-3">Loại</th>
                      <th className="text-left px-5 py-3">Nhóm</th>
                      <th className="text-left px-5 py-3">Phòng</th>
                      <th className="text-right px-5 py-3">Số tiền</th>
                      <th className="text-left px-5 py-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drillCash.map((item: CashTransaction) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-semibold text-slate-600">{new Date(item.transaction_date).toLocaleDateString('vi-VN')}</td>
                        <td className="px-5 py-3 font-bold">{item.type === 'income' ? 'Thu' : 'Chi'}</td>
                        <td className="px-5 py-3 text-slate-700">{categoryLabel(item.category)}</td>
                        <td className="px-5 py-3 text-slate-600">{item.room_id ? roomById.get(item.room_id)?.name || 'Không rõ' : 'Không gắn phòng'}</td>
                        <td className={`px-5 py-3 text-right font-black tabular-nums ${item.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {item.type === 'expense' ? '-' : ''}{fmt(item.amount)} đ
                        </td>
                        <td className="px-5 py-3 text-slate-500">{item.note || '—'}</td>
                      </tr>
                    ))}
                    {drillCash.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-slate-400">Không có chứng từ trong kỳ này.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
