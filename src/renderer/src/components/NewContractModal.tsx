import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createContract,
  getContracts,
  getTenants,
  createTenant,
  type Invoice,
  type Room,
  type ServiceZone,
  type Tenant,
} from '../lib/db'
import { playCreate } from '../lib/sound'

interface Props {
  room: Room
  zone?: ServiceZone
  onClose: () => void
  lastInvoice?: Invoice
  initialTenantId?: string
  initialMoveInDate?: string
  initialIsMigration?: boolean
  onNavigateToTenants?: () => void
  onNavigateToAssets?: () => void
}

function formatVND(n: number) {
  return n.toLocaleString('vi-VN')
}

function parseCurrency(s: string): number {
  return parseInt(s.replace(/\./g, '').replace(/[^0-9]/g, ''), 10) || 0
}

function CurrencyInput({
  value,
  onChange,
  className = '',
}: {
  value: number
  onChange: (v: number) => void
  className?: string
}) {
  const [display, setDisplay] = useState(formatVND(value))
  const [focused, setFocused] = useState(false)

  return (
    <input
      type="text"
      inputMode="numeric"
      value={focused ? display : formatVND(value)}
      onFocus={() => {
        setFocused(true)
        setDisplay(value === 0 ? '' : String(value))
      }}
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9]/g, '')
        setDisplay(raw)
        onChange(parseInt(raw, 10) || 0)
      }}
      onBlur={() => {
        setFocused(false)
        onChange(parseCurrency(display))
      }}
      className={className}
    />
  )
}

