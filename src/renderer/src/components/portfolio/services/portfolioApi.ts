// Kept for source compatibility; the embedded build always uses localStorage.
const invoke = async <T>(_command: string, _args?: unknown): Promise<T> => {
  throw new Error('Tauri persistence is unavailable in the embedded portfolio module')
}

export type AssetCategory = 'cash' | 'gold' | 'crypto' | 'stocks' | 'etf' | 'bonds' | 'savings'
export type TransactionType = 'deposit' | 'withdraw' | 'buy' | 'sell' | 'import-existing'
export type TransactionStatus = 'done' | 'draft'
export type RebalanceAction = 'buy' | 'sell' | 'hold'
export type PriceSource = 'manual' | 'frontend-sync' | 'mock'
export type FundingSource = 'wallet' | 'opening-balance'
export type InboxSource = 'telegram'
export type InboxStatus = 'pending' | 'approved' | 'rejected'

export type HoldingRecord = {
  symbol: string
  name: string
  category: AssetCategory
  group: string
  valueVnd: number
  quantity: string
  allocationPercent: number
  targetPercent: number
  pnlPercent: number
}

export type TransactionRecord = {
  id: string
  date: string
  occurredAt?: string
  transactionType: TransactionType
  assetSymbol: string
  amountVnd: number
  status: TransactionStatus
  note: string
  quantity?: number
  unit?: string
  unitPriceVnd?: number
  capitalAmountVnd?: number
  feeVnd?: number
  walletImpactVnd?: number
  linkedAssetSymbol?: string
  fundingSource?: FundingSource
}

export type NewTransactionInput = {
  date: string
  occurredAt?: string
  transactionType: TransactionType
  assetSymbol: string
  amountVnd: number
  note: string
  quantity?: number
  unit?: string
  unitPriceVnd?: number
  capitalAmountVnd?: number
  feeVnd?: number
  walletImpactVnd?: number
  linkedAssetSymbol?: string
  fundingSource?: FundingSource
}

export type TelegramInboxParsedPayload = NewTransactionInput & {
  parserVersion: string
  summary: string
}

export type TelegramInboxEvent = {
  id: string
  source: InboxSource
  rawText: string
  status: InboxStatus
  createdAt: string
  reviewedAt?: string
  parserVersion: string
  parseError?: string
  draftTransaction?: TelegramInboxParsedPayload
  chatId?: number | null
  fromUsername?: string | null
}

export type TelegramInboxSyncResult = {
  importedCount: number
  skippedCount: number
  totalPending: number
}

export type HoldingInput = HoldingRecord

export type PriceQuote = {
  assetSymbol: string
  updatedAt: string
  priceVnd: number
  source: PriceSource
}

export type PriceQuoteInput = PriceQuote

export type PortfolioSnapshot = {
  totalValueVnd: number
  totalGainVnd: number
  cashAvailableVnd: number
  holdingCount: number
  transactionCount: number
}

export type PortfolioHistorySnapshot = {
  id: string
  capturedAt: string
  totalValueVnd: number
  totalCapitalVnd: number
  cashValueVnd: number
  investedValueVnd: number
  transactionId?: string
}

export type AllocationDriftAlert = {
  symbol: string
  name: string
  category: AssetCategory
  currentPercent: number
  targetPercent: number
  driftPercent: number
  suggestedAction: RebalanceAction
  suggestedAmountVnd: number
}

export type PortfolioAnalysis = {
  totalValueVnd: number
  driftAlerts: AllocationDriftAlert[]
}

const STORAGE_KEY = 'dbyfinance-data'

type LocalStoreData = {
  holdings: HoldingRecord[]
  transactions: TransactionRecord[]
  priceQuotes: PriceQuote[]
  portfolioSnapshots: PortfolioHistorySnapshot[]
  telegramInboxEvents: TelegramInboxEvent[]
}

function normalizeTransactions(transactions: TransactionRecord[]) {
  let changed = false
  const normalized = transactions.map((tx) => {
    if (tx.status === 'draft') {
      changed = true
      return { ...tx, status: 'done' as const }
    }
    return tx
  })

  return { transactions: normalized, changed }
}

