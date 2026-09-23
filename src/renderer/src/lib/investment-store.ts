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
  holdings: InvestmentHolding[]
  transactions: InvestmentTransaction[]
  portfolioSnapshots: InvestmentSnapshot[]
  categoryTargets?: Record<string, number>
}

export async function readInvestmentStore(): Promise<{ data: InvestmentStore; importedFrom?: string }> {
  const result = (await window.api.investment.read()) as { data?: Partial<InvestmentStore>; importedFrom?: string }
  return {
    data: {
      holdings: result.data?.holdings || [],
      transactions: result.data?.transactions || [],
      portfolioSnapshots: result.data?.portfolioSnapshots || [],
      categoryTargets: result.data?.categoryTargets || {}
    },
    importedFrom: result.importedFrom
  }
}

export async function writeInvestmentStore(data: InvestmentStore): Promise<void> {
  await window.api.investment.write(data)
}
