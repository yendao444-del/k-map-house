export type GoldPriceDetail = {
  name: string
  buy: number
  sell: number
  change_buy?: number
  change_sell?: number
  currency: string
}

export type GoldPricesResponse = {
  success: boolean
  timestamp: number
  time: string
  date: string
  prices: Record<string, GoldPriceDetail>
}

export type HistoricalPricePoint = {
  date: string
  prices: Record<string, {
    name: string
    buy: number
    sell: number
    day_change_buy?: number
    day_change_sell?: number
  }>
}

export type GoldHistoryResponse = {
  success: boolean
  days: number
  type: string
  history: HistoricalPricePoint[]
  source?: string
  coverageStart?: string
  coverageEnd?: string
}

const BASE_URL = 'https://www.vang.today/api'

// Fallback current prices in case API is offline
export const FALLBACK_GOLD_PRICES: Record<string, GoldPriceDetail> = {
  SJ9999: { name: 'Vàng nhẫn SJC', buy: 138600000, sell: 143600000, currency: 'VND', change_buy: -500000, change_sell: -500000 },
  SJL1L10: { name: 'Vàng SJC 9999', buy: 144500000, sell: 148500000, currency: 'VND', change_buy: -500000, change_sell: -500000 },
  PQHN24NTT: { name: 'Vàng nhẫn PNJ', buy: 138500000, sell: 143000000, currency: 'VND', change_buy: -400000, change_sell: -400000 },
  BT9999NTT: { name: 'Bảo Tín 9999', buy: 138600000, sell: 143600000, currency: 'VND', change_buy: -500000, change_sell: -500000 },
  VKIENG: { name: 'Vàng kiềng', buy: 138600000, sell: 143600000, currency: 'VND', change_buy: -500000, change_sell: -500000 },
  XAUUSD: { name: 'Vàng thế giới', buy: 4308.7, sell: 0, currency: 'USD' }
}

function normalizeGoldPrices(prices: Record<string, GoldPriceDetail>): Record<string, GoldPriceDetail> {
  const merged = { ...FALLBACK_GOLD_PRICES, ...prices }
  const ringPrice = merged.SJ9999 || merged.PQHN24NTT || merged.BT9999NTT

  if (ringPrice) {
    merged.VKIENG = {
      ...ringPrice,
      name: 'Vàng kiềng'
    }
  }

  return merged
}

const LONG_TERM_SJC_REFERENCE: Array<{ date: string; buy: number; sell: number }> = [
  { date: '2023-06-01', buy: 66500000, sell: 67100000 },
  { date: '2023-07-01', buy: 66350000, sell: 66950000 },
  { date: '2023-08-01', buy: 66700000, sell: 67300000 },
  { date: '2023-09-01', buy: 67550000, sell: 68250000 },
  { date: '2023-10-01', buy: 68150000, sell: 68850000 },
  { date: '2023-11-01', buy: 69900000, sell: 70600000 },
  { date: '2023-12-01', buy: 72400000, sell: 73600000 },
  { date: '2024-01-01', buy: 73000000, sell: 76000000 },
  { date: '2024-02-01', buy: 75700000, sell: 78000000 },
  { date: '2024-03-01', buy: 77600000, sell: 79600000 },
  { date: '2024-04-01', buy: 78500000, sell: 81000000 },
  { date: '2024-05-01', buy: 82400000, sell: 84600000 },
  { date: '2024-06-01', buy: 81000000, sell: 83000000 },
  { date: '2024-07-01', buy: 74980000, sell: 76980000 },
  { date: '2024-08-01', buy: 77800000, sell: 79800000 },
  { date: '2024-09-01', buy: 79000000, sell: 81000000 },
  { date: '2024-10-01', buy: 82000000, sell: 84000000 },
  { date: '2024-11-01', buy: 88000000, sell: 90000000 },
  { date: '2024-12-01', buy: 83300000, sell: 85800000 },
  { date: '2025-01-01', buy: 82800000, sell: 85300000 },
  { date: '2025-04-01', buy: 94700000, sell: 97700000 },
  { date: '2025-09-07', buy: 118600000, sell: 120600000 },
]

function toHistoryPoint(type: string, point: { date: string; buy: number; sell: number }): HistoricalPricePoint {
  const fallbackPrice = FALLBACK_GOLD_PRICES[type] || FALLBACK_GOLD_PRICES.SJ9999

  return {
    date: point.date,
    prices: {
      [type]: {
        name: fallbackPrice.name,
        buy: point.buy,
        sell: point.sell,
        day_change_buy: 0,
        day_change_sell: 0
      }
    }
  }
}

