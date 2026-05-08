import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback } from 'react'
import {
  Home,
  FileText,
  Users,
  Settings as SettingsIcon,
  Bell,
  Box,
  ClipboardList,
  BarChart3
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
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
  getActiveContracts,
  getRoomMoveInReceipts,
  getAssetSnapshotsByRoomIds,
  getAppSettings,
  getCurrentSessionUser,
  isDepositOnlyInvoice,
  signOutUser,
  updateAppSettings,
  type Room,
  type ServiceZone,
  type Invoice,
  type AppUser
} from './lib/db'
import { playSuccess, playCreate, playDelete, playClick, playNotification } from './lib/sound'
import { EditableCell } from './components/EditableCell'
import { LogoLoading } from './components/LogoLoading'

import { LoginScreen } from './components/LoginScreen'
import { setupRealtime } from './lib/realtime'
import { buildInvoiceTransferDescription, normalizeTransferText } from './lib/invoiceTransfer'
import logoNavbar from './assets/an_khang_home_logo.png'

const InvoiceModal = lazy(() => import('./components/InvoiceModal').then((module) => ({ default: module.InvoiceModal })))
const RoomDetailsModal = lazy(() => import('./components/RoomDetailsModal').then((module) => ({ default: module.RoomDetailsModal })))
const PaymentModal = lazy(() => import('./components/PaymentModal').then((module) => ({ default: module.PaymentModal })))
const NewContractModal = lazy(() => import('./components/NewContractModal'))
const EndContractNoticeModal = lazy(() => import('./components/EndContractNoticeModal').then((module) => ({ default: module.EndContractNoticeModal })))
const TerminateContractModal = lazy(() => import('./components/TerminateContractModal').then((module) => ({ default: module.TerminateContractModal })))
const CancelContractModal = lazy(() => import('./components/CancelContractModal').then((module) => ({ default: module.CancelContractModal })))
const ChangeRoomModal = lazy(() => import('./components/ChangeRoomModal').then((module) => ({ default: module.ChangeRoomModal })))
const TourOverlay = lazy(() => import('./components/TourOverlay').then((module) => ({ default: module.TourOverlay })))
const ProfileModal = lazy(() => import('./components/ProfileModal').then((module) => ({ default: module.ProfileModal })))
const TenantsTab = lazy(() => import('./components/TenantsTab').then((module) => ({ default: module.TenantsTab })))
const InvoicesTab = lazy(() => import('./components/InvoicesTab').then((module) => ({ default: module.InvoicesTab })))
const AssetsTab = lazy(() => import('./components/AssetsTab').then((module) => ({ default: module.AssetsTab })))
const ContractsTab = lazy(() => import('./components/ContractsTab').then((module) => ({ default: module.ContractsTab })))
const SettingsTab = lazy(() => import('./components/SettingsTab').then((module) => ({ default: module.SettingsTab })))
const BusinessReport = lazy(() => import('./components/BusinessReport').then((module) => ({ default: module.BusinessReport })))

const TabLoading = () => (
  <LogoLoading className="flex-1 bg-gray-50" />
)
const isDev = import.meta.env.DEV
const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v)
const HANDOVER_IDS = ['__check_cleared', '__check_cleaned', '__check_keys']
const getHandoverSnapshotKey = (snap: { room_asset_id: string; note?: string }) =>
  snap.note || snap.room_asset_id
type AppTab = 'rooms' | 'invoices' | 'assets' | 'contracts' | 'tenants' | 'reports' | 'settings'
type PendingAssetReceive = { roomId: string; roomName: string }
type SettingsSection = 'general' | 'zones' | 'users' | 'updates'
type UpdateBannerInfo = {
  latestVersion?: string
  downloadUrl?: string | null
  status?: string
  message?: string
  progress?: number
}
type SepayBackgroundTransaction = {
  id: string
  amount_in: string
  transaction_content: string
  transaction_date?: string
  reference_number?: string
}
type SepayBackgroundFetchResult = {
  ok: boolean
  data?: {
    status?: number
    transactions?: SepayBackgroundTransaction[]
  }
}
type SepayBackgroundMatch = {
  invoice: Invoice
  roomName: string
  tenantName: string
  amount: number
  transactionId: string
  referenceNumber: string
}
const normalizeRoomName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN')

export const formatRoomName = (raw: string) => {
  const trimmed = raw.trim()
  // Strip mọi prefix "phong/phòng" dư thừa (kể cả thiếu dấu)
  const suffix = trimmed.replace(/^(ph[oò]ng\s+)+/i, '').trim()
  if (/^\d+$/.test(suffix)) return 'Phòng ' + suffix
  if (/^\d+$/.test(trimmed)) return 'Phòng ' + trimmed
  return trimmed
}

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

