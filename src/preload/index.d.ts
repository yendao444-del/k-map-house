import { ElectronAPI } from '@electron-toolkit/preload'

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

interface ZaloSendPayload {
  phone: string
  html: string
  fileName: string
  message?: string
}

interface ZaloAPI {
  send: (payload: ZaloSendPayload) => Promise<{ ok: boolean; error?: string; imagePath?: string; phone?: string }>
}

interface BankLookupResponse {
  code: string
  desc?: string
  data?: { accountName?: string }
}

interface BankAPI {
  lookup: (bin: string, accountNumber: string) => Promise<{ ok: boolean; error?: string; data?: BankLookupResponse }>
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
  status: 'checking' | 'available' | 'idle' | 'downloading' | 'extracting' | 'installing' | 'restarting' | 'error'
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
  download: (
    url: string
  ) => Promise<{ success: boolean; data?: { version: string }; error?: string }>
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
  saveImage: (payload: { html: string, fileName: string }) => Promise<{ ok: boolean; error?: string; filePath?: string; canceled?: boolean }>
  saveImageToDownloads: (payload: { html: string, fileName: string }) => Promise<{ ok: boolean; error?: string; filePath?: string }>
}

interface SepayAPI {
  fetchTransactions: (token: string) => Promise<{ ok: boolean, error?: string, data?: unknown }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      db: DbAPI
      zalo: ZaloAPI
      bank: BankAPI
      invoice: InvoiceAPI
      sepay: SepayAPI
      update: UpdateAPI
    }
  }
}

export { }
