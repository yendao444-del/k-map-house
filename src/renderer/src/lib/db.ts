import { supabase, supabaseAdmin, safeQuery } from './supabase'

// =========================================================
// TYPES & CONSTANTS
// =========================================================
export type RoomStatus = 'vacant' | 'occupied' | 'maintenance' | 'ending'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'merged' | 'cancelled'
export type PaymentMethod = 'cash' | 'transfer'
export type UserRole = 'admin' | 'user'
export type UserStatus = 'active' | 'inactive'

export interface AppUser { id: string; username: string; email?: string; full_name: string; avatar_url?: string; password_hash?: string; role: UserRole; status: UserStatus; last_login_at?: string; created_at: string; }
export interface InvoicePaymentRecord { id: string; amount: number; payment_method?: PaymentMethod; payment_date: string; note?: string; created_at: string; }
export interface ServiceZone { id: string; name: string; electric_price: number; water_price: number; internet_price: number; cleaning_price: number; created_at: string; }
export interface Room { id: string; name: string; floor: number; base_rent: number; status: RoomStatus; created_at: string; service_zone_id?: string; area?: number; max_occupants?: number; default_deposit?: number; invoice_day?: number; billing_cycle?: string; notes?: string; move_in_date?: string; contract_expiration?: string; tenant_name?: string; tenant_phone?: string; tenant_email?: string; tenant_id_card?: string; electric_old?: number; electric_new?: number; water_old?: number; water_new?: number; old_debt?: number; max_vehicles?: number; has_move_in_receipt?: boolean; expected_end_date?: string; electric_price?: number; water_price?: number; wifi_price?: number; garbage_price?: number; image_urls?: string[]; }
export interface Tenant { id: string; full_name: string; phone?: string; email?: string; identity_card?: string; id_card_issued_date?: string; id_card_issued_place?: string; address?: string; identity_image_url?: string; notes?: string; is_active: boolean; last_room_name?: string; left_at?: string; created_at: string; updated_at: string; }
export interface Invoice { id: string; room_id: string; tenant_id: string; billing_reason?: string; month: number; year: number; invoice_date?: string; due_date?: string; billing_period_start?: string; billing_period_end?: string; electric_old: number; electric_new: number; electric_usage: number; electric_cost: number; water_old: number; water_new: number; water_usage: number; water_cost: number; room_cost: number; wifi_cost: number; garbage_cost: number; old_debt: number; total_amount: number; adjustment_amount?: number; adjustment_note?: string; note?: string; paid_amount: number; payment_status: PaymentStatus; payment_method?: PaymentMethod; payment_date?: string; payment_records?: InvoicePaymentRecord[]; is_first_month?: boolean; is_settlement?: boolean; deposit_amount?: number; deposit_applied?: number; damage_amount?: number; damage_note?: string; merged_invoice_ids?: string[]; merged_debt_total?: number; electric_price_snapshot?: number; water_price_snapshot?: number; prorata_days?: number; has_transfer?: boolean; transfer_old_room_name?: string; transfer_days?: number; transfer_room_cost?: number; transfer_electric_cost?: number; transfer_water_cost?: number; transfer_service_cost?: number; transfer_electric_usage?: number; transfer_water_usage?: number; new_room_days?: number; new_room_cost?: number; new_room_service_cost?: number; created_at: string; allow_duplicate?: boolean; }
export type ContractStatus = 'active' | 'expired' | 'terminated' | 'cancelled'
export interface Contract { id: string; room_id: string; tenant_name: string; tenant_phone?: string; tenant_id_card?: string; tenant_id_card_issued_date?: string; tenant_id_card_issued_place?: string; tenant_address?: string; tenant_dob?: string; occupant_count: number; move_in_date: string; duration_months: number; expiration_date?: string; base_rent: number; deposit_amount: number; billing_cycle: number; invoice_day: number; electric_init: number; water_init: number; status: ContractStatus; notes?: string; created_at: string; end_date?: string; end_note?: string; final_electric?: number; final_water?: number; tenant_id?: string; is_migration?: boolean; migration_debt?: number; deposit_pre_collected?: boolean; transfer_history?: any; }
export interface MoveInReceipt { id: string; room_id: string; tenant_id?: string; move_in_date: string; deposit_amount: number; prorata_days: number; prorata_amount: number; next_month_rent: number; electric_init: number; water_init: number; total_amount: number; payment_status: PaymentStatus; payment_method?: PaymentMethod; payment_date?: string; created_at: string; }
export type CashTransactionType = 'income' | 'expense'
export type CashTransactionCategory = 'electric' | 'water' | 'internet' | 'cleaning' | 'maintenance' | 'management' | 'software' | 'other_income' | 'other_expense'
export interface CashTransaction { id: string; type: CashTransactionType; category: CashTransactionCategory; transaction_date: string; amount: number; room_id?: string; payment_method?: PaymentMethod; note?: string; created_at: string; updated_at: string; }
export interface AssetTemplate { id: string; name: string; sort_order: number; is_active: boolean; }
export type AssetType = 'furniture' | 'appliance' | 'plumbing' | 'electrical'
export interface RoomAsset { id: string; room_id: string; name: string; quantity: number; sort_order: number; type?: AssetType; status?: 'ok' | 'error' | 'repairing'; issue_note?: string; icon?: string; repairman_name?: string; repairman_phone?: string; repair_called_at?: string; repaired_at?: string; }
export interface RoomAssetAdjustment { id: string; room_id: string; room_asset_id?: string; action: 'add' | 'update'; name: string; quantity: number; reason: string; recorded_at: string; }
export interface AssetSnapshot { id: string; room_id: string; tenant_id?: string; room_asset_id: string; type: 'move_in' | 'move_out' | 'handover'; condition: string; deduction: number; note?: string; recorded_at: string; }
export interface RoomVehicle { id: string; room_id: string; owner_name?: string; license_plate: string; vehicle_type?: string; brand?: string; color?: string; registered_at: string; }
export interface AppSettings { bank_id?: string; account_no?: string; account_name?: string; sepay_api_token?: string; property_name?: string; property_address?: string; property_owner_name?: string; property_owner_phone?: string; property_owner_id_card?: string; notification_read_ids?: string[]; contract_template?: string; }

