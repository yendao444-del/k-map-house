import { useEffect, useMemo, useState, useRef } from 'react'
import { Info, Plus, RefreshCw, ChevronDown, X, MoreHorizontal, LayoutGrid } from 'lucide-react'
import { createChart, ColorType, CandlestickSeries, AreaSeries, LineSeries, type Time } from 'lightweight-charts'
import { type HoldingRecord } from '../services/portfolioApi'
import { fetchVNTicker, normalizeVNSymbol, validateVNSymbol, fetchVNCandles, isSimulatedVNSymbol, type VNTicker, type VNResolution } from '../services/vnstock'

type StockSnapshot = {
  symbol: string
  name: string
  quantity: number
  averageCost: number
  pnlPercent: number
  marketValue: number
}

const WATCHLIST_KEY = 'dbyfinance-stock-watchlist'
const VN_STOCK_SUGGESTIONS = [
  { symbol: 'HPG', name: 'Hoa Phat Group' },
  { symbol: 'FPT', name: 'FPT Corporation' },
  { symbol: 'VNM', name: 'Vinamilk' },
  { symbol: 'DCDS', name: 'Quỹ Năng động Dragon Capital (DCDS)' },
  { symbol: 'VESF', name: 'Quỹ Cổ phiếu Tiếp cận Thị trường VinaCapital (VESF)' },
  { symbol: 'VEOF', name: 'Quỹ Cổ phiếu Cơ hội VinaCapital (VEOF)' },
  { symbol: 'VF1', name: 'Quỹ Đầu tư Tăng trưởng Dragon Capital (VF1)' },
  { symbol: 'VCB', name: 'Vietcombank' },
  { symbol: 'TCB', name: 'Techcombank' },
  { symbol: 'MBB', name: 'MBBank' },
  { symbol: 'ACB', name: 'Asia Commercial Bank' },
  { symbol: 'BID', name: 'BIDV' },
  { symbol: 'CTG', name: 'VietinBank' },
  { symbol: 'VPB', name: 'VPBank' },
  { symbol: 'SSI', name: 'SSI Securities' },
  { symbol: 'VND', name: 'VNDirect Securities' },
  { symbol: 'HCM', name: 'HSC Securities' },
  { symbol: 'VIC', name: 'Vingroup' },
  { symbol: 'VHM', name: 'Vinhomes' },
  { symbol: 'VRE', name: 'Vincom Retail' },
  { symbol: 'MSN', name: 'Masan Group' },
  { symbol: 'MWG', name: 'Mobile World' },
  { symbol: 'GAS', name: 'PV Gas' },
  { symbol: 'PLX', name: 'Petrolimex' },
  { symbol: 'POW', name: 'PV Power' },
  { symbol: 'PVD', name: 'PV Drilling' },
  { symbol: 'DGC', name: 'Duc Giang Chemicals' },
  { symbol: 'GEX', name: 'Gelex Group' },
  { symbol: 'GVR', name: 'Vietnam Rubber Group' },
  { symbol: 'SAB', name: 'Sabeco' },
  { symbol: 'REE', name: 'Ree Corporation' },
  { symbol: 'KDH', name: 'Khang Dien House' },
  { symbol: 'NVL', name: 'Novaland' },
  { symbol: 'DIG', name: 'DIC Corp' },
  { symbol: 'DXG', name: 'Dat Xanh Group' },
  { symbol: 'NLG', name: 'Nam Long' },
  { symbol: 'PDR', name: 'Phat Dat Real Estate' },
  { symbol: 'VJC', name: 'Vietjet Air' },
  { symbol: 'HVN', name: 'Vietnam Airlines' },
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

function parseShareQuantity(input: string) {
  const parsed = parseLocalizedNumber(input.toLowerCase().replace(/cp/g, ''))
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

  // 1. Symbol starts with query
  if (sym.startsWith(q)) return true
  // 2. Name contains words starting with query
  const words = n.split(/\s+/)
  if (words.some((word) => word.startsWith(q))) return true
  // 3. Symbol contains query
  if (sym.includes(q)) return true

  return false
}

function buildSnapshots(holdings: HoldingRecord[]) {
  return holdings
    .filter((holding) => holding.category === 'stocks')
    .map((holding) => {
      const quantity = Math.max(parseShareQuantity(holding.quantity), 0)
      const marketValue = Math.max(holding.valueVnd, 0)
      const averageCost =
        quantity > 0 && holding.pnlPercent > -99.9
          ? Math.round((marketValue / Math.max(1 + holding.pnlPercent / 100, 0.01)) / quantity)
          : 0

      return {
        symbol: normalizeVNSymbol(holding.symbol),
        name: holding.name,
        quantity,
        averageCost,
        pnlPercent: holding.pnlPercent,
        marketValue,
      } satisfies StockSnapshot
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
}

type StockChartProps = {
  symbol: string
  resolution: VNResolution
  chartType: 'candlestick' | 'area' | 'line'
}

function StockChart({ symbol, resolution, chartType }: StockChartProps) {
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

    fetchVNCandles(symbol, resolution, 1000)
      .then((data) => {
        if (cancelled) return
        if (data.length === 0) {
          setError('Không có dữ liệu biểu đồ cho mã này.')
          return
        }

        if (chartType === 'candlestick') {
          const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderDownColor: '#ef5350',
            borderUpColor: '#26a69a',
            wickDownColor: '#ef5350',
            wickUpColor: '#26a69a',
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

export function StockTracker({
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
    return localList.length ? localList : ['HPG', 'FPT', 'VNM', 'E1VFVN30', 'VCB']
  })
  
  const [resolution, setResolution] = useState<VNResolution>('D')
  const [chartType, setChartType] = useState<'candlestick' | 'area' | 'line'>('candlestick')
  const [watchInput, setWatchInput] = useState('')
  const [watchError, setWatchError] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  
  const selectedSymbol = selectedSymbolProp || (snapshots[0]?.symbol ?? watchlist[0] ?? 'HPG')
  const setSelectedSymbol = onSelectSymbol || (() => {})
  
  const [tickersCache, setTickersCache] = useState<Record<string, VNTicker>>({})
  const [loadingPrice, setLoadingPrice] = useState(false)
  const [priceError, setPriceError] = useState('')



  const availableSymbols = useMemo(() => {
    const merged = [...snapshots.map((item) => item.symbol), ...watchlist]
    return Array.from(new Set(merged))
  }, [snapshots, watchlist])

  const watchSuggestions = useMemo(() => {
    const query = normalizeVNSymbol(watchInput)
    if (!query) return []

    return VN_STOCK_SUGGESTIONS
      .filter((item) => {
        if (availableSymbols.includes(item.symbol)) return false
        return matchesSymbolSuggestion(query, item.symbol, item.name)
      })
      .slice(0, 6)
  }, [availableSymbols, watchInput])

  useEffect(() => {
    saveWatchlist(watchlist)
  }, [watchlist])

  useEffect(() => {
    if (!availableSymbols.length) {
      setSelectedSymbol('HPG')
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

  // Fetch prices for all symbols in the watchlist
  const loadAllTickers = async () => {
    setLoadingPrice(true)
    setPriceError('')
    const symbolsToFetch = [...availableSymbols]
    const results: Record<string, VNTicker> = {}
    
    try {
      await Promise.all(
        symbolsToFetch.map(async (sym) => {
          try {
            const tk = await fetchVNTicker(sym)
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
    const normalized = normalizeVNSymbol(symbolInput)
    if (!normalized) return
    if (availableSymbols.includes(normalized)) {
      setSelectedSymbol(normalized)
      setWatchInput('')
      setWatchError('')
      setShowSearch(false)
      return
    }

    // Optimization: check predefined list first to avoid API call
    const isPredefined = VN_STOCK_SUGGESTIONS.some((item) => item.symbol === normalized)
    if (isPredefined) {
      setWatchlist((prev) => [...prev, normalized])
      setSelectedSymbol(normalized)
      setWatchInput('')
      setWatchError('')
      setShowSearch(false)
      return
    }

    setWatchError('Đang kiểm tra...')
    const isValid = await validateVNSymbol(normalized)
    if (!isValid) {
      setWatchError(`Không tìm thấy mã ${normalized}.`)
      return
    }

    setWatchlist((prev) => [...prev, normalized])
    setSelectedSymbol(normalized)
    setWatchInput('')
    setWatchError('')
    setShowSearch(false)
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
    const suggest = VN_STOCK_SUGGESTIONS.find(g => g.symbol === sym)
    const snap = snapshots.find(h => h.symbol === sym)
    const fullName = snap?.name || suggest?.name || 'Cổ phiếu'
    
    const isSelected = selectedSymbol === sym

    let priceVal = 0
    let pctVal = 0
    
    if (tk) {
      priceVal = tk.price * 1000
      pctVal = tk.changePercent
    } else if (snap) {
      priceVal = snap.averageCost || (snap.marketValue / snap.quantity)
    }

    const prevVal = priceVal / (1 + pctVal / 100)
    const diffVal = priceVal - prevVal

    const displayPrice = priceVal > 0 ? new Intl.NumberFormat('vi-VN').format(priceVal) : '-'
    const displayDiff = priceVal > 0 ? `${diffVal >= 0 ? '+' : ''}${Math.round(diffVal).toLocaleString('vi-VN')}` : '-'
    const displayPct = priceVal > 0 ? `${pctVal >= 0 ? '+' : ''}${pctVal.toFixed(2)}%` : '-'

    const colorClass = pctVal > 0 ? 'tv-text-green' : pctVal < 0 ? 'tv-text-red' : 'tv-text-neutral'

    // Simple hash color for logo circle
    let hash = 0
    for (let i = 0; i < sym.length; i++) {
      hash = sym.charCodeAt(i) + ((hash << 5) - hash)
    }
    const logoColors = [
      '#1e3a8a', '#064e3b', '#701a75', '#7c2d12', '#14532d',
      '#311042', '#0f766e', '#1d4ed8', '#047857', '#b45309'
    ]
    const logoBg = logoColors[Math.abs(hash) % logoColors.length]

    return (
      <tr 
        key={sym} 
        onClick={() => setSelectedSymbol(sym)}
        className={`tv-watchlist-row ${isSelected ? 'selected' : ''}`}
      >
        <td className="tv-watchlist-td align-left">
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <div className="tv-logo-circle" style={{ backgroundColor: logoBg }}>
              {sym.charAt(0)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <strong style={{ fontSize: '12px', fontWeight: 'bold' }}>{sym}</strong>
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
          <h3>Biểu đồ Cổ phiếu & Quỹ trực tuyến</h3>
          <span className="source-tag">
            {isSimulatedVNSymbol(selectedSymbol) ? "Nguồn: Mô phỏng (Mã không niêm yết)" : "Nguồn: VPS / TradingView"}
          </span>
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
        {/* Left Side: TradingView style Watchlist */}
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
                  title="Thêm mã cổ phiếu"
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
                    placeholder="Tìm mã cổ phiếu..."
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
                  <col style={{ width: '42%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '18%' }} />
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
                    onClick={() => setResolution(tf.value as VNResolution)}
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
            <StockChart symbol={selectedSymbol} resolution={resolution} chartType={chartType} />
          </div>
          
          <div className="chart-legend" style={{ padding: '10px 16px', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>
              {isSimulatedVNSymbol(selectedSymbol)
                ? `📈 Biểu đồ mô phỏng cho quỹ/tài sản không niêm yết sử dụng độ phân giải ${resolution === '60' ? '1 giờ (1H)' : resolution === '240' ? '4 giờ (4H)' : resolution === 'D' ? 'ngày (D)' : resolution === 'W' ? 'tuần (W)' : 'tháng (M)'}.`
                : `📈 Biểu đồ kỹ thuật sử dụng ${chartType === 'candlestick' ? 'nến' : chartType === 'area' ? 'vùng' : 'đường'} ${resolution === '60' ? '1 giờ (1H)' : resolution === '240' ? '4 giờ (4H)' : resolution === 'D' ? 'ngày (D)' : resolution === 'W' ? 'tuần (W)' : 'tháng (M)'} lấy trực tiếp từ nguồn dữ liệu VPS.`
              }
            </span>
            <span>💡 Chọn các mã khác trong danh sách theo dõi để xem biểu đồ tương ứng.</span>
          </div>
        </div>
      </div>
    </section>
  )
}
