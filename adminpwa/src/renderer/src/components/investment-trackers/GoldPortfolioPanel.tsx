import { useId, useRef, type KeyboardEvent } from 'react'
import { Clock3, Gem } from 'lucide-react'
import type { InvestmentHolding, InvestmentTransaction } from '../../lib/investment-store'
import { GoldHoldings } from './GoldHoldings'
import { GoldTransactionHistory } from './GoldTransactionHistory'
import type { GoldValuation } from '../../lib/gold-valuation'

export type GoldPortfolioTab = 'holdings' | 'history'

export function GoldPortfolioPanel({ tab, onTabChange, rows, valuations, transactions, holdings, onAdd, onTrade, onEdit, onDelete }: {
  tab: GoldPortfolioTab
  onTabChange: (tab: GoldPortfolioTab) => void
  rows: InvestmentHolding[]
  valuations?: Record<string, GoldValuation>
  transactions: InvestmentTransaction[]
  holdings: InvestmentHolding[]
  onAdd: () => void
  onTrade: (holding: InvestmentHolding, type: 'buy' | 'sell') => void
  onEdit: (transaction: InvestmentTransaction) => void
  onDelete: (transaction: InvestmentTransaction) => void
}) {
  const id = useId()
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const tabs = [
    { key: 'holdings' as const, label: 'Vàng đang nắm giữ', count: rows.length, icon: Gem },
    { key: 'history' as const, label: 'Giao dịch gần đây', count: transactions.length, icon: Clock3 }
  ]
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = (index + 1) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    onTabChange(tabs[next].key)
    buttons.current[next]?.focus()
  }

  return <section id="investment-category-history" className="gold-portfolio-panel investment-tracker-copy">
    <div className="gold-portfolio-tabs" role="tablist" aria-label="Danh mục vàng">
      {tabs.map(({ key, label, count, icon: Icon }, index) => <button
        key={key}
        ref={node => { buttons.current[index] = node }}
        id={`${id}-${key}-tab`}
        type="button"
        role="tab"
        aria-selected={tab === key}
        aria-controls={`${id}-${key}-panel`}
        tabIndex={tab === key ? 0 : -1}
        onClick={() => onTabChange(key)}
        onKeyDown={event => navigate(event, index)}
      ><Icon size={23} aria-hidden="true" /><span>{label} <span className="gold-tab-count">({count})</span></span></button>)}
    </div>
    {tabs.map(({ key }) => <div key={key} id={`${id}-${key}-panel`} role="tabpanel" aria-labelledby={`${id}-${key}-tab`} hidden={tab !== key} tabIndex={0}>
      {tab === key && (key === 'holdings'
        ? <GoldHoldings rows={rows} valuations={valuations} onAdd={onAdd} onTrade={onTrade} embedded />
        : <GoldTransactionHistory rows={transactions} holdings={holdings} onEdit={onEdit} onDelete={onDelete} embedded />)}
    </div>)}
  </section>
}
