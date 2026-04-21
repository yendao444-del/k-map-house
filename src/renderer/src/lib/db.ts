// Tiện ích quản lý Database Offline
// Lưu dữ liệu vào file JSON qua Electron IPC (bền vững, không mất khi reload)
// Fallback sang localStorage khi chạy ngoài Electron (dev browser)

import bcrypt from 'bcryptjs'

export type RoomStatus = 'vacant' | 'occupied' | 'maintenance' | 'ending'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'merged' | 'cancelled'
export type PaymentMethod = 'cash' | 'transfer'
export type UserRole = 'admin' | 'user'
export type UserStatus = 'active' | 'inactive'

export interface AppUser {
  id: string
  username: string
  full_name: string
  password_hash?: string
  role: UserRole
  status: UserStatus
  last_login_at?: string
  created_at: string
}

export interface InvoicePaymentRecord {
  id: string
  amount: number
  payment_method?: PaymentMethod
  payment_date: string
  note?: string
  created_at: string
}

export interface ServiceZone {
  id: string
  name: string
  electric_price: number
  water_price: number
  internet_price: number
  cleaning_price: number
  created_at: string
}

type ServiceZonePayload = Partial<ServiceZone> & {
  selectedRooms?: string[]
}

export interface Room {
  id: string
  name: string
  floor: number
  base_rent: number
  status: RoomStatus
  created_at: string
  service_zone_id?: string
  area?: number
  max_occupants?: number
  default_deposit?: number
  invoice_day?: number
  billing_cycle?: string
  notes?: string
  move_in_date?: string
  contract_expiration?: string
  // Tenant info combined for Phase 4
  tenant_name?: string
  tenant_phone?: string
  tenant_email?: string
  tenant_id_card?: string

  electric_old?: number
  electric_new?: number
  water_old?: number
  water_new?: number
  old_debt?: number
  max_vehicles?: number
  has_move_in_receipt?: boolean
  expected_end_date?: string

  // deprecated fallback fields
  electric_price?: number
  water_price?: number
  wifi_price?: number
  garbage_price?: number
}

export interface Tenant {
  id: string
  full_name: string
  phone?: string
  email?: string
  identity_card?: string
  id_card_issued_date?: string
  id_card_issued_place?: string
  address?: string
  identity_image_url?: string
  notes?: string
  is_active: boolean // false = đã rời đi hoàn toàn
  last_room_name?: string
  left_at?: string
  created_at: string
  updated_at: string
}

export interface Invoice {
  id: string
  room_id: string
  tenant_id: string
  billing_reason?: string
  month: number
  year: number
  invoice_date?: string
  due_date?: string
  billing_period_start?: string
  billing_period_end?: string
  electric_old: number
  electric_new: number
  electric_usage: number
  electric_cost: number
  water_old: number
  water_new: number
  water_usage: number
  water_cost: number
  room_cost: number
  wifi_cost: number
  garbage_cost: number
  old_debt: number
  total_amount: number
  adjustment_amount?: number
  adjustment_note?: string
  note?: string
  paid_amount: number
  payment_status: PaymentStatus
  payment_method?: PaymentMethod
  payment_date?: string
  payment_records?: InvoicePaymentRecord[]
  is_first_month?: boolean
  is_settlement?: boolean
  deposit_amount?: number
  deposit_applied?: number // tiền cọc dùng để đối trừ khi tất toán
  damage_amount?: number // đền bù hỏng hóc
  damage_note?: string
  merged_invoice_ids?: string[] // ID các hóa đơn nợ đã gộp vào đây
  merged_debt_total?: number // tổng nợ đã gộp
  electric_price_snapshot?: number // snapshot giá điện tại thời điểm tất toán
  water_price_snapshot?: number
  prorata_days?: number

  // Logic chuyển đổi phòng lập hóa đơn gộp (chỉ dùng cho is_first_month của HĐ mới luân chuyển từ phòng khác)
  has_transfer?: boolean
  transfer_old_room_name?: string
  transfer_days?: number
  transfer_room_cost?: number
  transfer_electric_cost?: number
  transfer_water_cost?: number
  transfer_service_cost?: number
  transfer_electric_usage?: number
  transfer_water_usage?: number

  new_room_days?: number
  new_room_cost?: number
  new_room_service_cost?: number

  created_at: string
}

export type ContractStatus = 'active' | 'expired' | 'terminated' | 'cancelled'

export interface Contract {
  id: string
  room_id: string
  tenant_name: string
  tenant_phone?: string
  tenant_id_card?: string
  tenant_id_card_issued_date?: string
  tenant_id_card_issued_place?: string
  tenant_address?: string
  tenant_dob?: string
  occupant_count: number
  move_in_date: string
  duration_months: number // 0 = không xác định
  expiration_date?: string
  base_rent: number
  deposit_amount: number
  billing_cycle: number // số tháng/lần thu, thường = 1
  invoice_day: number // ngày trong tháng lập HĐ
  electric_init: number
  water_init: number
  status: ContractStatus
  notes?: string
  created_at: string
  // Lịch sử kết thúc hợp đồng
  end_date?: string // ngày trả phòng thực tế
  end_note?: string
  final_electric?: number // chỉ số điện lúc trả phòng
  final_water?: number
  tenant_id?: string // link sang Tenant để truy vết lịch sử

  // Nhập dữ liệu chuyển đổi (migration): không sinh hóa đơn tháng đầu
  is_migration?: boolean
  migration_debt?: number // nợ tồn đọng từ trước khi dùng phần mềm

  // Dữ liệu chuyển phòng: dùng để tạo hóa đơn gộp cuối tháng
  transfer_history?: {
    old_room_name: string
    change_date: string
    old_electric_old: number
    old_electric_new: number
    old_electric_price: number
    old_water_old: number
    old_water_new: number
    old_water_price: number
    old_base_rent: number
    old_wifi_price: number
    old_garbage_price: number
    history_billed_in_invoice_id?: string
  }
}

export interface MoveInReceipt {
  id: string
  room_id: string
  tenant_id?: string // liên kết khách thuê để tra cứu lịch sử cọc
  move_in_date: string
  deposit_amount: number
  prorata_days: number
  prorata_amount: number
  next_month_rent: number
  electric_init: number
  water_init: number
  total_amount: number
  payment_status: PaymentStatus
  payment_method?: PaymentMethod
  payment_date?: string
  created_at: string
}

export type CashTransactionType = 'income' | 'expense'
export type CashTransactionCategory =
  | 'electric'
  | 'water'
  | 'internet'
  | 'cleaning'
  | 'maintenance'
  | 'management'
  | 'software'
  | 'other_income'
  | 'other_expense'

export interface CashTransaction {
  id: string
  type: CashTransactionType
  category: CashTransactionCategory
  transaction_date: string
  amount: number
  room_id?: string
  payment_method?: PaymentMethod
  note?: string
  created_at: string
  updated_at: string
}

export interface AssetTemplate {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}

export type AssetType = 'furniture' | 'appliance' | 'plumbing' | 'electrical'

export interface RoomAsset {
  id: string
  room_id: string
  name: string
  quantity: number
  sort_order: number
  type?: AssetType
  status?: 'ok' | 'error' | 'repairing'
  issue_note?: string
  icon?: string
  repairman_name?: string
  repairman_phone?: string
  repair_called_at?: string
  repaired_at?: string
}

export interface RoomAssetAdjustment {
  id: string
  room_id: string
  room_asset_id?: string
  action: 'add' | 'update'
  asset_name: string
  previous_name?: string
  new_name?: string
  previous_quantity?: number
  new_quantity?: number
  reason: string
  recorded_at: string
}

export interface AssetSnapshot {
  id: string
  room_id: string
  tenant_id?: string
  room_asset_id: string
  type: 'move_in' | 'move_out' | 'handover'
  condition: string
  deduction: number
  note?: string
  recorded_at: string
}

export interface RoomVehicle {
  id: string
  room_id: string
  owner_name?: string
  license_plate: string
  vehicle_type?: string
  brand?: string
  color?: string
  registered_at: string
}

export interface AppSettings {
  bank_id?: string
  account_no?: string
  account_name?: string
  property_name?: string
  property_address?: string
  property_owner_name?: string
  property_owner_phone?: string
  property_owner_id_card?: string
  notification_read_ids?: string[]
}

interface DBState {
  rooms: Room[]
  users: AppUser[]
  tenants: Tenant[]
  invoices: Invoice[]
  service_zones: ServiceZone[]
  app_settings: AppSettings
  asset_templates: AssetTemplate[]
  room_assets: RoomAsset[]
  room_asset_adjustments: RoomAssetAdjustment[]
  asset_snapshots: AssetSnapshot[]
  room_vehicles: RoomVehicle[]
  move_in_receipts: MoveInReceipt[]
  contracts: Contract[]
  cash_transactions: CashTransaction[]
}

// ==========================
// STORAGE ENGINE: IPC File > localStorage fallback
// ==========================

const DB_KEY = 'phongtro_db_v1'

// Kiểm tra xem có đang chạy trong Electron không
function isElectron(): boolean {
  return !!(window as any).api?.db
}

// In-memory cache để tránh gọi IPC liên tục (sync-like API)
let _dbCache: DBState | null = null
let _cacheReady = false

