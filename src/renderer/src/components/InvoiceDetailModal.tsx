import React, { useEffect, useRef, useState } from 'react';
import { type Invoice, type Room, type AppSettings } from '../lib/db';
import logoNgang from '../assets/logo_navbar.png';

interface InvoiceDetailModalProps {
  invoice: Invoice;
  room: Room | undefined;
  tenantName?: string;
  tenantPhone?: string;
  settings: AppSettings;
  onClose: () => void;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

function getInvoiceLabel(invoice: Invoice): string {
  if (invoice.billing_reason === 'deposit_refund') return 'Trả tiền cọc';
  if (invoice.billing_reason === 'deposit_collect') return 'Thu tiền cọc';
  if (invoice.billing_reason === 'contract_end') return 'Thanh lý hợp đồng';
  if (invoice.billing_reason === 'service') return 'Thu phí dịch vụ';
  if (invoice.is_first_month) return 'Thu tiền tháng đầu tiên';
  return `Thu tiền tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`;
}

// Chuyển số thành chữ tiếng Việt
function numberToWords(amount: number): string {
  if (amount === 0) return 'Không đồng';
  if (amount < 0) return `Hoàn ${numberToWords(Math.abs(amount)).toLowerCase()}`;
  const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  function threeDigits(n: number, isHead: boolean): string {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    let result = '';

    if (h > 0) {
      result += units[h] + ' trăm';
    } else if (!isHead && (t > 0 || u > 0)) {
      result += 'không trăm';
    }

    if (t === 0) {
      if (u > 0) result += ' lẻ ' + (u === 1 ? 'một' : u === 5 ? 'lăm' : units[u]);
    } else if (t === 1) {
      result += ' mười';
      if (u > 0) result += ' ' + (u === 5 ? 'lăm' : u === 1 ? 'một' : units[u]);
    } else {
      result += ' ' + units[t] + ' mươi';
      if (u === 1) result += ' mốt';
      else if (u === 5) result += ' lăm';
      else if (u > 0) result += ' ' + units[u];
    }
    return result.trim();
  }

  const billion = Math.floor(amount / 1_000_000_000);
  const million = Math.floor((amount % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((amount % 1_000_000) / 1_000);
  const remainder = amount % 1_000;

  const parts: string[] = [];
  if (billion > 0) parts.push(threeDigits(billion, parts.length === 0) + ' tỷ');
  if (million > 0) parts.push(threeDigits(million, parts.length === 0) + ' triệu');
  if (thousand > 0) parts.push(threeDigits(thousand, parts.length === 0) + ' nghìn');
  if (remainder > 0) parts.push(threeDigits(remainder, parts.length === 0));

  const result = parts.join(' ');
  return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng';
}

// ----------------------------------------------------------------
// Component
// ----------------------------------------------------------------
export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  invoice,
  room,
  tenantName,
  tenantPhone,
  settings,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  // Base64 chỉ dùng cho cửa sổ in (fetch giữ nguyên alpha channel của PNG)
  const [logoPrintSrc, setLogoPrintSrc] = useState<string>(logoNgang);
  const [sendingZalo, setSendingZalo] = useState(false);

  useEffect(() => {
    fetch(logoNgang)
      .then(r => r.blob())
      .then(blob => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }))
      .then(setLogoPrintSrc)
      .catch(() => setLogoPrintSrc(logoNgang));
  }, []);

