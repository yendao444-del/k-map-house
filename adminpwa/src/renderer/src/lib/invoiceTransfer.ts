import type { Invoice } from './db'

const normalizeAlphaNum = (value: string): string =>
  (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export const normalizeTransferText = (value: string): string => normalizeAlphaNum(value)

export const getRoomTransferToken = (roomName?: string): string => {
  const normalizedRoom = (roomName || '').trim()
  if (!normalizedRoom) return 'XX'
  const digits = normalizedRoom.match(/\d+/g)?.join('')
  if (digits) return digits
  return normalizeAlphaNum(normalizedRoom).slice(0, 6) || 'XX'
}

export const getInvoiceTransferSuffix = (invoiceId: string): string => {
  const normalizedId = normalizeAlphaNum(invoiceId)
  if (!normalizedId) return 'XXXX'
  return normalizedId.slice(-12)
}

export const buildInvoiceTransferDescription = (invoice: Invoice, roomName?: string): string => {
  const roomToken = getRoomTransferToken(roomName)
  const month = String(invoice.month).padStart(2, '0')
  const year = String(invoice.year)
  const suffix = getInvoiceTransferSuffix(invoice.id)
  return `P${roomToken}T${month}${year}C${suffix}`
}

type TransferCandidate = { invoice: Invoice; code: string; order: number }
export type InvoiceTransferIndex = Map<string, TransferCandidate[]>

export function createInvoiceTransferIndex(
  invoices: Invoice[],
  roomName: (roomId: string) => string | undefined
): InvoiceTransferIndex {
  const index: InvoiceTransferIndex = new Map()
  invoices.forEach((invoice, order) => {
    const suffix = getInvoiceTransferSuffix(invoice.id)
    const candidate = {
      invoice,
      order,
      code: normalizeTransferText(buildInvoiceTransferDescription(invoice, roomName(invoice.room_id)))
    }
    const entries = index.get(suffix)
    if (entries) entries.push(candidate)
    else index.set(suffix, [candidate])
  })
  return index
}

export function findInvoiceTransferMatches(
  index: InvoiceTransferIndex,
  content: string
): Invoice[] {
  const normalized = normalizeTransferText(content)
  const found = new Map<number, TransferCandidate>()
  // Every generated code contains C followed by a 1-12 character suffix.
  // Check all lengths, including legacy IDs and overlapping codes.
  for (let position = 0; position < normalized.length; position += 1) {
    if (normalized[position] !== 'C') continue
    for (let length = 1; length <= 12 && position + length < normalized.length; length += 1) {
      const candidates = index.get(normalized.slice(position + 1, position + 1 + length))
      if (!candidates) continue
      for (const candidate of candidates) {
        if (!found.has(candidate.order) && normalized.includes(candidate.code)) {
          found.set(candidate.order, candidate)
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => a.order - b.order).map(({ invoice }) => invoice)
}
