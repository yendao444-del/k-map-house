import type { InvestmentStore, InvestmentTransaction } from './investment-store'
import { investmentBalance, validateFunding, type FundingBalances, type FundingMethod, type WalletPosting } from './investment-funding'

const money = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)} đ`

export class InvestmentFundingCancelled extends Error {
  constructor() { super('Đã hủy chuyển tiền từ Ví phòng trọ.'); this.name = 'InvestmentFundingCancelled' }
}

// Use the selected account first, then the other account. Never borrow from a
// negative sub-account or exceed the operating wallet's net available balance.
export function planInvestmentTopUp(shortfall: number, balances: FundingBalances, preferred: FundingMethod): WalletPosting[] {
  if (!Number.isFinite(shortfall) || shortfall <= 0 || !['cash', 'transfer'].includes(preferred)) throw new Error('Số tiền chuyển vốn không hợp lệ.')
  if (![balances.totalBalance, balances.bankBalance, balances.cashBalance].every(Number.isFinite)) throw new Error('Chưa xác định được số dư Ví phòng trọ. Hãy tải lại rồi thử lại.')
  if (balances.totalBalance < shortfall) throw new Error(`Ví đầu tư thiếu ${money(shortfall)}; Ví phòng trọ chỉ có ${money(Math.max(0, balances.totalBalance))}. Chưa thể mua tài sản.`)
  const methods: FundingMethod[] = [preferred, preferred === 'cash' ? 'transfer' : 'cash']
  let remaining = shortfall
  const postings = methods.flatMap(paymentMethod => {
    const available = paymentMethod === 'cash' ? balances.cashBalance : balances.bankBalance
    const amount = Math.min(remaining, Math.max(0, available))
    remaining -= amount
    return amount > 0 ? [{ paymentMethod, amount: -amount }] : []
  })
  if (remaining > 0) throw new Error('Ví phòng trọ không đủ tiền khả dụng để chuyển vốn.')
  validateFunding(balances, postings)
  return postings
}

export type InvestmentTopUpConfirmation = {
  assetSymbol?: string
  purchaseAmount: number
  investmentAvailable: number
  shortfall: number
  operatingAvailable: number
  postings: WalletPosting[]
}

export async function prepareInvestmentPurchase(options: {
  next?: InvestmentTransaction
  nextStore: InvestmentStore
  readOperating: () => Promise<FundingBalances>
  confirm: (plan: InvestmentTopUpConfirmation) => boolean | Promise<boolean>
}): Promise<{ store: InvestmentStore; transfers: InvestmentTransaction[] }> {
  const balance = investmentBalance(options.nextStore)
  const next = options.next
  if (!next || next.transactionType !== 'buy' || next.fundingSource !== 'investment-wallet') return { store: options.nextStore, transfers: [] }
  if (!Number.isFinite(balance) || !Number.isFinite(next.amountVnd) || next.amountVnd <= 0 || !next.walletPosting) throw new Error('Giao dịch mua hoặc số dư Ví đầu tư không hợp lệ.')
  if (options.nextStore.transactions.filter(tx => tx.id === next.id).length !== 1 || next.walletPosting.amount !== -next.amountVnd) throw new Error('Giao dịch mua không khớp với danh mục. Hãy tải lại rồi thử lại.')
  if (balance >= 0) return { store: options.nextStore, transfers: [] }
  const shortfall = -balance
  if (shortfall > next.amountVnd) throw new Error('Ví đầu tư đang có số dư âm trước giao dịch mua. Cần đối soát trước khi chuyển vốn.')
  const operating = await options.readOperating()
  const postings = planInvestmentTopUp(shortfall, operating, next.walletPosting.paymentMethod)
  if (!await options.confirm({ assetSymbol: next.assetSymbol, purchaseAmount: next.amountVnd, investmentAvailable: Math.max(0, next.amountVnd - shortfall), shortfall, operatingAvailable: operating.totalBalance, postings })) throw new InvestmentFundingCancelled()
  // The confirmation can remain open while another transaction spends money.
  // Revalidate the exact approved amounts; never silently enlarge a transfer.
  validateFunding(await options.readOperating(), postings)
  const transfers: InvestmentTransaction[] = postings.map(posting => ({
    id: `TX-AUTOFUND-${crypto.randomUUID()}`,
    date: next.date,
    occurredAt: new Date().toISOString(),
    transactionType: 'deposit', assetSymbol: 'CASH', amountVnd: -posting.amount, status: 'done',
    note: `Tự động chuyển vốn từ Ví phòng trọ để mua ${next.assetSymbol} · ${next.id}`,
    linkedAssetSymbol: next.assetSymbol, fundingSource: 'investment-wallet',
    walletPosting: { paymentMethod: posting.paymentMethod, amount: -posting.amount },
    walletImpactVnd: -posting.amount, assetValueImpactVnd: 0, quantity: 0, unit: 'VND'
  }))
  // Both funding entries and the purchase are saved together. Keeping a real
  // deposit in history makes transfers visible and avoids an invented balance.
  const transactions = options.nextStore.transactions.flatMap(tx => tx.id === next.id ? [...transfers, tx] : [tx])
  return { store: { ...options.nextStore, transactions }, transfers }
}
