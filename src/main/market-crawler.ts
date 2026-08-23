import { createHash } from 'crypto'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

export const MARKET_SOURCE_IDS = ['phongtro123', 'nhatot', 'muaban'] as const
export type MarketSourceId = (typeof MARKET_SOURCE_IDS)[number]
export type MarketSourceState = 'success' | 'blocked' | 'error' | 'unsupported'

const USER_AGENT = 'AnKhangHomeMarketResearch/2.0 (+local rental price analysis)'
const MAX_PAGES = 3
const REQUEST_TIMEOUT_MS = 20_000

export interface MarketScanRequest {
  propertyAddress: string
  maxPages?: number
  sourceIds?: MarketSourceId[]
}

/** Kept so an older renderer can still scan a hand-entered Phongtro123 URL. */
export interface MarketCrawlRequest {
  locationUrl: string
  maxPages?: number
}

export interface MarketLocation {
  propertyAddress: string
  ward: string
  district: string
  city: string
}

export interface MarketListing {
  source: MarketSourceId
  sourceId: string
  url: string
  title: string
  description: string
  priceMonthly: number
  areaM2: number | null
  pricePerM2: number | null
  address: string
  city: string
  district: string
  imageUrl: string | null
  postedAt: string | null
  crawledAt: string
  roomType: 'room' | 'studio' | 'serviced-apartment' | 'shared-room' | 'sleepbox'
  amenities: string[]
  excludedReason: string | null
}

export interface MarketSourceSnapshot {
  source: MarketSourceId
  label: string
  status: MarketSourceState
  locationUrl: string
  pagesScanned: number
  robotsAllowed: boolean
  listings: MarketListing[]
  total: number
  usable: number
  error?: string
}

export interface MarketCrawlSnapshot {
  source: 'multi' | MarketSourceId
  propertyAddress: string
  analysisAddress: string
  location: MarketLocation
  locationUrl: string
  lastRunAt: string | null
  pagesScanned: number
  robotsAllowed: boolean
  sources: MarketSourceSnapshot[]
  sourceStatuses: MarketSourceSnapshot[]
  listings: MarketListing[]
  stats: {
    total: number
    usable: number
    excluded: number
    sourceCount: number
    medianPrice: number | null
    minPrice: number | null
    maxPrice: number | null
  }
}

export interface MarketCrawlResult {
  ok: boolean
  snapshot?: MarketCrawlSnapshot
  error?: string
}

type JsonRecord = Record<string, unknown>

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}
class RobotsDisallowedError extends Error {}
class RobotsCheckError extends HttpError {}
class UnsupportedLocationError extends Error {}

const LABELS: Record<MarketSourceId, string> = {
  phongtro123: 'Phongtro123',
  nhatot: 'Nhà Tốt',
  muaban: 'Mua Bán'
}

const normalizeSpace = (value: string): string => value.replace(/\s+/g, ' ').trim()
const decodeHtml = (value: string): string =>
  normalizeSpace(
    String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
  )

const redactContactDetails = (value: string): string =>
  decodeHtml(value).replace(/(?:\+?84|0)(?:[\s.-]*\d){8,10}/g, '[đã ẩn]')

const withoutDiacritics = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, (letter) => (letter === 'Đ' ? 'D' : 'd'))
const normalizedKey = (value: string): string =>
  withoutDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const slugify = (value: string): string => normalizedKey(value).replace(/\s+/g, '-')

export const inferMarketLocation = (rawAddress: string): MarketLocation => {
  const propertyAddress = normalizeSpace(rawAddress)
  if (!propertyAddress) throw new Error('Địa chỉ nhà trọ chưa được cấu hình.')
  const parts = propertyAddress.split(',').map(normalizeSpace).filter(Boolean)
  if (parts.length < 2)
    throw new Error('Địa chỉ nhà trọ cần có ít nhất quận/huyện và tỉnh/thành phố.')
  return {
    propertyAddress,
    ward: parts.length >= 3 ? parts[parts.length - 3] : '',
    district: parts[parts.length - 2],
    city: parts[parts.length - 1]
  }
}

const median = (values: number[]): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

const buildStats = (listings: MarketListing[]): MarketCrawlSnapshot['stats'] => {
  const usable = listings.filter((item) => !item.excludedReason)
  const prices = usable.map((item) => item.priceMonthly).filter((price) => price > 0)
  return {
    total: listings.length,
    usable: usable.length,
    excluded: listings.length - usable.length,
    sourceCount: new Set(usable.map((item) => item.source)).size,
    medianPrice: median(prices),
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null
  }
}

