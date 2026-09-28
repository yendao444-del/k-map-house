import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Clock3,
  Landmark,
  LayoutDashboard,
  Pencil,
  PiggyBank,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  TrendingUp,
  WalletCards,
  X
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  readInvestmentStore,
  writeInvestmentStore,
  type InvestmentCategory,
  type InvestmentHolding,
  type InvestmentStore,
  type InvestmentTransaction,
  type InvestmentTransactionType
} from '../lib/investment-store'
import { GoldTracker } from './investment-trackers/GoldTracker'
import { StockTracker } from './investment-trackers/StockTracker'
import { BondTracker } from './investment-trackers/BondTracker'
import { SavingsTracker } from './investment-trackers/SavingsTracker'
import { GoldTradeModal } from './investment-trackers/GoldTradeModal'
import { GoldHoldings } from './investment-trackers/GoldHoldings'
import { GoldTransactionHistory } from './investment-trackers/GoldTransactionHistory'
import './investment-trackers/original-trackers.css'
import './investment-trackers/investment-dark.css'
import { transactionsForCategory } from '../lib/investment-history'
import { createCashTransaction, deleteCashTransaction, getWalletBalanceSummary, type WalletBalanceSummary } from '../lib/db'
import { commitFundedInvestment, investmentWalletImpact, validateFunding, type FundingMethod } from '../lib/investment-funding'

type Screen = 'overview' | InvestmentCategory | 'transactions'
const CATEGORY_ORDER: InvestmentCategory[] = ['cash', 'gold', 'stocks', 'bonds', 'savings']
const categoryMeta: Record<
  InvestmentCategory,
  { label: string; color: string; icon: typeof TrendingUp }
> = {
  cash: { label: 'Ví tiền', color: '#00ab60', icon: WalletCards },
  gold: { label: 'Vàng', color: '#d97706', icon: BarChart3 },
  stocks: { label: 'Cổ phiếu & Quỹ', color: '#16a34a', icon: TrendingUp },
  bonds: { label: 'Trái phiếu', color: '#2563eb', icon: Landmark },
  savings: { label: 'Tiết kiệm', color: '#0f766e', icon: PiggyBank }
}
const txLabel: Record<InvestmentTransactionType, string> = {
  deposit: 'Nạp tiền',
  withdraw: 'Rút tiền',
  buy: 'Mua tài sản',
  sell: 'Bán tài sản',
  'import-existing': 'Nhập tài sản'
}
const money = (value: number) =>
  `${new Intl.NumberFormat('vi-VN').format(Math.round(value || 0))} đ`
const compactMoney = (value: number) =>
  new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value || 0
  )
const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN')
}
const parseQuantity = (value: string) => {
  const match = value.match(/[\d.,]+/)
  if (!match) return 0
  const raw = match[0]
  return (
    Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')) ||
    0
  )
}
const displayNote = (note: string) => {
  if (!note) return ''
  try {
    const value = JSON.parse(note) as {
      bank?: string
      term?: string
      rate?: number
      maturityDate?: string
      status?: string
    }
    return [
      value.bank,
      value.term,
      value.rate ? `${value.rate}%/năm` : '',
      value.maturityDate ? `đáo hạn ${formatDate(value.maturityDate)}` : '',
      value.status === 'active' ? 'đang gửi' : value.status === 'settled' ? 'đã tất toán' : ''
    ]
      .filter(Boolean)
      .join(' · ')
  } catch {
    return note.replace(/^\[.*?\]\s*/, '').trim()
  }
}
const transactionAssetDelta = (tx: InvestmentTransaction) => {
  if (typeof tx.assetValueImpactVnd === 'number') return tx.assetValueImpactVnd
  if (tx.assetSymbol.toUpperCase() === 'CASH') {
    return tx.transactionType === 'withdraw' ? -tx.amountVnd : tx.transactionType === 'deposit' ? tx.amountVnd : 0
  }
  if (tx.transactionType === 'sell') return -tx.amountVnd
  if (tx.transactionType === 'buy' || tx.transactionType === 'import-existing') return tx.amountVnd
  return 0
}
const isVisibleTransaction = (tx: InvestmentTransaction, filter: string) => {
  if (filter === 'all') return true
  return tx.transactionType === filter
}
const transactionCashDelta = (tx: InvestmentTransaction) => tx.walletImpactVnd ?? tx.walletPosting?.amount ?? 0