// =========================================================
// UTILS
// =========================================================
const formatRoomName = (name: string) => {
  const cleanedName = name.trim().replace(/\s+/g, ' ')
  if (!cleanedName) return ''
  const suffix = cleanedName.replace(/^(ph[oò]ng\s+)+/i, '').trim()
  if (/^\d+$/.test(suffix)) return 'Phòng ' + suffix
  if (/^\d+$/.test(cleanedName)) return 'Phòng ' + cleanedName
  return cleanedName
}

const createEntityId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const resolveUserRole = (role: unknown): UserRole => (role === 'admin' ? 'admin' : 'user')

const resolveUserStatus = (status: unknown): UserStatus =>
  status === 'inactive' ? 'inactive' : 'active'

const buildAppUser = (
  row: Record<string, unknown> | null | undefined,
  authUser?: {
    id: string
    email?: string | null
    created_at?: string
    last_sign_in_at?: string | null
    user_metadata?: Record<string, unknown>
  } | null
): AppUser => {
  const email =
    (typeof row?.email === 'string' && row.email.trim()) ||
    (typeof authUser?.email === 'string' && authUser.email.trim()) ||
    undefined
  const fallbackUsername = email || authUser?.id || String(row?.id || 'user')
  const username =
    (typeof row?.username === 'string' && row.username.trim()) ||
    fallbackUsername
  const fullName =
    (typeof row?.full_name === 'string' && row.full_name.trim()) ||
    (typeof authUser?.user_metadata?.full_name === 'string' && authUser.user_metadata.full_name.trim()) ||
    email ||
    username
  const avatarUrl =
    (typeof row?.avatar_url === 'string' && row.avatar_url.trim()) ||
    (typeof authUser?.user_metadata?.avatar_url === 'string' && authUser.user_metadata.avatar_url.trim()) ||
    undefined

  return {
    id: String(row?.id || authUser?.id || ''),
    username,
    email,
    full_name: fullName,
    avatar_url: avatarUrl,
    password_hash: typeof row?.password_hash === 'string' ? row.password_hash : undefined,
    role: resolveUserRole(row?.role),
    status: resolveUserStatus(row?.status),
    last_login_at:
      (typeof row?.last_login_at === 'string' && row.last_login_at) ||
      (typeof authUser?.last_sign_in_at === 'string' && authUser.last_sign_in_at) ||
      undefined,
    created_at:
      (typeof row?.created_at === 'string' && row.created_at) ||
      (typeof authUser?.created_at === 'string' && authUser.created_at) ||
      new Date().toISOString()
  }
}

const isValidNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const normalizeDateToMonthYear = (dateInput?: string): { month: number; year: number } | null => {
  if (!dateInput) return null
  const date = new Date(dateInput)
  if (Number.isNaN(date.getTime())) return null
  return { month: date.getMonth() + 1, year: date.getFullYear() }
}

const getRoomById = async (roomId: string): Promise<Pick<Room, 'id' | 'name' | 'status'> | null> => {
  const { data, error } = await supabase.from('rooms').select('id,name,status').eq('id', roomId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Pick<Room, 'id' | 'name' | 'status'> | null) || null
}

const getTenantById = async (
  tenantId: string
): Promise<
  Pick<
    Tenant,
    | 'id'
    | 'is_active'
    | 'full_name'
    | 'phone'
    | 'identity_card'
  > | null
