export const normalizeContractSearch = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim()
const normalizePhone = (value: string): string => value.replace(/[^\d+]/g, '').replace(/^(?:\+84|84)(?=\d{9}$)/, '0')
export function matchesContractSearch(query: string, fields: string[], phone?: string): boolean {
  const search=normalizeContractSearch(query)
  if (!search) return true
  if (fields.some(field => normalizeContractSearch(field).includes(search))) return true
  const digits=normalizePhone(query)
  return Boolean(digits && /^[\d\s+.()-]+$/.test(query.trim()) && normalizePhone(phone || '').includes(digits))
}
