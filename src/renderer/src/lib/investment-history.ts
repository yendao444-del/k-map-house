import type { InvestmentCategory, InvestmentHolding, InvestmentTransaction } from './investment-store'

const GOLD_SYMBOLS = new Set(['VNHAN', 'VMIENG', 'VKIENG', 'SJ9999', 'SJL1L10', 'PQHN24NTT', 'BT9999NTT'])

export function transactionsForCategory(
  transactions: InvestmentTransaction[],
  holdings: InvestmentHolding[],
  category: InvestmentCategory
): InvestmentTransaction[] {
  // Include closed positions: transaction history must survive a zero balance.
  const symbols = new Set(holdings.filter((holding) => holding.category === category).map((holding) => holding.symbol.toUpperCase()))
  return transactions.filter((transaction) => {
    const symbol = transaction.assetSymbol.toUpperCase()
    return symbols.has(symbol) || (category === 'gold' && GOLD_SYMBOLS.has(symbol))
  })
}
