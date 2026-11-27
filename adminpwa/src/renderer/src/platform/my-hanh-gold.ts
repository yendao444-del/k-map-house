import type { MyHanhGoldHistory, MyHanhGoldPrices, MyHanhHistoryPoint } from '../../../shared/my-hanh-gold'

// Browser port of Electron's src/main/my-hanh-gold.ts (keep the two in sync).
// Mỹ Hạnh is estimated from PNJ Hà Nội 24K rings plus a shop-confirmed offset;
// recorded quotes live in localStorage instead of a userData JSON file.
const ENDPOINT = 'https://www.vang.today/api/prices'
const BENCHMARK = 'PQHN24NTT'
const HISTORY_DAYS = 400
const MAX_AGE_MS = 36 * 60 * 60 * 1000
const CACHE_MS = 5 * 60 * 1000
const STORAGE_KEY = 'dby-my-hanh-history-v1'
const MAX_POINTS = 2000
const metadata = { source: 'Ước tính theo nhẫn PNJ Hà Nội', sourceUrl: 'https://www.vang.today/', unit: 'VND/chi' } as const

// Must match MY_HANH_ANCHORS in the Electron main process.
const MY_HANH_ANCHORS: Array<{ date: string; sellPerChi: number }> = [
  { date: '2026-10-26', sellPerChi: 13_020_000 }
]

type BenchmarkDay = { date: string; buyPerChi: number; sellPerChi: number }
type Benchmark = { quotedAt: string; buyPerChi: number; sellPerChi: number; days: BenchmarkDay[] }

const localIso = (time: number) => new Date(time + 7 * 3600000).toISOString().slice(0, 16)

function validPoint(point: MyHanhHistoryPoint, now = Date.now()): boolean {
  if (!point || point.code !== 'MH9999' || typeof point.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)) return false
  const time = Date.parse(`${point.date}T00:00:00+07:00`)
  return Number.isFinite(time) && time <= now && Number.isSafeInteger(point.buyPerChi) && point.buyPerChi > 0 &&
    Number.isSafeInteger(point.sellPerChi) && point.sellPerChi >= point.buyPerChi && point.sellPerChi <= 1_000_000_000
}

