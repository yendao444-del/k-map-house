import type { Invoice, Room, Tenant, AppSettings } from './db'
import { isDepositOnlyInvoice } from './invoice-kind'
import { buildInvoiceTransferDescription } from './invoiceTransfer'

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v)
const INVOICE_EXPORT_MARKER = '[INVOICE_EXPORTED]'

const escapeHtml = (value: string | number | undefined | null): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char] || char
  )

const cleanInvoiceNote = (note: string | undefined): string =>
  (note || '')
    .split('\n')
    .filter((line) => !line.includes(INVOICE_EXPORT_MARKER))
    .join('\n')
    .trim()

const getShortName = (name: string): string => name.trim().split(/\s+/).pop() || name

export const getImageDataUrl = async (src: string): Promise<string> => {
  try {
    const response = await fetch(src)
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return src
  }
}

function numberToWords(amount: number): string {
  if (amount === 0) return 'Không đồng'
  if (amount < 0) return `Hoàn ${numberToWords(Math.abs(amount)).toLowerCase()}`
  const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']

  function threeDigits(n: number, isHead: boolean): string {
    if (n === 0) return ''
    const h = Math.floor(n / 100)
    const t = Math.floor((n % 100) / 10)
    const u = n % 10
    let result = ''
    if (h > 0) result += units[h] + ' trăm'
    else if (!isHead && (t > 0 || u > 0)) result += 'không trăm'
    if (t === 0) {
      if (u > 0) {
        const unitWord = u === 1 ? 'một' : u === 5 ? 'lăm' : units[u]
        result += h > 0 || !isHead ? ' lẻ ' + unitWord : unitWord
      }
    } else if (t === 1) {
      result += ' mười'
      if (u > 0) result += ' ' + (u === 5 ? 'lăm' : u === 1 ? 'một' : units[u])
    } else {
      result += ' ' + units[t] + ' mươi'
      if (u === 1) result += ' mốt'
      else if (u === 5) result += ' lăm'
      else if (u > 0) result += ' ' + units[u]
    }
    return result.trim()
  }

  const billion = Math.floor(amount / 1_000_000_000)
  const million = Math.floor((amount % 1_000_000_000) / 1_000_000)
  const thousand = Math.floor((amount % 1_000_000) / 1_000)
  const remainder = amount % 1_000
  const parts: string[] = []
  if (billion > 0) parts.push(threeDigits(billion, parts.length === 0) + ' tỷ')
  if (million > 0) parts.push(threeDigits(million, parts.length === 0) + ' triệu')
  if (thousand > 0) parts.push(threeDigits(thousand, parts.length === 0) + ' nghìn')
  if (remainder > 0) parts.push(threeDigits(remainder, parts.length === 0))
  const result = parts.join(' ')
  return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng'
}

function getInvoiceNumber(invoice: Invoice): string {
  const parts = invoice.id.split('-')
  const ts = parseInt(parts[1] || '0', 10)
  const d = ts ? new Date(ts) : new Date(invoice.created_at || '')
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  const rand = (parts[2] || '').slice(0, 4).toUpperCase()
  return `${ym}-${rand}`
}

interface DetailExportLine {
  label: string
  detail?: string
  amount: number
}

