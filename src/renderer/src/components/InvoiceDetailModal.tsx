import React, { useEffect, useRef, useState } from 'react';
import { isDepositOnlyInvoice, type AppSettings, type Invoice, type Room } from '../lib/db';
import { buildInvoiceTransferDescription } from '../lib/invoiceTransfer';
import logoNgang from '../assets/an_khang_home_logo_ngang.png';
import logoMark from '../assets/an_khang_home_logo.png';

interface InvoiceDetailModalProps {
  invoice: Invoice;
  room: Room | undefined;
  tenantName?: string;
  tenantPhone?: string;
  settings: AppSettings;
  onClose: () => void;
}

const formatVND = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

const fmtDate = (date: string) =>
  new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const fmtDateTime = (date: string) =>
  new Date(date).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getMonthEndDate = (month: number, year: number): string => toDateKey(new Date(year, month, 0));

function getBillingPeriod(invoice: Invoice): { start: string; end: string } | null {
  if (!invoice.billing_period_start || !invoice.billing_period_end) return null;

  const monthEnd = getMonthEndDate(invoice.month, invoice.year);
  const isMonthlyInvoice =
    !invoice.is_settlement &&
    !isDepositOnlyInvoice(invoice) &&
    invoice.billing_reason !== 'deposit_collect' &&
    invoice.billing_reason !== 'deposit_refund' &&
    invoice.billing_reason !== 'contract_end';
  const savedEnd = new Date(invoice.billing_period_end);
  const savedEndIsInsideInvoiceMonth =
    !Number.isNaN(savedEnd.getTime()) &&
    savedEnd.getFullYear() === invoice.year &&
    savedEnd.getMonth() + 1 === invoice.month &&
    invoice.billing_period_end < monthEnd;

  return {
    start: invoice.billing_period_start,
    end: isMonthlyInvoice && savedEndIsInsideInvoiceMonth ? monthEnd : invoice.billing_period_end,
  };
}

const cleanInvoiceNote = (note?: string): string =>
  (note || '')
    .split('\n')
    .filter((line) => !line.includes('[INVOICE_EXPORTED]'))
    .join('\n')
    .trim();

function getInvoiceNumber(invoice: Invoice): string {
  const parts = invoice.id.split('-');
  const timestamp = parseInt(parts[1] || '0', 10);
  const date = timestamp ? new Date(timestamp) : new Date(invoice.created_at || '');
  const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const suffix = (parts[2] || '').slice(0, 4).toUpperCase();
  return `${ym}-${suffix || 'HD'}`;
}

function getInvoiceLabel(invoice: Invoice): string {
  if (invoice.billing_reason === 'deposit_refund') return 'Trả tiền cọc';
  if (invoice.billing_reason === 'deposit_collect' || isDepositOnlyInvoice(invoice)) return 'Thu tiền cọc';
  if (invoice.billing_reason === 'contract_end') return 'Thanh lý hợp đồng';
  if (invoice.billing_reason === 'service') return 'Thu phí dịch vụ';
  if (invoice.is_first_month) return 'Thu tiền tháng đầu tiên';
  return `Thu tiền tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`;
}

