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