function getLocalStore(): LocalStoreData {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return { holdings: [], transactions: [], priceQuotes: [], portfolioSnapshots: [], telegramInboxEvents: [] }
  }
  try {
    const parsed = JSON.parse(raw) as LocalStoreData
    const normalized = normalizeTransactions(parsed.transactions || [])
    const store: LocalStoreData = {
      holdings: parsed.holdings || [],
      transactions: normalized.transactions,
      priceQuotes: (parsed.priceQuotes || []).map((quote: any) => ({
        ...quote,
        updatedAt: quote.updatedAt || quote.quotedAt || new Date().toISOString(),
      })),
      portfolioSnapshots: parsed.portfolioSnapshots || [],
      telegramInboxEvents: parsed.telegramInboxEvents || [],
    }

    if (normalized.changed) {
      saveLocalStore(store)
    }

    return store
  } catch {
    return { holdings: [], transactions: [], priceQuotes: [], portfolioSnapshots: [], telegramInboxEvents: [] }
  }
}

function saveLocalStore(data: LocalStoreData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export async function listAssetCategories(): Promise<AssetCategory[]> {
  if (isTauriRuntime()) {
    return invoke<AssetCategory[]>('list_asset_categories')
  }
  return ['cash', 'gold', 'stocks', 'bonds', 'savings']
}

export async function getCategoryTargets(): Promise<Record<string, number>> {
  if (isTauriRuntime()) {
    try {
      return await invoke<Record<string, number>>('get_category_targets')
    } catch (e) {
      console.error('Error fetching category targets from Tauri backend:', e)
      return {}
    }
  }
  const raw = localStorage.getItem('dbyfinance-category-targets')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch (e) {
    console.error('Error parsing category targets:', e)
    return {}
  }
}

export async function saveCategoryTargets(targets: Record<string, number>): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await invoke<void>('save_category_targets', { targets })
      return
    } catch (e) {
      console.error('Error saving category targets to Tauri backend:', e)
    }
  }
  localStorage.setItem('dbyfinance-category-targets', JSON.stringify(targets))
}

export async function listHoldings(): Promise<HoldingRecord[]> {
  let rawHoldings: HoldingRecord[]
  if (isTauriRuntime()) {
    rawHoldings = await invoke<HoldingRecord[]>('list_holdings')
  } else {
    rawHoldings = getLocalStore().holdings
  }
  
  const targets = await getCategoryTargets()
  return rawHoldings.map(h => {
    const targetCat = h.category === 'cash' ? 'savings' : h.category
    return {
      ...h,
      targetPercent: targets[targetCat] ?? 20
    }
  })
}

export async function listTransactions(): Promise<TransactionRecord[]> {
  if (isTauriRuntime()) {
    return invoke<TransactionRecord[]>('list_transactions')
  }
  return getLocalStore().transactions
}

export async function upsertHolding(input: HoldingInput): Promise<HoldingRecord> {
  if (isTauriRuntime()) {
    return invoke<HoldingRecord>('upsert_holding', { input })
  }
  const store = getLocalStore()
  const index = store.holdings.findIndex((h) => h.symbol.toUpperCase() === input.symbol.toUpperCase())
  const record: HoldingRecord = {
    ...input,
    symbol: input.symbol.trim().toUpperCase(),
  }
  if (index >= 0) {
    store.holdings[index] = record
  } else {
    store.holdings.push(record)
  }
  saveLocalStore(store)
  return record
}

export async function deleteHolding(symbol: string): Promise<void> {
  if (isTauriRuntime()) {
    return invoke<void>('delete_holding', { symbol })
  }
  const store = getLocalStore()
  store.holdings = store.holdings.filter((h) => h.symbol.toUpperCase() !== symbol.toUpperCase())
  saveLocalStore(store)
}

export async function listPriceQuotes(): Promise<PriceQuote[]> {
  if (isTauriRuntime()) {
    return invoke<PriceQuote[]>('list_price_quotes')
  }
  return getLocalStore().priceQuotes
}