> => {
  const { data, error } = await supabase
    .from('tenants')
    .select('id,is_active,full_name,phone,identity_card')
    .eq('id', tenantId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (
    data as Pick<
      Tenant,
      | 'id'
      | 'is_active'
      | 'full_name'
      | 'phone'
      | 'identity_card'
    > | null
  ) || null
}
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
  // Xóa toàn bộ dữ liệu liên quan trước để tránh FK constraint
  await supabase.from('invoices').delete().eq('room_id', id)
  await supabase.from('move_in_receipts').delete().eq('room_id', id)
  await supabase.from('contracts').delete().eq('room_id', id)
  await supabase.from('room_assets').delete().eq('room_id', id)
  await supabase.from('asset_snapshots').delete().eq('room_id', id)
  await supabase.from('room_vehicles').delete().eq('room_id', id)
  await supabase.from('room_asset_adjustments').delete().eq('room_id', id)
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
  await safeQuery(() => supabase.from('move_in_receipts').delete().eq('tenant_id', id))
  await safeQuery(() => supabase.from('asset_snapshots').delete().eq('tenant_id', id))
  await safeQuery(() => supabase.from('invoices').delete().eq('tenant_id', id))
  await safeQuery(() => supabase.from('contracts').delete().eq('tenant_id', id))
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

export const getActiveContracts = async (): Promise<Contract[]> => {
  const data = await safeQuery(() =>
    supabase
      .from('contracts')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
  )
  return data || []
}

export const createContract = async (data: Partial<Contract>): Promise<Contract> => {
  if (!data.room_id) throw new Error('Thiếu room_id khi tạo hợp đồng.')
  if (!data.move_in_date) throw new Error('Thiếu ngày vào ở khi tạo hợp đồng.')

  const room = await getRoomById(data.room_id)
  if (!room) throw new Error('Không tìm thấy phòng.')
  let tenantForContract: Awaited<ReturnType<typeof getTenantById>> = null

  const roomActiveContracts = await safeQuery(() =>
    supabase
      .from('contracts')
      .select('id')
      .eq('room_id', data.room_id as string)
      .eq('status', 'active')
  )
  const activeRoomContracts = (roomActiveContracts || []) as Array<{ id: string }>

  if (activeRoomContracts.length > 0) {
    if (room.status === 'occupied') {
      throw new Error('Phòng đã có hợp đồng đang hiệu lực.')
    }
    await safeQuery(() =>
      supabase
        .from('contracts')
        .update({ status: 'expired' } as any)
        .in(
          'id',
          activeRoomContracts.map((item) => item.id)
        )
    )
  }

  if (data.tenant_id) {
    const tenant = await getTenantById(data.tenant_id)
    if (!tenant || !tenant.is_active) {
      throw new Error('Khách thuê không tồn tại hoặc đã ngừng hoạt động.')
    }
    tenantForContract = tenant

    const tenantActiveContracts = await safeQuery(() =>
      supabase
        .from('contracts')
        .select('id,room_id')
        .eq('tenant_id', data.tenant_id as string)
        .eq('status', 'active')
        .neq('room_id', data.room_id as string)
        .limit(1)
    )
    if ((tenantActiveContracts || []).length > 0) {
      throw new Error('Khách thuê đang có hợp đồng hiệu lực ở phòng khác.')
    }
  }

  const tenantName = (data.tenant_name || tenantForContract?.full_name || '').trim()
  if (!tenantName) {
    throw new Error('Thiếu tên khách thuê khi tạo hợp đồng.')
  }

  const newContract = {
    ...data,
    tenant_name: tenantName,
    tenant_phone: data.tenant_phone || tenantForContract?.phone || undefined,
    tenant_id_card: data.tenant_id_card || tenantForContract?.identity_card || undefined,
    id: createEntityId('contract'),
    status: 'active',
    created_at: new Date().toISOString()
  }
  const result = await safeQuery(() => supabase.from('contracts').insert(newContract).select().single())
  const contract = result as any as Contract
  await supabase.from('rooms').update({ status: 'occupied', tenant_name: contract.tenant_name, tenant_phone: contract.tenant_phone, move_in_date: contract.move_in_date, electric_old: contract.electric_init, electric_new: contract.electric_init, water_old: contract.water_init, water_new: contract.water_init } as any).eq('id', contract.room_id)
  return contract
}

export const updateContract = async (id: string, updates: Partial<Contract>): Promise<Contract> => {
  const result = await safeQuery(() => supabase.from('contracts').update(updates).eq('id', id).select().single())
  return result as any as Contract
}

export const cancelContract = async (id: string, notes?: string): Promise<void> => {
  const { data: contractById, error: contractByIdError } = await supabase
    .from('contracts')
    .select('id,room_id,tenant_id')
    .eq('id', id)
    .maybeSingle()
  if (contractByIdError) throw new Error(contractByIdError.message)

  let contract = contractById
  if (!contract) {
    const { data: contractByRoom, error: contractByRoomError } = await supabase
      .from('contracts')
      .select('id,room_id,tenant_id')
      .eq('room_id', id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (contractByRoomError) throw new Error(contractByRoomError.message)
    contract = contractByRoom
  }

  if (!contract) {
    throw new Error('Không tìm thấy hợp đồng đang hiệu lực để hủy.')
  }

  if (contract?.room_id && contract?.tenant_id) {
    const paidInvoices = await safeQuery(() =>
      supabase
        .from('invoices')
        .select('id')
        .eq('room_id', contract.room_id)
        .eq('tenant_id', contract.tenant_id)
        .in('payment_status', ['paid', 'partial'])
        .limit(1)
    )
    if ((paidInvoices || []).length > 0) {
      throw new Error('Không thể hủy hợp đồng đã có hóa đơn đã thanh toán hoặc thanh toán một phần. Vui lòng dùng chức năng chấm dứt hợp đồng.')
    }
  }

  if (contract?.room_id) {
    await supabase
      .from('rooms')
      .update({ status: 'vacant', tenant_name: null, tenant_phone: null, move_in_date: null } as any)
      .eq('id', contract.room_id)
  }
  if (contract?.room_id && contract?.tenant_id) {
    await supabase
      .from('invoices')
      .update({ payment_status: 'cancelled', note: '[Hủy theo hợp đồng]' } as any)
      .eq('room_id', contract.room_id)
      .eq('tenant_id', contract.tenant_id)
      .in('payment_status', ['unpaid'])
  }
  await safeQuery(() => supabase.from('contracts').update({ status: 'cancelled', notes: notes || '[Hủy hợp đồng]' }).eq('id', contract.id))
}

export const terminateContract = async (data: { room_id: string; contract_id: string; end_date: string; final_electric: number; final_water: number; merge_invoice_ids: string[]; damage_amount: number; damage_note: string; payment_method: PaymentMethod; }): Promise<void> => {
  if (!data.contract_id) throw new Error('Không tìm thấy hợp đồng đang hiệu lực để tất toán.')

  // Fetch room + contract + zone để tính toán tất toán
  const { data: room } = await supabase.from('rooms').select('*').eq('id', data.room_id).maybeSingle()
  if (!room) throw new Error('Không tìm thấy phòng.')
  const { data: contract } = await supabase.from('contracts').select('*').eq('id', data.contract_id).maybeSingle()
  if (!contract) throw new Error('Không tìm thấy hợp đồng.')

  let zone: ServiceZone | null = null
  if (room.service_zone_id) {
    const { data: zoneData } = await supabase.from('service_zones').select('*').eq('id', room.service_zone_id).maybeSingle()
    zone = zoneData || null
  }

  // Giá điện/nước tại thời điểm tất toán
  const electricPrice = (room as any).electric_price || zone?.electric_price || 0
  const waterPrice = (room as any).water_price || zone?.water_price || 0
  const depositHeld = contract.deposit_amount || 0

  // Tính điện/nước cuối kỳ
  const electricOld = (room as Room).electric_new || 0
  const electricUsage = Math.max(0, data.final_electric - electricOld)
  const electricCost = electricUsage * electricPrice
  const waterOld = (room as Room).water_new || 0
  const waterUsage = Math.max(0, data.final_water - waterOld)
  const waterCost = waterUsage * waterPrice

  // Tổng nợ gộp
  let mergedDebtTotal = 0
  if (data.merge_invoice_ids.length > 0) {
    const { data: mergedInvoices } = await supabase.from('invoices').select('total_amount,paid_amount').in('id', data.merge_invoice_ids)
    mergedDebtTotal = (mergedInvoices || []).reduce((sum: number, i: any) => sum + Math.max(0, i.total_amount - i.paid_amount), 0)
  }

  // netDue < 0 → chủ nhà hoàn tiền; > 0 → khách còn thiếu; = 0 → hòa
  const totalCharges = electricCost + waterCost + mergedDebtTotal + (data.damage_amount || 0)
  const depositApplied = Math.min(depositHeld, totalCharges)
  const netDue = totalCharges - depositHeld

  let paymentStatus: PaymentStatus
  if (netDue === 0) {
    paymentStatus = 'paid'
  } else if (netDue < 0) {
    paymentStatus = 'unpaid' // chủ nhà cần hoàn tiền
  } else {
    paymentStatus = depositApplied > 0 ? 'partial' : 'unpaid'
  }

  // Cập nhật phòng và hợp đồng
  await supabase.from('rooms').update({ status: 'vacant', tenant_name: null, tenant_phone: null, move_in_date: null, electric_old: data.final_electric, electric_new: data.final_electric, water_old: data.final_water, water_new: data.final_water, has_move_in_receipt: false } as any).eq('id', data.room_id)
  await supabase.from('contracts').update({ status: 'terminated', end_date: data.end_date, end_note: data.damage_note, final_electric: data.final_electric, final_water: data.final_water }).eq('id', data.contract_id)
  if (data.merge_invoice_ids.length > 0) { await supabase.from('invoices').update({ payment_status: 'merged' }).in('id', data.merge_invoice_ids) }

  // Tạo hóa đơn tất toán
  const endDateObj = new Date(data.end_date)
  await supabase.from('invoices').insert({
    id: createEntityId('inv'),
    room_id: data.room_id,
    tenant_id: contract.tenant_id || '',
    billing_reason: 'contract_end',
    month: endDateObj.getMonth() + 1,
    year: endDateObj.getFullYear(),
    invoice_date: data.end_date,
    billing_period_start: data.end_date,
    billing_period_end: data.end_date,
    electric_old: electricOld,
    electric_new: data.final_electric,
    electric_usage: electricUsage,
    electric_cost: electricCost,
    electric_price_snapshot: electricPrice,
    water_old: waterOld,
    water_new: data.final_water,
    water_usage: waterUsage,
    water_cost: waterCost,
    water_price_snapshot: waterPrice,
    room_cost: 0,
    wifi_cost: 0,
    garbage_cost: 0,
    old_debt: 0,
    total_amount: netDue,
    paid_amount: netDue <= 0 ? 0 : depositApplied,
    payment_status: paymentStatus,
    payment_method: data.payment_method,
    is_settlement: true,
    deposit_applied: depositApplied,
    deposit_amount: depositHeld > 0 ? -depositHeld : 0,
    adjustment_amount: (data.damage_amount || 0) > 0 ? (data.damage_amount || 0) : undefined,
    adjustment_note: (data.damage_amount || 0) > 0 ? (data.damage_note || 'Đền bù thiệt hại tài sản') : undefined,
    damage_amount: data.damage_amount || 0,
    damage_note: data.damage_note || undefined,
    merged_invoice_ids: data.merge_invoice_ids.length > 0 ? data.merge_invoice_ids : undefined,
    merged_debt_total: mergedDebtTotal > 0 ? mergedDebtTotal : undefined,
    created_at: new Date().toISOString(),
  })
}

export const changeRoom = async (data: { old_room_id: string; new_room_id: string; change_date: string; final_electric: number; final_water: number; new_base_rent: number; new_deposit: number; new_electric_init: number; new_water_init: number; }): Promise<void> => {
  const { data: oldContract, error: oldContractError } = await supabase.from('contracts').select('*').eq('room_id', data.old_room_id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (oldContractError) throw new Error(oldContractError.message)
  if (!oldContract) throw new Error('Không tìm thấy hợp đồng cũ')
  await supabase.from('rooms').update({ status: 'vacant', tenant_name: null, tenant_phone: null, move_in_date: null, electric_old: data.final_electric, electric_new: data.final_electric, water_old: data.final_water, water_new: data.final_water, has_move_in_receipt: false } as any).eq('id', data.old_room_id)
  await supabase.from('contracts').update({ status: 'terminated', end_date: data.change_date, end_note: `Chuyển sang phòng ${data.new_room_id}`, final_electric: data.final_electric, final_water: data.final_water }).eq('id', oldContract.id)
  const newContract = { ...oldContract, id: createEntityId('contract'), room_id: data.new_room_id, move_in_date: data.change_date, base_rent: data.new_base_rent, deposit_amount: data.new_deposit, electric_init: data.new_electric_init, water_init: data.new_water_init, status: 'active', created_at: new Date().toISOString() }
  delete (newContract as any).end_date; delete (newContract as any).end_note; await supabase.from('contracts').insert(newContract)
  await supabase.from('rooms').update({ status: 'occupied', tenant_name: oldContract.tenant_name, tenant_phone: oldContract.tenant_phone, move_in_date: data.change_date, electric_old: data.new_electric_init, electric_new: data.new_electric_init, water_old: data.new_water_init, water_new: data.new_water_init } as any).eq('id', data.new_room_id)
}

// =========================================================
// INVOICES
// =========================================================
export const getInvoices = async (): Promise<Invoice[]> => {
  const data = await safeQuery(() => supabase.from('invoices').select('*').order('created_at', { ascending: false }))
  return data || []
}

export const getRoomInvoices = async (): Promise<Invoice[]> => {
  const data = await safeQuery(() =>
    supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
  )
  return data || []
}

export const getInvoicesByRoom = async (roomId: string): Promise<Invoice[]> => {
  const data = await safeQuery(() => supabase.from('invoices').select('*').eq('room_id', roomId).order('created_at', { ascending: false }))
  return data || []
}

export const createInvoice = async (invoiceData: Partial<Invoice>): Promise<Invoice> => {
  if (!invoiceData.room_id) throw new Error('Thiếu room_id khi tạo hóa đơn.')
  if (!invoiceData.tenant_id) throw new Error('Thiếu tenant_id khi tạo hóa đơn.')
  if (!isValidNumber(invoiceData.month) || !isValidNumber(invoiceData.year)) {
    throw new Error('Thiếu kỳ hóa đơn (tháng/năm).')
  }

  const month = invoiceData.month
  const year = invoiceData.year

  if (invoiceData.is_first_month) {
    const { data: migratedContract, error: migratedContractError } = await supabase
      .from('contracts')
      .select('id')
      .eq('room_id', invoiceData.room_id as string)
      .eq('tenant_id', invoiceData.tenant_id as string)
      .eq('status', 'active')
      .eq('is_migration', true)
      .limit(1)

    if (migratedContractError) throw new Error(migratedContractError.message)
    if ((migratedContract || []).length > 0) {
      throw new Error('Khách cũ từ phần mềm khác không được lập hóa đơn tháng đầu.')
    }
  }

  const shouldCheckReasonDuplicate =
    !!invoiceData.billing_reason && !invoiceData.is_first_month && !invoiceData.allow_duplicate

  const duplicateBase = () =>
    supabase
      .from('invoices')
      .select('id')
      .eq('room_id', invoiceData.room_id as string)
      .eq('tenant_id', invoiceData.tenant_id as string)
      .eq('month', month)
      .eq('year', year)
      .neq('payment_status', 'cancelled')

  const checks: any[] = []
  if (invoiceData.is_first_month) {
    checks.push(duplicateBase().eq('is_first_month', true).limit(1))
  } else if (shouldCheckReasonDuplicate) {
    checks.push(duplicateBase().eq('billing_reason', invoiceData.billing_reason as string).limit(1))
  } else {
    checks.push(Promise.resolve({ data: [] }))
  }

  if (!invoiceData.is_first_month && !invoiceData.is_settlement) {
    checks.push(duplicateBase().eq('is_first_month', true).limit(1))
  } else {
    checks.push(Promise.resolve({ data: [] }))
  }

  const [dupRes, firstMonthGateRes] = await Promise.all(checks)
  if ((dupRes?.data || []).length > 0) {
    if (invoiceData.is_first_month) {
      throw new Error('Đã tồn tại hóa đơn tháng đầu cho khách thuê này trong tháng hiện tại.')
    }
    throw new Error('Loại hóa đơn này đã tồn tại cho khách thuê trong cùng tháng.')
  }
  if ((firstMonthGateRes?.data || []).length > 0) {
    throw new Error('Tháng hiện tại đã có hóa đơn tháng đầu; vui lòng tạo từ tháng kế tiếp.')
  }

  const period = normalizeDateToMonthYear(invoiceData.billing_period_start || invoiceData.invoice_date)
  if (invoiceData.is_first_month && period && (period.month !== month || period.year !== year)) {
    throw new Error('Hóa đơn tháng đầu phải trùng tháng/năm vào ở.')
  }

  const { allow_duplicate: _dup, ...invoiceInsertData } = invoiceData as any
  const newInvoice = { ...invoiceInsertData, id: createEntityId('inv'), created_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('invoices').insert(newInvoice).select().single())
  const inv = result as any as Invoice
  if (invoiceData.room_id && !invoiceData.is_settlement) { await supabase.from('rooms').update({ electric_old: inv.electric_new, electric_new: inv.electric_new, water_old: inv.water_new, water_new: inv.water_new } as any).eq('id', invoiceData.room_id) }
  return inv
}

export const updateInvoice = async (id: string, updates: Partial<Invoice>): Promise<Invoice> => {
  const { data: current, error } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!current) throw new Error('Khong tim thay hoa don.')

  const isMoneyFieldUpdated = [
    'room_cost',
    'deposit_amount',
    'wifi_cost',
    'garbage_cost',
    'electric_cost',
    'water_cost',
    'old_debt',
    'adjustment_amount',
    'total_amount'
  ].some((key) => Object.prototype.hasOwnProperty.call(updates, key))

  if (isMoneyFieldUpdated && Number(current.paid_amount || 0) > 0) {
    throw new Error('Hoa don da co giao dich thu tien. Khong duoc sua so tien de tranh sai lech doi soat.')
  }

  const nextTotal = Object.prototype.hasOwnProperty.call(updates, 'total_amount')
    ? Number((updates as any).total_amount || 0)
    : Number(current.total_amount || 0)

  const nextPaid = Object.prototype.hasOwnProperty.call(updates, 'paid_amount')
    ? Number((updates as any).paid_amount || 0)
    : Number(current.paid_amount || 0)

  const nextStatus: PaymentStatus =
    nextPaid <= 0 ? 'unpaid' : nextPaid >= nextTotal ? 'paid' : 'partial'

  const result = await safeQuery(() =>
    supabase
      .from('invoices')
      .update({ ...updates, payment_status: nextStatus } as any)
      .eq('id', id)
      .select()
      .single()
  )

  return result as any as Invoice
}

export const deleteInvoice = async (id: string): Promise<Invoice> => {
  const result = await safeQuery(() => supabase.from('invoices').update({ payment_status: 'cancelled', note: '[Đã hủy phiếu]' } as any).eq('id', id).select().single())
  return result as any as Invoice
}

export const recordInvoicePayment = async (id: string, data: { amount: number; payment_method: PaymentMethod; payment_date: string; note?: string }): Promise<Invoice> => {
  const { data: inv, error } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!inv) throw new Error('Không tìm thấy hóa đơn.')
  const newPaidAmount = (inv.paid_amount || 0) + data.amount
  const record = { id: createEntityId('pay'), amount: data.amount, payment_method: data.payment_method, payment_date: data.payment_date, note: data.note, created_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('invoices').update({ paid_amount: newPaidAmount, payment_status: newPaidAmount >= inv.total_amount ? 'paid' : 'partial', payment_method: data.payment_method, payment_date: data.payment_date, payment_records: [...(inv.payment_records || []), record] } as any).eq('id', id).select().single())

  // Khi thu tiền cọc bổ sung → cộng vào tổng cọc đang giữ của hợp đồng
  if (inv.billing_reason === 'deposit_collect' && inv.room_id) {
    const { data: activeContracts } = await supabase
      .from('contracts')
      .select('id, deposit_amount')
      .eq('room_id', inv.room_id)
      .eq('status', 'active')
      .limit(1)
    if (activeContracts && activeContracts.length > 0) {
      const contract = activeContracts[0]
      await supabase
        .from('contracts')
        .update({ deposit_amount: (contract.deposit_amount || 0) + data.amount })
        .eq('id', contract.id)
    }
  }

  return result as any as Invoice
}

// =========================================================
// ASSETS & SNAPSHOTS
// =========================================================
export const getRoomAssets = async (roomId: string): Promise<RoomAsset[]> => {
  const data = await safeQuery(() => supabase.from('room_assets').select('*').eq('room_id', roomId).order('sort_order', { ascending: true }))
  return data || []
}

export const getAllRoomAssets = async (): Promise<RoomAsset[]> => {
  const data = await safeQuery(() => supabase.from('room_assets').select('*').order('sort_order', { ascending: true }))
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

export const getAssetSnapshotsByRoomIds = async (
  roomIds: string[],
  types?: Array<AssetSnapshot['type']>
): Promise<AssetSnapshot[]> => {
  if (roomIds.length === 0) return []
  let q = supabase.from('asset_snapshots').select('*').in('room_id', roomIds)
  if (types && types.length > 0) q = q.in('type', types)
  const data = await safeQuery(() => q.order('recorded_at', { ascending: false }))
  return data || []
}

export const createAssetSnapshots = async (data: Partial<AssetSnapshot>[]): Promise<AssetSnapshot[]> => {
  if (data.length === 0) return []

  const replacedGroups = new Set<string>()
  for (const snap of data) {
    if (!snap.room_id || !snap.type) continue
    const key = `${snap.room_id}|${snap.type}`
    if (replacedGroups.has(key)) continue
    replacedGroups.add(key)
    await safeQuery(() =>
      supabase
        .from('asset_snapshots')
        .delete()
        .eq('room_id', snap.room_id as string)
        .eq('type', snap.type as string)
    )
  }

  const recordedAt = new Date().toISOString()
  const snaps = data.map(s => ({ ...s, id: createEntityId('snap'), recorded_at: recordedAt }))
  const result = await safeQuery(() => supabase.from('asset_snapshots').insert(snaps).select())
  return result as any as AssetSnapshot[]
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

export const getInvoicePaymentRecords = (invoice: Invoice): InvoicePaymentRecord[] => invoice.payment_records || []

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

export const getRoomMoveInReceipts = async (): Promise<MoveInReceipt[]> => {
  const data = await safeQuery(() =>
    supabase
      .from('move_in_receipts')
      .select('*')
      .order('created_at', { ascending: false })
  )
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
  const client = supabaseAdmin ?? supabase
  const data = await safeQuery(() =>
    client.from('users').select('*').order('created_at', { ascending: false })
  )
  return (data || []).map((row) => buildAppUser(row as Record<string, unknown>))
}

export const createUser = async (data: Partial<AppUser>): Promise<AppUser> => {
  const newUser = { ...data, id: createEntityId('user'), status: 'active', created_at: new Date().toISOString() }
  const result = await safeQuery(() => supabase.from('users').insert(newUser).select().single())
  return buildAppUser((result || {}) as Record<string, unknown>)
}

export const createUserViaAdmin = async (data: {
  email: string
  password: string
  full_name: string
  username?: string
  role?: UserRole
}): Promise<AppUser> => {
  if (!supabaseAdmin) {
    throw new Error('Chức năng tạo tài khoản yêu cầu VITE_SUPABASE_SERVICE_ROLE_KEY trong file .env')
  }
  const { data: authData, error } = await supabaseAdmin.auth.admin.createUser({
    email: data.email.trim(),
    password: data.password,
    email_confirm: true,
    user_metadata: {
      full_name: data.full_name.trim(),
      username: (data.username || data.email.split('@')[0]).trim()
    }
  })
  if (error) throw new Error(error.message)

  if (data.role === 'admin' && authData.user) {
    await supabase.from('users').update({ role: 'admin' }).eq('id', authData.user.id)
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user!.id)
    .maybeSingle()

  return buildAppUser(
    (profile || {
      id: authData.user!.id,
      email: authData.user!.email,
      full_name: data.full_name.trim(),
      username: (data.username || data.email.split('@')[0]).trim(),
      role: data.role || 'user',
      status: 'active',
      created_at: authData.user!.created_at
    }) as Record<string, unknown>
  )
}

export const updateUser = async (id: string, updates: Partial<AppUser>): Promise<AppUser> => {
  const client = supabaseAdmin ?? supabase
  const result = await safeQuery(() => client.from('users').update(updates).eq('id', id).select().single())
  return buildAppUser((result || {}) as Record<string, unknown>)
}

export const updateUserRole = async (userId: string, role: UserRole): Promise<AppUser> => { return updateUser(userId, { role }) }
export const updateUserStatus = async (userId: string, status: UserStatus): Promise<AppUser> => { return updateUser(userId, { status }) }
export const updateUserProfile = async (userId: string, data: { full_name: string }): Promise<AppUser> => { return updateUser(userId, data) }
export const resetUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  if (!supabaseAdmin) throw new Error('Chức năng đổi mật khẩu yêu cầu VITE_SUPABASE_SERVICE_ROLE_KEY trong file .env')
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) throw new Error(error.message)
}

export const changeOwnPassword = async (newPassword: string): Promise<void> => {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(error.message)
}

export const deleteUser = async (id: string): Promise<void> => {
  if (!supabaseAdmin) throw new Error('Chức năng xóa tài khoản yêu cầu VITE_SUPABASE_SERVICE_ROLE_KEY trong file .env')
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (error) throw new Error(error.message)
}

export const getCurrentSessionUser = async (): Promise<AppUser | null> => {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  console.log('[Auth] getSession:', session ? `HAS SESSION (user: ${session.user?.email})` : 'NO SESSION', sessionError || '')
  if (sessionError) throw new Error(sessionError.message)
  if (!session?.user) return null
  const user = session.user

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) throw new Error(profileError.message)

  const appUser = buildAppUser((profile || { id: user.id }) as Record<string, unknown>, user)
  if (appUser.status !== 'active') {
    await supabase.auth.signOut()
    throw new Error('Tài khoản đã bị vô hiệu hóa.')
  }

  return appUser
}

