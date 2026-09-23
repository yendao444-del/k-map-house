export type CryptoCandle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type CryptoTicker = {
  price: number
  changePercent: number
  high: number
  low: number
  volume: number
}

export type CryptoResolution = '60' | '240' | 'D' | 'W' | 'M'

export const USD_VND_RATE = 25400

const BINANCE_BASE = 'https://api.binance.com/api/v3'
const CACHE_TTL_MS = 5_000 // 5 seconds cache for near-realtime crypto prices
const cache = new Map<string, { timestamp: number; data: unknown }>()

function getCache<T>(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache(key: string, data: unknown) {
  cache.set(key, { timestamp: Date.now(), data })
}

export function normalizeCryptoSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase()
  if (s === 'USDT') return 'USDT'
  if (s.endsWith('USDT')) return s
  return `${s}USDT`
}

const BINANCE_INTERVALS: Record<CryptoResolution, string> = {
  '60': '1h',
  '240': '4h',
  D: '1d',
  W: '1w',
  M: '1M',
}

export async function fetchCryptoTicker(symbol: string): Promise<CryptoTicker> {
  const normalized = normalizeCryptoSymbol(symbol)
  const cacheKey = `ticker:${normalized}`
  const cached = getCache<CryptoTicker>(cacheKey)
  if (cached) return cached

  if (normalized === 'USDT') {
    const usdtTicker: CryptoTicker = {
      price: 1,
      changePercent: 0,
      high: 1,
      low: 1,
      volume: 1000000,
    }
    setCache(cacheKey, usdtTicker)
    return usdtTicker
  }

  const url = `${BINANCE_BASE}/ticker/24hr?symbol=${normalized}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`)
  }

  const data = await response.json()
  const ticker: CryptoTicker = {
    price: parseFloat(data.lastPrice),
    changePercent: parseFloat(data.priceChangePercent),
    high: parseFloat(data.highPrice),
    low: parseFloat(data.lowPrice),
    volume: parseFloat(data.volume),
  }

  setCache(cacheKey, ticker)
  return ticker
}

export async function fetchCryptoCandles(
  symbol: string,
  resolution: CryptoResolution = 'D',
  limit: number = 200
): Promise<CryptoCandle[]> {
  const normalized = normalizeCryptoSymbol(symbol)
  const interval = BINANCE_INTERVALS[resolution] || '1d'
  const cacheKey = `candles:${normalized}:${resolution}:${limit}`
  const cached = getCache<CryptoCandle[]>(cacheKey)
  if (cached) return cached

  if (normalized === 'USDT') {
    // Return dummy stable candles for USDT
    const now = Math.floor(Date.now() / 1000)
    const intervalSeconds = resolution === '60' ? 3600 : resolution === '240' ? 14400 : resolution === 'D' ? 86400 : resolution === 'W' ? 604800 : 2592000
    const candles: CryptoCandle[] = []
    for (let i = limit; i >= 0; i--) {
      candles.push({
        time: now - i * intervalSeconds,
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 1000000,
      })
    }
    setCache(cacheKey, candles)
    return candles
  }

  const url = `${BINANCE_BASE}/klines?symbol=${normalized}&interval=${interval}&limit=${limit}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`)
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error(`Invalid klines payload for ${normalized}`)
  }

  const candles: CryptoCandle[] = data.map((item: any) => ({
    time: Math.floor(item[0] / 1000), // open time in seconds
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4]),
    volume: parseFloat(item[5]),
  }))

  setCache(cacheKey, candles)
  return candles
}
