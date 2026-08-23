import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAllRoomAssets, type Room } from '../lib/db'
import { ListingThumbnail } from './ListingThumbnail'

type PricingListing = {
  source: string
  sourceId: string
  url: string
  title: string
  priceMonthly: number
  areaM2: number | null
  address: string
  city: string
  district: string
  imageUrl: string | null
  postedAt: string | null
  crawledAt: string
  roomType: string
  excludedReason: string | null
}

type NormalizedMarketData = {
  listings: PricingListing[]
  lastRunAt: string | null
  locationLabel: string
}

type PricingResult = {
  candidates: PricingListing[]
  evidence: PricingListing[]
  excludedOutliers: number
  marketLow: number
  marketHigh: number
  marketMedian: number
  recommendedPrice: number
  confidence: number
  sourceCount: number
  isReliable: boolean
  usedAreaFilter: boolean
  expandedAreaFilter: boolean
}

const money = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `${new Intl.NumberFormat('vi-VN').format(Math.round(value))} đ`

const number = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const quantile = (values: number[], position: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * position
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

const median = (values: number[]) => quantile(values, 0.5)

const weightedMedian = (values: number[], weights: number[]) => {
  const pairs = values
    .map((value, index) => ({ value, weight: Math.max(0, weights[index] || 0) }))
    .sort((left, right) => left.value - right.value)
  const totalWeight = pairs.reduce((sum, pair) => sum + pair.weight, 0)
  if (!pairs.length || totalWeight <= 0) return median(values)
  let cumulativeWeight = 0
  for (const pair of pairs) {
    cumulativeWeight += pair.weight
    if (cumulativeWeight >= totalWeight / 2) return pair.value
  }
  return pairs[pairs.length - 1].value
}

const roundPrice = (value: number, step = 50_000) => Math.round(value / step) * step
const floorPrice = (value: number, step = 50_000) => Math.floor(value / step) * step
const ceilPrice = (value: number, step = 50_000) => Math.ceil(value / step) * step
const normalizeAddress = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const sourceName = (source: string) => {
  const key = source.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (key.includes('phongtro123')) return 'Phongtro123'
  if (key.includes('nhatot') || key.includes('chotot')) return 'Nhà Tốt'
  if (key.includes('muaban')) return 'Mua Bán'
  if (key.includes('batdongsan')) return 'Batdongsan.com.vn'
  return source || 'Nguồn thị trường'
}

const sourceTone = (source: string) => {
  const key = source.toLowerCase()
  if (key.includes('phongtro123')) return 'bg-emerald-50 text-emerald-700'
  if (key.includes('nhatot') || key.includes('chotot')) return 'bg-blue-50 text-blue-700'
  if (key.includes('muaban')) return 'bg-amber-50 text-amber-700'
  return 'bg-violet-50 text-violet-700'
}

const getListingArrays = (raw: unknown): unknown[][] => {
  if (!raw || typeof raw !== 'object') return []
  const object = raw as Record<string, unknown>
  if (Array.isArray(object.listings)) return [object.listings]
  const arrays: unknown[][] = []
  for (const key of ['sources', 'snapshots', 'sourceSnapshots']) {
    const value = object[key]
    if (!Array.isArray(value)) continue
    value.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return
      const listings = (entry as Record<string, unknown>).listings
      if (Array.isArray(listings)) arrays.push(listings)
    })
  }
  return arrays
}

const normalizeMarketData = (raw: unknown): NormalizedMarketData => {
  if (!raw || typeof raw !== 'object') return { listings: [], lastRunAt: null, locationLabel: '' }
  const object = raw as Record<string, unknown>
  const seen = new Set<string>()
  const listings: PricingListing[] = []

  getListingArrays(raw)
    .flat()
    .forEach((value) => {
      if (!value || typeof value !== 'object') return
      const listing = value as Record<string, unknown>
      const priceMonthly = number(listing.priceMonthly)
      const source = String(listing.source || 'market')
      const sourceId = String(listing.sourceId || listing.id || listing.url || '')
      const url = String(listing.url || '')
      const uniqueKey = `${source}:${sourceId || url}`
      if (!priceMonthly || seen.has(uniqueKey)) return
      seen.add(uniqueKey)
      const areaValue = number(listing.areaM2)
      listings.push({
        source,
        sourceId: sourceId || uniqueKey,
        url,
        title: String(listing.title || 'Tin cho thuê'),
        priceMonthly,
        areaM2: areaValue > 0 ? areaValue : null,
        address: String(listing.address || ''),
        city: String(listing.city || ''),
        district: String(listing.district || ''),
        imageUrl: listing.imageUrl ? String(listing.imageUrl) : null,
        postedAt: listing.postedAt ? String(listing.postedAt) : null,
        crawledAt: String(listing.crawledAt || object.lastRunAt || ''),
        roomType: String(listing.roomType || 'room'),
        excludedReason: listing.excludedReason ? String(listing.excludedReason) : null
      })
    })

  const address = String(
    object.analysisAddress || object.propertyAddress || object.address || object.locationLabel || ''
  )
  return {
    listings,
    lastRunAt: object.lastRunAt ? String(object.lastRunAt) : null,
    locationLabel: address
  }
}

