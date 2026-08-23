import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  DEFAULT_EXPENSE_CATEGORIES,
  getCashTransactions,
  getInvoicePaymentRecords,
  getInvoices,
  getRooms,
  type CashTransaction,
  type ExpenseCategory,
  type Invoice
} from '../lib/db'

const COLORS = ['#10b981', '#2563eb', '#f59e0b', '#f97316', '#0ea5e9', '#64748b']
const fmt = (value: number) => new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))

type ExpenseItem = {
  key: string
  source: 'cash' | 'invoice-refund'
  category?: string
  label: string
  value: number
  color: string
  pct: number
  icon: string
}

const day = (value: string | Date) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

const dayKey = (value: string | Date) => {
  const date = day(value)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

const shortDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

function calcMetrics(
  invoices: Invoice[],
  transactions: CashTransaction[],
  categories: ExpenseCategory[],
  start?: Date | null,
  end?: Date | null
) {
  const records = invoices
    .filter((invoice) => !['cancelled', 'merged'].includes(invoice.payment_status))
    .flatMap(getInvoicePaymentRecords)
    .filter((record) => {
      if (!start || !end) return true
      const date = day(record.payment_date || record.created_at)
      return date >= start && date <= end
    })

  const invoiceRevenue = records.reduce(
    (total, record) => total + Math.max(0, record.amount || 0),
    0
  )
  const invoiceRefund = records.reduce(
    (total, record) => total + Math.abs(Math.min(0, record.amount || 0)),
    0
  )
  const periodTransactions = transactions.filter((transaction) => {
    if (!start || !end) return true
    const date = day(transaction.transaction_date || transaction.created_at)
    return date >= start && date <= end
  })
  const totalRevenue =
    invoiceRevenue +
    periodTransactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((total, transaction) => total + transaction.amount, 0)
  const expenseByCategory = new Map(categories.map((category) => [category.value, 0]))
  periodTransactions
    .filter((transaction) => transaction.type === 'expense')
    .forEach((transaction) => {
      expenseByCategory.set(
        transaction.category,
        (expenseByCategory.get(transaction.category) || 0) + transaction.amount
      )
    })
  const totalExpense =
    Array.from(expenseByCategory.values()).reduce((total, value) => total + value, 0) +
    invoiceRefund

  return {
    totalRevenue,
    totalExpense,
    balance: totalRevenue - totalExpense,
    expenseByCategory,
    invoiceRefund
  }
}

function buildTrend(
  invoices: Invoice[],
  transactions: CashTransaction[],
  start?: Date | null,
  end?: Date | null
) {
  const values = new Map<string, { revenue: number; expense: number }>()
  const add = (dateValue: string, type: 'revenue' | 'expense', amount: number) => {
    const date = day(dateValue)
    if ((start && date < start) || (end && date > end)) return
    const key = dayKey(date)
    const current = values.get(key) || { revenue: 0, expense: 0 }
    current[type] += amount
    values.set(key, current)
  }

  invoices
    .filter((invoice) => !['cancelled', 'merged'].includes(invoice.payment_status))
    .flatMap(getInvoicePaymentRecords)
    .forEach((record) => {
      const amount = Number(record.amount || 0)
      add(
        record.payment_date || record.created_at,
        amount >= 0 ? 'revenue' : 'expense',
        Math.abs(amount)
      )
    })
  transactions.forEach((transaction) =>
    add(
      transaction.transaction_date || transaction.created_at,
      transaction.type === 'income' ? 'revenue' : 'expense',
      Number(transaction.amount || 0)
    )
  )

  const now = day(new Date())
  const fallbackStart = new Date(now)
  fallbackStart.setDate(fallbackStart.getDate() - 6)
  const keys = Array.from(values.keys()).sort()
  const allKeys = Array.from(
    new Set([
      start ? dayKey(start) : keys[0] || dayKey(fallbackStart),
      ...keys,
      end ? dayKey(end) : keys.at(-1) || dayKey(now)
    ])
  ).sort()
  let revenue = 0
  let expense = 0
  const data = allKeys.map((date) => {
    const value = values.get(date)
    revenue += value?.revenue || 0
    expense += value?.expense || 0
    return { date, label: shortDate(date), revenue, expense }
  })
  if (data.length <= 15) return data
  return Array.from(
    new Map(
      Array.from({ length: 15 }, (_, index) => {
        const position = Math.round((index / 14) * (data.length - 1))
        return [data[position].date, data[position]] as const
      })
    ).values()
  )
}

function previousRange(start?: Date | null, end?: Date | null) {
  if (!start || !end) return null
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd.getTime() - (end.getTime() - start.getTime()))
  previousStart.setHours(0, 0, 0, 0)
  previousEnd.setHours(23, 59, 59, 999)
  return { start: previousStart, end: previousEnd }
}

