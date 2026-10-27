export type IdentityFields = {
  fullName?: string
  identityCard?: string
  birthDate?: string
  gender?: string
  address?: string
  issuedDate?: string
}

export type IdentityReadResult = {
  ok: boolean
  source?: 'qr' | 'ocr'
  fields?: IdentityFields
  needsReview?: boolean
  error?: string
}

export const MAX_IDENTITY_IMAGE_BYTES = 5 * 1024 * 1024

export function normalizeIdentityName(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim()
}

function compactDate(value: string): string | undefined {
  const match = value.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (!match) return undefined
  const [, day, month, year] = match
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== +day || date.getUTCMonth() + 1 !== +month) return undefined
  return `${year}-${month}-${day}`
}

export function parseIdentityQr(text: string): IdentityFields | null {
  const parts = text.split('|')
  // Existing CCCD and newer căn cước use the same initial pipe-delimited fields.
  if (parts.length < 7 || !/^\d{12}$/.test(parts[0].trim())) return null
  const name = normalizeIdentityName(parts[2])
  if (!/^[\p{L}][\p{L} .'-]{1,99}$/u.test(name) || /\uFFFD/.test(name)) return null
  const birthDate = compactDate(parts[3].trim())
  if (!birthDate) return null
  return {
    identityCard: parts[0].trim(), fullName: name, birthDate,
    gender: parts[4].trim(), address: normalizeIdentityName(parts[5]),
    issuedDate: compactDate(parts[6].trim())
  }
}

export function parseIdentityOcr(text: string): IdentityFields {
  const lines = text.normalize('NFC').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const identityCard = lines.map(line => line.match(/(?:^|\D)(\d{12})(?:\D|$)/)?.[1]).find(Boolean)
  let fullName: string | undefined
  const label = lines.findIndex(line => /full\s*name|h[oọ].*(?:t[eê]n|khai\s*sinh)/iu.test(line))
  if (label >= 0) {
    for (const line of lines.slice(label + 1, label + 4)) {
      const candidate = normalizeIdentityName(line.replace(/\p{Lm}|[^\p{L}\s'-]/gu, ''))
      if (/^[\p{Lu}Đ][\p{Lu}Đ\s]{2,80}$/u.test(candidate) && candidate.split(' ').length >= 2 && !/VIỆT NAM|DATE|GIỚI|QUỐC|NGÀY|NATIONALITY/u.test(candidate)) {
        fullName = candidate
        break
      }
    }
  }
  // Never reconstruct Vietnamese accents from a machine-readable zone.
  return { fullName, identityCard }
}

export function validateTenantIdentity(fullName: string, identityCard: string): string | null {
  if (!normalizeIdentityName(fullName)) return 'Vui lòng kiểm tra họ và tên khách thuê.'
  if (!/^\d{9}$|^\d{12}$/.test(identityCard.trim())) return 'Số CCCD cần đủ 12 chữ số; CMND cần đủ 9 chữ số.'
  return null
}

export function identityImagesAgree(results: IdentityReadResult[]): boolean {
  const numbers = new Set(results.map(result => result.fields?.identityCard).filter(Boolean))
  return numbers.size <= 1
}