function createEntityId(prefix: string): string {
  const cryptoApi = (globalThis as any).crypto
  if (cryptoApi?.randomUUID) {
    return `${prefix}-${cryptoApi.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function toIsoDate(value?: string): string {
  if (!value) return new Date().toISOString().split('T')[0]
  return value.includes('T') ? value.split('T')[0] : value
}

function buildLegacyInvoicePaymentRecord(invoice: Partial<Invoice>): InvoicePaymentRecord[] {
  const paidAmount = Math.max(0, Number(invoice.paid_amount || 0))
  if (paidAmount <= 0) return []

  const createdAt = invoice.created_at || new Date().toISOString()
  return [
    {
      id: createEntityId('invpay'),
      amount: paidAmount,
      payment_method: invoice.payment_method,
      payment_date: toIsoDate(invoice.payment_date || invoice.invoice_date || createdAt),
      note: invoice.note?.trim() || undefined,
      created_at: createdAt
    }
  ]
}

export const getInvoicePaymentRecords = (invoice: Partial<Invoice>): InvoicePaymentRecord[] => {
  if (Array.isArray(invoice.payment_records) && invoice.payment_records.length > 0) {
    return invoice.payment_records
      .map((record) => ({
        ...record,
        amount: Math.max(0, Number(record.amount || 0)),
        payment_date: toIsoDate(record.payment_date || record.created_at),
        created_at: record.created_at || new Date().toISOString(),
        note: record.note?.trim() || undefined
      }))
      .filter((record) => record.amount > 0)
      .sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime())
  }

  return buildLegacyInvoicePaymentRecord(invoice)
}

function applyInvoicePaymentSummary(invoice: Invoice): Invoice {
  const records = getInvoicePaymentRecords(invoice)
  const paidAmount = records.reduce((sum, record) => sum + record.amount, 0)
  const latestRecord = records[records.length - 1]
  let paymentStatus: PaymentStatus = 'unpaid'

  if (invoice.payment_status === 'cancelled' || invoice.payment_status === 'merged') {
    paymentStatus = invoice.payment_status
  } else if (paidAmount <= 0) {
    paymentStatus = 'unpaid'
  } else if (paidAmount >= Math.max(0, invoice.total_amount || 0)) {
    paymentStatus = 'paid'
  } else {
    paymentStatus = 'partial'
  }

  return {
    ...invoice,
    paid_amount: paidAmount,
    payment_status: paymentStatus,
    payment_method: latestRecord?.payment_method,
    payment_date: latestRecord?.payment_date,
    payment_records: records
  }
}

function repairDuplicateRoomAssetIds(db: any): void {
  const seen = new Set<string>()
  for (const asset of db.room_assets || []) {
    if (!asset.id || seen.has(asset.id)) {
      asset.id = createEntityId('rasset')
    }
    seen.add(asset.id)
  }
}

function ensureBaseStructure(db: any): DBState {
  if (!db.rooms) db.rooms = []
  if (!db.users) db.users = []
  if (!db.tenants) db.tenants = []
  if (!db.invoices) db.invoices = []
  if (!db.service_zones) db.service_zones = []
  if (!db.app_settings) db.app_settings = {}
  if (!db.asset_templates) db.asset_templates = []
  if (!db.room_assets) db.room_assets = []
  if (!db.room_asset_adjustments) db.room_asset_adjustments = []
  if (!db.asset_snapshots) db.asset_snapshots = []
  if (!db.room_vehicles) db.room_vehicles = []
  if (!db.move_in_receipts) db.move_in_receipts = []
  if (!db.contracts) db.contracts = []
  if (!db.cash_transactions) db.cash_transactions = []
  if (Array.isArray(db.invoices)) {
    db.invoices = db.invoices.map((invoice: Invoice) => applyInvoicePaymentSummary(invoice))
  }
  repairDuplicateRoomAssetIds(db)

  // Seed default templates if empty (first run update)
  if (db.asset_templates.length === 0) {
    db.asset_templates = [
      { id: `tmpl-1`, name: 'Điều hòa', sort_order: 1, is_active: true },
      { id: `tmpl-2`, name: 'Giường', sort_order: 2, is_active: true },
      { id: `tmpl-3`, name: 'Tủ quần áo', sort_order: 3, is_active: true },
      { id: `tmpl-4`, name: 'Bàn + Ghế', sort_order: 4, is_active: true },
      { id: `tmpl-5`, name: 'Bóng đèn', sort_order: 5, is_active: true },
      { id: `tmpl-6`, name: 'Quạt', sort_order: 6, is_active: true },
      { id: `tmpl-7`, name: 'Khóa cửa', sort_order: 7, is_active: true },
      { id: `tmpl-8`, name: 'Vòi nước nóng lạnh', sort_order: 8, is_active: true }
    ]
  }

  return ensureServiceZones(db)
}

// Khởi tạo cache từ IPC (gọi 1 lần khi app boot)
async function initCache(): Promise<DBState> {
  if (_cacheReady && _dbCache) return _dbCache

  let data: DBState | null = null

  if (isElectron()) {
    const raw = (await window.api.db.read()) as DBState | null
    if (raw) {
      data = ensureBaseStructure(raw)
    }
  } else {
    // Fallback: localStorage cho dev browser
    const rawStr = localStorage.getItem(DB_KEY)
    if (rawStr) {
      try {
        data = ensureBaseStructure(JSON.parse(rawStr))
      } catch {
        /* ignore */
      }
    }
  }

  if (!data) {
    data = createSeedData()
    await persistDB(data)
  }

  _dbCache = data
  _cacheReady = true
  return data
}

// Ghi DB ra file (async) + cập nhật cache
async function persistDB(state: DBState): Promise<void> {
  _dbCache = state
  if (isElectron()) {
    await window.api.db.write(state)
  } else {
    localStorage.setItem(DB_KEY, JSON.stringify(state))
  }
}

// Đảm bảo có service_zones (migration cũ)
function ensureServiceZones(parsed: any): DBState {
  if (!parsed.service_zones) {
    parsed.service_zones = [
      {
        id: 'zone-1',
        name: 'Vùng Mặc Định',
        electric_price: 3500,
        water_price: 20000,
        internet_price: 100000,
        cleaning_price: 20000,
        created_at: new Date().toISOString()
      }
    ]
    parsed.rooms?.forEach((r: any) => {
      if (!r.service_zone_id) r.service_zone_id = 'zone-1'
    })
  }
  if (!parsed.tenants) parsed.tenants = []
  if (!parsed.invoices) parsed.invoices = []
  if (!parsed.cash_transactions) parsed.cash_transactions = []
  return parsed as DBState
}

// Seed data cho lần đầu
function createSeedData(): DBState {
  const initialZones: ServiceZone[] = [
    {
      id: 'zone-1',
      name: 'Vùng Tiêu Chuẩn',
      electric_price: 3500,
      water_price: 20000,
      internet_price: 100000,
      cleaning_price: 20000,
      created_at: new Date().toISOString()
    },
    {
      id: 'zone-2',
      name: 'Vùng Cao Cấp',
      electric_price: 4000,
      water_price: 25000,
      internet_price: 150000,
      cleaning_price: 30000,
      created_at: new Date().toISOString()
    }
  ]

  const initialRooms: Room[] = []

  return {
    rooms: initialRooms,
    users: [],
    tenants: [],
    invoices: [],
    service_zones: initialZones,
    app_settings: {},
    asset_templates: [
      { id: `tmpl-1`, name: 'Điều hòa', sort_order: 1, is_active: true },
      { id: `tmpl-2`, name: 'Giường', sort_order: 2, is_active: true },
      { id: `tmpl-3`, name: 'Tủ quần áo', sort_order: 3, is_active: true },
      { id: `tmpl-4`, name: 'Bàn + Ghế', sort_order: 4, is_active: true },
      { id: `tmpl-5`, name: 'Bóng đèn', sort_order: 5, is_active: true },
      { id: `tmpl-6`, name: 'Quạt', sort_order: 6, is_active: true },
      { id: `tmpl-7`, name: 'Khóa cửa', sort_order: 7, is_active: true },
      { id: `tmpl-8`, name: 'Vòi nước nóng lạnh', sort_order: 8, is_active: true }
    ],
    room_assets: [],
    room_asset_adjustments: [],
    asset_snapshots: [],
    room_vehicles: [],
    move_in_receipts: [],
    contracts: [],
    cash_transactions: []
  }
}

// Compat: đồng bộ readDB/writeDB cho các nơi khác dùng
export const dbOptions = {
  readDB: (): DBState => {
    // Trả cache (đã được khởi tạo trước)
    if (_dbCache) return _dbCache
    // Fallback nếu cache chưa sẵn sàng (edge case)
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = ensureServiceZones(JSON.parse(raw))
      _dbCache = parsed
      return parsed
    }
    const seed = createSeedData()
    _dbCache = seed
    return seed
  },
  writeDB: (state: DBState) => {
    _dbCache = state
    persistDB(state) // fire-and-forget
  }
}

// Boot: khởi tạo cache ngay khi module load
const _bootPromise = initCache()

// Helper: đảm bảo cache đã sẵn sàng trước khi đọc
async function getDB(): Promise<DBState> {
  await _bootPromise
  if (!_dbCache) {
    _dbCache = createSeedData()
    await persistDB(_dbCache)
  }
  return _dbCache
}

// ==========================
// MỘT SỐ HÀM API GIẢ LẬP NHƯ SUPABASE
// ==========================

// --- ROOMS ---
const normalizeRoomName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN')

const formatRoomName = (name: string) => {
  const cleanedName = name.trim().replace(/\s+/g, ' ')
  if (!cleanedName) return ''
  return /^phòng\s+/i.test(cleanedName) ? cleanedName : `Phòng ${cleanedName}`
}

const assertUniqueRoomName = (rooms: Room[], name: string, ignoreRoomId?: string) => {
  const normalizedName = normalizeRoomName(name)
  if (!normalizedName) throw new Error('Tên phòng không được để trống.')
  const duplicated = rooms.some(
    (room) => room.id !== ignoreRoomId && normalizeRoomName(room.name || '') === normalizedName
  )
  if (duplicated) {
    throw new Error('Tên phòng này đã tồn tại. Vui lòng nhập tên khác.')
  }
}

export const getRooms = async (): Promise<Room[]> => {
  const db = await getDB()
  return db.rooms.map((room) => ({ ...room }))
}

export const createRoom = async (roomData: Partial<Room>): Promise<Room> => {
  const db = await getDB()
  const roomName = formatRoomName(roomData.name || '')
  assertUniqueRoomName(db.rooms, roomName)
  const newRoom: Room = {
    ...roomData,
    id: `room-${Date.now()}`,
    name: roomName,
    floor: roomData.floor || 1,
    base_rent: roomData.base_rent || 0,
    service_zone_id: roomData.service_zone_id || 'zone-1',
    status: 'vacant',
    electric_old: 0,
    electric_new: 0,
    water_old: 0,
    water_new: 0,
    created_at: new Date().toISOString()
  }
  // Add slowly at the beginning
  db.rooms.unshift(newRoom)
  await persistDB(db)
  return newRoom
}

export const updateRoom = async (id: string, updates: Partial<Room>): Promise<Room> => {
  const db = await getDB()
  const index = db.rooms.findIndex((r) => r.id === id)
  if (index === -1) throw new Error('Room not found')
  const cleanUpdates = { ...updates }
  if (typeof cleanUpdates.name === 'string') {
    cleanUpdates.name = formatRoomName(cleanUpdates.name)
    assertUniqueRoomName(db.rooms, cleanUpdates.name, id)
  }
  db.rooms[index] = { ...db.rooms[index], ...cleanUpdates }
  await persistDB(db)
  return db.rooms[index]
}

export const deleteRoom = async (id: string): Promise<void> => {
  const db = await getDB()
  const roomName = db.rooms.find((r) => r.id === id)?.name

  // Khi xóa phòng: tự động đóng hợp đồng đang active + cập nhật trạng thái tenant
  const activeContracts = (db.contracts || []).filter(
    (c) => c.room_id === id && c.status === 'active'
  )
  for (const contract of activeContracts) {
    const contractIdx = db.contracts.findIndex((c) => c.id === contract.id)
    if (contractIdx !== -1) {
      db.contracts[contractIdx].status = 'expired'
      db.contracts[contractIdx].end_date = new Date().toISOString().split('T')[0]
      db.contracts[contractIdx].end_note = 'Phòng bị xóa khỏi hệ thống'
    }
    // Cập nhật trạng thái tenant: đánh dấu đã rời đi
    if (contract.tenant_id) {
      const tenantIdx = (db.tenants || []).findIndex((t) => t.id === contract.tenant_id)
      if (tenantIdx !== -1) {
        db.tenants[tenantIdx].is_active = false
        db.tenants[tenantIdx].last_room_name = roomName || db.tenants[tenantIdx].last_room_name
        db.tenants[tenantIdx].left_at = new Date().toISOString().split('T')[0]
        db.tenants[tenantIdx].updated_at = new Date().toISOString()
      }
    }
  }

  db.rooms = db.rooms.filter((r) => r.id !== id)
  await persistDB(db)
}

// Đánh dấu khách đã chuyển đi thủ công (khi chưa muốn tất toán hợp đồng chính thức)
export const markTenantLeft = async (tenantId: string): Promise<Tenant> => {
  const db = await getDB()
  const tenantIdx = (db.tenants || []).findIndex((t) => t.id === tenantId)
  if (tenantIdx === -1) throw new Error('Tenant not found')
  let latestRoomName = db.tenants[tenantIdx].last_room_name

  // Đóng hợp đồng active của khách này
  const activeContracts = (db.contracts || []).filter(
    (c) => c.tenant_id === tenantId && c.status === 'active'
  )
  for (const contract of activeContracts) {
    const contractIdx = db.contracts.findIndex((c) => c.id === contract.id)
    if (contractIdx !== -1) {
      db.contracts[contractIdx].status = 'expired'
      db.contracts[contractIdx].end_date = new Date().toISOString().split('T')[0]
      db.contracts[contractIdx].end_note = 'Đánh dấu thủ công: khách đã chuyển đi'
    }
    // Reset phòng về vacant nếu phòng đó vẫn occupied bởi khách này
    const roomIdx = db.rooms.findIndex((r) => r.id === contract.room_id)
    if (roomIdx !== -1 && db.rooms[roomIdx].status === 'occupied') {
      latestRoomName = db.rooms[roomIdx].name || latestRoomName
      db.rooms[roomIdx].status = 'vacant'
      db.rooms[roomIdx].tenant_name = undefined
      db.rooms[roomIdx].tenant_phone = undefined
      db.rooms[roomIdx].move_in_date = undefined
    }
  }

  db.tenants[tenantIdx].is_active = false
  db.tenants[tenantIdx].last_room_name = latestRoomName
  db.tenants[tenantIdx].left_at = new Date().toISOString().split('T')[0]
  db.tenants[tenantIdx].updated_at = new Date().toISOString()

  await persistDB(db)
  return db.tenants[tenantIdx]
}

// --- SERVICE ZONES ---
export const getServiceZones = async (): Promise<ServiceZone[]> => {
  const db = await getDB()
  return (db.service_zones || []).map((zone) => ({ ...zone }))
}

export const createServiceZone = async (zoneData: ServiceZonePayload): Promise<ServiceZone> => {
  const db = await getDB()
  const newZone: ServiceZone = {
    id: `zone-${Date.now()}`,
    name: zoneData.name || 'Vùng Mới',
    electric_price: zoneData.electric_price || 3500,
    water_price: zoneData.water_price || 20000,
    internet_price: zoneData.internet_price || 100000,
    cleaning_price: zoneData.cleaning_price || 20000,
    created_at: new Date().toISOString()
  }
  db.service_zones.push(newZone)
  if (zoneData.selectedRooms?.length) {
    db.rooms.forEach((room) => {
      if (zoneData.selectedRooms!.includes(room.id)) {
        room.service_zone_id = newZone.id
      }
    })
  }
  await persistDB(db)
  return newZone
}

export const updateServiceZone = async (
  id: string,
  updates: ServiceZonePayload
): Promise<ServiceZone> => {
  const db = await getDB()
  const index = db.service_zones.findIndex((z) => z.id === id)
  if (index === -1) throw new Error('Zone not found')
  db.service_zones[index] = { ...db.service_zones[index], ...updates }
  if (updates.selectedRooms) {
    const selectedRoomIds = new Set(updates.selectedRooms)
    db.rooms.forEach((room) => {
      if (selectedRoomIds.has(room.id)) {
        room.service_zone_id = id
      } else if (room.service_zone_id === id) {
        delete room.service_zone_id
      }
    })
  }
  await persistDB(db)
  return db.service_zones[index]
}

export const deleteServiceZone = async (id: string): Promise<void> => {
  try {
    const db = await getDB()
    // Không cho xóa zone mặc định
    if (id === 'zone-1') throw new Error('DEFAULT_ZONE')

    // Kiểm tra zone có tồn tại không
    const zoneExists = db.service_zones.some((z) => z.id === id)
    if (!zoneExists) throw new Error('ZONE_NOT_FOUND')

    // Chuyển các phòng thuộc zone bị xóa về zone mặc định
    db.rooms.forEach((r) => {
      if (r.service_zone_id === id) r.service_zone_id = 'zone-1'
    })
    db.service_zones = db.service_zones.filter((z) => z.id !== id)
    await persistDB(db)
  } catch (err: any) {
    if (err.message === 'DEFAULT_ZONE') {
      throw new Error('Không thể xóa khu vực mặc định')
    } else if (err.message === 'ZONE_NOT_FOUND') {
      throw new Error('Khu vực không tồn tại')
    } else {
      throw new Error('Xóa khu vực thất bại: ' + (err.message || 'Lỗi không xác định'))
    }
  }
}

// --- CONTRACTS ---
export const getContracts = async (): Promise<Contract[]> => {
  const db = await getDB()
  return db.contracts || []
}

export const getContractByRoom = async (roomId: string): Promise<Contract | null> => {
  const db = await getDB()
  return (db.contracts || []).find((c) => c.room_id === roomId && c.status === 'active') || null
}

export const createContract = async (data: Partial<Contract>): Promise<Contract> => {
  const db = await getDB()
  const roomId = data.room_id || ''
  const room = db.rooms.find((r) => r.id === roomId)
  const blockingActiveContract = (db.contracts || []).find(
    (contract) => contract.room_id === roomId && contract.status === 'active'
  )

  // 1. Chặn khi phòng chưa kết thúc hợp đồng cũ thật sự
  if (blockingActiveContract) {
    // Hợp đồng "active" nhưng đã có phiếu tất toán → data inconsistency (test nhiều lần)
    const hasSettlement = (db.invoices || []).some(
      (i) =>
        i.room_id === roomId &&
        i.tenant_id === blockingActiveContract.tenant_id &&
        i.is_settlement === true
    )

    const canAutoExpire = room?.status === 'vacant' || room?.status === 'ending' || hasSettlement

    if (!canAutoExpire) {
      // Phòng đang có khách thật sự + có hợp đồng active → không cho tạo mới
      throw new Error('Phòng này đang có hợp đồng còn hiệu lực.')
    }

    // Tự động đóng contract cũ
    const staleIdx = db.contracts.findIndex((c) => c.id === blockingActiveContract.id)
    if (staleIdx !== -1) {
      db.contracts[staleIdx].status = 'expired'
      db.contracts[staleIdx].end_date = new Date().toISOString().split('T')[0]
      db.contracts[staleIdx].end_note = hasSettlement
        ? 'Tự động đóng do đã có phiếu tất toán (dọn dẹp dữ liệu không nhất quán)'
        : room?.status === 'ending'
          ? 'Tự động đóng do phòng đã báo kết thúc'
          : 'Tự động đóng do phòng đã trống (dọn dẹp dữ liệu không nhất quán)'
    }

    // Nếu phòng vẫn còn occupied do data lỗi → reset về vacant
    if (hasSettlement && room?.status === 'occupied') {
      const roomIdx = db.rooms.findIndex((r) => r.id === roomId)
      if (roomIdx !== -1) db.rooms[roomIdx].status = 'vacant'
    }
  }

  // 2. Khách thuê phải được tạo trước trong mục Khách thuê
  if (!db.tenants) db.tenants = []
  const tenantId = data.tenant_id || ''
  const selectedTenant = db.tenants.find((t) => t.id === tenantId)
  if (!selectedTenant) {
    throw new Error('Phải chọn khách thuê đã có trong mục Khách thuê.')
  }

  const tenantActiveContract = (db.contracts || []).find(
    (contract) => contract.tenant_id === tenantId && contract.status === 'active'
  )
  if (tenantActiveContract && tenantActiveContract.room_id !== roomId) {
    throw new Error('Khách thuê này đang có hợp đồng còn hiệu lực ở phòng khác.')
  }

  selectedTenant.is_active = true
  selectedTenant.last_room_name = db.rooms.find((r) => r.id === roomId)?.name || selectedTenant.last_room_name
  selectedTenant.left_at = undefined
  selectedTenant.updated_at = new Date().toISOString()

  // 3. Tạo contract
  const newContract: Contract = {
    id: `contract-${Date.now()}`,
    room_id: roomId,
    tenant_name: selectedTenant.full_name || '',
    tenant_phone: selectedTenant.phone,
    tenant_id_card: selectedTenant.identity_card,
    tenant_id_card_issued_date: selectedTenant.id_card_issued_date,
    tenant_id_card_issued_place: selectedTenant.id_card_issued_place,
    tenant_address: selectedTenant.address,
    tenant_dob: data.tenant_dob,
    occupant_count: data.occupant_count || 1,
    move_in_date: data.move_in_date || new Date().toISOString().split('T')[0],
    duration_months: data.duration_months ?? 0,
    expiration_date: data.expiration_date,
    base_rent: data.base_rent || 0,
    deposit_amount: data.deposit_amount || 0,
    billing_cycle: data.billing_cycle || 1,
    invoice_day: data.invoice_day || 5,
    electric_init: data.electric_init || 0,
    water_init: data.water_init || 0,
    status: 'active',
    notes: data.notes,
    tenant_id: selectedTenant.id,
    created_at: new Date().toISOString()
  }
  if (!db.contracts) db.contracts = []
  db.contracts.push(newContract)

  // Không xóa snapshot nhận phòng ở đây.
  // Nếu user đã vào tab Tài sản và chốt nhận trước khi lưu hợp đồng,
  // mốc move_in đó chính là mốc hợp lệ cho chu kỳ mới.
  // Chu kỳ cũ đã được reset khi trả phòng / tất toán.

  // 4. Cập nhật phòng
  const roomIdx = db.rooms.findIndex((r) => r.id === roomId)
  if (roomIdx !== -1) {
    db.rooms[roomIdx] = {
      ...db.rooms[roomIdx],
      status: 'occupied',
      tenant_name: selectedTenant.full_name,
      tenant_phone: selectedTenant.phone,
      tenant_id_card: selectedTenant.identity_card,
      move_in_date: data.move_in_date,
      contract_expiration: data.expiration_date || undefined,
      invoice_day: data.invoice_day,
      electric_old: data.electric_init || 0,
      electric_new: data.electric_init || 0,
      water_old: data.water_init || 0,
      water_new: data.water_init || 0,
      default_deposit: data.deposit_amount
    }
  }

  // 5. Không tự tạo hóa đơn tháng đầu ở bước lập hợp đồng.
  // Luồng đúng là: Lập hợp đồng mới -> mở InvoiceModal -> user xác nhận lập hóa đơn tháng đầu -> thu tiền.
  if (data.is_migration && data.migration_debt && data.migration_debt > 0) {
    // Migration có nợ tồn đọng → tạo phiếu nợ riêng để theo dõi
    const now = new Date()
    const debtInvoice: Invoice = {
      id: `inv-debt-${Date.now()}`,
      room_id: newContract.room_id,
      tenant_id: selectedTenant.id,
      billing_reason: 'migration_debt',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      electric_old: newContract.electric_init,
      electric_new: newContract.electric_init,
      electric_usage: 0,
      electric_cost: 0,
      water_old: newContract.water_init,
      water_new: newContract.water_init,
      water_usage: 0,
      water_cost: 0,
      room_cost: 0,
      wifi_cost: 0,
      garbage_cost: 0,
      old_debt: 0,
      total_amount: data.migration_debt,
      paid_amount: 0,
      payment_status: 'unpaid',
      note: 'Nợ tồn đọng trước khi dùng phần mềm',
      created_at: new Date().toISOString()
    }
    db.invoices.unshift(debtInvoice)
  }

  syncRoomInvoiceState(db, newContract.room_id)

  await persistDB(db)
  return newContract
}

export const cancelContract = async (roomId: string): Promise<void> => {
  const db = await getDB()

  // 1. Tìm contract đang active
  const contractIdx = db.contracts.findIndex((c) => c.room_id === roomId && c.status === 'active')
  if (contractIdx === -1) throw new Error('Không tìm thấy hợp đồng đang có hiệu lực')
  const contract = db.contracts[contractIdx]
  const contractStartedAt = new Date(contract.created_at || contract.move_in_date).getTime()

  // 2. Kiểm tra xem đã có hóa đơn nào CỦA KHÁCH NÀY thực sự thu tiền chưa?
  // Chỉ chặn khi paid_amount > 0. Trường hợp mới lập hóa đơn nhưng chưa thu
  // thì vẫn phải cho hủy hợp đồng.
  const paidInvoices = db.invoices.filter(
    (i) =>
      i.room_id === roomId &&
      (!contract.tenant_id || i.tenant_id === contract.tenant_id) &&
      new Date(i.created_at || i.invoice_date || contract.created_at).getTime() >= contractStartedAt &&
      Math.max(0, i.paid_amount || 0) > 0
  )
  if (paidInvoices.length > 0) {
    throw new Error(
      'Không thể hủy vì đã có khoản được thanh toán. Vui lòng dùng tính năng Tất toán/Trả phòng.'
    )
  }

  // 3. Mark tất cả hóa đơn chưa thanh toán của khách này thành 'cancelled' (void)
  // KHÔNG xóa — giữ lại để audit trail, chỉ đổi trạng thái
  db.invoices = db.invoices.map((i) => {
    if (
      i.room_id === roomId &&
      (!contract.tenant_id || i.tenant_id === contract.tenant_id) &&
      new Date(i.created_at || i.invoice_date || contract.created_at).getTime() >= contractStartedAt &&
      (i.payment_status === 'unpaid' || i.payment_status === 'partial') &&
      i.paid_amount === 0
    ) {
      return { ...i, payment_status: 'cancelled' as PaymentStatus }
    }
    return i
  })

  // 4. Mark contract là cancelled (hoặc xóa luôn, ở đây chọn chuyển status)
  db.contracts[contractIdx].status = 'cancelled'
  syncTenantActiveStatus(db, contract.tenant_id)

  // 5. Reset phòng về trạng thái vacant
  const roomIdx = db.rooms.findIndex((r) => r.id === roomId)
  if (roomIdx !== -1) {
    db.rooms[roomIdx] = {
      ...db.rooms[roomIdx],
      status: 'vacant',
      tenant_name: undefined,
      tenant_phone: undefined,
      move_in_date: undefined,
      invoice_day: undefined,
      expected_end_date: undefined
      // Có thể giữ hoặc reset điện/nước cũ
    }
  }

  await persistDB(db)
}

export interface TerminateContractData {
  room_id: string
  contract_id: string
  end_date: string
  final_electric: number
  final_water: number
  merge_invoice_ids: string[] // ID hóa đơn nợ cần gộp vào tất toán
  damage_amount: number
  damage_note: string
  payment_method: PaymentMethod
}

export const terminateContract = async (data: TerminateContractData): Promise<Invoice> => {
  const db = await getDB()

  // --- Lấy thông tin phòng, hợp đồng, vùng dịch vụ ---
  const room = db.rooms.find((r) => r.id === data.room_id)
  if (!room) throw new Error('Room not found')
  const contract = db.contracts?.find((c) => c.id === data.contract_id)
  if (!contract) throw new Error('Contract not found')
  const tenant = (db.tenants || []).find((item) => item.id === contract.tenant_id)
  const zone = db.service_zones?.find((z) => z.id === room.service_zone_id)

  // --- Snapshot giá tại thời điểm tất toán ---
  const electricPriceSnapshot = room.electric_price || zone?.electric_price || 0
  const waterPriceSnapshot = room.water_price || zone?.water_price || 0
  const depositSnapshot = contract.deposit_amount || 0

  // --- Tính điện/nước tháng cuối ---
  const electricOld = room.electric_new || 0
  const electricUsage = Math.max(0, data.final_electric - electricOld)
  const electricCost = electricUsage * electricPriceSnapshot

  const waterOld = room.water_new || 0
  const waterUsage = Math.max(0, data.final_water - waterOld)
  const waterCost = waterUsage * waterPriceSnapshot

  // --- Tính tổng nợ gộp ---
  const mergedInvoices = db.invoices.filter(
    (i) =>
      data.merge_invoice_ids.includes(i.id) &&
      (!contract.tenant_id || i.tenant_id === contract.tenant_id)
  )
  const mergedDebtTotal = mergedInvoices.reduce(
    (sum, i) => sum + Math.max(0, i.total_amount - i.paid_amount),
    0
  )

  // --- Tổng phát sinh và đối trừ cọc ---
  // FIX: netDue phải trừ toàn bộ tiền cọc đang giữ (không phải chỉ phần áp dụng)
  // Ví dụ: totalCharges=0, depositSnapshot=3.3M → hoàn 3.3M cho khách
  const totalCharges = electricCost + waterCost + mergedDebtTotal + data.damage_amount
  const depositApplied = Math.min(depositSnapshot, totalCharges) // phần cọc bù vào phí phát sinh
  const netDue = totalCharges - depositSnapshot // âm = hoàn tiền, dương = còn thiếu

  // --- Tạo hóa đơn tất toán ---
  const now = new Date()
  const settlementInvoice: Invoice = {
    id: `inv-settle-${Date.now()}`,
    room_id: data.room_id,
    tenant_id: contract.tenant_id || '',
    billing_reason: 'contract_end',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    invoice_date: data.end_date,
    billing_period_start: data.end_date,
    billing_period_end: data.end_date,
    electric_old: electricOld,
    electric_new: data.final_electric,
    electric_usage: electricUsage,
    electric_cost: electricCost,
    water_old: waterOld,
    water_new: data.final_water,
    water_usage: waterUsage,
    water_cost: waterCost,
    room_cost: 0,
    wifi_cost: 0,
    garbage_cost: 0,
    old_debt: 0,
    // netDue = totalCharges - depositSnapshot
    // netDue < 0 → chủ nhà phải hoàn tiền cho khách → total_amount âm
    // netDue > 0 → khách còn nợ thêm
    // netDue = 0 → huề
    total_amount: netDue,
    paid_amount: netDue <= 0 ? 0 : depositApplied, // nếu hoàn tiền thì paid_amount = 0 (chưa trả)
    payment_status:
      netDue === 0 ? 'paid' : netDue < 0 ? 'unpaid' : depositApplied > 0 ? 'partial' : 'unpaid',
    payment_method: data.payment_method,
    is_settlement: true,
    deposit_applied: depositApplied,
    deposit_amount: netDue < 0 ? netDue : 0, // số âm = số tiền chủ nhà cần hoàn lại
    damage_amount: data.damage_amount || 0,
    damage_note: data.damage_note || undefined,
    merged_invoice_ids: data.merge_invoice_ids,
    merged_debt_total: mergedDebtTotal,
    electric_price_snapshot: electricPriceSnapshot,
    water_price_snapshot: waterPriceSnapshot,
    created_at: new Date().toISOString()
  }
  db.invoices.unshift(settlementInvoice)

  // --- Đánh dấu hóa đơn nợ đã gộp là 'merged' ---
  for (const inv of mergedInvoices) {
    const idx = db.invoices.findIndex((i) => i.id === inv.id)
    if (idx !== -1) {
      db.invoices[idx] = {
        ...db.invoices[idx],
        payment_status: 'merged',
        note: `Đã gộp vào hóa đơn tất toán ${settlementInvoice.id}`
      }
    }
  }

  // --- Cập nhật hợp đồng: terminated + lưu lịch sử ---
  const contractIdx = db.contracts!.findIndex((c) => c.id === data.contract_id)
  if (contractIdx !== -1) {
    db.contracts![contractIdx] = {
      ...db.contracts![contractIdx],
      status: 'terminated',
      end_date: data.end_date,
      end_note: data.damage_note || undefined,
      final_electric: data.final_electric,
      final_water: data.final_water
    }
  }
  syncTenantActiveStatus(db, contract.tenant_id)
  if (tenant) {
    tenant.is_active = false
    tenant.last_room_name = room.name
    tenant.left_at = data.end_date
    tenant.updated_at = new Date().toISOString()
  }

  // --- Cập nhật phòng: về vacant, xóa thông tin khách hiển thị ---
  const roomIdx = db.rooms.findIndex((r) => r.id === data.room_id)
  if (roomIdx !== -1) {
    db.rooms[roomIdx] = {
      ...db.rooms[roomIdx],
      status: 'vacant',
      tenant_name: undefined,
      tenant_phone: undefined,
      tenant_email: undefined,
      tenant_id_card: undefined,
      move_in_date: undefined,
      expected_end_date: undefined,
      electric_new: data.final_electric,
      electric_old: data.final_electric,
      water_new: data.final_water,
      water_old: data.final_water,
      has_move_in_receipt: false,
      default_deposit: 0 // ← FIX: reset cọc về 0 sau khi đã hoàn trả
    }
  }

  // --- Xóa move_in_receipts của phòng đã trả (tránh logic "Đã thu" cọc sai) ---
  if (db.move_in_receipts) {
    db.move_in_receipts = db.move_in_receipts.filter((r) => r.room_id !== data.room_id)
  }

  // --- Reset chu kỳ tài sản của phòng đã trả ---
  // Sau khi tất toán xong, phòng phải quay về trạng thái "chưa nhận phòng"
  // để hợp đồng kế tiếp bắt buộc chốt nhận lại từ đầu.
  if (db.asset_snapshots) {
    db.asset_snapshots = db.asset_snapshots.filter((snap) => snap.room_id !== data.room_id)
  }
  if (db.room_asset_adjustments) {
    db.room_asset_adjustments = db.room_asset_adjustments.filter(
      (item) => item.room_id !== data.room_id
    )
  }

  await persistDB(db)
  return settlementInvoice
}

export const updateContract = async (id: string, updates: Partial<Contract>): Promise<Contract> => {
  const db = await getDB()
  if (!db.contracts) db.contracts = []
  const index = db.contracts.findIndex((c) => c.id === id)
  if (index === -1) throw new Error('Contract not found')
  db.contracts[index] = { ...db.contracts[index], ...updates }
  await persistDB(db)
  return db.contracts[index]
}

// --- TENANTS ---
// export const getTenantsForRoom = async (roomId: string): Promise<Tenant | null> => {
//   const db = await getDB();
//   // Lấy từ hợp đồng thay vì bảng tenants (chờ Phase 10)
//   return null;
// };

// --- INVOICES ---
export const getInvoicesByRoom = async (roomId: string): Promise<Invoice[]> => {
  const db = await getDB()
  return db.invoices
    .filter((i) => i.room_id === roomId)
    .map((i) => ({ ...i }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

type CreateInvoiceInput = Partial<Invoice> & {
  allow_duplicate?: boolean
}

const normalizeBillingReason = (invoice: Partial<Invoice>): string | undefined => {
  if (invoice.billing_reason) return invoice.billing_reason
  if (invoice.is_first_month) return 'first_month'
  if (invoice.is_settlement) return 'contract_end'
  return undefined
}

const findDuplicateInvoice = (invoices: Invoice[], invoiceData: Partial<Invoice>) => {
  const roomId = invoiceData.room_id || ''
  const tenantId = invoiceData.tenant_id
  const month = invoiceData.month || new Date().getMonth() + 1
  const year = invoiceData.year || new Date().getFullYear()
  const billingReason = normalizeBillingReason(invoiceData)

  return invoices.find(
    (invoice) =>
      invoice.room_id === roomId &&
      (tenantId ? invoice.tenant_id === tenantId : true) &&
      invoice.payment_status !== 'cancelled' &&
      normalizeBillingReason(invoice) === billingReason &&
      invoice.month === month &&
      invoice.year === year
  )
}

const hasActiveFirstMonthInvoice = (invoices: Invoice[], roomId: string, tenantId?: string) =>
  invoices.some(
    (invoice) =>
      invoice.room_id === roomId &&
      invoice.payment_status !== 'cancelled' &&
      invoice.is_first_month &&
      (tenantId ? invoice.tenant_id === tenantId : true)
  )

const syncTenantActiveStatus = (db: DBState, tenantId?: string) => {
  if (!tenantId) return
  const tenant = (db.tenants || []).find((item) => item.id === tenantId)
  if (!tenant) return

  tenant.is_active = (db.contracts || []).some(
    (contract) => contract.tenant_id === tenantId && contract.status === 'active'
  )
  tenant.updated_at = new Date().toISOString()
}

const syncRoomInvoiceState = (db: DBState, roomId: string) => {
  const roomIndex = db.rooms.findIndex((room) => room.id === roomId)
  if (roomIndex === -1) return

  const room = db.rooms[roomIndex]
  const activeContract = (db.contracts || []).find(
    (contract) => contract.room_id === roomId && contract.status === 'active'
  )
  const relevantInvoices = (db.invoices || [])
    .filter(
      (invoice) =>
        invoice.room_id === roomId &&
        invoice.payment_status !== 'cancelled' &&
        invoice.payment_status !== 'merged'
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const latestMeterInvoice = [...relevantInvoices]
    .reverse()
    .find((invoice) => !invoice.is_settlement)
  const baseElectric = activeContract?.electric_init ?? room.electric_new ?? room.electric_old ?? 0
  const baseWater = activeContract?.water_init ?? room.water_new ?? room.water_old ?? 0

  db.rooms[roomIndex] = {
    ...room,
    electric_old: latestMeterInvoice ? latestMeterInvoice.electric_new : baseElectric,
    electric_new: latestMeterInvoice ? latestMeterInvoice.electric_new : baseElectric,
    water_old: latestMeterInvoice ? latestMeterInvoice.water_new : baseWater,
    water_new: latestMeterInvoice ? latestMeterInvoice.water_new : baseWater,
    old_debt: activeContract
      ? relevantInvoices
        .filter(
          (invoice) => !activeContract.tenant_id || invoice.tenant_id === activeContract.tenant_id
        )
        .reduce(
          (sum, invoice) => sum + Math.max(0, invoice.total_amount - invoice.paid_amount),
          0
        )
      : 0,
    has_move_in_receipt: Boolean(
      (db.move_in_receipts || []).some(
        (receipt) => receipt.room_id === roomId && receipt.payment_status === 'paid'
      )
    )
  }
}

export const createInvoice = async (invoiceData: CreateInvoiceInput): Promise<Invoice> => {
  const db = await getDB()
  const roomId = invoiceData.room_id || ''
  const month = invoiceData.month || new Date().getMonth() + 1
  const year = invoiceData.year || new Date().getFullYear()
  const billingReason = normalizeBillingReason(invoiceData)

  const duplicatedFirstMonth = hasActiveFirstMonthInvoice(
    db.invoices,
    roomId,
    invoiceData.tenant_id
  )

  if (duplicatedFirstMonth && invoiceData.is_first_month) {
    throw new Error('Phòng này đã có hóa đơn tháng đầu tiên.')
  }

  const duplicatedInvoice = findDuplicateInvoice(db.invoices, {
    ...invoiceData,
    billing_reason: billingReason,
    month,
    year
  })

  if (duplicatedInvoice && !invoiceData.allow_duplicate) {
    throw new Error('Phòng này đã có hóa đơn cùng loại trong tháng này.')
  }

  // Chặn lập hóa đơn hàng tháng nếu tháng đó đã có phiếu thu tháng đầu
  // VD: khách vào 16/04 → phiếu tháng đầu đã thu hết tháng 4 → không cho lập thêm HĐ tháng 4 nữa
  if (billingReason === 'monthly' && !invoiceData.is_settlement) {
    const firstMonthSameMonth = (db.invoices || []).find(
      (i) =>
        i.room_id === roomId &&
        i.tenant_id === invoiceData.tenant_id &&
        i.is_first_month === true &&
        i.month === month &&
        i.year === year &&
        i.payment_status !== 'cancelled'
    )
    if (firstMonthSameMonth) {
      const nextMonth = month === 12 ? 1 : month + 1
      const nextYear = month === 12 ? year + 1 : year
      throw new Error(
        `Tháng ${month}/${year} đã có phiếu thu tháng đầu (nhận phòng). Hóa đơn hàng tháng chỉ được lập từ tháng ${nextMonth}/${nextYear}.`
      )
    }
  }

  const newInvoice: Invoice = {
    id: `inv-${Date.now()}`,
    room_id: roomId,
    tenant_id: invoiceData.tenant_id || '',
    billing_reason: billingReason,
    month,
    year,
    invoice_date: invoiceData.invoice_date,
    due_date: invoiceData.due_date,
    billing_period_start: invoiceData.billing_period_start,
    billing_period_end: invoiceData.billing_period_end,
    electric_old: invoiceData.electric_old || 0,
    electric_new: invoiceData.electric_new || 0,
    electric_usage: invoiceData.electric_usage || 0,
    electric_cost: invoiceData.electric_cost || 0,
    water_old: invoiceData.water_old || 0,
    water_new: invoiceData.water_new || 0,
    water_usage: invoiceData.water_usage || 0,
    water_cost: invoiceData.water_cost || 0,
    room_cost: invoiceData.room_cost || 0,
    wifi_cost: invoiceData.wifi_cost || 0,
    garbage_cost: invoiceData.garbage_cost || 0,
    old_debt: invoiceData.old_debt || 0,
    total_amount: invoiceData.total_amount || 0,
    adjustment_amount: invoiceData.adjustment_amount || 0,
    adjustment_note: invoiceData.adjustment_note,
    note: invoiceData.note,
    paid_amount: invoiceData.paid_amount || 0,
    payment_status: invoiceData.payment_status || 'unpaid',
    payment_method: invoiceData.payment_method,
    payment_date: invoiceData.payment_date,
    payment_records: [],
    is_first_month: invoiceData.is_first_month,
    is_settlement: invoiceData.is_settlement,
    deposit_amount: invoiceData.deposit_amount,
    deposit_applied: invoiceData.deposit_applied,
    damage_amount: invoiceData.damage_amount,
    damage_note: invoiceData.damage_note,
    merged_invoice_ids: invoiceData.merged_invoice_ids,
    merged_debt_total: invoiceData.merged_debt_total,
    electric_price_snapshot: invoiceData.electric_price_snapshot,
    water_price_snapshot: invoiceData.water_price_snapshot,
    prorata_days: invoiceData.prorata_days,
    has_transfer: invoiceData.has_transfer,
    transfer_old_room_name: invoiceData.transfer_old_room_name,
    transfer_days: invoiceData.transfer_days,
    transfer_room_cost: invoiceData.transfer_room_cost,
    transfer_electric_cost: invoiceData.transfer_electric_cost,
    transfer_water_cost: invoiceData.transfer_water_cost,
    transfer_service_cost: invoiceData.transfer_service_cost,
    transfer_electric_usage: invoiceData.transfer_electric_usage,
    transfer_water_usage: invoiceData.transfer_water_usage,
    new_room_days: invoiceData.new_room_days,
    new_room_cost: invoiceData.new_room_cost,
    new_room_service_cost: invoiceData.new_room_service_cost,
    created_at: new Date().toISOString()
  }

  const normalizedInvoice = applyInvoicePaymentSummary(newInvoice)

  db.invoices.unshift(normalizedInvoice)

  syncRoomInvoiceState(db, normalizedInvoice.room_id)
  /*
      // Khi thu tiền hợp đồng đầu tiên, cập nhật nợ nếu chưa nộp đủ, nhưng ở đây Invoice chịu trách nhiệm tính nợ
    };
  }
 
  */
  await persistDB(db)
  return normalizedInvoice
}

export const getInvoices = async (): Promise<Invoice[]> => {
  const db = await getDB()
  return db.invoices.map((inv) => ({ ...applyInvoicePaymentSummary(inv) }))
}

export const updateInvoice = async (id: string, updates: Partial<Invoice>): Promise<Invoice> => {
  const db = await getDB()
  const index = db.invoices.findIndex((i) => i.id === id)
  if (index === -1) throw new Error('Invoice not found')
  db.invoices[index] = applyInvoicePaymentSummary({ ...db.invoices[index], ...updates })
  syncRoomInvoiceState(db, db.invoices[index].room_id)
  await persistDB(db)
  return db.invoices[index]
}

export const recordInvoicePayment = async (
  invoiceId: string,
  payment: {
    amount: number
    payment_method?: PaymentMethod
    payment_date?: string
    note?: string
  }
): Promise<Invoice> => {
  const db = await getDB()
  const index = db.invoices.findIndex((invoice) => invoice.id === invoiceId)
  if (index === -1) throw new Error('Invoice not found')

  const invoice = db.invoices[index]
  if (invoice.payment_status === 'cancelled')
    throw new Error('Không thể thu tiền trên hóa đơn đã hủy.')
  if (invoice.payment_status === 'merged')
    throw new Error('Không thể thu tiền trên hóa đơn đã gộp.')

  const amount = Math.max(0, Number(payment.amount || 0))
  if (amount <= 0) throw new Error('Số tiền thu phải lớn hơn 0.')

  const remaining = Math.max(0, (invoice.total_amount || 0) - (invoice.paid_amount || 0))
  if (amount > remaining) throw new Error('Số tiền thu vượt quá số còn lại của hóa đơn.')

  const record: InvoicePaymentRecord = {
    id: createEntityId('invpay'),
    amount,
    payment_method: payment.payment_method,
    payment_date: toIsoDate(payment.payment_date),
    note: payment.note?.trim() || undefined,
    created_at: new Date().toISOString()
  }

  db.invoices[index] = applyInvoicePaymentSummary({
    ...invoice,
    note: payment.note?.trim() || invoice.note,
    payment_records: [...getInvoicePaymentRecords(invoice), record]
  })

  syncRoomInvoiceState(db, db.invoices[index].room_id)
  await persistDB(db)
  return db.invoices[index]
}

export const deleteInvoice = async (id: string): Promise<void> => {
  const db = await getDB()
  const index = db.invoices.findIndex((invoice) => invoice.id === id)
  if (index === -1) throw new Error('Invoice not found')

  const invoice = db.invoices[index]
  if (invoice.payment_status === 'merged') {
    throw new Error('Không thể hủy hóa đơn đã gộp vào tất toán.')
  }

  db.invoices[index] = {
    ...invoice,
    payment_status: 'cancelled',
    note: invoice.note ? `${invoice.note}\n[Đã hủy phiếu]` : '[Đã hủy phiếu]'
  }

  if (invoice.is_settlement) {
    for (const mergedId of invoice.merged_invoice_ids || []) {
      const mergedIndex = db.invoices.findIndex((item) => item.id === mergedId)
      if (mergedIndex === -1) continue

      const mergedInvoice = db.invoices[mergedIndex]
      const remaining = Math.max(0, mergedInvoice.total_amount - mergedInvoice.paid_amount)
      db.invoices[mergedIndex] = {
        ...mergedInvoice,
        payment_status:
          remaining > 0 ? (mergedInvoice.paid_amount > 0 ? 'partial' : 'unpaid') : 'paid',
        note: mergedInvoice.note?.includes(invoice.id) ? undefined : mergedInvoice.note
      }
    }
  }

  if (invoice.has_transfer) {
    const contractIndex = (db.contracts || []).findIndex(
      (contract) =>
        contract.room_id === invoice.room_id &&
        contract.status === 'active' &&
        contract.transfer_history
    )
    if (contractIndex !== -1 && db.contracts[contractIndex].transfer_history) {
      db.contracts[contractIndex] = {
        ...db.contracts[contractIndex],
        transfer_history: {
          ...db.contracts[contractIndex].transfer_history!,
          history_billed_in_invoice_id: undefined
        }
      }
    }
  }

  syncRoomInvoiceState(db, invoice.room_id)
  await persistDB(db)
}

// --- CASH TRANSACTIONS / THU CHI ---
export const getCashTransactions = async (): Promise<CashTransaction[]> => {
  const db = await getDB()
  return (db.cash_transactions || [])
    .map((item) => ({ ...item }))
    .sort(
      (a, b) =>
        new Date(b.transaction_date || b.created_at).getTime() -
        new Date(a.transaction_date || a.created_at).getTime()
    )
}

export const createCashTransaction = async (
  data: Partial<CashTransaction>
): Promise<CashTransaction> => {
  const db = await getDB()
  if (!db.cash_transactions) db.cash_transactions = []

  const type = data.type || 'expense'
  const category = data.category || (type === 'income' ? 'other_income' : 'other_expense')
  const now = new Date().toISOString()
  const transaction: CashTransaction = {
    id: `cash-${Date.now()}`,
    type,
    category,
    transaction_date: data.transaction_date || now.split('T')[0],
    amount: Math.max(0, Number(data.amount || 0)),
    room_id: data.room_id || undefined,
    payment_method: data.payment_method,
    note: data.note?.trim() || undefined,
    created_at: now,
    updated_at: now
  }

  db.cash_transactions.unshift(transaction)
  await persistDB(db)
  return { ...transaction }
}

export const updateCashTransaction = async (
  id: string,
  updates: Partial<CashTransaction>
): Promise<CashTransaction> => {
  const db = await getDB()
  if (!db.cash_transactions) db.cash_transactions = []
  const index = db.cash_transactions.findIndex((item) => item.id === id)
  if (index === -1) throw new Error('Cash transaction not found')

  db.cash_transactions[index] = {
    ...db.cash_transactions[index],
    ...updates,
    amount:
      updates.amount !== undefined
        ? Math.max(0, Number(updates.amount || 0))
        : db.cash_transactions[index].amount,
    room_id: updates.room_id || undefined,
    note: updates.note?.trim() || undefined,
    updated_at: new Date().toISOString()
  }

  await persistDB(db)
  return { ...db.cash_transactions[index] }
}

export const deleteCashTransaction = async (id: string): Promise<void> => {
  const db = await getDB()
  if (!db.cash_transactions) db.cash_transactions = []
  db.cash_transactions = db.cash_transactions.filter((item) => item.id !== id)
  await persistDB(db)
}

// --- APP SETTINGS ---

export const getAppSettings = async (): Promise<AppSettings> => {
  const db = await getDB()
  return db.app_settings || {}
}

export const updateAppSettings = async (settings: Partial<AppSettings>): Promise<AppSettings> => {
  const db = await getDB()
  db.app_settings = { ...db.app_settings, ...settings }
  await persistDB(db)
  return db.app_settings
}

// --- USERS ---
export const getUsers = async (): Promise<AppUser[]> => {
  const db = await getDB()
  return [...(db.users || [])].sort((a, b) => a.username.localeCompare(b.username, 'vi'))
}

export const createUser = async (payload: {
  username: string
  full_name: string
  password: string
  role: UserRole
}): Promise<AppUser> => {
  const db = await getDB()
  const username = payload.username.trim()
  if (!username) throw new Error('Ten dang nhap khong duoc de trong.')
  if ((db.users || []).some((user) => user.username.trim().toLowerCase() === username.toLowerCase())) {
    throw new Error('Ten dang nhap da ton tai.')
  }

  const password = payload.password.trim()
  if (password.length < 6) {
    throw new Error('Mật khẩu phải có ít nhất 6 ký tự.')
  }

  const newUser: AppUser = {
    id: createEntityId('user'),
    username,
    full_name: payload.full_name.trim() || username,
    password_hash: await bcrypt.hash(password, 10),
    role: payload.role,
    status: 'active',
    created_at: new Date().toISOString()
  }

  db.users = [...(db.users || []), newUser]
  await persistDB(db)
  return newUser
}

export const resetUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  const db = await getDB()
  const index = (db.users || []).findIndex((user) => user.id === userId)
  if (index === -1) throw new Error('Không tìm thấy user.')
  if (newPassword.trim().length < 6) throw new Error('Mật khẩu phải có ít nhất 6 ký tự.')
  db.users[index].password_hash = await bcrypt.hash(newPassword.trim(), 10)
  await persistDB(db)
}

export const updateUserStatus = async (userId: string, status: UserStatus): Promise<void> => {
  const db = await getDB()
  const index = (db.users || []).findIndex((user) => user.id === userId)
  if (index === -1) throw new Error('Không tìm thấy user.')
  db.users[index].status = status
  await persistDB(db)
}

export const updateUserRole = async (userId: string, role: UserRole): Promise<void> => {
  const db = await getDB()
  const index = (db.users || []).findIndex((user) => user.id === userId)
  if (index === -1) throw new Error('Không tìm thấy user.')
  db.users[index].role = role
  await persistDB(db)
}

// --- VEHICLES ---
export const getRoomVehicles = async (roomId: string): Promise<RoomVehicle[]> => {
  const db = await getDB()
  return db.room_vehicles
    .filter((v) => v.room_id === roomId)
    .sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime())
}

export const addRoomVehicle = async (vehicleData: Partial<RoomVehicle>): Promise<RoomVehicle> => {
  const db = await getDB()
  // Check limits
  const room = db.rooms.find((r) => r.id === vehicleData.room_id)
  const currentVehicles = db.room_vehicles.filter((v) => v.room_id === vehicleData.room_id)
  const limit = room?.max_vehicles ?? 3 // Default 3

  if (currentVehicles.length >= limit) {
    throw new Error('Số lượng xe đã đạt tối đa.')
  }

  const newVehicle: RoomVehicle = {
    ...vehicleData,
    id: `veh-${Date.now()}`,
    room_id: vehicleData.room_id || '',
    owner_name: vehicleData.owner_name || '',
    license_plate: (vehicleData.license_plate || '').toUpperCase(),
    brand: vehicleData.brand || '',
    color: vehicleData.color || '',
    vehicle_type: vehicleData.vehicle_type || 'motorbike',
    registered_at: new Date().toISOString()
  }

  db.room_vehicles.push(newVehicle)
  await persistDB(db)
  return newVehicle
}

export const updateRoomVehicle = async (id: string, updates: Partial<RoomVehicle>): Promise<RoomVehicle> => {
  const db = await getDB()
  const index = db.room_vehicles.findIndex((v) => v.id === id)
  if (index === -1) throw new Error('Vehicle not found')
  db.room_vehicles[index] = { ...db.room_vehicles[index], ...updates }
  await persistDB(db)
  return db.room_vehicles[index]
}

export const deleteRoomVehicle = async (id: string): Promise<void> => {
  const db = await getDB()
  db.room_vehicles = db.room_vehicles.filter((v) => v.id !== id)
  await persistDB(db)
}

export const getVehicles = async (): Promise<RoomVehicle[]> => {
  const db = await getDB()
  return db.room_vehicles || []
}

// --- ASSETS ---
export const getAssetTemplates = async (): Promise<AssetTemplate[]> => {
  const db = await getDB()
  return db.asset_templates.sort((a, b) => a.sort_order - b.sort_order)
}

export const getRoomAssets = async (roomId: string): Promise<RoomAsset[]> => {
  const db = await getDB()
  return db.room_assets
    .filter((a) => a.room_id === roomId)
    .sort((a, b) => a.sort_order - b.sort_order)
}

export const getAllRoomAssets = async (): Promise<RoomAsset[]> => {
  const db = await getDB()
  return db.room_assets || []
}

export const addRoomAsset = async (assetData: Partial<RoomAsset>): Promise<RoomAsset> => {
  const db = await getDB()
  const newAsset: RoomAsset = {
    id: createEntityId('rasset'),
    room_id: assetData.room_id || '',
    name: assetData.name || '',
    quantity: assetData.quantity || 1,
    sort_order: assetData.sort_order || 0,
    type: assetData.type || 'furniture',
    status: assetData.status || 'ok',
    issue_note: assetData.issue_note || '',
    icon: assetData.icon || 'fa-box'
  }
  db.room_assets.push(newAsset)
  await persistDB(db)
  return newAsset
}

export const deleteRoomAsset = async (id: string): Promise<void> => {
  const db = await getDB()
  const index = db.room_assets.findIndex((a) => a.id === id)
  if (index === -1) throw new Error('Asset not found')
  db.room_assets.splice(index, 1)
  db.asset_snapshots = (db.asset_snapshots || []).filter((s) => s.room_asset_id !== id)
  await persistDB(db)
}

export const updateRoomAsset = async (
  id: string,
  updates: Partial<RoomAsset>
): Promise<RoomAsset> => {
  const db = await getDB()
  const index = db.room_assets.findIndex((a) => a.id === id)
  if (index === -1) throw new Error('Asset not found')
  db.room_assets[index] = { ...db.room_assets[index], ...updates }
  await persistDB(db)
  return db.room_assets[index]
}

export const getRoomAssetAdjustments = async (roomId: string): Promise<RoomAssetAdjustment[]> => {
  const db = await getDB()
  return (db.room_asset_adjustments || [])
    .filter((item) => item.room_id === roomId)
    .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime())
}

export const createRoomAssetAdjustment = async (payload: {
  room_id: string
  action: 'add' | 'update'
  room_asset_id?: string
  name: string
  quantity: number
  reason: string
}): Promise<RoomAssetAdjustment> => {
  const db = await getDB()
  const time = new Date().toISOString()
  let roomAssetId = payload.room_asset_id
  let previousName: string | undefined
  let previousQuantity: number | undefined

  if (payload.action === 'add') {
    const nextSortOrder =
      Math.max(0, ...db.room_assets.filter((asset) => asset.room_id === payload.room_id).map((asset) => asset.sort_order || 0)) + 1
    const newAsset: RoomAsset = {
      id: createEntityId('rasset'),
      room_id: payload.room_id,
      name: payload.name,
      quantity: payload.quantity,
      sort_order: nextSortOrder,
      type: 'furniture',
      status: 'ok',
      issue_note: '',
      icon: 'fa-box'
    }
    db.room_assets.push(newAsset)
    roomAssetId = newAsset.id
  } else {
    if (!roomAssetId) throw new Error('Asset is required')
    const index = db.room_assets.findIndex((asset) => asset.id === roomAssetId)
    if (index === -1) throw new Error('Asset not found')
    previousName = db.room_assets[index].name
    previousQuantity = db.room_assets[index].quantity
    db.room_assets[index] = { ...db.room_assets[index], name: payload.name, quantity: payload.quantity }
  }

  const adjustment: RoomAssetAdjustment = {
    id: createEntityId('assetadj'),
    room_id: payload.room_id,
    room_asset_id: roomAssetId,
    action: payload.action,
    asset_name: payload.name,
    previous_name: previousName,
    new_name: payload.name,
    previous_quantity: previousQuantity,
    new_quantity: payload.quantity,
    reason: payload.reason.trim(),
    recorded_at: time
  }

  db.room_asset_adjustments.push(adjustment)
  await persistDB(db)
  return adjustment
}

// Khởi tạo tài sản phòng từ template (nếu phòng chưa có tài sản nào)
export const initRoomAssetsFromTemplate = async (roomId: string): Promise<RoomAsset[]> => {
  const db = await getDB()
  const existing = db.room_assets.filter((a) => a.room_id === roomId)
  if (existing.length > 0) return existing

  const templates = db.asset_templates.filter((t) => t.is_active)
  const newAssets = templates.map((t) => ({
    id: createEntityId('rasset'),
    room_id: roomId,
    name: t.name,
    quantity: 1,
    sort_order: t.sort_order
  }))

  db.room_assets.push(...newAssets)
  await persistDB(db)
  return newAssets
}

export const createAssetSnapshots = async (
  snapshotsData: Partial<AssetSnapshot>[]
): Promise<void> => {
  const db = await getDB()
  const time = new Date().toISOString()

  const snaps: AssetSnapshot[] = snapshotsData.map((s, idx) => ({
    id: `asn-${Date.now()}-${idx}`,
    room_asset_id: s.room_asset_id || '',
    room_id: s.room_id || '',
    tenant_id: s.tenant_id,
    type: s.type || 'move_in',
    condition: s.condition || 'good',
    deduction: s.deduction || 0,
    note: s.note,
    recorded_at: time
  }))

  // Xóa snapshot cũ cùng room + type trước khi lưu mới
  // (ghi đè để user có thể sửa lại kết quả đối chiếu)
  const affectedRoomIds = new Set(snaps.map((s) => s.room_id))
  const affectedTypes = new Set(snaps.map((s) => s.type))

  db.asset_snapshots = db.asset_snapshots.filter((s) => {
    // Nếu là thao tác Nhận phòng (move_in) mới -> xoá luôn lịch sử Trả phòng (move_out) và Thu dọn (handover) của chu kỳ cũ
    if (affectedRoomIds.has(s.room_id) && affectedTypes.has('move_in')) {
      if (s.type === 'move_out' || s.type === 'handover') return false;
    }
    // Xoá các snapshot trùng type đang được lưu đè
    if (affectedRoomIds.has(s.room_id) && affectedTypes.has(s.type)) return false;

    return true;
  })

  db.asset_snapshots.push(...snaps)
  await persistDB(db)
}

export const getAssetSnapshots = async (
  roomId: string,
  type: 'move_in' | 'move_out' | 'handover'
): Promise<AssetSnapshot[]> => {
  const db = await getDB()
  // Lấy snapshot mới nhất theo type và room_id
  const filtered = db.asset_snapshots.filter((s) => s.room_id === roomId && s.type === type)
  // Sort descending by time
  return filtered.sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  )
}

// --- MOVE IN RECEIPTS ---
export const getMoveInReceipts = async (): Promise<MoveInReceipt[]> => {
  const db = await getDB()
  return db.move_in_receipts || []
}

export const getMoveInReceiptsByTenant = async (tenantId: string): Promise<MoveInReceipt[]> => {
  const db = await getDB()
  // Tra cứu qua tenant_id trực tiếp (move_in_receipts mới)
  // hoặc suy từ contract nếu receipt chưa có tenant_id
  const contracts = (db.contracts || []).filter((c) => c.tenant_id === tenantId)
  const roomIds = new Set(contracts.map((c) => c.room_id))
  return (db.move_in_receipts || []).filter(
    (r) => r.tenant_id === tenantId || (!r.tenant_id && roomIds.has(r.room_id))
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export const createMoveInReceipt = async (
  data: Omit<MoveInReceipt, 'id' | 'total_amount' | 'created_at'>
): Promise<MoveInReceipt> => {
  const db = await getDB()

  // Tự động lấy tenant_id từ hợp đồng active của phòng nếu chưa truyền vào
  let tenantId = data.tenant_id
  if (!tenantId) {
    const activeContract = (db.contracts || []).find(
      (c) => c.room_id === data.room_id && c.status === 'active'
    )
    tenantId = activeContract?.tenant_id
  }

  const receipt: MoveInReceipt = {
    ...data,
    tenant_id: tenantId,
    id: `rcp-${Date.now()}`,
    total_amount: data.deposit_amount + data.prorata_amount + data.next_month_rent,
    created_at: new Date().toISOString()
  }

  // also update room to note it has move in receipt
  const room = db.rooms.find((r) => r.id === data.room_id)
  if (room) {
    if (data.payment_status === 'paid') {
      room.has_move_in_receipt = true
    }
    room.electric_old = data.electric_init
    room.electric_new = data.electric_init
    room.water_old = data.water_init
    room.water_new = data.water_init
  }

  db.move_in_receipts.push(receipt)
  await persistDB(db)
  return receipt
}

export const updateMoveInReceipt = async (
  id: string,
  updates: Partial<MoveInReceipt>
): Promise<void> => {
  const db = await getDB()
  const idx = db.move_in_receipts.findIndex((r) => r.id === id)
  if (idx !== -1) {
    db.move_in_receipts[idx] = { ...db.move_in_receipts[idx], ...updates }

    // Recalculate total_amount if amounts changed
    db.move_in_receipts[idx].total_amount =
      db.move_in_receipts[idx].deposit_amount +
      db.move_in_receipts[idx].prorata_amount +
      db.move_in_receipts[idx].next_month_rent

    // update room status if paid
    if (db.move_in_receipts[idx].payment_status === 'paid') {
      const room = db.rooms.find((r) => r.id === db.move_in_receipts[idx].room_id)
      if (room) {
        room.has_move_in_receipt = true
      }
    }
    await persistDB(db)
  }
}

// --- TENANTS ---
export const getTenants = async (): Promise<Tenant[]> => {
  const db = await getDB()
  return (db.tenants || []).map((tenant) => ({ ...tenant }))
}

export interface ChangeRoomData {
  old_room_id: string
  new_room_id: string
  change_date: string
  final_electric: number
  final_water: number
  new_base_rent: number
  new_deposit: number
  new_electric_init: number
  new_water_init: number
}

export const changeRoom = async (data: ChangeRoomData): Promise<void> => {
  const db = await getDB()
  const oldRoom = db.rooms.find((r) => r.id === data.old_room_id)
  const newRoom = db.rooms.find((r) => r.id === data.new_room_id)
  if (!oldRoom || !newRoom) throw new Error('Không tìm thấy phòng')

  const oldContractIdx = db.contracts.findIndex(
    (c) => c.room_id === data.old_room_id && c.status === 'active'
  )
  const oldContract = db.contracts[oldContractIdx]
  if (!oldContract) throw new Error('Không tìm thấy hợp đồng cũ')

  let tenantId = oldContract.tenant_id
  if (!tenantId) {
    tenantId = `ten-hotfix-${Date.now()}`
    db.tenants.push({
      id: tenantId,
      full_name: oldContract.tenant_name || 'Khách bị thiếu ID',
      phone: oldContract.tenant_phone || '',
      is_active: true,
      last_room_name: oldRoom.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    oldContract.tenant_id = tenantId
  }

  // --- 1. Chốt thông tin phòng cũ (Lưu tạm vào bộ nhớ Hợp Đồng để chờ lập hóa đơn gộp) ---
  const zone = db.service_zones?.find((z) => z.id === oldRoom.service_zone_id)
  const electricPrice = oldRoom.electric_price || zone?.electric_price || 0
  const waterPrice = oldRoom.water_price || zone?.water_price || 0
  // Không tạo hóa đơn nữa, giữ nguyên trạng thái chưa thanh toán chờ gộp
  // (Đã xóa logic tạo inv-close-rt-...)

  // --- 2. Kết thúc hợp đồng cũ ---
  oldContract.status = 'terminated'
  oldContract.end_date = data.change_date
  oldContract.end_note = 'Chuyển phòng sang ' + newRoom.name

  // --- 3. ĐIỀU CHUYỂN NỢ SANG PHÒNG MỚI ---
  // Tìm tất cả hoá đơn chưa trả của tenant này (ở MỌI CŨNG PHÒNG, dù là hóa đơn vừa tạo ở bước 1)
  // và gắn sang new_room_id để bảng của phòng mới hiển thị được
  db.invoices.forEach((i) => {
    if (
      i.tenant_id === tenantId &&
      (i.payment_status === 'unpaid' ||
        i.payment_status === 'partial' ||
        i.payment_status === 'cancelled')
    ) {
      i.room_id = data.new_room_id // Chuyển Nợ và audit hóa đơn theo phòng mới
    }
  })

  // --- 4. Cập nhật trạng thái các phòng ---
  oldRoom.status = 'vacant'
  oldRoom.tenant_name = undefined
  oldRoom.tenant_phone = undefined
  oldRoom.move_in_date = undefined
  oldRoom.invoice_day = undefined
  oldRoom.electric_new = data.final_electric
  oldRoom.water_new = data.final_water

  // --- 5. Tạo hợp đồng mới & Nhúng lịch sử chuyển phòng ---
  const newContract: Contract = {
    ...oldContract, // copy tên, SDT, CMND...
    id: `contract-${Date.now()}`,
    room_id: data.new_room_id,
    move_in_date: data.change_date,
    duration_months: 0, // reset
    base_rent: data.new_base_rent,
    deposit_amount: data.new_deposit,
    electric_init: data.new_electric_init,
    water_init: data.new_water_init,
    status: 'active',
    end_date: undefined,
    end_note: undefined,
    final_electric: undefined,
    final_water: undefined,
    notes: 'Chuyển từ phòng ' + oldRoom.name,
    transfer_history: {
      old_room_name: oldRoom.name,
      change_date: data.change_date,
      old_electric_old: oldRoom.electric_new || 0,
      old_electric_new: data.final_electric,
      old_electric_price: electricPrice,
      old_water_old: oldRoom.water_new || 0,
      old_water_new: data.final_water,
      old_water_price: waterPrice,
      old_base_rent: oldContract.base_rent || 0,
      old_wifi_price: zone?.internet_price || 0,
      old_garbage_price: zone?.cleaning_price || 0
    },
    created_at: new Date().toISOString()
  }
  db.contracts.push(newContract)

  const tenant = (db.tenants || []).find((item) => item.id === tenantId)
  if (tenant) {
    tenant.is_active = true
    tenant.last_room_name = newRoom.name
    tenant.left_at = undefined
    tenant.updated_at = new Date().toISOString()
  }

  newRoom.status = 'occupied'
  newRoom.tenant_name = newContract.tenant_name
  newRoom.tenant_phone = newContract.tenant_phone
  newRoom.move_in_date = newContract.move_in_date
  newRoom.invoice_day = newContract.invoice_day
  newRoom.electric_old = data.new_electric_init
  newRoom.electric_new = data.new_electric_init
  newRoom.water_old = data.new_water_init
  newRoom.water_new = data.new_water_init
  newRoom.default_deposit = data.new_deposit

  // --- 6. KHÔNG KHỞI TẠO HÓA ĐƠN TRƯỚC NỮA ---
  // Toàn bộ logic tạo hóa đơn đã bị xóa ở đây.
  // Các khoản tính điện, nước phí cũ và phòng mới sẽ được gom về `InvoiceModal.tsx` tính gọn trong 1 hóa đơn cuối tháng.

  await persistDB(db)
}

export const createTenant = async (
  data: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>
): Promise<Tenant> => {
  const db = await getDB()
  const time = new Date().toISOString()
  const tenant: Tenant = {
    ...data,
    id: `ten-${Date.now()}`,
    created_at: time,
    updated_at: time
  }
  db.tenants.push(tenant)
  await persistDB(db)
  return tenant
}

export const updateTenant = async (id: string, updates: Partial<Tenant>): Promise<Tenant> => {
  const db = await getDB()
  const index = db.tenants.findIndex((t) => t.id === id)
  if (index === -1) throw new Error('Tenant not found')
  db.tenants[index] = { ...db.tenants[index], ...updates, updated_at: new Date().toISOString() }
  await persistDB(db)
  return db.tenants[index]
}

export const deleteTenant = async (id: string): Promise<void> => {
  const db = await getDB()
  db.tenants = db.tenants.filter((t) => t.id !== id)
  await persistDB(db)
}
