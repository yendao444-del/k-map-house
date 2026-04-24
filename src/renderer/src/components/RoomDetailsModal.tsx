import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Room, ServiceZone, updateRoom, markTenantLeft, getInvoicesByRoom, getContracts, uploadRoomImage, deleteRoomImage, type Contract, type Invoice } from '../lib/db';
import { playSuccess } from '../lib/sound';
import { PaymentModal } from './PaymentModal';
import { RoomAssetsTab } from './RoomAssetsTab';
import { RoomVehiclesTab } from './RoomVehiclesTab';

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);

interface RoomDetailsModalProps {
  room: Room;
  zone: ServiceZone | null;
  zones: ServiceZone[];
  onClose: () => void;
  onOpenInvoice?: (room: Room) => void;
  onOpenFirstInvoice?: (room: Room) => void;
  initialTab?: 'info' | 'assets' | 'vehicles' | 'history';
}

export const RoomDetailsModal: React.FC<RoomDetailsModalProps> = ({ room, zone, zones, onClose, onOpenInvoice, onOpenFirstInvoice, initialTab = 'info' }) => {
  const queryClient = useQueryClient();
  const [isEditingTenant, setIsEditingTenant] = useState(false);
  const [isPickingZone, setIsPickingZone] = useState(false);
  const [pendingZoneId, setPendingZoneId] = useState(room.service_zone_id || '');
  const [confirmVacate, setConfirmVacate] = useState(false);

  const zoneUpdateMutation = useMutation({
    mutationFn: (zoneId: string) => updateRoom(room.id, { service_zone_id: zoneId }),
    onSuccess: () => {
      playSuccess();
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['serviceZones'] });
      setIsPickingZone(false);
    },
  });
  const [tenantForm, setTenantForm] = useState({
    tenant_name: room.tenant_name || '',
    tenant_phone: room.tenant_phone || '',
    tenant_email: room.tenant_email || '',
    tenant_id_card: room.tenant_id_card || '',
    move_in_date: room.move_in_date || '',
    contract_expiration: room.contract_expiration || ''
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Room> }) => updateRoom(id, updates),
    onSuccess: () => {
      playSuccess();
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      setIsEditingTenant(false);

      // Transition handling for First Month Invoice
      const wasVacant = room.status === 'vacant';
      const hasTenantInfoNow = !!tenantForm.tenant_name;
      if (wasVacant && hasTenantInfoNow && onOpenFirstInvoice) {
        onClose();
        onOpenFirstInvoice({
          ...room,
          status: 'occupied',
          tenant_name: tenantForm.tenant_name,
          move_in_date: tenantForm.move_in_date
        } as Room);
      }
    }
  });

  const handleSaveTenant = () => {
    const isNewTenant = room.status === 'vacant' && tenantForm.tenant_name;
    updateMutation.mutate({
      id: room.id,
      updates: {
        ...tenantForm,
        status: isNewTenant ? 'occupied' : room.status
      }
    });
  };

  const [activeTab, setActiveTab] = useState<'info' | 'assets' | 'vehicles' | 'history'>(initialTab);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [isEditingArea, setIsEditingArea] = useState(false);
  const [areaInput, setAreaInput] = useState(String(room.area || ''));
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>(room.image_urls || []);

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices', room.id],
    queryFn: () => getInvoicesByRoom(room.id)
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts'],
    queryFn: getContracts
  });

  const activeContract = contracts.find(
    (c: Contract) => c.room_id === room.id && c.status === 'active'
  );

  const markLeftMut = useMutation({
    mutationFn: (tenantId: string) => markTenantLeft(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    }
  });

  // Fallback: phòng occupied nhưng không có hợp đồng formal
  const vacateMut = useMutation({
    mutationFn: () => updateRoom(room.id, {
      status: 'vacant',
      tenant_name: undefined,
      tenant_phone: undefined,
      tenant_email: undefined,
      tenant_id_card: undefined,
      move_in_date: undefined,
      contract_expiration: undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      onClose();
    }
  });

  return (
    <>
      {payInvoice && <PaymentModal invoice={payInvoice} room={room} onClose={() => setPayInvoice(null)} />}
      <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden animate-[fadeIn_0.2s_ease-out]">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded text-white flex items-center justify-center text-lg ${room.status === 'vacant' ? 'bg-orange-500' : room.status === 'occupied' ? 'bg-gray-500' : 'bg-yellow-500'}`}>
                <i className="fa-solid fa-door-open"></i>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">{room.name}</h2>
                <div className="text-xs text-gray-500 font-medium">Trạng thái: {room.status === 'vacant' ? 'Đang trống' : room.status === 'occupied' ? 'Đang ở' : 'Bảo trì'}</div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 w-8 h-8 rounded-full flex items-center justify-center transition">
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>

          <div className="flex px-6 pt-2 gap-4 border-b border-gray-200 overflow-x-auto whitespace-nowrap scrollbar-hide">
            <button
              onClick={() => setActiveTab('info')}
              className={`pb-3 font-medium text-sm transition border-b-2 flex items-center gap-1.5 ${activeTab === 'info' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <i className="fa-solid fa-circle-info w-4"></i> Thông tin
            </button>
            <button
              onClick={() => setActiveTab('assets')}
              className={`pb-3 font-medium text-sm transition border-b-2 flex items-center gap-1.5 ${activeTab === 'assets' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <i className="fa-solid fa-couch w-4"></i> Tài sản
            </button>
            <button
              onClick={() => setActiveTab('vehicles')}
              className={`pb-3 font-medium text-sm transition border-b-2 flex items-center gap-1.5 ${activeTab === 'vehicles' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <i className="fa-solid fa-motorcycle w-4"></i> Phương tiện
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`pb-3 font-medium text-sm transition border-b-2 flex items-center gap-1.5 ${activeTab === 'history' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <i className="fa-solid fa-bolt w-4"></i> Lịch sử Điện & Nước
            </button>
          </div>

          <div className="p-6 overflow-y-auto max-h-[70vh] bg-gray-50/30">

            {activeTab === 'info' && (
              <div className="flex flex-col gap-6 animate-[fadeIn_0.2s_ease-out]">
              <div className="grid grid-cols-2 gap-6">
                {/* THÔNG TIN PHÒNG */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <i className="fa-solid fa-house-user text-primary"></i>
                    THÔNG TIN PHÒNG
                  </h3>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Giá Thuê Hiện Tại</div>
                        <div className="font-bold text-green-600 tabular-nums">{formatVND(room.base_rent)} đ</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Tiền Cọc Đang Giữ</div>
                        <div className="font-bold text-blue-600 tabular-nums">{formatVND(room.default_deposit || 0)} đ</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Tầng</div>
                        <div className="font-semibold text-gray-800">{room.floor === 0 ? 'Trệt' : `Tầng ${room.floor}`}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Diện tích</div>
                        {isEditingArea ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={areaInput}
                              onChange={e => setAreaInput(e.target.value)}
                              onKeyDown={async e => {
                                if (e.key === 'Enter') {
                                  const val = Number(areaInput) || undefined
                                  await updateRoom(room.id, { area: val })
                                  queryClient.invalidateQueries({ queryKey: ['rooms'] })
                                  setIsEditingArea(false)
                                }
                                if (e.key === 'Escape') setIsEditingArea(false)
                              }}
                              autoFocus
                              className="w-20 border border-blue-300 rounded px-2 py-0.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
                            />
                            <span className="text-xs text-gray-500">m²</span>
                            <button onClick={async () => {
                              const val = Number(areaInput) || undefined
                              await updateRoom(room.id, { area: val })
                              queryClient.invalidateQueries({ queryKey: ['rooms'] })
                              setIsEditingArea(false)
                            }} className="text-[11px] text-green-600 font-bold">Lưu</button>
                            <button onClick={() => setIsEditingArea(false)} className="text-[11px] text-gray-400">Hủy</button>
                          </div>
                        ) : (
                          <div
                            className="font-semibold text-gray-800 cursor-pointer hover:text-blue-600 flex items-center gap-1 group"
                            onClick={() => { setAreaInput(String(room.area || '')); setIsEditingArea(true) }}
                          >
                            {room.area ? `${room.area} m²` : <span className="text-gray-400">—</span>}
                            <i className="fa-solid fa-pen text-[9px] text-gray-300 group-hover:text-blue-400 transition"></i>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-700">
                          <i className="fa-solid fa-tags text-blue-500 mr-1"></i>
                          Bảng Phí Dịch Vụ: {zone ? zone.name : <span className="text-orange-500">Chưa xếp vùng</span>}
                        </div>
                        {!isPickingZone ? (
                          <button
                            onClick={() => { setPendingZoneId(room.service_zone_id || ''); setIsPickingZone(true); }}
                            className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                          >
                            <i className="fa-solid fa-pen text-[9px]"></i> Đổi vùng
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setIsPickingZone(false)} className="text-[11px] text-gray-400 hover:text-gray-600">Hủy</button>
                            <button
                              onClick={() => zoneUpdateMutation.mutate(pendingZoneId)}
                              disabled={zoneUpdateMutation.isPending || pendingZoneId === room.service_zone_id}
                              className="text-[11px] text-green-600 font-bold hover:text-green-800 disabled:opacity-40"
                            >
                              {zoneUpdateMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                            </button>
                          </div>
                        )}
                      </div>

                      {isPickingZone ? (
                        <select
                          value={pendingZoneId}
                          onChange={e => setPendingZoneId(e.target.value)}
                          className="w-full border border-blue-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                          autoFocus
                        >
                          <option value="">-- Chọn vùng giá --</option>
                          {zones.map(z => (
                            <option key={z.id} value={z.id}>{z.name}</option>
                          ))}
                        </select>
                      ) : zone ? (
                        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs text-gray-600">
                          <div className="flex justify-between"><span>Điện:</span> <span className="font-semibold">{formatVND(zone.electric_price)} đ/kWh</span></div>
                          <div className="flex justify-between"><span>Nước:</span> <span className="font-semibold">{formatVND(zone.water_price)} đ/m³</span></div>
                          <div className="flex justify-between"><span>Internet:</span> <span className="font-semibold">{formatVND(zone.internet_price)} đ/ph</span></div>
                          <div className="flex justify-between"><span>Vệ sinh:</span> <span className="font-semibold">{formatVND(zone.cleaning_price)} đ/ph</span></div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 italic">Nhấn "Đổi vùng" để gán vùng giá cho phòng này.</div>
                      )}
                    </div>

                  </div>
                </div>

                {/* THÔNG TIN NGƯỜI THUÊ */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                      <i className="fa-solid fa-address-card text-teal-600"></i>
                      NGƯỜI ĐẠI DIỆN THUÊ
                    </h3>
                    {!isEditingTenant ? (
                      <button onClick={() => setIsEditingTenant(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                        <i className="fa-solid fa-pen mr-1"></i> Cập nhật
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => setIsEditingTenant(false)} className="text-xs text-gray-500 hover:underline">Hủy</button>
                        <button onClick={handleSaveTenant} disabled={updateMutation.isPending} className="text-xs text-green-600 font-bold hover:underline">
                          {updateMutation.isPending ? 'Đang lưu...' : 'Lưu lại'}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isEditingTenant ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Họ và Tên</div>
                        <div className="font-bold text-gray-900">{room.tenant_name || <span className="text-gray-400 italic">Chưa có thông tin</span>}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Số điện thoại</div>
                          <div className="font-semibold text-gray-800">{room.tenant_phone || '—'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Cmnd/Cccd</div>
                          <div className="font-semibold text-gray-800">{room.tenant_id_card || '—'}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Email</div>
                        <div className="font-semibold text-gray-800">{room.tenant_email || '—'}</div>
                      </div>

                      <div className="h-px bg-gray-100 my-2"></div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Ngày bắt đầu thuê</div>
                          <div className="font-semibold text-gray-800">
                            {room.move_in_date ? new Date(room.move_in_date).toLocaleDateString('vi-VN') : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Ngày hết hạn HĐ</div>
                          <div className="font-semibold text-gray-800">
                            {room.contract_expiration ? new Date(room.contract_expiration).toLocaleDateString('vi-VN') : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Họ và Tên</label>
                        <input type="text" className="w-full border rounded px-2 py-1.5 text-sm" value={tenantForm.tenant_name} onChange={e => setTenantForm({ ...tenantForm, tenant_name: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase font-bold">Số điện thoại</label>
                          <input type="text" className="w-full border rounded px-2 py-1.5 text-sm" value={tenantForm.tenant_phone} onChange={e => setTenantForm({ ...tenantForm, tenant_phone: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase font-bold">CCCD/CMND</label>
                          <input type="text" className="w-full border rounded px-2 py-1.5 text-sm" value={tenantForm.tenant_id_card} onChange={e => setTenantForm({ ...tenantForm, tenant_id_card: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase font-bold">Email</label>
                        <input type="email" className="w-full border rounded px-2 py-1.5 text-sm" value={tenantForm.tenant_email} onChange={e => setTenantForm({ ...tenantForm, tenant_email: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase font-bold">Ngày vào ở</label>
                          <input type="date" className="w-full border rounded px-2 py-1.5 text-sm" value={tenantForm.move_in_date} onChange={e => setTenantForm({ ...tenantForm, move_in_date: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 uppercase font-bold">Ngày hết hạn HĐ</label>
                          <input type="date" className="w-full border rounded px-2 py-1.5 text-sm" value={tenantForm.contract_expiration} onChange={e => setTenantForm({ ...tenantForm, contract_expiration: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
              {/* GALLERY ẢNH PHÒNG */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mt-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <i className="fa-solid fa-images text-purple-500"></i>
                    ẢNH PHÒNG
                    <span className="text-[11px] font-normal text-gray-400">({imageUrls.length}/5)</span>
                  </h3>
                  {imageUrls.length < 5 && (
                    <label className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition flex items-center gap-1.5 ${isUploadingImage ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}>
                      {isUploadingImage
                        ? <><i className="fa-solid fa-spinner fa-spin"></i> Đang tải...</>
                        : <><i className="fa-solid fa-plus"></i> Thêm ảnh</>}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={isUploadingImage}
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || [])
                          if (!files.length) return
                          const remaining = 5 - imageUrls.length
                          const toUpload = files.slice(0, remaining)
                          setIsUploadingImage(true)
                          try {
                            const urls: string[] = []
                            for (const file of toUpload) {
                              const url = await uploadRoomImage(room.id, file)
                              urls.push(url)
                            }
                            const newUrls = [...imageUrls, ...urls]
                            setImageUrls(newUrls)
                            await updateRoom(room.id, { image_urls: newUrls })
                            queryClient.invalidateQueries({ queryKey: ['rooms'] })
                          } catch (err) {
                            alert('Upload thất bại: ' + (err instanceof Error ? err.message : 'Lỗi không xác định'))
                          } finally {
                            setIsUploadingImage(false)
                            e.target.value = ''
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
                {imageUrls.length === 0 ? (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-8 cursor-pointer hover:border-purple-300 hover:bg-purple-50/30 transition group">
                    <i className="fa-solid fa-camera text-3xl text-gray-300 group-hover:text-purple-400 transition mb-2"></i>
                    <span className="text-sm text-gray-400 group-hover:text-purple-500 transition">Nhấn để thêm ảnh phòng</span>
                    <input type="file" accept="image/*" multiple className="hidden" disabled={isUploadingImage}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files || []).slice(0, 5)
                        if (!files.length) return
                        setIsUploadingImage(true)
                        try {
                          const urls: string[] = []
                          for (const file of files) {
                            const url = await uploadRoomImage(room.id, file)
                            urls.push(url)
                          }
                          setImageUrls(urls)
                          await updateRoom(room.id, { image_urls: urls })
                          queryClient.invalidateQueries({ queryKey: ['rooms'] })
                        } catch (err) {
                          alert('Upload thất bại: ' + (err instanceof Error ? err.message : 'Lỗi không xác định'))
                        } finally {
                          setIsUploadingImage(false)
                          e.target.value = ''
                        }
                      }}
                    />
                  </label>
                ) : (
                  <div className="grid grid-cols-5 gap-2">
                    {imageUrls.map((url, idx) => (
                      <div
                        key={url}
                        className="relative group aspect-square rounded-lg overflow-hidden border border-gray-100 shadow-sm cursor-pointer"
                        onClick={() => setLightboxIndex(idx)}
                      >
                        <img src={url} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition opacity-0 group-hover:opacity-100 flex items-end justify-end p-1.5">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation()
                              const newUrls = imageUrls.filter((_, i) => i !== idx)
                              setImageUrls(newUrls)
                              await deleteRoomImage(url)
                              await updateRoom(room.id, { image_urls: newUrls })
                              queryClient.invalidateQueries({ queryKey: ['rooms'] })
                            }}
                            className="w-7 h-7 bg-red-500/90 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition shadow"
                          >
                            <i className="fa-solid fa-trash text-xs"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* LIGHTBOX */}
              {lightboxIndex !== null && (
                <div
                  className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
                  onClick={() => setLightboxIndex(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1)
                    if (e.key === 'ArrowRight' && lightboxIndex < imageUrls.length - 1) setLightboxIndex(lightboxIndex + 1)
                    if (e.key === 'Escape') setLightboxIndex(null)
                  }}
                  tabIndex={0}
                  ref={el => el?.focus()}
                >
                  <button
                    className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition"
                    onClick={() => setLightboxIndex(null)}
                  >
                    <i className="fa-solid fa-xmark text-lg"></i>
                  </button>
                  {lightboxIndex > 0 && (
                    <button
                      className="absolute left-4 w-11 h-11 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition"
                      onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1) }}
                    >
                      <i className="fa-solid fa-chevron-left"></i>
                    </button>
                  )}
                  <img
                    src={imageUrls[lightboxIndex]}
                    alt=""
                    className="max-h-[88vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  />
                  {lightboxIndex < imageUrls.length - 1 && (
                    <button
                      className="absolute right-4 w-11 h-11 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition"
                      onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1) }}
                    >
                      <i className="fa-solid fa-chevron-right"></i>
                    </button>
                  )}
                  <div className="absolute bottom-4 text-white/60 text-sm">
                    {lightboxIndex + 1} / {imageUrls.length}
                  </div>
                </div>
              )}
              </div>
            )}

            {activeTab === 'assets' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <RoomAssetsTab room={room} />
              </div>
            )}

            {activeTab === 'vehicles' && (
              <div className="animate-[fadeIn_0.2s_ease-out]">
                <RoomVehiclesTab room={room} />
              </div>
            )}

            {activeTab === 'history' && (() => {
              const utilityInvoices = invoices
                .filter(i =>
                  i.payment_status !== 'cancelled' &&
                  i.payment_status !== 'merged' &&
                  (i.billing_reason === 'monthly' || i.has_transfer === true)
                )
                .sort((a, b) => {
                  if (a.year !== b.year) return b.year - a.year
                  if (a.month !== b.month) return b.month - a.month
                  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                })
              return (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm animate-[fadeIn_0.2s_ease-out] overflow-hidden flex flex-col">
                  {invoicesLoading ? (
                    <div className="p-8 text-center text-gray-400">Đang tải lịch sử...</div>
                  ) : utilityInvoices.length === 0 ? (
                    <div className="p-10 text-center">
                      <div className="text-gray-300 text-4xl mb-3"><i className="fa-solid fa-folder-open"></i></div>
                      <div className="text-gray-500 font-medium">Phòng này chưa có lịch sử điện nước</div>
                      <div className="text-sm text-gray-400 mt-1">Dữ liệu sẽ xuất hiện sau khi lập hóa đơn hàng tháng</div>
                    </div>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-[#112D4E] text-white sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 font-semibold text-center border-r border-[#3F72AF]">Kỳ thu</th>
                            <th className="px-4 py-3 font-semibold text-center bg-yellow-500/20 border-r border-[#3F72AF]/50 text-yellow-100" colSpan={3}><i className="fa-solid fa-bolt mr-1"></i> ĐIỆN</th>
                            <th className="px-4 py-3 font-semibold text-center bg-blue-500/20 text-blue-100" colSpan={3}><i className="fa-solid fa-droplet mr-1"></i> NƯỚC</th>
                            <th className="px-4 py-3 font-semibold text-right text-green-100">Tổng tiền</th>
                          </tr>
                          <tr className="bg-[#3F72AF]/90 text-white/90 text-[11px] uppercase tracking-wider">
                            <th className="px-4 py-2 border-r border-[#112D4E]/30 text-center">Ngày</th>
                            <th className="px-4 py-2 text-right">Số cũ</th>
                            <th className="px-4 py-2 text-right">Số mới</th>
                            <th className="px-4 py-2 text-right border-r border-[#112D4E]/30">Tiêu thụ</th>
                            <th className="px-4 py-2 text-right">Số cũ</th>
                            <th className="px-4 py-2 text-right">Số mới</th>
                            <th className="px-4 py-2 text-right border-r border-[#112D4E]/30">Tiêu thụ</th>
                            <th className="px-4 py-2 text-right"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {utilityInvoices.map((inv) => {
                            const dateStr = inv.invoice_date || inv.billing_period_end || inv.created_at
                            const date = dateStr ? new Date(dateStr) : null
                            const dayStr = date ? String(date.getDate()).padStart(2, '0') : ''
                            const monthYearStr = `${String(inv.month).padStart(2, '0')}/${inv.year}`
                            return (
                              <tr key={inv.id} className="hover:bg-gray-50 transition">
                                <td className="px-4 py-3 text-center border-r border-gray-100">
                                  {dayStr && <div className="text-xs text-gray-400">ngày {dayStr}</div>}
                                  <div className="font-bold text-gray-700">{monthYearStr}</div>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-500 tabular-nums">{inv.electric_old}</td>
                                <td className="px-4 py-3 text-right text-gray-900 font-semibold tabular-nums">{inv.electric_new}</td>
                                <td className="px-4 py-3 text-right bg-yellow-50/50 text-yellow-700 font-bold border-r border-gray-100 tabular-nums">
                                  +{inv.electric_usage} <span className="text-[10px] font-normal text-yellow-600/70">kWh</span>
                                </td>
                                <td className="px-4 py-3 text-right text-gray-500 tabular-nums">{inv.water_old}</td>
                                <td className="px-4 py-3 text-right text-gray-900 font-semibold tabular-nums">{inv.water_new}</td>
                                <td className="px-4 py-3 text-right bg-blue-50/50 text-blue-700 font-bold border-r border-gray-100 tabular-nums">
                                  +{inv.water_usage} <span className="text-[10px] font-normal text-blue-600/70">m³</span>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                  <div className="font-bold text-gray-800">{formatVND(inv.total_amount)} đ</div>
                                  <div className={`text-[10px] mt-0.5 ${inv.payment_status === 'paid' ? 'text-emerald-600 font-semibold' : inv.payment_status === 'partial' ? 'text-orange-500' : 'text-gray-400'}`}>
                                    {inv.payment_status === 'paid' ? '✓ Đã thu' : inv.payment_status === 'partial' ? `Đã thu ${formatVND(inv.paid_amount || 0)}đ` : 'Chưa thu'}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center gap-3 justify-end">
            {room.status === 'occupied' && (
              <button
                disabled={markLeftMut.isPending || vacateMut.isPending}
                onClick={() => setConfirmVacate(true)}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 transition mr-auto border border-amber-200 flex items-center gap-2 disabled:opacity-50"
              >
                {(markLeftMut.isPending || vacateMut.isPending)
                  ? <><i className="fa-solid fa-spinner fa-spin"></i> Đang xử lý...</>
                  : <><i className="fa-solid fa-person-walking-arrow-right"></i> Đánh dấu đã chuyển đi</>
                }
              </button>
            )}

            {onOpenInvoice && (
              <button onClick={() => { onClose(); onOpenInvoice(room); }} className="px-5 py-2.5 rounded-lg text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition border border-blue-200">
                <i className="fa-solid fa-file-invoice mr-1"></i> Lập hóa đơn
              </button>
            )}

            <button onClick={onClose} className="px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark transition shadow-md">
              Đóng
            </button>
          </div>
        </div>
      </div>

      {confirmVacate && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setConfirmVacate(false)}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_0.15s_ease-out]" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center gap-3 px-6 pb-4 pt-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
                <i className="fa-solid fa-person-walking-arrow-right text-2xl text-amber-500"></i>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Xác nhận chuyển đi?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Phòng đang mở sẽ được chuyển về trạng thái <strong>"Đang trống"</strong> và hợp đồng hiện tại sẽ bị đóng.
                </p>
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-left text-xs font-medium text-amber-700">
                  <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0"></i>
                  <span>Lưu ý: Nếu còn hóa đơn chưa tất toán, vui lòng nhắc khách tất toán trước.</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setConfirmVacate(false)}
                className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                disabled={markLeftMut.isPending || vacateMut.isPending}
                onClick={() => {
                  if (activeContract?.tenant_id) {
                    markLeftMut.mutate(activeContract.tenant_id);
                  } else {
                    vacateMut.mutate();
                  }
                  setConfirmVacate(false);
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white transition hover:bg-amber-600 disabled:opacity-60"
              >
                {(markLeftMut.isPending || vacateMut.isPending) ? (
                  <><i className="fa-solid fa-spinner fa-spin"></i> Đang xử lý</>
                ) : (
                  <><i className="fa-solid fa-check"></i> Xác nhận</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
