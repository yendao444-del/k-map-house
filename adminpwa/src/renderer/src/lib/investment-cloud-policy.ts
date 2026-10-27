import type { InvestmentStore } from './investment-store'

export type CloudInvestmentSnapshot = { data: InvestmentStore; version: number }
export class InvestmentCommitUncertainError extends Error {
  readonly uncertain = true
  constructor(readonly requestId: string) {
    super(`Chưa xác định kết quả lưu danh mục (${requestId}). Không tự hoàn tác chứng từ Ví; hãy tải lại và đối soát trước khi thử lại.`)
  }
}

export function investmentPayload(data: InvestmentStore): Omit<InvestmentStore, 'pwaVersion'> {
  if (!Array.isArray(data.holdings) || !Array.isArray(data.transactions) || !Array.isArray(data.portfolioSnapshots)) throw new Error('Dữ liệu danh mục không hợp lệ.')
  if (data.holdings.length > 10000 || data.transactions.length > 100000 || data.portfolioSnapshots.length > 20000) throw new Error('Danh mục vượt giới hạn lưu trữ.')
  const symbols = new Set<string>()
  for (const holding of data.holdings) {
    if (!holding || !['cash', 'gold', 'stocks', 'bonds', 'savings'].includes(holding.category) || typeof holding.symbol !== 'string' || !holding.symbol.trim() || symbols.has(holding.symbol.toUpperCase()) || !Number.isFinite(holding.valueVnd) || holding.valueVnd < 0) throw new Error('Tài sản trong danh mục không hợp lệ hoặc trùng mã.')
    symbols.add(holding.symbol.toUpperCase())
  }
  const ids = new Set<string>()
  for (const tx of data.transactions) {
    if (!tx || typeof tx.id !== 'string' || !tx.id || ids.has(tx.id) || !['deposit', 'withdraw', 'buy', 'sell', 'import-existing'].includes(tx.transactionType) || !Number.isFinite(tx.amountVnd) || tx.amountVnd < 0 || !Number.isFinite(Date.parse(tx.date))) throw new Error('Lịch sử giao dịch không hợp lệ hoặc trùng mã.')
    ids.add(tx.id)
    if (tx.walletPosting && (!['cash', 'transfer'].includes(tx.walletPosting.paymentMethod) || !Number.isFinite(tx.walletPosting.amount))) throw new Error('Chứng từ nguồn vốn không hợp lệ.')
  }
  const payload = { holdings: data.holdings, transactions: data.transactions, portfolioSnapshots: data.portfolioSnapshots, categoryTargets: data.categoryTargets || {} }
  // JSON cannot preserve non-finite numbers; reject instead of persisting null.
  JSON.stringify(payload, (_key, value) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Danh mục chứa số không hợp lệ.')
    return value
  })
  return payload
}

export function parseInvestmentSnapshot(value: unknown): CloudInvestmentSnapshot {
  const snapshot = value as CloudInvestmentSnapshot | null
  if (!snapshot || !Number.isSafeInteger(snapshot.version) || snapshot.version < 0 || !snapshot.data) throw new Error('Máy chủ trả danh mục hoặc phiên bản không hợp lệ.')
  return { data: { ...investmentPayload(snapshot.data), pwaVersion: snapshot.version }, version: snapshot.version }
}

export async function commitCloudInvestment(options: {
  store: InvestmentStore; requestId: string
  send: (payload: { p_data: Omit<InvestmentStore, 'pwaVersion'>; p_expected_version: number; p_request_id: string }) => Promise<unknown>
}) {
  if (!Number.isSafeInteger(options.store.pwaVersion) || Number(options.store.pwaVersion) < 0) throw new Error('Hãy tải danh mục từ máy chủ trước khi lưu.')
  const payload = { p_data: investmentPayload(options.store), p_expected_version: Number(options.store.pwaVersion), p_request_id: options.requestId }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = parseInvestmentSnapshot(await options.send(payload))
      if (result.version !== payload.p_expected_version + 1) throw new Error('Phiên bản trả về không khớp thao tác lưu.')
      return result
    }
    catch (error) {
      // Explicit database rejection is definitive; transport loss isn't.
      if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^([0-9A-Z]{5}|PGRST\d+)$/.test(error.code)) throw error
      if (attempt === 1) throw new InvestmentCommitUncertainError(options.requestId)
    }
  }
  throw new InvestmentCommitUncertainError(options.requestId)
}
