import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getCashTransactions,
  getInvoices,
  getInvoicePaymentRecords,
  DEFAULT_EXPENSE_CATEGORIES,
  type CashTransaction,
  type ExpenseCategory,
  type Invoice,
} from '../lib/db'

const CHART_COLORS = [
  '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6',
  '#f97316', '#ec4899', '#6b7280', '#14b8a6',
  '#ef4444', '#84cc16',
]

const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
  'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
  'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

const fmt = (v: number) => new Intl.NumberFormat('vi-VN').format(Math.round(v || 0))

type ChartSegment = { label: string; value: number; color: string; pct: number }

function calcMetrics(
  invoices: Invoice[],
  cashTx: CashTransaction[],
  categories: ExpenseCategory[],
  year: number,
  month: number
) {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)

  const invoiceRevenue = invoices
    .filter(inv => inv.payment_status !== 'cancelled' && inv.payment_status !== 'merged')
    .flatMap(inv => getInvoicePaymentRecords(inv))
    .filter(rec => {
      const d = new Date(rec.payment_date || rec.created_at)
      return d >= start && d <= end
    })
    .reduce((s, rec) => s + rec.amount, 0)

  const cashInMonth = cashTx.filter(tx => {
    const d = new Date(tx.transaction_date || tx.created_at)
    return d >= start && d <= end
  })

  const otherIncome = cashInMonth
    .filter(tx => tx.type === 'income')
    .reduce((s, tx) => s + tx.amount, 0)

  const totalRevenue = invoiceRevenue + otherIncome

  const expenseByCategory = new Map<string, number>()
  for (const cat of categories) expenseByCategory.set(cat.value, 0)
  for (const tx of cashInMonth) {
    if (tx.type !== 'expense') continue
    expenseByCategory.set(tx.category, (expenseByCategory.get(tx.category) || 0) + tx.amount)
  }

  const totalExpense = Array.from(expenseByCategory.values()).reduce((s, v) => s + v, 0)
  const balance = totalRevenue - totalExpense
  const savingsRate = totalRevenue > 0 ? (balance / totalRevenue) * 100 : 0

  return { totalRevenue, totalExpense, balance, savingsRate, expenseByCategory, invoiceRevenue, otherIncome }
}

function pctChange(current: number, prev: number) {
  if (prev === 0) return null
  return ((current - prev) / Math.abs(prev)) * 100
}

// SVG Donut chart
function DonutChart({ segments, total }: { segments: ChartSegment[]; total: number }) {
  const cx = 90, cy = 90, outerR = 78, innerR = 50
  let startAngle = -90

  if (total === 0) {
    return (
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx={cx} cy={cy} r={outerR} fill="#f1f5f9" />
        <circle cx={cx} cy={cy} r={innerR} fill="white" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600">Chưa có</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600">dữ liệu</text>
      </svg>
    )
  }

  const paths = segments.map(seg => {
    if (seg.value === 0) return null
    const angle = (seg.value / total) * 360
    const end = startAngle + angle
    const rad = (a: number) => (a * Math.PI) / 180
    const x1 = cx + outerR * Math.cos(rad(startAngle))
    const y1 = cy + outerR * Math.sin(rad(startAngle))
    const x2 = cx + outerR * Math.cos(rad(end))
    const y2 = cy + outerR * Math.sin(rad(end))
    const x3 = cx + innerR * Math.cos(rad(end))
    const y3 = cy + innerR * Math.sin(rad(end))
    const x4 = cx + innerR * Math.cos(rad(startAngle))
    const y4 = cy + innerR * Math.sin(rad(startAngle))
    const large = angle > 180 ? 1 : 0
    const d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`
    const result = { d, color: seg.color, key: seg.label }
    startAngle = end
    return result
  })

  return (
    <svg width="180" height="180" viewBox="0 0 180 180">
      {paths.map(p => p && (
        <path key={p.key} d={p.d} fill={p.color} stroke="white" strokeWidth="2" />
      ))}
      <circle cx={cx} cy={cy} r={innerR - 2} fill="white" />
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="700">
        Tổng
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="12" fill="#1e293b" fontWeight="900">
        {fmt(total)}
      </text>
      <text x={cx} y={cy + 21} textAnchor="middle" fontSize="9" fill="#94a3b8">
        đồng
      </text>
    </svg>
  )
}

// KPI Card
function KpiCard({
  title, value, prevValue, icon, bgColor, textColor, valColor, isPct
}: {
  title: string
  value: number
  prevValue: number
  icon: string
  bgColor: string
  textColor: string
  valColor: string
  isPct?: boolean
}) {
  const change = pctChange(value, prevValue)
  const isUp = change !== null && change >= 0
  const displayValue = isPct
    ? value.toFixed(1).replace('.', ',') + '%'
    : fmt(value) + ' đ'

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center gap-3">
        <div className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center ${bgColor}`}>
          <i className={`fa-solid ${icon} text-base ${textColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500 font-semibold">{title}</p>
          <p className={`text-xl font-black mt-0.5 ${valColor}`}>{displayValue}</p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-50">
        {change !== null ? (
          <p className={`text-[11px] font-semibold flex items-center gap-1 ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
            <i className={`fa-solid ${isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} text-[9px]`} />
            {isUp ? '+' : ''}{change.toFixed(1).replace('.', ',')}% so với tháng trước
          </p>
        ) : (
          <p className="text-[11px] text-slate-400">Chưa có dữ liệu tháng trước</p>
        )}
      </div>
    </div>
  )
}

