// Read-only copy of Electron's verified Fmarket NAV rule, adapted for a
// server edge worker. Never substitute seeded chart prices for order quotes.
export type FundNavQuote = { priceVnd: number; quotedAt: string; source: string }
export const funds = new Set(['VFF','SSIBF','VNDBF','VLBF'])
const maxAge = 10*24*60*60*1000
export function parseFmarketNav(html: string, symbol: string, now = Date.now()): FundNavQuote {
  const code = symbol.trim().toUpperCase()
  if (!funds.has(code)) throw new Error('Mã quỹ chưa có nguồn NAV xác thực.')
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || ''
  if (!new RegExp(`\\b${code}\\b`,'i').test(title)) throw new Error(`Fmarket không trả trang quỹ ${code}.`)
  const block = html.match(/<div[^>]*class="[^"]*fund__nav[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]
  const rawPrice = block?.match(/<span[^>]*class="nav"[^>]*>\s*([\d,.]+)\s*VND\s*<\/span>/i)?.[1]
  const date = block?.match(/(\d{2})\/(\d{2})\/(\d{4})/) || null
  if (!rawPrice || !date) throw new Error(`Chưa có NAV công bố cho ${code} trên Fmarket.`)
  const priceVnd = Number(rawPrice.replace(/,/g,''))
  const quotedAt = `${date[3]}-${date[2]}-${date[1]}`
  const publishedAt = new Date(`${quotedAt}T00:00:00+07:00`).getTime()
  const canonicalDate = new Date(publishedAt + 7*60*60*1000)
  if (!Number.isFinite(publishedAt) || canonicalDate.toISOString().slice(0,10) !== quotedAt) throw new Error(`Ngày NAV ${code} không hợp lệ.`)
  if (!Number.isFinite(priceVnd) || priceVnd <= 0 || !Number.isFinite(publishedAt) || now-publishedAt > maxAge || publishedAt-now > 86400000) throw new Error(`NAV ${code} quá cũ hoặc không hợp lệ. Nhập NAV công bố thực tế.`)
  return { priceVnd,quotedAt,source:'Fmarket · NAV công bố gần nhất' }
}