const detectRoomType = (text: string): MarketListing['roomType'] => {
  const normalized = text.toLowerCase()
  if (/sleep\s*box|hộp ngủ|giường tầng/.test(normalized)) return 'sleepbox'
  if (/ở ghép|ký túc xá|\bktx\b/.test(normalized)) return 'shared-room'
  if (/căn hộ dịch vụ|serviced apartment/.test(normalized)) return 'serviced-apartment'
  if (/studio|minihouse|mini house/.test(normalized)) return 'studio'
  return 'room'
}

const detectAmenities = (text: string): string[] => {
  const normalized = text.toLowerCase()
  const dictionary: Array<[RegExp, string]> = [
    [/máy lạnh|điều hòa/, 'Máy lạnh'],
    [/thang máy/, 'Thang máy'],
    [/gác|gác lửng/, 'Gác'],
    [/ban công|bancol/, 'Ban công'],
    [/máy giặt/, 'Máy giặt'],
    [/nội thất đầy đủ|full nội thất|full nt/, 'Đầy đủ nội thất'],
    [/wc riêng|toilet riêng|vệ sinh riêng|khép kín/, 'WC riêng'],
    [/bếp|kệ bếp/, 'Bếp'],
    [/camera/, 'Camera'],
    [/pccc|phòng cháy/, 'PCCC'],
    [/giữ xe|để xe|hầm xe/, 'Chỗ để xe'],
    [/cửa sổ/, 'Cửa sổ']
  ]
  return dictionary.filter(([pattern]) => pattern.test(normalized)).map(([, label]) => label)
}

const excludedReason = (
  listing: Pick<MarketListing, 'priceMonthly' | 'areaM2' | 'roomType'>
): string | null => {
  if (listing.roomType === 'sleepbox' || listing.roomType === 'shared-room')
    return 'Không phải giá thuê nguyên phòng'
  if (
    !Number.isFinite(listing.priceMonthly) ||
    listing.priceMonthly < 500_000 ||
    listing.priceMonthly > 50_000_000
  )
    return 'Giá nằm ngoài ngưỡng kiểm tra'
  if (listing.areaM2 !== null && (listing.areaM2 < 6 || listing.areaM2 > 200))
    return 'Diện tích nằm ngoài ngưỡng kiểm tra'
  return null
}

const parsePrice = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  const raw = decodeHtml(String(value || '')).toLowerCase()
  const numeric = Number(
    raw
      .replace(/[^\d.,]/g, '')
      .replace(/\.(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.')
  )
  if (!Number.isFinite(numeric)) return 0
  if (/tỷ/.test(raw)) return Math.round(numeric * 1_000_000_000)
  if (/triệu|tr\/tháng|tr\/th/.test(raw)) return Math.round(numeric * 1_000_000)
  if (/nghìn|ngàn|k(?:\W|$)/.test(raw)) return Math.round(numeric * 1_000)
  return Math.round(numeric)
}

const parseArea = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  const match = String(value || '')
    .replace(',', '.')
    .match(/(\d+(?:\.\d+)?)\s*(?:m2|m²|m<sup>2)/i)
  const area = match ? Number(match[1]) : Number(value)
  return Number.isFinite(area) && area > 0 ? area : null
}

const parseDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null
  const raw = typeof value === 'number' && value < 10_000_000_000 ? value * 1_000 : value
  const date = new Date(raw as string | number)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const IMAGE_OBJECT_KEY_PRIORITY = [
  'image',
  'images',
  'imageurl',
  'image_url',
  'imageurls',
  'image_urls',
  'webpimage',
  'webp_image',
  'contenturl',
  'content_url',
  'thumbnailurl',
  'thumbnail_url',
  'thumbnail',
  'thumb',
  'src',
  'url'
]

