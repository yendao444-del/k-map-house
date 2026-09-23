import React, { type ReactNode, useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Landmark,
  LayoutDashboard,
  LineChart,
  PiggyBank,
  Plus,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
  Menu,
  AlertCircle,
  CheckCircle,
  X,
  Trash2,
  Database,
  Globe,
  Palette,
  Bell,
  Download,
  Upload,
  Eye,
  EyeOff,
  Check,
  Pencil,
  Terminal,
  RefreshCw,
  Hash,
  Calendar,
} from 'lucide-react'
import {
  listHoldings,
  listTransactions,
  listPortfolioSnapshots,
  createTransaction,
  capturePortfolioSnapshot,
  captureDailySnapshot,
  deleteTransaction,
  upsertHolding,
  deleteHolding,
  listTelegramInboxEvents,
  createTelegramInboxEvent,
  approveTelegramInboxEvent,
  rejectTelegramInboxEvent,
  updateTelegramInboxEvent,
  syncTelegramInboxFromFile,
  ensureTelegramBotRunning,
  getCategoryTargets,
  listPriceQuotes,
  updatePriceQuotes,
  updateAllCategoryTargets,
  HoldingRecord,
  TransactionRecord,
  TelegramInboxEvent,
  TelegramInboxParsedPayload,
  PortfolioHistorySnapshot,
  AssetCategory,
  TransactionType as ApiTxType,
  exportPortfolioData,
  importPortfolioData,
  clearPortfolioData,
  syncWindowTheme,
} from './services/portfolioApi'
import { parseTelegramCommand } from './modules/telegram/commandParser'
import { GoldTracker } from './components/GoldTracker'
import { StockTracker } from './components/StockTracker'
import { SavingsTracker } from './components/SavingsTracker'
import { fetchCurrentGoldPrices, type GoldPriceDetail } from './services/goldApi'
import { fetchVNCandles, fetchVNTicker } from './services/vnstock'
import { fetchCryptoCandles, fetchCryptoTicker, USD_VND_RATE } from './services/cryptoApi'
import { CryptoTracker, CryptoLogo } from './components/CryptoTracker'
import { fetchBondTicker } from './services/bondApi'
import { BondTracker } from './components/BondTracker'
function GoldIngotIcon({ size = 20, color = 'currentColor', strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-ingot"
    >
      <path d="M 2 21 h 20" />
      <path d="M 4 21 l 2.5 -8 h 11 l 2.5 8" />
      <path d="M 6.5 13 l 2.5 -8 h 6 l 2.5 8" />
    </svg>
  )
}

type Screen =
  | 'overview'
  | 'cash'
  | 'gold'
  | 'crypto'
  | 'stocks'
  | 'etf'
  | 'bonds'
  | 'savings'
  | 'ledger'
  | 'settings'
type CategoryScreen = Extract<Screen, 'cash' | 'gold' | 'crypto' | 'stocks' | 'etf' | 'bonds' | 'savings'>
type TransactionType = 'Nạp tiền' | 'Rút tiền' | 'Mua tài sản' | 'Bán tài sản' | 'Nhập tài sản'

type CategoryConfig = {
  title: string
  eyebrow: string
  description: string
  primaryAction: string
  secondaryAction: string
  color: string
  icon: ReactNode
  emptyNote?: string
}

function translateTxType(type: ApiTxType | string): string {
  switch (type) {
    case 'deposit': return 'Nạp vào'
    case 'withdraw': return 'Rút ra'
    case 'buy': return 'Mua vào'
    case 'sell': return 'Bán ra'
    case 'import-existing': return 'Nhập tài sản'
    default: return type
  }
}

function parseTxType(type: string): ApiTxType {
  switch (type) {
    case 'Nạp vào':
    case 'Nạp tiền':
    case 'Nạp tiền mặt':
      return 'deposit'
    case 'Rút ra':
    case 'Rút tiền':
    case 'Rút tiền mặt':
      return 'withdraw'
    case 'Mua vào':
    case 'Mua tài sản':
    case 'Mua vàng':
    case 'Thêm coin':
    case 'Thêm mã':
    case 'Thêm trái phiếu':
    case 'Thêm sổ':
    case 'Mở sổ':
      return 'buy'
    case 'Bán ra':
    case 'Bán tài sản':
    case 'Bán vàng':
    case 'Giao dịch':
    case 'Mua/Bán':
    case 'Tất toán':
    case 'Đáo hạn':
      return 'sell'
    case 'Nhập tài sản':
    case 'Nhập sổ':
      return 'import-existing'
    default:
      return 'deposit'
  }
}

const categoryConfig: Record<CategoryScreen, CategoryConfig> = {
  cash: {
    title: 'Tiền mặt',
    eyebrow: 'Dòng tiền & thanh toán',
    description: 'Quản lý số dư ví VND, nạp/rút tiền và dòng tiền dùng cho giao dịch mua bán tài sản.',
    primaryAction: 'Nạp tiền',
    secondaryAction: 'Rút tiền',
    color: '#7cc142',
    icon: <Wallet size={20} />,
  },
  gold: {
    title: 'Vàng',
    eyebrow: 'Tích lũy an toàn',
    description: 'Theo dõi vàng SJC, số lượng theo lượng/chỉ, giá vốn và lãi/lỗ tạm tính.',
    primaryAction: 'Mua vàng',
    secondaryAction: 'Bán vàng',
    color: '#f5b84b',
    icon: <GoldIngotIcon size={20} />,
  },
  crypto: {
    title: 'Crypto',
    eyebrow: 'Tài sản rủi ro',
    description: 'Theo dõi coin, số lượng nắm giữ, tỷ giá trực tuyến Binance và biến động PnL.',
    primaryAction: 'Thêm coin',
    secondaryAction: 'Giao dịch',
    color: '#6a7cff',
    icon: <LineChart size={20} />,
  },
  stocks: {
    title: 'Cổ phiếu & Quỹ',
    eyebrow: 'Chứng khoán & Quỹ đầu tư',
    description: 'Quản lý mã cổ phiếu, chứng chỉ quỹ mở/ETF, số lượng, giá vốn, allocation và lịch sử mua bán.',
    primaryAction: 'Thêm mã/quỹ',
    secondaryAction: 'Mua/Bán',
    color: '#19a15f',
    icon: <TrendingUp size={20} />,
  },
  etf: {
    title: 'ETF',
    eyebrow: 'Chứng chỉ quỹ',
    description: 'Quản lý danh mục chứng chỉ quỹ ETF, số lượng, giá vốn, phân bổ tài sản.',
    primaryAction: 'Thêm ETF',
    secondaryAction: 'Mua/Bán',
    color: '#0e7090',
    icon: <BarChart3 size={20} />,
  },
  bonds: {
    title: 'Trái phiếu',
    eyebrow: 'Thu nhập cố định',
    description: 'Khung mock cho trái phiếu/quỹ trái phiếu, kỳ hạn và lợi suất dự kiến.',
    primaryAction: 'Thêm trái phiếu',
    secondaryAction: 'Tất toán',
    color: '#c47b24',
    icon: <Landmark size={20} />,
    emptyNote: 'Chưa có trái phiếu trong mock data. Phase sau thêm schema kỳ hạn, coupon và ngày đáo hạn.',
  },
  savings: {
    title: 'Tiền mặt',
    eyebrow: 'Tích lũy & thanh khoản',
    description: 'Theo dõi tiền mặt khả dụng và quản lý các sổ tiết kiệm, kỳ hạn, lãi suất.',
    primaryAction: 'Thêm sổ',
    secondaryAction: 'Đáo hạn',
    color: '#0f9f8f',
    icon: <PiggyBank size={20} />,
    emptyNote: 'Chưa có sổ tiết kiệm trong mock data. Phase sau thêm ngân hàng, kỳ hạn và lãi suất.',
  },
}

/** Colored circular badge with Lucide icon — used in sidebar nav and holdings table */
const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  cash: Wallet,
  gold: GoldIngotIcon,
  crypto: LineChart,
  stocks: TrendingUp,
  etf: BarChart3,
  bonds: Landmark,
  savings: PiggyBank,
}

function CategoryIcon({ category, size = 24 }: { category: string; size?: number }) {
  const config = categoryConfig[category as CategoryScreen]
  const bg = config?.color || '#64748b'
  const Icon = CATEGORY_ICON_MAP[category]
  const iconSize = Math.round(size * 0.55)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: bg,
        flexShrink: 0,
        boxShadow: `0 2px 8px ${bg}60`,
      }}
    >
      {Icon && <Icon size={iconSize} color="white" strokeWidth={1.8} />}
    </span>
  )
}

const nav = [
  { id: 'overview' as Screen, label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'cash' as Screen, label: 'Ví', icon: Wallet },
  { id: 'gold' as Screen, label: 'Vàng', icon: GoldIngotIcon },
  { id: 'stocks' as Screen, label: 'Cổ phiếu & Quỹ', icon: TrendingUp },
  { id: 'bonds' as Screen, label: 'Trái phiếu', icon: Landmark },
  { id: 'savings' as Screen, label: 'Tiết kiệm', icon: PiggyBank },
  { id: 'ledger' as Screen, label: 'Giao dịch', icon: Clock3 },
  { id: 'settings' as Screen, label: 'Cài đặt', icon: Settings },
]

const securitiesNav = nav.filter((item) => ['stocks', 'bonds'].includes(item.id))
const primaryNav = nav.filter((item) => item.id === 'overview' || item.id === 'cash')
const investmentNav = nav.filter((item) => ['gold', 'savings'].includes(item.id))
const utilityNav = nav.filter((item) => ['ledger'].includes(item.id))
const settingsNav = nav.filter((item) => item.id === 'settings')

const transactionTypes: Array<TransactionType | 'Tất cả'> = [
  'Tất cả',
  'Nạp tiền',
  'Rút tiền',
  'Mua tài sản',
  'Bán tài sản',
  'Nhập tài sản',
]

function formatMoney(value: number) {
  if (localStorage.getItem('dbyfinance-privacy-mode') === 'true') {
    return '******'
  }
  return new Intl.NumberFormat('vi-VN', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value)
}

function formatUSD(value: number) {
  if (localStorage.getItem('dbyfinance-privacy-mode') === 'true') {
    return '******'
  }
  if (value === 0) return '0$'
  const abs = Math.abs(value)
  let fractionDigits = 2
  if (abs >= 100) fractionDigits = 0
  else if (abs < 0.01) fractionDigits = 6
  else if (abs < 1) fractionDigits = 4

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits === 0 ? 0 : 2,
    maximumFractionDigits: fractionDigits,
  }).format(value)
  return `${formatted}$`
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === '-') return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } catch (e) {
    return dateStr
  }
}

interface DateInputProps {
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
}

const DateInput: React.FC<DateInputProps> = ({ value, onChange }) => {
  const toDisplay = (val: string) => {
    if (!val) return ''
    const parts = val.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return val
  }

  const [inputText, setInputText] = useState(toDisplay(value))

  useEffect(() => {
    setInputText(toDisplay(value))
  }, [value])

  const getDaysInMonth = (m: number, y: number) => {
    return new Date(y, m, 0).getDate()
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    val = val.replace(/[^0-9/]/g, '')
    
    const clean = val.replace(/\D/g, '')
    let formatted = clean
    if (clean.length > 2) {
      formatted = `${clean.slice(0, 2)}/${clean.slice(2)}`
    }
    if (clean.length > 4) {
      formatted = `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4, 8)}`
    }
    
    setInputText(formatted)

    if (formatted.length === 10) {
      const parts = formatted.split('/')
      if (parts.length === 3) {
        const d = parts[0]
        const m = parts[1]
        const y = parts[2]
        if (d.length === 2 && m.length === 2 && y.length === 4) {
          const day = parseInt(d, 10)
          const month = parseInt(m, 10)
          const year = parseInt(y, 10)
          const dObj = new Date(year, month - 1, day)
          if (
            dObj.getFullYear() === year &&
            dObj.getMonth() === month - 1 &&
            dObj.getDate() === day &&
            year >= 1900 &&
            year <= 2100
          ) {
            onChange(`${y}-${m}-${d}`)
          }
        }
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return

    e.preventDefault()

    const inputEl = e.currentTarget
    const cursor = inputEl.selectionStart || 0

    // Parse current input text, filling in defaults for missing parts
    const parts = inputText.split('/')
    let dayVal = parseInt(parts[0], 10) || 1
    let monthVal = parseInt(parts[1], 10) || 1
    let yearVal = parseInt(parts[2], 10) || new Date().getFullYear()

    // Determine which segment the cursor is in
    let segment: 'day' | 'month' | 'year' = 'day'
    if (cursor >= 3 && cursor <= 5) {
      segment = 'month'
    } else if (cursor >= 6) {
      segment = 'year'
    }

    const isUp = e.key === 'ArrowUp'
    const diff = isUp ? 1 : -1

    if (segment === 'day') {
      const maxDays = getDaysInMonth(monthVal, yearVal)
      dayVal = dayVal + diff
      if (dayVal > maxDays) dayVal = 1
      if (dayVal < 1) dayVal = maxDays
    } else if (segment === 'month') {
      monthVal = monthVal + diff
      if (monthVal > 12) monthVal = 1
      if (monthVal < 1) monthVal = 12
      const maxDays = getDaysInMonth(monthVal, yearVal)
      if (dayVal > maxDays) dayVal = maxDays
    } else {
      yearVal = Math.min(2100, Math.max(1900, yearVal + diff))
      const maxDays = getDaysInMonth(monthVal, yearVal)
      if (dayVal > maxDays) dayVal = maxDays
    }

    const pad = (n: number, width = 2) => String(n).padStart(width, '0')
    const newText = `${pad(dayVal)}/${pad(monthVal)}/${pad(yearVal, 4)}`

    setInputText(newText)
    onChange(`${pad(yearVal, 4)}-${pad(monthVal)}-${pad(dayVal)}`)

    // Schedule selection range update to highlight the segment being edited
    setTimeout(() => {
      if (segment === 'day') {
        inputEl.setSelectionRange(0, 2)
      } else if (segment === 'month') {
        inputEl.setSelectionRange(3, 5)
      } else {
        inputEl.setSelectionRange(6, 10)
      }
    }, 0)
  }

  const handleBlur = () => {
    setInputText(toDisplay(value))
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', height: '100%' }}>
      <input
        type="text"
        value={inputText}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="DD/MM/YYYY"
      />
      <div style={{ position: 'relative', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <Calendar size={18} style={{ color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
        <input
          type="date"
          value={value}
          onChange={(e) => {
            if (e.target.value) {
              onChange(e.target.value)
            }
          }}
          className="custom-date-picker-overlay"
        />
      </div>
    </div>
  )
}


function formatPercent(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function getDriftThreshold(): number {
  const raw = localStorage.getItem('dbyfinance-drift-threshold')
  return raw ? parseFloat(raw) : 3
}

function cleanAndParseFloat(valStr: string): number {
  if (!valStr) return 0
  
  // Remove all whitespace
  let s = valStr.replace(/\s+/g, '')
  
  // Find all occurrences of dots and commas
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  
  if (hasDot && hasComma) {
    const firstDot = s.indexOf('.')
    const firstComma = s.indexOf(',')
    if (firstDot < firstComma) {
      // Dot is thousands, comma is decimal (e.g. 6.946,84)
      s = s.replace(/\./g, '').replace(/,/g, '.')
    } else {
      // Comma is thousands, dot is decimal (e.g. 6,946.84)
      s = s.replace(/,/g, '')
    }
  } else if (hasDot) {
    const dotsCount = (s.match(/\./g) || []).length
    if (dotsCount > 1) {
      // Multiple dots -> last one is decimal, others are thousands (e.g. 6.946.84)
      const lastDotIndex = s.lastIndexOf('.')
      const before = s.substring(0, lastDotIndex).replace(/\./g, '')
      const after = s.substring(lastDotIndex + 1)
      s = before + '.' + after
    }
  } else if (hasComma) {
    const commasCount = (s.match(/,/g) || []).length
    if (commasCount > 1) {
      const lastCommaIndex = s.lastIndexOf(',')
      const before = s.substring(0, lastCommaIndex).replace(/,/g, '')
      const after = s.substring(lastCommaIndex + 1)
      s = before + '.' + after
    } else {
      // Single comma -> treat as decimal
      s = s.replace(/,/g, '.')
    }
  }
  
  const parsed = parseFloat(s)
  return isNaN(parsed) ? 0 : parsed
}

function parseQtyString(qtyStr: string): number {
  if (!qtyStr) return 1
  const match = qtyStr.match(/[\d.,]+/)
  if (match) {
    const raw = match[0].trim()
    let normalized = raw
    if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      normalized = raw.replace(/\./g, '')
    } else if (/^\d{1,3}(,\d{3})+$/.test(raw)) {
      normalized = raw.replace(/,/g, '')
    }

    const val = cleanAndParseFloat(normalized)
    return val <= 0 ? 1 : val
  }
  return 1
}

function parseHoldingUnit(quantityLabel: string | undefined, fallbackUnit: string) {
  if (!quantityLabel) return fallbackUnit
  const match = quantityLabel.trim().match(/^[\d.,]+\s*(.+)$/)
  return match?.[1]?.trim() || fallbackUnit
}

function formatHoldingQuantityLabel(quantity: number, unit: string) {
  const normalizedQuantity = Number.isInteger(quantity)
    ? quantity
    : Number(quantity.toFixed(8))
  return `${normalizedQuantity} ${unit}`
}

function scaleHoldingValueByQuantity(valueVnd: number, oldQty: number, newQty: number) {
  if (!Number.isFinite(valueVnd) || valueVnd <= 0) return 0
  if (!Number.isFinite(oldQty) || oldQty <= 0) return 0
  if (!Number.isFinite(newQty) || newQty <= 0) return 0
  return Math.max(0, Math.round((valueVnd * newQty) / oldQty))
}

function shouldUseQuantityBasedHoldingMath(holding: HoldingRecord | undefined, quantity: number) {
  if (!holding) return false
  if (!Number.isFinite(quantity) || quantity <= 0) return false
  if (holding.category === 'cash' || holding.category === 'savings') return false
  return !holding.quantity.trim().startsWith('{')
}

function buildAppliedHoldingState(
  existingHolding: HoldingRecord | undefined,
  {
    txType,
    amountVnd,
    quantity,
    resolvedUnit,
    costAmountVnd,
  }: {
    txType: ApiTxType
    amountVnd: number
    quantity: number
    resolvedUnit: string
    costAmountVnd?: number
  },
) {
  let newValue = amountVnd
  let newPnl = 0
  let newQty = quantity

  if (txType === 'import-existing') {
    const importCost = costAmountVnd ?? amountVnd
    newValue = amountVnd
    newPnl = importCost > 0 ? ((newValue - importCost) / importCost) * 100 : 0
    if (existingHolding) newQty = quantity
  } else if (txType === 'buy') {
    if (existingHolding) {
      const oldQty = parseQtyString(existingHolding.quantity)
      const oldCost = existingHolding.pnlPercent <= -100
        ? existingHolding.valueVnd
        : existingHolding.valueVnd / (1 + (existingHolding.pnlPercent || 0) / 100)
      const purchaseCost = costAmountVnd ?? amountVnd
      newQty = oldQty + quantity
      newValue = existingHolding.valueVnd + amountVnd
      const newCost = oldCost + purchaseCost
      newPnl = newCost > 0 ? ((newValue - newCost) / newCost) * 100 : 0
    } else {
      newValue = amountVnd
      newPnl = 0
      newQty = quantity
    }
  } else if (txType === 'sell') {
    if (existingHolding) {
      const oldQty = parseQtyString(existingHolding.quantity)
      newQty = Math.max(0, oldQty - quantity)
      if (shouldUseQuantityBasedHoldingMath(existingHolding, quantity)) {
        newValue = scaleHoldingValueByQuantity(existingHolding.valueVnd, oldQty, newQty)
      } else {
        newValue = Math.max(0, existingHolding.valueVnd - amountVnd)
      }
      newPnl = existingHolding.pnlPercent
    }
  }

  return {
    newValue,
    newPnl,
    newQty,
    quantityLabel: formatHoldingQuantityLabel(newQty, resolvedUnit),
  }
}

function buildDeletedHoldingState(holding: HoldingRecord, tx: TransactionRecord) {
  const txQty = tx.quantity || 0
  const resolvedUnit = tx.unit || parseHoldingUnit(holding.quantity, 'đơn vị')

  if (shouldUseQuantityBasedHoldingMath(holding, txQty)) {
    const oldQty = parseQtyString(holding.quantity)
    const newQty = tx.transactionType === 'sell'
      ? oldQty + txQty
      : Math.max(0, oldQty - txQty)

    return {
      newValue: scaleHoldingValueByQuantity(holding.valueVnd, oldQty, newQty),
      newPnl: holding.pnlPercent,
      quantity: formatHoldingQuantityLabel(newQty, resolvedUnit),
      shouldDelete: newQty <= 0,
    }
  }

  let newValue = holding.valueVnd
  let newPnl = holding.pnlPercent

  if (tx.transactionType === 'buy' || tx.transactionType === 'import-existing') {
    newValue = Math.max(0, newValue - tx.amountVnd)
    const costAmount = tx.capitalAmountVnd ?? tx.amountVnd
    const oldCost = holding.pnlPercent <= -100
      ? holding.valueVnd
      : holding.valueVnd / (1 + (holding.pnlPercent || 0) / 100)
    const newCost = Math.max(0, oldCost - costAmount)
    newPnl = newCost > 0 ? ((newValue - newCost) / newCost) * 100 : 0
  } else if (tx.transactionType === 'sell') {
    newValue = newValue + tx.amountVnd
  }

  return {
    newValue,
    newPnl,
    quantity: holding.quantity,
    shouldDelete: newValue <= 0,
  }
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value)
}

function getGoldQuoteConfig(symbol: string) {
  const normalized = symbol.toUpperCase()
  if (normalized === 'VNHAN') return { quoteSymbol: 'SJ9999', unit: 'chỉ', divisor: 10 }
  if (normalized === 'VKIENG') return { quoteSymbol: 'VKIENG', unit: 'chỉ', divisor: 10 }
  if (normalized === 'VMIENG') return { quoteSymbol: 'SJL1L10', unit: 'lượng', divisor: 1 }
  if (normalized === 'SJ9999' || normalized === 'PQHN24NTT' || normalized === 'BT9999NTT') {
    return { quoteSymbol: normalized, unit: 'chỉ', divisor: 10 }
  }
  if (normalized === 'SJL1L10') return { quoteSymbol: normalized, unit: 'lượng', divisor: 1 }
  return null
}

function getGoldUnitPrice(symbol: string, prices?: Record<string, GoldPriceDetail> | null, side: 'buy' | 'sell' = 'sell') {
  const config = getGoldQuoteConfig(symbol)
  if (!config || !prices) return null
  const quote = prices[config.quoteSymbol] || (config.quoteSymbol === 'VKIENG' ? prices.SJ9999 : null)
  if (!quote) return null
  return quote[side] / config.divisor
}

export function normalizeGoldInputUnitPrice(
  symbol: string,
  unitPriceVnd: number,
  prices?: Record<string, GoldPriceDetail> | null,
) {
  const config = getGoldQuoteConfig(symbol)
  if (!config || !Number.isFinite(unitPriceVnd) || unitPriceVnd <= 0) {
    return { unitPriceVnd, adjusted: false }
  }

  const referenceUnitPrice = getGoldUnitPrice(symbol, prices, 'sell') ?? getGoldUnitPrice(symbol, prices, 'buy')

  if (config.divisor === 10) {
    const looksLikeLuongPrice = referenceUnitPrice
      ? unitPriceVnd >= referenceUnitPrice * 5
      : unitPriceVnd >= 20_000_000

    if (looksLikeLuongPrice) {
      return {
        unitPriceVnd: Math.round(unitPriceVnd / 10),
        adjusted: true,
      }
    }
  }

  if (config.divisor === 1) {
    const looksLikeChiPrice = referenceUnitPrice
      ? unitPriceVnd * 5 <= referenceUnitPrice
      : unitPriceVnd > 0 && unitPriceVnd <= 20_000_000

    if (looksLikeChiPrice) {
      return {
        unitPriceVnd: Math.round(unitPriceVnd * 10),
        adjusted: true,
      }
    }
  }

  return { unitPriceVnd, adjusted: false }
}

function normalizeLegacyGoldTransaction(
  tx: TransactionRecord,
  prices?: Record<string, GoldPriceDetail> | null,
) {
  const goldConfig = getGoldQuoteConfig(tx.assetSymbol)
  const quantity = tx.quantity || 0
  if (!goldConfig || !Number.isFinite(quantity) || quantity <= 0) {
    return { transaction: tx, changed: false }
  }

  const rawUnitPrice = tx.unitPriceVnd && tx.unitPriceVnd > 0
    ? tx.unitPriceVnd
    : Math.round(tx.amountVnd / quantity)
  if (!Number.isFinite(rawUnitPrice) || rawUnitPrice <= 0) {
    return { transaction: tx, changed: false }
  }

  const normalizedPrice = normalizeGoldInputUnitPrice(tx.assetSymbol, rawUnitPrice, prices)
  if (!normalizedPrice.adjusted || normalizedPrice.unitPriceVnd === rawUnitPrice) {
    return { transaction: tx, changed: false }
  }

  const ratio = normalizedPrice.unitPriceVnd / rawUnitPrice
  const normalizedAmount = Math.round(tx.amountVnd * ratio)
  const normalizedCapital = typeof tx.capitalAmountVnd === 'number'
    ? Math.round(tx.capitalAmountVnd * ratio)
    : normalizedAmount
  const normalizedWalletImpact = typeof tx.walletImpactVnd === 'number'
    ? Math.round(tx.walletImpactVnd * ratio)
    : tx.walletImpactVnd

  return {
    transaction: {
      ...tx,
      amountVnd: normalizedAmount,
      unitPriceVnd: normalizedPrice.unitPriceVnd,
      capitalAmountVnd: normalizedCapital,
      walletImpactVnd: normalizedWalletImpact,
    },
    changed: true,
  }
}

function normalizeLegacySavingsSettlementTransaction(tx: TransactionRecord) {
  if (tx.transactionType !== 'sell') {
    return { transaction: tx, changed: false }
  }

  if (!(tx.assetSymbol.startsWith('STK-') || (tx.note && tx.note.startsWith('{') && tx.note.includes('"type":"savings"')))) {
    return { transaction: tx, changed: false }
  }

  try {
    const meta = JSON.parse(tx.note || '{}')
    const principal = Number(meta.principal || 0)
    const settleAmount = Number(meta.settleAmount || tx.amountVnd || 0)
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(settleAmount) || settleAmount <= 0) {
      return { transaction: tx, changed: false }
    }

    const capitalAmountVnd = tx.capitalAmountVnd ?? tx.amountVnd
    if (capitalAmountVnd === principal) {
      return { transaction: tx, changed: false }
    }

    return {
      transaction: {
        ...tx,
        capitalAmountVnd: principal,
      },
      changed: true,
    }
  } catch {
    return { transaction: tx, changed: false }
  }
}

function normalizeLegacyImportExistingCapitalTransaction(tx: TransactionRecord) {
  if (tx.transactionType !== 'import-existing') {
    return { transaction: tx, changed: false }
  }

  const quantity = tx.quantity || 0
  const capitalAmount = tx.capitalAmountVnd ?? tx.amountVnd
  if (!Number.isFinite(quantity) || quantity <= 1 || !Number.isFinite(capitalAmount) || capitalAmount <= 0) {
    return { transaction: tx, changed: false }
  }

  const expectedCapital = tx.amountVnd
  if (!Number.isFinite(expectedCapital) || expectedCapital <= 0) {
    return { transaction: tx, changed: false }
  }

  const inflatedByQuantity = Math.abs(capitalAmount - Math.round(expectedCapital * quantity)) <= Math.max(5, quantity)
  const clearlyInflated = capitalAmount > expectedCapital * 2

  if (!inflatedByQuantity && !clearlyInflated) {
    return { transaction: tx, changed: false }
  }

  const normalizedCostLabel = isLikelyCryptoSymbol(tx.assetSymbol)
    ? formatUSD(expectedCapital)
    : new Intl.NumberFormat('vi-VN').format(expectedCapital)
  const normalizedNote = (tx.note || '')
    .replace(/\[Giá v[^:]*:\s*[^\]]+\]/i, `[Giá vốn: ${normalizedCostLabel}]`)

  return {
    transaction: {
      ...tx,
      capitalAmountVnd: expectedCapital,
      note: normalizedNote || tx.note,
    },
    changed: true,
  }
}

function normalizeLegacyGoldHolding(
  holding: HoldingRecord,
  prices?: Record<string, GoldPriceDetail> | null,
) {
  const goldConfig = getGoldQuoteConfig(holding.symbol)
  if (!goldConfig) {
    return { holding, changed: false }
  }

  const quantity = parseQtyString(holding.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { holding, changed: false }
  }

  const rawUnitPrice = holding.valueVnd / quantity
  if (!Number.isFinite(rawUnitPrice) || rawUnitPrice <= 0) {
    return { holding, changed: false }
  }

  const normalizedPrice = normalizeGoldInputUnitPrice(holding.symbol, rawUnitPrice, prices)
  if (!normalizedPrice.adjusted || normalizedPrice.unitPriceVnd === rawUnitPrice) {
    return { holding, changed: false }
  }

  return {
    holding: {
      ...holding,
      valueVnd: Math.round(quantity * normalizedPrice.unitPriceVnd),
    },
    changed: true,
  }
}

function normalizeLegacyPortfolioData(
  data: {
    holdings: HoldingRecord[]
    transactions: TransactionRecord[]
    priceQuotes: Awaited<ReturnType<typeof listPriceQuotes>>
    portfolioSnapshots: PortfolioHistorySnapshot[]
    categoryTargets: Record<string, number>
    telegramInboxEvents: TelegramInboxEvent[]
  },
  prices?: Record<string, GoldPriceDetail> | null,
) {
  let changed = false

  const transactions = data.transactions.map((tx) => {
    const normalizedGold = normalizeLegacyGoldTransaction(tx, prices)
    const normalizedSavings = normalizeLegacySavingsSettlementTransaction(normalizedGold.transaction)
    const normalizedImportCost = normalizeLegacyImportExistingCapitalTransaction(normalizedSavings.transaction)
    if (normalizedGold.changed || normalizedSavings.changed || normalizedImportCost.changed) changed = true
    return normalizedImportCost.transaction
  })

  const latestImportBySymbol = new Map<string, TransactionRecord>()
  transactions.forEach((tx) => {
    if (tx.transactionType !== 'import-existing') return
    const symbol = tx.assetSymbol.toUpperCase()
    const existing = latestImportBySymbol.get(symbol)
    const txTime = tx.occurredAt ? new Date(tx.occurredAt).getTime() : new Date(tx.date).getTime()
    const existingTime = existing ? (existing.occurredAt ? new Date(existing.occurredAt).getTime() : new Date(existing.date).getTime()) : Number.NEGATIVE_INFINITY
    if (!existing || txTime >= existingTime) {
      latestImportBySymbol.set(symbol, tx)
    }
  })

  const holdings = data.holdings.map((holding) => {
    const normalized = normalizeLegacyGoldHolding(holding, prices)
    let nextHolding = normalized.holding
    let holdingChanged = normalized.changed

    const latestImportTx = latestImportBySymbol.get(nextHolding.symbol.toUpperCase())
    if (
      latestImportTx &&
      nextHolding.symbol.toUpperCase() !== 'CASH' &&
      nextHolding.category !== 'savings' &&
      Math.abs((latestImportTx.capitalAmountVnd ?? latestImportTx.amountVnd) - nextHolding.valueVnd) <= 1 &&
      Math.abs(nextHolding.pnlPercent) > 0.0001
    ) {
      nextHolding = {
        ...nextHolding,
        pnlPercent: 0,
      }
      holdingChanged = true
    }

    if (holdingChanged) changed = true
    return nextHolding
  })

  // 1. Reconstruct missing savings opening transactions
  const savingsHoldings = holdings.filter(h => h.symbol.startsWith('STK-'))
  for (const holding of savingsHoldings) {
    const hasOpening = transactions.some(t => 
      t.assetSymbol === holding.symbol && 
      (t.transactionType === 'buy' || t.transactionType === 'import-existing')
    )
    if (!hasOpening) {
      try {
        const meta = JSON.parse(holding.quantity)
        const newTx: TransactionRecord = {
          id: `TEMP-${Date.now()}-${Math.random()}`,
          date: meta.startDate || "2026-01-01",
          occurredAt: meta.startDate ? new Date(meta.startDate).toISOString() : new Date().toISOString(),
          transactionType: "import-existing",
          assetSymbol: holding.symbol,
          amountVnd: meta.principal || holding.valueVnd || 0,
          status: "done",
          note: holding.quantity,
          quantity: 1,
          unit: "sổ",
          unitPriceVnd: meta.principal || holding.valueVnd || 0,
          capitalAmountVnd: meta.principal || holding.valueVnd || 0,
          feeVnd: 0,
          walletImpactVnd: 0,
          linkedAssetSymbol: holding.symbol,
          fundingSource: "opening-balance"
        }
        transactions.push(newTx)
        changed = true
      } catch (e) {}
    }
  }

  // 2. Re-assign unique sequential transaction IDs if there are duplicates or temporary IDs
  let hasDuplicateOrTemp = false
  const idsSeen = new Set()
  for (const tx of transactions) {
    if (tx.id.startsWith('TEMP-') || idsSeen.has(tx.id)) {
      hasDuplicateOrTemp = true
      break
    }
    idsSeen.add(tx.id)
  }

  if (hasDuplicateOrTemp) {
    // Sort chronologically before re-sequencing
    transactions.sort((a, b) => {
      const dateDiff = a.date.localeCompare(b.date)
      if (dateDiff !== 0) return dateDiff
      const timeA = a.occurredAt ? new Date(a.occurredAt).getTime() : 0
      const timeB = b.occurredAt ? new Date(b.occurredAt).getTime() : 0
      return timeA - timeB
    })
    transactions.forEach((tx, idx) => {
      const seqNum = String(idx + 1).padStart(4, '0')
      tx.id = `TX-${seqNum}`
    })
    changed = true
  }

  return {
    changed,
    holdings,
    transactions,
    priceQuotes: data.priceQuotes,
    categoryTargets: data.categoryTargets,
    telegramInboxEvents: data.telegramInboxEvents,
    portfolioSnapshots: changed ? [] : data.portfolioSnapshots,
  }
}

function parseTransactionMeta(note: string) {
  const qtyMatch = note.match(/\[SL:\s*([^\]]+)\]/i)
  const unitPriceMatch = note.match(/\[Đơn giá:\s*([^\]]+)\]/i)
  const costMatch = note.match(/\[Giá v[^:]*:\s*([^\]]+)\]/i)
  
  let unitPriceVnd = 0
  let costVnd = 0
  
  if (unitPriceMatch) {
    const raw = unitPriceMatch[1].trim()
    if (raw.includes('$')) {
      unitPriceVnd = parseFloat(raw.replace(/[^\d.]/g, '')) || 0
    } else {
      unitPriceVnd = parseFloat(raw.replace(/\./g, '').replace(/,/g, '.')) || 0
    }
  }
  
  if (costMatch) {
    const raw = costMatch[1].trim()
    if (raw.includes('$')) {
      costVnd = parseFloat(raw.replace(/[^\d.]/g, '')) || 0
    } else {
      costVnd = parseFloat(raw.replace(/\./g, '').replace(/,/g, '.')) || 0
    }
  }

  return {
    quantity: qtyMatch?.[1]?.trim() || '',
    unitPriceVnd,
    costVnd,
  }
}