export async function upsertPriceQuote(input: PriceQuoteInput): Promise<PriceQuote> {
  if (isTauriRuntime()) {
    return invoke<PriceQuote>('upsert_price_quote', { input })
  }
  const store = getLocalStore()
  const index = store.priceQuotes.findIndex((q) => q.assetSymbol.toUpperCase() === input.assetSymbol.toUpperCase())
  const record: PriceQuote = {
    ...input,
    assetSymbol: input.assetSymbol.trim().toUpperCase(),
  }
  if (index >= 0) {
    store.priceQuotes[index] = record
  } else {
    store.priceQuotes.push(record)
  }
  saveLocalStore(store)
  return record
}

export async function updatePriceQuotes(inputs: PriceQuoteInput[]): Promise<PriceQuote[]> {
  if (isTauriRuntime()) {
    return invoke<PriceQuote[]>('update_price_quotes', { inputs })
  }

  const store = getLocalStore()
  const updated: PriceQuote[] = []

  for (const input of inputs) {
    const index = store.priceQuotes.findIndex((q) => q.assetSymbol.toUpperCase() === input.assetSymbol.toUpperCase())
    const record: PriceQuote = {
      ...input,
      assetSymbol: input.assetSymbol.trim().toUpperCase(),
    }
    if (index >= 0) {
      store.priceQuotes[index] = record
    } else {
      store.priceQuotes.push(record)
    }
    updated.push(record)
  }

  saveLocalStore(store)
  return updated
}

export async function getPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  if (isTauriRuntime()) {
    return invoke<PortfolioSnapshot>('portfolio_snapshot')
  }

  const store = getLocalStore()
  const totalValueVnd = store.holdings.reduce((sum, holding) => sum + holding.valueVnd, 0)
  return {
    totalValueVnd,
    totalGainVnd: store.holdings.reduce(
      (sum, holding) => sum + Math.round((holding.valueVnd * holding.pnlPercent) / 100),
      0,
    ),
    cashAvailableVnd: store.holdings.find((holding) => holding.category === 'cash')?.valueVnd ?? 0,
    holdingCount: store.holdings.length,
    transactionCount: store.transactions.length,
  }
}

export async function getPortfolioAnalysis(): Promise<PortfolioAnalysis> {
  if (isTauriRuntime()) {
    return invoke<PortfolioAnalysis>('portfolio_analysis')
  }

  const store = getLocalStore()
  const totalValueVnd = store.holdings.reduce((sum, holding) => sum + holding.valueVnd, 0)
  
  if (totalValueVnd <= 0) {
    return {
      totalValueVnd: 0,
      driftAlerts: [],
    }
  }

  return {
    totalValueVnd,
    driftAlerts: store.holdings
      .map((holding) => {
        const currentPercent = (holding.valueVnd / totalValueVnd) * 100
        const driftPercent = currentPercent - holding.targetPercent
        return {
          symbol: holding.symbol,
          name: holding.name,
          category: holding.category,
          currentPercent: roundOneDecimal(currentPercent),
          targetPercent: holding.targetPercent,
          driftPercent: roundOneDecimal(driftPercent),
          suggestedAction: driftPercent > 0 ? 'sell' : 'buy',
          suggestedAmountVnd: Math.round((totalValueVnd * Math.abs(driftPercent)) / 100),
        } satisfies AllocationDriftAlert
      })
      .filter((alert) => Math.abs(alert.driftPercent) >= 3),
  }
}

export async function createTransaction(input: NewTransactionInput): Promise<TransactionRecord> {
  if (isTauriRuntime()) {
    return invoke<TransactionRecord>('create_transaction', { input })
  }

  const store = getLocalStore()
  const tx: TransactionRecord = {
    id: `TX-${String(store.transactions.length + 1).padStart(4, '0')}`,
    date: input.date,
    occurredAt: input.occurredAt || new Date().toISOString(),
    transactionType: input.transactionType,
    assetSymbol: input.assetSymbol.trim().toUpperCase(),
    amountVnd: input.amountVnd,
    status: 'done',
    note: input.note,
    quantity: input.quantity,
    unit: input.unit,
    unitPriceVnd: input.unitPriceVnd,
    capitalAmountVnd: input.capitalAmountVnd ?? input.amountVnd,
    feeVnd: input.feeVnd ?? 0,
    walletImpactVnd: input.walletImpactVnd,
    linkedAssetSymbol: input.linkedAssetSymbol?.trim().toUpperCase(),
    fundingSource: input.fundingSource ?? 'wallet',
  }
  store.transactions.push(tx)
  saveLocalStore(store)
  return tx
}

