import React, { useState, useEffect } from 'react'
import logoNavbar from './assets/logo_navbar.png'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRooms,
  updateRoom,
  createRoom,
  deleteRoom,
  getServiceZones,
  createServiceZone,
  updateServiceZone,
  deleteServiceZone,
  getInvoices,
  getContracts,
  getMoveInReceipts,
  getAssetSnapshots,
  getAppSettings,
  updateAppSettings,
  type Room,
  type ServiceZone,
  type Invoice,
  type AppUser
} from './lib/db'
import { playSuccess, playCreate, playDelete, playClick, playNotification } from './lib/sound'
import { InvoiceModal } from './components/InvoiceModal'
import { RoomDetailsModal } from './components/RoomDetailsModal'
import { EditableCell } from './components/EditableCell'

import { PaymentModal } from './components/PaymentModal'
import { TenantsTab } from './components/TenantsTab'
import { InvoicesTab } from './components/InvoicesTab'
import { AssetsTab } from './components/AssetsTab'
import { ContractsTab } from './components/ContractsTab'
import { SettingsTab } from './components/SettingsTab'
import { BusinessReport } from './components/BusinessReport'
import { CashFlowTab } from './components/CashFlowTab'
import NewContractModal from './components/NewContractModal'
import { EndContractNoticeModal } from './components/EndContractNoticeModal'
import { TerminateContractModal } from './components/TerminateContractModal'
import { CancelContractModal } from './components/CancelContractModal'
import { ChangeRoomModal } from './components/ChangeRoomModal'
import { TourOverlay } from './components/TourOverlay'
import { LoginScreen } from './components/LoginScreen'
import { setupRealtime } from './lib/realtime'
const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v)
const HANDOVER_IDS = ['__check_cleared', '__check_cleaned', '__check_keys']
type AppTab = 'rooms' | 'invoices' | 'assets' | 'contracts' | 'tenants' | 'reports' | 'settings'
type PendingAssetReceive = { roomId: string; roomName: string }
type SettingsSection = 'general' | 'zones' | 'users' | 'updates'
type UpdateBannerInfo = {
  latestVersion: string
  downloadUrl: string | null
}
const normalizeRoomName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN')