const toHttpsImageUrl = (rawValue: string, baseUrl?: string): string | null => {
  let candidate = rawValue
    .trim()
    .replace(/\\u002f/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
  const cssUrl = candidate.match(/^url\(\s*(['"]?)(.*?)\1\s*\)$/i)
  if (cssUrl) candidate = cssUrl[2]
  candidate = candidate.replace(/^['"]|['"]$/g, '').trim()
  if (!candidate || /\s/.test(candidate)) return null
  if (candidate.startsWith('//')) candidate = 'https:' + candidate

  try {
    const url = baseUrl ? new URL(candidate, baseUrl) : new URL(candidate)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Finds the first HTTPS image in the heterogeneous values returned by listing providers.
 * Providers may return a URL, srcset-like text, an array, or an ImageObject-shaped record.
 */
export const extractMarketImageUrl = (value: unknown, baseUrl?: string): string | null => {
  const visited = new WeakSet<object>()

  const visit = (candidate: unknown): string | null => {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (!trimmed) return null

      if (
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
      ) {
        try {
          const nested = visit(JSON.parse(trimmed))
          if (nested) return nested
        } catch {
          // Continue with the raw string when a provider returns JSON-like text.
        }
      }

      const direct = toHttpsImageUrl(trimmed, baseUrl)
      if (direct) return direct

      const embeddedUrls = trimmed.match(/(?:https:)?\/\/[^\s'"<>\\),]+/gi) || []
      for (const embeddedUrl of embeddedUrls) {
        const normalized = toHttpsImageUrl(embeddedUrl, baseUrl)
        if (normalized) return normalized
      }
      return null
    }

    if (!candidate || typeof candidate !== 'object') return null
    if (visited.has(candidate)) return null
    visited.add(candidate)

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const imageUrl = visit(item)
        if (imageUrl) return imageUrl
      }
      return null
    }

    const entries = Object.entries(candidate as JsonRecord)
    const handled = new Set<string>()
    for (const priorityKey of IMAGE_OBJECT_KEY_PRIORITY) {
      const entry = entries.find(([key]) => key.toLowerCase() === priorityKey)
      if (!entry) continue
      handled.add(entry[0])
      const imageUrl = visit(entry[1])
      if (imageUrl) return imageUrl
    }

    for (const [key, nestedValue] of entries) {
      if (handled.has(key)) continue
      const imageUrl = visit(nestedValue)
      if (imageUrl) return imageUrl
    }
    return null
  }

  return visit(value)
}

const makeListing = (
  source: MarketSourceId,
  input: {
    sourceId: string
    url: string
    title: string
    description: string
    priceMonthly: number
    areaM2: number | null
    address: string
    city: string
    district: string
    imageUrl: string | null
    postedAt: string | null
    crawledAt: string
    roomTypeText?: string
  }
): MarketListing => {
  const roomType = detectRoomType(
    input.title + ' ' + input.description + ' ' + (input.roomTypeText || '')
  )
  const listing: MarketListing = {
    source,
    sourceId: input.sourceId,
    url: input.url,
    title: redactContactDetails(input.title),
    description: redactContactDetails(input.description),
    priceMonthly: Math.round(input.priceMonthly),
    areaM2: input.areaM2,
    pricePerM2:
      input.areaM2 && input.priceMonthly ? Math.round(input.priceMonthly / input.areaM2) : null,
    address: decodeHtml(input.address),
    city: decodeHtml(input.city),
    district: decodeHtml(input.district),
    imageUrl: input.imageUrl,
    postedAt: input.postedAt,
    crawledAt: input.crawledAt,
    roomType,
    amenities: detectAmenities(input.title + ' ' + input.description),
    excludedReason: null
  }
  listing.excludedReason = excludedReason(listing)
  return listing
}

const fetchResponse = async (url: URL, accept: string): Promise<Response> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      redirect: 'follow',
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }
}

const fetchText = async (url: URL): Promise<string> => {
  const response = await fetchResponse(url, 'text/html,application/xhtml+xml')
  if (!response.ok)
    throw new HttpError('Nguồn dữ liệu trả về HTTP ' + response.status + '.', response.status)
  return response.text()
}

const fetchJson = async (url: URL): Promise<unknown> => {
  const response = await fetchResponse(url, 'application/json')
  if (!response.ok)
    throw new HttpError('Nguồn dữ liệu trả về HTTP ' + response.status + '.', response.status)
  return response.json()
}

const robotsRegex = (rule: string): RegExp => {
  const end = rule.endsWith('$')
  const body = end ? rule.slice(0, -1) : rule
  const escaped = body.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')
  return new RegExp('^' + escaped + (end ? '$' : ''))
}

const isRobotsAllowed = async (target: URL): Promise<boolean> => {
  let response: Response
  try {
    response = await fetchResponse(new URL('/robots.txt', target.origin), 'text/plain')
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'lỗi kết nối'
    throw new RobotsCheckError('Không thể kiểm tra robots.txt: ' + detail, 0)
  }
  if (response.status === 404 || response.status === 410) return true
  if (!response.ok)
    throw new RobotsCheckError(
      'Không đọc được robots.txt (HTTP ' + response.status + ').',
      response.status
    )
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = []
  let current: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | undefined
  for (const rawLine of (await response.text()).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    const separator = line.indexOf(':')
    if (!line || separator < 0) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()
    if (key === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
    } else if (current && value && (key === 'allow' || key === 'disallow')) {
      current.rules.push({ allow: key === 'allow', path: value })
    }
  }
  const token = USER_AGENT.split('/')[0].toLowerCase()
  const matching = groups.filter((group) =>
    group.agents.some((agent) => agent === '*' || token.includes(agent))
  )
  const specific = matching.filter((group) => !group.agents.includes('*'))
  const rules = (specific.length ? specific : matching).flatMap((group) => group.rules)
  const path = target.pathname + target.search
  const match = rules
    .filter((rule) => robotsRegex(rule.path).test(path))
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0]
  return match ? match.allow : true
}

const assertRobotsAllowed = async (url: URL): Promise<void> => {
  if (!(await isRobotsAllowed(url)))
    throw new RobotsDisallowedError('Nguồn dữ liệu không cho phép bot truy cập đường dẫn này.')
}

const parseJsonLd = (html: string): JsonRecord[] => {
  const output: JsonRecord[] = []
  const add = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(add)
    if (!value || typeof value !== 'object') return
    const object = value as JsonRecord
    if (Array.isArray(object['@graph'])) object['@graph'].forEach(add)
    output.push(object)
  }
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(pattern)) {
    try {
      add(JSON.parse(match[1]))
    } catch {
      // A malformed JSON-LD block must not discard valid blocks from the same page.
    }
  }
  return output
}

const parsePostedAtNear = (html: string): string | null => {
  const match = html.match(/(?:aria-label|title)=["'][^"']*?(\d{1,2})\/(\d{1,2})\/(\d{4})/i)
  if (!match) return null
  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  return new Date(match[3] + '-' + month + '-' + day + 'T00:00:00+07:00').toISOString()
}

export const parsePhongTro123Page = (
  html: string,
  crawledAt = new Date().toISOString()
): MarketListing[] =>
  parseJsonLd(html).flatMap((data): MarketListing[] => {
    const type = String(data['@type'] || '').toLowerCase()
    const url = String(data.url || '')
    const title = String(data.name || data.headline || '')
    if (!url || !title || !/(hostel|lodging|product|residence)/.test(type)) return []
    const index = html.indexOf(url)
    const chunk = index >= 0 ? html.slice(index, index + 8_000) : ''
    const addressData =
      data.address && typeof data.address === 'object' ? (data.address as JsonRecord) : {}
    const address = String(addressData.streetAddress || '')
    const district =
      address
        .split(',')
        .map((part) => part.trim())
        .find((part) => /^(quận|huyện|thành phố|thị xã)\s/i.test(part)) || ''
    const offer = data.offers && typeof data.offers === 'object' ? (data.offers as JsonRecord) : {}
    return [
      makeListing('phongtro123', {
        sourceId: url.match(/-pr(\d+)\.html/i)?.[1] || url,
        url,
        title,
        description: String(data.description || ''),
        priceMonthly: parsePrice(data.priceRange || offer.price),
        areaM2: parseArea(chunk.match(/\d+(?:[.,]\d+)?\s*m<sup>2<\/sup>/i)?.[0] || ''),
        address,
        city: String(addressData.addressLocality || ''),
        district,
        imageUrl: extractMarketImageUrl(
          [data.image, data.images, data.thumbnailUrl, data.thumbnail, data.primaryImageOfPage],
          'https://phongtro123.com'
        ),
        postedAt: parsePostedAtNear(chunk),
        crawledAt
      })
    ]
  })

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const sourceSuccess = (
  source: MarketSourceId,
  url: URL,
  pagesScanned: number,
  listings: MarketListing[]
): MarketSourceSnapshot => ({
  source,
  label: LABELS[source],
  status: 'success',
  locationUrl: url.toString(),
  pagesScanned,
  robotsAllowed: true,
  listings,
  total: listings.length,
  usable: listings.filter((item) => !item.excludedReason).length
})

const buildPhongTro123Url = (location: MarketLocation): URL => {
  const cityKey = normalizedKey(location.city)
  const districtKey = normalizedKey(location.district)
  const isTuLiem = cityKey === 'ha noi' && /^(nam |bac )?tu liem$/.test(districtKey)
  const hasAdminPrefix = /^(quan|huyen|thi xa|thanh pho)\b/.test(districtKey)
  const districtSlug = isTuLiem
    ? 'huyen-tu-liem'
    : (hasAdminPrefix ? '' : 'quan-') + slugify(location.district)
  return new URL(
    'https://phongtro123.com/tinh-thanh/' + slugify(location.city) + '/' + districtSlug
  )
}

const normalizeLegacyPhongTroUrl = (rawUrl: string): URL => {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new Error('Đường dẫn khu vực không hợp lệ.')
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'phongtro123.com' ||
    !url.pathname.startsWith('/tinh-thanh/')
  )
    throw new Error('Chỉ cho phép đường dẫn khu vực https://phongtro123.com/tinh-thanh/.')
  return url
}

const crawlPhongTroSource = async (
  location: MarketLocation,
  maxPages: number,
  overrideUrl?: URL
): Promise<MarketSourceSnapshot> => {
  const startUrl = overrideUrl || buildPhongTro123Url(location)
  await assertRobotsAllowed(startUrl)
  const crawledAt = new Date().toISOString()
  const byId = new Map<string, MarketListing>()
  let pagesScanned = 0
  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = new URL(startUrl)
    pageUrl.searchParams.set('orderby', 'moi-nhat')
    if (page > 1) pageUrl.searchParams.set('page', String(page))
    const html = await fetchText(pageUrl)
    pagesScanned += 1
    for (const listing of parsePhongTro123Page(html, crawledAt)) byId.set(listing.sourceId, listing)
    if (page < maxPages) await wait(900)
  }
  return sourceSuccess('phongtro123', startUrl, pagesScanned, Array.from(byId.values()))
}

type NhaTotLocationCode = { region: string; area?: string; canonicalArea: string }

const getNhaTotLocationCode = (location: MarketLocation): NhaTotLocationCode => {
  const city = normalizedKey(location.city)
  const district = normalizedKey(location.district).replace(/^(quan|huyen|thi xa|thanh pho)\s+/, '')
  if (city === 'ha noi' && district === 'nam tu liem')
    return { region: '12000', area: '12121', canonicalArea: 'quan-nam-tu-liem-ha-noi' }
  throw new UnsupportedLocationError(
    'Nhà Tốt chưa có mã khu vực tự động cho ' + location.district + ', ' + location.city + '.'
  )
}

const parseNhaTotResponse = (
  raw: unknown,
  location: MarketLocation,
  canonicalArea: string,
  crawledAt: string
): MarketListing[] => {
  const payload = raw && typeof raw === 'object' ? (raw as JsonRecord) : {}
  const ads = Array.isArray(payload.ads) ? payload.ads : []
  return ads.flatMap((value): MarketListing[] => {
    if (!value || typeof value !== 'object') return []
    const ad = value as JsonRecord
    const sourceId = String(ad.list_id || ad.ad_id || '')
    const title = String(ad.subject || '')
    if (!sourceId || !title) return []
    const district = String(ad.area_name || location.district)
    const city = String(ad.region_name || location.city)
    const ward = String(ad.ward_name || '')
    return [
      makeListing('nhatot', {
        sourceId,
        url: 'https://www.nhatot.com/thue-phong-tro-' + canonicalArea + '/' + sourceId + '.htm',
        title,
        description: String(ad.body || ''),
        priceMonthly: parsePrice(ad.price),
        areaM2: parseArea(ad.size),
        address: [ward, district, city].filter(Boolean).join(', '),
        city,
        district,
        imageUrl: extractMarketImageUrl(
          [
            ad.image,
            ad.images,
            ad.image_url,
            ad.image_urls,
            ad.webp_image,
            ad.webp_images,
            ad.thumbnail,
            ad.thumbnail_url,
            ad.image_thumbnails
          ],
          'https://www.nhatot.com'
        ),
        postedAt: parseDate(ad.list_time),
        crawledAt,
        roomTypeText: String(ad.category_name || '')
      })
    ]
  })
}

const crawlNhaTotSource = async (
  location: MarketLocation,
  _maxPages: number
): Promise<MarketSourceSnapshot> => {
  const code = getNhaTotLocationCode(location)
  const url = new URL('https://gateway.chotot.com/v1/public/ad-listing')
  url.searchParams.set('region_v2', code.region)
  if (code.area) url.searchParams.set('area_v2', code.area)
  url.searchParams.set('cg', '1050')
  url.searchParams.set('limit', '20')
  url.searchParams.set('w', '1')
  url.searchParams.set('st', 'u')
  // Offset parameter "o" is deliberately omitted because the public robots policy disallows it.
  await assertRobotsAllowed(url)
  const crawledAt = new Date().toISOString()
  const listings = parseNhaTotResponse(
    await fetchJson(url),
    location,
    code.canonicalArea,
    crawledAt
  )
  return sourceSuccess('nhatot', url, 1, listings)
}

const parseMuaBanPage = (
  html: string,
  location: MarketLocation,
  crawledAt: string
): MarketListing[] =>
  parseJsonLd(html).flatMap((data): MarketListing[] => {
    const type = String(data['@type'] || '').toLowerCase()
    const title = String(data.name || data.headline || '')
    const entity =
      data.mainEntityOfPage && typeof data.mainEntityOfPage === 'object'
        ? (data.mainEntityOfPage as JsonRecord)
        : {}
    const rawUrl = String(data.url || entity['@id'] || '')
    if (!title || !rawUrl || !/(product|offer|realestate|accommodation|residence)/.test(type))
      return []
    const offer = data.offers && typeof data.offers === 'object' ? (data.offers as JsonRecord) : {}
    const addressData =
      data.address && typeof data.address === 'object' ? (data.address as JsonRecord) : {}
    const description = String(data.description || '')
    return [
      makeListing('muaban', {
        sourceId: rawUrl.match(/(?:-|\/)(\d{6,})(?:\.html)?(?:\?|$)/)?.[1] || rawUrl,
        url: rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, 'https://muaban.net').toString(),
        title,
        description,
        priceMonthly: parsePrice(offer.price || data.price),
        areaM2: parseArea(data.floorSize || description),
        address: String(addressData.streetAddress || location.propertyAddress),
        city: String(addressData.addressRegion || location.city),
        district: String(addressData.addressLocality || location.district),
        imageUrl: extractMarketImageUrl(
          [data.image, data.images, data.thumbnailUrl, data.thumbnail, data.primaryImageOfPage],
          'https://muaban.net'
        ),
        postedAt: parseDate(data.datePosted),
        crawledAt
      })
    ]
  })

const buildMuaBanUrl = (location: MarketLocation): URL => {
  const city = normalizedKey(location.city)
  const district = normalizedKey(location.district).replace(/^(quan|huyen|thi xa|thanh pho)\s+/, '')
  if (city === 'ha noi' && district === 'nam tu liem')
    return new URL(
      'https://muaban.net/bat-dong-san/cho-thue-nha-tro-phong-tro-quan-nam-tu-liem-ha-noi'
    )
  throw new UnsupportedLocationError(
    'Mua Bán chưa có đường dẫn khu vực tự động cho ' +
      location.district +
      ', ' +
      location.city +
      '.'
  )
}

const crawlMuaBanSource = async (
  location: MarketLocation,
  maxPages: number
): Promise<MarketSourceSnapshot> => {
  const startUrl = buildMuaBanUrl(location)
  await assertRobotsAllowed(startUrl)
  const crawledAt = new Date().toISOString()
  const byId = new Map<string, MarketListing>()
  let pagesScanned = 0
  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = new URL(startUrl)
    if (page > 1) pageUrl.searchParams.set('page', String(page))
    const html = await fetchText(pageUrl)
    pagesScanned += 1
    for (const listing of parseMuaBanPage(html, location, crawledAt))
      byId.set(listing.sourceId, listing)
    if (page < maxPages) await wait(900)
  }
  return sourceSuccess('muaban', startUrl, pagesScanned, Array.from(byId.values()))
}

const sourceFailure = (source: MarketSourceId, reason: unknown): MarketSourceSnapshot => {
  const message = reason instanceof Error ? reason.message : 'Không thể thu thập nguồn dữ liệu.'
  let status: MarketSourceState = 'error'
  let robotsAllowed = true
  if (reason instanceof RobotsDisallowedError) {
    status = 'blocked'
    robotsAllowed = false
  } else if (reason instanceof RobotsCheckError) {
    status = [401, 403, 429].includes(reason.status) ? 'blocked' : 'error'
    robotsAllowed = false
  } else if (reason instanceof UnsupportedLocationError) {
    status = 'unsupported'
  } else if (reason instanceof HttpError && [401, 403, 429].includes(reason.status)) {
    status = 'blocked'
  }
  return {
    source,
    label: LABELS[source],
    status,
    locationUrl: '',
    pagesScanned: 0,
    robotsAllowed,
    listings: [],
    total: 0,
    usable: 0,
    error: message
  }
}

const tokenSet = (value: string): Set<string> =>
  new Set(
    normalizedKey(value)
      .split(' ')
      .filter((token) => token.length >= 3)
  )

const tokenSimilarity = (left: string, right: string): number => {
  const a = tokenSet(left)
  const b = tokenSet(right)
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const token of a) if (b.has(token)) intersection += 1
  return intersection / new Set([...a, ...b]).size
}

