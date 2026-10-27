import type { MyHanhGoldPrices } from '../../../shared/my-hanh-gold'
import type { InvestmentHolding } from './investment-store'
import { suggestedMyHanhPricePerChi } from './goldApi'

export type GoldValuation = {
  costVnd: number | null
  unitCostVnd: number | null
  unitPriceVnd: number | null
  valueVnd: number | null
  pnlVnd: number | null
  pnlPercent: number | null
}

// Read-only marks: never persist a market quote into the remaining cost basis.
// Existing imported portfolios can carry a marked value and historical PnL;
// new purchases/partial sales carry remaining cost with pnlPercent = 0.
export function valueGoldHolding(holding: InvestmentHolding, quotes: MyHanhGoldPrices | null): GoldValuation {
  const raw = holding.quantity.match(/[\d.,]+/)?.[0] || '0'
  const quantity = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw)
  const denominator = 1 + holding.pnlPercent / 100
  const costVnd = denominator > 0 && Number.isFinite(denominator) && Number.isFinite(holding.valueVnd) && holding.valueVnd >= 0
    ? holding.valueVnd / denominator : null
  const unitCostVnd = costVnd !== null && quantity > 0 ? costVnd / quantity : null
  // Only MH9999 may use this quote. Never relabel legacy SJC/PNJ holdings.
  const price = holding.symbol.toUpperCase() === 'MH9999' ? suggestedMyHanhPricePerChi(quotes, 'sell') : 0
  const unitPriceVnd = price > 0 ? price : null
  const valueVnd = unitPriceVnd !== null && quantity > 0 ? Math.round(unitPriceVnd * quantity) : null
  const pnlVnd = valueVnd !== null && costVnd !== null ? valueVnd - costVnd : null
  return { costVnd, unitCostVnd, unitPriceVnd, valueVnd, pnlVnd,
    pnlPercent: pnlVnd !== null && costVnd !== null && costVnd > 0 ? pnlVnd / costVnd * 100 : null }
}