export function OverviewTab() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [barView, setBarView] = useState<'amount' | 'pct'>('amount')

  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })
  const { data: cashTx = [] } = useQuery({ queryKey: ['cashTransactions'], queryFn: getCashTransactions })

  const expenseCategories = useMemo(
    () => DEFAULT_EXPENSE_CATEGORIES.filter(c => c.type === 'expense'),
    []
  )

  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1

  const current = useMemo(
    () => calcMetrics(invoices, cashTx, expenseCategories, year, month),
    [invoices, cashTx, expenseCategories, year, month]
  )
  const prev = useMemo(
    () => calcMetrics(invoices, cashTx, expenseCategories, prevYear, prevMonth),
    [invoices, cashTx, expenseCategories, prevYear, prevMonth]
  )

  const chartData: ChartSegment[] = useMemo(() => {
    return expenseCategories
      .map((cat, i) => ({
        label: cat.name,
        value: current.expenseByCategory.get(cat.value) || 0,
        color: CHART_COLORS[i % CHART_COLORS.length],
        pct: current.totalExpense > 0
          ? ((current.expenseByCategory.get(cat.value) || 0) / current.totalExpense) * 100
          : 0,
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [expenseCategories, current])

  const maxBarValue = chartData.length > 0 ? chartData[0].value : 1

  const goToPrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const goToNext = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[22px] font-black text-slate-900 flex items-center gap-2.5">
            <i className="fa-solid fa-chart-pie text-primary" />
            Tổng quan danh mục
          </h1>
          <p className="text-sm text-slate-500 mt-1">Cập nhật tình hình tài chính tổng thể của bạn</p>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Month picker */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
            <i className="fa-regular fa-calendar text-slate-400 text-xs mr-1" />
            <button
              onClick={goToPrev}
              className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <i className="fa-solid fa-chevron-left text-[10px]" />
            </button>
            <span className="text-sm font-bold text-slate-700 px-2 min-w-[108px] text-center">
              {MONTH_NAMES[month - 1]}, {year}
            </span>
            <button
              onClick={goToNext}
              disabled={isCurrentMonth}
              className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <i className="fa-solid fa-chevron-right text-[10px]" />
            </button>
          </div>
          <button className="flex items-center gap-2 bg-primary text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-primary-dark shadow-sm transition-all">
            <i className="fa-solid fa-download text-xs" />
            Tải báo cáo
          </button>
        </div>
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          title="Tổng tài sản"
          value={current.totalRevenue}
          prevValue={prev.totalRevenue}
          icon="fa-wallet"
          bgColor="bg-emerald-50"
          textColor="text-emerald-500"
          valColor="text-emerald-700"
        />
        <KpiCard
          title="Tổng chi phí"
          value={current.totalExpense}
          prevValue={prev.totalExpense}
          icon="fa-chart-pie"
          bgColor="bg-rose-50"
          textColor="text-rose-500"
          valColor="text-rose-600"
        />
        <KpiCard
          title="Số dư hiện tại"
          value={current.balance}
          prevValue={prev.balance}
          icon="fa-money-bill-trend-up"
          bgColor="bg-blue-50"
          textColor="text-blue-500"
          valColor="text-blue-700"
        />
        <KpiCard
          title="Tỷ lệ tiết kiệm"
          value={current.savingsRate}
          prevValue={prev.savingsRate}
          icon="fa-bullseye"
          bgColor="bg-purple-50"
          textColor="text-purple-500"
          valColor="text-purple-700"
          isPct
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-5">
        {/* Donut — Cơ cấu doanh thu (always has data when revenue exists) */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-slate-800 flex items-center gap-2 text-sm">
                <i className="fa-solid fa-chart-pie text-primary" />
                Cơ cấu doanh thu
              </h2>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Phân bổ nguồn thu trong tháng</p>
          </div>

          {current.totalRevenue === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-slate-300">
              <i className="fa-solid fa-chart-pie text-5xl mb-3" />
              <p className="text-sm font-semibold text-slate-400">Chưa có doanh thu tháng này</p>
            </div>
          ) : (() => {
            const revenueSegments: ChartSegment[] = [
              current.invoiceRevenue > 0 ? { label: 'Thu từ hóa đơn', value: current.invoiceRevenue, color: '#10b981', pct: (current.invoiceRevenue / current.totalRevenue) * 100 } : null,
              current.otherIncome > 0 ? { label: 'Thu khác (chứng từ)', value: current.otherIncome, color: '#3b82f6', pct: (current.otherIncome / current.totalRevenue) * 100 } : null,
            ].filter(Boolean) as ChartSegment[]
            return (
              <div className="flex gap-4 items-start">
                <div className="shrink-0">
                  <DonutChart segments={revenueSegments} total={current.totalRevenue} />
                </div>
                <div className="flex-1 min-w-0 space-y-2.5 mt-2">
                  {revenueSegments.map(seg => (
                    <div key={seg.label} className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
                      <span className="text-xs text-slate-600 flex-1 truncate">{seg.label}</span>
                      <span className="text-[11px] font-bold text-slate-700 tabular-nums shrink-0">{fmt(seg.value)} đ</span>
                      <span className="text-[10px] text-slate-400 w-9 text-right shrink-0">{seg.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                  {current.totalExpense > 0 && (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400" />
                      <span className="text-xs text-slate-600 flex-1 truncate">Chi phí</span>
                      <span className="text-[11px] font-bold text-rose-600 tabular-nums shrink-0">-{fmt(current.totalExpense)} đ</span>
                      <span className="text-[10px] text-slate-400 w-9 text-right shrink-0">{current.totalRevenue > 0 ? ((current.totalExpense / current.totalRevenue) * 100).toFixed(1) : '0'}%</span>
                    </div>
                  )}
                  <div className="pt-2.5 mt-1 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700">Tổng doanh thu</span>
                    <span className="text-xs font-black text-emerald-600 tabular-nums">{fmt(current.totalRevenue)} đ</span>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>

        {/* Horizontal bars — Chi phí theo danh mục */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="font-black text-slate-800 flex items-center gap-2 text-sm">
                <i className="fa-solid fa-chart-bar text-primary" />
                Chi phí theo danh mục
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">So sánh chi tiêu theo từng danh mục</p>
            </div>
            {chartData.length > 0 && (
              <select
                value={barView}
                onChange={e => setBarView(e.target.value as 'amount' | 'pct')}
                className="text-[11px] font-bold border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:border-primary shrink-0"
              >
                <option value="amount">Xem theo: Số tiền</option>
                <option value="pct">Xem theo: Phần trăm</option>
              </select>
            )}
          </div>

          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-slate-300">
              <i className="fa-solid fa-chart-bar text-5xl mb-3" />
              <p className="text-sm font-semibold text-slate-400">Chưa có chi phí tháng này</p>
              <p className="text-[11px] text-slate-300 mt-1">Thêm chứng từ chi phí để xem biểu đồ</p>
            </div>
          ) : (
            <div className="space-y-4">
              {chartData.map(seg => {
                const barPct = barView === 'amount'
                  ? (seg.value / maxBarValue) * 100
                  : seg.pct
                const label = barView === 'amount'
                  ? fmt(seg.value) + ' đ'
                  : seg.pct.toFixed(1) + '%'
                return (
                  <div key={seg.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-600 font-semibold truncate max-w-[180px]">{seg.label}</span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs font-bold text-slate-700 tabular-nums">{label}</span>
                        {barView === 'amount' && (
                          <span className="text-[10px] text-slate-400">{seg.pct.toFixed(1)}%</span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${Math.min(barPct, 100)}%`, backgroundColor: seg.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
