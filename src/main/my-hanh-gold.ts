import type { MyHanhGoldPrices, MyHanhGoldHistory, MyHanhHistoryPoint } from '../shared/my-hanh-gold'
import { MyHanhHistoryStore, validHistoryPoint } from './my-hanh-history'

// Tuấn Quảng Đông stopped updating Mỹ Hạnh after 19/10/2026 while still stamping the current time,
// so Mỹ Hạnh is estimated from PNJ Hà Nội 24K rings (same 300k spread) plus a shop-confirmed offset.
const ENDPOINT = 'https://www.vang.today/api/prices'
const BENCHMARK = 'PQHN24NTT'
const HISTORY_DAYS = 400
const MAX_AGE_MS = 36 * 60 * 60 * 1000
const CACHE_MS = 5 * 60 * 1000
const metadata = {
  source: 'Ước tính theo nhẫn PNJ Hà Nội',
  sourceUrl: 'https://www.vang.today/',
  unit: 'VND/chi'
} as const

// MH 9999 sell prices confirmed at the shop. Each date uses the latest anchor on or before it.
export const MY_HANH_ANCHORS: Array<{ date: string; sellPerChi: number }> = [
  { date: '2026-10-26', sellPerChi: 13_020_000 }
]

type BenchmarkDay = { date: string; buyPerChi: number; sellPerChi: number }
type Benchmark = { quotedAt: string; buyPerChi: number; sellPerChi: number; days: BenchmarkDay[] }

const localIso = (time: number) => new Date(time + 7 * 3600000).toISOString().slice(0, 16)

function perChi(raw: unknown): { buyPerChi: number; sellPerChi: number } {
  const price = raw as { buy?: unknown; sell?: unknown; currency?: unknown } | undefined
  const buy = Number(price?.buy), sell = Number(price?.sell)
  if (!Number.isSafeInteger(buy) || !Number.isSafeInteger(sell) || buy <= 0 || sell < buy || sell > 10_000_000_000 ||
    (price?.currency !== undefined && price.currency !== 'VND')) throw new Error('Giá nhẫn PNJ không hợp lệ.')
  return { buyPerChi: Math.round(buy / 10), sellPerChi: Math.round(sell / 10) }
}

export function parseBenchmarkCurrent(payload: unknown, now = Date.now()): Omit<Benchmark, 'days'> {
  const data = payload as { success?: boolean; timestamp?: unknown; prices?: Record<string, unknown> }
  const time = Number(data?.timestamp) * 1000
  if (data?.success !== true || !Number.isFinite(time) || time <= 0 || time > now + 5 * 60000) {
    throw new Error('Nguồn giá nhẫn không trả về thời gian hợp lệ.')
  }
  return { quotedAt: `${localIso(time)}:00+07:00`, ...perChi(data.prices?.[BENCHMARK]) }
}

