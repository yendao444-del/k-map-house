export type SecurityQuote = { priceVnd: number; quotedAt: string; source: string }

// Order forms must never use the chart helpers' simulated fallback prices.
export async function fetchSecurityQuote(symbol: string, signal?: AbortSignal): Promise<SecurityQuote> {
  const now = Math.floor(Date.now() / 1000)
  const response = await fetch(`https://histdatafeed.vps.com.vn/tradingview/history?symbol=${encodeURIComponent(symbol.trim().toUpperCase())}&resolution=D&from=${now - 14 * 86400}&to=${now}`, { signal })
  if (!response.ok) throw new Error('Không tải được giá từ VPS.')
  const data = await response.json()
  if (data.s !== 'ok' || !Array.isArray(data.t) || !Array.isArray(data.c)) throw new Error('Chưa có giá/NAV công bố cho mã này.')
  const rows = data.t.map((time: number, index: number) => ({ time, price: data.c[index] }))
    .filter((row: { time: number; price: number }) => Number.isFinite(row.time) && Number.isFinite(row.price) && row.price > 0 && row.time <= now)
    .sort((a: { time: number }, b: { time: number }) => b.time - a.time)
  const latest = rows[0]
  if (!latest || now - latest.time > 7 * 86400) throw new Error('Giá công bố đã quá cũ. Vui lòng nhập giá thực tế.')
  return { priceVnd: latest.price * 1000, quotedAt: new Date(latest.time * 1000).toISOString(), source: 'VPS · giá đóng cửa gần nhất' }
}