function getTransactionMeta(tx: TransactionRecord) {
  const parsed = parseTransactionMeta(tx.note || '')
  const quantityLabel = tx.quantity && tx.unit
    ? `${formatQuantity(tx.quantity)} ${tx.unit}`
    : parsed.quantity

  return {
    quantity: quantityLabel,
    unitPriceVnd: tx.unitPriceVnd ?? parsed.unitPriceVnd,
    costVnd: tx.capitalAmountVnd ?? parsed.costVnd,
  }
}

const KNOWN_CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOGE', 'DOT', 'AVAX', 'LINK', 'LTC', 'UNI', 'SHIB', 'MATIC', 'USDT',
])

function isLikelyCryptoSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase()
  return normalized.endsWith('USDT') || KNOWN_CRYPTO_SYMBOLS.has(normalized)
}
function formatTelegramUnitPrice(symbol: string, unitPriceVnd: number) {
  if (isLikelyCryptoSymbol(symbol)) {
    const unitPriceUsd = unitPriceVnd / USD_VND_RATE
    return formatUSD(unitPriceUsd)
  }
  return `${unitPriceVnd.toLocaleString('vi-VN')} đ`
}

function getTelegramEventSummary(draft: TelegramInboxParsedPayload | undefined | null) {
  if (!draft) return 'Chưa dịch được lệnh'
  const actionLabel = draft.transactionType === 'buy' ? 'Mua' : 'Bán'
  const symbol = draft.assetSymbol.toUpperCase()
  if (!draft.unitPriceVnd || draft.unitPriceVnd <= 0) {
    return `${actionLabel} ${draft.quantity?.toLocaleString('vi-VN')} ${symbol} (chờ bổ sung giá)`
  }
  const formattedPrice = formatTelegramUnitPrice(symbol, draft.unitPriceVnd)
  return `${actionLabel} ${draft.quantity?.toLocaleString('vi-VN')} ${symbol} @ ${formattedPrice}`
}

async function resolveTelegramReferencePrice(event: TelegramInboxEvent): Promise<number | null> {
  const draft = event.draftTransaction
  if (!draft) return null

  const occurredAt = draft.occurredAt || event.createdAt
  const timestamp = Math.floor(new Date(occurredAt).getTime() / 1000)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null

  const symbol = draft.assetSymbol.toUpperCase()

  if (isLikelyCryptoSymbol(symbol)) {
    const candles = await fetchCryptoCandles(symbol, '60', 72)
    const candle = [...candles].reverse().find((item) => item.time <= timestamp) || candles[candles.length - 1]
    return candle ? Math.round(candle.close * USD_VND_RATE) : null
  }

  const candles = await fetchVNCandles(symbol, 'D', 40)
  const targetDate = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const candle = [...candles].reverse().find((item) => new Date(item.time * 1000).toISOString().slice(0, 10) <= targetDate) || candles[candles.length - 1]
  return candle ? Math.round(candle.close * 1000) : null
}

async function enrichTelegramInboxEvents(events: TelegramInboxEvent[]): Promise<boolean> {
  const candidates = events.filter((event) => {
    const draft = event.draftTransaction
    return event.status === 'pending'
      && !!draft
      && draft.transactionType !== 'deposit'
      && draft.transactionType !== 'withdraw'
      && (!draft.unitPriceVnd || draft.unitPriceVnd <= 0 || !draft.amountVnd || draft.amountVnd <= 0)
      && !!draft.quantity
  })

  if (!candidates.length) return false

  let changed = false

  for (const event of candidates) {
    try {
      const draft = event.draftTransaction
      if (!draft || !draft.quantity) continue

      const unitPriceVnd = await resolveTelegramReferencePrice(event)
      if (!unitPriceVnd || unitPriceVnd <= 0) continue

      const amountVnd = Math.round(draft.quantity * unitPriceVnd)
      const occurredAt = draft.occurredAt || event.createdAt
      const timeLabel = new Date(occurredAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      const actionLabel = draft.transactionType === 'buy' ? 'Mua' : 'Bán'
      const formattedPrice = formatTelegramUnitPrice(draft.assetSymbol, unitPriceVnd)
      const updatedDraft = {
        ...draft,
        amountVnd,
        unitPriceVnd,
        capitalAmountVnd: amountVnd,
        walletImpactVnd: draft.transactionType === 'buy' ? -amountVnd : amountVnd,
        note: `[telegram] ${actionLabel} ${draft.quantity} ${draft.assetSymbol} @ ${formattedPrice} (gia tham chieu luc ${timeLabel})`,
        summary: `${actionLabel} ${draft.quantity} ${draft.assetSymbol} @ ${formattedPrice}`,
      }

      await updateTelegramInboxEvent({
        id: event.id,
        draftTransaction: updatedDraft,
      })
      changed = true
    } catch (error) {
      console.error(`Khong the bo sung gia tham chieu cho ${event.id}:`, error)
    }
  }

  return changed
}

type WalletStatementEntry = {
  id: string
  date: string
  title: string
  subtitle: string
  amountVnd: number
  balanceAfterVnd: number
  direction: 'in' | 'out'
}

function getWalletDelta(tx: TransactionRecord): number | null {
  if (tx.transactionType === 'import-existing') {
    return null
  }

  if (tx.fundingSource === 'opening-balance') {
    return null
  }

  if (typeof tx.walletImpactVnd === 'number') {
    return tx.walletImpactVnd
  }

  switch (tx.transactionType) {
    case 'deposit':
    case 'sell':
      return tx.amountVnd
    case 'withdraw':
    case 'buy':
      return -tx.amountVnd
    default:
      return null
  }
}

/*
function getOpeningBalanceAmount(tx: TransactionRecord): number {
  if (tx.fundingSource === 'opening-balance') {
    return tx.capitalAmountVnd ?? tx.amountVnd
  }
  if (tx.transactionType === 'import-existing') {
    return tx.capitalAmountVnd ?? tx.amountVnd
  }
  return 0
}
*/

function compareTransactionsDesc(a: TransactionRecord, b: TransactionRecord) {
  const aTime = a.occurredAt ? new Date(a.occurredAt).getTime() : NaN
  const bTime = b.occurredAt ? new Date(b.occurredAt).getTime() : NaN

  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return bTime - aTime
  }

  const dateCompare = b.date.localeCompare(a.date)
  if (dateCompare !== 0) {
    return dateCompare
  }

  return b.id.localeCompare(a.id)
}

function buildWalletStatementEntries(
  transactions: TransactionRecord[],
  currentCashBalance: number,
  holdings: HoldingRecord[],
): WalletStatementEntry[] {
  const symbolNameMap = new Map(holdings.map((holding) => [holding.symbol.toUpperCase(), holding.name]))
  const walletTransactions = [...transactions]
    .filter((tx) => getWalletDelta(tx) !== null)
    .sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date)
      if (dateCompare !== 0) return dateCompare
      return b.id.localeCompare(a.id)
    })

  let runningBalance = currentCashBalance

  return walletTransactions.map((tx) => {
    const delta = getWalletDelta(tx) || 0
    let assetLabel = symbolNameMap.get(tx.assetSymbol.toUpperCase()) || tx.assetSymbol
    const isSavings = tx.assetSymbol.startsWith('STK-') || (tx.note && tx.note.startsWith('{') && tx.note.includes('"type":"savings"'))
    
    if (isSavings && tx.note) {
      try {
        const jsonMeta = JSON.parse(tx.note)
        assetLabel = `sổ ${jsonMeta.bank} ${jsonMeta.term}`
      } catch (e) {}
    }

    let title = 'Biến động ví'
    let subtitle = `${tx.id} · ${formatDate(tx.date)}`

    if (tx.transactionType === 'deposit') {
      title = 'Nạp tiền vào ví'
    } else if (tx.transactionType === 'withdraw') {
      title = 'Rút tiền khỏi ví'
    } else if (tx.transactionType === 'buy') {
      title = isSavings ? `Mở ${assetLabel}` : `Thanh toán mua ${assetLabel}`
    } else if (tx.transactionType === 'sell') {
      title = isSavings ? `Tất toán ${assetLabel}` : `Nhận tiền bán ${assetLabel}`
    }

    const entry: WalletStatementEntry = {
      id: tx.id,
      date: tx.date,
      title,
      subtitle,
      amountVnd: delta,
      balanceAfterVnd: runningBalance,
      direction: delta >= 0 ? 'in' : 'out',
    }

    runningBalance -= delta
    return entry
  })
}

