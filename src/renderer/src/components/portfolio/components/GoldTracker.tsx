import React, { useEffect, useState, useMemo, useRef } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Loader2,
  RefreshCw,
  Info
} from 'lucide-react'
import {
  fetchCurrentGoldPrices,
  fetchGoldHistory,
  GoldPriceDetail,
  HistoricalPricePoint,
  FALLBACK_GOLD_PRICES
} from '../services/goldApi'

type TimeRange = 30 | 90 | 180 | 365 | 730 | 1095
const TIME_RANGES: TimeRange[] = [30, 90, 180, 365, 730, 1095]

function formatRangeLabel(days: TimeRange) {
  if (days === 365) return '1 Năm'
  if (days === 730) return '2 Năm'
  if (days === 1095) return '3 Năm'
  return `${days} ngày`
}

export function GoldTracker() {
  const [currentPrices, setCurrentPrices] = useState<Record<string, GoldPriceDetail>>(FALLBACK_GOLD_PRICES)
  const [history, setHistory] = useState<HistoricalPricePoint[]>([])
  const [range, setRange] = useState<TimeRange>(365)
  const [selectedBrand, setSelectedBrand] = useState<string>('SJ9999') // SJ9999 = SJC Ring
  const [loadingCurrent, setLoadingCurrent] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [historyMeta, setHistoryMeta] = useState<{ source?: string; coverageStart?: string; coverageEnd?: string }>({})
  
  const chartContainerRef = useRef<HTMLDivElement>(null)

  // Load current prices
  const loadCurrent = async () => {
    setLoadingCurrent(true)
    const data = await fetchCurrentGoldPrices()
    if (data && data.prices) {
      setCurrentPrices(data.prices)
    }
    setLoadingCurrent(false)
  }

  // Load history
  const loadHistory = async () => {
    setLoadingHistory(true)
    const data = await fetchGoldHistory(selectedBrand, range)
    if (data && data.history) {
      // API returns history starting from today backwards, we reverse it to display chronologically (left to right)
      setHistory([...data.history].reverse())
      setHistoryMeta({
        source: data.source,
        coverageStart: data.coverageStart,
        coverageEnd: data.coverageEnd
      })
    }
    setLoadingHistory(false)
  }

  useEffect(() => {
    loadCurrent()
  }, [])

  useEffect(() => {
    loadHistory()
  }, [range, selectedBrand])

  const formatVnd = (value: number) => {
    if (localStorage.getItem('dbyfinance-privacy-mode') === 'true') {
      return '******'
    }
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatShortVnd = (value: number) => {
    if (localStorage.getItem('dbyfinance-privacy-mode') === 'true') {
      return '******'
    }
    return `${(value / 1000000).toFixed(1)} tr`
  }

  // Helper to format change
  const renderChange = (change?: number) => {
    if (!change) return null
    const isUp = change > 0
    return (
      <span className={`change-badge ${isUp ? 'positive' : 'negative'}`}>
        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        <span>{formatShortVnd(Math.abs(change))}</span>
      </span>
    )
  }

  // Brand Options
  const brands = [
    { code: 'SJ9999', name: 'Nhẫn SJC 99.99' },
    { code: 'PQHN24NTT', name: 'Nhẫn PNJ 24K' },
    { code: 'BT9999NTT', name: 'Nhẫn Bảo Tín 9999' }
  ]

  // Chart Dimensions & Calculations
  const viewWidth = 600
  const viewHeight = 320
  const paddingLeft = 60
  const paddingRight = 20
  const paddingTop = 20
  const paddingBottom = 40

  const chartWidth = viewWidth - paddingLeft - paddingRight
  const chartHeight = viewHeight - paddingTop - paddingBottom

  // Extract prices from history to calculate scale
  const chartData = useMemo(() => {
    if (history.length === 0) return []
    return history.map((h, i) => {
      const priceObj = h.prices[selectedBrand]
      return {
        index: i,
        date: h.date,
        buy: priceObj?.buy || 0,
        sell: priceObj?.sell || 0
      }
    }).filter(d => d.buy > 0 && d.sell > 0)
  }, [history, selectedBrand])

  const scales = useMemo(() => {
    if (chartData.length === 0) return { min: 0, max: 0, yGrid: [] }
    const buyPrices = chartData.map(d => d.buy)
    const sellPrices = chartData.map(d => d.sell)
    const allPrices = [...buyPrices, ...sellPrices]
    
    const minVal = Math.min(...allPrices)
    const maxVal = Math.max(...allPrices)
    
    // Add 5% padding top and bottom to make chart look nice
    const margin = (maxVal - minVal) * 0.08 || 1000000
    const min = Math.max(0, minVal - margin)
    const max = maxVal + margin

    // Generate grid lines
    const gridCount = 4
    const yGrid = Array.from({ length: gridCount }).map((_, idx) => {
      return min + (max - min) * (idx / (gridCount - 1))
    })

    return { min, max, yGrid }
  }, [chartData])

  // Get SVG path for buy & sell
  const svgPaths = useMemo(() => {
    if (chartData.length < 2) return { buyPath: '', sellPath: '', buyArea: '', sellArea: '' }
    
    const getCoords = (d: typeof chartData[0], idx: number) => {
      const x = paddingLeft + (idx / (chartData.length - 1)) * chartWidth
      
      const buyY = paddingTop + chartHeight - ((d.buy - scales.min) / (scales.max - scales.min)) * chartHeight
      const sellY = paddingTop + chartHeight - ((d.sell - scales.min) / (scales.max - scales.min)) * chartHeight
      
      return { x, buyY, sellY }
    }

    const coords = chartData.map((d, i) => getCoords(d, i))

    // Create paths
    const buyPath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.buyY}`).join(' ')
    const sellPath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.sellY}`).join(' ')

    // Create filled areas
    const buyArea = `${buyPath} L ${coords[coords.length - 1].x} ${paddingTop + chartHeight} L ${coords[0].x} ${paddingTop + chartHeight} Z`
    const sellArea = `${sellPath} L ${coords[coords.length - 1].x} ${paddingTop + chartHeight} L ${coords[0].x} ${paddingTop + chartHeight} Z`

    return { buyPath, sellPath, buyArea, sellArea, coords }
  }, [chartData, scales, chartWidth, chartHeight])

  // Mouse interactivity to find the closest point
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!svgPaths.coords || svgPaths.coords.length === 0 || !chartContainerRef.current) return

    const svgRect = e.currentTarget.getBoundingClientRect()
    // Calculate cursor X relative to SVG scale
    const mouseX = ((e.clientX - svgRect.left) / svgRect.width) * viewWidth

    // Find closest X index
    let closestIndex = 0
    let minDiff = Infinity
    
    svgPaths.coords.forEach((coord, idx) => {
      const diff = Math.abs(coord.x - mouseX)
      if (diff < minDiff) {
        minDiff = diff
        closestIndex = idx
      }
    })

    setHoveredPointIndex(closestIndex)
    
    // Set tooltip position
    const activeCoord = svgPaths.coords[closestIndex]
    
    // Tooltip offset positioning to stay inside bounds
    const tooltipX = activeCoord.x > viewWidth - 160 ? activeCoord.x - 170 : activeCoord.x + 15
    const tooltipY = Math.min(activeCoord.buyY, activeCoord.sellY) - 20
    
    setTooltipPos({ x: tooltipX, y: Math.max(paddingTop, Math.min(tooltipY, viewHeight - 130)) })
  }

  const handleMouseLeave = () => {
    setHoveredPointIndex(null)
  }

  const activePoint = hoveredPointIndex !== null && chartData[hoveredPointIndex] ? chartData[hoveredPointIndex] : null
  const activeCoord = hoveredPointIndex !== null && svgPaths.coords ? svgPaths.coords[hoveredPointIndex] : null

  // Date Labels for X Axis (show 4 dates)
  const xLabels = useMemo(() => {
    if (chartData.length < 2) return []
    const step = Math.floor(chartData.length / 3)
    const indices = [0, step, step * 2, chartData.length - 1]
    return indices.map(idx => {
      const item = chartData[idx]
      if (!item) return null
      // Convert YYYY-MM-DD to compact chart labels.
      const parts = item.date.split('-')
      const label = range > 365 ? `${parts[1]}/${parts[0].slice(2)}` : `${parts[2]}/${parts[1]}`
      return {
        label,
        x: paddingLeft + (idx / (chartData.length - 1)) * chartWidth
      }
    }).filter(Boolean) as { label: string; x: number }[]
  }, [chartData, chartWidth, range])

  const coverageLabel = useMemo(() => {
    if (!historyMeta.coverageStart || !historyMeta.coverageEnd) return ''
    const formatDate = (date: string) => {
      const parts = date.split('-')
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return `${formatDate(historyMeta.coverageStart)} - ${formatDate(historyMeta.coverageEnd)}`
  }, [historyMeta.coverageStart, historyMeta.coverageEnd])

  return (
    <section className="gold-tracker-container" ref={chartContainerRef}>
      {/* Header and Controls */}
      <div className="tracker-header">
        <div className="tracker-title">
          <Info size={18} className="info-icon" />
          <h3>Biểu đồ vàng nhẫn trong nước</h3>
          <span className="source-tag">Nguồn: {historyMeta.source || 'Vang.Today'}</span>
          {coverageLabel && <span className="source-tag muted">Dữ liệu: {coverageLabel}</span>}
        </div>
        
        <div className="tracker-controls">
          <div className="brand-select">
            {brands.map(b => (
              <button
                key={b.code}
                className={`tab-button ${selectedBrand === b.code ? 'active' : ''}`}
                onClick={() => setSelectedBrand(b.code)}
                type="button"
              >
                {b.name}
              </button>
            ))}
          </div>

          <div className="time-select">
            {TIME_RANGES.map(t => (
              <button
                key={t}
                className={`range-button ${range === t ? 'active' : ''}`}
                onClick={() => setRange(t)}
                type="button"
              >
                {formatRangeLabel(t)}
              </button>
            ))}
          </div>

          <button className="refresh-button" onClick={() => { loadCurrent(); loadHistory(); }} title="Làm mới dữ liệu" type="button">
            <RefreshCw size={14} className={loadingCurrent || loadingHistory ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Grid: Latest Price Cards and Chart */}
      <div className="gold-body-grid">
        {/* Left Side: Realtime Price Widgets */}
        <div className="price-widget-column">
          <div className="brand-price-card highlighted">
            <div className="card-brand-info">
              <strong>Vàng Nhẫn SJC (Trơn)</strong>
              <small>Mã giao dịch: SJ9999</small>
            </div>
            
            <div className="buy-sell-grid">
              <div className="price-block buy">
                <span>Mua vào</span>
                <strong>{formatVnd(currentPrices.SJ9999?.buy || 0)}</strong>
                {renderChange(currentPrices.SJ9999?.change_buy)}
              </div>
              <div className="price-block sell">
                <span>Bán ra</span>
                <strong>{formatVnd(currentPrices.SJ9999?.sell || 0)}</strong>
                {renderChange(currentPrices.SJ9999?.change_sell)}
              </div>
            </div>
            <div className="spread-row">
              <span>Chênh lệch (Spread):</span>
              <strong>
                {formatVnd((currentPrices.SJ9999?.sell || 0) - (currentPrices.SJ9999?.buy || 0))}
              </strong>
            </div>
          </div>

          <div className="other-brands-list">
            <h4>Giá Nhẫn Thương Hiệu Khác</h4>
            
            <div className="mini-brand-row">
              <div>
                <strong>Nhẫn PNJ 24K</strong>
                <small>Nhẫn tròn trơn PNJ</small>
              </div>
              <div className="mini-prices">
                <span>M: {formatShortVnd(currentPrices.PQHN24NTT?.buy || 0)}</span>
                <span>B: {formatShortVnd(currentPrices.PQHN24NTT?.sell || 0)}</span>
              </div>
            </div>

            <div className="mini-brand-row">
              <div>
                <strong>Bảo Tín Minh Châu</strong>
                <small>Rồng Thăng Long 99.99</small>
              </div>
              <div className="mini-prices">
                <span>M: {formatShortVnd(currentPrices.BT9999NTT?.buy || 0)}</span>
                <span>B: {formatShortVnd(currentPrices.BT9999NTT?.sell || 0)}</span>
              </div>
            </div>

            <div className="mini-brand-row">
              <div>
                <strong>Vàng SJC 9999 (Miếng)</strong>
                <small>Để so sánh premium</small>
              </div>
              <div className="mini-prices">
                <span>M: {formatShortVnd(currentPrices.SJL1L10?.buy || 0)}</span>
                <span>B: {formatShortVnd(currentPrices.SJL1L10?.sell || 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Historical Line Chart */}
        <div className="chart-panel gold-chart-panel">
          {loadingHistory ? (
            <div className="chart-loading-state">
              <Loader2 size={32} className="spin" />
              <span>Đang tải dữ liệu lịch sử...</span>
            </div>
          ) : chartData.length === 0 ? (
            <div className="chart-empty-state">
              <span>Không có dữ liệu lịch sử giá vàng trong khoảng thời gian này.</span>
            </div>
          ) : (
            <div className="svg-wrapper" style={{ position: 'relative' }}>
              <svg
                viewBox={`0 0 ${viewWidth} ${viewHeight}`}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="interactive-svg-chart"
              >
                {/* Defs for gradients */}
                <defs>
                  <linearGradient id="buyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="sellGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-Axis Horizontal Grid Lines & Price Labels */}
                {scales.yGrid.map((val, idx) => {
                  const y = paddingTop + chartHeight - ((val - scales.min) / (scales.max - scales.min)) * chartHeight
                  return (
                    <g key={idx} className="grid-line-group">
                      <text
                        x={paddingLeft - 10}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="#64748b"
                        fontWeight="600"
                      >
                        {formatShortVnd(val)}
                      </text>
                    </g>
                  )
                })}

                {/* Filled Areas under paths */}
                <path d={svgPaths.sellArea} fill="url(#sellGrad)" />
                <path d={svgPaths.buyArea} fill="url(#buyGrad)" />

                {/* Line Paths */}
                <path
                  d={svgPaths.sellPath}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={svgPaths.buyPath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* X-Axis Date Labels */}
                {xLabels.map((item, idx) => (
                  <text
                    key={idx}
                    x={item.x}
                    y={viewHeight - 15}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#64748b"
                    fontWeight="600"
                  >
                    {item.label}
                  </text>
                ))}

                {/* Interactive cursor line and points */}
                {hoveredPointIndex !== null && activePoint && activeCoord && (
                  <g className="cursor-indicator-group">
                    {/* Vertical dashed line */}
                    <line
                      x1={activeCoord.x}
                      y1={paddingTop}
                      x2={activeCoord.x}
                      y2={paddingTop + chartHeight}
                      stroke="#94a3b8"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />

                    {/* Point on Sell Line */}
                    <circle
                      cx={activeCoord.x}
                      cy={activeCoord.sellY}
                      r="6"
                      fill="#ffffff"
                      stroke="#f59e0b"
                      strokeWidth="3"
                    />

                    {/* Point on Buy Line */}
                    <circle
                      cx={activeCoord.x}
                      cy={activeCoord.buyY}
                      r="6"
                      fill="#ffffff"
                      stroke="#10b981"
                      strokeWidth="3"
                    />
                  </g>
                )}
              </svg>

              {/* Floating Tooltip Card */}
              {hoveredPointIndex !== null && activePoint && (
                <div
                  className="chart-tooltip-box"
                  style={{
                    position: 'absolute',
                    left: `${(tooltipPos.x / viewWidth) * 100}%`,
                    top: `${(tooltipPos.y / viewHeight) * 100}%`,
                    pointerEvents: 'none',
                    zIndex: 10
                  }}
                >
                  <div className="tooltip-date">
                    <Calendar size={12} />
                    <span>{activePoint.date.split('-').reverse().join('/')}</span>
                  </div>
                  <div className="tooltip-metrics">
                    <div className="metric sell">
                      <span className="dot" style={{ backgroundColor: '#f59e0b' }} />
                      <span className="label">Bán ra:</span>
                      <strong className="value">{formatShortVnd(activePoint.sell)}</strong>
                    </div>
                    <div className="metric buy">
                      <span className="dot" style={{ backgroundColor: '#10b981' }} />
                      <span className="label">Mua vào:</span>
                      <strong className="value">{formatShortVnd(activePoint.buy)}</strong>
                    </div>
                    <div className="tooltip-divider" />
                    <div className="metric spread">
                      <span className="label">Chênh lệch:</span>
                      <strong className="value">{formatShortVnd(activePoint.sell - activePoint.buy)}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chart Legend */}
          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-line buy" />
              <span>Giá mua vào (Khách bán cho tiệm)</span>
            </div>
            <div className="legend-item">
              <span className="legend-line sell" />
              <span>Giá bán ra (Tiệm bán cho khách)</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