const change = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : null

function TrendBadge({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) {
    return <span className="text-xs font-semibold text-slate-400">Theo kỳ báo cáo đã chọn</span>
  }
  const up = value >= 0
  const favorable = inverse ? !up : up
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
        favorable ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
      }`}
    >
      <i className={`fa-solid ${up ? 'fa-arrow-up' : 'fa-arrow-down'} text-[10px]`} />
      {Math.abs(value).toFixed(1).replace('.', ',')}% so với kỳ trước
    </span>
  )
}

function MetricCard({
  title,
  value,
  icon,
  revenue,
  trend
}: {
  title: string
  value: number
  icon: string
  revenue: boolean
  trend: number | null
}) {
  return (
    <article className="flex min-h-[142px] items-center gap-5 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl ${
          revenue ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
        }`}
      >
        <i className={`fa-solid ${icon}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-[0.06em] text-slate-700">{title}</p>
        <p
          className={`mt-2 whitespace-nowrap text-[27px] font-black leading-none tabular-nums ${
            revenue ? 'text-emerald-600' : 'text-rose-600'
          }`}
        >
          {fmt(value)} đ
        </p>
        <div className="mt-3">
          <TrendBadge value={trend} inverse={!revenue} />
        </div>
      </div>
      <i
        className={`fa-solid ${revenue ? 'fa-arrow-trend-up text-emerald-200' : 'fa-arrow-trend-down text-rose-200'} hidden text-4xl 2xl:block`}
      />
    </article>
  )
}

function ExpenseRow({
  item,
  maxValue,
  onClick
}: {
  item: ExpenseItem
  maxValue: number
  onClick: () => void
}) {
  const width = maxValue > 0 ? Math.max((item.value / maxValue) * 100, 1.5) : 0
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-[minmax(155px,0.9fr)_minmax(140px,1.6fr)_128px_54px] items-center gap-4 border-t border-slate-100 py-3.5 text-left transition first:border-t-0 hover:bg-emerald-50/40 focus:outline-none focus-visible:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 lg:grid-cols-[minmax(190px,0.9fr)_minmax(220px,1.6fr)_140px_58px]"
      aria-label={`Xem chi tiết ${item.label}`}
      title={`Xem chi tiết ${item.label}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm"
          style={{ color: item.color, backgroundColor: `${item.color}14` }}
        >
          <i className={`fa-solid ${item.icon}`} />
        </div>
        <span className="truncate text-sm font-bold text-slate-800">{item.label}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.min(width, 100)}%`, backgroundColor: item.color }}
        />
      </div>
      <span className="text-right text-sm font-black text-slate-800 tabular-nums">
        {fmt(item.value)} đ
      </span>
      <span className="text-right text-xs font-bold text-slate-500 tabular-nums">
        {item.pct.toFixed(1).replace('.', ',')}%
      </span>
    </button>
  )
}

export function OverviewTab({
  period
}: {
  period: { start: Date | null; end: Date | null; label: string; emptyLabel: string }
}) {
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })
  const { data: transactions = [] } = useQuery({
    queryKey: ['cashTransactions'],
    queryFn: getCashTransactions
  })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const [selectedExpense, setSelectedExpense] = useState<ExpenseItem | null>(null)
  const categories = useMemo(
    () => DEFAULT_EXPENSE_CATEGORIES.filter((category) => category.type === 'expense'),
    []
  )
  const current = useMemo(
    () => calcMetrics(invoices, transactions, categories, period.start, period.end),
    [categories, invoices, period.end, period.start, transactions]
  )
  const priorRange = useMemo(
    () => previousRange(period.start, period.end),
    [period.end, period.start]
  )
  const prior = useMemo(
    () =>
      priorRange
        ? calcMetrics(invoices, transactions, categories, priorRange.start, priorRange.end)
        : null,
    [categories, invoices, priorRange, transactions]
  )
  const trendData = useMemo(
    () => buildTrend(invoices, transactions, period.start, period.end),
    [invoices, period.end, period.start, transactions]
  )
  const expenses = useMemo<ExpenseItem[]>(() => {
    const items: Array<Omit<ExpenseItem, 'color' | 'pct'>> = categories
      .map((category) => ({
        key: `cash-${category.value}`,
        source: 'cash' as const,
        category: category.value,
        label: category.name,
        value: current.expenseByCategory.get(category.value) || 0,
        icon: category.icon || 'fa-receipt'
      }))
      .filter((item) => item.value > 0)
    if (current.invoiceRefund > 0) {
      items.push({
        key: 'invoice-refund',
        source: 'invoice-refund',
        label: 'Hoàn cọc / hoàn tiền',
        value: current.invoiceRefund,
        icon: 'fa-rotate-left'
      })
    }
    return items
      .sort((a, b) => b.value - a.value)
      .map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length],
        pct: current.totalExpense > 0 ? (item.value / current.totalExpense) * 100 : 0
      }))
  }, [categories, current.expenseByCategory, current.invoiceRefund, current.totalExpense])

  const topExpense = expenses[0]
  const maxExpense = topExpense?.value || 1
  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room.name])), [rooms])
  const selectedExpenseDetails = useMemo(() => {
    if (!selectedExpense) return []
    if (selectedExpense.source === 'cash') {
      return transactions
        .filter((transaction) => {
          if (transaction.type !== 'expense' || transaction.category !== selectedExpense.category) {
            return false
          }
          const date = day(transaction.transaction_date || transaction.created_at)
          return (!period.start || date >= period.start) && (!period.end || date <= period.end)
        })
        .map((transaction) => ({
          id: transaction.id,
          date: transaction.transaction_date || transaction.created_at,
          roomId: transaction.room_id,
          amount: transaction.amount,
          note: transaction.note || '—'
        }))
    }
    return invoices.flatMap((invoice) =>
      getInvoicePaymentRecords(invoice)
        .filter((record) => {
          if ((record.amount || 0) >= 0) return false
          const date = day(record.payment_date || record.created_at)
          return (!period.start || date >= period.start) && (!period.end || date <= period.end)
        })
        .map((record) => ({
          id: `${invoice.id}-${record.id}`,
          date: record.payment_date || record.created_at,
          roomId: invoice.room_id,
          amount: Math.abs(record.amount || 0),
          note: record.note || invoice.note || '—'
        }))
    )
  }, [invoices, period.end, period.start, selectedExpense, transactions])
  const getTargetLabel = (roomId?: string) => {
    if (!roomId) return 'Không gắn phòng'
    const building = roomId.match(/^building:(\d+)$/i)
    if (building) return `Tòa ${building[1]}`
    return roomById.get(roomId) || 'Không rõ'
  }
  const revenueTrend = prior ? change(current.totalRevenue, prior.totalRevenue) : null
  const expenseTrend = prior ? change(current.totalExpense, prior.totalExpense) : null
  const balanceTrend = prior ? change(current.balance, prior.balance) : null

  const handleDownload = () => {
    const rows = [
      ['BÁO CÁO TỔNG QUÁT', period.label],
      [],
      ['Chỉ tiêu', 'Số tiền'],
      ['Tổng doanh thu', current.totalRevenue],
      ['Tổng chi phí', current.totalExpense],
      ['Số dư hiện tại', current.balance],
      [],
      ['Chi phí theo danh mục', 'Số tiền', 'Tỷ trọng'],
      ...expenses.map((item) => [item.label, item.value, `${item.pct.toFixed(1)}%`])
    ]
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `bao-cao-tong-quat-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 pb-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-slate-950">
            Tổng quan tài chính
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Cập nhật tình hình tài chính tổng thể của bạn
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 shadow-sm">
            <i className="fa-regular fa-calendar text-xs text-slate-400" />
            {period.label}
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 active:scale-[0.98]"
          >
            <i className="fa-solid fa-download text-xs" />
            Tải báo cáo
          </button>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(330px,1fr)]">
        <article className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(230px,0.72fr)_minmax(0,1.5fr)] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-700">
                Số dư hiện tại
              </p>
              <p
                className={`mt-4 whitespace-nowrap text-[38px] font-black leading-none tracking-tight tabular-nums sm:text-[44px] ${
                  current.balance >= 0 ? 'text-slate-950' : 'text-rose-600'
                }`}
              >
                {fmt(current.balance)} đ
              </p>
              <div className="mt-4">
                <TrendBadge value={balanceTrend} />
              </div>
              <p className="mt-6 text-sm font-bold text-slate-500 tabular-nums">
                {fmt(current.totalRevenue)} đ&nbsp; - &nbsp;{fmt(current.totalExpense)} đ
              </p>
            </div>
            <div className="min-w-0">
              <div className="mb-2 flex justify-end gap-5 text-xs font-bold text-slate-500">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Doanh thu
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Chi phí
                </span>
              </div>
              <div className="h-[218px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                      minTickGap={24}
                      dy={8}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={54}
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                      tickFormatter={(value) => `${Math.round(Number(value) / 1_000_000)}M`}
                    />
                    <Tooltip
                      formatter={(value, name) => [`${fmt(Number(value))} đ`, name]}
                      labelFormatter={(label) => `Ngày ${label}`}
                      contentStyle={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.12)',
                        fontSize: 12
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Doanh thu"
                      stroke="#10b981"
                      strokeWidth={3}
                      fill="#10b981"
                      fillOpacity={0.08}
                    />
                    <Area
                      type="monotone"
                      dataKey="expense"
                      name="Chi phí"
                      stroke="#f43f5e"
                      strokeWidth={3}
                      fill="#f43f5e"
                      fillOpacity={0.06}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </article>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetricCard
            title="Tổng doanh thu"
            value={current.totalRevenue}
            icon="fa-arrow-trend-up"
            revenue
            trend={revenueTrend}
          />
          <MetricCard
            title="Tổng chi phí"
            value={current.totalExpense}
            icon="fa-arrow-trend-down"
            revenue={false}
            trend={expenseTrend}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(330px,1fr)]">
        <article
          id="expense-breakdown"
          className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white px-5 py-5 shadow-sm sm:px-7"
        >
          <div className="flex min-w-[650px] items-end justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-black uppercase tracking-[0.04em] text-slate-900">
                Chi phí theo danh mục
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-400">
                Xếp hạng các khoản chi trong kỳ báo cáo
              </p>
            </div>
            {expenses.length > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
                Sắp xếp theo số tiền
                <i className="fa-solid fa-chevron-down text-[9px] text-slate-400" />
              </div>
            )}
          </div>
          {expenses.length === 0 ? (
            <div className="flex min-w-[650px] flex-col items-center justify-center py-12 text-slate-300">
              <i className="fa-solid fa-chart-bar mb-3 text-4xl" />
              <p className="text-sm font-semibold text-slate-400">
                Chưa có chi phí {period.emptyLabel}
              </p>
            </div>
          ) : (
            <div className="min-w-[650px]">
              {expenses.map((item) => (
                <ExpenseRow
                  key={item.key}
                  item={item}
                  maxValue={maxExpense}
                  onClick={() => setSelectedExpense(item)}
                />
              ))}
              <div className="grid grid-cols-[minmax(155px,0.9fr)_minmax(140px,1.6fr)_128px_54px] items-center gap-4 border-t border-slate-200 bg-slate-50/60 px-3 py-3.5 lg:grid-cols-[minmax(190px,0.9fr)_minmax(220px,1.6fr)_140px_58px]">
                <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
                  <i className="fa-solid fa-circle-info text-slate-400" /> Tổng chi phí
                </div>
                <span />
                <span className="text-right text-sm font-black text-slate-900 tabular-nums">
                  {fmt(current.totalExpense)} đ
                </span>
                <span className="text-right text-xs font-bold text-slate-500">100%</span>
              </div>
            </div>
          )}
        </article>

        <aside className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm sm:p-6">
          <p className="text-sm font-black uppercase tracking-[0.06em] text-slate-800">
            Khuyến nghị
          </p>
          <div className="mt-5 flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl text-amber-500">
              <i className="fa-solid fa-triangle-exclamation" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black leading-6 text-slate-900">
                {topExpense
                  ? `${topExpense.label} chiếm ${topExpense.pct.toFixed(1).replace('.', ',')}%`
                  : 'Chưa có khoản chi cần lưu ý'}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {topExpense
                  ? 'Tỷ trọng danh mục này đang ở mức cao. Hãy xem xét các khoản chi để tối ưu hiệu quả quản lý.'
                  : `Thêm chứng từ chi phí ${period.emptyLabel} để nhận khuyến nghị.`}
              </p>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById('expense-breakdown')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
                disabled={!topExpense}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500 bg-white px-4 py-3 text-sm font-black text-emerald-600 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
              >
                <i className="fa-solid fa-file-circle-check" /> Xem chi tiết chi phí
              </button>
            </div>
          </div>
          <div className="mt-6 border-t border-amber-200/80 pt-5">
            <div className="flex items-center gap-3 text-sm font-bold text-slate-700">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                <i className="fa-regular fa-clock" />
              </div>
              <div>
                <p>Xu hướng dòng tiền</p>
                <p className="mt-0.5 text-xs font-medium text-slate-400">Theo kỳ báo cáo đã chọn</p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <div className="flex items-center gap-2 pt-1 text-xs font-medium text-slate-500">
        <i className="fa-solid fa-filter text-slate-400" />
        Theo bộ lọc: {period.label}
      </div>

      {selectedExpense && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setSelectedExpense(null)}
        >
          <div
            className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">{selectedExpense.label}</h3>
                <p className="text-xs text-slate-500">
                  Tổng hạng mục: {fmt(selectedExpense.value)} đ · {selectedExpenseDetails.length}{' '}
                  khoản
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExpense(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200"
                aria-label="Đóng chi tiết chi phí"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 border-b border-slate-100 bg-white text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3 text-left">Ngày</th>
                    <th className="px-5 py-3 text-left">Nhóm</th>
                    <th className="px-5 py-3 text-left">Phòng / Tòa</th>
                    <th className="px-5 py-3 text-right">Số tiền</th>
                    <th className="px-5 py-3 text-left">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedExpenseDetails.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-600">
                        {new Date(item.date).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-5 py-3 font-bold text-slate-800">
                        {selectedExpense.label}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {getTargetLabel(item.roomId)}
                      </td>
                      <td className="px-5 py-3 text-right font-black tabular-nums text-red-600">
                        -{fmt(item.amount)} đ
                      </td>
                      <td className="max-w-[360px] whitespace-normal break-words px-5 py-3 text-slate-500">
                        {item.note}
                      </td>
                    </tr>
                  ))}
                  {selectedExpenseDetails.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                        Không có dữ liệu chi tiết trong kỳ này.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
