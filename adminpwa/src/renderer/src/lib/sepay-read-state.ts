export interface SepayReadIdentity {
  id?: string
  reference_number?: string
}

export const sepayReadKey = (tx: SepayReadIdentity): string =>
  tx.id ? `id:${tx.id}` : tx.reference_number ? `ref:${tx.reference_number}` : ''

export const sepayReadStorageKey = (userId: string): string =>
  `ankhang.sepay.viewed.v1:${encodeURIComponent(userId)}`

const MAX_READ_KEYS = 5000

export const parseSepayReadKeys = (raw: string | null): string[] => {
  try {
    const value: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(value)) return []
    return [
      ...new Set(
        value.filter(
          (key): key is string => typeof key === 'string' && /^(id|ref):.{1,200}$/.test(key)
        )
      )
    ].slice(-MAX_READ_KEYS)
  } catch {
    return []
  }
}

export const loadSepayReadKeys = (userId?: string): string[] => {
  if (!userId) return []
  try {
    return parseSepayReadKeys(window.localStorage.getItem(sepayReadStorageKey(userId)))
  } catch {
    return []
  }
}

/** Store only opaque transaction identifiers; viewing never posts money. */
export const saveSepayReadKey = (
  userId: string | undefined,
  key: string,
  current: string[]
): {
  keys: string[]
  persisted: boolean
} => {
  const keys = parseSepayReadKeys(JSON.stringify([...loadSepayReadKeys(userId), ...current, key]))
  if (!userId) return { keys, persisted: false }
  try {
    window.localStorage.setItem(sepayReadStorageKey(userId), JSON.stringify(keys))
    return { keys, persisted: true }
  } catch {
    return { keys, persisted: false }
  }
}
