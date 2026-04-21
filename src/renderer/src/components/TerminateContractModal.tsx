import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getInvoicesByRoom,
  getContracts,
  getServiceZones,
  getRoomAssets,
  getAssetSnapshots,
  terminateContract,
  type Room,
  type Contract,
} from '../lib/db'

interface Props {
  room: Room
  onClose: () => void
  onNavigateToAssets?: (room: Room) => void
}

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v)


const BILLING_REASON_LABEL: Record<string, string> = {
  first_month: 'Tháng đầu tiên',
  monthly: 'Tiền tháng',
  contract_end: 'Tất toán hợp đồng',
  room_cycle: 'Chu kỳ phòng',
  service: 'Dịch vụ',
  deposit_collect: 'Thu tiền cọc',
  deposit_refund: 'Hoàn tiền cọc',
  migration_debt: 'Nợ tồn đọng (cũ)',
}

export function TerminateContractModal({ room, onClose, onNavigateToAssets }: Props) {
  const queryClient = useQueryClient()
  const today = new Date().toISOString().split('T')[0]

  const [endDate, setEndDate] = useState(today)
  const [finalElectric, setFinalElectric] = useState<number>(room.electric_new || 0)
  const [finalWater, setFinalWater] = useState<number>(room.water_new || 0)
  const [damageAmount, setDamageAmount] = useState(0)
  const [damageNote, setDamageNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash')
  const [selectedMergeIds, setSelectedMergeIds] = useState<Set<string>>(new Set())
  const [confirmed, setConfirmed] = useState(false)
  const [done, setDone] = useState(false)

  // Kiểm tra tài sản khi trả phòng — ĐÃ XÓA: dùng kết quả từ tab Tài sản thay thế

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', room.id],
    queryFn: () => getInvoicesByRoom(room.id),
  })

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts'],
    queryFn: getContracts,
  })

  const { data: serviceZones = [] } = useQuery({
    queryKey: ['serviceZones'],
    queryFn: getServiceZones,
  })

  const { data: roomAssets = [] } = useQuery({
    queryKey: ['room_assets', room.id],
    queryFn: () => getRoomAssets(room.id),
  })


  const { data: moveOutSnaps = [] } = useQuery({
    queryKey: ['asset_snapshots', room.id, 'move_out'],
    queryFn: () => getAssetSnapshots(room.id, 'move_out'),
  })

  const { data: handoverSnaps = [] } = useQuery({
    queryKey: ['asset_snapshots', room.id, 'handover'],
    queryFn: () => getAssetSnapshots(room.id, 'handover'),
  })

  const activeContract: Contract | undefined = useMemo(
    () => contracts.find(c => c.room_id === room.id && c.status === 'active'),
    [contracts, room.id]
  )

  const zone = useMemo(
    () => serviceZones.find(z => z.id === room.service_zone_id) || null,
    [serviceZones, room.service_zone_id]
  )

  // Hóa đơn chưa trả (có thể gộp) — loại trừ phiếu tất toán
  const unpaidInvoices = useMemo(
    () => invoices.filter(i =>
      (i.payment_status === 'unpaid' || i.payment_status === 'partial') &&
      !i.is_settlement &&
      (!activeContract?.tenant_id || i.tenant_id === activeContract.tenant_id)
    ),
    [activeContract?.tenant_id, invoices]
  )

  const toggleMerge = (id: string) => {
    setSelectedMergeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const mergeAll = () => {
    setSelectedMergeIds(new Set(unpaidInvoices.map(i => i.id)))
  }

  // Tính toán
  const electricPrice = room.electric_price || zone?.electric_price || 0
  const waterPrice = room.water_price || zone?.water_price || 0
  const electricOld = room.electric_new || 0
  const waterOld = room.water_new || 0

  const electricUsage = Math.max(0, finalElectric - electricOld)
  const electricCost = electricUsage * electricPrice
  const waterUsage = Math.max(0, finalWater - waterOld)
  const waterCost = waterUsage * waterPrice

  const mergedDebt = useMemo(() => {
    return invoices
      .filter(i => selectedMergeIds.has(i.id) && (!activeContract?.tenant_id || i.tenant_id === activeContract.tenant_id))
      .reduce((sum, i) => sum + Math.max(0, i.total_amount - i.paid_amount), 0)
  }, [activeContract?.tenant_id, invoices, selectedMergeIds])

  const assetDamageTotal = useMemo(
    () => moveOutSnaps.reduce((sum, s) => sum + (s.deduction || 0), 0),
    [moveOutSnaps]
  )
  const handoverDamageTotal = useMemo(
    () => handoverSnaps.reduce((sum, s) => sum + (s.deduction || 0), 0),
    [handoverSnaps]
  )
  const hasMoveOutDone = moveOutSnaps.length > 0
  // Bàn giao được đưa về tab Tài sản — kiểm tra handoverSnaps
  const HANDOVER_IDS = ['__check_cleared', '__check_cleaned', '__check_keys']
  const hasHandoverDone = handoverSnaps.length > 0 && HANDOVER_IDS.every(id => {
    const s = handoverSnaps.find(x => x.room_asset_id === id)
    return s?.condition === 'ok' || (s?.condition === 'not_done' && (s.deduction || 0) > 0)
  })

  const depositHeld = activeContract?.deposit_amount || room.default_deposit || 0
  const totalCharges = electricCost + waterCost + mergedDebt + damageAmount + assetDamageTotal + handoverDamageTotal
  const netDue = totalCharges - depositHeld
  const refundAmount = netDue < 0 ? Math.abs(netDue) : 0

  const mutation = useMutation({
    mutationFn: async () => {
      await terminateContract({
        room_id: room.id,
        contract_id: activeContract?.id || '',
        end_date: endDate,
        final_electric: finalElectric,
        final_water: finalWater,
        merge_invoice_ids: Array.from(selectedMergeIds),
        damage_amount: damageAmount + assetDamageTotal + handoverDamageTotal,
        damage_note: damageNote,
        payment_method: paymentMethod,
      })
      // Snapshot tài sản đã được lưu từ tab Tài sản rồi, không cần tạo lại
    },
    onSuccess: () => {
      import('../lib/sound').then(({ playSuccess }) => playSuccess());
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['asset_snapshots', room.id, 'move_out'] })
      setDone(true)
    },
  })

  // --- MÀN HÌNH THÀNH CÔNG ---
  if (done) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[fadeIn_0.2s_ease-out]">
          <div className="p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-4xl mx-auto mb-4 shadow-lg shadow-blue-200">
              <i className="fa-solid fa-circle-check"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-1">Tất toán thành công!</h3>
            <p className="text-sm text-gray-500 mb-4">
              Phòng <span className="font-bold text-gray-700">{room.name}</span> đã được trả lại.
            </p>
            <div className="bg-gray-50 rounded-xl p-4 text-left text-sm space-y-2 mb-6 border border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-500">Tổng phát sinh</span>
                <span className="font-semibold">{formatVND(totalCharges)} đ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tiền cọc đã trừ</span>
                <span className="font-semibold text-emerald-600">− {formatVND(depositHeld)} đ</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="font-bold text-gray-700">{netDue > 0 ? 'Khách còn thiếu' : 'Hoàn lại khách'}</span>
                <span className={`font-black text-lg ${netDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {netDue > 0 ? formatVND(netDue) : formatVND(refundAmount)} đ
                </span>
              </div>
            </div>
            <button onClick={onClose} className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold rounded-xl shadow-md shadow-blue-200 hover:from-blue-600 hover:to-indigo-600 transition">
              Đóng
            </button>
          </div>
        </div>
      </div>
    )
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition'

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 pt-6"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[95vh] animate-[fadeIn_0.2s_ease-out]">

        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <i className="fa-solid fa-door-closed text-white text-lg"></i>
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Tất toán hợp đồng</h2>
              <p className="text-red-100 text-xs">{room.name} · {room.tenant_name || '—'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white hover:bg-white/20 w-8 h-8 rounded-lg flex items-center justify-center transition">
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Cảnh báo không có hợp đồng */}
          {!activeContract && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex gap-2">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0"></i>
              <span>Không tìm thấy hợp đồng đang hoạt động cho phòng này.</span>
            </div>
          )}

          {/* A. Ngày trả phòng */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center">A</span>
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Ngày trả phòng</span>
            </div>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className={inputCls + ' max-w-[200px]'}
            />
          </div>

          {/* B. Chỉ số điện/nước cuối */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-yellow-100 text-yellow-600 text-xs font-bold flex items-center justify-center">B</span>
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Chỉ số cuối kỳ</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Điện */}
              <div className="rounded-xl border border-yellow-100 bg-yellow-50/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700"><i className="fa-solid fa-bolt text-yellow-500 mr-1"></i>Điện</span>
                  <span className="text-xs text-gray-400">{formatVND(electricPrice)} đ/kWh</span>
                </div>
                <div className="flex gap-2 mb-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 mb-1 block">Chỉ số cũ</label>
                    <input type="number" value={electricOld} readOnly className="w-full rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-400 cursor-not-allowed" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 mb-1 block">Chỉ số mới</label>
                    <input
                      type="number"
                      value={finalElectric || ''}
                      onChange={e => setFinalElectric(Number(e.target.value) || 0)}
                      className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none focus:ring-1 ${finalElectric < electricOld ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white focus:border-yellow-400'}`}
                    />
                  </div>
                </div>
                {electricUsage > 0 ? (
                  <div className="flex justify-between text-xs pt-1 border-t border-yellow-100">
                    <span className="text-gray-500">Dùng {electricUsage} kWh</span>
                    <span className="font-bold text-gray-800">{formatVND(electricCost)} đ</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs pt-1 border-t border-yellow-100 text-amber-600">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>Chỉ số không đổi — xác nhận nếu đúng</span>
                  </div>
                )}
              </div>

              {/* Nước */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700"><i className="fa-solid fa-droplet text-blue-500 mr-1"></i>Nước</span>
                  <span className="text-xs text-gray-400">{formatVND(waterPrice)} đ/m³</span>
                </div>
                <div className="flex gap-2 mb-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 mb-1 block">Chỉ số cũ</label>
                    <input type="number" value={waterOld} readOnly className="w-full rounded-lg border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-400 cursor-not-allowed" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 mb-1 block">Chỉ số mới</label>
                    <input
                      type="number"
                      value={finalWater || ''}
                      onChange={e => setFinalWater(Number(e.target.value) || 0)}
                      className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none focus:ring-1 ${finalWater < waterOld ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white focus:border-blue-400'}`}
                    />
                  </div>
                </div>
                {waterUsage > 0 ? (
                  <div className="flex justify-between text-xs pt-1 border-t border-blue-100">
                    <span className="text-gray-500">Dùng {waterUsage} m³</span>
                    <span className="font-bold text-gray-800">{formatVND(waterCost)} đ</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs pt-1 border-t border-blue-100 text-amber-600">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>Chỉ số không đổi — xác nhận nếu đúng</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* C. Trạng thái đối chiếu trả phòng (từ tab Tài sản) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-600 text-xs font-bold flex items-center justify-center">C</span>
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Đối chiếu trả phòng</span>
            </div>

            {!hasMoveOutDone ? (
              <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-triangle-exclamation text-amber-500 text-lg"></i>
                  </div>
                  <div>
                    <p className="font-bold text-amber-800 text-sm">Chưa đối chiếu tài sản!</p>
                    <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                      Bạn cần sang <strong>tab Tài sản</strong>, chọn phòng <strong>{room.name}</strong>,
                      sau đó nhấn <strong>"Đối chiếu trả phòng"</strong> để ghi nhận tình trạng tài sản
                      trước khi tiến hành tất toán.
                    </p>
                    {onNavigateToAssets && (
                      <button
                        type="button"
                        onClick={() => onNavigateToAssets(room)}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
                      >
                        <i className="fa-solid fa-couch"></i>
                        Đi tới Tài sản
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : !hasHandoverDone ? (
              <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-triangle-exclamation text-amber-500 text-lg"></i>
                  </div>
                  <div>
                    <p className="font-bold text-amber-800 text-sm">Chưa hoàn tất bàn giao phòng!</p>
                    <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                      Vui lòng mở lại <strong>"Đối chiếu trả phòng"</strong> trong tab <strong>Tài sản</strong>
                      và xác nhận đủ phần bàn giao phòng trước khi tất toán.
                    </p>
                    {onNavigateToAssets && (
                      <button
                        type="button"
                        onClick={() => onNavigateToAssets(room)}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
                      >
                        <i className="fa-solid fa-couch"></i>
                        Mở lại Đối chiếu trả phòng
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                    <i className="fa-solid fa-circle-check text-teal-600"></i>
                  </div>
                  <div>
                    <p className="font-bold text-teal-800 text-sm">Đã đối chiếu và bàn giao xong</p>
                    <p className="text-teal-600 text-xs">{moveOutSnaps.length} tài sản đã được ghi nhận · đã xác nhận bàn giao phòng</p>
                  </div>
                </div>
                {/* Danh sách các tài sản có khấu trừ */}
                {moveOutSnaps.filter(s => s.deduction > 0).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wider mb-1">Các khoản khấu trừ:</p>
                    {moveOutSnaps.filter(s => s.deduction > 0).map(s => {
                      const asset = roomAssets.find(a => a.id === s.room_asset_id)
                      return (
                        <div key={s.id} className="flex justify-between text-xs bg-white rounded-lg px-3 py-2 border border-teal-100">
                          <span className="text-gray-700 font-medium">{asset?.name || 'Tài sản không xác định'}</span>
                          <span className="font-bold text-red-600">− {formatVND(s.deduction)} đ</span>
                        </div>
                      )
                    })}
                    <div className="flex justify-between text-sm font-bold pt-1 border-t border-teal-200 mt-1">
                      <span className="text-gray-700">Tổng khấu trừ tài sản</span>
                      <span className="text-red-600">{formatVND(assetDamageTotal)} đ</span>
                    </div>
                  </div>
                )}
                {moveOutSnaps.filter(s => s.deduction > 0).length === 0 && (
                  <p className="text-xs text-teal-600 italic">Không có khấu trừ hỏng hóc.</p>
                )}
                {handoverSnaps.filter(s => s.deduction > 0).length > 0 && (
                  <div className="space-y-1.5 mt-3 pt-3 border-t border-teal-200">
                    <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wider mb-1">Chi phí bàn giao:</p>
                    {handoverSnaps.filter(s => s.deduction > 0).map(s => {
                      const item = HANDOVER_IDS.includes(s.room_asset_id)
                        ? s.room_asset_id === '__check_cleared'
                          ? 'Dọn đồ cá nhân'
                          : s.room_asset_id === '__check_cleaned'
                            ? 'Vệ sinh phòng'
                            : 'Chìa khóa / thẻ / remote'
                        : 'Bàn giao phòng'
                      return (
                        <div key={s.id} className="flex justify-between text-xs bg-white rounded-lg px-3 py-2 border border-teal-100">
                          <span className="text-gray-700 font-medium">{item}</span>
                          <span className="font-bold text-red-600">− {formatVND(s.deduction)} đ</span>
                        </div>
                      )
                    })}
                    <div className="flex justify-between text-sm font-bold pt-1 border-t border-teal-200 mt-1">
                      <span className="text-gray-700">Tổng chi phí bàn giao</span>
                      <span className="text-red-600">{formatVND(handoverDamageTotal)} đ</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* E. Nợ tồn đọng */}
          {unpaidInvoices.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center">E</span>
                  <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Nợ tồn đọng</span>
                </div>
                <button
                  type="button"
                  onClick={mergeAll}
                  className="text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1 rounded-lg transition"
                >
                  <i className="fa-solid fa-layer-group mr-1"></i>Gộp tất cả
                </button>
              </div>
              <div className="space-y-2">
                {unpaidInvoices.map(inv => {
                  const remaining = inv.total_amount - inv.paid_amount
                  const checked = selectedMergeIds.has(inv.id)
                  const billingReason = inv.billing_reason || ''
                  return (
                    <label key={inv.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition ${checked ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMerge(inv.id)}
                        className="w-4 h-4 rounded accent-orange-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800">
                          {billingReason === 'monthly' || billingReason === 'first_month'
                            ? `${BILLING_REASON_LABEL[billingReason]} — Tháng ${inv.month}/${inv.year}`
                            : (BILLING_REASON_LABEL[billingReason] || `HĐ ${inv.month}/${inv.year}`)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Còn thiếu: <span className="font-bold text-red-500">{formatVND(remaining)} đ</span>
                          {inv.paid_amount > 0 && ` (đã trả ${formatVND(inv.paid_amount)} đ)`}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
              {selectedMergeIds.size > 0 && (
                <div className="mt-2 text-right text-sm font-bold text-orange-600">
                  Tổng nợ gộp: {formatVND(mergedDebt)} đ
                </div>
              )}
            </div>
          )}

          {/* E. Đền bù hỏng hóc bổ sung */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-xs font-bold flex items-center justify-center">E</span>
              <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Hỏng hóc bổ sung</span>
              <span className="text-xs text-gray-400 font-normal">(tùy chọn)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min={0}
                value={damageAmount || ''}
                onChange={e => setDamageAmount(Number(e.target.value) || 0)}
                placeholder="Số tiền (đ)"
                className={inputCls}
              />
              <input
                type="text"
                value={damageNote}
                onChange={e => setDamageNote(e.target.value)}
                placeholder="Ghi chú hỏng hóc..."
                className={inputCls}
              />
            </div>
          </div>

          {/* F. Tổng kết tất toán */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Tổng kết tất toán</div>
            <div className="space-y-2 text-sm">
              {electricCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600"><i className="fa-solid fa-bolt text-yellow-500 mr-1.5 w-4 text-center"></i>Tiền điện cuối</span>
                  <span className="font-semibold">{formatVND(electricCost)} đ</span>
                </div>
              )}
              {waterCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600"><i className="fa-solid fa-droplet text-blue-500 mr-1.5 w-4 text-center"></i>Tiền nước cuối</span>
                  <span className="font-semibold">{formatVND(waterCost)} đ</span>
                </div>
              )}
              {mergedDebt > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600"><i className="fa-solid fa-layer-group text-orange-500 mr-1.5 w-4 text-center"></i>Nợ tồn đọng ({selectedMergeIds.size} HĐ)</span>
                  <span className="font-semibold">{formatVND(mergedDebt)} đ</span>
                </div>
              )}
              {assetDamageTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600"><i className="fa-solid fa-box-open text-teal-500 mr-1.5 w-4 text-center"></i>Khấu trừ tài sản</span>
                  <span className="font-semibold">{formatVND(assetDamageTotal)} đ</span>
                </div>
              )}
              {handoverDamageTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600"><i className="fa-solid fa-clipboard-check text-indigo-500 mr-1.5 w-4 text-center"></i>Chi phí bàn giao</span>
                  <span className="font-semibold">{formatVND(handoverDamageTotal)} đ</span>
                </div>
              )}
              {damageAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600"><i className="fa-solid fa-screwdriver-wrench text-purple-500 mr-1.5 w-4 text-center"></i>Hỏng hóc bổ sung</span>
                  <span className="font-semibold">{formatVND(damageAmount)} đ</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 flex justify-between font-bold">
                <span className="text-gray-800">Tổng phát sinh</span>
                <span className="text-gray-900">{formatVND(totalCharges)} đ</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span><i className="fa-solid fa-shield-halved mr-1.5 w-4 text-center"></i>Tiền cọc đang giữ</span>
                <span className="font-semibold">− {formatVND(depositHeld)} đ</span>
              </div>
              <div className={`border-t-2 pt-2 flex justify-between items-center ${netDue > 0 ? 'border-red-200' : 'border-emerald-200'}`}>
                <span className="font-bold text-base text-gray-800">
                  {netDue > 0 ? 'Khách còn thiếu' : netDue === 0 ? 'Hòa — không thu thêm' : 'Hoàn lại khách'}
                </span>
                <span className={`font-black text-xl ${netDue > 0 ? 'text-red-600' : netDue === 0 ? 'text-gray-600' : 'text-emerald-600'}`}>
                  {netDue > 0 ? formatVND(netDue) : formatVND(refundAmount)} đ
                </span>
              </div>
            </div>
          </div>

          {/* F. Phương thức thanh toán */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-600">Phương thức thanh toán</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPaymentMethod('transfer')}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${paymentMethod === 'transfer' ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                <i className="fa-solid fa-building-columns mr-1.5"></i>Chuyển khoản
              </button>
              <button type="button" onClick={() => setPaymentMethod('cash')}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${paymentMethod === 'cash' ? 'border-green-500 bg-green-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                <i className="fa-solid fa-money-bill mr-1.5"></i>Tiền mặt
              </button>
            </div>
          </div>

          {/* Checkbox xác nhận */}
          <label className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-red-500"
            />
            <span className="text-sm text-red-800 font-medium">
              Tôi xác nhận kết thúc hợp đồng. Phòng sẽ trở về trạng thái <strong>Trống</strong> và không thể hoàn tác.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!confirmed || !hasHandoverDone || !hasMoveOutDone || !activeContract || mutation.isPending || finalElectric < electricOld || finalWater < waterOld}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-md shadow-red-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {mutation.isPending
              ? <><i className="fa-solid fa-spinner animate-spin"></i> Đang xử lý...</>
              : <><i className="fa-solid fa-door-closed"></i> Xác nhận tất toán</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
