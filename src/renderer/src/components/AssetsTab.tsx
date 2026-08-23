import React, { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addRoomAsset,
  createAssetSnapshots,
  createRoomAssetAdjustment,
  deleteRoomAsset,
  getAllRoomAssets,
  getAssetSnapshots,
  getAssetSnapshotsByRoomIds,
  getRoomAssets,
  getRooms,
  getVehicles,
  updateRoomAsset,
  type AssetSnapshot,
  type Room,
  type RoomAsset,
} from '../lib/db';
import { RoomVehiclePanel } from './VehiclesTab';
import { LogoLoading } from './LogoLoading';
import airConditionerImage from '../assets/room-assets/air-conditioner.png';
import bedImage from '../assets/room-assets/bed.png';
import ceilingFanImage from '../assets/room-assets/ceiling-fan.png';
import doorLockImage from '../assets/room-assets/door-lock.png';
import faucetImage from '../assets/room-assets/faucet.png';
import gasStoveImage from '../assets/room-assets/gas-stove.png';
import lightBulbImage from '../assets/room-assets/light-bulb.png';
import powerOutletImage from '../assets/room-assets/power-outlet.png';
import refrigeratorImage from '../assets/room-assets/refrigerator.png';
import roomInteriorImage from '../assets/room-assets/room-interior-hero.png';
import shoeCabinetImage from '../assets/room-assets/shoe-cabinet.png';
import tableChairImage from '../assets/room-assets/table-chair.png';
import televisionImage from '../assets/room-assets/television.png';
import toiletImage from '../assets/room-assets/toilet.png';
import wardrobeImage from '../assets/room-assets/wardrobe.png';
import washingMachineImage from '../assets/room-assets/washing-machine.png';
import waterDispenserImage from '../assets/room-assets/water-dispenser.png';

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

const adjustmentReasons = ['Bổ sung', 'Hỏng', 'Bị mất', 'Xuống cấp', 'Thay mới', 'Khác'];

type AssetAdjustmentDraft = {
  assetId?: string;
  name: string;
  originalQuantity: number;
  quantity: number;
};

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