function TransactionModal({
  holding,
  transaction,
  initialType,
  forceTransaction,
  scopedCategory,
  walletSummary,
  onClose,
  onSave,
  onSaveHolding
}: {
  holding?: InvestmentHolding
  transaction?: InvestmentTransaction
  initialType?: InvestmentTransactionType
  forceTransaction?: boolean
  scopedCategory?: InvestmentCategory
  walletSummary: WalletBalanceSummary
  onClose: () => void
  onSave: (input: {
    category: InvestmentCategory
    symbol: string
    name: string
    type: InvestmentTransactionType
    amount: number
    quantity: number
    unit: string
    date: string
    note: string
    paymentMethod: FundingMethod
  }) => Promise<void>
  onSaveHolding?: (input: {
    category: InvestmentCategory
    symbol: string
    name: string
    quantity: number
    unit: string
  }) => void
}): ReactElement {
  const [category, setCategory] = useState<InvestmentCategory>(scopedCategory || holding?.category || 'stocks')
  const [symbol, setSymbol] = useState(transaction?.assetSymbol || holding?.symbol || (scopedCategory === 'cash' ? 'CASH' : ''))
  const [name, setName] = useState(holding?.name || '')
  const [type, setType] = useState<InvestmentTransactionType>(transaction?.transactionType || initialType || (scopedCategory === 'cash' ? 'deposit' : 'buy'))
  const [amount, setAmount] = useState(String(transaction?.amountVnd || holding?.valueVnd || ''))
  const [quantity, setQuantity] = useState(
    String(transaction?.quantity || (holding ? parseQuantity(holding.quantity) : ''))
  )
  const [unit, setUnit] = useState(
    transaction?.unit || holding?.quantity.split(' ').slice(1).join(' ') || 'đơn vị'
  )
  const [date, setDate] = useState(transaction?.date || new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState(transaction?.note || '')
  const [paymentMethod, setPaymentMethod] = useState<FundingMethod>(transaction?.walletPosting?.paymentMethod || 'transfer')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  let fundingError = ''
  if ((!holding || forceTransaction) && !transaction && (type === 'buy' || type === 'withdraw') && Number(amount) > 0) {
    try { validateFunding(walletSummary, [{ paymentMethod, amount: -Number(amount) }]) }
    catch (cause) { fundingError = cause instanceof Error ? cause.message : '' }
  }
  const transactionTypes = scopedCategory === 'cash'
    ? (['deposit', 'withdraw'] as const)
    : scopedCategory
      ? (['buy', 'sell'] as const)
      : (['buy', 'sell', 'deposit', 'withdraw'] as InvestmentTransactionType[])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (scopedCategory && category !== scopedCategory) return
    if (!symbol.trim()) return
    if (holding && !transaction && !forceTransaction) {
      onSaveHolding?.({
        category,
        symbol: symbol.trim().toUpperCase(),
        name: name.trim() || symbol.trim().toUpperCase(),
        quantity: Number(quantity) || 0,
        unit: unit.trim() || 'đơn vị'
      })
      return
    }
    if (Number(amount) <= 0) return
    setSaving(true)
    setError('')
    try {
    await onSave({
      category,
      symbol: symbol.trim().toUpperCase(),
      name: name.trim() || symbol.trim().toUpperCase(),
      type,
      amount: Number(amount),
      quantity: Number(quantity) || 0,
      unit: unit.trim() || 'đơn vị',
      date,
      note,
      paymentMethod
    })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu giao dịch.')
    } finally { setSaving(false) }
  }
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <form
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-[24px] bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between bg-[#064a31] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-200">
              Danh mục đầu tư
            </p>
            <h2 className="mt-1 text-xl font-black">
              {transaction
                ? 'Sửa giao dịch'
                : holding
                  ? `Cập nhật ${holding.symbol}`
                  : 'Ghi giao dịch mới'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10">
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">
            Nhóm tài sản
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as InvestmentCategory)}
              disabled={Boolean(scopedCategory)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-700"
            >
              {(scopedCategory ? [scopedCategory] : CATEGORY_ORDER).map((key) => (
                <option key={key} value={key}>
                  {categoryMeta[key].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Loại giao dịch
            <select
              value={type}
              onChange={(e) => setType(e.target.value as InvestmentTransactionType)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
            >
              {transactionTypes.map((key) => (
                <option key={key} value={key}>
                  {txLabel[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">
            Mã tài sản
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 uppercase"
              placeholder={category === 'gold' ? 'VD: VNHAN' : category === 'stocks' ? 'VD: FPT' : 'Nhập mã tài sản'}
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Tên tài sản
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Giá trị giao dịch
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Ngày giao dịch
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Số lượng
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              disabled={Boolean(holding && !transaction && !forceTransaction)}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Đơn vị
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
          <label className="text-xs font-bold text-slate-600 sm:col-span-2">
            Ghi chú
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
        </div>
        <div className="px-6 pb-3 text-xs">
          <label className="font-bold">Ví thanh toán / nhận tiền
            <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as FundingMethod)} className="ml-2 rounded-lg border p-2">
              <option value="transfer">Ngân hàng · {money(walletSummary.bankBalance)}</option>
              <option value="cash">Tiền mặt · {money(walletSummary.cashBalance)}</option>
            </select>
          </label>
          <p className="mt-2">Tổng khả dụng: {money(walletSummary.availableBalance)}. Mua tài sản sẽ trừ tiền từ Ví.</p>
          {error && <p role="alert" className="mt-2 font-bold text-rose-600">{error}</p>}
          {fundingError && <p role="alert" className="mt-2 font-bold text-rose-600">{fundingError}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600"
          >
            Hủy
          </button>
          <button disabled={saving || Boolean(fundingError)} className="h-10 rounded-xl bg-[#00ab60] px-5 text-xs font-black text-white disabled:opacity-50">
            {holding && !transaction && !forceTransaction ? 'Lưu thông tin' : 'Lưu giao dịch'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function InvestmentsTab(): ReactElement {
  const queryClient = useQueryClient()
  const savingTransaction = useRef(false)
  const [transactionError, setTransactionError] = useState('')
  const [store, setStore] = useState<InvestmentStore>({
    holdings: [],
    transactions: [],
    portfolioSnapshots: [],
    categoryTargets: {}
  })
  const [screen, setScreen] = useState<Screen>('overview')
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<string>()
  const [modal, setModal] = useState<{
    holding?: InvestmentHolding
    transaction?: InvestmentTransaction
    initialType?: InvestmentTransactionType
    forceTransaction?: boolean
  } | null>(null)
  const [targetsOpen, setTargetsOpen] = useState(false)
  const [targetDraft, setTargetDraft] = useState<Record<string, number>>({})
  const [chartMode, setChartMode] = useState<'category' | 'asset'>('category')
  const [transactionFilter, setTransactionFilter] = useState<InvestmentTransactionType | 'all'>('all')
  const [wealthGoal, setWealthGoal] = useState(2000000000)
  const [selectedAssetSymbol, setSelectedAssetSymbol] = useState<string>()
  const [goldTradeMode, setGoldTradeMode] = useState<'buy' | 'sell' | null>(null)
  const [goldTradeSymbol, setGoldTradeSymbol] = useState<string | undefined>()
  const [goldTradeNotice, setGoldTradeNotice] = useState<string | null>(null)
  useEffect(() => {
    setGoldTradeNotice(null)
  }, [screen])
  useEffect(() => {
    if (!goldTradeNotice) return
    const timeout = window.setTimeout(() => setGoldTradeNotice(null), 6000)
    return () => window.clearTimeout(timeout)
  }, [goldTradeNotice])
  const [walletSummary, setWalletSummary] = useState<WalletBalanceSummary>({
    bankBalance: 0,
    cashBalance: 0,
    totalBalance: 0,
    availableBalance: 0,
    entries: []
  })
  const load = async () => {
    setLoading(true)
    const [result, nextWalletSummary] = await Promise.all([readInvestmentStore(), getWalletBalanceSummary()])
    setStore(result.data)
    setSource(result.importedFrom)
    setWalletSummary(nextWalletSummary)
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [])
  useEffect(() => {
    let active = true
    const refreshWallet = () => {
      if (savingTransaction.current) return
      void getWalletBalanceSummary().then(summary => { if (active) setWalletSummary(summary) }).catch(() => {})
    }
    const timer = window.setInterval(refreshWallet, 30000)
    window.addEventListener('focus', refreshWallet)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refreshWallet) }
  }, [])
  useEffect(() => {
    const stored = Number(window.localStorage.getItem('dbyfinance-wealth-goal'))
    if (Number.isFinite(stored) && stored > 0) setWealthGoal(stored)
  }, [])
  const holdings = useMemo(() => {
    const nonCashHoldings = store.holdings.filter(
      (item) => item.valueVnd > 0 && item.symbol.toUpperCase() !== 'CASH'
    )
    if (nonCashHoldings.length === 0 && walletSummary.availableBalance <= 0) return []
    const walletHolding: InvestmentHolding = {
      symbol: 'CASH',
      name: 'Ví tiền',
      category: 'cash',
      group: 'Ví thanh toán',
      valueVnd: walletSummary.availableBalance,
      quantity: `${compactMoney(walletSummary.availableBalance)} VND`,
      allocationPercent: 0,
      targetPercent: store.categoryTargets?.cash ?? 0,
      pnlPercent: 0
    }
    return [
      ...nonCashHoldings,
      walletHolding
    ]
  }, [store.categoryTargets, store.holdings, walletSummary.availableBalance])
  const transactions = useMemo(
    () =>
      [...store.transactions].sort((a, b) =>
        (b.occurredAt || b.date).localeCompare(a.occurredAt || a.date)
      ),
    [store.transactions]
  )
  const visibleHoldings =
    screen === 'overview' || screen === 'transactions'
      ? holdings
      : holdings.filter((item) => item.category === screen)
  const savingsTrackerHoldings = store.holdings.filter((item) => item.category === 'savings')
  const savingsTrackerSymbols = new Set(savingsTrackerHoldings.map((item) => item.symbol.toUpperCase()))
  const savingsTrackerTransactions = transactions.filter((tx) => savingsTrackerSymbols.has(tx.assetSymbol.toUpperCase()))
  const categoryTransactions = useMemo(() => {
    if (screen === 'overview' || screen === 'transactions') return []
    if (screen === 'cash') {
      return walletSummary.entries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        occurredAt: entry.date,
        transactionType: (entry.type === 'income' ? 'deposit' : 'withdraw') as InvestmentTransactionType,
        assetSymbol: 'CASH',
        amountVnd: entry.amount,
        status: 'done' as const,
        note: `${entry.title}${entry.source ? ` · ${entry.source}` : ''}`,
        quantity: 1,
        unit: 'VND',
        walletImpactVnd: entry.type === 'income' ? entry.amount : -entry.amount,
        fundingSource: 'wallet' as const
      }))
    }
    return transactionsForCategory(transactions, store.holdings, screen)
  }, [screen, transactions, store.holdings, walletSummary.entries])
  const total = holdings.reduce((sum, item) => sum + item.valueVnd, 0)
  const gain = holdings.reduce((sum, item) => sum + (item.valueVnd * item.pnlPercent) / 100, 0)
  const goalPercent = Math.min(100, Math.max(0, Math.round((total / wealthGoal) * 100)))
  const investedCapital = transactions.reduce((sum, tx) => {
    if (tx.transactionType === 'import-existing' || tx.transactionType === 'buy') return sum + (tx.capitalAmountVnd ?? tx.amountVnd)
    if (tx.transactionType === 'sell') return sum + transactionAssetDelta(tx)
    return sum
  }, 0)
  const allocation = CATEGORY_ORDER.map((key) => ({
    key,
    name: categoryMeta[key].label,
    value: holdings
      .filter((item) => item.category === key)
      .reduce((sum, item) => sum + item.valueVnd, 0),
    color: categoryMeta[key].color
  })).filter((item) => item.value > 0)
  const assetAllocation = holdings
    .slice()
    .sort((a, b) => b.valueVnd - a.valueVnd)
    .map((item, index) => ({
      key: item.symbol,
      name: item.symbol,
      value: item.valueVnd,
      color: ['#00ab60', '#d97706', '#2563eb', '#8b5cf6', '#16a34a', '#0f766e'][index % 6]
    }))
  const currentAllocation = chartMode === 'category' ? allocation : assetAllocation
  const largestAllocation = allocation.slice().sort((a, b) => b.value - a.value)[0]
  const sortedTargets = CATEGORY_ORDER.filter((key) => key !== 'cash')
  const driftAlerts = sortedTargets
    .map((key) => {
      const actual = total ? ((allocation.find((item) => item.key === key)?.value || 0) / total) * 100 : 0
      const target = targetDraft[key] ?? store.categoryTargets?.[key] ?? 20
      const drift = actual - target
      return { key, actual, target, drift, amount: Math.round((total * Math.abs(drift)) / 100) }
    })
    .filter((item) => Math.abs(item.drift) >= 3)
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
  const history = useMemo(() => {
    if (store.portfolioSnapshots.length > 1) {
      return store.portfolioSnapshots.map((item) => ({ date: formatDate(item.capturedAt), value: item.totalValueVnd }))
    }
    const ordered = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    const netWorthChange = (tx: InvestmentTransaction) => transactionAssetDelta(tx) + (tx.walletPosting?.amount || 0)
    const netChange = ordered.reduce((sum, tx) => sum + netWorthChange(tx), 0)
    let value = Math.max(0, total - netChange)
    const points = [{ date: 'Bắt đầu', value }]
    for (const tx of ordered) {
      value = Math.max(0, value + netWorthChange(tx))
      points.push({ date: formatDate(tx.date), value })
    }
    return points.length > 1 ? points : [{ date: 'Hiện tại', value: total }]
  }, [store.portfolioSnapshots, transactions, total])
  const persist = async (next: InvestmentStore) => {
    await writeInvestmentStore(next)
    setStore(next)
  }
  const openTargets = () => {
    const next: Record<string, number> = {}
    sortedTargets.forEach((key) => { next[key] = store.categoryTargets?.[key] ?? 20 })
    setTargetDraft(next)
    setTargetsOpen((value) => !value)
  }
  const saveTargets = async () => {
    const totalTarget = sortedTargets.reduce((sum, key) => sum + (targetDraft[key] || 0), 0)
    if (totalTarget > 100) return
    const targets = { ...(store.categoryTargets || {}), ...targetDraft }
    await persist({ ...store, categoryTargets: targets, holdings: store.holdings.map((item) => ({ ...item, targetPercent: targets[item.category] ?? item.targetPercent })) })
    setTargetsOpen(false)
  }
  const saveTransaction = async (input: {
    category: InvestmentCategory
    symbol: string
    name: string
    type: InvestmentTransactionType
    amount: number
    quantity: number
    unit: string
    date: string
    note: string
    paymentMethod: FundingMethod
  }) => {
    if (savingTransaction.current) throw new Error('Đang lưu giao dịch trước. Vui lòng đợi.')
    savingTransaction.current = true
    try {
    const oldTx = modal?.transaction
    const walletImpact = investmentWalletImpact(input.type, input.amount)
    if (!['cash', 'transfer'].includes(input.paymentMethod)) throw new Error('Chọn ví thanh toán hợp lệ.')
    let assetValueImpact = input.type === 'buy' ? input.amount : 0
    if (input.type === 'buy' && (!Number.isFinite(input.quantity) || input.quantity <= 0)) throw new Error('Nhập số lượng tài sản lớn hơn 0.')
    if ((input.type === 'buy' || input.type === 'sell') && (input.category === 'cash' || input.symbol.toUpperCase() === 'CASH')) {
      throw new Error('Chọn một tài sản để mua / bán; dùng Nạp hoặc Rút cho Ví tiền.')
    }
    if (input.type === 'sell') {
      const holding = store.holdings.find(item => item.symbol.toUpperCase() === input.symbol.toUpperCase())
      const restoredQuantity = holding ? parseQuantity(holding.quantity) + (oldTx?.assetSymbol === holding.symbol ? (oldTx.transactionType === 'sell' ? oldTx.quantity || 0 : -(oldTx.quantity || 0)) : 0) : 0
      if (!holding || !Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > restoredQuantity) {
        throw new Error('Số lượng bán vượt quá số tài sản đang nắm giữ.')
      }
      const restoredValue = holding.valueVnd - (oldTx?.assetSymbol === holding.symbol ? transactionAssetDelta(oldTx) : 0)
      assetValueImpact = -(restoredValue * input.quantity / restoredQuantity)
    }
    const normalizedCategory: InvestmentCategory =
      input.type === 'deposit' || input.type === 'withdraw' ? 'cash' : input.category
    const normalizedSymbol =
      input.type === 'deposit' || input.type === 'withdraw' ? 'CASH' : input.symbol
    const nextTransactions = [
      ...(oldTx ? store.transactions.filter((item) => item.id !== oldTx.id) : store.transactions),
      {
        id: oldTx?.id || `TX-${crypto.randomUUID()}`,
        date: input.date,
        occurredAt: new Date().toISOString(),
        transactionType: input.type,
        assetSymbol: normalizedSymbol,
        amountVnd: input.amount,
        status: 'done' as const,
        note: input.note,
        quantity: input.quantity,
        unit: input.unit,
        unitPriceVnd: input.quantity ? input.amount / input.quantity : input.amount,
        capitalAmountVnd: input.amount,
        walletImpactVnd:
          input.type === 'deposit'
            ? input.amount
            : input.type === 'withdraw'
              ? -input.amount
              : input.type === 'buy'
                ? -input.amount
                : input.type === 'sell'
                  ? input.amount
                  : 0,
        fundingSource: 'wallet' as const,
        walletPosting: { paymentMethod: input.paymentMethod, amount: walletImpact },
        assetValueImpactVnd: assetValueImpact
      }
    ]
    const oldImpact = oldTx ? transactionAssetDelta(oldTx) : 0
    const newTx = nextTransactions[nextTransactions.length - 1]
    const newImpact = transactionAssetDelta(newTx)
    const nextHoldingsMap = new Map(store.holdings.map((item) => [item.symbol.toUpperCase(), { ...item }]))
    const updateHolding = (symbol: string, delta: number, fallback?: Partial<InvestmentHolding>) => {
      if (!symbol || !delta) return
      const key = symbol.toUpperCase()
      const existing = nextHoldingsMap.get(key)
      const base = existing || {
        symbol: key,
        name: fallback?.name || key,
        category: fallback?.category || input.category,
        group: fallback?.group || (input.category === 'cash' ? 'Ví thanh toán' : 'Tài sản'),
        valueVnd: 0,
        quantity: fallback?.quantity || input.unit,
        allocationPercent: 0,
        targetPercent: store.categoryTargets?.[input.category] || 20,
        pnlPercent: 0
      }
      nextHoldingsMap.set(key, { ...base, valueVnd: Math.max(0, base.valueVnd + delta) })
    }
    if (oldTx && oldTx.assetSymbol.toUpperCase() !== normalizedSymbol.toUpperCase()) {
      updateHolding(oldTx.assetSymbol, -oldImpact)
    }
    updateHolding(normalizedSymbol, newImpact - (oldTx?.assetSymbol.toUpperCase() === normalizedSymbol.toUpperCase() ? oldImpact : 0), { name: normalizedSymbol === 'CASH' ? 'Ví VND' : input.name, category: normalizedCategory, group: normalizedCategory === 'cash' ? 'Ví thanh toán' : 'Tài sản', quantity: `0 ${input.unit}` })
    const adjustQuantity = (symbol: string, quantityDelta: number) => {
      const key = symbol.toUpperCase()
      const holding = nextHoldingsMap.get(key)
      if (!holding || holding.category === 'cash' || !quantityDelta) return
      const nextQuantity = parseQuantity(holding.quantity) + quantityDelta
      if (nextQuantity < -0.00000001) throw new Error('Không thể thay đổi giao dịch vì tài sản đã được bán. Hãy đối soát giao dịch bán trước.')
      nextHoldingsMap.set(key, {
        ...holding,
        quantity: `${Math.max(0, nextQuantity)} ${holding.quantity.split(' ').slice(1).join(' ') || input.unit}`,
        valueVnd: nextQuantity === 0 ? 0 : holding.valueVnd
      })
    }
    const quantityImpact = (tx: InvestmentTransaction) =>
      tx.transactionType === 'sell' ? -(tx.quantity || 0) : tx.transactionType === 'buy' || tx.transactionType === 'import-existing' ? tx.quantity || 0 : 0
    if (oldTx?.assetSymbol.toUpperCase() === normalizedSymbol.toUpperCase()) {
      adjustQuantity(normalizedSymbol, quantityImpact(newTx) - quantityImpact(oldTx))
    } else {
      if (oldTx) adjustQuantity(oldTx.assetSymbol, -quantityImpact(oldTx))
      adjustQuantity(normalizedSymbol, quantityImpact(newTx))
    }
    const edited = nextHoldingsMap.get(normalizedSymbol)
    if (edited && input.quantity) nextHoldingsMap.set(normalizedSymbol, { ...edited, name: normalizedSymbol === 'CASH' ? 'Ví VND' : input.name, category: normalizedCategory, targetPercent: store.categoryTargets?.[normalizedCategory] || edited.targetPercent })
    const nextHoldings = Array.from(nextHoldingsMap.values())
    await commitWalletChange(oldTx, newTx, { ...store, holdings: nextHoldings, transactions: nextTransactions })
    setModal(null)
    } finally { savingTransaction.current = false }
  }
  const commitWalletChange = async (previous: InvestmentTransaction | undefined, next: InvestmentTransaction | undefined, nextStore: InvestmentStore) => {
    await commitFundedInvestment({
      previous,
      nextPosting: next?.walletPosting,
      nextStore,
      reference: `${next ? txLabel[next.transactionType] : 'Hoàn tác'} ${next?.assetSymbol || previous?.assetSymbol} · ${next?.id || previous?.id} · ${next?.note || previous?.note || ''}`,
      date: new Date().toISOString(),
      readBalances: async () => {
        const latest = await readInvestmentStore()
        if (JSON.stringify(latest.data) !== JSON.stringify(store)) {
          throw new Error('Danh mục đã thay đổi ở cửa sổ khác. Hãy bấm Làm mới trước khi tiếp tục.')
        }
        const summary = await getWalletBalanceSummary()
        setWalletSummary(summary)
        return summary
      },
      createPosting: async (posting, reference, date) => {
        const row = await createCashTransaction({
          type: posting.amount < 0 ? 'expense' : 'income',
          category: 'investment_transfer',
          transaction_date: date,
          amount: Math.abs(posting.amount),
          payment_method: posting.paymentMethod,
          note: `[Đầu tư] ${reference}`
        })
        return row.id
      },
      removePosting: deleteCashTransaction,
      persist
    })
    void queryClient.invalidateQueries({ queryKey: ['cashTransactions'] })
    try { setWalletSummary(await getWalletBalanceSummary()) } catch {
      setTransactionError('Đã lưu giao dịch. Chưa tải lại được số dư Ví; hãy bấm Làm mới.')
    }
  }
  const deleteTransaction = async (tx: InvestmentTransaction) => {
    if (savingTransaction.current) return
    savingTransaction.current = true
    setTransactionError('')
    try {
    const nextHoldingsMap = new Map(store.holdings.map((item) => [item.symbol.toUpperCase(), { ...item }]))
    const updateHolding = (symbol: string, delta: number) => {
      const existing = nextHoldingsMap.get(symbol.toUpperCase())
      if (existing) nextHoldingsMap.set(symbol.toUpperCase(), { ...existing, valueVnd: Math.max(0, existing.valueVnd + delta) })
    }
    updateHolding(tx.assetSymbol, -transactionAssetDelta(tx))
    if (nextHoldingsMap.has(tx.assetSymbol.toUpperCase()) && tx.assetSymbol.toUpperCase() !== 'CASH') {
      const holding = nextHoldingsMap.get(tx.assetSymbol.toUpperCase())!
      const quantityDelta = tx.transactionType === 'sell' ? tx.quantity || 0 : tx.transactionType === 'buy' || tx.transactionType === 'import-existing' ? -(tx.quantity || 0) : 0
      const nextQuantity = parseQuantity(holding.quantity) + quantityDelta
      if (nextQuantity < -0.00000001) throw new Error('Không thể xóa giao dịch mua vì tài sản đã được bán. Hãy đối soát giao dịch bán trước.')
      nextHoldingsMap.set(tx.assetSymbol.toUpperCase(), { ...holding, quantity: `${Math.max(0, nextQuantity)} ${tx.unit || 'đơn vị'}`, valueVnd: nextQuantity === 0 ? 0 : holding.valueVnd })
    }
    await commitWalletChange(tx, undefined, { ...store, holdings: Array.from(nextHoldingsMap.values()), transactions: store.transactions.filter((item) => item.id !== tx.id) })
    } catch (cause) {
      setTransactionError(cause instanceof Error ? cause.message : 'Không thể xóa giao dịch.')
    } finally { savingTransaction.current = false }
  }
  const saveHoldingDetails = async (input: {
    category: InvestmentCategory
    symbol: string
    name: string
    quantity: number
    unit: string
  }) => {
    const original = modal?.holding
    if (!original) return
    const nextHoldings = store.holdings.map((item) =>
      item.symbol.toUpperCase() === original.symbol.toUpperCase()
        ? {
            ...item,
            category: input.category,
            name: input.name,
            quantity: item.quantity,
            targetPercent: store.categoryTargets?.[input.category] ?? item.targetPercent
          }
        : item
    )
    await persist({ ...store, holdings: nextHoldings })
    setModal(null)
  }
  const nav: Array<{ id: Screen; label: string; icon: typeof TrendingUp }> = [
    { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
    ...CATEGORY_ORDER.map((key) => ({
      id: key as Screen,
      label: categoryMeta[key].label,
      icon: categoryMeta[key].icon
    })),
    { id: 'transactions', label: 'Giao dịch', icon: Clock3 }
  ]
  const openTrade = (symbol?: string, requestedType?: string) => {
    const holding = symbol ? store.holdings.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase()) : undefined
    const lowered = requestedType?.toLowerCase() || ''
    const initialType: InvestmentTransactionType = lowered.includes('bán') || lowered.includes('sell') ? 'sell' : 'buy'
    setModal({ holding, initialType, forceTransaction: lowered.includes('bán') || lowered.includes('mua vào') })
  }
  return (
    <div className="investment-dark flex min-h-0 flex-1 overflow-hidden bg-[#0b111b]">
      <aside className="hidden w-[220px] shrink-0 border-r border-[#20364f] bg-[#0b1727] p-3 text-white xl:block">
        <div className="mb-5 px-3 pt-3">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-emerald-200/70">
            Tài chính
          </p>
          <h2 className="mt-1 text-lg font-black text-white">Danh mục đầu tư</h2>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setScreen(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold ${screen === item.id ? 'bg-[#21d38a] text-white shadow-[inset_0_0_0_1px_#23d89a]' : 'text-[#a9bbcf] hover:bg-[#14283d] hover:text-white'}`}
              >
                <Icon size={17} />
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
        {transactionError && <p role="alert" className="mb-4 rounded-xl border border-rose-400 p-3 text-sm text-rose-400">{transactionError}</p>}
        {store.transactions.some(tx => tx.transactionType === 'buy' && !tx.walletPosting) && <p role="status" className="mb-4 rounded-xl border border-amber-500/40 p-3 text-sm text-amber-400">Có giao dịch mua cũ chưa trừ tiền Ví. Hãy kiểm tra tại Giao dịch và sửa để ghi nhận nguồn tiền, hoặc xóa nếu nhập nhầm. Số tài sản này chưa được đối soát với Ví.</p>}
        <div className="mx-auto max-w-[1480px] space-y-5">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#00ab60]">
                Tài chính · Đầu tư
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#15231d]">
                {screen === 'overview'
                  ? 'Tổng quan tài sản'
                  : screen === 'transactions'
                    ? 'Sổ giao dịch'
                    : categoryMeta[screen].label}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Theo dõi giá trị, hiệu suất và tỷ trọng danh mục trên cùng một màn hình.
              </p>
            </div>
            {screen === 'transactions' && (
              <div className="flex gap-2">
                <button
                  onClick={() => void load()}
                  className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600"
                >
                  <RefreshCw size={15} /> Làm mới
                </button>
                <button
                  onClick={() => setModal({})}
                  className="flex h-10 items-center gap-2 rounded-xl bg-[#00ab60] px-4 text-xs font-black text-white"
                >
                  <Plus size={16} /> Ghi giao dịch
                </button>
              </div>
            )}
          </header>
          <div className="flex gap-2 overflow-x-auto pb-1 xl:hidden">
            {nav.map((item) => (
              <button
                key={item.id}
                onClick={() => setScreen(item.id)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black ${screen === item.id ? 'bg-[#21d38a] text-white' : 'border border-[#26364a] bg-[#111a28] text-[#9cafc5]'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {source && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800">
              Đã nhập danh mục hiện có từ DBY Finance. Dữ liệu mới được lưu riêng trong An Khang
              Home.
            </div>
          )}
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-sm text-slate-500">
              Đang tải danh mục...
            </div>
          ) : holdings.length === 0 && screen === 'overview' ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-white p-14 text-center">
              <Target className="mx-auto text-[#00ab60]" size={34} />
              <h2 className="mt-4 text-lg font-black text-[#15231d]">
                Chưa kết nối được dữ liệu danh mục
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
                Không tìm thấy dữ liệu DBY Finance trên máy này. Bạn vẫn có thể bắt đầu bằng nút Ghi
                giao dịch.
              </p>
            </div>
          ) : (
            <>
              {screen === 'overview' && (
                <>
              <section className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[22px] bg-[#064a31] p-5 text-white">
                  <p className="text-xs font-bold text-white/65">Tổng giá trị tài sản</p>
                  <p className="mt-2 text-3xl font-black tabular-nums">{money(total)}</p>
                  <p className="mt-3 text-xs text-white/65">Vốn đầu tư: {money(Math.max(0, investedCapital))}</p>
                </div>
                <div className="rounded-[22px] border border-emerald-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-bold text-slate-500">Lãi/lỗ tạm tính</p>
                  <p
                    className={`mt-2 text-2xl font-black tabular-nums ${gain >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}
                  >
                    {gain >= 0 ? '+' : ''}
                    {money(gain)}
                  </p>
                  <p className="mt-3 text-xs text-slate-400">Tổng hợp theo từng tài sản</p>
                </div>
                <div className="rounded-[22px] border border-emerald-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-bold text-slate-500">Phân bổ lớn nhất</p>
                  <p className="mt-2 text-2xl font-black text-[#15231d]">
                    {largestAllocation?.name || 'Chưa phân bổ'}
                  </p>
                  <p className="mt-3 text-xs text-slate-400">
                    {(
                      ((largestAllocation?.value || 0) / total) *
                      100
                    ).toFixed(1)}
                    % tổng danh mục
                  </p>
                </div>
                <div className="rounded-[22px] border border-emerald-100 bg-white p-5 shadow-sm md:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-500">Mục tiêu tài sản dài hạn</p>
                      <p className="mt-1 text-sm font-black text-[#15231d]">Đã đạt {goalPercent}% · mục tiêu {money(wealthGoal)}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                      Mục tiêu
                      <input
                        type="number"
                        min="1"
                        value={wealthGoal}
                        onChange={(event) => {
                          const next = Math.max(1, Number(event.target.value) || 1)
                          setWealthGoal(next)
                          window.localStorage.setItem('dbyfinance-wealth-goal', String(next))
                        }}
                        className="h-9 w-36 rounded-lg border border-slate-200 px-2 text-right"
                      />
                    </label>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#00ab60] transition-all" style={{ width: `${goalPercent}%` }} />
                  </div>
                </div>
              </section>
                <section className="grid gap-5 lg:grid-cols-[1.45fr_.55fr]">
                  <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div><h2 className="font-black text-[#15231d]">Biến động giá trị tài sản</h2><p className="mt-1 text-xs text-slate-400">Diễn biến theo lịch sử danh mục</p></div>
                      <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-[#00ab60]">Toàn thời gian</span>
                    </div>
                    <div className="mt-3 h-[260px] min-h-[260px] w-full">
                      {history.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                          <AreaChart data={history} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="investmentFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#00ab60" stopOpacity={0.26} />
                              <stop offset="95%" stopColor="#00ab60" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#26364a" />
                          <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={compactMoney}
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                          />
                          <Tooltip
                            formatter={(value) => money(Number(value))}
                            contentStyle={{
                              background: '#111a28',
                              border: '1px solid #26364a',
                              borderRadius: 10,
                              color: '#e7eef7'
                            }}
                            labelStyle={{ color: '#8fa1b5' }}
                            itemStyle={{ color: '#55e8aa' }}
                          />
                            <Area
                              type="monotone"
                              dataKey="value"
                              stroke="#00ab60"
                              strokeWidth={3}
                              fill="url(#investmentFill)"
                              dot={false}
                              activeDot={{ r: 4, fill: '#21d38a', stroke: '#0b111b', strokeWidth: 2 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center rounded-xl bg-[#f7faf8] text-xs font-bold text-slate-400">
                          Chưa đủ dữ liệu lịch sử để vẽ biểu đồ.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="font-black text-[#15231d]">Cơ cấu danh mục</h2>
                    <div className="mt-3 flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[10px] font-black"><button type="button" onClick={() => setChartMode('category')} className={`flex-1 rounded-md px-2 py-1 ${chartMode === 'category' ? 'bg-white text-[#00ab60] shadow-sm' : 'text-slate-400'}`}>Theo nhóm</button><button type="button" onClick={() => setChartMode('asset')} className={`flex-1 rounded-md px-2 py-1 ${chartMode === 'asset' ? 'bg-white text-[#00ab60] shadow-sm' : 'text-slate-400'}`}>Theo mã</button></div>
                    <div className="mx-auto h-[170px] max-w-[230px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={currentAllocation}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={48}
                            outerRadius={72}
                            paddingAngle={3}
                          >
                            {currentAllocation.map((item) => (
                              <Cell key={item.key} fill={item.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => money(Number(value))}
                            contentStyle={{
                              background: '#111a28',
                              border: '1px solid #26364a',
                              borderRadius: 10,
                              color: '#e7eef7'
                            }}
                            labelStyle={{ color: '#8fa1b5' }}
                            itemStyle={{ color: '#e7eef7' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {currentAllocation.map((item) => (
                        <button
                          key={item.key}
                          onClick={() => setScreen(item.key as Screen)}
                          className="flex w-full items-center justify-between text-xs"
                        >
                          <span className="flex items-center gap-2 font-bold text-slate-600">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: item.color }}
                            />
                            {item.name}
                          </span>
                          <strong className="text-slate-800">
                            {((item.value / total) * 100).toFixed(1)}%
                          </strong>
                        </button>
                      ))}
                    </div>
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <div><p className="text-xs font-black text-[#15231d]">Tái cân bằng</p><p className="mt-1 text-[11px] text-slate-400">So sánh tỷ trọng thực tế với mục tiêu</p></div>
                        <button type="button" onClick={openTargets} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-700">{targetsOpen ? 'Đóng' : 'Cài mục tiêu'}</button>
                      </div>
                      {targetsOpen && <div className="mt-3 space-y-2">{sortedTargets.map((key) => <label key={key} className="flex items-center justify-between gap-2 text-xs font-bold text-slate-600"><span>{categoryMeta[key].label}</span><span className="flex items-center gap-1"><input type="number" min="0" max="100" value={targetDraft[key] ?? 20} onChange={(event) => setTargetDraft((prev) => ({ ...prev, [key]: Math.min(100, Math.max(0, Number(event.target.value) || 0)) }))} className="h-8 w-16 rounded-lg border border-slate-200 px-2 text-right" />%</span></label>)}<div className="flex items-center justify-between pt-1 text-[10px] font-black"><span className={sortedTargets.reduce((sum, key) => sum + (targetDraft[key] || 0), 0) === 100 ? 'text-emerald-700' : 'text-rose-600'}>{sortedTargets.reduce((sum, key) => sum + (targetDraft[key] || 0), 0)}% / 100%</span><button type="button" onClick={() => void saveTargets()} disabled={sortedTargets.reduce((sum, key) => sum + (targetDraft[key] || 0), 0) !== 100} className="rounded-lg bg-[#00ab60] px-2.5 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-40">Lưu</button></div></div>}
                      {driftAlerts.length > 0 && <div className="mt-3 space-y-2">{driftAlerts.map((alert) => <div key={alert.key} className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2"><p className="text-[11px] font-black text-slate-700">{categoryMeta[alert.key].label}</p><p className="mt-0.5 text-[10px] font-bold text-amber-700">{alert.drift > 0 ? `Vượt ${alert.drift.toFixed(1)}% · nên giảm ${money(alert.amount)}` : `Thiếu ${Math.abs(alert.drift).toFixed(1)}% · nên bổ sung ${money(alert.amount)}`}</p></div>)}</div>}
                    </div>
                  </div>
                </section>
                <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="font-black text-[#15231d]">Tài sản đang nắm giữ</h2>
                      <p className="mt-1 text-xs text-slate-400">
                        Giá trị, tỷ trọng mục tiêu và hiệu suất từng khoản
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                      {visibleHoldings.length} tài sản
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left">
                      <thead className="bg-[#f7faf8] text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="px-5 py-3">Tài sản</th>
                          <th className="px-4 py-3">Nhóm</th>
                          <th className="px-4 py-3 text-right">Giá trị</th>
                          <th className="px-4 py-3">Phân bổ</th>
                          <th className="px-4 py-3 text-right">Lãi/lỗ</th>
                          <th className="px-5 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleHoldings.map((item) => {
                          const meta = categoryMeta[item.category]
                          const percent = total ? (item.valueVnd / total) * 100 : 0
                          return (
                            <tr key={item.symbol} className="hover:bg-emerald-50/30">
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <span
                                    className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
                                    style={{ background: meta.color }}
                                  >
                                    <meta.icon size={17} />
                                  </span>
                                  <div>
                                    <p className="text-sm font-black text-[#15231d]">{item.name}</p>
                                    <p className="mt-0.5 text-xs text-slate-400">
                                      {item.symbol} · {item.quantity}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-xs font-bold text-slate-500">
                                {meta.label}
                              </td>
                              <td className="px-4 py-4 text-right text-sm font-black text-slate-800">
                                {money(item.valueVnd)}
                              </td>
                              <td className="px-4 py-4">
                                <div className="mb-1 flex justify-between text-[10px] font-bold text-slate-500">
                                  <span>{percent.toFixed(1)}%</span>
                                  <span>MT {item.targetPercent}%</span>
                                </div>
                                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
                                  <span
                                    className="block h-full rounded-full"
                                    style={{
                                      width: `${Math.min(percent, 100)}%`,
                                      background: meta.color
                                    }}
                                  />
                                </div>
                              </td>
                              <td
                                className={`px-4 py-4 text-right text-xs font-black ${item.pnlPercent >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}
                              >
                                {item.pnlPercent >= 0 ? '+' : ''}
                                {item.pnlPercent.toFixed(2)}%
                              </td>
                              <td className="px-5 py-4 text-right">
                                <button
                                  onClick={() => setModal({ holding: item })}
                                  className="rounded-lg p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
                                >
                                  <Pencil size={15} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
                </>
              )}
              {screen !== 'overview' && screen !== 'transactions' && (
                <>
                   {screen === 'gold' && <div className="investment-tracker-copy"><div className="mb-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setGoldTradeMode('buy')} className="rounded-xl bg-[#00ab60] px-4 py-2 text-xs font-black text-white">Mua vàng</button><button type="button" onClick={() => setGoldTradeMode('sell')} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700">Bán vàng</button><button type="button" onClick={() => document.getElementById('investment-category-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600">Lịch sử giao dịch ({categoryTransactions.length})</button></div><GoldTracker /></div>}
                   {screen === 'stocks' && <div className="investment-tracker-copy"><div className="mb-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setModal({ initialType: 'buy', forceTransaction: true })} className="rounded-xl bg-[#00ab60] px-4 py-2 text-xs font-black text-white">Mua cổ phiếu</button><button type="button" onClick={() => setModal({ holding: visibleHoldings[0], initialType: 'sell', forceTransaction: true })} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700">Bán cổ phiếu</button><button type="button" onClick={() => setScreen('transactions')} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600">Giao dịch</button></div><StockTracker holdings={visibleHoldings} selectedSymbol={selectedAssetSymbol} onSelectSymbol={setSelectedAssetSymbol} transactions={categoryTransactions} /></div>}
                   {screen === 'bonds' && <div className="investment-tracker-copy"><div className="mb-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setModal({ initialType: 'buy', forceTransaction: true })} className="rounded-xl bg-[#00ab60] px-4 py-2 text-xs font-black text-white">Mua trái phiếu</button><button type="button" onClick={() => setModal({ holding: visibleHoldings[0], initialType: 'sell', forceTransaction: true })} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700">Bán trái phiếu</button><button type="button" onClick={() => setScreen('transactions')} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600">Giao dịch</button></div><BondTracker holdings={visibleHoldings} selectedSymbol={selectedAssetSymbol} onSelectSymbol={setSelectedAssetSymbol} transactions={categoryTransactions} /></div>}
                   {screen === 'savings' && <div className="investment-tracker-copy"><SavingsTracker holdings={savingsTrackerHoldings} transactions={savingsTrackerTransactions} onOpenModal={openTrade} onRefresh={load} onDeleteTransaction={(id) => { const tx = store.transactions.find((item) => item.id === id); if (tx) void deleteTransaction(tx) }} /></div>}
                  {screen === 'cash' && <div className="space-y-3"><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setModal({ initialType: 'deposit' })} className="rounded-xl bg-[#00ab60] px-4 py-2 text-xs font-black text-white">Nạp tiền</button><button type="button" onClick={() => setModal({ initialType: 'withdraw' })} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700">Rút tiền</button><button type="button" onClick={() => setScreen('transactions')} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600">Giao dịch</button></div><section className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]">
                  <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="font-black text-[#15231d]">Tổng hợp {categoryMeta[screen].label}</h2>
                    <div className="mt-4 space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-slate-500">Giá trị hiện tại</span><strong className="text-[#15231d]">{money(visibleHoldings.reduce((sum, item) => sum + item.valueVnd, 0))}</strong></div><div className="flex items-center justify-between"><span className="text-slate-500">Số khoản nắm giữ</span><strong>{visibleHoldings.length}</strong></div><div className="flex items-center justify-between"><span className="text-slate-500">Số giao dịch</span><strong>{categoryTransactions.length}</strong></div>{screen === 'cash' && <><div className="flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-slate-500">Tổng tiền vào</span><strong className="text-emerald-700">+{money(categoryTransactions.reduce((sum, tx) => sum + Math.max(0, transactionCashDelta(tx)), 0))}</strong></div><div className="flex items-center justify-between"><span className="text-slate-500">Tổng tiền ra</span><strong className="text-rose-600">-{money(categoryTransactions.reduce((sum, tx) => sum + Math.max(0, -transactionCashDelta(tx)), 0))}</strong></div></>}</div>
                  </div>
                  <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-black text-[#15231d]">Giao dịch của nhóm</h2><p className="mt-1 text-xs text-slate-400">Lịch sử riêng của {categoryMeta[screen].label.toLowerCase()}</p></div><div className="divide-y divide-slate-100">{categoryTransactions.length ? categoryTransactions.slice(0, 8).map((tx) => { const outgoing = ['sell', 'withdraw'].includes(tx.transactionType); return <button type="button" key={tx.id} onClick={screen === 'cash' ? undefined : () => { setModal({ transaction: tx, holding: store.holdings.find((item) => item.symbol === tx.assetSymbol) }) }} className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left ${screen === 'cash' ? '' : 'hover:bg-slate-50'}`}><div><p className="text-xs font-black text-slate-700">{tx.assetSymbol} · {txLabel[tx.transactionType]}</p><p className="mt-1 text-[11px] text-slate-400">{formatDate(tx.date)}{displayNote(tx.note) ? ` · ${displayNote(tx.note)}` : ''}</p></div><strong className={`text-xs ${outgoing ? 'text-rose-600' : 'text-emerald-700'}`}>{outgoing ? '-' : '+'}{money(tx.amountVnd)}</strong></button> }) : <p className="p-8 text-center text-sm text-slate-400">Chưa có giao dịch trong nhóm này.</p>}</div></div>
                </section></div>}
                 </>
              )}
              {screen === 'gold' && <GoldHoldings rows={visibleHoldings} onAdd={() => { setGoldTradeSymbol(undefined); setGoldTradeMode('buy') }} onTrade={(holding, initialType) => {
                if (['VNHAN', 'PQHN24NTT', 'BT9999NTT'].includes(holding.symbol)) {
                  setGoldTradeSymbol(holding.symbol)
                  setGoldTradeMode(initialType)
                } else setModal({ holding, initialType, forceTransaction: true })
              }} />}
              {screen === 'gold' && <GoldTransactionHistory rows={categoryTransactions} holdings={store.holdings} onEdit={(transaction) => setModal({ transaction, holding: store.holdings.find((holding) => holding.symbol === transaction.assetSymbol) })} onDelete={(transaction) => void deleteTransaction(transaction)} />}
              {screen === 'transactions' && (
                <section id="investment-category-history" className="scroll-mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-black text-[#15231d]">Toàn bộ giao dịch</h2><p className="mt-1 text-xs text-slate-400">Lịch sử mua, bán, nạp và rút khỏi danh mục</p></div>{screen === 'transactions' && <div className="flex flex-wrap gap-1">{([['all', 'Tất cả'], ['buy', 'Mua'], ['sell', 'Bán'], ['deposit', 'Nạp'], ['withdraw', 'Rút'], ['import-existing', 'Nhập']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setTransactionFilter(key)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black ${transactionFilter === key ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:bg-slate-50'}`}>{label}</button>)}</div>}</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {transactions.filter((tx) => isVisibleTransaction(tx, transactionFilter)).map((tx) => {
                      const outgoing = ['sell', 'withdraw'].includes(tx.transactionType)
                      return (
                        <div
                          key={tx.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-9 w-9 items-center justify-center rounded-xl ${outgoing ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}
                            >
                              {outgoing ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                            </span>
                            <div>
                              <p className="text-sm font-black text-slate-700">
                                {tx.assetSymbol} · {txLabel[tx.transactionType]}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {formatDate(tx.date)}
                                {tx.quantity ? ` · ${tx.quantity} ${tx.unit || ''}` : ''}
                                {displayNote(tx.note) ? ` · ${displayNote(tx.note)}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <strong className={outgoing ? 'text-rose-600' : 'text-emerald-700'}>
                              {outgoing ? '-' : '+'}
                              {money(tx.amountVnd)}
                            </strong>
                            <button
                              onClick={() =>
                                setModal({
                                  transaction: tx,
                                  holding: store.holdings.find(
                                    (item) => item.symbol === tx.assetSymbol
                                  )
                                })
                              }
                              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => void deleteTransaction(tx)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
      {modal && (
        <TransactionModal
          holding={modal.holding}
          transaction={modal.transaction}
          initialType={modal.initialType}
          forceTransaction={modal.forceTransaction}
          scopedCategory={screen === 'overview' || screen === 'transactions' ? undefined : screen}
          walletSummary={walletSummary}
          onClose={() => setModal(null)}
          onSave={saveTransaction}
          onSaveHolding={(input) => void saveHoldingDetails(input)}
        />
      )}
      {goldTradeMode && (
        <GoldTradeModal
          mode={goldTradeMode}
          initialSymbol={goldTradeSymbol}
          holdings={store.holdings}
          walletSummary={walletSummary}
          onClose={() => { setGoldTradeMode(null); setGoldTradeSymbol(undefined) }}
          onSave={async (input) => {
            await saveTransaction(input)
            setGoldTradeMode(null)
            setGoldTradeSymbol(undefined)
            setGoldTradeNotice(`Đã ghi nhận ${input.type === 'buy' ? 'mua' : 'bán'} ${input.quantity} chỉ ${input.name} · ${money(input.amount)}.`)
            window.requestAnimationFrame(() => document.getElementById('investment-category-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
          }}
        />
      )}
      {goldTradeNotice && (
        <div role="status" className="fixed bottom-5 right-5 z-[120] flex max-w-md items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-[#15231d] shadow-xl">
          <span className="flex-1">{goldTradeNotice}</span>
          <button type="button" aria-label="Đóng thông báo" onClick={() => setGoldTradeNotice(null)} className="text-slate-500 hover:text-[#15231d]"><X size={16} /></button>
        </div>
      )}
    </div>
  )
}