const isProbableDuplicate = (left: MarketListing, right: MarketListing): boolean => {
  if (left.source === right.source) return left.sourceId === right.sourceId
  if (left.imageUrl && right.imageUrl && left.imageUrl === right.imageUrl) return true
  if (Math.abs(left.priceMonthly - right.priceMonthly) > 50_000) return false
  if (left.areaM2 !== null && right.areaM2 !== null && Math.abs(left.areaM2 - right.areaM2) > 1)
    return false
  const leftAddress = normalizedKey(left.address)
  const rightAddress = normalizedKey(right.address)
  if (!leftAddress || !rightAddress || leftAddress.length < 8 || rightAddress.length < 8)
    return false
  const sameAddress =
    leftAddress === rightAddress ||
    leftAddress.includes(rightAddress) ||
    rightAddress.includes(leftAddress)
  return sameAddress && tokenSimilarity(left.title, right.title) >= 0.72
}

const dedupeAcrossSources = (listings: MarketListing[]): MarketListing[] => {
  const unique: MarketListing[] = []
  for (const listing of listings) {
    if (!unique.some((existing) => isProbableDuplicate(existing, listing))) unique.push(listing)
  }
  return unique.sort((left, right) =>
    String(right.postedAt || right.crawledAt).localeCompare(String(left.postedAt || left.crawledAt))
  )
}

