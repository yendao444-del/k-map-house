import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRooms, addRoomAsset, type AssetType } from '../lib/db';

interface AddAssetModalProps {
    onClose: () => void;
    defaultRoomId?: string;
    onSuccess?: () => void;
}

export const AddAssetModal: React.FC<AddAssetModalProps> = ({ onClose, defaultRoomId, onSuccess }) => {
    const queryClient = useQueryClient();
    const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms });

    const [roomId, setRoomId] = useState<string>(defaultRoomId || '');
    const [name, setName] = useState('');
    const [type, setType] = useState<AssetType>('furniture');
    const [icon, setIcon] = useState('fa-box');

    const addMutation = useMutation({
        mutationFn: async () => {
            if (!roomId || !name.trim()) throw new Error('Vui lòng điền đủ thông tin phòng và tên tài sản');
            await addRoomAsset({
                room_id: roomId,
                name: name.trim(),
                type,
                icon,
                status: 'ok',
                quantity: 1,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['allRoomAssets'] });
            if (onSuccess) onSuccess();
            onClose();
        }
    });

    // Helper danh sách các icon thường dùng
    const iconList = [
        { id: 'fa-bed', label: 'Giường', type: 'furniture' },
        { id: 'fa-couch', label: 'Sofa/Tủ', type: 'furniture' },
        { id: 'fa-box', label: 'Khác', type: 'furniture' },
        { id: 'fa-snowflake', label: 'Lạnh', type: 'appliance' },
        { id: 'fa-fan', label: 'Quạt', type: 'appliance' },
        { id: 'fa-tv', label: 'Tivi', type: 'appliance' },
        { id: 'fa-faucet-drip', label: 'Nước', type: 'plumbing' },
        { id: 'fa-plug', label: 'Điện', type: 'electrical' },
        { id: 'fa-lightbulb', label: 'Đèn', type: 'electrical' }
    ];

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] font-['Plus_Jakarta_Sans'] p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform scale-100 transition-all">
                {/* Header Modal */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                            <i className="fa-solid fa-boxes-packing text-lg"></i>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-slate-900 text-lg">Thêm tài sản</h3>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Khởi tạo dữ liệu thực</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-800 flex items-center justify-center transition-colors">
                        <i className="fa-solid fa-times"></i>
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Select Room */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Thuộc phòng</label>
                        <select
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value)}
                            disabled={!!defaultRoomId}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-emerald-500 focus:border-emerald-500 block p-3 font-medium outline-none transition-all disabled:opacity-50"
                        >
                            <option value="">-- Chọn phòng --</option>
                            {rooms.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tên tài sản</label>
                        <input
                            type="text"
                            placeholder="Ví dụ: Máy lạnh Panasonic, Giường ngủ 1m6..."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-emerald-500 focus:border-emerald-500 block p-3 font-medium outline-none transition-all"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Phân loại & Biểu tượng</label>
                        <div className="grid grid-cols-4 gap-2 mb-3 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                            {[
                                { val: 'furniture', label: 'Nội thất' },
                                { val: 'appliance', label: 'Điện máy' },
                                { val: 'plumbing', label: 'Hệ Nước' },
                                { val: 'electrical', label: 'Hệ Điện' }
                            ].map(cat => (
                                <button
                                    key={cat.val}
                                    onClick={() => setType(cat.val as AssetType)}
                                    className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all ${type === cat.val ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Icon Picker */}
                        <div className="flex flex-wrap gap-2">
                            {iconList.filter(i => i.type === type).map((i) => (
                                <button
                                    key={i.id}
                                    onClick={() => setIcon(i.id)}
                                    title={i.label}
                                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${icon === i.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-100'}`}
                                >
                                    <i className={`fa-solid ${i.id}`}></i>
                                </button>
                            ))}
                        </div>
                    </div>

                    {addMutation.isError && (
                        <p className="text-red-500 text-xs font-bold text-center bg-red-50 p-2 rounded-lg">{(addMutation.error as Error).message}</p>
                    )}

                    <button
                        onClick={() => addMutation.mutate()}
                        disabled={addMutation.isPending || !roomId || !name}
                        className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 mt-4 shadow-xl shadow-slate-900/20"
                    >
                        {addMutation.isPending ? 'Đang thêm...' : 'THÊM VÀO PHÒNG NÀY'}
                    </button>
                </div>
            </div>
        </div>
    );
};