const ConfirmDeleteWithHistoryModal = ({
  room,
  onConfirm,
  onCancel,
  isDeleting = false
}: {
  room: Room
  onConfirm: () => void
  onCancel: () => void
  isDeleting?: boolean
}) => {
  return (
    <div
      className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-red-400" />

        <div className="p-6">
          {/* Icon + Title */}
          <div className="flex items-start gap-4 mb-5">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-xl shadow-sm border border-amber-200">
              <i className="fa-solid fa-clock-rotate-left" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 leading-tight mb-1">Phòng này còn dữ liệu lịch sử</h3>
              <p className="text-[13px] text-gray-500">
                Phòng <span className="font-semibold text-gray-700">{room.name}</span> còn hóa đơn, hợp đồng hoặc biên lai liên quan.
              </p>
            </div>
          </div>

          {/* Info box */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-5 flex gap-3">
            <i className="fa-solid fa-circle-info text-amber-500 mt-0.5 shrink-0" />
            <p className="text-[12.5px] text-amber-800 leading-relaxed">
              Toàn bộ dữ liệu liên quan <span className="font-semibold">(hóa đơn, hợp đồng, biên lai, tài sản, xe)</span> của phòng này sẽ bị xóa vĩnh viễn và không thể khôi phục.
            </p>
          </div>

          {/* Question */}
          <p className="text-sm font-medium text-gray-700 mb-5 text-center">
            Bạn có chắc chắn muốn tiếp tục xóa phòng này không?
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all active:scale-95"
            >
              Hủy bỏ
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-60 shadow-md shadow-orange-200 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <i className={isDeleting ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-trash-can"} />
              {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
            </button>
          </div>
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
  const { data: contracts = [], isFetched: isActiveContractsFetched } = useQuery({ queryKey: ['activeContracts'], queryFn: getActiveContracts })
  const { data: moveInReceipts = [] } = useQuery({
    queryKey: ['moveInReceipts'],
    queryFn: getRoomMoveInReceipts
  })
  const { data: appSettings = {} } = useQuery({
    queryKey: ['appSettings'],
    queryFn: getAppSettings
  })
  const roomIds = useMemo(() => rooms.map((room) => room.id), [rooms])
  const roomIdsKey = useMemo(() => roomIds.slice().sort().join('|'), [roomIds])
  const activeContractStartedAtByRoomId = useMemo(() => {
    const map = new Map<string, string>()
    for (const contract of contracts) {
      if (contract.status !== 'active') continue
      const current = map.get(contract.room_id)
      if (!current || new Date(contract.created_at).getTime() > new Date(current).getTime()) {
        map.set(contract.room_id, contract.created_at || contract.move_in_date)
      }
    }
    return map
  }, [contracts])
  const activeContractStartKey = useMemo(
    () =>
      Array.from(activeContractStartedAtByRoomId.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([roomId, startedAt]) => `${roomId}:${startedAt}`)
        .join('|'),
    [activeContractStartedAtByRoomId]
  )
  const { data: roomAssetWorkflow = {} } = useQuery<
    Record<string, { hasMoveIn: boolean; hasMoveOut: boolean; hasHandover: boolean }>
  >({
    queryKey: ['asset_snapshots', 'room_workflow', roomIdsKey, activeContractStartKey],
    enabled: rooms.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const snapshots = await getAssetSnapshotsByRoomIds(roomIds, ['move_in', 'move_out', 'handover'])
      const roomWorkflow: Record<string, { hasMoveIn: boolean; hasMoveOut: boolean; hasHandover: boolean }> = {}

      for (const roomId of roomIds) {
        roomWorkflow[roomId] = { hasMoveIn: false, hasMoveOut: false, hasHandover: false }
      }

      const handoverByRoom = new Map<string, Array<{ room_asset_id: string; note?: string; condition: string; deduction?: number }>>()
      for (const snap of snapshots) {
        const roomState = roomWorkflow[snap.room_id]
        if (!roomState) continue
        const contractStartedAt = activeContractStartedAtByRoomId.get(snap.room_id)
        if (
          contractStartedAt &&
          (snap.type === 'move_out' || snap.type === 'handover') &&
          snap.recorded_at < contractStartedAt
        ) {
          continue
        }
        if (snap.type === 'move_in') roomState.hasMoveIn = true
        if (snap.type === 'move_out') roomState.hasMoveOut = true
        if (snap.type === 'handover') {
          const list = handoverByRoom.get(snap.room_id) || []
          list.push(snap)
          handoverByRoom.set(snap.room_id, list)
        }
      }

      for (const [roomId, handover] of handoverByRoom.entries()) {
        roomWorkflow[roomId].hasHandover =
          handover.length > 0 &&
          HANDOVER_IDS.every((id) =>
            handover.some(
              (snap) =>
                getHandoverSnapshotKey(snap) === id &&
                (snap.condition === 'ok' || (snap.condition === 'not_done' && (snap.deduction || 0) > 0))
            )
          )
      }

      return roomWorkflow
    }
  })

  const [activeTab, setActiveTab] = useState<AppTab>('rooms')
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsSection>('general')
  const [reportSubTab, setReportSubTab] = useState<'cashflow' | 'finance'>('finance')
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
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number; bottom: number } | null>(null)
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
    if (!currentUser) return undefined
    const cleanup = setupRealtime(queryClient)
    return () => cleanup()
  }, [currentUser, queryClient])

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
  const [sepaySyncOpenSignal, setSepaySyncOpenSignal] = useState(0)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isReportMenuOpen, setIsReportMenuOpen] = useState(false)
  const [reportMenuPosition] = useState({ top: 0, left: 0 })
  const notificationMenuRef = React.useRef<HTMLDivElement | null>(null)
  const accountMenuRef = React.useRef<HTMLDivElement | null>(null)
  const reportDropdownRef = React.useRef<HTMLDivElement | null>(null)
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
  const handleSePaySyncSignalHandled = useCallback(() => {
    setSepaySyncOpenSignal(0)
  }, [])

  useEffect(() => {
    let mounted = true
    getCurrentSessionUser()
      .then((sessionUser) => {
        if (!mounted) return
        if (sessionUser) {
          setCurrentUser(sessionUser)
        }
        setAuthReady(true)
      })
      .catch((err) => {
        console.error('[Auth] getCurrentSessionUser failed:', err)
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
        downloadUrl: data.downloadUrl,
        status: 'available',
        message: `Có bản cập nhật v${data.latestVersion}. Hệ thống đang tự động cập nhật...`,
        progress: 0
      })
    })

    const removeStatus = window.api.update.onStatus((event) => {
      setUpdateBanner((current) => {
        const eventData = (event.data || {}) as Partial<UpdateBannerInfo> & { currentVersion?: string }
        return {
          latestVersion: eventData.latestVersion || current?.latestVersion || eventData.currentVersion,
          downloadUrl: eventData.downloadUrl || current?.downloadUrl || null,
          status: event.status,
          message: event.message,
          progress: current?.progress || 0
        }
      })
    })

    const removeProgress = window.api.update.onProgress((event) => {
      setUpdateBanner((current) => current ? { ...current, progress: event.percent } : current)
    })

    const autoInstallTimer = isDev ? null : window.setTimeout(() => {
      // Kiểm tra ngầm — chỉ hiện banner nếu có update thực sự hoặc lỗi
      void window.api.update.installLatest().then((result) => {
        if (!result.success) {
          setUpdateBanner({
            status: 'error',
            message: result.error || 'Không thể tự động cập nhật.',
            progress: 0
          })
        }
        // Nếu applied = true, onAvailable/onStatus/onProgress sẽ tự cập nhật banner
      })
    }, 2500)

    return () => {
      if (autoInstallTimer !== null) window.clearTimeout(autoInstallTimer)
      removeAvailable()
      removeStatus()
      removeProgress()
    }
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
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const handleLogout = async () => {
    await signOutUser()
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
  const [roomToDeleteWithHistory, setRoomToDeleteWithHistory] = useState<Room | null>(null)

  const openInvoiceFlow = (room: Room) => {
    // Guard 1: phòng phải có vùng dịch vụ hợp lệ trước khi lập hóa đơn
    const hasZone = room.service_zone_id && serviceZones.some((z) => z.id === room.service_zone_id)
    if (!hasZone) {
      setServiceZoneRoom({ ...room, _invoiceBlockedReason: 'no_zone' } as any)
      return
    }

    const activeContract = activeContractByRoomId.get(room.id)
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
    const contractStartedAt = activeContract?.created_at || activeContract?.move_in_date
    const blockingInvoices = (invoicesByRoomId.get(room.id) || [])
      .filter(
        (i) =>
          i.payment_status !== 'cancelled' &&
          i.payment_status !== 'merged' &&
          (i.payment_status === 'unpaid' || i.payment_status === 'partial') &&
          (!currentTenantId || i.tenant_id === currentTenantId) &&
          (!contractStartedAt || i.created_at >= contractStartedAt)
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
  const activeContractByRoomId = useMemo(() => {
    const map = new Map<string, (typeof contracts)[number]>()
    for (const contract of contracts) {
      if (contract.status !== 'active') continue
      const current = map.get(contract.room_id)
      if (!current || new Date(contract.created_at).getTime() > new Date(current.created_at).getTime()) {
        map.set(contract.room_id, contract)
      }
    }
    return map
  }, [contracts])

  const invoicesByRoomId = useMemo(() => {
    const map = new Map<string, Invoice[]>()
    for (const invoice of invoices) {
      const list = map.get(invoice.room_id)
      if (list) list.push(invoice)
      else map.set(invoice.room_id, [invoice])
    }
    return map
  }, [invoices])

  const moveInReceiptsByRoomId = useMemo(() => {
    const map = new Map<string, typeof moveInReceipts>()
    for (const receipt of moveInReceipts) {
      const list = map.get(receipt.room_id)
      if (list) list.push(receipt)
      else map.set(receipt.room_id, [receipt])
    }
    return map
  }, [moveInReceipts])

  const roomById = useMemo(() => {
    const map = new Map<string, Room>()
    for (const room of rooms) {
      map.set(room.id, room)
    }
    return map
  }, [rooms])

  const sepayPendingInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          !invoice.is_settlement &&
          invoice.payment_status !== 'cancelled' &&
          invoice.payment_status !== 'merged' &&
          (invoice.payment_status === 'unpaid' || invoice.payment_status === 'partial')
      ),
    [invoices]
  )

  const sepayPendingInvoicesKey = useMemo(
    () =>
      sepayPendingInvoices
        .map((invoice) => `${invoice.id}:${invoice.paid_amount}:${invoice.total_amount}:${invoice.payment_status}`)
        .sort()
        .join('|'),
    [sepayPendingInvoices]
  )

  const { data: sepayBackgroundMatches = [] } = useQuery<SepayBackgroundMatch[]>({
    queryKey: ['sepayBackgroundMatches', appSettings.sepay_api_token || '', sepayPendingInvoicesKey],
    enabled: Boolean(currentUser && appSettings.sepay_api_token && sepayPendingInvoices.length > 0),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    queryFn: async () => {
      const token = appSettings.sepay_api_token || ''
      const res = (await window.api.sepay.fetchTransactions(token)) as SepayBackgroundFetchResult
      if (!res.ok || res.data?.status !== 200) return []

      const txs = res.data.transactions || []
      const matches: SepayBackgroundMatch[] = []

      for (const tx of txs) {
        const normalizedContent = normalizeTransferText(tx.transaction_content || '')
        const amount = Number(tx.amount_in)
        if (!Number.isFinite(amount) || amount <= 0) continue

        const matchedInvoices = sepayPendingInvoices.filter((invoice) => {
          const roomName = roomById.get(invoice.room_id)?.name || ''
          const transferCode = buildInvoiceTransferDescription(invoice, roomName)
          return normalizedContent.includes(normalizeTransferText(transferCode))
        })
        const uniqueInvoiceIds = new Set(matchedInvoices.map((invoice) => invoice.id))
        if (uniqueInvoiceIds.size !== 1) continue

        const invoice = matchedInvoices[0]
        const remaining = Math.max(0, (invoice.total_amount || 0) - (invoice.paid_amount || 0))
        if (Math.abs(amount - remaining) >= 1) continue

        const room = roomById.get(invoice.room_id)
        matches.push({
          invoice,
          roomName: room?.name || 'Phòng ?',
          tenantName: room?.tenant_name || '',
          amount,
          transactionId: tx.id,
          referenceNumber: tx.reference_number || ''
        })
      }

      return matches.slice(0, 9)
    }
  })

  const serviceZoneById = useMemo(() => {
    const map = new Map<string, ServiceZone>()
    for (const zone of serviceZones) {
      map.set(zone.id, zone)
    }
    return map
  }, [serviceZones])

  const counts = useMemo(
    () => ({
      occupied: rooms.filter((r) => r.status === 'occupied').length,
      vacant: rooms.filter((r) => r.status === 'vacant').length,
      ending: rooms.filter((r) => r.status === 'ending').length,
      expiring: 0
    }),
    [rooms]
  )

  // Lọc phòng theo checkbox + tìm kiếm
  const filteredRooms = useMemo(() => rooms.filter((room) => {
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
  }), [rooms, filters, searchQuery])

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
      setMenuAnchor(null)
      return
    }

    const buttonRect = event.currentTarget.getBoundingClientRect()
    const estimatedMenuHeight = 480
    const viewportPadding = 16
    const shouldOpenUp =
      window.innerHeight - buttonRect.bottom < estimatedMenuHeight + viewportPadding

    setMenuPlacement(shouldOpenUp ? 'top' : 'bottom')
    setMenuAnchor({
      top: buttonRect.bottom,
      bottom: window.innerHeight - buttonRect.top,
      right: window.innerWidth - buttonRect.right,
    })
    setMenuOpenId(roomId)
  }

  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()
  const currentDay = new Date().getDate()
  let dueRoomsCount = 0
  const roomWarnings: Record<string, 'due' | 'unpaid' | null> = {}

  rooms.forEach((room) => {
    if (room.status === 'occupied') {
      // Due Date Check: Has the regular billing day passed without an invoice for THIS month?
      const invoiceDay = room.invoice_day || 5
      const isDueDate = currentDay >= invoiceDay
      const currentInvoice = (invoicesByRoomId.get(room.id) || []).find(
        (i) => i.month === currentMonth && i.year === currentYear
      )

      // Kiểm tra tháng này đã có phiếu tháng đầu của khách HIỆN TẠI chưa
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
      const room = roomById.get(invoice.room_id)
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

  const sepayNotificationItems = sepayBackgroundMatches.map((match) => ({
    id: `sepay-${match.transactionId}-${match.invoice.id}`,
    icon: 'fa-building-columns',
    iconClass: 'text-emerald-500',
    title: `${match.roomName} có tiền SePay khớp ${formatVND(match.amount)}đ`,
    description: `${match.tenantName ? `${match.tenantName} · ` : ''}Đúng mã chuyển khoản và đúng số tiền còn thu.`,
    actionLabel: 'Mở đồng bộ SePay',
    onClick: () => {
      setIsNotificationOpen(false)
      requestActiveTab('invoices')
      setSepaySyncOpenSignal((value) => value + 1)
    }
  }))

  const readNotificationIds = new Set(appSettings.notification_read_ids || [])
  const notificationItems = [
    ...sepayNotificationItems,
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

  if (!authReady) return null

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />
  }

  const accountDisplayName = currentUser.full_name || (currentUser.role === 'admin' ? 'Admin' : currentUser.username)
  const sapoGreen = '#00ffcc'
  const headerNavItems = [
    { id: 'rooms' as const, icon: Home, label: 'Phòng' },
    { id: 'invoices' as const, icon: FileText, label: 'Hóa đơn' },
    { id: 'contracts' as const, icon: ClipboardList, label: 'Hợp đồng' },
    { id: 'assets' as const, icon: Box, label: 'Tài sản' },
    { id: 'tenants' as const, icon: Users, label: 'Khách thuê' }
  ]

  return (
    <Suspense fallback={<TabLoading />}>
      <div className="text-sm text-gray-800 antialiased h-screen flex flex-col overflow-hidden bg-gray-100">
      {invoiceGuardNotice &&
        (() => {
          const inv = invoiceGuardNotice.invoice
          const remaining = Math.max(0, inv.total_amount - inv.paid_amount)
          const room = roomById.get(inv.room_id)
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
          room={roomById.get(paymentInvoice.room_id)}
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
      {roomToDeleteWithHistory && (
        <ConfirmDeleteWithHistoryModal
          room={roomToDeleteWithHistory}
          onConfirm={() => {
            deleteMutation.mutate(roomToDeleteWithHistory.id, {
              onSuccess: () => setRoomToDeleteWithHistory(null)
            })
          }}
          onCancel={() => setRoomToDeleteWithHistory(null)}
          isDeleting={deleteMutation.isPending}
        />
      )}
      {/* Header Menu */}
      <header className="app-titlebar-drag relative z-20 flex h-14 w-full shrink-0 items-center justify-between border-b border-[#003d4d] bg-[#002b36] px-4 pr-40 font-sans text-white shadow-md">
        <div className="app-no-drag flex min-w-0 items-center space-x-4">
          <div className="group flex shrink-0 cursor-pointer items-center space-x-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm transition-transform group-hover:scale-105 p-1">
              <img src={logoNavbar} alt="DB Logo" className="h-full w-full object-contain" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-tight text-white">
                AN KHANG HOME
              </span>
              <span className="text-[9px] font-medium uppercase tracking-wider text-white opacity-60">
                Quản lý phòng trọ
              </span>
            </div>
          </div>

          <nav className="ml-4 flex h-14 min-w-0 overflow-x-auto scrollbar-hide">
            {headerNavItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    playClick()
                    requestActiveTab(item.id)
                  }}
                  className={`flex shrink-0 cursor-pointer items-center space-x-2 border-b-2 px-4 text-sm font-medium transition-all ${isActive
                    ? 'bg-white/10 text-white'
                    : 'border-transparent text-white hover:bg-white/5'
                    }`}
                  style={{ borderBottomColor: isActive ? sapoGreen : 'transparent' }}
                >
                  <Icon size={18} className="text-white" />
                  <span className="text-white">{item.label}</span>
                </button>
              )
            })}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  playClick()
                  requestActiveTab('reports')
                }}
                className={`flex h-14 cursor-pointer items-center space-x-2 border-b-2 px-4 text-sm font-medium transition-all ${activeTab === 'reports'
                  ? 'bg-white/10 text-white'
                  : 'border-transparent text-white hover:bg-white/5'
                  }`}
                style={{ borderBottomColor: activeTab === 'reports' ? sapoGreen : 'transparent' }}
              >
                <BarChart3 size={18} className="text-white" />
                <span className="text-white">Báo cáo</span>
              </button>
            </div>
          </nav>
        </div>

        <div className="app-no-drag flex shrink-0 items-center space-x-4">
          <div className="relative" ref={notificationMenuRef}>
            <button
              type="button"
              onClick={() => setIsNotificationOpen((prev) => !prev)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200"
              title="Thông báo"
            >
              <Bell size={20} className={notificationItems.length > 0 && !isNotificationOpen ? 'notification-bell-ring' : ''} />
              {notificationItems.length > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-[3px] text-[9px] font-bold text-white">
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
            className="flex h-9 w-9 items-center justify-center text-white transition-opacity hover:opacity-80"
            title="Cài đặt hệ thống"
          >
            <SettingsIcon size={18} />
          </button>

          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setIsAccountMenuOpen((prev) => !prev)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-all hover:scale-105 active:scale-95 border-2 border-white/20 overflow-hidden bg-white/10 backdrop-blur-sm"
              title={accountDisplayName}
            >
              <img
                src={currentUser.avatar_url || (currentUser.role === 'admin'
                  ? "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4,c0aede&radius=0"
                  : `https://ui-avatars.com/api/?name=${encodeURIComponent(accountDisplayName)}&background=00ffcc&color=00151a&bold=true`)
                }
                alt="Avatar"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/20 to-transparent"></div>
            </button>

            {isAccountMenuOpen && (
              <div
                className="fixed right-4 top-[64px] z-[80] w-80 origin-top-right rounded-[32px] border border-white/40 bg-white/90 p-3 shadow-[0_30px_70px_rgba(0,0,0,0.2)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-300"
                style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
              >
                {/* User Info Card */}
                <div className="relative mb-3 flex flex-col items-center px-4 py-8 rounded-[24px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden text-center">
                  {/* Decorative backgrounds */}
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/20 blur-2xl"></div>
                  <div className="absolute -left-6 -bottom-6 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl"></div>

                  <div className="relative mb-4">
                    <div className="h-20 w-20 rounded-[24px] bg-white p-1 shadow-2xl ring-4 ring-white/10 transition-transform hover:scale-105">
                      <img
                        src={currentUser.avatar_url || (currentUser.role === 'admin'
                          ? "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4,c0aede&radius=0"
                          : `https://ui-avatars.com/api/?name=${encodeURIComponent(accountDisplayName)}&background=00ffcc&color=00151a&bold=true`)
                        }
                        className="h-full w-full rounded-[20px] object-cover"
                        alt="Avatar Large"
                      />
                    </div>
                    <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-800 bg-emerald-400 shadow-lg">
                      <div className="h-2 w-2 rounded-full bg-white animate-pulse"></div>
                    </span>
                  </div>

                  <div className="relative z-10">
                    <div className="text-lg font-black text-white tracking-tight">{accountDisplayName}</div>
                    <div className="inline-flex mt-1 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-400 border border-white/5">
                      <i className="fa-solid fa-shield-halved"></i>
                      Quyền: {currentUser.role?.toUpperCase()}
                    </div>
                    <div className="mt-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest opacity-60">ID: {currentUser.id?.slice(0, 8) || 'ADMIN_DB'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 p-3 text-center transition-all hover:bg-emerald-50 group border border-transparent hover:border-emerald-100"
                    onClick={() => { setIsAccountMenuOpen(false); setIsProfileOpen(true) }}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm transition-transform group-hover:scale-110">
                      <i className="fa-solid fa-id-card text-emerald-500"></i>
                    </div>
                    <span className="text-[10px] font-bold text-slate-600">Hồ sơ</span>
                  </button>
                  <button className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 p-3 text-center transition-all hover:bg-amber-50 group border border-transparent hover:border-amber-100">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm transition-transform group-hover:scale-110">
                      <i className="fa-solid fa-key text-amber-500"></i>
                    </div>
                    <span className="text-[10px] font-bold text-slate-600">Bảo mật</span>
                  </button>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-3 rounded-[20px] bg-rose-50 px-3 py-4 text-[11px] font-black text-rose-500 transition-all hover:bg-rose-100 group border border-rose-100/50 uppercase tracking-widest"
                >
                  <i className="fa-solid fa-power-off text-base group-hover:rotate-180 transition-transform duration-500"></i>
                  <span>Đăng xuất hệ thống</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header >

      {isProfileOpen && currentUser && (
        <ProfileModal
          currentUser={currentUser}
          onClose={() => setIsProfileOpen(false)}
          onUpdate={(updated) => setCurrentUser(updated)}
        />
      )}

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
      <div key={activeTab} className="flex-1 flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]">
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
                      <span className="font-bold text-primary">AN KHANG HOME</span>
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
                    { id: 'ending' as const, label: 'Sắp chuyển', count: counts.ending, color: 'amber' },
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
                  <thead className="text-[10px] text-gray-500 bg-gray-50/50 uppercase tracking-wider font-bold border-b border-gray-100">
                    <tr>
                      <th
                        rowSpan={2}
                        className="px-3 py-2.5 border-r border-gray-100 bg-gray-50/30 z-20 sticky left-0 text-gray-400"
                      >
                        <i className="fa-solid fa-bars-staggered"></i>
                      </th>
                      <th
                        rowSpan={2}
                        className="px-3 py-2.5 border-r border-gray-100 bg-gray-50/30 z-20 sticky left-10"
                      >
                        <div className="flex items-center gap-1.5">
                          <i className="fa-solid fa-door-open text-primary/60"></i>
                          <span>Tên phòng</span>
                        </div>
                      </th>
                      <th rowSpan={2} className="px-3 py-2.5 border-r border-gray-100">
                        <i className="fa-solid fa-tag mr-1 text-green-500/70"></i> Giá thuê
                      </th>
                      <th rowSpan={2} className="px-3 py-2.5 border-r border-gray-100">
                        <i className="fa-solid fa-bolt mr-1 text-yellow-500/70"></i> Phí DV
                      </th>
                      <th rowSpan={2} className="px-3 py-2.5 border-r border-gray-100">
                        <i className="fa-solid fa-shield-halved mr-1 text-blue-400/70"></i> Tiền cọc
                      </th>
                      <th rowSpan={2} className="px-3 py-2.5 border-r border-gray-100">
                        <i className="fa-solid fa-triangle-exclamation mr-1 text-red-400/70"></i> Nợ cũ
                      </th>
                      <th rowSpan={2} className="px-3 py-2.5 border-r border-gray-100">
                        <i className="fa-solid fa-users mr-1 text-teal-500/70"></i> KH thuê
                      </th>
                      <th rowSpan={2} className="px-3 py-2.5 border-r border-gray-100">
                        <i className="fa-solid fa-calendar-check mr-1 text-orange-400/70"></i> Ngày vào
                      </th>
                      <th rowSpan={2} className="px-3 py-2.5 text-center border-r border-gray-100">
                        Tình trạng
                      </th>
                      <th rowSpan={2} className="px-3 py-2.5 text-center border-r border-gray-100">
                        Tài chính
                      </th>
                      <th rowSpan={2} className="px-3 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {isLoading ? (
                      <tr>
                        <td colSpan={12} className="text-center py-10 text-gray-400">
                          <LogoLoading message="Đang tải danh sách phòng..." className="min-h-[45vh]" />
                        </td>
                      </tr>
                    ) : (
                      filteredRooms.map((origRoom) => {
                        const room = { ...origRoom, ...(pendingRoomUpdates[origRoom.id] || {}) }
                        const zone = serviceZoneById.get(room.service_zone_id || '') || {
                          name: 'Chưa có',
                          electric_price: 0,
                          water_price: 0,
                          internet_price: 0,
                          cleaning_price: 0
                        }
                        const activeContract = activeContractByRoomId.get(room.id)
                        const roomInvoices = (invoicesByRoomId.get(room.id) || []).filter(
                          (i) =>
                            i.payment_status !== 'cancelled' &&
                            i.payment_status !== 'merged'
                        )
                        const roomMoveInReceipts = moveInReceiptsByRoomId.get(room.id) || []
                        const checkInvoices = (invoicesByRoomId.get(room.id) || []).filter(
                          (i) =>
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
                              i.payment_status !== 'cancelled' &&
                              i.payment_status !== 'merged' &&
                              (i.payment_status === 'paid' ||
                                i.payment_status === 'partial' ||
                                i.paid_amount > 0)
                          )
                        const canDeleteRoom =
                          roomInvoices.length === 0 && roomMoveInReceipts.length === 0
                        // Khach migration khong lap hoa don thang dau, nhung van la khach dang o.
                        const hasFirstInvoice = checkInvoices.some((i) => i.is_first_month)
                        const hasStartedBilling = hasFirstInvoice || activeContract?.is_migration === true

                        const menuItemClass =
                          'w-full min-w-0 rounded-md px-3 py-2 text-left text-sm flex items-start gap-2 transition whitespace-normal leading-5'
                        const roomActionMenu = (
                          <div
                            className="fixed w-[32rem] max-w-[calc(100vw-2rem)] max-h-[min(70vh,28rem)] overflow-y-auto whitespace-normal bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-[9999] animate-[fadeIn_0.15s_ease-out]"
                            style={menuAnchor ? (
                              menuPlacement === 'top'
                                ? { bottom: menuAnchor.bottom + 4, right: menuAnchor.right }
                                : { top: menuAnchor.top + 4, right: menuAnchor.right }
                            ) : {}}
                          >
                            <div className="grid grid-cols-2 gap-2 overflow-hidden">
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
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setMenuOpenId(null)
                                      if (!canDeleteRoom) {
                                        setRoomToDeleteWithHistory(room)
                                      } else {
                                        setRoomToDelete(room)
                                      }
                                    }}
                                    className={`${menuItemClass} ${canDeleteRoom ? 'hover:bg-red-50 text-red-700' : 'hover:bg-orange-50 text-orange-700'} font-medium`}
                                  >
                                    <i className={`fa-solid fa-trash-can w-4 ${canDeleteRoom ? 'text-red-500' : 'text-orange-500'}`}></i>
                                    Xóa phòng{!canDeleteRoom && ' ⚠'}
                                  </button>
                                </>
                              ) : (
                                <>
                                  {/* === MENU PHÒNG ĐANG CÓ KHÁCH === */}
                                  {(unpaidFirstMonthForCurrentTenant || endingOutstandingInvoice) && (
                                    <div className="col-span-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex gap-2 text-xs text-amber-800 min-w-0 overflow-hidden">
                                      <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 shrink-0"></i>
                                      <span className="min-w-0 break-words">
                                        {endingOutstandingInvoice
                                          ? <><strong>Phòng này còn hóa đơn chưa thu.</strong> Cần thu xong trước khi xác nhận trả phòng.</>
                                          : <><strong>Hóa đơn chưa được thanh toán.</strong> Thu tiền trước, sau đó mới có thể thực hiện các thao tác khác.{canCancel && ' Hoặc hủy hợp đồng nếu nhập nhầm.'}</>
                                        }
                                      </span>
                                    </div>
                                  )}
                                  {/* Nhóm 1: Tài chính & Quản lý */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (endingOutstandingInvoice) {
                                        setPaymentInvoice(endingOutstandingInvoice)
                                      } else {
                                        openInvoiceFlow(room)
                                      }
                                      setMenuOpenId(null)
                                    }}
                                    className={`${menuItemClass} hover:bg-blue-50 text-blue-600 font-bold`}
                                  >
                                    <i className="fa-solid fa-file-invoice-dollar w-4"></i>
                                    {endingOutstandingInvoice
                                      ? ' Thu tiền hóa đơn còn nợ'
                                      : unpaidFirstMonthForCurrentTenant
                                        ? ' Thu tiền hóa đơn'
                                        : ' Lập hóa đơn'}
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
                                  {/* Nhóm 2: Di chuyển & Tài sản */}
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
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setAssetModuleInitialRoomId(room.id)
                                      requestActiveTab('assets')
                                      setMenuOpenId(null)
                                    }}
                                    className={`${menuItemClass} hover:bg-gray-50 text-gray-700 font-medium`}
                                  >
                                    <i className="fa-solid fa-table-list w-4 text-gray-500"></i> Thiết lập tài sản
                                  </button>
                                  {/* Nhóm 3: Kết thúc HĐ */}
                                  {room.status === 'ending' ? (
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
                                      Hủy báo trả phòng
                                    </button>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEndNoticeRoom(room)
                                        setMenuOpenId(null)
                                      }}
                                      className={`${menuItemClass} hover:bg-orange-50 text-orange-600 font-medium`}
                                    >
                                      <i className="fa-solid fa-bell w-4 text-orange-500"></i> Báo trả phòng
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setTerminateRoom(room)
                                      setMenuOpenId(null)
                                    }}
                                    className={`${menuItemClass} hover:bg-red-50 text-red-500 font-bold`}
                                  >
                                    <i className="fa-solid fa-door-closed w-4 text-red-400"></i> Trả phòng
                                  </button>
                                  {/* Nhóm 4: Nguy hiểm */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (canCancel) {
                                        setCancelContractRoom(room)
                                        setMenuOpenId(null)
                                      }
                                    }}
                                    disabled={!canCancel}
                                    title={!canCancel ? 'Không thể hủy khi đã có thanh toán. Dùng "Trả phòng" để tất toán.' : undefined}
                                    className={`${menuItemClass} ${canCancel ? 'hover:bg-red-50 text-red-500' : 'opacity-40 cursor-not-allowed text-red-400'} font-semibold`}
                                  >
                                    <i className="fa-solid fa-ban w-4"></i> Hủy hợp đồng
                                  </button>
                                  {/* Fallback: phòng occupied nhưng không có hợp đồng formal */}
                                  {isActiveContractsFetched && !activeContract && room.status === 'occupied' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setMenuOpenId(null)
                                        if (window.confirm('Xác nhận đánh dấu phòng này về trạng thái trống?\n\nThao tác này sẽ xóa thông tin khách thuê và đưa phòng về trạng thái "Đang trống".')) {
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
                                  {canDeleteRoom && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setRoomToDelete(room)
                                        setMenuOpenId(null)
                                      }}
                                      className={`${menuItemClass} hover:bg-red-50 text-red-700 font-medium col-span-2`}
                                    >
                                      <i className="fa-solid fa-trash-can w-4 text-red-500"></i> Xóa phòng
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
                            <td className="px-3 py-2 text-center text-gray-400">
                              <i className="fa-solid fa-bars"></i>
                            </td>
                            <td className="px-3 py-2 font-bold flex items-center gap-2 text-gray-800">
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white shrink-0 shadow-sm transition-transform hover:scale-110 duration-300 ${room.status === 'vacant' ? 'bg-orange-500' : room.status === 'occupied' ? 'bg-gradient-to-tr from-emerald-500 to-green-400 shadow-emerald-200' : room.status === 'ending' ? 'bg-gradient-to-tr from-yellow-500 to-orange-500' : 'bg-yellow-500'}`}
                              >
                                <i className="fa-solid fa-door-open"></i>
                              </div>
                              <span className="block truncate py-1">{room.name}</span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="px-2 py-1 font-bold text-gray-800 tabular-nums">
                                {formatVND(room.base_rent)} đ
                              </div>
                              {room.status === 'occupied' &&
                                (() => {
                                  if (!activeContract) return null
                                  const paidRentInvoices = (invoicesByRoomId.get(room.id) || []).filter(
                                    (i) => i.paid_amount > 0
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
                            <td className="px-3 py-2">
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

                            <td className="px-3 py-2">
                              {(() => {
                                // Chỉ tính tiền cọc khi phòng đang có người ở
                                if (room.status === 'vacant') {
                                  return <span className="text-gray-300 text-xs">—</span>
                                }
                                const roomReceipts = moveInReceiptsByRoomId.get(room.id) || []
                                const receipt = roomReceipts.find(
                                  (r) =>
                                    r.payment_status === 'paid' &&
                                    (!activeContract?.move_in_date ||
                                      r.move_in_date === activeContract.move_in_date)
                                )
                                const currentTenantInvoices = (invoicesByRoomId.get(room.id) || []).filter(
                                  (i) =>
                                    i.payment_status !== 'cancelled' &&
                                    (!activeContract?.tenant_id ||
                                      i.tenant_id === activeContract.tenant_id)
                                )
                                const depositInvoice = currentTenantInvoices.find(
                                  (i) =>
                                    (i.payment_status === 'paid' || i.payment_status === 'partial') &&
                                    (i.deposit_amount || 0) > 0 &&
                                    i.paid_amount > 0 &&
                                    (!activeContract || i.created_at >= activeContract.created_at)
                                )
                                const depositCollected = Boolean(receipt) || Boolean(depositInvoice)
                                const actualDepositAmount =
                                  depositInvoice?.deposit_amount ||
                                  activeContract?.deposit_amount ||
                                  room.default_deposit ||
                                  0
                                if (depositCollected) {
                                  return (
                                    <div>
                                      <div className="font-bold text-gray-800">
                                        {formatVND(actualDepositAmount)}{' '}
                                        đ
                                      </div>
                                      <div className="flex items-center gap-1 mt-0.5 text-[10px] font-bold text-emerald-600">
                                        <i className="fa-solid fa-lock"></i> Đã thu
                                      </div>
                                    </div>
                                  )
                                }
                                if (activeContract) {
                                  return (
                                    <div>
                                      <div className="font-bold text-gray-800">
                                        {formatVND(activeContract.deposit_amount)} đ
                                      </div>
                                      <div className="text-[10px] text-red-500 mt-0.5 italic whitespace-nowrap">
                                        Chưa thu tiền cọc
                                      </div>
                                    </div>
                                  )
                                }
                                return (
                                  <EditableCell
                                    value={room.default_deposit || 0}
                                    displayValue={`${formatVND(room.default_deposit || 0)} đ`}
                                    type="number"
                                    className="font-bold text-gray-800"
                                    onSave={(v) =>
                                      handleQueueChange(room.id, { default_deposit: Number(v) })
                                    }
                                  />
                                )
                              })()}
                            </td>
                            <td className="px-3 py-2 font-semibold">
                              {(() => {
                                // Nợ thuộc về tenant, không thuộc phòng.
                                // Phòng trống → không hiển thị nợ cũ.
                                if (room.status === 'vacant') {
                                  return <span className="text-gray-300 text-xs">—</span>
                                }
                                const debt = (invoicesByRoomId.get(room.id) || [])
                                  .filter(
                                    (i) =>
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
                            <td className="px-3 py-2 text-gray-600">
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
                            <td className="px-3 py-2 text-gray-600 text-sm">
                              {(() => {
                                if (room.status === 'vacant') {
                                  return <span className="text-gray-400 italic text-xs">Chưa có</span>
                                }
                                // Ngày vào ở = lấy từ hợp đồng, chỉ hiện khi đã lập HĐ đầu tiên
                                const moveInDate = activeContract?.move_in_date ||
                                  room.move_in_date

                                if (hasStartedBilling && moveInDate) {
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
                                return <span className="text-gray-400 italic text-xs">Chưa bắt đầu</span>
                              })()}
                            </td>
                            <td
                              className="px-3 py-2 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div>
                                <span
                                  title="Trang thai duoc cap nhat theo luong nghiep vu, khong cho sua tay tai danh sach."
                                  className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full uppercase font-bold tracking-wide ${room.status === 'vacant'
                                    ? 'bg-gradient-to-r from-slate-400 to-gray-500 text-white shadow-sm shadow-gray-400/40'
                                    : room.status === 'occupied' && hasStartedBilling
                                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-400/40'
                                      : room.status === 'occupied' && !hasStartedBilling
                                        ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-sm shadow-blue-400/40'
                                        : room.status === 'ending'
                                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm shadow-orange-400/40'
                                          : 'bg-gradient-to-r from-gray-500 to-slate-600 text-white shadow-sm shadow-slate-400/40'
                                    }`}
                                >
                                  {room.status === 'vacant' && (
                                    <i className="fa-solid fa-door-open text-[9px]"></i>
                                  )}
                                  {room.status === 'occupied' && hasStartedBilling && (
                                    <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                                      <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-60 animate-ping"></span>
                                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white"></span>
                                    </span>
                                  )}
                                  {room.status === 'occupied' && !hasStartedBilling && (
                                    <i className="fa-solid fa-file-signature text-[9px]"></i>
                                  )}
                                  {room.status === 'ending' && (
                                    <i className="fa-solid fa-right-from-bracket text-[9px]"></i>
                                  )}
                                  {room.status === 'maintenance' && (
                                    <i className="fa-solid fa-screwdriver-wrench text-[9px]"></i>
                                  )}
                                  {room.status === 'vacant'
                                    ? 'Đang trống'
                                    : room.status === 'occupied' && hasStartedBilling
                                      ? 'Đang ở'
                                      : room.status === 'occupied' && !hasStartedBilling
                                        ? 'Chờ lập HĐ'
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
                              const hasActiveContract = activeContract
                              const contractStartedAt = hasActiveContract?.created_at || hasActiveContract?.move_in_date
                              const roomInvoicesAll = invoicesByRoomId.get(room.id) || []
                              const roomMonthInvoices = roomInvoicesAll
                                .filter(
                                  (i) =>
                                    i.month === currentMonth &&
                                    i.year === currentYear &&
                                    i.payment_status !== 'cancelled' &&
                                    i.payment_status !== 'merged' &&
                                    !i.is_settlement &&
                                    !isDepositOnlyInvoice(i) &&
                                    (!hasActiveContract?.tenant_id ||
                                      i.tenant_id === hasActiveContract.tenant_id) &&
                                    (!contractStartedAt || i.created_at >= contractStartedAt)
                                )
                                .sort(
                                  (a, b) =>
                                    new Date(b.created_at).getTime() -
                                    new Date(a.created_at).getTime()
                                )

                              const currentTenantInvoices = roomInvoicesAll
                                .filter(
                                  (i) =>
                                    i.payment_status !== 'cancelled' &&
                                    i.payment_status !== 'merged' &&
                                    (!hasActiveContract?.tenant_id ||
                                      i.tenant_id === hasActiveContract.tenant_id) &&
                                    (!contractStartedAt || i.created_at >= contractStartedAt)
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
                              const isNewContract = !!hasActiveContract && !hasActiveContract.is_migration && !firstMonthInvoice
                              const hasReceivedAssets = !!roomAssetWorkflow[room.id]?.hasMoveIn
                              const hasDepositCollected =
                                hasActiveContract?.deposit_pre_collected === true ||
                                currentTenantInvoices.some(
                                  (i) =>
                                    (isDepositOnlyInvoice(i) || (i.is_first_month && (i.deposit_amount || 0) > 0)) &&
                                    i.paid_amount > 0
                                )

                              const btnNewContract = (
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedRoom(room)
                                    }}
                                    className="bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white shadow-sm shadow-red-400/40 text-[10px] px-2.5 py-1.5 rounded-md font-bold block w-full transition tracking-wide uppercase"
                                  >
                                    <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                                    Cần lập HĐ đầu
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
                                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm shadow-orange-400/40 text-[10px] px-2.5 py-1.5 rounded-md font-bold block w-full transition tracking-wide uppercase"
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
                                if (hasActiveContract && room.status === 'occupied' && !hasReceivedAssets) return btnReceiveRoom
                                if (isNewContract) {
                                  if (hasDepositCollected) {
                                    return (
                                      <td className="px-4 py-3 text-center">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedRoom(room)
                                          }}
                                          className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white shadow-sm shadow-teal-400/40 text-[10px] px-2.5 py-1.5 rounded-md font-bold block w-full transition tracking-wide"
                                        >
                                          <div><i className="fa-solid fa-lock mr-1"></i>Đã thu cọc</div>
                                          <div className="mt-0.5 font-normal opacity-90">Chưa lập HĐ đầu tiên</div>
                                        </button>
                                      </td>
                                    )
                                  }
                                  return btnNewContract
                                }
                                return (
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openInvoiceFlow(room)
                                      }}
                                      className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm shadow-blue-400/40 text-[10px] px-2.5 py-1.5 rounded-md font-bold block w-full transition tracking-wide uppercase"
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
                                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-sm shadow-orange-400/40 text-[10px] px-2.5 py-1.5 rounded-md font-bold block w-full transition tracking-wide uppercase"
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
                                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-sm shadow-orange-400/40 text-[10px] px-2.5 py-1.5 rounded-md font-bold block w-full transition tracking-wide uppercase"
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
                                      className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-sm shadow-orange-400/40 text-[10px] px-2.5 py-1.5 rounded-md font-bold block w-full transition tracking-wide uppercase"
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
                                    <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full uppercase font-bold tracking-wide bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-400/40">
                                      <i className="fa-solid fa-check-double text-[9px]"></i>
                                      Đã thu
                                      <span className="bg-white text-emerald-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow-sm">
                                        Còn {daysUntilNext}d
                                      </span>
                                    </span>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openInvoiceFlow(room)
                                      }}
                                      className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm shadow-blue-400/40 text-[10px] px-2.5 py-1.5 rounded-md font-bold block w-full transition tracking-wide uppercase"
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
          <Suspense fallback={<TabLoading />}>
            <InvoicesTab
              currentUser={currentUser}
              openSePaySyncSignal={sepaySyncOpenSignal}
              onSePaySyncSignalHandled={handleSePaySyncSignalHandled}
            />
          </Suspense>
        ) : activeTab === 'assets' ? (
          <Suspense fallback={<TabLoading />}>
            <AssetsTab
              initialRoomId={assetModuleInitialRoomId}
              onReceivePendingChange={handleAssetReceivePendingChange}
              guideMode={assetModuleGuideMode}
              guideRoomId={assetModuleInitialRoomId}
              onGuideHandled={() => setAssetModuleGuideMode(null)}
            />
          </Suspense>
        ) : activeTab === 'contracts' ? (
          <Suspense fallback={<TabLoading />}>
            <ContractsTab onCreateContract={(room) => setNewContractRoom(room)} />
          </Suspense>
        ) : activeTab === 'reports' ? (
          <Suspense fallback={<TabLoading />}>
            <BusinessReport currentUser={currentUser} onNavigateToInvoices={() => requestActiveTab('invoices')} />
          </Suspense>
        ) : activeTab === 'tenants' ? (
          <Suspense fallback={<TabLoading />}>
            <TenantsTab />
          </Suspense>
        ) : activeTab === 'settings' ? (
          <Suspense fallback={<TabLoading />}>
            <SettingsTab currentUser={currentUser} initialTab={settingsInitialTab} />
          </Suspense>
        ) : null}
      </div>

      {
        updateBanner && updateBanner.status !== 'idle' && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/85 p-6 text-white backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-7 text-slate-900 shadow-2xl">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <i className={`fa-solid ${updateBanner.status === 'error' ? 'fa-triangle-exclamation' : updateBanner.status === 'restarting' ? 'fa-rotate-right fa-spin' : updateBanner.status === 'checking' ? 'fa-magnifying-glass fa-pulse' : 'fa-cloud-arrow-down'} text-xl`}></i>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-black text-slate-900">
                    {updateBanner.status === 'error'
                      ? 'Cập nhật tự động lỗi'
                      : updateBanner.status === 'checking'
                        ? 'Đang kiểm tra cập nhật'
                        : updateBanner.status === 'restarting'
                          ? 'Đang khởi động lại'
                          : 'Đang tự động cập nhật' + (updateBanner.latestVersion ? ' v' + updateBanner.latestVersion : '')}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">
                    {updateBanner.message || 'Vui lòng đợi. Ứng dụng sẽ tự tải, cài đặt và khởi động lại khi sẵn sàng.'}
                  </div>
                  {updateBanner.status !== 'error' && (
                    <div className="mt-5">
                      <div className="mb-2 flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <span>Tiến trình</span>
                        <span>{updateBanner.progress || 0}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: String(updateBanner.progress || 0) + '%' }}></div>
                      </div>
                    </div>
                  )}
                  {updateBanner.status === 'error' && (
                    <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-semibold leading-5 text-red-700">
                      Không thể tự cập nhật. Hãy kiểm tra mạng hoặc mở lại ứng dụng để hệ thống thử lại.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }

      {
        selectedRoom && (
          <InvoiceModal
            room={selectedRoom}
            tenant={null} // Sau này fetch tenant
            onClose={() => setSelectedRoom(null)}
          />
        )
      }
      {
        serviceZoneRoom && (
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
        )
      }
      {
        detailRoom && (
          <RoomDetailsModal
            room={detailRoom}
            zone={serviceZones.find((z) => z.id === detailRoom.service_zone_id) || null}
            zones={serviceZones}
            initialTab={detailRoomInitialTab}
            currentUser={currentUser}
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
        )
      }
      {
        newContractRoom && (
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
        )
      }
      {
        migrationContractRoom && (
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
        )
      }
      {
        endNoticeRoom && (
          <EndContractNoticeModal room={endNoticeRoom} onClose={() => setEndNoticeRoom(null)} />
        )
      }
      {
        terminateRoom && (
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
        )
      }
      {
        cancelContractRoom && (
          <CancelContractModal
            room={cancelContractRoom}
            onClose={() => setCancelContractRoom(null)}
          />
        )
      }
      {
        Object.keys(pendingRoomUpdates).length > 0 && (
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
        )
      }

      {/* Toast thành công */}
      {
        saveToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl animate-[fadeIn_0.2s_ease-out] min-w-[280px]">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
              <i className="fa-solid fa-check text-white text-sm"></i>
            </div>
            <div>
              <div className="font-bold text-sm">Đã lưu thành công!</div>
              <div className="text-gray-400 text-xs">Toàn bộ thay đổi đã được cập nhật.</div>
            </div>
          </div>
        )
      }

      {
        changeTargetRoom && (
          <ChangeRoomModal
            room={changeTargetRoom}
            onClose={() => setChangeTargetRoom(null)}
            onNavigateToAssets={(room) => {
              setChangeTargetRoom(null)
              setAssetModuleInitialRoomId(room.id)
              setAssetModuleGuideMode('move_out')
              requestActiveTab('assets')
            }}
          />
        )
      }

      <TourOverlay />
      </div >
    </Suspense>
  )
}

export default App
