import { commitCloudInvestment, investmentPayload, parseInvestmentSnapshot } from './investment-cloud-policy'
import { supabase } from './supabase'

export type InvestmentCategory = 'cash' | 'gold' | 'stocks' | 'bonds' | 'savings'
export type InvestmentTransactionType = 'deposit' | 'withdraw' | 'buy' | 'sell' | 'import-existing'

export type InvestmentHolding = {
  symbol: string
  name: string
  category: InvestmentCategory
  group: string
  valueVnd: number
  quantity: string
  allocationPercent: number
  targetPercent: number
  pnlPercent: number
}

export type InvestmentTransaction = {
  id: string
  date: string
  occurredAt?: string
  transactionType: InvestmentTransactionType
  assetSymbol: string
  amountVnd: number
  status: 'done' | 'draft'
  note: string
  quantity?: number
  unit?: string
  unitPriceVnd?: number
  capitalAmountVnd?: number
  walletImpactVnd?: number
  linkedAssetSymbol?: string
  fundingSource?: 'wallet' | 'opening-balance' | 'investment-wallet'
  walletPosting?: { paymentMethod: 'cash' | 'transfer'; amount: number }
  assetValueImpactVnd?: number
  operatingPostingIds?: string[]
}

export type InvestmentSnapshot = {
  id: string
  capturedAt: string
  totalValueVnd: number
  totalCapitalVnd: number
  cashValueVnd: number
  investedValueVnd: number
}

export type InvestmentStore = {
  // Snapshot-specific CAS token; never infer it from the last unrelated read.
  pwaVersion?: number
  holdings: InvestmentHolding[]
  transactions: InvestmentTransaction[]
  portfolioSnapshots: InvestmentSnapshot[]
  categoryTargets?: Record<string, number>
}

// Compatibility aliases used by the ported source trackers.
export type HoldingRecord = InvestmentHolding
export type TransactionRecord = InvestmentTransaction

// Electron and the PWA share ONE cloud portfolio. The server commit derives
// operating-wallet receipts atomically, so a purchase on either app is seen by
// the other and can never fund the investment wallet a second time.
const rpcError = (error: { message: string; code?: string }) => Object.assign(new Error(error.message), { code: error.code })

// 'property' is the shared rental portfolio funded by the operating wallet.
// 'personal' is DBY Finance: one private portfolio per admin, external money only.
export type InvestmentPortfolio = 'property' | 'personal'
const RPC = {
  property: { read: 'admin_pwa_investment_read', commit: 'admin_pwa_investment_commit' },
  personal: { read: 'dby_finance_investment_read', commit: 'dby_finance_investment_commit' }
} as const

export async function readInvestmentStore(portfolio: InvestmentPortfolio = 'property'): Promise<{ data: InvestmentStore; importedFrom?: string }> {
  // The DB pre-request hook treats every POST as a write needing a fresh
  // step-up; DBY Finance reads via GET (read-only transaction) instead.
  const { data, error } = portfolio === 'personal'
    ? await supabase.rpc(RPC.personal.read, {}, { get: true })
    : await supabase.rpc(RPC.property.read)
  if (error) throw rpcError(error)
  return { data: parseInvestmentSnapshot(data).data }
}

export async function writeInvestmentStore(data: InvestmentStore, portfolio: InvestmentPortfolio = 'property'): Promise<void> {
  const result = await commitCloudInvestment({ store: data, requestId: crypto.randomUUID(), send: async payload => {
    const { data: snapshot, error } = await supabase.rpc(RPC[portfolio].commit, payload)
    if (error) throw rpcError(error)
    return snapshot
  } })
  data.pwaVersion = result.version
}

// Legacy Windows JSON, read only for the one-time import into the cloud.
export async function readLocalInvestmentStore(): Promise<InvestmentStore> {
  const result = (await window.api.investment.read()) as { data?: Partial<InvestmentStore> }
  return investmentPayload({
    holdings: result.data?.holdings || [],
    transactions: result.data?.transactions || [],
    portfolioSnapshots: result.data?.portfolioSnapshots || [],
    categoryTargets: result.data?.categoryTargets || {}
  })
}

// Imports receipts already posted by Electron; the server never posts again.
export async function importLocalInvestmentStore(store: InvestmentStore) {
  return commitCloudInvestment({ store, requestId: crypto.randomUUID(), send: async payload => {
    const { data, error } = await supabase.rpc('admin_pwa_investment_import', payload)
    if (error) throw rpcError(error)
    return data
  } })
}

// The cloud accepts an import only while it holds no history or value.
export const isInvestmentStoreEmpty = (store: InvestmentStore) =>
  store.transactions.length === 0 && store.holdings.every(item => item.valueVnd === 0 && !(parseFloat(item.quantity) > 0))