const filterOutliers = (listings: PricingListing[]) => {
  if (listings.length < 4) return listings
  const prices = listings.map((listing) => listing.priceMonthly)
  const center = median(prices)
  const deviations = prices.map((price) => Math.abs(price - center))
  const mad = median(deviations)
  const q1 = quantile(prices, 0.25)
  const q3 = quantile(prices, 0.75)
  const iqr = q3 - q1

  const madDistance = Math.max(mad * 1.4826 * 3, center * 0.18)
  const madLow = Math.max(0, center - madDistance)
  const madHigh = center + madDistance
  const iqrLow = Math.max(0, q1 - Math.max(iqr * 1.5, center * 0.12))
  const iqrHigh = q3 + Math.max(iqr * 1.5, center * 0.12)

  const filtered = listings.filter(
    (listing) =>
      listing.priceMonthly >= Math.max(madLow, iqrLow) &&
      listing.priceMonthly <= Math.min(madHigh, iqrHigh)
  )
  return filtered.length >= 3 ? filtered : listings
}

const buildPricingResult = (room: Room, listings: PricingListing[]): PricingResult | null => {
  const targetArea = number(room.area)
  if (targetArea <= 0) return null
  const usable = listings.filter(
    (listing) =>
      !listing.excludedReason &&
      listing.areaM2 !== null &&
      listing.priceMonthly >= 300_000 &&
      listing.priceMonthly <= 50_000_000 &&
      !['shared-room', 'sleepbox'].includes(listing.roomType)
  )
  if (!usable.length) return null

  const closeArea = usable.filter(
    (listing) =>
      listing.areaM2 !== null &&
      Math.abs(listing.areaM2 - targetArea) <= Math.max(3, targetArea * 0.2)
  )
  const expandedArea = usable.filter(
    (listing) =>
      listing.areaM2 !== null &&
      Math.abs(listing.areaM2 - targetArea) <= Math.max(5, targetArea * 0.35)
  )
  const candidates = closeArea.length >= 3 ? closeArea : expandedArea
  if (!candidates.length) return null

  const usedAreaFilter = true
  let expandedAreaFilter = false
  if (closeArea.length < 3) expandedAreaFilter = true

  const balancedCandidates = Array.from(
    candidates.reduce((groups, listing) => {
      const group = groups.get(listing.source) || []
      group.push(listing)
      groups.set(listing.source, group)
      return groups
    }, new Map<string, PricingListing[]>())
  ).flatMap(([, sourceListings]) =>
    sourceListings
      .sort((left, right) => {
        return (
          Math.abs((left.areaM2 || targetArea) - targetArea) -
          Math.abs((right.areaM2 || targetArea) - targetArea)
        )
      })
      .slice(0, 10)
  )
  const evidence = filterOutliers(balancedCandidates)
  if (!evidence.length) return null
  const targetPrices = evidence.map((listing) => {
    if (!listing.areaM2) return listing.priceMonthly
    const areaRatio = targetArea / listing.areaM2
    return listing.priceMonthly * Math.pow(areaRatio, 0.55)
  })
  const weights = evidence.map((listing) => {
    if (!listing.areaM2) return 0
    return 1 / (1 + Math.abs(listing.areaM2 - targetArea) / targetArea)
  })
  const weightedPrice = weightedMedian(targetPrices, weights)
  const marketMedian = median(targetPrices)
  const marketLow = floorPrice(quantile(targetPrices, 0.25))
  const marketHigh = Math.max(marketLow, ceilPrice(quantile(targetPrices, 0.75)))
  const recommendedPrice = roundPrice(
    Math.min(marketHigh || weightedPrice, Math.max(marketLow || weightedPrice, weightedPrice))
  )
  const sourceCount = new Set(evidence.map((listing) => listing.source)).size
  const isReliable = evidence.length >= 5 && sourceCount >= 2
  const areaCoverage = 1
  const freshnessTimestamps = evidence
    .map((listing) => new Date(listing.postedAt || listing.crawledAt || 0).getTime() || 0)
    .filter((timestamp) => timestamp > 0)
  const representativeTimestamp = freshnessTimestamps.length ? median(freshnessTimestamps) : 0
  const freshnessDays = representativeTimestamp
    ? (Date.now() - representativeTimestamp) / 86_400_000
    : Number.POSITIVE_INFINITY
  const confidenceRaw =
    Math.min(1, evidence.length / 12) * 45 +
    areaCoverage * 25 +
    Math.min(1, sourceCount / 3) * 20 +
    (freshnessDays <= 7 ? 10 : freshnessDays <= 30 ? 6 : 2)
  const confidence = Math.min(isReliable ? 94 : 59, Math.max(35, Math.round(confidenceRaw)))

  return {
    candidates: balancedCandidates,
    evidence: [...evidence].sort((left, right) => {
      return (
        Math.abs((left.areaM2 || targetArea) - targetArea) -
        Math.abs((right.areaM2 || targetArea) - targetArea)
      )
    }),
    excludedOutliers: balancedCandidates.length - evidence.length,
    marketLow,
    marketHigh,
    marketMedian,
    recommendedPrice,
    confidence,
    sourceCount,
    isReliable,
    usedAreaFilter,
    expandedAreaFilter
  }
}

