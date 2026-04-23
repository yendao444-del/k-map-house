import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getContracts, getRooms, getAppSettings, updateContract, type Contract, type ContractStatus, type Room } from '../lib/db'
import { ContractViewModal } from './ContractViewModal'
import { playClick, playSuccess } from '../lib/sound'

const formatVND = (value: number) => new Intl.NumberFormat('vi-VN').format(value)
const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—')

const STATUS_OPTIONS: { id: 'all' | ContractStatus; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'active', label: 'Đang hiệu lực' },
  { id: 'expired', label: 'Đã hết hạn' },
  { id: 'terminated', label: 'Đã thanh lý' },
  { id: 'cancelled', label: 'Đã hủy' }
]

const getStatusLabel = (status: ContractStatus) => {
  switch (status) {
    case 'active': return 'Đang hiệu lực'
    case 'expired': return 'Đã hết hạn'
    case 'terminated': return 'Đã thanh lý'
    case 'cancelled': return 'Đã hủy'
    default: return status
  }
}

const getStatusClassName = (status: ContractStatus) => {
  switch (status) {
    case 'active': return 'bg-emerald-100 text-emerald-700'
    case 'terminated': return 'bg-slate-100 text-slate-600'
    case 'cancelled': return 'bg-red-100 text-red-600'
    case 'expired': return 'bg-orange-100 text-orange-700'
    default: return 'bg-gray-100 text-gray-600'
  }
}

// =====================================================================
// EditContractModal
// =====================================================================
interface EditContractModalProps {
  contract: Contract
  onClose: () => void
}

