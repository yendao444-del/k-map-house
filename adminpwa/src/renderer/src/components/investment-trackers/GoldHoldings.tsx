import { useEffect, useRef, useState } from 'react'
import { Gem, Plus, X } from 'lucide-react'
import type { InvestmentHolding } from '../../lib/investment-store'
import { fetchCurrentGoldPrices, suggestedGoldPricePerChi, type GoldPricesResponse } from '../../lib/goldApi'

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(value))} đ`
const quoteCodes: Record<string, string> = { VNHAN: 'SJ9999', VMIENG: 'SJL1L10' }

export function GoldHoldings({ rows, onTrade, onAdd }: {
  rows: InvestmentHolding[]
  onTrade: (holding: InvestmentHolding, type: 'buy' | 'sell') => void
  onAdd: () => void
}) {
  const [prices, setPrices] = useState<GoldPricesResponse | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    let active = true
    void fetchCurrentGoldPrices().then(result => { if (active) setPrices(result) })
    return () => { active = false }
  }, [])

  const table = (items: InvestmentHolding[], detailed = false) => <div className="table-shell">
    <table className="compact-table"><thead><tr>
      <th>Tài sản</th><th>Số lượng &amp; Giá mua</th><th>Giá vốn</th>
      <th>Giá trị &amp; Tỷ trọng</th><th>Hiệu suất (PnL)</th><th>Thao tác</th>
    </tr></thead><tbody>{items.map(item => {
      const raw = item.quantity.match(/[\d.,]+/)?.[0] || '0'
      const quantity = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw) || 0
      // Match the original portfolio's valuation/cost semantics without rewriting stored holdings.
      const denominator = 1 + item.pnlPercent / 100
      const cost = denominator > 0 ? item.valueVnd / denominator : null
      const current = suggestedGoldPricePerChi(prices, quoteCodes[item.symbol] || item.symbol, 'buy')
      const drift = item.allocationPercent - item.targetPercent
      const signed = (value: number) => value >= 0 ? '+' : ''
      return <tr key={item.symbol} className={selected === item.symbol ? 'selected' : ''}>
        <td><div className="asset-cell"><Gem size={24} color="#d97706" /><div>
          <button type="button" className="gold-holding-name" onClick={() => { setSelected(item.symbol); if (!detailed) dialog.current?.showModal() }}><strong>{item.symbol}</strong></button>
          <small>{item.name}</small>
        </div></div></td>
        <td><strong>{item.quantity}</strong><small title={current ? 'Giá bán niêm yết hiện tại / chỉ' : 'Giá đơn vị theo giá trị đã ghi nhận'}>{quantity > 0 ? money(current || item.valueVnd / quantity) : '—'}</small></td>
        <td><strong>{cost === null ? '—' : money(cost)}</strong><small>{cost !== null && quantity > 0 ? money(cost / quantity) : '—'}</small></td>
        <td><strong>{money(item.valueVnd)}</strong><small>{item.allocationPercent.toFixed(1)}% / {item.targetPercent}% <span>({drift === 0 ? 'Cân bằng' : `${signed(drift)}${drift.toFixed(1)}%`})</span></small><div className="mini-bar"><i style={{ width: `${Math.max(0, Math.min(item.allocationPercent * 2.8, 100))}%`, background: '#d97706' }} /></div></td>
        <td className={item.pnlPercent >= 0 ? 'positive' : 'negative'}><strong>{signed(item.pnlPercent)}{item.pnlPercent.toFixed(2)}%</strong><small>{cost === null ? '—' : `${signed(item.valueVnd - cost)}${money(item.valueVnd - cost)}`}</small></td>
        <td><div className="table-action-column">{(['buy', 'sell'] as const).map(type => <button key={type} type="button" className={`table-action-btn ${type}`} onClick={() => { dialog.current?.close(); onTrade(item, type) }}>{type === 'buy' ? 'Mua' : 'Bán'}</button>)}</div></td>
      </tr>
    })}</tbody></table>
  </div>

  return <div className="investment-tracker-copy gold-holdings-panel">
    <section className="banner-holdings-strip banner-holdings-standalone" style={{ borderColor: '#d9770655' }}>
      <div className="banner-holdings-head"><div><Gem size={20} color="#d97706" /><strong>Vàng đang nắm giữ</strong></div><div>
        <button type="button" className="gold-holdings-add" onClick={onAdd}><Plus size={14} />Thêm</button>
        <button type="button" disabled={!rows.length} onClick={() => { setSelected(null); dialog.current?.showModal() }}>Xem chi tiết</button>
      </div></div>
      {table(rows)}
      {!rows.length && <div className="empty-state"><Gem size={22} /><strong>Chưa có vàng đang nắm giữ</strong></div>}
    </section>
    <dialog ref={dialog} className="gold-holdings-dialog">
      <div className="banner-holdings-head"><strong>Chi tiết vàng đang nắm giữ</strong><button type="button" aria-label="Đóng chi tiết" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      {table(selected ? rows.filter(row => row.symbol === selected) : rows, true)}
    </dialog>
  </div>
}