export function parseBenchmarkHistory(payload: unknown, now = Date.now()): BenchmarkDay[] {
  const data = payload as { success?: boolean; history?: unknown }
  if (data?.success !== true || !Array.isArray(data.history) || data.history.length > 5000) throw new Error('Invalid benchmark history')
  const days = new Map<string, BenchmarkDay>()
  for (const item of data.history as Array<{ date?: unknown; prices?: Record<string, unknown> }>) {
    try {
      const day = { date: String(item?.date), ...perChi(item?.prices?.[BENCHMARK]) }
      if (validHistoryPoint({ ...day, code: 'MH9999' }, now)) days.set(day.date, day)
    } catch { /* Skip malformed days; never interpolate them. */ }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// Offset per anchor = shop sell − benchmark sell on that day (or the last benchmark day before it).
function calibrations(days: BenchmarkDay[]): Array<{ date: string; offset: number }> {
  return MY_HANH_ANCHORS.flatMap(anchor => {
    const base = days.filter(day => day.date <= anchor.date).at(-1)
    return base ? [{ date: anchor.date, offset: anchor.sellPerChi - base.sellPerChi }] : []
  }).sort((a, b) => a.date.localeCompare(b.date))
}

function offsetFor(date: string, list: Array<{ date: string; offset: number }>): number | undefined {
  return (list.filter(item => item.date <= date).at(-1) || list[0])?.offset
}

export function estimateMyHanh(benchmark: Benchmark, now = Date.now()): { prices: MyHanhGoldPrices; points: MyHanhHistoryPoint[] } {
  const list = calibrations(benchmark.days)
  const estimate = (date: string, buy: number, sell: number) => {
    const offset = offsetFor(date, list)
    if (offset === undefined || buy + offset <= 0) return undefined
    return { buyPerChi: buy + offset, sellPerChi: sell + offset }
  }
  const points = benchmark.days.flatMap(day => {
    const price = estimate(day.date, day.buyPerChi, day.sellPerChi)
    return price ? [{ date: day.date, code: 'MH9999', ...price }] : []
  })
  const current = estimate(benchmark.quotedAt.slice(0, 10), benchmark.buyPerChi, benchmark.sellPerChi)
  if (!current) throw new Error('Chưa hiệu chỉnh được giá Mỹ Hạnh.')
  return {
    points,
    prices: {
      ...metadata, success: true, quotedAt: benchmark.quotedAt, fetchedAt: new Date(now).toISOString(),
      stale: now - Date.parse(benchmark.quotedAt) > MAX_AGE_MS,
      products: [{ code: 'MH9999', name: 'Vàng MH 9999', metal: 'gold', ...current }]
    }
  }
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' })
  if (!response.ok) throw new Error(`Nguồn giá nhẫn trả về HTTP ${response.status}.`)
  if (Number(response.headers.get('content-length')) > 4_000_000) throw new Error('Dữ liệu giá quá lớn.')
  const body = await response.text()
  if (body.length > 4_000_000) throw new Error('Dữ liệu giá quá lớn.')
  return JSON.parse(body)
}

let cached: { at: number; data: Benchmark } | undefined
let pending: Promise<Benchmark> | undefined
async function loadBenchmark(): Promise<Benchmark> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data
  if (pending) return pending
  pending = (async () => {
    const [current, history] = await Promise.all([
      getJson(ENDPOINT), getJson(`${ENDPOINT}?type=${BENCHMARK}&days=${HISTORY_DAYS}`)
    ])
    const data = { ...parseBenchmarkCurrent(current), days: parseBenchmarkHistory(history) }
    cached = { at: Date.now(), data }
    return data
  })()
  try { return await pending } finally { pending = undefined }
}

const stores = new Map<string, MyHanhHistoryStore>()
function historyStore(path?: string): MyHanhHistoryStore {
  const key = path || ':memory:'
  if (!stores.has(key)) stores.set(key, new MyHanhHistoryStore(path))
  return stores.get(key)!
}
function recordQuote(data: MyHanhGoldPrices, path?: string): MyHanhGoldPrices {
  if (data.success && !data.stale && data.quotedAt) historyStore(path).record(data.products.map(product => ({
    date: data.quotedAt!.slice(0, 10), quotedAt: data.quotedAt,
    code: product.code, buyPerChi: product.buyPerChi, sellPerChi: product.sellPerChi
  })))
  return data
}

export async function fetchMyHanhGoldPrices(historyPath?: string): Promise<MyHanhGoldPrices> {
  try {
    return recordQuote(estimateMyHanh(await loadBenchmark()).prices, historyPath)
  } catch {
    // Do not return a cached/fake quote as a new Mỹ Hạnh quote after failure.
    return { ...metadata, success: false, products: [], stale: true, error: 'Chưa lấy được giá nhẫn PNJ để ước tính giá Mỹ Hạnh. Vui lòng thử lại.' }
  }
}

export async function fetchMyHanhGoldHistory(path?: string): Promise<MyHanhGoldHistory> {
  const store = historyStore(path)
  await fetchMyHanhGoldPrices(path)
  const [provider] = await Promise.allSettled([loadBenchmark().then(data => estimateMyHanh(data).points)])
  const stored = store.read()
  const fromProvider = provider.status === 'fulfilled' ? provider.value : []
  // Estimates cover past days; locally recorded quotes only fill gaps (e.g. while offline).
  const merged = new Map(fromProvider.map(point => [`${point.code}:${point.date}`, point]))
  for (const point of stored) {
    const key = `${point.code}:${point.date}`
    if (!merged.has(key)) merged.set(key, point)
  }
  return {
    success: merged.size > 0 || provider.status === 'fulfilled',
    points: [...merged.values()].sort((a, b) => b.date.localeCompare(a.date)),
    origin: fromProvider.length ? stored.length ? 'mixed' : 'provider' : 'recorded',
    providerState: provider.status === 'fulfilled' ? fromProvider.length ? 'available' : 'empty' : 'error',
    storageAvailable: store.available
  }
}
