export type WalletMethod = 'cash' | 'transfer' | 'unknown'

/** Origin (manual/SePay) and the actual wallet are different concepts. */
export function resolveWalletMethod(method?: string, source?: string): WalletMethod {
  if (method === 'cash' || method === 'transfer') return method
  return source === 'sepay' ? 'transfer' : 'unknown'
}

export type WalletEntry = {
  id?: string
  date: string
  amount: number
  type: 'income' | 'expense'
  paymentMethod: WalletMethod
}

export type WalletCheckpoint = {
  id: string
  bank_balance: number
  cash_balance: number
  bank_balance_before: number
  cash_balance_before: number
  total_before: number
  entry_ids: string[]
  confirmed_at: string
  confirmed_by: string
  reason: string
}

/** Audited reporting boundary, not a replacement monetary balance. */
export type WalletAccountingBasis = {
  id: string
  starts_on: string
  method_overrides: Record<string, 'cash' | 'transfer'>
  reason: string
  confirmed_at: string
}

export function summarizeWalletEntries(
  entries: WalletEntry[],
  settings: { opening_balance_cash?: number; opening_balance_bank?: number; opening_balance_date?: string; wallet_checkpoint?: WalletCheckpoint; wallet_accounting_basis?: WalletAccountingBasis }
) {
  const basis = settings.wallet_accounting_basis
  const checkpoint = basis ? undefined : settings.wallet_checkpoint
  const frozenIds = new Set(checkpoint?.entry_ids || [])
  const openingDate = basis?.starts_on || settings.opening_balance_date || ''
  let cashBalance = basis ? 0 : Number(checkpoint?.cash_balance ?? settings.opening_balance_cash ?? 0)
  let bankBalance = basis ? 0 : Number(checkpoint?.bank_balance ?? settings.opening_balance_bank ?? 0)
  let unassignedBalance = 0
  let unassignedCount = 0
  for (const entry of entries) {
    if (checkpoint ? entry.id && frozenIds.has(entry.id) : openingDate && entry.date < openingDate) continue
    const delta = entry.type === 'income' ? entry.amount : -entry.amount
    const method = (entry.id && basis?.method_overrides[entry.id]) || entry.paymentMethod
    if (method === 'cash') cashBalance += delta
    else if (method === 'transfer') bankBalance += delta
    else {
      unassignedBalance += delta
      unassignedCount++
    }
  }
  // Preserve the ledger, including unresolved transactions. Never fabricate money
  // by clamping a negative wallet or silently moving its expenses to another one.
  const totalBalance = cashBalance + bankBalance + unassignedBalance
  const reconciliationRequired = unassignedCount > 0 || cashBalance < 0 || bankBalance < 0
  return {
    cashBalance, bankBalance, totalBalance, unassignedBalance, unassignedCount,
    reconciliationRequired,
    availableBalance: reconciliationRequired ? 0 : totalBalance
  }
}

export function assertSingleWalletExpense(
  amount: number,
  method: string | undefined,
  balances: { cashBalance: number; bankBalance: number; unassignedCount?: number }
): void {
  if (method !== 'cash' && method !== 'transfer') throw new Error('Vui lòng chọn một ví chi tiền.')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền phải lớn hơn 0.')
  if (balances.unassignedCount) {
    throw new Error('Có giao dịch chưa xác định ví. Vui lòng đối soát nguồn tiền trước khi chi.')
  }
  const available = method === 'cash' ? balances.cashBalance : balances.bankBalance
  if (!Number.isFinite(available) || available < 0) {
    throw new Error('Ví đã chọn cần đối soát số dư trước khi chi.')
  }
  if (amount > available) {
    throw new Error('Ví đã chọn không đủ tiền. Phải ghi nhận chuyển giữa các ví trước khi chi; không cộng gộp hai ví hoặc tự đổi ví.')
  }
}
