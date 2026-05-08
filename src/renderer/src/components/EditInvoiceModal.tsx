import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateInvoice, type Invoice, type Room } from '../lib/db';

interface EditInvoiceModalProps {
  invoice: Invoice;
  room: Room | undefined;
  onClose: () => void;
}

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);

function MoneyInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [display, setDisplay] = useState(formatVND(value));
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={(e) => {
          const raw = e.target.value.replace(/\./g, '').replace(/\D/g, '');
          const num = Number(raw) || 0;
          onChange(num);
          setDisplay(num > 0 ? formatVND(num) : '');
        }}
        onBlur={() => setDisplay(value > 0 ? formatVND(value) : '0')}
        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 outline-none transition focus:border-green-400 focus:ring-2 focus:ring-green-100"
      />
    </div>
  );
}

export function EditInvoiceModal({ invoice, room, onClose }: EditInvoiceModalProps) {
  const queryClient = useQueryClient();

  const [roomCost, setRoomCost] = useState(invoice.room_cost);
  const [depositAmount, setDepositAmount] = useState(Math.abs(invoice.deposit_amount || 0));
  const [wifiCost, setWifiCost] = useState(invoice.wifi_cost);
  const [garbageCost, setGarbageCost] = useState(invoice.garbage_cost);
  const [electricCost, setElectricCost] = useState(invoice.electric_cost);
  const [waterCost, setWaterCost] = useState(invoice.water_cost);
  const [electricNew, setElectricNew] = useState(invoice.electric_new);
  const [waterNew, setWaterNew] = useState(invoice.water_new);
  const [adjustment, setAdjustment] = useState(invoice.adjustment_amount || 0);
  const [adjustmentNote, setAdjustmentNote] = useState(invoice.adjustment_note || '');
  const [note, setNote] = useState(invoice.note || '');
  const canEditAmount = invoice.payment_status === 'unpaid' && Number(invoice.paid_amount || 0) <= 0;
  const electricPrice =
    Number(invoice.electric_price_snapshot || 0) ||
    (invoice.electric_usage > 0 ? Number(invoice.electric_cost || 0) / Number(invoice.electric_usage || 1) : 0);
  const waterPrice =
    Number(invoice.water_price_snapshot || 0) ||
    (invoice.water_usage > 0 ? Number(invoice.water_cost || 0) / Number(invoice.water_usage || 1) : 0);
  const electricUsage = Math.max(0, electricNew - invoice.electric_old);
  const waterUsage = Math.max(0, waterNew - invoice.water_old);
  const electricInvalid = electricNew < invoice.electric_old;
  const waterInvalid = waterNew < invoice.water_old;

  const normalizedDeposit = invoice.deposit_amount && invoice.deposit_amount < 0
    ? -Math.abs(depositAmount)
    : Math.abs(depositAmount);

  const total = roomCost + wifiCost + garbageCost + electricCost + waterCost + normalizedDeposit + adjustment;

  const mutation = useMutation({
    mutationFn: () => {
      if (!canEditAmount) throw new Error('Hoa don da co giao dich thu tien. Khong the sua so tien.')
      return updateInvoice(invoice.id, {
        room_cost: roomCost,
        deposit_amount: normalizedDeposit,
        wifi_cost: wifiCost,
        garbage_cost: garbageCost,
        electric_new: electricNew,
        electric_usage: electricUsage,
        electric_cost: electricCost,
        water_new: waterNew,
        water_usage: waterUsage,
        water_cost: waterCost,
        adjustment_amount: adjustment,
        adjustment_note: adjustmentNote,
        note,
        total_amount: total,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'], refetchType: 'all' });
      onClose();
    },
    onError: (err: any) => {
      window.alert(err?.message || 'Khong the sua hoa don.')
    },
  });

  const updateElectricNew = (value: number) => {
    setElectricNew(value);
    setElectricCost(Math.round(Math.max(0, value - invoice.electric_old) * electricPrice));
  };

  const updateWaterNew = (value: number) => {
    setWaterNew(value);
    setWaterCost(Math.round(Math.max(0, value - invoice.water_old) * waterPrice));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <i className="fa-solid fa-pen-to-square"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900">Sửa hóa đơn</h2>
            <p className="text-xs text-gray-500 truncate">{room?.name}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-red-500 transition">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {!canEditAmount && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Hoa don da co giao dich thu tien, khoa sua so tien de tranh sai lech doi soat.
            </div>
          )}
          <MoneyInput label="Tiền phòng" value={roomCost} onChange={setRoomCost} />
          <MoneyInput label="Internet" value={wifiCost} onChange={setWifiCost} />
          <MoneyInput label="Rác / vệ sinh" value={garbageCost} onChange={setGarbageCost} />

          {(invoice.billing_reason === 'monthly' || invoice.has_transfer || invoice.electric_cost > 0 || invoice.water_cost > 0 || invoice.electric_usage > 0 || invoice.water_usage > 0) && (
            <>
              <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-bold text-amber-800">
                  <span>Điện</span>
                  <span>{formatVND(electricPrice)} đ/kWh</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Số cũ</label>
                    <input value={invoice.electric_old} disabled className="w-full rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-bold text-gray-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">Số mới</label>
                    <input
                      type="number"
                      value={electricNew}
                      onChange={(e) => updateElectricNew(Number(e.target.value) || 0)}
                      className={`w-full rounded-xl border px-3 py-2 text-sm font-bold outline-none transition ${electricInvalid ? 'border-red-300 text-red-600 focus:ring-2 focus:ring-red-100' : 'border-gray-200 text-gray-800 focus:border-green-400 focus:ring-2 focus:ring-green-100'}`}
                    />
                  </div>
                </div>
                <div className="mt-2 flex justify-between text-xs font-semibold text-amber-700">
                  <span>Tiêu thụ: {electricUsage} kWh</span>
                  <span>{formatVND(electricCost)} đ</span>
                </div>
                {electricInvalid && <div className="mt-1 text-xs font-medium text-red-500">Số mới không được nhỏ hơn số cũ.</div>}
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-bold text-blue-800">
                  <span>Nước</span>
                  <span>{formatVND(waterPrice)} đ/m³</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500">Số cũ</label>
                    <input value={invoice.water_old} disabled className="w-full rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-bold text-gray-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">Số mới</label>
                    <input
                      type="number"
                      value={waterNew}
                      onChange={(e) => updateWaterNew(Number(e.target.value) || 0)}
                      className={`w-full rounded-xl border px-3 py-2 text-sm font-bold outline-none transition ${waterInvalid ? 'border-red-300 text-red-600 focus:ring-2 focus:ring-red-100' : 'border-gray-200 text-gray-800 focus:border-green-400 focus:ring-2 focus:ring-green-100'}`}
                    />
                  </div>
                </div>
                <div className="mt-2 flex justify-between text-xs font-semibold text-blue-700">
                  <span>Tiêu thụ: {waterUsage} m³</span>
                  <span>{formatVND(waterCost)} đ</span>
                </div>
                {waterInvalid && <div className="mt-1 text-xs font-medium text-red-500">Số mới không được nhỏ hơn số cũ.</div>}
              </div>
            </>
          )}

          {(invoice.deposit_amount || 0) !== 0 && (
            <MoneyInput
              label={invoice.deposit_amount && invoice.deposit_amount < 0 ? 'Hoàn cọc' : 'Tiền cọc'}
              value={depositAmount}
              onChange={setDepositAmount}
            />
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Cộng thêm / Giảm trừ</label>
            <input
              type="number"
              value={adjustment}
              onChange={(e) => setAdjustment(Number(e.target.value))}
              placeholder="VD: -50000 để giảm, 50000 để cộng thêm"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
            {adjustment !== 0 && (
              <input
                type="text"
                value={adjustmentNote}
                onChange={(e) => setAdjustmentNote(e.target.value)}
                placeholder="Lý do điều chỉnh..."
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-green-400 focus:ring-2 focus:ring-green-100"
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Ghi chú</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thêm..."
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>

          {/* Tổng mới */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tổng cộng mới</div>
            <div className="mt-1 text-right text-2xl font-black text-green-600">{formatVND(total)} đ</div>
            {total !== invoice.total_amount && (
              <div className="text-right text-xs text-gray-400 mt-0.5">
                Trước: <span className="line-through">{formatVND(invoice.total_amount)} đ</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-100 px-5 py-4 shrink-0">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            Hủy
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canEditAmount || electricInvalid || waterInvalid}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition disabled:opacity-60"
          >
            {mutation.isPending ? 'Dang luu...' : !canEditAmount ? 'Da khoa sua so tien' : 'Luu thay doi'}
          </button>
        </div>
      </div>
    </div>
  );
}
