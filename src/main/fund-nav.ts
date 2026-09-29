export type FundNavQuote = {
  priceVnd: number
  quotedAt: string
  source: string
}

const FMARKET_FUNDS = new Set(['VFF', 'SSIBF', 'VNDBF', 'VLBF'])
const MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000

export function parseFmarketNav(html: string, symbol: string, now = Date.now()): FundNavQuote {
  const code = symbol.trim().toUpperCase()
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || ''
  if (!new RegExp(`\\b${code}\\b`, 'i').test(title)) {
    throw new Error(`Fmarket không trả trang quỹ ${code}.`)
  }

  const block = html.match(/<div[^>]*class="[^"]*fund__nav[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
  const rawPrice = block?.match(/<span[^>]*class="nav"[^>]*>\s*([\d,.]+)\s*VND\s*<\/span>/i)?.[1]
  const date = block?.match(/(\d{2})\/(\d{2})\/(\d{4})/) || null
  if (!rawPrice || !date) throw new Error(`Chưa có NAV công bố cho ${code} trên Fmarket.`)

  const priceVnd = Number(rawPrice.replace(/,/g, ''))
  const quotedAt = `${date[3]}-${date[2]}-${date[1]}`
  const publishedAt = new Date(`${quotedAt}T00:00:00+07:00`).getTime()
  if (!Number.isFinite(priceVnd) || priceVnd <= 0 || !Number.isFinite(publishedAt)) {
    throw new Error(`NAV ${code} không hợp lệ.`)
  }
  if (now - publishedAt > MAX_AGE_MS || publishedAt - now > 24 * 60 * 60 * 1000) {
    throw new Error(`NAV ${code} đã quá cũ hoặc sai ngày. Vui lòng nhập NAV thực tế.`)
  }
  return { priceVnd, quotedAt, source: 'Fmarket · NAV công bố gần nhất' }
}

const cache = new Map<string, { at: number; quote: FundNavQuote }>()

export async function fetchFundNav(symbol: string): Promise<FundNavQuote> {
  const code = symbol.trim().toUpperCase()
  if (!FMARKET_FUNDS.has(code)) {
    throw new Error(`Chưa có nguồn NAV trực tuyến xác thực cho ${code}. Nhập NAV công bố thực tế.`)
  }
  const cached = cache.get(code)
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.quote

  const response = await fetch(`https://fmarket.vn/quy/${code}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AnKhangHome/1.0)' },
    signal: AbortSignal.timeout(12_000)
  })
  if (!response.ok) throw new Error(`Fmarket chưa trả NAV ${code} (HTTP ${response.status}).`)
  const quote = parseFmarketNav(await response.text(), code)
  cache.set(code, { at: Date.now(), quote })
  return quote
}
