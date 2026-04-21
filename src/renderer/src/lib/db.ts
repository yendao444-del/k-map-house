import { supabase, safeQuery } from './supabase'

// =========================================================
// TYPES & CONSTANTS
// =========================================================
export type RoomStatus = 'vacant' | 'occupied' | 'maintenance' | 'ending'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'merged' | 'cancelled'
export type PaymentMethod = 'cash' | 'transfer'
export type UserRole = 'admin' | 'user'
export type UserStatus = 'active' | 'inactive'

export interface AppUser { id: string; username: string; full_name: string; password_hash?: string; role: UserRole; status: UserStatus; last_login_at?: string; created_at: string; }
export interface InvoicePaymentRecord { id: string; amount: number; payment_method?: PaymentMethod; payment_date: string; note?: string; created_at: string; }
export interface ServiceZone { id: string; name: string; electric_price: number; water_price: number; internet_price: number; cleaning_price: number; created_at: string; }
export interface Room { id: string; name: string; floor: number; base_rent: number; status: RoomStatus; created_at: string; service_zone_id?: string; area?: number; max_occupants?: number; default_deposit?: number; invoice_day?: number; billing_cycle?: string; notes?: string; move_in_date?: string; contract_expiration?: string; tenant_name?: string; tenant_phone?: string; tenant_email?: string; tenant_id_card?: string; electric_old?: number; electric_new?: number; water_old?: number; water_new?: number; old_debt?: number; max_vehicles?: number; has_move_in_receipt?: boolean; expected_end_date?: string; electric_price?: number; water_price?: number; wifi_price?: number; garbage_price?: number; }
export interface Tenant { id: string; full_name: string; phone?: string; email?: string; identity_card?: string; id_card_issued_date?: string; id_card_issued_place?: string; address?: string; identity_image_url?: string; notes?: string; is_active: boolean; last_room_name?: string; left_at?: string; created_at: string; updated_at: string; }
export interface Invoice { id: string; room_id: string; tenant_id: string; billing_reason?: string; month: number; year: number; invoice_date?: string; due_date?: string; billing_period_start?: string; billing_period_end?: string; electric_old: number; electric_new: number; electric_usage: number; electric_cost: number; water_old: number; water_new: number; water_usage: number; water_cost: number; room_cost: number; wifi_cost: number; garbage_cost: number; old_debt: number; total_amount: number; adjustment_amount?: number; adjustment_note?: string; note?: string; paid_amount: number; payment_status: PaymentStatus; payment_method?: PaymentMethod; payment_date?: string; payment_records?: InvoicePaymentRecord[]; is_first_month?: boolean; is_settlement?: boolean; deposit_amount?: number; deposit_applied?: number; damage_amount?: number; damage_note?: string; merged_invoice_ids?: string[]; merged_debt_total?: number; electric_price_snapshot?: number; water_price_snapshot?: number; prorata_days?: number; has_transfer?: boolean; transfer_old_room_name?: string; transfer_days?: number; transfer_room_cost?: number; transfer_electric_cost?: number; transfer_water_cost?: number; transfer_service_cost?: number; transfer_electric_usage?: number; transfer_water_usage?: number; new_room_days?: number; new_room_cost?: number; new_room_service_cost?: number; created_at: string; allow_duplicate?: boolean; }
export type ContractStatus = 'active' | 'expired' | 'terminated' | 'cancelled'
export interface Contract { id: string; room_id: string; tenant_name: string; tenant_phone?: string; tenant_id_card?: string; tenant_id_card_issued_date?: string; tenant_id_card_issued_place?: string; tenant_address?: string; tenant_dob?: string; occupant_count: number; move_in_date: string; duration_months: number; expiration_date?: string; base_rent: number; deposit_amount: number; billing_cycle: number; invoice_day: number; electric_init: number; water_init: number; status: ContractStatus; notes?: string; created_at: string; end_date?: string; end_note?: string; final_electric?: number; final_water?: number; tenant_id?: string; is_migration?: boolean; migration_debt?: number; transfer_history?: any; }
export interface MoveInReceipt { id: string; room_id: string; tenant_id?: string; move_in_date: string; deposit_amount: number; prorata_days: number; prorata_amount: number; next_month_rent: number; electric_init: number; water_init: number; total_amount: number; payment_status: PaymentStatus; payment_method?: PaymentMethod; payment_date?: string; created_at: string; }
export type CashTransactionType = 'income' | 'expense'
export type CashTransactionCategory = 'electric' | 'water' | 'internet' | 'cleaning' | 'maintenance' | 'management' | 'software' | 'other_income' | 'other_expense'
export interface CashTransaction { id: string; type: CashTransactionType; category: CashTransactionCategory; transaction_date: string; amount: number; room_id?: string; payment_method?: PaymentMethod; note?: string; created_at: string; updated_at: string; }
export interface AssetTemplate { id: string; name: string; sort_order: number; is_active: boolean; }
export type AssetType = 'furniture' | 'appliance' | 'plumbing' | 'electrical'
export interface RoomAsset { id: string; room_id: string; name: string; quantity: number; sort_order: number; type?: AssetType; status?: 'ok' | 'error' | 'repairing'; issue_note?: string; icon?: string; repairman_name?: string; repairman_phone?: string; repair_called_at?: string; repaired_at?: string; }
export interface RoomAssetAdjustment { id: string; room_id: string; room_asset_id?: string; action: 'add' | 'update'; asset_name: string; previous_name?: string; new_name?: string; previous_quantity?: number; new_quantity?: number; reason: string; recorded_at: string; }
export interface AssetSnapshot { id: string; room_id: string; tenant_id?: string; room_asset_id: string; type: 'move_in' | 'move_out' | 'handover'; condition: string; deduction: number; note?: string; recorded_at: string; }
export interface RoomVehicle { id: string; room_id: string; owner_name?: string; license_plate: string; vehicle_type?: string; brand?: string; color?: string; registered_at: string; }
export interface AppSettings { bank_id?: string; account_no?: string; account_name?: string; property_name?: string; property_address?: string; property_owner_name?: string; property_owner_phone?: string; property_owner_id_card?: string; notification_read_ids?: string[]; contract_template?: string; }