function App() {
  void formatQuantity
  void getGoldUnitPrice
  void parseTransactionMeta

  const [screen, setScreen] = useState<Screen>('overview')
  const [selectedType, setSelectedType] = useState<TransactionType | 'Tất cả'>('Tất cả')
  const [holdings, setHoldings] = useState<HoldingRecord[]>([])
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [telegramInboxEvents, setTelegramInboxEvents] = useState<TelegramInboxEvent[]>([])
  const [portfolioSnapshots, setPortfolioSnapshots] = useState<PortfolioHistorySnapshot[]>([])
  const [goldPrices, setGoldPrices] = useState<Record<string, GoldPriceDetail> | null>(null)
  const [categoryTargets, setCategoryTargets] = useState<Record<string, number>>({})
  const [stockPrices, setStockPrices] = useState<Record<string, number>>({})
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({})
  const [bondPrices, setBondPrices] = useState<Record<string, number>>({})
  const [selectedHolding, setSelectedHolding] = useState<HoldingRecord | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [defaultSymbol, setDefaultSymbol] = useState<string>('')
  const [defaultType, setDefaultType] = useState<string | undefined>(undefined)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isSecuritiesOpen, setIsSecuritiesOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [txToDelete, setTxToDelete] = useState<string | null>(null)
  const [transactionToEdit, setTransactionToEdit] = useState<TransactionRecord | null>(null)
  const [telegramCommandInput, setTelegramCommandInput] = useState('')
  const [isTelegramSubmitting, setIsTelegramSubmitting] = useState(false)
  const [isTelegramSyncing, setIsTelegramSyncing] = useState(false)

  // Settings States
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem('dbyfinance-privacy-mode') === 'true')
  const [appTheme, setAppTheme] = useState(() => localStorage.getItem('dbyfinance-theme') || 'dark')
  const [mainCurrency, setMainCurrency] = useState(() => localStorage.getItem('dbyfinance-main-currency') || 'VND')
  const [driftThreshold, setDriftThreshold] = useState(() => parseFloat(localStorage.getItem('dbyfinance-drift-threshold') || '3'))
  const [goldApiSource, setGoldApiSource] = useState(() => localStorage.getItem('dbyfinance-gold-api-source') || 'vang.today')
  const [securityPassword, setSecurityPassword] = useState(() => localStorage.getItem('dbyfinance-security-password') || 'admin')
  const [resetConfirmStep, setResetConfirmStep] = useState<'none' | 'warning' | 'password'>('none')
  const [resetInputPassword, setResetInputPassword] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const [importData, setImportData] = useState<any | null>(null)

  // Theme Sync Effect
  useEffect(() => {
    const root = document.documentElement
    if (appTheme === 'light') {
      root.classList.add('theme-light')
    } else if (appTheme === 'dark') {
      root.classList.remove('theme-light')
    } else {
      const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
      if (systemTheme === 'light') {
        root.classList.add('theme-light')
      } else {
        root.classList.remove('theme-light')
      }
    }
    localStorage.setItem('dbyfinance-theme', appTheme)
    syncWindowTheme(appTheme)
  }, [appTheme])

  // Settings Sync Effects
  useEffect(() => {
    localStorage.setItem('dbyfinance-privacy-mode', String(privacyMode))
  }, [privacyMode])

  useEffect(() => {
    localStorage.setItem('dbyfinance-main-currency', mainCurrency)
  }, [mainCurrency])

  useEffect(() => {
    localStorage.setItem('dbyfinance-drift-threshold', String(driftThreshold))
  }, [driftThreshold])

  useEffect(() => {
    localStorage.setItem('dbyfinance-gold-api-source', goldApiSource)
  }, [goldApiSource])

  useEffect(() => {
    localStorage.setItem('dbyfinance-security-password', securityPassword)
  }, [securityPassword])

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type })
  }

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [notification])

  // Fetch gold prices periodically
  useEffect(() => {
    let cancelled = false
    const fetchPrices = async () => {
      try {
        const data = await fetchCurrentGoldPrices()
        if (!cancelled && data?.prices) {
          console.log('[Gold Realtime]', new Date().toLocaleTimeString(), 'Fetched gold prices')
          setGoldPrices(data.prices)
        }
      } catch (err) {
        console.error('Lỗi khi tải giá vàng:', err)
      }
    }
    fetchPrices()
    const timer = setInterval(fetchPrices, 60000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  // Fetch stock prices periodically for all stock/ETF holdings
  useEffect(() => {
    const stockHoldings = holdings.filter(h => h.category === 'stocks')
    if (stockHoldings.length === 0) return

    let cancelled = false
    const fetchAllStockPrices = async () => {
      const prices: Record<string, number> = {}
      await Promise.all(
        stockHoldings.map(async (h) => {
          try {
            const tk = await fetchVNTicker(h.symbol)
            prices[h.symbol.toUpperCase()] = tk.price * 1000
          } catch (err) {
            console.error(`Failed to fetch live price for ${h.symbol}:`, err)
          }
        })
      )
      if (!cancelled) {
        console.log('[Stock Realtime]', new Date().toLocaleTimeString(), prices)
        setStockPrices((prev) => ({ ...prev, ...prices }))
      }
    }

    fetchAllStockPrices()
    const timer = setInterval(fetchAllStockPrices, 60000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [holdings])

  // Fetch crypto prices periodically for all crypto holdings (every 10s for near-realtime)
  useEffect(() => {
    const cryptoHoldings = holdings.filter(h => h.category === 'crypto')
    if (cryptoHoldings.length === 0) return

    let cancelled = false
    const fetchAllCryptoPrices = async () => {
      const prices: Record<string, number> = {}
      await Promise.all(
        cryptoHoldings.map(async (h) => {
          try {
            const tk = await fetchCryptoTicker(h.symbol)
            prices[h.symbol.toUpperCase()] = tk.price
          } catch (err) {
            console.error(`Failed to fetch live price for ${h.symbol}:`, err)
          }
        })
      )
      if (!cancelled) {
        setCryptoPrices((prev) => {
          const hasChanged = Object.keys(prices).some(k => prev[k] !== prices[k])
          if (hasChanged) {
            console.log('[Crypto Realtime]', new Date().toLocaleTimeString(), prices)
          }
          return { ...prev, ...prices }
        })
      }
    }

    fetchAllCryptoPrices()
    const timer = setInterval(fetchAllCryptoPrices, 10000) // 10s interval for crypto
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [holdings])

  // Fetch bond prices periodically for all bond holdings
  useEffect(() => {
    const bondHoldings = holdings.filter(h => h.category === 'bonds')
    if (bondHoldings.length === 0) return

    let cancelled = false
    const fetchAllBondPrices = async () => {
      const prices: Record<string, number> = {}
      await Promise.all(
        bondHoldings.map(async (h) => {
          try {
            const tk = await fetchBondTicker(h.symbol)
            prices[h.symbol.toUpperCase()] = tk.price
          } catch (err) {
            console.error(`Failed to fetch live price for ${h.symbol}:`, err)
          }
        })
      )
      if (!cancelled) {
        console.log('[Bond Realtime]', new Date().toLocaleTimeString(), prices)
        setBondPrices((prev) => ({ ...prev, ...prices }))
      }
    }

    fetchAllBondPrices()
    const timer = setInterval(fetchAllBondPrices, 60000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [holdings])

  useEffect(() => {
    const liveQuotes = holdings.flatMap((holding) => {
      const symbol = holding.symbol.toUpperCase()
      let priceVnd: number | null = null

      if (holding.category === 'gold') {
        priceVnd = getGoldUnitPrice(symbol, goldPrices, 'sell')
      } else if (holding.category === 'stocks') {
        priceVnd = stockPrices[symbol] ?? null
      } else if (holding.category === 'crypto') {
        const cryptoPriceUsd = cryptoPrices[symbol]
        priceVnd = cryptoPriceUsd ? cryptoPriceUsd * USD_VND_RATE : null
      } else if (holding.category === 'bonds') {
        priceVnd = bondPrices[symbol] ?? null
      }

      if (!priceVnd || !Number.isFinite(priceVnd) || priceVnd <= 0) {
        return []
      }

      return [{
        assetSymbol: symbol,
        updatedAt: new Date().toISOString(),
        priceVnd: Math.round(priceVnd),
        source: 'frontend-sync' as const,
      }]
    })

    if (!liveQuotes.length) return

    updatePriceQuotes(liveQuotes)
      .then(() => captureDailySnapshot())
      .then(() => listPortfolioSnapshots())
      .then((snapshotList) => {
        setPortfolioSnapshots(snapshotList)
      })
      .catch((error) => {
        console.error('Khong the dong bo bang gia xuong backend:', error)
      })
  }, [holdings, goldPrices, stockPrices, cryptoPrices, bondPrices])

  // Startup Migration: DISABLED - Previously aligned import-existing transactions to live prices,
  // but this incorrectly overwrote user's actual cost basis (capitalAmountVnd, unitPriceVnd) with
  // current market prices, losing the user's real cost data. The new transaction creation flow
  // correctly preserves user's cost (costAmountVnd) while setting current value (currentValueVnd)
  // to live market price, so this migration is no longer needed.
  /*
  useEffect(() => {
    if (loading || transactions.length === 0 || holdings.length === 0) return

    const unalignedTxs = transactions.filter(
      (tx) => tx.transactionType === 'import-existing' && !tx.note?.includes('[Baseline Aligned]')
    )

    if (unalignedTxs.length === 0) return

    let hasPricesForUnaligned = false
    const updatedTransactions = transactions.map((tx) => {
      if (tx.transactionType !== 'import-existing' || tx.note?.includes('[Baseline Aligned]')) {
        return tx
      }

      const symbol = tx.assetSymbol.toUpperCase()
      const existingHolding = holdings.find((h) => h.symbol.toUpperCase() === symbol)
      const category = existingHolding?.category || 'stocks'

      let livePriceVnd: number | null = null
      if (category === 'gold') {
        const goldConfig = getGoldQuoteConfig(symbol)
        const goldUnitPrice = goldConfig ? getGoldUnitPrice(symbol, goldPrices, 'sell') : null
        if (goldUnitPrice) livePriceVnd = goldUnitPrice
      } else if (category === 'stocks') {
        const stockPrice = stockPrices[symbol]
        if (stockPrice) livePriceVnd = stockPrice
      } else if (category === 'crypto') {
        const cryptoPrice = cryptoPrices[symbol]
        if (cryptoPrice) livePriceVnd = cryptoPrice * USD_VND_RATE
      } else if (category === 'bonds') {
        const bondPrice = bondPrices[symbol]
        if (bondPrice) livePriceVnd = bondPrice
      }

      if (livePriceVnd !== null && !isNaN(livePriceVnd) && livePriceVnd > 0 && tx.quantity && tx.quantity > 0) {
        hasPricesForUnaligned = true
        const liveTotalVnd = Math.round(livePriceVnd * tx.quantity)
        
        const noteWithTag = tx.note
          ? (tx.note.includes('[Baseline Aligned]') ? tx.note : `${tx.note} [Baseline Aligned]`)
          : 'Nhập tài sản [Baseline Aligned]'

        return {
          ...tx,
          amountVnd: liveTotalVnd,
          capitalAmountVnd: liveTotalVnd,
          unitPriceVnd: Math.round(livePriceVnd),
          note: noteWithTag
        }
      }

      return tx
    })

    if (!hasPricesForUnaligned) return

    const updatedHoldings = holdings.map((h) => {
      const symbol = h.symbol.toUpperCase()
      const hasUnalignedImport = transactions.some(
        (tx) => tx.assetSymbol === symbol && tx.transactionType === 'import-existing' && !tx.note?.includes('[Baseline Aligned]')
      )

      if (hasUnalignedImport) {
        const alignedTx = updatedTransactions.find(
          (tx) => tx.assetSymbol === symbol && tx.transactionType === 'import-existing'
        )
        if (alignedTx) {
          return {
            ...h,
            valueVnd: alignedTx.amountVnd,
            pnlPercent: 0
          }
        }
      }
      return h
    })

    const performMigration = async () => {
      try {
        console.log('Running startup migration to align baseline cost for legacy import-existing assets...')
        const quotes = await listPriceQuotes()
        await importPortfolioData({
          holdings: updatedHoldings,
          transactions: updatedTransactions,
          priceQuotes: quotes,
          portfolioSnapshots: [],
          categoryTargets: categoryTargets,
          telegramInboxEvents: telegramInboxEvents,
        })
        await loadData()
        showNotification('Đã đồng bộ giá vốn khởi điểm của các tài sản cũ nhập vào về giá thị trường.', 'success')
      } catch (err) {
        console.error('Failed to run startup migration:', err)
      }
    }

    performMigration()

  }, [loading, transactions, holdings, goldPrices, stockPrices, cryptoPrices, bondPrices, categoryTargets, telegramInboxEvents])
  */

  const syncTelegramInboxWithBot = async () => {
    try {
      await ensureTelegramBotRunning()
    } catch (error) {
      console.error('Khong the khoi dong Telegram bot tu dong:', error)
    }

    return syncTelegramInboxFromFile('telegram-bot/inbox-events.json')
  }

  const loadData = async () => {
    try {
      await syncTelegramInboxWithBot().catch((error) => {
        console.error('Khong the auto-sync Telegram inbox tu file bot:', error)
      })

      const [hList, tList, snapshotList, inboxList, targets, priceQuotes] = await Promise.all([
        listHoldings(),
        listTransactions(),
        listPortfolioSnapshots(),
        listTelegramInboxEvents(),
        getCategoryTargets(),
        listPriceQuotes(),
      ])

      const normalizedStore = normalizeLegacyPortfolioData({
        // Crypto is intentionally excluded from the embedded finance surface.
        holdings: hList.filter((holding) => holding.category !== 'crypto'),
        transactions: tList.filter((transaction) => !isLikelyCryptoSymbol(transaction.assetSymbol)),
        portfolioSnapshots: snapshotList,
        telegramInboxEvents: inboxList,
        categoryTargets: targets,
        priceQuotes,
      }, goldPrices)

      if (normalizedStore.changed) {
        await importPortfolioData(normalizedStore)
      }

      await captureDailySnapshot().catch((error) => {
        console.error('Khong the tu dong chup daily snapshot:', error)
      })

      const refreshedSnapshots = await listPortfolioSnapshots()

      const enriched = await enrichTelegramInboxEvents(normalizedStore.telegramInboxEvents)
      const finalInboxList = enriched ? await listTelegramInboxEvents() : normalizedStore.telegramInboxEvents
      setHoldings(normalizedStore.holdings)
      setTransactions(normalizedStore.transactions)
      setPortfolioSnapshots(refreshedSnapshots)
      setTelegramInboxEvents(finalInboxList)
      setCategoryTargets(normalizedStore.categoryTargets)
      
      setSelectedHolding((prev) => {
        if (prev && normalizedStore.holdings.some((h) => h.symbol === prev.symbol)) {
          return normalizedStore.holdings.find((h) => h.symbol === prev.symbol) || normalizedStore.holdings[0]
        }
        return normalizedStore.holdings[0] || null
      })
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu danh mục:', error)
    } finally {
      setLoading(false)
    }
  }

  const executeReset = async () => {
    if (resetInputPassword !== securityPassword) {
      showNotification('Mật khẩu xác nhận không chính xác!', 'error')
      return
    }

    setIsResetting(true)
    try {
      await clearPortfolioData()
      showNotification('Đã xóa sạch dữ liệu ứng dụng về mặc định!', 'success')
      setResetConfirmStep('none')
      setResetInputPassword('')
      loadData()
    } catch (e) {
      showNotification('Lỗi khi xóa dữ liệu!', 'error')
      console.error(e)
    } finally {
      setIsResetting(false)
    }
  }

  const executeImport = async () => {
    if (!importData) return
    try {
      await importPortfolioData(importData)
      showNotification('Đã nhập dữ liệu và khôi phục thành công!', 'success')
      setImportData(null)
      loadData()
    } catch (err) {
      showNotification('File sao lưu không hợp lệ hoặc bị lỗi!', 'error')
      console.error(err)
    }
  }

  const handleCreateTelegramInboxEvent = async () => {
    const rawText = telegramCommandInput.trim()
    if (!rawText) {
      showNotification('Nhập câu lệnh Telegram trước khi tạo inbox event.', 'info')
      return
    }

    setIsTelegramSubmitting(true)
    try {
      const parsed = parseTelegramCommand(rawText)
      await createTelegramInboxEvent(parsed)
      setTelegramCommandInput('')
      await loadData()
      showNotification(
        parsed.draftTransaction
          ? 'Đã tạo giao dịch Telegram chờ duyệt.'
          : 'Đã lưu Telegram event để xem lại vì parser chưa hiểu rõ.',
        parsed.draftTransaction ? 'success' : 'info',
      )
    } catch (error) {
      console.error('Lỗi khi tạo Telegram inbox event:', error)
      showNotification('Không thể lưu Telegram inbox event.', 'error')
    } finally {
      setIsTelegramSubmitting(false)
    }
  }

  const handleApproveTelegramInboxEvent = async (id: string) => {
    try {
      const { transaction } = await approveTelegramInboxEvent(id)
      
      const sym = transaction.assetSymbol.toUpperCase()
      const existingHolding = holdings.find(h => h.symbol.toUpperCase() === sym)
      
      // Determine category
      let category: AssetCategory = 'stocks'
      if (existingHolding) {
        category = existingHolding.category
      } else {
        if (sym === 'CASH') category = 'cash'
        else if (['VNHAN', 'VMIENG', 'VKIENG', 'GOLD', 'VANG', 'SJC'].includes(sym)) category = 'gold'
        else if (['BTC', 'ETH', 'BNB', 'SOL', 'ADA', 'XRP', 'DOGE', 'DOT', 'AVAX', 'LINK', 'LTC', 'UNI', 'SHIB', 'MATIC', 'USDT'].includes(sym)) category = 'crypto'
        else if (sym.startsWith('E1') || sym.startsWith('FUE') || sym.includes('ETF')) category = 'stocks'
        else if (sym.startsWith('STK-')) category = 'savings'
      }

      // Determine asset name
      let assetName = sym
      if (existingHolding) {
        assetName = existingHolding.name
      } else {
        if (sym === 'CASH') assetName = 'Ví VND'
        else if (sym === 'VNHAN') assetName = 'Vàng nhẫn'
        else if (sym === 'VMIENG') assetName = 'Vàng miếng SJC'
        else if (sym === 'VKIENG') assetName = 'Vàng kiềng'
      }

      const txType = transaction.transactionType
      const amountVnd = transaction.amountVnd
      const parsedQty = transaction.quantity || 0
      const resolvedUnit = transaction.unit || (category === 'gold' ? (sym === 'VMIENG' ? 'lượng' : 'chỉ') : category === 'crypto' ? 'coin' : 'đơn vị')

      if (sym !== 'CASH') {
        const nextHoldingState = buildAppliedHoldingState(existingHolding, {
          txType,
          amountVnd,
          quantity: parsedQty,
          resolvedUnit,
          costAmountVnd: transaction.capitalAmountVnd,
        })

        if (nextHoldingState.newValue <= 0 || nextHoldingState.newQty <= 0) {
          await deleteHolding(sym)
        } else {
          await upsertHolding({
            symbol: sym,
            name: assetName,
            category: category,
            group: category === 'cash' ? 'Ví thanh toán' : (category === 'savings' ? 'Đang gửi' : 'Tài sản'),
            valueVnd: nextHoldingState.newValue,
            quantity: nextHoldingState.quantityLabel,
            allocationPercent: 0,
            targetPercent: categoryTargets[category] ?? 20,
            pnlPercent: txType === 'import-existing' ? 0 : nextHoldingState.newPnl
          })
        }
      }

      // Cash wallet update if transaction uses wallet
      if (transaction.fundingSource === 'wallet') {
        const cashHolding = holdings.find(h => h.symbol.toUpperCase() === 'CASH')
        const cashBalance = cashHolding ? cashHolding.valueVnd : 0
        const walletImpact = transaction.walletImpactVnd ?? (txType === 'buy' ? -amountVnd : txType === 'sell' ? amountVnd : 0)
        const newCashValue = Math.max(0, cashBalance + walletImpact)

        await upsertHolding({
          symbol: 'CASH',
          name: cashHolding?.name || 'Ví VND',
          category: 'cash',
          group: 'Ví thanh toán',
          valueVnd: newCashValue,
          quantity: cashHolding?.quantity || `${newCashValue / 1000000} triệu VND`,
          allocationPercent: 0,
          targetPercent: categoryTargets['savings'] ?? 15,
          pnlPercent: 0
        })
      }

      await capturePortfolioSnapshot(transaction.id)
      await loadData()
      showNotification('Đã duyệt giao dịch Telegram, cập nhật danh mục và ví tiền.', 'success')
    } catch (error: any) {
      console.error('Lỗi khi duyệt Telegram inbox event:', error)
      const msg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error))
      showNotification(`Không thể duyệt giao dịch Telegram này: ${msg}`, 'error')
    }
  }

  const handleRejectTelegramInboxEvent = async (id: string) => {
    try {
      await rejectTelegramInboxEvent(id)
      await loadData()
      showNotification('Đã từ chối Telegram inbox event.', 'info')
    } catch (error) {
      console.error('Lỗi khi từ chối Telegram inbox event:', error)
    }
  }

  const handleUpdateTelegramInboxEvent = async (id: string, updatedDraft: TelegramInboxParsedPayload) => {
    try {
      await updateTelegramInboxEvent({
        id,
        draftTransaction: updatedDraft,
        parseError: undefined,
      })
      await loadData()
      showNotification('Đã cập nhật thông tin giao dịch.', 'success')
    } catch (error) {
      console.error('Lỗi khi cập nhật Telegram inbox event:', error)
      showNotification('Không thể cập nhật giao dịch này.', 'error')
    }
  }

  const handleSyncTelegramInbox = async () => {
    setIsTelegramSyncing(true)
    try {
      const result = await syncTelegramInboxWithBot()
      await loadData()
      showNotification(
        result.importedCount > 0
          ? `Đã sync ${result.importedCount} Telegram event mới.`
          : 'Không có Telegram event mới để sync.',
        result.importedCount > 0 ? 'success' : 'info',
      )
    } catch (error) {
      console.error('Lỗi khi sync Telegram inbox file:', error)
      showNotification('Không thể sync Telegram inbox từ file bot.', 'error')
    } finally {
      setIsTelegramSyncing(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const syncTelegramInBackground = async () => {
      try {
        const result = await syncTelegramInboxWithBot()
        if (!cancelled && result.importedCount > 0) {
          await loadData()
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Loi sync Telegram nen:', error)
        }
      }
    }

    void syncTelegramInBackground()
    const timer = setInterval(() => {
      void syncTelegramInBackground()
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const handleEditTransaction = (tx: TransactionRecord) => {
    setTransactionToEdit(tx)
    setDefaultSymbol(tx.assetSymbol)
    setDefaultType('Nhập tài sản')
    setIsModalOpen(true)
  }

  const executeDeleteTransactionQuietly = async (id: string, currentTransactions = transactions, currentHoldings = holdings) => {
    try {
      const tx = currentTransactions.find(t => t.id === id)
      if (!tx) return

      const sym = tx.assetSymbol.toUpperCase()
      const txType = tx.transactionType
      const amount = tx.amountVnd
      const walletImpact = tx.walletImpactVnd ?? (txType === 'buy' ? -amount : txType === 'sell' ? amount : 0)

      const cashHolding = currentHoldings.find(h => h.symbol === 'CASH')

      if (sym === 'CASH') {
        if (cashHolding) {
          let newValue = cashHolding.valueVnd
          if (txType === 'deposit') newValue = Math.max(0, newValue - amount)
          else if (txType === 'withdraw') newValue = newValue + amount
          
          await upsertHolding({
            ...cashHolding,
            valueVnd: newValue,
            quantity: `${newValue / 1000000} triệu VND`
          })
        }
      } else {
        const holding = currentHoldings.find(h => h.symbol === sym)
        if (holding) {
          const nextHoldingState = buildDeletedHoldingState(holding, tx)
          let newValue = nextHoldingState.newValue
          let newPnl = nextHoldingState.newPnl
          if (nextHoldingState.shouldDelete || nextHoldingState.newValue <= 0) {
            await deleteHolding(sym)
          } else {
            let dbQty = nextHoldingState.quantity
            if (holding.category === 'savings' && txType === 'sell' && holding.quantity.startsWith('{')) {
              try {
                const parsed = JSON.parse(holding.quantity)
                parsed.status = 'active'
                delete parsed.settleDate
                delete parsed.settleAmount
                dbQty = JSON.stringify(parsed)
              } catch (e) {}
            }

            await upsertHolding({
              ...holding,
              valueVnd: newValue,
              quantity: dbQty,
              pnlPercent: newPnl
            })
          }
        }

        const isWallet = tx.fundingSource === 'wallet' || (!tx.fundingSource && (txType === 'buy' || txType === 'sell'))
        if (isWallet && (txType === 'buy' || txType === 'sell')) {
          if (cashHolding) {
            const newCashValue = Math.max(0, cashHolding.valueVnd - walletImpact)

            await upsertHolding({
              ...cashHolding,
              valueVnd: newCashValue,
              quantity: `${newCashValue / 1000000} triệu VND`
            })
          }
        }
      }

      await deleteTransaction(id)
      await capturePortfolioSnapshot(`DELETE-${id}`)
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteTransaction = (id: string) => {
    setTxToDelete(id)
  }

  const handleDeleteConfirmKeyDown = async (
    event: React.KeyboardEvent<HTMLElement>,
    id: string,
  ) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    await executeDeleteTransaction(id)
  }

  const executeDeleteTransaction = async (id: string) => {
    try {
      const tx = transactions.find(t => t.id === id)
      if (!tx) return

      const sym = tx.assetSymbol.toUpperCase()
      const txType = tx.transactionType
      const amount = tx.amountVnd
      const walletImpact = tx.walletImpactVnd ?? (txType === 'buy' ? -amount : txType === 'sell' ? amount : 0)

      // 1. Adjust holdings
      const cashHolding = holdings.find(h => h.symbol === 'CASH')

      if (sym === 'CASH') {
        if (cashHolding) {
          let newValue = cashHolding.valueVnd
          if (txType === 'deposit') newValue = Math.max(0, newValue - amount)
          else if (txType === 'withdraw') newValue = newValue + amount
          
          await upsertHolding({
            ...cashHolding,
            valueVnd: newValue,
            quantity: `${newValue / 1000000} triệu VND`
          })
        }
      } else {
        const holding = holdings.find(h => h.symbol === sym)
        if (holding) {
          const nextHoldingState = buildDeletedHoldingState(holding, tx)
          let newValue = nextHoldingState.newValue
          let newPnl = nextHoldingState.newPnl
          if (nextHoldingState.shouldDelete || nextHoldingState.newValue <= 0) {
            await deleteHolding(sym)
          } else {
            let dbQty = nextHoldingState.quantity
            /*
            let costAmount = amount
            if (false) {
              void amount
              void txType
                const match = tx.note.match(/\[Giá v[^:]*:\s*([\d.]+)\]/)
                if (match) {
                  const costStr = match[1].replace(/\./g, '')
                  costAmount = parseFloat(costStr) || amount
                }
              }
              const oldCost = holding.valueVnd / (1 + (holding.pnlPercent || 0) / 100)
              const newCost = Math.max(0, oldCost - costAmount)
              if (newCost > 0) {
                newPnl = ((newValue - newCost) / newCost) * 100
              } else {
                newPnl = 0
              }
            }
            */
            dbQty = nextHoldingState.quantity
            if (holding.category === 'savings' && txType === 'sell' && holding.quantity.startsWith('{')) {
              try {
                const parsed = JSON.parse(holding.quantity)
                parsed.status = 'active'
                delete parsed.settleDate
                delete parsed.settleAmount
                dbQty = JSON.stringify(parsed)
              } catch (e) {}
            }

            await upsertHolding({
              ...holding,
              valueVnd: newValue,
              quantity: dbQty,
              pnlPercent: newPnl
            })
          }
        }

        const isWallet = tx.fundingSource === 'wallet' || (!tx.fundingSource && (txType === 'buy' || txType === 'sell'))
        if (isWallet && (txType === 'buy' || txType === 'sell')) {
          if (cashHolding) {
            const newCashValue = Math.max(0, cashHolding.valueVnd - walletImpact)

            await upsertHolding({
              ...cashHolding,
              valueVnd: newCashValue,
              quantity: `${newCashValue / 1000000} triệu VND`
            })
          }
        }
      }

      // 2. Delete transaction from DB
      await deleteTransaction(id)
      await capturePortfolioSnapshot(`DELETE-${id}`)

      // 3. Reload data
      await loadData()
      showNotification('Đã xóa giao dịch thành công!', 'success')
    } catch (err) {
      console.error(err)
      showNotification('Lỗi khi xóa giao dịch.', 'error')
    } finally {
      setTxToDelete(null)
    }
  }

  useEffect(() => {
    loadData()
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      document.body.classList.add('tauri-runtime')
    }
  }, [])

  const holdingsWithLivePrices = useMemo(() => {
    return holdings.map((item) => {
      if (item.category === 'savings' || item.symbol.startsWith('STK-')) {
        try {
          if (item.quantity.startsWith('{')) {
            const meta = JSON.parse(item.quantity)
            if (meta.status === 'settled') {
              return {
                ...item,
                valueVnd: 0,
              }
            }
          }
        } catch (e) {}
      }

      const pQty = parseQtyString(item.quantity)
      if (pQty <= 0) return item

      let livePrice: number | null = null

      if (item.category === 'gold') {
        const goldConfig = getGoldQuoteConfig(item.symbol)
        const goldUnitPrice = goldConfig ? getGoldUnitPrice(item.symbol, goldPrices, 'sell') : null
        if (goldUnitPrice) livePrice = goldUnitPrice
      } else if (item.category === 'stocks') {
        const stockPrice = stockPrices[item.symbol.toUpperCase()]
        if (stockPrice) livePrice = stockPrice
      } else if (item.category === 'crypto') {
        const cryptoPrice = cryptoPrices[item.symbol.toUpperCase()]
        if (cryptoPrice) livePrice = cryptoPrice * USD_VND_RATE
      } else if (item.category === 'bonds') {
        const bondPrice = bondPrices[item.symbol.toUpperCase()]
        if (bondPrice) livePrice = bondPrice
      }

      if (livePrice !== null) {
        const cost = item.valueVnd / (1 + (item.pnlPercent || 0) / 100)
        const currentValue = Math.round(pQty * livePrice)
        const pnlVnd = currentValue - cost
        const pnlPercent = cost > 0 ? (pnlVnd / cost) * 100 : 0
        return {
          ...item,
          valueVnd: currentValue,
          pnlPercent: pnlPercent,
        }
      }

      return item
    })
  }, [holdings, goldPrices, stockPrices, cryptoPrices, bondPrices])

  const totalValue = useMemo(() => holdingsWithLivePrices.reduce((sum, item) => sum + item.valueVnd, 0), [holdingsWithLivePrices])
  const holdingsWithAllocation = useMemo(() => {
    return holdingsWithLivePrices.map(item => ({
      ...item,
      allocationPercent: totalValue > 0 ? (item.valueVnd / totalValue) * 100 : 0
    }))
  }, [holdingsWithLivePrices, totalValue])
  const resolvedSelectedHolding = useMemo(() => {
    if (!selectedHolding) return null
    return holdingsWithAllocation.find(h => h.symbol === selectedHolding.symbol) || null
  }, [selectedHolding, holdingsWithAllocation])
  const gain = useMemo(() => holdingsWithLivePrices.reduce((sum, item) => {
    const cost = item.valueVnd / (1 + (item.pnlPercent || 0) / 100)
    return sum + Math.round(item.valueVnd - cost)
  }, 0), [holdingsWithLivePrices])
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        if (selectedType === 'Tất cả') return true
        return translateTxType(tx.transactionType) === selectedType
      })
      .sort(compareTransactionsDesc)
  }, [transactions, selectedType])
  const pendingTelegramInboxEvents = useMemo(
    () => telegramInboxEvents.filter((event) => event.status === 'pending'),
    [telegramInboxEvents],
  )
  const isSecuritiesActive = screen === 'stocks' || screen === 'bonds'

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''} ${privacyMode ? 'stealth-mode' : ''}`}>
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="brand" data-tauri-drag-region>
          <div className="brand-layout">
            <div className="brand-mark">
              <span />
              <span />
            </div>
            <div className="brand-text">
              <strong>DBY Finance</strong>
              <small>Quản lý danh mục cá nhân</small>
            </div>
          </div>
          <button
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            type="button"
          >
            <Menu size={18} />
          </button>
        </div>

        <div className="sidebar-nav">
          <nav className="nav-list" aria-label="Điều hướng chính">
            <div className="nav-group">
              {primaryNav.map((item) => {
                const Icon = item.icon
                const isAsset = CATEGORY_ICON_MAP[item.id] !== undefined
                return (
                  <button
                    className={screen === item.id ? 'nav-item active' : 'nav-item'}
                    key={item.id}
                    onClick={() => setScreen(item.id)}
                    type="button"
                  >
                    {isAsset
                      ? <CategoryIcon category={item.id} size={28} />
                      : <Icon size={18} />}
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="nav-group">
              <button
                className={isSecuritiesActive ? 'nav-item has-children active' : 'nav-item has-children'}
                onClick={() => {
                  if (isSidebarCollapsed) {
                    setIsSidebarCollapsed(false)
                    return
                  }
                  setIsSecuritiesOpen((prev) => !prev)
                }}
                type="button"
              >
                <CategoryIcon category="stocks" size={28} />
                <span>Chứng khoán</span>
                <span className="nav-item-caret" aria-hidden="true">
                  {isSecuritiesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              </button>

              {isSecuritiesOpen && !isSidebarCollapsed && (
                <div className="nav-submenu" aria-label="Danh mục chứng khoán">
                  {securitiesNav.map((item) => (
                    <button
                      className={screen === item.id ? 'nav-item nav-subitem active' : 'nav-item nav-subitem'}
                      key={item.id}
                      onClick={() => setScreen(item.id)}
                      type="button"
                    >
                      <CategoryIcon category={item.id} size={22} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {investmentNav.map((item) => (
                <button
                  className={screen === item.id ? 'nav-item active' : 'nav-item'}
                  key={item.id}
                  onClick={() => setScreen(item.id)}
                  type="button"
                >
                  <CategoryIcon category={item.id} size={28} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </nav>

          <nav className="nav-list nav-footer" aria-label="Tiện ích & hệ thống">
            <div className="nav-group">
              {utilityNav.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    className={screen === item.id ? 'nav-item active' : 'nav-item'}
                    key={item.id}
                    onClick={() => setScreen(item.id)}
                    type="button"
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </nav>

          <nav className="nav-list nav-settings" aria-label="Cài đặt">
            {settingsNav.map((item) => {
              const Icon = item.icon
              return (
                <button
                  className={screen === item.id ? 'nav-item active' : 'nav-item'}
                  key={item.id}
                  onClick={() => setScreen(item.id)}
                  type="button"
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

      </aside>

      <main className="main">

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <span>Đang tải dữ liệu...</span>
          </div>
        ) : (
          <>
            {screen === 'overview' && (
              <Overview
                gain={gain}
                selectedHolding={resolvedSelectedHolding || (holdingsWithAllocation.length > 0 ? holdingsWithAllocation[0] : null)}
                setSelectedHolding={setSelectedHolding}
                totalValue={totalValue}
                holdings={holdingsWithAllocation}
                transactions={transactions}
                portfolioSnapshots={portfolioSnapshots}
                onRefresh={loadData}
                onDeleteTransaction={handleDeleteTransaction}
                onEditTransaction={handleEditTransaction}
                goldPrices={goldPrices}
                categoryTargets={categoryTargets}
              />
            )}
            {isCategoryScreen(screen) && (
              <CategoryView
                category={screen}
                key={screen}
                onOpenModal={(sym, type) => {
                  setDefaultSymbol(sym || '')
                  setDefaultType(type)
                  setIsModalOpen(true)
                }}
                onEditTransaction={handleEditTransaction}
                holdings={holdingsWithAllocation}
                transactions={transactions}
                onDeleteTransaction={handleDeleteTransaction}
                onRefresh={loadData}
                goldPrices={goldPrices}
              />
            )}
            {screen === 'ledger' && (
              <Ledger
                filteredTransactions={filteredTransactions}
                telegramInboxEvents={pendingTelegramInboxEvents}
                selectedType={selectedType}
                setSelectedType={setSelectedType}
                telegramCommandInput={telegramCommandInput}
                setTelegramCommandInput={setTelegramCommandInput}
                onCreateTelegramInboxEvent={handleCreateTelegramInboxEvent}
                onApproveTelegramInboxEvent={handleApproveTelegramInboxEvent}
                onRejectTelegramInboxEvent={handleRejectTelegramInboxEvent}
                isTelegramSubmitting={isTelegramSubmitting}
                onSyncTelegramInbox={handleSyncTelegramInbox}
                isTelegramSyncing={isTelegramSyncing}
                onDeleteTransaction={handleDeleteTransaction}
                onUpdateTelegramInboxEvent={handleUpdateTelegramInboxEvent}
                onEditTransaction={handleEditTransaction}
              />
            )}
            {screen === 'settings' && (
              <SettingsPanel
                privacyMode={privacyMode}
                setPrivacyMode={setPrivacyMode}
                appTheme={appTheme}
                setAppTheme={setAppTheme}
                mainCurrency={mainCurrency}
                setMainCurrency={setMainCurrency}
                driftThreshold={driftThreshold}
                setDriftThreshold={setDriftThreshold}
                goldApiSource={goldApiSource}
                setGoldApiSource={setGoldApiSource}
                securityPassword={securityPassword}
                setSecurityPassword={setSecurityPassword}
                showNotification={showNotification}
                onTriggerReset={() => setResetConfirmStep('warning')}
                onTriggerImport={(data) => setImportData(data)}
              />
            )}
          </>
        )}
      </main>

      {isModalOpen && (
        <TransactionModal
          onClose={() => {
            setIsModalOpen(false)
            setDefaultSymbol('')
            setDefaultType(undefined)
            setTransactionToEdit(null)
          }}
          holdings={holdingsWithAllocation}
          transactions={transactions}
          onSave={loadData}
          defaultCategory={isCategoryScreen(screen) ? screen : undefined}
          defaultSymbol={defaultSymbol}
          defaultType={defaultType}
          showNotification={showNotification}
          goldPrices={goldPrices}
          categoryTargets={categoryTargets}
          stockPrices={stockPrices}
          cryptoPrices={cryptoPrices}
          bondPrices={bondPrices}
          transactionToEdit={transactionToEdit}
          onDeleteTransactionQuietly={executeDeleteTransactionQuietly}
        />
      )}

      {txToDelete && (
        <div className="modal-backdrop" onMouseDown={() => setTxToDelete(null)} role="presentation">
          <section
            aria-label="Xác nhận xóa"
            aria-modal="true"
            className="confirm-modal"
            onKeyDown={(event) => handleDeleteConfirmKeyDown(event, txToDelete)}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <h3 className="confirm-modal-title">Xác nhận xóa</h3>
            <p className="confirm-modal-body">
              Bạn có chắc chắn muốn xóa giao dịch này? Hành động này sẽ tự động khôi phục số dư tài sản tương ứng và không thể hoàn tác.
            </p>
            <div className="confirm-modal-actions">
              <button className="cancel-btn" onClick={() => setTxToDelete(null)} type="button">
                Hủy
              </button>
              <button className="delete-btn" onClick={() => executeDeleteTransaction(txToDelete)} type="button">
                Xóa
              </button>
            </div>
          </section>
        </div>
      )}

      {resetConfirmStep === 'warning' && (
        <div className="modal-backdrop" onMouseDown={() => setResetConfirmStep('none')} role="presentation">
          <section
            aria-label="Cảnh báo xóa dữ liệu"
            aria-modal="true"
            className="confirm-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <h3 className="confirm-modal-title" style={{ color: 'var(--color-red)' }}>Cảnh báo cực kỳ quan trọng</h3>
            <p className="confirm-modal-body">
              Việc này sẽ <strong>XÓA SẠCH</strong> toàn bộ lịch sử giao dịch và tài sản của bạn trong ứng dụng này. Thao tác này <strong>KHÔNG THỂ HỦY BỎ</strong>. Bạn có thực sự muốn tiếp tục?
            </p>
            <div className="confirm-modal-actions">
              <button className="cancel-btn" onClick={() => setResetConfirmStep('none')} type="button">
                Hủy bỏ
              </button>
              <button 
                className="delete-btn" 
                onClick={() => {
                  setResetConfirmStep('password')
                  setResetInputPassword('')
                }} 
                type="button"
              >
                Tiếp tục
              </button>
            </div>
          </section>
        </div>
      )}

      {resetConfirmStep === 'password' && (
        <div className="modal-backdrop" onMouseDown={() => {
          if (!isResetting) {
            setResetConfirmStep('none')
            setResetInputPassword('')
          }
        }} role="presentation">
          <section
            aria-label="Xác nhận mật khẩu xóa dữ liệu"
            aria-modal="true"
            className="confirm-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <h3 className="confirm-modal-title">Xác nhận mật khẩu</h3>
            <p className="confirm-modal-body">
              Vui lòng nhập mật khẩu xác nhận của bạn để tiến hành xóa dữ liệu (mặc định: admin).
            </p>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="password"
                className="settings-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                value={resetInputPassword}
                onChange={(e) => setResetInputPassword(e.target.value)}
                placeholder="Nhập mật khẩu xác nhận"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    executeReset()
                  }
                }}
              />
            </div>
            <div className="confirm-modal-actions">
              <button 
                className="cancel-btn" 
                onClick={() => {
                  setResetConfirmStep('none')
                  setResetInputPassword('')
                }} 
                disabled={isResetting}
                type="button"
              >
                Hủy bỏ
              </button>
              <button 
                className="delete-btn" 
                onClick={executeReset}
                disabled={isResetting}
                type="button"
              >
                {isResetting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </section>
        </div>
      )}

      {importData && (
        <div className="modal-backdrop" onMouseDown={() => setImportData(null)} role="presentation">
          <section
            aria-label="Xác nhận khôi phục dữ liệu"
            aria-modal="true"
            className="confirm-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <h3 className="confirm-modal-title" style={{ color: 'var(--color-primary)' }}>Xác nhận khôi phục</h3>
            <p className="confirm-modal-body">
              <strong>LƯU Ý:</strong> Việc khôi phục dữ liệu từ file sao lưu sẽ <strong>GHI ĐÈ</strong> toàn bộ dữ liệu hiện tại của bạn. Bạn có chắc chắn muốn tiếp tục không?
            </p>
            <div className="confirm-modal-actions">
              <button className="cancel-btn" onClick={() => setImportData(null)} type="button">
                Hủy bỏ
              </button>
              <button className="delete-btn" style={{ background: 'var(--color-primary)' }} onClick={executeImport} type="button">
                Khôi phục
              </button>
            </div>
          </section>
        </div>
      )}

      {notification && (
        <div className="toast-container">
          <div className={`toast toast-${notification.type}`} role="alert">
            {notification.type === 'success' ? (
              <CheckCircle size={18} style={{ marginTop: '2px' }} />
            ) : (
              <AlertCircle size={18} style={{ marginTop: '2px' }} />
            )}
            <div className="toast-content">
              <span className="toast-title">
                {notification.type === 'success' ? 'Thành công' : 'Thông báo'}
              </span>
              <span className="toast-message">{notification.message}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DonutChart({
  data,
  total,
}: {
  data: Array<{ name: string; value: number; color: string; percent: number }>
  total: number
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  
  // Calculate segments
  let cumulativePercent = 0
  const segments = data.map((d, index) => {
    const startPercent = cumulativePercent
    cumulativePercent += d.percent
    return {
      ...d,
      startPercent,
      index
    }
  })
  
  const hoveredData = hoveredIndex !== null ? data[hoveredIndex] : null
  
  if (total === 0 || data.length === 0) {
    return (
      <div className="donut-chart-layout" style={{ justifyContent: 'center', padding: '24px 0' }}>
        <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <CircleDollarSign size={32} style={{ margin: '0 auto 8px auto', display: 'block', opacity: 0.5 }} />
          <span style={{ fontSize: '13px' }}>Chưa có dữ liệu tài sản</span>
        </div>
      </div>
    )
  }
  
  return (
    <div className="donut-chart-layout">
      <div style={{ position: 'relative', width: '150px', height: '150px', flexShrink: 0, margin: '0 auto' }}>
        <svg viewBox="0 0 160 160" width="150" height="150" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
          {/* Base circle background */}
          <circle
            cx="80"
            cy="80"
            r="60"
            fill="transparent"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="12"
          />
          
          {/* Segments */}
          {segments.map((seg) => {
            const isHovered = hoveredIndex === seg.index
            const strokeWidth = isHovered ? 16 : 12
            
            return (
              <circle
                key={seg.name}
                cx="80"
                cy="80"
                r="60"
                fill="transparent"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${(seg.percent / 100) * 376.99} 376.99`}
                strokeDashoffset={-((seg.startPercent / 100) * 376.99)}
                style={{
                  transition: 'all 200ms ease',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => setHoveredIndex(seg.index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            )
          })}
        </svg>
        
        {/* Center Text */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
          width: '95px',
        }}>
          <span style={{
            fontSize: '10px',
            color: 'var(--color-text-secondary)',
            display: 'block',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {hoveredData ? hoveredData.name : 'Tổng tài sản'}
          </span>
          <strong style={{
            fontSize: '13px',
            fontWeight: '800',
            color: 'var(--color-text-primary)',
            display: 'block',
            marginTop: '2px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {formatMoney(hoveredData ? hoveredData.value : total)}
          </strong>
          <small style={{
            fontSize: '10px',
            color: hoveredData ? hoveredData.color : 'var(--color-primary)',
            fontWeight: '700',
            display: 'block',
            marginTop: '2px'
          }}>
            {hoveredData ? `${hoveredData.percent.toFixed(1)}%` : '100%'}
          </small>
        </div>
      </div>
      
      {/* Legend Column */}
      <div style={{
        flex: 1,
        minWidth: '180px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        paddingRight: '4px'
      }}>
        {data.map((d, idx) => {
          const isHovered = hoveredIndex === idx
          return (
            <div
              key={d.name}
              className={`legend-item-v2 ${isHovered ? 'hovered' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '6px',
                background: isHovered ? 'var(--color-soft-button-bg)' : 'transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: d.color,
                display: 'inline-block',
                flexShrink: 0
              }} />
              <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center', minWidth: 0, gap: '8px' }}>
                <span style={{ 
                  color: 'var(--color-text-secondary)', 
                  fontWeight: '600',
                  fontSize: '12px',
                  lineHeight: '1.3',
                  flex: 1
                }} title={d.name}>
                  {d.name}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, lineHeight: '1.2' }}>
                  <span style={{ color: d.color, fontWeight: '800', fontSize: '12px' }}>
                    {d.percent.toFixed(1)}%
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '10.5px', marginTop: '2px', opacity: 0.85, fontWeight: '500' }}>
                    {formatMoney(d.value)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatMoneyShort(val: number) {
  if (localStorage.getItem('dbyfinance-privacy-mode') === 'true') {
    return '******'
  }
  if (val >= 1e9) {
    return `${(val / 1e9).toFixed(1)} tỷ`
  }
  if (val >= 1e6) {
    return `${(val / 1e6).toFixed(0)} tr`
  }
  return formatMoney(val)
}

function formatChartYAxisLabel(val: number, range: number) {
  if (localStorage.getItem('dbyfinance-privacy-mode') === 'true') {
    return '******'
  }

  if (val >= 1e9) {
    const decimals = range < 100_000_000 ? 2 : range < 500_000_000 ? 2 : 1
    return `${(val / 1e9).toFixed(decimals)} tỷ`
  }

  if (val >= 1e6) {
    const decimals = range < 10_000_000 ? 1 : 0
    return `${(val / 1e6).toFixed(decimals)} tr`
  }

  return formatMoney(val)
}

function generateNiceYAxisTicks(min: number, max: number, maxTicks: number = 4) {
  const safeMin = Number.isFinite(min) ? min : 0
  const safeMax = Number.isFinite(max) ? max : safeMin

  if (safeMin === safeMax) {
    const padding = safeMax === 0 ? 1_000_000 : Math.max(1, safeMax * 0.05)
    const niceMin = Math.max(0, safeMin - padding)
    const niceMax = safeMax + padding
    const step = (niceMax - niceMin) / Math.max(1, maxTicks - 1)
    const ticks = Array.from({ length: maxTicks }, (_, index) => niceMin + step * index)
    return { niceMin, niceMax, ticks, tickStep: step }
  }

  const clampTicks = Math.max(2, maxTicks)
  const rawRange = Math.max(1, safeMax - safeMin)
  const roughStep = rawRange / (clampTicks - 1)
  const exponent = Math.floor(Math.log10(roughStep))
  const magnitude = 10 ** exponent
  const normalized = roughStep / magnitude

  let niceNormalized = 10
  if (normalized <= 1) niceNormalized = 1
  else if (normalized <= 2) niceNormalized = 2
  else if (normalized <= 5) niceNormalized = 5

  const tickStep = niceNormalized * magnitude
  const niceMin = Math.max(0, Math.floor(safeMin / tickStep) * tickStep)
  const niceMax = Math.ceil(safeMax / tickStep) * tickStep

  const ticks: number[] = []
  for (let tick = niceMin; tick <= niceMax + tickStep * 0.5; tick += tickStep) {
    ticks.push(tick)
  }

  return { niceMin, niceMax, ticks, tickStep }
}

const generateHistoricalData = (
  transactions: TransactionRecord[],
  holdings: HoldingRecord[],
  totalValue: number,
  portfolioSnapshots: PortfolioHistorySnapshot[] = [],
) => {
  const now = new Date()
  const todayKey = now.toISOString().split('T')[0]
  const intradayPointCount = 36

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const startTime = todayStart.getTime()

  const simulatedTxs: TransactionRecord[] = []
  holdings.forEach(h => {
    const hasTx = transactions.some(tx => tx.assetSymbol === h.symbol)
    if (!hasTx && h.valueVnd > 0) {
      const isSavings = h.category === 'savings' || h.symbol.startsWith('STK-')
      const cost = isSavings
        ? h.valueVnd
        : (h.pnlPercent <= -100
          ? h.valueVnd
          : h.valueVnd / (1 + (h.pnlPercent || 0) / 100))

      let simulatedDate = todayKey
      if (isSavings) {
        try {
          if (h.quantity.startsWith('{')) {
            const meta = JSON.parse(h.quantity)
            if (meta.startDate && meta.startDate !== '-') {
              simulatedDate = meta.startDate
            }
          }
        } catch (e) {
          // ignore
        }
      }

      simulatedTxs.push({
        id: `simulated-${h.symbol}`,
        date: simulatedDate,
        occurredAt: new Date(startTime - 1000).toISOString(),
        transactionType: 'import-existing',
        assetSymbol: h.symbol,
        amountVnd: h.valueVnd,
        status: 'done',
        note: '',
        capitalAmountVnd: cost,
        quantity: 1,
        unit: 'don vi',
        unitPriceVnd: h.valueVnd,
        feeVnd: 0,
        walletImpactVnd: 0,
        linkedAssetSymbol: h.symbol,
        fundingSource: 'opening-balance',
      })
    }
  })

  const inferredSettledSavingsOpeningTxs: TransactionRecord[] = []
  const baseTxs = [...transactions, ...simulatedTxs]
  baseTxs.forEach((tx) => {
    if (tx.transactionType !== 'sell' || !tx.assetSymbol.startsWith('STK-')) return

    try {
      const meta = JSON.parse(tx.note || '{}')
      if (meta.type !== 'savings') return

      const principal = Number(meta.principal || 0)
      const startDateStr = typeof meta.startDate === 'string' ? meta.startDate : ''
      if (!Number.isFinite(principal) || principal <= 0 || !startDateStr) return

      const hasOpeningTx = baseTxs.some((existingTx) =>
        existingTx.assetSymbol === tx.assetSymbol &&
        (existingTx.transactionType === 'buy' || existingTx.transactionType === 'import-existing') &&
        existingTx.id !== tx.id,
      )

      if (hasOpeningTx) return

      inferredSettledSavingsOpeningTxs.push({
        id: `inferred-open-${tx.id}`,
        date: startDateStr,
        occurredAt: `${startDateStr}T00:00:00.000Z`,
        transactionType: 'import-existing',
        assetSymbol: tx.assetSymbol,
        amountVnd: principal,
        status: 'done',
        note: '[Inferred savings opening]',
        quantity: 1,
        unit: 'so',
        unitPriceVnd: principal,
        capitalAmountVnd: principal,
        feeVnd: 0,
        walletImpactVnd: 0,
        linkedAssetSymbol: tx.assetSymbol,
        fundingSource: 'opening-balance',
      })
    } catch {
      // ignore malformed legacy savings metadata
    }
  })

  const allTxs = [...baseTxs, ...inferredSettledSavingsOpeningTxs]
  const sortedTx = allTxs
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((tx) => {
      let effectiveTime = new Date(tx.date).getTime()
      if (tx.occurredAt) {
        const occurredAt = new Date(tx.occurredAt)
        const occurredAtDateStr = occurredAt.toISOString().split('T')[0]
        if (occurredAtDateStr === tx.date) {
          effectiveTime = occurredAt.getTime()
        }
      }
      return { ...tx, effectiveTime }
    })

  const effectivePointsCount = intradayPointCount

  const realSnapshots = [...portfolioSnapshots]
    .map((snapshot) => ({
      ...snapshot,
      timestamp: new Date(snapshot.capturedAt).getTime(),
    }))
    .filter((snapshot) => Number.isFinite(snapshot.timestamp) && snapshot.timestamp >= startTime)
    .sort((a, b) => a.timestamp - b.timestamp)

  const getCostVnd = (tx: TransactionRecord): number => {
    if (tx.capitalAmountVnd !== undefined && tx.capitalAmountVnd !== null) {
      return tx.capitalAmountVnd
    }
    if (tx.transactionType === 'import-existing') {
      const note = tx.note || ''
      const match = note.match(/\[Gi[^\]]*:\s*([^\]]+)\]/i)
      if (match) {
        const costStr = match[1].trim()
        if (costStr.startsWith('$')) {
          const usdVal = parseFloat(costStr.replace(/[^0-9.]/g, '')) || 0
          return Math.round(usdVal * USD_VND_RATE)
        }
        const cleanStr = costStr.replace(/\./g, '').replace(/,/g, '.')
        return parseFloat(cleanStr) || 0
      }
    }
    return tx.amountVnd
  }

  let cumulativeCapitalToday = 0
  sortedTx.forEach(tx => {
    const type = tx.transactionType
    if (type === 'deposit' || type === 'import-existing') {
      cumulativeCapitalToday += getCostVnd(tx)
    } else if (type === 'withdraw') {
      cumulativeCapitalToday -= getCostVnd(tx)
    }
  })

  if (cumulativeCapitalToday <= 0) {
    let currentHoldingsCost = 0
    holdings.forEach(h => {
      const isSavings = h.category === 'savings' || h.symbol.startsWith('STK-')
      currentHoldingsCost += isSavings
        ? h.valueVnd
        : h.valueVnd / (1 + (h.pnlPercent || 0) / 100)
    })
    cumulativeCapitalToday = currentHoldingsCost > 0 ? currentHoldingsCost : totalValue * 0.9
  }

  const data: Array<{ date: string; value: number; capital: number; tooltipLabel: string }> = []
  const todayLabel = todayStart.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  const intradayWindow = Math.max(1, now.getTime() - startTime)

  for (let i = 0; i < effectivePointsCount; i++) {
    const progress = i / (effectivePointsCount - 1)
    const pointTime = Math.round(startTime + intradayWindow * progress)

    const latestSnapshot = realSnapshots
      .filter(snapshot => snapshot.timestamp <= pointTime)
      .pop()

    // Dynamically calculate capital at this point in time from transactions
    let capital = 0
    sortedTx.forEach(tx => {
      if (tx.effectiveTime <= pointTime) {
        if (tx.transactionType === 'deposit' || tx.transactionType === 'import-existing') {
          capital += getCostVnd(tx)
        } else if (tx.transactionType === 'withdraw') {
          capital -= getCostVnd(tx)
        }
      }
    })

    let value = 0
    if (latestSnapshot) {
      value = latestSnapshot.totalValueVnd
    } else {
      let activePnL = 0
      holdings.forEach(h => {
        const isSavings = h.category === 'savings' || h.symbol.startsWith('STK-')
        if (isSavings) return

        const hasActiveTx = sortedTx.some(tx =>
          tx.assetSymbol === h.symbol && tx.effectiveTime <= pointTime
        )

        if (hasActiveTx) {
          const cost = h.pnlPercent <= -100
            ? h.valueVnd
            : h.valueVnd / (1 + (h.pnlPercent || 0) / 100)
          const basePnl = cost * ((h.pnlPercent || 0) / 100)
          const seed = h.symbol.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
          const waveA = Math.sin(progress * Math.PI * (2.2 + (seed % 5) * 0.18) + seed * 0.07)
          const waveB = Math.cos(progress * Math.PI * (4.4 + (seed % 7) * 0.11) + seed * 0.05)
          const intradayNoise = (waveA * 0.0045) + (waveB * 0.0025)
          activePnL += basePnl * (1 + intradayNoise)
        }
      })

      value = Math.max(0, Math.round(capital + activePnL))
    }

    const pointDate = new Date(pointTime)
    data.push({
      date: pointDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      capital: Math.max(0, Math.round(capital)),
      value: Math.max(0, Math.round(value)),
      tooltipLabel: `${todayLabel} • ${pointDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
    })
  }

  if (data.length > 0) {
    const last = data[data.length - 1]
    last.value = totalValue
    last.capital = cumulativeCapitalToday
  }

  return data
}

const generateHistoricalDataAllTime = (
  transactions: TransactionRecord[],
  holdings: HoldingRecord[],
  totalValue: number,
  portfolioSnapshots: PortfolioHistorySnapshot[] = [],
) => {
  const now = new Date()
  const todayKey = now.toISOString().split('T')[0]

  const simulatedTxs: TransactionRecord[] = []
  holdings.forEach((h) => {
    const hasTx = transactions.some((tx) => tx.assetSymbol === h.symbol)
    if (!hasTx && h.valueVnd > 0) {
      const isSavings = h.category === 'savings' || h.symbol.startsWith('STK-')
      const cost = isSavings
        ? h.valueVnd
        : (h.pnlPercent <= -100
          ? h.valueVnd
          : h.valueVnd / (1 + (h.pnlPercent || 0) / 100))

      let simulatedDate = todayKey
      if (isSavings) {
        try {
          if (h.quantity.startsWith('{')) {
            const meta = JSON.parse(h.quantity)
            if (meta.startDate && meta.startDate !== '-') {
              simulatedDate = meta.startDate
            }
          }
        } catch {
          // ignore malformed savings metadata
        }
      }

      simulatedTxs.push({
        id: `simulated-${h.symbol}`,
        date: simulatedDate,
        occurredAt: `${simulatedDate}T00:00:00.000Z`,
        transactionType: 'import-existing',
        assetSymbol: h.symbol,
        amountVnd: h.valueVnd,
        status: 'done',
        note: '',
        capitalAmountVnd: cost,
        quantity: 1,
        unit: 'don vi',
        unitPriceVnd: h.valueVnd,
        feeVnd: 0,
        walletImpactVnd: 0,
        linkedAssetSymbol: h.symbol,
        fundingSource: 'opening-balance',
      })
    }
  })

  const inferredSettledSavingsOpeningTxs: TransactionRecord[] = []
  const baseTxs = [...transactions, ...simulatedTxs]
  baseTxs.forEach((tx) => {
    if (tx.transactionType !== 'sell' || !tx.assetSymbol.startsWith('STK-')) return

    try {
      const meta = JSON.parse(tx.note || '{}')
      if (meta.type !== 'savings') return

      const principal = Number(meta.principal || 0)
      const startDateStr = typeof meta.startDate === 'string' ? meta.startDate : ''
      if (!Number.isFinite(principal) || principal <= 0 || !startDateStr) return

      const hasOpeningTx = baseTxs.some((existingTx) =>
        existingTx.assetSymbol === tx.assetSymbol &&
        (existingTx.transactionType === 'buy' || existingTx.transactionType === 'import-existing') &&
        existingTx.id !== tx.id,
      )

      if (hasOpeningTx) return

      inferredSettledSavingsOpeningTxs.push({
        id: `inferred-open-${tx.id}`,
        date: startDateStr,
        occurredAt: `${startDateStr}T00:00:00.000Z`,
        transactionType: 'import-existing',
        assetSymbol: tx.assetSymbol,
        amountVnd: principal,
        status: 'done',
        note: '[Inferred savings opening]',
        quantity: 1,
        unit: 'so',
        unitPriceVnd: principal,
        capitalAmountVnd: principal,
        feeVnd: 0,
        walletImpactVnd: 0,
        linkedAssetSymbol: tx.assetSymbol,
        fundingSource: 'opening-balance',
      })
    } catch {
      // ignore malformed legacy savings metadata
    }
  })

  const allTxs = [...baseTxs, ...inferredSettledSavingsOpeningTxs]
  const sortedTx = allTxs
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((tx) => {
      let effectiveTime = new Date(tx.date).getTime()
      if (tx.occurredAt) {
        const occurredAt = new Date(tx.occurredAt)
        const occurredAtDateStr = occurredAt.toISOString().split('T')[0]
        if (occurredAtDateStr === tx.date) {
          effectiveTime = occurredAt.getTime()
        }
      }
      return { ...tx, effectiveTime }
    })

  const realSnapshots = [...portfolioSnapshots]
    .map((snapshot) => ({
      ...snapshot,
      timestamp: new Date(snapshot.capturedAt).getTime(),
    }))
    .filter((snapshot) => Number.isFinite(snapshot.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)

  const getCostVnd = (tx: TransactionRecord): number => {
    if (tx.capitalAmountVnd !== undefined && tx.capitalAmountVnd !== null) {
      return tx.capitalAmountVnd
    }
    if (tx.transactionType === 'import-existing') {
      const note = tx.note || ''
      const match = note.match(/\[Gi[^\]]*:\s*([^\]]+)\]/i)
      if (match) {
        const costStr = match[1].trim()
        if (costStr.startsWith('$')) {
          const usdVal = parseFloat(costStr.replace(/[^0-9.]/g, '')) || 0
          return Math.round(usdVal * USD_VND_RATE)
        }
        const cleanStr = costStr.replace(/\./g, '').replace(/,/g, '.')
        return parseFloat(cleanStr) || 0
      }
    }
    return tx.amountVnd
  }

  let cumulativeCapitalAllTime = 0
  sortedTx.forEach((tx) => {
    if (tx.transactionType === 'deposit' || tx.transactionType === 'import-existing') {
      cumulativeCapitalAllTime += getCostVnd(tx)
    } else if (tx.transactionType === 'withdraw') {
      cumulativeCapitalAllTime -= getCostVnd(tx)
    }
  })

  if (cumulativeCapitalAllTime <= 0) {
    let currentHoldingsCost = 0
    holdings.forEach((h) => {
      const isSavings = h.category === 'savings' || h.symbol.startsWith('STK-')
      currentHoldingsCost += isSavings
        ? h.valueVnd
        : h.valueVnd / (1 + (h.pnlPercent || 0) / 100)
    })
    cumulativeCapitalAllTime = currentHoldingsCost > 0 ? currentHoldingsCost : totalValue * 0.9
  }

  const timelineCandidates = [
    ...sortedTx.map((tx) => tx.effectiveTime),
    ...realSnapshots.map((snapshot) => snapshot.timestamp),
    now.getTime(),
  ].filter((timestamp) => Number.isFinite(timestamp))

  const earliestTime = timelineCandidates.length > 0 ? Math.min(...timelineCandidates) : now.getTime()
  const rawPointTimes = [
    ...realSnapshots.map((snapshot) => snapshot.timestamp),
    ...sortedTx.map((tx) => tx.effectiveTime),
  ]

  const normalizedPointTimes = Array.from(
    new Set(
      [earliestTime, ...rawPointTimes, now.getTime()]
        .filter((timestamp) => Number.isFinite(timestamp))
        .map((timestamp) => Math.max(0, Math.round(timestamp))),
    ),
  ).sort((a, b) => a - b)

  const pointTimes = normalizedPointTimes.length >= 2
    ? normalizedPointTimes
    : [earliestTime, now.getTime()].sort((a, b) => a - b)

  const totalWindow = Math.max(1, now.getTime() - earliestTime)
  const data: Array<{ date: string; value: number; capital: number; tooltipLabel: string }> = []

  for (const pointTime of pointTimes) {
    const progress = totalWindow <= 0 ? 1 : (pointTime - earliestTime) / totalWindow
    const latestSnapshot = realSnapshots.filter((snapshot) => snapshot.timestamp <= pointTime).pop()

    let capital = 0
    sortedTx.forEach((tx) => {
      if (tx.effectiveTime <= pointTime) {
        if (tx.transactionType === 'deposit' || tx.transactionType === 'import-existing') {
          capital += getCostVnd(tx)
        } else if (tx.transactionType === 'withdraw') {
          capital -= getCostVnd(tx)
        }
      }
    })

    let value = 0
    if (latestSnapshot) {
      value = latestSnapshot.totalValueVnd
    } else {
      let activePnL = 0
      holdings.forEach((h) => {
        const isSavings = h.category === 'savings' || h.symbol.startsWith('STK-')
        if (isSavings) return

        const hasActiveTx = sortedTx.some((tx) =>
          tx.assetSymbol === h.symbol && tx.effectiveTime <= pointTime,
        )

        if (hasActiveTx) {
          const cost = h.pnlPercent <= -100
            ? h.valueVnd
            : h.valueVnd / (1 + (h.pnlPercent || 0) / 100)
          const basePnl = cost * ((h.pnlPercent || 0) / 100)
          const seed = h.symbol.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
          const waveA = Math.sin(progress * Math.PI * (2.2 + (seed % 5) * 0.18) + seed * 0.07)
          const waveB = Math.cos(progress * Math.PI * (4.4 + (seed % 7) * 0.11) + seed * 0.05)
          const driftNoise = (waveA * 0.0045) + (waveB * 0.0025)
          activePnL += basePnl * (1 + driftNoise)
        }
      })
      value = Math.max(0, Math.round(capital + activePnL))
    }

    const pointDate = new Date(pointTime)
    const dateLabel = pointDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
    const timeLabel = pointDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    const isSameDayAsNow = pointDate.toDateString() === now.toDateString()

    data.push({
      date: isSameDayAsNow ? timeLabel : dateLabel,
      capital: Math.max(0, Math.round(capital)),
      value: Math.max(0, Math.round(value)),
      tooltipLabel: `${dateLabel} • ${timeLabel}`,
    })
  }

  if (data.length > 0) {
    const last = data[data.length - 1]
    last.value = totalValue
    last.capital = cumulativeCapitalAllTime
  }

  return data
}

void generateHistoricalData

function Overview({
  gain: _gain,
  selectedHolding,
  setSelectedHolding,
  totalValue,
  holdings,
  transactions = [],
  portfolioSnapshots = [],
  onRefresh,
  onDeleteTransaction,
  onEditTransaction,
  goldPrices,
  categoryTargets,
}: {
  gain: number
  selectedHolding: HoldingRecord | null
  setSelectedHolding: (holding: HoldingRecord) => void
  totalValue: number
  holdings: HoldingRecord[]
  transactions?: TransactionRecord[]
  portfolioSnapshots?: PortfolioHistorySnapshot[]
  onRefresh?: () => void
  onDeleteTransaction: (id: string) => void
  onEditTransaction: (tx: TransactionRecord) => void
  goldPrices?: Record<string, GoldPriceDetail> | null
  categoryTargets: Record<string, number>
}) {
  const [chartGroupMode, setChartGroupMode] = useState<'category' | 'asset'>('category')
  const [showTargetPopover, setShowTargetPopover] = useState(false)
  const [isRecentTransactionsOpen, setIsRecentTransactionsOpen] = useState(false)
  const [targetDraft, setTargetDraft] = useState<Record<string, number>>({})
  const [targetSaving, setTargetSaving] = useState(false)
  const [targetSaved, setTargetSaved] = useState(false)

  // State quản lý hover biểu đồ hiệu suất
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null)

  const chartData = useMemo(() => {
    return generateHistoricalDataAllTime(transactions, holdings, totalValue, portfolioSnapshots)
  }, [transactions, holdings, totalValue, portfolioSnapshots])

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  }, [transactions])

  // const _openingBalanceVnd = useMemo(() => {
  //   return transactions.reduce((sum, tx) => sum + getOpeningBalanceAmount(tx), 0)
  // }, [transactions])

  // Gợi ý những danh mục đang sở hữu tài sản (giá trị > 0) nhưng chưa cài đặt tỉ trọng (bằng 0)
  const suggestedCategories = useMemo(() => {
    return INVESTABLE_CATEGORIES.filter(cat => {
      const hasValue = holdings.some(h => (h.category === cat || (cat === 'savings' && h.category === 'cash')) && h.valueVnd > 0)
      const hasNoTarget = (targetDraft[cat] || 0) === 0
      return hasValue && hasNoTarget
    })
  }, [holdings, targetDraft])

  // Load current targets khi mở popover
  const openTargetPopover = () => {
    const map: Record<string, number> = {}
    INVESTABLE_CATEGORIES.forEach(cat => {
      map[cat] = categoryTargets[cat] ?? 20
    })
    setTargetDraft(map)
    setShowTargetPopover(true)
  }

  const totalDraft = INVESTABLE_CATEGORIES.reduce((s, c) => s + (targetDraft[c] || 0), 0)
  const draftValid = Math.abs(totalDraft - 100) < 0.01

  const saveTargets = async () => {
    setTargetSaving(true)
    try {
      await updateAllCategoryTargets(targetDraft)
      setTargetSaved(true)
      setTimeout(() => { setTargetSaved(false); setShowTargetPopover(false) }, 1200)
      onRefresh?.()
    } finally {
      setTargetSaving(false)
    }
  }
  
  // 1. Filter holdings to only display active holdings (valueVnd > 0)
  const activeHoldings = useMemo(() => holdings.filter(h => h.valueVnd > 0), [holdings])
  
  // 2. Ensure we fall back to the first active holding if selectedHolding is not in activeHoldings
  const currentSelectedHolding = useMemo(() => {
    if (!selectedHolding) return activeHoldings[0] || null
    const found = activeHoldings.find(h => h.symbol.toUpperCase() === selectedHolding.symbol.toUpperCase())
    return found || activeHoldings[0] || null
  }, [selectedHolding, activeHoldings])



  // Group by Category (Asset Class)
  const categoryData = useMemo(() => {
    const categories: Record<string, { name: string; value: number; color: string }> = {}
    
    activeHoldings.forEach(item => {
      const cat = item.category === 'cash' ? 'savings' : item.category
      const config = categoryConfig[cat as CategoryScreen] || { title: item.category, color: '#64748b' }
      if (!categories[cat]) {
        categories[cat] = {
          name: config.title,
          value: 0,
          color: config.color
        }
      }
      categories[cat].value += item.valueVnd
    })

    return Object.values(categories)
      .map(d => ({
        ...d,
        percent: totalValue > 0 ? (d.value / totalValue) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value)
  }, [activeHoldings, totalValue])

  // Group by Individual Asset
  const assetData = useMemo(() => {
    const sortedHoldings = [...activeHoldings].sort((a, b) => b.valueVnd - a.valueVnd)
    
    const palette = [
      '#13b86a', // Green
      '#f5b84b', // Gold
      '#6a7cff', // Blue
      '#19a15f', // Emerald
      '#0f9f8f', // Teal
      '#3b82f6', // Light Blue
      '#8b5cf6', // Violet
      '#ec4899', // Pink
      '#f97316', // Orange
      '#0e7090', // Cyan
      '#c47b24', // Brown
    ]
    
    if (sortedHoldings.length <= 6) {
      return sortedHoldings.map((h, i) => ({
        name: h.symbol,
        value: h.valueVnd,
        color: palette[i % palette.length],
        percent: totalValue > 0 ? (h.valueVnd / totalValue) * 100 : 0
      }))
    } else {
      const top5 = sortedHoldings.slice(0, 5).map((h, i) => ({
        name: h.symbol,
        value: h.valueVnd,
        color: palette[i % palette.length],
        percent: totalValue > 0 ? (h.valueVnd / totalValue) * 100 : 0
      }))
      
      const othersValue = sortedHoldings.slice(5).reduce((sum, h) => sum + h.valueVnd, 0)
      const othersPercent = totalValue > 0 ? (othersValue / totalValue) * 100 : 0
      
      return [
        ...top5,
        {
          name: 'Khác',
          value: othersValue,
          color: '#64748b',
          percent: othersPercent
        }
      ]
    }
  }, [activeHoldings, totalValue])

  // Calculate Drift/Rebalancing alerts — grouped by CATEGORY
  const driftAlerts = useMemo(() => {
    const catMap: Record<string, {
      category: string
      name: string
      color: string
      totalAlloc: number
      totalTarget: number
      totalValue: number
    }> = {}

    // Initialize with all investable categories so we capture ones with 0% allocation too
    INVESTABLE_CATEGORIES.forEach(cat => {
      const config = categoryConfig[cat]
      const targetVal = categoryTargets[cat] ?? 20
      catMap[cat] = {
        category: cat,
        name: config?.title || cat,
        color: config?.color || '#64748b',
        totalAlloc: 0,
        totalTarget: targetVal,
        totalValue: 0
      }
    })

    // Add actual allocation
    activeHoldings.forEach(item => {
      const cat = item.category === 'cash' ? 'savings' : item.category
      if (catMap[cat]) {
        catMap[cat].totalAlloc += item.allocationPercent
        catMap[cat].totalValue += item.valueVnd
      }
    })

    return Object.values(catMap)
      .map(cat => {
        const drift = cat.totalAlloc - cat.totalTarget
        return {
          category: cat.category,
          name: cat.name,
          color: cat.color,
          driftPercent: drift,
          suggestedAction: drift > 0 ? 'sell' as const : 'buy' as const,
          suggestedAmountVnd: Math.round((totalValue * Math.abs(drift)) / 100),
        }
      })
      .filter(alert => Math.abs(alert.driftPercent) >= getDriftThreshold())
      .sort((a, b) => Math.abs(b.driftPercent) - Math.abs(a.driftPercent))
  }, [activeHoldings, holdings, totalValue])

  // Synchronized Hover Header values
  const activeIndex = hoveredPointIndex !== null ? hoveredPointIndex : (chartData.length - 1)
  const activeData = chartData[activeIndex] || { value: totalValue, capital: totalValue * 0.9, date: '' }

  const displayedValue = activeData.value
  const displayedCapital = activeData.capital
  
  // Daily Change on hover
  let displayedDailyDiff = 0
  let displayedDailyPct = 0
  if (activeIndex > 0 && chartData[activeIndex - 1]) {
    displayedDailyDiff = activeData.value - chartData[activeIndex - 1].value
    displayedDailyPct = chartData[activeIndex - 1].value > 0 ? (displayedDailyDiff / chartData[activeIndex - 1].value) * 100 : 0
  } else if (chartData.length >= 2) {
    const latestIndex = chartData.length - 1
    const prev = chartData[latestIndex - 1]
    displayedDailyDiff = chartData[latestIndex].value - prev.value
    displayedDailyPct = prev.value > 0 ? (displayedDailyDiff / prev.value) * 100 : 0
  }

  // Wealth Goal calculations
  const wealthGoal = Number(localStorage.getItem('dbyfinance-wealth-goal') || '2000000000')
  const goalPercent = Math.min(100, Math.max(0, Math.round((totalValue / wealthGoal) * 100)))

  // SVG Bezier Smooth curve helper — Catmull-Rom Spline mượt uốn lượn liên tục
  const getBezierPath = (points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return ''
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
    
    let d = `M ${points[0].x} ${points[0].y}`
    const smoothing = 0.15 // Hệ số uốn mượt đường cong

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[Math.min(points.length - 1, i + 2)]

      // Tính điểm điều khiển 1 uốn theo độ dốc giữa p0 và p2
      const cpX1 = p1.x + (p2.x - p0.x) * smoothing
      const cpY1 = p1.y + (p2.y - p0.y) * smoothing

      // Tính điểm điều khiển 2 uốn theo độ dốc giữa p1 và p3
      const cpX2 = p2.x - (p3.x - p1.x) * smoothing
      const cpY2 = p2.y - (p3.y - p1.y) * smoothing

      // Giới hạn các điểm điều khiển nằm đúng trong khoảng X của phân đoạn để tránh lỗi uốn ngược (looping)
      const clampedCpX1 = Math.min(p2.x, Math.max(p1.x, cpX1))
      const clampedCpX2 = Math.min(p2.x, Math.max(p1.x, cpX2))

      d += ` C ${clampedCpX1} ${cpY1}, ${clampedCpX2} ${cpY2}, ${p2.x} ${p2.y}`
    }
    return d
  }

  // ── Chart geometry: memoized so hover re-renders don't recompute paths ──────
  const chartGeometry = useMemo(() => {
    if (chartData.length === 0) return null
    const values = chartData.map(d => d.value)
    const maxData = Math.max(...values)
    const minData = Math.min(...values)
    const diff = maxData - minData
    const paddedMin = diff === 0
      ? Math.max(0, minData * 0.95)
      : Math.max(0, minData - diff * 0.08)
    const paddedMax = diff === 0
      ? maxData * 1.05
      : maxData + diff * 0.08
    const { niceMin, niceMax, ticks } = generateNiceYAxisTicks(paddedMin, paddedMax, 4)
    const range = niceMax - niceMin || 1
    const getX = (idx: number) => 55 + (idx / (chartData.length - 1)) * 745
    const getY = (val: number) => 280 - ((val - niceMin) / range) * 240
    const valPoints = chartData.map((d, idx) => ({ x: getX(idx), y: getY(d.value) }))
    const valPathD = getBezierPath(valPoints)
    const areaPathD = valPoints.length > 0
      ? `${valPathD} L ${getX(chartData.length - 1)} 280 L ${getX(0)} 280 Z`
      : ''
    return { maxVal: niceMax, minVal: niceMin, ticks, getX, getY, valPathD, areaPathD, range }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData])

  // Ref for SVG element to compute coordinates without layout thrashing
  const svgRef = useRef<SVGSVGElement | null>(null)

  // Stable mouse handler — only recreated when chartData.length changes
  const handleChartMouseMove = React.useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    // Map screen X to SVG coordinate space [0, 800]
    const mouseX = ((e.clientX - rect.left) / rect.width) * 800
    const adjustedMouseX = mouseX - 55
    const ratio = adjustedMouseX / 745
    const n = chartData.length
    const index = Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))))
    setHoveredPointIndex(prev => prev === index ? prev : index)
  }, [chartData.length])





  return (
    <div className="overview-grid">
      
      {/* HERO PANEL: SMOOTH BEZIER PORTFOLIO GROWTH CHART */}
      <section className="hero-panel performance-panel">
        <div className="performance-header">
          <div className="performance-header-left">
            <div className="asset-label-row">
              <span className="pill-label">Giá Trị Tài Sản</span>
            </div>
            <div className="asset-value-summary" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <strong className="main-value">{formatMoney(displayedValue)}</strong>
              {displayedDailyDiff !== 0 && (
                <div 
                  className={`change-badge ${displayedDailyDiff >= 0 ? '' : 'negative'}`} 
                  style={{ 
                    display: 'inline-flex', 
                    flexDirection: 'column', 
                    alignItems: 'flex-start',
                    gap: '2px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    lineHeight: '1.2',
                    marginTop: '0'
                  }}
                >
                  <span style={{ fontWeight: '800' }}>
                    {displayedDailyDiff >= 0 ? '+' : ''}{displayedDailyPct.toFixed(2)}%
                  </span>
                  <span style={{ fontSize: '10px', opacity: 0.85, fontWeight: '600' }}>
                    {displayedDailyDiff >= 0 ? '+' : ''}{formatMoney(displayedDailyDiff)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="performance-header-controls">
            {/* Wealth Goal Progress Wrapper */}
            <div className="goal-progress-wrapper" title="Mốc mục tiêu tài sản dài hạn">
              <div className="goal-info">
                <span>Mục tiêu: {formatMoneyShort(wealthGoal)}</span>
                <strong>Đạt {goalPercent}%</strong>
              </div>
              <div className="goal-progress-bar">
                <div className="goal-progress-fill" style={{ width: `${goalPercent}%` }}></div>
              </div>
            </div>

            {/* Time filters - Biểu đồ mặc định hiển thị toàn thời gian */}
            <div className="segmented-control">
              <button className="active" type="button" style={{ cursor: 'default' }}>
                Toàn thời gian
              </button>
            </div>
          </div>
        </div>

        <div className="asset-meta-row">
          <span className="capital-label">Vốn đầu tư: {formatMoney(displayedCapital)}</span>
        </div>

        <div className="chart-wrapper">
          {chartGeometry && (() => {
            const { ticks, getX, getY, valPathD, areaPathD, range } = chartGeometry
            const descendingTicks = [...ticks].reverse()
            return (
              <>
                <div className="y-axis-container">
                  {descendingTicks.map((tick) => (
                    <div key={tick} className="y-label">{formatChartYAxisLabel(tick, range)}</div>
                  ))}
                </div>

                <div className="x-axis-container">
                  <span>{chartData[0]?.date}</span>
                  <span>{chartData[Math.floor(chartData.length / 2)]?.date}</span>
                  <span>{chartData[chartData.length - 1]?.date}</span>
                </div>

                <svg
                  ref={svgRef}
                  viewBox="0 0 800 320"
                  width="100%"
                  height="100%"
                  preserveAspectRatio="none"
                  style={{ overflow: 'visible', display: 'block' }}
                >
                  <defs>
                    <linearGradient id="gradient-value-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.03" />
                    </linearGradient>
                    <filter id="chart-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#2dd4bf" floodOpacity="0.2" />
                    </filter>
                  </defs>

                  {/* Nhóm các phần tử đồ họa phụ trợ để loại trừ tương tác chuột (tránh lỗi che khuất/onMouseLeave) */}
                  <g style={{ pointerEvents: 'none' }}>
                    {/* Gridlines */}
                    {ticks.map((tick, index) => {
                      const y = getY(tick)
                      const isBottomAxis = index === 0
                      return (
                        <line
                          key={tick}
                          x1="55"
                          y1={y}
                          x2="800"
                          y2={y}
                          stroke={isBottomAxis ? 'var(--color-chart-axis)' : 'var(--color-chart-grid)'}
                          strokeWidth="1"
                          strokeDasharray={isBottomAxis ? undefined : '3 3'}
                        />
                      )
                    })}
                    <line
                      x1="55"
                      y1={getY(chartData[chartData.length - 1]?.value || 0)}
                      x2="800"
                      y2={getY(chartData[chartData.length - 1]?.value || 0)}
                      stroke="#2dd4bf"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                      opacity="0.85"
                    />

                    {/* Paths - Vẽ Vốn gốc (Xanh dương) dày 4.5px ở dưới, Hiện tại (Cam) 2.2px đè lên trên */}
                    <path d={areaPathD} fill="url(#gradient-value-area)" />
                                        <path d={valPathD} fill="none" stroke="#23d3c2" strokeWidth={2.15} filter="url(#chart-glow)" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Cursor Indicators */}
                    {hoveredPointIndex !== null && chartData[hoveredPointIndex] && (
                      <g>
                        <line
                          x1={getX(hoveredPointIndex)}
                          y1={20}
                          x2={getX(hoveredPointIndex)}
                          y2={280}
                          stroke="var(--color-chart-axis)"
                          strokeWidth={1}
                          strokeDasharray="3 3"
                        />
                        <circle
                          cx={getX(hoveredPointIndex)}
                          cy={getY(chartData[hoveredPointIndex].value)}
                          r={5}
                          fill="#23d3c2"
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      </g>
                    )}
                  </g>

                  {/* Mouse Interceptor — full SVG area, stable handler */}
                  <rect
                    x="0"
                    y="0"
                    width="800"
                    height="320"
                    fill="transparent"
                    style={{ cursor: 'crosshair' }}
                    onMouseMove={handleChartMouseMove}
                    onMouseLeave={() => setHoveredPointIndex(null)}
                  />
                </svg>

                {/* Hover Tooltip Overlay */}
                {hoveredPointIndex !== null && chartData[hoveredPointIndex] && (() => {
                  const d = chartData[hoveredPointIndex]
                  // const pnlVal = d.value - d.capital
                  // const _pnlPct = d.capital > 0 ? (pnlVal / d.capital) * 100 : 0
                  // const _isPositive = pnlVal >= 0
                  const x = getX(hoveredPointIndex)
                  const percentX = (x / 800) * 100
                  return (
                    <div
                      className="chart-tooltip"
                      style={{
                        position: 'absolute',
                        left: `clamp(72px, ${percentX}%, calc(100% - 188px))`,
                        transform: 'translateX(-50%)',
                        top: '15px',
                        width: '180px',
                        opacity: 1,
                        pointerEvents: 'none'
                      }}
                    >
                      <span className="tooltip-date">Ngày {d.tooltipLabel || d.date}</span>
                      <div className="tooltip-row">
                        <span>Tài sản:</span>
                        <strong>{formatMoney(d.value)}</strong>
                      </div>
                    </div>
                  )
                })()}
              </>
            )
          })()}
        </div>
      </section>

      {/* LEFT COLUMN: CURRENT HOLDINGS & TIMELINE NOTES */}
      <div className="left-column">
        
        {/* CURRENT HOLDINGS */}
        <section className="panel holdings-panel">
          <PanelTitle icon={<ShieldCheck size={20} />} title="Danh mục hiện tại" action="Tái cân bằng" />
          {activeHoldings.length > 0 ? (
            <HoldingsTable selectedHolding={currentSelectedHolding} setSelectedHolding={setSelectedHolding} rows={activeHoldings} grouped={true} />
          ) : (
            <EmptyState note="Chưa có tài sản nào trong danh mục. Nhập giao dịch để bắt đầu." />
          )}
        </section>

        {/* GIAO DỊCH GẦN ĐÂY */}
        <section className="panel recent-transactions-panel">
          <PanelTitle
            icon={<Clock3 size={18} />}
            title="Giao dịch gần đây"
            action={sortedTransactions.length > 2 ? 'Xem tất cả' : undefined}
            onAction={sortedTransactions.length > 2 ? () => setIsRecentTransactionsOpen(true) : undefined}
          />
          {sortedTransactions.length > 0 ? (
            <CompactTransactionList goldPrices={goldPrices} rows={sortedTransactions.slice(0, 2)} onDelete={onDeleteTransaction} />
          ) : (
            <EmptyState note="Chưa có giao dịch nào ghi nhận trong danh mục." />
          )}
        </section>

      </div>

      {isRecentTransactionsOpen && (
        <RecentTransactionsModal
          rows={sortedTransactions}
          goldPrices={goldPrices}
          onClose={() => setIsRecentTransactionsOpen(false)}
          onDelete={onDeleteTransaction}
          onEdit={onEditTransaction}
        />
      )}

      {/* RIGHT COLUMN: ALLOCATION & PORTFOLIO HEALTH SCORE */}
      <div className="right-column">
        
        {/* DONUT ALLOCATION CHART */}
        <section className="panel donut-chart-card">
          <div className="panel-title" style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', gap: '9px', alignItems: 'center' }}>
              <SlidersHorizontal size={20} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-text-primary)' }}>Phân bổ tài sản</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div className="segmented-control-mini">
                <button
                  className={chartGroupMode === 'category' ? 'active' : ''}
                  onClick={() => setChartGroupMode('category')}
                  type="button"
                >
                  Theo nhóm
                </button>
                <button
                  className={chartGroupMode === 'asset' ? 'active' : ''}
                  onClick={() => setChartGroupMode('asset')}
                  type="button"
                >
                  Theo mã
                </button>
              </div>
              
              <button
                type="button"
                onClick={() => showTargetPopover ? setShowTargetPopover(false) : openTargetPopover()}
                title="Cài đặt tỉ trọng mục tiêu"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '28px', height: '28px', borderRadius: '6px', border: 'none',
                  background: showTargetPopover ? 'var(--color-soft-button-bg)' : 'transparent',
                  color: showTargetPopover ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  cursor: 'pointer', transition: 'all 150ms',
                  flexShrink: 0,
                  padding: 0,
                  minHeight: 0,
                }}
              >
                <Settings size={15} />
              </button>
            </div>
          </div>

          {/* Popover targets adjustment */}
          {showTargetPopover && (
            <div style={{
              background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tỉ trọng mục tiêu</span>
                <span style={{
                  fontSize: '12px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px',
                  background: draftValid ? 'rgba(19,184,106,0.12)' : 'rgba(239,68,68,0.12)',
                  color: draftValid ? 'var(--color-primary)' : 'var(--color-red)',
                }}>
                  {totalDraft.toFixed(0)}% {draftValid ? '✓' : `/ 100%`}
                </span>
              </div>

              {suggestedCategories.length > 0 && (
                <div style={{
                  fontSize: '11px', color: 'var(--color-gold)',
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px dashed rgba(245,158,11,0.2)',
                  borderRadius: '6px', padding: '8px', marginBottom: '10px',
                  lineHeight: '1.4'
                }}>
                  <strong>💡 Gợi ý:</strong> Bạn đang nắm giữ <strong>{suggestedCategories.map(cat => categoryConfig[cat]?.title || cat).join(', ')}</strong> nhưng chưa cài đặt tỉ trọng mục tiêu (đang là 0%).
                </div>
              )}
              <div className="target-draft-container" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                {[...INVESTABLE_CATEGORIES]
                  .sort((a, b) => {
                    const targetA = categoryTargets[a] ?? 20
                    const targetB = categoryTargets[b] ?? 20
                    if (targetB !== targetA) {
                      return targetB - targetA
                    }
                    return INVESTABLE_CATEGORIES.indexOf(a) - INVESTABLE_CATEGORIES.indexOf(b)
                  })
                  .map(cat => {
                    const config = categoryConfig[cat]
                    const pct = targetDraft[cat] || 0
                  return (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CategoryIcon category={cat} size={24} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{config.title}</span>
                        </div>
                        <div style={{ height: '3px', borderRadius: '2px', background: 'var(--color-border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: config.color, borderRadius: '2px', transition: 'width 150ms' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                        <input
                          type="number" min={0} max={100} step={1}
                          value={pct}
                          onChange={e => setTargetDraft(prev => ({ ...prev, [cat]: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const container = e.currentTarget.closest('.target-draft-container')
                              if (container) {
                                const inputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[]
                                const currentIndex = inputs.indexOf(e.currentTarget)
                                const nextInput = inputs[currentIndex + 1]
                                if (nextInput) {
                                  nextInput.focus()
                                  nextInput.select()
                                } else {
                                  if (draftValid && !targetSaving) {
                                    saveTargets()
                                  }
                                }
                              }
                            }
                          }}
                          style={{
                            width: '44px', textAlign: 'right', fontSize: '13px', fontWeight: '700',
                            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                            borderRadius: '5px', padding: '3px 6px', color: 'var(--color-text-primary)',
                          }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                disabled={!draftValid || targetSaving}
                onClick={saveTargets}
                style={{
                  width: '100%', padding: '7px', borderRadius: '7px', border: 'none',
                  background: draftValid ? 'var(--color-primary)' : 'var(--color-border)',
                  color: draftValid ? 'white' : 'var(--color-text-secondary)',
                  fontWeight: '700', fontSize: '13px', cursor: draftValid ? 'pointer' : 'not-allowed',
                  transition: 'all 150ms',
                }}
              >
                {targetSaving ? 'Đang lưu...' : targetSaved ? '✓ Đã lưu!' : 'Lưu tỉ trọng'}
              </button>
            </div>
          )}
          
          <DonutChart data={chartGroupMode === 'category' ? categoryData : assetData} total={totalValue} />
          
          {/* Rebalancing Alerts */}
          {driftAlerts.length > 0 && (
            <div className="rebalance-alerts-section">
              <h4>Cảnh báo tái cân bằng</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {driftAlerts.map(alert => {
                  const isSell = alert.suggestedAction === 'sell'
                  const alertColor = isSell ? 'var(--color-gold)' : 'var(--color-primary)'
                  
                  return (
                    <div
                      key={alert.category}
                      className="rebalance-alert-card"
                      style={{ borderLeftColor: alert.color } as any}
                    >
                      <CategoryIcon category={alert.category} size={26} />
                      <div className="alert-content">
                        <span className="alert-title">{alert.name}</span>
                        <span className="alert-desc" style={{ color: alertColor }}>
                          {isSell 
                            ? `vượt ${alert.driftPercent.toFixed(1)}% · cần bán ${formatMoney(alert.suggestedAmountVnd)}`
                            : `thiếu ${Math.abs(alert.driftPercent).toFixed(1)}% · cần mua ${formatMoney(alert.suggestedAmountVnd)}`
                          }
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>



      </div>
    </div>
  )
}

function CategoryView({
  category,
  onOpenModal,
  holdings,
  transactions,
  onDeleteTransaction,
  onRefresh,
  goldPrices,
  onEditTransaction,
}: {
  category: CategoryScreen
  onOpenModal: (symbol?: string, type?: string) => void
  holdings: HoldingRecord[]
  transactions: TransactionRecord[]
  onDeleteTransaction: (id: string) => void
  onRefresh: () => void | Promise<void>
  goldPrices: Record<string, GoldPriceDetail> | null
  onEditTransaction?: (tx: TransactionRecord) => void
}) {
  const config = categoryConfig[category]
  const rows = holdings.filter((item) => item.category === category)
  const cashHolding = holdings.find((item) => item.symbol.toUpperCase() === 'CASH')
  const walletEntries = useMemo(
    () => buildWalletStatementEntries(transactions, cashHolding?.valueVnd ?? 0, holdings),
    [transactions, cashHolding?.valueVnd, holdings],
  )
  const walletInflow = useMemo(
    () => walletEntries.reduce((sum, entry) => sum + (entry.amountVnd > 0 ? entry.amountVnd : 0), 0),
    [walletEntries],
  )
  const walletOutflow = useMemo(
    () => walletEntries.reduce((sum, entry) => sum + (entry.amountVnd < 0 ? Math.abs(entry.amountVnd) : 0), 0),
    [walletEntries],
  )
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(rows[0]?.symbol ?? null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const selectedAsset = rows.find((item) => item.symbol === selectedSymbol) ?? rows[0]
  const relatedTransactions = useMemo(() => {
    const filtered = category === 'cash'
      ? transactions.filter((tx) => getWalletDelta(tx) !== null)
      : transactions.filter((tx) => {
          const sym = tx.assetSymbol.toUpperCase()
          const isCryptoTx = sym.endsWith('USDT') || ['BTC', 'ETH', 'BNB', 'SOL', 'USDT', 'ADA', 'XRP', 'DOT', 'DOGE', 'SHIB', 'AVAX', 'LINK', 'MATIC', 'LTC', 'UNI'].includes(sym)
          if (category === 'gold') {
            return ['VNHAN', 'VMIENG', 'VKIENG', 'SJ9999', 'SJL1L10'].includes(sym)
          }
          if (category === 'crypto') {
            return isCryptoTx
          }
          if (category === 'savings') {
            return sym.startsWith('STK-')
          }
          if (category === 'stocks') {
            return sym !== 'CASH' &&
              !sym.startsWith('STK-') &&
              !['VNHAN', 'VMIENG', 'VKIENG', 'SJ9999', 'SJL1L10'].includes(sym) &&
              !isCryptoTx
          }
          return rows.some((item) => item.symbol === tx.assetSymbol)
        })
    return [...filtered].sort(compareTransactionsDesc)
  }, [category, transactions, rows])

  const selectedTransactions = useMemo(() => {
    if (!selectedAsset) return []
    const filtered = transactions.filter((tx) => tx.assetSymbol === selectedAsset.symbol)
    return [...filtered].sort(compareTransactionsDesc)
  }, [transactions, selectedAsset])

  return (
    <div className={`module-grid ${category === 'cash' ? 'wallet-tracker-container vcb-themed' : ''}`}>
      {category === 'cash' && (
        <div className="vcb-bg-shapes" aria-hidden="true">
          <svg width="100%" height="100%" viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="750" cy="80" r="250" stroke="#7cc142" strokeWidth="1.5" strokeOpacity="0.12" />
            <circle cx="720" cy="110" r="320" stroke="#7cc142" strokeWidth="1" strokeOpacity="0.06" />
            <circle cx="50" cy="520" r="180" stroke="#ffd056" strokeWidth="1.2" strokeOpacity="0.08" strokeDasharray="5 5" />
            <path d="M-50 150 L250 -150" stroke="#7cc142" strokeWidth="2" strokeOpacity="0.08" />
            <path d="M-20 180 L280 -120" stroke="#7cc142" strokeWidth="1" strokeOpacity="0.04" />
          </svg>
        </div>
      )}
      {category !== 'stocks' && category !== 'crypto' && category !== 'bonds' && category !== 'savings' && category !== 'gold' && (
        <section className={`product-banner product-banner-with-holdings ${category === 'cash' ? 'vcb-banner' : ''}`} style={{ borderColor: `${config.color}55` }}>
          <div className="product-banner-top">
            <div>
              <span className="eyebrow">{config.eyebrow}</span>
              <h2>{config.title}</h2>
              <p>{config.description}</p>
            </div>
            <div className="module-actions">
              <button className="primary-button" onClick={() => onOpenModal(selectedSymbol || undefined)} style={{ background: config.color, borderColor: config.color }} type="button">
                <Plus size={18} />
                Thêm
              </button>
            </div>
          </div>

          <div className="banner-holdings-strip">
            <div className="banner-holdings-head">
              <div>
                <span className="banner-holdings-icon">{config.icon}</span>
                <strong>{category === 'cash' ? 'Sao kê ví' : `${config.title} đang nắm giữ`}</strong>
              </div>
              {category !== 'cash' && (
                <button disabled={!rows.length} onClick={() => setIsDetailOpen(true)} type="button">
                  Xem chi tiết
                </button>
              )}
            </div>
            {category === 'cash' ? (
              <div className="wallet-summary-grid">
                <article className="wallet-summary-card">
                  <span>Tổng tiền vào</span>
                  <strong className="positive">+{formatMoney(walletInflow)}</strong>
                  <small>Nạp tiền và thu từ bán tài sản</small>
                </article>
                <article className="wallet-summary-card">
                  <span>Tổng tiền ra</span>
                  <strong className="negative">-{formatMoney(walletOutflow)}</strong>
                  <small>Rút tiền và chi cho lệnh mua</small>
                </article>
                <article className="wallet-summary-card">
                  <span>Số dư hiện tại</span>
                  <strong>{formatMoney(cashHolding?.valueVnd ?? 0)}</strong>
                  <small>{walletEntries.length} biến động đã ghi nhận</small>
                </article>
              </div>
            ) : rows.length ? (
              <HoldingsTable
                goldPrices={goldPrices}
                selectedHolding={selectedAsset}
                setSelectedHolding={(holding) => {
                  setSelectedSymbol(holding.symbol)
                  setIsDetailOpen(true)
                }}
                rows={rows}
                onOpenModal={onOpenModal}
              />
            ) : (
              <EmptyState note={config.emptyNote ?? 'Chưa có dữ liệu cho danh mục này.'} />
            )}
          </div>
        </section>
      )}

      {category === 'gold' && <GoldTracker />}

      {category === 'savings' && (
        <SavingsTracker
          holdings={holdings}
          transactions={transactions}
          onOpenModal={onOpenModal}
          onRefresh={onRefresh}
          onDeleteTransaction={onDeleteTransaction}
        />
      )}
      
      {category === 'stocks' && (
        <StockTracker
          holdings={rows}
          transactions={transactions}
          onTradeComplete={onRefresh}
          selectedSymbol={selectedSymbol || undefined}
          onSelectSymbol={setSelectedSymbol}
        />
      )}

      {category === 'crypto' && (
        <CryptoTracker
          holdings={rows}
          transactions={transactions}
          onTradeComplete={onRefresh}
          selectedSymbol={selectedSymbol || undefined}
          onSelectSymbol={setSelectedSymbol}
        />
      )}

      {category === 'bonds' && (
        <BondTracker
          holdings={rows}
          transactions={transactions}
          onTradeComplete={onRefresh}
          selectedSymbol={selectedSymbol || undefined}
          onSelectSymbol={setSelectedSymbol}
        />
      )}

      {category === 'stocks' && (
        <div className="banner-holdings-strip banner-holdings-standalone" style={{ borderColor: `${config.color}55` }}>
          <div className="banner-holdings-head">
            <div>
              <span className="banner-holdings-icon" style={{ color: config.color }}>{config.icon}</span>
              <strong>{config.title} đang nắm giữ</strong>
            </div>
            <div className="module-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="primary-button" onClick={() => onOpenModal(selectedSymbol || undefined)} style={{ background: config.color, borderColor: config.color, padding: '0 12px', minHeight: '36px', borderRadius: '8px', fontSize: '13px', fontWeight: '850', color: '#fff' }} type="button">
                <Plus size={14} style={{ marginRight: '4px' }} />
                Thêm
              </button>
              <button disabled={!rows.length} onClick={() => setIsDetailOpen(true)} type="button" style={{ color: config.color, background: `${config.color}15`, borderColor: `${config.color}33` }}>
                Xem chi tiết
              </button>
            </div>
          </div>
          {rows.length ? (
            <HoldingsTable
              goldPrices={goldPrices}
              selectedHolding={selectedAsset}
              setSelectedHolding={(holding) => {
                setSelectedSymbol(holding.symbol)
                setIsDetailOpen(true)
              }}
              rows={rows}
              onOpenModal={onOpenModal}
            />
          ) : (
            <EmptyState note={config.emptyNote ?? 'Chưa có dữ liệu cho danh mục này.'} />
          )}
        </div>
      )}

      {category === 'crypto' && (
        <div className="banner-holdings-strip banner-holdings-standalone" style={{ borderColor: `${config.color}55` }}>
          <div className="banner-holdings-head">
            <div>
              <span className="banner-holdings-icon" style={{ color: config.color }}>{config.icon}</span>
              <strong>{config.title} đang nắm giữ</strong>
            </div>
            <div className="module-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="primary-button" onClick={() => onOpenModal(selectedSymbol || undefined)} style={{ background: config.color, borderColor: config.color, padding: '0 12px', minHeight: '36px', borderRadius: '8px', fontSize: '13px', fontWeight: '850', color: '#fff' }} type="button">
                <Plus size={14} style={{ marginRight: '4px' }} />
                Thêm
              </button>
              <button disabled={!rows.length} onClick={() => setIsDetailOpen(true)} type="button" style={{ color: config.color, background: `${config.color}15`, borderColor: `${config.color}33` }}>
                Xem chi tiết
              </button>
            </div>
          </div>
          {rows.length ? (
            <HoldingsTable
              goldPrices={goldPrices}
              selectedHolding={selectedAsset}
              setSelectedHolding={(holding) => {
                setSelectedSymbol(holding.symbol)
                setIsDetailOpen(true)
              }}
              rows={rows}
              onOpenModal={onOpenModal}
              isCryptoTable={true}
            />
          ) : (
            <EmptyState note={config.emptyNote ?? 'Chưa có dữ liệu cho danh mục này.'} />
          )}
        </div>
      )}

      {category === 'bonds' && (
        <div className="banner-holdings-strip banner-holdings-standalone" style={{ borderColor: `${config.color}55` }}>
          <div className="banner-holdings-head">
            <div>
              <span className="banner-holdings-icon" style={{ color: config.color }}>{config.icon}</span>
              <strong>{config.title} đang nắm giữ</strong>
            </div>
            <div className="module-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="primary-button" onClick={() => onOpenModal(selectedSymbol || undefined)} style={{ background: config.color, borderColor: config.color, padding: '0 12px', minHeight: '36px', borderRadius: '8px', fontSize: '13px', fontWeight: '850', color: '#fff' }} type="button">
                <Plus size={14} style={{ marginRight: '4px' }} />
                Thêm
              </button>
              <button disabled={!rows.length} onClick={() => setIsDetailOpen(true)} type="button" style={{ color: config.color, background: `${config.color}15`, borderColor: `${config.color}33` }}>
                Xem chi tiết
              </button>
            </div>
          </div>
          {rows.length ? (
            <HoldingsTable
              goldPrices={goldPrices}
              selectedHolding={selectedAsset}
              setSelectedHolding={(holding) => {
                setSelectedSymbol(holding.symbol)
                setIsDetailOpen(true)
              }}
              rows={rows}
              onOpenModal={onOpenModal}
            />
          ) : (
            <EmptyState note={config.emptyNote ?? 'Chưa có dữ liệu cho danh mục này.'} />
          )}
        </div>
      )}

      {category === 'gold' && (
        <div className="banner-holdings-strip banner-holdings-standalone" style={{ borderColor: `${config.color}55` }}>
          <div className="banner-holdings-head">
            <div>
              <span className="banner-holdings-icon" style={{ color: config.color }}>{config.icon}</span>
              <strong>{config.title} đang nắm giữ</strong>
            </div>
            <div className="module-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="primary-button" onClick={() => onOpenModal(selectedSymbol || undefined)} style={{ background: config.color, borderColor: config.color, padding: '0 12px', minHeight: '36px', borderRadius: '8px', fontSize: '13px', fontWeight: '850', color: '#fff' }} type="button">
                <Plus size={14} style={{ marginRight: '4px' }} />
                Thêm
              </button>
              <button disabled={!rows.length} onClick={() => setIsDetailOpen(true)} type="button" style={{ color: config.color, background: `${config.color}15`, borderColor: `${config.color}33` }}>
                Xem chi tiết
              </button>
            </div>
          </div>
          {rows.length ? (
            <HoldingsTable
              goldPrices={goldPrices}
              selectedHolding={selectedAsset}
              setSelectedHolding={(holding) => {
                setSelectedSymbol(holding.symbol)
                setIsDetailOpen(true)
              }}
              rows={rows}
              onOpenModal={onOpenModal}
            />
          ) : (
            <EmptyState note={config.emptyNote ?? 'Chưa có dữ liệu cho danh mục này.'} />
          )}
        </div>
      )}

      {category !== 'cash' && isDetailOpen && selectedAsset && createPortal(
        <AssetDetailPanel
          asset={selectedAsset}
          color={config.color}
          onClose={() => setIsDetailOpen(false)}
          transactions={selectedTransactions}
          onOpenModal={onOpenModal}
          onDeleteTransaction={onDeleteTransaction}
          onEditTransaction={onEditTransaction}
        />,
        document.body,
      )}

      <section className="panel focus-panel">
        <PanelTitle icon={<Clock3 size={20} />} title={category === 'cash' ? 'Lịch sử ví' : 'Giao dịch gần đây'} action={category === 'cash' ? 'Sao kê' : undefined} />
        {category === 'cash' ? (
          walletEntries.length ? (
            <WalletStatementList rows={walletEntries} onDelete={onDeleteTransaction} />
          ) : (
            <EmptyState note="Chưa có biến động nào của ví được ghi nhận." />
          )
        ) : relatedTransactions.length ? (
          <TransactionList category={category} goldPrices={goldPrices} rows={relatedTransactions} onDelete={onDeleteTransaction} onEdit={onEditTransaction} />
        ) : (
          <EmptyState note="Chưa có giao dịch cho danh mục này." />
        )}
      </section>
    </div>
  )
}

function Ledger({
  filteredTransactions,
  telegramInboxEvents,
  selectedType,
  setSelectedType,
  telegramCommandInput,
  setTelegramCommandInput,
  onCreateTelegramInboxEvent,
  onApproveTelegramInboxEvent,
  onRejectTelegramInboxEvent,
  isTelegramSubmitting,
  onSyncTelegramInbox,
  isTelegramSyncing,
  onDeleteTransaction,
  onUpdateTelegramInboxEvent,
  onEditTransaction,
}: {
  filteredTransactions: TransactionRecord[]
  telegramInboxEvents: TelegramInboxEvent[]
  selectedType: TransactionType | 'Tất cả'
  setSelectedType: (value: TransactionType | 'Tất cả') => void
  telegramCommandInput: string
  setTelegramCommandInput: (value: string) => void
  onCreateTelegramInboxEvent: () => void
  onApproveTelegramInboxEvent: (id: string) => void
  onRejectTelegramInboxEvent: (id: string) => void
  isTelegramSubmitting: boolean
  onSyncTelegramInbox: () => void
  isTelegramSyncing: boolean
  onDeleteTransaction: (id: string) => void
  onUpdateTelegramInboxEvent?: (id: string, updatedDraft: TelegramInboxParsedPayload) => void
  onEditTransaction?: (tx: TransactionRecord) => void
}) {
  const [showSimulator, setShowSimulator] = useState(false)

  return (
    <div className="module-grid">
      <section className="panel">
        <div className="panel-heading telegram-panel-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <PanelTitle icon={<Bell size={20} />} title="Telegram Inbox" action={`${telegramInboxEvents.length} chờ duyệt`} />
            <div className="telegram-status-indicator">
              <span className="telegram-status-dot"></span>
              <span>Bot Trực tuyến</span>
            </div>
          </div>
          <div className="telegram-header-actions">
            <button 
              className={`telegram-header-icon-btn ${isTelegramSyncing ? 'active' : ''}`}
              disabled={isTelegramSyncing}
              onClick={onSyncTelegramInbox}
              title="Đồng bộ thủ công"
              type="button"
            >
              <RefreshCw size={16} className={isTelegramSyncing ? 'animate-spin' : ''} />
            </button>
            <button 
              className={`telegram-header-icon-btn ${showSimulator ? 'active' : ''}`}
              onClick={() => setShowSimulator(!showSimulator)}
              title="Mô phỏng lệnh Telegram"
              type="button"
            >
              <Terminal size={16} />
            </button>
          </div>
        </div>

        {/* Collapsible Simulator Panel */}
        <div className={`telegram-simulator-panel ${showSimulator ? 'open' : ''}`}>
          <TelegramInboxComposer
            value={telegramCommandInput}
            onChange={setTelegramCommandInput}
            onSubmit={onCreateTelegramInboxEvent}
            isSubmitting={isTelegramSubmitting}
          />
        </div>

        <TelegramInboxList
          rows={telegramInboxEvents}
          onApprove={onApproveTelegramInboxEvent}
          onReject={onRejectTelegramInboxEvent}
          onUpdate={onUpdateTelegramInboxEvent}
        />
      </section>

      <section className="panel full-panel">
        <div className="panel-heading">
          <PanelTitle icon={<Clock3 size={20} />} title="Sổ giao dịch" action="Xuất CSV" />
          <div className="segmented-control">
            {transactionTypes.map((type) => (
              <button
                className={selectedType === type ? 'active' : ''}
                key={type}
                onClick={() => setSelectedType(type)}
                type="button"
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        {filteredTransactions.length > 0 ? (
          <TransactionList category="mixed" rows={filteredTransactions} onDelete={onDeleteTransaction} onEdit={onEditTransaction} />
        ) : (
          <EmptyState note="Chưa có giao dịch nào ghi nhận trong bộ lọc này." />
        )}
      </section>
    </div>
  )
}

// Removed Reports component

// Danh mục đầu tư (bao gồm cả tiền mặt và tiết kiệm được gộp chung dưới 'savings')
const INVESTABLE_CATEGORIES: CategoryScreen[] = ['gold', 'stocks', 'bonds', 'savings']

interface SettingsPanelProps {
  privacyMode: boolean
  setPrivacyMode: React.Dispatch<React.SetStateAction<boolean>>
  appTheme: string
  setAppTheme: React.Dispatch<React.SetStateAction<string>>
  mainCurrency: string
  setMainCurrency: React.Dispatch<React.SetStateAction<string>>
  driftThreshold: number
  setDriftThreshold: React.Dispatch<React.SetStateAction<number>>
  goldApiSource: string
  setGoldApiSource: React.Dispatch<React.SetStateAction<string>>
  securityPassword: string
  setSecurityPassword: React.Dispatch<React.SetStateAction<string>>
  showNotification: (msg: string, type?: 'success' | 'error' | 'info') => void
  onTriggerReset: () => void
  onTriggerImport: (data: any) => void
}

function SettingsPanel({
  privacyMode,
  setPrivacyMode,
  appTheme,
  setAppTheme,
  mainCurrency,
  setMainCurrency,
  driftThreshold,
  setDriftThreshold,
  goldApiSource,
  setGoldApiSource,
  securityPassword,
  setSecurityPassword,
  showNotification,
  onTriggerReset,
  onTriggerImport
}: SettingsPanelProps) {
  const [showPassword, setShowPassword] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    try {
      const data = await exportPortfolioData()
      const dataStr = JSON.stringify(data, null, 2)
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
      
      const exportFileDefaultName = `dbyfinance-backup-${new Date().toISOString().split('T')[0]}.json`
      
      const linkElement = document.createElement('a')
      linkElement.setAttribute('href', dataUri)
      linkElement.setAttribute('download', exportFileDefaultName)
      linkElement.click()
      showNotification('Đã xuất file sao lưu thành công!', 'success')
    } catch (e) {
      showNotification('Lỗi khi xuất dữ liệu sao lưu!', 'error')
      console.error(e)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    const file = files[0]
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const parsed = JSON.parse(text)
        
        // Basic validation
        if (!parsed.holdings || !parsed.transactions) {
          throw new Error('Định dạng file sao lưu không hợp lệ!')
        }
        
        onTriggerImport(parsed)
      } catch (err) {
        showNotification('File sao lưu không hợp lệ hoặc bị lỗi!', 'error')
        console.error(err)
      }
    }
    reader.readAsText(file)
  }

  const handleReset = () => {
    onTriggerReset()
  }

  return (
    <section className="panel full-panel">
      <PanelTitle
        icon={<SlidersHorizontal size={20} />}
        title="Cài đặt hệ thống"
      />

      <div className="settings-grid">
        {/* Nhóm 1: Cài đặt Chung */}
        <div className="settings-card">
          <div className="settings-card-header">
            <Palette size={18} />
            <span>Giao diện & Tiền tệ</span>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-title">Chế độ ẩn danh (Stealth Mode)</span>
              <span className="settings-row-desc">Ẩn toàn bộ số dư và số lượng bằng '******' để bảo vệ sự riêng tư.</span>
            </div>
            <div className="settings-control">
              <label className="switch-label">
                <input
                  type="checkbox"
                  className="switch-input"
                  checked={privacyMode}
                  onChange={(e) => setPrivacyMode(e.target.checked)}
                />
                <span className="switch-slider"></span>
              </label>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-title">Chủ đề hiển thị</span>
              <span className="settings-row-desc">Lựa chọn chế độ sáng hoặc tối cho ứng dụng.</span>
            </div>
            <div className="settings-control">
              <div className="segmented-control" style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className={appTheme === 'dark' ? 'active' : ''}
                  onClick={() => setAppTheme('dark')}
                  style={{ fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}
                >
                  Tối (Dark)
                </button>
                <button
                  type="button"
                  className={appTheme === 'light' ? 'active' : ''}
                  onClick={() => setAppTheme('light')}
                  style={{ fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}
                >
                  Sáng (Light)
                </button>
                <button
                  type="button"
                  className={appTheme === 'system' ? 'active' : ''}
                  onClick={() => setAppTheme('system')}
                  style={{ fontSize: '12.5px', fontWeight: '700', cursor: 'pointer' }}
                >
                  Hệ thống (System)
                </button>
              </div>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-title">Tiền tệ chính</span>
              <span className="settings-row-desc">Loại tiền tệ cơ sở để tính toán tổng giá trị tài sản.</span>
            </div>
            <div className="settings-control">
              <select
                className="settings-select"
                value={mainCurrency}
                onChange={(e) => setMainCurrency(e.target.value)}
              >
                <option value="VND">VND (đ)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Nhóm 4: Cấu hình Cảnh báo */}
        <div className="settings-card">
          <div className="settings-card-header">
            <Bell size={18} />
            <span>Cảnh báo & Tái cân bằng</span>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-title">Ngưỡng lệch cảnh báo</span>
              <span className="settings-row-desc">Kích hoạt cảnh báo khi tỷ trọng danh mục lệch quá ngưỡng cài đặt này.</span>
            </div>
            <div className="settings-control" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min={1}
                max={50}
                className="settings-input"
                style={{ width: '80px' }}
                value={driftThreshold}
                onChange={(e) => setDriftThreshold(Math.max(1, Math.min(50, parseFloat(e.target.value) || 3)))}
              />
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: '600' }}>%</span>
            </div>
          </div>
        </div>

        {/* Nhóm 3: Cấu hình API */}
        <div className="settings-card">
          <div className="settings-card-header">
            <Globe size={18} />
            <span>Tỷ giá & Dữ liệu API</span>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-title">Nguồn giá Vàng</span>
              <span className="settings-row-desc">Chọn nguồn cập nhật tỷ giá vàng trực tuyến tự động.</span>
            </div>
            <div className="settings-control">
              <select
                className="settings-select"
                value={goldApiSource}
                onChange={(e) => setGoldApiSource(e.target.value)}
              >
                <option value="vang.today">Vang.today API</option>
                <option value="sjc">Giá SJC trực tiếp</option>
                <option value="doji">Giá Doji trực tiếp</option>
                <option value="manual">Cập nhật thủ công</option>
              </select>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-title">Kết nối vnstock</span>
              <span className="settings-row-desc">Đồng bộ giá cổ phiếu Việt Nam tự động.</span>
            </div>
            <div className="settings-control">
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--color-primary)', background: 'var(--color-primary-glow)', padding: '4px 8px', borderRadius: '4px' }}>
                ĐÃ LIÊN KẾT
              </span>
            </div>
          </div>
        </div>

        {/* Nhóm 2: Quản lý Dữ liệu */}
        <div className="settings-card">
          <div className="settings-card-header">
            <Database size={18} />
            <span>Quản lý dữ liệu hệ thống</span>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-title">Sao lưu dữ liệu (Export)</span>
              <span className="settings-row-desc">Xuất toàn bộ giao dịch, tài sản và cấu hình ra file JSON để lưu trữ ngoại tuyến.</span>
            </div>
            <div className="settings-control">
              <button className="settings-btn settings-btn-secondary" onClick={handleExport}>
                <Download size={15} />
                <span>Sao lưu</span>
              </button>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-title">Khôi phục dữ liệu (Import)</span>
              <span className="settings-row-desc">Khôi phục lại danh mục tài sản từ file backup JSON đã lưu trước đó.</span>
            </div>
            <div className="settings-control">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".json"
                onChange={handleImportFile}
              />
              <button className="settings-btn settings-btn-secondary" onClick={handleImportClick}>
                <Upload size={15} />
                <span>Khôi phục</span>
              </button>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-title">Mật khẩu xác nhận xóa</span>
              <span className="settings-row-desc">Mật khẩu dùng để xác nhận khi thực hiện xóa dữ liệu (mặc định: admin).</span>
            </div>
            <div className="settings-control" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type={showPassword ? "text" : "password"}
                className="settings-input"
                style={{ width: '150px' }}
                value={securityPassword}
                onChange={(e) => setSecurityPassword(e.target.value)}
                placeholder="Mật khẩu"
              />
              <button
                type="button"
                className="settings-btn settings-btn-secondary"
                style={{ padding: '8px', minWidth: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row-info">
              <span className="settings-row-title">Khởi tạo lại danh mục (Factory Reset)</span>
              <span className="settings-row-desc" style={{ color: 'var(--color-red-hover)' }}>Xóa sạch toàn bộ tài sản, giao dịch và bắt đầu lại từ đầu.</span>
            </div>
            <div className="settings-control">
              <button 
                className="settings-btn settings-btn-danger" 
                onClick={handleReset}
              >
                <Trash2 size={15} />
                <span>Xóa dữ liệu</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}




function cleanQuantity(qty: string): string {
  if (!qty) return ''
  // Strip CP, CCQ, chỉ, vàng, don vi, đơn vị, coin, etc., case insensitive, with optional spaces
  return qty.replace(/\s*(?:CP|CCQ|chỉ|vàng|usd|vnd|vnđ|don vi|đơn vị|coin)\b/gi, '').trim()
}

interface GroupedHolding {
  category: string
  categoryTitle: string
  color: string
  totalValue: number
  totalCost: number
  totalAllocation: number
  totalTarget: number
  items: HoldingRecord[]
}

function HoldingsTable({
  rows,
  selectedHolding,
  setSelectedHolding,
  goldPrices,
  onOpenModal,
  grouped = false,
  isCryptoTable = false,
}: {
  rows: HoldingRecord[]
  selectedHolding: HoldingRecord | null
  setSelectedHolding: (holding: HoldingRecord) => void
  goldPrices?: Record<string, GoldPriceDetail> | null
  onOpenModal?: (symbol?: string, type?: string) => void
  grouped?: boolean
  isCryptoTable?: boolean
}) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})

  const groups = useMemo(() => {
    if (!grouped) return []
    const map: Record<string, GroupedHolding> = {}
    rows.forEach((item) => {
      const cat = item.category === 'cash' ? 'savings' : item.category
      const catConfig = categoryConfig[cat as CategoryScreen] || { title: cat, color: '#64748b' }
      const color = catConfig.color || '#13b86a'
      const isSavings = cat === 'savings' || item.symbol.startsWith('STK-')
      
      let cost = item.valueVnd
      if (!isSavings) {
        cost = item.valueVnd / (1 + (item.pnlPercent || 0) / 100)
      } else {
        try {
          if (item.quantity.startsWith('{')) {
            const meta = JSON.parse(item.quantity)
            cost = meta.principal || item.valueVnd
          }
        } catch (e) {}
      }

      if (!map[cat]) {
        map[cat] = {
          category: cat,
          categoryTitle: catConfig.title,
          color,
          totalValue: 0,
          totalCost: 0,
          totalAllocation: 0,
          totalTarget: 0,
          items: [],
        }
      }

      map[cat].totalValue += item.valueVnd
      map[cat].totalCost += cost
      map[cat].totalAllocation += item.allocationPercent
      // Gán trực tiếp tỉ trọng mục tiêu của danh mục thay vì cộng dồn của từng mã con
      map[cat].totalTarget = item.targetPercent
      map[cat].items.push(item)
    })

    const result = Object.values(map)
    result.forEach((g) => {
      g.items.sort((a, b) => b.valueVnd - a.valueVnd)
    })
    return result.sort((a, b) => b.totalValue - a.totalValue)
  }, [rows, grouped])

  const renderRow = (item: HoldingRecord, isChildRow = false, parentColor?: string) => {
    const color = parentColor || (categoryConfig[item.category as CategoryScreen] || categoryConfig['stocks'])?.color || '#13b86a'
    const isSavings = item.category === 'savings' || item.symbol.startsWith('STK-')
    const isPrivacy = localStorage.getItem('dbyfinance-privacy-mode') === 'true'

    let pQty = 1
    let cost = item.valueVnd
    let avgPrice = 0
    let currentPrice = 0
    let displayQty = item.quantity
    let displayAvgPrice = ''
    let displayCost = ''
    let displayCurrentPrice = ''
    let displayValue = formatMoney(item.valueVnd)
    let displayPnlNode: ReactNode = null

    let bank = 'Ngân hàng'
    let term = ''
    let rate = 0
    let principal = item.valueVnd
    let termMonths = 0
    let expectedInterest = 0

    if (isSavings) {
      try {
        if (item.quantity.startsWith('{')) {
          const meta = JSON.parse(item.quantity)
          bank = meta.bank || bank
          term = meta.term || term
          rate = meta.rate || rate
          principal = meta.principal || principal
        }
      } catch (e) {}

      displayQty = isPrivacy ? '***' : (term || '1 sổ')
      displayAvgPrice = '-'
      displayCost = formatMoney(principal)
      displayCurrentPrice = rate > 0 ? `${rate}%/năm` : '-'
      displayValue = formatMoney(item.valueVnd)
      
      termMonths = parseInt(term) || 0
      expectedInterest = Math.round(principal * (rate / 100) * (termMonths / 12))

      displayPnlNode = (
        <td className="positive" style={isCryptoTable ? { textAlign: 'right' } : undefined}>
          <div style={{ fontWeight: '600', fontSize: '13px' }}>
            {expectedInterest > 0 ? `+${formatMoney(expectedInterest)}` : '-'}
          </div>
          {rate > 0 && (
            <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.8, color: 'var(--color-text-secondary)' }}>
              Dự kiến
            </div>
          )}
        </td>
      )
    } else {
      pQty = parseQtyString(item.quantity)
      const goldConfig = item.category === 'gold' ? getGoldQuoteConfig(item.symbol) : null
      const goldUnitPrice = goldConfig ? getGoldUnitPrice(item.symbol, goldPrices, 'sell') : null
      cost = item.valueVnd / (1 + (item.pnlPercent || 0) / 100)
      avgPrice = pQty > 0 ? cost / pQty : 0
      currentPrice = goldUnitPrice || (pQty > 0 ? item.valueVnd / pQty : 0)

      displayQty = isPrivacy ? '***' : cleanQuantity(item.quantity)
      
      const isCrypto = item.category === 'crypto'
      if (isCrypto) {
        displayAvgPrice = item.symbol === 'CASH' ? '-' : formatUSD(avgPrice / USD_VND_RATE)
        displayCost = item.symbol === 'CASH' ? '-' : formatUSD(cost / USD_VND_RATE)
        displayCurrentPrice = item.symbol === 'CASH' ? '-' : formatUSD(currentPrice / USD_VND_RATE)
        displayValue = formatUSD(item.valueVnd / USD_VND_RATE)
      } else {
        displayAvgPrice = item.symbol === 'CASH' ? '-' : formatMoney(avgPrice)
        displayCost = item.symbol === 'CASH' ? '-' : formatMoney(cost)
        displayCurrentPrice = item.symbol === 'CASH' ? '-' : formatMoney(currentPrice)
        displayValue = formatMoney(item.valueVnd)
      }

      const pnlVal = Math.round(item.valueVnd - cost)
      const pnlClass = item.symbol === 'CASH' ? '' : (item.pnlPercent >= 0 ? 'positive' : 'negative')
      const pnlSign = item.pnlPercent >= 0 ? '+' : ''

      displayPnlNode = (
        <td className={pnlClass} style={isCryptoTable ? { textAlign: 'right' } : undefined}>
          {item.symbol === 'CASH' ? (
            '-'
          ) : (
            <>
              <div style={{ fontWeight: '600', fontSize: '13px' }}>
                {pnlSign}{item.pnlPercent.toFixed(2)}%
              </div>
              <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.8, color: 'var(--color-text-secondary)' }}>
                {pnlSign}{isCrypto ? formatUSD(pnlVal / USD_VND_RATE) : formatMoney(pnlVal)}
              </div>
            </>
          )}
        </td>
      )
    }

    const drift = item.allocationPercent - item.targetPercent
    const driftText = drift >= 0 ? `+${drift.toFixed(1)}%` : `${drift.toFixed(1)}%`
    const driftColor = Math.abs(drift) > getDriftThreshold() 
      ? (drift > 0 ? 'var(--color-red)' : 'var(--color-primary)') 
      : 'var(--color-text-secondary)'

    const displaySymbol = isSavings ? 'Tiết kiệm' : item.symbol
    const displayName = isSavings ? bank : item.name

    return (
      <tr
        key={item.symbol}
        className={`${isChildRow ? 'group-child-row' : ''} ${selectedHolding?.symbol === item.symbol ? 'selected' : ''}`}
        onClick={() => setSelectedHolding(item)}
      >
        <td>
          <div className="asset-cell">
            {item.category === 'crypto' ? (
              <CryptoLogo symbol={item.symbol} size={isChildRow ? 20 : 24} borderRadius={isChildRow ? '4px' : '6px'} marginRight="6px" />
            ) : (
              <span style={{ marginRight: '6px' }}>
                <CategoryIcon category={item.category} size={isChildRow ? 20 : 24} />
              </span>
            )}
            <div>
              <strong style={{ display: 'block', fontSize: isChildRow ? '12.5px' : '13px', color: 'var(--color-text-primary)' }}>
                {isChildRow ? item.symbol : displaySymbol}
              </strong>
              <small style={{ display: 'block', fontSize: isChildRow ? '10.5px' : '11px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                {displayName}
              </small>
            </div>
          </div>
        </td>
        {isCryptoTable ? (
          <>
            <td style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '600', fontSize: isChildRow ? '12.5px' : '13px', color: 'var(--color-text-primary)' }}>{displayQty}</div>
            </td>
            <td style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '600', fontSize: isChildRow ? '12.5px' : '13px', color: 'var(--color-text-primary)' }}>{displayCost}</div>
              <div style={{ fontSize: isChildRow ? '10.5px' : '11px', marginTop: '2px', color: 'var(--color-text-secondary)' }}>
                {isSavings ? (rate > 0 ? `${rate}%/năm` : '-') : (item.symbol === 'CASH' ? '-' : displayAvgPrice)}
              </div>
            </td>
            <td style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '600', fontSize: isChildRow ? '12.5px' : '13px', color: 'var(--color-text-primary)' }}>{displayValue}</div>
              <div style={{ fontSize: isChildRow ? '10.5px' : '11px', marginTop: '2px', color: 'var(--color-text-secondary)' }}>
                {isSavings ? (rate > 0 ? `${rate}%/năm` : '-') : (item.symbol === 'CASH' ? '-' : displayCurrentPrice)}
              </div>
            </td>
            <td style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '3px', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '6px', fontSize: isChildRow ? '10.5px' : '11px', color: 'var(--color-text-secondary)' }}>
                  <span>{item.allocationPercent.toFixed(1)}% / {item.targetPercent}%</span>
                  <span style={{ color: driftColor, fontWeight: '500' }}>
                    ({drift === 0 ? 'Cân bằng' : driftText})
                  </span>
                </div>
                <div className="mini-bar" style={{ width: '80px', height: isChildRow ? '3px' : '4px', margin: '0' }}>
                  <i style={{ width: `${Math.min(item.allocationPercent * 2.8, 100)}%`, backgroundColor: color }} />
                </div>
              </div>
            </td>
          </>
        ) : (
          <>
            <td>
              <div style={{ fontWeight: '600', fontSize: isChildRow ? '12.5px' : '13px', color: 'var(--color-text-primary)' }}>{displayQty}</div>
              <div style={{ fontSize: isChildRow ? '10.5px' : '11px', marginTop: '2px', color: 'var(--color-text-secondary)' }}>
                {isSavings ? (
                  rate > 0 ? `${rate}%/năm` : '-'
                ) : (
                  item.symbol === 'CASH' ? '-' : displayCurrentPrice
                )}
              </div>
            </td>
            <td>
              <div style={{ fontWeight: '600', fontSize: isChildRow ? '12.5px' : '13px', color: 'var(--color-text-primary)' }}>{displayCost}</div>
              <div style={{ fontSize: isChildRow ? '10.5px' : '11px', marginTop: '2px', color: 'var(--color-text-secondary)' }}>
                {isSavings ? 'Gốc' : displayAvgPrice}
              </div>
            </td>
            <td>
              <div style={{ fontWeight: '600', fontSize: isChildRow ? '12.5px' : '13px', color: 'var(--color-text-primary)' }}>{displayValue}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '3px' }}>
                <div style={{ display: 'flex', gap: '6px', fontSize: isChildRow ? '10.5px' : '11px', color: 'var(--color-text-secondary)' }}>
                  <span>{item.allocationPercent.toFixed(1)}% / {item.targetPercent}%</span>
                  <span style={{ color: driftColor, fontWeight: '500' }}>
                    ({drift === 0 ? 'Cân bằng' : driftText})
                  </span>
                </div>
                <div className="mini-bar" style={{ width: '100%', maxWidth: '80px', height: isChildRow ? '3px' : '4px' }}>
                  <i style={{ width: `${Math.min(item.allocationPercent * 2.8, 100)}%`, backgroundColor: color }} />
                </div>
              </div>
            </td>
          </>
        )}
        {displayPnlNode}
        {onOpenModal && (
          <td onClick={(e) => e.stopPropagation()}>
            <div className="table-action-column">
              <button
                className="table-action-btn buy"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenModal(item.symbol, 'Mua vào')
                }}
                type="button"
                style={isChildRow ? { padding: '2px 6px', fontSize: '11px', minHeight: '22px' } : undefined}
              >
                Mua
              </button>
              <button
                className="table-action-btn sell"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenModal(item.symbol, 'Bán ra')
                }}
                type="button"
                style={isChildRow ? { padding: '2px 6px', fontSize: '11px', minHeight: '22px' } : undefined}
              >
                Bán
              </button>
            </div>
          </td>
        )}
      </tr>
    )
  }

  return (
    <div className="table-shell">
      <table className="compact-table">
        <thead>
          {isCryptoTable ? (
            <tr>
              <th>Tài sản</th>
              <th style={{ textAlign: 'right' }}>Số lượng</th>
              <th style={{ textAlign: 'right' }}>Giá vốn</th>
              <th style={{ textAlign: 'right' }}>Giá hiện tại</th>
              <th style={{ textAlign: 'center' }}>Tỷ trọng</th>
              <th style={{ textAlign: 'right' }}>Hiệu suất (PnL)</th>
              {onOpenModal && <th style={{ width: '80px', textAlign: 'center' }}>Thao tác</th>}
            </tr>
          ) : (
            <tr>
              <th>Tài sản</th>
              <th>Số lượng &amp; Giá mua</th>
              <th>Giá vốn</th>
              <th>Giá trị &amp; Tỷ trọng</th>
              <th>Hiệu suất (PnL)</th>
              {onOpenModal && <th style={{ width: '80px', textAlign: 'center' }}>Thao tác</th>}
            </tr>
          )}
        </thead>
        <tbody>
          {grouped ? (
            groups.map((group) => {
              const isExpanded = !!expandedCategories[group.category]
              const hasMultiple = group.items.length > 1
              const isGroupCrypto = group.category === 'crypto'
              
              const groupPnlVal = Math.round(group.totalValue - group.totalCost)
              const groupPnlPct = group.totalCost > 0 ? (groupPnlVal / group.totalCost * 100) : 0
              const groupPnlClass = group.category === 'cash' ? '' : (groupPnlPct >= 0 ? 'positive' : 'negative')
              const groupPnlSign = groupPnlPct >= 0 ? '+' : ''
              const groupDrift = group.totalAllocation - group.totalTarget
              const groupDriftText = groupDrift >= 0 ? `+${groupDrift.toFixed(1)}%` : `${groupDrift.toFixed(1)}%`
              const groupDriftColor = Math.abs(groupDrift) > 3 
                ? (groupDrift > 0 ? 'var(--color-red)' : 'var(--color-primary)') 
                : 'var(--color-text-secondary)'

              const parentCost = isGroupCrypto ? formatUSD(group.totalCost / USD_VND_RATE) : formatMoney(group.totalCost)
              const parentValue = isGroupCrypto ? formatUSD(group.totalValue / USD_VND_RATE) : formatMoney(group.totalValue)

              const singleItem = !hasMultiple ? group.items[0] : null
              let singleDisplayQty = ''
              let singleDisplayAvgPrice = ''
              let singleDisplayCurrentPrice = ''
              if (singleItem) {
                const isSavingsSingle = singleItem.category === 'savings' || singleItem.symbol.startsWith('STK-')
                if (isSavingsSingle) {
                  try {
                    if (singleItem.quantity.startsWith('{')) {
                      const meta = JSON.parse(singleItem.quantity)
                      singleDisplayQty = meta.term || '1 sổ'
                      if (isCryptoTable) {
                        singleDisplayCurrentPrice = meta.rate > 0 ? `${meta.rate}%/năm` : '-'
                        singleDisplayAvgPrice = '-'
                      } else {
                        singleDisplayAvgPrice = meta.rate > 0 ? `${meta.rate}%/năm` : '-'
                        singleDisplayCurrentPrice = '-'
                      }
                    } else {
                      singleDisplayQty = singleItem.quantity || '1 sổ'
                      singleDisplayCurrentPrice = '-'
                      singleDisplayAvgPrice = '-'
                    }
                  } catch (_) {
                    singleDisplayQty = '1 sổ'
                    singleDisplayCurrentPrice = '-'
                    singleDisplayAvgPrice = '-'
                  }
                } else {
                  singleDisplayQty = cleanQuantity(singleItem.quantity)
                  const sqty = parseQtyString(singleItem.quantity)
                  const scost = singleItem.valueVnd / (1 + (singleItem.pnlPercent || 0) / 100)
                  const savgPrice = sqty > 0 ? scost / sqty : 0
                  const scurrentPrice = sqty > 0 ? singleItem.valueVnd / sqty : 0
                  if (isGroupCrypto) {
                    singleDisplayAvgPrice = singleItem.symbol === 'CASH' ? '-' : formatUSD(savgPrice / USD_VND_RATE)
                    singleDisplayCurrentPrice = singleItem.symbol === 'CASH' ? '-' : formatUSD(scurrentPrice / USD_VND_RATE)
                  } else {
                    singleDisplayAvgPrice = singleItem.symbol === 'CASH' ? '-' : formatMoney(savgPrice)
                    singleDisplayCurrentPrice = singleItem.symbol === 'CASH' ? '-' : formatMoney(scurrentPrice)
                  }
                }
              }

              return (
                <React.Fragment key={group.category}>
                  <tr
                    className={`group-parent-row${hasMultiple ? ' expandable' : ''}${!hasMultiple && selectedHolding?.symbol === singleItem?.symbol ? ' selected' : ''}`}
                    onClick={() => {
                      if (hasMultiple) {
                        setExpandedCategories((prev) => ({ ...prev, [group.category]: !prev[group.category] }))
                      } else if (singleItem) {
                        setSelectedHolding(singleItem)
                      }
                    }}
                  >
                    <td>
                      <div className="asset-cell">
                        {hasMultiple ? (
                          <span style={{ marginRight: '4px', color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center' }}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                        ) : (
                          <span style={{ marginRight: '4px', width: '14px', display: 'inline-flex' }} />
                        )}
                        <span style={{ marginRight: '6px' }}>
                          <CategoryIcon category={group.category} size={28} />
                        </span>
                        <div>
                          <strong style={{ display: 'block', fontSize: '13px', color: 'var(--color-text-primary)' }}>{group.categoryTitle}</strong>
                          <small style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                            {hasMultiple
                              ? `${group.items.length} tài sản`
                              : (singleItem?.name || '').replace(/^(Tiết kiệm|Sổ tiết kiệm|Tài khoản tiết kiệm)\s+/i, '')}
                          </small>
                        </div>
                      </div>
                    </td>
                    {isCryptoTable ? (
                      <>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            {hasMultiple ? `${group.items.length} tài sản` : singleDisplayQty}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--color-text-primary)' }}>{parentCost}</div>
                          <div style={{ fontSize: '11px', marginTop: '2px', color: 'var(--color-text-secondary)' }}>
                            {hasMultiple ? '-' : singleDisplayAvgPrice}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--color-text-primary)' }}>{parentValue}</div>
                          <div style={{ fontSize: '11px', marginTop: '2px', color: 'var(--color-text-secondary)' }}>
                            {hasMultiple ? '-' : singleDisplayCurrentPrice}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '3px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                              <span>{group.totalAllocation.toFixed(1)}% / {group.totalTarget.toFixed(1)}%</span>
                              <span style={{ color: groupDriftColor, fontWeight: '500' }}>
                                ({groupDrift === 0 ? 'Cân bằng' : groupDriftText})
                              </span>
                            </div>
                            <div className="mini-bar" style={{ width: '80px', margin: '0' }}>
                              <i style={{ width: `${Math.min(group.totalAllocation * 2.8, 100)}%`, backgroundColor: group.color }} />
                        </div>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            {hasMultiple ? `${group.items.length} tài sản` : singleDisplayQty}
                          </div>
                          <div style={{ fontSize: '11px', marginTop: '2px', color: 'var(--color-text-secondary)' }}>
                            {hasMultiple ? '-' : singleDisplayAvgPrice}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--color-text-primary)' }}>{parentCost}</div>
                          <div style={{ fontSize: '11px', marginTop: '2px', color: 'var(--color-text-secondary)' }}>
                            {hasMultiple ? '-' : singleDisplayCurrentPrice}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--color-text-primary)' }}>{parentValue}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '3px' }}>
                            <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                              <span>{group.totalAllocation.toFixed(1)}% / {group.totalTarget.toFixed(1)}%</span>
                              <span style={{ color: groupDriftColor, fontWeight: '500' }}>
                                ({groupDrift === 0 ? 'Cân bằng' : groupDriftText})
                              </span>
                            </div>
                            <div className="mini-bar" style={{ width: '100%', maxWidth: '80px' }}>
                              <i style={{ width: `${Math.min(group.totalAllocation * 2.8, 100)}%`, backgroundColor: group.color }} />
                            </div>
                          </div>
                        </td>
                      </>
                    )}
                    <td className={groupPnlClass} style={isCryptoTable ? { textAlign: 'right' } : undefined}>
                      {group.category === 'cash' ? (
                        '-'
                      ) : (
                        <>
                          <div style={{ fontWeight: '600', fontSize: '13px' }}>
                            {groupPnlSign}{groupPnlPct.toFixed(2)}%
                          </div>
                          <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.8, color: 'var(--color-text-secondary)' }}>
                            {groupPnlSign}{isGroupCrypto ? formatUSD(groupPnlVal / USD_VND_RATE) : formatMoney(groupPnlVal)}
                          </div>
                        </>
                      )}
                    </td>
                    {onOpenModal && <td />}
                  </tr>

                  {/* Expanded Child Rows */}
                  {hasMultiple && isExpanded &&
                    group.items.map((item) => renderRow(item, true, group.color))}
                </React.Fragment>
              )
            })
          ) : (
            [...rows].sort((a, b) => b.valueVnd - a.valueVnd).map((item) => renderRow(item))
          )}
        </tbody>
      </table>
    </div>
  )
}

