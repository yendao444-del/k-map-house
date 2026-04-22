import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    changeRoom,
    getRooms,
    getContracts,
    getAssetSnapshots,
    type Room,
    type Contract,
} from '../lib/db'

const HANDOVER_IDS = ['__check_cleared', '__check_cleaned', '__check_keys']
const getHandoverSnapshotKey = (snap: { room_asset_id: string; note?: string }) =>
    snap.note || snap.room_asset_id

interface Props {
    room: Room
    onClose: () => void
    onNavigateToAssets?: (room: Room) => void
}

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v)
const parseVND = (str: string) => parseInt(str.replace(/\D/g, ''), 10) || 0

export function ChangeRoomModal({ room, onClose, onNavigateToAssets }: Props) {
    const queryClient = useQueryClient()
    const today = new Date().toISOString().split('T')[0]

    const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
    const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
    const { data: moveOutSnaps = [] } = useQuery({ queryKey: ['asset_snapshots', room.id, 'move_out'], queryFn: () => getAssetSnapshots(room.id, 'move_out') })
    const { data: handoverSnaps = [] } = useQuery({ queryKey: ['asset_snapshots', room.id, 'handover'], queryFn: () => getAssetSnapshots(room.id, 'handover') })

    const activeContract: Contract | undefined = useMemo(
        () => contracts.find(c => c.room_id === room.id && c.status === 'active'),
        [contracts, room.id]
    )

    const vacantRooms = useMemo(() => rooms.filter(r => r.status === 'vacant'), [rooms])

    // Form State
    const [newRoomId, setNewRoomId] = useState<string>('')
    const [changeDate, setChangeDate] = useState(today)

    // Old room info
    const [finalElectric, setFinalElectric] = useState<number>(room.electric_new || 0)
    const [finalWater, setFinalWater] = useState<number>(room.water_new || 0)

    // New room info
    const [newBaseRent, setNewBaseRent] = useState<number>(0)
    const [newElectricInit, setNewElectricInit] = useState<number>(0)
    const [newWaterInit, setNewWaterInit] = useState<number>(0)

    // Asset check state
    const contractStartedAt = activeContract?.created_at || activeContract?.move_in_date
    const currentMoveOutSnaps = useMemo(
        () =>
            contractStartedAt
                ? moveOutSnaps.filter(s => s.recorded_at >= contractStartedAt)
                : moveOutSnaps,
        [moveOutSnaps, contractStartedAt]
    )
    const currentHandoverSnaps = useMemo(
        () =>
            contractStartedAt
                ? handoverSnaps.filter(s => s.recorded_at >= contractStartedAt)
                : handoverSnaps,
        [handoverSnaps, contractStartedAt]
    )
    const hasMoveOutDone = currentMoveOutSnaps.length > 0
    const hasHandoverDone = currentHandoverSnaps.length > 0 && HANDOVER_IDS.every(id => {
        const s = currentHandoverSnaps.find(x => getHandoverSnapshotKey(x) === id)
        return s?.condition === 'ok' || (s?.condition === 'not_done' && (s.deduction || 0) > 0)
    })
    const canProceed = hasMoveOutDone && hasHandoverDone

    // UI state
    const [confirmStep, setConfirmStep] = useState(false)

    // Update new room info when selected
    const handleSelectNewRoom = (id: string) => {
        setNewRoomId(id)
        const nr = rooms.find(r => r.id === id)
        if (nr) {
            setNewBaseRent(nr.base_rent || 0)
            setNewElectricInit(nr.electric_new || 0)
            setNewWaterInit(nr.water_new || 0)
        }
    }

    const mutation = useMutation({
        mutationFn: changeRoom,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rooms'] })
            queryClient.invalidateQueries({ queryKey: ['contracts'] })
            queryClient.invalidateQueries({ queryKey: ['activeContracts'] })
            queryClient.invalidateQueries({ queryKey: ['invoices'] })
            onClose()
        },
        onError: (err: any) => {
            console.error(err);
            alert(`Lỗi khi chuyển phòng: ${err.message}`)
            setConfirmStep(false)
        }
    })

    if (!activeContract) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div className="w-full max-w-sm rounded bg-white p-6 shadow-xl">
                    <h3 className="font-bold text-red-600 mb-2">Lỗi</h3>
                    <p>Không tìm thấy hợp đồng đang hoạt động cho phòng này.</p>
                    <div className="mt-4 text-right">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Đóng</button>
                    </div>
                </div>
            </div>
        )
    }

    const selectedNewRoom = rooms.find(r => r.id === newRoomId)
    const isInvalidElec = finalElectric < (room.electric_new || 0)
    const isInvalidWater = finalWater < (room.water_new || 0)

    const oldDeposit = activeContract.deposit_amount || 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!newRoomId) return alert('Vui lòng chọn phòng trống để chuyển đến')
        if (isInvalidElec) return alert('Số điện chốt không hợp lệ')
        if (isInvalidWater) return alert('Số nước chốt không hợp lệ')
        setConfirmStep(true)
    }

    const executeChange = () => {
        mutation.mutate({
            old_room_id: room.id,
            new_room_id: newRoomId,
            change_date: changeDate,
            final_electric: finalElectric,
            final_water: finalWater,
            new_base_rent: newBaseRent,
            new_deposit: oldDeposit, // Cọc giữ nguyên hoàn toàn
            new_electric_init: newElectricInit,
            new_water_init: newWaterInit
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
                {!confirmStep ? (
                    <>
                        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                            <h2 className="text-xl font-bold text-gray-800">
                                Chuyển phòng: {room.name}
                            </h2>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                                <i className="fa-solid fa-xmark text-lg"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-8 flex-1">

                            {/* ASSET CHECK */}
                            {!canProceed ? (
                                <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                                            <i className="fa-solid fa-triangle-exclamation text-amber-500 text-lg"></i>
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-amber-800 text-sm">
                                                {!hasMoveOutDone ? 'Chưa đối chiếu tài sản phòng cũ!' : 'Chưa hoàn tất bàn giao phòng!'}
                                            </p>
                                            <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                                                {!hasMoveOutDone
                                                    ? <>Bạn cần sang <strong>tab Tài sản</strong>, chọn phòng <strong>{room.name}</strong>, nhấn <strong>"Đối chiếu trả phòng"</strong> để ghi nhận tình trạng tài sản trước khi chuyển phòng.</>
                                                    : <>Vui lòng mở lại <strong>"Đối chiếu trả phòng"</strong> trong tab <strong>Tài sản</strong> và xác nhận đủ phần bàn giao phòng.</>
                                                }
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
                            ) : (
                                <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
                                        <i className="fa-solid fa-circle-check text-teal-600"></i>
                                    </div>
                                    <div>
                                        <p className="font-bold text-teal-800 text-sm">Đã đối chiếu và bàn giao xong</p>
                                        <p className="text-teal-600 text-xs">{currentMoveOutSnaps.length} tài sản đã ghi nhận · xác nhận bàn giao phòng cũ</p>
                                    </div>
                                </div>
                            )}

                            {/* OLD ROOM CLOSING */}
                            <div className="bg-orange-50 border border-orange-100 rounded-xl p-5">
                                <h3 className="font-bold text-orange-800 mb-4 flex items-center gap-2">
                                    <i className="fa-solid fa-door-open"></i>1. Chốt thông tin phòng cũ ({room.name})
                                </h3>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-700">Người đại diện</label>
                                        <input type="text" disabled value={activeContract.tenant_name} className="w-full rounded-lg border border-gray-200 bg-gray-100/50 px-3 py-2 text-sm text-gray-600 outline-none" />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-700">Ngày chuyển (chốt)</label>
                                        <input
                                            type="date"
                                            value={changeDate}
                                            onChange={e => setChangeDate(e.target.value)}
                                            required
                                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-700">Chỉ số Điện (cũ: {room.electric_new || 0})</label>
                                        <input
                                            type="number"
                                            required
                                            value={finalElectric || ''}
                                            onChange={e => setFinalElectric(Number(e.target.value))}
                                            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all ${isInvalidElec ? 'border-red-400 bg-red-50 focus:ring-red-400/20' : 'border-gray-200 bg-white focus:border-green-400 focus:ring-green-400/20'
                                                }`}
                                        />
                                        {isInvalidElec && <div className="mt-1 text-[11px] text-red-500">Chỉ số mới phải ≥ {room.electric_new || 0}</div>}
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-semibold text-gray-700">Chỉ số Nước (cũ: {room.water_new || 0})</label>
                                        <input
                                            type="number"
                                            required
                                            value={finalWater || ''}
                                            onChange={e => setFinalWater(Number(e.target.value))}
                                            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all ${isInvalidWater ? 'border-red-400 bg-red-50 focus:ring-red-400/20' : 'border-gray-200 bg-white focus:border-green-400 focus:ring-green-400/20'
                                                }`}
                                        />
                                        {isInvalidWater && <div className="mt-1 text-[11px] text-red-500">Chỉ số mới phải ≥ {room.water_new || 0}</div>}
                                    </div>
                                </div>

                                <div className="mt-4 text-xs text-orange-700 italic">
                                    * Tiền điện/nước chưa thu đến ngày {new Date(changeDate).toLocaleDateString('vi-VN')} sẽ được tạo thành hóa đơn riêng. <br />
                                    * Toàn bộ Hóa Đơn Nợ cũ của phòng này sẽ được giữ nguyên và CHUYỂN SANG phòng mới.
                                </div>
                            </div>

                            {/* NEW ROOM INFO */}
                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
                                <h3 className="font-bold text-emerald-800 mb-4 flex items-center gap-2">
                                    <i className="fa-solid fa-key"></i>2. Thông tin phòng mới
                                </h3>

                                <div className="mb-4">
                                    <label className="mb-1.5 block text-xs font-semibold text-gray-700">Chọn phòng trống chuyển đến</label>
                                    <select
                                        value={newRoomId}
                                        onChange={e => handleSelectNewRoom(e.target.value)}
                                        required
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20"
                                    >
                                        <option value="">-- Chọn phòng --</option>
                                        {vacantRooms.map(r => (
                                            <option key={r.id} value={r.id}>{r.name} - {formatVND(r.base_rent)}đ/tháng</option>
                                        ))}
                                    </select>
                                </div>

                                {newRoomId && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="mb-1.5 block text-xs font-semibold text-gray-700">Giá thuê mới (đ/tháng)</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={formatVND(newBaseRent)}
                                                    onChange={e => setNewBaseRent(parseVND(e.target.value))}
                                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-xs font-semibold text-gray-700">Tiền cọc phòng</label>
                                                <div className="w-full rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm font-semibold text-emerald-700">
                                                    Giữ nguyên {formatVND(oldDeposit)}đ
                                                </div>
                                                <div className="mt-1 text-[11px] text-gray-500 italic">Cọc sẽ được tự động bảo lưu sang hợp đồng mới.</div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="mb-1.5 block text-xs font-semibold text-gray-700">Chỉ số Điện phòng mới (Đã khóa)</label>
                                                <input
                                                    type="number"
                                                    disabled
                                                    value={newElectricInit || 0}
                                                    className="w-full rounded-lg border border-gray-200 bg-gray-100/70 px-3 py-2 text-sm outline-none text-gray-600 font-medium cursor-not-allowed"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-xs font-semibold text-gray-700">Chỉ số Nước phòng mới (Đã khóa)</label>
                                                <input
                                                    type="number"
                                                    disabled
                                                    value={newWaterInit || 0}
                                                    className="w-full rounded-lg border border-gray-200 bg-gray-100/70 px-3 py-2 text-sm outline-none text-gray-600 font-medium cursor-not-allowed"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                            </div>
                        </form>

                        <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3 flex-shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!newRoomId || isInvalidElec || isInvalidWater || !canProceed}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition disabled:opacity-50"
                                title={!canProceed ? 'Cần đối chiếu tài sản trước khi chuyển phòng' : undefined}
                            >
                                Tiếp tục & Kiểm tra lại
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                            <i className="fa-solid fa-right-left"></i>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Xác nhận chuyển phòng</h3>
                        <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
                            Bạn đang chuyển khách <b>{activeContract.tenant_name}</b> từ <b>{room.name}</b> sang <b>{selectedNewRoom?.name}</b>.
                        </p>

                        <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3 text-sm mb-6 w-full max-w-lg mx-auto">
                            <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                                <span className="text-gray-600">Hợp đồng phòng {room.name}:</span>
                                <span className="font-bold text-red-600">Sẽ kết thúc</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                                <span className="text-gray-600">HĐ điện nước {room.name} chưa tính:</span>
                                <span className="font-bold text-orange-600">Sẽ lập tự động</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                                <span className="text-gray-600">Toàn bộ nợ cũ (nếu có):</span>
                                <span className="font-bold text-blue-600">Chuyển sang {selectedNewRoom?.name}</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-gray-200">
                                <span className="text-gray-600">Tiền cọc cũ ({formatVND(oldDeposit)}đ):</span>
                                <span className="font-bold text-blue-600">Bảo lưu 100% sang HĐ mới</span>
                            </div>
                        </div>

                        <div className="flex justify-center gap-3">
                            <button
                                onClick={() => setConfirmStep(false)}
                                className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                            >
                                Quay lại sửa
                            </button>
                            <button
                                onClick={executeChange}
                                disabled={mutation.isPending}
                                className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition flex items-center gap-2"
                            >
                                {mutation.isPending ? <i className="fa-solid fa-spinner animate-spin" /> : <i className="fa-solid fa-check" />}
                                Xác nhận chuyển
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