function EmptyMarketData({
  loading,
  error,
  onNavigateToSources,
  actionLabel = 'Thiết lập nguồn dữ liệu',
  actionIcon = 'fa-database'
}: {
  loading: boolean
  error: string
  onNavigateToSources: () => void
  actionLabel?: string
  actionIcon?: string
}) {
  return (
    <section className="mt-6 flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-xl text-violet-600">
        <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-database'}`} />
      </span>
      <h2 className="mt-4 text-lg font-black text-slate-900">
        {loading ? 'Đang đọc dữ liệu thị trường…' : 'Chưa đủ dữ liệu để đề xuất giá'}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
        {error ||
          'Hãy thu thập dữ liệu từ các nguồn theo địa chỉ nhà trọ. Khi có dữ liệu, hệ thống sẽ tự động chọn các tin tương đồng và đề xuất một mức giá.'}
      </p>
      {!loading && (
        <button
          type="button"
          onClick={onNavigateToSources}
          className="mt-5 rounded-xl bg-[#007A4D] px-5 py-3 text-sm font-black text-white transition hover:bg-[#00633F]"
        >
          <i className={`fa-solid ${actionIcon} mr-2`} /> {actionLabel}
        </button>
      )}
    </section>
  )
}

export function RoomPricingPanel({
  rooms,
  propertyAddress = '',
  onNavigateToSources,
  onNavigateToRooms
}: {
  rooms: Room[]
  propertyAddress?: string
  onNavigateToSources: () => void
  onNavigateToRooms?: () => void
}) {
  const [rawSnapshot, setRawSnapshot] = useState<unknown>(null)
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const {
    data: allRoomAssets = [],
    isLoading: isAssetsLoading,
    error: assetsError
  } = useQuery({
    queryKey: ['allRoomAssets'],
    queryFn: getAllRoomAssets
  })
  const assetCountByRoom = useMemo(
    () =>
      allRoomAssets.reduce((counts, asset) => {
        counts.set(asset.room_id, (counts.get(asset.room_id) || 0) + Number(asset.quantity || 0))
        return counts
      }, new Map<string, number>()),
    [allRoomAssets]
  )
  const eligibleRooms = useMemo(
    () => rooms.filter((room) => number(room.area) > 0 && (assetCountByRoom.get(room.id) || 0) > 0),
    [assetCountByRoom, rooms]
  )
  const roomsWithAreaCount = useMemo(
    () => rooms.filter((room) => number(room.area) > 0).length,
    [rooms]
  )

  useEffect(() => {
    if (!eligibleRooms.some((room) => room.id === selectedRoomId))
      setSelectedRoomId(eligibleRooms[0]?.id || '')
  }, [eligibleRooms, selectedRoomId])

  useEffect(() => {
    let active = true
    const address = propertyAddress.trim()
    setError('')
    setIsLoading(true)
    if (!address) {
      setRawSnapshot(null)
      setIsLoading(false)
      return () => {
        active = false
      }
    }
    const marketApi = typeof window !== 'undefined' ? window.api?.marketData : undefined
    if (!marketApi) {
      setError('Không thể đọc dữ liệu thị trường ngoài ứng dụng AN KHANG HOME.')
      setIsLoading(false)
      return
    }
    marketApi
      .getSnapshot(address)
      .then((snapshot) => {
        if (active) setRawSnapshot(snapshot)
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Không đọc được dữ liệu thị trường.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [propertyAddress])

  const marketData = useMemo(() => normalizeMarketData(rawSnapshot), [rawSnapshot])
  const selectedRoom = eligibleRooms.find((room) => room.id === selectedRoomId)
  const missingPropertyAddress = !propertyAddress.trim()
  const snapshotAddressMismatch = Boolean(
    propertyAddress.trim() &&
    (!marketData.locationLabel.trim() ||
      normalizeAddress(propertyAddress) !== normalizeAddress(marketData.locationLabel))
  )
  const result = useMemo(
    () =>
      selectedRoom && !missingPropertyAddress && !snapshotAddressMismatch
        ? buildPricingResult(selectedRoom, marketData.listings)
        : null,
    [marketData.listings, missingPropertyAddress, selectedRoom, snapshotAddressMismatch]
  )
  const sourceLabels = result
    ? Array.from(new Set(result.evidence.map((listing) => sourceName(listing.source))))
    : []
  const currentRent = number(selectedRoom?.base_rent)
  const rentDifference = result ? result.recommendedPrice - currentRent : 0

  return (
    <div>
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
              <i className="fa-solid fa-tags" />
            </span>
            <div>
              <h1 className="text-[26px] font-black tracking-[-0.04em] text-slate-950">
                Định giá phòng AI
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Chỉ định giá phòng đã có diện tích và tài sản; diện tích là tiêu chí so sánh bắt
                buộc.
              </p>
              {propertyAddress.trim() && (
                <p className="mt-1.5 text-xs font-semibold text-slate-400">
                  <i className="fa-solid fa-location-dot mr-1.5 text-emerald-600" />
                  {propertyAddress}
                </p>
              )}
            </div>
          </div>
          <label className="block w-full lg:w-[330px]">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">
              Phòng đủ điều kiện định giá
            </span>
            <select
              value={selectedRoom?.id || ''}
              onChange={(event) => setSelectedRoomId(event.target.value)}
              disabled={isAssetsLoading || !eligibleRooms.length}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              {!eligibleRooms.length && (
                <option value="">
                  {isAssetsLoading ? 'Đang kiểm tra tài sản…' : 'Chưa có phòng đủ điều kiện'}
                </option>
              )}
              {eligibleRooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} · {room.area} m² · {assetCountByRoom.get(room.id)} tài sản ·{' '}
                  {money(room.base_rent)}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-[11px] font-semibold text-slate-400">
              {eligibleRooms.length}/{rooms.length} phòng có đủ diện tích và tài sản.
            </span>
          </label>
        </div>
      </header>

      {isLoading || isAssetsLoading || !result || !selectedRoom ? (
        <EmptyMarketData
          loading={isLoading || isAssetsLoading}
          error={
            assetsError
              ? 'Không đọc được dữ liệu tài sản phòng. Hãy tải lại màn hình rồi thử lại.'
              : !selectedRoom
                ? !rooms.length
                  ? 'Chưa có phòng để thực hiện định giá.'
                  : !roomsWithAreaCount
                    ? 'Chưa có phòng nào được nhập diện tích. Hãy cập nhật diện tích phòng trước khi định giá.'
                    : 'Phòng có diện tích nhưng chưa được khai báo tài sản. Hãy bổ sung ít nhất một tài sản cho phòng trước khi định giá.'
                : missingPropertyAddress
                  ? 'Chưa có địa chỉ nhà trọ. Hãy cập nhật địa chỉ trong phần Cài đặt trước khi thu thập dữ liệu.'
                  : snapshotAddressMismatch
                    ? 'Dữ liệu hiện tại được thu thập cho địa chỉ khác. Hãy quét lại theo địa chỉ nhà trọ.'
                    : error
          }
          onNavigateToSources={
            !selectedRoom ? onNavigateToRooms || onNavigateToSources : onNavigateToSources
          }
          actionLabel={!selectedRoom ? 'Cập nhật phòng và tài sản' : 'Thiết lập nguồn dữ liệu'}
          actionIcon={!selectedRoom ? 'fa-door-open' : 'fa-database'}
        />
      ) : (
        <div className="mt-6 space-y-5">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold text-slate-500">Giá đang cho thuê</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{money(currentRent)}</p>
              <p className="mt-1 text-xs text-slate-400">{selectedRoom.name}</p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-bold text-blue-700">Khoảng giá thị trường</p>
              <p className="mt-2 text-xl font-black text-slate-950">
                {money(result.marketLow)} – {money(result.marketHigh)}
              </p>
              <p className="mt-1 text-xs text-blue-600">Trung vị {money(result.marketMedian)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold text-emerald-700">
                {result.isReliable ? 'Mức giá đề xuất' : 'Ước tính tạm'}
              </p>
              <p className="mt-2 text-2xl font-black text-[#007A4D]">
                {money(result.recommendedPrice)}
              </p>
              {!result.isReliable && (
                <p className="mt-2 text-[11px] leading-4 text-emerald-700/80">
                  Cần tối thiểu 5 tin từ 2 nguồn để trở thành giá đề xuất.
                </p>
              )}
              <p
                className={`mt-1 text-xs font-bold ${rentDifference > 0 ? 'text-emerald-700' : rentDifference < 0 ? 'text-amber-700' : 'text-slate-500'}`}
              >
                {rentDifference === 0
                  ? 'Nên giữ nguyên giá'
                  : `${rentDifference > 0 ? 'Tăng' : 'Giảm'} ${money(Math.abs(rentDifference))}/tháng`}
              </p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-violet-700">Độ tin cậy</p>
                <span className="text-lg font-black text-violet-700">{result.confidence}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-violet-100">
                <div
                  className="h-full rounded-full bg-violet-600"
                  style={{ width: `${result.confidence}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-violet-600">
                {result.evidence.length} tin · {result.sourceCount} nguồn
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Bằng chứng dùng để định giá</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Chỉ sử dụng tin có diện tích gần {selectedRoom.area} m²
                  {result.expandedAreaFilter
                    ? ' (đã mở rộng biên độ diện tích vì số mẫu còn ít).'
                    : '.'}{' '}
                  {result.excludedOutliers > 0
                    ? `Đã loại ${result.excludedOutliers} giá bất thường bằng MAD và IQR.`
                    : 'Không phát hiện giá bất thường trong tập so sánh.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {sourceLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600"
                  >
                    <i className="fa-solid fa-circle-check mr-1.5 text-emerald-500" /> {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Nguồn / tin đăng</th>
                    <th className="px-3 py-3">Khu vực</th>
                    <th className="px-3 py-3 text-right">Diện tích</th>
                    <th className="px-3 py-3 text-right">Giá đăng</th>
                    <th className="px-5 py-3 text-right">So với giá đề xuất</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.evidence.slice(0, 15).map((listing) => {
                    const difference = listing.priceMonthly - result.recommendedPrice
                    return (
                      <tr
                        key={`${listing.source}:${listing.sourceId}`}
                        className="hover:bg-slate-50/70"
                      >
                        <td className="max-w-[420px] px-5 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <ListingThumbnail
                              imageUrl={listing.imageUrl}
                              title={listing.title}
                              href={listing.url || undefined}
                            />
                            <div className="min-w-0">
                              <span
                                className={`mb-1 inline-flex rounded-full px-2 py-1 text-[10px] font-black ${sourceTone(listing.source)}`}
                              >
                                {sourceName(listing.source)}
                              </span>
                              {listing.url ? (
                                <a
                                  href={listing.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate font-bold text-slate-800 hover:text-emerald-700"
                                  title={listing.title}
                                >
                                  {listing.title}
                                </a>
                              ) : (
                                <span className="block truncate font-bold text-slate-800">
                                  {listing.title}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {listing.district || listing.city || listing.address || '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-slate-700">
                          {listing.areaM2 ? `${listing.areaM2} m²` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-black text-slate-900">
                          {money(listing.priceMonthly)}
                        </td>
                        <td
                          className={`px-5 py-3 text-right text-xs font-black ${Math.abs(difference) < 50_000 ? 'text-slate-500' : difference > 0 ? 'text-blue-700' : 'text-amber-700'}`}
                        >
                          {Math.abs(difference) < 50_000
                            ? 'Tương đương'
                            : `${difference > 0 ? '+' : '−'}${money(Math.abs(difference))}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>
                {result.isReliable ? 'Giá đề xuất' : 'Ước tính tạm'} được làm tròn 50.000 đ và không
                tự động thay đổi giá phòng.
              </span>
              <button
                type="button"
                onClick={onNavigateToSources}
                className="font-black text-[#007A4D] hover:text-[#00633F]"
              >
                Quản lý nguồn dữ liệu <i className="fa-solid fa-arrow-right ml-1" />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