function getCoverage(history: HistoricalPricePoint[]) {
  if (history.length === 0) return { coverageStart: undefined, coverageEnd: undefined, coverageDays: 0 }
  const dates = history.map(item => item.date).sort()
  const start = dates[0]
  const end = dates[dates.length - 1]
  const coverageDays = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1

  return { coverageStart: start, coverageEnd: end, coverageDays }
}

function withLongTermReference(type: string, days: number, history: HistoricalPricePoint[]): GoldHistoryResponse {
  const { coverageStart, coverageEnd, coverageDays } = getCoverage(history)
  if (days <= 365 || coverageDays >= days * 0.75) {
    return { success: true, days, type, history, source: 'Vang.Today', coverageStart, coverageEnd }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const firstLiveDate = coverageStart || new Date().toISOString().split('T')[0]
  const liveDates = new Set(history.map(item => item.date))
  const referenceHistory = LONG_TERM_SJC_REFERENCE
    .filter(point => point.date >= cutoff.toISOString().split('T')[0] && point.date < firstLiveDate && !liveDates.has(point.date))
    .map(point => toHistoryPoint(type, point))

  const mergedHistory = [...history, ...referenceHistory].sort((a, b) => b.date.localeCompare(a.date))
  const mergedCoverage = getCoverage(mergedHistory)

  return {
    success: true,
    days,
    type,
    history: mergedHistory,
    source: 'Vang.Today + dữ liệu lịch sử tham chiếu',
    coverageStart: mergedCoverage.coverageStart,
    coverageEnd: mergedCoverage.coverageEnd
  }
}

// Generates fake history for demo fallback
function generateFallbackHistory(days: number, type = 'SJ9999'): HistoricalPricePoint[] {
  const history: HistoricalPricePoint[] = []
  const today = new Date()
  const fallbackPrice = FALLBACK_GOLD_PRICES[type] || FALLBACK_GOLD_PRICES.SJ9999
  const baseBuy = fallbackPrice.buy
  const baseSell = fallbackPrice.sell
  
  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    
    // Simulate some price walk
    const change = (Math.sin(i * 0.1) * 2000000) + (Math.cos(i * 0.05) * 1500000)
    
    history.push({
      date: dateStr,
      prices: {
        [type]: {
          name: fallbackPrice.name,
          buy: Math.round(baseBuy + change),
          sell: Math.round(baseSell + change),
          day_change_buy: 100000 * (Math.sin(i) > 0 ? 1 : -1),
          day_change_sell: 100000 * (Math.sin(i) > 0 ? 1 : -1)
        }
      }
    })
  }
  return history
}

export async function fetchCurrentGoldPrices(): Promise<GoldPricesResponse> {
  try {
    const res = await fetch(`${BASE_URL}/prices`)
    if (!res.ok) throw new Error(`HTTP error ${res.status}`)
    const data = await res.json()
    if (data && data.success) {
      return {
        ...data,
        prices: normalizeGoldPrices(data.prices || {})
      }
    }
    throw new Error('API reported unsuccessful response')
  } catch (error) {
    console.warn('Failed to fetch current gold prices, using fallback data:', error)
    return {
      success: true,
      timestamp: Math.floor(Date.now() / 1000),
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toISOString().split('T')[0],
      prices: normalizeGoldPrices({})
    }
  }
}

export async function fetchGoldHistory(type = 'SJ9999', days = 30): Promise<GoldHistoryResponse> {
  try {
    const res = await fetch(`${BASE_URL}/prices?type=${type}&days=${days}`)
    if (!res.ok) throw new Error(`HTTP error ${res.status}`)
    const data = await res.json()
    if (data && data.success) {
      return withLongTermReference(type, days, data.history || [])
    }
    throw new Error('API reported unsuccessful response')
  } catch (error) {
    console.warn(`Failed to fetch history for ${type} over ${days} days, using fallback data:`, error)
    const fallbackHistory = generateFallbackHistory(days, type)
    return {
      success: true,
      days,
      type,
      history: fallbackHistory,
      source: 'Fallback demo',
      coverageStart: fallbackHistory[fallbackHistory.length - 1]?.date,
      coverageEnd: fallbackHistory[0]?.date
    }
  }
}