// =========================================================
// UTILS
// =========================================================
const formatRoomName = (name: string) => {
  const cleanedName = name.trim().replace(/\s+/g, ' ')
  if (!cleanedName) return ''
  return /^phòng\s+/i.test(cleanedName) ? cleanedName : `Phòng ${cleanedName}`
}

const createEntityId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

// =========================================================
// ROOMS
// =========================================================
export const getRooms = async (): Promise<Room[]> => {
  const data = await safeQuery(() => supabase.from('rooms').select('*').order('name', { ascending: true }))
  return data || []
}

export const createRoom = async (roomData: Partial<Room>): Promise<Room> => {
  const roomName = formatRoomName(roomData.name || '')
  const newRoom = { ...roomData, id: createEntityId('room'), name: roomName, status: 'vacant', created_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('rooms').insert(newRoom).select().single())
  return result as any as Room
}

export const updateRoom = async (id: string, updates: Partial<Room>): Promise<Room> => {
  if (typeof updates.name === 'string') updates.name = formatRoomName(updates.name)
  const result = await safeQuery(() => supabase.from('rooms').update(updates).eq('id', id).select().single())
  return result as any as Room
}

export const deleteRoom = async (id: string): Promise<void> => {
  await safeQuery(() => supabase.from('rooms').delete().eq('id', id))
}

// =========================================================
// TENANTS
// =========================================================
export const getTenants = async (): Promise<Tenant[]> => {
  const data = await safeQuery(() => supabase.from('tenants').select('*').order('created_at', { ascending: false }))
  return data || []
}

export const createTenant = async (tenantData: Partial<Tenant>): Promise<Tenant> => {
  const newTenant = { ...tenantData, id: createEntityId('tenant'), is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('tenants').insert(newTenant).select().single())
  return result as any as Tenant
}

export const updateTenant = async (id: string, updates: Partial<Tenant>): Promise<Tenant> => {
  const result = await safeQuery(() => supabase.from('tenants').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single())
  return result as any as Tenant
}

export const deleteTenant = async (id: string): Promise<void> => {
  await safeQuery(() => supabase.from('tenants').delete().eq('id', id))
}

export const markTenantLeft = async (tenantId: string): Promise<Tenant> => {
  const result = await safeQuery(() => supabase.from('tenants').update({ is_active: false, left_at: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() }).eq('id', tenantId).select().single())
  return result as any as Tenant
}

// =========================================================
// SERVICE ZONES
// =========================================================
export const getServiceZones = async (): Promise<ServiceZone[]> => {
  const data = await safeQuery(() => supabase.from('service_zones').select('*').order('name', { ascending: true }))
  return data || []
}

export const createServiceZone = async (zoneData: Partial<ServiceZone>): Promise<ServiceZone> => {
  const newZone = { ...zoneData, id: createEntityId('zone'), created_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('service_zones').insert(newZone).select().single())
  return result as any as ServiceZone
}

