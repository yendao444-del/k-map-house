import { useEffect, useMemo, useState } from 'react'
import { ListingThumbnail } from './ListingThumbnail'

type MarketSnapshot = Awaited<ReturnType<Window['api']['marketData']['getSnapshot']>>
type MarketListing = MarketSnapshot['listings'][number]
type MarketSourceId = 'phongtro123' | 'nhatot' | 'muaban'

const SOURCE_IDS: MarketSourceId[] = ['phongtro123', 'nhatot', 'muaban']

const SOURCE_META: Record<
  MarketSourceId,
  { label: string; description: string; icon: string; badge: string; iconClass: string }
> = {
  phongtro123: {
    label: 'Phongtro123',
    description: 'Tin cho thuê phòng trọ theo quận/huyện',
    icon: 'fa-building',
    badge: 'bg-emerald-50 text-emerald-700',
    iconClass: 'bg-emerald-100 text-emerald-700'
  },
  nhatot: {
    label: 'Nhà Tốt',
    description: 'Tin phòng trọ công khai từ Nhà Tốt',
    icon: 'fa-house',
    badge: 'bg-blue-50 text-blue-700',
    iconClass: 'bg-blue-100 text-blue-700'
  },
  muaban: {
    label: 'Mua Bán',
    description: 'Nguồn đối chiếu bổ sung theo khu vực',
    icon: 'fa-tags',
    badge: 'bg-orange-50 text-orange-700',
    iconClass: 'bg-orange-100 text-orange-700'
  }
}

const STATUS_META = {
  success: {
    label: 'Đã lấy dữ liệu',
    badge: 'bg-emerald-100 text-emerald-700',
    icon: 'fa-circle-check'
  },
  blocked: {
    label: 'Nguồn đang chặn',
    badge: 'bg-amber-100 text-amber-700',
    icon: 'fa-shield-halved'
  },
  error: {
    label: 'Không thể kết nối',
    badge: 'bg-rose-100 text-rose-700',
    icon: 'fa-circle-exclamation'
  },
  unsupported: {
    label: 'Chưa hỗ trợ khu vực',
    badge: 'bg-slate-100 text-slate-600',
    icon: 'fa-circle-minus'
  }
} as const

const fmtMoney = (value: number | null) =>
  value === null ? '—' : new Intl.NumberFormat('vi-VN').format(value) + ' đ'

const fmtDateTime = (value: string | null) => {
  if (!value) return 'Chưa tổng hợp dữ liệu'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(parsed)
}

const normalizeAddress = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const roomTypeLabel: Record<MarketListing['roomType'], string> = {
  room: 'Phòng trọ',
  studio: 'Studio',
  'serviced-apartment': 'Căn hộ dịch vụ',
  'shared-room': 'Ở ghép/KTX',
  sleepbox: 'Sleepbox'
}

function SourceBadge({ source }: { source: MarketSourceId }) {
  const meta = SOURCE_META[source] || SOURCE_META.phongtro123
  return (
    <span className={'inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ' + meta.badge}>
      {meta.label}
    </span>
  )
}

