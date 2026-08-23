import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Room,
  getRoomAssets,
  getAssetSnapshots,
  addRoomAsset,
  updateRoomAsset,
  deleteRoomAsset,
  type RoomAsset
} from '../lib/db'
import { LogoLoading } from './LogoLoading'
import airConditionerImage from '../assets/room-assets/air-conditioner.png'
import bedImage from '../assets/room-assets/bed.png'
import ceilingFanImage from '../assets/room-assets/ceiling-fan.png'
import doorLockImage from '../assets/room-assets/door-lock.png'
import faucetImage from '../assets/room-assets/faucet.png'
import gasStoveImage from '../assets/room-assets/gas-stove.png'
import lightBulbImage from '../assets/room-assets/light-bulb.png'
import powerOutletImage from '../assets/room-assets/power-outlet.png'
import refrigeratorImage from '../assets/room-assets/refrigerator.png'
import shoeCabinetImage from '../assets/room-assets/shoe-cabinet.png'
import tableChairImage from '../assets/room-assets/table-chair.png'
import televisionImage from '../assets/room-assets/television.png'
import toiletImage from '../assets/room-assets/toilet.png'
import wardrobeImage from '../assets/room-assets/wardrobe.png'
import washingMachineImage from '../assets/room-assets/washing-machine.png'
import waterDispenserImage from '../assets/room-assets/water-dispenser.png'

const getAssetImage = (name: string) => {
  if (name.includes('đèn')) return lightBulbImage
  if (name.includes('sinh')) return toiletImage
  if (name.includes('Vòi')) return faucetImage
  if (name.includes('gas')) return gasStoveImage
  if (name.includes('Bàn + Ghế')) return tableChairImage
  if (name.includes('Điều hòa')) return airConditionerImage
  if (name.includes('Tủ quần áo')) return wardrobeImage
  if (name.includes('nóng lạnh')) return waterDispenserImage
  if (name.includes('Giường')) return bedImage
  if (name.includes('Quạt trần')) return ceilingFanImage
  if (name.includes('Khóa')) return doorLockImage
  if (name.includes('Tủ lạnh')) return refrigeratorImage
  if (name.includes('giặt')) return washingMachineImage
  if (name.includes('TV')) return televisionImage
  if (name.includes('Tủ giày')) return shoeCabinetImage
  if (name.includes('điện')) return powerOutletImage
  return null
}