const normalizeMaxPages = (raw: unknown): number =>
  Math.min(MAX_PAGES, Math.max(1, Math.floor(Number(raw || 1))))

const normalizeSourceIds = (raw: unknown): MarketSourceId[] => {
  if (!Array.isArray(raw) || !raw.length) return [...MARKET_SOURCE_IDS]
  const selected = new Set(
    raw.filter((value): value is MarketSourceId =>
      MARKET_SOURCE_IDS.includes(value as MarketSourceId)
    )
  )
  if (!selected.size) throw new Error('Chưa chọn nguồn dữ liệu hợp lệ.')
  return MARKET_SOURCE_IDS.filter((source) => selected.has(source))
}

const emptySnapshot = (propertyAddress = ''): MarketCrawlSnapshot => {
  let location: MarketLocation = { propertyAddress, ward: '', district: '', city: '' }
  if (propertyAddress) {
    try {
      location = inferMarketLocation(propertyAddress)
    } catch {
      // Old/incomplete config: retain the address while returning an empty snapshot.
    }
  }
  return {
    source: 'multi',
    propertyAddress,
    analysisAddress: propertyAddress,
    location,
    locationUrl: '',
    lastRunAt: null,
    pagesScanned: 0,
    robotsAllowed: false,
    sources: [],
    sourceStatuses: [],
    listings: [],
    stats: {
      total: 0,
      usable: 0,
      excluded: 0,
      sourceCount: 0,
      medianPrice: null,
      minPrice: null,
      maxPrice: null
    }
  }
}