const EditContractModal: React.FC<EditContractModalProps> = ({ contract, onClose }) => {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (updates: Partial<Contract>) => updateContract(contract.id, updates),
    onSuccess: () => {
      playSuccess()
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      queryClient.invalidateQueries({ queryKey: ['activeContracts'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      onClose()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Lỗi cập nhật')
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    mutation.mutate({
      base_rent: parseInt((fd.get('base_rent') as string).replace(/\D/g, ''), 10) || 0,
      deposit_amount: parseInt((fd.get('deposit_amount') as string).replace(/\D/g, ''), 10) || 0,
      move_in_date: fd.get('move_in_date') as string,
      expiration_date: (fd.get('expiration_date') as string) || undefined,
      invoice_day: parseInt(fd.get('invoice_day') as string, 10) || 5,
    })
  }

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-800">Sửa hợp đồng</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Tiền thuê (tháng)</label>
              <input name="base_rent" defaultValue={formatVND(contract.base_rent)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Tiền đặt cọc</label>
              <input name="deposit_amount" defaultValue={formatVND(contract.deposit_amount)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Ngày bắt đầu</label>
              <input name="move_in_date" type="date" defaultValue={contract.move_in_date} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Ngày hết hạn</label>
              <input name="expiration_date" type="date" defaultValue={contract.expiration_date} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Ngày chốt tiền hàng tháng</label>
            <input name="invoice_day" type="number" min="1" max="28" defaultValue={contract.invoice_day} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
          </div>
          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg bg-gray-100 text-sm font-bold text-gray-600">Hủy</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20">Lưu thay đổi</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// =====================================================================
// RoomSelectionModal
// =====================================================================
interface RoomSelectionModalProps {
  rooms: Room[]
  onSelect: (room: Room) => void
  onClose: () => void
}

const RoomSelectionModal: React.FC<RoomSelectionModalProps> = ({ rooms, onSelect, onClose }) => {
  const vacantRooms = rooms.filter(r => r.status === 'vacant')

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Chọn phòng để lập hợp đồng</h2>
            <p className="text-xs text-gray-500 mt-0.5">Chỉ hiển thị các phòng đang ở trạng thái Trống</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><i className="fa-solid fa-xmark text-lg"></i></button>
        </div>
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {vacantRooms.length === 0 ? (
            <div className="text-center py-10">
              <i className="fa-solid fa-house-circle-exclamation text-4xl text-gray-200 mb-3"></i>
              <p className="text-gray-500 text-sm italic">Hiện không có phòng nào đang trống để lập hợp đồng mới.</p>
              <p className="text-xs text-gray-400 mt-1">Vui lòng kiểm tra lại tình trạng phòng ở mục Quản lý phòng.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {vacantRooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => onSelect(room)}
                  className="p-4 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 transition-all text-center group"
                >
                  <div className="text-lg font-black text-gray-800 group-hover:text-primary mb-1">{room.name}</div>
                  <div className="text-[10px] uppercase font-bold text-gray-400 group-hover:text-primary/70">{formatVND(room.base_rent)} đ</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-white border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-50">Đóng</button>
        </div>
      </div>
    </div>
  )
}

// =====================================================================
// ContractsTab
// =====================================================================
interface ContractsTabProps {
  onCreateContract?: (room: Room) => void
}

export const ContractsTab: React.FC<ContractsTabProps> = ({ onCreateContract }) => {
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: settings } = useQuery({ queryKey: ['appSettings'], queryFn: getAppSettings })
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('active')
  const [isPickingRoom, setIsPickingRoom] = useState(false)

  const [viewingContractId, setViewingContractId] = useState<string | null>(null)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)

  const filteredContracts = contracts.filter(
    (contract: Contract) => statusFilter === 'all' || contract.status === statusFilter
  )

  const viewingContract = contracts.find(c => c.id === viewingContractId)
  const viewingRoom = viewingContract ? rooms.find(r => r.id === viewingContract.room_id) : undefined

  return (
    <div className="flex-1 overflow-y-auto p-4 relative">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-full">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Danh sách hợp đồng</h2>
            <p className="text-sm text-gray-500 mt-1">Quản lý toàn bộ hợp đồng thuê theo trạng thái</p>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={() => { playClick(); setIsPickingRoom(true) }}
              className="bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
            >
              <i className="fa-solid fa-plus"></i>
              Lập hợp đồng mới
            </button>

            <div className="h-8 w-px bg-gray-200 mx-2 hidden lg:block"></div>

            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatusFilter(option.id)}
                  className={`px-3 py-2 text-xs font-bold rounded-lg transition ${statusFilter === option.id
                    ? 'bg-primary/10 text-primary'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[860px] text-sm text-left">
            <thead className="bg-gray-50/80 text-gray-500 font-semibold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-5 py-4">Mã HĐ</th>
                <th className="px-5 py-4">Phòng</th>
                <th className="px-5 py-4">Khách thuê</th>
                <th className="px-5 py-4">Ngày vào</th>
                <th className="px-5 py-4 text-right">Giá thuê</th>
                <th className="px-5 py-4 text-right">Tiền cọc</th>
                <th className="px-5 py-4 text-center">Trạng thái</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredContracts.map((contract) => {
                const room = rooms.find((item) => item.id === contract.room_id)
                return (
                  <tr key={contract.id} className="hover:bg-gray-50 transition group">
                    <td className="px-5 py-4 text-xs font-mono text-gray-400">
                      ...{contract.id.slice(-6)}
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-800">
                      {room?.name || contract.room_id}
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-700">{contract.tenant_name}</td>
                    <td className="px-5 py-4 text-gray-600">{formatDate(contract.move_in_date)}</td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-primary">
                      {formatVND(contract.base_rent)} đ
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-gray-600">
                      {formatVND(contract.deposit_amount)} đ
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${getStatusClassName(contract.status)}`}>
                        {getStatusLabel(contract.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingContract(contract)}
                          className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors flex items-center justify-center border border-blue-100 shadow-sm"
                          title="Sửa hợp đồng"
                        >
                          <i className="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button
                          onClick={() => setViewingContractId(contract.id)}
                          className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 hover:bg-emerald-600 hover:text-white transition-colors flex items-center justify-center border border-gray-200 shadow-sm"
                          title="Xem / In hợp đồng PDF"
                        >
                          <i className="fa-solid fa-file-pdf"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {filteredContracts.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-gray-400">
                    <i className="fa-solid fa-file-contract text-4xl mb-4 block text-gray-300"></i>
                    <p className="text-sm font-medium">Không có hợp đồng nào phù hợp với bộ lọc.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingContractId && viewingContract && viewingRoom && (
        <ContractViewModal
          contract={viewingContract}
          room={viewingRoom}
          settings={settings || {}}
          onClose={() => setViewingContractId(null)}
        />
      )}

      {editingContract && (
        <EditContractModal
          contract={editingContract}
          onClose={() => setEditingContract(null)}
        />
      )}

      {isPickingRoom && (
        <RoomSelectionModal
          rooms={rooms}
          onClose={() => setIsPickingRoom(false)}
          onSelect={(room) => {
            setIsPickingRoom(false)
            onCreateContract?.(room)
          }}
        />
      )}
    </div>
  )
}
