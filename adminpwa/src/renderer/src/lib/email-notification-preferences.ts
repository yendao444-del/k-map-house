export const emailNotificationOptions = [
  { key: 'room_checkout_due', label: 'Phòng đến hạn trả', defaultEnabled: true },
  { key: 'rent_overdue', label: 'Tiền phòng quá hạn', defaultEnabled: true },
  { key: 'rent_long_unpaid', label: 'Lâu chưa thanh toán', defaultEnabled: true },
  { key: 'sepay_unmatched', label: 'Giao dịch SePay chưa khớp', defaultEnabled: true },
  { key: 'sepay_matched', label: 'Giao dịch SePay đã khớp', defaultEnabled: false },
  { key: 'invoices_services', label: 'Hóa đơn và dịch vụ', defaultEnabled: false },
  { key: 'contract_expiring', label: 'Hợp đồng sắp hết hạn', defaultEnabled: true }
] as const

export type EmailNotificationPreferences = Record<(typeof emailNotificationOptions)[number]['key'], boolean>

export function normalizeEmailNotificationPreferences(value: unknown): EmailNotificationPreferences {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  return Object.fromEntries(emailNotificationOptions.map(({ key, defaultEnabled }) => [
    key, typeof source[key] === 'boolean' ? source[key] : defaultEnabled
  ])) as EmailNotificationPreferences
}