export const updateServiceZone = async (id: string, updates: Partial<ServiceZone>): Promise<ServiceZone> => {
  const result = await safeQuery(() => supabase.from('service_zones').update(updates).eq('id', id).select().single())
  return result as any as ServiceZone
}

export const deleteServiceZone = async (id: string): Promise<void> => {
  await safeQuery(() => supabase.from('service_zones').delete().eq('id', id))
}

// =========================================================
// CONTRACTS
// =========================================================
export const getContracts = async (): Promise<Contract[]> => {
  const data = await safeQuery(() => supabase.from('contracts').select('*').order('created_at', { ascending: false }))
  return data || []
}

export const createContract = async (data: Partial<Contract>): Promise<Contract> => {
  const newContract = { ...data, id: createEntityId('contract'), status: 'active', created_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('contracts').insert(newContract).select().single())
  const contract = result as any as Contract
  await supabase.from('rooms').update({ status: 'occupied', tenant_name: contract.tenant_name, tenant_phone: contract.tenant_phone, move_in_date: contract.move_in_date, electric_old: contract.electric_init, electric_new: contract.electric_init, water_old: contract.water_init, water_new: contract.water_init } as any).eq('id', contract.room_id)
  return contract
}

export const updateContract = async (id: string, updates: Partial<Contract>): Promise<Contract> => {
  const result = await safeQuery(() => supabase.from('contracts').update(updates).eq('id', id).select().single())
  return result as any as Contract
}

export const terminateContract = async (data: { room_id: string; contract_id: string; end_date: string; final_electric: number; final_water: number; merge_invoice_ids: string[]; damage_amount: number; damage_note: string; payment_method: PaymentMethod; }): Promise<void> => {
  await supabase.from('rooms').update({ status: 'vacant', tenant_name: null, tenant_phone: null, move_in_date: null, electric_old: data.final_electric, electric_new: data.final_electric, water_old: data.final_water, water_new: data.final_water, has_move_in_receipt: false } as any).eq('id', data.room_id)
  await supabase.from('contracts').update({ status: 'terminated', end_date: data.end_date, end_note: data.damage_note, final_electric: data.final_electric, final_water: data.final_water }).eq('id', data.contract_id)
  if (data.merge_invoice_ids.length > 0) { await supabase.from('invoices').update({ payment_status: 'merged' }).in('id', data.merge_invoice_ids) }
}

// =========================================================
// INVOICES
// =========================================================
export const getInvoices = async (): Promise<Invoice[]> => {
  const data = await safeQuery(() => supabase.from('invoices').select('*').order('created_at', { ascending: false }))
  return data || []
}

export const getInvoicesByRoom = async (roomId: string): Promise<Invoice[]> => {
  const data = await safeQuery(() => supabase.from('invoices').select('*').eq('room_id', roomId).order('created_at', { ascending: false }))
  return data || []
}

export const createInvoice = async (invoiceData: Partial<Invoice>): Promise<Invoice> => {
  const newInvoice = { ...invoiceData, id: createEntityId('inv'), created_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('invoices').insert(newInvoice).select().single())
  const inv = result as any as Invoice
  if (invoiceData.room_id && !invoiceData.is_settlement) { await supabase.from('rooms').update({ electric_old: inv.electric_new, electric_new: inv.electric_new, water_old: inv.water_new, water_new: inv.water_new } as any).eq('id', invoiceData.room_id) }
  return inv
}

export const updateInvoice = async (id: string, updates: Partial<Invoice>): Promise<Invoice> => {
  const result = await safeQuery(() => supabase.from('invoices').update(updates).eq('id', id).select().single())
  return result as any as Invoice
}

export const deleteInvoice = async (id: string): Promise<Invoice> => {
  const result = await safeQuery(() => supabase.from('invoices').update({ payment_status: 'cancelled', note: '[Đã hủy phiếu]' } as any).eq('id', id).select().single())
  return result as any as Invoice
}

export const recordInvoicePayment = async (id: string, data: { amount: number; payment_method: PaymentMethod; payment_date: string; note?: string }): Promise<Invoice> => {
  const { data: inv } = await supabase.from('invoices').select('*').eq('id', id).single()
  if (!inv) throw new Error('Invoice not found')
  const newPaidAmount = (inv.paid_amount || 0) + data.amount
  const record = { id: createEntityId('pay'), amount: data.amount, payment_method: data.payment_method, payment_date: data.payment_date, note: data.note, created_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('invoices').update({ paid_amount: newPaidAmount, payment_status: newPaidAmount >= inv.total_amount ? 'paid' : 'partial', payment_method: data.payment_method, payment_date: data.payment_date, payment_records: [...(inv.payment_records || []), record] } as any).eq('id', id).select().single())
  return result as any as Invoice
}