function getTransactionCapitalImpact(tx: TransactionRecord): number {
  if (tx.transactionType === 'deposit') return tx.amountVnd
  if (tx.transactionType === 'withdraw') return -tx.amountVnd
  if (tx.transactionType === 'import-existing') return tx.capitalAmountVnd ?? tx.amountVnd
  return 0
}

function buildLocalHistorySnapshot(store: LocalStoreData, transactionId?: string): PortfolioHistorySnapshot {
  const totalValueVnd = store.holdings.reduce((sum, holding) => sum + holding.valueVnd, 0)
  const cashValueVnd = store.holdings.find((holding) => holding.symbol.toUpperCase() === 'CASH')?.valueVnd ?? 0
  const totalCapitalVnd = store.transactions.reduce((sum, tx) => sum + getTransactionCapitalImpact(tx), 0)
  return {
    id: `SNAP-${String(store.portfolioSnapshots.length + 1).padStart(4, '0')}`,
    capturedAt: new Date().toISOString(),
    totalValueVnd,
    totalCapitalVnd: Math.max(0, totalCapitalVnd),
    cashValueVnd,
    investedValueVnd: Math.max(0, totalValueVnd - cashValueVnd),
    transactionId,
  }
}

export async function listPortfolioSnapshots(): Promise<PortfolioHistorySnapshot[]> {
  if (isTauriRuntime()) {
    return invoke<PortfolioHistorySnapshot[]>('list_portfolio_snapshots')
  }
  return getLocalStore().portfolioSnapshots
}

export async function capturePortfolioSnapshot(transactionId?: string): Promise<PortfolioHistorySnapshot> {
  if (isTauriRuntime()) {
    return invoke<PortfolioHistorySnapshot>('capture_portfolio_snapshot', { transactionId })
  }
  const store = getLocalStore()
  const snapshot = buildLocalHistorySnapshot(store, transactionId)
  store.portfolioSnapshots.push(snapshot)
  saveLocalStore(store)
  return snapshot
}

export async function captureDailySnapshot(): Promise<PortfolioHistorySnapshot> {
  if (isTauriRuntime()) {
    return invoke<PortfolioHistorySnapshot>('capture_daily_snapshot')
  }

  const store = getLocalStore()
  const today = new Date().toISOString().split('T')[0]
  const existing = [...store.portfolioSnapshots]
    .reverse()
    .find((snapshot) => snapshot.capturedAt.startsWith(today))

  if (existing) {
    return existing
  }

  const snapshot = buildLocalHistorySnapshot(store, `DAILY-${today}`)
  store.portfolioSnapshots.push(snapshot)
  saveLocalStore(store)
  return snapshot
}

export async function deleteTransaction(id: string): Promise<void> {
  if (isTauriRuntime()) {
    return invoke<void>('delete_transaction', { id })
  }

  const store = getLocalStore()
  store.transactions = store.transactions.filter((tx) => tx.id !== id)
  saveLocalStore(store)
}

export async function listTelegramInboxEvents(): Promise<TelegramInboxEvent[]> {
  if (isTauriRuntime()) {
    return invoke<TelegramInboxEvent[]>('list_telegram_inbox_events')
  }
  return getLocalStore().telegramInboxEvents
}

