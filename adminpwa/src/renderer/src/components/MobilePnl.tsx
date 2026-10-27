import { useState, type ReactNode } from 'react'
import type { PnlRow, PnlSection } from './BusinessReport'

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(Math.round(Math.abs(value || 0)))

/** Presentation only: consumes the same ledger rows and drill handlers as desktop. */
export function MobilePnl({ rows, revenue, cost, profit, loading, error, onDrill, chart }: {
  rows: PnlRow[]
  revenue: number
  cost: number
  profit: number
  loading: boolean
  error: boolean
  onDrill: (row: PnlRow) => void
  chart: ReactNode
}) {
  const [collapsed, setCollapsed] = useState<Set<PnlSection>>(() => new Set(['revenue', 'cashAdjustments']))
  const toggle = (section: PnlSection) => setCollapsed(previous => {
    const next = new Set(previous)
    if (next.has(section)) next.delete(section)
    else next.add(section)
    return next
  })
  return <div className="finance-mobile finance-pnl" data-testid="mobile-pnl">
    {loading || error ? <p className="finance-state" role="status">{error ? 'Không tải được báo cáo. Vui lòng thử lại.' : 'Đang tải báo cáo…'}</p> : <>
      <section className="finance-profit" aria-label="Tổng kết kinh doanh">
        <div className="finance-profit-heading"><i className="fa-solid fa-chart-simple" aria-hidden="true" /> Lợi nhuận thực <span title="Doanh thu thực thu trừ chi phí vận hành; không trừ các khoản chi ngoài kinh doanh"><i className="fa-regular fa-circle-question" aria-hidden="true" /></span></div>
        <strong className={profit < 0 ? 'negative' : 'positive'}>{profit < 0 ? '−' : ''}{money(profit)} đ</strong>
        <div className="finance-summary-row"><i className="fa-solid fa-arrow-up positive" aria-hidden="true" /><span>Doanh thu thực thu</span><b className="positive">{money(revenue)} đ</b></div>
        <div className="finance-summary-row"><i className="fa-solid fa-arrow-down negative" aria-hidden="true" /><span>Chi phí vận hành</span><b className="negative">{money(cost)} đ</b></div>
      </section>
      <h2 className="finance-section-title">Chi tiết theo khoản</h2>
      <section className="finance-pnl-ledger" aria-label="Các khoản kinh doanh">
        {rows.filter(row => row.group || row.total || !collapsed.has(row.section)).map(row => {
          const canDrill = !!row.invoiceType || !!row.cashType
          const tone = row.section === 'opex' ? 'negative' : row.section === 'cashAdjustments' ? 'non-operating' : row.section === 'result' && row.amount < 0 ? 'negative' : 'positive'
          const content = <><span className="finance-pnl-label">{row.group && <i className={`fa-solid fa-chevron-${collapsed.has(row.section) ? 'right' : 'down'}`} aria-hidden="true" />}{row.total && <i className="fa-solid fa-equals" aria-hidden="true" />}{row.label.replace('Khoản chi ngoài kết quả kinh doanh', 'Khoản chi ngoài kinh doanh')} {row.section === 'cashAdjustments' && row.group && <small>Không tính vào lợi nhuận</small>}</span><span className="finance-pnl-value">{row.total && row.amount < 0 ? '−' : row.key === 'rev' ? '+' : ''}{money(row.amount)} đ</span>{canDrill && <i className="fa-solid fa-chevron-right finance-row-chevron" aria-hidden="true" />}</>
          return row.group ? <button key={row.key} className={`finance-pnl-row group ${tone}`} aria-expanded={!collapsed.has(row.section)} onClick={() => toggle(row.section)}>{content}</button> : canDrill ? <button key={row.key} className="finance-pnl-row detail" onClick={() => onDrill(row)} aria-label={`Xem chi tiết ${row.label}, ${money(row.amount)} đồng`}>{content}</button> : <div key={row.key} className={`finance-pnl-row total ${tone}`}>{content}</div>
        })}
      </section>
      <details className="finance-chart"><summary>Xu hướng doanh thu và chi phí</summary>{chart}</details>
    </>}
  </div>
}
