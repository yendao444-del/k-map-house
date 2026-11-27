import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactElement } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Clock3,
  Landmark,
  LayoutDashboard,
  Minus,
  PackagePlus,
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
  importLocalInvestmentStore,
  isInvestmentStoreEmpty,
  readInvestmentStore,
  readLocalInvestmentStore,
  writeInvestmentStore,
  type InvestmentCategory,
  type InvestmentHolding,
  type InvestmentStore,
  type InvestmentTransaction,
  type InvestmentTransactionType
} from '../lib/investment-store'
import { GoldTracker } from './investment-trackers/GoldTracker'
import type { MyHanhGoldPrices } from '../../../shared/my-hanh-gold'
import { valueGoldHolding } from '../lib/gold-valuation'
import { StockTracker, VN_STOCK_SUGGESTIONS } from './investment-trackers/StockTracker'
import { BOND_SUGGESTIONS } from '../lib/bondApi'
import { BondTracker } from './investment-trackers/BondTracker'
import { SavingsTracker } from './investment-trackers/SavingsTracker'
import { GoldTradeModal } from './investment-trackers/GoldTradeModal'
import { GoldPortfolioPanel, type GoldPortfolioTab } from './investment-trackers/GoldPortfolioPanel'
import './investment-trackers/original-trackers.css'
import './investment-trackers/investment-dark.css'
import './investment-trackers/gold-workspace.css'
import './investment-trackers/trade-sheet.css'
// Official bank logos from the VietQR bank list (cdn.vietqr.io/img), trimmed to 240px webp.
import vcbLogo from './investment-trackers/assets/banks/VCB.webp'
import mbLogo from './investment-trackers/assets/banks/MB.webp'
import tcbLogo from './investment-trackers/assets/banks/TCB.webp'
import vpbLogo from './investment-trackers/assets/banks/VPB.webp'
import bidvLogo from './investment-trackers/assets/banks/BIDV.webp'
import agribankLogo from './investment-trackers/assets/banks/VBA.webp'
import acbLogo from './investment-trackers/assets/banks/ACB.webp'
import { transactionsForCategory } from '../lib/investment-history'
import { readSavings, savingsInterest, savingsMaturity } from '../lib/savings'
import { fetchSecurityQuote } from '../lib/security-quote'
import { getWalletBalanceSummary, type WalletBalanceSummary } from '../lib/db'
import { planInvestmentTopUp, prepareInvestmentPurchase, InvestmentFundingCancelled } from '../lib/investment-auto-funding'
import { usePasswordConfirmation } from './PasswordConfirmationDialog'
import { useInvestmentConfirm } from './investment-trackers/InvestmentConfirmDialog'
import { investmentBalance, investmentWalletImpact, validateFunding, type FundingMethod } from '../lib/investment-funding'
import { readCachedWalletBalanceSummary } from '../lib/wallet-summary-query'
import { InvestmentWalletPanel } from './investment-trackers/InvestmentWalletPanel'
import { InvestmentPortfolioContext, personalShortfallMessage, useInvestmentPortfolio } from '@dby-finance'
import type { InvestmentPortfolio } from '../lib/investment-store'

type Screen = 'overview' | InvestmentCategory | 'transactions'
const CATEGORY_ORDER: InvestmentCategory[] = ['cash', 'gold', 'stocks', 'bonds', 'savings']
const categoryMeta: Record<
  InvestmentCategory,
  { label: string; color: string; icon: typeof TrendingUp }
> = {
  cash: { label: 'Ví đầu tư', color: '#00ab60', icon: WalletCards },
  gold: { label: 'Vàng', color: '#d97706', icon: BarChart3 },
  stocks: { label: 'Cổ phiếu & Quỹ', color: '#16a34a', icon: TrendingUp },
  bonds: { label: 'Trái phiếu', color: '#2563eb', icon: Landmark },
  savings: { label: 'Tiết kiệm', color: '#0f766e', icon: PiggyBank }
}
const PERSONAL_WALLET_LABEL = { deposit: 'Nạp tiền từ bên ngoài', withdraw: 'Rút tiền ra ngoài' } as const
const labelFor = (type: InvestmentTransactionType, personal: boolean): string =>
  personal && (type === 'deposit' || type === 'withdraw') ? PERSONAL_WALLET_LABEL[type] : txLabel[type]
