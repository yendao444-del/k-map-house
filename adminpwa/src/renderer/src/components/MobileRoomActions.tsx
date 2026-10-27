import { FilePlus2, Pencil, Settings, Package, FileText, ArrowLeftRight, Bell, RotateCcw, LogOut, Ban, Trash2, X } from 'lucide-react'
import type { Room } from '../lib/db'
export type RoomAction = 'contract' | 'edit' | 'service' | 'assets' | 'finance' | 'change' | 'end-notice' | 'cancel-end-notice' | 'terminate' | 'cancel-contract' | 'vacate' | 'delete'
export function MobileRoomActions({ room, hasContract, canCancel, canDelete, financeLabel, onAction, onClose }: {
  room: Room; hasContract: boolean; canCancel: boolean; canDelete: boolean; financeLabel: string;
  onAction: (action: RoomAction) => void; onClose: () => void
}): React.JSX.Element {
  const items = room.status === 'vacant' ? [
    { id: 'contract' as RoomAction, label: 'Lập hợp đồng', icon: FilePlus2 },
    { id: 'edit' as RoomAction, label: 'Sửa phòng', icon: Pencil },
    { id: 'service' as RoomAction, label: 'Cài đặt dịch vụ', icon: Settings },
    { id: 'assets' as RoomAction, label: 'Thiết lập tài sản', icon: Package },
    { id: 'delete' as RoomAction, label: canDelete ? 'Xóa phòng' : 'Xóa phòng · có lịch sử', icon: Trash2 }
  ] : [
    { id: 'finance' as RoomAction, label: financeLabel, icon: FileText },
    { id: 'service' as RoomAction, label: 'Cài đặt dịch vụ', icon: Settings },
    { id: 'change' as RoomAction, label: 'Chuyển đổi phòng', icon: ArrowLeftRight },
    { id: 'assets' as RoomAction, label: 'Thiết lập tài sản', icon: Package },
    { id: (room.status === 'ending' ? 'cancel-end-notice' : 'end-notice') as RoomAction, label: room.status === 'ending' ? 'Hủy báo trả phòng' : 'Báo trả phòng', icon: room.status === 'ending' ? RotateCcw : Bell },
    { id: 'terminate' as RoomAction, label: 'Trả phòng', icon: LogOut },
    { id: 'cancel-contract' as RoomAction, label: 'Hủy hợp đồng', icon: Ban },
    ...(!hasContract && room.status === 'occupied' ? [{ id: 'vacate' as RoomAction, label: 'Đánh dấu đã chuyển đi · không có HĐ', icon: LogOut }] : []),
    ...(canDelete ? [{ id: 'delete' as RoomAction, label: 'Xóa phòng', icon: Trash2 }] : [])
  ]
  return <div className="fixed inset-0 z-[330] flex items-end justify-center bg-black/40 p-3" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label={`Thao tác phòng ${room.name}`} className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl" onClick={event => event.stopPropagation()}>
      <header className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold">Thao tác · {room.name}</h2><button type="button" aria-label="Đóng thao tác phòng" className="flex h-10 w-10 items-center justify-center" onClick={onClose}><X size={20} /></button></header>
      <div className="grid max-h-[65dvh] grid-cols-2 gap-2 overflow-y-auto">{items.map(({ id, label, icon: Icon }) => <button key={id} type="button" disabled={id === 'cancel-contract' && !canCancel} onClick={() => onAction(id)} className={`flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-3 text-left text-xs font-medium disabled:opacity-40 ${['delete', 'terminate', 'cancel-contract'].includes(id) ? 'text-rose-600' : 'text-emerald-800'}`}><Icon size={18} className="shrink-0" />{label}</button>)}</div>
      {!canCancel && hasContract && <p className="mt-3 text-xs text-slate-500">Đã có thanh toán: dùng Trả phòng để tất toán, không hủy hợp đồng.</p>}
    </section>
  </div>
}