export default function NewContractModal({ room, onClose, lastInvoice, initialTenantId, initialMoveInDate, initialIsMigration, onNavigateToTenants, onNavigateToAssets }: Props) {
  const queryClient = useQueryClient()
  const today = new Date().toISOString().split('T')[0]
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: getTenants })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts })

  const activeTenantIds = useMemo(
    () => new Set(contracts.filter(contract => contract.status === 'active').map(contract => contract.tenant_id).filter(Boolean)),
    [contracts]
  )

  const availableTenants = useMemo(
    () => tenants.filter(tenant => !activeTenantIds.has(tenant.id)),
    [activeTenantIds, tenants]
  )
  const hasPreviousRoomHistory = useMemo(
    () => !!lastInvoice || contracts.some(contract => contract.room_id === room.id && contract.status !== 'active'),
    [contracts, lastInvoice, room.id]
  )
  const initialElectricReading = lastInvoice?.electric_new ?? room.electric_new ?? room.electric_old ?? 0
  const initialWaterReading = lastInvoice?.water_new ?? room.water_new ?? room.water_old ?? 0

  const [selectedTenantId, setSelectedTenantId] = useState(initialTenantId || '')
  const [tenantQuery, setTenantQuery] = useState('')
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false)

  const selectedTenant = useMemo(
    () => availableTenants.find(tenant => tenant.id === selectedTenantId) || null,
    [availableTenants, selectedTenantId]
  )

  const tenantSuggestions = useMemo(() => {
    const q = tenantQuery.trim().toLowerCase()
    return availableTenants
      .filter(tenant =>
        tenant.full_name.toLowerCase().includes(q) ||
        (tenant.phone || '').toLowerCase().includes(q)
      )
      .slice(0, 10)
  }, [availableTenants, tenantQuery])

  const [isMigration, setIsMigration] = useState(initialIsMigration ?? false)

  const [form, setForm] = useState({
    tenant_dob: '',
    occupant_count: 1,
    move_in_date: initialMoveInDate || today,
    base_rent: room.base_rent,
    deposit_amount: room.default_deposit || room.base_rent,
    invoice_day: room.invoice_day || 5,
    electric_init: initialElectricReading,
    water_init: initialWaterReading,
    migration_debt: 0,
    notes: '',
  })

  const [isQuickAdding, setIsQuickAdding] = useState(false)
  const [quickTenant, setQuickTenant] = useState({ full_name: '', phone: '', identity_card: '' })
  const [electricTouched, setElectricTouched] = useState(false)
  const [waterTouched, setWaterTouched] = useState(false)

  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const readingsReady = hasPreviousRoomHistory || (electricTouched && waterTouched)

  const mutation = useMutation({
    mutationFn: () =>
      createContract({
        room_id: room.id,
        tenant_id: selectedTenantId,
        tenant_dob: form.tenant_dob || undefined,
        occupant_count: form.occupant_count,
        move_in_date: form.move_in_date,
        duration_months: 0,
        base_rent: form.base_rent,
        deposit_amount: form.deposit_amount,
        billing_cycle: 1,
        invoice_day: form.invoice_day,
        electric_init: form.electric_init,
        water_init: form.water_init,
        status: 'active',
        notes: form.notes.trim() || undefined,
        is_migration: isMigration || undefined,
        migration_debt: isMigration && form.migration_debt > 0 ? form.migration_debt : undefined,
      }),
    onSuccess: () => {
      playCreate()
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      queryClient.invalidateQueries({ queryKey: ['asset_snapshots'] })
      setSubmitError('')
      if (!isMigration) {
        onClose()
        return
      }
      setSubmitted(true)
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : 'Không thể lập hợp đồng mới.')
    },
  })

  const set = (field: keyof typeof form, value: string | number) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const selectTenant = (tenant: Tenant | null) => {
    setSelectedTenantId(tenant?.id || '')
    setTenantQuery(tenant ? `${tenant.full_name}${tenant.phone ? ` - ${tenant.phone}` : ''}` : '')
    setTenantMenuOpen(false)
  }

  const quickAddMutation = useMutation({
    mutationFn: (tenantData: Partial<Tenant>) => createTenant(tenantData),
    onSuccess: (newTenant) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      selectTenant(newTenant)
      setIsQuickAdding(false)
      setQuickTenant({ full_name: '', phone: '', identity_card: '' })
    },
  })

  const confirmQuickAdd = () => {
    if (!quickTenant.full_name) return
    quickAddMutation.mutate(quickTenant)
  }

  const pickDemoTenant = () => {
    if (availableTenants.length === 0) return
    selectTenant(availableTenants[0])
    setForm(prev => ({
      ...prev,
      tenant_dob: '1995-05-15',
      occupant_count: 2,
      electric_init: 125,
      water_init: 15,
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTenantId) {
      setSubmitError('Vui lòng chọn khách thuê.')
      return
    }
    mutation.mutate()
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-[90]">
        <div className="bg-white rounded-2xl w-full max-w-[400px] overflow-hidden flex flex-col shadow-2xl border border-gray-200 p-8 text-center animate-[fadeIn_0.15s_ease-out]">
          <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white text-2xl mx-auto mb-4 shadow-sm shadow-green-200">
            <i className="fa-solid fa-check"></i>
          </div>
          <h3 className="text-[17px] font-bold text-gray-900 leading-tight">Khởi tạo thành công!</h3>
          <p className="text-xs text-gray-500 mt-2">Hợp đồng cho <span className="font-semibold text-gray-700">{room.name}</span> đã hoàn tất.</p>
          <button onClick={onClose} className="w-full mt-6 py-2.5 bg-green-600 text-white font-bold rounded-xl shadow-sm shadow-green-100 hover:bg-green-700 transition-colors">Đóng</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-start pt-6 p-4 z-[90]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-[500px] max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-gray-200 animate-[fadeIn_0.15s_ease-out]">

        {/* ── HEADER ────────────────────────────── */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center text-white shadow-sm shadow-green-200 shrink-0">
            <i className="fa-solid fa-file-contract text-base"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 text-[15px] leading-tight truncate">
              Lập hợp đồng cho &ldquo;{room.name}&rdquo;
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              {(room as any).zone?.name || 'Khu vực chưa xác định'}
            </p>
          </div>
          <button type="button" onClick={pickDemoTenant} className="px-2.5 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-colors shrink-0">
            <i className="fa-solid fa-magic-wand-sparkles"></i>
            DEMO
          </button>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition shrink-0">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-4 py-3.5 space-y-4 bg-gray-50/30">

          {/* Alerts */}
          {availableTenants.length === 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3.5 flex gap-4 shadow-sm items-start">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <i className="fa-solid fa-user-xmark"></i>
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <div>
                  <p className="text-red-900 font-bold text-[13px] leading-tight">Tất cả khách thuê đều đang có hợp đồng</p>
                  <p className="text-red-700 text-[11px] leading-relaxed mt-1">
                    Bạn cần tạo hồ sơ khách thuê ở màn hình Danh sách Khách thuê trước khi tạo hợp đồng.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToTenants?.();
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white text-[10px] font-black rounded-lg inline-flex items-center gap-2 shadow-sm uppercase tracking-wider transition-transform active:scale-95"
                >
                  <i className="fa-solid fa-user-plus"></i>
                  Đến menu Khách thuê
                </button>
              </div>
            </div>
          )}

          {/* Asset Warning (Tour Onboarding) */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3.5 flex gap-4 shadow-sm items-start">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <i className="fa-solid fa-couch"></i>
            </div>
            <div className="space-y-2 flex-1 min-w-0">
              <div>
                <p className="text-amber-900 font-bold text-[13px] leading-tight">Phòng chưa có danh sách tài sản</p>
                <p className="text-amber-700 text-[11px] leading-relaxed mt-1">
                  Tài sản là thông tin quan trọng để đối chiếu bàn giao. Hãy dành ít phút để thiết lập.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToAssets?.();
                }}
                className="px-4 py-2 bg-gradient-to-r from-orange-400 to-amber-500 text-white text-[10px] font-black rounded-lg inline-flex items-center gap-2 shadow-sm uppercase tracking-wider transition-transform active:scale-95"
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i>
                Thêm tài sản ngay
              </button>
            </div>
          </div>

          {/* Loại hợp đồng */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Phân loại chuyển cọc <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <select
                value={isMigration ? 'migration' : 'new'}
                onChange={e => setIsMigration(e.target.value === 'migration')}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 bg-white outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 appearance-none transition cursor-pointer"
              >
                <option value="new">Hợp đồng mới (Khách mới đến)</option>
                <option value="migration">Hợp đồng cũ (Di cư dữ liệu từ app cũ / số dư nợ cũ)</option>
              </select>
              <i className="fa-solid fa-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
            </div>
          </div>

          {/* ── SECTION: KHÁCH THUÊ ── */}
          <div className="border border-blue-100 rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="bg-blue-50 px-4 py-2.5 flex items-center gap-2.5 border-b border-blue-100/50">
              <div className="w-7 h-7 rounded-lg bg-white border border-blue-200 flex items-center justify-center text-blue-500 shrink-0">
                <i className="fa-solid fa-user-check text-[11px]"></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-800 text-sm">Đại diện thuê phòng</div>
                <div className="text-[11px] text-gray-500 mt-0.5">Gán khách thuê vào phòng này</div>
              </div>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Khách thuê <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input
                    value={tenantQuery}
                    onChange={e => { setTenantQuery(e.target.value); setTenantMenuOpen(true); if (selectedTenantId) setSelectedTenantId('') }}
                    onFocus={() => setTenantMenuOpen(true)}
                    placeholder="Tìm theo tên, SĐT, CCCD..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium text-gray-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 transition pr-8"
                  />
                  <i className="fa-solid fa-magnifying-glass absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs text-gray-300"></i>
                  {tenantMenuOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl shadow-gray-200/50 py-1">
                      {tenantSuggestions.map(t => (
                        <button key={t.id} type="button" onClick={() => selectTenant(t)} className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex flex-col items-start gap-0.5">
                          <span className="font-bold text-gray-700 text-sm">{t.full_name}</span>
                          <span className="text-[11px] text-gray-400">{t.phone || 'Không có SĐT'}</span>
                        </button>
                      ))}
                      <div className="px-2 pt-1 pb-1">
                        <button type="button" onClick={() => setIsQuickAdding(true)} className="w-full py-1.5 text-center text-blue-600 border border-dashed border-blue-200 hover:bg-blue-50 rounded text-[11px] font-bold transition-colors">
                          + Thêm nhanh khách hàng
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {isQuickAdding && (
                <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex flex-col gap-2 animate-[fadeIn_0.2s]">
                  <input autoFocus placeholder="Họ và tên..." value={quickTenant.full_name} onChange={e => setQuickTenant(p => ({ ...p, full_name: e.target.value }))} className="w-full border border-blue-200 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-blue-400 shadow-sm" />
                  <div className="flex gap-2">
                    <input placeholder="SĐT..." value={quickTenant.phone} onChange={e => setQuickTenant(p => ({ ...p, phone: e.target.value }))} className="flex-1 border border-blue-200 rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-blue-400 shadow-sm" />
                    <button type="button" onClick={confirmQuickAdd} className="bg-blue-600 text-white px-4 rounded-md text-[11px] font-bold shadow-sm hover:bg-blue-700 transition">Lưu</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Số điện thoại</label>
                  <input disabled value={selectedTenant?.phone || ''} placeholder="Tự động" className="w-full border border-gray-200 bg-gray-50 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 cursor-not-allowed outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">CMND / CCCD</label>
                  <input disabled value={selectedTenant?.identity_card || ''} placeholder="Tự động" className="w-full border border-gray-200 bg-gray-50 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 cursor-not-allowed outline-none" />
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION: CẤU HÌNH BIỂU PHÍ ── */}
          <div className="border border-green-100 rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="bg-green-50 px-4 py-2.5 flex items-center gap-2.5 border-b border-green-100/50">
              <div className="w-7 h-7 rounded-lg bg-white border border-green-200 flex items-center justify-center text-green-500 shrink-0">
                <i className="fa-solid fa-coins text-[11px]"></i>
              </div>
              <div>
                <div className="font-bold text-gray-800 text-sm">Cấu hình biểu phí</div>
                <div className="text-[11px] text-gray-500 mt-0.5">Xác định tiền phòng, tiền cọc</div>
              </div>
            </div>

            <div className="px-4 py-3 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Giá thuê phòng / tháng <span className="text-red-400">*</span></label>
                <div className="relative">
                  <CurrencyInput value={form.base_rent} onChange={v => set('base_rent', v)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-900 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200 transition tabular-nums" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">VNĐ</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Tiền đặt cọc</label>
                <div className="relative">
                  <CurrencyInput value={form.deposit_amount} onChange={v => set('deposit_amount', v)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-orange-600 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200 transition tabular-nums" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Chốt hóa đơn vào</label>
                <div className="relative">
                  <select value={form.invoice_day} onChange={e => set('invoice_day', Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white outline-none focus:border-green-400 transition cursor-pointer appearance-none">
                    {[...Array(28)].map((_, i) => <option key={i + 1} value={i + 1}>Ngày {i + 1} hàng tháng</option>)}
                  </select>
                  <i className="fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Ngày dọn vào</label>
                <input type="date" value={form.move_in_date} onChange={e => set('move_in_date', e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-green-400 transition" />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Số lượng người ở</label>
                <div className="relative">
                  <select value={form.occupant_count} onChange={e => set('occupant_count', Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white outline-none focus:border-green-400 transition cursor-pointer appearance-none">
                    {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} người</option>)}
                  </select>
                  <i className="fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION: CHỈ SỐ GHI NHẬN ── */}
          <div className="border border-orange-100 rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="bg-orange-50 px-4 py-2.5 flex items-center gap-2.5 border-b border-orange-100/50">
              <div className="w-7 h-7 rounded-lg bg-white border border-orange-200 flex items-center justify-center text-orange-500 shrink-0">
                <i className="fa-solid fa-tachometer-alt text-[11px]"></i>
              </div>
              <div>
                <div className="font-bold text-gray-800 text-sm">Chỉ số đầu kỳ</div>
                <div className="text-[11px] text-gray-500 mt-0.5">Điện và nước ban đầu</div>
              </div>
            </div>

            <div className="px-4 py-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">
                  <i className="fa-solid fa-bolt text-yellow-500 mr-1"></i> Số điện
                </label>
                <input type="number" value={form.electric_init} onChange={e => { set('electric_init', Number(e.target.value)); setElectricTouched(true) }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-orange-400 focus:ring-1 transition tabular-nums" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">
                  <i className="fa-solid fa-droplet text-blue-500 mr-1"></i> Số nước
                </label>
                <input type="number" value={form.water_init} onChange={e => { set('water_init', Number(e.target.value)); setWaterTouched(true) }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-orange-400 focus:ring-1 transition tabular-nums" />
              </div>

              {isMigration && (
                <div className="col-span-2 pt-1">
                  <label className="block text-[11px] font-bold text-red-500 mb-1.5">
                    Nợ cũ / Nợ di trú (Nếu có)
                  </label>
                  <CurrencyInput value={form.migration_debt} onChange={v => set('migration_debt', v)} className="w-full border border-red-200 bg-red-50 rounded-lg px-3 py-2 text-sm font-bold text-red-600 outline-none focus:border-red-400 transition tabular-nums" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ghi chú riêng</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Điều khoản đặc biệt hoặc thỏa thuận ngoài..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 min-h-[70px] resize-none" />
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 text-center">
              <i className="fa-solid fa-circle-exclamation mr-1.5"></i>{submitError}
            </div>
          )}

        </form>

        {/* ── FOOTER ────────────────────────────── */}
        <div className="px-4 py-3 bg-white border-t border-gray-100 flex gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={mutation.isPending || !selectedTenantId || !readingsReady}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 shadow-sm shadow-green-100 transition disabled:opacity-60 disabled:hover:bg-green-600 flex items-center justify-center gap-2"
          >
            {mutation.isPending ? (
              <><i className="fa-solid fa-spinner animate-spin"></i> Đang xử lý...</>
            ) : (
              <><i className="fa-solid fa-check"></i> Xác nhận Hợp đồng</>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
