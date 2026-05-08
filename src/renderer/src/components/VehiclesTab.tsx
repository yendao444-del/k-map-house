import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVehicles, addRoomVehicle, updateRoomVehicle, deleteRoomVehicle, type RoomVehicle, type Room } from '../lib/db';

import vehicleSvgScooter from '../assets/vehicles/scooter.svg';
import vehicleSvgMoto from '../assets/vehicles/motorcycle.svg';
import vehicleSvgElectric from '../assets/vehicles/electric.svg';
import vehicleSvgBicycle from '../assets/vehicles/bicycle.svg';
import { LogoLoading } from './LogoLoading';

const getVehicleImage = (brand: string): string => {
    const b = brand.toLowerCase();
    // Xe điện
    if (b.includes('vinfast') || b.includes('klara') || b.includes('feliz') || b.includes('evo') || b.includes('xe điện') || b.includes('electric')) return vehicleSvgElectric;
    // Xe đạp
    if (b.includes('đạp') || b.includes('bicycle') || b.includes('mtb') || b.includes('giant') || b.includes('trek')) return vehicleSvgBicycle;
    // Xe số / thể thao
    if (b.includes('exciter') || b.includes('winner') || b.includes('raider') || b.includes('satria') || b.includes('sonic') || b.includes('future') || b.includes('sirius') || b.includes('wave') || b.includes('dream')) return vehicleSvgMoto;
    // Tay ga mặc định (SH, Vision, Air Blade, Vespa, Piaggio, NVX, Medley, Lead...)
    return vehicleSvgScooter;
};