const AddRoomModal = ({
  onClose,
  onOpenContract
}: {
  onClose: () => void
  onOpenContract: (payload: { room: Room; moveInDate: string }) => void
}) => {
  const queryClient = useQueryClient()
  const { data: serviceZones = [] } = useQuery({
    queryKey: ['serviceZones'],
    queryFn: getServiceZones
  })
  const [submitError, setSubmitError] = useState('')

  const createMutation = useMutation({
    mutationFn: async (payload: { roomData: Partial<Room>; moveInDate?: string }) => {
      const room = await createRoom(payload.roomData)
      return { room, moveInDate: payload.moveInDate || '' }
    },
    onSuccess: ({ room, moveInDate }) => {
      playCreate()
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      if (moveInDate) {
        onOpenContract({ room, moveInDate })
      } else {
        onClose()
      }
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : 'Không thể tạo phòng mới.')
    }
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const moveInDate = new Date().toISOString().split('T')[0]
    const roomData: Partial<Room> = {
      name: ((fd.get('name') as string) || '').trim(),
      status: 'vacant',
      base_rent: parseInt((fd.get('base_rent') as string).replace(/\D/g, ''), 10) || 0,
      service_zone_id: (fd.get('service_zone_id') as string) || 'zone-1',
      floor: 1,
      invoice_day: parseInt(fd.get('invoice_day') as string) || 5,
      default_deposit: parseInt((fd.get('default_deposit') as string).replace(/\D/g, ''), 10) || 0
    }

    setSubmitError('')
    createMutation.mutate({ roomData, moveInDate })
  }

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-green-100 text-primary flex items-center justify-center text-lg">
              <i className="fa-solid fa-door-open"></i>
            </div>
            <h2 className="text-lg font-bold text-gray-800">Thêm Phòng Nhanh</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center transition"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        <form id="add-room-form" onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Thông tin cơ bản
              </label>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Số phòng <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="name"
                    required
                    type="text"
                    placeholder="VD: 101, 201..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition font-bold text-gray-800"
                    autoFocus
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    Chỉ cần nhập số, hệ thống sẽ hiển thị dạng “Phòng 101”.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Giá cho thuê <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    name="base_rent"
                    required
                    type="text"
                    defaultValue="3,500,000"
                    className="w-full border border-gray-200 rounded-lg pl-3 pr-10 py-2.5 text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
                  />
                  <span className="absolute right-3 top-3 text-[10px] font-bold text-gray-400">
                    VNĐ
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Bảng giá vùng
                </label>
                <select
                  name="service_zone_id"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white cursor-pointer font-medium"
                >
                  {serviceZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Tiền cọc mặc định
              </label>
              <div className="relative">
                <input
                  name="default_deposit"
                  type="text"
                  defaultValue="3,500,000"
                  className="w-full border border-gray-200 rounded-lg pl-3 pr-10 py-2.5 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
                />
                <span className="absolute right-3 top-3 text-[10px] font-bold text-gray-400">
                  VNĐ
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Luồng tiếp theo
                </div>
                <p className="mt-1 text-[12px] text-amber-900">
                  Sau khi tạo phòng, hệ thống sẽ mở ngay bước <b>Hợp đồng mới</b>. Ở bước đó bạn sẽ
                  phải: chọn khách từ mục <b>Khách thuê</b>, nhập chỉ số <b>điện / nước</b>, và
                  thiết lập <b>tài sản</b> trước khi lưu hợp đồng.
                </p>
              </div>
            </div>
            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Ngày lập hóa đơn
              </label>
              <div className="relative">
                <input
                  name="invoice_day"
                  type="number"
                  min="1"
                  max="28"
                  defaultValue="5"
                  className="w-full border border-gray-200 rounded-lg pl-3 pr-16 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition text-gray-800 font-medium"
                />
                <span className="absolute right-3 top-2.5 text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  Hàng tháng
                </span>
              </div>
            </div>
            <div className="bg-blue-50/80 rounded-xl p-3 border border-blue-100/50 flex items-start gap-3">
              <i className="fa-solid fa-circle-info text-blue-500 mt-0.5"></i>
              <p className="text-[11px] text-blue-800 italic leading-relaxed">
                Phòng sẽ được tạo trước, sau đó mở ngay bước <b>Lập hợp đồng</b> với ngày bắt đầu
                mặc định là hôm nay.
              </p>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-200 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark disabled:bg-gray-400 disabled:cursor-not-allowed shadow-lg shadow-primary/20 transition flex items-center gap-2"
            >
              <i className="fa-solid fa-check"></i>{' '}
              {createMutation.isPending ? 'Đang tạo...' : 'Tạo phòng ngay'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const EditRoomModal = ({ room, onClose }: { room: Room; onClose: () => void }) => {
  const queryClient = useQueryClient()
  const { data: serviceZones = [] } = useQuery({
    queryKey: ['serviceZones'],
    queryFn: getServiceZones
  })
  const [submitError, setSubmitError] = useState('')

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Room> }) =>
      updateRoom(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      onClose()
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : 'Không thể lưu thay đổi phòng.')
    }
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setSubmitError('')
    updateMutation.mutate({
      id: room.id,
      updates: {
        name: ((fd.get('name') as string) || '').trim(),
        service_zone_id: (fd.get('service_zone_id') as string) || 'zone-1',
        default_deposit:
          parseInt((fd.get('default_deposit') as string).replace(/\D/g, ''), 10) || 0,
        invoice_day: parseInt(fd.get('invoice_day') as string, 10) || 5
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-lg">
              <i className="fa-solid fa-pen-to-square"></i>
            </div>
            <h2 className="text-lg font-bold text-gray-800">Sửa Thông Tin Phòng</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center transition"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <form id="edit-room-form" onSubmit={handleSubmit} className="flex flex-col">
          <div className="p-6 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Thông tin cơ bản
              </label>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Tên phòng <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="name"
                    defaultValue={room.name}
                    required
                    type="text"
                    placeholder="VD: 101, 201..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition font-bold text-gray-800"
                    autoFocus
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Giá cho thuê <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    readOnly
                    type="text"
                    value={formatVND(room.base_rent)}
                    className="w-full border border-gray-200 rounded-lg pl-3 pr-10 py-2.5 text-sm font-bold text-gray-500 bg-gray-50 cursor-not-allowed outline-none"
                  />
                  <span className="absolute right-3 top-3 text-[10px] font-bold text-gray-400">
                    VNĐ
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Bảng giá vùng
                </label>
                <select
                  name="service_zone_id"
                  defaultValue={room.service_zone_id || 'zone-1'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white cursor-pointer font-medium"
                >
                  {serviceZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Tiền cọc mặc định
                </label>
                <div className="relative">
                  <input
                    name="default_deposit"
                    type="text"
                    defaultValue={formatVND(room.default_deposit || 0)}
                    className="w-full border border-gray-200 rounded-lg pl-3 pr-10 py-2.5 text-sm font-bold text-orange-600 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
                  />
                  <span className="absolute right-3 top-3 text-[10px] font-bold text-gray-400">
                    VNĐ
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Ngày lập hóa đơn
                </label>
                <input
                  name="invoice_day"
                  type="number"
                  min="1"
                  max="28"
                  defaultValue={room.invoice_day || 5}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition text-gray-800 font-medium"
                />
              </div>
            </div>

            <div className="bg-blue-50/80 rounded-xl p-3 border border-blue-100/50 flex items-start gap-3">
              <i className="fa-solid fa-circle-info text-blue-500 mt-0.5"></i>
              <p className="text-[11px] text-blue-800 italic leading-relaxed">
                Chỉnh sửa các thiết lập cơ bản của phòng. Các thông tin khác có thể xem trong chi
                tiết phòng.
              </p>
            </div>
            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-200 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20 transition flex items-center gap-2"
            >
              <i className="fa-solid fa-check"></i>{' '}
              {updateMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const ServiceZoneModal = ({ onClose }: { onClose: () => void }) => {
  const queryClient = useQueryClient()
  const { data: serviceZones = [] } = useQuery({
    queryKey: ['serviceZones'],
    queryFn: getServiceZones
  })
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })

  // State cho editing
  const [editingZone, setEditingZone] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ServiceZone>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [newZoneForm, setNewZoneForm] = useState<Partial<ServiceZone>>({
    name: '',
    electric_price: 3500,
    water_price: 20000,
    internet_price: 100000,
    cleaning_price: 20000
  })
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Mutations
  const createZoneMutation = useMutation({
    mutationFn: createServiceZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceZones'] })
      setIsAdding(false)
      setNewZoneForm({
        name: '',
        electric_price: 3500,
        water_price: 20000,
        internet_price: 100000,
        cleaning_price: 20000
      })
    }
  })

  const updateZoneMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ServiceZone> }) =>
      updateServiceZone(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceZones'] })
      setEditingZone(null)
    }
  })

  const deleteZoneMutation = useMutation({
    mutationFn: deleteServiceZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceZones'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setDeleteConfirmId(null)
    }
  })

  const startEdit = (zone: ServiceZone) => {
    setEditingZone(zone.id)
    setEditForm({
      name: zone.name,
      electric_price: zone.electric_price,
      water_price: zone.water_price,
      internet_price: zone.internet_price,
      cleaning_price: zone.cleaning_price
    })
  }

  const saveEdit = () => {
    if (editingZone) {
      updateZoneMutation.mutate({ id: editingZone, updates: editForm })
    }
  }

  const cancelEdit = () => {
    setEditingZone(null)
    setEditForm({})
  }

  const countRoomsInZone = (zoneId: string) =>
    rooms.filter((r) => r.service_zone_id === zoneId).length

  const formatPrice = (v: number) => new Intl.NumberFormat('vi-VN').format(v)

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-lg">
              <i className="fa-solid fa-tags"></i>
            </div>
            <h2 className="text-lg font-bold text-gray-800">Quản Lý Vùng Bảng Giá</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center transition"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <div className="p-6 bg-gray-50/30 overflow-y-auto max-h-[70vh]">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600 max-w-lg">
              Thay vì nhập giá cho từng phòng, bạn chỉ cần xếp phòng vào Vùng tương ứng. Khi giá
              thay đổi, bạn chỉ cần sửa giá ở Vùng.
            </p>
            <button
              onClick={() => setIsAdding(true)}
              disabled={isAdding}
              className="px-4 py-2 bg-primary text-white rounded-lg shadow text-sm font-medium hover:bg-primary-dark transition flex items-center gap-2 disabled:opacity-50"
            >
              <i className="fa-solid fa-plus"></i> Thêm Vùng
            </button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100/80 text-gray-600 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Tên Vùng Giá</th>
                  <th className="px-4 py-3">
                    <i className="fa-solid fa-bolt text-yellow-500 mr-1"></i> Điện (đ/kWh)
                  </th>
                  <th className="px-4 py-3">
                    <i className="fa-solid fa-droplet text-blue-500 mr-1"></i> Nước (đ/m³)
                  </th>
                  <th className="px-4 py-3">
                    <i className="fa-solid fa-wifi text-green-500 mr-1"></i> Nét (đ/phòng)
                  </th>
                  <th className="px-4 py-3">
                    <i className="fa-solid fa-broom text-gray-400 mr-1"></i> Rác (đ/phòng)
                  </th>
                  <th className="px-4 py-3 text-center">Số phòng</th>
                  <th className="px-4 py-3 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Row thêm vùng mới */}
                {isAdding && (
                  <tr className="bg-green-50/50 animate-[fadeIn_0.15s_ease-out]">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={newZoneForm.name}
                        onChange={(e) => setNewZoneForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="VD: Vùng C"
                        className="w-full border border-green-300 rounded px-2 py-1.5 text-sm font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={newZoneForm.electric_price}
                        onChange={(e) =>
                          setNewZoneForm((f) => ({ ...f, electric_price: Number(e.target.value) }))
                        }
                        className="w-full border border-green-300 rounded px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={newZoneForm.water_price}
                        onChange={(e) =>
                          setNewZoneForm((f) => ({ ...f, water_price: Number(e.target.value) }))
                        }
                        className="w-full border border-green-300 rounded px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={newZoneForm.internet_price}
                        onChange={(e) =>
                          setNewZoneForm((f) => ({ ...f, internet_price: Number(e.target.value) }))
                        }
                        className="w-full border border-green-300 rounded px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={newZoneForm.cleaning_price}
                        onChange={(e) =>
                          setNewZoneForm((f) => ({ ...f, cleaning_price: Number(e.target.value) }))
                        }
                        className="w-full border border-green-300 rounded px-2 py-1.5 text-sm tabular-nums focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </td>
                    <td className="px-4 py-2 text-center text-gray-400">—</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => {
                          if (newZoneForm.name?.trim())
                            createZoneMutation.mutate(newZoneForm as Partial<ServiceZone>)
                        }}
                        disabled={!newZoneForm.name?.trim() || createZoneMutation.isPending}
                        className="text-white bg-primary hover:bg-primary-dark px-3 py-1.5 rounded text-xs font-bold transition disabled:opacity-50 mr-1"
                      >
                        <i className="fa-solid fa-check mr-1"></i>Lưu
                      </button>
                      <button
                        onClick={() => setIsAdding(false)}
                        className="text-gray-500 hover:bg-gray-100 px-2 py-1.5 rounded text-xs transition"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </td>
                  </tr>
                )}

                {/* Danh sách zones */}
                {serviceZones.map((zone) => {
                  const isEditing = editingZone === zone.id
                  const isDeleting = deleteConfirmId === zone.id
                  const roomCount = countRoomsInZone(zone.id)

                  if (isDeleting) {
                    return (
                      <tr key={zone.id} className="bg-red-50 animate-[fadeIn_0.1s_ease-out]">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <i className="fa-solid fa-triangle-exclamation text-red-500"></i>
                              <span className="text-sm">
                                Xóa vùng <b>"{zone.name}"</b>?
                                {roomCount > 0 && (
                                  <span className="text-red-600 ml-1">
                                    ({roomCount} phòng sẽ chuyển về Vùng Mặc Định)
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => deleteZoneMutation.mutate(zone.id)}
                                disabled={deleteZoneMutation.isPending}
                                className="px-3 py-1.5 bg-red-500 text-white rounded text-xs font-bold hover:bg-red-600 transition disabled:opacity-50"
                              >
                                {deleteZoneMutation.isPending ? 'Đang xóa...' : 'Xác nhận xóa'}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition"
                              >
                                Hủy
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr
                      key={zone.id}
                      className={`hover:bg-gray-50 transition ${isEditing ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.name || ''}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full border border-blue-300 rounded px-2 py-1 text-sm font-semibold focus:ring-2 focus:ring-primary/20 outline-none"
                            autoFocus
                          />
                        ) : (
                          <span className="font-semibold text-gray-800">{zone.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editForm.electric_price}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, electric_price: Number(e.target.value) }))
                            }
                            className="w-full border border-blue-300 rounded px-2 py-1 text-sm tabular-nums focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                        ) : (
                          <span className="tabular-nums">{formatPrice(zone.electric_price)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editForm.water_price}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, water_price: Number(e.target.value) }))
                            }
                            className="w-full border border-blue-300 rounded px-2 py-1 text-sm tabular-nums focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                        ) : (
                          <span className="tabular-nums">{formatPrice(zone.water_price)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editForm.internet_price}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, internet_price: Number(e.target.value) }))
                            }
                            className="w-full border border-blue-300 rounded px-2 py-1 text-sm tabular-nums focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                        ) : (
                          <span className="tabular-nums">{formatPrice(zone.internet_price)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editForm.cleaning_price}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, cleaning_price: Number(e.target.value) }))
                            }
                            className="w-full border border-blue-300 rounded px-2 py-1 text-sm tabular-nums focus:ring-2 focus:ring-primary/20 outline-none"
                          />
                        ) : (
                          <span className="tabular-nums">{formatPrice(zone.cleaning_price)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${roomCount > 0 ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'}`}
                        >
                          {roomCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={saveEdit}
                              disabled={updateZoneMutation.isPending}
                              className="text-white bg-primary hover:bg-primary-dark px-3 py-1.5 rounded text-xs font-bold transition disabled:opacity-50"
                            >
                              <i className="fa-solid fa-check mr-1"></i>Lưu
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-gray-500 hover:bg-gray-100 px-2 py-1.5 rounded text-xs transition"
                            >
                              <i className="fa-solid fa-xmark"></i>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(zone)}
                              className="text-blue-500 hover:bg-blue-50 p-1.5 rounded transition"
                              title="Sửa vùng"
                            >
                              <i className="fa-solid fa-pen text-xs"></i>
                            </button>
                            {zone.id !== 'zone-1' && (
                              <button
                                onClick={() => setDeleteConfirmId(zone.id)}
                                className="text-red-400 hover:bg-red-50 p-1.5 rounded transition"
                                title="Xóa vùng"
                              >
                                <i className="fa-solid fa-trash text-xs"></i>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {serviceZones.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <i className="fa-solid fa-tags text-4xl mb-3 block"></i>
              <p className="text-sm">Chưa có vùng giá nào. Bấm "Thêm Vùng" để bắt đầu.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const RoomServiceZonePickerModal = ({
  room,
  onClose,
  invoiceBlocked = false,
  onAssigned
}: {
  room: Room
  onClose: () => void
  invoiceBlocked?: boolean
  onAssigned?: (room: Room) => void
}) => {
  const queryClient = useQueryClient()
  const { data: serviceZones = [] } = useQuery({
    queryKey: ['serviceZones'],
    queryFn: getServiceZones
  })
  const [selectedZoneId, setSelectedZoneId] = useState(room.service_zone_id || '')

  const assignMutation = useMutation({
    mutationFn: (service_zone_id: string) => updateRoom(room.id, { service_zone_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      if (onAssigned) {
        onAssigned({ ...room, service_zone_id: selectedZoneId })
      }
      onClose()
    }
  })

  return (
    <div
      className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[70]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-lg">
              <i className="fa-solid fa-tags"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Cài đặt dịch vụ</h2>
              <p className="text-xs text-gray-500">{room.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center transition"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Banner cảnh báo khi bị chặn từ invoice flow */}
        {invoiceBlocked && (
          <div className="mx-4 mt-4 rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 flex gap-3 text-sm text-orange-800">
            <i className="fa-solid fa-triangle-exclamation text-orange-500 mt-0.5 shrink-0"></i>
            <div>
              <div className="font-bold mb-0.5">Chưa thiết lập phí dịch vụ!</div>
              <div className="text-xs text-orange-700">
                Bạn cần chọn <b>vùng bảng giá</b> cho phòng này trước khi lập hóa đơn. Sau khi chọn
                xong, hóa đơn sẽ tự động mở.
              </div>
            </div>
          </div>
        )}

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Chọn vùng bảng giá
            </label>
            <select
              value={selectedZoneId}
              onChange={(e) => setSelectedZoneId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white cursor-pointer font-medium"
            >
              <option value="" disabled>
                Chọn vùng áp dụng
              </option>
              {serviceZones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>

          {serviceZones.find((zone) => zone.id === selectedZoneId) && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-gray-700 space-y-1.5">
              <div className="font-bold text-gray-800">
                {serviceZones.find((zone) => zone.id === selectedZoneId)?.name}
              </div>
              <div>
                Điện:{' '}
                <b>
                  {formatVND(
                    serviceZones.find((zone) => zone.id === selectedZoneId)?.electric_price || 0
                  )}
                </b>{' '}
                đ/kWh
              </div>
              <div>
                Nước:{' '}
                <b>
                  {formatVND(
                    serviceZones.find((zone) => zone.id === selectedZoneId)?.water_price || 0
                  )}
                </b>{' '}
                đ/m³
              </div>
              <div>
                Internet:{' '}
                <b>
                  {formatVND(
                    serviceZones.find((zone) => zone.id === selectedZoneId)?.internet_price || 0
                  )}
                </b>{' '}
                đ/phòng
              </div>
              <div>
                Rác:{' '}
                <b>
                  {formatVND(
                    serviceZones.find((zone) => zone.id === selectedZoneId)?.cleaning_price || 0
                  )}
                </b>{' '}
                đ/phòng
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-200 transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => assignMutation.mutate(selectedZoneId)}
            disabled={!selectedZoneId || assignMutation.isPending}
            className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {assignMutation.isPending ? (
              <>
                <i className="fa-solid fa-spinner animate-spin"></i> Đang lưu...
              </>
            ) : invoiceBlocked ? (
              <>
                <i className="fa-solid fa-file-invoice-dollar"></i> Lưu & Lập hóa đơn
              </>
            ) : (
              'Áp dụng'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

const ConfirmDeleteModal = ({
  room,
  onConfirm,
  onCancel,
  isDeleting
}: {
  room: Room
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
}) => {
  return (
    <div
      className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeIn_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-3xl mx-auto mb-4">
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Xác nhận xóa phòng</h3>
          <p className="text-sm text-gray-500 mb-1">Bạn có chắc chắn muốn xóa</p>
          <p className="text-base font-bold text-gray-800 mb-1">“{room.name}”?</p>
          <p className="text-xs text-red-400 mt-2">
            <i className="fa-solid fa-circle-info mr-1"></i>Thao tác này chỉ xóa phòng khỏi danh
            sách. Hóa đơn, khách thuê, tài sản và dữ liệu liên quan vẫn được giữ lại.
          </p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
          >
            Hủy bỏ
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 shadow-md shadow-red-200 transition flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-trash-can"></i> {isDeleting ? 'Đang xóa...' : 'Xóa phòng'}
          </button>
        </div>
      </div>
    </div>
  )
}

const App: React.FC = () => {
  const { data: rooms = [], isLoading } = useQuery({ queryKey: ['rooms'], queryFn: getRooms })
  const { data: serviceZones = [] } = useQuery({
    queryKey: ['serviceZones'],
    queryFn: getServiceZones
  })
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices })
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts'], queryFn: getContracts })
  const { data: moveInReceipts = [] } = useQuery({
    queryKey: ['moveInReceipts'],
    queryFn: getMoveInReceipts
  })
  const { data: appSettings = {} } = useQuery({
    queryKey: ['appSettings'],
    queryFn: getAppSettings
  })
  const roomIdsKey = rooms.map((room) => room.id).sort().join('|')
  const { data: roomAssetWorkflow = {} } = useQuery<
    Record<string, { hasMoveIn: boolean; hasMoveOut: boolean; hasHandover: boolean }>
  >({
    queryKey: ['asset_snapshots', 'room_workflow', roomIdsKey],
    enabled: rooms.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        rooms.map(async (room) => {
          const [moveIn, moveOut, handover] = await Promise.all([
            getAssetSnapshots(room.id, 'move_in'),
            getAssetSnapshots(room.id, 'move_out'),
            getAssetSnapshots(room.id, 'handover')
          ])

          const hasHandover =
            handover.length > 0 &&
            HANDOVER_IDS.every((id) =>
              handover.some(
                (snap) =>
                  snap.room_asset_id === id &&
                  (snap.condition === 'ok' || (snap.condition === 'not_done' && (snap.deduction || 0) > 0))
              )
            )

          return [room.id, { hasMoveIn: moveIn.length > 0, hasMoveOut: moveOut.length > 0, hasHandover }] as const
        })
      )
      return Object.fromEntries(entries)
    }
  })

  const [activeTab, setActiveTab] = useState<AppTab>('rooms')
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsSection>('general')
  const [reportSubTab, setReportSubTab] = useState<'cashflow' | 'finance'>('cashflow')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [detailRoom, setDetailRoom] = useState<Room | null>(null)
  const [detailRoomInitialTab, setDetailRoomInitialTab] = useState<
    'info' | 'assets' | 'vehicles' | 'history'
  >('info')
  const [assetModuleInitialRoomId, setAssetModuleInitialRoomId] = useState<string | null>(null)
  const [assetModuleGuideMode, setAssetModuleGuideMode] = useState<'move_in' | 'move_out' | null>(null)
  const [assetReceivePending, setAssetReceivePending] = useState<PendingAssetReceive | null>(null)
  const assetReceivePendingRef = React.useRef<PendingAssetReceive | null>(null)
  const [assetLeavePrompt, setAssetLeavePrompt] = useState<{
    pending: PendingAssetReceive
    targetTab: AppTab
  } | null>(null)
  const [isAddRoomOpen, setIsAddRoomOpen] = useState(false)
  const [isServiceZoneOpen, setIsServiceZoneOpen] = useState(false)
  const [serviceZoneRoom, setServiceZoneRoom] = useState<Room | null>(null)

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [menuPlacement, setMenuPlacement] = useState<'top' | 'bottom'>('bottom')
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({
    occupied: false,
    vacant: false,
    ending: false,
    expiring: false
  })
  const queryClient = useQueryClient()
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)
  const [authReady, setAuthReady] = useState(false)

  // --- REALTIME SYNC ---
  useEffect(() => {
    const cleanup = setupRealtime(queryClient)
    return () => cleanup()
  }, [queryClient])

  const [editRoom, setEditRoom] = useState<Room | null>(null)
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)
  const [invoiceGuardNotice, setInvoiceGuardNotice] = useState<{
    message: string
    invoice: Invoice
  } | null>(null)
  const [assetGuardNotice, setAssetGuardNotice] = useState<{
    room: Room
    type: 'move_in' | 'move_out'
  } | null>(null)
  const [newContractRoom, setNewContractRoom] = useState<Room | null>(null)
  const [migrationContractRoom, setMigrationContractRoom] = useState<Room | null>(null)
  const [newContractSeed, setNewContractSeed] = useState<{
    tenantId?: string
    moveInDate?: string
  } | null>(null)
  const [endNoticeRoom, setEndNoticeRoom] = useState<Room | null>(null)
  const [terminateRoom, setTerminateRoom] = useState<Room | null>(null)
  const [cancelContractRoom, setCancelContractRoom] = useState<Room | null>(null)
  const [changeTargetRoom, setChangeTargetRoom] = useState<Room | null>(null)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isReportMenuOpen, setIsReportMenuOpen] = useState(false)
  const [reportMenuPosition, setReportMenuPosition] = useState({ top: 0, left: 0 })
  const notificationMenuRef = React.useRef<HTMLDivElement | null>(null)
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null)
  const reportMenuRef = React.useRef<HTMLDivElement | null>(null)
  const reportDropdownRef = React.useRef<HTMLDivElement | null>(null)
  const reportButtonRef = React.useRef<HTMLButtonElement | null>(null)
  const notificationCountRef = React.useRef<number | null>(null)

  const handleAssetReceivePendingChange = React.useCallback((pending: PendingAssetReceive | null) => {
    assetReceivePendingRef.current = pending
    setAssetReceivePending(pending)
  }, [])

  const requestActiveTab = (tab: AppTab) => {
    const pendingAssetReceive = assetReceivePendingRef.current || assetReceivePending
    if (activeTab === 'assets' && tab !== 'assets' && pendingAssetReceive) {
      setAssetLeavePrompt({ pending: pendingAssetReceive, targetTab: tab })
      return
    }

    setActiveTab(tab)
  }

  const openPendingAssetReceive = () => {
    if (!assetLeavePrompt) return
    window.dispatchEvent(
      new CustomEvent('asset-open-move-in', { detail: assetLeavePrompt.pending.roomId })
    )
    setAssetLeavePrompt(null)
  }

  const continuePendingAssetLeave = () => {
    if (!assetLeavePrompt) return
    const targetTab = assetLeavePrompt.targetTab
    handleAssetReceivePendingChange(null)
    setAssetLeavePrompt(null)
    setActiveTab(targetTab)
  }

  const [pendingRoomUpdates, setPendingRoomUpdates] = useState<Record<string, Partial<Room>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveToast, setSaveToast] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [updateBanner, setUpdateBanner] = useState<UpdateBannerInfo | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.auth
      .ensureAdmin()
      .then(async () => {
        const session = await window.api.auth.session()
        if (!mounted) return
        if (session) {
          const db = (await window.api.db.read()) as { users?: (AppUser & { password_hash?: string })[] } | null
          const matchedUser = db?.users?.find((user) => user.id === session.id)
          if (matchedUser) {
            const { password_hash: _passwordHash, ...safeUser } = matchedUser
            setCurrentUser(safeUser)
          }
        }
        setAuthReady(true)
      })
      .catch(() => {
        if (mounted) setAuthReady(true)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const removeAvailable = window.api.update.onAvailable((data) => {
      setUpdateBanner({
        latestVersion: data.latestVersion,
        downloadUrl: data.downloadUrl
      })
    })

    return () => removeAvailable()
  }, [])

  const markNotificationReadMutation = useMutation({
    mutationFn: (notificationReadIds: string[]) =>
      updateAppSettings({ notification_read_ids: notificationReadIds }),
    onMutate: async (notificationReadIds) => {
      await queryClient.cancelQueries({ queryKey: ['appSettings'] })
      const previous = queryClient.getQueryData(['appSettings'])
      queryClient.setQueryData(['appSettings'], (current: any) => ({
        ...(current || {}),
        notification_read_ids: notificationReadIds
      }))
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['appSettings'], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] })
    }
  })

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setIsNotificationOpen(false)
      }
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false)
      }
      const targetNode = event.target as Node
      if (
        !reportMenuRef.current?.contains(targetNode) &&
        !reportDropdownRef.current?.contains(targetNode)
      ) {
        setIsReportMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!isReportMenuOpen) return

    const updateReportMenuPosition = () => {
      if (!reportButtonRef.current) return
      const rect = reportButtonRef.current.getBoundingClientRect()
      setReportMenuPosition({
        top: rect.bottom + 8,
        left: rect.left
      })
    }

    updateReportMenuPosition()
    window.addEventListener('resize', updateReportMenuPosition)
    window.addEventListener('scroll', updateReportMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateReportMenuPosition)
      window.removeEventListener('scroll', updateReportMenuPosition, true)
    }
  }, [isReportMenuOpen])

  const handleLogout = async () => {
    await window.api.auth.logout()
    queryClient.clear()
    setCurrentUser(null)
    setIsAccountMenuOpen(false)
    setActiveTab('rooms')
  }

  // Auto-expire: phòng "ending" đã qua ngày dự kiến → tự chuyển về vacant
  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const expired = rooms.filter((r) => {
      if (r.status !== 'ending' || !r.expected_end_date) return false
      const end = new Date(r.expected_end_date)
      end.setHours(0, 0, 0, 0)
      return end < today
    })
    if (expired.length === 0) return
    Promise.all(
      expired.map((r) =>
        updateRoom(r.id, {
          status: 'vacant',
          expected_end_date: undefined,
          tenant_name: undefined,
          move_in_date: undefined
        } as any)
      )
    ).then(() => queryClient.invalidateQueries({ queryKey: ['rooms'] }))
  }, [rooms])

  const handleQueueChange = (id: string, updates: Partial<Room>) => {
    setSaveError('')
    setPendingRoomUpdates((prev) => {
      const originalRoom = rooms.find((room) => room.id === id)
      if (!originalRoom) return prev

      const nextRoomUpdates = { ...(prev[id] || {}), ...updates }
      const cleanedUpdates = Object.fromEntries(
        Object.entries(nextRoomUpdates).filter(([key, value]) => {
          const originalValue = originalRoom[key as keyof Room]
          return value !== originalValue
        })
      ) as Partial<Room>

      if (Object.keys(cleanedUpdates).length === 0) {
        const { [id]: _removed, ...rest } = prev
        return rest
      }

      return {
        ...prev,
        [id]: cleanedUpdates
      }
    })
  }

  const handleSaveAll = async () => {
    setIsSaving(true)
    setSaveError('')
    try {
      const nextRooms = rooms.map((room) => ({ ...room, ...(pendingRoomUpdates[room.id] || {}) }))
      const seenRoomNames = new Set<string>()
      for (const room of nextRooms) {
        const normalizedName = normalizeRoomName(room.name || '')
        if (!normalizedName) throw new Error('Tên phòng không được để trống.')
        if (seenRoomNames.has(normalizedName)) {
          throw new Error('Tên phòng này đã tồn tại. Vui lòng nhập tên khác.')
        }
        seenRoomNames.add(normalizedName)
      }
      const promises = Object.entries(pendingRoomUpdates).map(([id, updates]) =>
        updateRoom(id, updates)
      )
      await Promise.all(promises)
      setPendingRoomUpdates({})
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      setSaveToast(true)
      setTimeout(() => setSaveToast(false), 2500)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Không thể lưu thay đổi phòng.')
    } finally {
      setIsSaving(false)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: deleteRoom,
    onSuccess: () => {
      playDelete()
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      setMenuOpenId(null)
    }
  })

  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null)

  const openInvoiceFlow = (room: Room) => {
    // Guard 1: phòng phải có vùng dịch vụ hợp lệ trước khi lập hóa đơn
    const hasZone = room.service_zone_id && serviceZones.some((z) => z.id === room.service_zone_id)
    if (!hasZone) {
      setServiceZoneRoom({ ...room, _invoiceBlockedReason: 'no_zone' } as any)
      return
    }

    const activeContract = contracts.find((c) => c.room_id === room.id && c.status === 'active')
    const workflow = roomAssetWorkflow[room.id]

    if (activeContract && room.status === 'occupied' && !workflow?.hasMoveIn) {
      setAssetGuardNotice({ room, type: 'move_in' })
      return
    }

    if (room.status === 'ending' && (!workflow?.hasMoveOut || !workflow?.hasHandover)) {
      setAssetGuardNotice({ room, type: 'move_out' })
      return
    }

    const currentTenantId = activeContract?.tenant_id
    const blockingInvoices = invoices
      .filter(
        (i) =>
          i.room_id === room.id &&
          i.payment_status !== 'cancelled' &&
          i.payment_status !== 'merged' &&
          (i.payment_status === 'unpaid' || i.payment_status === 'partial') &&
          (!currentTenantId || i.tenant_id === currentTenantId)
      )
      .sort((a, b) => {
        if (!!a.is_first_month !== !!b.is_first_month) return a.is_first_month ? -1 : 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

    if (blockingInvoices.length > 0) {
      // Mở thẳng PaymentModal cho hóa đơn bị chặn
      setPaymentInvoice(blockingInvoices[0])
      return
    }

    setSelectedRoom(room)
  }

  const confirmDelete = () => {
    if (roomToDelete) {
      deleteMutation.mutate(roomToDelete.id, {
        onSuccess: () => setRoomToDelete(null)
      })
    }
  }

  // Đếm số lượng theo trạng thái
  const counts = {
    occupied: rooms.filter((r) => r.status === 'occupied').length,
    vacant: rooms.filter((r) => r.status === 'vacant').length,
    ending: rooms.filter((r) => r.status === 'ending').length,
    expiring: 0
  }

  // Lọc phòng theo checkbox + tìm kiếm
  const filteredRooms = rooms.filter((room) => {
    // Nếu không tick checkbox nào → hiện tất cả
    const anyFilterActive = filters.occupied || filters.vacant || filters.ending || filters.expiring
    if (anyFilterActive) {
      const statusMatch =
        (filters.vacant && room.status === 'vacant') ||
        (filters.occupied && room.status === 'occupied') ||
        (filters.ending && room.status === 'ending')
      if (!statusMatch) return false
    }
    // Tìm kiếm theo tên
    if (searchQuery.trim()) {
      return room.name.toLowerCase().includes(searchQuery.toLowerCase())
    }
    return true
  })

  const isAllRoomFilter =
    !filters.occupied && !filters.vacant && !filters.ending && !filters.expiring

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const resetRoomFilters = () => {
    setFilters({
      occupied: false,
      vacant: false,
      ending: false,
      expiring: false
    })
  }

  const toggleRoomMenu = (event: React.MouseEvent<HTMLButtonElement>, roomId: string) => {
    if (menuOpenId === roomId) {
      setMenuOpenId(null)
      return
    }

    const buttonRect = event.currentTarget.getBoundingClientRect()
    const estimatedMenuHeight = 320
    const viewportPadding = 16
    const shouldOpenUp =
      window.innerHeight - buttonRect.bottom < estimatedMenuHeight + viewportPadding

    setMenuPlacement(shouldOpenUp ? 'top' : 'bottom')
    setMenuOpenId(roomId)
  }

  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()
  const currentDay = new Date().getDate()
  let dueRoomsCount = 0
  const roomWarnings: Record<string, 'due' | 'unpaid' | null> = {}
  const roomFirstMonthBlockedThisMonth: Record<string, boolean> = {}

  rooms.forEach((room) => {
    if (room.status === 'occupied') {
      // Due Date Check: Has the regular billing day passed without an invoice for THIS month?
      const invoiceDay = room.invoice_day || 5
      const isDueDate = currentDay >= invoiceDay
      const currentInvoice = invoices.find(
        (i) => i.room_id === room.id && i.month === currentMonth && i.year === currentYear
      )

      // Kiểm tra tháng này đã có phiếu tháng đầu của khách HIỆN TẠI chưa
      const activeContract = contracts.find((c) => c.room_id === room.id && c.status === 'active')
      const currentTenantId = activeContract?.tenant_id
      const hasFirstMonthThisMonth =
        !!currentTenantId &&
        invoices.some(
          (i) =>
            i.room_id === room.id &&
            i.tenant_id === currentTenantId &&
            i.is_first_month &&
            i.month === currentMonth &&
            i.year === currentYear &&
            i.payment_status !== 'cancelled'
        )
      roomFirstMonthBlockedThisMonth[room.id] = hasFirstMonthThisMonth

      if (!currentInvoice && isDueDate) {
        dueRoomsCount++
        roomWarnings[room.id] = 'due'
      } else {
        roomWarnings[room.id] = null
      }
    }
  })

  const dueNotificationItems = rooms
    .filter((room) => roomWarnings[room.id] === 'due')
    .map((room) => ({
      id: `due-${room.id}-${currentMonth}-${currentYear}`,
      icon: 'fa-file-circle-plus',
      iconClass: 'text-amber-500',
      title: `${room.name} chưa lập hóa đơn`,
      description: `Đã qua ngày ${room.invoice_day || 5} của tháng ${currentMonth}/${currentYear}.`,
      actionLabel: 'Lập hóa đơn',
      onClick: () => {
        setIsNotificationOpen(false)
        requestActiveTab('rooms')
        openInvoiceFlow(room)
      }
    }))

  const endingNotificationItems = rooms
    .filter((room) => room.status === 'ending')
    .sort((a, b) => {
      const aTime = a.expected_end_date
        ? new Date(a.expected_end_date).getTime()
        : Number.MAX_SAFE_INTEGER
      const bTime = b.expected_end_date
        ? new Date(b.expected_end_date).getTime()
        : Number.MAX_SAFE_INTEGER
      return aTime - bTime
    })
    .map((room) => {
      const daysLeft = room.expected_end_date
        ? Math.ceil(
          (new Date(room.expected_end_date).getTime() - new Date().setHours(0, 0, 0, 0)) /
          (1000 * 60 * 60 * 24)
        )
        : null

      return {
        id: `ending-${room.id}-${room.expected_end_date || 'unknown'}`,
        icon: 'fa-person-walking-luggage',
        iconClass: 'text-orange-500',
        title: `${room.name} sắp chuyển phòng`,
        description: room.expected_end_date
          ? daysLeft !== null && daysLeft >= 0
            ? `Dự kiến trả phòng ngày ${room.expected_end_date} (${daysLeft} ngày nữa).`
            : `Đã quá ngày dự kiến trả phòng ${room.expected_end_date}.`
          : 'Phòng đang ở trạng thái sắp chuyển, chưa có ngày dự kiến cụ thể.',
        actionLabel: 'Xem phòng',
        onClick: () => {
          setIsNotificationOpen(false)
          requestActiveTab('rooms')
          setFilters((prev) => ({
            ...prev,
            occupied: false,
            vacant: false,
            ending: true,
            expiring: false
          }))
          setSearchQuery(room.name)
        }
      }
    })

  const unpaidNotificationItems = invoices
    .filter(
      (invoice) => invoice.payment_status === 'unpaid' || invoice.payment_status === 'partial'
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((invoice) => {
      const room = rooms.find((item) => item.id === invoice.room_id)
      const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount)
      return {
        id: `invoice-${invoice.id}`,
        icon: invoice.payment_status === 'partial' ? 'fa-money-bill-wave' : 'fa-receipt',
        iconClass: invoice.payment_status === 'partial' ? 'text-sky-500' : 'text-rose-500',
        title: `${room?.name || 'Phòng không xác định'} còn nợ ${formatVND(remaining)}đ`,
        description: invoice.is_first_month
          ? 'Phiếu tháng đầu đang chờ thanh toán.'
          : `Hóa đơn tháng ${invoice.month}/${invoice.year} chưa hoàn tất.`,
        actionLabel: 'Mở thanh toán',
        onClick: () => {
          setIsNotificationOpen(false)
          setPaymentInvoice(invoice)
        }
      }
    })

  const readNotificationIds = new Set(appSettings.notification_read_ids || [])
  const notificationItems = [
    ...endingNotificationItems,
    ...dueNotificationItems,
    ...unpaidNotificationItems
  ].filter((item) => !readNotificationIds.has(item.id))
  const notificationBadgeLabel = notificationItems.length > 9 ? '9+' : `${notificationItems.length}`

  const handleNotificationAction = (notificationId: string, action: () => void) => {
    const nextIds = Array.from(
      new Set([...(appSettings.notification_read_ids || []), notificationId])
    )
    markNotificationReadMutation.mutate(nextIds)
    action()
  }

  useEffect(() => {
    if (notificationCountRef.current === null) {
      notificationCountRef.current = notificationItems.length
      return
    }

    if (notificationItems.length > notificationCountRef.current) {
      playNotification()
    }

    notificationCountRef.current = notificationItems.length
  }, [notificationItems.length])

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-5 text-sm font-semibold">
          Đang khởi tạo hệ thống...
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />
  }

  return (
    <div className="text-sm text-gray-800 antialiased h-screen flex flex-col overflow-hidden bg-gray-100">
      {invoiceGuardNotice &&
        (() => {
          const inv = invoiceGuardNotice.invoice
          const remaining = Math.max(0, inv.total_amount - inv.paid_amount)
          const room = rooms.find((r) => r.id === inv.room_id)
          return (
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white shadow-2xl">
                {/* Header */}
                <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <i className="fa-solid fa-triangle-exclamation text-lg"></i>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-gray-900">
                      Hóa đơn này chưa được thanh toán
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      {invoiceGuardNotice.message}
                    </p>
                  </div>
                </div>

                {/* Invoice Detail Card */}
                <div className="px-5 py-4 space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 divide-y divide-slate-100 overflow-hidden">
                    {/* Row: Loại hóa đơn */}
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-slate-500 font-medium">Loại hóa đơn</span>
                      <span className="text-xs font-bold text-slate-800">
                        {inv.is_first_month
                          ? '⚡ Tháng đầu (nhận phòng)'
                          : inv.is_settlement
                            ? '🔚 Tất toán hợp đồng'
                            : `📅 Hàng tháng – Tháng ${inv.month}/${inv.year}`}
                      </span>
                    </div>

                    {/* Row: Phòng */}
                    {room && (
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-slate-500 font-medium">Phòng</span>
                        <span className="text-xs font-bold text-slate-800">{room.name}</span>
                      </div>
                    )}

                    {/* Row: Tổng tiền */}
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs text-slate-500 font-medium">Tổng hóa đơn</span>
                      <span className="text-sm font-bold text-slate-900">
                        {inv.total_amount.toLocaleString('vi-VN')}đ
                      </span>
                    </div>

                    {/* Row: Đã trả */}
                    {inv.paid_amount > 0 && (
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs text-slate-500 font-medium">Đã thanh toán</span>
                        <span className="text-xs font-bold text-emerald-600">
                          {inv.paid_amount.toLocaleString('vi-VN')}đ
                        </span>
                      </div>
                    )}

                    {/* Row: Còn thiếu */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-red-50">
                      <span className="text-xs text-red-600 font-bold">Còn thiếu</span>
                      <span className="text-base font-black text-red-600">
                        {remaining.toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <i className="fa-solid fa-circle-info mr-2 text-amber-500"></i>
                    Thanh toán hóa đơn này trước để tiếp tục lập hóa đơn mới.
                  </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 border-t border-gray-100 px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setInvoiceGuardNotice(null)}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    Thoát ra
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentInvoice(invoiceGuardNotice.invoice)
                      setInvoiceGuardNotice(null)
                    }}
                    className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-money-bill-wave"></i> Thanh toán ngay
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      {assetGuardNotice && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-100 bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <i className="fa-solid fa-clipboard-check text-lg"></i>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-gray-900">
                  {assetGuardNotice.type === 'move_in' ? 'Cần chốt nhận phòng' : 'Cần đối chiếu trả phòng'}
                </h3>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  {assetGuardNotice.type === 'move_in'
                    ? `Phòng ${assetGuardNotice.room.name} đã có hợp đồng mới. Cần vào tab Tài sản để chốt nhận phòng trước khi lập hoặc thu hóa đơn.`
                    : `Phòng ${assetGuardNotice.room.name} đang báo trả phòng. Cần hoàn tất Đối chiếu trả phòng trong tab Tài sản trước khi thu hóa đơn.`}
                </p>
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setAssetGuardNotice(null)}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Để sau
              </button>
              <button
                type="button"
                onClick={() => {
                  const noticeType = assetGuardNotice.type
                  setAssetModuleInitialRoomId(assetGuardNotice.room.id)
                  setAssetModuleGuideMode(noticeType)
                  requestActiveTab('assets')
                  setAssetGuardNotice(null)
                }}
                className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700 flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-couch"></i> Đi tới Tài sản
              </button>
            </div>
          </div>
        </div>
      )}
      {assetLeavePrompt && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-100 bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <i className="fa-solid fa-clipboard-check text-lg"></i>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-gray-900">Chưa chốt nhận tài sản</h3>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  Phòng {assetLeavePrompt.pending.roomName} đã được thêm tài sản nhưng chưa chốt nhận phòng. Cần chốt nhận để lưu tình trạng ban đầu và khóa danh sách thiết bị trước khi xử lý nghiệp vụ khác.
                </p>
              </div>
            </div>
            <div className="bg-amber-50 px-5 py-3 text-[12px] font-semibold leading-5 text-amber-700">
              Nếu bỏ qua bước này, lúc trả phòng sẽ không có mốc đối chiếu chính xác.
            </div>
            <div className="flex gap-3 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={continuePendingAssetLeave}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Vẫn chuyển tab
              </button>
              <button
                type="button"
                onClick={openPendingAssetReceive}
                className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700 flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-clipboard-check"></i> Chốt nhận ngay
              </button>
            </div>
          </div>
        </div>
      )}
      {isAddRoomOpen && (
        <AddRoomModal
          onClose={() => setIsAddRoomOpen(false)}
          onOpenContract={({ room, moveInDate }) => {
            setIsAddRoomOpen(false)
            setNewContractRoom(room)
            setNewContractSeed({ moveInDate })
          }}
        />
      )}
      {editRoom && <EditRoomModal room={editRoom} onClose={() => setEditRoom(null)} />}
      {isServiceZoneOpen && <ServiceZoneModal onClose={() => setIsServiceZoneOpen(false)} />}
      {serviceZoneRoom && (
        <RoomServiceZonePickerModal
          room={serviceZoneRoom}
          onClose={() => setServiceZoneRoom(null)}
        />
      )}

      {paymentInvoice && (
        <PaymentModal
          invoice={paymentInvoice}
          room={rooms.find((r) => r.id === paymentInvoice.room_id)}
          onClose={() => setPaymentInvoice(null)}
        />
      )}
      {roomToDelete && (
        <ConfirmDeleteModal
          room={roomToDelete}
          onConfirm={confirmDelete}
          onCancel={() => setRoomToDelete(null)}
          isDeleting={deleteMutation.isPending}
        />
      )}
      {/* TOP NAVBAR (Green) */}
      <header className="relative z-20 shrink-0 overflow-visible bg-primary px-6 py-2.5 text-white shadow-md">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-96 bg-gradient-to-l from-white/10 to-transparent"></div>
        <div className="relative flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <button className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-white/10">
              <i className="fa-solid fa-chevron-left text-sm"></i>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
                <img src={logoNavbar} alt="K-Map House" className="h-5 w-5 object-contain" />
              </div>
              <div>
                <div className="text-base font-extrabold leading-none tracking-tight">
                  K-Map House
                </div>
                <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.2em] text-white/60">
                  Hệ thống quản trị
                </div>
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative" ref={notificationMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsNotificationOpen((prev) => !prev)}
                  className={`relative flex h-10 w-10 items-center justify-center rounded-xl text-sm text-white transition-all ${notificationItems.length > 0
                    ? 'border border-white/15 bg-gradient-to-b from-white/18 to-white/10 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.45)] hover:from-white/24 hover:to-white/14 hover:shadow-[0_12px_24px_-14px_rgba(0,0,0,0.5)]'
                    : 'border border-white/10 bg-white/10 hover:border-white/20 hover:bg-white/20'
                    } ${isNotificationOpen ? 'border-white/25 bg-white/20' : ''}`}
                  title="Thông báo"
                >
                  <i
                    className={`fa-solid fa-bell transition-transform ${notificationItems.length > 0 ? 'text-[15px]' : 'text-sm'
                      } ${isNotificationOpen ? 'scale-110' : ''} ${notificationItems.length > 0 && !isNotificationOpen
                        ? 'notification-bell-ring'
                        : ''
                      }`}
                  ></i>
                  {notificationItems.length > 0 && (
                    <span
                      className={`absolute -right-1 -top-1 min-w-[18px] rounded-full border-2 border-primary bg-gradient-to-b from-orange-400 to-orange-500 px-1 text-center text-[10px] font-black leading-[18px] text-white shadow-[0_6px_14px_-8px_rgba(251,146,60,0.9)] ${!isNotificationOpen ? 'notification-badge-pulse' : ''
                        }`}
                    >
                      {notificationBadgeLabel}
                    </span>
                  )}
                </button>

                {isNotificationOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white py-2 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center justify-between px-4 pb-2 pt-1">
                      <div>
                        <div className="text-xs font-black uppercase tracking-wide text-slate-800">
                          Thông báo
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {notificationItems.length > 0
                            ? `Có ${notificationItems.length} mục cần xử lý`
                            : 'Hiện không có thông báo mới'}
                        </div>
                      </div>
                    </div>

                    {notificationItems.length > 0 ? (
                      <div className="max-h-80 overflow-y-auto px-2">
                        {notificationItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleNotificationAction(item.id, item.onClick)}
                            className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50"
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${item.iconClass}`}
                            >
                              <i className={`fa-solid ${item.icon} text-sm`}></i>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] font-bold text-slate-800">
                                {item.title}
                              </div>
                              <div className="mt-1 text-[11px] leading-5 text-slate-500">
                                {item.description}
                              </div>
                              <div className="mt-2 text-[11px] font-bold text-primary">
                                {item.actionLabel}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-6 text-center text-[12px] text-slate-500">
                        Mọi thứ đang ổn. Chưa có việc nào cần xử lý ngay.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  playClick()
                  setSettingsInitialTab('general')
                  requestActiveTab('settings')
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm transition-all ${activeTab === 'settings'
                  ? 'bg-white/20 text-white'
                  : 'text-white hover:bg-white/10'
                  }`}
                title="Cài đặt hệ thống"
              >
                <i className="fa-solid fa-gear settings-gear-spin text-sm"></i>
              </button>

              <div className="mx-1 h-6 w-px bg-white/10"></div>

              <div className="relative" ref={accountMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                  className="flex items-center gap-3 rounded-xl border border-white/15 py-1 pl-2 pr-1 text-left transition hover:border-white/25 hover:bg-white/10"
                >
                  <div className="hidden text-right sm:block">
                    <div className="text-[10px] font-black leading-none uppercase">
                      {currentUser.full_name}
                    </div>
                    <div className="mt-0.5 text-[8px] font-bold uppercase tracking-tighter text-white/60">
                      {currentUser.role}
                    </div>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-white text-xs font-black text-primary shadow-sm">
                    {currentUser.full_name
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase())
                      .join('')}
                  </div>
                  <i
                    className={`fa-solid fa-caret-down text-[10px] text-white/40 transition-transform ${isAccountMenuOpen ? 'rotate-180' : ''}`}
                  ></i>
                </button>

                {isAccountMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-48 rounded-2xl border border-slate-100 bg-white py-2 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]">
                    <button className="flex w-full items-center gap-3 px-4 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50">
                      <i className="fa-solid fa-user-circle w-4 text-center"></i>
                      <span>Thông tin cá nhân</span>
                    </button>
                    <div className="mx-4 my-1 h-px bg-slate-100"></div>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 px-4 py-2 text-[11px] font-black uppercase text-rose-500 transition hover:bg-rose-50"
                    >
                      <i className="fa-solid fa-right-from-bracket w-4 text-center"></i>
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </nav>
        </div>
      </header>

      {/* SUB NAVBAR - Modern pill-based */}
      <div className="bg-white border-b border-gray-200 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] flex items-center px-4 py-3 gap-4 overflow-x-auto overflow-y-visible scrollbar-hide shrink-0 whitespace-nowrap">
        {/* Navbar Brand / Selector */}
        <div className="relative flex items-center group shrink-0">
          <button className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200/60 bg-white hover:bg-gray-50 hover:border-primary/30 transition-all duration-300 shadow-sm min-w-[200px]">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-lg shadow-inner">
                <i className="fa-solid fa-building"></i>
              </div>
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold ring-2 ring-white">
                2
              </div>
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-none">
                Đang quản lý
              </span>
              <span className="text-[14px] font-extrabold text-gray-900 mt-0.5">
                K-Map House
              </span>
            </div>
            <div className="ml-auto w-5 h-5 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:text-primary transition-colors">
              <i className="fa-solid fa-chevron-down text-[10px]"></i>
            </div>
          </button>
          <button className="absolute -right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-primary text-white rounded-lg flex items-center justify-center shadow-lg shadow-primary/30 hover:scale-110 hover:bg-primary-dark transition-all z-10 border-2 border-white">
            <i className="fa-solid fa-plus text-[12px]"></i>
          </button>
        </div>

        <div className="h-6 w-px bg-gray-200 shrink-0"></div>

        {/* Modules Menu */}
        <div className="flex items-center gap-1 bg-gray-100/60 p-1 rounded-2xl border border-gray-200/40 shadow-inner">
          {[
            { id: 'rooms', icon: 'fa-house-chimney-window', label: 'Phòng' },
            { id: 'invoices', icon: 'fa-file-invoice-dollar', label: 'Hóa đơn' },
            { id: 'contracts', icon: 'fa-file-contract', label: 'Hợp đồng' },
            { id: 'assets', icon: 'fa-couch', label: 'Tài sản' },
            { id: 'tenants', icon: 'fa-users', label: 'Khách thuê' }
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => {
                  playClick()
                  requestActiveTab(tab.id as AppTab)
                }}
                className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] transition-all duration-300 ${isActive
                  ? 'bg-white text-primary shadow-sm font-bold border border-gray-200/50'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-white/50 font-medium'
                  }`}
              >
                <i
                  className={`fa-solid ${tab.icon} text-[14px] ${isActive ? 'text-primary' : 'text-gray-400'} transition-colors`}
                ></i>
                <span>{tab.label}</span>
              </button>
            )
          })}
          <div className="relative shrink-0" ref={reportMenuRef}>
            <button
              ref={reportButtonRef}
              type="button"
              onClick={() => {
                playClick()
                setIsReportMenuOpen((prev) => !prev)
              }}
              className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] transition-all duration-300 ${activeTab === 'reports'
                ? 'bg-white text-primary shadow-sm font-bold border border-gray-200/50'
                : 'text-gray-500 hover:text-gray-900 hover:bg-white/50 font-medium'
                }`}
            >
              <i
                className={`fa-solid fa-chart-pie text-[14px] ${activeTab === 'reports' ? 'text-primary' : 'text-gray-400'} transition-colors`}
              ></i>
              <span>Báo cáo</span>
              <i
                className={`fa-solid fa-chevron-down text-[9px] transition-transform ${isReportMenuOpen ? 'rotate-180' : ''}`}
              ></i>
            </button>
          </div>
        </div>
      </div>
      {isReportMenuOpen && (
        <div
          ref={reportDropdownRef}
          className="fixed z-[70] min-w-[220px] rounded-2xl border border-slate-100 bg-white p-2 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]"
          style={{ top: reportMenuPosition.top, left: reportMenuPosition.left }}
        >
          {[
            { id: 'cashflow' as const, icon: 'fa-wallet', label: 'Thu / Chi' },
            { id: 'finance' as const, icon: 'fa-money-bill-trend-up', label: 'Báo cáo kinh doanh' }
          ].map((item) => {
            const isActive = activeTab === 'reports' && reportSubTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  playClick()
                  setReportSubTab(item.id)
                  requestActiveTab('reports')
                  setIsReportMenuOpen(false)
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive
                  ? 'bg-primary/10 text-primary font-bold'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <i className={`fa-solid ${item.icon} w-4 text-center`}></i>
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* MAIN SCROLLABLE CONTENT */}
      {activeTab === 'rooms' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {dueRoomsCount > 0 && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-[fadeIn_0.3s_ease-out]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500">
                  <i className="fa-solid fa-bell animate-[swing_0.5s_ease-out]"></i>
                </div>
                <div>
                  <strong className="font-bold">Đến kỳ lập hóa đơn!</strong>
                  <span className="block text-xs mt-0.5 opacity-90">
                    Có {dueRoomsCount} phòng cần lập hóa đơn của tháng {currentMonth}/{currentYear}.
                  </span>
                </div>
              </div>
            </div>
          )}
          {/* SUMMARY WIDGETS (Removed per user request) */}

          {/* MAIN TABLE WHITE BOX */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 flex flex-col overflow-hidden">
            {/* Table Header Area */}
            <div className="p-5 border-b border-gray-100/60 flex items-center justify-between bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/5 text-primary flex items-center justify-center text-2xl shadow-sm border border-primary/10">
                  <i className="fa-solid fa-house"></i>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Danh sách phòng</h2>
                  <p className="text-sm text-gray-500">
                    Hệ thống đang quản lý <span className="font-bold text-gray-700">{rooms.length}</span> phòng tại{' '}
                    <span className="font-bold text-primary">K-Map House</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsAddRoomOpen(true)}
                  className="px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark shadow-lg shadow-primary/20 flex items-center gap-2 transition-all active:scale-95"
                >
                  <i className="fa-solid fa-plus text-xs"></i>
                  <span>Thêm phòng</span>
                </button>
                <button className="px-5 h-11 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 shadow-sm flex items-center gap-2 transition-all active:scale-95">
                  <i className="fa-solid fa-file-excel text-green-600"></i>
                  <span>Xuất Excel</span>
                </button>
              </div>
            </div>

            {/* Filter Area */}
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/30 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-1 -mb-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-500">
                  <i className="fa-solid fa-filter text-xs"></i>
                  <span className="text-xs font-bold font-heading">{rooms.length}</span>
                </div>

                <button
                  type="button"
                  onClick={resetRoomFilters}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${isAllRoomFilter
                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-primary/30 hover:text-primary'}`}
                >
                  Tất cả
                </button>

                {[
                  { id: 'occupied' as const, label: 'Đang ở', count: counts.occupied, color: 'primary' },
                  { id: 'vacant' as const, label: 'Đang trống', count: counts.vacant, color: 'gray' },
                  { id: 'ending' as const, label: 'Sắp trả', count: counts.ending, color: 'red' },
                  { id: 'expiring' as const, label: 'Hết hạn', count: counts.expiring, color: 'blue' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => toggleFilter(f.id)}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all border whitespace-nowrap ${filters[f.id]
                      ? `bg-${f.color}-50 border-${f.id === 'occupied' ? 'primary' : f.color + '-500'}/30 text-${f.id === 'occupied' ? 'primary' : f.color + '-600'}`
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full bg-${f.id === 'occupied' ? 'primary' : f.color + '-500'}`}></div>
                    <span>{f.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${filters[f.id] ? `bg-${f.id === 'occupied' ? 'primary' : f.color + '-500'} text-white` : 'bg-gray-100 text-gray-400'}`}>
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="relative w-full max-w-[300px]">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                  <i className="fa-solid fa-magnifying-glass text-xs"></i>
                </div>
                <input
                  type="text"
                  placeholder="Tìm kiếm số phòng..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-gray-200/80 text-gray-900 text-sm rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary block pl-10 p-2.5 transition-all outline-none placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Table content */}
            <div className="overflow-x-auto overflow-y-hidden min-h-[500px]">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="text-[11px] text-gray-500 bg-gray-50/50 uppercase tracking-wider font-bold border-b border-gray-100">
                  <tr>
                    <th
                      rowSpan={2}
                      className="px-4 py-4 border-r border-gray-100 bg-gray-50/30 z-20 sticky left-0 text-gray-400"
                    >
                      <i className="fa-solid fa-bars-staggered"></i>
                    </th>
                    <th
                      rowSpan={2}
                      className="px-4 py-4 border-r border-gray-100 bg-gray-50/30 z-20 sticky left-10"
                    >
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-door-open text-primary/60"></i>
                        <span>Tên phòng</span>
                      </div>
                    </th>
                    <th rowSpan={2} className="px-4 py-4 border-r border-gray-100">
                      <i className="fa-solid fa-tag mr-1.5 text-green-500/70"></i> Giá thuê
                    </th>
                    <th rowSpan={2} className="px-4 py-4 border-r border-gray-100">
                      <i className="fa-solid fa-bolt mr-1.5 text-yellow-500/70"></i> Phí dịch vụ
                    </th>
                    <th rowSpan={2} className="px-4 py-4 border-r border-gray-100">
                      <i className="fa-solid fa-shield-halved mr-1.5 text-blue-400/70"></i> Tiền cọc
                    </th>
                    <th rowSpan={2} className="px-4 py-4 border-r border-gray-100">
                      <i className="fa-solid fa-triangle-exclamation mr-1.5 text-red-400/70"></i> Nợ cũ
                    </th>
                    <th rowSpan={2} className="px-4 py-4 border-r border-gray-100">
                      <i className="fa-solid fa-users mr-1.5 text-teal-500/70"></i> Khách thuê
                    </th>
                    <th rowSpan={2} className="px-4 py-4 border-r border-gray-100">
                      <i className="fa-solid fa-calendar-check mr-1.5 text-orange-400/70"></i> Ngày vào
                    </th>
                    <th rowSpan={2} className="px-4 py-4 text-center border-r border-gray-100">
                      Tình trạng
                    </th>
                    <th rowSpan={2} className="px-4 py-4 text-center border-r border-gray-100">
                      Tài chính
                    </th>
                    <th rowSpan={2} className="px-4 py-4 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={12} className="text-center py-10 text-gray-400">
                        Đang tải danh sách phòng...
                      </td>
                    </tr>
                  ) : (
                    filteredRooms.map((origRoom) => {
                      const room = { ...origRoom, ...(pendingRoomUpdates[origRoom.id] || {}) }
                      const zone = serviceZones.find((z) => z.id === room.service_zone_id) || {
                        name: 'Chưa có',
                        electric_price: 0,
                        water_price: 0,
                        internet_price: 0,
                        cleaning_price: 0
                      }
                      const activeContract = contracts.find(
                        (c) => c.room_id === room.id && c.status === 'active'
                      )
                      const roomInvoices = invoices.filter(
                        (i) =>
                          i.room_id === room.id &&
                          i.payment_status !== 'cancelled' &&
                          i.payment_status !== 'merged'
                      )
                      const roomMoveInReceipts = moveInReceipts.filter((r) => r.room_id === room.id)
                      const checkInvoices = invoices.filter(
                        (i) =>
                          i.room_id === room.id &&
                          (!activeContract?.tenant_id || i.tenant_id === activeContract.tenant_id) &&
                          new Date(
                            i.created_at || i.invoice_date || activeContract?.created_at || Date.now()
                          ).getTime() >=
                          new Date(
                            activeContract?.created_at || activeContract?.move_in_date || Date.now()
                          ).getTime()
                      )
                      const endingOutstandingInvoice = checkInvoices
                        .filter(
                          (i) =>
                            i.payment_status !== 'cancelled' &&
                            i.payment_status !== 'merged' &&
                            (i.payment_status === 'unpaid' || i.payment_status === 'partial')
                        )
                        .sort((a, b) => {
                          if (!!a.is_first_month !== !!b.is_first_month) return a.is_first_month ? -1 : 1
                          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        })[0] || null
                      const unpaidFirstMonthForCurrentTenant = checkInvoices.find(
                        (i) =>
                          i.is_first_month &&
                          i.payment_status === 'unpaid' &&
                          (i.paid_amount || 0) === 0
                      )
                      const canCancel =
                        activeContract &&
                        !checkInvoices.some(
                          (i) =>
                            i.payment_status === 'paid' ||
                            i.payment_status === 'partial' ||
                            i.paid_amount > 0
                        )
                      const canAbortUnpaidFirstMonthMenu =
                        !!activeContract && !!unpaidFirstMonthForCurrentTenant
                      const canDeleteRoom =
                        roomInvoices.length === 0 && roomMoveInReceipts.length === 0

                      const menuItemClass =
                        'w-full min-w-0 rounded-md px-3 py-2 text-left text-sm flex items-start gap-2 transition whitespace-normal leading-5'
                      const roomActionMenu = (
                        <div
                          className={`absolute right-0 w-[32rem] max-w-[calc(100vw-2rem)] max-h-[min(70vh,28rem)] overflow-y-auto bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50 animate-[fadeIn_0.15s_ease-out] ${menuPlacement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                        >
                          <div className="grid grid-cols-2 gap-2">
                            {room.status === 'vacant' ? (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setNewContractSeed(null)
                                    setNewContractRoom(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-green-50 text-green-700 font-bold`}
                                >
                                  <i className="fa-solid fa-file-signature w-4 text-green-600"></i> Lập hợp đồng
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditRoom(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-blue-50 text-blue-700 font-medium`}
                                >
                                  <i className="fa-solid fa-pen-to-square w-4 text-blue-500"></i>{' '}
                                  Sửa phòng
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setServiceZoneRoom(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-gray-50 text-gray-700 font-medium`}
                                >
                                  <i className="fa-solid fa-gear w-4 text-gray-500"></i> Cài đặt
                                  dịch vụ
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setAssetModuleInitialRoomId(room.id)
                                    requestActiveTab('assets')
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-gray-50 text-gray-700 font-medium`}
                                >
                                  <i className="fa-solid fa-list-check w-4 text-gray-500"></i> Thiết
                                  lập tài sản
                                </button>
                                {canDeleteRoom && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setRoomToDelete(room)
                                      setMenuOpenId(null)
                                    }}
                                    className={`${menuItemClass} hover:bg-red-50 text-red-700 font-medium`}
                                  >
                                    <i className="fa-solid fa-trash-can w-4 text-red-500"></i> Xóa
                                    phòng
                                  </button>
                                )}
                              </>
                            ) : room.status === 'ending' ? (
                              <>
                                {/* === MENU CHO PHÒNG "SẮP KẾT THÚC" === */}
                                {endingOutstandingInvoice && (
                                  <>
                                    <div className="col-span-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex gap-2 text-xs text-amber-800">
                                      <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 shrink-0"></i>
                                      <span>
                                        <strong>Phòng này còn hóa đơn chưa thu.</strong> Cần thu xong
                                        trước khi xác nhận trả phòng.
                                      </span>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPaymentInvoice(endingOutstandingInvoice)
                                        setMenuOpenId(null)
                                      }}
                                      className={`${menuItemClass} hover:bg-emerald-50 text-emerald-600 font-bold col-span-2`}
                                    >
                                      <i className="fa-solid fa-money-bill-wave w-4"></i> Thu tiền
                                      hóa đơn còn nợ
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDetailRoom(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-teal-50 text-teal-600 font-medium`}
                                >
                                  <i className="fa-solid fa-sliders w-4"></i> Quản lý phòng
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    updateRoom(room.id, {
                                      status: 'occupied',
                                      expected_end_date: undefined
                                    } as any).then(() => {
                                      playSuccess()
                                      queryClient.invalidateQueries({ queryKey: ['rooms'] })
                                    })
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-orange-50 text-orange-600 font-medium`}
                                >
                                  <i className="fa-solid fa-rotate-left w-4 text-orange-500"></i>{' '}
                                  Hủy báo kết thúc
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setTerminateRoom(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-red-50 text-red-500 font-bold`}
                                >
                                  <i className="fa-solid fa-door-closed w-4 text-red-400"></i> Xác
                                  nhận trả phòng
                                </button>
                                {canCancel && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setCancelContractRoom(room)
                                      setMenuOpenId(null)
                                    }}
                                    className={`${menuItemClass} hover:bg-red-50 text-red-500 font-semibold`}
                                  >
                                    <i className="fa-solid fa-ban w-4 text-red-400"></i> Hủy hợp
                                    đồng
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-red-50 text-red-400 font-medium col-span-2 text-center justify-center`}
                                >
                                  <i className="fa-solid fa-circle-xmark w-4 text-red-400 mx-0 mt-0.5"></i>{' '}
                                  Đóng menu
                                </button>
                              </>
                            ) : (canCancel || canAbortUnpaidFirstMonthMenu) ? (
                              <>
                                {/* === MENU KHI CHƯA THANH TOÁN HÓA ĐƠN ĐẦU === */}
                                <div className="col-span-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex gap-2 text-xs text-amber-800">
                                  <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 shrink-0"></i>
                                  <span>
                                    <strong>Hóa đơn chưa được thanh toán.</strong> Thu tiền trước,
                                    sau đó mới có thể thực hiện các thao tác khác. Hoặc hủy hợp đồng
                                    nếu nhập nhầm.
                                  </span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openInvoiceFlow(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-blue-50 text-blue-600 font-bold`}
                                >
                                  <i className="fa-solid fa-money-bill-wave w-4"></i> Thu tiền hóa
                                  đơn
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setCancelContractRoom(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-red-50 text-red-500 font-semibold`}
                                >
                                  <i className="fa-solid fa-ban w-4 text-red-400"></i> Hủy hợp đồng
                                </button>
                                {canDeleteRoom && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setRoomToDelete(room)
                                      setMenuOpenId(null)
                                    }}
                                    className={`${menuItemClass} hover:bg-red-50 text-red-700 font-medium col-span-2`}
                                  >
                                    <i className="fa-solid fa-trash-can w-4 text-red-500"></i> Xóa
                                    phòng
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-red-50 text-red-400 font-medium col-span-2 text-center justify-center`}
                                >
                                  <i className="fa-solid fa-circle-xmark w-4 text-red-400 mx-0 mt-0.5"></i>{' '}
                                  Đóng menu
                                </button>
                              </>
                            ) : (
                              <>
                                {/* === MENU ĐẦY ĐỦ CHO PHÒNG "ĐANG Ở" === */}
                                {/* Hàng 1 */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openInvoiceFlow(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-blue-50 text-blue-600 font-bold`}
                                >
                                  <i className="fa-solid fa-file-invoice-dollar w-4"></i> Lập hóa
                                  đơn
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openInvoiceFlow(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-emerald-50 text-emerald-600 font-bold`}
                                >
                                  <i className="fa-solid fa-money-bill-wave w-4"></i> Thu tiền hàng
                                  tháng
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDetailRoom(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-teal-50 text-teal-600 font-medium`}
                                >
                                  <i className="fa-solid fa-sliders w-4"></i> Quản lý phòng
                                </button>
                                {/* Hàng 2 */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setChangeTargetRoom(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-gray-50 text-gray-700 font-medium`}
                                >
                                  <i className="fa-solid fa-right-left w-4 text-gray-500"></i>{' '}
                                  Chuyển đổi phòng
                                </button>

                                {/* Hàng 3 */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEndNoticeRoom(room)
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-orange-50 text-orange-600 font-medium`}
                                >
                                  <i className="fa-solid fa-bell w-4 text-orange-500"></i> Báo kết
                                  thúc hợp đồng phòng
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setAssetModuleInitialRoomId(room.id)
                                    requestActiveTab('assets')
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-gray-50 text-gray-700 font-medium`}
                                >
                                  <i className="fa-solid fa-table-list w-4 text-gray-500"></i> Thiết
                                  lập tài sản
                                </button>
                                {canDeleteRoom && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setRoomToDelete(room)
                                      setMenuOpenId(null)
                                    }}
                                    className={`${menuItemClass} hover:bg-red-50 text-red-700 font-medium col-span-2`}
                                  >
                                    <i className="fa-solid fa-trash-can w-4 text-red-500"></i> Xóa
                                    phòng
                                  </button>
                                )}
                                {/* Fallback: phòng occupied nhưng không có hợp đồng formal */}
                                {!activeContract && room.status === 'occupied' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setMenuOpenId(null)
                                      if (window.confirm('Xác nhận đánh dấu phòng này về trạng thái trống?\n\nThao tác này sẽ xóa thông tin tenant và reset phòng về "Đang trống".')) {
                                        updateRoom(room.id, {
                                          status: 'vacant',
                                          tenant_name: undefined,
                                          tenant_phone: undefined,
                                          tenant_email: undefined,
                                          tenant_id_card: undefined,
                                          move_in_date: undefined,
                                          contract_expiration: undefined,
                                        } as any).then(() => {
                                          queryClient.invalidateQueries({ queryKey: ['rooms'] })
                                        })
                                      }
                                    }}
                                    className={`${menuItemClass} hover:bg-amber-50 text-amber-700 font-semibold col-span-2 border border-amber-200 rounded-lg mt-1`}
                                  >
                                    <i className="fa-solid fa-person-walking-arrow-right w-4 text-amber-600"></i>{' '}
                                    Đánh dấu đã chuyển đi (không có HĐ)
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setMenuOpenId(null)
                                  }}
                                  className={`${menuItemClass} hover:bg-red-50 text-red-400 font-medium col-span-2 text-center justify-center mt-2`}
                                >
                                  <i className="fa-solid fa-circle-xmark w-4 text-red-400 mx-0 mt-0.5"></i>{' '}
                                  Đóng menu
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )

                      return (
                        <tr
                          key={room.id}
                          className="bg-white border-b border-gray-100 hover:bg-gray-50 transition cursor-default group relative"
                        >
                          <td className="px-4 py-3 text-center text-gray-400">
                            <i className="fa-solid fa-bars"></i>
                          </td>
                          <td className="px-4 py-3 font-bold flex items-center gap-2 text-gray-800">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white shrink-0 shadow-sm transition-transform hover:scale-110 duration-300 ${room.status === 'vacant' ? 'bg-orange-500' : room.status === 'occupied' ? 'bg-gradient-to-tr from-emerald-500 to-green-400 shadow-emerald-200' : room.status === 'ending' ? 'bg-gradient-to-tr from-yellow-500 to-orange-500' : 'bg-yellow-500'}`}
                            >
                              <i className="fa-solid fa-door-open"></i>
                            </div>
                            <span className="block truncate py-1">{room.name}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="px-2 py-1 font-bold text-gray-800 tabular-nums">
                              {formatVND(room.base_rent)} đ
                            </div>
                            {room.status === 'occupied' &&
                              (() => {
                                const contract = contracts.find(
                                  (c) => c.room_id === room.id && c.status === 'active'
                                )
                                if (!contract) return null
                                const paidRentInvoices = invoices.filter(
                                  (i) => i.room_id === room.id && i.paid_amount > 0
                                )

                                return (
                                  <div className="text-[10px] mt-0.5 flex flex-col items-start leading-tight">
                                    {paidRentInvoices.length === 0 && (
                                      <span className="text-red-500 font-medium whitespace-nowrap">
                                        Chưa thu lần nào
                                      </span>
                                    )}
                                  </div>
                                )
                              })()}
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              // Bảng màu cho mỗi vùng
                              const zoneColors = [
                                {
                                  bg: 'bg-emerald-100',
                                  text: 'text-emerald-700',
                                  border: 'border-emerald-200',
                                  dot: 'bg-emerald-500',
                                  tooltipBg: 'bg-emerald-800',
                                  arrow: 'border-b-emerald-800'
                                },
                                {
                                  bg: 'bg-violet-100',
                                  text: 'text-violet-700',
                                  border: 'border-violet-200',
                                  dot: 'bg-violet-500',
                                  tooltipBg: 'bg-violet-800',
                                  arrow: 'border-b-violet-800'
                                },
                                {
                                  bg: 'bg-amber-100',
                                  text: 'text-amber-700',
                                  border: 'border-amber-200',
                                  dot: 'bg-amber-500',
                                  tooltipBg: 'bg-amber-800',
                                  arrow: 'border-b-amber-800'
                                },
                                {
                                  bg: 'bg-sky-100',
                                  text: 'text-sky-700',
                                  border: 'border-sky-200',
                                  dot: 'bg-sky-500',
                                  tooltipBg: 'bg-sky-800',
                                  arrow: 'border-b-sky-800'
                                },
                                {
                                  bg: 'bg-rose-100',
                                  text: 'text-rose-700',
                                  border: 'border-rose-200',
                                  dot: 'bg-rose-500',
                                  tooltipBg: 'bg-rose-800',
                                  arrow: 'border-b-rose-800'
                                },
                                {
                                  bg: 'bg-teal-100',
                                  text: 'text-teal-700',
                                  border: 'border-teal-200',
                                  dot: 'bg-teal-500',
                                  tooltipBg: 'bg-teal-800',
                                  arrow: 'border-b-teal-800'
                                }
                              ]
                              const zoneIndex = serviceZones.findIndex(
                                (z) => z.id === (zone as any)?.id
                              )
                              const color =
                                zoneColors[zoneIndex >= 0 ? zoneIndex % zoneColors.length : 0]
                              const fixedTotal =
                                (zone.internet_price || 0) + (zone.cleaning_price || 0)

                              return (
                                <div className="relative group/tooltip inline-block cursor-help">
                                  <div
                                    className={`${color.bg} ${color.text} font-bold text-xs px-2.5 py-1.5 rounded-md border ${color.border} flex items-center gap-2`}
                                  >
                                    <span
                                      className={`w-2 h-2 rounded-full ${color.dot} shrink-0`}
                                    ></span>
                                    <span className="tabular-nums">{formatVND(fixedTotal)} đ</span>
                                  </div>
                                  {/* Tooltip Content */}
                                  <div
                                    className={`absolute left-1/2 -translate-x-1/2 top-full mt-2 w-52 ${color.tooltipBg} text-white rounded-lg shadow-xl p-3 text-xs opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50`}
                                  >
                                    <div className="font-bold text-sm mb-2 pb-1.5 border-b border-white/20 text-center">
                                      {zone.name}
                                    </div>
                                    <div className="space-y-1.5">
                                      <div className="flex justify-between">
                                        <span>
                                          <i className="fa-solid fa-bolt text-yellow-400 w-4"></i>{' '}
                                          Điện:
                                        </span>{' '}
                                        <span className="font-semibold tabular-nums">
                                          {formatVND(zone.electric_price)} đ/kWh
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>
                                          <i className="fa-solid fa-droplet text-blue-300 w-4"></i>{' '}
                                          Nước:
                                        </span>{' '}
                                        <span className="font-semibold tabular-nums">
                                          {formatVND(zone.water_price)} đ/m³
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>
                                          <i className="fa-solid fa-wifi text-green-300 w-4"></i>{' '}
                                          Nét:
                                        </span>{' '}
                                        <span className="font-semibold tabular-nums">
                                          {formatVND(zone.internet_price)} đ/ph
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>
                                          <i className="fa-solid fa-broom text-gray-300 w-4"></i>{' '}
                                          Rác:
                                        </span>{' '}
                                        <span className="font-semibold tabular-nums">
                                          {formatVND(zone.cleaning_price)} đ/ph
                                        </span>
                                      </div>
                                    </div>
                                    <div className="mt-2 pt-1.5 border-t border-white/20 flex justify-between font-bold text-sm">
                                      <span>Cố định:</span>
                                      <span className="tabular-nums">
                                        {formatVND(fixedTotal)} đ/th
                                      </span>
                                    </div>
                                    {/* Arrow pointing up */}
                                    <div
                                      className={`absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent ${color.arrow}`}
                                    ></div>
                                  </div>
                                </div>
                              )
                            })()}
                          </td>

                          <td className="px-4 py-3">
                            {(() => {
                              // Chỉ tính tiền cọc khi phòng đang có người ở
                              if (room.status === 'vacant') {
                                return <span className="text-gray-300 text-xs">—</span>
                              }
                              const receipt = moveInReceipts.find(
                                (r) =>
                                  r.room_id === room.id &&
                                  r.payment_status === 'paid' &&
                                  (!activeContract?.move_in_date ||
                                    r.move_in_date === activeContract.move_in_date)
                              )
                              const currentTenantInvoices = invoices.filter(
                                (i) =>
                                  i.room_id === room.id &&
                                  i.payment_status !== 'cancelled' &&
                                  (!activeContract?.tenant_id ||
                                    i.tenant_id === activeContract.tenant_id)
                              )
                              const depositCollected =
                                Boolean(receipt) ||
                                currentTenantInvoices.some(
                                  (i) =>
                                    (i.payment_status === 'paid' ||
                                      i.payment_status === 'partial') &&
                                    (i.deposit_amount || 0) > 0 &&
                                    i.paid_amount > 0
                                )
                              if (depositCollected) {
                                return (
                                  <div>
                                    <div className="font-bold text-gray-800">
                                      {formatVND(
                                        activeContract?.deposit_amount || room.default_deposit || 0
                                      )}{' '}
                                      đ
                                    </div>
                                    <div className="flex items-center gap-1 mt-0.5 text-[10px] font-bold text-emerald-600">
                                      <i className="fa-solid fa-lock"></i> Đã thu
                                    </div>
                                  </div>
                                )
                              }
                              return (
                                <div>
                                  <EditableCell
                                    value={room.default_deposit || 0}
                                    displayValue={`${formatVND(room.default_deposit || 0)} đ`}
                                    type="number"
                                    className="font-bold text-gray-800"
                                    onSave={(v) =>
                                      handleQueueChange(room.id, { default_deposit: Number(v) })
                                    }
                                  />
                                  {room.status === 'occupied' && (
                                    <div className="text-[10px] text-red-500 mt-0.5 leading-tight">
                                      <span className="italic whitespace-nowrap">
                                        (Chưa thu tiền cọc)
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {(() => {
                              // Nợ thuộc về tenant, không thuộc phòng.
                              // Phòng trống → không hiển thị nợ cũ.
                              if (room.status === 'vacant') {
                                return <span className="text-gray-300 text-xs">—</span>
                              }
                              const activeContract = contracts.find(
                                (c) => c.room_id === room.id && c.status === 'active'
                              )
                              const debt = invoices
                                .filter(
                                  (i) =>
                                    i.room_id === room.id &&
                                    i.payment_status !== 'paid' &&
                                    i.payment_status !== 'cancelled' &&
                                    (!activeContract?.tenant_id ||
                                      i.tenant_id === activeContract.tenant_id)
                                )
                                .reduce(
                                  (sum, i) => sum + Math.max(0, i.total_amount - i.paid_amount),
                                  0
                                )
                              return debt > 0 ? (
                                <span className="text-red-500">{formatVND(debt)} đ</span>
                              ) : (
                                <span className="text-gray-400">0 đ</span>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            <EditableCell
                              value={room.max_occupants || 2}
                              type="select"
                              options={[
                                { value: '0', label: '0 người' },
                                { value: '1', label: '1 người' },
                                { value: '2', label: '2 người' },
                                { value: '3', label: '3 người' },
                                { value: '4', label: '4 người' },
                                { value: '5', label: '5 người' },
                                { value: '6', label: '6 người' }
                              ]}
                              displayValue={`${room.max_occupants || 2} người`}
                              onSave={(v) =>
                                handleQueueChange(room.id, { max_occupants: Number(v) })
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-sm">
                            {(() => {
                              if (room.status === 'vacant') {
                                return <span className="text-gray-400 italic text-xs">Chưa có</span>
                              }
                              const activeContract = contracts.find(
                                (c) => c.room_id === room.id && c.status === 'active'
                              )
                              const moveInDate = activeContract?.move_in_date || room.move_in_date

                              if (moveInDate) {
                                return (
                                  <span className="font-medium">
                                    {new Date(moveInDate).toLocaleDateString('vi-VN', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric'
                                    })}
                                  </span>
                                )
                              }
                              return <span className="text-gray-400 italic text-xs">Chưa có</span>
                            })()}
                          </td>
                          <td
                            className="px-4 py-3 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div>
                              <span
                                title="Trang thai duoc cap nhat theo luong nghiep vu, khong cho sua tay tai danh sach."
                                className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md uppercase font-bold tracking-wide ${room.status === 'vacant'
                                  ? 'bg-orange-500'
                                  : room.status === 'occupied'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-[0_4px_14px_-8px_rgba(16,185,129,0.75)]'
                                    : room.status === 'ending'
                                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white shadow-md shadow-orange-300/30'
                                      : 'bg-yellow-500 text-white'
                                  }`}
                              >
                                {room.status === 'occupied' && (
                                  <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping"></span>
                                    <span className="absolute inline-flex h-2 w-2 rounded-full bg-emerald-300 opacity-80 animate-pulse"></span>
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600 shadow-[0_0_0_2px_rgba(16,185,129,0.18),0_0_10px_rgba(16,185,129,0.65)]"></span>
                                  </span>
                                )}
                                {room.status === 'ending' && (
                                  <i className="fa-solid fa-bell text-[9px]"></i>
                                )}
                                {room.status === 'vacant'
                                  ? 'Đang trống'
                                  : room.status === 'occupied'
                                    ? 'Đang ở'
                                    : room.status === 'ending'
                                      ? 'Sắp chuyển phòng'
                                      : 'Bảo trì'}
                              </span>
                              {room.status === 'ending' &&
                                room.expected_end_date &&
                                (() => {
                                  const daysLeft = Math.ceil(
                                    (new Date(room.expected_end_date).getTime() -
                                      new Date().getTime()) /
                                    (1000 * 60 * 60 * 24)
                                  )
                                  const dateStr = new Date(
                                    room.expected_end_date
                                  ).toLocaleDateString('vi-VN', {
                                    day: '2-digit',
                                    month: '2-digit'
                                  })
                                  return (
                                    <div
                                      className={`text-[10px] font-semibold mt-0.5 ${daysLeft <= 3 ? 'text-red-500' : 'text-orange-500'}`}
                                    >
                                      Còn {daysLeft} ngày ({dateStr})
                                    </div>
                                  )
                                })()}
                            </div>
                          </td>
                          {(() => {
                            const today = new Date()
                            const currentMonth = today.getMonth() + 1
                            const currentYear = today.getFullYear()
                            const hasActiveContract = contracts.find(
                              (c) => c.room_id === room.id && c.status === 'active'
                            )
                            const roomMonthInvoices = invoices
                              .filter(
                                (i) =>
                                  i.room_id === room.id &&
                                  i.month === currentMonth &&
                                  i.year === currentYear &&
                                  i.payment_status !== 'cancelled' &&
                                  i.payment_status !== 'merged' &&
                                  !i.is_settlement &&
                                  (!hasActiveContract?.tenant_id ||
                                    i.tenant_id === hasActiveContract.tenant_id)
                              )
                              .sort(
                                (a, b) =>
                                  new Date(b.created_at).getTime() -
                                  new Date(a.created_at).getTime()
                              )

                            const currentTenantInvoices = invoices
                              .filter(
                                (i) =>
                                  i.room_id === room.id &&
                                  i.payment_status !== 'cancelled' &&
                                  i.payment_status !== 'merged' &&
                                  (!hasActiveContract?.tenant_id ||
                                    i.tenant_id === hasActiveContract.tenant_id)
                              )
                              .sort(
                                (a, b) =>
                                  new Date(b.created_at).getTime() -
                                  new Date(a.created_at).getTime()
                              )

                            const unpaidFirstMonthInvoice = currentTenantInvoices.find(
                              (i) =>
                                i.is_first_month &&
                                (i.payment_status === 'unpaid' || i.payment_status === 'partial')
                            )

                            const roomInvoice =
                              unpaidFirstMonthInvoice ||
                              roomMonthInvoices.find(
                                (i) =>
                                  i.is_first_month &&
                                  (i.payment_status === 'unpaid' || i.payment_status === 'partial')
                              ) ||
                              roomMonthInvoices.find(
                                (i) =>
                                  i.payment_status === 'unpaid' || i.payment_status === 'partial'
                              ) ||
                              roomMonthInvoices.find((i) => i.payment_status === 'paid') ||
                              null

                            // Tính ngày đầu tháng sau
                            const nextMonthFirst = new Date(currentYear, currentMonth, 1)
                            const daysUntilNext = Math.ceil(
                              (nextMonthFirst.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                            )

                            // Helper: phòng mới = có contract active nhưng chưa từng trả tiền lần nào
                            const firstMonthInvoice = currentTenantInvoices.find(
                              (i) => i.is_first_month
                            )
                            const isNewContract = !!hasActiveContract && !firstMonthInvoice
                            const hasReceivedAssets = !!roomAssetWorkflow[room.id]?.hasMoveIn

                            const btnNewContract = (
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openInvoiceFlow(room)
                                  }}
                                  className="bg-red-500 hover:bg-red-600 text-white text-[10px] px-2 py-1 rounded font-bold block w-full transition"
                                >
                                  <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                                  Cần lập HĐ đầu tiên
                                </button>
                              </td>
                            )

                            const btnReceiveRoom = (
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setAssetModuleInitialRoomId(room.id)
                                    setAssetModuleGuideMode('move_in')
                                    requestActiveTab('assets')
                                  }}
                                  className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-2 py-1 rounded font-bold block w-full transition"
                                >
                                  <i className="fa-solid fa-clipboard-check mr-1"></i>
                                  Cần nhận phòng
                                </button>
                              </td>
                            )

                            if (!roomInvoice || room.status === 'vacant') {
                              if (!room.move_in_date || room.status === 'vacant') {
                                return (
                                  <td className="px-4 py-3 text-center">
                                    <span className="text-gray-400 text-[10px] italic">—</span>
                                  </td>
                                )
                              }
                              // Phòng đang báo kết thúc → không hiện nút lập hóa đơn, chờ xác nhận trả phòng
                              if (room.status === 'ending') {
                                return (
                                  <td className="px-4 py-3 text-center">
                                    <span className="text-gray-400 text-[10px] italic bg-gray-100 px-2 py-1 rounded">
                                      <i className="fa-solid fa-clock mr-1"></i>Chờ trả phòng
                                    </span>
                                  </td>
                                )
                              }
                              if (isNewContract && !hasReceivedAssets) return btnReceiveRoom
                              if (isNewContract) {
                                return btnNewContract
                              }
                              return (
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openInvoiceFlow(room)
                                    }}
                                    className="bg-orange-100 hover:bg-orange-200 text-orange-600 text-[10px] px-2 py-1 rounded border border-orange-200 font-bold block w-full transition"
                                  >
                                    Có thể lập HĐ ngay
                                  </button>
                                </td>
                              )
                            }

                            if (hasActiveContract && room.status === 'occupied' && !hasReceivedAssets) {
                              return btnReceiveRoom
                            }

                            if (
                              roomInvoice.payment_status === 'unpaid' ||
                              roomInvoice.payment_status === 'partial'
                            ) {
                              if (room.status === 'ending') {
                                return (
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPaymentInvoice(roomInvoice)
                                      }}
                                      className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-2 py-1 rounded font-bold block w-full transition"
                                    >
                                      <i className="fa-solid fa-hand-holding-dollar mr-1"></i>
                                      Thu hóa đơn còn nợ
                                    </button>
                                  </td>
                                )
                              }
                              // Invoice tháng đầu tiên đã tạo nhưng chưa thu tiền
                              if (roomInvoice.is_first_month) {
                                return (
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openInvoiceFlow(room)
                                      }}
                                      className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-2 py-1 rounded font-bold block w-full transition"
                                    >
                                      <i className="fa-solid fa-hand-holding-dollar mr-1"></i>
                                      {roomInvoice.payment_status === 'partial'
                                        ? 'Tháng đầu còn nợ'
                                        : 'Chưa thu tiền tháng đầu'}
                                    </button>
                                  </td>
                                )
                              }
                              return (
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPaymentInvoice(roomInvoice)
                                    }}
                                    className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-2 py-1 rounded font-bold block w-full transition"
                                  >
                                    <i className="fa-solid fa-hand-holding-dollar mr-1"></i>
                                    {roomInvoice.payment_status === 'partial'
                                      ? `Còn nợ tháng ${roomInvoice.month}`
                                      : `Chưa thu tháng ${roomInvoice.month}`}
                                  </button>
                                </td>
                              )
                            }

                            // Đã thu (đủ hoặc thiếu)
                            return (
                              <td className="px-4 py-3 text-center">
                                {daysUntilNext > 0 ? (
                                  <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded border border-green-200 font-bold inline-flex items-center gap-1.5">
                                    Đã thu
                                    <span className="bg-green-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                                      Còn {daysUntilNext}d
                                    </span>
                                  </span>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openInvoiceFlow(room)
                                    }}
                                    className="bg-orange-100 hover:bg-orange-200 text-orange-600 text-[10px] px-2 py-1 rounded border border-orange-200 font-bold block w-full transition"
                                  >
                                    Có thể lập HĐ mới
                                  </button>
                                )}
                              </td>
                            )
                          })()}
                          <td className="px-4 py-3 text-center">
                            <div className="relative inline-block">
                              {menuOpenId === room.id && (
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={() => setMenuOpenId(null)}
                                />
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleRoomMenu(e, room.id)
                                }}
                                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-xs font-medium text-gray-600 shadow-sm relative z-10 flex items-center gap-1.5 transition"
                              >
                                Xem thêm <i className="fa-solid fa-chevron-down text-[9px]"></i>
                              </button>
                              {menuOpenId === room.id && roomActionMenu}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Removed Table Footer to save space as requested */}
          </div>
        </div>
      ) : activeTab === 'invoices' ? (
        <InvoicesTab />
      ) : activeTab === 'assets' ? (
        <AssetsTab
          initialRoomId={assetModuleInitialRoomId}
          onReceivePendingChange={handleAssetReceivePendingChange}
          guideMode={assetModuleGuideMode}
          guideRoomId={assetModuleInitialRoomId}
          onGuideHandled={() => setAssetModuleGuideMode(null)}
        />
      ) : activeTab === 'contracts' ? (
        <ContractsTab onCreateContract={(room) => setNewContractRoom(room)} />
      ) : activeTab === 'reports' ? (
        reportSubTab === 'cashflow' ? (
          <CashFlowTab />
        ) : (
          <BusinessReport />
        )
      ) : activeTab === 'tenants' ? (
        <TenantsTab />
      ) : activeTab === 'settings' ? (
        <SettingsTab currentUser={currentUser} initialTab={settingsInitialTab} />
      ) : null}

      {updateBanner && (
        <div className="fixed right-5 top-24 z-[80] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl shadow-slate-900/15">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <i className="fa-solid fa-cloud-arrow-down"></i>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-slate-900">
                Co ban cap nhat v{updateBanner.latestVersion}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                Ban co the cai dat ngay hoac de sau, app van hoat dong binh thuong.
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSettingsInitialTab('updates')
                    requestActiveTab('settings')
                  }}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary-dark"
                >
                  Cap nhat ngay
                </button>
                <button
                  type="button"
                  onClick={() => setUpdateBanner(null)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  De sau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedRoom && (
        <InvoiceModal
          room={selectedRoom}
          tenant={null} // Sau này fetch tenant
          onClose={() => setSelectedRoom(null)}
        />
      )}
      {serviceZoneRoom && (
        <RoomServiceZonePickerModal
          room={serviceZoneRoom}
          invoiceBlocked={(serviceZoneRoom as any)._invoiceBlockedReason === 'no_zone'}
          onAssigned={(updatedRoom) => {
            // Sau khi setup zone xong → tự mở InvoiceModal
            if ((serviceZoneRoom as any)._invoiceBlockedReason === 'no_zone') {
              setSelectedRoom(updatedRoom)
            }
          }}
          onClose={() => setServiceZoneRoom(null)}
        />
      )}
      {detailRoom && (
        <RoomDetailsModal
          room={detailRoom}
          zone={serviceZones.find((z) => z.id === detailRoom.service_zone_id) || null}
          zones={serviceZones}
          initialTab={detailRoomInitialTab}
          onClose={() => {
            setDetailRoom(null)
            setDetailRoomInitialTab('info')
          }}
          onOpenInvoice={(r) => {
            setDetailRoom(null)
            setDetailRoomInitialTab('info')
            openInvoiceFlow(r)
          }}
          onOpenFirstInvoice={(r) => {
            setDetailRoom(null)
            setDetailRoomInitialTab('info')
            openInvoiceFlow(r)
          }}
        />
      )}
      {newContractRoom && (
        <NewContractModal
          room={newContractRoom}
          zone={serviceZones.find((z) => z.id === newContractRoom.service_zone_id)}
          onClose={() => {
            setNewContractRoom(null)
            setNewContractSeed(null)
          }}
          lastInvoice={
            invoices
              .filter((i) => i.room_id === newContractRoom.id)
              .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))[0]
          }
          initialTenantId={newContractSeed?.tenantId}
          initialMoveInDate={newContractSeed?.moveInDate}
          onNavigateToTenants={() => {
            setNewContractRoom(null)
            setNewContractSeed(null)
            setActiveTab('tenants')
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('start-tour', { detail: 'create_tenant' }))
            }, 300)
          }}
          onNavigateToAssets={() => {
            const targetRoom = newContractRoom
            setNewContractRoom(null)
            setNewContractSeed(null)
            setAssetModuleInitialRoomId(targetRoom.id)
            setAssetModuleGuideMode('move_in')
            setActiveTab('assets')
          }}
        />
      )}
      {migrationContractRoom && (
        <NewContractModal
          room={migrationContractRoom}
          zone={serviceZones.find((z) => z.id === migrationContractRoom.service_zone_id)}
          onClose={() => setMigrationContractRoom(null)}
          lastInvoice={
            invoices
              .filter((i) => i.room_id === migrationContractRoom.id)
              .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))[0]
          }
          initialIsMigration={true}
        />
      )}
      {endNoticeRoom && (
        <EndContractNoticeModal room={endNoticeRoom} onClose={() => setEndNoticeRoom(null)} />
      )}
      {terminateRoom && (
        <TerminateContractModal
          room={terminateRoom}
          onClose={() => setTerminateRoom(null)}
          onNavigateToAssets={(room) => {
            setTerminateRoom(null)
            setAssetModuleInitialRoomId(room.id)
            setAssetModuleGuideMode('move_out')
            requestActiveTab('assets')
          }}
        />
      )}
      {cancelContractRoom && (
        <CancelContractModal
          room={cancelContractRoom}
          onClose={() => setCancelContractRoom(null)}
        />
      )}
      {Object.keys(pendingRoomUpdates).length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#e7f1f7] border-t border-blue-100 py-3 px-6 flex items-center justify-center gap-6 z-50 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.1)] animate-[slideUp_0.2s_ease-out]">
          <div className="text-[15px] font-bold text-gray-800 flex items-center">
            {saveError ? (
              <span className="text-red-600">{saveError}</span>
            ) : (
              <>
                Bạn có
                <span className="bg-emerald-600 text-white w-7 h-7 mx-2 rounded-full inline-flex items-center justify-center text-sm shadow-sm">
                  {Object.keys(pendingRoomUpdates).length}
                </span>
                mục thay đổi bạn có muốn lưu ?
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPendingRoomUpdates({})}
              disabled={isSaving}
              className="bg-[#da3b46] hover:bg-[#c82f39] disabled:opacity-50 text-white px-4 py-2 rounded text-[13px] font-semibold transition flex items-center gap-2 shadow-sm"
            >
              <i className="fa-solid fa-xmark text-lg leading-none"></i> Xóa tất cả thay đổi
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="bg-[#5cba47] hover:bg-[#4ba837] disabled:opacity-70 text-white px-5 py-2 rounded text-[13px] font-semibold transition flex items-center gap-2 shadow-sm min-w-[130px] justify-center"
            >
              {isSaving ? (
                <>
                  <i className="fa-solid fa-spinner animate-spin text-lg leading-none"></i> Đang
                  lưu...
                </>
              ) : (
                <>
                  <i className="fa-regular fa-floppy-disk text-lg leading-none"></i> Lưu thay đổi
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Toast thành công */}
      {saveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl animate-[fadeIn_0.2s_ease-out] min-w-[280px]">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <i className="fa-solid fa-check text-white text-sm"></i>
          </div>
          <div>
            <div className="font-bold text-sm">Đã lưu thành công!</div>
            <div className="text-gray-400 text-xs">Toàn bộ thay đổi đã được cập nhật.</div>
          </div>
        </div>
      )}

      {changeTargetRoom && (
        <ChangeRoomModal room={changeTargetRoom} onClose={() => setChangeTargetRoom(null)} />
      )}

      <TourOverlay />
    </div>
  )
}

export default App