const addressScopeKey = (propertyAddress: string): string => {
  const normalized = normalizeSpace(propertyAddress).toLowerCase()
  const readable = slugify(normalized).slice(0, 48) || 'unknown-address'
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 12)
  return readable + '-' + digest
}

const getSnapshotPath = (propertyAddress: string): string =>
  join(
    app.getPath('userData'),
    'market-data',
    'snapshots',
    addressScopeKey(propertyAddress) + '.json'
  )
const getLastSnapshotPath = (): string => join(app.getPath('userData'), 'market-data', 'last.json')

const writeJsonAtomically = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true })
  const temporaryPath = path + '.' + process.pid + '.tmp'
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf-8')
  renameSync(temporaryPath, path)
}

const writeSnapshot = (snapshot: MarketCrawlSnapshot): void => {
  const address = snapshot.propertyAddress || snapshot.analysisAddress
  writeJsonAtomically(getSnapshotPath(address), snapshot)
  writeJsonAtomically(getLastSnapshotPath(), snapshot)
}

const readSnapshotFile = (path: string, fallbackAddress = ''): MarketCrawlSnapshot => {
  if (!existsSync(path)) return emptySnapshot(fallbackAddress)
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<MarketCrawlSnapshot>
    const propertyAddress = String(raw.propertyAddress || raw.analysisAddress || fallbackAddress)
    const base = emptySnapshot(propertyAddress)
    const listings = Array.isArray(raw.listings) ? raw.listings : []
    const sources = Array.isArray(raw.sources) ? raw.sources : []
    return {
      ...base,
      ...raw,
      propertyAddress,
      analysisAddress: propertyAddress,
      location: raw.location || base.location,
      sources,
      sourceStatuses: Array.isArray(raw.sourceStatuses) ? raw.sourceStatuses : sources,
      listings,
      stats: buildStats(listings)
    }
  } catch {
    return emptySnapshot(fallbackAddress)
  }
}