export const RoomAssetsTab: React.FC<{ room: Room }> = ({ room }) => {
  const queryClient = useQueryClient()
  const [newAsset, setNewAsset] = useState({ name: '', quantity: 1, status: 'ok' as const })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', quantity: 1 })

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['room_assets', room.id],
    queryFn: () => getRoomAssets(room.id)
  })
  const { data: moveInSnaps = [] } = useQuery({
    queryKey: ['asset_snapshots', room.id, 'move_in'],
    queryFn: () => getAssetSnapshots(room.id, 'move_in')
  })
  const assetsLocked =
    (room.status === 'occupied' || room.status === 'ending') && moveInSnaps.length > 0

  const addMutation = useMutation({
    mutationFn: (data: { name: string; quantity: number; status: RoomAsset['status'] }) =>
      addRoomAsset({ room_id: room.id, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room_assets', room.id] })
      setNewAsset({ name: '', quantity: 1, status: 'ok' })
    },
    onError: (err: any) => {
      alert(err.message || 'Lỗi khi thêm tài sản')
    }
  })

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<RoomAsset> }) =>
      updateRoomAsset(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room_assets', room.id] })
      setEditingId(null)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRoomAsset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room_assets', room.id] })
    }
  })

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (assetsLocked) return
    if (!newAsset.name.trim()) return
    addMutation.mutate(newAsset)
  }

  const handleStartEdit = (asset: RoomAsset) => {
    if (assetsLocked) return
    setEditingId(asset.id)
    setEditForm({ name: asset.name, quantity: asset.quantity || 1 })
  }

  const handleSaveEdit = () => {
    if (assetsLocked) return
    if (editingId && editForm.name.trim()) {
      updateMutation.mutate({
        id: editingId,
        updates: { name: editForm.name, quantity: editForm.quantity }
      })
    }
  }

  const statusColors: Record<string, string> = {
    'in-use': 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
    repairing: 'bg-yellow-100 text-yellow-700',
    disposed: 'bg-gray-100 text-gray-700'
  }

  const statusLabels: Record<string, string> = {
    'in-use': 'Đang sử dụng',
    error: 'Hỏng',
    repairing: 'Đang sửa',
    disposed: 'Đã xử lý'
  }

  return (
    <div className="space-y-4">
      {/* ADD NEW ASSET */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h4 className="text-sm font-bold text-gray-800 mb-3">Thêm Tài Sản Mới</h4>
        {assetsLocked && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            <i className="fa-solid fa-lock mr-1.5"></i>
            Phòng đã chốt nhận. Không thể thêm, sửa hoặc xóa thiết bị.
          </div>
        )}
        <form onSubmit={handleAdd} className="flex gap-2 flex-col sm:flex-row">
          <input
            type="text"
            placeholder="Tên tài sản (e.g., Tủ lạnh, Quạt...)"
            value={newAsset.name}
            onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
            disabled={assetsLocked}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="number"
            placeholder="Số lượng"
            value={newAsset.quantity}
            onChange={(e) => setNewAsset({ ...newAsset, quantity: Number(e.target.value) })}
            disabled={assetsLocked}
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            data-tour="add-asset-btn"
            type="submit"
            disabled={assetsLocked || addMutation.isPending}
            className="px-4 py-2 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {addMutation.isPending ? 'Đang thêm...' : 'Thêm'}
          </button>
        </form>
      </div>

      {/* ASSETS LIST */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h4 className="text-sm font-bold text-gray-800 mb-4">
          Danh Sách Tài Sản ({assets.length})
        </h4>
        {isLoading ? (
          <LogoLoading message="Đang tải tài sản..." className="py-4" size="sm" />
        ) : assets.length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-sm">Chưa có tài sản nào</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {assets.map((asset) => {
              const image = getAssetImage(asset.name)
              return (
                <div
                  key={asset.id}
                  className="flex items-center gap-3 p-2.5 border border-gray-100 rounded-xl hover:border-emerald-100 hover:bg-emerald-50/30 transition"
                >
                  {editingId === asset.id ? (
                    <>
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
                        {image ? (
                          <img src={image} alt="" className="h-9 w-9 object-contain" />
                        ) : (
                          <i className="fa-solid fa-cube text-slate-300"></i>
                        )}
                      </div>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        onClick={handleSaveEdit}
                        disabled={updateMutation.isPending}
                        className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                      >
                        Lưu
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                      >
                        Hủy
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
                        {image ? (
                          <img src={image} alt="" className="h-9 w-9 object-contain" />
                        ) : (
                          <i className="fa-solid fa-cube text-slate-300"></i>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-800">{asset.name}</div>
                        <div className="text-xs text-gray-500">Số lượng: {asset.quantity}</div>
                      </div>
                      {asset.status && asset.status !== 'ok' && (
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[asset.status] || 'bg-gray-100 text-gray-600'}`}
                        >
                          {statusLabels[asset.status] || asset.status}
                        </span>
                      )}
                      <button
                        onClick={() => handleStartEdit(asset)}
                        disabled={assetsLocked}
                        className="text-gray-500 hover:text-primary transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <i
                          className={`fa-solid ${assetsLocked ? 'fa-lock' : 'fa-pen-to-square'}`}
                        ></i>
                      </button>
                      <button
                        onClick={() => {
                          if (!assetsLocked) deleteMutation.mutate(asset.id)
                        }}
                        disabled={assetsLocked || deleteMutation.isPending}
                        className="text-gray-500 hover:text-red-500 transition text-sm disabled:opacity-50"
                      >
                        <i className="fa-solid fa-trash"></i>
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
