import { CircleDollarSign, Clock3, Pencil, Trash2 } from 'lucide-react'
import type { InvestmentHolding, InvestmentTransaction } from '../../lib/investment-store'

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`
const names: Record<string, string> = {
  VNHAN: 'Vàng nhẫn', SJ9999: 'Nhẫn SJC 99.99', VMIENG: 'Vàng miếng SJC',
  SJL1L10: 'Vàng miếng SJC', VKIENG: 'Vàng kiềng', PQHN24NTT: 'Nhẫn PNJ 24K', BT9999NTT: 'Nhẫn Bảo Tín 9999'
}

export function GoldTransactionHistory({ rows, holdings, onEdit, onDelete }: {
  rows: InvestmentTransaction[]
  holdings: InvestmentHolding[]
  onEdit: (transaction: InvestmentTransaction) => void
  onDelete: (transaction: InvestmentTransaction) => void
}) {
  return (
    <div className="investment-tracker-copy">
      <section id="investment-category-history" className="panel focus-panel gold-history-panel scroll-mt-4">
        <div className="panel-title"><div><Clock3 size={20} /><h2>Giao dịch gần đây</h2></div></div>
        {rows.length ? (
          <div className="table-shell transaction-list-table-wrapper">
            <table className="transaction-list-table">
              <thead><tr>
                <th>Thời gian</th><th>Loại GD</th><th>Sản phẩm</th>
                <th style={{ textAlign: 'right' }}>Số lượng</th>
                <th style={{ textAlign: 'right' }}>Giá vốn</th>
                <th style={{ textAlign: 'right' }}>Thành tiền</th>
                <th>Trạng thái</th><th style={{ textAlign: 'center', width: 80 }}>Thao tác</th>
              </tr></thead>
              <tbody>{rows.map((tx) => {
                const selling = tx.transactionType === 'sell'
                const imported = tx.transactionType === 'import-existing'
                const quantity = tx.quantity || 0
                const unitPrice = tx.unitPriceVnd || (quantity > 0 ? (tx.capitalAmountVnd ?? tx.amountVnd) / quantity : 0)
                const name = holdings.find((holding) => holding.symbol.toUpperCase() === tx.assetSymbol.toUpperCase())?.name || names[tx.assetSymbol.toUpperCase()] || tx.assetSymbol
                return <tr key={tx.id}>
                  <td><div className="tx-time-cell"><strong>{tx.date.split('-').reverse().join('/')}</strong><small style={{ fontSize: 10, marginTop: 2 }}>{tx.id} · {tx.fundingSource === 'opening-balance' ? 'Số dư đầu kỳ' : 'Ví'}</small></div></td>
                  <td><span className={`tx-type-badge ${selling ? 'tx-type-sell' : imported ? 'tx-type-import' : 'tx-type-buy'}`}>{selling ? 'Bán' : imported ? 'Nhập tài sản' : 'Mua'}</span></td>
                  <td><div className="tx-asset-cell" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="asset-badge" style={{ backgroundColor: 'var(--color-gold)', minWidth: 32, height: 20, padding: '0 4px', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{tx.assetSymbol.slice(0, 2)}</span><span>{name}</span></div></td>
                  <td style={{ textAlign: 'right' }}>{quantity > 0 ? `${new Intl.NumberFormat('vi-VN').format(quantity)} ${tx.unit || 'chỉ'}` : '-'}</td>
                  <td style={{ textAlign: 'right' }}>{unitPrice > 0 ? money(unitPrice) : '-'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: selling ? 'var(--color-red)' : 'var(--color-primary)' }}>{selling ? '-' : '+'}{money(tx.amountVnd)}</td>
                  <td><span className={`status ${tx.status}`} style={{ margin: 0 }}>{tx.status === 'done' ? 'Hoàn tất' : 'Bản nháp'}</span></td>
                  <td><div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button type="button" className="tx-edit-btn" title="Sửa giao dịch" aria-label={`Sửa giao dịch ${tx.id}`} onClick={() => onEdit(tx)}><Pencil size={15} /></button>
                    <button type="button" className="tx-delete-btn" title="Xóa giao dịch" aria-label={`Xóa giao dịch ${tx.id}`} onClick={() => onDelete(tx)}><Trash2 size={16} /></button>
                  </div></td>
                </tr>
              })}</tbody>
            </table>
          </div>
        ) : <div className="empty-state"><CircleDollarSign size={22} /><strong>Chưa có dữ liệu</strong><span>Chưa có giao dịch cho danh mục này.</span></div>}
      </section>
    </div>
  )
}
