import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInvoices, getRooms, getTenants, getAppSettings, deleteInvoice, type Invoice, type Room } from '../lib/db';
import { PaymentModal } from './PaymentModal';
import { EditInvoiceModal } from './EditInvoiceModal';
import { InvoiceDetailModal } from './InvoiceDetailModal';

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

function getInvoiceLabel(invoice: Invoice): string {
  if (invoice.is_settlement) return 'Hóa đơn tất toán hợp đồng';
  if (invoice.is_first_month) return 'Thu tiền tháng đầu tiên';
  if (invoice.billing_reason === 'contract_end') return 'Tất toán hợp đồng';
  return `Thu tiền tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`;
}

/** Lấy khoảng thời gian kỳ hóa đơn từ dữ liệu đã lưu */
function getBillingPeriod(invoice: Invoice, _room: Room | undefined): { start: string; end: string } | null {
  if (!invoice.billing_period_start || !invoice.billing_period_end) return null;
  return {
    start: invoice.billing_period_start,
    end: invoice.billing_period_end,
  };
}

export const InvoicesTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms });
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices });

  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: getTenants });
  const { data: appSettings = {} } = useQuery({ queryKey: ['appSettings'], queryFn: getAppSettings });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [sortOrder, setSortOrder] = useState<'room_asc' | 'room_desc' | 'amount_desc' | 'newest'>('room_asc');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Invoice[]>(['invoices'], (prev = []) =>
        prev.map((invoice) =>
          invoice.id === id
            ? {
              ...invoice,
              payment_status: 'cancelled',
              note: invoice.note ? `${invoice.note}\n[Đã hủy phiếu]` : '[Đã hủy phiếu]',
            }
            : invoice
        )
      );
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setDeletingId(null);
      setDeleteError(null);
    },
    onError: (err: Error) => {
      setDeleteError(err.message);
    },
  });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Multi-select filter dạng checkbox
  const [filters, setFilters] = useState({ paid: true, unpaid: true, partial: true, settlement: true, cancelled: false });

  const toggleFilter = (key: keyof typeof filters) =>
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));

  const monthYearOptions = useMemo(() => {
    const options: { month: number; year: number }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({ month: date.getMonth() + 1, year: date.getFullYear() });
    }
    return options;
  }, []);

  const monthInvoices = useMemo(
    () => invoices.filter(inv => inv.month === selectedMonth && inv.year === selectedYear),
    [invoices, selectedMonth, selectedYear]
  );

  const roomNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const room of rooms) map.set(room.id, room.name || '');
    return map;
  }, [rooms]);

  const statusCounts = useMemo(() => ({
    paid: monthInvoices.filter(i => i.payment_status === 'paid' && !i.is_settlement).length,
    unpaid: monthInvoices.filter(i => i.payment_status === 'unpaid' && !i.is_settlement).length,
    partial: monthInvoices.filter(i => i.payment_status === 'partial' && !i.is_settlement).length,
    settlement: monthInvoices.filter(i => !!i.is_settlement).length,
    merged: monthInvoices.filter(i => i.payment_status === 'merged').length,
    cancelled: monthInvoices.filter(i => i.payment_status === 'cancelled').length,
  }), [monthInvoices]);

  const filteredInvoices = useMemo(() => {
    const normalizedSearch = searchQuery.toLowerCase();
    const result = monthInvoices.filter(inv => {
      // Hóa đơn đã hủy hợp đồng
      if (inv.payment_status === 'cancelled') return filters.cancelled;
      // Hóa đơn tất toán: dùng filter riêng
      if (inv.is_settlement) return filters.settlement;
      // Hóa đơn đã gộp (merged): luôn hiện nếu settlement bật
      if (inv.payment_status === 'merged') return filters.settlement;
      // Hóa đơn thường
      if (inv.payment_status === 'paid' && !filters.paid) return false;
      if (inv.payment_status === 'unpaid' && !filters.unpaid) return false;
      if (inv.payment_status === 'partial' && !filters.partial) return false;
      const roomName = roomNameById.get(inv.room_id) || '';
      return roomName.toLowerCase().includes(normalizedSearch);
    }).filter(inv => {
      const roomName = roomNameById.get(inv.room_id) || '';
      return roomName.toLowerCase().includes(normalizedSearch);
    });
    return result.sort((a, b) => {
      const roomA = roomNameById.get(a.room_id) || '';
      const roomB = roomNameById.get(b.room_id) || '';
      if (sortOrder === 'room_asc') return roomA.localeCompare(roomB);
      if (sortOrder === 'room_desc') return roomB.localeCompare(roomA);
      if (sortOrder === 'amount_desc') return b.total_amount - a.total_amount;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [monthInvoices, filters, roomNameById, searchQuery, sortOrder]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded bg-green-100 flex items-center justify-center text-green-600 text-xl">
              <i className="fa-solid fa-file-invoice-dollar"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Quản lý hóa đơn</h2>
              <p className="text-xs text-gray-500">Tra cứu và quản lý tất cả hóa đơn các tháng</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm transition">
              <i className="fa-solid fa-print"></i><span>In h.đơn</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium text-sm transition">
              <i className="fa-solid fa-file-export"></i><span>Xuất excel</span>
            </button>
          </div>
        </div>

        {/* Month Tabs */}
        <div className="px-4 pt-3 overflow-x-auto border-b border-gray-100">
          <div className="flex gap-1.5 pb-0 min-w-max">
            {monthYearOptions.map(opt => {
              const isActive = selectedMonth === opt.month && selectedYear === opt.year;
              const count = invoices.filter(i => i.month === opt.month && i.year === opt.year).length;
              return (
                <button
                  key={`${opt.month}-${opt.year}`}
                  onClick={() => { setSelectedMonth(opt.month); setSelectedYear(opt.year); }}
                  className={`relative px-4 py-2 rounded-t-lg font-medium text-sm transition-colors flex items-center gap-1.5 ${isActive ? 'bg-green-100 text-green-700 border-b-2 border-green-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                >
                  T.{opt.month} {opt.year}
                  {count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter bar — checkbox style */}
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          {/* Filter icon + badge */}
          <div className="relative">
            <i className="fa-solid fa-filter text-gray-500 text-sm"></i>
            <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {filteredInvoices.length}
            </span>
          </div>

          {/* Checkboxes */}
          {[
            { key: 'paid' as const, label: 'Đã thu', count: statusCounts.paid, color: 'text-emerald-700' },
            { key: 'unpaid' as const, label: 'Chưa thu', count: statusCounts.unpaid, color: 'text-orange-600' },
            { key: 'partial' as const, label: 'Đang nợ', count: statusCounts.partial, color: 'text-red-600' },
            { key: 'settlement' as const, label: 'Tất toán', count: statusCounts.settlement, color: 'text-purple-600' },
            { key: 'cancelled' as const, label: 'Đã hủy HĐ', count: statusCounts.cancelled, color: 'text-gray-500' },
          ].map(({ key, label, count, color }) => (
            <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={() => toggleFilter(key)}
                className="w-3.5 h-3.5 accent-green-600"
              />
              <span className="text-xs text-gray-600">{label}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 ${color}`}>{count}</span>
            </label>
          ))}

          <div className="flex-1" />

          {/* Sort */}
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value as typeof sortOrder)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:border-green-400"
          >
            <option value="room_asc">Thứ tự phòng tăng dần</option>
            <option value="room_desc">Thứ tự phòng giảm dần</option>
            <option value="amount_desc">Tiền nhiều nhất</option>
            <option value="newest">Mới nhất</option>
          </select>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Tìm tên phòng..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-44 text-xs border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 bg-white outline-none focus:border-green-400"
            />
            <i className="fa-solid fa-magnifying-glass absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left text-sm">
            <thead className="bg-blue-50 text-gray-600 text-xs font-semibold sticky top-0 z-10 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 w-10"></th>
                <th className="px-3 py-3 min-w-[180px]">Tên phòng</th>
                <th className="px-3 py-3 min-w-[140px] text-right">Tiền phòng</th>
                <th className="px-3 py-3 min-w-[120px] text-right">Điện nước</th>
                <th className="px-3 py-3 min-w-[110px] text-right">Thu/trả cọc</th>
                <th className="px-3 py-3 min-w-[110px] text-right">Cộng thêm/Giảm trừ</th>
                <th className="px-3 py-3 min-w-[140px] text-right font-bold">Tổng cộng</th>
                <th className="px-3 py-3 min-w-[110px] text-right">Cần thu</th>
                <th className="px-3 py-3 text-center min-w-[130px]">Trạng thái</th>
                <th className="px-3 py-3 text-center w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    <i className="fa-solid fa-spinner animate-spin mr-2"></i>Đang tải...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    <i className="fa-solid fa-inbox text-2xl mb-2 block opacity-40"></i>
                    Không có hóa đơn nào
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => {
                  const room = rooms.find(r => r.id === invoice.room_id);
                  const isPaid = invoice.payment_status === 'paid';
                  const isPartial = invoice.payment_status === 'partial';
                  const isCancelled = invoice.payment_status === 'cancelled';
                  const remaining = invoice.total_amount - invoice.paid_amount;
                  const elecWaterCost = invoice.electric_cost + invoice.water_cost;
                  const depositAmt = invoice.deposit_amount || 0;
                  const adjustmentAmt = invoice.adjustment_amount || 0;
                  const period = getBillingPeriod(invoice, room);
                  const label = getInvoiceLabel(invoice);

                  const isSettlement = !!invoice.is_settlement;
                  const isMerged = invoice.payment_status === 'merged';
                  return (
                    <tr
                      key={invoice.id}
                      className={`transition hover:brightness-95 ${isCancelled ? 'bg-gray-50 opacity-60' :
                        isSettlement ? 'bg-purple-50/60' :
                          isMerged ? 'bg-gray-50' :
                            isPaid ? 'bg-emerald-50/60' : 'bg-white'
                        }`}
                    >
                      {/* Color dot */}
                      <td className="px-3 py-3 text-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs mx-auto shadow-sm ${isCancelled ? 'bg-gray-400' :
                          isSettlement ? 'bg-gradient-to-br from-purple-500 to-indigo-500' :
                            isMerged ? 'bg-gray-400' :
                              isPaid ? 'bg-gradient-to-br from-emerald-400 to-green-500' :
                                isPartial ? 'bg-yellow-400' : 'bg-orange-400'
                          }`}>
                          <i className={`fa-solid ${isCancelled ? 'fa-ban' :
                            isSettlement ? 'fa-door-closed' :
                              isMerged ? 'fa-layer-group' :
                                isPaid ? 'fa-check' : isPartial ? 'fa-hourglass-half' : 'fa-clock'
                            }`}></i>
                        </div>
                      </td>

                      {/* Tên phòng */}
                      <td className="px-3 py-3">
                        <div className="font-bold text-gray-800">{room?.name || 'Phòng đã xóa'}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{label}</div>
                        <div className="text-[10px] text-gray-400">({new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString('vi-VN')})</div>
                      </td>

                      {/* Tiền phòng + date range */}
                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold text-gray-800 tabular-nums">{formatVND(invoice.room_cost)} đ</div>
                        {period && (
                          <div className="text-[10px] text-green-600 mt-0.5 tabular-nums">
                            [{fmtDate(period.start)} - {fmtDate(period.end)}]
                          </div>
                        )}
                      </td>

                      {/* Điện nước */}
                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold text-gray-700 tabular-nums">{formatVND(elecWaterCost)} đ</div>
                        {elecWaterCost > 0 && (
                          <div className="text-[10px] text-gray-400 space-y-0.5 mt-0.5">
                            {invoice.electric_cost > 0 && <div>Điện: {formatVND(invoice.electric_cost)}</div>}
                            {invoice.water_cost > 0 && <div>Nước: {formatVND(invoice.water_cost)}</div>}
                          </div>
                        )}
                      </td>

                      {/* Thu/trả cọc */}
                      <td className="px-3 py-3 text-right">
                        {depositAmt !== 0 ? (
                          <span className={`font-semibold tabular-nums ${depositAmt < 0 ? 'text-red-500' : 'text-gray-700'}`}>
                            {depositAmt < 0 ? '-' : ''}{formatVND(Math.abs(depositAmt))} đ
                          </span>
                        ) : (
                          <span className="text-gray-400">0 đ</span>
                        )}
                      </td>

                      {/* Cộng thêm / Giảm trừ */}
                      <td className="px-3 py-3 text-right">
                        {adjustmentAmt !== 0 ? (
                          <span className={`font-semibold tabular-nums ${adjustmentAmt < 0 ? 'text-red-500' : 'text-gray-700'}`}>
                            {adjustmentAmt < 0 ? '-' : ''}{formatVND(Math.abs(adjustmentAmt))} đ
                          </span>
                        ) : (
                          <span className="text-gray-400">0 đ</span>
                        )}
                      </td>

                      {/* Tổng cộng */}
                      <td className="px-3 py-3 text-right">
                        {invoice.total_amount < 0 ? (
                          <div>
                            <div className="font-bold text-blue-600 text-base tabular-nums">
                              Hoàn {formatVND(Math.abs(invoice.total_amount))} đ
                            </div>
                            {invoice.paid_amount > 0 && (
                              <div className="text-[10px] text-emerald-600 mt-0.5 italic">
                                Đã hoàn<br />
                                <span className="font-bold tabular-nums">{formatVND(invoice.paid_amount)} đ</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-gray-800 text-base tabular-nums">{formatVND(invoice.total_amount)} đ</div>
                            {invoice.paid_amount > 0 && (
                              <div className="text-[10px] text-emerald-600 mt-0.5 italic">
                                Số tiền đã thu<br />
                                <span className="font-bold tabular-nums">{formatVND(invoice.paid_amount)} đ</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Cần thu / Cần hoàn */}
                      <td className="px-3 py-3 text-right">
                        {invoice.total_amount < 0 && invoice.paid_amount === 0 ? (
                          <span className="font-bold text-blue-500 tabular-nums">
                            Hoàn {formatVND(Math.abs(invoice.total_amount))} đ
                          </span>
                        ) : remaining > 0 ? (
                          <span className="font-bold text-red-500 tabular-nums">{formatVND(remaining)} đ</span>
                        ) : (
                          <span className="font-bold text-emerald-600">0 đ</span>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td className="px-3 py-3 text-center">
                        {isCancelled ? (
                          <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap line-through">
                            <i className="fa-solid fa-ban mr-1"></i>Đã hủy HĐ
                          </span>
                        ) : isSettlement ? (
                          <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                            <i className="fa-solid fa-door-closed mr-1"></i>Tất toán
                          </span>
                        ) : isMerged ? (
                          <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                            <i className="fa-solid fa-layer-group mr-1"></i>Đã gộp
                          </span>
                        ) : isPaid ? (
                          <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                            <i className="fa-solid fa-check mr-1"></i>Đã thu xong
                          </span>
                        ) : isPartial ? (
                          <span className="bg-yellow-100 text-yellow-700 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                            <i className="fa-solid fa-hourglass-half mr-1"></i>Thu thiếu
                          </span>
                        ) : (
                          <span className="bg-orange-100 text-orange-600 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                            <i className="fa-solid fa-clock mr-1"></i>Chưa thu
                          </span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={(e) => {
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                            setOpenMenuId(openMenuId === invoice.id ? null : invoice.id);
                          }}
                          className="text-gray-400 hover:text-gray-600 transition w-7 h-7 rounded hover:bg-gray-100 flex items-center justify-center mx-auto"
                        >
                          <i className="fa-solid fa-ellipsis-vertical"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Stats */}
        {filteredInvoices.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Tổng hóa đơn</div>
              <div className="font-bold text-gray-800">{filteredInvoices.filter(i => i.payment_status !== 'cancelled').length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Tổng tiền</div>
              <div className="font-bold text-blue-600 tabular-nums">
                {formatVND(filteredInvoices.filter(i => i.payment_status !== 'cancelled').reduce((s, i) => s + i.total_amount, 0))} đ
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Đã thu</div>
              <div className="font-bold text-emerald-600 tabular-nums">
                {formatVND(filteredInvoices.filter(i => i.payment_status !== 'cancelled').reduce((s, i) => s + i.paid_amount, 0))} đ
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Còn thu</div>
              <div className="font-bold text-red-500 tabular-nums">
                {formatVND(filteredInvoices.filter(i => i.payment_status !== 'cancelled').reduce((s, i) => s + Math.max(0, i.total_amount - i.paid_amount), 0))} đ
              </div>
            </div>
          </div>
        )}
      </div>
      {openMenuId && (() => {
        const invoice = filteredInvoices.find(i => i.id === openMenuId);
        if (!invoice) return null;
        const isPaidMenu = invoice.payment_status === 'paid';
        return (
          <div
            ref={menuRef}
            style={{ top: menuPos.top, right: menuPos.right }}
            className="fixed z-[200] w-44 rounded-xl border border-gray-200 bg-white shadow-xl py-1 text-sm"
          >
            <button
              onClick={() => { setViewingInvoice(invoice); setOpenMenuId(null); }}
              className="flex w-full items-center gap-2 px-4 py-2 text-green-700 hover:bg-green-50 font-semibold"
            >
              <i className="fa-solid fa-file-invoice w-4"></i>Xem chi tiết
            </button>
            {!isPaidMenu && (
              <button
                onClick={() => { setPayingInvoice(invoice); setOpenMenuId(null); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-emerald-700 hover:bg-emerald-50 font-semibold"
              >
                <i className="fa-solid fa-money-bill-wave w-4"></i>Thu tiền
              </button>
            )}
            <button
              onClick={() => { setEditingInvoice(invoice); setOpenMenuId(null); }}
              className="flex w-full items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 font-semibold"
            >
              <i className="fa-solid fa-pen-to-square w-4"></i>Sửa hóa đơn
            </button>
            <button
              onClick={() => { setDeletingId(invoice.id); setDeleteError(null); setOpenMenuId(null); }}
              className="flex w-full items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 font-semibold"
            >
              <i className="fa-solid fa-ban w-4"></i>Hủy phiếu
            </button>
          </div>
        );
      })()}

      {deletingId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onKeyDown={(e) => { if (e.key === 'Enter' && !deleteMutation.isPending && !deleteError) deleteMutation.mutate(deletingId); }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                <i className="fa-solid fa-ban"></i>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Hủy phiếu thu?</h3>
                <p className="text-xs text-gray-500">Phiếu sẽ chuyển sang trạng thái đã hủy để giữ lịch sử đối chiếu.</p>
              </div>
            </div>
            {deleteError && (
              <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0"></i>
                <span>{deleteError}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setDeletingId(null); setDeleteError(null); }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Hủy
              </button>
              <button
                onClick={() => deleteMutation.mutate(deletingId)}
                disabled={deleteMutation.isPending || !!deleteError}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 transition disabled:opacity-60"
              >
                {deleteMutation.isPending ? 'Đang hủy...' : 'Hủy phiếu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingInvoice && (
        <EditInvoiceModal
          invoice={editingInvoice}
          room={rooms.find(r => r.id === editingInvoice.room_id)}
          onClose={() => setEditingInvoice(null)}
        />
      )}

      {payingInvoice && (
        <PaymentModal
          invoice={payingInvoice}
          room={rooms.find(r => r.id === payingInvoice.room_id)}
          onClose={() => setPayingInvoice(null)}
        />
      )}

      {viewingInvoice && (() => {
        const vRoom = rooms.find(r => r.id === viewingInvoice.room_id);
        const vTenant = tenants.find(t => t.id === viewingInvoice.tenant_id);
        return (
          <InvoiceDetailModal
            invoice={viewingInvoice}
            room={vRoom}
            tenantName={vTenant?.full_name}
            tenantPhone={vTenant?.phone}
            settings={appSettings}
            onClose={() => setViewingInvoice(null)}
          />
        );
      })()}
    </div>
  );
};
