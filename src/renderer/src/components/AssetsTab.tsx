import React, { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addRoomAsset,
  createAssetSnapshots,
  createRoomAssetAdjustment,
  deleteRoomAsset,
  getAllRoomAssets,
  getAssetSnapshots,
  getRoomAssetAdjustments,
  getRoomAssets,
  getRooms,
  updateRoomAsset,
  type AssetSnapshot,
  type Room,
  type RoomAsset,
} from '../lib/db';
import { RoomVehiclePanel } from './VehiclesTab';

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);
const parseVNDInput = (value: string) => Number(value.replace(/\D/g, '')) || 0;

const conditionLabels: Record<string, { label: string; color: string }> = {
  new: { label: 'Mới', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  good: { label: 'Tốt', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  worn: { label: 'Cũ', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  broken: { label: 'Hỏng', color: 'text-red-600 bg-red-50 border-red-200' },
  missing: { label: 'Mất', color: 'text-gray-600 bg-gray-100 border-gray-300' },
};

const assetTemplates = [
  'Bóng đèn',
  'Thiết bị vệ sinh',
  'Vòi nước',
  'Bếp gas',
  'Giường',
  'Điều hòa',
  'Tủ quần áo',
  'Bàn + Ghế',
  'Quạt trần',
  'Máy nóng lạnh',
  'Khóa cửa',
  'Tủ lạnh',
  'Máy giặt',
  'TV',
  'Tủ giày',
  'Ổ điện',
];

const assetIcon = (name: string) => {
  if (name.includes('đèn')) return 'fa-lightbulb';
  if (name.includes('Giường')) return 'fa-bed';
  if (name.includes('Khóa')) return 'fa-lock';
  if (name.includes('TV')) return 'fa-tv';
  if (name.includes('Điều hòa')) return 'fa-wind';
  if (name.includes('Tủ lạnh')) return 'fa-snowflake';
  if (name.includes('Tủ')) return 'fa-box-archive';
  if (name.includes('Vòi')) return 'fa-faucet';
  if (name.includes('sinh')) return 'fa-toilet';
  if (name.includes('Bàn + Ghế')) return 'fa-chair';
  if (name.includes('Quạt')) return 'fa-fan';
  if (name.includes('nóng lạnh')) return 'fa-temperature-half';
  if (name.includes('giặt')) return 'fa-soap';
  if (name.includes('điện')) return 'fa-plug-circle-bolt';
  if (name.includes('gas')) return 'fa-fire-burner';
  return 'fa-cube';
};

const assetColor = (name: string) => {
  if (name.includes('đèn')) return 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100 hover:border-yellow-200';
  if (name.includes('Giường')) return 'text-amber-700 bg-amber-50 hover:bg-amber-100 hover:border-amber-200';
  if (name.includes('sinh')) return 'text-rose-600 bg-rose-50 hover:bg-rose-100 hover:border-rose-200';
  if (name.includes('TV')) return 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-200';
  if (name.includes('Điều hòa')) return 'text-cyan-600 bg-cyan-50 hover:bg-cyan-100 hover:border-cyan-200';
  if (name.includes('Tủ lạnh')) return 'text-sky-600 bg-sky-50 hover:bg-sky-100 hover:border-sky-200';
  if (name.includes('Tủ')) return 'text-violet-600 bg-violet-50 hover:bg-violet-100 hover:border-violet-200';
  if (name.includes('Vòi')) return 'text-blue-600 bg-blue-50 hover:bg-blue-100 hover:border-blue-200';
  if (name.includes('nóng lạnh')) return 'text-teal-600 bg-teal-50 hover:bg-teal-100 hover:border-teal-200';
  if (name.includes('Bàn + Ghế')) return 'text-orange-700 bg-orange-50 hover:bg-orange-100 hover:border-orange-200';
  if (name.includes('Quạt')) return 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-200';
  if (name.includes('điện')) return 'text-lime-600 bg-lime-50 hover:bg-lime-100 hover:border-lime-200';
  if (name.includes('gas')) return 'text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-200';
  if (name.includes('Khóa')) return 'text-slate-600 bg-slate-50 hover:bg-slate-100 hover:border-slate-200';
  return 'text-gray-600 bg-gray-50 hover:bg-gray-100 hover:border-gray-200';
};

const getAssetTheme = (name: string) => {
  if (name.includes('đèn')) return 'bg-gradient-to-br from-yellow-100 to-amber-200 text-amber-600 border-yellow-200';
  if (name.includes('Giường')) return 'bg-gradient-to-br from-amber-100 to-orange-200 text-orange-700 border-amber-200';
  if (name.includes('sinh')) return 'bg-gradient-to-br from-rose-100 to-rose-200 text-rose-600 border-rose-200';
  if (name.includes('TV')) return 'bg-gradient-to-br from-indigo-100 to-purple-200 text-indigo-600 border-indigo-200';
  if (name.includes('Điều hòa')) return 'bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-600 border-cyan-200';
  if (name.includes('Tủ lạnh')) return 'bg-gradient-to-br from-sky-100 to-sky-200 text-sky-600 border-sky-200';
  if (name.includes('Tủ')) return 'bg-gradient-to-br from-violet-100 to-violet-200 text-violet-600 border-violet-200';
  if (name.includes('Vòi')) return 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600 border-blue-200';
  if (name.includes('nóng lạnh')) return 'bg-gradient-to-br from-teal-100 to-emerald-200 text-teal-600 border-teal-200';
  if (name.includes('Bàn + Ghế')) return 'bg-gradient-to-br from-orange-100 to-orange-200 text-orange-700 border-orange-200';
  if (name.includes('Quạt')) return 'bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-600 border-emerald-200';
  if (name.includes('điện')) return 'bg-gradient-to-br from-lime-100 to-lime-200 text-lime-700 border-lime-200';
  if (name.includes('gas')) return 'bg-gradient-to-br from-red-100 to-red-200 text-red-600 border-red-200';
  if (name.includes('Khóa')) return 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 border-slate-200';
  return 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600 border-gray-200';
};

const HANDOVER_ITEMS = [
  { id: '__check_cleared', label: 'Khách đã dọn hết đồ cá nhân ra khỏi phòng', icon: 'fa-box-open' },
  { id: '__check_cleaned', label: 'Phòng đã được vệ sinh sạch sẽ', icon: 'fa-broom' },
  { id: '__check_keys', label: 'Đã thu hồi chìa khóa / thẻ / remote', icon: 'fa-key' },
];

const getHandoverSnapshotKey = (snap: Pick<AssetSnapshot, 'room_asset_id' | 'note'>) =>
  snap.note || snap.room_asset_id;

const ConfirmModal: React.FC<{
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
}> = ({ message, onConfirm, onCancel, confirmDisabled = false }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !confirmDisabled) {
        event.preventDefault();
        onConfirm();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmDisabled, onCancel, onConfirm]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="font-bold text-gray-900">Xác nhận xóa</h4>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Hủy
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
};

type PendingReceive = { roomId: string; roomName: string };

const RoomAssetPanel: React.FC<{
  room: Room;
  onReceivePendingChange?: (pending: PendingReceive | null) => void;
  guideMode?: 'move_in' | 'move_out' | null;
  guideRoomId?: string | null;
  onGuideHandled?: () => void;
}> = ({ room, onReceivePendingChange, guideMode, guideRoomId, onGuideHandled }) => {
  const queryClient = useQueryClient();
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['room_assets', room.id],
    queryFn: () => getRoomAssets(room.id),
  });
  const { data: moveInSnaps = [] } = useQuery({
    queryKey: ['asset_snapshots', room.id, 'move_in'],
    queryFn: () => getAssetSnapshots(room.id, 'move_in'),
  });
  const { data: moveOutSnaps = [] } = useQuery({
    queryKey: ['asset_snapshots', room.id, 'move_out'],
    queryFn: () => getAssetSnapshots(room.id, 'move_out'),
  });
  const { data: handoverSnaps = [] } = useQuery({
    queryKey: ['asset_snapshots', room.id, 'handover'],
    queryFn: () => getAssetSnapshots(room.id, 'handover'),
  });
  const { data: adjustments = [] } = useQuery({
    queryKey: ['room_asset_adjustments', room.id],
    queryFn: () => getRoomAssetAdjustments(room.id),
  });

  const [modal, setModal] = useState<'add' | 'adjust' | 'move_in' | 'move_out' | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<Record<string, number>>({});
  const [manualName, setManualName] = useState('');
  const [adjustMode, setAdjustMode] = useState<'add' | 'update'>('add');
  const [adjustAssetId, setAdjustAssetId] = useState('');
  const [adjustName, setAdjustName] = useState('');
  const [adjustQuantity, setAdjustQuantity] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<RoomAsset | null>(null);
  const [inConditions, setInConditions] = useState<Record<string, string>>({});
  const [outConditions, setOutConditions] = useState<Record<string, string>>({});
  const [outDeductions, setOutDeductions] = useState<Record<string, number>>({});
  const [handoverConditions, setHandoverConditions] = useState<Record<string, 'ok' | 'not_done'>>({});
  const [handoverDeductions, setHandoverDeductions] = useState<Record<string, number>>({});

  const isActiveRentalCycle = room.status === 'occupied' || room.status === 'ending';
  const assetsLocked = isActiveRentalCycle && moveInSnaps.length > 0;
  const hasMoveInHistory = moveInSnaps.length > 0;
  const canAdjustAssets = isActiveRentalCycle && hasMoveInHistory && moveOutSnaps.length === 0;
  const receivePending = assets.length > 0 && moveInSnaps.length === 0;
  const handoverDone =
    handoverSnaps.length > 0 &&
    HANDOVER_ITEMS.every((item) => {
      const snap = handoverSnaps.find((s) => getHandoverSnapshotKey(s) === item.id);
      return snap?.condition === 'ok' || (snap?.condition === 'not_done' && (snap.deduction || 0) > 0);
    });
  const assetDeduction = Object.values(outDeductions).reduce((sum, v) => sum + (v || 0), 0);
  const handoverDeduction = Object.values(handoverDeductions).reduce((sum, v) => sum + (v || 0), 0);
  const totalDeduction = assetDeduction + handoverDeduction;
  const refund = Math.max(0, (room.default_deposit || 0) - totalDeduction);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['room_assets', room.id] });
    queryClient.invalidateQueries({ queryKey: ['allRoomAssets'] });
    queryClient.invalidateQueries({ queryKey: ['asset_snapshots'] });
    queryClient.invalidateQueries({ queryKey: ['room_asset_adjustments', room.id] });
  };

  const addMut = useMutation({
    mutationFn: async () => {
      if (canAdjustAssets) return;
      const entries = Object.entries(selectedAssets);
      await Promise.all(
        entries.map(([name, qty], index) =>
          addRoomAsset({ room_id: room.id, name, quantity: qty, sort_order: assets.length + index + 1 })
        )
      );
    },
    onSuccess: async () => {
      invalidate();
      setSelectedAssets({});
      setManualName('');
      if (moveInSnaps.length === 0) {
        const latestAssets = await getRoomAssets(room.id);
        queryClient.setQueryData(['room_assets', room.id], latestAssets);
        const next: Record<string, string> = {};
        latestAssets.forEach((asset) => {
          next[asset.id] = 'new';
        });
        setInConditions(next);
        setModal('move_in');
        onReceivePendingChange?.({ roomId: room.id, roomName: room.name });
      } else {
        setModal(null);
      }
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<RoomAsset> }) => updateRoomAsset(id, updates),
    onSuccess: () => {
      invalidate();
      setEditId(null);
    },
  });

  const adjustMut = useMutation({
    mutationFn: () =>
      createRoomAssetAdjustment({
        room_id: room.id,
        action: adjustMode,
        room_asset_id: adjustMode === 'update' ? adjustAssetId : undefined,
        name: adjustName.trim(),
        quantity: adjustQuantity,
        reason: adjustReason.trim(),
      }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setAdjustMode('add');
      setAdjustAssetId('');
      setAdjustName('');
      setAdjustQuantity(1);
      setAdjustReason('');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteRoomAsset(id),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
    },
  });

  const saveSnaps = useMutation({
    mutationFn: (data: Partial<AssetSnapshot>[]) => createAssetSnapshots(data),
    onSuccess: () => {
      invalidate();
      if (modal === 'move_in') {
        onReceivePendingChange?.(null);
      }
      setModal(null);
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Khong luu duoc doi chieu tai san.');
    },
  });

  const openMoveIn = () => {
    if (assetsLocked) return;
    const next: Record<string, string> = {};
    assets.forEach((asset) => {
      next[asset.id] = 'new';
    });
    setInConditions(next);
    setModal('move_in');
  };

  useEffect(() => {
    onReceivePendingChange?.(receivePending ? { roomId: room.id, roomName: room.name } : null);
    return () => onReceivePendingChange?.(null);
  }, [receivePending, room.id, room.name, onReceivePendingChange]);

  useEffect(() => {
    const handleOpenMoveIn = (event: Event) => {
      const targetRoomId = (event as CustomEvent<string>).detail;
      if (targetRoomId === room.id && receivePending) {
        openMoveIn();
      }
    };

    window.addEventListener('asset-open-move-in', handleOpenMoveIn);
    return () => window.removeEventListener('asset-open-move-in', handleOpenMoveIn);
  }, [room.id, receivePending, assets, assetsLocked]);

  const openMoveOut = () => {
    const conditions: Record<string, string> = {};
    const deductions: Record<string, number> = {};
    assets.forEach((asset) => {
      const existingOut = moveOutSnaps.find((s) => s.room_asset_id === asset.id);
      const existingIn = moveInSnaps.find((s) => s.room_asset_id === asset.id);
      conditions[asset.id] = existingOut?.condition || existingIn?.condition || 'good';
      deductions[asset.id] = existingOut?.deduction || 0;
    });

    const handover: Record<string, 'ok' | 'not_done'> = {};
    const handoverFees: Record<string, number> = {};
    HANDOVER_ITEMS.forEach((item) => {
      const existing = handoverSnaps.find((s) => getHandoverSnapshotKey(s) === item.id);
      handover[item.id] = (existing?.condition as 'ok' | 'not_done') || 'ok';
      handoverFees[item.id] = existing?.deduction || 0;
    });

    setOutConditions(conditions);
    setOutDeductions(deductions);
    setHandoverConditions(handover);
    setHandoverDeductions(handoverFees);
    setModal('move_out');
  };

  useEffect(() => {
    if (isLoading) return;
    if (!guideMode) return;
    if (guideRoomId && room.id !== guideRoomId) return;

    if (guideMode === 'move_out') {
      window.dispatchEvent(new CustomEvent('start-tour', { detail: 'move_out_asset' }));
      onGuideHandled?.();
      return;
    }

    if (guideMode === 'move_in') {
      const nextTour = assets.length > 0 && !hasMoveInHistory ? 'move_in_asset' : 'add_asset';
      window.dispatchEvent(new CustomEvent('start-tour', { detail: nextTour }));
      onGuideHandled?.();
    }
  }, [guideMode, guideRoomId, isLoading, room.id, assets.length, hasMoveInHistory, onGuideHandled]);

  const openAdjustModal = (asset?: RoomAsset) => {
    if (asset) {
      setAdjustMode('update');
      setAdjustAssetId(asset.id);
      setAdjustName(asset.name);
      setAdjustQuantity(asset.quantity || 1);
    } else {
      setAdjustMode('add');
      setAdjustAssetId('');
      setAdjustName('');
      setAdjustQuantity(1);
    }
    setAdjustReason('');
    setModal('adjust');
  };

  const saveMoveIn = () =>
    saveSnaps.mutate(
      assets.map((asset) => ({
        room_asset_id: asset.id,
        room_id: room.id,
        type: 'move_in' as const,
        condition: inConditions[asset.id] || 'new',
        deduction: 0,
      }))
    );

  const saveMoveOut = () => {
    const handoverAssetId = assets[0]?.id;
    if (!handoverAssetId) {
      alert('Khong tim thay tai san lam moc de luu ban giao phong.');
      return;
    }

    saveSnaps.mutate([
      ...assets.map((asset) => ({
        room_asset_id: asset.id,
        room_id: room.id,
        type: 'move_out' as const,
        condition: outConditions[asset.id] || 'good',
        deduction: outDeductions[asset.id] || 0,
      })),
      ...HANDOVER_ITEMS.map((item) => ({
        room_asset_id: handoverAssetId,
        room_id: room.id,
        type: 'handover' as const,
        condition: handoverConditions[item.id] || 'ok',
        deduction: handoverConditions[item.id] === 'not_done' ? handoverDeductions[item.id] || 0 : 0,
        note: item.id,
      })),
    ]);
  };

  if (isLoading) return <div className="flex-1 p-8 text-center text-sm text-gray-400">Đang tải...</div>;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <i className="fa-solid fa-door-open text-primary text-sm"></i>
            {room.name}
          </h3>
          <p className="mt-0.5 text-xs text-gray-400">
            {assets.length} tài sản · {hasMoveInHistory ? 'Đã chốt nhận' : 'Chưa chốt nhận'}
            {!isActiveRentalCycle && hasMoveInHistory && ' · Phòng trống - đã mở khóa'}
            {moveOutSnaps.length > 0 && ' · Đã đối chiếu'}
            {handoverDone && ' · Đã bàn giao'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-tour="move-in-btn"
            onClick={openMoveIn}
            disabled={hasMoveInHistory}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${hasMoveInHistory ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
          >
            <i className={`fa-solid ${hasMoveInHistory ? 'fa-check-circle' : 'fa-arrow-right-to-bracket'} mr-1.5`}></i>
            {hasMoveInHistory ? 'Đã nhận phòng' : 'Chốt nhận phòng'}
          </button>
          <button
            data-tour="move-out-btn"
            onClick={openMoveOut}
            disabled={!assetsLocked}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${!assetsLocked ? 'opacity-40' : moveOutSnaps.length > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
          >
            <i className={`fa-solid ${moveOutSnaps.length > 0 ? 'fa-check-circle' : 'fa-arrow-right-from-bracket'} mr-1.5`}></i>
            {moveOutSnaps.length > 0 ? 'Đã trả phòng' : 'Khách trả phòng'}
          </button>
          <button
            data-tour="add-asset-btn"
            onClick={() => !canAdjustAssets && setModal('add')}
            disabled={canAdjustAssets}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-primary/20 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            <i className={`fa-solid ${canAdjustAssets ? 'fa-lock' : 'fa-plus'} mr-1.5`}></i>
            Thêm
          </button>
          {canAdjustAssets && (
            <button
              onClick={() => openAdjustModal()}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-amber-200 transition hover:bg-amber-700"
            >
              <i className="fa-solid fa-file-pen mr-1.5"></i>
              Điều chỉnh
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <i className="fa-solid fa-box-open mb-3 text-4xl opacity-20"></i>
            <p className="text-sm font-medium">Phòng chưa có tài sản nào</p>
            {!canAdjustAssets && (
              <button
                onClick={() => setModal('add')}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary/20 transition hover:bg-primary-dark"
              >
                <i className="fa-solid fa-plus"></i>
                Thêm tài sản đầu tiên
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
            {assets.map((asset) => {
              const snapIn = moveInSnaps.find((s) => s.room_asset_id === asset.id);
              const snapOut = moveOutSnaps.find((s) => s.room_asset_id === asset.id);
              const latest = snapOut || snapIn;
              const bad = latest?.condition === 'broken' || latest?.condition === 'missing';
              return (
                <div
                  key={asset.id}
                  className={`rounded-2xl relative flex flex-col transition duration-300 ${(snapOut && snapOut.deduction > 0) ? 'bg-white border-2 border-rose-200 shadow-lg shadow-rose-100/50'
                    : (snapOut && bad) ? 'bg-white border border-red-200 shadow-md'
                      : (snapOut) ? 'bg-white border border-indigo-100 shadow-sm'
                        : (snapIn) ? 'bg-white border border-gray-200 hover:border-blue-200 hover:shadow-lg group/card'
                          : 'bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 group/card'
                    }`}
                  style={{ padding: '0.875rem' }}
                >
                  {/* Hành động nhanh gom gọn */}
                  <div className={`absolute top-2.5 right-2.5 flex gap-1 z-30 transition ${snapIn && !snapOut && !bad ? 'opacity-0 group-hover/card:opacity-100' : (!snapIn ? 'opacity-0 group-hover/card:opacity-100' : '')}`}>
                    {canAdjustAssets ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openAdjustModal(asset);
                        }}
                        title="Điều chỉnh sau chốt nhận"
                        className="w-7 h-7 rounded-full bg-amber-50 text-amber-500 hover:bg-amber-100 flex items-center justify-center transition"
                      >
                        <i className="fa-solid fa-file-pen text-[10px]"></i>
                      </button>
                    ) : (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); setEditId(asset.id); setEditName(asset.name); }} title="Sửa" className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:text-blue-600 hover:bg-blue-100 flex items-center justify-center transition"><i className="fa-solid fa-pen text-[10px]"></i></button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(asset); }} title="Xóa" className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:text-red-600 hover:bg-red-100 flex items-center justify-center transition"><i className="fa-solid fa-xmark text-[10px]"></i></button>
                      </>
                    )}
                  </div>

                  {/* Badge đền bù / Cờ hoàn tất */}
                  {(snapOut && snapOut.deduction > 0) && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full shadow-sm z-20 whitespace-nowrap">
                      ĐỀN BÙ: {formatVND(snapOut.deduction)}đ
                    </div>
                  )}
                  {(snapOut && snapOut.deduction === 0 && !bad) && (
                    <div className="absolute top-3 right-3"><i className="fa-solid fa-shield-heart text-indigo-300 text-lg"></i></div>
                  )}

                  {/* Vùng Header */}
                  <div className="flex items-center gap-3.5 mb-3 flex-1 relative z-10 w-full pr-14">
                    <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 border border-opacity-60 shadow-sm backdrop-blur-sm ${(snapOut && snapOut.deduction > 0) ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-orange-100/40 text-orange-500'
                      : bad ? 'bg-red-50 border-red-100 text-red-500'
                        : getAssetTheme(asset.name)
                      }`}>
                      <i className={`fa-solid ${assetIcon(asset.name)} text-lg drop-shadow-sm`}></i>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col items-start text-left">
                      {editId === asset.id ? (
                        <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onBlur={() => { if (editName.trim()) updateMut.mutate({ id: asset.id, updates: { name: editName.trim() } }); else setEditId(null); }} onKeyDown={e => { if (e.key === 'Enter' && editName.trim()) updateMut.mutate({ id: asset.id, updates: { name: editName.trim() } }); if (e.key === 'Escape') setEditId(null); }} className="w-full text-sm font-extrabold text-blue-700 bg-transparent border-b border-blue-400 outline-none p-0 focus:ring-0" />
                      ) : (
                        <h3 className="font-extrabold text-gray-900 text-[13px] leading-snug truncate w-full" title={asset.name}>{asset.name}</h3>
                      )}
                      <p className="text-[10px] text-gray-500 font-bold mt-[1px] truncate bg-gray-100/80 px-2 py-0.5 rounded-md">SL: {asset.quantity}</p>
                    </div>
                  </div>

                  {/* Vùng Thông tin (Timeline) */}
                  <div className="mt-auto relative z-10 w-full" onClick={e => e.stopPropagation()}>
                    {!snapIn ? (
                      <div className="bg-gray-50/70 rounded-xl p-2 flex flex-col items-center justify-center border border-gray-100/50 h-[46px]">
                        <p className="text-[10px] font-bold text-gray-400 tracking-wide uppercase"><i className="fa-solid fa-hourglass-half mr-1"></i> Chờ chốt nhận</p>
                      </div>
                    ) : snapOut ? (
                      <div className={`bg-white rounded-xl py-1.5 px-3 flex items-center justify-between border ${snapOut.deduction > 0 ? 'border-amber-100 bg-amber-50/20' : bad ? 'border-red-100 bg-red-50/20' : 'border-indigo-50 bg-indigo-50/30'} h-[46px]`}>
                        <div className="flex-[0.45] text-center min-w-0 pr-1">
                          <div className={`text-[10px] font-bold truncate rounded leading-tight px-1 py-0.5 max-w-full ${conditionLabels[snapIn.condition]?.color || 'bg-gray-100 text-gray-600 border-gray-200'}`} title={conditionLabels[snapIn.condition]?.label}>{conditionLabels[snapIn.condition]?.label}</div>
                        </div>
                        <div className="w-[16px] shrink-0 flex items-center justify-center relative h-full">
                          <div className={`absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[2px] ${snapOut.deduction > 0 ? 'bg-red-200' : 'bg-indigo-100'}`}></div>
                          <i className={`fa-solid fa-chevron-right text-[8px] ${snapOut.deduction > 0 ? 'text-red-400' : 'text-indigo-400'} bg-white px-0.5 rounded-full z-10 relative`}></i>
                        </div>
                        <div className="flex-[0.55] text-center min-w-0 pl-1">
                          <div className={`text-[10px] font-bold truncate rounded leading-tight px-1 py-0.5 max-w-full inline-block ${snapOut.deduction > 0 ? 'bg-red-50 text-red-600 border border-red-100' : bad ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-white border-gray-100 border text-indigo-700'}`} title={conditionLabels[snapOut.condition]?.label}>{conditionLabels[snapOut.condition]?.label}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50/70 rounded-xl py-1.5 px-3 flex items-center justify-between border border-slate-100 h-[46px]">
                        <div className="flex-[0.45] text-center min-w-0 pr-1">
                          <div className="text-[8px] tracking-wide text-gray-400 font-bold uppercase mb-[2px]">Lúc nhận</div>
                          <div className={`text-[10px] font-bold truncate rounded leading-tight px-1 py-[1.5px] border max-w-full inline-block ${conditionLabels[snapIn.condition]?.color || 'bg-gray-100 text-gray-600 border-gray-200'}`} title={conditionLabels[snapIn.condition]?.label}>{conditionLabels[snapIn.condition]?.label}</div>
                        </div>
                        <div className="w-[20px] shrink-0 flex items-center justify-center relative h-full">
                          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[1.5px] bg-slate-200"></div>
                        </div>
                        <div className="flex-[0.55] text-center flex flex-col justify-center min-w-0 pl-1">
                          <div className="text-[8px] tracking-wide text-gray-400 font-bold uppercase mb-[2px]">Hiện tại</div>
                          <div className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-md px-1 py-[1.5px] truncate border border-emerald-100">Đang ở</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal === 'add' && !canAdjustAssets && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-2xl rounded-[24px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <h3 className="font-bold text-gray-900 text-lg">Thêm tài sản</h3>
              <button data-tour="add-asset-close" onClick={() => setModal(null)} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>
            <div className="space-y-6 p-6">
              <div data-tour="asset-select-area" className="grid grid-cols-3 sm:grid-cols-4 gap-3 sm:gap-4">
                {assetTemplates.map((name) => {
                  const selected = !!selectedAssets[name];
                  const colorClass = assetColor(name);
                  return (
                    <button
                      key={name}
                      onClick={() =>
                        setSelectedAssets((prev) => {
                          const next = { ...prev };
                          if (next[name]) delete next[name];
                          else next[name] = 1;
                          return next;
                        })
                      }
                      className={`flex flex-col items-center justify-center rounded-2xl border-2 p-3 sm:p-4 text-center transition-all duration-200 ease-out hover:scale-[1.02] ${selected ? 'border-primary bg-primary text-white shadow-lg shadow-primary/30 ring-4 ring-primary/10 scale-[1.02]' : `border-transparent ${colorClass}`}`}
                    >
                      <i className={`fa-solid ${assetIcon(name)} mb-2 sm:mb-2.5 block text-xl sm:text-2xl opacity-90`}></i>
                      <span className="text-[11px] sm:text-xs font-bold leading-tight break-words px-1">{name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 pt-2">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Hoặc nhập tên tài sản không có trong danh sách..."
                  onKeyDown={e => {
                    if (e.key === 'Enter' && manualName.trim()) {
                      setSelectedAssets((prev) => ({ ...prev, [manualName.trim()]: (prev[manualName.trim()] || 0) + 1 }));
                      setManualName('');
                    }
                  }}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-3.5 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
                <button
                  disabled={!manualName.trim()}
                  onClick={() => {
                    setSelectedAssets((prev) => ({ ...prev, [manualName.trim()]: (prev[manualName.trim()] || 0) + 1 }));
                    setManualName('');
                  }}
                  className="flex items-center gap-2 rounded-xl bg-gray-100 px-6 py-3.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-40"
                >
                  <i className="fa-solid fa-plus"></i><span className="hidden sm:inline">Thêm</span>
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/50 px-6 py-5 rounded-b-[24px]">
              <button
                onClick={() => setModal(null)}
                className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-gray-900"
              >
                Hủy
              </button>
              <button
                onClick={() => addMut.mutate()}
                data-tour="save-asset-btn"
                disabled={Object.keys(selectedAssets).length === 0 || addMut.isPending}
                className="rounded-xl bg-gray-900 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-gray-900/20 transition hover:bg-gray-800 disabled:opacity-40"
              >
                {addMut.isPending ? 'Đang thêm...' : `Lưu ${Object.keys(selectedAssets).length > 0 ? `(${Object.keys(selectedAssets).length})` : ''} tài sản`}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'adjust' && canAdjustAssets && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-amber-100 bg-amber-50 px-5 py-4">
              <div>
                <h3 className="font-bold text-amber-900">Điều chỉnh tài sản sau nhận phòng</h3>
                <p className="mt-1 text-xs font-medium text-amber-700">Không sửa mốc chốt nhận ban đầu. Mọi thay đổi sẽ được lưu lịch sử kèm lý do.</p>
              </div>
              <button onClick={() => setModal(null)} className="text-amber-500 hover:text-amber-700"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAdjustMode('add');
                    setAdjustAssetId('');
                    setAdjustName('');
                    setAdjustQuantity(1);
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-bold transition ${adjustMode === 'add' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  Thêm phát sinh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const first = assets[0];
                    setAdjustMode('update');
                    setAdjustAssetId(first?.id || '');
                    setAdjustName(first?.name || '');
                    setAdjustQuantity(first?.quantity || 1);
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-bold transition ${adjustMode === 'update' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  Sửa tài sản hiện có
                </button>
              </div>

              {adjustMode === 'update' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Tài sản cần sửa</span>
                  <select
                    value={adjustAssetId}
                    onChange={(e) => {
                      const asset = assets.find((item) => item.id === e.target.value);
                      setAdjustAssetId(e.target.value);
                      setAdjustName(asset?.name || '');
                      setAdjustQuantity(asset?.quantity || 1);
                    }}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>{asset.name} x{asset.quantity}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="grid grid-cols-[1fr_110px] gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Tên tài sản</span>
                  <input value={adjustName} onChange={(e) => setAdjustName(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Số lượng</span>
                  <input type="number" min={1} value={adjustQuantity} onChange={(e) => setAdjustQuantity(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-gray-500">Lý do điều chỉnh</span>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  rows={3}
                  placeholder="Ví dụ: bổ sung quạt mới cho khách, đổi tên thiết bị do nhập thiếu..."
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>

              {adjustments.length > 0 && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="mb-2 text-xs font-bold uppercase text-gray-500">Lịch sử gần nhất</div>
                  <div className="space-y-2">
                    {adjustments.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="font-bold text-gray-800">{item.action === 'add' ? 'Thêm' : 'Sửa'} · {item.name} x{item.quantity}</div>
                          <div className="truncate text-gray-500">{item.reason}</div>
                        </div>
                        <span className="shrink-0 text-gray-400">{new Date(item.recorded_at).toLocaleDateString('vi-VN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button onClick={() => setModal(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Hủy</button>
              <button
                onClick={() => adjustMut.mutate()}
                disabled={!adjustName.trim() || !adjustReason.trim() || (adjustMode === 'update' && !adjustAssetId) || adjustMut.isPending}
                className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Lưu điều chỉnh
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'move_in' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-blue-100 bg-blue-50 px-5 py-4 font-bold text-blue-900">Chốt nhận phòng · {room.name}</div>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto p-5">
              {assets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between border-b border-gray-50 py-2">
                  <span className="text-sm font-medium text-gray-800">{asset.name} <span className="text-xs text-gray-400">x{asset.quantity}</span></span>
                  <select value={inConditions[asset.id] || 'new'} onChange={(e) => setInConditions((prev) => ({ ...prev, [asset.id]: e.target.value }))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs">
                    <option value="new">Mới</option>
                    <option value="good">Tốt</option>
                    <option value="worn">Cũ</option>
                    <option value="broken">Hỏng</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
              <button onClick={() => setModal(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Hủy</button>
              <button onClick={saveMoveIn} disabled={saveSnaps.isPending || assets.length === 0} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">Lưu tình trạng</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'move_out' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-red-100 bg-red-50 px-5 py-4 font-bold text-red-900">Đối chiếu trả phòng · {room.name}</div>
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Tài sản</th>
                    <th className="px-4 py-3 text-center">Lúc vào</th>
                    <th className="px-4 py-3 text-center">Hiện tại</th>
                    <th className="px-4 py-3 text-right">Đền bù</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {assets.map((asset) => {
                    const snapIn = moveInSnaps.find((s) => s.room_asset_id === asset.id);
                    return (
                      <tr key={asset.id}>
                        <td className="px-4 py-3 font-medium text-gray-800">{asset.name} <span className="text-xs text-gray-400">x{asset.quantity}</span></td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{conditionLabels[snapIn?.condition || '']?.label || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <select value={outConditions[asset.id] || 'good'} onChange={(e) => setOutConditions((prev) => ({ ...prev, [asset.id]: e.target.value }))} className="w-[90px] rounded-lg border border-gray-200 px-2 py-1 text-xs">
                            <option value="new">Mới</option>
                            <option value="good">Tốt</option>
                            <option value="worn">Cũ</option>
                            <option value="broken">Hỏng</option>
                            <option value="missing">Mất</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={outDeductions[asset.id] ? formatVND(outDeductions[asset.id]) : ''}
                            onChange={(e) => setOutDeductions((prev) => ({ ...prev, [asset.id]: parseVNDInput(e.target.value) }))}
                            className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mx-5 mt-6 mb-4">
                <h4 className="mb-3 text-sm font-bold text-gray-800 flex items-center gap-2">
                  <i className="fa-solid fa-list-check text-blue-500"></i> Bàn giao phòng
                </h4>
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="divide-y divide-gray-100">
                    {HANDOVER_ITEMS.map((item) => {
                      const notDone = handoverConditions[item.id] === 'not_done';
                      return (
                        <div key={item.id} className={`p-4 transition ${notDone ? 'bg-rose-50/40' : 'hover:bg-gray-50'}`}>
                          <div className="flex items-center gap-4">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${notDone ? 'border-none bg-rose-100/50 text-rose-500' : 'border-gray-200 bg-white text-gray-400 shadow-sm'}`}>
                              <i className={`fa-solid ${item.icon}`}></i>
                            </div>
                            <span className={`flex-1 text-sm font-medium ${notDone ? 'text-rose-900' : 'text-gray-700'}`}>{item.label}</span>
                            <div className="flex shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100/50 p-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setHandoverConditions((prev) => ({ ...prev, [item.id]: 'ok' }));
                                  setHandoverDeductions((prev) => ({ ...prev, [item.id]: 0 }));
                                }}
                                className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${!notDone ? 'bg-white text-emerald-600 shadow-sm border border-emerald-100' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                Đã hoàn tất
                              </button>
                              <button
                                type="button"
                                onClick={() => setHandoverConditions((prev) => ({ ...prev, [item.id]: 'not_done' }))}
                                className={`rounded-lg px-4 py-1.5 text-xs font-bold transition ${notDone ? 'bg-white text-rose-600 shadow-sm border border-rose-100' : 'text-gray-500 hover:text-gray-700'}`}
                              >
                                Vi phạm
                              </button>
                            </div>
                          </div>
                          {notDone && (
                            <div className="mt-4 pl-14 pr-1">
                              <div className="flex items-center gap-3 rounded-xl border border-rose-100 bg-white px-4 py-3 shadow-sm">
                                <label className="text-[13px] font-bold text-rose-600">Chi phí phạt / Khấu trừ</label>
                                <div className="relative flex-1 max-w-[200px] ml-auto">
                                  <input
                                    autoFocus
                                    type="text"
                                    inputMode="numeric"
                                    value={handoverDeductions[item.id] ? formatVND(handoverDeductions[item.id]) : ''}
                                    onChange={(e) => setHandoverDeductions((prev) => ({ ...prev, [item.id]: parseVNDInput(e.target.value) }))}
                                    className="w-full rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-1.5 pr-8 text-right text-sm font-bold text-rose-700 outline-none focus:border-rose-400 focus:bg-white focus:ring-1 focus:ring-rose-400"
                                    placeholder="0"
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-opacity-50 text-rose-500">đ</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mx-5 my-4 space-y-1.5 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
                <div className="flex justify-between text-gray-600"><span>Tiền cọc ban đầu</span><span className="font-semibold">{formatVND(room.default_deposit || 0)} đ</span></div>
                <div className="flex justify-between text-red-600"><span>Đền bù tài sản</span><span className="font-semibold">Trừ {formatVND(assetDeduction)} đ</span></div>
                {handoverDeduction > 0 && <div className="flex justify-between text-amber-600"><span>Chi phí bàn giao</span><span className="font-semibold">Trừ {formatVND(handoverDeduction)} đ</span></div>}
                <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold"><span>Tổng khấu trừ</span><span className="text-red-600">{formatVND(totalDeduction)} đ</span></div>
                <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold"><span>Hoàn trả khách</span><span className="text-emerald-600">{formatVND(refund)} đ</span></div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">
              <button onClick={() => setModal(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Hủy</button>
              <button onClick={saveMoveOut} disabled={saveSnaps.isPending || Object.keys(handoverConditions).length < HANDOVER_ITEMS.length} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">Lưu & Chốt đối chiếu</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          message={`Bạn có chắc muốn xóa tài sản "${confirmDelete.name}" không? Hành động này không thể hoàn tác.`}
          onConfirm={() => deleteMut.mutate(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
          confirmDisabled={deleteMut.isPending}
        />
      )}
    </div>
  );
};

export const AssetsTab: React.FC<{
  initialRoomId?: string | null;
  onReceivePendingChange?: (pending: PendingReceive | null) => void;
  guideMode?: 'move_in' | 'move_out' | null;
  guideRoomId?: string | null;
  onGuideHandled?: () => void;
}> = ({ initialRoomId, onReceivePendingChange, guideMode, guideRoomId, onGuideHandled }) => {
  const { data: rooms = [], isLoading } = useQuery({ queryKey: ['rooms'], queryFn: getRooms });
  const { data: allAssets = [] } = useQuery({ queryKey: ['allRoomAssets'], queryFn: getAllRoomAssets });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialRoomId || null);
  const [subTab, setSubTab] = useState<'assets' | 'vehicles'>('assets');
  const [receivePending, setReceivePending] = useState<PendingReceive | null>(null);
  const [receivePrompt, setReceivePrompt] = useState<PendingReceive | null>(null);
  const pendingActionRef = React.useRef<(() => void) | null>(null);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || null;

  const handleReceivePendingChange = useCallback((pending: PendingReceive | null) => {
    setReceivePending(pending);
    onReceivePendingChange?.(pending);
  }, [onReceivePendingChange]);

  const confirmPendingReceive = (next: () => void) => {
    if (receivePending) {
      pendingActionRef.current = next;
      setReceivePrompt(receivePending);
      return;
    }

    next();
  };

  const openPendingMoveIn = () => {
    if (!receivePrompt) return;
    window.dispatchEvent(new CustomEvent('asset-open-move-in', { detail: receivePrompt.roomId }));
    setSubTab('assets');
    pendingActionRef.current = null;
    setReceivePrompt(null);
  };

  const continuePendingAction = () => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setReceivePrompt(null);
    action?.();
  };

  useEffect(() => {
    setSubTab('assets');
  }, [selectedRoomId]);

  useEffect(() => {
    if (initialRoomId && rooms.some((room) => room.id === initialRoomId)) {
      setSelectedRoomId(initialRoomId);
      setSubTab('assets');
    }
  }, [initialRoomId, rooms]);

  useEffect(() => {
    const initialRoomExists = !!initialRoomId && rooms.some((room) => room.id === initialRoomId);
    if (!selectedRoomId && !initialRoomExists && rooms.length > 0) {
      const first = rooms.find((room) => room.status === 'occupied') || rooms[0];
      setSelectedRoomId(first.id);
    }
  }, [initialRoomId, rooms, selectedRoomId]);

  const getErrorCount = (roomId: string) =>
    allAssets.filter((asset) => asset.room_id === roomId && (asset.status === 'error' || asset.status === 'repairing')).length;

  return (
    <div className="flex flex-1 overflow-hidden bg-gray-50">
      <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3.5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Danh sách phòng</h2>
          <p className="mt-0.5 text-[11px] text-gray-400">{rooms.filter((room) => room.status === 'occupied').length} phòng đang ở</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">Đang tải...</div>
          ) : (
            rooms.map((room) => {
              const selected = room.id === selectedRoomId;
              const errCount = getErrorCount(room.id);
              const assetCount = allAssets.filter((asset) => asset.room_id === room.id).length;
              return (
                <button
                  key={room.id}
                  onClick={() => {
                    if (room.id === selectedRoomId) return;
                    confirmPendingReceive(() => setSelectedRoomId(room.id));
                  }}
                  className={`mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selected ? 'border-primary/20 bg-primary/10 shadow-sm' : 'border-transparent hover:bg-gray-50'}`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${errCount > 0 ? 'bg-red-100 text-red-600' : room.status === 'occupied' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {room.name.replace(/[^0-9]/g, '') || room.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-800">{room.name}</div>
                    <div className="text-[10px] text-gray-400">{assetCount > 0 ? `${assetCount} tài sản` : 'Chưa có tài sản'}</div>
                  </div>
                  {errCount > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{errCount}</span>}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedRoom ? (
          <div className="flex flex-1 flex-col overflow-hidden bg-white">
            <div className="flex items-center gap-6 border-b border-gray-200 px-5 pt-3">
              <button onClick={() => setSubTab('assets')} className={`border-b-2 pb-3 text-sm font-bold transition-colors ${subTab === 'assets' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <i className="fa-solid fa-couch mr-1.5"></i> Thiết bị phòng
              </button>
              <button onClick={() => confirmPendingReceive(() => setSubTab('vehicles'))} className={`border-b-2 pb-3 text-sm font-bold transition-colors ${subTab === 'vehicles' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <i className="fa-solid fa-motorcycle mr-1.5"></i> Phương tiện
              </button>
            </div>
            <div className="relative flex flex-1 flex-col overflow-hidden">
              {subTab === 'assets' ? (
                <RoomAssetPanel
                  room={selectedRoom}
                  onReceivePendingChange={handleReceivePendingChange}
                  guideMode={guideMode}
                  guideRoomId={guideRoomId}
                  onGuideHandled={onGuideHandled}
                />
              ) : (
                <RoomVehiclePanel room={selectedRoom} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
            <i className="fa-solid fa-hand-pointer text-3xl opacity-20"></i>
            <p className="text-sm font-medium">Chọn một phòng để xem tài sản</p>
          </div>
        )}
      </div>

      {receivePrompt && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-100 bg-white shadow-2xl">
            <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <i className="fa-solid fa-clipboard-check text-lg"></i>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-gray-900">Cần chốt nhận phòng</h3>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  Phòng {receivePrompt.roomName} vừa được thêm tài sản nhưng chưa chốt nhận. Hãy chốt nhận để lưu tình trạng tài sản đầu kỳ và khóa danh sách thiết bị trước khi chuyển sang phần khác.
                </p>
              </div>
            </div>
            <div className="bg-amber-50 px-5 py-3 text-[12px] font-semibold leading-5 text-amber-700">
              Sau khi chốt nhận, hệ thống mới có mốc đối chiếu khi khách trả phòng.
            </div>
            <div className="flex gap-3 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={continuePendingAction}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Vẫn chuyển tiếp
              </button>
              <button
                type="button"
                onClick={openPendingMoveIn}
                className="flex-1 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-700"
              >
                Chốt nhận ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
