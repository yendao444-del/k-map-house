import React, { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createInvoice, updateRoom, type Room } from '../lib/db';
import { playCreate } from '../lib/sound';

interface MoveInReceiptModalProps {
  room: Room;
  onClose: () => void;
  initialMoveInDate?: string;
}

const fmtVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);

const fmtDateVN = (s: string) => {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const MoveInReceiptModal: React.FC<MoveInReceiptModalProps> = ({ room, onClose, initialMoveInDate }) => {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  // === STATE ===
  const [moveInDate, setMoveInDate] = useState(initialMoveInDate || room.move_in_date || today);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().split('T')[0];
  });
  const [deposit, setDeposit] = useState(room.default_deposit || 0);
  const [saving, setSaving] = useState(false);

  // === DERIVED: Billing month label ===
  const billingMonthLabel = useMemo(() => {
    const d = new Date(invoiceDate);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }, [invoiceDate]);

  // === DERIVED: Prorata days & amount ===
  const prorata = useMemo(() => {
    if (!moveInDate) return { days: 0, amount: 0, daysInMonth: 30 };
    const date = new Date(moveInDate);
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const moveInDay = date.getDate();
    const remainingDays = daysInMonth - moveInDay + 1;
    const amount = moveInDay === 1
      ? room.base_rent
      : Math.round((room.base_rent / daysInMonth) * remainingDays);
    return { days: remainingDays, amount, daysInMonth };
  }, [moveInDate, room.base_rent]);

  // === DERIVED: Billing period end (next invoice_day) ===
  const period = useMemo(() => {
    const invoiceDay = room.invoice_day || 5;
    const moveIn = new Date(moveInDate || today);
    let endMonth = moveIn.getMonth() + 2;
    let endYear = moveIn.getFullYear();
    if (endMonth > 12) { endMonth = 1; endYear++; }
    const endDate = new Date(endYear, endMonth - 1, invoiceDay);
    return {
      start: moveInDate || today,
      end: endDate.toISOString().split('T')[0],
    };
  }, [moveInDate, room.invoice_day]);

  // Sync prorata amount khi ngày thay đổi
  const [prorataAmount, setProrataAmount] = useState(prorata.amount);
  useEffect(() => { setProrataAmount(prorata.amount); }, [prorata.amount]);

  const totalAmount = prorataAmount + deposit;

  // === SAVE ===
  const handleSave = async () => {
    setSaving(true);
    try {
      if (!room.move_in_date || room.move_in_date !== moveInDate) {
        await updateRoom(room.id, { move_in_date: moveInDate, status: 'occupied' });
      }
      const d = new Date(moveInDate);
      await createInvoice({
        room_id: room.id,
        tenant_id: room.tenant_name || '',
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        is_first_month: true,
        deposit_amount: deposit,
        prorata_days: prorata.days,
        room_cost: prorataAmount,
        electric_old: room.electric_new ?? 0,
        electric_new: room.electric_new ?? 0,
        water_old: room.water_new ?? 0,
        water_new: room.water_new ?? 0,
        electric_cost: 0,
        water_cost: 0,
        wifi_cost: 0,
        garbage_cost: 0,
        electric_usage: 0,
        water_usage: 0,
        old_debt: 0,
        total_amount: totalAmount,
        paid_amount: 0,
        payment_status: 'unpaid',
      });
      playCreate();
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['moveInReceipts'] });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // === RENDER ===
  return (
    <div
      className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex justify-center items-start pt-6 p-4 z-[90]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-[500px] max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-gray-200 animate-[fadeIn_0.15s_ease-out]"
        onClick={e => e.stopPropagation()}
      >

        {/* ── HEADER ────────────────────────────── */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center text-white shadow-sm shadow-green-200 shrink-0">
            <i className="fa-solid fa-dollar-sign text-base"></i>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 text-[15px] leading-tight truncate">
              Lập hóa đơn cho &ldquo;{room.name}&rdquo;
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 transition shrink-0"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* ── BODY ──────────────────────────────── */}
        <div className="overflow-y-auto flex-1 px-4 py-3.5 space-y-3">

          {/* Lý do thu tiền */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Lý do thu tiền <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <select
                defaultValue="first"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-800 bg-white outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 appearance-none transition cursor-pointer"
              >
                <option value="first">Thu tiền tháng đầu tiên</option>
              </select>
              <i className="fa-solid fa-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
            </div>
          </div>

          {/* Date row: Tháng | Ngày lập | Hạn đóng */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                Tháng lập phiếu <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={billingMonthLabel}
                  readOnly
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-700 bg-gray-50 outline-none cursor-default pr-7 select-none"
                />
                <i className="fa-regular fa-calendar absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none"></i>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                Ngày lập hóa đơn <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs font-medium text-gray-700 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200 transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                Hạn đóng tiền <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs font-medium text-gray-700 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200 transition"
              />
            </div>
          </div>

          {/* ── SECTION: THU TIỀN THÁNG ĐẦU ── */}
          <div className="border border-green-100 rounded-xl overflow-hidden shadow-sm">
            {/* header */}
            <div className="bg-green-50 px-4 py-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-green-200 flex items-center justify-center text-green-600 shrink-0">
                <i className="fa-solid fa-house text-[11px]"></i>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-800 text-sm">Thu tiền tháng đầu tiên</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Ngày vào:{' '}
                  <span className="text-orange-500 font-semibold">{fmtDateVN(moveInDate)}</span>.{' '}
                  Chu kỳ thu:{' '}
                  <span className="text-orange-500 font-semibold">1 tháng, ngày {room.invoice_day || 5} thu</span>
                </div>
              </div>
            </div>

            {/* Từ ngày / Đến ngày */}
            <div className="px-4 py-3 bg-white grid grid-cols-2 gap-3 border-b border-gray-100">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Từ ngày</label>
                <input
                  type="date"
                  value={period.start}
                  onChange={e => setMoveInDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none focus:border-green-400 transition"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Đến ngày <span className="text-red-400">*</span></label>
                <input
                  type="date"
                  value={period.end}
                  readOnly
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 outline-none cursor-default"
                />
              </div>
            </div>

            {/* Calculation row */}
            <div className="px-4 py-2.5 bg-green-50/30 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-gray-700">Thu tiền tháng đầu tiên</div>
                <div className="text-[11px] text-orange-500 font-medium mt-0.5">
                  0 tháng, {prorata.days} ngày × {fmtVND(room.base_rent)} đ
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Thành tiền</div>
                <div className="font-black text-gray-800 text-base tabular-nums">{fmtVND(prorataAmount)} đ</div>
              </div>
            </div>
          </div>

          {/* ── SECTION: THU TIỀN CỌC ── */}
          <div className="border border-orange-100 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-orange-50 px-4 py-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-orange-200 flex items-center justify-center text-orange-500 shrink-0">
                <i className="fa-solid fa-box-archive text-[11px]"></i>
              </div>
              <div>
                <div className="font-bold text-gray-800 text-sm">Thu tiền cọc</div>
                <div className="text-[11px] text-gray-500 mt-0.5">Thu tiền cọc nếu có phát sinh</div>
              </div>
            </div>

            <div className="px-4 py-3 bg-white space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Số tiền cọc(đ)</label>
                <input
                  type="number"
                  value={deposit || ''}
                  onChange={e => setDeposit(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition tabular-nums"
                />
              </div>
              {deposit > 0 && (
                <div className="text-xs font-semibold text-orange-500">
                  Số tiền cọc cần thu :{' '}
                  <span className="text-orange-600">{fmtVND(deposit)} đ</span>
                </div>
              )}
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 space-y-1">
                <div className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                  <i className="fa-solid fa-star text-[8px]"></i> Lưu ý{' '}
                  <i className="fa-solid fa-star text-[8px]"></i>
                </div>
                <div className="text-[11px] text-amber-700">
                  1. Số tiền cọc hoàn trả không thể lớn hơn số tiền cọc đã thu.
                </div>
                <div className="text-[11px] text-amber-700">
                  2. Số tiền thu cọc không thể lớn hơn mức giá cọc quy định trong hợp đồng
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION: TIỀN DỊCH VỤ ── */}
          <div className="border border-blue-100 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-blue-50 px-4 py-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-blue-200 flex items-center justify-center text-blue-500 shrink-0">
                <i className="fa-solid fa-bolt text-[11px]"></i>
              </div>
              <div>
                <div className="font-bold text-gray-800 text-sm">Tiền dịch vụ</div>
                <div className="text-[11px] text-gray-500 mt-0.5">Tính tiền dịch vụ khách xài</div>
              </div>
            </div>

            <div className="px-4 py-2.5 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-green-600">Tính tiền dịch vụ</div>
                <div className="text-[11px] text-gray-400 mt-0.5">0 dịch vụ · {prorata.days} ngày</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Thành tiền</div>
                <div className="font-bold text-gray-700 tabular-nums">0 đ</div>
              </div>
            </div>
          </div>

          {/* ── SECTION: CỘNG THÊM / GIẢM TRỪ ── */}
          <div className="border border-purple-100 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-purple-50 px-4 py-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white border border-purple-200 flex items-center justify-center text-purple-500 shrink-0">
                <i className="fa-solid fa-sliders text-[11px]"></i>
              </div>
              <div>
                <div className="font-bold text-gray-800 text-sm">Cộng thêm / Giảm trừ</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  Vd: giảm ngày tết, giảm trừ covid, thêm tiền phạt...
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-white space-y-2.5">
              <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-[11px] text-orange-600 flex items-start gap-1.5">
                <i className="fa-solid fa-circle-info mt-0.5 shrink-0"></i>
                <span>
                  Chú ý: Cộng thêm / giảm trừ không nên là tiền cọc. Hãy chọn lý do có tiền cọc để nếu cần
                </span>
              </div>
              <button className="w-full py-2 border border-dashed border-gray-300 rounded-xl text-xs font-semibold text-gray-500 hover:border-green-400 hover:text-green-600 hover:bg-green-50/50 transition flex items-center justify-center gap-1.5">
                <i className="fa-solid fa-plus"></i> Thêm mục cộng thêm / giảm trừ
              </button>
            </div>
          </div>
        </div>

        {/* ── BOTTOM: ZALO + TOTAL ───────────────── */}
        <div className="px-4 py-3 bg-gray-50/80 border-t border-gray-100 flex items-center gap-3 shrink-0">
          <label className="flex items-start gap-2 cursor-pointer flex-1 min-w-0">
            <input type="checkbox" className="mt-0.5 w-4 h-4 accent-green-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-700 flex items-center gap-1 flex-wrap">
                <i className="fa-brands fa-square-whatsapp text-green-500"></i>
                Gửi ZALO &amp; APP khách thuê
              </div>
              <div className="text-[10px] text-red-400 mt-0.5">
                *Lưu ý: Chỉ gửi từ 6h sáng đến 22h tối
              </div>
            </div>
          </label>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Tổng cộng</div>
            <div className="font-black text-green-600 text-lg leading-tight tabular-nums">
              {fmtVND(totalAmount)} đ
            </div>
          </div>
        </div>

        {/* ── FOOTER ────────────────────────────── */}
        <div className="px-4 py-3 bg-white border-t border-gray-100 flex gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 shadow-sm shadow-green-100 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? (
              <><i className="fa-solid fa-spinner animate-spin"></i> Đang lưu...</>
            ) : (
              <><i className="fa-solid fa-plus"></i> Thêm hóa đơn</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
