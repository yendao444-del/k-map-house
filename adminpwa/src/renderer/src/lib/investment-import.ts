import type { InvestmentStore } from './investment-store'
import { investmentPayload } from './investment-cloud-policy'

const cryptoSymbols = new Set(['BTC','ETH','BNB','SOL','USDT','ADA','XRP','DOT','DOGE','SHIB','AVAX','LINK','MATIC','LTC','UNI'])
export function parseElectronInvestmentImport(text: string): InvestmentStore {
  if (new TextEncoder().encode(text).length > 8_000_000) throw new Error('Tệp danh mục vượt 8 MB.')
  let raw: InvestmentStore
  try { raw = JSON.parse(text) } catch { throw new Error('Tệp JSON không hợp lệ.') }
  if (!raw || !Array.isArray(raw.holdings) || !Array.isArray(raw.transactions)) throw new Error('Đây không phải tệp danh mục đầu tư Electron.')
  const removed = new Set(raw.holdings.filter(item => (item.category as string) === 'crypto').map(item => String(item.symbol || '').toUpperCase()))
  for (const item of raw.holdings) {
    const symbol = String(item.symbol || '').toUpperCase()
    if (symbol.endsWith('USDT') || cryptoSymbols.has(symbol)) removed.add(symbol)
  }
  // Exactly the Electron migration rule: remove crypto transactions; historical
  // aggregate snapshots cannot be corrected per asset, so rebuild that history.
  return investmentPayload({
    holdings: raw.holdings.filter(item => (item.category as string) !== 'crypto'),
    transactions: raw.transactions.filter(item => !removed.has(String(item.assetSymbol || '').toUpperCase())),
    portfolioSnapshots: removed.size > 0 ? [] : raw.portfolioSnapshots || [],
    categoryTargets: Object.fromEntries(Object.entries(raw.categoryTargets || {}).filter(([key]) => key !== 'crypto'))
  })
}
