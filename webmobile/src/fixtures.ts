export type TenantKind = 'existing' | 'new'
export const tenants = {
  existing: { name: 'Nguyễn Minh Anh', room: '101', contractId: 'demo-current-101', start: '01/07/2026' },
  new: { name: 'Trần Hoài Nam', room: '102', contractId: 'demo-current-102', start: '01/10/2026' }
} as const
export const history = [
  { id: 'demo-aug', contractId: 'demo-current-101', month: '08/2026', rent: 3000000, electric: 180000, water: 65000, total: 3245000, date: '05/09/2026' },
  { id: 'demo-jul', contractId: 'demo-current-101', month: '07/2026', rent: 3000000, electric: 120000, water: 60000, total: 3180000, date: '05/08/2026' }
]
export const money = (value: number) => `${value.toLocaleString('vi-VN')}đ`
