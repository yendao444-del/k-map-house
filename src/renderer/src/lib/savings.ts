export type SavingsMeta = {
  type: 'savings'; bank: string; principal: number; term: string; rate: number
  startDate: string; maturityDate: string; maturityAction: string
  status: 'active' | 'settled'; settleDate?: string; settleAmount?: number
}
export function savingsInterest(principal: number, rate: number, term: string): number {
  const months = Number(term.match(/(\d+)\s*tháng/)?.[1] || 0)
  return Math.round(principal * rate / 100 * months / 12)
}
export function savingsMaturity(start: string, term: string): string {
  const months = Number(term.match(/(\d+)\s*tháng/)?.[1] || 0)
  if (!months) return 'Không kỳ hạn'
  const date = new Date(`${start.slice(0, 10)}T12:00:00`)
  if (!Number.isFinite(date.getTime())) return ''
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, last))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function readSavings(value?: string): SavingsMeta | undefined {
  try { const meta = JSON.parse(value || ''); return meta.type === 'savings' ? meta : undefined } catch { return undefined }
}