export const signInUser = async (email: string, password: string): Promise<AppUser> => {
  const normalizedEmail = email.trim()
  if (!normalizedEmail || !password) {
    throw new Error('Vui lòng nhập email và mật khẩu.')
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password
  })
  if (error) throw new Error(error.message)

  const user = await getCurrentSessionUser()
  if (!user) throw new Error('Không thể tải thông tin tài khoản sau khi đăng nhập.')
  return user
}

export const signOutUser = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

// =========================================================
// COMPATIBILITY (LEGACY)
// =========================================================
export const dbOptions = { readDB: () => ({ users: [], app_settings: {} }), writeDB: () => { } }
export async function getDB() { return {} }

// =========================================================
// ROOM IMAGES
// =========================================================
const compressImage = (file: File, maxWidth = 1200, quality = 0.75): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Nén ảnh thất bại')), 'image/jpeg', quality)
    }
    img.onerror = () => reject(new Error('Không đọc được file ảnh'))
    img.src = url
  })

export const uploadRoomImage = async (roomId: string, file: File): Promise<string> => {
  const compressed = await compressImage(file)
  const path = `${roomId}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from('room-images').upload(path, compressed, { contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  return supabase.storage.from('room-images').getPublicUrl(path).data.publicUrl
}

export const deleteRoomImage = async (url: string): Promise<void> => {
  const path = url.split('/room-images/')[1]
  if (!path) return
  await supabase.storage.from('room-images').remove([path])
}






