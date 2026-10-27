export type MarketCandle = {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export type MarketResolution = 'D' | 'W' | 'M'

function seededCandles(symbol: string, resolution: MarketResolution, base: number): MarketCandle[] {
  const points: MarketCandle[] = []
  const step = resolution === 'M' ? 30 : resolution === 'W' ? 7 : 1
  let seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  let close = base
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  const now = Date.now()
  for (let index = 0; index < 120; index += 1) {
    const change = (random() - 0.48) * 0.035
    const open = close
    close = Math.max(base * 0.65, close * (1 + change))
    points.push({
      time: Math.floor((now - (119 - index) * step * 86400000) / 1000),
      open,
      high: Math.max(open, close) * (1 + random() * 0.012),
      low: Math.min(open, close) * (1 - random() * 0.012),
      close
    })
  }
  return points
}

async function fetchStockCandles(symbol: string, resolution: MarketResolution): Promise<MarketCandle[]> {
  const now = Math.floor(Date.now() / 1000)
  const response = await fetch(
    `https://histdatafeed.vps.com.vn/tradingview/history?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${now - 86400 * 365}&to=${now}`
  )
  if (!response.ok) throw new Error(`Market history ${response.status}`)
  const payload = (await response.json()) as { s?: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[] }
  if (payload.s !== 'ok' || !payload.t?.length) throw new Error('No market history')
  return payload.t.map((time, index) => ({
    time,
    open: payload.o?.[index] || 0,
    high: payload.h?.[index] || 0,
    low: payload.l?.[index] || 0,
    close: payload.c?.[index] || 0
  }))
}

async function fetchGoldCandles(): Promise<MarketCandle[]> {
  const response = await fetch('https://www.vang.today/api/prices?type=SJ9999&days=365')
  if (!response.ok) throw new Error(`Gold history ${response.status}`)
  const payload = (await response.json()) as { history?: Array<{ date: string; prices?: Record<string, { buy?: number; sell?: number }> }> }
  const history = payload.history || []
  return history
    .map((point) => {
      const quote = point.prices?.SJ9999
      const close = quote?.sell || 0
      const open = quote?.buy || close
      return { time: Math.floor(new Date(point.date).getTime() / 1000), open, high: Math.max(open, close), low: Math.min(open, close), close }
    })
    .filter((item) => item.close > 0)
    .sort((a, b) => a.time - b.time)
}

export async function loadInvestmentMarket(category: 'gold' | 'stocks' | 'bonds', symbol: string, resolution: MarketResolution): Promise<MarketCandle[]> {
  try {
    if (category === 'gold') return await fetchGoldCandles()
    return await fetchStockCandles(symbol, resolution)
  } catch {
    const fallbackBase = category === 'gold' ? 140000000 : category === 'bonds' ? 18000 : 50000
    return seededCandles(symbol, resolution, fallbackBase)
  }
}