const buildDetailExportLines = (invoice: Invoice, room: Room | undefined): DetailExportLine[] => {
  const lines: DetailExportLine[] = []
  const period = getBillingPeriod(invoice, room)
  const monthlyRent = room?.base_rent ?? invoice.room_cost

  if (invoice.has_transfer) {
    lines.push({
      label: `Tiền phòng cũ (${invoice.transfer_old_room_name || ''})`,
      detail: `${invoice.transfer_days || 0} ngày`,
      amount: invoice.transfer_room_cost || 0
    })
    lines.push({
      label: `Tiền phòng mới (${room?.name || ''})`,
      detail: `${invoice.new_room_days || 0} ngày`,
      amount: invoice.room_cost || 0
    })
  } else {
    lines.push({
      label: 'Tiền phòng',
      detail: period
        ? `${fmtDate(period.start)} - ${fmtDate(period.end)}${invoice.prorata_days ? ` (${invoice.prorata_days} ngày)` : ''}\n${formatVND(monthlyRent)}đ/1 tháng`
        : undefined,
      amount: invoice.room_cost
    })
  }

  if (invoice.has_transfer && (invoice.transfer_electric_cost || 0) > 0) {
    lines.push({
      label: `Tiền điện (${invoice.transfer_old_room_name || ''})`,
      detail: `${invoice.transfer_electric_usage || 0} kWh`,
      amount: invoice.transfer_electric_cost || 0
    })
  }
  if (invoice.electric_cost > 0) {
    lines.push({
      label: invoice.has_transfer ? `Tiền điện (${room?.name || ''})` : 'Tiền điện',
      detail:
        invoice.electric_usage > 0
          ? `Số cũ: ${invoice.electric_old} - Số mới: ${invoice.electric_new} (${invoice.electric_usage} kWh)`
          : undefined,
      amount: invoice.electric_cost
    })
  }

  if (invoice.has_transfer && (invoice.transfer_water_cost || 0) > 0) {
    lines.push({
      label: `Tiền nước (${invoice.transfer_old_room_name || ''})`,
      detail: `${invoice.transfer_water_usage || 0} m³`,
      amount: invoice.transfer_water_cost || 0
    })
  }
  if (invoice.water_cost > 0) {
    lines.push({
      label: invoice.has_transfer ? `Tiền nước (${room?.name || ''})` : 'Tiền nước',
      detail:
        invoice.water_usage > 0
          ? `Số cũ: ${invoice.water_old} - Số mới: ${invoice.water_new} (${invoice.water_usage} m³)`
          : undefined,
      amount: invoice.water_cost
    })
  }

  if (invoice.has_transfer && (invoice.transfer_service_cost || 0) > 0) {
    lines.push({
      label: `Phí dịch vụ (${invoice.transfer_old_room_name || ''})`,
      detail: `${invoice.transfer_days || 0} ngày`,
      amount: invoice.transfer_service_cost || 0
    })
  }
  if (invoice.wifi_cost > 0) {
    lines.push({
      label: invoice.has_transfer ? `Internet / WiFi (${room?.name || ''})` : 'Internet / WiFi',
      amount: invoice.wifi_cost
    })
  }
  if (invoice.garbage_cost > 0) {
    lines.push({
      label: invoice.has_transfer ? `Phí vệ sinh (${room?.name || ''})` : 'Phí vệ sinh',
      amount: invoice.garbage_cost
    })
  }
  if (invoice.old_debt > 0) {
    lines.push({ label: 'Nợ kỳ trước', amount: invoice.old_debt })
  }

  const depositAmt = invoice.deposit_amount || 0
  if (depositAmt !== 0) {
    lines.push({
      label: depositAmt > 0 ? 'Thu tiền cọc' : 'Trả tiền cọc',
      amount: Math.abs(depositAmt)
    })
  }

  const adjustmentAmt = invoice.adjustment_amount || 0
  if (adjustmentAmt !== 0) {
    lines.push({
      label:
        adjustmentAmt > 0
          ? `Cộng thêm${invoice.adjustment_note ? ` (${invoice.adjustment_note})` : ''}`
          : `Giảm trừ${invoice.adjustment_note ? ` (${invoice.adjustment_note})` : ''}`,
      amount: Math.abs(adjustmentAmt)
    })
  }

  return lines.filter((line) => line.amount !== 0)
}

const renderDetailExportLine = (detail?: string): string => {
  if (!detail) return ''
  return detail
    .split('\n')
    .map(
      (line, index) =>
        `<div class="${index === 0 ? 'line-detail-main' : 'line-detail-sub'}">${escapeHtml(line)}</div>`
    )
    .join('')
}

