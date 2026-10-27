import type { MyHanhGoldPrices } from '../../../shared/my-hanh-gold'

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
  source?: 'live' | 'fallback'
  livePriceCodes?: string[]
  timestamp: number
  time: string
  date: string
  prices: Record<string, GoldPriceDetail>
  myHanh?: MyHanhGoldPrices
}

export function suggestedMyHanhPricePerChi(response: MyHanhGoldPrices | null, tradeType: 'buy' | 'sell'): number {
  if (!response?.success || response.stale) return 0
  const quote = response.products.find(product => product.code === 'MH9999' && product.metal === 'gold')
  const price = tradeType === 'buy' ? quote?.sellPerChi : quote?.buyPerChi
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? Math.round(price) : 0
}

export function suggestedGoldPricePerChi(
  response: GoldPricesResponse | null,
  quoteCode: string,
  tradeType: 'buy' | 'sell'
): number {
  if (response?.source !== 'live' || !response.livePriceCodes?.includes(quoteCode)) return 0
  if (quoteCode === 'MH9999' && (!response.myHanh?.success || response.myHanh.stale)) return 0

  const quote = response.prices[quoteCode]
  const listedPricePerLuong = tradeType === 'buy' ? quote?.sell : quote?.buy
  return typeof listedPricePerLuong === 'number' && Number.isFinite(listedPricePerLuong) && listedPricePerLuong > 0
    ? Math.round(listedPricePerLuong / 10)
    : 0
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
  note?: string
}

const BASE_URL = 'https://www.vang.today/api'

export async function fetchMyHanhPrices(): Promise<MyHanhGoldPrices> {
  try {
    if (!window.api?.investment?.myHanhGold) throw new Error('Preload chưa hỗ trợ nguồn Mỹ Hạnh.')
    return await window.api.investment.myHanhGold()
  } catch {
    return {
      success: false, products: [], source: 'Ước tính theo nhẫn PNJ Hà Nội',
      sourceUrl: 'https://www.vang.today/', unit: 'VND/chi',
      stale: true, error: 'Chưa lấy được giá Mỹ Hạnh. Vui lòng thử lại hoặc khởi động lại ứng dụng.'
    }
  }
}

async function fetchBrandedPrices(): Promise<GoldPricesResponse> {
  try {
    const res = await fetch(`${BASE_URL}/prices`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data?.success || !data.prices || typeof data.prices !== 'object') throw new Error('Invalid gold prices')
    const prices: Record<string, GoldPriceDetail> = {}
    for (const [code, raw] of Object.entries(data.prices)) {
      const price = raw as GoldPriceDetail
      if (typeof price.name !== 'string' || !Number.isFinite(price.buy) || !Number.isFinite(price.sell) ||
          price.buy <= 0 || price.sell < price.buy || price.currency !== 'VND') continue
      prices[code] = price
    }
    return { ...data, prices, source: 'live', livePriceCodes: Object.keys(prices) }
  } catch {
    return { success: false, source: 'fallback', livePriceCodes: [], timestamp: 0, time: '', date: '', prices: {} }
  }
}

export async function fetchCurrentGoldPrices(): Promise<GoldPricesResponse> {
  const [branded, myHanh] = await Promise.all([fetchBrandedPrices(), fetchMyHanhPrices()])
  const mh = myHanh.products.find(product => product.code === 'MH9999')
  const hasMyHanhQuote = myHanh.success && !myHanh.stale && !!mh
  return {
    ...branded,
    success: branded.success || hasMyHanhQuote,
    source: branded.success || hasMyHanhQuote ? 'live' : 'fallback',
    myHanh,
    livePriceCodes: [...(branded.livePriceCodes || []), ...(hasMyHanhQuote ? ['MH9999'] : [])],
    // Keep this API's legacy per-lượng contract. Only convert at the explicit boundary.
    prices: {
      ...branded.prices,
      ...(hasMyHanhQuote ? { MH9999: { name: mh.name, buy: mh.buyPerChi * 10, sell: mh.sellPerChi * 10, currency: 'VND' } } : {})
    }
  }
}

export async function fetchGoldHistory(type = 'SJ9999', days = 30): Promise<GoldHistoryResponse> {
  if (type.startsWith('MH')) {
    try {
      const data = await window.api.investment.myHanhGoldHistory()
      const cutoff = new Date(Date.now() + 7 * 3600000 - (days - 1) * 86400000).toISOString().slice(0, 10)
      const history = data.points.filter(point => point.code === type && point.date >= cutoff).map(point => ({
        date: point.date,
        prices: { [type]: { name: type, buy: point.buyPerChi * 10, sell: point.sellPerChi * 10 } }
      })).sort((a, b) => b.date.localeCompare(a.date))
      return { success: data.success, days, type, history, source: 'Ước tính theo nhẫn PNJ Hà Nội',
        coverageStart: history.at(-1)?.date, coverageEnd: history[0]?.date,
        note: `${data.providerState === 'available' ? 'Ước tính từ giá nhẫn PNJ Hà Nội, hiệu chỉnh theo giá bán thực tế tại tiệm.' : data.providerState === 'error' ? 'Chưa tải được giá nhẫn PNJ; hiển thị các mốc đã lưu trên máy.' : 'Nguồn chưa có dữ liệu quá khứ; hiển thị các mốc thực tế ghi nhận trên máy.'}${history.length === 1 ? ' Hiện có 1 mốc; đường giá sẽ nối khi có thêm ngày mới.' : ''}${!data.storageAvailable ? ' Không lưu được lịch sử trên máy.' : ''}` }
    } catch {
      return { success: false, days, type, history: [], source: 'Ước tính theo nhẫn PNJ Hà Nội', note: 'Chưa tải được lịch sử Mỹ Hạnh. Vui lòng thử lại hoặc khởi động lại ứng dụng.' }
    }
  }
  try {
    const res = await fetch(`${BASE_URL}/prices?type=${encodeURIComponent(type)}&days=${days}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data?.success || !Array.isArray(data.history)) throw new Error('Invalid history')
    const history: HistoricalPricePoint[] = data.history.filter((item: HistoricalPricePoint) =>
      /^\d{4}-\d{2}-\d{2}$/.test(item?.date) && Number.isFinite(item?.prices?.[type]?.buy) &&
      item.prices[type].buy > 0 && Number.isFinite(item.prices[type].sell) && item.prices[type].sell >= item.prices[type].buy
    ).sort((a: HistoricalPricePoint, b: HistoricalPricePoint) => b.date.localeCompare(a.date))
    return {
      success: true, days, type, history, source: 'Vang.Today',
      coverageStart: history.at(-1)?.date, coverageEnd: history[0]?.date
    }
  } catch {
    return { success: false, days, type, history: [], source: 'Vang.Today' }
  }
}