export const RoomVehiclePanel: React.FC<{ room: Room }> = ({ room }) => {
    const queryClient = useQueryClient();
    const { data: vehicles = [], isLoading: isVehiclesLoading } = useQuery({ queryKey: ['vehicles'], queryFn: getVehicles });

    const [searchQuery, setSearchQuery] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editVehicleId, setEditVehicleId] = useState<string | null>(null);
    const [deleteConfirmVehicle, setDeleteConfirmVehicle] = useState<RoomVehicle | null>(null);

    const deleteMut = useMutation({
        mutationFn: (id: string) => deleteRoomVehicle(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        }
    });

    const filteredVehicles = useMemo(() => {
        return vehicles.filter(v => {
            if (v.room_id !== room.id) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const plateMatch = v.license_plate?.toLowerCase().includes(q) ?? false;
                const ownerMatch = v.owner_name?.toLowerCase().includes(q) ?? false;
                return plateMatch || ownerMatch;
            }
            return true;
        }).sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime());
    }, [vehicles, room.id, searchQuery]);

    const roomVehicleCount = vehicles.filter(v => v.room_id === room.id).length;
    const isOccupied = room.status === 'occupied' || room.status === 'ending';
    const showNoVehicleWarning = isOccupied && roomVehicleCount === 0;

    if (isVehiclesLoading) {
        return <LogoLoading className="flex-1 bg-slate-50" />;
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
            {showNoVehicleWarning && (
                <div className="mx-5 mt-4 shrink-0 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <i className="fa-solid fa-triangle-exclamation text-amber-500 shrink-0 text-base"></i>
                    <div>
                        <span className="font-semibold">Chưa có phương tiện!</span>
                        <span className="ml-1">Phòng này chưa đăng ký xe nào. Hãy nhấn <span className="font-semibold">"Đăng ký xe mới"</span> để thêm.</span>
                    </div>
                </div>
            )}
            {/* Header Widget */}
            <div className="px-5 py-4 border-b border-gray-100 bg-white flex items-center justify-between shrink-0">
                <div>
                    <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                        <i className="fa-solid fa-door-open text-primary text-sm"></i>
                        {room.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">{filteredVehicles.length} phương tiện</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative w-64">
                        <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        <input
                            type="text"
                            placeholder="Tìm biển số, chủ xe..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-white border border-slate-200 shadow-sm rounded-lg pl-9 pr-4 py-2 focus:ring-2 focus:ring-primary/20 outline-none transition text-xs"
                        />
                    </div>
                    <button onClick={() => setIsAddModalOpen(true)} className="bg-gray-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-800 transition shadow-sm flex items-center gap-2 text-xs">
                        <i className="fa-solid fa-plus"></i> Đăng ký xe mới
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col">
                <div className="overflow-x-auto overflow-y-visible custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-400 uppercase tracking-widest font-bold border-b border-slate-100 z-10">
                            <tr>
                                <th className="px-6 py-4">Biển số xe</th>
                                <th className="px-6 py-4">Chủ xe</th>
                                <th className="px-6 py-4">Loại xe / Màu</th>
                                <th className="px-6 py-4">Ngày đăng ký</th>
                                <th className="px-6 py-4 text-center">Tác vụ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 text-sm">
                            {filteredVehicles.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                                        <i className="fa-solid fa-motorcycle text-3xl opacity-50 mb-3"></i>
                                        <p className="text-[13px] font-medium">Không có phương tiện nào</p>
                                    </td>
                                </tr>
                            )}
                            {filteredVehicles.map(vehicle => {
                                return (
                                    <tr key={vehicle.id} className="hover:bg-slate-50/80 transition group">
                                        <td className="px-6 py-4 font-mono font-bold text-slate-800 text-[13px]">
                                            <div className="text-gray-900 font-bold uppercase tracking-wider">{vehicle.license_plate}</div>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-800">
                                            {vehicle.owner_name || <span className="text-slate-400 italic font-normal text-xs">Chưa rõ</span>}
                                        </td>
                                        <td className="px-6 py-4">
                                            {(() => {
                                                const img = getVehicleImage(vehicle.brand || '');
                                                return (
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-16 h-10 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                                                            <img src={img} alt={vehicle.brand || 'Xe máy'} className="w-full h-full object-contain p-1" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-900 text-[12px]">{vehicle.brand || 'Chưa rõ'}</span>
                                                            {vehicle.color && <span className="text-[11px] text-gray-400">{vehicle.color}</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[12px] text-slate-500 font-medium">{new Date(vehicle.registered_at).toLocaleDateString('vi-VN')}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => setEditVehicleId(vehicle.id)}
                                                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition flex items-center justify-center shadow-sm"
                                                    title="Sửa"
                                                >
                                                    <i className="fa-solid fa-pen text-[11px]"></i>
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirmVehicle(vehicle)}
                                                    className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition flex items-center justify-center shadow-sm"
                                                    title="Xóa"
                                                >
                                                    <i className="fa-solid fa-trash-can text-[11px]"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <div>Tổng cộng: {filteredVehicles.length} phương tiện</div>
                </div>
            </div>

            {isAddModalOpen && (
                <VehicleFormModal
                    onClose={() => setIsAddModalOpen(false)}
                    rooms={[room]} // Chỉ có phòng hiện tại
                />
            )}

            {editVehicleId && (() => {
                const vehicle = vehicles.find(v => v.id === editVehicleId);
                if (!vehicle) return null;
                return (
                    <VehicleFormModal
                        vehicle={vehicle}
                        onClose={() => setEditVehicleId(null)}
                        rooms={[room]}
                    />
                );
            })()}

            {/* Custom Confirm Delete Modal */}
            {deleteConfirmVehicle && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setDeleteConfirmVehicle(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[fadeIn_0.15s_ease-out]"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-3">
                            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center">
                                <i className="fa-solid fa-trash-can text-red-500 text-2xl"></i>
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 text-base">Xóa phương tiện</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Bạn có chắc muốn xóa xe biển số{' '}
                                    <span className="font-bold text-gray-800 font-mono">{deleteConfirmVehicle.license_plate}</span>?
                                </p>
                                <p className="text-xs text-red-500 mt-2">Hành động này không thể hoàn tác.</p>
                            </div>
                        </div>
                        {/* Actions */}
                        <div className="px-6 pb-6 flex gap-3">
                            <button
                                onClick={() => setDeleteConfirmVehicle(null)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={() => {
                                    deleteMut.mutate(deleteConfirmVehicle.id);
                                    setDeleteConfirmVehicle(null);
                                }}
                                disabled={deleteMut.isPending}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 transition flex items-center justify-center gap-2"
                            >
                                {deleteMut.isPending
                                    ? <><i className="fa-solid fa-spinner fa-spin"></i> Đang xóa...</>
                                    : <><i className="fa-solid fa-trash-can"></i> Xóa xe</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const VehicleFormModal = ({ onClose, rooms, vehicle }: { onClose: () => void, rooms: Room[], vehicle?: RoomVehicle }) => {
    const queryClient = useQueryClient();
    const isEdit = !!vehicle;
    const [selectedRoomId, setSelectedRoomId] = useState<string>(vehicle?.room_id || (rooms.length === 1 ? rooms[0].id : ''));
    const [ownerName, setOwnerName] = useState<string>(vehicle?.owner_name || (!isEdit && rooms.length === 1 && rooms[0].tenant_name ? rooms[0].tenant_name : ''));

    const handleRoomChange = (roomId: string) => {
        setSelectedRoomId(roomId);
        // Tự điền tên chủ xe từ tenant_name của phòng được chọn
        if (!isEdit || !vehicle?.owner_name) {
            const room = rooms.find(r => r.id === roomId);
            if (room?.tenant_name) {
                setOwnerName(room.tenant_name);
            }
        }
    };

    const addMut = useMutation({
        mutationFn: (data: Partial<RoomVehicle>) => addRoomVehicle(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            onClose();
        }
    });

    const updateMut = useMutation({
        mutationFn: (data: Partial<RoomVehicle>) => updateRoomVehicle(vehicle!.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
            onClose();
        }
    });

    const isPending = addMut.isPending || updateMut.isPending;
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const roomId = selectedRoomId;
        const licensePlate = (fd.get('license_plate') as string).trim();
        const brand = (fd.get('brand') as string).trim();
        const color = (fd.get('color') as string).trim();

        if (!roomId || !licensePlate) {
            setLocalError('Vui lòng chọn phòng và nhập biển số xe.');
            return;
        }

        const payload = {
            room_id: roomId,
            license_plate: licensePlate,
            owner_name: ownerName,
            brand,
            color,
        };

        if (isEdit) {
            updateMut.mutate(payload);
        } else {
            addMut.mutate(payload);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-[100]" onClick={onClose}>
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-gray-200 animate-[fadeIn_0.15s_ease-out]" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                            <i className="fa-solid fa-motorcycle"></i>
                        </div>
                        {isEdit ? 'Sửa thông tin phương tiện' : 'Đăng ký vé xe / thẻ xe'}
                    </h3>
                    <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition text-gray-500">
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[13px] font-bold text-slate-700 mb-1.5">Phòng (Người đăng ký) <span className="text-red-500">*</span></label>
                        {rooms.length === 0 ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-700 flex items-center gap-2">
                                <i className="fa-solid fa-triangle-exclamation shrink-0"></i>
                                <span>Không có phòng nào đang có người ở. Hãy kiểm tra lại thông tin hợp đồng.</span>
                            </div>
                        ) : (
                            <select
                                name="room_id"
                                value={selectedRoomId}
                                onChange={e => handleRoomChange(e.target.value)}
                                required
                                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-[13px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white cursor-pointer"
                            >
                                <option value="" disabled>--- Chọn phòng đang có người ở ---</option>
                                {rooms.map(r => (
                                    <option key={r.id} value={r.id}>
                                        {r.name}{r.tenant_name ? ` — ${r.tenant_name}` : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-slate-700 mb-1.5">Biển số xe <span className="text-red-500">*</span></label>
                        <input name="license_plate" defaultValue={vehicle?.license_plate} required type="text" placeholder="VD: 59X1-123.45" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-[13px] font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white uppercase" />
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-slate-700 mb-1.5">
                            Tên chủ xe
                            {selectedRoomId && rooms.find(r => r.id === selectedRoomId)?.tenant_name && (
                                <span className="ml-2 text-[11px] font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                    <i className="fa-solid fa-magic-wand-sparkles mr-1"></i>Tự điền từ khách thuê
                                </span>
                            )}
                        </label>
                        <input
                            name="owner_name"
                            value={ownerName}
                            onChange={e => setOwnerName(e.target.value)}
                            type="text"
                            placeholder="Nguyễn Văn A"
                            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-[13px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">Loại xe / Hãng</label>
                            <input name="brand" defaultValue={vehicle?.brand} type="text" placeholder="Honda Wave" className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-[13px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white" />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">Màu xe</label>
                            <input name="color" defaultValue={vehicle?.color} type="text" placeholder="Đỏ đen..." className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-[13px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition bg-white" />
                        </div>
                    </div>
                    {localError || addMut.error || updateMut.error ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                            <i className="fa-solid fa-circle-exclamation shrink-0"></i>
                            <span>{localError || (addMut.error as Error)?.message || (updateMut.error as Error)?.message}</span>
                        </div>
                    ) : null}
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 rounded-b-2xl">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 transition shadow-sm">Hủy</button>
                    <button type="submit" disabled={isPending} className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white bg-primary shadow-sm hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center gap-2">
                        {isPending ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>} {isEdit ? 'Lưu thay đổi' : 'Đăng ký xe'}
                    </button>
                </div>
            </form>
        </div>
    );
};
