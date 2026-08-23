type UserRole = 'admin' | 'user'
type UserStatus = 'active' | 'inactive'

interface AppUser {
  id: string
  username: string
  full_name: string
  password_hash?: string
  role: UserRole
  status: UserStatus
  last_login_at?: string
  created_at: string
}

interface DbAPI {
  read: () => Promise<unknown>
  write: (data: unknown) => Promise<boolean>
  getPath: () => Promise<string>
}

type MarketSourceId = 'phongtro123' | 'nhatot' | 'muaban'
type MarketSourceState = 'success' | 'blocked' | 'error' | 'unsupported'

interface MarketListing {
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

interface MarketLocation {
  propertyAddress: string
  ward: string
  district: string
  city: string
}

interface MarketSourceSnapshot {
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

interface MarketCrawlSnapshot {
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

interface MarketDataAPI {
  getSnapshot: (propertyAddress?: string) => Promise<MarketCrawlSnapshot>
  scanMarket: (payload: {
    propertyAddress: string
    maxPages?: number
    sourceIds?: MarketSourceId[]
  }) => Promise<{ ok: boolean; snapshot?: MarketCrawlSnapshot; error?: string }>
  scanPhongTro123: (payload: {
    locationUrl: string
    maxPages?: number
  }) => Promise<{ ok: boolean; snapshot?: MarketCrawlSnapshot; error?: string }>
}

interface ZaloSendPayload {
  phone: string
  html: string
  fileName: string
  message?: string
}

interface ZaloAPI {
  send: (
    payload: ZaloSendPayload
  ) => Promise<{ ok: boolean; error?: string; imagePath?: string; phone?: string }>
}

interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseNotes: string
  publishedAt: string
  downloadUrl: string | null
  downloadSize: number
  artifactType: 'installer' | 'zip' | 'none'
  fileName: string | null
}

interface UpdateStatusEvent {
  status:
    | 'checking'
    | 'available'
    | 'idle'
    | 'downloading'
    | 'extracting'
    | 'installing'
    | 'restarting'
    | 'error'
  message: string
  data?: UpdateCheckResult
}

interface UpdateProgressEvent {
  downloaded: number
  total: number
  percent: number
}

interface UpdateReleaseAsset {
  name: string
  size: number
  browser_download_url: string
}

interface UpdateReleaseHistoryItem {
  tag_name: string
  body?: string
  published_at: string
  assets: UpdateReleaseAsset[]
}

interface UpdateAPI {
  check: () => Promise<{ success: boolean; data?: UpdateCheckResult; error?: string }>
  getHistory: () => Promise<{ success: boolean; data?: UpdateReleaseHistoryItem[]; error?: string }>
  installLatest: () => Promise<{
    success: boolean
    data?: { version: string; latestVersion: string; applied: boolean }
    error?: string
  }>
  getCurrentVersion: () => Promise<{ success: boolean; data?: string; error?: string }>
  onAvailable: (callback: (data: UpdateCheckResult) => void) => () => void
  onStatus: (callback: (data: UpdateStatusEvent) => void) => () => void
  onProgress: (callback: (data: UpdateProgressEvent) => void) => () => void
}

interface InvoiceAPI {
  saveImage: (payload: {
    html: string
    fileName: string
  }) => Promise<{ ok: boolean; error?: string; filePath?: string; canceled?: boolean }>
  saveImageToDownloads: (payload: {
    html: string
    fileName: string
  }) => Promise<{ ok: boolean; error?: string; filePath?: string }>
}

interface TtsAPI {
  synthesizePayment: (
    amount: number
  ) => Promise<{ ok: boolean; audioBase64?: string; error?: string }>
}

declare global {
  interface Window {
    electron: {
      process: {
        versions: NodeJS.ProcessVersions
      }
    }
    api: {
      db: DbAPI
      marketData: MarketDataAPI
      zalo: ZaloAPI
      invoice: InvoiceAPI
      tts: TtsAPI
      update: UpdateAPI
    }
  }
}

export {}