export async function createTelegramInboxEvent(input: Omit<TelegramInboxEvent, 'id' | 'createdAt' | 'status'>): Promise<TelegramInboxEvent> {
  if (isTauriRuntime()) {
    return invoke<TelegramInboxEvent>('create_telegram_inbox_event', { input })
  }

  const store = getLocalStore()
  const event: TelegramInboxEvent = {
    id: `INBOX-${String(store.telegramInboxEvents.length + 1).padStart(4, '0')}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
    ...input,
  }
  store.telegramInboxEvents.unshift(event)
  saveLocalStore(store)
  return event
}

export async function approveTelegramInboxEvent(id: string): Promise<{ event: TelegramInboxEvent; transaction: TransactionRecord }> {
  if (isTauriRuntime()) {
    return invoke<{ event: TelegramInboxEvent; transaction: TransactionRecord }>('approve_telegram_inbox_event', { id })
  }

  const store = getLocalStore()
  const event = store.telegramInboxEvents.find((item) => item.id === id)
  if (!event) {
    throw new Error(`Inbox event not found: ${id}`)
  }
  if (!event.draftTransaction) {
    throw new Error(`Inbox event ${id} has no draft transaction`)
  }

  const transaction: TransactionRecord = {
    id: `TX-${String(store.transactions.length + 1).padStart(4, '0')}`,
    date: event.draftTransaction.date,
    occurredAt: event.draftTransaction.occurredAt || new Date().toISOString(),
    transactionType: event.draftTransaction.transactionType,
    assetSymbol: event.draftTransaction.assetSymbol.trim().toUpperCase(),
    amountVnd: event.draftTransaction.amountVnd,
    status: 'done',
    note: event.draftTransaction.note,
    quantity: event.draftTransaction.quantity,
    unit: event.draftTransaction.unit,
    unitPriceVnd: event.draftTransaction.unitPriceVnd,
    capitalAmountVnd: event.draftTransaction.capitalAmountVnd ?? event.draftTransaction.amountVnd,
    feeVnd: event.draftTransaction.feeVnd ?? 0,
    walletImpactVnd: event.draftTransaction.walletImpactVnd,
    linkedAssetSymbol: event.draftTransaction.linkedAssetSymbol?.trim().toUpperCase(),
    fundingSource: event.draftTransaction.fundingSource ?? 'wallet',
  }

  store.transactions.push(transaction)
  event.status = 'approved'
  event.reviewedAt = new Date().toISOString()
  saveLocalStore(store)
  return { event, transaction }
}

export async function rejectTelegramInboxEvent(id: string): Promise<TelegramInboxEvent> {
  if (isTauriRuntime()) {
    return invoke<TelegramInboxEvent>('reject_telegram_inbox_event', { id })
  }

  const store = getLocalStore()
  const event = store.telegramInboxEvents.find((item) => item.id === id)
  if (!event) {
    throw new Error(`Inbox event not found: ${id}`)
  }

  event.status = 'rejected'
  event.reviewedAt = new Date().toISOString()
  saveLocalStore(store)
  return event
}

export async function updateTelegramInboxEvent(input: {
  id: string
  parseError?: string
  draftTransaction?: TelegramInboxParsedPayload
}): Promise<TelegramInboxEvent> {
  if (isTauriRuntime()) {
    return invoke<TelegramInboxEvent>('update_telegram_inbox_event', { input })
  }

  const store = getLocalStore()
  const event = store.telegramInboxEvents.find((item) => item.id === input.id)
  if (!event) {
    throw new Error(`Inbox event not found: ${input.id}`)
  }

  event.parseError = input.parseError
  event.draftTransaction = input.draftTransaction
  saveLocalStore(store)
  return event
}

export async function syncTelegramInboxFromFile(path: string): Promise<TelegramInboxSyncResult> {
  if (isTauriRuntime()) {
    return invoke<TelegramInboxSyncResult>('sync_telegram_inbox_from_file', { path })
  }

  return {
    importedCount: 0,
    skippedCount: 0,
    totalPending: getLocalStore().telegramInboxEvents.filter((event) => event.status === 'pending').length,
  }
}

export async function ensureTelegramBotRunning(): Promise<boolean> {
  if (isTauriRuntime()) {
    return invoke<boolean>('ensure_telegram_bot_running')
  }
  return false
}

function isTauriRuntime() {
  // The portfolio is embedded in the Electron app; keep its persistence local
  // instead of trying to call the source project's Tauri commands.
  return false
}

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10
}

/** Update targetPercent for ALL holdings belonging to a specific category */
export async function updateCategoryTargetPercent(category: string, targetPercent: number): Promise<void> {
  const targets = await getCategoryTargets()
  targets[category] = targetPercent
  await saveCategoryTargets(targets)

  const categoriesToUpdate = category === 'savings' ? ['savings', 'cash'] : [category]
  if (isTauriRuntime()) {
    const rawHoldings = await invoke<HoldingRecord[]>('list_holdings')
    await Promise.all(
      rawHoldings
        .filter(h => categoriesToUpdate.includes(h.category))
        .map(h => invoke<HoldingRecord>('upsert_holding', { input: { ...h, targetPercent } }))
    )
    return
  }
  const store = getLocalStore()
  store.holdings = store.holdings.map(h =>
    categoriesToUpdate.includes(h.category) ? { ...h, targetPercent } : h
  )
  saveLocalStore(store)
}

/** Update targetPercent for ALL categories in one batch to prevent concurrency race conditions */
export async function updateAllCategoryTargets(targets: Record<string, number>): Promise<void> {
  await saveCategoryTargets(targets)

  if (isTauriRuntime()) {
    const rawHoldings = await invoke<HoldingRecord[]>('list_holdings')
    await Promise.all(
      rawHoldings.map(h => {
        const targetCat = h.category === 'cash' ? 'savings' : h.category
        const targetPercent = targets[targetCat] ?? 20
        return invoke<HoldingRecord>('upsert_holding', { input: { ...h, targetPercent } })
      })
    )
    return
  }
  const store = getLocalStore()
  store.holdings = store.holdings.map(h => {
    const targetCat = h.category === 'cash' ? 'savings' : h.category
    const targetPercent = targets[targetCat] ?? 20
    return { ...h, targetPercent }
  })
  saveLocalStore(store)
}

export async function exportPortfolioData(): Promise<{
  holdings: HoldingRecord[]
  transactions: TransactionRecord[]
  priceQuotes: PriceQuote[]
  portfolioSnapshots: PortfolioHistorySnapshot[]
  categoryTargets: Record<string, number>
  telegramInboxEvents: TelegramInboxEvent[]
}> {
  // Use existing list/get methods
  const holdings = await listHoldings()
  const transactions = await listTransactions()
  const priceQuotes = await listPriceQuotes()
  const portfolioSnapshots = await listPortfolioSnapshots()
  const categoryTargets = await getCategoryTargets()
  const telegramInboxEvents = await listTelegramInboxEvents()
  
  return {
    holdings,
    transactions,
    priceQuotes,
    portfolioSnapshots,
    categoryTargets,
    telegramInboxEvents,
  }
}

export async function importPortfolioData(data: {
  holdings: HoldingRecord[]
  transactions: TransactionRecord[]
  priceQuotes: PriceQuote[]
  portfolioSnapshots?: PortfolioHistorySnapshot[]
  categoryTargets?: Record<string, number>
  telegramInboxEvents?: TelegramInboxEvent[]
}): Promise<void> {
  if (isTauriRuntime()) {
    try {
      const rustStore = {
        holdings: data.holdings,
        transactions: data.transactions,
        priceQuotes: data.priceQuotes,
        portfolioSnapshots: data.portfolioSnapshots || [],
        categoryTargets: data.categoryTargets || {},
        telegramInboxEvents: data.telegramInboxEvents || [],
      }
      await invoke<void>('import_portfolio_data', { data: rustStore })
      return
    } catch (e) {
      console.error('Error importing portfolio data to Tauri backend:', e)
      throw e
    }
  }
  
  const localStore = {
    holdings: data.holdings,
    transactions: data.transactions,
    priceQuotes: data.priceQuotes,
    portfolioSnapshots: data.portfolioSnapshots || [],
    telegramInboxEvents: data.telegramInboxEvents || [],
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localStore))
  if (data.categoryTargets) {
    localStorage.setItem('dbyfinance-category-targets', JSON.stringify(data.categoryTargets))
  }
}

export async function clearPortfolioData(): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await invoke<void>('clear_portfolio_data')
      return
    } catch (e) {
      console.error('Error clearing portfolio data in Tauri backend:', e)
      throw e
    }
  }
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem('dbyfinance-category-targets')
}

export async function syncWindowTheme(theme: string): Promise<void> {
  void theme
}
