import { useEffect, useState, type ReactNode } from 'react'
import type { CashFlowRow, CategoryOption } from './CashFlowTab'
import type { CashTransaction, CashTransactionCategory, CashTransactionType } from '../lib/db'
import { INVOICE_REFUND_LABELS } from '../lib/invoice-payment-flow'
import { normalizeFinanceSearch as normalize } from '../lib/mobile-finance-presentation'
import '../assets/finance-mobile.css'

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))
const label = (item: CashFlowRow, categories: CategoryOption[]) => item.source === 'invoice' && item.type === 'income' ? 'Thu tiền phòng' : INVOICE_REFUND_LABELS[item.category] || categories.find(c => c.value === item.category)?.label || (item.category === 'wallet_transfer' ? 'Chuyển giữa các ví' : item.category === 'investment_transfer' ? 'Chuyển vốn đầu tư' : 'Giao dịch khác')

export function MobileCashFlow({ rows, income, expense, loading, error, typeFilter, setTypeFilter, categoryFilter, setCategoryFilter, categories, targetLabel, onCreate, onEdit, onDelete, onInvoices, isAdmin, balances, periodControl }: {
  rows: CashFlowRow[]; income: number; expense: number; loading: boolean; error: boolean
  typeFilter: 'all' | CashTransactionType; setTypeFilter: (value: 'all' | CashTransactionType) => void
  categoryFilter: 'all' | CashTransactionCategory; setCategoryFilter: (value: 'all' | CashTransactionCategory) => void
  categories: CategoryOption[]; targetLabel: (item: CashFlowRow) => string
  onCreate: () => void; onEdit: (item: CashTransaction) => void; onDelete: (item: CashTransaction) => void
  onInvoices?: (invoiceId?: string) => void; isAdmin: boolean; balances?: Map<string, number>
  periodControl?: ReactNode
}) {
  const [search, setSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [limit, setLimit] = useState(24)
  useEffect(() => setLimit(24), [rows, search])
  const keyword = normalize(search.trim())
  const searched = rows.filter(item => !keyword || normalize(`${label(item, categories)} ${targetLabel(item)} ${item.note || ''} ${item.amount}`).includes(keyword))
  const visible = searched.slice(0, limit)
  return <section className="finance-mobile finance-cash" data-testid="mobile-cashflow">
    <header className="finance-title-row"><h1 className="finance-page-title">Giao dịch</h1><button className="finance-add" onClick={onCreate}><i className="fa-solid fa-plus" aria-hidden="true" /> Thêm</button></header>
    <section className="finance-cash-summary" aria-label="Tổng kết giao dịch">
      <i className="fa-solid fa-database finance-cash-mark" aria-hidden="true" />
      <span>Dòng tiền ròng trong kỳ</span><strong>{loading ? 'Đang tải…' : error ? 'Không tải được dữ liệu' : `${income - expense < 0 ? '−' : '+'}${money(Math.abs(income - expense))} đ`}</strong>
      <div className="finance-cash-totals"><div><i className="fa-solid fa-arrow-up" aria-hidden="true" /><span>Tiền vào<b>{loading || error ? '—' : `${money(income)} đ`}</b></span></div><div><i className="fa-solid fa-arrow-down" aria-hidden="true" /><span>Tiền ra<b>{loading || error ? '—' : `${money(expense)} đ`}</b></span></div></div>
    </section>
    {periodControl && <div className="finance-cash-period">{periodControl}</div>}
    <div className="finance-cash-search"><label><i className="fa-solid fa-magnifying-glass" aria-hidden="true" /><input type="search" aria-label="Tìm giao dịch" placeholder="Tìm nội dung, phòng…" value={search} onChange={e => setSearch(e.target.value)} /></label><button aria-label="Bộ lọc giao dịch" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(v => !v)}><i className="fa-solid fa-sliders" aria-hidden="true" />{categoryFilter !== 'all' && <span className="finance-filter-active" />}</button></div>
    {filtersOpen && <div className="finance-category-filter"><label>Nhóm giao dịch<select aria-label="Nhóm giao dịch" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as typeof categoryFilter)}><option value="all">Tất cả nhóm</option>{categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}{Object.entries(INVOICE_REFUND_LABELS).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label><button onClick={() => { setCategoryFilter('all'); setTypeFilter('all'); setSearch('') }}>Xóa bộ lọc</button></div>}
    <div className="finance-type-filters" role="group" aria-label="Loại giao dịch">{(['all', 'income', 'expense'] as const).map(type => <button key={type} aria-pressed={typeFilter === type} onClick={() => setTypeFilter(type)}>{type === 'all' ? 'Tất cả' : type === 'income' ? 'Tiền vào' : 'Tiền ra'}</button>)}</div>
    {loading || error ? <p className="finance-state" role="status">{error ? 'Không tải được giao dịch. Vui lòng thử lại.' : 'Đang tải giao dịch…'}</p> : visible.length === 0 ? <p className="finance-state" role="status">{keyword ? 'Không tìm thấy giao dịch phù hợp.' : 'Chưa có giao dịch trong kỳ này.'}</p> : <div className="finance-cash-list">{visible.map((item, index) => {
      const date = item.transaction_date.slice(0, 10)
      const previousDate = visible[index - 1]?.transaction_date.slice(0, 10)
      const title = label(item, categories)
      const target = targetLabel(item)
      const manual = item.source === 'manual' && !['wallet_transfer', 'investment_transfer'].includes(item.category)
      return <div key={item.id}>{date !== previousDate && <h2 className="finance-day">{new Date(`${date}T12:00:00`).toLocaleDateString('vi-VN')}</h2>}<details className="finance-cash-entry"><summary><span className={`finance-entry-icon ${item.type === 'income' ? 'positive' : 'negative'}`}><i className={`fa-solid fa-arrow-${item.type === 'income' ? 'up' : 'down'}`} aria-hidden="true" /></span><span className="finance-entry-title"><b>{item.source === 'invoice' ? `${title} · ${target}` : title}</b><small>{item.source === 'invoice' ? 'Hóa đơn' : target} · {item.payment_method === 'cash' ? 'Tiền mặt' : item.payment_method === 'transfer' ? 'Chuyển khoản' : 'Chưa xác định ví'}</small></span><strong className={item.type === 'income' ? 'positive' : 'negative'}>{item.type === 'income' ? '+' : '−'}{money(item.amount)} đ</strong><i className="fa-solid fa-chevron-right finance-row-chevron" aria-hidden="true" /></summary><div className="finance-entry-detail"><p><b>Ngày phát sinh:</b> {new Date(`${date}T12:00:00`).toLocaleDateString('vi-VN')}</p><p><b>Phòng / Tòa:</b> {target}</p><p><b>Ghi chú:</b> {item.note || 'Không có ghi chú'}</p>{balances?.has(item.id) && <p><b>Số dư sau giao dịch:</b> {money(balances.get(item.id)!)} đ</p>}<div className="finance-entry-actions">{item.source === 'invoice' && onInvoices && <button onClick={() => onInvoices(item.invoiceId)}>Xem hóa đơn</button>}{manual && isAdmin && <><button onClick={() => onEdit(item)}>Sửa chứng từ</button><button className="negative" onClick={() => onDelete(item)}>Xóa chứng từ</button></>}{!manual && item.source !== 'invoice' && <p>Giao dịch liên kết được quản lý tại Ví / Đầu tư.</p>}{manual && !isAdmin && <p>Chỉ quản trị viên được sửa hoặc xóa chứng từ.</p>}</div></div></details></div>
    })}</div>}
    {!loading && !error && searched.length > limit && <button className="finance-load-more" onClick={() => setLimit(v => v + 24)}>Xem thêm giao dịch ({searched.length - limit})</button>}
  </section>
}