// =========================================================
// ASSETS & SNAPSHOTS
// =========================================================
export const getRoomAssets = async (roomId: string): Promise<RoomAsset[]> => {
  const data = await safeQuery(() => supabase.from('room_assets').select('*').eq('room_id', roomId).order('sort_order', { ascending: true }))
  return data || []
}

export const addRoomAsset = async (data: Partial<RoomAsset>): Promise<RoomAsset> => {
  const newAsset = { ...data, id: createEntityId('rasset'), status: 'ok' }
  const result = await safeQuery(() => supabase.from('room_assets').insert(newAsset).select().single())
  return result as any as RoomAsset
}

export const updateRoomAsset = async (id: string, updates: Partial<RoomAsset>): Promise<RoomAsset> => {
  const result = await safeQuery(() => supabase.from('room_assets').update(updates).eq('id', id).select().single())
  return result as any as RoomAsset
}

export const deleteRoomAsset = async (id: string): Promise<void> => {
  await safeQuery(() => supabase.from('room_assets').delete().eq('id', id))
}

export const getAssetTemplates = async (): Promise<AssetTemplate[]> => {
  const data = await safeQuery(() => supabase.from('asset_templates').select('*').order('sort_order', { ascending: true }))
  return data || []
}

export const createAssetTemplate = async (data: Partial<AssetTemplate>): Promise<AssetTemplate> => {
  const newT = { ...data, id: createEntityId('atemplate'), is_active: true }
  const result = await safeQuery(() => supabase.from('asset_templates').insert(newT).select().single())
  return result as any as AssetTemplate
}

export const updateAssetTemplate = async (id: string, updates: Partial<AssetTemplate>): Promise<AssetTemplate> => {
  const result = await safeQuery(() => supabase.from('asset_templates').update(updates).eq('id', id).select().single())
  return result as any as AssetTemplate
}

export const deleteAssetTemplate = async (id: string): Promise<void> => {
  await safeQuery(() => supabase.from('asset_templates').delete().eq('id', id))
}

export const getAssetSnapshots = async (roomId: string, type?: string): Promise<AssetSnapshot[]> => {
  let q = supabase.from('asset_snapshots').select('*').eq('room_id', roomId)
  if (type) q = q.eq('type', type)
  const data = await safeQuery(() => q.order('recorded_at', { ascending: false }))
  return data || []
}

export const createAssetSnapshot = async (data: Partial<AssetSnapshot>): Promise<AssetSnapshot> => {
  const newSnap = { ...data, id: createEntityId('snap'), recorded_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('asset_snapshots').insert(newSnap).select().single())
  return result as any as AssetSnapshot
}

export const updateAssetSnapshot = async (id: string, updates: Partial<AssetSnapshot>): Promise<AssetSnapshot> => {
  const result = await safeQuery(() => supabase.from('asset_snapshots').update(updates).eq('id', id).select().single())
  return result as any as AssetSnapshot
}

export const deleteAssetSnapshot = async (id: string): Promise<void> => {
  await safeQuery(() => supabase.from('asset_snapshots').delete().eq('id', id))
}

export const getRoomAssetAdjustments = async (roomId: string): Promise<RoomAssetAdjustment[]> => {
  const data = await safeQuery(() => supabase.from('room_asset_adjustments').select('*').eq('room_id', roomId).order('recorded_at', { ascending: false }))
  return data || []
}

export const createRoomAssetAdjustment = async (data: Partial<RoomAssetAdjustment>): Promise<RoomAssetAdjustment> => {
  const newAdj = { ...data, id: createEntityId('adj'), recorded_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('room_asset_adjustments').insert(newAdj).select().single())
  return result as any as RoomAssetAdjustment
}

// =========================================================
// VEHICLES
// =========================================================
export const getVehicles = async (): Promise<RoomVehicle[]> => {
  const data = await safeQuery(() => supabase.from('room_vehicles').select('*').order('registered_at', { ascending: false }))
  return data || []
}

export const getRoomVehicles = async (roomId: string): Promise<RoomVehicle[]> => {
  const data = await safeQuery(() => supabase.from('room_vehicles').select('*').eq('room_id', roomId).order('registered_at', { ascending: false }))
  return data || []
}

export const addRoomVehicle = async (data: Partial<RoomVehicle>): Promise<RoomVehicle> => {
  const newV = { ...data, id: createEntityId('veh'), registered_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('room_vehicles').insert(newV).select().single())
  return result as any as RoomVehicle
}