export function MarketDataPanel({ propertyAddress }: { propertyAddress: string }) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [maxPages, setMaxPages] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const marketApi = typeof window !== 'undefined' ? window.api?.marketData : undefined
  const address = propertyAddress.trim()

  useEffect(() => {
    let active = true
    setError('')
    setNotice('')

    if (!address) {
      setSnapshot(null)
      setIsLoading(false)
      return () => {
        active = false
      }
    }

    if (!marketApi) {
      setIsLoading(false)
      setError('Hãy mở màn hình này trong ứng dụng AN KHANG HOME để tổng hợp dữ liệu.')
      return () => {
        active = false
      }
    }

    setIsLoading(true)
    marketApi
      .getSnapshot(address)
      .then((data) => {
        if (active) setSnapshot(data)
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
  }, [address, marketApi])

  const snapshotMatchesAddress = useMemo(() => {
    if (!snapshot?.lastRunAt) return true
    const snapshotAddress = snapshot.propertyAddress || snapshot.location?.propertyAddress || ''
    return (
      Boolean(snapshotAddress) && normalizeAddress(snapshotAddress) === normalizeAddress(address)
    )
  }, [address, snapshot])

  const currentSnapshot = snapshotMatchesAddress ? snapshot : null
  const usableListings = useMemo(
    () => currentSnapshot?.listings.filter((listing) => !listing.excludedReason) || [],
    [currentSnapshot]
  )
  const statusBySource = useMemo(
    () =>
      new Map(
        (currentSnapshot?.sourceStatuses || []).map((status) => [status.source, status] as const)
      ),
    [currentSnapshot]
  )

  const runScan = async () => {
    if (!marketApi || isScanning || !address) return
    setError('')
    setNotice('')
    setIsScanning(true)

    try {
      const result = await marketApi.scanMarket({
        propertyAddress: address,
        maxPages,
        sourceIds: SOURCE_IDS
      })
      if (result.snapshot) setSnapshot(result.snapshot)
      if (!result.ok && !result.snapshot)
        throw new Error(result.error || 'Không nhận được dữ liệu từ các nguồn thị trường.')
      if (result.error) setNotice(result.error)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tổng hợp dữ liệu thị trường.')
    } finally {
      setIsScanning(false)
    }
  }

  if (!address) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
          <i className="fa-solid fa-location-dot text-lg" />
        </span>
        <h3 className="mt-3 text-base font-black text-slate-900">Chưa có địa chỉ nhà trọ</h3>
        <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-slate-600">
          Vào <strong>Cài đặt → Thông tin chung</strong>, nhập đầy đủ địa chỉ nhà trọ rồi lưu cấu
          hình. Module sẽ tự lấy địa chỉ đó để tìm dữ liệu cùng khu vực.
        </p>
      </section>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-emerald-700">
              <i className="fa-solid fa-house" />
              Địa chỉ phân tích · lấy từ cấu hình nhà trọ
            </div>
            <p className="mt-2 break-words text-base font-black text-slate-900">{address}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Hệ thống nhận diện quận/huyện từ địa chỉ này rồi tổng hợp, khử trùng lặp và đối chiếu
              tin giữa nhiều nguồn.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-500">Độ sâu quét</span>
              <select
                value={maxPages}
                onChange={(event) => setMaxPages(Number(event.target.value))}
                disabled={isScanning}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 disabled:opacity-60"
              >
                <option value={1}>1 trang / nguồn</option>
                <option value={2}>2 trang / nguồn</option>
                <option value={3}>3 trang / nguồn</option>
              </select>
            </label>
            <button
              type="button"
              onClick={runScan}
              disabled={isScanning || !marketApi}
              className="h-11 rounded-xl bg-[#007A4D] px-5 text-sm font-black text-white transition hover:bg-[#00633F] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <i
                className={
                  'fa-solid ' + (isScanning ? 'fa-spinner fa-spin' : 'fa-arrows-rotate') + ' mr-2'
                }
              />
              {isScanning ? 'Đang tổng hợp…' : 'Tổng hợp dữ liệu'}
            </button>
          </div>
        </div>

        {!snapshotMatchesAddress && snapshot?.lastRunAt && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800">
            <i className="fa-solid fa-triangle-exclamation mr-2" />
            Dữ liệu cũ thuộc địa chỉ khác. Hãy tổng hợp lại để phân tích đúng địa chỉ hiện tại.
          </div>
        )}
        {notice && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800">
            <i className="fa-solid fa-circle-info mr-2" />
            {notice}
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">
            <i className="fa-solid fa-circle-exclamation mr-2" />
            {error}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-black text-slate-900">Trạng thái nguồn dữ liệu</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Mỗi nguồn được xử lý độc lập; nguồn lỗi không làm mất dữ liệu đã lấy từ nguồn khác.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            Lần tổng hợp gần nhất:{' '}
            <strong className="text-slate-700">
              {fmtDateTime(currentSnapshot?.lastRunAt || null)}
            </strong>
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {SOURCE_IDS.map((sourceId) => {
            const meta = SOURCE_META[sourceId]
            const sourceStatus = statusBySource.get(sourceId)
            const statusMeta = sourceStatus ? STATUS_META[sourceStatus.status] : null
            const usable = sourceStatus?.usable ?? 0
            const total = sourceStatus?.total ?? 0

            return (
              <article
                key={sourceId}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' +
                        meta.iconClass
                      }
                    >
                      <i className={'fa-solid ' + meta.icon} />
                    </span>
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-900">{meta.label}</h4>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  {isScanning ? (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                      <i className="fa-solid fa-spinner fa-spin mr-1.5" />
                      Đang kết nối
                    </span>
                  ) : statusMeta ? (
                    <span
                      className={
                        'rounded-full px-2.5 py-1 text-[11px] font-black ' + statusMeta.badge
                      }
                    >
                      <i className={'fa-solid ' + statusMeta.icon + ' mr-1.5'} />
                      {statusMeta.label}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                      Chưa tổng hợp
                    </span>
                  )}
                  <strong className="text-sm text-slate-800">
                    {usable}/{total} tin dùng được
                  </strong>
                </div>

                {sourceStatus?.error && (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
                    {sourceStatus.error}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-sm font-bold text-slate-500">
          <i className="fa-solid fa-spinner fa-spin mr-2" />
          Đang đọc dữ liệu…
        </div>
      ) : currentSnapshot?.lastRunAt ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ['Nguồn có dữ liệu', String(currentSnapshot.stats.sourceCount) + '/3'],
              ['Tin thu thập', currentSnapshot.stats.total],
              ['Tin sử dụng được', currentSnapshot.stats.usable],
              ['Tin đã loại', currentSnapshot.stats.excluded],
              ['Giá trung vị', fmtMoney(currentSnapshot.stats.medianPrice)]
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
              </div>
            ))}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Khu vực nhận diện:{' '}
              <strong className="text-slate-700">
                {currentSnapshot.analysisAddress ||
                  [
                    currentSnapshot.location.ward,
                    currentSnapshot.location.district,
                    currentSnapshot.location.city
                  ]
                    .filter(Boolean)
                    .join(', ') ||
                  address}
              </strong>
            </span>
            <span>
              Khoảng giá hợp lệ:{' '}
              <strong className="text-slate-700">
                {fmtMoney(currentSnapshot.stats.minPrice)} –{' '}
                {fmtMoney(currentSnapshot.stats.maxPrice)}
              </strong>
            </span>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="font-black text-slate-900">Dữ liệu thị trường đã tổng hợp</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Hiển thị {Math.min(usableListings.length, 20)} tin đủ điều kiện, kèm nguồn để kiểm
                  chứng.
                </p>
              </div>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                Đã khử trùng lặp
              </span>
            </div>
            <div className="max-h-[380px] overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Tin đăng</th>
                    <th className="px-3 py-3">Nguồn</th>
                    <th className="px-3 py-3">Khu vực</th>
                    <th className="px-3 py-3 text-right">Diện tích</th>
                    <th className="px-3 py-3 text-right">Giá thuê</th>
                    <th className="px-4 py-3">Phân loại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usableListings.slice(0, 20).map((listing) => (
                    <tr
                      key={listing.source + ':' + listing.sourceId}
                      className="hover:bg-slate-50/70"
                    >
                      <td className="max-w-[360px] px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <ListingThumbnail
                            imageUrl={listing.imageUrl}
                            title={listing.title}
                            href={listing.url}
                          />
                          <div className="min-w-0">
                            <a
                              href={listing.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate font-bold text-slate-800 hover:text-emerald-700"
                              title={listing.title}
                            >
                              {listing.title}
                            </a>
                            <span className="mt-1 block truncate text-xs text-slate-400">
                              Mã tin: {listing.sourceId}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <SourceBadge source={listing.source} />
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {listing.district || listing.city || '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-700">
                        {listing.areaM2 ? String(listing.areaM2) + ' m²' : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-emerald-700">
                        {fmtMoney(listing.priceMonthly)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                          {roomTypeLabel[listing.roomType] || 'Khác'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!usableListings.length && (
                <div className="py-8 text-center text-sm text-slate-500">
                  Chưa có tin nào đủ điều kiện. Kiểm tra trạng thái từng nguồn ở phía trên rồi thử
                  tổng hợp lại.
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
          <i className="fa-solid fa-database text-2xl text-slate-300" />
          <h3 className="mt-3 font-black text-slate-800">Chưa có dữ liệu cho địa chỉ này</h3>
          <p className="mt-1 text-sm text-slate-500">
            Nhấn “Tổng hợp dữ liệu” để lấy và đối chiếu tin từ cả ba nguồn.
          </p>
        </section>
      )}
    </div>
  )
}
