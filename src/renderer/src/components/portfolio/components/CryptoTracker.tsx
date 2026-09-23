import { useEffect, useMemo, useState, useRef } from 'react'
import { Info, Plus, RefreshCw, ChevronDown, X, MoreHorizontal, LayoutGrid } from 'lucide-react'
import { createChart, ColorType, CandlestickSeries, AreaSeries, LineSeries, type Time } from 'lightweight-charts'
import { type HoldingRecord } from '../services/portfolioApi'
import { fetchCryptoTicker, normalizeCryptoSymbol, fetchCryptoCandles, type CryptoTicker, type CryptoResolution } from '../services/cryptoApi'

type CryptoSnapshot = {
  symbol: string
  name: string
  quantity: number
  averageCost: number
  pnlPercent: number
  marketValue: number
}

export function formatUSD(value: number) {
  if (localStorage.getItem('dbyfinance-privacy-mode') === 'true') {
    return '******'
  }
  if (value === 0) return '$0.00'
  const abs = Math.abs(value)
  let fractionDigits = 2
  if (abs < 0.0001) fractionDigits = 8
  else if (abs < 0.01) fractionDigits = 6
  else if (abs < 1) fractionDigits = 4
  else if (abs < 10) fractionDigits = 3
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Math.min(2, fractionDigits),
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

function getSeriesPriceFormat(prices: number[]) {
  if (!prices.length) return { minMove: 0.01, precision: 2 }
  const sample = Math.max(...prices.filter(p => p > 0))
  if (sample < 0.0001) return { minMove: 0.00000001, precision: 8 }
  if (sample < 0.001)  return { minMove: 0.000001,   precision: 6 }
  if (sample < 0.01)   return { minMove: 0.000001,   precision: 6 }
  if (sample < 0.1)    return { minMove: 0.0001,     precision: 4 }
  if (sample < 1)      return { minMove: 0.0001,     precision: 4 }
  if (sample < 10)     return { minMove: 0.001,      precision: 3 }
  if (sample < 1000)   return { minMove: 0.01,       precision: 2 }
  return { minMove: 1, precision: 0 }
}

export function CryptoLogo({
  symbol,
  size = 24,
  borderRadius = '50%',
  marginRight = '8px',
}: {
  symbol: string
  size?: number
  borderRadius?: string
  marginRight?: string
}) {
  const baseSym = symbol.endsWith('USDT') && symbol !== 'USDT' ? symbol.slice(0, -4) : symbol
  const [imgError, setImgError] = useState(false)
  const url = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${baseSym.toLowerCase()}.png`

  let hash = 0
  for (let i = 0; i < baseSym.length; i++) {
    hash = baseSym.charCodeAt(i) + ((hash << 5) - hash)
  }
  const logoColors = [
    '#1e3a8a', '#064e3b', '#701a75', '#7c2d12', '#14532d',
    '#311042', '#0f766e', '#1d4ed8', '#047857', '#b45309'
  ]
  const logoBg = logoColors[Math.abs(hash) % logoColors.length]

  if (!imgError) {
    return (
      <img
        src={url}
        alt={baseSym}
        onError={() => setImgError(true)}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius,
          marginRight,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          objectFit: 'contain',
          backgroundColor: 'rgba(255,255,255,0.05)',
          padding: '2px',
          boxSizing: 'border-box',
          verticalAlign: 'middle',
        }}
      />
    )
  }

  return (
    <div
      className="tv-logo-circle"
      style={{
        backgroundColor: logoBg,
        width: `${size}px`,
        height: `${size}px`,
        lineHeight: `${size}px`,
        fontSize: size > 20 ? '11px' : '9px',
        textAlign: 'center',
        borderRadius,
        color: '#fff',
        fontWeight: 'bold',
        marginRight,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    >
      {baseSym.slice(0, 2)}
    </div>
  )
}

const WATCHLIST_KEY = 'dbyfinance-crypto-watchlist'
const BINANCE_CRYPTO_SUGGESTIONS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'BNB', name: 'Binance Coin' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'USDT', name: 'Tether' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'XRP', name: 'Ripple' },
  { symbol: 'DOT', name: 'Polkadot' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'SHIB', name: 'Shiba Inu' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'LINK', name: 'Chainlink' },
  { symbol: 'MATIC', name: 'Polygon' },
  { symbol: 'LTC', name: 'Litecoin' },
  { symbol: 'UNI', name: 'Uniswap' },
]

function parseLocalizedNumber(input: string) {
  const cleaned = input.trim().replace(/[^\d.,-]/g, '')
  if (!cleaned) return 0
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'))
  }
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
    return Number(cleaned.replace(/,/g, ''))
  }
  return Number(cleaned.replace(',', '.'))
}

function parseCryptoQuantity(input: string) {
  const parsed = parseLocalizedNumber(input)
  return Number.isFinite(parsed) ? parsed : 0
}

function readWatchlist() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

function saveWatchlist(symbols: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols))
}

function matchesSymbolSuggestion(query: string, symbol: string, name: string) {
  const q = query.toUpperCase()
  const sym = symbol.toUpperCase()
  const n = name.toUpperCase()

  if (sym.startsWith(q)) return true
  const words = n.split(/\s+/)
  if (words.some((word) => word.startsWith(q))) return true
  if (sym.includes(q)) return true

  return false
}

function buildSnapshots(holdings: HoldingRecord[]) {
  return holdings
    .filter((holding) => holding.category === 'crypto')
    .map((holding) => {
      const quantity = Math.max(parseCryptoQuantity(holding.quantity), 0)
      const marketValueVnd = Math.max(holding.valueVnd, 0)
      const marketValue = marketValueVnd / 25400
      const averageCost =
        quantity > 0 && holding.pnlPercent > -99.9
          ? (marketValue / Math.max(1 + holding.pnlPercent / 100, 0.01)) / quantity
          : 0

      return {
        symbol: normalizeCryptoSymbol(holding.symbol),
        name: holding.name,
        quantity,
        averageCost,
        pnlPercent: holding.pnlPercent,
        marketValue,
      } satisfies CryptoSnapshot
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}

type CryptoChartProps = {
  symbol: string
  resolution: CryptoResolution
  chartType?: 'candlestick' | 'area' | 'line'
}

function CryptoChart({ symbol, resolution, chartType = 'candlestick' }: CryptoChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    container.innerHTML = ''

    const isLight = localStorage.getItem('dbyfinance-theme') === 'light'
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#131722' },
        textColor: isLight ? '#334155' : '#d1d4dc',
      },
      grid: {
        vertLines: { color: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(42, 46, 57, 0.15)' },
        horzLines: { color: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(42, 46, 57, 0.15)' },
      },
      rightPriceScale: {
        borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(42, 46, 57, 0.3)',
      },
      timeScale: {
        borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(42, 46, 57, 0.3)',
        timeVisible: true,
      },
    })

    let cancelled = false
    setLoading(true)
    setError('')

    fetchCryptoCandles(symbol, resolution, 1000)
      .then((data) => {
        if (cancelled) return
        if (data.length === 0) {
          setError('Không có dữ liệu biểu đồ cho mã này.')
          return
        }

        const closePrices = data.map(d => d.close)
        const priceFmt = getSeriesPriceFormat(closePrices)

        if (chartType === 'candlestick') {
          const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderDownColor: '#ef5350',
            borderUpColor: '#26a69a',
            wickDownColor: '#ef5350',
            wickUpColor: '#26a69a',
            priceFormat: { type: 'price', ...priceFmt },
          })
          const formatted = data.map((item) => ({
            time: item.time as Time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
          }))
          candlestickSeries.setData(formatted)
        } else if (chartType === 'area') {
          const areaSeries = chart.addSeries(AreaSeries, {
            lineColor: '#26a69a',
            topColor: 'rgba(38, 166, 154, 0.35)',
            bottomColor: 'rgba(38, 166, 154, 0.02)',
            lineWidth: 2,
            priceFormat: { type: 'price', ...priceFmt },
          })
          const formatted = data.map((item) => ({
            time: item.time as Time,
            value: item.close,
          }))
          areaSeries.setData(formatted)
        } else {
          const lineSeries = chart.addSeries(LineSeries, {
            color: '#26a69a',
            lineWidth: 2,
            priceFormat: { type: 'price', ...priceFmt },
          })
          const formatted = data.map((item) => ({
            time: item.time as Time,
            value: item.close,
          }))
          lineSeries.setData(formatted)
        }

        chart.timeScale().fitContent()
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load chart data:', err)
        setError('Không thể tải dữ liệu biểu đồ. Vui lòng đổi mã hoặc kiểm tra mạng.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        chart.applyOptions({ width, height })
      }
    })
    resizeObserver.observe(container)

    return () => {
      cancelled = true
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [symbol, resolution, chartType])

  const isLight = localStorage.getItem('dbyfinance-theme') === 'light'
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '420px' }}>
      {loading && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isLight ? 'rgba(255, 255, 255, 0.75)' : 'rgba(19, 23, 34, 0.7)', zIndex: 10, fontSize: '12px', color: isLight ? '#475569' : '#848e9c' }}>
          Đang tải biểu đồ...
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(19, 23, 34, 0.9)', zIndex: 10, fontSize: '12px', color: isLight ? '#dc2626' : '#ef5350', padding: '20px', textAlign: 'center' }}>
          {error}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

export function CryptoTracker({
  holdings,
  selectedSymbol: selectedSymbolProp,
  onSelectSymbol,
}: {
  holdings: HoldingRecord[]
  transactions?: any
  onTradeComplete?: () => void
  selectedSymbol?: string
  onSelectSymbol?: (symbol: string) => void
}) {
  const snapshots = useMemo(() => buildSnapshots(holdings), [holdings])
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    const localList = readWatchlist()
    return localList.length ? localList : ['BTC', 'ETH', 'BNB', 'SOL', 'USDT']
  })

  const [resolution, setResolution] = useState<CryptoResolution>('W')
  const [chartType, setChartType] = useState<'candlestick' | 'area' | 'line'>('candlestick')
  const [watchInput, setWatchInput] = useState('')
  const [watchError, setWatchError] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const selectedSymbol = selectedSymbolProp || (snapshots[0]?.symbol ?? watchlist[0] ?? 'BTC')
  const setSelectedSymbol = onSelectSymbol || (() => {})

  const [tickersCache, setTickersCache] = useState<Record<string, CryptoTicker>>({})
  const [loadingPrice, setLoadingPrice] = useState(false)
  const [priceError, setPriceError] = useState('')

  const availableSymbols = useMemo(() => {
    const merged = [...snapshots.map((item) => item.symbol), ...watchlist]
    return Array.from(new Set(merged))
  }, [snapshots, watchlist])

  const watchSuggestions = useMemo(() => {
    const query = normalizeCryptoSymbol(watchInput)
    if (!query) return []

    return BINANCE_CRYPTO_SUGGESTIONS
      .filter((item) => {
        const fullSym = normalizeCryptoSymbol(item.symbol)
        if (availableSymbols.includes(fullSym)) return false
        return matchesSymbolSuggestion(query, item.symbol, item.name)
      })
      .slice(0, 6)
  }, [availableSymbols, watchInput])

  useEffect(() => {
    saveWatchlist(watchlist)
  }, [watchlist])

  useEffect(() => {
    if (!availableSymbols.length) {
      setSelectedSymbol('BTC')
      return
    }
    if (!availableSymbols.includes(selectedSymbol)) {
      setSelectedSymbol(availableSymbols[0])
    }
  }, [availableSymbols, selectedSymbol])

  useEffect(() => {
    if (!selectedSymbolProp && selectedSymbol) {
      setSelectedSymbol(selectedSymbol)
    }
  }, [selectedSymbolProp, selectedSymbol, setSelectedSymbol])

  const loadAllTickers = async () => {
    setLoadingPrice(true)
    setPriceError('')
    const symbolsToFetch = [...availableSymbols]
    const results: Record<string, CryptoTicker> = {}

    try {
      await Promise.all(
        symbolsToFetch.map(async (sym) => {
          try {
            const tk = await fetchCryptoTicker(sym)
            results[sym] = tk
          } catch (err) {
            console.error(`Failed to fetch ticker for ${sym}:`, err)
          }
        })
      )
      setTickersCache((prev) => ({ ...prev, ...results }))
    } catch (err) {
      setPriceError('Có lỗi khi cập nhật bảng giá trực tuyến.')
    } finally {
      setLoadingPrice(false)
    }
  }

  useEffect(() => {
    loadAllTickers()
  }, [availableSymbols])

  const handleAddWatchSymbol = async (symbolInput = watchInput) => {
    const normalized = normalizeCryptoSymbol(symbolInput)
    if (!normalized) return
    if (availableSymbols.includes(normalized)) {
      setSelectedSymbol(normalized)
      setWatchInput('')
      setWatchError('')
      setShowSearch(false)
      return
    }

    const isPredefined = BINANCE_CRYPTO_SUGGESTIONS.some((item) => normalizeCryptoSymbol(item.symbol) === normalized)
    if (isPredefined) {
      setWatchlist((prev) => [...prev, normalized])
      setSelectedSymbol(normalized)
      setWatchInput('')
      setWatchError('')
      setShowSearch(false)
      return
    }

    setWatchError('Đang kiểm tra...')
    try {
      await fetchCryptoTicker(normalized)
      setWatchlist((prev) => [...prev, normalized])
      setSelectedSymbol(normalized)
      setWatchInput('')
      setWatchError('')
      setShowSearch(false)
    } catch {
      setWatchError(`Không tìm thấy mã ${normalized}.`)
    }
  }

  const handleRemoveWatchSymbol = (e: React.MouseEvent, symbolToRemove: string) => {
    e.stopPropagation()
    setWatchlist((prev) => prev.filter((s) => s !== symbolToRemove))
  }

  const ownedSymbols = useMemo(() => {
    return snapshots.filter((s) => s.quantity > 0).map((s) => s.symbol)
  }, [snapshots])

  const watchedSymbols = useMemo(() => {
    return watchlist.filter((sym) => !ownedSymbols.includes(sym))
  }, [watchlist, ownedSymbols])

  const renderWatchlistRow = (sym: string) => {
    const tk = tickersCache[sym]
    // Extract base symbol for suggestions check, e.g. BTCUSDT -> BTC
    const baseSym = sym.endsWith('USDT') && sym !== 'USDT' ? sym.slice(0, -4) : sym
    const suggest = BINANCE_CRYPTO_SUGGESTIONS.find(g => g.symbol === baseSym)
    const snap = snapshots.find(h => h.symbol === sym)
    const fullName = snap?.name || suggest?.name || 'Tài sản Crypto'

    const isSelected = selectedSymbol === sym

    let priceVal = 0
    let pctVal = 0

    if (tk) {
      priceVal = tk.price
      pctVal = tk.changePercent
    } else if (snap) {
      priceVal = snap.averageCost || (snap.marketValue / snap.quantity)
    }

    const prevVal = priceVal / (1 + pctVal / 100)
    const diffVal = priceVal - prevVal

    const displayPrice = priceVal > 0 ? formatUSD(priceVal) : '-'
    const displayDiff = priceVal > 0 ? `${diffVal >= 0 ? '+' : ''}${formatUSD(diffVal)}` : '-'
    const displayPct = priceVal > 0 ? `${pctVal >= 0 ? '+' : ''}${pctVal.toFixed(2)}%` : '-'

    const colorClass = pctVal > 0 ? 'tv-text-green' : pctVal < 0 ? 'tv-text-red' : 'tv-text-neutral'

    return (
      <tr
        key={sym}
        onClick={() => setSelectedSymbol(sym)}
        className={`tv-watchlist-row ${isSelected ? 'selected' : ''}`}
      >
        <td className="tv-watchlist-td align-left">
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <CryptoLogo symbol={sym} size={24} />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <strong style={{ fontSize: '12px', fontWeight: 'bold' }}>{baseSym}</strong>
                <span className="tv-badge-delayed">D</span>
                <span className="tv-market-bullet closed"></span>
              </div>
              <small style={{ fontSize: '10px', color: 'var(--color-text-secondary)', opacity: 0.8, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '85px' }} title={fullName}>
                {fullName}
              </small>
            </div>
          </div>
        </td>
        <td className="tv-watchlist-td align-right" style={{ fontWeight: '600' }}>
          {displayPrice}
        </td>
        <td className={`tv-watchlist-td align-right ${colorClass}`} style={{ fontWeight: '500' }}>
          {displayDiff}
        </td>
        <td className={`tv-watchlist-td align-right ${colorClass}`} style={{ fontWeight: '600' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
            <span>{displayPct}</span>
            {watchlist.includes(sym) && (
              <button
                onClick={(e) => handleRemoveWatchSymbol(e, sym)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '2px', display: 'inline-flex', marginLeft: '4px' }}
                title="Xóa khỏi theo dõi"
                className="tv-remove-btn"
                type="button"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <section className="gold-tracker-container stock-tracker-container">
      {/* Header and Controls */}
      <div className="tracker-header">
        <div className="tracker-title">
          <Info size={18} className="info-icon" />
          <h3>Biểu đồ Crypto trực tuyến</h3>
          <span className="source-tag">Nguồn: Binance API</span>
          {priceError && <span className="source-tag error-tag">{priceError}</span>}
        </div>

        <div className="tracker-controls">
          <button className="refresh-button" onClick={() => void loadAllTickers()} title="Làm mới dữ liệu" type="button">
            <RefreshCw size={14} className={loadingPrice ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="gold-body-grid">
        {/* Left Side: Watchlist */}
        <div className="price-widget-column tv-watchlist-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          <div className="tv-watchlist-card" style={{ background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '340px' }}>
            {/* Watchlist Header */}
            <div className="tv-watchlist-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>Danh sách theo dõi</strong>
                <ChevronDown size={14} style={{ color: 'var(--color-text-secondary)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => { setShowSearch(v => !v); setWatchInput(''); setWatchError(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                  title="Thêm mã Crypto"
                  type="button"
                >
                  <Plus size={16} />
                </button>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                  title="Chế độ xem bảng"
                  type="button"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                  title="Tùy chọn khác"
                  type="button"
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>
            </div>

            {/* Quick Search Row */}
            {showSearch && (
              <div className="tv-watchlist-search-container" style={{ position: 'relative', padding: '8px 12px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-input)' }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    autoFocus
                    onChange={(event) => {
                      setWatchInput(event.target.value.toUpperCase())
                      setWatchError('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleAddWatchSymbol(watchInput)
                      }
                    }}
                    placeholder="Tìm mã Crypto..."
                    style={{ flex: 1, height: '28px', padding: '0 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-panel)', color: 'var(--color-text-primary)' }}
                    value={watchInput}
                  />
                  <button
                    onClick={() => void handleAddWatchSymbol(watchInput)}
                    style={{ background: 'var(--color-primary)', border: 'none', color: '#ffffff', borderRadius: '4px', padding: '0 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}
                    type="button"
                  >
                    Thêm
                  </button>
                </div>
                {watchSuggestions.length ? (
                  <div className="watchlist-suggestions" style={{ position: 'absolute', top: '100%', left: '12px', right: '12px', width: 'auto', zIndex: 100, marginTop: '4px', background: 'var(--color-bg-panel)', border: '1px solid var(--color-border)', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', maxHeight: '200px', overflowY: 'auto' }}>
                    {watchSuggestions.map((item) => (
                      <button
                        key={item.symbol}
                        className="watchlist-suggestion"
                        onMouseDown={(event) => {
                          event.preventDefault()
                          void handleAddWatchSymbol(item.symbol)
                        }}
                        style={{ width: '100%', padding: '6px 10px', display: 'flex', flexDirection: 'column', background: 'none', border: 'none', color: 'var(--color-text-primary)', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                        type="button"
                      >
                        <strong style={{ fontSize: '11px', color: 'var(--color-primary)' }}>{item.symbol}</strong>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{item.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {watchError && <div style={{ fontSize: '11px', color: 'var(--color-red)', marginTop: '4px' }}>{watchError}</div>}
              </div>
            )}

            {/* Watchlist Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table className="tv-watchlist-table">
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '36%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '18%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="tv-watchlist-th align-left">Mã GD</th>
                    <th className="tv-watchlist-th align-right">Lần cuối</th>
                    <th className="tv-watchlist-th align-right">Th.đổi</th>
                    <th className="tv-watchlist-th align-right">%Th.đổi</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Owned Section */}
                  {ownedSymbols.length > 0 && (
                    <>
                      <tr className="tv-watchlist-section-header">
                        <td colSpan={4}>
                          <div className="section-title-wrapper">
                            <ChevronDown size={11} className="section-chevron" />
                            <span>DANH MỤC SỞ HỮU</span>
                          </div>
                        </td>
                      </tr>
                      {ownedSymbols.map(renderWatchlistRow)}
                    </>
                  )}

                  {/* Watched Section */}
                  {watchedSymbols.length > 0 && (
                    <>
                      <tr className="tv-watchlist-section-header">
                        <td colSpan={4}>
                          <div className="section-title-wrapper">
                            <ChevronDown size={11} className="section-chevron" />
                            <span>DANH SÁCH THEO DÕI</span>
                          </div>
                        </td>
                      </tr>
                      {watchedSymbols.map(renderWatchlistRow)}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right Side: Native Chart Widget */}
        <div className="chart-panel gold-chart-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column', minHeight: '480px' }}>
          <div className="chart-timeframe-bar" style={{ padding: '12px 16px 0 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div className="chart-timeframe-tabs">
                {[
                  { value: '60', label: '1H' },
                  { value: '240', label: '4H' },
                  { value: 'D', label: '1D' },
                  { value: 'W', label: '1W' },
                  { value: 'M', label: '1M' },
                ].map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setResolution(tf.value as CryptoResolution)}
                    className={resolution === tf.value ? 'active' : ''}
                    type="button"
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              <div className="chart-timeframe-tabs">
                {[
                  { value: 'area', label: 'Vùng' },
                  { value: 'line', label: 'Đường' },
                  { value: 'candlestick', label: 'Nến' },
                ].map((ct) => (
                  <button
                    key={ct.value}
                    onClick={() => setChartType(ct.value as any)}
                    className={chartType === ct.value ? 'active' : ''}
                    type="button"
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="chart-timeframe-label">
              <span>Độ phân giải: <strong>{resolution === '60' ? '1 Giờ' : resolution === '240' ? '4 Giờ' : resolution === 'D' ? '1 Ngày' : resolution === 'W' ? '1 Tuần' : '1 Tháng'}</strong></span>
            </div>
          </div>

          <div className="tradingview-chart-wrapper" style={{ flex: 1, position: 'relative', width: '100%', height: '100%', minHeight: '420px', background: 'var(--color-bg-input)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <CryptoChart symbol={selectedSymbol} resolution={resolution} chartType={chartType} />
          </div>
          
          <div className="chart-legend" style={{ padding: '10px 16px', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>📈 Biểu đồ kỹ thuật sử dụng {chartType === 'candlestick' ? 'nến' : chartType === 'area' ? 'vùng' : 'đường'} {resolution === '60' ? '1 giờ (1H)' : resolution === '240' ? '4 giờ (4H)' : resolution === 'D' ? 'ngày (D)' : resolution === 'W' ? 'tuần (W)' : 'tháng (M)'} lấy trực tiếp từ Binance (USD).</span>
            <span>💡 Chọn các mã khác trong danh sách theo dõi để xem biểu đồ tương ứng.</span>
          </div>
        </div>
      </div>
    </section>
  )
}
