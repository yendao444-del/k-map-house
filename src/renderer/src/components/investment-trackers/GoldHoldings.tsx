import { useRef, useState } from 'react'
import { Gem, Plus, X } from 'lucide-react'
import type { InvestmentHolding } from '../../lib/investment-store'
import { valueGoldHolding, type GoldValuation } from '../../lib/gold-valuation'

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(value))} đ`
const signed = (value: number) => value >= 0 ? '+' : ''

export function GoldHoldings({ rows, valuations, onTrade, onAdd, embedded = false }: {
  rows: InvestmentHolding[]
  valuations?: Record<string, GoldValuation>
  onTrade: (holding: InvestmentHolding, type: 'buy' | 'sell') => void
  onAdd: () => void
  embedded?: boolean
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  const table = (items: InvestmentHolding[], detailed = false) => <div className="table-shell">
    <table className="compact-table"><thead><tr>
      <th>Tài sản</th><th>Số lượng &amp; Giá mua TB</th><th>Giá tiệm mua vào</th>
      <th>Giá trị &amp; Tỷ trọng</th><th>Lãi/lỗ tạm tính</th><th>Thao tác</th>
    </tr></thead><tbody>{items.map(item => {
      const mark = valuations?.[item.symbol] ?? valueGoldHolding(item, null)
      const drift = item.allocationPercent - item.targetPercent
      return <tr key={item.symbol} className={selected === item.symbol ? 'selected' : ''}>
        <td data-label="Tài sản"><div className="asset-cell"><Gem size={24} color="#d97706" /><div>
          <button type="button" className="gold-holding-name" onClick={() => { setSelected(item.symbol); if (!detailed) dialog.current?.showModal() }}><strong>{item.symbol}</strong></button>
          <small>{item.name}</small>
        </div></div></td>
        <td data-label="Số lượng & Giá mua TB"><strong>{item.quantity}</strong><small>{mark.unitCostVnd === null ? '—' : `${money(mark.unitCostVnd)}/chỉ`}</small><small>Vốn: {mark.costVnd === null ? '—' : money(mark.costVnd)}</small></td>
        <td data-label="Giá tiệm mua vào"><strong>{mark.unitPriceVnd === null ? '—' : money(mark.unitPriceVnd)}</strong><small>{mark.unitPriceVnd === null ? 'Chưa có giá mới' : 'Mỗi chỉ · giá bán lại'}</small></td>
        <td data-label="Giá trị & Tỷ trọng"><strong>{mark.valueVnd === null ? '—' : money(mark.valueVnd)}</strong><small title="Tỷ trọng hiện tại / mục tiêu">{item.allocationPercent.toFixed(1)}% / {item.targetPercent}% <span>({drift === 0 ? 'Cân bằng' : `${signed(drift)}${drift.toFixed(1)}%`})</span></small><div className="mini-bar"><i style={{ width: `${Math.max(0, Math.min(item.allocationPercent, 100))}%`, background: '#d97706' }} /></div></td>
        <td data-label="Lãi/lỗ tạm tính" className={mark.pnlVnd === null ? 'gold-mark-unavailable' : mark.pnlVnd >= 0 ? 'positive' : 'negative'}><strong>{mark.pnlVnd === null ? '—' : `${signed(mark.pnlVnd)}${money(mark.pnlVnd)}`}</strong><small>{mark.pnlPercent === null ? 'Chưa đủ dữ liệu định giá' : `${signed(mark.pnlPercent)}${mark.pnlPercent.toFixed(2)}%`}</small></td>
        <td data-label="Thao tác"><div className="table-action-column">{(['buy', 'sell'] as const).map(type => <button key={type} type="button" className={`table-action-btn ${type}`} onClick={() => { dialog.current?.close(); onTrade(item, type) }}>{type === 'buy' ? 'Mua' : 'Bán'}</button>)}</div></td>
      </tr>
    })}</tbody></table>
  </div>

  return <div className="investment-tracker-copy gold-holdings-panel">
    <section className={`banner-holdings-strip banner-holdings-standalone${embedded ? ' gold-embedded-section' : ''}`} style={embedded ? undefined : { borderColor: '#d9770655' }} aria-label="Vàng đang nắm giữ">
      {(!embedded || rows.length > 0) && <div className="banner-holdings-head"><div>{embedded ? <small className="gold-valuation-note">Định giá theo giá tiệm mua vào · Lãi/lỗ chưa thực hiện</small> : <><Gem size={20} color="#d97706" /><strong>Vàng đang nắm giữ</strong></>}</div><div>
        {!embedded && <button type="button" className="gold-holdings-add" onClick={onAdd}><Plus size={14} />Thêm</button>}
        <button type="button" disabled={!rows.length} onClick={() => { setSelected(null); dialog.current?.showModal() }}>Xem chi tiết</button>
      </div></div>}
      {rows.length > 0 && table(rows)}
      {!rows.length && <div className={embedded ? 'gold-portfolio-empty' : 'empty-state'}><Gem size={36} aria-hidden="true" /><strong>Chưa có vàng đang nắm giữ</strong>{embedded && <span>Ghi nhận giao dịch mua để bắt đầu theo dõi.</span>}</div>}
    </section>
    {rows.length > 0 && <dialog ref={dialog} className="gold-holdings-dialog" aria-label="Chi tiết vàng đang nắm giữ">
      <div className="banner-holdings-head"><strong>Chi tiết vàng đang nắm giữ</strong><button type="button" aria-label="Đóng chi tiết" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      {table(selected ? rows.filter(row => row.symbol === selected) : rows, true)}
    </dialog>}
  </div>
}
