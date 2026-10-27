export type BondCandle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type BondTicker = {
  price: number
  changePercent: number
  high: number
  low: number
  volume: number
}

export type BondResolution = '60' | '240' | 'D' | 'W' | 'M'

const BOND_SUGGESTIONS = [
  { symbol: 'VFF', name: 'Quỹ mở Trái phiếu VinaCapital (VFF)' },
  { symbol: 'TCBF', name: 'Quỹ đầu tư Trái phiếu Techcom (TCBF)' },
  { symbol: 'SSIBF', name: 'Quỹ đầu tư Trái phiếu SSI (SSIBF)' },
  { symbol: 'VNDBF', name: 'Quỹ đầu tư Trái phiếu VNDirect (VNDBF)' },
  { symbol: 'VLBF', name: 'Quỹ đầu tư Trái phiếu VCBF (VLBF)' },
]

export function normalizeBondSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\s+/g, '')
}

export function generateBondCandles(symbol: string, resolution: BondResolution = 'D', limit = 300): BondCandle[] {
  const symbolUpper = normalizeBondSymbol(symbol)
  
  // Base price and compounding annual growth rates for popular Vietnamese Bond Funds
  let basePrice = 20000
  let annualGrowth = 0.08 // 8% standard growth rate
  
  if (symbolUpper === 'VFF') {
    basePrice = 26277.7
    annualGrowth = 0.084 // 8.4% growth
  } else if (symbolUpper === 'TCBF') {
    basePrice = 17621.50
    annualGrowth = 0.072 // 7.2% growth
  } else if (symbolUpper === 'SSIBF') {
    basePrice = 15830.40
    annualGrowth = 0.069 // 6.9% growth
  } else if (symbolUpper === 'VNDBF') {
    basePrice = 19280.90
    annualGrowth = 0.075 // 7.5% growth
  } else if (symbolUpper === 'VLBF') {
    basePrice = 21450.20
    annualGrowth = 0.078 // 7.8% growth
  } else {
    // Generate a hash-based baseline for custom bonds
    let hash = 0
    for (let i = 0; i < symbolUpper.length; i++) {
      hash = symbolUpper.charCodeAt(i) + ((hash << 5) - hash)
    }
    basePrice = 10000 + (Math.abs(hash) % 20000)
    annualGrowth = 0.06 + (Math.abs(hash % 40) / 1000) // 6.0% to 10.0%
  }

  const candles: BondCandle[] = []
  const now = Math.floor(Date.now() / 1000)
  
  let secondsPerBar = 86400
  if (resolution === '60') secondsPerBar = 3600
  else if (resolution === '240') secondsPerBar = 14400
  else if (resolution === 'W') secondsPerBar = 86400 * 7
  else if (resolution === 'M') secondsPerBar = 86400 * 30

  const dailyGrowth = Math.pow(1 + annualGrowth, 1 / 365) - 1
  const periodGrowth = dailyGrowth * (secondsPerBar / 86400)

  let currentClose = basePrice
  
  // Seed the random number generator based on symbol to keep charts consistent
  let seed = 0
  for (let i = 0; i < symbolUpper.length; i++) {
    seed += symbolUpper.charCodeAt(i)
  }
  const random = () => {
    const x = Math.sin(seed++) * 10000
    return x - Math.floor(x)
  }

  for (let i = 0; i < limit; i++) {
    const time = now - i * secondsPerBar
    
    // compounding daily rate + small noise
    const noise = (random() * 0.0016 - 0.0006) 
    const periodReturn = periodGrowth + noise
    
    const open = currentClose / (1 + periodReturn)
    const close = currentClose
    
    const maxOC = Math.max(open, close)
    const minOC = Math.min(open, close)
    const high = maxOC * (1 + random() * 0.0002)
    const low = minOC * (1 - random() * 0.0002)
    const volume = Math.floor(10000 + random() * 30000)
    
    candles.push({
      time,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    })
    
    currentClose = open
  }

  return candles.reverse()
}

export async function fetchBondTicker(symbol: string): Promise<BondTicker> {
  const candles = generateBondCandles(symbol, 'D', 5)
  if (candles.length < 2) {
    throw new Error('Không đủ dữ liệu')
  }
  const latest = candles[candles.length - 1]
  const prev = candles[candles.length - 2]
  const changePercent = prev.close > 0 ? ((latest.close - prev.close) / prev.close) * 100 : 0
  
  return {
    price: latest.close,
    changePercent: Number(changePercent.toFixed(2)),
    high: latest.high,
    low: latest.low,
    volume: latest.volume,
  }
}

export async function validateBondSymbol(symbol: string): Promise<boolean> {
  const normalized = normalizeBondSymbol(symbol)
  return normalized.length >= 3
}

export { BOND_SUGGESTIONS }
