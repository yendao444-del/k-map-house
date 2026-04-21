import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createContract,
  getContracts,
  getAssetSnapshots,
  getTenants,
  getRoomAssets,
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

export default function NewContractModal({ room, zone, onClose, lastInvoice, initialTenantId, initialMoveInDate, initialIsMigration, onNavigateToTenants, onNavigateToAssets }: Props) {
  const queryClient = useQueryClient()
  const today = new Date().toISOString().split('T')[0]
  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: getTenants })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
  const { data: roomAssets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ['room_assets', room.id],
    queryFn: () => getRoomAssets(room.id),
  })
  const { data: moveInSnapshots = [], isLoading: moveInLoading } = useQuery({
    queryKey: ['asset_snapshots', room.id, 'move_in'],
    queryFn: () => getAssetSnapshots(room.id, 'move_in'),
  })
  const hasNoAssets = !assetsLoading && roomAssets.length === 0
  const needsMoveIn = !assetsLoading && !moveInLoading && roomAssets.length > 0 && moveInSnapshots.length === 0

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
  const recentTenants = useMemo(
    () =>
      [...availableTenants]
        .sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime()
        )
        .slice(0, 5),
    [availableTenants]
  )
  const tenantSuggestions = useMemo(() => {
    const q = tenantQuery.trim().toLowerCase()
    if (!q) return recentTenants

    return availableTenants
      .filter(tenant =>
        tenant.full_name.toLowerCase().includes(q) ||
        (tenant.phone || '').toLowerCase().includes(q) ||
        (tenant.identity_card || '').toLowerCase().includes(q)
      )
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      )
      .slice(0, 20)
  }, [availableTenants, recentTenants, tenantQuery])

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
  const [electricTouched, setElectricTouched] = useState(false)
  const [waterTouched, setWaterTouched] = useState(false)

  useEffect(() => {
    if (!hasPreviousRoomHistory) return
    setForm(prev => ({
      ...prev,
      electric_init: electricTouched ? prev.electric_init : initialElectricReading,
      water_init: waterTouched ? prev.water_init : initialWaterReading,
    }))
  }, [electricTouched, hasPreviousRoomHistory, initialElectricReading, initialWaterReading, waterTouched])

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

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition'

  const selectTenant = (tenant: Tenant | null) => {
    setSelectedTenantId(tenant?.id || '')
    setTenantQuery(tenant ? `${tenant.full_name}${tenant.phone ? ` - ${tenant.phone}` : ''}` : '')
    setTenantMenuOpen(false)
    if (hasNoAssets) {
      setSubmitError('Phòng này chưa thiết lập tài sản. Hãy khai báo tài sản trước khi lập hợp đồng.')
      return
    }
    if (needsMoveIn) {
      setSubmitError('Phòng này đã có tài sản nhưng chưa chốt nhận phòng. Hãy sang tab Tài sản để kiểm tra và chốt nhận trước khi lập hợp đồng.')
      return
    }
    if (!readingsReady) {
      setSubmitError('Phải nhập và xác nhận chỉ số điện, nước trước khi lập hợp đồng.')
      return
    }
    setSubmitError('')
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
      notes: 'Dữ liệu demo điền tự động để test luồng',
    }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTenantId) {
      setSubmitError('Phải chọn khách thuê từ mục Khách thuê trước khi lập hợp đồng.')
      return
    }
    if (needsMoveIn) {
      setSubmitError('Phòng này đã có tài sản nhưng chưa chốt nhận phòng. Hãy sang tab Tài sản để kiểm tra và chốt nhận trước khi lập hợp đồng.')
      return
    }
    setSubmitError('')
    mutation.mutate()
  }

  useEffect(() => {
    if (selectedTenant) {
      setTenantQuery(
        `${selectedTenant.full_name}${selectedTenant.phone ? ` - ${selectedTenant.phone}` : ''}`
      )
    }
  }, [selectedTenant])

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          <div className="p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center text-white text-4xl mx-auto mb-4 shadow-lg shadow-emerald-200">
              <i className="fa-solid fa-circle-check"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-1">Lập hợp đồng thành công!</h3>
            <p className="text-sm text-gray-500 mb-1">
              <span className="font-semibold text-gray-700">{selectedTenant?.full_name}</span> đã nhận
            </p>
            <p className="text-lg font-bold text-primary mb-4">{room.name}</p>
            <div className="bg-gray-50 rounded-xl p-4 text-left text-sm space-y-2 mb-6 border border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-500">Ngày vào ở</span>
                <span className="font-medium">{new Date(form.move_in_date).toLocaleDateString('vi-VN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tiền cọc</span>
                <span className="font-semibold text-orange-600">{formatVND(form.deposit_amount)} đ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Giá thuê</span>
                <span className="font-semibold text-emerald-600">{formatVND(form.base_rent)} đ/tháng</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Lập HĐ hàng tháng</span>
                <span className="font-semibold">Ngày {form.invoice_day}</span>
              </div>
            </div>
            <button onClick={onClose} className="w-full py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold rounded-xl shadow-md shadow-emerald-200 hover:from-emerald-600 hover:to-green-600 transition">
              Xong
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="bg-gradient-to-r from-primary to-emerald-500 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <i className="fa-solid fa-file-signature text-white text-lg"></i>
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Hợp đồng mới</h2>
              <p className="text-green-100 text-xs">{room.name} · {zone?.name || 'Chưa có vùng'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={pickDemoTenant}
              disabled={availableTenants.length === 0}
              title="Điền dữ liệu mẫu"
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border border-white/20 disabled:opacity-50"
            >
              <i className="fa-solid fa-wand-magic-sparkles"></i>
              <span className="hidden sm:inline">Demo dữ liệu</span>
            </button>
            <button onClick={onClose} className="text-white/70 hover:text-white hover:bg-white/20 w-8 h-8 rounded-lg flex items-center justify-center transition">
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Cảnh báo chưa có khách thuê */}
          {tenants.length === 0 && (
            <div className="rounded-xl border-2 border-orange-300 bg-orange-50 px-4 py-4 flex gap-4 overflow-hidden relative shadow-sm">
              <div className="relative shrink-0 flex h-10 w-10">
                <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-40 animate-ping"></span>
                <span className="relative inline-flex rounded-full h-10 w-10 items-center justify-center bg-orange-100 text-orange-500 text-xl border border-orange-200">
                  <i className="fa-solid fa-user-slash"></i>
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-orange-800">Chưa có khách thuê nào trong hệ thống</p>
                <p className="text-xs text-orange-700 mt-1 leading-relaxed mb-3">
                  Hệ thống yêu cầu phải tạo hồ sơ khách thuê trước khi lập hợp đồng.
                  Hãy bấm nút bên dưới, chúng tôi sẽ hướng dẫn bạn cách tạo hồ sơ khách thuê mới nhanh chóng.
                </p>
                {onNavigateToTenants ? (
                  <button
                    type="button"
                    onClick={onNavigateToTenants}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-400 to-orange-500 hover:from-orange-500 hover:to-orange-600 text-white font-bold py-2 px-4 rounded-lg shadow-md shadow-orange-500/40 transition-all border border-orange-400 relative overflow-hidden group"
                  >
                    <span className="absolute inset-0 w-full h-full -ml-[100%] bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]"></span>
                    <i className="fa-solid fa-location-arrow animate-bounce"></i>
                    Thiết lập ngay
                  </button>
                ) : (
                  <p className="text-xs text-orange-800 font-semibold">Vui lòng đóng form và sang tab Khách thuê để tạo hồ sơ.</p>
                )}
              </div>
            </div>
          )}

          {/* Cảnh báo tất cả khách đã có hợp đồng active */}
          {tenants.length > 0 && availableTenants.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
              <i className="fa-solid fa-circle-info text-amber-500 text-lg mt-0.5 shrink-0"></i>
              <div>
                <p className="text-sm font-bold text-amber-800">Tất cả khách thuê đều đang có hợp đồng</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Danh sách chỉ hiện khách chưa có hợp đồng active. Nếu muốn thêm khách mới, vào tab{' '}
                  <strong>Khách thuê</strong> để tạo hồ sơ trước.
                </p>
              </div>
            </div>
          )}

          {/* Cảnh báo chưa setup tài sản */}
          {hasNoAssets && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-4 flex gap-4 overflow-hidden relative shadow-sm">
              <div className="relative shrink-0 flex h-10 w-10">
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-40 animate-ping"></span>
                <span className="relative inline-flex rounded-full h-10 w-10 items-center justify-center bg-amber-100 text-amber-500 text-xl border border-amber-200">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800">Phòng chưa có danh sách tài sản</p>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed mb-3">
                  Tài sản là thông tin quan trọng để đối chiếu khi khách trả phòng.
                  Bấm nút dưới đây để được hướng dẫn thêm tài sản cho phòng này.
                </p>
                {onNavigateToAssets ? (
                  <button
                    type="button"
                    onClick={onNavigateToAssets}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-2 px-4 rounded-lg shadow-md shadow-amber-500/40 transition-all border border-amber-400 relative overflow-hidden group"
                  >
                    <span className="absolute inset-0 w-full h-full -ml-[100%] bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]"></span>
                    <i className="fa-solid fa-couch animate-bounce"></i>
                    Thêm tài sản ngay
                  </button>
                ) : (
                  <p className="text-xs text-amber-800 font-semibold">Vui lòng vào tab Tài sản để thêm tài sản trước.</p>
                )}
              </div>
            </div>
          )}

          {needsMoveIn && (
            <div className="rounded-xl border-2 border-blue-300 bg-blue-50 px-4 py-4 flex gap-4 overflow-hidden relative shadow-sm">
              <div className="relative shrink-0 flex h-10 w-10">
                <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-40 animate-ping"></span>
                <span className="relative inline-flex rounded-full h-10 w-10 items-center justify-center bg-blue-100 text-blue-500 text-xl border border-blue-200">
                  <i className="fa-solid fa-clipboard-check"></i>
                </span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-blue-800">Phòng đã có tài sản nhưng chưa chốt nhận phòng</p>
                <p className="text-xs text-blue-700 mt-1 leading-relaxed mb-3">
                  Bạn đã khai báo tài sản cho phòng này rồi. Bước tiếp theo là kiểm tra lại danh sách và bấm <strong>Chốt nhận phòng</strong> để làm mốc đối chiếu cho chu kỳ thuê mới.
                </p>
                {onNavigateToAssets ? (
                  <button
                    type="button"
                    onClick={onNavigateToAssets}
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white font-bold py-2 px-4 rounded-lg shadow-md shadow-blue-500/40 transition-all border border-blue-400 relative overflow-hidden group"
                  >
                    <span className="absolute inset-0 w-full h-full -ml-[100%] bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]"></span>
                    <i className="fa-solid fa-arrow-right-to-bracket animate-bounce"></i>
                    Chốt nhận phòng
                  </button>
                ) : (
                  <p className="text-xs text-blue-800 font-semibold">Vui lòng vào tab Tài sản để chốt nhận phòng trước.</p>
                )}
              </div>
            </div>
          )}

          {!hasNoAssets && !needsMoveIn && !readingsReady && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex gap-3">
              <i className="fa-solid fa-bolt text-blue-500 text-lg mt-0.5 shrink-0"></i>
              <div>
                <p className="text-sm font-bold text-blue-800">Cần nhập chỉ số điện / nước ban đầu</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Trước khi lập hợp đồng, bạn phải nhập và xác nhận cả 2 chỉ số này để làm mốc tính hóa đơn.
                </p>
              </div>
            </div>
          )}

                    {/* Dropdown chọn loại hợp đồng */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Phân loại hợp đồng</label>
            <select
              value={isMigration ? 'migration' : 'new'}
              onChange={e => setIsMigration(e.target.value === 'migration')}
              className="w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-[13px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white font-semibold text-slate-700 shadow-sm"
            >
              <option value="new">Hợp đồng mới (Dành cho khách mới chuyển đến)</option>
              <option value="migration">Khách đang thuê (Chỉ cập nhật dữ liệu vào máy)</option>
            </select>
            {isMigration ? (
              <p className="mt-3 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2.5 rounded-lg flex items-start gap-2">
                <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0 text-amber-500"></i>
                <span>Phần mềm <strong>sẽ KHÔNG tạo phiếu thu tháng đầu và tiền cọc</strong> (do khách đã ở và đóng tiền từ trước). Hóa đơn kế tiếp sẽ sinh bình thường.</span>
              </p>
            ) : (
              <p className="mt-3 text-[12px] text-slate-500 flex items-start gap-1.5 px-1">
                <i className="fa-solid fa-circle-info mt-0.5 shrink-0 text-slate-400"></i>
                Phần mềm sẽ tự động sinh phiếu <strong>thu tiền cọc</strong> và <strong>hóa đơn tháng đầu tiên</strong>.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">A</span>
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Gán khách thuê</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Khách thuê <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    value={tenantQuery}
                    onChange={e => {
                      setTenantQuery(e.target.value)
                      setTenantMenuOpen(true)
                      if (selectedTenantId) setSelectedTenantId('')
                    }}
                    onFocus={() => setTenantMenuOpen(true)}
                    placeholder="Tìm theo tên, số điện thoại hoặc CCCD"
                    className={inputCls + ' bg-white font-medium pr-10'}
                  />
                  <i className="fa-solid fa-magnifying-glass absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                  {tenantMenuOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl">
                      {tenantSuggestions.length > 0 ? (
                        tenantSuggestions.map(tenant => (
                          <button
                            key={tenant.id}
                            type="button"
                            onClick={() => selectTenant(tenant)}
                            className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-slate-800">{tenant.full_name}</div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {tenant.phone || 'Chưa có SĐT'}{tenant.identity_card ? ` · ${tenant.identity_card}` : ''}
                              </div>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tenant.left_at ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                              {tenant.left_at ? 'Đã rời đi' : 'Gần đây'}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-center text-xs text-slate-400">Không tìm thấy khách thuê phù hợp</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  Mặc định chỉ gợi ý 5 khách gần nhất. Có thể tìm theo <span className="font-semibold">tên</span>, <span className="font-semibold">số điện thoại</span> hoặc <span className="font-semibold">CCCD</span>.
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Số điện thoại</label>
                <input value={selectedTenant?.phone || ''} readOnly placeholder="Tự động lấy từ hồ sơ khách thuê" className={inputCls + ' bg-gray-50 text-gray-600'} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CMND / CCCD</label>
                <input value={selectedTenant?.identity_card || ''} readOnly placeholder="Tự động lấy từ hồ sơ khách thuê" className={inputCls + ' bg-gray-50 text-gray-600'} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ngày sinh</label>
                <input type="date" value={form.tenant_dob} onChange={e => set('tenant_dob', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Số người ở</label>
                <select value={form.occupant_count} onChange={e => set('occupant_count', Number(e.target.value))} className={inputCls + ' bg-white'}>
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <option key={n} value={n}>{n} người</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100"></div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">B</span>
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Ngày vào ở</span>
            </div>
            <div className="max-w-[200px]">
              <input type="date" value={form.move_in_date} onChange={e => set('move_in_date', e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="border-t border-gray-100"></div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold flex items-center justify-center">C</span>
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Giá trị hợp đồng</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Giá thuê (đ/tháng)</label>
                <CurrencyInput value={form.base_rent} onChange={v => set('base_rent', v)} className={inputCls + ' font-semibold tabular-nums'} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tiền cọc (đ)</label>
                <CurrencyInput value={form.deposit_amount} onChange={v => set('deposit_amount', v)} className={inputCls + ' font-semibold tabular-nums'} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ngày lập hóa đơn hàng tháng</label>
                <input type="number" min={1} max={28} value={form.invoice_day} onChange={e => set('invoice_day', Number(e.target.value))} className={inputCls + ' font-semibold'} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100"></div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 text-xs font-bold flex items-center justify-center">D</span>
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                {isMigration ? 'Chỉ số điện nước hiện tại' : 'Chỉ số đầu kỳ'}
              </span>
              {hasPreviousRoomHistory && (
                <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  <i className="fa-solid fa-circle-check text-[10px]"></i>
                  {lastInvoice
                    ? `Tự động lấy từ HĐ tháng ${lastInvoice.month}/${lastInvoice.year}`
                    : 'Tự động lấy từ chỉ số phòng hiện tại'}
                </span>
              )}
            </div>
            {hasPreviousRoomHistory ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Điện ban đầu (kWh)</label>
                  <div className="relative">
                    <input
                      type="number" min={0} value={form.electric_init}
                      onChange={e => { set('electric_init', Number(e.target.value)); setElectricTouched(true) }}
                      className={inputCls + ` tabular-nums pr-8 focus:border-emerald-400 ${electricTouched || hasPreviousRoomHistory ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/70 border-amber-300'}`}
                    />
                    <i className="fa-solid fa-bolt absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-400 text-xs pointer-events-none"></i>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nước ban đầu (m³)</label>
                  <div className="relative">
                    <input
                      type="number" min={0} value={form.water_init}
                      onChange={e => { set('water_init', Number(e.target.value)); setWaterTouched(true) }}
                      className={inputCls + ` tabular-nums pr-8 focus:border-emerald-400 ${waterTouched || hasPreviousRoomHistory ? 'bg-emerald-50/60 border-emerald-200' : 'bg-amber-50/70 border-amber-300'}`}
                    />
                    <i className="fa-solid fa-droplet absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-400 text-xs pointer-events-none"></i>
                  </div>
                </div>
                <p className="col-span-2 text-[11px] text-gray-400">
                  Đã điền tự động từ chỉ số cuối kỳ trước. Có thể chỉnh lại nếu cần.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Điện ban đầu (kWh)</label>
                  <input type="number" min={0} value={form.electric_init} onChange={e => { set('electric_init', Number(e.target.value)); setElectricTouched(true) }} className={inputCls + ` tabular-nums ${electricTouched ? 'border-emerald-300 bg-emerald-50/50' : 'border-amber-300 bg-amber-50/50'}`} placeholder="VD: 125" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nước ban đầu (m³)</label>
                  <input type="number" min={0} value={form.water_init} onChange={e => { set('water_init', Number(e.target.value)); setWaterTouched(true) }} className={inputCls + ` tabular-nums ${waterTouched ? 'border-emerald-300 bg-emerald-50/50' : 'border-amber-300 bg-amber-50/50'}`} placeholder="VD: 15" />
                </div>
              </div>
            )}
          </div>

          {isMigration && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-6 h-6 rounded-full bg-red-100 text-red-500 text-xs font-bold flex items-center justify-center">E</span>
                <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Nợ tồn đọng</span>
                <span className="text-xs text-gray-400">(tùy chọn)</span>
              </div>
              <CurrencyInput
                value={form.migration_debt}
                onChange={v => set('migration_debt', v)}
                className={inputCls + ' tabular-nums'}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Nếu khách đang nợ tiền từ trước khi dùng phần mềm, nhập số tiền vào đây — hệ thống sẽ tạo 1 phiếu thu nợ riêng.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú (tùy chọn)</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              placeholder="VD: Phòng có thêm 1 xe máy..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-300 focus:border-gray-300 outline-none transition resize-none"
            />
          </div>

          {submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0"></i>
              <span>{submitError}</span>
            </div>
          )}

          <div className="sticky bottom-0 -mx-6 px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0 bg-gray-50/95 backdrop-blur-sm">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition">
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || availableTenants.length === 0 || !selectedTenantId || hasNoAssets || !readingsReady}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-primary to-emerald-500 hover:from-primary-dark hover:to-emerald-600 shadow-md shadow-primary/20 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {mutation.isPending ? (
                <><i className="fa-solid fa-spinner animate-spin"></i> Đang lưu...</>
              ) : (
                <><i className="fa-solid fa-file-signature"></i> Lập hợp đồng</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
