import type { InvestmentTransaction, InvestmentStore } from './investment-store'

export type FundingMethod = 'cash' | 'transfer'
export type FundingBalances = { bankBalance: number; cashBalance: number; totalBalance: number }
export type WalletPosting = { paymentMethod: FundingMethod; amount: number }

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`

export function investmentWalletImpact(type: string, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền phải lớn hơn 0 và hợp lệ.')
  if (type === 'buy' || type === 'withdraw') return -amount
  if (type === 'sell' || type === 'deposit') return amount
  throw new Error('Tài sản mới phải được mua từ Ví. Hãy nạp tiền vào Ví trước khi mua.')
}

// Only a recorded posting proves money moved. Legacy walletImpactVnd did not debit the real wallet.
export function fundingAdjustments(
  previous: InvestmentTransaction | undefined,
  next?: WalletPosting
): WalletPosting[] {
  const amounts = new Map<FundingMethod, number>()
  if (previous?.walletPosting)
    amounts.set(previous.walletPosting.paymentMethod, -previous.walletPosting.amount)
  if (next) amounts.set(next.paymentMethod, (amounts.get(next.paymentMethod) || 0) + next.amount)
  return Array.from(amounts, ([paymentMethod, amount]) => ({ paymentMethod, amount })).filter(
    (item) => item.amount !== 0
  )
}

export function validateFunding(balances: FundingBalances, adjustments: WalletPosting[]): void {
  if (
    ![balances.bankBalance, balances.cashBalance, balances.totalBalance].every(Number.isFinite) ||
    adjustments.some(
      (item) => !Number.isFinite(item.amount) || !['cash', 'transfer'].includes(item.paymentMethod)
    )
  ) {
    throw new Error('Không xác định được số dư Ví hợp lệ. Hãy tải lại trước khi giao dịch.')
  }
  const net = adjustments.reduce((sum, item) => sum + item.amount, 0)
  if (net < 0 && balances.totalBalance + net < 0) {
    throw new Error(
      `Ví không đủ tiền. Khả dụng ${money(Math.max(0, balances.totalBalance))}; còn thiếu ${money(-(balances.totalBalance + net))}. Hãy nạp thêm tiền hoặc chờ tiền thu vào Ví.`
    )
  }
  for (const item of adjustments) {
    const balance = item.paymentMethod === 'cash' ? balances.cashBalance : balances.bankBalance
    if (item.amount < 0 && balance + item.amount < 0) {
      throw new Error(
        `${item.paymentMethod === 'cash' ? 'Ví tiền mặt' : 'Ví ngân hàng'} không đủ tiền; còn thiếu ${money(-(balance + item.amount))}. Hãy nạp hoặc chuyển tiền vào ví này.`
      )
    }
  }
}

export async function commitFundedInvestment(options: {
  previous?: InvestmentTransaction
  nextPosting?: WalletPosting
  nextStore: InvestmentStore
  reference: string
  date: string
  readBalances: () => Promise<FundingBalances>
  createPosting: (posting: WalletPosting, reference: string, date: string) => Promise<string>
  removePosting: (id: string) => Promise<void>
  persist: (store: InvestmentStore) => Promise<void>
}): Promise<void> {
  const commit = async () => {
    const adjustments = fundingAdjustments(options.previous, options.nextPosting)
    const balances = await options.readBalances()
    validateFunding(balances, adjustments)
    const created: string[] = []
    try {
      for (const posting of adjustments) {
        created.push(await options.createPosting(posting, options.reference, options.date))
      }
      await options.persist(options.nextStore)
    } catch (error) {
      const rollback = await Promise.allSettled(created.map((id) => options.removePosting(id)))
      if (rollback.some((result) => result.status === 'rejected')) {
        throw new Error(
          `Chưa lưu được danh mục và chưa hoàn tác được chứng từ Ví (${created.join(', ')}). Cần đối soát trước khi thử lại.`
        )
      }
      throw error
    }
  }
  // Serialize same-profile windows so each operation rechecks the preceding wallet debit.
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request('investment-wallet-ledger', commit)
  } else {
    await commit()
  }
}
