import type { AppSettings, Contract, Room, RoomAsset, ServiceZone, Tenant } from './db'

export type ContractDraftForm = {
  baseRent: number
  depositAmount: number
  moveInDate: string
  durationMonths: number
  invoiceDay: number
  occupantCount: number
  electricInitial: number | ''
  waterInitial: number | ''
  readingEditReason: string
  additionalTerms: string
}

export type ContractDraftSnapshot = {
  version: 1
  room: Pick<Room, 'id' | 'name' | 'area'>
  tenant: Pick<Tenant, 'id' | 'full_name' | 'phone' | 'email' | 'identity_card' | 'id_card_issued_date' | 'id_card_issued_place' | 'address'>
  settings: AppSettings
  form: ContractDraftForm
  services: { electricPrice: number; waterPrice: number; internetPrice: number; cleaningPrice: number }
  assets: { id: string; name: string; quantity: number; condition: string }[]
  amendment?: { contractId: string; previousForm: ContractDraftForm; reason: string }
}

export type ContractDraft = {
  id: string
  room_id: string
  tenant_id: string
  recipient_email: string
  status: 'draft' | 'cancelled' | 'confirmed'
  snapshot: ContractDraftSnapshot
  revision: number
  created_at: string
  updated_at: string
  parent_contract_id?: string
  base_contract?: Record<string, unknown>
  before_snapshot?: ContractDraftSnapshot
}

export const formatContractMoney = (value: number) => new Intl.NumberFormat('vi-VN').format(value)
export const localContractDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const hasValidContractEmail = (email: string | null | undefined): boolean => {
  const value = email?.trim() || ''
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
export function contractReadingError(value: number | '', label: 'điện' | 'nước'): string | null {
  if (value === '' || value == null) return `Nhập chỉ số ${label} bàn giao.`
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) return `Chỉ số ${label} phải là số nguyên từ 0 đến 2.147.483.647.`
  return null
}
export function validateContractReadings(form: ContractDraftForm): string | null {
  return contractReadingError(form.electricInitial, 'điện') || contractReadingError(form.waterInitial, 'nước')
}
const validContractDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

export function contractExpiration(moveIn: string, months: number): string | undefined {
  if (!months || !validContractDate(moveIn)) return undefined
  const [year, month, day] = moveIn.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate()
  const end = new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay)))
  return end.toISOString().slice(0, 10)
}

export function validateContractDraft(form: ContractDraftForm, tenant: Tenant | null): string | null {
  if (!tenant?.id || !tenant.is_active) return 'Chọn khách thuê có hồ sơ đang hoạt động.'
  if (!hasValidContractEmail(tenant.email)) return 'Bổ sung email hợp lệ trong hồ sơ khách thuê trước khi lập hợp đồng.'
  if (!validContractDate(form.moveInDate)) return 'Nhập ngày bắt đầu hợp đồng hợp lệ.'
  if (!Number.isSafeInteger(form.baseRent) || form.baseRent <= 0 || form.baseRent > 2_147_483_647) return 'Giá thuê phải lớn hơn 0 và nằm trong giới hạn cho phép.'
  if (!Number.isSafeInteger(form.depositAmount) || form.depositAmount < 0 || form.depositAmount > 2_147_483_647) return 'Tiền cọc không được âm hoặc vượt giới hạn cho phép.'
  if (!Number.isInteger(form.durationMonths) || form.durationMonths < 0 || form.durationMonths > 120) return 'Thời hạn hợp đồng phải từ 0 đến 120 tháng.'
  if (!Number.isInteger(form.invoiceDay) || form.invoiceDay < 1 || form.invoiceDay > 28) return 'Ngày chốt hóa đơn phải từ 1 đến 28.'
  if (!Number.isInteger(form.occupantCount) || form.occupantCount < 1 || form.occupantCount > 20) return 'Số người ở phải từ 1 đến 20.'
  for (const reading of [form.electricInitial, form.waterInitial]) {
    if (reading !== '' && (!Number.isSafeInteger(reading) || reading < 0 || reading > 2_147_483_647)) return 'Chỉ số điện/nước phải là số nguyên không âm.'
  }
  return null
}

export function buildContractDraftSnapshot(room: Room, tenant: Tenant, settings: AppSettings, form: ContractDraftForm, zone?: ServiceZone, assets: RoomAsset[] = []): ContractDraftSnapshot {
  // Only contract data goes into a draft. Never copy CCCD photos, API tokens,
  // financial balances or the previous room occupant's identity/history.
  return {
    version: 1,
    room: { id: room.id, name: room.name, area: room.area },
    tenant: { id: tenant.id, full_name: tenant.full_name, phone: tenant.phone, email: tenant.email, identity_card: tenant.identity_card, id_card_issued_date: tenant.id_card_issued_date, id_card_issued_place: tenant.id_card_issued_place, address: tenant.address },
    settings: { property_name: settings.property_name, property_address: settings.property_address, property_owner_name: settings.property_owner_name, property_owner_phone: settings.property_owner_phone, property_owner_id_card: settings.property_owner_id_card, bank_id: settings.bank_id, account_no: settings.account_no, account_name: settings.account_name },
    form: { ...form },
    services: { electricPrice: room.electric_price ?? zone?.electric_price ?? 0, waterPrice: room.water_price ?? zone?.water_price ?? 0, internetPrice: room.wifi_price ?? zone?.internet_price ?? 0, cleaningPrice: room.garbage_price ?? zone?.cleaning_price ?? 0 },
    assets: assets.map(asset => ({ id: asset.id, name: asset.name, quantity: asset.quantity, condition: asset.status === 'error' ? 'Có lỗi' : asset.status === 'repairing' ? 'Đang sửa' : asset.status === 'ok' ? 'Bình thường' : 'Chưa ghi nhận' }))
  }
}

export function previewContract(snapshot: ContractDraftSnapshot, createdAt: string): Contract {
  const { tenant, form, room } = snapshot
  return {
    id: 'draft-preview', room_id: room.id, tenant_id: tenant.id,
    tenant_name: tenant.full_name, tenant_phone: tenant.phone,
    tenant_id_card: tenant.identity_card, tenant_id_card_issued_date: tenant.id_card_issued_date,
    tenant_id_card_issued_place: tenant.id_card_issued_place, tenant_address: tenant.address,
    base_rent: form.baseRent, deposit_amount: form.depositAmount,
    move_in_date: form.moveInDate, duration_months: form.durationMonths,
    expiration_date: contractExpiration(form.moveInDate, form.durationMonths),
    invoice_day: form.invoiceDay, occupant_count: form.occupantCount, billing_cycle: 1,
    electric_init: Number(form.electricInitial), water_init: Number(form.waterInitial),
    notes: form.additionalTerms, status: 'active', created_at: createdAt
  }
}