function numberToWords(amount: number): string {
  if (amount === 0) return 'Không đồng';
  if (amount < 0) return `Hoàn ${numberToWords(Math.abs(amount)).toLowerCase()}`;

  const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  function threeDigits(value: number, isHead: boolean): string {
    if (value === 0) return '';
    const hundred = Math.floor(value / 100);
    const ten = Math.floor((value % 100) / 10);
    const unit = value % 10;
    let result = '';

    if (hundred > 0) result += `${units[hundred]} trăm`;
    else if (!isHead && (ten > 0 || unit > 0)) result += 'không trăm';

    if (ten === 0) {
      if (unit > 0) {
        const unitWord = unit === 1 ? 'một' : unit === 5 ? 'lăm' : units[unit];
        result += hundred > 0 || !isHead ? ` lẻ ${unitWord}` : unitWord;
      }
    } else if (ten === 1) {
      result += ' mười';
      if (unit > 0) result += ` ${unit === 5 ? 'lăm' : unit === 1 ? 'một' : units[unit]}`;
    } else {
      result += ` ${units[ten]} mươi`;
      if (unit === 1) result += ' mốt';
      else if (unit === 5) result += ' lăm';
      else if (unit > 0) result += ` ${units[unit]}`;
    }

    return result.trim();
  }

  const billion = Math.floor(amount / 1_000_000_000);
  const million = Math.floor((amount % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((amount % 1_000_000) / 1_000);
  const remainder = amount % 1_000;
  const parts: string[] = [];

  if (billion > 0) parts.push(`${threeDigits(billion, parts.length === 0)} tỷ`);
  if (million > 0) parts.push(`${threeDigits(million, parts.length === 0)} triệu`);
  if (thousand > 0) parts.push(`${threeDigits(thousand, parts.length === 0)} nghìn`);
  if (remainder > 0) parts.push(threeDigits(remainder, parts.length === 0));

  const result = parts.join(' ');
  return `${result.charAt(0).toUpperCase()}${result.slice(1)} đồng`;
}

interface LineItem {
  label: string;
  detail?: React.ReactNode;
  amount: number;
}

const imageToDataUrl = async (src: string): Promise<string> => {
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return src;
  }
};

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  invoice,
  room,
  tenantName,
  tenantPhone,
  settings,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [logoPrintSrc, setLogoPrintSrc] = useState<string>(logoNgang);
  const [logoMarkSrc, setLogoMarkSrc] = useState<string>(logoMark);
  const [sendingZalo, setSendingZalo] = useState(false);

  useEffect(() => {
    imageToDataUrl(logoNgang).then(setLogoPrintSrc);
    imageToDataUrl(logoMark).then(setLogoMarkSrc);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const displayName = tenantName || room?.tenant_name || 'Khách thuê';
  const displayPhone = tenantPhone || room?.tenant_phone || '';
  const ownerFullName = settings.property_owner_name || 'AN KHANG HOME';
  const ownerShortName = ownerFullName.trim().split(/\s+/).pop() || ownerFullName;
  const tenantShortName = displayName.trim().split(/\s+/).pop() || displayName;
  const propertyAddress = settings.property_address || '';
  const ownerPhone = settings.property_owner_phone || '';
  const label = getInvoiceLabel(invoice);
  const period = getBillingPeriod(invoice);
  const monthlyRent = room?.base_rent ?? invoice.room_cost;
  const displayedRoomCost = Number(invoice.room_cost || 0);
  const roomRentDetail =
    displayedRoomCost > 0 && displayedRoomCost !== monthlyRent
      ? `${formatVND(displayedRoomCost)}đ/kỳ này`
      : `${formatVND(monthlyRent)}đ/1 tháng`;
  const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount);
  const wordsText =
    invoice.total_amount < 0
      ? `Hoàn ${numberToWords(Math.abs(invoice.total_amount)).toLowerCase()}`
      : numberToWords(invoice.total_amount);
  const dueDate = invoice.due_date ? fmtDate(invoice.due_date) : null;
  const displayNote = cleanInvoiceNote(invoice.note);

  const lines: LineItem[] = [];

  if (invoice.has_transfer) {
    lines.push({
      label: `Tiền phòng cũ (${invoice.transfer_old_room_name || ''})`,
      detail: <span>{invoice.transfer_days || 0} ngày</span>,
      amount: invoice.transfer_room_cost || 0,
    });
    lines.push({
      label: `Tiền phòng mới (${room?.name || ''})`,
      detail: <span>{invoice.new_room_days || 0} ngày</span>,
      amount: invoice.room_cost || 0,
    });
  } else {
    lines.push({
      label: 'Tiền phòng',
      detail: period ? (
        <div className="space-y-0.5">
          <div className="font-semibold text-slate-950 whitespace-nowrap">
            {fmtDate(period.start)} - {fmtDate(period.end)}
            {invoice.prorata_days ? ` (${invoice.prorata_days} ngày)` : ''}
          </div>
          <div className="text-slate-900 whitespace-nowrap">{roomRentDetail}</div>
        </div>
      ) : undefined,
      amount: invoice.room_cost,
    });
  }

  if (invoice.has_transfer && (invoice.transfer_electric_cost || 0) > 0) {
    lines.push({
      label: `Tiền điện (${invoice.transfer_old_room_name || ''})`,
      detail: <span>{invoice.transfer_electric_usage || 0} kWh</span>,
      amount: invoice.transfer_electric_cost || 0,
    });
  }
  if (invoice.electric_cost > 0) {
    lines.push({
      label: invoice.has_transfer ? `Tiền điện (${room?.name || ''})` : 'Tiền điện',
      detail:
        invoice.electric_usage > 0 ? (
          <span>Số cũ: {invoice.electric_old} - Số mới: {invoice.electric_new} ({invoice.electric_usage} kWh)</span>
        ) : undefined,
      amount: invoice.electric_cost,
    });
  }

  if (invoice.has_transfer && (invoice.transfer_water_cost || 0) > 0) {
    lines.push({
      label: `Tiền nước (${invoice.transfer_old_room_name || ''})`,
      detail: <span>{invoice.transfer_water_usage || 0} m³</span>,
      amount: invoice.transfer_water_cost || 0,
    });
  }
  if (invoice.water_cost > 0) {
    lines.push({
      label: invoice.has_transfer ? `Tiền nước (${room?.name || ''})` : 'Tiền nước',
      detail:
        invoice.water_usage > 0 ? (
          <span>Số cũ: {invoice.water_old} - Số mới: {invoice.water_new} ({invoice.water_usage} m³)</span>
        ) : undefined,
      amount: invoice.water_cost,
    });
  }

  if (invoice.has_transfer && (invoice.transfer_service_cost || 0) > 0) {
    lines.push({
      label: `Phí dịch vụ (${invoice.transfer_old_room_name || ''})`,
      detail: <span>{invoice.transfer_days || 0} ngày</span>,
      amount: invoice.transfer_service_cost || 0,
    });
  }
  if (invoice.wifi_cost > 0) lines.push({ label: 'Internet / WiFi', detail: <span>-</span>, amount: invoice.wifi_cost });
  if (invoice.garbage_cost > 0) lines.push({ label: 'Phí vệ sinh', detail: <span>-</span>, amount: invoice.garbage_cost });
  if (invoice.old_debt > 0) lines.push({ label: 'Nợ kỳ trước', amount: invoice.old_debt });
  if ((invoice.deposit_amount || 0) !== 0) {
    const deposit = invoice.deposit_amount || 0;
    lines.push({ label: deposit > 0 ? 'Thu tiền cọc' : 'Trả tiền cọc', amount: Math.abs(deposit) });
  }
  if ((invoice.adjustment_amount || 0) !== 0) {
    const adjustment = invoice.adjustment_amount || 0;
    lines.push({
      label: adjustment > 0 ? `Cộng thêm${invoice.adjustment_note ? ` (${invoice.adjustment_note})` : ''}` : `Giảm trừ${invoice.adjustment_note ? ` (${invoice.adjustment_note})` : ''}`,
      amount: Math.abs(adjustment),
    });
  }

  const buildInvoiceHtml = () => {
    const content = printRef.current;
    if (!content) return null;

    const printHtml = content.innerHTML
      .replace(/src="[^"]*an_khang_home_logo_ngang[^"]*"/g, `src="${logoPrintSrc}"`)
      .replace(/src="[^"]*an_khang_home_logo[^"]*"/g, `src="${logoMarkSrc}"`);

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Hóa đơn - ${room?.name || ''}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    body { margin: 0; background: #fff; font-family: Inter, Arial, sans-serif; color: #111827; }
    .capture-page { max-width: 1120px; margin: 0 auto; }
    .invoice-wrap { position: relative; max-width: 768px; margin: 0 auto; background: #fff; border: 3px solid #002855 !important; overflow: hidden; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="capture-page">
    <div class="invoice-wrap">${printHtml}</div>
  </div>
</body>
</html>`;
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    body { margin: 0; background: #fff; font-family: Inter, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .invoice-wrap { max-width: 768px; margin: 0 auto; border: 3px solid #002855 !important; overflow: hidden; }
  </style>
</head>
<body><div class="invoice-wrap">${content.innerHTML}</div></body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 400);
  };

  const handleSendZalo = async () => {
    const html = buildInvoiceHtml();
    const phone = displayPhone.replace(/\D/g, '');
    if (!html) return;

    if (!phone || phone.length < 9 || phone.length > 11) {
      window.alert(!phone ? 'Khách thuê chưa có số điện thoại để gửi Zalo.' : `Số điện thoại "${displayPhone}" không hợp lệ.`);
      return;
    }

    try {
      setSendingZalo(true);
      const result = await window.api.zalo.send({
        phone: phone.startsWith('0') ? phone : `0${phone}`,
        html,
        fileName: `hoa-don-${room?.name || 'phong'}-${String(invoice.month).padStart(2, '0')}-${invoice.year}.png`,
      });
      if (!result.ok) throw new Error(result.error || 'Không thể gửi nội dung qua Zalo.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể chuẩn bị nội dung gửi Zalo.';
      window.alert(`Không thể gửi Zalo.\n${message}`);
    } finally {
      setSendingZalo(false);
    }
  };

  const handleSaveImage = async () => {
    const html = buildInvoiceHtml();
    if (!html) return;

    try {
      const fileName = `HOA-DON-${room?.name || 'PHONG'}-T${String(invoice.month).padStart(2, '0')}-${invoice.year}.jpg`;
      const saveImageFn =
        window.api?.invoice?.saveImage ||
        ((payload: { html: string; fileName: string }) => window.electron?.ipcRenderer?.invoke('invoice:saveImage', payload));

      if (!saveImageFn) throw new Error('Không tìm thấy chức năng lưu ảnh. Vui lòng khởi động lại ứng dụng.');
      const result = await saveImageFn({ html, fileName });
      if (!result.ok) throw new Error(result.error || 'Lỗi khi lưu ảnh.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Không thể lưu ảnh hóa đơn.\n${message}`);
    }
  };

  const transferDescription = buildInvoiceTransferDescription(invoice, room?.name);

  return (
    <div
      className="app-no-drag fixed inset-0 z-[320] flex items-start justify-center overflow-y-auto bg-black/60 p-5 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="relative z-30 flex shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-3">
          <span className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <i className="fa-solid fa-file-invoice text-green-600" />
            Gửi hóa đơn
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleSendZalo} disabled={sendingZalo} className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:bg-sky-300">
              <i className="fa-solid fa-paper-plane" />
              {sendingZalo ? 'Đang gửi...' : 'Gửi Zalo'}
            </button>
            <button type="button" onClick={handleSaveImage} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-600">
              <i className="fa-solid fa-image" />
              Lưu ảnh (JPG)
            </button>
            <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700">
              <i className="fa-solid fa-print" />
              In phiếu
            </button>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-200" aria-label="Đóng">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto bg-gray-100 px-6 py-4">
          <div ref={printRef} className="invoice-paper relative mx-auto max-w-3xl overflow-hidden bg-white text-[#1a1a1a] shadow-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
            <div className="pointer-events-none absolute -right-20 top-0 z-0 h-56 w-56 rounded-full bg-emerald-100/75" />
            <div className="pointer-events-none absolute right-20 top-20 z-0 h-36 w-20 rotate-45 rounded-[32px] bg-blue-100/60" />
            <div className="pointer-events-none absolute -left-20 bottom-44 z-0 h-56 w-56 rounded-full border-[28px] border-slate-200/70" />
            <div className="pointer-events-none absolute right-[-70px] bottom-32 z-0 h-32 w-32 rounded-full bg-emerald-100/80" />

            <div className="relative z-10 grid grid-cols-[1.15fr_1fr_0.85fr] items-start gap-5 px-7 pb-6 pt-7">
              <div>
                <img src={logoPrintSrc} alt="AN KHANG HOME" className="h-[78px] w-[245px] object-contain object-left" />
                <p className="mt-2 text-[12px] italic text-[#002855]">An tâm chọn nhà - An khang cuộc sống</p>
              </div>
              <div className="text-center">
                <h1 className="text-[32px] font-black uppercase leading-none tracking-tight text-[#002855]">Hóa đơn</h1>
                <h2 className="mt-2 whitespace-nowrap text-[21px] font-bold uppercase text-blue-500">Tiền thuê nhà</h2>
                <p className="mt-2 text-[14px] font-medium text-slate-700">Tháng {String(invoice.month).padStart(2, '0')} / {invoice.year}</p>
                <p className="mt-1 text-[11px] font-medium text-slate-400">Ngày lập: {fmtDateTime(invoice.created_at || invoice.invoice_date || '')}</p>
              </div>
              <div className="border-l border-slate-200 pl-6 text-[11px] text-slate-500">
                <div className="mb-1 flex justify-between gap-3"><span>Mẫu số:</span><b className="text-slate-800">HDTN</b></div>
                <div className="mb-1 flex justify-between gap-3"><span>Ký hiệu:</span><b className="text-slate-800">1K26TAA</b></div>
                <div className="mb-1 flex justify-between gap-3"><span>Số:</span><b className="text-slate-800">{getInvoiceNumber(invoice)}</b></div>
                <div className="mb-1 flex justify-between gap-3"><span>Ngày lập:</span><b className="text-slate-800">{fmtDate(invoice.invoice_date || invoice.created_at)}</b></div>
                {dueDate && <div className="flex justify-between gap-3"><span>Hạn TT:</span><b className="text-slate-800">{dueDate}</b></div>}
              </div>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-7 px-7 pb-5">
              <section>
                <div className="mb-3 inline-flex rounded-md bg-[#002855] px-4 py-1.5 text-[10px] font-black uppercase tracking-wide text-white">Thông tin bên cho thuê</div>
                <h3 className="mb-2 text-[16px] font-black uppercase text-[#002855]">AN KHANG HOME</h3>
                <div className="space-y-2 text-[12px] text-slate-700">
                  <div className="flex gap-2"><i className="fa-solid fa-house mt-0.5 text-slate-400" /><span>Địa chỉ: <b className="font-semibold text-slate-800">{propertyAddress || '-'}</b></span></div>
                  <div className="flex gap-2"><i className="fa-solid fa-phone mt-0.5 text-slate-400" /><span>Điện thoại: <b className="font-bold text-[#002855]">{ownerPhone || '-'}</b></span></div>
                </div>
              </section>
              <section className="border-l border-slate-200 pl-7">
                <div className="mb-3 inline-flex rounded-md bg-emerald-600 px-4 py-1.5 text-[10px] font-black uppercase tracking-wide text-white">Thông tin khách thuê</div>
                <div className="grid grid-cols-[100px_1fr] gap-y-2 text-[12px]">
                  <span className="text-slate-500">Khách hàng:</span><b>{displayName}</b>
                  <span className="text-slate-500">Số điện thoại:</span><b>{displayPhone || '-'}</b>
                  <span className="text-slate-500">Phòng:</span><b className="text-[16px] text-[#002855]">{room?.name || '-'}</b>
                  <span className="text-slate-500">Nội dung thu:</span><span>{label}</span>
                </div>
              </section>
            </div>

            <div className="relative z-10 px-7 pb-4">
              <div className="pointer-events-none absolute left-1/2 top-[52%] z-0 -translate-x-1/2 -translate-y-1/2 opacity-[0.03]">
                <img src={logoMarkSrc} alt="watermark" className="w-[360px] object-contain" />
              </div>
              <table className="relative z-10 w-full border-separate border-spacing-0 overflow-hidden rounded-lg bg-transparent text-[12px]">
                <thead>
                  <tr>
                    <th className="w-12 rounded-tl-lg border border-[#002855] bg-[#002855] px-2 py-2 text-center text-[10px] font-bold uppercase text-white">STT</th>
                    <th className="border border-[#002855] bg-[#002855] px-3 py-2 text-left text-[10px] font-bold uppercase text-white">Nội dung</th>
                    <th className="border border-[#002855] bg-[#002855] px-3 py-2 text-left text-[10px] font-bold uppercase text-white">Chi tiết</th>
                    <th className="rounded-tr-lg border border-[#002855] bg-[#002855] px-3 py-2 text-right text-[10px] font-bold uppercase text-white">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={`${line.label}-${index}`}>
                      <td className="border border-slate-200 px-2 py-2 text-center font-medium text-slate-500">{index + 1}</td>
                      <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-800">{line.label}</td>
                      <td className="border border-slate-200 px-3 py-2 font-medium text-slate-950">{line.detail || '-'}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right text-[14px] font-black text-[#002855]">{formatVND(line.amount)}đ</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="relative z-10 px-7 pb-5">
              <div className="mb-3 flex items-center justify-between rounded-md border border-blue-100 bg-blue-50/60 px-4 py-3">
                <span className="text-[12px] font-black uppercase tracking-widest text-[#002855]">Tổng cộng</span>
                <span className="text-[26px] font-black text-[#002855]">{formatVND(invoice.total_amount)}đ</span>
              </div>
              <div className="mb-4 flex text-[12px]">
                <span className="w-28 font-medium italic text-slate-400">Bằng chữ:</span>
                <span className="flex-1 font-bold italic text-slate-800">{wordsText}</span>
              </div>
              {invoice.paid_amount > 0 && (
                <>
                  <div className="flex justify-between border-b border-slate-100 py-3 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                    <span>Số tiền đã thanh toán</span>
                    <span>{formatVND(invoice.paid_amount)}đ</span>
                  </div>
                  {remaining > 0 && (
                    <div className="mt-3 flex justify-between rounded-md bg-blue-600 p-4 text-white shadow-lg shadow-blue-100">
                      <span className="text-[15px] font-black uppercase">Số tiền còn lại</span>
                      <span className="text-[26px] font-black">{formatVND(remaining)}đ</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-8 px-7 pb-5 text-center">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-[#002855]">Người đại diện thu</p>
                <p className="mb-7 mt-1 text-[10px] italic text-slate-400">(Ký, ghi rõ họ tên)</p>
                <p className="mb-2 text-[18px] font-semibold italic text-slate-500">{ownerShortName}</p>
                <p className="font-bold text-slate-900">{ownerFullName}</p>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-[#002855]">Khách thuê</p>
                <p className="mb-7 mt-1 text-[10px] italic text-slate-400">(Ký, ghi rõ họ tên)</p>
                <p className="mb-2 text-[18px] font-semibold italic text-slate-500">{tenantShortName}</p>
                <p className="font-bold text-slate-900">{displayName}</p>
              </div>
            </div>

            {displayNote && (
              <div className="relative z-10 mx-7 mb-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <span className="font-bold text-slate-800">Ghi chú:</span> {displayNote}
              </div>
            )}

            {remaining > 0 && settings.account_no && settings.bank_id && (
              <div className="relative z-10 mx-7 mb-5 grid grid-cols-[170px_1fr] gap-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-center rounded border border-slate-200 bg-white p-2">
                  <img
                    src={`https://qr.sepay.vn/img?bank=${settings.bank_id}&acc=${settings.account_no}&amount=${remaining}&des=${transferDescription}`}
                    alt="VietQR"
                    className="h-[150px] w-[150px] object-contain"
                    crossOrigin="anonymous"
                  />
                </div>
                <div className="text-[12px]">
                  <h4 className="mb-3 border-b border-slate-200 pb-2 text-[15px] font-black uppercase text-[#002855]">Quét mã để thanh toán</h4>
                  <div className="grid grid-cols-[110px_1fr] gap-y-2">
                    <span className="text-slate-500">Ngân hàng:</span><b>{settings.bank_id}</b>
                    <span className="text-slate-500">Số tài khoản:</span><b className="tracking-wide text-blue-700">{settings.account_no}</b>
                    <span className="text-slate-500">Chủ tài khoản:</span><b className="uppercase">{settings.account_name || ownerFullName}</b>
                    <span className="font-bold text-slate-500">Số tiền:</span><b className="text-[24px] text-red-600">{formatVND(remaining)} VND</b>
                  </div>
                  <div className="mt-4 rounded border border-dashed border-slate-300 bg-white p-2 font-mono text-[10px] text-slate-700">
                    Nội dung: <b className="text-[#002855]">{transferDescription}</b>
                  </div>
                </div>
              </div>
            )}

            <div className="relative z-10 mx-7 flex flex-wrap justify-center gap-5 border-t-2 border-[#002855] bg-white p-4 text-[9px] font-bold uppercase tracking-widest text-[#002855]/70">
              <span><i className="fa-solid fa-house mr-2" />AN KHANG HOME</span>
              <span><i className="fa-solid fa-location-dot mr-2" />{propertyAddress || '-'}</span>
              <span><i className="fa-solid fa-phone mr-2" />{ownerPhone || '-'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
