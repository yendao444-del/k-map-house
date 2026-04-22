import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createInvoice, getInvoicesByRoom, getServiceZones, getContracts, type Invoice, type Room, type Tenant } from '../lib/db';
import { playCreate } from '../lib/sound';
import { PaymentModal } from './PaymentModal';

interface InvoiceModalProps {
  room: Room;
  tenant: Tenant | null;
  onClose: () => void;
}

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);

const toDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const reasonOptions = [
  { value: 'first_month', label: 'Thu tiền tháng đầu tiên' },
  { value: 'monthly', label: 'Thu tiền hàng tháng' },
  { value: 'contract_end', label: 'Thu tiền khi kết thúc hợp đồng' },
  { value: 'room_cycle', label: 'Thu tiền phòng theo chu kỳ' },
  { value: 'service', label: 'Thu tiền dịch vụ' },
  { value: 'deposit_collect', label: 'Thu tiền cọc' },
  { value: 'deposit_refund', label: 'Hoàn tiền cọc' },
] as const;

type BillingReason = (typeof reasonOptions)[number]['value'];

export function InvoiceModal({ room, tenant, onClose }: InvoiceModalProps) {
  const queryClient = useQueryClient();
  const today = useMemo(() => toDateInput(new Date()), []);

  const { data: serviceZones = [] } = useQuery({
    queryKey: ['serviceZones'],
    queryFn: getServiceZones,
  });

  const { data: existingInvoices = [] } = useQuery({
    queryKey: ['invoices', room.id],
    queryFn: () => getInvoicesByRoom(room.id),
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts'],
    queryFn: getContracts,
  });

  const activeContract = useMemo(() => contracts.find(c => c.room_id === room.id && c.status === 'active'), [contracts, room.id]);
  const th = activeContract?.transfer_history;
  const hasTransfer = Boolean(th && !th.history_billed_in_invoice_id);
  const transferHistory = useMemo(() => {
    if (!hasTransfer || !th) return null;
    return {
      old_room_name: th.old_room_name || 'Phòng cũ',
      change_date: th.change_date,
      old_electric_old: Number(th.old_electric_old) || 0,
      old_electric_new: Number(th.old_electric_new) || 0,
      old_electric_price: Number(th.old_electric_price) || 0,
      old_water_old: Number(th.old_water_old) || 0,
      old_water_new: Number(th.old_water_new) || 0,
      old_water_price: Number(th.old_water_price) || 0,
      old_base_rent: Number(th.old_base_rent) || 0,
      old_wifi_price: Number(th.old_wifi_price) || 0,
      old_garbage_price: Number(th.old_garbage_price) || 0,
      history_billed_in_invoice_id: th.history_billed_in_invoice_id,
    };
  }, [hasTransfer, th]);

  const currentTenantId = activeContract?.tenant_id || tenant?.id || null;

  const firstMonthInvoice = useMemo(
    () => !!currentTenantId
      ? existingInvoices.find(
        i => i.is_first_month &&
          i.payment_status !== 'cancelled' &&
          i.tenant_id === currentTenantId &&
          (!activeContract || i.created_at >= activeContract.created_at)
      ) || null
      : null,
    [existingInvoices, currentTenantId, activeContract]
  );

  const unpaidFirstMonthInvoice = useMemo(
    () => firstMonthInvoice && (firstMonthInvoice.payment_status === 'unpaid' || firstMonthInvoice.payment_status === 'partial')
      ? firstMonthInvoice
      : null,
    [firstMonthInvoice]
  );

  const hasPaidFirstMonthInvoice = useMemo(
    () => !!firstMonthInvoice && (
      firstMonthInvoice.payment_status === 'paid' ||
      firstMonthInvoice.paid_amount > 0
    ),
    [firstMonthInvoice]
  );

  const zone = useMemo(
    () => serviceZones.find((item) => item.id === room.service_zone_id) || null,
    [serviceZones, room.service_zone_id]
  );

  const [billingReason, setBillingReason] = useState<BillingReason>('first_month');
  const unpaidFirstMonthBlocksMonthly = billingReason === 'monthly' ? unpaidFirstMonthInvoice : null;

  useEffect(() => {
    if (hasTransfer) {
      setBillingReason('monthly');
      return;
    }
    if (unpaidFirstMonthInvoice) {
      setBillingReason('first_month');
      return;
    }
    if (existingInvoices.length > 0) {
      setBillingReason(hasPaidFirstMonthInvoice ? 'monthly' : 'first_month');
    }
    // Nếu có lịch sử chuyển phòng chưa thanh toán, thì auto force Monthly để gộp ngay
    if (hasTransfer) {
      setBillingReason('monthly');
      return;
    }
  }, [hasPaidFirstMonthInvoice, existingInvoices.length, hasTransfer, unpaidFirstMonthInvoice]);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [depositAmount, setDepositAmount] = useState<number>(room.default_deposit || 0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('transfer');
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const warningRef = useRef<HTMLDivElement>(null);

  // Monthly billing - meter readings
  const electricOld = room.electric_new || 0;
  const waterOld = room.water_new || 0;
  const [electricNew, setElectricNew] = useState<number>(room.electric_new || 0);
  const [waterNew, setWaterNew] = useState<number>(room.water_new || 0);
  const [electricTouched, setElectricTouched] = useState(false);
  const [waterTouched, setWaterTouched] = useState(false);

  // Monthly billing - period
  const defaultPeriodStart = useMemo(() => {
    const d = new Date(today);
    return toDateInput(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [today]);
  const defaultPeriodEnd = today; // mặc định đến hôm nay
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd);

  const invoiceDateObj = useMemo(() => {
    const parsedDate = new Date(invoiceDate);
    return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  }, [invoiceDate]);
  const billingMonth = invoiceDateObj.getMonth() + 1;
  const billingYear = invoiceDateObj.getFullYear();
  const daysInMonth = new Date(billingYear, billingMonth, 0).getDate();
  const currentDay = invoiceDateObj.getDate();
  const remainingDays = daysInMonth - currentDay + 1;
  const prorataRatio = remainingDays / daysInMonth;

  const internetMonthly = zone?.internet_price || room.wifi_price || 0;
  const cleaningMonthly = zone?.cleaning_price || room.garbage_price || 0;

  const isProratedReason = billingReason === 'first_month' || billingReason === 'contract_end';
  const includesRoomCharge = ['first_month', 'monthly', 'contract_end', 'room_cycle'].includes(billingReason);
  const includesFixedServices = ['first_month', 'monthly', 'contract_end', 'room_cycle', 'service'].includes(billingReason);
  const includesDeposit = ['first_month', 'deposit_collect', 'deposit_refund'].includes(billingReason);

  const depositAlreadyCollected = useMemo(() =>
    existingInvoices.some(i =>
      i.tenant_id === currentTenantId &&
      i.payment_status !== 'cancelled' &&
      i.paid_amount > 0 &&
      (i.deposit_amount || 0) > 0
    ),
    [existingInvoices, currentTenantId]
  );

  // --- TÍNH TOÁN THEO LỊCH SỬ CHUYỂN PHÒNG ---
  const tDays = useMemo(() => {
    if (!transferHistory?.change_date) return 0;
    const changeDate = new Date(transferHistory.change_date);
    if (Number.isNaN(changeDate.getTime())) return 0;
    return Math.max(0, changeDate.getDate() - 1);
  }, [transferHistory]);

  const newRoomDays = Math.max(0, daysInMonth - tDays);

  const transferRoomCost = transferHistory && includesRoomCharge ? Math.round((transferHistory.old_base_rent / daysInMonth) * tDays) : 0;

  const roomCost = useMemo(() => {
    if (!includesRoomCharge) return 0;
    const rent = activeContract?.base_rent ?? room.base_rent;
    if (hasTransfer) return Math.round(rent * (newRoomDays / daysInMonth));
    if (isProratedReason) return Math.round(rent * prorataRatio);
    return rent;
  }, [includesRoomCharge, isProratedReason, activeContract, room.base_rent, prorataRatio, hasTransfer, newRoomDays, daysInMonth]);

  const transferServiceCost = transferHistory && includesFixedServices ? Math.round(((transferHistory.old_wifi_price + transferHistory.old_garbage_price) / daysInMonth) * tDays) : 0;

  const internetCost = useMemo(() => {
    if (!includesFixedServices) return 0;
    if (hasTransfer) return Math.round(internetMonthly * (newRoomDays / daysInMonth));
    if (isProratedReason) return Math.round(internetMonthly * prorataRatio);
    return internetMonthly;
  }, [includesFixedServices, internetMonthly, isProratedReason, prorataRatio, hasTransfer, newRoomDays, daysInMonth]);

  const cleaningCost = useMemo(() => {
    if (!includesFixedServices) return 0;
    if (hasTransfer) return Math.round(cleaningMonthly * (newRoomDays / daysInMonth));
    if (isProratedReason) return Math.round(cleaningMonthly * prorataRatio);
    return cleaningMonthly;
  }, [includesFixedServices, cleaningMonthly, isProratedReason, prorataRatio, hasTransfer, newRoomDays, daysInMonth]);

  const normalizedDeposit = useMemo(() => {
    if (!includesDeposit) return 0;
    if (billingReason === 'deposit_refund') return -Math.abs(depositAmount || 0);
    if (depositAlreadyCollected) return 0;
    return Math.abs(depositAmount || 0);
  }, [billingReason, depositAmount, includesDeposit, depositAlreadyCollected]);

  const transferElectricUsage = transferHistory ? Math.max(0, transferHistory.old_electric_new - transferHistory.old_electric_old) : 0;
  const transferElectricCost = transferHistory ? transferElectricUsage * transferHistory.old_electric_price : 0;
  const transferWaterUsage = transferHistory ? Math.max(0, transferHistory.old_water_new - transferHistory.old_water_old) : 0;
  const transferWaterCost = transferHistory ? transferWaterUsage * transferHistory.old_water_price : 0;

  const electricPrice = room.electric_price || zone?.electric_price || 0;
  const waterPrice = room.water_price || zone?.water_price || 0;

  const shouldBillUtilities = billingReason === 'monthly' || hasTransfer;
  const electricUsage = shouldBillUtilities ? Math.max(0, electricNew - electricOld) : 0;
  const electricCost = electricUsage * electricPrice;
  const waterUsage = shouldBillUtilities ? Math.max(0, waterNew - waterOld) : 0;
  const waterCost = waterUsage * waterPrice;

  // Validation cho phần điện/nước 
  const electricNewInvalid = shouldBillUtilities && electricNew < electricOld;
  const electricNotEntered = shouldBillUtilities && !electricTouched;
  const waterNewInvalid = shouldBillUtilities && waterNew < waterOld;
  const waterNotEntered = shouldBillUtilities && !waterTouched;
  const utilityValidationFailed = shouldBillUtilities && (electricNotEntered || electricNewInvalid || waterNotEntered || waterNewInvalid);

  const totalAmount = roomCost + transferRoomCost + internetCost + cleaningCost + transferServiceCost + normalizedDeposit + electricCost + transferElectricCost + waterCost + transferWaterCost;
  const canCreateInvoice = Boolean(currentTenantId);

  const duplicateInvoice = useMemo(() => {
    if (!currentTenantId) return null;
    if (billingReason === 'first_month' && unpaidFirstMonthInvoice) return null;
    const normalizedReason = billingReason === 'first_month' ? 'first_month' : billingReason;
    return existingInvoices.find((inv) =>
      inv.tenant_id === currentTenantId &&
      (inv.billing_reason || (inv.is_first_month ? 'first_month' : undefined)) === normalizedReason &&
      inv.month === billingMonth &&
      inv.year === billingYear &&
      inv.payment_status !== 'cancelled'
    ) || null;
  }, [existingInvoices, billingReason, billingMonth, billingYear, currentTenantId, unpaidFirstMonthInvoice]);

  // Chặn lập HĐ hàng tháng nếu cùng tháng đã có phiếu thu tháng đầu (mirror logic db.ts)
  const firstMonthBlocksMonthly = useMemo(() => {
    if (billingReason !== 'monthly' || !currentTenantId) return null;
    return existingInvoices.find(i =>
      i.tenant_id === currentTenantId &&
      i.is_first_month === true &&
      i.month === billingMonth &&
      i.year === billingYear &&
      i.payment_status !== 'cancelled'
    ) || null;
  }, [existingInvoices, billingReason, billingMonth, billingYear, currentTenantId]);

  useEffect(() => {
    if (duplicateInvoice && warningRef.current) {
      const el = warningRef.current;
      el.classList.remove('animate-shake');
      void el.offsetWidth;
      el.classList.add('animate-shake');
    }
  }, [duplicateInvoice]);

  const invoiceMutation = useMutation({
    mutationFn: async () => {
      return createInvoice({
        room_id: room.id,
        tenant_id: currentTenantId || '',
        billing_reason: billingReason,
        month: billingMonth,
        year: billingYear,
        invoice_date: invoiceDate,
        billing_period_start: billingReason === 'monthly' ? periodStart : invoiceDate,
        billing_period_end: billingReason === 'monthly' ? periodEnd : new Date(billingYear, billingMonth - 1, daysInMonth).toISOString().split('T')[0],
        electric_old: billingReason === 'monthly' ? electricOld : (room.electric_new || 0),
        electric_new: billingReason === 'monthly' ? electricNew : (room.electric_new || 0),
        electric_usage: electricUsage,
        electric_cost: electricCost,
        water_old: billingReason === 'monthly' ? waterOld : (room.water_new || 0),
        water_new: billingReason === 'monthly' ? waterNew : (room.water_new || 0),
        water_usage: waterUsage,
        water_cost: waterCost,
        room_cost: roomCost,
        wifi_cost: internetCost,
        garbage_cost: cleaningCost,
        old_debt: 0,
        deposit_amount: normalizedDeposit,
        prorata_days: isProratedReason ? remainingDays : undefined,
        total_amount: totalAmount,
        paid_amount: 0,
        payment_status: 'unpaid',
        payment_method: paymentMethod,
        is_first_month: billingReason === 'first_month',
        electric_price_snapshot: electricPrice,
        water_price_snapshot: waterPrice,
        allow_duplicate: confirmedDuplicate && billingReason !== 'first_month',

        has_transfer: hasTransfer,
        transfer_old_room_name: th?.old_room_name,
        transfer_days: tDays,
        transfer_room_cost: transferRoomCost,
        transfer_electric_cost: transferElectricCost,
        transfer_water_cost: transferWaterCost,
        transfer_service_cost: transferServiceCost,
        transfer_electric_usage: transferElectricUsage,
        transfer_water_usage: transferWaterUsage,
        new_room_days: newRoomDays,
      });
    },
    onSuccess: async () => {
      // Khi lập hóa đơn tháng đầu → cập nhật ngày vào ở chính thức (đã thanh toán = đã chắc chắn)
      if (billingReason === 'first_month' && invoiceDate) {
        const { updateRoom } = await import('../lib/db');
        await updateRoom(room.id, { move_in_date: invoiceDate });
      }
      // Đánh dấu là đã được xuất hóa đơn
      if (hasTransfer && activeContract) {
        const { updateContract } = await import('../lib/db');
        await updateContract(activeContract.id, {
          transfer_history: {
            ...activeContract.transfer_history!,
            history_billed_in_invoice_id: 'billed'
          }
        });
      }
      playCreate();
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    },
    onError: (err: Error) => {
      setMutationError(err.message);
    },
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 p-4 pt-8 backdrop-blur-sm">
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-700">
            <i className="fa-solid fa-file-invoice-dollar text-lg"></i>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[18px] font-bold text-gray-900">Lập hóa đơn cho "{room.name}"</h2>
            <p className="text-xs text-gray-500">{tenant?.full_name || room.tenant_name || 'Chưa có khách thuê'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-red-500"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {duplicateInvoice && (
            <div ref={warningRef} className="animate-pulse rounded-xl bg-red-500 px-4 py-3">
              <div className="flex items-start gap-3">
                <i className="fa-solid fa-circle-exclamation mt-0.5 text-white"></i>
                <div className="text-sm text-white">
                  <span className="font-bold">Phòng này đã có hóa đơn "{reasonOptions.find(r => r.value === billingReason)?.label}" trong tháng {billingMonth}/{billingYear}.</span>
                  {' '}Tạo thêm có thể gây trùng lặp.
                </div>
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={confirmedDuplicate}
                  onChange={(e) => setConfirmedDuplicate(e.target.checked)}
                  className="h-4 w-4 rounded accent-white"
                />
                <span className="text-sm font-semibold text-white">Tôi xác nhận muốn tạo thêm hóa đơn này</span>
              </label>
            </div>
          )}
          {!canCreateInvoice && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Không thể lập hóa đơn cho phòng này vì chưa xác định được khách thuê hoặc hợp đồng đang hoạt động.
            </div>
          )}
          {transferHistory && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4">
              <h3 className="text-blue-800 font-bold mb-3 flex items-center gap-2"><i className="fa-solid fa-code-compare"></i> Hóa đơn gộp (Chuyển phòng)</h3>
              <div className="space-y-1.5 text-[13px] text-gray-700">
                <div className="flex justify-between">
                  <span>Tiền phòng cũ ({th?.old_room_name} - {tDays} ngày):</span>
                  <span className="font-semibold">{formatVND(transferRoomCost)}đ</span>
                </div>
                <div className="flex justify-between">
                  <span>Tiền phòng mới ({newRoomDays} ngày):</span>
                  <span className="font-semibold">{formatVND(roomCost)}đ</span>
                </div>
                <div className="flex justify-between border-t border-blue-100/50 pt-1.5 mt-1.5">
                  <span>Điện {th?.old_room_name} ({transferElectricUsage} kWh):</span>
                  <span className="font-semibold">{formatVND(transferElectricCost)}đ</span>
                </div>
                <div className="flex justify-between">
                  <span>Nước {th?.old_room_name} ({transferWaterUsage} m³):</span>
                  <span className="font-semibold">{formatVND(transferWaterCost)}đ</span>
                </div>
                {(transferServiceCost > 0) && (
                  <div className="flex justify-between">
                    <span>Dịch vụ {th?.old_room_name} ({tDays} ngày):</span>
                    <span className="font-semibold">{formatVND(transferServiceCost)}đ</span>
                  </div>
                )}
                <div className="text-[11px] text-blue-600 italic mt-2 !mb-0 border-t border-blue-100/50 pt-2">
                  * Tiền điện, nước, dịch vụ của phòng này ({room.name}) sẽ được cộng tiếp vào phần bên dưới.
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Lý do thu tiền</label>
            <select
              value={billingReason}
              onChange={(e) => { setBillingReason(e.target.value as BillingReason); setConfirmedDuplicate(false); }}
              className="w-full rounded-xl border border-blue-200 px-4 py-3 text-sm font-medium text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {reasonOptions.map((option) => {
                let locked = false;
                let suffix = '';

                // Đã thu HD đầu tiên thì khóa "Thu tháng đầu tiên"
                if (option.value === 'first_month' && hasPaidFirstMonthInvoice) {
                  locked = true;
                  suffix = ' (đã thu)';
                }

                // Chưa thu HD đầu tiên thì KHÓA tất cả trừ "Thu tháng đầu tiên"
                if (unpaidFirstMonthInvoice && option.value === 'monthly') {
                  suffix = ' (phải thu HĐ đầu tiên trước)';
                }

                return (
                  <option key={option.value} value={option.value} disabled={locked}>
                    {option.label}{suffix}
                  </option>
                );
              })}
            </select>
          </div>

          {unpaidFirstMonthBlocksMonthly && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              <div className="font-semibold">Phòng này đã có phiếu tháng đầu chưa thu.</div>
              <div className="mt-1 text-xs text-orange-700">
                Không tạo thêm hóa đơn mới. Hãy thu trên phiếu tháng đầu hiện có trước khi lập hóa đơn loại khác.
              </div>
              <button
                type="button"
                onClick={() => setPayingInvoice(unpaidFirstMonthBlocksMonthly)}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-600"
              >
                <i className="fa-solid fa-hand-holding-dollar"></i>
                Thu phiếu tháng đầu
              </button>
            </div>
          )}

          {billingReason !== 'monthly' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Ngày vào ở</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => { setInvoiceDate(e.target.value); setConfirmedDuplicate(false); }}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-800 outline-none transition focus:border-green-400 focus:ring-2 focus:ring-green-100"
              />
              {isProratedReason && (
                <p className="mt-2 text-xs text-orange-600">
                  Phần mềm tự tính còn <span className="font-bold">{remainingDays}</span> ngày trong tháng {billingMonth}/{billingYear}.
                </p>
              )}
            </div>
          )}

          {includesRoomCharge && (
            <div className="rounded-xl border border-green-100 bg-green-50/70 p-4">
              <div className="mb-1 text-sm font-bold text-gray-800">Tiền phòng</div>
              <div className="text-xs text-gray-500">
                {isProratedReason
                  ? `${remainingDays}/${daysInMonth} ngày x ${formatVND(room.base_rent)} đ`
                  : `Trọn tháng x ${formatVND(room.base_rent)} đ`}
              </div>
              <div className="mt-2 text-right text-2xl font-black text-gray-800">{formatVND(roomCost)} đ</div>
            </div>
          )}

          {includesFixedServices && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
              <div className="mb-3 text-sm font-bold text-gray-800">Tiền phí dịch vụ</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                  <div>
                    <div className="font-medium text-gray-800">Internet</div>
                    <div className="text-xs text-gray-500">
                      {isProratedReason
                        ? `${remainingDays}/${daysInMonth} ngày x ${formatVND(internetMonthly)} đ`
                        : `Trọn tháng x ${formatVND(internetMonthly)} đ`}
                    </div>
                  </div>
                  <div className="font-bold text-gray-800">{formatVND(internetCost)} đ</div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2">
                  <div>
                    <div className="font-medium text-gray-800">Rác / vệ sinh</div>
                    <div className="text-xs text-gray-500">
                      {isProratedReason
                        ? `${remainingDays}/${daysInMonth} ngày x ${formatVND(cleaningMonthly)} đ`
                        : `Trọn tháng x ${formatVND(cleaningMonthly)} đ`}
                    </div>
                  </div>
                  <div className="font-bold text-gray-800">{formatVND(cleaningCost)} đ</div>
                </div>
              </div>
            </div>
          )}

          {billingReason === 'monthly' && (
            <>
              {/* Chu kỳ */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 text-sm font-bold text-gray-800">Chu kỳ thanh toán</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">Từ ngày</label>
                    <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600">Đến ngày</label>
                    <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100" />
                  </div>
                </div>
              </div>

              {/* Điện nước */}
              <div className="rounded-xl border border-yellow-100 bg-yellow-50/70 p-4">
                <div className="mb-3 text-sm font-bold text-gray-800">Điện / Nước</div>
                <div className="space-y-3">
                  {/* Điện */}
                  <div className="rounded-lg bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700"><i className="fa-solid fa-bolt text-yellow-500 mr-1"></i>Điện</span>
                      <span className="text-xs text-gray-400">{formatVND(electricPrice)} đ/kWh</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Chỉ số cũ</label>
                        <input type="number" value={electricOld} readOnly
                          className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-500 cursor-not-allowed" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Chỉ số mới</label>
                        <input
                          type="number"
                          value={electricNew || ''}
                          onChange={e => { setElectricNew(Number(e.target.value) || 0); setElectricTouched(true); }}
                          className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:ring-2 ${electricNewInvalid
                            ? 'border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-100'
                            : electricNotEntered
                              ? 'border-amber-400 bg-amber-50 focus:border-amber-400 focus:ring-amber-100'
                              : 'border-gray-200 bg-white focus:border-yellow-400 focus:ring-yellow-100'
                            }`}
                          placeholder="Nhập chỉ số mới"
                        />
                      </div>
                    </div>
                    {/* Cảnh báo điện */}
                    {electricNotEntered && !electricNewInvalid && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs text-white">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        <span>Bạn chưa nhập chỉ số điện mới. Vui lòng điền để tính tiền điện tháng này.</span>
                      </div>
                    )}
                    {electricNewInvalid && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs text-white">
                        <i className="fa-solid fa-circle-xmark"></i>
                        <span>Chỉ số mới ({electricNew}) không được nhỏ hơn chỉ số cũ ({electricOld}).</span>
                      </div>
                    )}
                    {electricUsage > 0 && (
                      <div className="mt-2 flex justify-between text-xs">
                        <span className="text-gray-500">Dùng {electricUsage} kWh</span>
                        <span className="font-bold text-gray-800">{formatVND(electricCost)} đ</span>
                      </div>
                    )}
                  </div>

                  {/* Nước */}
                  <div className="rounded-lg bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-700"><i className="fa-solid fa-droplet text-blue-500 mr-1"></i>Nước</span>
                      <span className="text-xs text-gray-400">{formatVND(waterPrice)} đ/m³</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Chỉ số cũ</label>
                        <input type="number" value={waterOld} readOnly
                          className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-500 cursor-not-allowed" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">Chỉ số mới</label>
                        <input
                          type="number"
                          value={waterNew || ''}
                          onChange={e => { setWaterNew(Number(e.target.value) || 0); setWaterTouched(true); }}
                          className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:ring-2 ${waterNewInvalid
                            ? 'border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-100'
                            : waterNotEntered
                              ? 'border-amber-400 bg-amber-50 focus:border-amber-400 focus:ring-amber-100'
                              : 'border-gray-200 bg-white focus:border-blue-400 focus:ring-blue-100'
                            }`}
                          placeholder="Nhập chỉ số mới"
                        />
                      </div>
                    </div>
                    {/* Cảnh báo nước */}
                    {waterNotEntered && !waterNewInvalid && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs text-white">
                        <i className="fa-solid fa-triangle-exclamation"></i>
                        <span>Bạn chưa nhập chỉ số nước mới. Vui lòng điền để tính tiền nước tháng này.</span>
                      </div>
                    )}
                    {waterNewInvalid && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs text-white">
                        <i className="fa-solid fa-circle-xmark"></i>
                        <span>Chỉ số mới ({waterNew}) không được nhỏ hơn chỉ số cũ ({waterOld}).</span>
                      </div>
                    )}
                    {waterUsage > 0 && (
                      <div className="mt-2 flex justify-between text-xs">
                        <span className="text-gray-500">Dùng {waterUsage} m³</span>
                        <span className="font-bold text-gray-800">{formatVND(waterCost)} đ</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}


          {includesDeposit && (
            <div className={`rounded-xl border p-4 ${depositAlreadyCollected && billingReason !== 'deposit_refund' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-orange-100 bg-orange-50/70'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-bold text-gray-800">Tiền cọc</div>
                {depositAlreadyCollected && billingReason !== 'deposit_refund' && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                    <i className="fa-solid fa-lock"></i> Đã thu
                  </span>
                )}
              </div>
              {depositAlreadyCollected && billingReason !== 'deposit_refund' ? (
                <div className="text-xs text-gray-500 italic">Tiền cọc đã được thu trước đó, không thu thêm.</div>
              ) : (
                <>
                  <div className="mb-2 text-xs text-gray-500">Mặc định lấy từ trang chủ, có thể chỉnh tay.</div>
                  <input
                    type="number"
                    value={depositAmount || ''}
                    onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                  <div className="mt-2 text-right text-sm font-bold text-orange-600">
                    {billingReason === 'deposit_refund' ? 'Hoàn cọc' : 'Thu cọc'}: {formatVND(Math.abs(normalizedDeposit))} đ
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-600">Phương thức thanh toán</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('transfer')}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${paymentMethod === 'transfer' ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <i className="fa-solid fa-building-columns mr-1.5"></i>Chuyển khoản
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${paymentMethod === 'cash' ? 'border-green-500 bg-green-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                <i className="fa-solid fa-money-bill mr-1.5"></i>Tiền mặt
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tổng cộng</div>
            <div className="mt-1 text-right text-[32px] font-black leading-none text-green-600">{formatVND(totalAmount)} đ</div>
          </div>
        </div>

        {/* Cảnh báo: tháng đầu block hóa đơn hàng tháng */}
        {firstMonthBlocksMonthly && (
          <div className="mx-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0 text-amber-500"></i>
              <div>
                <span className="font-bold">Không thể lập hóa đơn hàng tháng cho tháng {billingMonth}/{billingYear}.</span>
                <div className="mt-1 text-xs text-amber-700">
                  Tháng này đã có phiếu <b>thu tiền tháng đầu tiên</b>. Hóa đơn hàng tháng chỉ được lập từ tháng{' '}
                  <b>{billingMonth === 12 ? 1 : billingMonth + 1}/{billingMonth === 12 ? billingYear + 1 : billingYear}</b> trở đi.
                  <br />Nếu muốn tất toán/trả phòng, hãy chọn lý do <b>"Thu tiền khi kết thúc hợp đồng"</b>.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lỗi từ server khi tạo hóa đơn */}
        {mutationError && (
          <div className="mx-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex items-start gap-2">
              <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0"></i>
              <span>{mutationError}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3 border-t border-gray-100 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={() => {
              if (billingReason === 'first_month' && unpaidFirstMonthInvoice) {
                setPayingInvoice(unpaidFirstMonthInvoice);
                return;
              }
              if (!canCreateInvoice) {
                setMutationError('Không thể tạo hóa đơn vì phòng này chưa có khách thuê hoặc hợp đồng đang hoạt động.');
                return;
              }
              setMutationError(null);
              invoiceMutation.mutate();
            }}
            disabled={invoiceMutation.isPending || !canCreateInvoice || (!!duplicateInvoice && !confirmedDuplicate) || utilityValidationFailed || !!firstMonthBlocksMonthly || !!unpaidFirstMonthBlocksMonthly}
            className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {invoiceMutation.isPending ? 'Đang lưu...' : 'Thêm hóa đơn'}
          </button>
        </div>
      </div>
      {payingInvoice && (
        <PaymentModal
          invoice={payingInvoice}
          room={room}
          onClose={() => {
            const wasFirstMonth = payingInvoice.is_first_month;
            setPayingInvoice(null);
            // Nếu vừa thu phiếu tháng đầu → đóng luôn InvoiceModal (mục đích đã xong)
            // Tránh InvoiceModal ở lại auto-switch sang 'monthly' và hiện cảnh báo nhầm
            if (wasFirstMonth) {
              onClose();
            }
          }}
        />
      )}
    </div>
  );
}