export const getMarketSnapshot = (propertyAddress?: string): MarketCrawlSnapshot => {
  const address = normalizeSpace(propertyAddress || '')
  return address
    ? readSnapshotFile(getSnapshotPath(address), address)
    : readSnapshotFile(getLastSnapshotPath())
}

const crawlBySource = (
  source: MarketSourceId,
  location: MarketLocation,
  maxPages: number
): Promise<MarketSourceSnapshot> => {
  if (source === 'phongtro123') return crawlPhongTroSource(location, maxPages)
  if (source === 'nhatot') return crawlNhaTotSource(location, maxPages)
  return crawlMuaBanSource(location, maxPages)
}

export const scanMarket = async (request: MarketScanRequest): Promise<MarketCrawlResult> => {
  try {
    const location = inferMarketLocation(request?.propertyAddress || '')
    const maxPages = normalizeMaxPages(request?.maxPages)
    const sourceIds = normalizeSourceIds(request?.sourceIds)
    const settled = await Promise.allSettled(
      sourceIds.map((source) => crawlBySource(source, location, maxPages))
    )
    const sources = settled.map((result, index) =>
      result.status === 'fulfilled' ? result.value : sourceFailure(sourceIds[index], result.reason)
    )
    const listings = dedupeAcrossSources(sources.flatMap((source) => source.listings))
    const successful = sources.filter((source) => source.status === 'success')
    const snapshot: MarketCrawlSnapshot = {
      source: 'multi',
      propertyAddress: location.propertyAddress,
      analysisAddress: location.propertyAddress,
      location,
      locationUrl: successful[0]?.locationUrl || '',
      lastRunAt: new Date().toISOString(),
      pagesScanned: sources.reduce((sum, source) => sum + source.pagesScanned, 0),
      robotsAllowed: sources.every((source) => source.robotsAllowed),
      sources,
      sourceStatuses: sources,
      listings,
      stats: buildStats(listings)
    }
    writeSnapshot(snapshot)
    if (!successful.length) {
      return {
        ok: false,
        snapshot,
        error: sources
          .map((source) => source.label + ': ' + (source.error || source.status))
          .join(' · ')
      }
    }
    return { ok: true, snapshot }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Không thể thu thập dữ liệu thị trường.'
    }
  }
}

/** Compatibility bridge for the former single-source settings screen. */
export const crawlPhongTro123 = async (request: MarketCrawlRequest): Promise<MarketCrawlResult> => {
  try {
    const locationUrl = normalizeLegacyPhongTroUrl(request.locationUrl)
    const location: MarketLocation = {
      propertyAddress: locationUrl.toString(),
      ward: '',
      district: '',
      city: ''
    }
    const source = await crawlPhongTroSource(
      location,
      normalizeMaxPages(request.maxPages),
      locationUrl
    )
    const listings = dedupeAcrossSources(source.listings)
    const snapshot: MarketCrawlSnapshot = {
      source: 'phongtro123',
      propertyAddress: location.propertyAddress,
      analysisAddress: location.propertyAddress,
      location,
      locationUrl: source.locationUrl,
      lastRunAt: new Date().toISOString(),
      pagesScanned: source.pagesScanned,
      robotsAllowed: source.robotsAllowed,
      sources: [source],
      sourceStatuses: [source],
      listings,
      stats: buildStats(listings)
    }
    writeSnapshot(snapshot)
    return { ok: true, snapshot }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Không thể thu thập dữ liệu Phongtro123.'
    }
  }
}
