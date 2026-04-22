import React, { useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { recordInvoicePayment, getRooms, type Invoice } from '../lib/db';
import { playPayment } from '../lib/sound';

interface ManualPaymentModalProps {
  invoice: Invoice;
  onClose: () => void;
}

export const ManualPaymentModal: React.FC<ManualPaymentModalProps> = ({ invoice, onClose }) => {
  const queryClient = useQueryClient();
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms });
  const room = rooms.find(r => r.id === invoice.room_id);

  const [paidAmount, setPaidAmount] = useState<number | ''>(invoice.total_amount - (invoice.paid_amount || 0));
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>(invoice.payment_method || 'transfer');
  const [saving, setSaving] = useState(false);

  // remaining debt
  const currentPaid = invoice.paid_amount || 0;
  const remaining = invoice.total_amount - currentPaid;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paidAmount || paidAmount <= 0) return;

    setSaving(true);
    await recordInvoicePayment(invoice.id, {
      amount: Number(paidAmount),
      payment_method: paymentMethod,
      payment_date: new Date().toISOString().split('T')[0],
    });

    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['rooms'] });
    playPayment();

    setSaving(false);
    onClose();
  };

  const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[90]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[fadeIn_0.15s_ease-out]" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSave}>
          <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-green-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xl">
                <i className="fa-solid fa-hand-holding-dollar"></i>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Xác nhận thu tiền</h2>
                <div className="text-[13px] text-gray-500 font-medium">Hóa đơn kỳ {String(invoice.month).padStart(2, '0')}/{invoice.year}{room ? ` - ${room.name}` : ''}</div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 transition">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm flex justify-between items-center">
              <span className="text-gray-500">Tổng hóa đơn:</span>
              <span className="font-bold text-gray-800">{formatVND(invoice.total_amount)} đ</span>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm flex justify-between items-center">
              <span className="text-gray-500">Còn nợ:</span>
              <span className="font-bold text-red-500">{formatVND(remaining)} đ</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Số tiền khách đóng (VNĐ)</label>
              <input
                type="number"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value ? Number(e.target.value) : '')}
                className="w-full text-right font-bold text-lg border border-gray-300 rounded-lg px-4 py-2.5 text-primary focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition"
                placeholder="Nhập số tiền..."
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">Phương thức thanh toán</label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`cursor-pointer border p-2.5 rounded-xl flex items-center justify-center gap-2 transition ${paymentMethod === 'transfer' ? 'border-primary bg-primary/5 text-primary font-bold shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50 font-medium'}`}>
                  <input type="radio" name="payment_method" className="hidden" checked={paymentMethod === 'transfer'} onChange={() => setPaymentMethod('transfer')} />
                  <i className="fa-solid fa-building-columns"></i> Chuyển khoản
                </label>
                <label className={`cursor-pointer border p-2.5 rounded-xl flex items-center justify-center gap-2 transition ${paymentMethod === 'cash' ? 'border-primary bg-primary/5 text-primary font-bold shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50 font-medium'}`}>
                  <input type="radio" name="payment_method" className="hidden" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />
                  <i className="fa-solid fa-money-bill-wave"></i> Tiền mặt
                </label>
              </div>
            </div>
            {paidAmount !== '' && paidAmount < remaining && (
              <div className="text-[11px] text-orange-500 flex items-center gap-1">
                <i className="fa-solid fa-circle-info"></i>
                Khách mới trả một phần. Khoản còn thiếu sẽ tiếp tục nằm trên chính hóa đơn này cho đến khi thu đủ hoặc được tất toán.
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 transition">
              Hủy
            </button>
            <button type="submit" disabled={saving || !paidAmount || paidAmount <= 0} className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300 shadow shadow-green-200 transition flex items-center gap-2">
              <i className="fa-solid fa-check"></i>
              Xác nhận thu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
