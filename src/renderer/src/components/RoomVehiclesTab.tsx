import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Room, getRoomVehicles, addRoomVehicle, deleteRoomVehicle } from '../lib/db';

export const RoomVehiclesTab: React.FC<{ room: Room }> = ({ room }) => {
  const queryClient = useQueryClient();
  const [newPlate, setNewPlate] = useState('');

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['room_vehicles', room.id],
    queryFn: () => getRoomVehicles(room.id)
  });

  const addMutation = useMutation({
    mutationFn: (plate: string) => addRoomVehicle({ room_id: room.id, license_plate: plate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room_vehicles', room.id] });
      setNewPlate('');
    },
    onError: (err: any) => {
      alert(err.message || 'Lỗi khi thêm xe');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRoomVehicle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['room_vehicles', room.id] });
    }
  });

  const maxVehicles = room.max_vehicles ?? 3;
  const isFull = vehicles.length >= maxVehicles;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlate.trim()) return;
    addMutation.mutate(newPlate.trim());
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 animate-[fadeIn_0.2s_ease-out]">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <i className="fa-solid fa-motorcycle text-indigo-600"></i>
          Quản Lý Phương Tiện
        </h3>
        <div className="text-sm font-medium text-gray-500 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
          Giới hạn: <span className={isFull ? 'text-red-500 font-bold' : 'text-green-600 font-bold'}>{vehicles.length}/{maxVehicles}</span> xe
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-gray-400">Đang tải danh sách xe...</div>
        ) : vehicles.length === 0 ? (
          <div className="col-span-full text-center py-10 bg-gray-50 border border-dashed border-gray-200 rounded-xl">
            <div className="text-gray-300 text-4xl mb-3"><i className="fa-solid fa-motorcycle"></i></div>
            <div className="text-gray-500 font-medium">Chưa có phương tiện nào đăng ký</div>
          </div>
        ) : (
          vehicles.map((v) => (
            <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50/50 group hover:bg-white hover:border-indigo-200 transition">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg">
                  <i className="fa-solid fa-id-card"></i>
                </div>
                <div>
                  <div className="font-bold text-gray-900 tracking-wider font-mono text-lg">{v.license_plate}</div>
                  <div className="text-[10px] text-gray-400">Đăng ký: {new Date(v.registered_at).toLocaleDateString('vi-VN')}</div>
                </div>
              </div>
              <button
                onClick={() => { if(window.confirm('Xóa biển số xe này?')) deleteMutation.mutate(v.id) }}
                className="w-8 h-8 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition opacity-0 group-hover:opacity-100"
                title="Xóa"
              >
                <i className="fa-solid fa-trash-can"></i>
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleAdd} className="flex gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
            <i className="fa-solid fa-keyboard"></i>
          </div>
          <input
            type="text"
            placeholder="Nhập biển số xe (VD: 51G-123.45)..."
            value={newPlate}
            onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
            disabled={isFull || addMutation.isPending}
            className="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block pl-10 p-2.5 outline-none disabled:bg-gray-100 disabled:text-gray-400 uppercase font-mono"
            required
          />
        </div>
        <button
          type="submit"
          disabled={isFull || !newPlate.trim() || addMutation.isPending}
          className="px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 transition shadow-sm whitespace-nowrap"
        >
          {addMutation.isPending ? 'Đang thêm...' : isFull ? 'Đã đủ xe' : '+ Thêm Xe'}
        </button>
      </form>
    </div>
  );
};
