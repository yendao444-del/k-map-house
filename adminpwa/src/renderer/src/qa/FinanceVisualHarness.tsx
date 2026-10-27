import { useState } from 'react'
import { MobileCashFlow } from '../components/MobileCashFlow'
import { MobilePnl } from '../components/MobilePnl'
import type { CashFlowRow } from '../components/CashFlowTab'
import type { PnlRow } from '../components/BusinessReport'
import type { CashTransactionCategory, CashTransactionType } from '../lib/db'
import '../assets/finance-mobile.css'

// Presentation fixtures only: no query, auth override, backend call or money mutation.
const categories = [{ value: 'electric', label: 'Hóa đơn điện tổng', type: 'expense' as const }]
const fixtureRows: CashFlowRow[] = Array.from({ length: 50 }, (_, index) => ({
  id: `fixture-${index}`, type: index % 2 ? 'income' : 'expense', category: 'electric',
  source: 'manual', amount: 100000 + index, transaction_date: '2026-10-09',
  room_id: 'fixture-room', note: `ĐIỆN TỔNG · Chứng từ giả lập ${index + 1}`, payment_method: 'cash',
  created_at: '2026-10-09', updated_at: '2026-10-09'
}))
const pnlRows: PnlRow[] = [
  { key: 'rev', label: 'A. Doanh thu thực thu', amount: 0, section: 'revenue', group: true },
  { key: 'cost', label: 'B. Chi phí vận hành thực tế', amount: -100000, section: 'opex', group: true },
  { key: 'electric', label: 'Hóa đơn điện tổng', amount: -100000, section: 'opex', cashType: 'expense' },
  { key: 'zero', label: 'Khoản mục chưa phát sinh', amount: 0, section: 'opex', cashType: 'expense' },
  { key: 'net', label: 'C. Lợi nhuận thực (A − B)', amount: -100000, section: 'result', total: true }
]
export default function FinanceVisualHarness() {
  const [state, setState] = useState('ready')
  const [type, setType] = useState<'all' | CashTransactionType>('all')
  const [category, setCategory] = useState<'all' | CashTransactionCategory>('all')
  const [notice, setNotice] = useState('')
  const rows = state === 'empty' ? [] : fixtureRows.filter(row => type === 'all' || row.type === type)
  return <div className="pwa-reports-screen h-dvh overflow-y-auto bg-[#f7faf8] p-3 space-y-4">
    <label>QA giả lập (không ghi dữ liệu)<select aria-label="Trạng thái QA" value={state} onChange={e => setState(e.target.value)} className="border p-2"><option value="ready">Danh sách dài · nhân viên</option><option value="admin">Quản trị viên</option><option value="loading">Đang tải</option><option value="error">Lỗi</option><option value="empty">Rỗng</option><option value="pnl">P&L âm / khoản mục 0</option></select></label>
    {notice && <p role="status">{notice}</p>}
    {state === 'pnl' ? <MobilePnl rows={pnlRows} revenue={0} cost={100000} profit={-100000} loading={false} error={false} onDrill={row => setNotice(`Xem ${row.label}`)} chart={<p>Biểu đồ giả lập</p>} /> : <MobileCashFlow rows={rows} income={200000} expense={100000} loading={state === 'loading'} error={state === 'error'} typeFilter={type} setTypeFilter={setType} categoryFilter={category} setCategoryFilter={setCategory} categories={categories} targetLabel={() => 'Phòng giả lập 999'} onCreate={() => setNotice('Tạo chứng từ giả lập')} onEdit={() => setNotice('Sửa giả lập')} onDelete={() => setNotice('Xóa giả lập')} isAdmin={state === 'admin'} />}
  </div>
}