export const updateRoomVehicle = async (id: string, updates: Partial<RoomVehicle>): Promise<RoomVehicle> => {
  const result = await safeQuery(() => supabase.from('room_vehicles').update(updates).eq('id', id).select().single())
  return result as any as RoomVehicle
}

export const deleteRoomVehicle = async (id: string): Promise<void> => {
  await safeQuery(() => supabase.from('room_vehicles').delete().eq('id', id))
}

// =========================================================
// CASH TRANSACTIONS
// =========================================================
export const getCashTransactions = async (): Promise<CashTransaction[]> => {
  const data = await safeQuery(() => supabase.from('cash_transactions').select('*').order('transaction_date', { ascending: false }))
  return data || []
}

export const createCashTransaction = async (data: Partial<CashTransaction>): Promise<CashTransaction> => {
  const newTx = { ...data, id: createEntityId('tx'), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('cash_transactions').insert(newTx).select().single())
  return result as any as CashTransaction
}

export const updateCashTransaction = async (id: string, updates: Partial<CashTransaction>): Promise<CashTransaction> => {
  const result = await safeQuery(() => supabase.from('cash_transactions').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single())
  return result as any as CashTransaction
}

export const deleteCashTransaction = async (id: string): Promise<void> => {
  await safeQuery(() => supabase.from('cash_transactions').delete().eq('id', id))
}

// =========================================================
// MOVE-IN RECEIPTS
// =========================================================
export const getMoveInReceipts = async (): Promise<MoveInReceipt[]> => {
  const data = await safeQuery(() => supabase.from('move_in_receipts').select('*').order('created_at', { ascending: false }))
  return data || []
}

export const getMoveInReceiptsByTenant = async (tenantId: string): Promise<MoveInReceipt[]> => {
  const data = await safeQuery(() => supabase.from('move_in_receipts').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }))
  return data || []
}

export const getMoveInReceiptsByRoom = async (roomId: string): Promise<MoveInReceipt[]> => {
  const data = await safeQuery(() => supabase.from('move_in_receipts').select('*').eq('room_id', roomId).order('created_at', { ascending: false }))
  return data || []
}

export const updateMoveInReceipt = async (id: string, updates: Partial<MoveInReceipt>): Promise<MoveInReceipt> => {
  const result = await safeQuery(() => supabase.from('move_in_receipts').update(updates).eq('id', id).select().single())
  return result as any as MoveInReceipt
}

export const deleteMoveInReceipt = async (id: string): Promise<void> => {
  await safeQuery(() => supabase.from('move_in_receipts').delete().eq('id', id))
}

// =========================================================
// SETTINGS & USERS
// =========================================================
export const getAppSettings = async (): Promise<AppSettings> => {
  const { data } = await supabase.from('app_settings').select('*').limit(1).maybeSingle()
  return (data as any as AppSettings) || {}
}

export const updateAppSettings = async (updates: Partial<AppSettings>): Promise<AppSettings> => {
  const { data: existing } = await supabase.from('app_settings').select('id').limit(1).maybeSingle()
  if (existing) {
    const result = await safeQuery(() => supabase.from('app_settings').update(updates).eq('id', (existing as any).id).select().single())
    return result as any as AppSettings
  } else {
    const result = await safeQuery(() => supabase.from('app_settings').insert({ ...updates, id: 'settings' }).select().single())
    return result as any as AppSettings
  }
}

export const getUsers = async (): Promise<AppUser[]> => {
  const data = await safeQuery(() => supabase.from('users').select('*'))
  return data || []
}

export const createUser = async (data: Partial<AppUser>): Promise<AppUser> => {
  const newUser = { ...data, id: createEntityId('user'), status: 'active', created_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('users').insert(newUser).select().single())
  return result as any as AppUser
}

export const updateUser = async (id: string, updates: Partial<AppUser>): Promise<AppUser> => {
  const result = await safeQuery(() => supabase.from('users').update(updates).eq('id', id).select().single())
  return result as any as AppUser
}

export const updateUserRole = async (userId: string, role: UserRole): Promise<AppUser> => {
  return updateUser(userId, { role })
}

export const updateUserStatus = async (userId: string, status: UserStatus): Promise<AppUser> => {
  return updateUser(userId, { status })
}

export const resetUserPassword = async (userId: string, password_hash: string): Promise<AppUser> => {
  return updateUser(userId, { password_hash })
}

export const deleteUser = async (id: string): Promise<void> => {
  await safeQuery(() => supabase.from('users').delete().eq('id', id))
}

// =========================================================
// COMPATIBILITY
// =========================================================
export const dbOptions = { readDB: () => ({ users: [], app_settings: {} }), writeDB: () => { } }
export async function getDB() { return {} }
