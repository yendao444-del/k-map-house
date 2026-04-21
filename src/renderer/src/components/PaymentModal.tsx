import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as db from '../lib/db';
import { playPayment } from '../lib/sound';

interface PaymentModalProps {
  invoice: db.Invoice;
  room: db.Room | undefined;
  onClose: () => void;
}

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const HANDOVER_IDS = ['__check_cleared', '__check_cleaned', '__check_keys'];

function getInvoiceLabel(invoice: db.Invoice): string {
  if (invoice.is_first_month) return 'Thu tiền tháng đầu tiên';
  return `Thu tiền tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`;
}

export function PaymentModal({ invoice, room, onClose }: PaymentModalProps) {
  const queryClient = useQueryClient();
  const remaining = invoice.total_amount - invoice.paid_amount;
  const { data: moveInSnaps = [], isLoading: isMoveInLoading } = useQuery({
    queryKey: ['asset_snapshots', room?.id, 'move_in'],
    queryFn: () => room ? db.getAssetSnapshots(room.id, 'move_in') : Promise.resolve([]),
    enabled: !!room?.id,
  });
  const { data: moveOutSnaps = [], isLoading: isMoveOutLoading } = useQuery({
    queryKey: ['asset_snapshots', room?.id, 'move_out'],
    queryFn: () => room ? db.getAssetSnapshots(room.id, 'move_out') : Promise.resolve([]),
    enabled: !!room?.id,
  });
  const { data: handoverSnaps = [], isLoading: isHandoverLoading } = useQuery({
    queryKey: ['asset_snapshots', room?.id, 'handover'],
    queryFn: () => room ? db.getAssetSnapshots(room.id, 'handover') : Promise.resolve([]),
    enabled: !!room?.id,
  });

  const [amount, setAmount] = useState<number>(remaining);
  const [amountDisplay, setAmountDisplay] = useState<string>(formatVND(remaining));
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>(
    invoice.payment_method || 'transfer'
  );
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: async () =>
      db.recordInvoicePayment(invoice.id, {
        amount,
        payment_method: paymentMethod,
        payment_date: new Date().toISOString().split('T')[0],
        note: note || undefined,
      }),
    onSuccess: () => {
      playPayment();
      queryClient.invalidateQueries({ queryKey: ['invoices'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['rooms'], refetchType: 'all' });
      onClose();
    },
  });

  const workflowLoading = isMoveInLoading || isMoveOutLoading || isHandoverLoading;
  const hasMoveInDone = moveInSnaps.length > 0;
  const hasMoveOutDone = moveOutSnaps.length > 0;
  const hasHandoverDone =
    handoverSnaps.length > 0 &&
    HANDOVER_IDS.every((id) =>
      handoverSnaps.some(
        (snap) =>
          snap.room_asset_id === id &&
          (snap.condition === 'ok' || (snap.condition === 'not_done' && (snap.deduction || 0) > 0))
      )
    );
  const paymentBlockReason =
    !invoice.is_settlement && room?.status === 'occupied' && !hasMoveInDone
      ? 'Phòng đã có hợp đồng nhưng chưa chốt nhận phòng. Cần vào tab Tài sản để chốt nhận trước khi thu hóa đơn.'
      : !invoice.is_settlement && room?.status === 'ending' && (!hasMoveOutDone || !hasHandoverDone)
        ? 'Phòng đang báo trả. Cần hoàn tất Đối chiếu trả phòng trong tab Tài sản trước khi thu hóa đơn.'
        : '';
  const isValid = amount > 0 && amount <= remaining && !workflowLoading && !paymentBlockReason;

  // Line items
  interface LineItem { label: string; detail?: string; amount: number; color?: string }
  const lines: LineItem[] = [];

  if (invoice.room_cost > 0) {
    const periodDetail = invoice.billing_period_start && invoice.billing_period_end
      ? `${fmtDate(invoice.billing_period_start)} → ${fmtDate(invoice.billing_period_end)}`
      : invoice.prorata_days
        ? `${invoice.prorata_days} ngày`
        : undefined;
    lines.push({ label: 'Tiền phòng', detail: periodDetail, amount: invoice.room_cost });
  }

  if (invoice.electric_cost > 0) {
    const electricPrice = invoice.electric_price_snapshot || room?.electric_price || 3500;
    lines.push({
      label: 'Tiền điện',
      detail: `${invoice.electric_usage} kWh × ${formatVND(electricPrice)}đ`,
      amount: invoice.electric_cost,
    });
  }

  if (invoice.water_cost > 0) {
    const waterPrice = invoice.water_price_snapshot || room?.water_price || 20000;
    lines.push({
      label: 'Tiền nước',
      detail: `${invoice.water_usage} m³ × ${formatVND(waterPrice)}đ`,
      amount: invoice.water_cost,
    });
  }

  if ((invoice.wifi_cost || 0) > 0)
    lines.push({ label: 'Internet / Wifi', amount: invoice.wifi_cost });

  if ((invoice.garbage_cost || 0) > 0)
    lines.push({ label: 'Phí rác & vệ sinh', amount: invoice.garbage_cost });

  const depositAmt = invoice.deposit_amount ?? 0;
  if (depositAmt !== 0)
    lines.push({
      label: depositAmt > 0 ? 'Tiền cọc' : 'Hoàn tiền cọc',
      amount: depositAmt,
      color: depositAmt < 0 ? 'text-red-500' : undefined,
    });

  if ((invoice.old_debt || 0) > 0)
    lines.push({ label: 'Nợ tháng trước', amount: invoice.old_debt, color: 'text-red-500' });

  const adj = (invoice as any).adjustment_amount ?? 0;
  if (adj !== 0)
    lines.push({
      label: adj > 0 ? 'Cộng thêm' : 'Giảm trừ',
      amount: adj,
      color: adj < 0 ? 'text-red-500' : 'text-green-600',
    });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
            <i className="fa-solid fa-money-bill-wave"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 text-[16px]">Thu tiền</h2>
            <p className="text-xs text-gray-500">{room?.name || 'Phòng'} · {getInvoiceLabel(invoice)}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-red-500 hover:bg-gray-50 transition"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Chi tiết hóa đơn */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center gap-2">
              <i className="fa-solid fa-file-invoice text-gray-400 text-xs"></i>
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Chi tiết hóa đơn</span>
            </div>
            <div className="divide-y divide-gray-100">
              {lines.map((line, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <span className="text-gray-700">{line.label}</span>
                    {line.detail && (
                      <div className="text-[11px] text-gray-400 mt-0.5">{line.detail}</div>
                    )}
                  </div>
                  <span className={`font-semibold tabular-nums ${line.color || 'text-gray-800'}`}>
                    {line.amount < 0 ? '-' : ''}{formatVND(Math.abs(line.amount))} đ
                  </span>
                </div>
              ))}
            </div>
            {/* Tổng */}
            <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-t border-gray-200">
              <span className="font-bold text-gray-700 text-sm">Tổng cộng</span>
              <span className="font-black text-gray-900 text-base tabular-nums">{formatVND(invoice.total_amount)} đ</span>
            </div>
            {invoice.paid_amount > 0 && (
              <div className="flex justify-between items-center px-4 py-2 bg-emerald-50 border-t border-emerald-100">
                <span className="text-sm text-emerald-700">Đã thu</span>
                <span className="font-semibold text-emerald-700 tabular-nums">{formatVND(invoice.paid_amount)} đ</span>
              </div>
            )}
            <div className="flex justify-between items-center px-4 py-3 bg-red-50 border-t border-red-100">
              <span className="font-bold text-red-700 text-sm">Còn lại cần thu</span>
              <span className="font-black text-red-600 text-lg tabular-nums">{formatVND(remaining)} đ</span>
            </div>
          </div>

          {/* Số tiền thu */}
          {(workflowLoading || paymentBlockReason) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <i className="fa-solid fa-triangle-exclamation mr-2 text-amber-500"></i>
              {workflowLoading ? 'Đang kiểm tra nghiệp vụ tài sản...' : paymentBlockReason}
            </div>
          )}

          {/* Số tiền thu */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Số tiền thu</label>
            <input
              type="text"
              inputMode="numeric"
              value={amountDisplay}
              onChange={(e) => {
                const raw = e.target.value.replace(/\./g, '').replace(/\D/g, '');
                const num = Number(raw) || 0;
                setAmount(num);
                setAmountDisplay(num > 0 ? formatVND(num) : '');
              }}
              onFocus={() => setAmountDisplay(amount > 0 ? formatVND(amount) : '')}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 outline-none transition focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
            {amount > remaining && (
              <p className="mt-1 text-xs text-red-500">Số tiền không được vượt quá số còn lại ({formatVND(remaining)} đ)</p>
            )}
            {amount > 0 && amount < remaining && (
              <p className="mt-1 text-xs text-orange-500">Thu thiếu — còn nợ {formatVND(remaining - amount)} đ</p>
            )}
          </div>

          {/* Phương thức thanh toán */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Phương thức thanh toán</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('transfer')}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition ${paymentMethod === 'transfer' ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <i className="fa-solid fa-building-columns mr-1.5"></i>Chuyển khoản
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition ${paymentMethod === 'cash' ? 'border-green-500 bg-green-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <i className="fa-solid fa-money-bill mr-1.5"></i>Tiền mặt
              </button>
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600">Ghi chú (tuỳ chọn)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Khách chuyển khoản lúc 9h sáng..."
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-gray-100 px-5 py-4 shrink-0">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
          >
            Hủy
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
            className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? 'Đang lưu...' : `Xác nhận thu ${formatVND(amount)} đ`}
          </button>
        </div>
      </div>
    </div>
  );
}