const assetImage = (name: string) => {
  if (name.includes('đèn')) return lightBulbImage;
  if (name.includes('sinh')) return toiletImage;
  if (name.includes('Vòi')) return faucetImage;
  if (name.includes('gas')) return gasStoveImage;
  if (name.includes('Bàn + Ghế')) return tableChairImage;
  if (name.includes('Điều hòa')) return airConditionerImage;
  if (name.includes('Tủ quần áo')) return wardrobeImage;
  if (name.includes('nóng lạnh')) return waterDispenserImage;
  if (name.includes('Giường')) return bedImage;
  if (name.includes('Quạt trần')) return ceilingFanImage;
  if (name.includes('Khóa')) return doorLockImage;
  if (name.includes('Tủ lạnh')) return refrigeratorImage;
  if (name.includes('giặt')) return washingMachineImage;
  if (name.includes('TV')) return televisionImage;
  if (name.includes('Tủ giày')) return shoeCabinetImage;
  if (name.includes('điện')) return powerOutletImage;
  return null;
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
  const [modal, setModal] = useState<'add' | 'adjust' | 'move_in' | 'move_out' | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<Record<string, number>>({});
  const [manualName, setManualName] = useState('');
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, AssetAdjustmentDraft>>({});
  const [adjustReason, setAdjustReason] = useState('Bổ sung');
  const [adjustNote, setAdjustNote] = useState('');
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
    mutationFn: async () => {
      const changes = Object.values(adjustDrafts).filter((item) => item.quantity !== item.originalQuantity);
      const reason = [adjustReason, adjustNote.trim()].filter(Boolean).join(' · ');

      for (const item of changes) {
        if (item.assetId) {
          await updateRoomAsset(item.assetId, { quantity: item.quantity });
          await createRoomAssetAdjustment({
            room_id: room.id,
            action: 'update',
            room_asset_id: item.assetId,
            name: item.name,
            quantity: item.quantity,
            reason,
          });
          continue;
        }

        if (item.quantity > 0) {
          const created = await addRoomAsset({
            room_id: room.id,
            name: item.name,
            quantity: item.quantity,
            sort_order: assets.length + 1,
          });
          await createRoomAssetAdjustment({
            room_id: room.id,
            action: 'add',
            room_asset_id: created.id,
            name: item.name,
            quantity: item.quantity,
            reason,
          });
        }
      }
    },
    onSuccess: () => {
      invalidate();
      setModal(null);
      setAdjustDrafts({});
      setAdjustReason('Bổ sung');
      setAdjustNote('');
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Không lưu được thay đổi tài sản.');
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

  const openAdjustModal = (_asset?: RoomAsset) => {
    const currentByName = new Map(assets.map((item) => [item.name, item]));
    const names = Array.from(new Set([...assets.map((item) => item.name), ...assetTemplates]));
    const drafts = names.reduce<Record<string, AssetAdjustmentDraft>>((result, name) => {
      const current = currentByName.get(name);
      result[name] = {
        assetId: current?.id,
        name,
        originalQuantity: current?.quantity || 0,
        quantity: current?.quantity || 0,
      };
      return result;
    }, {});

    setAdjustDrafts(drafts);
    setAdjustReason('Bổ sung');
    setAdjustNote('');
    setModal('adjust');
  };

  const setAdjustmentQuantity = (name: string, quantity: number) => {
    setAdjustDrafts((current) => ({
      ...current,
      [name]: {
        ...current[name],
        quantity: Math.max(0, quantity),
      },
    }));
  };

  const adjustmentChangeCount = Object.values(adjustDrafts).filter(
    (item) => item.quantity !== item.originalQuantity
  ).length;

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

  if (isLoading) return <LogoLoading className="flex-1 p-8" />;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-[#f8fafb]">
      <div className="shrink-0 border-b border-slate-100 bg-white px-6 py-5">
        <div className="flex items-stretch gap-6">
          <img src={roomInteriorImage} alt={`Không gian ${room.name}`} className="h-32 w-56 rounded-2xl object-cover shadow-sm" />
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
              <i className="fa-solid fa-couch text-primary"></i>
              TÀI SẢN PHÒNG
            </div>
            <h3 className="text-3xl font-extrabold tracking-tight text-slate-900">{room.name}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span><i className="fa-solid fa-boxes-stacked mr-1.5 text-primary"></i>{assets.length} tài sản</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500"></span>{hasMoveInHistory ? 'Đang sử dụng' : 'Sẵn sàng nhận phòng'}</span>
              {moveOutSnaps.length > 0 && <span>Đã đối chiếu trả phòng</span>}
              {handoverDone && <span>Đã bàn giao</span>}
            </div>
            <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <i className="fa-solid fa-circle-check text-emerald-600"></i>
              {assets.length > 0 ? `Đã có đủ ${assets.length} tài sản để theo dõi` : 'Chưa có tài sản trong phòng'}
            </div>
          </div>
          <div className="flex w-56 shrink-0 flex-col justify-center gap-2">
          <button
            data-tour="move-in-btn"
            onClick={openMoveIn}
            disabled={hasMoveInHistory}
            className={`rounded-xl border px-3.5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed ${hasMoveInHistory ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-primary bg-primary text-white shadow-sm shadow-primary/30 hover:bg-primary-dark'}`}
          >
            <i className={`fa-solid ${hasMoveInHistory ? 'fa-check-circle' : 'fa-arrow-right-to-bracket'} mr-1.5`}></i>
            {hasMoveInHistory ? 'Đã nhận phòng' : 'Chốt nhận phòng'}
          </button>
          <button
            data-tour="move-out-btn"
            onClick={openMoveOut}
            disabled={!assetsLocked}
            className={`rounded-xl border px-3.5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed ${!assetsLocked ? 'opacity-40' : moveOutSnaps.length > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            <i className={`fa-solid ${moveOutSnaps.length > 0 ? 'fa-check-circle' : 'fa-arrow-right-from-bracket'} mr-1.5`}></i>
            {moveOutSnaps.length > 0 ? 'Đã trả phòng' : 'Khách trả phòng'}
          </button>
          <button
            data-tour="add-asset-btn"
            onClick={() => !canAdjustAssets && setModal('add')}
            disabled={canAdjustAssets}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <i className={`fa-solid ${canAdjustAssets ? 'fa-lock' : 'fa-plus'} mr-1.5`}></i>
            Thêm
          </button>
          {canAdjustAssets && (
            <button
              onClick={() => openAdjustModal()}
              className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-100"
            >
              <i className="fa-solid fa-file-pen mr-1.5"></i>
              Điều chỉnh
            </button>
          )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h4 className="text-lg font-extrabold text-slate-900">Tài sản trong phòng</h4>
            <p className="mt-0.5 text-sm text-slate-400">Theo dõi số lượng và tình trạng thiết bị theo từng phòng</p>
          </div>
          <div className="hidden items-center gap-2 text-sm font-semibold text-slate-500 sm:flex">
            <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-emerald-700"><i className="fa-solid fa-check mr-1.5"></i>{assets.length} đang theo dõi</span>
          </div>
        </div>
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
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {assets.map((asset) => {
              const snapIn = moveInSnaps.find((s) => s.room_asset_id === asset.id);
              const snapOut = moveOutSnaps.find((s) => s.room_asset_id === asset.id);
              const latest = snapOut || snapIn;
              const bad = latest?.condition === 'broken' || latest?.condition === 'missing';
              const image = assetImage(asset.name);
              const currentCondition = conditionLabels[latest?.condition || 'good'] || conditionLabels.good;
              return (
                <div
                  key={asset.id}
                  className={`min-h-[236px] rounded-2xl relative flex flex-col overflow-hidden transition duration-300 ${(snapOut && snapOut.deduction > 0) ? 'bg-white border-2 border-rose-200 shadow-lg shadow-rose-100/50'
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
                  <div className="mb-3 flex flex-1 flex-col">
                    <div className={`mb-3 flex h-[148px] w-full items-center justify-center overflow-hidden rounded-xl bg-white ${(snapOut && snapOut.deduction > 0) ? 'text-orange-500'
                      : bad ? 'text-red-500'
                        : 'text-slate-500'
                      }`}>
                      {image ? (
                        <img
                          src={image}
                          alt={asset.name}
                          className="h-full w-full scale-110 object-contain p-1 drop-shadow-sm"
                        />
                      ) : (
                        <i className={`fa-solid ${assetIcon(asset.name)} text-3xl drop-shadow-sm`}></i>
                      )}
                    </div>
                    <div className="min-w-0 text-left">
                      {editId === asset.id ? (
                        <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onBlur={() => { if (editName.trim()) updateMut.mutate({ id: asset.id, updates: { name: editName.trim() } }); else setEditId(null); }} onKeyDown={e => { if (e.key === 'Enter' && editName.trim()) updateMut.mutate({ id: asset.id, updates: { name: editName.trim() } }); if (e.key === 'Escape') setEditId(null); }} className="w-full text-base font-extrabold text-blue-700 bg-transparent border-b border-blue-400 outline-none p-0 focus:ring-0" />
                      ) : (
                        <h3 className="w-full truncate text-[15px] font-extrabold leading-snug text-slate-900" title={asset.name}>{asset.name}</h3>
                      )}
                      <p className="mt-1 text-xs font-bold text-slate-400">SL: {asset.quantity}</p>
                    </div>
                  </div>

                  {/* Vùng Thông tin (Timeline) */}
                  <div className="relative z-10 mt-auto w-full" onClick={e => e.stopPropagation()}>
                    <div className="flex h-9 items-center justify-between rounded-lg bg-slate-50 px-3 text-xs font-semibold text-slate-400">
                      <span>Tình trạng</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-bold ${currentCondition.color}`} title={currentCondition.label}>
                        <i className="fa-solid fa-circle text-[7px]"></i>{currentCondition.label}
                      </span>
                    </div>
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
                  const image = assetImage(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() =>
                        setSelectedAssets((prev) => {
                          const next = { ...prev };
                          if (next[name]) delete next[name];
                          else next[name] = 1;
                          return next;
                        })
                      }
                      aria-pressed={selected}
                      className={`relative flex min-h-[92px] flex-col items-center justify-center overflow-hidden rounded-2xl border px-2 py-2.5 text-center text-slate-700 transition-all duration-200 ease-out hover:-translate-y-0.5 ${selected ? 'border-emerald-600 bg-white text-slate-900 shadow-md ring-2 ring-emerald-100' : 'border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md'}`}
                    >
                      {selected && (
                        <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-white shadow-sm">
                          <i className="fa-solid fa-check"></i>
                        </span>
                      )}
                      {image ? (
                        <img
                          src={image}
                          alt=""
                          aria-hidden="true"
                          className="mb-1.5 h-11 w-full object-contain drop-shadow-sm sm:h-12"
                        />
                      ) : (
                        <i className={`fa-solid ${assetIcon(name)} mb-2 block text-xl opacity-90 sm:text-2xl`}></i>
                      )}
                      <span className="px-1 text-[11px] font-bold leading-tight sm:text-xs">{name}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[1px]" onClick={() => setModal(null)}>
          <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-3.5">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Điều chỉnh tài sản sau nhận phòng</h3>
                <p className="mt-1 text-sm text-slate-400">Nhấn để chọn <span className="mx-1.5">•</span> Nhấn lại để bỏ chọn</p>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="Đóng"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.values(adjustDrafts).map((item) => {
                  const selected = item.quantity > 0;
                  const changed = item.quantity !== item.originalQuantity;
                  const image = assetImage(item.name);
                  return (
                    <div
                      key={item.name}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      onClick={() => setAdjustmentQuantity(item.name, selected ? 0 : Math.max(1, item.originalQuantity))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setAdjustmentQuantity(item.name, selected ? 0 : Math.max(1, item.originalQuantity));
                        }
                      }}
                      className={`group relative flex min-h-[116px] flex-col items-center rounded-xl border bg-white p-2 text-center transition ${
                        selected
                          ? 'cursor-pointer border-emerald-400 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-100 hover:bg-emerald-50'
                          : 'cursor-pointer border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30 hover:shadow-sm'
                      }`}
                    >
                      {selected && (
                        <span className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm" aria-hidden="true">
                          <i className="fa-solid fa-check text-[10px]"></i>
                        </span>
                      )}
                      {changed && (
                        <span className="absolute left-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" title="Có thay đổi"></span>
                      )}
                      <div className="flex h-[52px] w-full items-center justify-center">
                        {image ? (
                          <img src={image} alt="" className="max-h-[50px] max-w-[84px] object-contain transition group-hover:scale-[1.03]" />
                        ) : (
                          <i className={`fa-solid ${assetIcon(item.name)} text-4xl text-slate-300`}></i>
                        )}
                      </div>
                      <div className="line-clamp-1 text-[13px] font-bold text-slate-800">{item.name}</div>
                      {selected ? (
                        <div className="mt-1.5 grid h-7 w-full max-w-[120px] grid-cols-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          <button
                            type="button"
                            aria-label={`Giảm số lượng ${item.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setAdjustmentQuantity(item.name, item.quantity - 1);
                            }}
                            className="text-slate-500 transition hover:bg-white hover:text-emerald-600"
                          >
                            <i className="fa-solid fa-minus text-[10px]"></i>
                          </button>
                          <span className="flex items-center justify-center border-x border-slate-200 bg-white text-sm font-extrabold text-slate-800">{item.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Tăng số lượng ${item.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setAdjustmentQuantity(item.name, item.quantity + 1);
                            }}
                            className="text-slate-500 transition hover:bg-white hover:text-emerald-600"
                          >
                            <i className="fa-solid fa-plus text-[10px]"></i>
                          </button>
                        </div>
                      ) : (
                        <span className="mt-1.5 text-[11px] font-semibold text-slate-400 group-hover:text-emerald-600">Nhấn để thêm</span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3.5">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Lý do điều chỉnh</div>
                <div className="flex flex-wrap gap-2">
                  {adjustmentReasons.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setAdjustReason(reason)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                        adjustReason === reason
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <input
                  value={adjustNote}
                  onChange={(event) => setAdjustNote(event.target.value)}
                  placeholder="Ghi chú thêm (không bắt buộc)"
                  className="mt-2.5 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
                <p className="mt-2 text-xs text-slate-400">
                  <i className="fa-solid fa-lock mr-1.5 text-slate-300"></i>
                  Mốc bàn giao ban đầu được giữ nguyên; thay đổi mới sẽ được lưu vào lịch sử.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-slate-100 bg-white px-6 py-3.5">
              <span className={`text-sm font-bold ${adjustmentChangeCount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                {adjustmentChangeCount > 0 ? `${adjustmentChangeCount} thay đổi chưa lưu` : 'Chưa có thay đổi'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => adjustMut.mutate()}
                  disabled={adjustmentChangeCount === 0 || adjustMut.isPending}
                  className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {adjustMut.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
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
                    const image = assetImage(asset.name);
                    return (
                      <tr key={asset.id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50 shadow-sm">
                              {image ? (
                                <img src={image} alt="" className="h-full w-full scale-110 object-contain p-0.5" />
                              ) : (
                                <i className={`fa-solid ${assetIcon(asset.name)} text-sm text-slate-400`}></i>
                              )}
                            </div>
                            <span className="font-medium text-gray-800">{asset.name} <span className="text-xs text-gray-400">x{asset.quantity}</span></span>
                          </div>
                        </td>
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
  const { data: allVehicles = [] } = useQuery({ queryKey: ['vehicles'], queryFn: getVehicles });
  const occupiedRoomIds = rooms
    .filter((room) => room.status === 'occupied' || room.status === 'ending')
    .map((room) => room.id);
  const { data: moveInSnapshots = [], isLoading: isMoveInSnapshotsLoading } = useQuery({
    queryKey: ['asset_snapshots', 'room-list-move-in', occupiedRoomIds],
    queryFn: () => getAssetSnapshotsByRoomIds(occupiedRoomIds, ['move_in']),
    enabled: occupiedRoomIds.length > 0,
  });
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

  const roomsWithMoveInSnapshot = new Set(moveInSnapshots.map((snapshot) => snapshot.room_id));
  const selectedRoomNeedsReceive = !!selectedRoom
    && !isMoveInSnapshotsLoading
    && (selectedRoom.status === 'occupied' || selectedRoom.status === 'ending')
    && allAssets.some((asset) => asset.room_id === selectedRoom.id)
    && !roomsWithMoveInSnapshot.has(selectedRoom.id);

  return (
    <div className="flex flex-1 overflow-hidden bg-gray-50">
      <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3.5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Danh sách phòng</h2>
          <p className="mt-0.5 text-[13px] text-gray-400">{rooms.filter((room) => room.status === 'occupied').length} phòng đang ở</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading ? (
            <LogoLoading message="Đang tải danh sách phòng..." className="px-4 py-6" size="sm" />
          ) : (
            rooms.map((room) => {
              const selected = room.id === selectedRoomId;
              const errCount = getErrorCount(room.id);
              const assetCount = allAssets.filter((asset) => asset.room_id === room.id).length;
              const vehicleCount = allVehicles.filter((v) => v.room_id === room.id).length;
              const isOccupied = room.status === 'occupied' || room.status === 'ending';
              const hasNoVehicles = isOccupied && vehicleCount === 0;
              const needsReceive = !isMoveInSnapshotsLoading && isOccupied && assetCount > 0 && !roomsWithMoveInSnapshot.has(room.id);
              return (
                <button
                  key={room.id}
                  onClick={() => {
                    if (room.id === selectedRoomId) return;
                    confirmPendingReceive(() => setSelectedRoomId(room.id));
                  }}
                  className={`mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selected ? 'border-primary/20 bg-primary/10 shadow-sm' : 'border-transparent hover:bg-gray-50'}`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${errCount > 0 ? 'bg-red-100 text-red-600' : room.status === 'occupied' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {room.name.replace(/[^0-9]/g, '') || room.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-gray-800">{room.name}</div>
                    <div className="text-xs text-gray-400">
                      {assetCount > 0 ? `${assetCount} tài sản` : 'Chưa có tài sản'}
                      {needsReceive ? (
                        <span className="ml-1 font-bold text-orange-600">• Chưa nhận phòng</span>
                      ) : hasNoVehicles ? (
                        <span className="ml-1 font-medium text-amber-500">• Chưa có xe</span>
                      ) : null}
                    </div>
                  </div>
                  {errCount > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">{errCount}</span>}
                  {needsReceive && errCount === 0 ? (
                    <span title="Chưa chốt nhận phòng" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[11px] text-white shadow-sm">
                      <i className="fa-solid fa-clipboard-list"></i>
                    </span>
                  ) : hasNoVehicles && errCount === 0 ? (
                    <span title="Chưa đăng ký phương tiện" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[11px] text-white">
                      <i className="fa-solid fa-motorcycle"></i>
                    </span>
                  ) : null}
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
              <button onClick={() => setSubTab('assets')} className={`flex items-center gap-1.5 border-b-2 pb-3 text-base font-bold transition-colors ${subTab === 'assets' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <i className="fa-solid fa-couch"></i> Thiết bị phòng
                {selectedRoomNeedsReceive && (
                  <span title="Chưa chốt nhận phòng" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">!</span>
                )}
              </button>
              <button onClick={() => confirmPendingReceive(() => setSubTab('vehicles'))} className={`border-b-2 pb-3 text-base font-bold transition-colors flex items-center gap-1.5 ${subTab === 'vehicles' ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                <i className="fa-solid fa-motorcycle"></i> Phương tiện
                {selectedRoom && (selectedRoom.status === 'occupied' || selectedRoom.status === 'ending') && allVehicles.filter((v) => v.room_id === selectedRoom.id).length === 0 && (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-white">!</span>
                )}
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