function perChi(raw: unknown): { buyPerChi: number; sellPerChi: number } {
  const price = raw as { buy?: unknown; sell?: unknown; currency?: unknown } | undefined
  const buy = Number(price?.buy), sell = Number(price?.sell)
  if (!Number.isSafeInteger(buy) || !Number.isSafeInteger(sell) || buy <= 0 || sell < buy || sell > 10_000_000_000 ||
    (price?.currency !== undefined && price.currency !== 'VND')) throw new Error('Giá nhẫn PNJ không hợp lệ.')
  return { buyPerChi: Math.round(buy / 10), sellPerChi: Math.round(sell / 10) }
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Nguồn giá nhẫn trả về HTTP ${response.status}.`)
  return response.json()
}

let cached: { at: number; data: Benchmark } | undefined
let pending: Promise<Benchmark> | undefined
async function loadBenchmark(): Promise<Benchmark> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data
  if (pending) return pending
  pending = (async () => {
    const [current, history] = await Promise.all([getJson(ENDPOINT), getJson(`${ENDPOINT}?type=${BENCHMARK}&days=${HISTORY_DAYS}`)])
    const now = Date.now()
    const head = current as { success?: boolean; timestamp?: unknown; prices?: Record<string, unknown> }
    const time = Number(head?.timestamp) * 1000
    if (head?.success !== true || !Number.isFinite(time) || time <= 0 || time > now + 5 * 60000) throw new Error('Nguồn giá nhẫn không trả về thời gian hợp lệ.')
    const body = history as { success?: boolean; history?: unknown }
    if (body?.success !== true || !Array.isArray(body.history) || body.history.length > 5000) throw new Error('Invalid benchmark history')
    const days = new Map<string, BenchmarkDay>()
    for (const item of body.history as Array<{ date?: unknown; prices?: Record<string, unknown> }>) {
      try {
        const day = { date: String(item?.date), ...perChi(item?.prices?.[BENCHMARK]) }
        if (validPoint({ ...day, code: 'MH9999' }, now)) days.set(day.date, day)
      } catch { /* Skip malformed days; never interpolate them. */ }
    }
    const data = { quotedAt: `${localIso(time)}:00+07:00`, ...perChi(head.prices?.[BENCHMARK]), days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) }
    cached = { at: Date.now(), data }
    return data
  })()
  try { return await pending } finally { pending = undefined }
}

function estimate(benchmark: Benchmark, now = Date.now()): { prices: MyHanhGoldPrices; points: MyHanhHistoryPoint[] } {
  const offsets = MY_HANH_ANCHORS.flatMap(anchor => {
    const base = benchmark.days.filter(day => day.date <= anchor.date).at(-1)
    return base ? [{ date: anchor.date, offset: anchor.sellPerChi - base.sellPerChi }] : []
  }).sort((a, b) => a.date.localeCompare(b.date))
  const at = (date: string, buy: number, sell: number) => {
    const offset = (offsets.filter(item => item.date <= date).at(-1) || offsets[0])?.offset
    return offset === undefined || buy + offset <= 0 ? undefined : { buyPerChi: buy + offset, sellPerChi: sell + offset }
  }
  const points = benchmark.days.flatMap(day => {
    const price = at(day.date, day.buyPerChi, day.sellPerChi)
    return price ? [{ date: day.date, code: 'MH9999', ...price }] : []
  })
  const current = at(benchmark.quotedAt.slice(0, 10), benchmark.buyPerChi, benchmark.sellPerChi)
  if (!current) throw new Error('Chưa hiệu chỉnh được giá Mỹ Hạnh.')
  return { points, prices: {
    ...metadata, success: true, quotedAt: benchmark.quotedAt, fetchedAt: new Date(now).toISOString(),
    stale: now - Date.parse(benchmark.quotedAt) > MAX_AGE_MS,
    products: [{ code: 'MH9999', name: 'Vàng MH 9999', metal: 'gold', ...current }]
  } }
}

function readStored(): { points: MyHanhHistoryPoint[]; available: boolean } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const points = raw ? JSON.parse(raw) : []
    return { points: Array.isArray(points) ? points.filter(point => validPoint(point)) : [], available: true }
  } catch { return { points: [], available: false } }
}

function record(data: MyHanhGoldPrices): void {
  if (!data.success || data.stale || !data.quotedAt) return
  const merged = new Map(readStored().points.map(point => [point.date, point]))
  for (const product of data.products) merged.set(data.quotedAt.slice(0, 10), {
    date: data.quotedAt.slice(0, 10), quotedAt: data.quotedAt, code: product.code, buyPerChi: product.buyPerChi, sellPerChi: product.sellPerChi
  })
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...merged.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_POINTS)))
  } catch { /* storage full or blocked: history just is not kept */ }
}

export async function fetchMyHanhGoldPrices(): Promise<MyHanhGoldPrices> {
  try {
    const { prices } = estimate(await loadBenchmark())
    record(prices)
    return prices
  } catch {
    // Never return a cached/fake quote as a new Mỹ Hạnh quote after failure.
    return { ...metadata, success: false, products: [], stale: true, error: 'Chưa lấy được giá nhẫn PNJ để ước tính giá Mỹ Hạnh. Vui lòng thử lại.' }
  }
}

export async function fetchMyHanhGoldHistory(): Promise<MyHanhGoldHistory> {
  await fetchMyHanhGoldPrices()
  const [provider] = await Promise.allSettled([loadBenchmark().then(data => estimate(data).points)])
  const stored = readStored()
  const fromProvider = provider.status === 'fulfilled' ? provider.value : []
  const merged = new Map(fromProvider.map(point => [`${point.code}:${point.date}`, point]))
  for (const point of stored.points) if (!merged.has(`${point.code}:${point.date}`)) merged.set(`${point.code}:${point.date}`, point)
  return {
    success: merged.size > 0 || provider.status === 'fulfilled',
    points: [...merged.values()].sort((a, b) => b.date.localeCompare(a.date)),
    origin: fromProvider.length ? stored.points.length ? 'mixed' : 'provider' : 'recorded',
    providerState: provider.status === 'fulfilled' ? fromProvider.length ? 'available' : 'empty' : 'error',
    storageAvailable: stored.available
  }
}
