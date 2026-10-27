import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  Calendar,
  Loader2,
  RefreshCw,
  Info
} from 'lucide-react'
import {
  fetchMyHanhPrices,
  fetchGoldHistory,
  HistoricalPricePoint
} from '../../lib/goldApi'
import type { MyHanhGoldPrices } from '../../../../shared/my-hanh-gold'
import './gold-myhanh.css'

type TimeRange = 30 | 90 | 365
const TIME_RANGES: TimeRange[] = [30, 90, 365]

function formatRangeLabel(days: TimeRange) {
  if (days === 365) return '1 năm'
  return `${days} ngày`
}

export function GoldTracker({ onPricesChange }: { onPricesChange?: (prices: MyHanhGoldPrices) => void }) {
  const onPricesChangeRef = useRef(onPricesChange)
  onPricesChangeRef.current = onPricesChange
  const [quotes, setQuotes] = useState<Awaited<ReturnType<typeof fetchMyHanhPrices>> | null>(null)
  const myHanh = quotes
  const selectedProduct = 'MH9999'
  const [history, setHistory] = useState<HistoricalPricePoint[]>([])
  const [range, setRange] = useState<TimeRange>(365)
  const [loadingCurrent, setLoadingCurrent] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [historyMeta, setHistoryMeta] = useState<{ source?: string; coverageStart?: string; coverageEnd?: string; note?: string }>({})
  const [historyError, setHistoryError] = useState(false)
  const historyRequest = useRef(0)
  const currentRequest = useRef(0)
  
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartSvgRef = useRef<SVGSVGElement>(null)
  const [chartSize, setChartSize] = useState({ width: 650, height: 210 })

  // Load current prices
  const loadCurrent = async () => {
    setLoadingCurrent(true)
    const request = ++currentRequest.current
    const data = await fetchMyHanhPrices()
    if (request !== currentRequest.current) return
    setQuotes(data)
    onPricesChangeRef.current?.(data)
    setLoadingCurrent(false)
  }

  // Load history
  const loadHistory = useCallback(async () => {
    const request = ++historyRequest.current
    setHistory([])
    setHistoryMeta({})
    setHoveredPointIndex(null)
    setHistoryError(false)
    setLoadingHistory(true)
    const data = await fetchGoldHistory(selectedProduct, range)
    if (request !== historyRequest.current) return
    setHistoryError(!data.success)
    if (data && data.history) {
      // API returns history starting from today backwards, we reverse it to display chronologically (left to right)
      setHistory([...data.history].reverse())
      setHistoryMeta({
        source: data.source,
        coverageStart: data.coverageStart,
        coverageEnd: data.coverageEnd,
        note: data.note
      })
    }
    setLoadingHistory(false)
  }, [selectedProduct, range])

  useEffect(() => {
    loadCurrent()
    return () => { currentRequest.current++; historyRequest.current++ }
  }, [])

  useEffect(() => {
    loadHistory()
    return () => { historyRequest.current++ }
  }, [loadHistory])

  // Accumulate real daily closes while the widget is open; no background scheduler.
  useEffect(() => {
    const timer = window.setInterval(() => { void loadCurrent(); void loadHistory() }, 5 * 60000)
    return () => window.clearInterval(timer)
  }, [loadHistory])

  const formatShortVnd = (value: number) => {
    if (localStorage.getItem('dbyfinance-privacy-mode') === 'true') {
      return '******'
    }
    return `${(value / 1000000).toFixed(1)} tr`
  }

  const chartCode = selectedProduct
  const localProduct = myHanh?.products.find(product => product.code === selectedProduct)
  const buyPerChi = localProduct?.buyPerChi
  const sellPerChi = localProduct?.sellPerChi
  const hasQuote = !!localProduct && Number.isFinite(buyPerChi) && Number.isFinite(sellPerChi)
  const quotedAt = myHanh?.quotedAt
  const updatedLabel = quotedAt && Number.isFinite(Date.parse(quotedAt))
    ? new Date(quotedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Chưa có thời gian niêm yết'
  const numeric = (value: number) => localStorage.getItem('dbyfinance-privacy-mode') === 'true' ? '******' : new Intl.NumberFormat('vi-VN').format(value)

  // Chart Dimensions & Calculations
  const viewWidth = chartSize.width
  const viewHeight = chartSize.height
  const paddingLeft = viewWidth < 450 ? 44 : 80
  const paddingRight = viewWidth < 450 ? 12 : 36
  const paddingTop = 20
  const paddingBottom = 40

  const chartWidth = viewWidth - paddingLeft - paddingRight
  const chartHeight = viewHeight - paddingTop - paddingBottom

  // Extract prices from history to calculate scale
  const chartData = useMemo(() => {
    if (history.length === 0) return []
    return history.map((h, i) => {
      const priceObj = h.prices[chartCode]
      return {
        index: i,
        date: h.date,
        buy: priceObj?.buy || 0,
        sell: priceObj?.sell || 0
      }
    }).filter(d => d.buy > 0 && d.sell > 0)
  }, [history, chartCode])

  // Keep SVG text at product UI sizes instead of shrinking desktop labels on phones.
  useEffect(() => {
    const svg = chartSvgRef.current
    if (!svg) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(220, Math.round(entry.contentRect.width))
      const height = Math.max(150, Math.round(entry.contentRect.height))
      setChartSize(previous => previous.width === width && previous.height === height ? previous : { width, height })
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [loadingHistory, chartData.length])

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
    const gridCount = 5
    const yGrid = Array.from({ length: gridCount }).map((_, idx) => {
      return min + (max - min) * (idx / (gridCount - 1))
    })

    return { min, max, yGrid }
  }, [chartData])

  // Get SVG path for buy & sell
  const svgPaths = useMemo(() => {
    if (chartData.length === 0) return { buyPath: '', sellPath: '', coords: [] }
    
    const getCoords = (d: typeof chartData[0]) => {
      const firstTime = Date.parse(chartData[0].date)
      const span = Date.parse(chartData.at(-1)!.date) - firstTime
      const x = paddingLeft + (span ? (Date.parse(d.date) - firstTime) / span : .5) * chartWidth
      
      const buyY = paddingTop + chartHeight - ((d.buy - scales.min) / (scales.max - scales.min)) * chartHeight
      const sellY = paddingTop + chartHeight - ((d.sell - scales.min) / (scales.max - scales.min)) * chartHeight
      
      return { x, buyY, sellY }
    }

    const coords = chartData.map(getCoords)

    // Create paths
    const buyPath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.buyY}`).join(' ')
    const sellPath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.sellY}`).join(' ')

    return { buyPath, sellPath, coords }
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
    const tooltipX = Math.max(0, Math.min(activeCoord.x + 15, viewWidth - 210))
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
    if (!chartData.length || !svgPaths.coords) return []
    const step = Math.floor(chartData.length / 3)
    const indices = [...new Set([0, step, step * 2, chartData.length - 1])]
    return indices.map(idx => {
      const item = chartData[idx]
      if (!item) return null
      // Convert YYYY-MM-DD to compact chart labels.
      const parts = item.date.split('-')
      const label = chartData.length <= 2 ? `${parts[2]}/${parts[1]}/${parts[0]}` : `${parts[2]}/${parts[1]}`
      return {
        label,
        x: svgPaths.coords![idx].x
      }
    }).filter(Boolean) as { label: string; x: number }[]
  }, [chartData, svgPaths, range])

  const coverageLabel = useMemo(() => {
    if (!historyMeta.coverageStart || !historyMeta.coverageEnd) return ''
    const formatDate = (date: string) => {
      const parts = date.split('-')
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return `${formatDate(historyMeta.coverageStart)} - ${formatDate(historyMeta.coverageEnd)}`
  }, [historyMeta.coverageStart, historyMeta.coverageEnd])

  return (
    <section className="gold-tracker-container gold-myhanh-tracker" ref={chartContainerRef}>
      <div className="gold-body-grid">
        <div className="price-widget-column gold-prices-widget" aria-busy={loadingCurrent}>
          <header className="gold-widget-heading">
            <Info size={24} aria-hidden="true" />
            <h3>Giá vàng Mỹ Hạnh</h3>
            <button className="refresh-button" onClick={() => { void loadCurrent(); void loadHistory() }} disabled={loadingCurrent || loadingHistory} title="Làm mới giá vàng" aria-label="Làm mới giá vàng" type="button">
              <RefreshCw size={16} className={loadingCurrent ? 'spin' : ''} />
            </button>
          </header>
          <section className="gold-focus-card" aria-label="Giá vàng đang chọn">
            <div className="gold-focus-heading">
              <div>
                <h4>{localProduct?.name || 'Vàng MH 9999'} · Mỹ Hạnh Hà Đông</h4>
                <a href="https://www.vang.today/" target="_blank" rel="noreferrer">
                  Nguồn: ước tính theo nhẫn PNJ Hà Nội
                </a>
                <p>Cập nhật: {updatedLabel}</p>
              </div>
              <div className="gold-unit"><small>1 lượng = 10 chỉ</small></div>
            </div>
            {loadingCurrent && !quotes ? <p role="status" className="gold-source-message"><Loader2 size={18} className="spin" />Đang tải giá niêm yết...</p> :
              !hasQuote ? <p role="alert" className="gold-source-message">{myHanh?.error || 'Chưa lấy được giá Mỹ Hạnh.'}</p> : <>
                {myHanh?.stale && <p role="alert" className="gold-source-warning">Giá niêm yết đã quá 36 giờ. Không dùng để tự động gợi ý giá giao dịch.</p>}
                <div className="gold-quote-grid">
                  <div className="gold-quote-tile gold-quote-buy"><span>Tiệm mua vào</span><strong>{numeric(buyPerChi!)} <small>đ/chỉ</small></strong><p>{numeric(buyPerChi! * 10)} đ/lượng</p></div>
                  <div className="gold-quote-tile gold-quote-sell"><span>Tiệm bán ra</span><strong>{numeric(sellPerChi!)} <small>đ/chỉ</small></strong><p>{numeric(sellPerChi! * 10)} đ/lượng</p></div>
                </div>
                <div className="gold-quote-spread"><span>Chênh lệch mua – bán</span><strong>{numeric(sellPerChi! - buyPerChi!)} đ/chỉ</strong></div>
              </>}
          </section>
        </div>

        <div className="chart-panel gold-chart-panel">
          <header className="gold-history-heading">
            <h4>Lịch sử giá · {localProduct?.name || 'Mỹ Hạnh'}</h4>
            <div className="time-select" role="group" aria-label="Khoảng thời gian biểu đồ">
              {TIME_RANGES.map(days => <button key={days} className={`range-button ${range === days ? 'active' : ''}`} aria-pressed={range === days} onClick={() => setRange(days)} type="button">{formatRangeLabel(days)}</button>)}
            </div><small>{historyMeta.source || 'Ước tính theo nhẫn PNJ Hà Nội'} · đ/chỉ{coverageLabel ? ` · ${coverageLabel}` : ''}</small>
          </header>
          {loadingHistory ? (
            <div className="chart-loading-state">
              <Loader2 size={32} className="spin" />
              <span>Đang tải dữ liệu lịch sử...</span>
            </div>
          ) : chartData.length === 0 ? (
            <div className="chart-empty-state">
              <Info size={28} aria-hidden="true" />
              <strong>{historyError ? 'Chưa tải được lịch sử giá' : 'Chưa có mốc giá Mỹ Hạnh'}</strong>
              <span>{historyMeta.note || 'Đang chờ mốc giá thực tế từ nguồn Mỹ Hạnh.'}</span>
            </div>
          ) : (
            <div className="svg-wrapper" style={{ position: 'relative' }}>
              <svg
                ref={chartSvgRef}
                viewBox={`0 0 ${viewWidth} ${viewHeight}`}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="interactive-svg-chart"
                role="img" aria-label={`Biểu đồ giá mua và bán ${chartData.length} ngày, đơn vị đồng mỗi chỉ`}
              >
                {/* Y-Axis Horizontal Grid Lines & Price Labels */}
                {scales.yGrid.map((val, idx) => {
                  const y = paddingTop + chartHeight - ((val - scales.min) / (scales.max - scales.min)) * chartHeight
                  return (
                    <g key={idx} className="grid-line-group">
                      <line x1={paddingLeft} y1={y} x2={viewWidth - paddingRight} y2={y} stroke="var(--investment-border, #26364a)" strokeDasharray="3 4" />
                      <text
                        x={paddingLeft - 10}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="11"
                        fill="#9eb7d2"
                        fontWeight="600"
                      >
                        {formatShortVnd(val / 10)}
                      </text>
                    </g>
                  )
                })}

                <line x1={paddingLeft} y1={paddingTop + chartHeight} x2={viewWidth - paddingRight} y2={paddingTop + chartHeight} stroke="var(--investment-border, #26364a)" />
                {chartData.length === 1 && svgPaths.coords?.map((coord, index) => <g key={index}>
                  <circle cx={coord.x} cy={coord.buyY} r="5" fill="#21d38a" />
                  <circle cx={coord.x} cy={coord.sellY} r="5" fill="#f59e0b" />
                  {viewWidth >= 450 && <>
                    <text x={coord.x + 12} y={coord.buyY + 4} fill="#9decc9" fontSize="12">{numeric(chartData[0].buy / 10)} đ/chỉ</text>
                    <text x={coord.x + 12} y={coord.sellY + 4} fill="#ffcc7f" fontSize="12">{numeric(chartData[0].sell / 10)} đ/chỉ</text>
                  </>}
                </g>)}

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
                  stroke="#21d38a"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {chartData.length > 1 && svgPaths.coords?.filter((_coord, index, points) => index === 0 || index === points.length - 1).map((coord, index) => <g key={index}>
                  <circle cx={coord.x} cy={coord.buyY} r="4" fill="#21d38a" />
                  <circle cx={coord.x} cy={coord.sellY} r="4" fill="#f59e0b" />
                </g>)}

                {/* X-Axis Date Labels */}
                {xLabels.map((item, idx) => (
                  <text
                    key={idx}
                    x={item.x}
                    y={viewHeight - 15}
                    textAnchor={idx === 0 ? 'start' : idx === xLabels.length - 1 ? 'end' : 'middle'}
                    fontSize="10"
                    fill="#9eb7d2"
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
                      stroke="#00ab60"
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
                      <strong className="value">{numeric(activePoint.sell / 10)} đ/chỉ</strong>
                    </div>
                    <div className="metric buy">
                      <span className="dot" style={{ backgroundColor: '#00ab60' }} />
                      <span className="label">Mua vào:</span>
                      <strong className="value">{numeric(activePoint.buy / 10)} đ/chỉ</strong>
                    </div>
                    <div className="tooltip-divider" />
                    <div className="metric spread">
                      <span className="label">Chênh lệch:</span>
                      <strong className="value">{numeric((activePoint.sell - activePoint.buy) / 10)} đ/chỉ</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chart Legend */}
          {chartData.length > 0 && <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-line buy" />
              <span>Tiệm mua vào</span>
            </div>
            <div className="legend-item">
              <span className="legend-line sell" />
              <span>Tiệm bán ra</span>
            </div>
          </div>}
          {chartData.length > 0 && historyMeta.note && <p className="gold-history-note" role="status">{historyMeta.note}</p>}
        </div>
      </div>
    </section>
  )
}

