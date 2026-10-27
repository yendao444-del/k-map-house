export const authStorageKey = 'ankhang-management-auth'
const sessionExpiryKey = 'ankhang-management-session-expiry'

// The server enforces the six-hour ceiling. Local persistence only lets a
// verified session survive a browser restart before that server deadline.
export const authStorage = {
  getItem(key: string): string | null {
    const stored = window.localStorage.getItem(key)
    if (stored !== null) return stored
    // Move an older tab-only login into the six-hour session policy on update.
    const legacy = window.sessionStorage.getItem(key)
    if (legacy === null) return null
    window.localStorage.setItem(key, legacy)
    window.sessionStorage.removeItem(key)
    return legacy
  },
  setItem(key: string, value: string): void {
    window.localStorage.setItem(key, value)
    window.sessionStorage.removeItem(key)
  },
  removeItem(key: string): void {
    window.sessionStorage.removeItem(key)
    window.localStorage.removeItem(key)
    if (key === authStorageKey) clearManagementSessionExpiry()
  }
}

export function persistManagementLogin(): void {
  const existing = authStorage.getItem(authStorageKey)
  if (existing) authStorage.setItem(authStorageKey, existing)
}

export function recordManagementSessionExpiry(value: unknown): void {
  const deadline = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(deadline)) {
    clearManagementSessionExpiry()
    return
  }
  window.localStorage.setItem(sessionExpiryKey, String(deadline))
}

export function getManagementSessionExpiry(): number | null {
  const deadline = Number(window.localStorage.getItem(sessionExpiryKey))
  return Number.isFinite(deadline) && deadline > 0 ? deadline : null
}

export function isManagementSessionExpired(now = Date.now()): boolean {
  const deadline = getManagementSessionExpiry()
  return deadline !== null && deadline <= now
}

export function clearManagementSessionExpiry(): void {
  window.localStorage.removeItem(sessionExpiryKey)
}

// The desktop client previously used Supabase's default persistent key. Move
// that session once into the six-hour management-session storage.
export function migrateLegacyAuthStorage(supabaseUrl: string): void {
  const project = new URL(supabaseUrl).hostname.split('.')[0]
  const legacyKey = `sb-${project}-auth-token`
  const legacySession = window.localStorage.getItem(legacyKey)
  if (!legacySession) return
  if (!authStorage.getItem(authStorageKey)) {
    authStorage.setItem(authStorageKey, legacySession)
  }
  window.localStorage.removeItem(legacyKey)
}
