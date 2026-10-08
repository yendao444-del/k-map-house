export type ContractChange = { label: string; before: string; after: string }
const fields = [
  ['baseRent', 'Giá thuê / tháng', 'money'], ['depositAmount', 'Tiền cọc', 'money'],
  ['moveInDate', 'Ngày bắt đầu', 'date'], ['durationMonths', 'Thời hạn', 'months'],
  ['invoiceDay', 'Ngày chốt hóa đơn', 'day'], ['occupantCount', 'Số người ở', 'people'],
  ['additionalTerms', 'Điều khoản bổ sung', 'text']
] as const
export function contractChanges(before: Record<string, unknown>, after: Record<string, unknown>): ContractChange[] {
  const format = (value: unknown, kind: string): string => {
    if (kind === 'money') return `${new Intl.NumberFormat('vi-VN').format(Number(value || 0))} đ`
    if (kind === 'date') return String(value || '').split('-').reverse().join('/') || 'Chưa có'
    if (kind === 'months') return Number(value) ? `${value} tháng` : 'Không thời hạn'
    if (kind === 'day') return `Ngày ${value}`
    if (kind === 'people') return `${value} người`
    return String(value || '').trim() || 'Không có'
  }
  return fields.filter(([key]) => String(before[key] ?? '') !== String(after[key] ?? '')).map(([key, label, kind]) => ({ label, before: format(before[key], kind), after: format(after[key], kind) }))
}