const txLabel: Record<InvestmentTransactionType, string> = {
  deposit: 'Chuyển vốn từ Ví vận hành',
  withdraw: 'Chuyển về Ví vận hành',
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
  const savings = readSavings(value)
  if (savings) return savings.status === 'settled' ? 0 : 1
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
const formatTime = (value: string) => {
  if (!/[T ]\d{2}:\d{2}/.test(value)) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

// Quick-pick data for the savings sheet. Rates are rough reference values the
// user overrides with the real rate printed on their book.
const SAVINGS_BANKS: ReadonlyArray<{ name: string; logo?: string }> = [
  { name: 'Vietcombank', logo: vcbLogo },
  { name: 'MB Bank', logo: mbLogo },
  { name: 'Techcombank', logo: tcbLogo },
  { name: 'VPBank', logo: vpbLogo },
  { name: 'BIDV', logo: bidvLogo },
  { name: 'Agribank', logo: agribankLogo },
  { name: 'ACB', logo: acbLogo },
  { name: 'Khác' }
]
const SAVINGS_AMOUNTS = [[10_000_000, '10 tr'], [50_000_000, '50 tr'], [100_000_000, '100 tr'], [200_000_000, '200 tr'], [500_000_000, '500 tr'], [1_000_000_000, '1 tỷ']] as const
const SAVINGS_TERMS = ['1 tháng', '3 tháng', '6 tháng', '12 tháng', '18 tháng', '24 tháng', '36 tháng']
const DEFAULT_SAVINGS_RATES: Record<string, number> = { '1 tháng': 3, '3 tháng': 3.5, '6 tháng': 4.5, '9 tháng': 4.6, '12 tháng': 5.5, '18 tháng': 5.6, '24 tháng': 5.7, '36 tháng': 5.8 }

// Price fields show Vietnamese grouping (19.600, 26.277,7) but keep a plain
// numeric string ("19600", "26277.7") in state.
function formatSheetNumber(raw: string): string {
  if (!raw) return ''
  const [whole, fraction] = String(raw).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return fraction !== undefined ? `${grouped},${fraction}` : grouped
}
function parseSheetNumber(text: string): string | null {
  const plain = text.replace(/[.\s]/g, '').replace(',', '.')
  if (!/^\d*(\.\d{0,4})?$/.test(plain)) return null
  return plain.replace(/^0+(?=\d)/, '')
}

function TransactionModal({
  holding,
  transaction,
  initialType,
  forceTransaction,
  scopedCategory,
  walletSummary,
  operatingWalletSummary,
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
  operatingWalletSummary: WalletBalanceSummary
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
    String(transaction?.quantity || (holding ? parseQuantity(holding.quantity) : scopedCategory === 'stocks' || scopedCategory === 'bonds' ? 100 : ''))
  )
  const [unit, setUnit] = useState(
    transaction?.unit || holding?.quantity.split(' ').slice(1).join(' ') || 'đơn vị'
  )
  const [date, setDate] = useState(transaction?.date || new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState(transaction?.note || '')
  const [paymentMethod, setPaymentMethod] = useState<FundingMethod>(transaction?.walletPosting?.paymentMethod || (walletSummary.bankBalance >= walletSummary.cashBalance ? 'transfer' : 'cash'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isSecurity = category === 'stocks' || category === 'bonds'
  const isSavings = category === 'savings'
  const existingSavings = readSavings(holding?.quantity) || readSavings(transaction?.note)
  const [bank, setBank] = useState(existingSavings?.bank || 'Vietcombank')
  const [term, setTerm] = useState(existingSavings?.term || '12 tháng')
  const [rate, setRate] = useState(String(existingSavings?.rate ?? 5.5))
  const [maturityAction, setMaturityAction] = useState(existingSavings?.maturityAction || 'tat_toan_ve_vi')
  const [rateTouched, setRateTouched] = useState(Boolean(existingSavings))
  const [otherBank, setOtherBank] = useState(false)
  const [priceMode, setPriceMode] = useState<'unit' | 'total'>('unit')
  const [unitPrice, setUnitPrice] = useState(String(transaction?.unitPriceVnd || ''))
  const [securityUnit, setSecurityUnit] = useState(transaction?.unit === 'CCQ' || holding?.quantity.includes('CCQ') || category === 'bonds' ? 'CCQ' : 'CP')
  const [securityOptions, setSecurityOptions] = useState(false)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteMessage, setQuoteMessage] = useState('')
  useEffect(() => {
    if (!isSecurity || transaction) return
    const controller = new AbortController()
    setUnitPrice('')
    setQuoteMessage('')
    const code = symbol.trim().toUpperCase()
    if (!/^[A-Z0-9]{3,12}$/.test(code)) { setQuoteLoading(false); return }
    // Unlisted equity fund NAVs are not supplied by the exchange feed.
    if (category !== 'bonds' && ['DCDS', 'VESF', 'VEOF', 'VF1'].includes(code)) {
      setQuoteLoading(false)
      setQuoteMessage('Chưa có nguồn NAV trực tuyến cho quỹ này. Nhập NAV công bố thực tế.')
      return
    }
    setQuoteLoading(true)
    const timer = window.setTimeout(() => {
      const request = category === 'bonds'
        ? window.api.investment.fundNav(code)
        : fetchSecurityQuote(code, controller.signal)
      void request.then(quote => {
        if (controller.signal.aborted) return
        setUnitPrice(String(quote.priceVnd))
        setQuoteMessage(`${quote.source} · ${formatDate(quote.quotedAt)}`)
      }).catch(cause => {
        if (!controller.signal.aborted) setQuoteMessage(`${cause instanceof Error ? cause.message : 'Không tải được giá.'} Nhập giá thực tế để tiếp tục.`)
      }).finally(() => { if (!controller.signal.aborted) setQuoteLoading(false) })
    }, 350)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [symbol, category, isSecurity, transaction])
  const effectiveAmount = isSecurity && priceMode === 'unit' ? Number(quantity) * Number(unitPrice) : Number(amount)
  useEffect(() => {
    if (isSavings && !transaction) {
      setAmount(String(existingSavings?.principal || holding?.valueVnd || ''))
      if (type !== 'sell' && existingSavings?.startDate) setDate(existingSavings.startDate)
    }
  }, [])
  const isWalletTransaction = category === 'cash' || type === 'deposit' || type === 'withdraw'
  const personal = useInvestmentPortfolio() === 'personal'
  const [walletTime, setWalletTime] = useState(() => new Date())
  useEffect(() => {
    if (!isWalletTransaction || transaction) return
    const timer = window.setInterval(() => setWalletTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [isWalletTransaction, transaction])
  const purchaseShortfall = type === 'buy' ? Math.max(0, effectiveAmount - walletSummary.totalBalance) : 0
  let fundingError = ''
  if ((!holding || forceTransaction) && !transaction && (type === 'buy' || type === 'withdraw') && effectiveAmount > 0) {
    try {
      const shortfall = Math.max(0, effectiveAmount - walletSummary.totalBalance)
      // DBY Finance: the shortfall is recorded as an external deposit on save.
      if (type === 'buy' && shortfall > 0 && personal) { /* funded from outside */ }
      else if (type === 'buy' && shortfall > 0) planInvestmentTopUp(shortfall, operatingWalletSummary, paymentMethod)
      else validateFunding(walletSummary, [{ paymentMethod, amount: -effectiveAmount }])
    }
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
    if (type === 'deposit' && effectiveAmount > 0 && !personal) {
      try { validateFunding(operatingWalletSummary, [{ paymentMethod, amount: -effectiveAmount }]) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Ví vận hành không đủ tiền.'); return }
    }
    if (scopedCategory && category !== scopedCategory) return
    if (!isWalletTransaction && !isSavings && !symbol.trim()) return
    if (!isWalletTransaction && !isSavings && !isSecurity && holding && !transaction && !forceTransaction) {
      onSaveHolding?.({
        category,
        symbol: symbol.trim().toUpperCase(),
        name: name.trim() || symbol.trim().toUpperCase(),
        quantity: Number(quantity) || 0,
        unit: unit.trim() || 'đơn vị'
      })
      return
    }
    if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) return
    setSaving(true)
    setError('')
    try {
    await onSave({
      category: isWalletTransaction ? 'cash' : category,
      symbol: isWalletTransaction ? 'CASH' : isSavings ? holding?.symbol || transaction?.assetSymbol || `STK-${crypto.randomUUID()}` : symbol.trim().toUpperCase(),
      name: isWalletTransaction ? 'Ví đầu tư' : isSavings ? `Tiết kiệm ${bank.trim()}` : name.trim() || symbol.trim().toUpperCase(),
      type: isWalletTransaction ? (type === 'withdraw' ? 'withdraw' : 'deposit') : type,
      amount: effectiveAmount,
      quantity: isWalletTransaction ? 0 : isSavings ? 1 : Number(quantity) || 0,
      unit: isWalletTransaction ? 'VND' : isSavings ? 'sổ' : isSecurity ? category === 'bonds' ? 'CCQ' : securityUnit : unit.trim() || 'đơn vị',
      date: isWalletTransaction ? transaction?.date || new Date().toISOString() : date,
      note: isSavings ? JSON.stringify({
        ...(type === 'sell' ? existingSavings : {}),
        type: 'savings', bank: bank.trim(), principal: type === 'sell' ? existingSavings?.principal || holding?.valueVnd : effectiveAmount,
        term, rate: Number(rate), startDate: type === 'sell' ? existingSavings?.startDate : date,
        maturityDate: type === 'sell' ? existingSavings?.maturityDate : savingsMaturity(date, term), maturityAction,
        status: type === 'sell' ? 'settled' : 'active',
        ...(type === 'sell' ? { settleDate: date, settleAmount: effectiveAmount } : {})
      }) : note,
      paymentMethod
    })
    } catch (cause) {
      if (!(cause instanceof InvestmentFundingCancelled)) setError(cause instanceof Error ? cause.message : 'Không thể lưu giao dịch.')
    } finally { setSaving(false) }
  }
  if (isSavings && !transaction && type !== 'sell') {
    // Click-first savings sheet (approved demo savings-sheet-a|b): bank tiles,
    // amount / term / maturity chips; only "Khác" bank and odd amounts need typing.
    const importing = type === 'import-existing'
    const principal = Number(amount) || 0
    const interest = savingsInterest(principal, Number(rate) || 0, term)
    const maturity = savingsMaturity(date, term)
    const knownBank = SAVINGS_BANKS.some(item => item.name === bank)
    const bankTile = otherBank ? 'Khác' : knownBank ? bank : 'Khác'
    const today = new Date().toISOString().slice(0, 10)
    const monthsAgo = (months: number) => {
      const value = new Date(`${today}T12:00:00`)
      value.setMonth(value.getMonth() - months)
      return value.toISOString().slice(0, 10)
    }
    const chooseTerm = (next: string) => {
      setTerm(next)
      if (!rateTouched) setRate(String(DEFAULT_SAVINGS_RATES[next] ?? rate))
    }
    const chooseSavingsType = (next: InvestmentTransactionType) => {
      if (saving || next === type) return
      setType(next)
      setError('')
      setDate(next === 'import-existing' ? monthsAgo(3) : today)
    }
    return (
      <div className="trade-sheet-overlay" onMouseDown={() => { if (!saving) onClose() }}>
        <form onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="savings-sheet-title" className={`trade-sheet trade-sheet--savings trade-sheet--${importing ? 'import' : 'buy'}`}>
          <header className="trade-sheet__band">
            <div className="trade-sheet__title-row">
              <h2 id="savings-sheet-title">Sổ tiết kiệm</h2>
              <button type="button" aria-label="Đóng" onClick={onClose} disabled={saving} className="trade-sheet__close"><X size={18} /></button>
            </div>
            {personal && <div className="trade-sheet__tabs" role="radiogroup" aria-label="Loại sổ">
              <button type="button" role="radio" aria-checked={!importing} disabled={saving} onClick={() => chooseSavingsType('buy')}><Plus size={16} />Mở sổ mới</button>
              <button type="button" role="radio" aria-checked={importing} disabled={saving} onClick={() => chooseSavingsType('import-existing')}><PackagePlus size={16} />Nhập sổ có sẵn</button>
            </div>}
            <div className="trade-sheet__hero" aria-live="polite">
              <span>Lãi dự kiến khi đáo hạn</span>
              <strong>{principal > 0 ? `+${money(interest)}` : '—'}</strong>
              <small>{maturity && maturity !== 'Không kỳ hạn' ? `Đáo hạn ${formatDate(maturity)}` : 'Không kỳ hạn'}{importing ? ' · Không trừ tiền Ví đầu tư' : principal > 0 ? ` · Gốc ${money(principal)}` : ''}</small>
            </div>
          </header>

          <div className="trade-sheet__card">
            <div className="trade-sheet__field">
              <span className="trade-sheet__label">Ngân hàng</span>
              <div className="savings-banks" role="radiogroup" aria-label="Ngân hàng">
                {SAVINGS_BANKS.map(item => <button key={item.name} type="button" role="radio" title={item.name} aria-label={item.name} aria-checked={bankTile === item.name} onClick={() => { if (item.name === 'Khác') { setOtherBank(true); if (knownBank) setBank('') } else { setOtherBank(false); setBank(item.name) } }}>
                  {item.logo ? <img src={item.logo} alt={item.name} draggable={false} /> : <><Landmark size={16} aria-hidden="true" />Khác</>}
                </button>)}
              </div>
              {bankTile === 'Khác' && <input required autoFocus value={bank} onChange={e => setBank(e.target.value)} placeholder="Tên ngân hàng" aria-label="Tên ngân hàng khác" />}
            </div>

            <div className="trade-sheet__field">
              <label htmlFor="savings-amount">Số tiền gửi</label>
              <div className="trade-sheet__money">
                <input id="savings-amount" required type="text" inputMode="numeric" value={formatSheetNumber(amount)} placeholder="0" onChange={e => { const next = parseSheetNumber(e.target.value); if (next !== null) setAmount(next.split('.')[0]) }} />
                <span aria-hidden="true">đ</span>
              </div>
              <div className="trade-sheet__chips trade-sheet__chips--fill">
                {SAVINGS_AMOUNTS.map(([value, label]) => <button key={value} type="button" aria-pressed={principal === value} onClick={() => setAmount(String(value))}>{label}</button>)}
              </div>
            </div>

            <div className="trade-sheet__field">
              <span className="trade-sheet__label">Kỳ hạn</span>
              <div className="trade-sheet__chips trade-sheet__chips--fill">
                {SAVINGS_TERMS.map(value => <button key={value} type="button" aria-pressed={term === value} onClick={() => chooseTerm(value)}>{value.replace(' tháng', ' th')}</button>)}
              </div>
            </div>

            <div className="savings-inline-field">
              <label htmlFor="savings-rate">Lãi suất</label>
              <div className="savings-rate"><input id="savings-rate" required type="number" min="0" max="100" step="0.01" value={rate} onChange={e => { setRate(e.target.value); setRateTouched(true) }} /><span>%/năm</span></div>
              <small>{rateTouched ? 'Lãi suất bạn nhập' : 'Mức tham khảo, sửa theo sổ thật'}</small>
            </div>

            {importing
              ? <div className="trade-sheet__field">
                <span className="trade-sheet__label">Ngày gửi</span>
                <div className="trade-sheet__chips savings-dates">
                  {[1, 3, 6].map(months => <button key={months} type="button" aria-pressed={date.slice(0, 10) === monthsAgo(months)} onClick={() => setDate(monthsAgo(months))}>{months} tháng trước</button>)}
                  <input type="date" required max={today} value={date.slice(0, 10)} onChange={e => setDate(e.target.value)} aria-label="Chọn ngày gửi" />
                </div>
              </div>
              : <div className="savings-inline-field">
                <span className="trade-sheet__label">Khi đáo hạn</span>
                <div className="trade-sheet__segment savings-maturity" role="radiogroup" aria-label="Khi đáo hạn">
                  {([['tat_toan_ve_vi', 'Tất toán về ví'], ['goc_lai_tai_tuc', 'Tái tục gốc + lãi'], ['goc_tai_tuc_lai_ve_vi', 'Tái tục gốc']] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-pressed={maturityAction === value} aria-checked={maturityAction === value} onClick={() => setMaturityAction(value)}>{label}</button>)}
                </div>
              </div>}

            {!importing && <div className="trade-sheet__wallet">
              <span>Ví đầu tư <strong>{money(walletSummary.totalBalance)}</strong></span>
              {purchaseShortfall > 0
                ? <span>Thiếu <strong>{money(purchaseShortfall)}</strong>{personal ? ': ghi nạp từ bên ngoài' : ': hỏi chuyển từ Ví phòng trọ'}</span>
                : <span>Sau khi mở <strong>{money(Math.max(0, walletSummary.totalBalance - principal))}</strong></span>}
            </div>}
            {fundingError && <p role="alert" className="trade-sheet__error">{fundingError}</p>}
            {error && <p role="alert" className="trade-sheet__error">{error}</p>}
          </div>

          <footer className="trade-sheet__actions">
            <button type="button" onClick={onClose} disabled={saving} className="trade-sheet__cancel">Hủy</button>
            <button type="submit" disabled={saving || Boolean(fundingError) || !(principal > 0) || !bank.trim()} className="trade-sheet__submit">{saving ? 'Đang lưu…' : importing ? 'Nhập sổ' : 'Mở sổ'}</button>
          </footer>
        </form>
      </div>
    )
  }
  if (isSecurity) {
    // Voucher-style sheet (same layout as the gold sheet): coloured band with
    // type tabs and the total, one white form card, Hủy + Xác nhận.
    const importing = type === 'import-existing'
    const sheetMode = importing ? 'import' : type === 'sell' ? 'sell' : 'buy'
    const assetLabel = category === 'bonds' ? 'trái phiếu' : 'cổ phiếu'
    const quantityUnit = category === 'bonds' ? 'CCQ' : securityUnit
    const sheetTypes: Array<{ id: InvestmentTransactionType; label: string; icon: typeof Plus }> = [
      { id: 'buy', label: 'Mua', icon: ArrowDownLeft },
      { id: 'sell', label: 'Bán', icon: ArrowUpRight },
      ...(personal ? [{ id: 'import-existing' as const, label: 'Nhập hiện có', icon: PackagePlus }] : [])
    ]
    // One list for shares and ETFs; the VN30 ETF is suggested first.
    const etf = VN_STOCK_SUGGESTIONS.find(item => item.symbol === 'E1VFVN30')
    const suggestions = category === 'bonds'
      ? BOND_SUGGESTIONS.slice(0, 6)
      : [...(etf ? [etf] : []), ...VN_STOCK_SUGGESTIONS.filter(item => !['DCDS', 'VESF', 'VEOF', 'VF1', 'E1VFVN30', 'FUEVFVND'].includes(item.symbol))].slice(0, 7)
    const heldQuantity = holding && holding.symbol.toUpperCase() === symbol.trim().toUpperCase() ? parseQuantity(holding.quantity) : 0
    const walletAfter = walletSummary.totalBalance + (type === 'sell' ? effectiveAmount : type === 'buy' ? -effectiveAmount : 0)
    const chooseSheetType = (next: InvestmentTransactionType) => {
      if (saving || next === type) return
      setType(next)
      setError('')
      if (next === 'import-existing') { setPriceMode('unit'); setUnitPrice('') }
    }
    const today = new Date().toISOString().slice(0, 10)
    return (
      <div className="trade-sheet-overlay" onMouseDown={() => { if (!saving) onClose() }}>
        <form onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="trade-sheet-title" className={`trade-sheet trade-sheet--${sheetMode}`}>
          <header className="trade-sheet__band">
            <div className="trade-sheet__title-row">
              <h2 id="trade-sheet-title">{transaction ? 'Sửa giao dịch · ' : ''}{importing ? `Nhập ${assetLabel} hiện có` : `${type === 'sell' ? 'Bán' : 'Mua'} ${assetLabel}`}</h2>
              <button type="button" aria-label="Đóng" onClick={onClose} disabled={saving} className="trade-sheet__close"><X size={18} /></button>
            </div>
            {!transaction && <div className="trade-sheet__tabs" role="radiogroup" aria-label="Loại giao dịch">
              {sheetTypes.map(option => {
                const Icon = option.icon
                return <button key={option.id} type="button" role="radio" aria-checked={type === option.id} disabled={saving} onClick={() => chooseSheetType(option.id)}><Icon size={16} />{option.label}</button>
              })}
            </div>}
            <div className="trade-sheet__hero" aria-live="polite">
              <span>{importing ? 'Tổng giá vốn' : type === 'sell' ? 'Tổng tiền bán' : 'Tổng thanh toán'}</span>
              <strong>{effectiveAmount > 0 ? money(effectiveAmount) : 'Chưa có giá'}</strong>
              <small>{importing ? 'Không trừ tiền Ví đầu tư' : `${Number(quantity) || 0} ${quantityUnit} × ${unitPrice ? money(Number(unitPrice)) : '—'}`}</small>
            </div>
          </header>

          <div className="trade-sheet__card">

            <div className="trade-sheet__field">
              <div className="trade-sheet__label-row"><label htmlFor="trade-sheet-symbol">{category === 'bonds' ? 'Mã quỹ trái phiếu' : 'Mã cổ phiếu'}</label>{name && <span title={name}>{name}</span>}</div>
              <input id="trade-sheet-symbol" required autoFocus={!transaction} value={symbol} disabled={Boolean(transaction)} onChange={e => { setSymbol(e.target.value.toUpperCase()); setName('') }} placeholder="VD: HPG" className="trade-sheet__symbol-input" />
              {!transaction && <div className="trade-sheet__chips" role="group" aria-label="Chọn nhanh mã">
                {suggestions.map(item => <button type="button" key={item.symbol} aria-pressed={symbol === item.symbol} title={item.name} onClick={() => { setSymbol(item.symbol); setName(item.name) }}>{item.symbol}</button>)}
              </div>}
            </div>

            <div className="trade-sheet__field">
              <label htmlFor="trade-sheet-price">{priceMode === 'total' ? 'Tổng tiền (VND)' : importing ? `Giá vốn / ${quantityUnit}` : `Giá ${type === 'sell' ? 'bán' : 'mua'} / ${quantityUnit}`}</label>
              <div className="trade-sheet__money">
                <input id="trade-sheet-price" required disabled={quoteLoading && priceMode === 'unit' && !importing} type="text" inputMode="decimal" value={formatSheetNumber(priceMode === 'unit' ? unitPrice : amount)} placeholder={importing ? 'Giá bạn đã mua' : 'Nhập giá'} onChange={e => {
                  const next = parseSheetNumber(e.target.value)
                  if (next === null) return
                  if (priceMode === 'unit') { setUnitPrice(next); setQuoteMessage(importing ? '' : 'Giá giao dịch do bạn nhập.') } else setAmount(next)
                }} />
                <span aria-hidden="true">đ</span>
              </div>
              <p className="trade-sheet__hint">{importing ? 'Giá bạn đã mua, dùng để tính lãi/lỗ.' : quoteLoading ? 'Đang tải giá mới nhất…' : quoteMessage || 'Chọn mã để tự lấy giá hiện tại.'}</p>
            </div>

            <div className="trade-sheet__field">
              <label htmlFor="trade-sheet-quantity">Số lượng ({quantityUnit})</label>
              <div className="trade-sheet__qty">
                <button type="button" aria-label="Giảm số lượng" disabled={Number(quantity) <= 100} onClick={() => setQuantity(String(Math.max(100, (Number(quantity) || 100) - 100)))}><Minus size={16} /></button>
                <input id="trade-sheet-quantity" required type="number" min="0.000001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} />
                <button type="button" aria-label="Tăng số lượng" onClick={() => setQuantity(String((Number(quantity) || 0) + 100))}><Plus size={16} /></button>
                <div className="trade-sheet__presets">{[100, 500, 1000, 5000].map(value => <button key={value} type="button" aria-pressed={Number(quantity) === value} onClick={() => setQuantity(String(value))}>{new Intl.NumberFormat('vi-VN').format(value)}</button>)}</div>
              </div>
            </div>

            {(importing || securityOptions) && <div className="trade-sheet__field">
              <label htmlFor="trade-sheet-date">{importing ? 'Ngày mua' : 'Ngày giao dịch'}</label>
              <input id="trade-sheet-date" required type="date" max={today} value={date.slice(0, 10)} onChange={e => setDate(e.target.value)} />
            </div>}
            {securityOptions && !importing && <div className="trade-sheet__field">
              <span className="trade-sheet__label">Cách nhập giá</span>
              <div className="trade-sheet__segment">
                <button type="button" aria-pressed={priceMode === 'unit'} onClick={() => setPriceMode('unit')}>Đơn giá / NAV</button>
                <button type="button" aria-pressed={priceMode === 'total'} onClick={() => setPriceMode('total')}>Tổng tiền</button>
              </div>
            </div>}
            {securityOptions && <div className="trade-sheet__field">
              <label htmlFor="trade-sheet-note">Ghi chú (tùy chọn)</label>
              <input id="trade-sheet-note" value={note} onChange={e => setNote(e.target.value)} />
            </div>}
            <button type="button" aria-expanded={securityOptions} onClick={() => setSecurityOptions(!securityOptions)} className="trade-sheet__more">{securityOptions ? 'Thu gọn tùy chọn' : 'Tùy chọn khác: ngày, ghi chú, cách nhập giá'}</button>

            {type === 'sell'
              ? <div className="trade-sheet__wallet"><span>Đang có <strong>{heldQuantity} {quantityUnit}</strong></span><span>Tiền bán về Ví đầu tư</span></div>
              : !importing && <div className="trade-sheet__wallet">
                <span>Ví đầu tư <strong>{money(walletSummary.totalBalance)}</strong></span>
                <span>Sau giao dịch <strong>{money(Math.max(0, walletAfter))}</strong></span>
              </div>}
            {purchaseShortfall > 0 && !fundingError && personal && <p role="status" className="trade-sheet__note">Ví thiếu {money(purchaseShortfall)}. Khi lưu, phần thiếu được ghi là nạp tiền từ bên ngoài.</p>}
            {purchaseShortfall > 0 && !fundingError && !personal && <p role="status" className="trade-sheet__note">Ví thiếu {money(purchaseShortfall)}. Khi lưu, bạn sẽ được hỏi chuyển phần thiếu từ Ví phòng trọ.</p>}
            {fundingError && <p role="alert" className="trade-sheet__error">{fundingError}</p>}
            {error && <p role="alert" className="trade-sheet__error">{error}</p>}
          </div>

          <footer className="trade-sheet__actions">
            <button type="button" onClick={onClose} disabled={saving} className="trade-sheet__cancel">Hủy</button>
            <button type="submit" disabled={saving || Boolean(fundingError) || !(effectiveAmount > 0)} className="trade-sheet__submit">{saving ? 'Đang lưu…' : importing ? 'Xác nhận nhập' : type === 'sell' ? 'Xác nhận bán' : 'Xác nhận mua'}</button>
          </footer>
        </form>
      </div>
    )
  }
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <form
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        className={`investment-modal max-h-[calc(100vh-32px)] w-full ${isSecurity ? 'max-w-5xl' : 'max-w-xl'} overflow-y-auto rounded-[24px] bg-white shadow-2xl ${isSecurity ? `security-trade-dialog security-trade-${type === 'sell' ? 'sell' : 'buy'}` : ''}`}
      >
        <div className="investment-modal-header security-trade-heading flex items-center justify-between bg-[#064a31] px-6 py-5 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-200">
              {isSecurity ? (type === 'sell' ? 'BÁN TÀI SẢN · TIỀN VỀ VÍ' : 'MUA TÀI SẢN · THANH TOÁN TỪ VÍ') : 'Danh mục đầu tư'}
            </p>
            <h2 className="mt-1 text-xl font-black">
              {isSecurity ? `${transaction ? 'Sửa giao dịch ' : ''}${type === 'sell' ? 'Bán' : 'Mua'} ${category === 'bonds' ? 'trái phiếu' : securityUnit === 'CCQ' ? 'chứng chỉ quỹ / ETF' : 'cổ phiếu'}` : isWalletTransaction ? (transaction ? 'Sửa giao dịch ví' : personal ? 'Nạp / rút tiền' : 'Chuyển vốn đầu tư') : transaction
                ? 'Sửa giao dịch'
                : holding
                  ? `Cập nhật ${holding.symbol}`
                  : 'Ghi giao dịch mới'}
            </h2>
            {isSecurity && <p className="security-trade-direction mt-2 flex items-center gap-2 text-xs font-semibold">
              {type === 'sell' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
              {type === 'sell' ? 'Giảm tài sản nắm giữ, cộng tiền bán vào ví.' : 'Tăng tài sản nắm giữ, trừ tiền mua khỏi ví.'}
            </p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10">
            <X size={20} />
          </button>
        </div>
        {isWalletTransaction ? (
          <div className="space-y-4 p-6">
            <div role="group" aria-label="Loại giao dịch" className="grid grid-cols-2 gap-3">
              {(['deposit', 'withdraw'] as const).map(option => (
                <button key={option} type="button" aria-pressed={type === option || (option === 'deposit' && type !== 'withdraw')} onClick={() => setType(option)} className={`h-11 rounded-xl border text-sm font-bold ${type === option || (option === 'deposit' && type !== 'withdraw') ? 'border-[#00ab60] bg-[#00ab60] text-white' : 'border-slate-200 text-slate-500'}`}>
                  {personal ? PERSONAL_WALLET_LABEL[option] : option === 'deposit' ? 'Chuyển từ Ví vận hành' : 'Chuyển về Ví vận hành'}
                </button>
              ))}
            </div>
            <label className="block text-xs font-bold text-slate-600">Số tiền (VND)
              <input autoFocus required type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Nhập số tiền" className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-3 text-lg font-bold" />
            </label>
            <div role="group" aria-label="Chọn nhanh số tiền" className="flex flex-wrap gap-2">
              {([
                [500000, '500K'],
                [1000000, '1 triệu'],
                [2000000, '2 triệu'],
                [5000000, '5 triệu'],
                [10000000, '10 triệu']
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={Number(amount) === value}
                  disabled={saving}
                  onClick={() => { setAmount(String(value)); setError('') }}
                  className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${Number(amount) === value ? 'border-[#21d38a] bg-[#21d38a] text-[#052217]' : 'border-slate-200 text-slate-500 hover:border-[#21d38a]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="block text-xs font-bold text-slate-600">Ghi chú (không bắt buộc)
              <input value={note} onChange={event => setNote(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" />
            </label>
            <label className="block text-xs font-bold text-slate-600">Thời gian
              <input
                readOnly
                value={transaction ? `${formatDate(transaction.date)} · ${formatTime(transaction.date)}` : walletTime.toLocaleString('vi-VN')}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 tabular-nums"
              />
            </label>
            <p className="text-xs text-slate-500">Tự động ghi nhận thời gian khi lưu.</p>
          </div>
        ) : (isSecurity || isSavings) ? <div className={`grid gap-4 p-6 sm:grid-cols-2 ${isSecurity ? 'security-trade-body' : ''}`}>
          <div className={isSecurity ? 'security-trade-main' : 'contents'}>
          {isSecurity ? ((!initialType && !transaction) && <div className="flex gap-2 sm:col-span-2" role="group" aria-label="Thao tác mua bán">
            {(['buy', 'sell'] as const).map(value => <button type="button" key={value} aria-pressed={type === value} onClick={() => setType(value)} className={`h-10 flex-1 rounded-xl border text-sm font-bold ${type === value ? value === 'sell' ? 'border-[#e04444] bg-[#e04444] text-white' : 'border-[#21d38a] bg-[#21d38a] text-[#052217]' : 'border-slate-200 text-slate-500'}`}>{value === 'buy' ? 'Mua' : 'Bán'}</button>)}
          </div>) : <label className="text-xs font-bold text-slate-600">Thao tác
            <select value={type} disabled={isSavings && Boolean(holding)} onChange={e => setType(e.target.value as InvestmentTransactionType)} className="mt-2 h-11 w-full rounded-xl border px-3">
              <option value="buy">{isSavings ? 'Mở sổ tiết kiệm' : 'Mua'}</option>
              {(!isSavings || holding) && <option value="sell">{isSavings ? 'Tất toán sổ' : 'Bán'}</option>}
            </select>
          </label>
          }
          {(isSavings || securityOptions) && <label className="text-xs font-bold text-slate-600">{isSavings ? type === 'sell' ? 'Ngày tất toán' : 'Ngày gửi' : 'Ngày giao dịch'}
            <input required type="date" value={date.slice(0, 10)} onChange={e => setDate(e.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3" />
          </label>
          }
          {isSavings ? <>
            <label className="text-xs font-bold text-slate-600">Ngân hàng
              <input required list="savings-banks" disabled={type === 'sell'} value={bank} onChange={e => setBank(e.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3" />
              <datalist id="savings-banks">{['Vietcombank', 'Techcombank', 'BIDV', 'Agribank', 'VietinBank', 'MB Bank', 'VPBank', 'ACB', 'Sacombank', 'TPBank'].map(value => <option key={value} value={value} />)}</datalist>
            </label>
            <label className="text-xs font-bold text-slate-600">{type === 'sell' ? 'Số tiền thực nhận (gốc + lãi)' : 'Số tiền gửi (VND)'}
              <input required type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3" />
            </label>
            <label className="text-xs font-bold text-slate-600">Kỳ hạn
              <select disabled={type === 'sell'} value={term} onChange={e => setTerm(e.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3">{['Không kỳ hạn', '1 tháng', '3 tháng', '6 tháng', '9 tháng', '12 tháng', '18 tháng', '24 tháng', '36 tháng'].map(value => <option key={value}>{value}</option>)}</select>
            </label>
            <label className="text-xs font-bold text-slate-600">Lãi suất (%/năm)
              <input required disabled={type === 'sell'} type="number" min="0" max="100" step="0.01" value={rate} onChange={e => setRate(e.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3" />
            </label>
            {type !== 'sell' && <label className="text-xs font-bold text-slate-600 sm:col-span-2">Khi đáo hạn
              <select value={maturityAction} onChange={e => setMaturityAction(e.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3">
                <option value="tat_toan_ve_vi">Tất toán về ví</option><option value="goc_lai_tai_tuc">Tái tục gốc và lãi</option><option value="goc_tai_tuc_lai_ve_vi">Tái tục gốc, lãi về ví</option>
              </select>
            </label>}
            <p className="text-xs text-slate-500 sm:col-span-2">Đáo hạn: {type === 'sell' ? existingSavings?.maturityDate : savingsMaturity(date, term)} · Lãi dự kiến: {money(savingsInterest(type === 'sell' ? existingSavings?.principal || 0 : Number(amount), Number(rate), term))}. Khi tất toán, nhập đúng số tiền ngân hàng trả thực tế. Lựa chọn đáo hạn là thông tin theo dõi, không tự chuyển tiền.</p>
          </> : <>
            {category === 'stocks' && <div className="sm:col-span-2" role="group" aria-label="Loại tài sản">
              <p className="text-xs font-bold text-slate-600">Chọn tài sản</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([['CP', 'Cổ phiếu', TrendingUp], ['CCQ', 'Quỹ / ETF', BarChart3] ] as const).map(([value, label, Icon]) => (
                  <button key={value} type="button" aria-pressed={securityUnit === value} onClick={() => { setSecurityUnit(value); setSymbol(''); setName('') }} className={`security-asset-choice ${securityUnit === value ? 'selected' : ''}`}>
                    <Icon size={20} /><span>{label}</span>
                  </button>
                ))}
              </div>
            </div>}
            <div className="relative sm:col-span-2">
            <label className="block text-xs font-bold text-slate-600">{category === 'stocks' ? securityUnit === 'CCQ' ? 'Mã quỹ / ETF' : 'Mã cổ phiếu' : 'Mã quỹ trái phiếu'}
              <input required value={symbol} onChange={e => { setSymbol(e.target.value.toUpperCase()); setName('') }} placeholder="Nhập mã tài sản" aria-label="Nhập mã tài sản" className="mt-2 h-11 w-full rounded-xl border px-3" />
            </label>
            </div>
            <p className="h-4 truncate text-xs text-emerald-600 sm:col-span-2" title={name ? `${symbol} · ${name}` : undefined}>{name ? `${symbol} · ${name}` : '\u00a0'}</p>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 md:grid-cols-3" role="group" aria-label="Chọn nhanh mã tài sản">
              {(category === 'bonds' ? BOND_SUGGESTIONS : VN_STOCK_SUGGESTIONS.filter(item => (securityUnit === 'CCQ') === ['DCDS', 'VESF', 'VEOF', 'VF1', 'E1VFVN30', 'FUEVFVND'].includes(item.symbol))).slice(0, 6).map(item => <button type="button" key={item.symbol} aria-pressed={symbol === item.symbol} title={item.name} onClick={() => { setSymbol(item.symbol); setName(item.name) }} className={`security-symbol-choice ${symbol === item.symbol ? 'selected' : ''}`}><strong>{item.symbol}</strong><span>{item.name}</span></button>)}
            </div>
            {securityOptions && <div className="text-xs font-bold text-slate-600" role="group" aria-label="Cách nhập giá"><span>Cách nhập giá</span><div className="mt-2 flex gap-2"><button type="button" aria-pressed={priceMode === 'unit'} onClick={() => setPriceMode('unit')} className={`security-mode-choice ${priceMode === 'unit' ? 'selected' : ''}`}>Đơn giá / NAV</button><button type="button" aria-pressed={priceMode === 'total'} onClick={() => setPriceMode('total')} className={`security-mode-choice ${priceMode === 'total' ? 'selected' : ''}`}>Tổng tiền</button></div></div>
            }
            <div className="text-xs font-bold text-slate-600 sm:col-span-2">
              <label htmlFor="security-quantity">Số lượng ({category === 'bonds' ? 'CCQ' : securityUnit})</label>
              <div className="mt-2 flex gap-2">
                <button type="button" aria-label="Giảm số lượng" disabled={Number(quantity) <= 100} onClick={() => setQuantity(String(Math.max(100, (Number(quantity) || 100) - 100)))} className="h-11 w-12 rounded-xl border border-slate-200 text-xl disabled:opacity-40">−</button>
                <input id="security-quantity" required type="number" min="0.000001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-center text-lg" />
                <button type="button" aria-label="Tăng số lượng" onClick={() => setQuantity(String((Number(quantity) || 0) + 100))} className="h-11 w-12 rounded-xl border border-slate-200 text-xl">+</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">{[100, 200, 500, 1000].map(value => <button key={value} type="button" aria-pressed={Number(quantity) === value} onClick={() => setQuantity(String(value))} className={`rounded-lg border px-3 py-2 ${Number(quantity) === value ? 'border-[#21d38a] text-emerald-600' : 'border-slate-200'}`}>{value}</button>)}</div>
            </div>
            <div className="security-trade-price-row sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600">{priceMode === 'unit' ? category === 'stocks' && securityUnit === 'CP' ? 'Giá cổ phiếu hiện tại (VND/CP)' : 'Giá / NAV (VND/CCQ)' : 'Tổng tiền (VND)'}
                <input required disabled={quoteLoading && priceMode === 'unit'} type="number" min="0.01" step="any" value={priceMode === 'unit' ? unitPrice : amount} onChange={e => { if (priceMode === 'unit') { setUnitPrice(e.target.value); setQuoteMessage('Giá giao dịch do bạn nhập.') } else setAmount(e.target.value) }} className="mt-2 h-11 w-full rounded-xl border px-3" />
                <span className="mt-2 block font-normal text-slate-500">{quoteLoading ? 'Đang tải giá mới nhất...' : quoteMessage}</span>
              </label>
              <div className="security-trade-total">
                <p className="text-xs font-bold">{type === 'sell' ? 'Tổng tiền bán' : 'Tổng tiền mua'}</p>
                <p className="mt-1 text-xl font-black tabular-nums">{effectiveAmount > 0 ? money(effectiveAmount) : 'Chưa có giá'}</p>
              </div>
            </div>
            <button type="button" aria-expanded={securityOptions} onClick={() => setSecurityOptions(!securityOptions)} className="text-left text-xs font-bold text-emerald-600 sm:col-span-2">{securityOptions ? 'Thu gọn tùy chọn' : 'Tùy chọn khác'}</button>
            {securityOptions && <label className="text-xs font-bold text-slate-600 sm:col-span-2">Ghi chú (tùy chọn)<input value={note} onChange={e => setNote(e.target.value)} className="mt-2 h-11 w-full rounded-xl border px-3" /></label>}
          </>}
          </div>
          {isSecurity && <aside className="security-trade-summary rounded-2xl border p-5" aria-label="Tóm tắt giao dịch">
            <h3 className="mb-5 text-lg font-black">Tóm tắt giao dịch</h3>
            <div className="flex items-start gap-3">
              <div className="security-trade-symbol flex h-14 w-14 items-center justify-center rounded-xl text-lg font-black">{symbol || '—'}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{name || 'Chưa chọn mã tài sản'}</p>
                <p className="mt-1 text-xs opacity-70">{Number(quantity) || 0} {category === 'bonds' ? 'CCQ' : securityUnit} × {unitPrice ? money(Number(unitPrice)) : '—'}</p>
              </div>
            </div>
            <div className="my-5 border-t" />
            <p className="text-xs font-bold">Ví đầu tư · {money(walletSummary.availableBalance)}</p>
            <div className="hidden" role="group" aria-label="Chọn ví thanh toán">
              {([['transfer', 'Ngân hàng', Landmark, walletSummary.bankBalance], ['cash', 'Tiền mặt', WalletCards, walletSummary.cashBalance]] as const).map(([method, label, Icon, balance]) => (
                <button key={method} type="button" aria-pressed={paymentMethod === method} onClick={() => setPaymentMethod(method)} className={`security-wallet-choice ${paymentMethod === method ? 'selected' : ''}`}>
                  <Icon size={22} />
                  <span>{label}</span>
                  <strong>{money(balance)}</strong>
                </button>
              ))}
            </div>
            <div className="mt-5 border-t pt-4">
              <p className="text-xs opacity-70">{type === 'sell' ? 'Tổng tiền bán' : 'Tổng thanh toán'}</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{effectiveAmount > 0 ? money(effectiveAmount) : 'Chưa có giá'}</p>
              <p className="mt-1 text-xs opacity-70">Số dư Ví đầu tư sau giao dịch: {money(Math.max(0, walletSummary.totalBalance + (type === 'sell' ? effectiveAmount : -effectiveAmount)))}</p>
            </div>
            <p className="mt-5 text-xs opacity-70">Ngày ghi nhận: {formatDate(date)}</p>
            {error && <p role="alert" className="mt-3 text-xs font-bold text-rose-400">{error}</p>}
            {fundingError && <p role="alert" className="mt-3 text-xs font-bold text-rose-400">{fundingError}</p>}
            {purchaseShortfall > 0 && !fundingError && personal && <p role="status" className="mt-3 text-xs font-bold">Ví đầu tư thiếu {money(purchaseShortfall)}. Khi lưu, phần thiếu được ghi là nạp tiền từ bên ngoài.</p>}
            {purchaseShortfall > 0 && !fundingError && !personal && <p role="status" className="mt-3 text-xs font-bold">Ví đầu tư thiếu {money(purchaseShortfall)}. Khi lưu, bạn sẽ được hỏi xác nhận chuyển phần thiếu từ Ví phòng trọ.</p>}
            <div className="security-trade-actions mt-6 flex gap-2">
              <button type="button" onClick={onClose} className="h-11 rounded-xl border px-4 text-sm font-bold">Hủy</button>
              <button type="submit" disabled={saving || Boolean(fundingError) || quoteLoading || effectiveAmount <= 0} className="h-11 flex-1 rounded-xl px-4 text-sm font-black disabled:opacity-50">{saving ? 'Đang lưu...' : type === 'sell' ? 'Xác nhận bán' : 'Xác nhận mua'}</button>
            </div>
          </aside>}
        </div> : <div className="grid gap-4 p-6 sm:grid-cols-2">
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
                  {labelFor(key, personal)}
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
        </div>}
        {!isSecurity && <div className="px-6 pb-3 text-xs">
          {isWalletTransaction && personal && <label className="font-bold">Hình thức
            <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as FundingMethod)} className="ml-2 rounded-lg border p-2">
              <option value="transfer">Chuyển khoản</option>
              <option value="cash">Tiền mặt</option>
            </select>
          </label>}
          {isWalletTransaction && !personal && <label className="font-bold">{type === 'withdraw' ? 'Tài khoản vận hành nhận tiền' : 'Tài khoản vận hành chuyển vốn'}
            <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as FundingMethod)} className="ml-2 rounded-lg border p-2">
              <option value="transfer">Ngân hàng · {money(operatingWalletSummary.bankBalance)}</option>
              <option value="cash">Tiền mặt · {money(operatingWalletSummary.cashBalance)}</option>
            </select>
          </label>}
          {personal ? <p className="mt-2">Khả dụng ví đầu tư: {money(walletSummary.availableBalance)}.{isWalletTransaction ? (type === 'withdraw' ? ' Tiền rút ra ngoài, không ghi vào sổ phòng trọ.' : ' Tiền nạp từ bên ngoài, không ghi vào sổ phòng trọ.') : type === 'sell' ? ' Tiền bán sẽ được cộng vào ví đầu tư.' : ' Tiền mua sẽ được trừ từ ví đầu tư.'}</p> : <p className="mt-2">{isWalletTransaction && type === 'deposit' ? 'Khả dụng ví vận hành' : 'Khả dụng ví đầu tư'}: {money(isWalletTransaction && type === 'deposit' ? operatingWalletSummary.availableBalance : walletSummary.availableBalance)}.{!isWalletTransaction && (type === 'sell' ? ' Tiền bán sẽ được cộng vào ví đầu tư.' : ' Tiền mua sẽ được trừ từ ví đầu tư.')}</p>}
          {error && <p role="alert" className="mt-2 font-bold text-rose-600">{error}</p>}
          {fundingError && <p role="alert" className="mt-2 font-bold text-rose-600">{fundingError}</p>}
          {purchaseShortfall > 0 && !fundingError && personal && <p role="status" className="mt-2 font-bold text-amber-700">Ví đầu tư thiếu {money(purchaseShortfall)}. Khi lưu, phần thiếu được ghi là nạp tiền từ bên ngoài.</p>}
          {purchaseShortfall > 0 && !fundingError && !personal && <p role="status" className="mt-2 font-bold text-amber-700">Ví đầu tư thiếu {money(purchaseShortfall)}. Khi lưu, bạn sẽ được hỏi xác nhận chuyển phần thiếu từ Ví phòng trọ.</p>}
        </div>}
        {!isSecurity && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600"
          >
            Hủy
          </button>
          <button disabled={saving || Boolean(fundingError) || (isSecurity && quoteLoading)} className={`h-10 rounded-xl px-5 text-xs font-black text-white disabled:opacity-50 ${type === 'sell' ? 'bg-[#e04444] hover:bg-[#c93636]' : 'bg-[#00ab60]'}`}>
            {saving ? 'Đang lưu...' : isSecurity ? type === 'sell' ? 'Xác nhận bán' : 'Xác nhận mua' : isSavings ? type === 'sell' ? 'Xác nhận tất toán' : transaction ? 'Lưu sổ tiết kiệm' : 'Mở sổ tiết kiệm' : 'Lưu giao dịch'}
          </button>
        </div>}
      </form>
    </div>
  )
}

function InvestmentSummaryStrip({
  value,
  gain,
  cash
}: {
  value: number
  gain: number
  cash: number
}) {
  const base = value - gain
  const percent = base > 0 ? gain / base * 100 : 0
  const items = [
    { label: 'Tổng giá trị', value: money(value), icon: BarChart3 },
    { label: 'Lãi/lỗ', value: `${gain >= 0 ? '+' : '-'}${money(Math.abs(gain))} (${gain >= 0 ? '+' : ''}${percent.toFixed(2)}%)`, icon: TrendingUp, positive: true },
    { label: 'Tiền chờ đầu tư', value: money(cash), icon: WalletCards }
  ]
  return <section className="investment-summary-strip" aria-label="Tóm tắt danh mục đầu tư">
    {items.map(({ label, value: displayValue, icon: Icon, positive }) => <div key={label} className="investment-summary-item">
      <span className="investment-summary-icon"><Icon size={18} /></span>
      <div className="min-w-0">
        <span className="investment-summary-label">{label}</span>
        <strong className={positive ? 'positive' : ''}>{displayValue}</strong>
      </div>
    </div>)}
  </section>
}

function SecurityHoldingsPanel({
  rows,
  title,
  accent,
  onBuy,
  onSell
}: {
  rows: InvestmentHolding[]
  title: string
  accent: string
  onBuy: () => void
  onSell: (holding: InvestmentHolding) => void
}) {
  return <section className="security-holdings-panel" style={{ '--security-accent': accent } as CSSProperties}>
    <div className="security-holdings-heading">
      <div><h2>{title} đang nắm giữ</h2><p>Danh mục tài sản hiện có và giá trị đang theo dõi</p></div>
      <button type="button" onClick={onBuy}><Plus size={16} />Mua thêm</button>
    </div>
    {rows.length ? <div className="security-holdings-table-wrap"><table><thead><tr><th>Tài sản</th><th>Số lượng</th><th>Giá trị</th><th>P/L</th><th /></tr></thead><tbody>{rows.map(row => <tr key={row.symbol}>
      <td><strong>{row.symbol}</strong><small>{row.name}</small></td>
      <td>{row.quantity}</td>
      <td><strong>{money(row.valueVnd)}</strong></td>
      <td className={row.pnlPercent >= 0 ? 'positive' : 'negative'}>{row.pnlPercent >= 0 ? '+' : ''}{row.pnlPercent.toFixed(2)}%</td>
      <td><div className="security-holdings-actions"><button type="button" onClick={() => onBuy()}>Mua</button><button type="button" onClick={() => onSell(row)}>Bán</button></div></td>
    </tr>)}</tbody></table></div> : <div className="security-holdings-empty"><p>Chưa có {title.toLowerCase()} đang nắm giữ</p><button type="button" onClick={onBuy}><Plus size={16} />Thêm tài sản đầu tiên</button></div>}
  </section>
}

export function InvestmentsTab({ userRole, portfolio = 'property' }: { userRole?: string; portfolio?: InvestmentPortfolio }): ReactElement {
  const personal = portfolio === 'personal'
  const queryClient = useQueryClient()
  const { requirePassword, passwordConfirmation } = usePasswordConfirmation({ tone: 'bank' })
  const { confirm: confirmAction, confirmDialog } = useInvestmentConfirm()
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
  const [loadError, setLoadError] = useState('')
  const pendingLoad = useRef<Promise<void> | null>(null)
  const loadMounted = useRef(false)
  const [source, setSource] = useState<string>()
  const [localImport, setLocalImport] = useState<InvestmentStore | null>(null)
  const [importing, setImporting] = useState(false)
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
  const [goldTradeMode, setGoldTradeMode] = useState<'buy' | 'sell' | 'import' | null>(null)
  const [goldPortfolioTab, setGoldPortfolioTab] = useState<GoldPortfolioTab>('holdings')
  const [goldPrices, setGoldPrices] = useState<MyHanhGoldPrices | null>(null)
  const [goldTradeNotice, setGoldTradeNotice] = useState<string | null>(null)
  useEffect(() => {
    setGoldTradeNotice(null)
    if (screen === 'gold') setGoldPortfolioTab('holdings')
  }, [screen])
  useEffect(() => {
    if (!goldTradeNotice) return
    const timeout = window.setTimeout(() => setGoldTradeNotice(null), 6000)
    return () => window.clearTimeout(timeout)
  }, [goldTradeNotice])
  const [operatingSummary, setWalletSummary] = useState<WalletBalanceSummary>({
    bankBalance: 0,
    cashBalance: 0,
    totalBalance: 0,
    availableBalance: 0,
    entries: []
  })
  const fundBalance = useMemo(() => investmentBalance(store), [store])
  const walletSummary = useMemo<WalletBalanceSummary>(() => ({
    bankBalance: fundBalance, cashBalance: fundBalance,
    totalBalance: fundBalance, availableBalance: Math.max(0, fundBalance),
    entries: store.transactions.filter(tx => tx.fundingSource === 'investment-wallet').map(tx => ({
      id: tx.id, date: tx.occurredAt || tx.date, title: labelFor(tx.transactionType, personal),
      amount: Math.abs(tx.walletPosting?.amount || 0),
      type: (tx.walletPosting?.amount || 0) < 0 ? 'expense' : 'income',
      paymentMethod: tx.walletPosting?.paymentMethod || 'cash', source: 'Ví đầu tư'
    }))
  }), [store, fundBalance])
  const load = useCallback((forceRefresh = false): Promise<void> => {
    if (savingTransaction.current) return Promise.resolve()
    if (pendingLoad.current) return pendingLoad.current
    setLoading(true)
    setLoadError('')
    const task = (async () => {
      try {
        const [result, nextWalletSummary] = await Promise.all([
          readInvestmentStore(portfolio),
          // DBY Finance never touches the rental operating wallet.
          personal ? Promise.resolve<WalletBalanceSummary>({ bankBalance: 0, cashBalance: 0, totalBalance: 0, availableBalance: 0, entries: [] }) : readCachedWalletBalanceSummary(queryClient, forceRefresh)
        ])
        if (!loadMounted.current) return
        setStore(result.data)
        setSource(result.importedFrom)
        // Offer the legacy Windows portfolio only while the shared cloud one
        // is still empty; afterwards the cloud is the single source of truth.
        const local = !personal && isInvestmentStoreEmpty(result.data) ? await readLocalInvestmentStore().catch(() => null) : null
        if (loadMounted.current) setLocalImport(local && !isInvestmentStoreEmpty(local) ? local : null)
        setWalletSummary(nextWalletSummary)
      } catch (cause) {
        if (loadMounted.current) setLoadError(cause instanceof Error ? cause.message : 'Không tải được danh mục đầu tư.')
      } finally {
        pendingLoad.current = null
        if (loadMounted.current) setLoading(false)
      }
    })()
    pendingLoad.current = task
    return task
  }, [queryClient, portfolio, personal])
  useEffect(() => {
    loadMounted.current = true
    void load()
    return () => { loadMounted.current = false }
  }, [load])
  useEffect(() => {
    if (personal) return
    let active = true
    const refreshWallet = () => {
      if (savingTransaction.current) return
      void readCachedWalletBalanceSummary(queryClient).then(summary => { if (active && !savingTransaction.current) setWalletSummary(summary) }).catch(() => {})
    }
    const timer = window.setInterval(refreshWallet, 30000)
    window.addEventListener('focus', refreshWallet)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refreshWallet) }
  }, [queryClient, personal])
  useEffect(() => {
    const stored = Number(window.localStorage.getItem('dbyfinance-wealth-goal'))
    if (Number.isFinite(stored) && stored > 0) setWealthGoal(stored)
  }, [])
  const goldValuations = useMemo(() => Object.fromEntries(store.holdings
    .filter(item => item.category === 'gold')
    .map(item => [item.symbol, valueGoldHolding(item, goldPrices)])), [store.holdings, goldPrices])
  const holdings = useMemo(() => {
    const nonCashHoldings = store.holdings.filter(
      (item) => item.valueVnd > 0 && item.symbol.toUpperCase() !== 'CASH'
    ).map(item => {
      const mark = goldValuations[item.symbol]
      return mark?.valueVnd !== null && mark?.valueVnd !== undefined
        ? { ...item, valueVnd: mark.valueVnd, pnlPercent: mark.pnlPercent ?? 0 } : item
    })
    if (nonCashHoldings.length === 0 && walletSummary.availableBalance <= 0) return []
    const walletHolding: InvestmentHolding = {
      symbol: 'CASH',
      name: 'Ví đầu tư',
      category: 'cash',
      group: 'Ví thanh toán',
      valueVnd: walletSummary.availableBalance,
      quantity: `${compactMoney(walletSummary.availableBalance)} VND`,
      allocationPercent: 0,
      targetPercent: store.categoryTargets?.cash ?? 0,
      pnlPercent: 0
    }
    const portfolio = [
      ...nonCashHoldings,
      ...(walletSummary.availableBalance > 0 ? [walletHolding] : [])
    ]
    const totalValue = portfolio.reduce((sum, item) => sum + item.valueVnd, 0)
    return portfolio.map(item => ({ ...item, allocationPercent: totalValue > 0 ? item.valueVnd / totalValue * 100 : 0 }))
  }, [store.categoryTargets, store.holdings, walletSummary.availableBalance, goldValuations])
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
      return transactions.filter(tx => tx.fundingSource === 'investment-wallet')
    }
    return transactionsForCategory(transactions, store.holdings, screen)
  }, [screen, transactions, store.holdings, walletSummary.entries])
  const total = holdings.reduce((sum, item) => sum + item.valueVnd, 0)
  const gain = holdings.reduce((sum, item) => {
    const denominator = 1 + item.pnlPercent / 100
    return sum + (denominator > 0 ? item.valueVnd - item.valueVnd / denominator : 0)
  }, 0)
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
    if (loading || loadError) throw new Error('Danh mục chưa tải thành công. Hãy bấm Thử lại trước khi ghi dữ liệu.')
    await writeInvestmentStore(next, portfolio)
    setStore(next)
  }
  const importLocalPortfolio = async () => {
    if (!localImport || importing || loading || savingTransaction.current) return
    if (!await confirmAction({ title: 'Đưa danh mục lên cloud', confirmLabel: 'Đưa lên', message: `Đưa ${localImport.holdings.length} tài sản và ${localImport.transactions.length} giao dịch trên máy này lên danh mục chung (Electron + PWA)? Không thu/chi tiền lần nữa vì Ví đã ghi khi giao dịch.` })) return
    setTransactionError('')
    setImporting(true)
    savingTransaction.current = true
    try {
      await requirePassword('Đưa danh mục lên cloud')
      const snapshot = await importLocalInvestmentStore({ ...localImport, pwaVersion: store.pwaVersion })
      setStore(snapshot.data)
      setLocalImport(null)
      setSource('máy tính này')
    } catch (error) {
      setTransactionError(error instanceof Error ? error.message : 'Không đưa được danh mục lên cloud. Hãy kiểm tra quyền quản trị.')
    } finally {
      setImporting(false)
      savingTransaction.current = false
    }
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
    // DBY Finance may record assets owned before the app (no wallet movement).
    // The rental portfolio keeps its rule that every new asset is bought from the wallet.
    const importing = input.type === 'import-existing'
    if (importing && (!personal || (oldTx && oldTx.transactionType !== 'import-existing'))) throw new Error('Chỉ DBY Finance được nhập tài sản đang có, và không đổi được giao dịch mua/bán thành nhập.')
    if (importing && (!Number.isSafeInteger(input.amount) || input.amount <= 0)) throw new Error('Nhập giá vốn lớn hơn 0.')
    const walletImpact = importing ? 0 : investmentWalletImpact(input.type, input.amount)
    const savingsMeta = input.category === 'savings' ? readSavings(input.note) : undefined
    if (input.category === 'savings' && (!savingsMeta || !savingsMeta.bank || !Number.isFinite(savingsMeta.rate) || savingsMeta.rate < 0 || savingsMeta.rate > 100)) throw new Error('Thông tin sổ tiết kiệm không hợp lệ.')
    if (!['cash', 'transfer'].includes(input.paymentMethod)) throw new Error('Chọn ví thanh toán hợp lệ.')
    let assetValueImpact = input.type === 'buy' || importing ? input.amount : 0
    if ((input.type === 'buy' || importing) && (!Number.isFinite(input.quantity) || input.quantity <= 0)) throw new Error('Nhập số lượng tài sản lớn hơn 0.')
    if ((input.type === 'buy' || input.type === 'sell' || importing) && (input.category === 'cash' || input.symbol.toUpperCase() === 'CASH')) {
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
        fundingSource: 'investment-wallet' as const,
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
    if (savingsMeta) {
      const book = nextHoldingsMap.get(normalizedSymbol.toUpperCase())
      if (book) nextHoldingsMap.set(normalizedSymbol.toUpperCase(), { ...book, name: input.name, quantity: JSON.stringify(savingsMeta), group: savingsMeta.status === 'settled' ? 'Đã tất toán' : 'Đang gửi', valueVnd: savingsMeta.status === 'settled' ? 0 : savingsMeta.principal })
    }
    const nextHoldings = Array.from(nextHoldingsMap.values())
    await commitWalletChange(oldTx, newTx, { ...store, holdings: nextHoldings, transactions: nextTransactions })
    setModal(null)
    } finally { savingTransaction.current = false }
  }
  const commitWalletChange = async (previous: InvestmentTransaction | undefined, next: InvestmentTransaction | undefined, nextStore: InvestmentStore) => {
    if (loading || loadError) throw new Error('Danh mục chưa tải thành công. Hãy bấm Thử lại trước khi ghi giao dịch.')
    if (previous && previous.fundingSource !== 'investment-wallet' && (userRole !== 'admin' || next)) throw new Error('Giao dịch cũ thuộc Ví vận hành: chỉ admin được hoàn tác sau đối soát.')
    // Opening/restarting Electron does not refresh the server's write approval.
    // Complete the existing password step-up before any posting or persistence;
    // cancellation must leave both wallets and the portfolio untouched.
    await requirePassword('Ghi giao dịch đầu tư')
    if (personal) {
      // DBY Finance has no operating wallet. A purchase larger than the fund is
      // recorded together with an external deposit for exactly the shortfall.
      let finalStore = nextStore
      const balance = investmentBalance(nextStore)
      if (!Number.isFinite(balance)) throw new Error('Số dư Ví đầu tư không hợp lệ. Hãy tải lại rồi thử lại.')
      if (balance < 0) {
        const shortfall = -balance
        if (!next || next.transactionType !== 'buy' || shortfall > next.amountVnd) throw new Error(personalShortfallMessage(shortfall))
        const deposit: InvestmentTransaction = {
          id: `TX-EXTFUND-${crypto.randomUUID()}`, date: next.date, occurredAt: new Date().toISOString(),
          transactionType: 'deposit', assetSymbol: 'CASH', amountVnd: shortfall, status: 'done',
          note: `Nạp tiền từ bên ngoài để mua ${next.assetSymbol}`, linkedAssetSymbol: next.assetSymbol,
          fundingSource: 'investment-wallet', walletPosting: { paymentMethod: next.walletPosting?.paymentMethod || 'transfer', amount: shortfall },
          walletImpactVnd: shortfall, assetValueImpactVnd: 0, quantity: 0, unit: 'VND'
        }
        finalStore = { ...nextStore, transactions: [...nextStore.transactions, deposit] }
      }
      await persist(finalStore)
      return
    }
    // The shared cloud commit derives operating-wallet movements in one server
    // transaction; never post receipts client-side, or the other app can't see them.
    // Funding still validates and rechecks the exact shortfall before posting.
    const prepared = await prepareInvestmentPurchase({ next, nextStore, readOperating: getWalletBalanceSummary, confirm: () => true })
    await persist(prepared.store)
    void queryClient.invalidateQueries({ queryKey: ['cashTransactions'] })
    try { setWalletSummary(await getWalletBalanceSummary()) } catch {
      setTransactionError('Đã lưu giao dịch. Chưa tải lại được số dư Ví; hãy bấm Làm mới.')
    }
  }
  const deleteTransaction = async (tx: InvestmentTransaction) => {
    if (savingTransaction.current) return
    if (tx.fundingSource !== 'investment-wallet' && userRole !== 'admin') {
      setTransactionError('Chỉ admin được xóa giao dịch cũ thuộc Ví vận hành.')
      return
    }
    if (!await confirmAction({ title: 'Xóa giao dịch', confirmLabel: 'Xóa giao dịch', danger: true, message: `Xóa giao dịch ${labelFor(tx.transactionType, personal)} ${tx.assetSymbol} (${money(tx.amountVnd)})? Hệ thống sẽ hoàn tác tài sản và tiền ở ${tx.fundingSource === 'investment-wallet' ? 'Ví đầu tư' : 'Ví vận hành'}.` })) return
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
      const savings = readSavings(holding.quantity)
      nextHoldingsMap.set(tx.assetSymbol.toUpperCase(), { ...holding, quantity: savings ? JSON.stringify({ ...savings, status: nextQuantity > 0 ? 'active' : 'settled', settleDate: undefined, settleAmount: undefined }) : `${Math.max(0, nextQuantity)} ${tx.unit || 'đơn vị'}`, valueVnd: nextQuantity === 0 ? 0 : holding.valueVnd })
    }
    await commitWalletChange(tx, undefined, { ...store, holdings: Array.from(nextHoldingsMap.values()), transactions: store.transactions.filter((item) => item.id !== tx.id) })
    } catch (cause) {
      if (!(cause instanceof Error && cause.message === 'Đã hủy thao tác.')) setTransactionError(cause instanceof Error ? cause.message : 'Không thể xóa giao dịch.')
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
    if (holding?.category === 'savings' && lowered.includes('chỉnh sửa')) {
      const original = store.transactions.find(tx => {
        if (tx.assetSymbol.trim().toUpperCase() === holding.symbol.trim().toUpperCase()) return tx.transactionType === 'buy' || tx.transactionType === 'import-existing'
        if (tx.transactionType !== 'buy' && tx.transactionType !== 'import-existing') return false
        try {
          const note = readSavings(tx.note)
          const meta = readSavings(holding.quantity)
          return Boolean(note && meta && note.bank === meta.bank && note.principal === meta.principal)
        } catch { return false }
      })
      if (!original) { setTransactionError('Sổ cũ chưa có giao dịch mở sổ để đối soát.'); return }
      setModal({ holding, transaction: original, forceTransaction: true })
      return
    }
    const initialType: InvestmentTransactionType = lowered.includes('bán') || lowered.includes('sell') ? 'sell' : 'buy'
    setModal({ holding, initialType, forceTransaction: lowered.includes('bán') || lowered.includes('mua vào') })
  }
  if (loadError) return (
    <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900" role="alert">
      <h2 className="font-bold">Chưa tải được danh mục đầu tư</h2>
      <p className="mt-2 text-sm">{loadError}</p>
      <button type="button" onClick={() => void load(true)} className="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-bold">
        Thử lại
      </button>
    </div>
  )
  return (
    <div className={`pwa-investments-screen investment-dark flex min-h-0 flex-1 overflow-hidden bg-[#0b111b]${screen === 'gold' ? ' investment-gold-screen' : ''}`}>
      <aside className="hidden w-[220px] shrink-0 border-r border-[#20364f] bg-[#0b1727] p-3 text-white xl:block">
        <div className="mb-5 px-3 pt-3">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-emerald-200/70">
            {personal ? 'DBY Finance' : 'Tài chính'}
          </p>
          <h2 className="mt-1 text-lg font-black text-white">{personal ? 'Danh mục cá nhân' : 'Danh mục đầu tư'}</h2>
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
        <div className="mx-auto max-w-[1480px] space-y-3.5">
          <header className={`flex flex-wrap items-center justify-between gap-3${screen === 'gold' ? ' gold-page-heading' : ''}`}>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#00ab60]">
                {personal ? 'DBY Finance · Đầu tư cá nhân' : 'Tài chính · Đầu tư'}
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#15231d]">
                {screen === 'overview'
                  ? 'Tổng quan tài sản'
                  : screen === 'transactions'
                    ? 'Sổ giao dịch'
                    : categoryMeta[screen].label}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {screen === 'gold' ? 'Theo dõi giá trị và hiệu suất danh mục.' : 'Theo dõi giá trị, hiệu suất và tỷ trọng danh mục trên cùng một màn hình.'}
              </p>
            </div>
            {screen === 'gold' && <div className="gold-page-actions">
              <button type="button" className="gold-action-buy" onClick={() => setGoldTradeMode('buy')}><Plus size={16} />Mua vàng</button>
              <button type="button" className="gold-action-sell" onClick={() => setGoldTradeMode('sell')}><Minus size={16} />Bán vàng</button>
              {personal && <button type="button" className="gold-action-import" onClick={() => setGoldTradeMode('import')}><PackagePlus size={16} />Nhập vàng đang có</button>}
              <button type="button" onClick={() => {
                setGoldPortfolioTab('history')
                window.requestAnimationFrame(() => {
                  const panel = document.getElementById('investment-category-history')
                  panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                  panel?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true })
                })
              }}><Clock3 size={16} />Lịch sử giao dịch ({categoryTransactions.length})</button>
            </div>}
            {screen === 'stocks' && (
              <div className="investment-page-actions flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModal({ initialType: 'buy', forceTransaction: true })}
                  className="rounded-xl bg-[#00ab60] px-4 py-2 text-xs font-black text-white transition hover:bg-[#009252] shadow-sm"
                >
                  <Plus size={16} />Mua cổ phiếu
                </button>
                <button
                  type="button"
                  onClick={() => setModal({ holding: visibleHoldings[0], initialType: 'sell', forceTransaction: true })}
                  disabled={!visibleHoldings.length}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 shadow-sm"
                >
                  <Minus size={16} />Bán cổ phiếu
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('transactions')}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 shadow-sm"
                >
                  <Clock3 size={16} />Giao dịch
                </button>
              </div>
            )}
            {screen === 'bonds' && (
              <div className="investment-page-actions flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModal({ initialType: 'buy', forceTransaction: true })}
                  className="rounded-xl bg-[#00ab60] px-4 py-2 text-xs font-black text-white transition hover:bg-[#009252] shadow-sm"
                >
                  <Plus size={16} />Mua trái phiếu
                </button>
                <button
                  type="button"
                  onClick={() => setModal({ holding: visibleHoldings[0], initialType: 'sell', forceTransaction: true })}
                  disabled={!visibleHoldings.length}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 shadow-sm"
                >
                  <Minus size={16} />Bán trái phiếu
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('transactions')}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 shadow-sm"
                >
                  <Clock3 size={16} />Giao dịch
                </button>
              </div>
            )}
            {screen === 'transactions' && (
              <div className="flex gap-2">
                <button
                  onClick={() => void load(true)}
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
          <div className="investment-category-tabs flex gap-2 overflow-x-auto pb-1 xl:hidden">
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
          {userRole === 'admin' && localImport && isInvestmentStoreEmpty(store) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#26364a] p-3 text-sm text-[#9cafc5]">
            <p>Máy này còn {localImport.transactions.length} giao dịch chưa có trong danh mục chung với PWA. Đưa lên một lần; Ví vận hành không bị trừ lại.</p>
            <button type="button" onClick={() => void importLocalPortfolio()} disabled={loading || importing} className="min-h-11 shrink-0 rounded-lg border border-[#21d38a] px-3 text-xs font-bold text-[#21d38a] disabled:opacity-50">{importing ? 'Đang đưa lên...' : 'Đưa lên danh mục chung'}</button>
          </div>}
          {source && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800">
              Đã đưa danh mục từ {source} lên cloud. Electron và PWA giờ dùng chung một danh mục.
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
                Ví đầu tư đang trống
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">
                {personal ? 'Chưa có vốn trong Ví đầu tư. Hãy nạp vốn từ bên ngoài để bắt đầu mua tài sản.' : 'Chưa có vốn trong Ví đầu tư. Hãy chuyển tiền từ Ví vận hành để bắt đầu mua tài sản.'}
              </p>
              <button type="button" onClick={() => setScreen('cash')} className="mt-5 rounded-xl bg-[#00ab60] px-4 py-2 text-sm font-black text-white">
                {personal ? 'Nạp tiền vào Ví đầu tư' : 'Chuyển vốn sang Ví đầu tư'}
              </button>
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
                    <table className="w-full min-w-[900px] table-fixed text-left">
                      <colgroup><col /><col style={{ width: 140 }} /><col style={{ width: 150 }} /><col style={{ width: 160 }} /><col style={{ width: 110 }} /><col style={{ width: 64 }} /></colgroup>
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
                          const savings = item.category === 'savings' ? readSavings(item.quantity) : undefined
                          const description = item.category === 'savings'
                            ? savings ? `${savings.term} · ${savings.rate}%/năm · ${savings.status === 'settled' ? 'Đã tất toán' : 'Đang gửi'}` : 'Sổ tiết kiệm'
                            : `${item.symbol} · ${item.quantity}`
                          const percent = total ? (item.valueVnd / total) * 100 : 0
                          return (
                            <tr key={item.symbol} className="hover:bg-emerald-50/30">
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <span
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                                    style={{ background: meta.color }}
                                  >
                                    <meta.icon size={17} />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-[#15231d]" title={item.name}>{item.name}</p>
                                    <p className="mt-0.5 text-xs text-slate-400" title={description}>
                                      {description}
                                    </p>
                                    {savings && <p className="mt-1 text-xs text-slate-400">Đáo hạn: {formatDate(savings.maturityDate)}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-4 text-xs font-bold text-slate-500">
                                {meta.label}
                              </td>
                              <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-black tabular-nums text-slate-800">
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
                                  type="button"
                                  onClick={() => item.category === 'savings' ? openTrade(item.symbol, 'Chỉnh sửa') : setModal({ holding: item })}
                                  className="investment-row-action"
                                  title="Chỉnh sửa"
                                  aria-label={`Chỉnh sửa ${item.symbol}`}
                                >
                                  <Pencil size={14} />
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
                   {screen === 'gold' && <div className="investment-tracker-copy"><GoldTracker onPricesChange={setGoldPrices} /></div>}
                   {screen === 'stocks' && <div className="investment-tracker-copy">
                     <InvestmentSummaryStrip
                       value={visibleHoldings.reduce((sum, item) => sum + item.valueVnd, 0)}
                       gain={visibleHoldings.reduce((sum, item) => {
                         const denominator = 1 + item.pnlPercent / 100
                         return sum + (denominator > 0 ? item.valueVnd - item.valueVnd / denominator : 0)
                       }, 0)}
                       cash={fundBalance}
                     />
                     <StockTracker holdings={visibleHoldings} selectedSymbol={selectedAssetSymbol} onSelectSymbol={setSelectedAssetSymbol} transactions={categoryTransactions} />
                   </div>}
                   {screen === 'bonds' && <div className="investment-tracker-copy"><BondTracker holdings={visibleHoldings} selectedSymbol={selectedAssetSymbol} onSelectSymbol={setSelectedAssetSymbol} transactions={categoryTransactions} /></div>}
                   {screen === 'savings' && <div className="investment-tracker-copy"><SavingsTracker holdings={savingsTrackerHoldings} transactions={savingsTrackerTransactions} onOpenModal={openTrade} onRefresh={load} onDeleteTransaction={(id) => { const tx = store.transactions.find((item) => item.id === id); if (tx) void deleteTransaction(tx) }} /></div>}
                  {screen === 'cash' && <InvestmentWalletPanel
                    title={personal ? 'Ví đầu tư cá nhân' : 'Quỹ đầu tư phòng trọ'}
                    balance={walletSummary.availableBalance}
                    transactions={categoryTransactions}
                    depositLabel={personal ? PERSONAL_WALLET_LABEL.deposit : 'Chuyển vốn từ Ví vận hành'}
                    withdrawLabel={personal ? PERSONAL_WALLET_LABEL.withdraw : 'Chuyển về Ví vận hành'}
                    footnote={personal ? 'Tiền nạp và rút với bên ngoài, không liên quan sổ phòng trọ. Mua trừ ví; bán và tất toán trả về ví.' : 'Quỹ riêng, chỉ dùng vốn đã chuyển từ Ví vận hành. Mua trừ quỹ; bán và tất toán trả về quỹ. Giao dịch cũ không được tính lại vào số dư này.'}
                    describe={(tx) => tx.transactionType === 'buy' || tx.transactionType === 'sell' ? `${labelFor(tx.transactionType, personal)} · ${tx.assetSymbol}` : labelFor(tx.transactionType, personal)}
                    note={(tx) => displayNote(tx.note)}
                    onDeposit={() => setModal({ initialType: 'deposit' })}
                    onWithdraw={() => setModal({ initialType: 'withdraw' })}
                  />}
                 </>
              )}
              {screen === 'stocks' && <SecurityHoldingsPanel rows={visibleHoldings} title="Cổ phiếu & Quỹ" accent="#21d38a" onBuy={() => setModal({ initialType: 'buy', forceTransaction: true })} onSell={(holding) => setModal({ holding, initialType: 'sell', forceTransaction: true })} />}
              {screen === 'bonds' && <SecurityHoldingsPanel rows={visibleHoldings} title="Trái phiếu" accent="#60a5fa" onBuy={() => setModal({ initialType: 'buy', forceTransaction: true })} onSell={(holding) => setModal({ holding, initialType: 'sell', forceTransaction: true })} />}
              {screen === 'gold' && <GoldPortfolioPanel tab={goldPortfolioTab} onTabChange={setGoldPortfolioTab} rows={visibleHoldings} valuations={goldValuations} transactions={categoryTransactions} holdings={store.holdings} onAdd={() => setGoldTradeMode('buy')} onTrade={(holding, initialType) => {
                if (holding.symbol.toUpperCase() === 'MH9999') {
                  setGoldTradeMode(initialType)
                } else setModal({ holding, initialType, forceTransaction: true })
              }} onEdit={(transaction) => setModal({ transaction, holding: store.holdings.find((holding) => holding.symbol === transaction.assetSymbol) })} onDelete={(transaction) => void deleteTransaction(transaction)} />}
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
                                {tx.assetSymbol} · {labelFor(tx.transactionType, personal)}
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
                              type="button"
                              className="investment-row-action"
                              title="Sửa giao dịch"
                              aria-label="Sửa giao dịch"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => void deleteTransaction(tx)}
                              type="button"
                              className="investment-row-action investment-row-action--danger"
                              title="Xóa giao dịch"
                              aria-label="Xóa giao dịch"
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
      {passwordConfirmation}
      {confirmDialog}
      <InvestmentPortfolioContext.Provider value={portfolio}>
      {modal && (
        <TransactionModal
          holding={modal.holding}
          transaction={modal.transaction}
          initialType={modal.initialType}
          forceTransaction={modal.forceTransaction}
          scopedCategory={screen === 'overview' || screen === 'transactions' ? undefined : screen}
          walletSummary={walletSummary}
          operatingWalletSummary={operatingSummary}
          onClose={() => setModal(null)}
          onSave={saveTransaction}
          onSaveHolding={(input) => void saveHoldingDetails(input)}
        />
      )}
      {goldTradeMode && (
        <GoldTradeModal
          mode={goldTradeMode}
          holdings={store.holdings}
          walletSummary={walletSummary}
          operatingWalletSummary={operatingSummary}
          onClose={() => setGoldTradeMode(null)}
          onSave={async (input) => {
            await saveTransaction(input)
            setGoldTradeMode(null)
            setGoldPortfolioTab('holdings')
            setGoldTradeNotice(input.type === 'import-existing'
              ? `Đã nhập ${input.quantity} chỉ ${input.name} đang có · giá vốn ${money(input.amount)}. Ví đầu tư không thay đổi.`
              : `Đã ghi nhận ${input.type === 'buy' ? 'mua' : 'bán'} ${input.quantity} chỉ ${input.name} · ${money(input.amount)}.`)
          }}
        />
      )}
      </InvestmentPortfolioContext.Provider>
      {goldTradeNotice && (
        <div role="status" className="fixed bottom-5 right-5 z-[120] flex max-w-md items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-[#15231d] shadow-xl">
          <span className="flex-1">{goldTradeNotice}</span>
          <button type="button" aria-label="Đóng thông báo" onClick={() => setGoldTradeNotice(null)} className="text-slate-500 hover:text-[#15231d]"><X size={16} /></button>
        </div>
      )}
    </div>
  )
}