function TransactionList({
  rows,
  onDelete,
  onEdit,
  goldPrices,
  category,
}: {
  rows: TransactionRecord[]
  onDelete?: (id: string) => void
  onEdit?: (tx: TransactionRecord) => void
  goldPrices?: Record<string, GoldPriceDetail> | null
  category?: AssetCategory | 'mixed'
}) {
  const allSavings = rows.length > 0 && rows.every(tx => tx.assetSymbol.startsWith('STK-') || (tx.note && tx.note.startsWith('{') && tx.note.includes('"type":"savings"')))
  const hasSavings = rows.some(tx => tx.assetSymbol.startsWith('STK-') || (tx.note && tx.note.startsWith('{') && tx.note.includes('"type":"savings"')))
  
  let priceHeaderLabel = 'Giá vốn'
  if (category === 'stocks' || category === 'bonds' || category === 'etf') {
    priceHeaderLabel = 'Giá mua trung bình'
  } else if (category === 'savings') {
    priceHeaderLabel = 'Lãi suất'
  } else if (category === 'gold' || category === 'crypto' || category === 'cash') {
    priceHeaderLabel = 'Giá vốn'
  } else {
    priceHeaderLabel = allSavings ? 'Lãi suất' : (hasSavings ? 'Giá vốn / Lãi suất' : 'Giá vốn')
  }

  return (
    <div className="table-shell transaction-list-table-wrapper">
      <table className="transaction-list-table">
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Loại GD</th>
            <th>Sản phẩm</th>
            <th style={{ textAlign: 'right' }}>Số lượng</th>
            <th style={{ textAlign: 'right' }}>{priceHeaderLabel}</th>
            <th style={{ textAlign: 'right' }}>Thành tiền</th>
            <th>Trạng thái</th>
            {(onDelete || onEdit) && <th style={{ width: '80px', textAlign: 'center' }}>Thao tác</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => {
            const isOut = tx.transactionType === 'sell' || tx.transactionType === 'withdraw'
            const meta = getTransactionMeta(tx)
            const goldConfig = getGoldQuoteConfig(tx.assetSymbol)
            const inferredGoldUnitPrice = goldConfig ? getGoldUnitPrice(tx.assetSymbol, goldPrices, tx.transactionType === 'sell' ? 'buy' : 'sell') : null
            const inferredGoldQty = goldConfig && inferredGoldUnitPrice && inferredGoldUnitPrice > 0
              ? tx.amountVnd / inferredGoldUnitPrice
              : 0
            const quantityLabel = meta.quantity || (goldConfig && inferredGoldQty > 0 ? `${formatQuantity(inferredGoldQty)} ${goldConfig.unit}` : '')
            const unitPrice = meta.unitPriceVnd || inferredGoldUnitPrice || 0
            const qVal = parseQtyString(quantityLabel)

            const isCash = tx.assetSymbol === 'CASH'
            const isSavings = tx.assetSymbol.startsWith('STK-') || (tx.note && tx.note.startsWith('{') && tx.note.includes('"type":"savings"'))
            const isCrypto = tx.assetSymbol.endsWith('USDT') || ['BTC', 'ETH', 'BNB', 'SOL', 'USDT', 'ADA', 'XRP', 'DOT', 'DOGE', 'SHIB', 'AVAX', 'LINK', 'MATIC', 'LTC', 'UNI'].includes(tx.assetSymbol.toUpperCase())
            const badgeColor = isCash ? 'var(--color-primary)' : isSavings ? '#0f9f8f' : (isCrypto ? '#6a7cff' : 'var(--color-gold)')
            
            let assetName = tx.assetSymbol === 'CASH' ? 'Ví VND' : tx.assetSymbol
            let typeTranslated = translateTxType(tx.transactionType)
            
            if (isSavings && tx.note) {
              try {
                const jsonMeta = JSON.parse(tx.note)
                assetName = `Tiết kiệm ${jsonMeta.bank}`
                typeTranslated = tx.transactionType === 'buy' ? 'Mở sổ' : tx.transactionType === 'sell' ? 'Tất toán' : 'Nhập sổ'
              } catch (e) {}
            } else {
              if (tx.assetSymbol === 'VNHAN') assetName = 'Vàng nhẫn'
              else if (tx.assetSymbol === 'VMIENG') assetName = 'Vàng miếng SJC'
              else if (tx.assetSymbol === 'VKIENG') assetName = 'Vàng kiềng'
            }

            const sourceLabel = tx.fundingSource === 'opening-balance' ? 'Số dư đầu kỳ' : 'Ví'

            let typeClass = 'tx-type-neutral'
            if (tx.transactionType === 'buy' || tx.transactionType === 'deposit') {
              typeClass = 'tx-type-buy'
            } else if (tx.transactionType === 'sell' || tx.transactionType === 'withdraw') {
              typeClass = 'tx-type-sell'
            } else if (tx.transactionType === 'import-existing') {
              typeClass = 'tx-type-import'
            }

            const displayQty = isCash ? '-' : isSavings ? '1 sổ' : cleanQuantity(quantityLabel)

            let displayPrice = '-'
            if (isSavings) {
              if (tx.note) {
                try {
                  const jsonMeta = JSON.parse(tx.note)
                  if (jsonMeta.rate) {
                    displayPrice = `${jsonMeta.rate}%/năm`
                  }
                } catch (e) {}
              }
            } else if (!isCash) {
              let p = 0
              if (tx.transactionType === 'import-existing') {
                p = (meta.unitPriceVnd && meta.unitPriceVnd > 0) ? meta.unitPriceVnd : ((meta.costVnd > 0 && qVal > 0) ? (meta.costVnd / qVal) : unitPrice)
              } else {
                p = unitPrice
              }
              displayPrice = p > 0 ? (isCrypto ? formatUSD(p / USD_VND_RATE) : formatMoney(p)) : '-'
            }

            let displayTotal = ''
            if (isCrypto) {
              if (tx.transactionType === 'import-existing') {
                const userCostTotal = (meta.unitPriceVnd && meta.unitPriceVnd > 0 && qVal > 0) ? meta.unitPriceVnd * qVal : (meta.costVnd > 0 ? meta.costVnd : tx.amountVnd)
                displayTotal = formatUSD(userCostTotal / USD_VND_RATE)
              } else {
                displayTotal = formatUSD(tx.amountVnd / USD_VND_RATE)
              }
            } else {
              let totalAmount = tx.amountVnd
              if (tx.transactionType === 'import-existing') {
                const userCostTotal = (meta.unitPriceVnd && meta.unitPriceVnd > 0 && qVal > 0) ? meta.unitPriceVnd * qVal : (meta.costVnd > 0 ? meta.costVnd : tx.amountVnd)
                totalAmount = userCostTotal
              }
              displayTotal = formatMoney(totalAmount)
            }

            return (
              <tr key={tx.id}>
                <td>
                  <div className="tx-time-cell">
                    <strong>{formatDate(tx.date)}</strong>
                    <small style={{ display: 'block', fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      {tx.id} · {sourceLabel}
                    </small>
                  </div>
                </td>
                <td>
                  <span className={`tx-type-badge ${typeClass}`}>{typeTranslated}</span>
                </td>
                <td>
                  <div className="tx-asset-cell" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isCrypto ? (
                      <CryptoLogo symbol={tx.assetSymbol} size={20} borderRadius="4px" marginRight="0" />
                    ) : (
                      <span className="asset-badge" style={{ backgroundColor: badgeColor, minWidth: '32px', height: '20px', padding: '0 4px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {tx.assetSymbol.slice(0, 2)}
                      </span>
                    )}
                    <span>{assetName}</span>
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>{displayQty}</td>
                <td style={{ textAlign: 'right' }}>{displayPrice}</td>
                <td style={{ textAlign: 'right', fontWeight: '600' }} className={isOut ? 'negative' : 'positive'}>
                  {isOut ? '-' : '+'}{displayTotal}
                </td>
                <td>
                  <span className="status done" style={{ margin: 0 }}>Hoàn tất</span>
                </td>
                {(onDelete || onEdit) && (
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                      {onEdit && tx.transactionType === 'import-existing' && (
                        <button className="tx-edit-btn" onClick={() => onEdit(tx)} title="Sửa giao dịch" type="button" style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                          <Pencil size={15} />
                        </button>
                      )}
                      {onDelete && (
                        <button className="tx-delete-btn" onClick={() => onDelete(tx.id)} title="Xóa giao dịch" type="button" style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TelegramInboxComposer({
  value,
  onChange,
  onSubmit,
  isSubmitting,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isSubmitting: boolean
}) {
  return (
    <div className="telegram-composer">
      <div className="telegram-composer-copy">
        <strong>Mô phỏng lệnh bot Telegram</strong>
        <span>Ví dụ: `/mua HPG 100`, `/ban HPG 100 23200`, `/mua ADA 100 1200`</span>
      </div>
      <div className="telegram-composer-row">
        <input
          className="telegram-command-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder="Nhập lệnh Telegram kiểu /mua HPG 100 để tạo giao dịch chờ duyệt..."
        />
        <button className="primary-button" disabled={isSubmitting} onClick={onSubmit} type="button">
          {isSubmitting ? 'Đang lưu...' : 'Tạo inbox event'}
        </button>
      </div>
    </div>
  )
}

function TelegramInboxList({
  rows,
  onApprove,
  onReject,
  onUpdate,
  readOnly = false,
}: {
  rows: TelegramInboxEvent[]
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onUpdate?: (id: string, updatedDraft: TelegramInboxParsedPayload) => void
  readOnly?: boolean
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Local state for the inline edit form fields
  const [editSymbol, setEditSymbol] = useState('')
  const [editQty, setEditQty] = useState(0)
  const [editPrice, setEditPrice] = useState(0)
  const [editType, setEditType] = useState<'buy' | 'sell'>('buy')
  const [editFunding, setEditFunding] = useState<'wallet' | 'opening-balance'>('wallet')
  const [editFee, setEditFee] = useState(0)
  const [editNote, setEditNote] = useState('')

  const startEditing = (row: TelegramInboxEvent) => {
    const draft = row.draftTransaction
    setEditingId(row.id)
    setEditSymbol(draft?.assetSymbol || '')
    setEditQty(draft?.quantity || 0)
    setEditPrice(draft?.unitPriceVnd || 0)
    setEditType((draft?.transactionType as 'buy' | 'sell') || 'buy')
    setEditFunding((draft?.fundingSource as 'wallet' | 'opening-balance') || 'wallet')
    setEditFee(draft?.feeVnd || 0)
    setEditNote(draft?.note || '')
  }

  const handleSave = (id: string) => {
    const amountVnd = Math.round(editQty * editPrice)
    const formattedPrice = formatTelegramUnitPrice(editSymbol, editPrice)
    const updatedDraft = {
      date: new Date().toISOString().slice(0, 10),
      occurredAt: new Date().toISOString(),
      transactionType: editType,
      assetSymbol: editSymbol.trim().toUpperCase(),
      amountVnd,
      note: editNote.trim() || `[telegram] ${editType === 'buy' ? 'Mua' : 'Bán'} ${editQty} ${editSymbol.trim().toUpperCase()} @ ${formattedPrice} (chỉnh sửa)`,
      quantity: editQty,
      unit: 'don vi',
      unitPriceVnd: editPrice,
      capitalAmountVnd: amountVnd,
      feeVnd: editFee,
      walletImpactVnd: editType === 'buy' ? -amountVnd : amountVnd,
      linkedAssetSymbol: editSymbol.trim().toUpperCase(),
      fundingSource: editFunding,
      parserVersion: 'telegram-v2-edit',
      summary: `${editType === 'buy' ? 'Mua' : 'Bán'} ${editQty} ${editSymbol.trim().toUpperCase()} @ ${formattedPrice}`,
    }
    onUpdate?.(id, updatedDraft)
    setEditingId(null)
  }

  if (rows.length === 0) {
    return (
      <div className="telegram-empty-state">
        <div className="telegram-empty-icon">
          <Check size={24} />
        </div>
        <strong>Không còn giao dịch chờ duyệt</strong>
        <span>Mọi sự kiện từ Telegram đã được xử lý sạch sẽ! ✨</span>
      </div>
    )
  }

  return (
    <div className="telegram-inbox-list">
      {rows.map((row) => {
        const isEditing = editingId === row.id
        const draft = row.draftTransaction
        const isBuy = draft?.transactionType === 'buy'
        const hasWarning = !draft || !draft.unitPriceVnd || draft.unitPriceVnd <= 0

        return (
          <article 
            className={`telegram-inbox-card ${isBuy ? 'type-buy' : 'type-sell'}`} 
            key={row.id}
          >
            {/* Card Header Meta */}
            <div className="telegram-card-meta">
              <div className="telegram-meta-left">
                <span className="telegram-source-tag">
                  <Hash size={12} /> Telegram
                </span>
                <span className="telegram-raw-cmd">{row.rawText}</span>
              </div>
              <span className="telegram-timestamp">{formatDate(row.createdAt)}</span>
            </div>

            {isEditing ? (
              /* Inline Edit Form */
              <div className="telegram-edit-form">
                <div className="edit-form-grid">
                  <div className="edit-form-field">
                    <label>Mã tài sản</label>
                    <input 
                      value={editSymbol} 
                      onChange={(e) => setEditSymbol(e.target.value)} 
                      placeholder="VD: HPG, BTC" 
                    />
                  </div>
                  <div className="edit-form-field">
                    <label>Loại giao dịch</label>
                    <select 
                      value={editType} 
                      onChange={(e) => setEditType(e.target.value as 'buy' | 'sell')}
                    >
                      <option value="buy">Mua vào</option>
                      <option value="sell">Bán ra</option>
                    </select>
                  </div>
                  <div className="edit-form-field">
                    <label>Số lượng</label>
                    <input 
                      type="number" 
                      value={editQty} 
                      onChange={(e) => setEditQty(Number(e.target.value))} 
                    />
                  </div>
                  <div className="edit-form-field">
                    <label>Đơn giá (VND)</label>
                    <input 
                      type="number" 
                      value={editPrice} 
                      onChange={(e) => setEditPrice(Number(e.target.value))} 
                    />
                  </div>
                  <div className="edit-form-field">
                    <label>Nguồn tiền</label>
                    <select 
                      value={editFunding} 
                      onChange={(e) => setEditFunding(e.target.value as 'wallet' | 'opening-balance')}
                    >
                      <option value="wallet">Ví VND</option>
                      <option value="opening-balance">Số dư đầu kỳ</option>
                    </select>
                  </div>
                  <div className="edit-form-field">
                    <label>Phí giao dịch (VND)</label>
                    <input 
                      type="number" 
                      value={editFee} 
                      onChange={(e) => setEditFee(Number(e.target.value))} 
                    />
                  </div>
                </div>
                <div className="edit-form-field">
                  <label>Ghi chú</label>
                  <input 
                    value={editNote} 
                    onChange={(e) => setEditNote(e.target.value)} 
                    placeholder="Nhập ghi chú giao dịch..." 
                  />
                </div>
                <div className="edit-form-actions">
                  <button 
                    className="telegram-action-btn btn-edit" 
                    onClick={() => setEditingId(null)} 
                    type="button"
                  >
                    Hủy
                  </button>
                  <button 
                    className="telegram-action-btn btn-approve" 
                    onClick={() => handleSave(row.id)} 
                    type="button"
                  >
                    Lưu
                  </button>
                </div>
              </div>
            ) : (
              /* Card View Mode */
              <>
                <div className="telegram-card-body">
                  <div className="telegram-card-info">
                    <div className="telegram-type-icon-wrapper">
                      {isBuy ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                    </div>
                    <div className="telegram-summary-details">
                      <strong className="telegram-summary-title">
                        {draft ? getTelegramEventSummary(draft) : 'Chưa dịch được lệnh'}
                      </strong>
                      {draft && (
                        <div className="telegram-summary-meta">
                          <span>{translateTxType(draft.transactionType)}</span>
                          <span>Mã: {draft.assetSymbol}</span>
                          <span>SL: {draft.quantity?.toLocaleString('vi-VN') ?? 0}</span>
                          {draft.unitPriceVnd !== undefined && draft.unitPriceVnd > 0 && (
                            <span>Đơn giá: {formatTelegramUnitPrice(draft.assetSymbol, draft.unitPriceVnd)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="telegram-card-value">
                    <span className="telegram-large-amount">
                      {draft && draft.amountVnd > 0 
                        ? (isLikelyCryptoSymbol(draft.assetSymbol)
                            ? formatUSD(draft.amountVnd / USD_VND_RATE)
                            : formatMoney(draft.amountVnd))
                        : 'Liên hệ / Thiếu giá'}
                    </span>
                    <span className="telegram-user-ref">
                      @{row.fromUsername || 'ẩn danh'} · {row.id}
                    </span>
                  </div>
                </div>

                {/* Warning Banner if price is missing */}
                {hasWarning && !readOnly && (
                  <div 
                    className="telegram-warning-banner" 
                    onClick={() => startEditing(row)}
                  >
                    <AlertCircle size={16} />
                    <span>Thiếu thông tin đơn giá. Nhấp vào đây để chỉnh sửa và bổ sung giá.</span>
                  </div>
                )}

                {/* Footer Actions */}
                <div className="telegram-inbox-actions">
                  {readOnly ? (
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                      Trạng thái: {row.status === 'approved' ? 'Đã duyệt 🟢' : 'Đã từ chối 🔴'}
                    </span>
                  ) : (
                    <>
                      <button
                        className="telegram-action-btn btn-reject"
                        onClick={() => onReject?.(row.id)}
                        type="button"
                      >
                        <X size={16} /> Từ chối
                      </button>
                      <button
                        className="telegram-action-btn btn-edit"
                        onClick={() => startEditing(row)}
                        type="button"
                      >
                        <Pencil size={14} /> Chỉnh sửa
                      </button>
                      <button
                        className="telegram-action-btn btn-approve"
                        disabled={hasWarning}
                        onClick={() => onApprove?.(row.id)}
                        type="button"
                      >
                        <Check size={16} /> Duyệt vào sổ cái
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </article>
        )
      })}
    </div>
  )
}

function CompactTransactionList({
  rows,
  onDelete,
  goldPrices,
}: {
  rows: TransactionRecord[]
  onDelete?: (id: string) => void
  goldPrices?: Record<string, GoldPriceDetail> | null
}) {
  return (
    <div className="vcb-tx-list" style={{ padding: '4px 0' }}>
      {rows.map((tx) => {
        const meta = getTransactionMeta(tx)
        const goldConfig = getGoldQuoteConfig(tx.assetSymbol)
        const inferredGoldUnitPrice = goldConfig ? getGoldUnitPrice(tx.assetSymbol, goldPrices, tx.transactionType === 'sell' ? 'buy' : 'sell') : null
        const inferredGoldQty = goldConfig && inferredGoldUnitPrice && inferredGoldUnitPrice > 0
          ? tx.amountVnd / inferredGoldUnitPrice
          : 0
        const quantityLabel = meta.quantity || (goldConfig && inferredGoldQty > 0 ? `${formatQuantity(inferredGoldQty)} ${goldConfig.unit}` : '')
        const unitPrice = meta.unitPriceVnd || inferredGoldUnitPrice || 0
        const qVal = parseQtyString(quantityLabel)

        const isCash = tx.assetSymbol === 'CASH'
        const isSavings = tx.assetSymbol.startsWith('STK-') || (tx.note && tx.note.startsWith('{') && tx.note.includes('"type":"savings"'))
        const isCrypto = tx.assetSymbol.endsWith('USDT') || ['BTC', 'ETH', 'BNB', 'SOL', 'USDT', 'ADA', 'XRP', 'DOT', 'DOGE', 'SHIB', 'AVAX', 'LINK', 'MATIC', 'LTC', 'UNI'].includes(tx.assetSymbol.toUpperCase())
        const badgeColor = isCash ? 'var(--color-primary)' : isSavings ? '#0f9f8f' : (isCrypto ? '#6a7cff' : 'var(--color-gold)')
        
        let assetName = tx.assetSymbol === 'CASH' ? 'Ví VND' : tx.assetSymbol
        let typeTranslated = translateTxType(tx.transactionType)
        
        if (isSavings && tx.note) {
          try {
            const jsonMeta = JSON.parse(tx.note)
            assetName = `Tiết kiệm ${jsonMeta.bank}`
            typeTranslated = tx.transactionType === 'buy' ? 'Mở sổ' : tx.transactionType === 'sell' ? 'Tất toán' : 'Nhập sổ'
          } catch (e) {}
        } else {
          if (tx.assetSymbol === 'VNHAN') assetName = 'Vàng nhẫn'
          else if (tx.assetSymbol === 'VMIENG') assetName = 'Vàng miếng SJC'
          else if (tx.assetSymbol === 'VKIENG') assetName = 'Vàng kiềng'
        }

        const displayQty = isCash ? '-' : isSavings ? '1 sổ' : quantityLabel

        let displayPrice = '-'
        if (isSavings) {
          if (tx.note) {
            try {
              const jsonMeta = JSON.parse(tx.note)
              if (jsonMeta.rate) {
                displayPrice = `${jsonMeta.rate}%/năm`
              }
            } catch (e) {}
          }
        } else if (!isCash) {
          let p = 0
          if (tx.transactionType === 'import-existing') {
            p = (meta.unitPriceVnd && meta.unitPriceVnd > 0) ? meta.unitPriceVnd : ((meta.costVnd > 0 && qVal > 0) ? (meta.costVnd / qVal) : unitPrice)
          } else {
            p = unitPrice
          }
          displayPrice = p > 0 ? (isCrypto ? formatUSD(p) : formatMoney(p)) : '-'
        }

        let displayTotal = ''
        if (isCrypto) {
          if (tx.transactionType === 'import-existing') {
            const userCostTotal = (meta.unitPriceVnd && meta.unitPriceVnd > 0 && qVal > 0) ? meta.unitPriceVnd * qVal : (meta.costVnd > 0 ? meta.costVnd : tx.amountVnd)
            displayTotal = formatUSD(userCostTotal)
          } else {
            displayTotal = formatUSD(tx.amountVnd / USD_VND_RATE)
          }
        } else {
          let totalAmount = tx.amountVnd
          if (tx.transactionType === 'import-existing') {
            const userCostTotal = (meta.unitPriceVnd && meta.unitPriceVnd > 0 && qVal > 0) ? meta.unitPriceVnd * qVal : (meta.costVnd > 0 ? meta.costVnd : tx.amountVnd)
            totalAmount = userCostTotal
          }
          displayTotal = formatMoney(totalAmount)
        }

        const isIn = tx.transactionType === 'deposit' || tx.transactionType === 'sell' || tx.transactionType === 'import-existing'
        const iconWrapperClass = isIn ? 'in' : 'out'
        const amountSign = isIn ? '+' : '-'

        let subtext = ''
        if (isCash) {
          subtext = tx.note || 'Giao dịch ví'
        } else if (isSavings) {
          subtext = 'Mở sổ tiết kiệm'
          if (tx.note) {
            try {
              const jsonMeta = JSON.parse(tx.note)
              subtext = `${jsonMeta.bank} • Kỳ hạn ${jsonMeta.term}T`
            } catch (e) {
              subtext = tx.note
            }
          }
        } else {
          if (displayQty && displayPrice !== '-') {
            subtext = `${displayQty} @ ${displayPrice}`
          } else if (displayQty) {
            subtext = `SL: ${displayQty}`
          } else {
            subtext = tx.note || ''
          }
        }

        if (tx.fundingSource === 'opening-balance') {
          subtext = `${subtext ? `${subtext} · ` : ''}Nguồn: Số dư đầu kỳ`
        }

        return (
          <div className="vcb-tx-item" key={tx.id} style={{ padding: '12px 14px' }}>
            <div className="vcb-tx-left" style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
              <div className={`vcb-tx-icon-wrapper ${iconWrapperClass}`} style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                {isIn ? <Plus size={14} /> : <ArrowUpRight size={14} />}
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {isCrypto ? (
                  <CryptoLogo symbol={tx.assetSymbol} size={22} borderRadius="5px" marginRight="0" />
                ) : (
                  <span className="asset-badge" style={{ backgroundColor: badgeColor, minWidth: '32px', height: '22px', padding: '0 4px', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontWeight: 'bold' }}>
                    {tx.assetSymbol.slice(0, 3)}
                  </span>
                )}
              </div>

              <div className="vcb-tx-details" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="vcb-tx-title" style={{ fontWeight: '750', fontSize: '13px', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {typeTranslated} {assetName}
                </span>
                <div className="vcb-tx-meta" style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span>{formatDate(tx.date)}</span>
                  <span className="vcb-tx-sep" style={{ opacity: 0.5 }}>•</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtext}</span>
                </div>
              </div>
            </div>
            
            <div className="vcb-tx-right" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <span className="vcb-tx-amount" style={{ fontWeight: '800', fontSize: '13.5px', color: isIn ? 'var(--color-primary)' : 'var(--color-red)' }}>
                {amountSign}{displayTotal}
              </span>
            </div>

            {onDelete && (
              <button 
                className="vcb-tx-delete-btn" 
                onClick={() => onDelete(tx.id)} 
                title="Xóa giao dịch" 
                type="button"
                style={{ marginLeft: '8px', padding: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WalletStatementList({
  rows,
  onDelete,
}: {
  rows: WalletStatementEntry[]
  onDelete?: (id: string) => void
}) {
  return (
    <div className="vcb-tx-list">
      {rows.map((entry) => {
        const isOut = entry.direction === 'out'
        return (
          <div className="vcb-tx-item" key={entry.id}>
            <div className="vcb-tx-left">
              <div className={`vcb-tx-icon-wrapper ${isOut ? 'out' : 'in'}`}>
                {isOut ? <ArrowUpRight size={16} /> : <Plus size={16} />}
              </div>
              <div className="vcb-tx-details">
                <span className="vcb-tx-title">{entry.title}</span>
                <div className="vcb-tx-meta">
                  <span className="vcb-tx-time">{entry.date}</span>
                  <span className="vcb-tx-sep">•</span>
                  <span className="vcb-tx-id">{entry.id}</span>
                </div>
              </div>
            </div>
            
            <div className="vcb-tx-right">
              <span className={`vcb-tx-amount ${isOut ? 'out' : 'in'}`}>
                {isOut ? '-' : '+'}{formatMoney(Math.abs(entry.amountVnd))}
              </span>
              <span className="vcb-tx-balance">
                Số dư: {formatMoney(entry.balanceAfterVnd)}
              </span>
            </div>

            {onDelete && (
              <button 
                className="vcb-tx-delete-btn" 
                onClick={() => onDelete(entry.id)} 
                title="Xóa giao dịch" 
                type="button"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RecentTransactionsModal({
  rows,
  goldPrices,
  onClose,
  onDelete,
  onEdit,
}: {
  rows: TransactionRecord[]
  goldPrices?: Record<string, GoldPriceDetail> | null
  onClose: () => void
  onDelete?: (id: string) => void
  onEdit?: (tx: TransactionRecord) => void
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label="Toàn bộ giao dịch gần đây"
        aria-modal="true"
        className="recent-transactions-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="recent-transactions-modal-header">
          <div>
            <span className="recent-transactions-modal-eyebrow">Lịch sử gần đây</span>
            <h3>Toàn bộ giao dịch</h3>
          </div>
          <button className="asset-detail-close" onClick={onClose} title="Đóng" type="button">
            <X size={18} />
          </button>
        </div>

        <div className="recent-transactions-modal-body">
          <TransactionList category="mixed" rows={rows} goldPrices={goldPrices} onDelete={onDelete} onEdit={onEdit} />
        </div>
      </section>
    </div>
  )
}

function AssetDetailPanel({
  asset,
  color,
  transactions,
  onClose,
  onOpenModal,
  onDeleteTransaction,
  onEditTransaction,
}: {
  asset: HoldingRecord
  color: string
  transactions: TransactionRecord[]
  onClose?: () => void
  onOpenModal?: (symbol?: string, type?: string) => void
  onDeleteTransaction?: (id: string) => void
  onEditTransaction?: (tx: TransactionRecord) => void
}) {
  const drift = asset.allocationPercent - asset.targetPercent
  const allocationWidth = Math.min(Math.max(asset.allocationPercent, 0), 100)
  const targetLeft = Math.min(Math.max(asset.targetPercent, 0), 100)
  const latestTransaction = transactions[0]

  return (
    <div className="asset-detail-modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label={`Chi tiết ${asset.symbol}`}
        aria-modal="true"
        className="asset-detail-modal premium-asset-detail"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button className="asset-detail-close" onClick={onClose} title="Đóng" type="button">
          <X size={18} />
        </button>
        <div className="asset-detail-hero" style={{ ['--asset-color' as string]: color }}>
        <div className="asset-detail-identity" style={{ flex: 1 }}>
          {asset.category === 'crypto' ? (
            <CryptoLogo symbol={asset.symbol} size={48} borderRadius="16px" marginRight="16px" />
          ) : (
            <span className="asset-badge detail-badge" style={{ backgroundColor: color }}>
              {asset.symbol.slice(0, 2)}
            </span>
          )}
          <div>
            <span className="detail-eyebrow">Đang theo dõi</span>
            <h2>{asset.name}</h2>
            <p>{asset.symbol} · {asset.group} · {asset.quantity}</p>
          </div>
          
          <div className="detail-hero-actions" style={{ display: 'flex', gap: '8px', marginLeft: '24px' }}>
            <button
              className="premium-action-btn buy-btn"
              onClick={() => {
                onOpenModal?.(asset.symbol, 'Mua vào')
                onClose?.()
              }}
            >
              Mua
            </button>
            <button
              className="premium-action-btn sell-btn"
              onClick={() => {
                onOpenModal?.(asset.symbol, 'Bán ra')
                onClose?.()
              }}
            >
              Bán
            </button>
          </div>
        </div>
        <div className="asset-detail-value">
          <span>Giá trị hiện tại</span>
          <strong>{asset.category === 'crypto' ? formatUSD(asset.valueVnd / USD_VND_RATE) : formatMoney(asset.valueVnd)}</strong>
          <small className={asset.pnlPercent >= 0 ? 'positive' : 'negative'}>
            {formatPercent(asset.pnlPercent)} PnL tạm tính
          </small>
        </div>
        </div>

        <div className="asset-detail-content">
        <div className="asset-detail-main">
          <div className="asset-kpi-grid">
            <DetailMetric label="Số lượng nắm giữ" value={cleanQuantity(asset.quantity)} />
            <DetailMetric label="Tỷ trọng hiện tại" value={`${asset.allocationPercent.toFixed(1)}%`} />
            <DetailMetric label="Tỷ trọng mục tiêu" value={`${asset.targetPercent.toFixed(1)}%`} />
            <DetailMetric
              label="Độ lệch target"
              tone={drift > 0 ? 'warn' : drift < 0 ? 'good' : 'neutral'}
              value={formatPercent(drift)}
            />
          </div>

          <div className="allocation-detail-card">
            <div className="allocation-detail-top">
              <div>
                <h3>Phân bổ so với mục tiêu</h3>
                <p>So sánh tỷ trọng tài sản này trong toàn bộ danh mục.</p>
              </div>
              <strong className={Math.abs(drift) >= getDriftThreshold() ? 'negative' : 'positive'}>
                {Math.abs(drift) >= getDriftThreshold() ? 'Cần xem lại' : 'Đúng vùng'}
              </strong>
            </div>
            <div className="allocation-track">
              <span style={{ width: `${allocationWidth}%`, backgroundColor: color }} />
              <i style={{ left: `${targetLeft}%` }} />
            </div>
            <div className="allocation-scale">
              <span>0%</span>
              <span>Hiện tại {asset.allocationPercent.toFixed(1)}%</span>
              <span>Mục tiêu {asset.targetPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <aside className="asset-detail-side">
          <div className="holding-summary-card">
            <h3>Thông tin nắm giữ</h3>
            <dl>
              <div>
                <dt>Mã tài sản</dt>
                <dd>{asset.symbol}</dd>
              </div>
              <div>
                <dt>Nhóm</dt>
                <dd>{asset.group}</dd>
              </div>
              <div>
                <dt>Số giao dịch</dt>
                <dd>{transactions.length}</dd>
              </div>
            </dl>
          </div>

          <div className="holding-summary-card">
            <h3>Giao dịch gần nhất</h3>
            {latestTransaction ? (
              <div className="latest-transaction-card">
                <span className={latestTransaction.transactionType === 'sell' || latestTransaction.transactionType === 'withdraw' ? 'tx-icon out' : 'tx-icon in'}>
                  {latestTransaction.transactionType === 'sell' || latestTransaction.transactionType === 'withdraw' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                </span>
                <div>
                  <strong>{translateTxType(latestTransaction.transactionType)}</strong>
                  <small>{latestTransaction.date} · {latestTransaction.id}</small>
                </div>
                <strong>{asset.category === 'crypto' ? formatUSD(latestTransaction.amountVnd / USD_VND_RATE) : formatMoney(latestTransaction.amountVnd)}</strong>
              </div>
            ) : (
              <p>Chưa có giao dịch riêng cho tài sản này.</p>
            )}
          </div>
        </aside>
        </div>

        <div className="asset-detail-transactions">
        <div className="section-subhead">
          <h3>Lịch sử giao dịch của tài sản</h3>
          <span>{transactions.length} giao dịch</span>
        </div>
        {transactions.length ? (
          <TransactionList category={asset.category} rows={transactions} onDelete={onDeleteTransaction} onEdit={onEditTransaction} />
        ) : (
          <EmptyState note="Chưa có giao dịch riêng cho tài sản này." />
        )}
        </div>
      </section>
    </div>
  )
}

function DetailMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warn'
}) {
  return (
    <div className={`detail-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EmptyState({ note }: { note: string }) {
  return (
    <div className="empty-state">
      <CircleDollarSign size={22} />
      <strong>Chưa có dữ liệu</strong>
      <span>{note}</span>
    </div>
  )
}

function PanelTitle({
  icon,
  title,
  action,
  onAction,
}: {
  icon: ReactNode
  title: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="panel-title">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      {action && (
        <button disabled={!onAction && action === 'Xem chi tiết'} onClick={onAction} type="button">
          {action}
        </button>
      )}
    </div>
  )
}


function TransactionModal({
  onClose,
  holdings,
  transactions,
  onSave,
  defaultCategory,
  defaultSymbol,
  defaultType,
  showNotification,
  goldPrices,
  categoryTargets,
  stockPrices,
  cryptoPrices,
  bondPrices,
  transactionToEdit,
  onDeleteTransactionQuietly,
}: {
  onClose: () => void
  holdings: HoldingRecord[]
  transactions: TransactionRecord[]
  onSave: () => void
  defaultCategory?: AssetCategory
  defaultSymbol?: string
  defaultType?: string
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void
  goldPrices: Record<string, GoldPriceDetail> | null
  categoryTargets: Record<string, number>
  stockPrices: Record<string, number>
  cryptoPrices: Record<string, number>
  bondPrices: Record<string, number>
  transactionToEdit?: TransactionRecord | null
  onDeleteTransactionQuietly?: (id: string, currentTransactions?: TransactionRecord[], currentHoldings?: HoldingRecord[]) => Promise<void>
}) {
  const getCategoryTarget = (cat: string) => {
    const targetCat = cat === 'cash' ? 'savings' : cat
    return categoryTargets[targetCat] ?? (cat === 'cash' ? 15 : 20)
  }

  const POPULAR_GOLD_CODES: { symbol: string; name: string; unit: string }[] = [
    { symbol: 'VNHAN',  name: 'Vàng nhẫn', unit: 'chỉ' },
    { symbol: 'VMIENG', name: 'Vàng miếng SJC', unit: 'lượng' },
    { symbol: 'VKIENG', name: 'Vàng kiềng', unit: 'chỉ' },
  ]

  const defaultSymbolForCategory = (cat?: AssetCategory): string => {
    if (!cat) return ''
    switch (cat) {
      case 'cash': return 'CASH'
      case 'gold': return 'VNHAN'
      case 'crypto': return 'BTC'
      case 'stocks': return 'HPG'
      default: return ''
    }
  }

  const availableTypes = useMemo(() => {
    if (transactionToEdit) {
      return ['Nhập tài sản']
    }
    if (defaultType === 'Chỉnh sửa') {
      return ['Chỉnh sửa']
    }
    if (defaultCategory === 'cash') {
      return ['Nạp vào', 'Rút ra']
    } else if (defaultCategory === 'savings') {
      return ['Mở sổ', 'Tất toán', 'Nhập sổ']
    } else if (defaultCategory === 'gold') {
      return ['Mua vào', 'Bán ra', 'Nhập tài sản']
    } else if (defaultCategory) {
      return ['Mua vào', 'Bán ra', 'Nhập tài sản']
    } else {
      return ['Nạp vào', 'Rút ra', 'Mua vào', 'Bán ra', 'Nhập tài sản']
    }
  }, [defaultCategory, defaultType, transactionToEdit])

  const inferCategoryFromSymbol = (sym: string): AssetCategory => {
    const s = sym.toUpperCase()
    if (s === 'CASH') return 'cash'
    if (['VNHAN', 'VMIENG', 'VKIENG', 'GOLD', 'VANG', 'SJC'].includes(s)) return 'gold'
    if (s.endsWith('USDT') || ['BTC', 'ETH', 'BNB', 'SOL', 'USDT', 'ADA', 'XRP', 'DOGE', 'DOT', 'AVAX', 'LINK', 'LTC', 'UNI', 'SHIB', 'MATIC'].includes(s)) return 'crypto'
    if (s.startsWith('STK-')) return 'savings'
    return 'stocks'
  }

  const cleanNote = (n: string) => {
    if (!n) return ''
    return n
      .replace(/\[SL:\s*[^\]]+\]/gi, '')
      .replace(/\[Đơn giá:\s*[^\]]+\]/gi, '')
      .replace(/\[Giá vốn:\s*[^\]]+\]/gi, '')
      .replace(/\[Baseline Aligned\]/gi, '')
      .trim()
  }

  const initialCategory = transactionToEdit
    ? inferCategoryFromSymbol(transactionToEdit.assetSymbol)
    : (defaultCategory || 'gold')

  const [category, setCategory] = useState<AssetCategory>(initialCategory)

  const [type, setType] = useState<string>(() => {
    if (transactionToEdit) {
      return 'Nhập tài sản'
    }
    if (defaultType === 'Chỉnh sửa') return 'Chỉnh sửa'
    const rawType = defaultType || (defaultCategory === 'cash' ? 'Nạp vào' : 'Mua vào')
    if (defaultCategory === 'savings') {
      if (rawType === 'Mua vào') return 'Mở sổ'
      if (rawType === 'Bán ra') return 'Tất toán'
      if (rawType === 'Nhập tài sản') return 'Nhập sổ'
    }
    return rawType
  })

  const [symbol, setSymbol] = useState<string>(() => {
    if (transactionToEdit) return transactionToEdit.assetSymbol
    return defaultSymbol || defaultSymbolForCategory(defaultCategory)
  })

  const [amountVal, setAmountVal] = useState<string>('')
  
  const [qty, setQty] = useState<string>(() => {
    if (transactionToEdit && transactionToEdit.quantity) {
      return transactionToEdit.quantity.toString()
    }
    return ''
  })

  const [navPriceVal, setNavPriceVal] = useState<string>(() => {
    if (transactionToEdit) {
      const meta = getTransactionMeta(transactionToEdit)
      const storedUnitPriceVnd = transactionToEdit.unitPriceVnd ?? meta.unitPriceVnd ?? 0
      return isLikelyCryptoSymbol(transactionToEdit.assetSymbol)
        ? (storedUnitPriceVnd / USD_VND_RATE).toString()
        : storedUnitPriceVnd.toString()
    }
    return ''
  })

  const [showGoldList, setShowGoldList] = useState(false)
  const [goldSearch, setGoldSearch] = useState('')
  const [goldDropPos, setGoldDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const goldInputRef = useRef<HTMLInputElement>(null)
  
  const [date, setDate] = useState<string>(() => {
    if (transactionToEdit) return transactionToEdit.date
    return new Date().toISOString().split('T')[0]
  })

  const [note, setNote] = useState<string>(() => {
    if (transactionToEdit) return cleanNote(transactionToEdit.note)
    return ''
  })

  const [isAmountManuallyEdited, setIsAmountManuallyEdited] = useState(false)

  const [inputMode, setInputMode] = useState<'unit' | 'total'>('unit')
  const [totalAmountInput, setTotalAmountInput] = useState<string>('')

  // Reset inputMode and totalAmountInput when category or symbol changes
  useEffect(() => {
    setInputMode('unit')
    setTotalAmountInput('')
  }, [category, defaultSymbol, defaultCategory])


  // Savings-specific states
  const activeCat = defaultCategory || category
  const [savingsBank, setSavingsBank] = useState<string>('Vietcombank')
  const [savingsCustomBank, setSavingsCustomBank] = useState<string>('')
  const [savingsTerm, setSavingsTerm] = useState<string>('12 tháng')
  const [savingsRate, setSavingsRate] = useState<string>('5.5')
  const [savingsMaturityAction, setSavingsMaturityAction] = useState<string>('tat_toan_ve_vi')
  const [selectedSavingsSymbol, setSelectedSavingsSymbol] = useState<string>(
    (activeCat === 'savings' && defaultSymbol) ? defaultSymbol : ''
  )
  const [savingsPrincipalInput, setSavingsPrincipalInput] = useState<string>('')
  const [settleAmountInput, setSettleAmountInput] = useState<string>('')

  // Savings helper calculations
  const calculatedMaturityDate = useMemo(() => {
    if (savingsTerm === 'Không kỳ hạn') return 'Không kỳ hạn'
    const monthsMatch = savingsTerm.match(/(\d+)\s*tháng/)
    if (!monthsMatch) return '-'
    const months = parseInt(monthsMatch[1])
    const d = new Date(date)
    if (isNaN(d.getTime())) return '-'
    d.setMonth(d.getMonth() + months)
    return d.toISOString().split('T')[0]
  }, [date, savingsTerm])

  const calculatedExpectedInterest = useMemo(() => {
    if (savingsTerm === 'Không kỳ hạn') return 0
    const monthsMatch = savingsTerm.match(/(\d+)\s*tháng/)
    if (!monthsMatch) return 0
    const months = parseInt(monthsMatch[1])
    const principal = parseFloat(savingsPrincipalInput.replace(/\D/g, '')) || 0
    const rate = parseFloat(savingsRate) || 0
    return Math.round(principal * (rate / 100) * (months / 12))
  }, [savingsPrincipalInput, savingsRate, savingsTerm])

  const calculateLocalExpectedInterest = (principal: number, rate: number, termStr: string) => {
    if (termStr === 'Không kỳ hạn') return 0
    const monthsMatch = termStr.match(/(\d+)\s*tháng/)
    if (!monthsMatch) return 0
    const months = parseInt(monthsMatch[1])
    return Math.round(principal * (rate / 100) * (months / 12))
  }

  // Load existing savings book details if in edit mode
  useEffect(() => {
    if (activeCat === 'savings' && defaultType === 'Chỉnh sửa' && defaultSymbol) {
      const book = holdings.find(h => h.symbol === defaultSymbol)
      if (book) {
        try {
          const parsed = JSON.parse(book.quantity)
          const POPULAR_BANKS = ['Vietcombank', 'Techcombank', 'BIDV', 'Agribank', 'VietinBank', 'MB Bank', 'VPBank', 'ACB', 'Sacombank', 'TPBank']
          if (POPULAR_BANKS.includes(parsed.bank)) {
            setSavingsBank(parsed.bank)
          } else {
            setSavingsBank('Khác')
            setSavingsCustomBank(parsed.bank)
          }
          setSavingsPrincipalInput(new Intl.NumberFormat('vi-VN').format(parsed.principal))
          setSavingsTerm(parsed.term || '12 tháng')
          setSavingsRate(String(parsed.rate ?? '5.5'))
          setSavingsMaturityAction(parsed.maturityAction || 'goc_lai_tai_tuc')
          if (parsed.startDate) {
            setDate(parsed.startDate)
          }
        } catch (e) {
          console.error('Failed to parse savings metadata for edit:', e)
        }
      }
    }
  }, [defaultSymbol, defaultType, holdings, activeCat])

  // Sync selected savings book when symbol or type is Bán ra / Tất toán
  useEffect(() => {
    if (activeCat === 'savings' && (type === 'Bán ra' || type === 'Tất toán')) {
      const activeSymbol = selectedSavingsSymbol || defaultSymbol
      if (activeSymbol) {
        setSelectedSavingsSymbol(activeSymbol)
        const book = holdings.find(h => h.symbol === activeSymbol)
        if (book) {
          try {
            const parsed = JSON.parse(book.quantity)
            const expected = calculateLocalExpectedInterest(parsed.principal, parsed.rate, parsed.term)
            setSettleAmountInput(new Intl.NumberFormat('vi-VN').format(parsed.principal + expected))
          } catch(e) {}
        }
      }
    }
  }, [type, defaultSymbol, selectedSavingsSymbol, holdings, activeCat])

  const computedTotalValue = useMemo(() => {
    if (inputMode === 'total') {
      if (activeCat === 'crypto') {
        return parseFloat(totalAmountInput) || 0
      } else if (activeCat === 'bonds') {
        return cleanAndParseFloat(totalAmountInput) || 0
      } else {
        return parseFloat(totalAmountInput.replace(/\D/g, '')) || 0
      }
    } else {
      const q = cleanAndParseFloat(qty)
      let p = 0
      if (activeCat === 'crypto') {
        p = parseFloat(navPriceVal) || 0
      } else if (activeCat === 'bonds') {
        p = parseFloat(navPriceVal.replace(/\D/g, '')) || 0
      } else {
        p = parseFloat(navPriceVal.replace(/\D/g, '')) || 0
      }
      return q * p
    }
  }, [qty, navPriceVal, totalAmountInput, inputMode, activeCat])

  const computedUnitPrice = useMemo(() => {
    if (inputMode === 'total') {
      const q = cleanAndParseFloat(qty)
      if (q <= 0) return 0
      return computedTotalValue / q
    } else {
      if (activeCat === 'crypto') {
        return parseFloat(navPriceVal) || 0
      } else if (activeCat === 'bonds') {
        return parseFloat(navPriceVal.replace(/\D/g, '')) || 0
      } else {
        return parseFloat(navPriceVal.replace(/\D/g, '')) || 0
      }
    }
  }, [qty, navPriceVal, computedTotalValue, inputMode, activeCat])

  // Automatically fetch live price when symbol changes
  useEffect(() => {
    if (transactionToEdit) return
    const activeCat = defaultCategory || category
    if (activeCat !== 'stocks' && activeCat !== 'crypto' && activeCat !== 'bonds') return
    const sym = symbol.trim().toUpperCase()
    if (sym.length < 3) return

    let cancelled = false
    if (activeCat === 'stocks') {
      fetchVNTicker(sym)
        .then((tk) => {
          if (cancelled) return
          const priceVnd = tk.price * 1000
          if (!isAmountManuallyEdited) {
            setNavPriceVal(new Intl.NumberFormat('vi-VN').format(priceVnd))
          }
        })
        .catch((err) => {
          console.error(`Failed to fetch stock price for ${sym}:`, err)
        })
    } else if (activeCat === 'crypto') {
      fetchCryptoTicker(sym)
        .then((tk) => {
          if (cancelled) return
          if (!isAmountManuallyEdited) {
            setNavPriceVal(String(tk.price))
          }
        })
        .catch((err) => {
          console.error(`Failed to fetch crypto price for ${sym}:`, err)
        })
    } else if (activeCat === 'bonds') {
      fetchBondTicker(sym)
        .then((tk) => {
          if (cancelled) return
          if (!isAmountManuallyEdited) {
            setNavPriceVal(new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(tk.price))
          }
        })
        .catch((err) => {
          console.error(`Failed to fetch bond price for ${sym}:`, err)
        })
    }

    return () => {
      cancelled = true
    }
  }, [symbol, category, defaultCategory, isAmountManuallyEdited])

  // Sync computed total value or unit price with amountVal for all assets
  useEffect(() => {
    const activeCat = defaultCategory || category
    if (activeCat === 'cash') return

    if (type === 'Nhập tài sản') {
      if (inputMode === 'total') {
        if (activeCat === 'crypto') {
          setAmountVal(String(computedUnitPrice))
        } else if (activeCat === 'bonds') {
          setAmountVal(String(computedUnitPrice))
        } else {
          setAmountVal(new Intl.NumberFormat('vi-VN').format(Math.round(computedUnitPrice)))
        }
      } else {
        setAmountVal(navPriceVal)
      }
    } else {
      const total = computedTotalValue
      if (activeCat === 'crypto') {
        setAmountVal(total > 0 ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(total) : '')
      } else {
        setAmountVal(total > 0 ? new Intl.NumberFormat('vi-VN').format(Math.round(total)) : '')
      }
    }
  }, [qty, navPriceVal, computedTotalValue, computedUnitPrice, inputMode, type, category, defaultCategory])

  const placeholders = useMemo(() => {
    const activeCat = defaultCategory || category
    switch (activeCat) {
      case 'gold':
        return { symbol: 'VD: SJ9999, PNJ...', qty: 'VD: 1' }
      case 'crypto':
        return { symbol: 'VD: BTC, ETH...', qty: 'VD: 0.1' }
      case 'cash':
      default:
        return { symbol: 'CASH', qty: 'VD: 1' }
    }
  }, [defaultCategory, category])

  const resolvedUnit = useMemo(() => {
    const sym = symbol.trim().toUpperCase()
    const activeCat = defaultCategory || category
    if (sym === 'CASH') return ''
    const goldEntry = POPULAR_GOLD_CODES.find(g => g.symbol === sym)
    if (goldEntry) return goldEntry.unit
    if (activeCat === 'gold') return 'chỉ'
    if (activeCat === 'crypto') return sym || 'coin'
    if (activeCat === 'stocks') return 'CP'
    if (activeCat === 'bonds') return 'CCQ'
    return 'đơn vị'
  }, [symbol, category, defaultCategory])

  const resolvedAssetName = useMemo(() => {
    const sym = symbol.trim().toUpperCase()
    if (!sym) return ''
    if (sym === 'CASH') return 'Ví VND'
    const goldEntry = POPULAR_GOLD_CODES.find(g => g.symbol === sym)
    if (goldEntry) return goldEntry.name
    if (goldPrices && goldPrices[sym]) return goldPrices[sym].name
    const existing = holdings.find(h => h.symbol.toUpperCase() === sym)
    return existing ? existing.name : ''
  }, [symbol, goldPrices, holdings])

  const resolvedAssetColor = useMemo(() => {
    const sym = symbol.trim().toUpperCase()
    const activeCat = defaultCategory || category
    if (activeCat === 'gold' || sym === 'SJ9999' || sym === 'SJL1L10' || sym === 'PQHN24NTT' || sym === 'BT9999NTT') return 'var(--color-gold)'
    if (activeCat === 'crypto' || sym === 'BTC' || sym === 'ETH') return '#6a7cff'
    if (activeCat === 'cash' || sym === 'CASH') return 'var(--color-primary)'
    return 'var(--color-text-secondary)'
  }, [symbol, defaultCategory, category])

  useEffect(() => {
    if (defaultCategory || transactionToEdit) return
    const sym = symbol.trim().toUpperCase()
    if (sym === 'VNHAN' || sym === 'VKIENG' || sym === 'SJ9999' || sym === 'SJL1L10' || sym === 'PQHN24NTT' || sym === 'BT9999NTT' || sym === 'VMIENG') {
      setCategory('gold')
      const defaultQty = '1'
      if (!qty || ['0.1 BTC', '1 ETH', '1 chỉ', '1 lượng', '1', '10', '0.1'].includes(qty)) {
        setQty(defaultQty)
      }
    } else if (sym === 'BTC' || sym === 'ETH') {
      setCategory('crypto')
      if (!qty || ['1 lượng', '1 chỉ', '1', '10', '1 ETH', '0.1'].includes(qty)) setQty('0.1')
    } else if (sym === 'CASH') {
      setCategory('cash')
    } else if (sym.startsWith('E1') || sym.startsWith('FUE')) {
      setCategory('stocks')
    } else if (sym.length === 3) {
      setCategory('stocks')
    }
  }, [symbol, defaultCategory])

  // (duplicate goldPrices fetch removed)

  // Automatically fetch gold price and set navPriceVal when symbol or type changes
  useEffect(() => {
    if (transactionToEdit) return
    if (!goldPrices) return
    const activeCat = defaultCategory || category
    if (activeCat !== 'gold') return

    const sym = symbol.trim().toUpperCase()
    let apiSym = sym
    let isChi = false

    if (sym === 'VNHAN') {
      apiSym = 'SJ9999'
      isChi = true
    } else if (sym === 'VMIENG') {
      apiSym = 'SJL1L10'
    } else if (sym === 'VKIENG') {
      apiSym = 'VKIENG'
      isChi = true
    }

    const priceDetail = goldPrices[apiSym]
    if (priceDetail && !isAmountManuallyEdited) {
      const isBuy = type === 'Mua vào' || type === 'Mua tài sản' || type === 'Nạp vào' || type === 'Nạp tiền' || type === 'Nhập tài sản'
      let pricePerUnit = isBuy ? priceDetail.sell : priceDetail.buy

      if (isChi) {
        pricePerUnit = pricePerUnit / 10
      }

      setNavPriceVal(new Intl.NumberFormat('vi-VN').format(pricePerUnit))
    }
  }, [type, symbol, goldPrices, category, defaultCategory, isAmountManuallyEdited, transactionToEdit])

  const handleSave = async () => {
    const activeCat = defaultCategory || category

    if (activeCat === 'savings') {
      const isSettle = type === 'Bán ra' || type === 'Tất toán'
      if (isSettle) {
        if (!selectedSavingsSymbol) {
          showNotification('Vui lòng chọn sổ tiết kiệm cần tất toán.', 'error')
          return
        }
        const book = holdings.find(h => h.symbol === selectedSavingsSymbol)
        if (!book) {
          showNotification('Sổ tiết kiệm không hợp lệ.', 'error')
          return
        }
        let bank = ''
        let principal = 0
        let term = ''
        let rate = 0
        let startDate = ''
        let maturityDate = ''
        try {
          const parsed = JSON.parse(book.quantity)
          bank = parsed.bank
          principal = parsed.principal
          term = parsed.term
          rate = parsed.rate
          startDate = parsed.startDate
          maturityDate = parsed.maturityDate
        } catch (e) {}

        const settleAmount = parseFloat(settleAmountInput.replace(/\D/g, '')) || principal
        
        const metadata = {
          type: 'savings',
          bank,
          principal,
          term,
          rate,
          startDate,
          maturityDate,
          settleDate: date,
          settleAmount,
          status: 'settled'
        }
        const jsonNote = JSON.stringify(metadata)

        // Create transaction
        const txRecord = await createTransaction({
          date,
          occurredAt: new Date().toISOString(),
          transactionType: 'sell',
          assetSymbol: book.symbol,
          amountVnd: settleAmount,
          note: jsonNote,
          quantity: 1,
          unit: 'sổ',
          unitPriceVnd: settleAmount,
          capitalAmountVnd: principal,
          feeVnd: 0,
          walletImpactVnd: settleAmount,
          linkedAssetSymbol: book.symbol,
          fundingSource: 'wallet',
        })

        // Update holding to 0 value, status settled
        const pnl = principal > 0 ? ((settleAmount - principal) / principal) * 100 : 0
        await upsertHolding({
          symbol: book.symbol,
          name: book.name,
          category: 'savings',
          group: 'Đã tất toán',
          valueVnd: 0,
          quantity: jsonNote, // contains settled status
          allocationPercent: 0,
          targetPercent: getCategoryTarget('savings'),
          pnlPercent: pnl
        })

        // Add to CASH
        const cashHolding = holdings.find(h => h.symbol.toUpperCase() === 'CASH')
        const cashBalance = cashHolding ? cashHolding.valueVnd : 0
        const newCashValue = cashBalance + settleAmount
        await upsertHolding({
          symbol: 'CASH',
          name: cashHolding?.name || 'Ví VND',
          category: 'cash',
          group: 'Ví thanh toán',
          valueVnd: newCashValue,
          quantity: cashHolding?.quantity || `${newCashValue / 1000000} triệu VND`,
          allocationPercent: 0,
          targetPercent: getCategoryTarget('cash'),
          pnlPercent: 0
        })

        await capturePortfolioSnapshot(txRecord.id)
        showNotification('Tất toán sổ tiết kiệm thành công!', 'success')
      } else if (defaultType === 'Chỉnh sửa') {
        // Chỉnh sửa sổ tiết kiệm
        const bankName = savingsBank === 'Khác' ? savingsCustomBank : savingsBank
        if (!bankName) {
          showNotification('Vui lòng nhập tên ngân hàng.', 'error')
          return
        }
        const principal = parseFloat(savingsPrincipalInput.replace(/\D/g, '')) || 0
        if (principal <= 0) {
          showNotification('Vui lòng nhập số tiền gửi hợp lệ.', 'error')
          return
        }

        const rate = parseFloat(savingsRate) || 0
        const termVal = savingsTerm

        if (!defaultSymbol) {
          showNotification('Mã sổ tiết kiệm không hợp lệ.', 'error')
          return
        }
        
        const existingHolding = holdings.find(h => h.symbol === defaultSymbol)
        if (!existingHolding) {
          showNotification('Sổ tiết kiệm không tồn tại.', 'error')
          return
        }

        let status = 'active'
        try {
          const parsed = JSON.parse(existingHolding.quantity)
          status = parsed.status || 'active'
        } catch (e) {}

        const originalTx = transactions.find(t => t.assetSymbol === defaultSymbol && (t.transactionType === 'buy' || t.transactionType === 'import-existing'))
        const txType = originalTx ? originalTx.transactionType : 'buy'

        if (txType === 'buy') {
          const oldPrincipal = originalTx ? originalTx.amountVnd : existingHolding.valueVnd
          const diff = principal - oldPrincipal
          if (diff !== 0) {
            const cashHolding = holdings.find(h => h.symbol.toUpperCase() === 'CASH')
            const cashBalance = cashHolding ? cashHolding.valueVnd : 0
            if (diff > 0 && cashBalance < diff) {
              showNotification(`Không đủ số dư ví CASH. Cần thêm: ${formatMoney(diff - cashBalance)}`, 'error')
              return
            }
            const newCashValue = Math.max(0, cashBalance - diff)
            await upsertHolding({
              symbol: 'CASH',
              name: cashHolding?.name || 'Ví VND',
              category: 'cash',
              group: 'Ví thanh toán',
              valueVnd: newCashValue,
              quantity: cashHolding?.quantity || `${newCashValue / 1000000} triệu VND`,
              allocationPercent: 0,
              targetPercent: getCategoryTarget('cash'),
              pnlPercent: 0
            })
          }
        }

        const metadata = {
          type: 'savings',
          bank: bankName,
          principal,
          term: termVal,
          rate,
          startDate: date,
          maturityDate: calculatedMaturityDate,
          maturityAction: savingsMaturityAction,
          status: status
        }
        const jsonNote = JSON.stringify(metadata)

        // Delete original transaction if exists
        if (originalTx) {
          await deleteTransaction(originalTx.id)
        }

        // Create new transaction with edited amount and metadata
        const txRecord = await createTransaction({
          date,
          occurredAt: new Date().toISOString(),
          transactionType: txType,
          assetSymbol: defaultSymbol,
          amountVnd: principal,
          note: jsonNote,
          quantity: 1,
          unit: 'sổ',
          unitPriceVnd: principal,
          capitalAmountVnd: principal,
          feeVnd: 0,
          walletImpactVnd: txType === 'buy' ? -principal : 0,
          linkedAssetSymbol: defaultSymbol,
          fundingSource: txType === 'import-existing' ? 'opening-balance' : 'wallet',
        })

        // Upsert holding with updated values
        await upsertHolding({
          symbol: defaultSymbol,
          name: `Tiết kiệm ${bankName}`,
          category: 'savings',
          group: status === 'active' ? 'Đang gửi' : 'Đã tất toán',
          valueVnd: status === 'active' ? principal : 0,
          quantity: jsonNote,
          allocationPercent: existingHolding.allocationPercent || 0,
          targetPercent: getCategoryTarget('savings'),
          pnlPercent: existingHolding.pnlPercent || 0
        })

        await capturePortfolioSnapshot(txRecord.id)
        showNotification('Cập nhật sổ tiết kiệm thành công!', 'success')
      } else {
        // Mua vào / Nhập tài sản
        const bankName = savingsBank === 'Khác' ? savingsCustomBank : savingsBank
        if (!bankName) {
          showNotification('Vui lòng nhập tên ngân hàng.', 'error')
          return
        }
        const principal = parseFloat(savingsPrincipalInput.replace(/\D/g, '')) || 0
        if (principal <= 0) {
          showNotification('Vui lòng nhập số tiền gửi hợp lệ.', 'error')
          return
        }

        const rate = parseFloat(savingsRate) || 0
        const termVal = savingsTerm
        
        // check cash balance if it's 'Mua vào'
        const txType = parseTxType(type)
        if (txType === 'buy') {
          const cashHolding = holdings.find(h => h.symbol.toUpperCase() === 'CASH')
          const cashBalance = cashHolding ? cashHolding.valueVnd : 0
          if (cashBalance < principal) {
            showNotification(`Không đủ số dư ví CASH. Khả dụng: ${formatMoney(cashBalance)}`, 'error')
            return
          }
        }

        const bankCode = bankName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'BANK'
        const generatedSymbol = `STK-${bankCode}-${Date.now()}`

        const metadata = {
          type: 'savings',
          bank: bankName,
          principal,
          term: termVal,
          rate,
          startDate: date,
          maturityDate: calculatedMaturityDate,
          maturityAction: savingsMaturityAction,
          status: 'active'
        }
        const jsonNote = JSON.stringify(metadata)

        // Create transaction
        const txRecord = await createTransaction({
          date,
          occurredAt: new Date().toISOString(),
          transactionType: txType,
          assetSymbol: generatedSymbol,
          amountVnd: principal,
          note: jsonNote,
          quantity: 1,
          unit: 'sổ',
          unitPriceVnd: principal,
          capitalAmountVnd: principal,
          feeVnd: 0,
          walletImpactVnd: txType === 'buy' ? -principal : 0,
          linkedAssetSymbol: generatedSymbol,
          fundingSource: txType === 'import-existing' ? 'opening-balance' : 'wallet',
        })

        // Upsert holding
        await upsertHolding({
          symbol: generatedSymbol,
          name: `Tiết kiệm ${bankName}`,
          category: 'savings',
          group: 'Đang gửi',
          valueVnd: principal,
          quantity: jsonNote,
          allocationPercent: 0,
          targetPercent: getCategoryTarget('savings'),
          pnlPercent: 0
        })

        // Subtract from CASH if buy
        if (txType === 'buy') {
          const cashHolding = holdings.find(h => h.symbol.toUpperCase() === 'CASH')
          const cashBalance = cashHolding ? cashHolding.valueVnd : 0
          const newCashValue = Math.max(0, cashBalance - principal)
          await upsertHolding({
            symbol: 'CASH',
            name: cashHolding?.name || 'Ví VND',
            category: 'cash',
            group: 'Ví thanh toán',
            valueVnd: newCashValue,
            quantity: cashHolding?.quantity || `${newCashValue / 1000000} triệu VND`,
            allocationPercent: 0,
            targetPercent: getCategoryTarget('cash'),
            pnlPercent: 0
          })
        }

        await capturePortfolioSnapshot(txRecord.id)
        showNotification('Thêm sổ tiết kiệm thành công!', 'success')
      }
      onSave()
      onClose()
      return
    }

    const finalSymbol = activeCat === 'cash' ? 'CASH' : symbol

    if (!finalSymbol || !amountVal) {
      showNotification('Vui lòng điền mã tài sản và số tiền.', 'error')
      return
    }
    try {
      if (transactionToEdit && onDeleteTransactionQuietly) {
        await onDeleteTransactionQuietly(transactionToEdit.id, transactions, holdings)
      }
      const txType = parseTxType(type)
      let amount = 0
      let currentUnitPrice = 0

      if (inputMode === 'total') {
        amount = computedTotalValue
        currentUnitPrice = computedUnitPrice
      } else {
        if (activeCat === 'crypto') {
          amount = parseFloat(amountVal.replace(/,/g, '')) || 0
          currentUnitPrice = parseFloat(navPriceVal) || amount
        } else if (activeCat === 'bonds') {
          amount = parseFloat(amountVal.replace(/\D/g, '')) || 0
          currentUnitPrice = parseFloat(navPriceVal.replace(/\D/g, '')) || amount
        } else {
          amount = parseFloat(amountVal.replace(/\D/g, '')) || 0
          currentUnitPrice = parseFloat(navPriceVal.replace(/\D/g, '')) || amount
        }
      }

      const parsedQty = parseQtyString(qty)
      let transactionUnitPrice = currentUnitPrice
      let autoNormalizedGoldPrice = false

      if (activeCat === 'gold' && finalSymbol.toUpperCase() !== 'CASH') {
        const normalizedGoldPrice = normalizeGoldInputUnitPrice(
          finalSymbol.toUpperCase(),
          Math.round(currentUnitPrice),
          goldPrices,
        )
        transactionUnitPrice = normalizedGoldPrice.unitPriceVnd
        autoNormalizedGoldPrice = normalizedGoldPrice.adjusted
      }

      if (finalSymbol.toUpperCase() !== 'CASH') {
        amount = transactionUnitPrice * parsedQty
      } else if (txType === 'import-existing') {
        amount = currentUnitPrice
      }

      const amountVnd = Math.round(activeCat === 'crypto' ? amount * USD_VND_RATE : amount)

      const cashHolding = holdings.find(h => h.symbol.toUpperCase() === 'CASH')
      const cashBalance = cashHolding ? cashHolding.valueVnd : 0

      if ((txType === 'buy' || txType === 'withdraw') && cashBalance < amountVnd) {
        showNotification(`Không đủ số dư. Khả dụng: ${formatMoney(cashBalance)}`, 'error')
        return
      }

      const costAmount = amount
      const currentValue = amount

      let costAmountVnd = Math.round(activeCat === 'crypto' ? costAmount * USD_VND_RATE : costAmount)
      let currentValueVnd = Math.round(activeCat === 'crypto' ? currentValue * USD_VND_RATE : currentValue)

      // Đối với nhập tài sản cũ, tự động lấy giá thị trường hiện tại làm giá vốn khởi điểm để không tính lợi nhuận ảo lúc nhập
      if (txType === 'import-existing' && !transactionToEdit) {
        let livePriceVnd: number | null = null
        if (activeCat === 'gold') {
          const goldConfig = getGoldQuoteConfig(finalSymbol)
          const goldUnitPrice = goldConfig ? getGoldUnitPrice(finalSymbol, goldPrices, 'sell') : null
          if (goldUnitPrice) livePriceVnd = goldUnitPrice
        } else if (activeCat === 'stocks') {
          const stockPrice = stockPrices[finalSymbol.toUpperCase()]
          if (stockPrice) livePriceVnd = stockPrice
        } else if (activeCat === 'crypto') {
          const cryptoPrice = cryptoPrices[finalSymbol.toUpperCase()]
          if (cryptoPrice) livePriceVnd = cryptoPrice * USD_VND_RATE
        } else if (activeCat === 'bonds') {
          const bondPrice = bondPrices[finalSymbol.toUpperCase()]
          if (bondPrice) livePriceVnd = bondPrice
        }

        if (livePriceVnd !== null && parsedQty > 0) {
          const liveTotalVnd = Math.round(livePriceVnd * parsedQty)
          // Chỉ override giá trị hiện tại (currentValueVnd) theo giá thị trường
          // Giữ nguyên costAmountVnd = giá vốn người dùng nhập
          currentValueVnd = liveTotalVnd
        }
      }

      const unitLabel = resolvedUnit || 'đơn vị'
      transactionUnitPrice = parsedQty > 0 ? (currentValue / parsedQty) : currentValue
      
      let quantityMeta = ''
      if (finalSymbol.toUpperCase() !== 'CASH') {
        if (activeCat === 'crypto') {
          const formattedPrice = formatUSD(transactionUnitPrice)
          quantityMeta = `[SL: ${qty.trim()} ${unitLabel}] [Đơn giá: ${formattedPrice}]`
        } else {
          quantityMeta = `[SL: ${formatQuantity(parsedQty)} ${unitLabel}] [Đơn giá: ${new Intl.NumberFormat('vi-VN').format(Math.round(transactionUnitPrice))}]`
        }
      }

      let finalNote = note
      if (txType === 'import-existing') {
        const formattedCost = activeCat === 'crypto' ? formatUSD(costAmount) : new Intl.NumberFormat('vi-VN').format(costAmount)
        finalNote = note ? `${note} [Giá vốn: ${formattedCost}]` : `Nhập tài sản [Giá vốn: ${formattedCost}]`
      } else {
        finalNote = note || `Giao dịch ${type}`
      }

      if (txType === 'import-existing') {
        const formattedCost = activeCat === 'crypto' ? formatUSD(costAmount) : new Intl.NumberFormat('vi-VN').format(costAmount)
        const costMeta = `[Giá vốn: ${formattedCost}]`
        finalNote = note
          ? `${note} ${quantityMeta} ${costMeta} [Baseline Aligned]`
          : `Nhập tài sản ${quantityMeta} ${costMeta} [Baseline Aligned]`
      } else if (quantityMeta) {
        finalNote = note ? `${note} ${quantityMeta}` : `Giao dịch ${type} ${quantityMeta}`
      }

      const walletImpactVnd =
        txType === 'deposit' || txType === 'sell'
          ? amountVnd
          : txType === 'withdraw' || txType === 'buy'
            ? -amountVnd
            : 0
      const fundingSource = txType === 'import-existing' ? 'opening-balance' : 'wallet'
      const storedUnitPriceVnd = finalSymbol.toUpperCase() === 'CASH'
        ? undefined
        : Math.round(activeCat === 'crypto' ? transactionUnitPrice * USD_VND_RATE : transactionUnitPrice)

      const txRecord = await createTransaction({
        date,
        occurredAt: new Date().toISOString(),
        transactionType: txType,
        assetSymbol: finalSymbol.toUpperCase(),
        amountVnd: currentValueVnd,
        note: finalNote,
        quantity: finalSymbol.toUpperCase() === 'CASH' ? undefined : parsedQty,
        unit: finalSymbol.toUpperCase() === 'CASH' ? undefined : unitLabel,
        unitPriceVnd: storedUnitPriceVnd,
        capitalAmountVnd: txType === 'import-existing' ? costAmountVnd : currentValueVnd,
        feeVnd: 0,
        walletImpactVnd,
        linkedAssetSymbol: finalSymbol.toUpperCase() === 'CASH' ? undefined : finalSymbol.toUpperCase(),
        fundingSource,
      })

      const existingHolding = holdings.find(h => h.symbol.toUpperCase() === finalSymbol.toUpperCase())
      if (finalSymbol.toUpperCase() !== 'CASH') {
        const nextHoldingState = buildAppliedHoldingState(existingHolding, {
          txType,
          amountVnd: currentValueVnd,
          quantity: parsedQty,
          resolvedUnit,
          costAmountVnd,
        })

        if (nextHoldingState.newValue <= 0 || nextHoldingState.newQty <= 0) {
          await deleteHolding(finalSymbol.toUpperCase())
        } else {
          await upsertHolding({
            symbol: finalSymbol.toUpperCase(),
            name: existingHolding?.name || resolvedAssetName || finalSymbol.toUpperCase(),
            category: existingHolding?.category || activeCat,
            group: activeCat === 'cash' ? 'Ví thanh toán' : 'Tài sản',
            valueVnd: nextHoldingState.newValue,
            quantity: nextHoldingState.quantityLabel,
            allocationPercent: 0,
            targetPercent: getCategoryTarget(existingHolding?.category || activeCat),
            pnlPercent: nextHoldingState.newPnl
          })
        }
      }

      const newCashValue = Math.max(0, cashBalance + walletImpactVnd)

      if (txType !== 'import-existing') {
        await upsertHolding({
          symbol: 'CASH',
          name: cashHolding?.name || 'Ví VND',
          category: 'cash',
          group: 'Ví thanh toán',
          valueVnd: newCashValue,
          quantity: cashHolding?.quantity || `${newCashValue / 1000000} triệu VND`,
          allocationPercent: 0,
          targetPercent: getCategoryTarget('cash'),
          pnlPercent: 0
        })
      }
      await capturePortfolioSnapshot(txRecord.id)
        onSave()
      onClose()
      if (autoNormalizedGoldPrice) {
        showNotification('App đã tự quy đổi giá vàng từ lượng sang chỉ để tránh nhân sai thành tiền.', 'info')
      }
      showNotification(transactionToEdit ? 'Cập nhật giao dịch thành công!' : 'Tạo giao dịch thành công!', 'success')
    } catch (err) {
      console.error(err)
      showNotification('Lỗi khi lưu giao dịch.', 'error')
    }
  }

  const modalThemeClass = (
    defaultType === 'Chỉnh sửa'
  ) ? 'theme-neutral' : (
    type === 'Mua vào' || type === 'Nạp vào'
  ) ? 'theme-buy' : (
    type === 'Bán ra' || type === 'Rút ra'
  ) ? 'theme-sell' : 'theme-neutral'

  const hasCategory = holdings.findIndex(h => h.symbol.toUpperCase() === symbol.toUpperCase()) === -1 && !defaultCategory

  const dynamicTitle = () => {
    if (transactionToEdit) {
      return `Chỉnh sửa Nhập ${symbol}`
    }
    if (defaultType === 'Chỉnh sửa') {
      return 'Chỉnh sửa Sổ tiết kiệm'
    }
    switch (activeCat) {
      case 'stocks': return 'Giao dịch Cổ phiếu & Quỹ'
      case 'gold': return 'Giao dịch Vàng'
      case 'crypto': return 'Giao dịch Crypto'
      case 'cash': return 'Giao dịch Ví VND'
      case 'bonds': return 'Giao dịch Trái phiếu'
      case 'savings': return 'Giao dịch Tiết kiệm'
      default: return 'Giao dịch Tài sản'
    }
  }

  const confirmBtnText = () => {
    if (defaultType === 'Chỉnh sửa') {
      return 'Lưu thay đổi'
    }
    const txType = parseTxType(type)
    const sym = activeCat === 'cash' ? '' : symbol.trim().toUpperCase()

    if (activeCat === 'cash') {
      return txType === 'deposit' ? 'Nạp vào Ví' : 'Rút khỏi Ví'
    }

    if (activeCat === 'savings') {
      if (txType === 'buy') return 'Mở sổ'
      if (txType === 'sell') return 'Tất toán'
      if (txType === 'import-existing') return 'Nhập sổ'
    }

    const displaySym = sym || 'tài sản'
    if (txType === 'buy') return `Mua ${displaySym}`
    if (txType === 'sell') return `Bán ${displaySym}`
    if (txType === 'import-existing') return `Nhập ${displaySym}`
    return 'Xác nhận'
  }

  const handleModalKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    const target = event.target as HTMLElement
    if (target.tagName === 'BUTTON') {
      return
    }

    event.preventDefault()
    handleSave()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label="Nhập giao dịch"
        aria-modal="true"
        className={`modal ${modalThemeClass}`}
        onKeyDown={handleModalKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        {/* Accent Bar at the top */}
        <div className="modal-accent-bar" />
        
        {/* Modal Header */}
        <div className="modal-header-banner">
          <div className="modal-header-top">
            <h3 className="modal-header-title">{dynamicTitle()}</h3>
            <button className="modal-close-btn" onClick={onClose} type="button" title="Đóng">
              <X size={16} />
            </button>
          </div>
          
          <div className="tx-type-selector-wrapper">
            <div className="tx-type-segmented">
              {availableTypes.map((t) => {
                return (
                  <button
                    key={t}
                    type="button"
                    className={`tx-type-btn ${type === t ? 'active' : ''}`}
                    onClick={() => { setType(t); setIsAmountManuallyEdited(false) }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body-content">
          {activeCat === 'cash' ? (
            <div className="premium-form-fields">
              <div className="premium-input-group">
                <span className="premium-input-label">Số tiền</span>
                <div className="premium-input-wrapper">
                  <input
                    autoFocus
                    value={amountVal}
                    onChange={(e) => {
                      const rawVal = e.target.value.replace(/\D/g, '')
                      setAmountVal(rawVal ? new Intl.NumberFormat('vi-VN').format(parseInt(rawVal, 10)) : '')
                      setIsAmountManuallyEdited(true)
                    }}
                    inputMode="numeric"
                    placeholder="0"
                  />
                  <span className="premium-input-suffix">VND</span>
                </div>
              </div>

              <div className="premium-input-group">
                <span className="premium-input-label">Ngày phát sinh</span>
                <div className="premium-input-wrapper">
                  <DateInput value={date} onChange={setDate} />
                </div>
              </div>

              <div className="premium-input-group">
                <span className="premium-input-label">Ghi chú</span>
                <div className="premium-input-wrapper">
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhập ghi chú giao dịch..." />
                </div>
              </div>
            </div>
          ) : activeCat === 'savings' ? (
            <div className="premium-form-fields">
              {type === 'Bán ra' || type === 'Tất toán' ? (
                <>
                  <div className="premium-input-group">
                    <span className="premium-input-label">Chọn sổ tiết kiệm cần tất toán</span>
                    <div className="premium-input-wrapper">
                      <select
                        value={selectedSavingsSymbol}
                        onChange={(e) => {
                          const symVal = e.target.value
                          setSelectedSavingsSymbol(symVal)
                          const book = holdings.find(h => h.symbol === symVal)
                          if (book) {
                            try {
                              const parsed = JSON.parse(book.quantity)
                              const expected = calculateLocalExpectedInterest(parsed.principal, parsed.rate, parsed.term)
                              setSettleAmountInput(new Intl.NumberFormat('vi-VN').format(parsed.principal + expected))
                            } catch(err) {}
                          } else {
                            setSettleAmountInput('')
                          }
                        }}
                      >
                        <option value="">-- Chọn sổ tiết kiệm --</option>
                        {holdings.filter(h => h.category === 'savings' && h.valueVnd > 0).map(h => {
                          let bank = h.name
                          let term = ''
                          try {
                            if (h.quantity.startsWith('{')) {
                              const parsed = JSON.parse(h.quantity)
                              bank = parsed.bank
                              term = parsed.term
                            }
                          } catch (e) {}
                          return (
                            <option key={h.symbol} value={h.symbol}>
                              {bank} - {formatMoney(h.valueVnd)} ({term || 'Không hạn'})
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  </div>

                  {selectedSavingsSymbol ? (() => {
                    const book = holdings.find(h => h.symbol === selectedSavingsSymbol)
                    if (!book) return null
                    let bank = ''
                    let principal = 0
                    let term = ''
                    let rate = 0
                    let startDate = ''
                    let maturityDate = ''
                    try {
                      const parsed = JSON.parse(book.quantity)
                      bank = parsed.bank
                      principal = parsed.principal
                      term = parsed.term
                      rate = parsed.rate
                      startDate = parsed.startDate
                      maturityDate = parsed.maturityDate
                    } catch(e) {}

                    const expectedInterest = calculateLocalExpectedInterest(principal, rate, term)

                    return (
                      <>
                        <div className="premium-summary-card savings-info-summary" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                            <div>
                              <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Ngân hàng gửi</span>
                              <strong style={{ color: 'var(--color-text)' }}>{bank}</strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Tiền gửi gốc</span>
                              <strong style={{ color: 'var(--color-text)' }}>{formatMoney(principal)}</strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Kỳ hạn & Lãi suất</span>
                              <strong style={{ color: 'var(--color-text)' }}>{term} · {rate}%/năm</strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Lãi dự kiến nhận</span>
                              <strong className="positive">{formatMoney(expectedInterest)}</strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Ngày gửi</span>
                              <strong style={{ color: 'var(--color-text)' }}>{formatDate(startDate)}</strong>
                            </div>
                            <div>
                              <span style={{ color: 'var(--color-text-secondary)', display: 'block', marginBottom: '2px' }}>Ngày đáo hạn</span>
                              <strong style={{ color: 'var(--color-text)' }}>{formatDate(maturityDate)}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="premium-input-row">
                          <div className="premium-input-group col-half">
                            <span className="premium-input-label">Số tiền tất toán nhận thực tế</span>
                            <div className="premium-input-wrapper">
                              <input
                                value={settleAmountInput}
                                onChange={(e) => {
                                  const rawVal = e.target.value.replace(/\D/g, '')
                                  setSettleAmountInput(rawVal ? new Intl.NumberFormat('vi-VN').format(parseInt(rawVal, 10)) : '')
                                }}
                                inputMode="numeric"
                                placeholder="0"
                              />
                              <span className="premium-input-suffix">VND</span>
                            </div>
                          </div>

                          <div className="premium-input-group col-half">
                            <span className="premium-input-label">Ngày tất toán</span>
                            <div className="premium-input-wrapper">
                              <DateInput value={date} onChange={setDate} />
                            </div>
                          </div>
                        </div>
                      </>
                    )
                  })() : (
                    <div className="empty-state" style={{ padding: '20px 0', border: '1px dashed var(--color-border)', background: 'transparent' }}>
                      <span>Vui lòng chọn sổ tiết kiệm hoạt động để xem chi tiết tất toán</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="premium-input-row">
                    <div className="premium-input-group col-half">
                      <span className="premium-input-label">Ngân hàng gửi</span>
                      <div className="premium-input-wrapper">
                        <select value={savingsBank} onChange={(e) => setSavingsBank(e.target.value)}>
                          {['Vietcombank', 'Techcombank', 'BIDV', 'Agribank', 'VietinBank', 'MB Bank', 'VPBank', 'ACB', 'Sacombank', 'TPBank', 'Khác'].map(b => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="premium-input-group col-half">
                      <span className="premium-input-label">Thời gian mở sổ</span>
                      <div className="premium-input-wrapper">
                        <DateInput value={date} onChange={setDate} />
                      </div>
                    </div>
                  </div>

                  {savingsBank === 'Khác' && (
                    <div className="premium-input-group">
                      <span className="premium-input-label">Tên ngân hàng tùy chỉnh</span>
                      <div className="premium-input-wrapper">
                        <input
                          value={savingsCustomBank}
                          onChange={(e) => setSavingsCustomBank(e.target.value)}
                          placeholder="Nhập tên ngân hàng..."
                        />
                      </div>
                    </div>
                  )}

                  <div className="premium-input-row">
                    <div className="premium-input-group col-half">
                      <span className="premium-input-label">Số tiền gửi gốc</span>
                      <div className="premium-input-wrapper">
                        <input
                          autoFocus
                          value={savingsPrincipalInput}
                          onChange={(e) => {
                            const rawVal = e.target.value.replace(/\D/g, '')
                            setSavingsPrincipalInput(rawVal ? new Intl.NumberFormat('vi-VN').format(parseInt(rawVal, 10)) : '')
                          }}
                          inputMode="numeric"
                          placeholder="0"
                        />
                        <span className="premium-input-suffix">VND</span>
                      </div>
                    </div>

                    <div className="premium-input-group col-half">
                      <span className="premium-input-label">Lãi suất (% / năm)</span>
                      <div className="premium-input-wrapper">
                        <input
                          value={savingsRate}
                          onChange={(e) => setSavingsRate(e.target.value.replace(/[^0-9.]/g, ''))}
                          placeholder="5.5"
                        />
                        <span className="premium-input-suffix">%</span>
                      </div>
                    </div>
                  </div>

                  <div className="premium-input-row">
                    <div className="premium-input-group col-half">
                      <span className="premium-input-label">Kỳ hạn gửi</span>
                      <div className="premium-input-wrapper">
                        <select value={savingsTerm} onChange={(e) => setSavingsTerm(e.target.value)}>
                          {['1 tháng', '3 tháng', '6 tháng', '9 tháng', '12 tháng', '18 tháng', '24 tháng', '36 tháng', 'Không kỳ hạn'].map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="premium-input-group col-half">
                      <span className="premium-input-label">Phương thức đáo hạn</span>
                      <div className="premium-input-wrapper">
                        <select value={savingsMaturityAction} onChange={(e) => setSavingsMaturityAction(e.target.value)}>
                          <option value="goc_lai_tai_tuc">Tái tục cả gốc và lãi</option>
                          <option value="goc_tai_tuc">Tái tục gốc, lãi về ví</option>
                          <option value="tat_toan_ve_vi">Tất toán về ví khi đáo hạn</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Calculations Card */}
                  <div className="premium-summary-card" style={{ borderLeft: '3px solid var(--color-primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span className="summary-label">Ngày đáo hạn dự kiến</span>
                      <strong style={{ color: 'var(--color-text)' }}>{formatDate(calculatedMaturityDate)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span className="summary-label">Lãi dự tính nhận được</span>
                      <span className="summary-value" style={{ color: 'var(--color-green)' }}>
                        +{new Intl.NumberFormat('vi-VN').format(calculatedExpectedInterest)} đ
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="premium-form-fields">
              {/* Row 1: Code & Date */}
              <div className="premium-input-row">
                <div className="premium-input-group col-half">
                  <span className="premium-input-label">
                    {activeCat === 'stocks' ? 'Mã cổ phiếu & Quỹ' : activeCat === 'crypto' ? 'Mã Crypto' : activeCat === 'bonds' ? 'Mã Trái phiếu' : 'Mã tài sản'}
                  </span>
                  <div className="premium-input-wrapper" style={activeCat === 'gold' ? { paddingRight: 0 } : {}}>
                    {activeCat === 'gold' ? (
                      <div className="gold-symbol-combo">
                        <input
                          ref={goldInputRef}
                          value={symbol}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase()
                            setSymbol(val)
                            setGoldSearch(val)
                            setIsAmountManuallyEdited(false)
                          }}
                          onFocus={() => {
                            const rect = goldInputRef.current?.getBoundingClientRect()
                            if (rect) setGoldDropPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 340) })
                            setGoldSearch('')
                            setShowGoldList(true)
                          }}
                          onBlur={() => setTimeout(() => setShowGoldList(false), 180)}
                          placeholder="Chọn mã vàng..."
                        />
                        <button
                          type="button"
                          className="gold-dropdown-arrow"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            const rect = goldInputRef.current?.getBoundingClientRect()
                            if (rect) setGoldDropPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 340) })
                            if (!showGoldList) setGoldSearch('')
                            setShowGoldList(v => !v)
                          }}
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    ) : (
                      <input
                        value={symbol}
                        onChange={(e) => {
                          setSymbol(e.target.value.toUpperCase())
                          setIsAmountManuallyEdited(false)
                        }}
                        placeholder={activeCat === 'stocks' ? 'VD: HPG, E1VFVN30...' : activeCat === 'bonds' ? 'VD: VFF, TCBF...' : placeholders.symbol}
                      />
                    )}
                  </div>
                  {resolvedAssetName && (
                    <span className="resolved-asset-hint" style={{ color: resolvedAssetColor }}>
                      {resolvedAssetName}
                    </span>
                  )}
                </div>

                <div className="premium-input-group col-half">
                  <span className="premium-input-label">Thời gian</span>
                  <div className="premium-input-wrapper">
                    <DateInput value={date} onChange={setDate} />
                  </div>
                </div>
              </div>

              {/* Row 1.5: Input Mode Selector */}
              <div className="premium-input-group" style={{ marginBottom: '12px' }}>
                <span className="premium-input-label">Cách thức nhập giá</span>
                <div className="premium-segmented" style={{ display: 'flex', background: 'var(--color-bg-input)', borderRadius: '8px', padding: '3px', border: '1px solid var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => setInputMode('unit')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: inputMode === 'unit' ? 'var(--color-primary)' : 'transparent',
                      color: inputMode === 'unit' ? '#ffffff' : 'var(--color-text-secondary)',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '6px 0',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'center'
                    }}
                  >
                    Nhập theo Đơn giá
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('total')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: inputMode === 'total' ? 'var(--color-primary)' : 'transparent',
                      color: inputMode === 'total' ? '#ffffff' : 'var(--color-text-secondary)',
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '6px 0',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'center'
                    }}
                  >
                    Nhập theo Tổng số tiền
                  </button>
                </div>
              </div>

              {/* Row 2: Qty & Price */}
              <div className="premium-input-row">
                <div className="premium-input-group col-half">
                  <span className="premium-input-label">Số lượng</span>
                  <div className="premium-input-wrapper">
                    <input
                      value={qty}
                      onChange={(e) => { setQty(e.target.value.replace(/[^0-9.,]/g, '')) }}
                      placeholder="0"
                    />
                    <span className="premium-input-suffix">{resolvedUnit || 'Đơn vị'}</span>
                  </div>
                </div>

                <div className="premium-input-group col-half">
                  <span className="premium-input-label">
                    {inputMode === 'unit' 
                      ? (type === 'Nhập tài sản' ? 'Giá vốn' : type === 'Mua vào' ? 'Giá mua' : 'Giá bán')
                      : 'Tổng số tiền'
                    }
                  </span>
                  <div className="premium-input-wrapper">
                    {inputMode === 'unit' ? (
                      <input
                        value={navPriceVal}
                        onChange={(e) => {
                          if (activeCat === 'crypto') {
                            const rawVal = e.target.value.replace(/[^0-9.]/g, '')
                            const parts = rawVal.split('.')
                            const formattedVal = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '')
                            setNavPriceVal(formattedVal)
                          } else if (activeCat === 'bonds') {
                            const rawVal = e.target.value.replace(/[^0-9.,]/g, '')
                            setNavPriceVal(rawVal)
                          } else {
                            const rawVal = e.target.value.replace(/\D/g, '')
                            setNavPriceVal(rawVal ? new Intl.NumberFormat('vi-VN').format(parseInt(rawVal, 10)) : '')
                          }
                          setIsAmountManuallyEdited(true)
                        }}
                        inputMode={activeCat === 'crypto' ? 'decimal' : 'numeric'}
                        placeholder="0"
                      />
                    ) : (
                      <input
                        value={totalAmountInput}
                        onChange={(e) => {
                          if (activeCat === 'crypto') {
                            const rawVal = e.target.value.replace(/[^0-9.]/g, '')
                            const parts = rawVal.split('.')
                            const formattedVal = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '')
                            setTotalAmountInput(formattedVal)
                          } else if (activeCat === 'bonds') {
                            const rawVal = e.target.value.replace(/[^0-9.,]/g, '')
                            setTotalAmountInput(rawVal)
                          } else {
                            const rawVal = e.target.value.replace(/\D/g, '')
                            setTotalAmountInput(rawVal ? new Intl.NumberFormat('vi-VN').format(parseInt(rawVal, 10)) : '')
                          }
                          setIsAmountManuallyEdited(true)
                        }}
                        inputMode={activeCat === 'crypto' ? 'decimal' : 'numeric'}
                        placeholder="0"
                      />
                    )}
                    <span className="premium-input-suffix">
                      {inputMode === 'unit' ? (
                        activeCat === 'stocks' ? 'đ/CP' : activeCat === 'crypto' ? 'USD/coin' : activeCat === 'bonds' ? 'đ/CCQ' : 'VND'
                      ) : (
                        activeCat === 'crypto' ? 'USD' : 'VND'
                      )}
                    </span>
                  </div>
                  {inputMode === 'total' && (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px', textAlign: 'right', fontWeight: 600 }}>
                      Đơn giá tính toán: <span style={{ color: 'var(--color-primary)' }}>
                        {activeCat === 'crypto' 
                          ? formatUSD(computedUnitPrice) 
                          : `${new Intl.NumberFormat('vi-VN').format(Math.round(computedUnitPrice))} đ/${resolvedUnit || 'CP'}`
                        }
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: Computed Total Value */}
              <div className="premium-summary-card">
                <span className="summary-label">
                  {type === 'Nhập tài sản' ? 'Tổng giá vốn (tạm tính)' : type === 'Mua vào' ? 'Tổng giá trị mua' : 'Tổng giá trị bán'}
                </span>
                <span className="summary-value">
                  {activeCat === 'crypto'
                    ? formatUSD(computedTotalValue)
                    : `${new Intl.NumberFormat('vi-VN').format(Math.round(computedTotalValue))} đ`}
                </span>
              </div>

              {/* Row 4: Ghi chú */}
              <div className="premium-input-group">
                <span className="premium-input-label">Ghi chú</span>
                <div className="premium-input-wrapper">
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nhập ghi chú giao dịch..." />
                </div>
              </div>

              {/* Row 5: Category selector (only if changeable) */}
              {hasCategory && (
                <div className="premium-input-group">
                  <span className="premium-input-label">Danh mục</span>
                  <div className="premium-input-wrapper">
                    <select
                      value={category}
                      onChange={(e) => {
                        const newCat = e.target.value as AssetCategory
                        setCategory(newCat)
                        setSymbol(defaultSymbolForCategory(newCat))
                      }}
                    >
                      <option value="cash">Ví</option>
                      <option value="gold">Vàng</option>
                      <option value="stocks">Cổ phiếu & Quỹ</option>
                      <option value="bonds">Trái phiếu</option>
                      <option value="savings">Tiết kiệm</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Gold list combo list portal */}
              {activeCat === 'gold' && showGoldList && goldDropPos && createPortal(
                <ul
                  className="gold-symbol-list"
                  style={{
                    position: 'fixed',
                    top: goldDropPos.top,
                    left: goldDropPos.left,
                    minWidth: goldDropPos.width,
                    zIndex: 99999,
                  }}
                >
                  {POPULAR_GOLD_CODES.filter(g =>
                    !goldSearch ||
                    g.symbol.startsWith(goldSearch) ||
                    g.name.toLowerCase().includes(goldSearch.toLowerCase())
                  ).map(g => (
                    <li
                      key={g.symbol}
                      className={`gold-symbol-option ${symbol === g.symbol ? 'selected' : ''}`}
                      onMouseDown={() => {
                        setSymbol(g.symbol)
                        setGoldSearch('')
                        setIsAmountManuallyEdited(false)
                        setShowGoldList(false)
                      }}
                    >
                      <span className="gold-opt-symbol">{g.symbol}</span>
                      <span className="gold-opt-name">{g.name} <em className="gold-opt-unit-inline">{g.unit}</em></span>
                    </li>
                  ))}
                </ul>,
                document.body
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="modal-actions-grid">
            <button className="soft-button cancel-btn" onClick={onClose} type="button">
              Hủy
            </button>
            <button className="primary-button confirm-btn" onClick={handleSave} type="button">
              {confirmBtnText()}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
function isCategoryScreen(screen: Screen): screen is CategoryScreen {
  return ['cash', 'gold', 'crypto', 'stocks', 'bonds', 'savings'].includes(screen)
}

export default App