export const buildInvoiceDetailExportHtml = (
  invoice: Invoice,
  room: Room | undefined,
  tenant: Pick<Tenant, 'full_name' | 'phone'> | undefined,
  settings: AppSettings,
  logoSrc: string,
  logoMarkSrc: string
): string => {
  const displayName = tenant?.full_name || room?.tenant_name || 'Khách thuê'
  const displayPhone = tenant?.phone || room?.tenant_phone || ''
  const propertyAddress = settings.property_address || ''
  const ownerPhone = settings.property_owner_phone || ''
  const ownerFullName = settings.property_owner_name || 'AN KHANG HOME'
  const ownerShortName = getShortName(ownerFullName)
  const tenantShortName = getShortName(displayName)
  const label = getInvoiceLabel(invoice)
  const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount)
  const wordsText =
    invoice.total_amount < 0
      ? `Hoàn ${numberToWords(Math.abs(invoice.total_amount)).toLowerCase()}`
      : numberToWords(invoice.total_amount)
  const dueDate = invoice.due_date ? fmtDate(invoice.due_date) : null
  const note = cleanInvoiceNote(invoice.note)
  const lines = buildDetailExportLines(invoice, room)
  const transferDes =
    remaining > 0 && settings.account_no && settings.bank_id
      ? buildInvoiceTransferDescription(invoice, room?.name)
      : ''

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    body { font-family: Inter, Arial, sans-serif; background: #fff; color: #111827; padding: 0; }
    .capture-page { max-width: 1120px; margin: 0 auto; }
    .invoice-export-frame { background: #fff; }
    .invoice-wrap { position: relative; width: 768px; max-width: none; background: #fff; border: 3px solid #064a31; overflow: hidden; margin: 0; }
    .shape-1 { position: absolute; right: -80px; top: 0; width: 224px; height: 224px; border-radius: 999px; background: rgba(209, 250, 229, .75); }
    .shape-2 { position: absolute; right: 80px; top: 80px; width: 80px; height: 144px; border-radius: 32px; background: rgba(219, 234, 254, .6); transform: rotate(45deg); }
    .shape-3 { position: absolute; left: -80px; bottom: 176px; width: 224px; height: 224px; border-radius: 999px; border: 28px solid rgba(226, 232, 240, .7); }
    .shape-4 { position: absolute; right: -70px; bottom: 128px; width: 128px; height: 128px; border-radius: 999px; background: rgba(209, 250, 229, .8); }
    .watermark { position: absolute; left: 50%; top: 46%; z-index: 0; transform: translate(-50%, -50%); pointer-events: none; user-select: none; opacity: .035; }
    .watermark img { width: 360px; object-fit: contain; }
    .section { position: relative; z-index: 1; background: transparent; }
    .header { display: grid; grid-template-columns: minmax(0,1.15fr) minmax(0,1fr) minmax(0,.85fr); gap: 20px; align-items: start; padding: 28px 28px 24px; }
    .bulk-logo { order: 1; }
    .logo { max-width: 100%; width: 245px; height: 78px; object-fit: contain; object-position: left; display: block; }
    .tagline { margin-top: 8px; font-size: 12px; font-style: italic; color: #064a31; }
    .header-grid { order: 3; border-left: 1px solid #e2e8f0; padding-left: 24px; font-size: 11px; color: #64748b; }
    .header-left { display: none; }
    .header-right { display: flex; flex-direction: column; gap: 4px; }
    .meta { border-left: 1px solid #e2e8f0; padding-left: 24px; font-size: 11px; color: #64748b; }
    .meta-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
    .brand { font-weight: 900; text-transform: uppercase; letter-spacing: .03em; color: #0f172a; }
    .bold { font-weight: 700; color: #0f172a; }
    .title-block { order: 2; text-align: center; }
    .title-main { font-size: 32px; line-height: 1; font-weight: 900; text-transform: uppercase; color: #064a31; }
    .title-sub { margin-top: 8px; font-size: 21px; font-weight: 800; text-transform: uppercase; color: #3b82f6; white-space: nowrap; }
    .title-period { margin-top: 8px; font-size: 14px; font-weight: 500; color: #334155; }
    .title-date { margin-top: 4px; font-size: 11px; font-weight: 500; color: #94a3b8; }
    .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; padding: 0 28px 20px; }
    .info { padding: 0 28px 20px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; border-top: 1px solid #eef2f7; border-bottom: 1px solid #eef2f7; padding: 14px 0; font-size: 12px; color: #334155; }
    .party + .party { border-left: 1px solid #e2e8f0; padding-left: 28px; }
    .pill { display: inline-flex; border-radius: 6px; padding: 6px 16px; font-size: 10px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; color: #fff; margin-bottom: 12px; }
    .pill-blue { background: #064a31; }
    .pill-green { background: #009653; }
    .party-title { margin-bottom: 8px; font-size: 16px; font-weight: 900; text-transform: uppercase; color: #064a31; }
    .party-text { font-size: 12px; color: #334155; line-height: 1.65; }
    .tenant-info { display: grid; grid-template-columns: 100px 1fr; gap: 8px 0; font-size: 12px; }
    .tenant-info span { color: #64748b; }
    .room-name { font-size: 16px; color: #064a31; }
    .table-wrap { position: relative; padding: 0 28px 16px; }
    .table-watermark { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%); opacity: .03; pointer-events: none; }
    .table-watermark img { width: 360px; object-fit: contain; }
    table { position: relative; z-index: 1; width: 100%; border-collapse: separate; border-spacing: 0; background: transparent; font-size: 12px; overflow: hidden; border-radius: 8px; }
    th { background: #064a31; color: #fff; font-weight: 800; padding: 8px 12px; border: 1px solid #064a31; text-transform: uppercase; font-size: 10px; }
    th:first-child { border-top-left-radius: 8px; }
    th:last-child { border-top-right-radius: 8px; }
    th:nth-child(1), td:nth-child(1) { text-align: center; width: 7%; }
    th:nth-child(2) { text-align: left; width: 33%; }
    th:nth-child(3) { text-align: left; }
    th:nth-child(4), td:nth-child(4) { text-align: right; width: 25%; }
    td { padding: 8px 12px; border: 1px solid #e2e8f0; vertical-align: middle; color: #0f172a; }
    .item-label { font-weight: 700; color: #1e293b; }
    .amount { font-weight: 900; color: #064a31; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 14px; }
    .line-detail-main { color: #0f172a; font-size: 11px; font-weight: 600; white-space: nowrap; }
    .line-detail-sub { color: #0f172a; font-size: 11px; margin-top: 2px; white-space: nowrap; }
    .summary { position: relative; z-index: 1; padding: 0 28px 20px; }
    .total-card { display: flex; align-items: center; justify-content: space-between; border: 1px solid #dbeafe; background: rgba(239, 246, 255, .6); border-radius: 6px; padding: 12px 16px; margin-bottom: 12px; }
    .total-card span:first-child { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; color: #064a31; }
    .total-card span:last-child { font-size: 26px; font-weight: 900; color: #064a31; }
    .words-row { display: flex; font-size: 12px; margin-bottom: 16px; }
    .words-label { width: 112px; font-style: italic; color: #94a3b8; }
    .words { flex: 1; font-weight: 800; font-style: italic; color: #1e293b; }
    .paid-row { display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding: 12px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #94a3b8; }
    .remain-row { display: flex; justify-content: space-between; margin-top: 12px; border-radius: 6px; background: #2563eb; color: #fff; padding: 16px; box-shadow: 0 10px 20px rgba(37, 99, 235, .12); }
    .remain-row span:first-child { font-size: 15px; font-weight: 900; text-transform: uppercase; }
    .remain-row span:last-child { font-size: 26px; font-weight: 900; }
    .signature { padding: 0 28px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; text-align: center; font-size: 14px; }
    .sig-title { font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #064a31; }
    .sig-hint { margin: 4px 0 28px; color: #94a3b8; font-size: 10px; font-style: italic; }
    .sig-cursive { margin-bottom: 8px; font-size: 18px; font-weight: 600; font-style: italic; color: #64748b; }
    .tenant-short { margin-bottom: 8px; font-size: 18px; font-weight: 600; font-style: italic; color: #64748b; }
    .sig-print { font-size: 14px; font-weight: 800; color: #0f172a; }
    .note { margin: 0 28px 16px; border: 1px solid #f1f5f9; background: #f8fafc; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #475569; }
    .due { color: #6b7280; }
    .qr { margin: 0 28px 20px; padding: 16px; display: grid; grid-template-columns: 170px 1fr; gap: 24px; position: relative; z-index: 1; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 8px; }
    .qr-box { flex: 0 0 auto; background: #fff; padding: 8px; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(15, 23, 42, .08); }
    .qr-box img { width: 150px; height: 150px; object-fit: contain; display: block; }
    .qr-info { font-size: 12px; color: #475569; }
    .qr-title { font-size: 15px; font-weight: 900; text-transform: uppercase; color: #064a31; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
    .qr-grid { display: grid; grid-template-columns: 110px 1fr; gap: 8px 0; }
    .qr-money { color: #dc2626; font-size: 24px; font-weight: 900; }
    .qr-hint { margin-top: 10px; color: #64748b; font-size: 11px; line-height: 1.45; }
    .qr-des { margin-top: 16px; display: block; background: #fff; border: 1px dashed #cbd5e1; border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; }
    .footer { position: relative; z-index: 1; margin: 0 28px; display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; border-top: 2px solid #064a31; background: #fff; padding: 16px; font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: rgba(0, 40, 85, .7); }
  </style>
</head>
<body>
  <div class="capture-page">
    <div class="invoice-export-frame">
      <div class="invoice-wrap">
        <div class="shape-1"></div><div class="shape-2"></div><div class="shape-3"></div><div class="shape-4"></div>
        <div class="watermark"><img src="${escapeHtml(logoMarkSrc)}" alt="watermark" /></div>
        <div class="section header">
          <div class="bulk-logo"><img class="logo" src="${escapeHtml(logoSrc)}" alt="AN KHANG HOME" /><p class="tagline">An tâm chọn nhà - An khang cuộc sống</p></div>
          <div class="header-grid">
            <div class="header-left">
              <div class="brand">${escapeHtml(settings.property_name || 'PHIẾU THU TIỀN NHÀ')}</div>
              <div>Địa chỉ: <span class="bold">${escapeHtml(propertyAddress || '—')}</span></div>
              <div>Điện thoại: <span class="bold">${escapeHtml(ownerPhone || '—')}</span></div>
            </div>
            <div class="header-right">
              <div>Mẫu số: <span class="bold">HDTN</span></div>
              <div>Ký hiệu: <span class="bold">1K26TAA</span></div>
              <div>Số: <span class="bold">${escapeHtml(getInvoiceNumber(invoice))}</span></div>
              <div>Ngày lập: <span class="bold">${escapeHtml(fmtDate(invoice.invoice_date || invoice.created_at))}</span></div>
              ${dueDate ? `<div>Hạn thanh toán: <span class="bold">${escapeHtml(dueDate)}</span></div>` : ''}
            </div>
          </div>
          <div class="title-block">
            <h1 class="title-main">Hóa đơn</h1>
            <div class="title-sub">Tiền thuê nhà</div>
            <div class="title-period">Tháng ${String(invoice.month).padStart(2, '0')} / ${invoice.year}</div>
            <div class="title-date">Ngày lập: ${escapeHtml(fmtDateTime(invoice.created_at || invoice.invoice_date || ''))}</div>
          </div>
        </div>
        <div class="section party-grid">
          <section class="party">
            <div class="pill pill-blue">Thông tin bên cho thuê</div>
            <h3 class="party-title">AN KHANG HOME</h3>
            <div class="party-text">
              <div>Địa chỉ: <span class="bold">${escapeHtml(propertyAddress || '-')}</span></div>
              <div>Điện thoại: <span class="bold">${escapeHtml(ownerPhone || '-')}</span></div>
            </div>
          </section>
          <section class="party">
            <div class="pill pill-green">Thông tin khách thuê</div>
            <div class="tenant-info">
              <span>Khách hàng:</span><b>${escapeHtml(displayName)}</b>
              <span>Số điện thoại:</span><b>${escapeHtml(displayPhone || '-')}</b>
              <span>Phòng:</span><b class="room-name">${escapeHtml(room?.name || '-')}</b>
              <span>Nội dung thu:</span><span>${escapeHtml(label)}</span>
            </div>
          </section>
        </div>
        <div class="section table-wrap">
          <div class="table-watermark"><img src="${escapeHtml(logoMarkSrc)}" alt="watermark" /></div>
          <table>
            <thead>
              <tr><th>STT</th><th>Nội dung</th><th>Chi tiết</th><th>Thành tiền</th></tr>
            </thead>
            <tbody>
              ${lines
                .map(
                  (line, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td class="item-label">${escapeHtml(line.label)}</td>
                  <td>${renderDetailExportLine(line.detail)}</td>
                  <td class="amount">${formatVND(line.amount)}đ</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <div class="section summary">
          <div class="total-card">
            <span>Tổng cộng</span>
            <span>${formatVND(invoice.total_amount)}đ</span>
          </div>
          <div class="words-row">
            <span class="words-label">Bằng chữ:</span>
            <span class="words">${escapeHtml(wordsText)}</span>
          </div>
          ${
            invoice.paid_amount > 0
              ? `
            <div class="paid-row">
              <span>Số tiền đã thanh toán</span>
              <span>${formatVND(invoice.paid_amount)}đ</span>
            </div>
            ${
              remaining > 0
                ? `
              <div class="remain-row">
                <span>Số tiền còn lại</span>
                <span>${formatVND(remaining)}đ</span>
              </div>`
                : ''
            }
          `
              : ''
          }
        </div>
        <div class="section signature">
          <div>
            <div class="sig-title">Người đại diện thu</div>
            <div class="sig-hint">(Ký, ghi rõ họ tên)</div>
            <div class="sig-cursive">${escapeHtml(ownerShortName)}</div>
            <div class="sig-print">${escapeHtml(ownerFullName)}</div>
          </div>
          <div>
            <div class="sig-title">Khách thuê</div>
            <div class="sig-hint">(Ký, ghi rõ họ tên)</div>
            <div class="tenant-short">${escapeHtml(tenantShortName)}</div>
            <div class="sig-print">${escapeHtml(displayName)}</div>
          </div>
        </div>
        ${note ? `<div class="section note"><span class="bold">Ghi chú:</span> ${escapeHtml(note)}</div>` : ''}
        ${
          transferDes
            ? `
          <div class="qr">
            <div class="qr-box"><img src="https://qr.sepay.vn/img?bank=${encodeURIComponent(settings.bank_id || '')}&acc=${encodeURIComponent(settings.account_no || '')}&amount=${encodeURIComponent(String(remaining))}&des=${encodeURIComponent(transferDes)}" alt="VietQR" /></div>
            <div class="qr-info">
              <div class="qr-title">Quét mã để thanh toán</div>
              <div class="qr-grid">
                <span>Ngân hàng:</span><span class="bold">${escapeHtml(settings.bank_id)}</span>
                <span>Số tài khoản:</span><span class="bold">${escapeHtml(settings.account_no)}</span>
                <span>Chủ tài khoản:</span><span class="bold">${escapeHtml((settings.account_name || ownerFullName).toUpperCase())}</span>
                <span>Còn cần thu:</span><span class="qr-money">${formatVND(remaining)} VNĐ</span>
              </div>
              <div class="qr-hint">Khách có thể tự nhập số tiền chuyển, giữ nguyên nội dung chuyển khoản.</div>
              <div class="qr-des">Nội dung: <span class="bold">${escapeHtml(transferDes)}</span></div>
            </div>
          </div>`
            : ''
        }
        <div class="footer">
          <span>AN KHANG HOME</span>
          <span>${escapeHtml(propertyAddress || '-')}</span>
          <span>${escapeHtml(ownerPhone || '-')}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })

function getInvoiceLabel(invoice: Invoice): string {
  if (invoice.is_settlement) return 'Hóa đơn tất toán hợp đồng'
  if (invoice.billing_reason === 'deposit_refund') return 'Trả tiền cọc'
  if (invoice.billing_reason === 'deposit_collect' || isDepositOnlyInvoice(invoice))
    return 'Thu tiền cọc'
  if (invoice.is_first_month) return 'Thu tiền tháng đầu tiên'
  if (invoice.billing_reason === 'contract_end') return 'Tất toán hợp đồng'
  return `Thu tiền tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`
}

/** Lấy khoảng thời gian kỳ hóa đơn từ dữ liệu đã lưu */
function getBillingPeriod(
  invoice: Invoice,
  _room: Room | undefined
): { start: string; end: string } | null {
  if (!invoice.billing_period_start || !invoice.billing_period_end) return null
  const end = new Date(invoice.year, invoice.month, 0)
  const monthEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  const savedEnd = new Date(invoice.billing_period_end)
  const isMonthlyInvoice =
    !invoice.is_settlement &&
    !isDepositOnlyInvoice(invoice) &&
    invoice.billing_reason !== 'deposit_collect' &&
    invoice.billing_reason !== 'deposit_refund' &&
    invoice.billing_reason !== 'contract_end'
  const savedEndIsInsideInvoiceMonth =
    !Number.isNaN(savedEnd.getTime()) &&
    savedEnd.getFullYear() === invoice.year &&
    savedEnd.getMonth() + 1 === invoice.month &&
    invoice.billing_period_end < monthEnd
  return {
    start: invoice.billing_period_start,
    end: isMonthlyInvoice && savedEndIsInsideInvoiceMonth ? monthEnd : invoice.billing_period_end
  }
}