  // Đóng bằng Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    // Thay URL ảnh bằng base64 để print window tải được
    const printHtml = content.innerHTML.replace(
      /src="[^"]*logo[^"]*"/,
      `src="${logoPrintSrc}"`
    );
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Hóa đơn - ${room?.name || ''}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #222; }
          .invoice-wrap { max-width: 700px; margin: 0 auto; padding: 24px; }
          .header-bar { position: relative; overflow: hidden; background: linear-gradient(180deg, #ffffff 0%, #fcfffc 100%); border-radius: 12px 12px 0 0; padding: 34px 24px 18px; text-align: center; }
          .header-wave { position: absolute; top: -22px; height: 40px; border-radius: 999px; }
          .header-wave.wave-a { left: -6%; width: 44%; background: #16a34a; transform: rotate(-5deg); }
          .header-wave.wave-b { left: 24%; width: 56%; background: #84cc16; top: -18px; }
          .header-wave.wave-c { right: -8%; width: 40%; background: #22c55e; transform: rotate(4deg); }
          .brand-row { display: inline-flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px; position: relative; z-index: 1; }
          .brand-mark { width: 76px; height: 46px; display: flex; align-items: center; justify-content: center; padding: 2px 0; flex: 0 0 auto; }
          .brand-mark img { max-width: 100%; max-height: 100%; object-fit: contain; }
          .brand-copy { display: flex; flex-direction: column; align-items: center; gap: 4px; max-height: 34px; overflow: hidden; }
          .brand-title { font-size: 16px; font-weight: 900; letter-spacing: 0.4px; color: #1f2937; }
          .logo-sub { font-size: 11px; color: #4b5563; font-weight: 700; letter-spacing: 0.4px; }
          .logo-sub strong { color: #16a34a; }
          .title-section { text-align: center; padding: 4px 0 2px; position: relative; z-index: 1; }
          .title-main { font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: 0.6px; }
          .title-period { font-size: 15px; font-weight: 800; color: #111827; margin-top: 4px; }
          .address-bar { text-align: center; font-size: 12px; color: #666; padding-bottom: 10px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; padding: 10px 0 14px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; margin-bottom: 14px; }
          .info-row { font-size: 13px; color: #333; padding: 3px 0; }
          .info-label { font-weight: 600; color: #555; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #f0fdf4; color: #166534; font-weight: 700; padding: 9px 12px; text-align: left; border: 1px solid #d1fae5; }
          th:last-child { text-align: right; }
          td { padding: 9px 12px; border: 1px solid #e5e7eb; vertical-align: top; }
          td:last-child { text-align: right; font-weight: 600; }
          .td-detail { font-size: 11px; color: #059669; margin-top: 3px; }
          .row-total td { background: #f9fafb; font-weight: 700; font-size: 14px; }
          .row-words td { background: #f0fdf4; font-style: italic; color: #166534; }
          .row-paid td { color: #059669; }
          .row-remain td { background: #fff1f2; color: #dc2626; font-weight: 700; font-size: 14px; }
          .sig-section { display: grid; grid-template-columns: 1fr 1fr; margin-top: 20px; text-align: center; gap: 24px; }
          .sig-label { font-weight: 700; font-size: 13px; color: #333; margin-bottom: 4px; }
          .sig-cursive { font-family: 'Segoe Script', 'Brush Script MT', 'Comic Sans MS', cursive; font-size: 26px; color: #1a5c2e; margin-top: 16px; line-height: 1.2; }
          .sig-full-name { font-size: 12px; font-weight: 600; color: #374151; margin-top: 4px; border-top: 1px solid #d1d5db; padding-top: 4px; display: inline-block; min-width: 120px; }
          .sig-name { font-size: 12px; color: #555; margin-top: 24px; }
          .note-section { margin-top: 14px; font-size: 12px; color: #555; border-top: 1px dashed #d1d5db; padding-top: 10px; }
          .hidden { display: none !important; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>${printHtml}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 400);
  };

  const buildInvoiceHtml = () => {
    const content = printRef.current;
    if (!content) return null;

    const printHtml = content.innerHTML.replace(
      /src="[^"]*logo[^"]*"/,
      `src="${logoPrintSrc}"`
    );

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Hóa đơn - ${room?.name || ''}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #222; }
          .invoice-wrap { max-width: 700px; margin: 0 auto; padding: 24px; }
          .header-bar { position: relative; overflow: hidden; background: linear-gradient(180deg, #ffffff 0%, #fcfffc 100%); border-radius: 12px 12px 0 0; padding: 34px 24px 18px; text-align: center; }
          .header-wave { position: absolute; top: -22px; height: 40px; border-radius: 999px; }
          .header-wave.wave-a { left: -6%; width: 44%; background: #16a34a; transform: rotate(-5deg); }
          .header-wave.wave-b { left: 24%; width: 56%; background: #84cc16; top: -18px; }
          .header-wave.wave-c { right: -8%; width: 40%; background: #22c55e; transform: rotate(4deg); }
          .brand-row { display: inline-flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px; position: relative; z-index: 1; }
          .brand-mark { width: 76px; height: 46px; display: flex; align-items: center; justify-content: center; padding: 2px 0; flex: 0 0 auto; }
          .brand-mark img { max-width: 100%; max-height: 100%; object-fit: contain; }
          .brand-copy { display: flex; flex-direction: column; align-items: center; gap: 4px; max-height: 34px; overflow: hidden; }
          .brand-title { font-size: 16px; font-weight: 900; letter-spacing: 0.4px; color: #1f2937; }
          .logo-sub { font-size: 11px; color: #4b5563; font-weight: 700; letter-spacing: 0.4px; }
          .logo-sub strong { color: #16a34a; }
          .title-section { text-align: center; padding: 4px 0 2px; position: relative; z-index: 1; }
          .title-main { font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: 0.6px; }
          .title-period { font-size: 15px; font-weight: 800; color: #111827; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #f0fdf4; color: #166534; font-weight: 700; padding: 9px 12px; text-align: left; border: 1px solid #d1fae5; }
          th:last-child { text-align: right; }
          td { padding: 9px 12px; border: 1px solid #e5e7eb; vertical-align: top; }
          td:last-child { text-align: right; font-weight: 600; }
          .hidden { display: none !important; }
        </style>
      </head>
      <body>${printHtml}</body>
      </html>
    `;
  };

  // Dữ liệu
  const displayName = tenantName || room?.tenant_name || 'Khách thuê';
  const displayPhone = tenantPhone || room?.tenant_phone || '';
  const propertyAddress = settings.property_address || '';
  const ownerFullName = settings.property_owner_name || 'Đỗ Kim Ngân';
  // Tên viết tay = tên đầu tiên (tên riêng trong tiếng Việt là từ cuối cùng)
  const ownerShortName = ownerFullName.trim().split(/\s+/).pop() || ownerFullName;
  const label = getInvoiceLabel(invoice);

  const periodStart = invoice.billing_period_start;
  const periodEnd = invoice.billing_period_end;
  const prorataDays = invoice.prorata_days;
  const monthlyRent = room?.base_rent ?? invoice.room_cost;

  const depositAmt = invoice.deposit_amount ?? 0;
  const adjustmentAmt = invoice.adjustment_amount ?? 0;
  const remaining = invoice.total_amount - invoice.paid_amount;
  const wordsText = invoice.total_amount < 0
    ? `Hoàn ${numberToWords(Math.abs(invoice.total_amount)).toLowerCase()}`
    : numberToWords(invoice.total_amount);

  const dueDate = invoice.due_date
    ? fmtDate(invoice.due_date)
    : null;

  // Các dòng hiển thị trên hóa đơn
  const handleSendZalo = async () => {
    const phone = displayPhone.replace(/\D/g, ''); // Fix số zalo (loại bỏ ký tự không phải số)
    const html = buildInvoiceHtml();

    if (!html) return;

    // Validate: SĐT Việt Nam phải có đúng 9-10 chữ số
    if (!phone || phone.length < 9 || phone.length > 11) {
      const msg = !phone
        ? 'Khách thuê chưa có số điện thoại để gửi Zalo.'
        : `Số điện thoại "${displayPhone}" không hợp lệ (cần 9-11 số, hiện có ${phone.length} số).\nVui lòng cập nhật đúng SĐT trong thông tin khách thuê.`;
      window.alert(msg);
      return;
    }

    try {
      setSendingZalo(true);
      const monthLabel = String(invoice.month).padStart(2, '0');
      // Fix phone number (đưa về chuẩn nếu cần, nhưng user nói web bị lỗi 84 nên truyền thẳng vào Zalo protocol)
      // Mặc định window.api.zalo.send đang dùng 84, ta có thể đổi lại trong code main.
      const result = await window.api.zalo.send({
        phone: phone.startsWith('0') ? phone : `0${phone}`, // Đảm bảo số có số 0 ở đầu
        html,
        fileName: `hoa-don-${room?.name || 'phong'}-${monthLabel}-${invoice.year}.png`,
        // Bỏ message để không ghi đè ảnh trên clipboard
      });

      if (!result.ok) {
        throw new Error(result.error || 'Không thể gửi nội dung qua Zalo.');
      }
    } catch (error) {
      console.error(error);
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
      const monthLabel = String(invoice.month).padStart(2, '0');
      const fileName = `HOA-DON-${room?.name || 'PHONG'}-T${monthLabel}-${invoice.year}.jpg`;

      const saveImageFn =
        window.api?.invoice?.saveImage ||
        ((payload: { html: string; fileName: string }) =>
          window.electron?.ipcRenderer?.invoke('invoice:saveImage', payload));

      if (!saveImageFn) {
        throw new Error('Không tìm thấy API lưu ảnh. Vui lòng khởi động lại ứng dụng.');
      }

      const result = await saveImageFn({ html, fileName });

      if (!result.ok) {
        throw new Error(result.error || 'Lỗi khi lưu ảnh.');
      }

      if (!result.canceled) {
        // Có thể hiện thông báo báo thành công nếu muốn
        console.log("Đã lưu ảnh thành công:", result.filePath);
      }
    } catch (error) {
      console.error("Lỗi khi lưu ảnh:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes("No handler registered for 'invoice:saveImage'")) {
        window.alert('Ứng dụng đang chạy bản cũ của tiến trình chính. Vui lòng tắt hẳn app và mở lại rồi thử lưu ảnh.');
        return;
      }
      window.alert("Đã xảy ra lỗi khi tạo ảnh hóa đơn: " + errMsg);
    }
  };

  interface LineItem {
    label: string;
    detail?: React.ReactNode;
    amount: number;
    highlight?: 'green' | 'red';
  }
  const lines: LineItem[] = [];

  // Tiền phòng
  if (invoice.has_transfer) {
    lines.push({
      label: `Tiền phòng cũ (${invoice.transfer_old_room_name})`,
      detail: <div className="text-gray-400 text-[11px]">{invoice.transfer_days} ngày</div>,
      amount: invoice.transfer_room_cost || 0,
    });
    lines.push({
      label: `Tiền phòng mới (${room?.name})`,
      detail: <div className="text-gray-400 text-[11px]">{invoice.new_room_days} ngày</div>,
      amount: invoice.room_cost || 0,
    });
  } else {
    lines.push({
      label: 'Tiền phòng',
      detail: periodStart && periodEnd ? (
        <>
          <div className="text-green-600 text-[11px] whitespace-nowrap">
            {fmtDate(periodStart)} - {fmtDate(periodEnd)}
            {prorataDays ? ` (${prorataDays} ngày)` : ''}
          </div>
          <div className="text-gray-400 text-[11px] whitespace-nowrap">
            {formatVND(monthlyRent)}đ/1 tháng
          </div>
        </>
      ) : undefined,
      amount: invoice.room_cost,
    });
  }

  // Điện
  if (invoice.has_transfer && invoice.transfer_electric_cost! > 0) {
    lines.push({
      label: `Tiền điện (${invoice.transfer_old_room_name})`,
      detail: <div className="text-gray-400 text-[11px]">{invoice.transfer_electric_usage} kWh</div>,
      amount: invoice.transfer_electric_cost!,
    });
  }
  if (invoice.electric_cost > 0) {
    lines.push({
      label: invoice.has_transfer ? `Tiền điện (${room?.name})` : 'Tiền điện',
      detail: invoice.electric_usage > 0 ? (
        <div className="text-gray-400 text-[11px]">
          {invoice.electric_old} → {invoice.electric_new} ({invoice.electric_usage} kWh)
        </div>
      ) : undefined,
      amount: invoice.electric_cost,
    });
  }

  // Nước
  if (invoice.has_transfer && invoice.transfer_water_cost! > 0) {
    lines.push({
      label: `Tiền nước (${invoice.transfer_old_room_name})`,
      detail: <div className="text-gray-400 text-[11px]">{invoice.transfer_water_usage} m³</div>,
      amount: invoice.transfer_water_cost!,
    });
  }
  if (invoice.water_cost > 0) {
    lines.push({
      label: invoice.has_transfer ? `Tiền nước (${room?.name})` : 'Tiền nước',
      detail: invoice.water_usage > 0 ? (
        <div className="text-gray-400 text-[11px]">
          {invoice.water_old} → {invoice.water_new} ({invoice.water_usage} m³)
        </div>
      ) : undefined,
      amount: invoice.water_cost,
    });
  }

  // Dịch vụ của phòng cũ nếu có
  if (invoice.has_transfer && invoice.transfer_service_cost! > 0) {
    lines.push({
      label: `Phí dịch vụ (${invoice.transfer_old_room_name})`,
      detail: <div className="text-gray-400 text-[11px]">{invoice.transfer_days} ngày</div>,
      amount: invoice.transfer_service_cost!
    });
  }

  // WiFi
  if (invoice.wifi_cost > 0) {
    lines.push({ label: invoice.has_transfer ? `Internet / WiFi (${room?.name})` : 'Internet / WiFi', amount: invoice.wifi_cost });
  }

  // Vệ sinh
  if (invoice.garbage_cost > 0) {
    lines.push({ label: invoice.has_transfer ? `Phí vệ sinh (${room?.name})` : 'Phí vệ sinh', amount: invoice.garbage_cost });
  }

  // Nợ cũ
  if (invoice.old_debt > 0) {
    lines.push({ label: 'Nợ kỳ trước', amount: invoice.old_debt });
  }

  // Tiền cọc
  if (depositAmt !== 0) {
    lines.push({
      label: depositAmt > 0 ? 'Thu tiền cọc' : 'Trả tiền cọc',
      amount: Math.abs(depositAmt),
      highlight: depositAmt < 0 ? 'red' : undefined,
    });
  }

  // Điều chỉnh
  if (adjustmentAmt !== 0) {
    lines.push({
      label: adjustmentAmt > 0
        ? `Cộng thêm${invoice.adjustment_note ? ` (${invoice.adjustment_note})` : ''}`
        : `Giảm trừ${invoice.adjustment_note ? ` (${invoice.adjustment_note})` : ''}`,
      amount: Math.abs(adjustmentAmt),
      highlight: adjustmentAmt < 0 ? 'red' : undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[150] overflow-y-auto bg-black/60 backdrop-blur-sm p-4 flex items-start justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
          <span className="font-bold text-gray-700 text-sm flex items-center gap-2">
            <i className="fa-solid fa-file-invoice text-green-600"></i>
            Gửi hóa đơn
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSendZalo}
              disabled={sendingZalo}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white text-xs font-semibold rounded-lg transition"
            >
              <i className="fa-solid fa-paper-plane"></i>
              {sendingZalo ? 'Đang gửi...' : 'Gửi Zalo'}
            </button>
            <button
              onClick={handleSaveImage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition"
            >
              <i className="fa-solid fa-image"></i>Lưu ảnh (JPG)
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition"
            >
              <i className="fa-solid fa-print"></i>In phiếu
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 transition"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* Logo floating — nằm vắt giữa toolbar và header xanh */}
        <div className="flex justify-center relative z-20 pt-3 -mb-6">
          <div className="bg-white rounded-2xl px-4 py-2 shadow-lg ring-2 ring-green-100">
            <img
              src={logoNgang}
              alt="DBY"
              className="h-9 w-auto object-contain"
            />
          </div>
        </div>

        {/* Invoice content */}
        <div className="bg-gray-100 px-4 pb-4 pt-0">
          <div ref={printRef} className="invoice-wrap bg-white rounded-xl shadow-sm overflow-hidden max-w-[660px] mx-auto">

            {/* Header */}
            <div className="relative overflow-hidden rounded-t-xl bg-gradient-to-br from-green-700 via-green-600 to-green-500 px-6 pt-10 pb-0">
              {/* Nền chấm trang trí */}
              <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 20%, #fff 1px, transparent 1px)', backgroundSize: '30px 30px' }}
              />

              {/* Tiêu đề + tháng */}
              <div className="relative z-10 flex flex-col items-center gap-1 pb-5">
                <h1 className="text-[19px] font-black tracking-widest text-white uppercase leading-tight">
                  Hóa đơn tiền thuê nhà
                </h1>
                <p className="text-[12px] font-semibold text-green-100 tracking-wide">
                  Tháng {String(invoice.month).padStart(2, '0')} / {invoice.year}
                </p>
              </div>

              {/* Vùng trắng bo góc trên */}
              <div className="relative z-10 -mx-6 h-4 bg-white rounded-t-2xl shadow-[0_-4px_12px_rgba(0,0,0,0.10)]" />
            </div>

            {/* Địa chỉ */}
            {propertyAddress && (
              <div className="text-center text-xs text-gray-500 py-2 px-6 flex items-center justify-center gap-1 border-b border-gray-100">
                <i className="fa-solid fa-location-dot text-green-500 text-[11px]"></i>
                <span>{propertyAddress}</span>
              </div>
            )}


            {/* Thông tin khách */}
            <div className="px-6 pb-4">
              <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm border border-gray-100">
                <div>
                  <span className="text-gray-500 text-[11px] font-semibold">Kính gửi: </span>
                  <span className="font-bold text-gray-800">{displayName}</span>
                </div>
                {displayPhone && (
                  <div>
                    <span className="text-gray-500 text-[11px] font-semibold">Số điện thoại: </span>
                    <span className="font-semibold text-gray-700">{displayPhone}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500 text-[11px] font-semibold">Phòng: </span>
                  <span className="font-bold text-gray-800">{room?.name || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-[11px] font-semibold">Lý do thu: </span>
                  <span className="font-semibold text-gray-700">{label}</span>
                </div>
              </div>
            </div>

            {/* Bảng hóa đơn */}
            <div className="px-6 pb-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-green-50 text-green-800">
                    <th className="text-left font-bold px-3 py-2.5 border border-green-200 w-[38%]">Khoản thu</th>
                    <th className="text-left font-bold px-3 py-2.5 border border-green-200">Chi tiết</th>
                    <th className="text-right font-bold px-3 py-2.5 border border-green-200 w-[28%]">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-3 py-2.5 border border-gray-200 font-medium text-gray-700">
                        {line.label}
                      </td>
                      <td className="px-3 py-2.5 border border-gray-200">
                        {line.detail || null}
                      </td>
                      <td className={`px-3 py-2.5 border border-gray-200 text-right font-semibold tabular-nums ${line.highlight === 'red' ? 'text-red-500' : 'text-gray-800'}`}>
                        {formatVND(line.amount)}đ
                      </td>
                    </tr>
                  ))}

                  {/* Tổng tiền */}
                  <tr className="bg-gray-50">
                    <td colSpan={2} className="px-3 py-2.5 border border-gray-200 font-bold text-gray-800">
                      Tổng tiền
                    </td>
                    <td className="px-3 py-2.5 border border-gray-200 text-right font-black text-green-700 text-base tabular-nums">
                      {formatVND(invoice.total_amount)}đ
                    </td>
                  </tr>

                  {/* Bằng chữ */}
                  <tr className="bg-green-50">
                    <td className="px-3 py-2 border border-gray-200 font-semibold text-gray-700 text-xs">
                      Tổng tiền ghi bằng chữ
                    </td>
                    <td colSpan={2} className="px-3 py-2 border border-gray-200 text-green-700 font-semibold italic text-xs text-right">
                      {wordsText}
                    </td>
                  </tr>

                  {/* Đã thu */}
                  <tr>
                    <td colSpan={2} className="px-3 py-2.5 border border-gray-200 font-medium text-gray-700">
                      Đã thu
                    </td>
                    <td className="px-3 py-2.5 border border-gray-200 text-right font-semibold text-emerald-600 tabular-nums">
                      {invoice.paid_amount > 0 ? `${formatVND(invoice.paid_amount)}đ` : '0đ'}
                    </td>
                  </tr>

                  {/* Còn lại */}
                  <tr className={remaining > 0 ? 'bg-red-50' : 'bg-emerald-50'}>
                    <td colSpan={2} className="px-3 py-2.5 border border-gray-200 font-bold text-gray-800">
                      Còn lại
                    </td>
                    <td className={`px-3 py-2.5 border border-gray-200 text-right font-black text-base tabular-nums ${remaining > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {remaining > 0 ? `${formatVND(remaining)}đ` : '0đ'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Chữ ký */}
            <div className="px-6 pb-4 grid grid-cols-2 gap-6 text-center text-sm">
              <div>
                <div className="font-bold text-gray-700">Người đại diện thu</div>
                <div className="text-gray-400 text-[11px] mt-0.5 italic">(Ký, ghi rõ họ tên)</div>
                {/* Chữ ký viết tay */}
                <div
                  style={{
                    fontFamily: "'Segoe Script', 'Brush Script MT', 'Comic Sans MS', cursive",
                    fontSize: '28px',
                    color: '#1a5c2e',
                    marginTop: '12px',
                    lineHeight: 1.2,
                  }}
                >
                  {ownerShortName}
                </div>
                <div className="mt-1 border-t border-gray-300 pt-1 font-semibold text-gray-700 text-[12px]">
                  {ownerFullName}
                </div>
              </div>
              <div>
                <div className="font-bold text-gray-700">Khách thuê</div>
                <div className="text-gray-400 text-[11px] mt-0.5 italic">(Ký, ghi rõ họ tên)</div>
                <div className="mt-10 mb-1 border-b border-gray-300"></div>
                <div className="font-semibold text-gray-700 text-[12px]">{displayName}</div>
              </div>
            </div>

            {/* Ghi chú */}
            <div className="px-6 pb-5 space-y-1">
              {invoice.note && (
                <div className="text-xs text-gray-600">
                  <span className="font-semibold">Ghi chú:</span> {invoice.note}
                </div>
              )}
              {dueDate && (
                <div className="text-xs text-gray-500">
                  <i className="fa-solid fa-circle-exclamation text-amber-500 mr-1"></i>
                  Vui lòng thanh toán đúng hạn trước ngày <strong>{dueDate}</strong>
                </div>
              )}
            </div>

            {/* Phần mã QR thanh toán (Chỉ hiển thị nếu còn nợ) */}
            {remaining > 0 && settings.account_no && settings.bank_id && (() => {
              // Tách lấy số của phòng để mã hiển thị gọn gàng hơn, ví dụ "Phòng 101" -> "101"
              const roomNumber = room?.name?.match(/\d+/g)?.join('') || room?.name?.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5) || 'XX';
              // Dùng 4 ký tự đầu của ID hóa đơn làm mã chống trùng lặp, bỏ sạch khoảng trắng
              const uid = invoice.id.split('-')[0].substring(0, 4).toUpperCase();
              const transferDes = `P${roomNumber}T${invoice.month}${invoice.year}${uid}`;

              return (
                <div className="mx-6 mb-6 px-4 py-4 border-2 border-dashed border-green-300 rounded-xl bg-green-50 flex items-center gap-6 justify-center" data-html2canvas-ignore="false">
                  <div className="bg-white p-2 rounded-lg shadow-sm border border-green-200 shrink-0">
                    <img
                      src={`https://qr.sepay.vn/img?bank=${settings.bank_id}&acc=${settings.account_no}&amount=${remaining}&des=${transferDes}`}
                      alt="VietQR"
                      className="w-32 h-32 object-contain"
                      crossOrigin="anonymous"
                    />
                  </div>
                  <div className="text-sm">
                    <div className="font-bold text-green-800 text-base mb-1">Quét mã để thanh toán</div>
                    <div className="text-gray-600 mb-0.5">Ngân hàng: <span className="font-semibold text-gray-800">{settings.bank_id}</span></div>
                    <div className="text-gray-600 mb-0.5">Số tài khoản: <span className="font-semibold text-gray-800">{settings.account_no}</span></div>
                    <div className="text-gray-600 mb-0.5">Chủ tài khoản: <span className="font-semibold text-gray-800 uppercase">{settings.account_name || ownerFullName}</span></div>
                    <div className="text-gray-600 mb-0.5">Số tiền: <span className="font-bold text-red-600">{formatVND(remaining)} VNĐ</span></div>
                    <div className="text-gray-600 mt-2 bg-white px-2 py-1 rounded inline-block border border-gray-200">
                      Nội dung: <span className="font-bold text-blue-700">{transferDes}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
            {remaining <= 0 && invoice.total_amount > 0 && (
              <div className="mx-6 mb-6">
                <div className="flex items-center justify-center py-4 border-2 border-emerald-500 rounded-xl bg-emerald-50 text-emerald-700 text-lg font-black tracking-widest uppercase shadow-sm relative overflow-hidden">
                  {/* Watermark style text */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                    <span className="text-5xl transform -rotate-12 whitespace-nowrap">ĐÃ THANH TOÁN</span>
                  </div>
                  <i className="fa-solid fa-circle-check mr-2 text-2xl relative z-10"></i>
                  <span className="relative z-10">ĐÃ THANH TOÁN XONG</span>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

