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

interface AuthSession {
  id: string
  username: string
  role: UserRole
}

interface AuthAPI {
  ensureAdmin: () => Promise<void>
  login: (
    username: string,
    password: string
  ) => Promise<{ ok: boolean; user?: AppUser; error?: string }>
  logout: () => Promise<{ ok: boolean }>
  session: () => Promise<AuthSession | null>
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
  getCurrentVersion: () => Promise<{ success: boolean; data?: string; error?: string }>
  onAvailable: (callback: (data: UpdateCheckResult) => void) => () => void
  onStatus: (callback: (data: UpdateStatusEvent) => void) => () => void
  onProgress: (callback: (data: UpdateProgressEvent) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      db: DbAPI
      zalo: ZaloAPI
      auth: AuthAPI
      update: UpdateAPI
    }
  }
}

export {}
