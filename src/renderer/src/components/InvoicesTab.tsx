import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInvoices, getRooms, getTenants, getAppSettings, deleteInvoice, isDepositOnlyInvoice, updateInvoice, type Invoice, type Room, type AppUser, type Tenant, type AppSettings } from '../lib/db';
import { PaymentModal } from './PaymentModal';
import { EditInvoiceModal } from './EditInvoiceModal';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { SePaySyncModal } from './SePaySyncModal';
import { LogoLoading } from './LogoLoading';
import { buildInvoiceTransferDescription } from '../lib/invoiceTransfer';
import logoNgang from '../assets/an_khang_home_logo_ngang.png';
import logoMark from '../assets/an_khang_home_logo.png';

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v);
const INVOICE_EXPORT_MARKER = '[INVOICE_EXPORTED]'

const isInvoiceExported = (invoice: Invoice): boolean => (invoice.note || '').includes(INVOICE_EXPORT_MARKER)

const appendInvoiceExportNote = (note: string | undefined, filePath: string): string => {
  const marker = `${INVOICE_EXPORT_MARKER} ${new Date().toISOString()} ${filePath}`
  const cleanNote = (note || '')
    .split('\n')
    .filter((line) => !line.includes(INVOICE_EXPORT_MARKER))
    .join('\n')
    .trim()
  return [cleanNote, marker].filter(Boolean).join('\n')
}

const escapeHtml = (value: string | number | undefined | null): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char))

const cleanInvoiceNote = (note: string | undefined): string =>
  (note || '')
    .split('\n')
    .filter((line) => !line.includes(INVOICE_EXPORT_MARKER))
    .join('\n')
    .trim()

const getShortName = (name: string): string => name.trim().split(/\s+/).pop() || name

const getImageDataUrl = async (src: string): Promise<string> => {
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
  if (amount === 0) return 'Không đồng';
  if (amount < 0) return `Hoàn ${numberToWords(Math.abs(amount)).toLowerCase()}`;
  const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  function threeDigits(n: number, isHead: boolean): string {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    let result = '';
    if (h > 0) result += units[h] + ' trăm';
    else if (!isHead && (t > 0 || u > 0)) result += 'không trăm';
    if (t === 0) {
      if (u > 0) {
        const unitWord = u === 1 ? 'một' : u === 5 ? 'lăm' : units[u];
        result += h > 0 || !isHead ? ' lẻ ' + unitWord : unitWord;
      }
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

const buildBulkInvoiceHtml = (
  invoice: Invoice,
  room: Room | undefined,
  tenant: Tenant | undefined,
  settings: AppSettings,
): string => {
  const rows = [
    ['Tiền phòng', invoice.room_cost],
    ['Tiền điện', invoice.electric_cost],
    ['Tiền nước', invoice.water_cost],
    ['Internet / WiFi', invoice.wifi_cost],
    ['Phí vệ sinh', invoice.garbage_cost],
    ['Nợ cũ', invoice.old_debt],
    ['Cộng thêm / Giảm trừ', invoice.adjustment_amount || 0],
    ['Thu/trả cọc', invoice.deposit_amount || 0],
  ].filter(([, amount]) => Number(amount) !== 0)
  const remaining = Math.max(0, invoice.total_amount - invoice.paid_amount)
  const period = getBillingPeriod(invoice, room)
  const title = getInvoiceLabel(invoice)

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #eef2f7; font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; }
    .capture-page { max-width: 760px; margin: 0 auto; }
    .invoice-export-frame { background: #fff; border: 1px solid #cbd5e1; border-radius: 18px; overflow: hidden; box-shadow: 0 24px 48px rgba(15, 23, 42, 0.14); }
    .head { padding: 26px 30px 18px; border-bottom: 2px solid #10b981; text-align: center; }
    .brand { font-size: 18px; font-weight: 900; color: #065f46; text-transform: uppercase; }
    .addr { margin-top: 4px; font-size: 12px; color: #64748b; }
    .title { margin-top: 18px; font-size: 24px; font-weight: 900; letter-spacing: .4px; }
    .sub { margin-top: 6px; font-size: 14px; font-weight: 700; color: #334155; }
    .info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; padding: 18px 30px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
    .label { color: #64748b; font-weight: 700; }
    table { width: calc(100% - 60px); margin: 20px 30px; border-collapse: collapse; font-size: 13px; }
    th { background: #ecfdf5; color: #047857; text-align: left; padding: 10px 12px; border: 1px solid #a7f3d0; }
    th:last-child, td:last-child { text-align: right; }
    td { padding: 10px 12px; border: 1px solid #e2e8f0; }
    .total td { font-size: 16px; font-weight: 900; background: #f8fafc; }
    .paid td { color: #059669; font-weight: 800; }
    .remain td { color: #dc2626; font-weight: 900; background: #fff7ed; }
    .sig { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 12px 30px 36px; text-align: center; font-size: 13px; font-weight: 800; }
  </style>
</head>
<body>
  <div class="capture-page">
    <div class="invoice-export-frame">
      <div class="head">
        <div class="brand">${escapeHtml(settings.property_name || 'AN KHANG HOME')}</div>
        <div class="addr">${escapeHtml(settings.property_address || '')}</div>
        <div class="title">HÓA ĐƠN THANH TOÁN</div>
        <div class="sub">${escapeHtml(title)} - T.${invoice.month}/${invoice.year}</div>
      </div>
      <div class="info">
        <div><span class="label">Phòng:</span> ${escapeHtml(room?.name || 'Không rõ')}</div>
        <div><span class="label">Khách thuê:</span> ${escapeHtml(tenant?.full_name || room?.tenant_name || '')}</div>
        <div><span class="label">Ngày lập:</span> ${escapeHtml(new Date(invoice.created_at).toLocaleDateString('vi-VN'))}</div>
        <div><span class="label">Kỳ:</span> ${period ? `${escapeHtml(fmtDate(period.start))} - ${escapeHtml(fmtDate(period.end))}` : `T.${invoice.month}/${invoice.year}`}</div>
      </div>
      <table>
        <thead><tr><th>Khoản thu</th><th>Số tiền</th></tr></thead>
        <tbody>
          ${rows.map(([label, amount]) => `<tr><td>${escapeHtml(String(label))}</td><td>${formatVND(Number(amount))} đ</td></tr>`).join('')}
          <tr class="total"><td>Tổng cộng</td><td>${formatVND(invoice.total_amount)} đ</td></tr>
          <tr class="paid"><td>Đã thu</td><td>${formatVND(invoice.paid_amount)} đ</td></tr>
          <tr class="remain"><td>Còn lại</td><td>${formatVND(remaining)} đ</td></tr>
        </tbody>
      </table>
      <div class="sig">
        <div>Người đại diện thu</div>
        <div>Khách thuê</div>
      </div>
    </div>
  </div>
</body>
</html>`
}
void buildBulkInvoiceHtml

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
      amount: invoice.transfer_room_cost || 0,
    })
    lines.push({
      label: `Tiền phòng mới (${room?.name || ''})`,
      detail: `${invoice.new_room_days || 0} ngày`,
      amount: invoice.room_cost || 0,
    })
  } else {
    lines.push({
      label: 'Tiền phòng',
      detail: period
        ? `${fmtDate(period.start)} - ${fmtDate(period.end)}${invoice.prorata_days ? ` (${invoice.prorata_days} ngày)` : ''}\n${formatVND(monthlyRent)}đ/1 tháng`
        : undefined,
      amount: invoice.room_cost,
    })
  }

  if (invoice.has_transfer && (invoice.transfer_electric_cost || 0) > 0) {
    lines.push({
      label: `Tiền điện (${invoice.transfer_old_room_name || ''})`,
      detail: `${invoice.transfer_electric_usage || 0} kWh`,
      amount: invoice.transfer_electric_cost || 0,
    })
  }
  if (invoice.electric_cost > 0) {
    lines.push({
      label: invoice.has_transfer ? `Tiền điện (${room?.name || ''})` : 'Tiền điện',
      detail: invoice.electric_usage > 0 ? `Số cũ: ${invoice.electric_old} - Số mới: ${invoice.electric_new} (${invoice.electric_usage} kWh)` : undefined,
      amount: invoice.electric_cost,
    })
  }

  if (invoice.has_transfer && (invoice.transfer_water_cost || 0) > 0) {
    lines.push({
      label: `Tiền nước (${invoice.transfer_old_room_name || ''})`,
      detail: `${invoice.transfer_water_usage || 0} m³`,
      amount: invoice.transfer_water_cost || 0,
    })
  }
  if (invoice.water_cost > 0) {
    lines.push({
      label: invoice.has_transfer ? `Tiền nước (${room?.name || ''})` : 'Tiền nước',
      detail: invoice.water_usage > 0 ? `Số cũ: ${invoice.water_old} - Số mới: ${invoice.water_new} (${invoice.water_usage} m³)` : undefined,
      amount: invoice.water_cost,
    })
  }

  if (invoice.has_transfer && (invoice.transfer_service_cost || 0) > 0) {
    lines.push({
      label: `Phí dịch vụ (${invoice.transfer_old_room_name || ''})`,
      detail: `${invoice.transfer_days || 0} ngày`,
      amount: invoice.transfer_service_cost || 0,
    })
  }
  if (invoice.wifi_cost > 0) {
    lines.push({ label: invoice.has_transfer ? `Internet / WiFi (${room?.name || ''})` : 'Internet / WiFi', amount: invoice.wifi_cost })
  }
  if (invoice.garbage_cost > 0) {
    lines.push({ label: invoice.has_transfer ? `Phí vệ sinh (${room?.name || ''})` : 'Phí vệ sinh', amount: invoice.garbage_cost })
  }
  if (invoice.old_debt > 0) {
    lines.push({ label: 'Nợ kỳ trước', amount: invoice.old_debt })
  }

  const depositAmt = invoice.deposit_amount || 0
  if (depositAmt !== 0) {
    lines.push({ label: depositAmt > 0 ? 'Thu tiền cọc' : 'Trả tiền cọc', amount: Math.abs(depositAmt) })
  }

  const adjustmentAmt = invoice.adjustment_amount || 0
  if (adjustmentAmt !== 0) {
    lines.push({
      label: adjustmentAmt > 0
        ? `Cộng thêm${invoice.adjustment_note ? ` (${invoice.adjustment_note})` : ''}`
        : `Giảm trừ${invoice.adjustment_note ? ` (${invoice.adjustment_note})` : ''}`,
      amount: Math.abs(adjustmentAmt),
    })
  }

  return lines.filter((line) => line.amount !== 0)
}

const renderDetailExportLine = (detail?: string): string => {
  if (!detail) return ''
  return detail
    .split('\n')
    .map((line, index) => `<div class="${index === 0 ? 'line-detail-main' : 'line-detail-sub'}">${escapeHtml(line)}</div>`)
    .join('')
}

const buildInvoiceDetailExportHtml = (
  invoice: Invoice,
  room: Room | undefined,
  tenant: Tenant | undefined,
  settings: AppSettings,
  logoSrc: string,
  logoMarkSrc: string,
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
  const wordsText = invoice.total_amount < 0
    ? `Hoàn ${numberToWords(Math.abs(invoice.total_amount)).toLowerCase()}`
    : numberToWords(invoice.total_amount)
  const dueDate = invoice.due_date ? fmtDate(invoice.due_date) : null
  const note = cleanInvoiceNote(invoice.note)
  const lines = buildDetailExportLines(invoice, room)
  const transferDes = remaining > 0 && settings.account_no && settings.bank_id
    ? buildInvoiceTransferDescription(invoice, room?.name)
    : ''

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    body { font-family: Inter, Arial, sans-serif; background: #fff; color: #111827; padding: 0; }
    .capture-page { max-width: 1120px; margin: 0 auto; }
    .invoice-export-frame { background: #fff; }
    .invoice-wrap { position: relative; background: #fff; border: 3px solid #002855; overflow: hidden; max-width: 768px; margin: 0 auto; }
    .shape-1 { position: absolute; right: -80px; top: 0; width: 224px; height: 224px; border-radius: 999px; background: rgba(209, 250, 229, .75); }
    .shape-2 { position: absolute; right: 80px; top: 80px; width: 80px; height: 144px; border-radius: 32px; background: rgba(219, 234, 254, .6); transform: rotate(45deg); }
    .shape-3 { position: absolute; left: -80px; bottom: 176px; width: 224px; height: 224px; border-radius: 999px; border: 28px solid rgba(226, 232, 240, .7); }
    .shape-4 { position: absolute; right: -70px; bottom: 128px; width: 128px; height: 128px; border-radius: 999px; background: rgba(209, 250, 229, .8); }
    .watermark { position: absolute; left: 50%; top: 46%; z-index: 0; transform: translate(-50%, -50%); pointer-events: none; user-select: none; opacity: .035; }
    .watermark img { width: 360px; object-fit: contain; }
    .section { position: relative; z-index: 1; background: transparent; }
    .header { display: grid; grid-template-columns: 1.15fr 1fr .85fr; gap: 20px; align-items: start; padding: 28px 28px 24px; }
    .bulk-logo { order: 1; }
    .logo { width: 245px; height: 78px; object-fit: contain; object-position: left; display: block; }
    .tagline { margin-top: 8px; font-size: 12px; font-style: italic; color: #002855; }
    .header-grid { order: 3; border-left: 1px solid #e2e8f0; padding-left: 24px; font-size: 11px; color: #64748b; }
    .header-left { display: none; }
    .header-right { display: flex; flex-direction: column; gap: 4px; }
    .meta { border-left: 1px solid #e2e8f0; padding-left: 24px; font-size: 11px; color: #64748b; }
    .meta-row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
    .brand { font-weight: 900; text-transform: uppercase; letter-spacing: .03em; color: #0f172a; }
    .bold { font-weight: 700; color: #0f172a; }
    .title-block { order: 2; text-align: center; }
    .title-main { font-size: 32px; line-height: 1; font-weight: 900; text-transform: uppercase; color: #002855; }
    .title-sub { margin-top: 8px; font-size: 21px; font-weight: 800; text-transform: uppercase; color: #3b82f6; white-space: nowrap; }
    .title-period { margin-top: 8px; font-size: 14px; font-weight: 500; color: #334155; }
    .title-date { margin-top: 4px; font-size: 11px; font-weight: 500; color: #94a3b8; }
    .party-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; padding: 0 28px 20px; }
    .info { padding: 0 28px 20px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; border-top: 1px solid #eef2f7; border-bottom: 1px solid #eef2f7; padding: 14px 0; font-size: 12px; color: #334155; }
    .party + .party { border-left: 1px solid #e2e8f0; padding-left: 28px; }
    .pill { display: inline-flex; border-radius: 6px; padding: 6px 16px; font-size: 10px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; color: #fff; margin-bottom: 12px; }
    .pill-blue { background: #002855; }
    .pill-green { background: #059669; }
    .party-title { margin-bottom: 8px; font-size: 16px; font-weight: 900; text-transform: uppercase; color: #002855; }
    .party-text { font-size: 12px; color: #334155; line-height: 1.65; }
    .tenant-info { display: grid; grid-template-columns: 100px 1fr; gap: 8px 0; font-size: 12px; }
    .tenant-info span { color: #64748b; }
    .room-name { font-size: 16px; color: #002855; }
    .table-wrap { position: relative; padding: 0 28px 16px; }
    .table-watermark { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%); opacity: .03; pointer-events: none; }
    .table-watermark img { width: 360px; object-fit: contain; }
    table { position: relative; z-index: 1; width: 100%; border-collapse: separate; border-spacing: 0; background: transparent; font-size: 12px; overflow: hidden; border-radius: 8px; }
    th { background: #002855; color: #fff; font-weight: 800; padding: 8px 12px; border: 1px solid #002855; text-transform: uppercase; font-size: 10px; }
    th:first-child { border-top-left-radius: 8px; }
    th:last-child { border-top-right-radius: 8px; }
    th:nth-child(1), td:nth-child(1) { text-align: center; width: 7%; }
    th:nth-child(2) { text-align: left; width: 33%; }
    th:nth-child(3) { text-align: left; }
    th:nth-child(4), td:nth-child(4) { text-align: right; width: 25%; }
    td { padding: 8px 12px; border: 1px solid #e2e8f0; vertical-align: middle; color: #0f172a; }
    .item-label { font-weight: 700; color: #1e293b; }
    .amount { font-weight: 900; color: #002855; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 14px; }
    .line-detail-main { color: #0f172a; font-size: 11px; font-weight: 600; white-space: nowrap; }
    .line-detail-sub { color: #0f172a; font-size: 11px; margin-top: 2px; white-space: nowrap; }
    .summary { position: relative; z-index: 1; padding: 0 28px 20px; }
    .total-card { display: flex; align-items: center; justify-content: space-between; border: 1px solid #dbeafe; background: rgba(239, 246, 255, .6); border-radius: 6px; padding: 12px 16px; margin-bottom: 12px; }
    .total-card span:first-child { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; color: #002855; }
    .total-card span:last-child { font-size: 26px; font-weight: 900; color: #002855; }
    .words-row { display: flex; font-size: 12px; margin-bottom: 16px; }
    .words-label { width: 112px; font-style: italic; color: #94a3b8; }
    .words { flex: 1; font-weight: 800; font-style: italic; color: #1e293b; }
    .paid-row { display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding: 12px 0; font-size: 12px; font-weight: 800; text-transform: uppercase; color: #94a3b8; }
    .remain-row { display: flex; justify-content: space-between; margin-top: 12px; border-radius: 6px; background: #2563eb; color: #fff; padding: 16px; box-shadow: 0 10px 20px rgba(37, 99, 235, .12); }
    .remain-row span:first-child { font-size: 15px; font-weight: 900; text-transform: uppercase; }
    .remain-row span:last-child { font-size: 26px; font-weight: 900; }
    .signature { padding: 0 28px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; text-align: center; font-size: 14px; }
    .sig-title { font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #002855; }
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
    .qr-title { font-size: 15px; font-weight: 900; text-transform: uppercase; color: #002855; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
    .qr-grid { display: grid; grid-template-columns: 110px 1fr; gap: 8px 0; }
    .qr-money { color: #dc2626; font-size: 24px; font-weight: 900; }
    .qr-des { margin-top: 16px; display: block; background: #fff; border: 1px dashed #cbd5e1; border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; }
    .footer { position: relative; z-index: 1; margin: 0 28px; display: flex; flex-wrap: wrap; justify-content: center; gap: 20px; border-top: 2px solid #002855; background: #fff; padding: 16px; font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: rgba(0, 40, 85, .7); }
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
              ${lines.map((line, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td class="item-label">${escapeHtml(line.label)}</td>
                  <td>${renderDetailExportLine(line.detail)}</td>
                  <td class="amount">${formatVND(line.amount)}đ</td>
                </tr>`).join('')}
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
          ${invoice.paid_amount > 0 ? `
            <div class="paid-row">
              <span>Số tiền đã thanh toán</span>
              <span>${formatVND(invoice.paid_amount)}đ</span>
            </div>
            ${remaining > 0 ? `
              <div class="remain-row">
                <span>Số tiền còn lại</span>
                <span>${formatVND(remaining)}đ</span>
              </div>` : ''}
          ` : ''}
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
        ${transferDes ? `
          <div class="qr">
            <div class="qr-box"><img src="https://qr.sepay.vn/img?bank=${encodeURIComponent(settings.bank_id || '')}&acc=${encodeURIComponent(settings.account_no || '')}&amount=${remaining}&des=${encodeURIComponent(transferDes)}" alt="VietQR" /></div>
            <div class="qr-info">
              <div class="qr-title">Quét mã để thanh toán</div>
              <div class="qr-grid">
                <span>Ngân hàng:</span><span class="bold">${escapeHtml(settings.bank_id)}</span>
                <span>Số tài khoản:</span><span class="bold">${escapeHtml(settings.account_no)}</span>
                <span>Chủ tài khoản:</span><span class="bold">${escapeHtml((settings.account_name || ownerFullName).toUpperCase())}</span>
                <span>Số tiền:</span><span class="qr-money">${formatVND(remaining)} VNĐ</span>
              </div>
              <div class="qr-des">Nội dung: <span class="bold">${escapeHtml(transferDes)}</span></div>
            </div>
          </div>` : ''}
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
  new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

function getInvoiceLabel(invoice: Invoice): string {
  if (invoice.is_settlement) return 'Hóa đơn tất toán hợp đồng';
  if (invoice.billing_reason === 'deposit_refund') return 'Trả tiền cọc';
  if (invoice.billing_reason === 'deposit_collect' || isDepositOnlyInvoice(invoice)) return 'Thu tiền cọc';
  if (invoice.is_first_month) return 'Thu tiền tháng đầu tiên';
  if (invoice.billing_reason === 'contract_end') return 'Tất toán hợp đồng';
  return `Thu tiền tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`;
}

/** Lấy khoảng thời gian kỳ hóa đơn từ dữ liệu đã lưu */
function getBillingPeriod(invoice: Invoice, _room: Room | undefined): { start: string; end: string } | null {
  if (!invoice.billing_period_start || !invoice.billing_period_end) return null;
  const monthEnd = new Date(invoice.year, invoice.month, 0).toISOString().split('T')[0];
  const savedEnd = new Date(invoice.billing_period_end);
  const isMonthlyInvoice =
    !invoice.is_settlement &&
    !isDepositOnlyInvoice(invoice) &&
    invoice.billing_reason !== 'deposit_collect' &&
    invoice.billing_reason !== 'deposit_refund' &&
    invoice.billing_reason !== 'contract_end';
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

export const InvoicesTab: React.FC<{
  currentUser?: AppUser | null;
  openSePaySyncSignal?: number;
  onSePaySyncSignalHandled?: () => void;
}> = ({ currentUser, openSePaySyncSignal = 0, onSePaySyncSignalHandled }) => {
  const isAdmin = currentUser?.role === 'admin';
  const queryClient = useQueryClient();
  const { data: rooms = [] } = useQuery({ queryKey: ['rooms'], queryFn: getRooms });
  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['invoices'], queryFn: getInvoices });

  const { data: tenants = [] } = useQuery({ queryKey: ['tenants'], queryFn: getTenants });
  const { data: appSettings = {} } = useQuery({ queryKey: ['appSettings'], queryFn: getAppSettings });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [sortOrder, setSortOrder] = useState<'room_asc' | 'room_desc' | 'amount_desc' | 'newest'>('newest');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [showSePaySync, setShowSePaySync] = useState(false);

  useEffect(() => {
    if (openSePaySyncSignal > 0) {
      setShowSePaySync(true);
      onSePaySyncSignalHandled?.();
    }
  }, [openSePaySyncSignal, onSePaySyncSignalHandled]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkExportMessage, setBulkExportMessage] = useState('');

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
      queryClient.invalidateQueries({ queryKey: ['activeContracts'] });
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
  const [filters, setFilters] = useState({ paid: false, unpaid: true, partial: false, settlement: false, cancelled: false });

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

  const unpaidInvoicesToExport = useMemo(
    () =>
      monthInvoices.filter(
        (invoice) =>
          invoice.payment_status === 'unpaid' &&
          !invoice.is_settlement &&
          !isInvoiceExported(invoice)
      ),
    [monthInvoices]
  );

  const handleBulkExportUnpaid = async () => {
    if (bulkExporting) return;
    if (unpaidInvoicesToExport.length === 0) {
      setBulkExportMessage('Không có hóa đơn chưa thu nào cần xuất trong tháng này.')
      return
    }

    setBulkExporting(true)
    setBulkExportMessage('')
    let exported = 0
    let lastPath = ''

    try {
      const saveToDownloads = window.api.invoice.saveImageToDownloads
      if (typeof saveToDownloads !== 'function') {
        throw new Error('Chức năng xuất vào Downloads vừa được cập nhật. Vui lòng tắt app và mở lại để nạp bản mới.')
      }

      const logoSrc = await getImageDataUrl(logoNgang)
      const logoMarkSrc = await getImageDataUrl(logoMark)

      for (const invoice of unpaidInvoicesToExport) {
        const room = rooms.find((item) => item.id === invoice.room_id)
        const tenant = tenants.find((item) => item.id === invoice.tenant_id)
        const html = buildInvoiceDetailExportHtml(invoice, room, tenant, appSettings, logoSrc, logoMarkSrc)
        const roomName = (room?.name || 'phong').replace(/\s+/g, '-')
        const fileName = `hoa-don-${roomName}-T${String(invoice.month).padStart(2, '0')}-${invoice.year}.jpg`
        const result = await saveToDownloads({ html, fileName })
        if (!result.ok || !result.filePath) {
          throw new Error(result.error || `Không thể xuất hóa đơn ${room?.name || invoice.id}.`)
        }
        lastPath = result.filePath
        await updateInvoice(invoice.id, {
          note: appendInvoiceExportNote(invoice.note, result.filePath)
        })
        exported += 1
      }

      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setBulkExportMessage(`Đã xuất ${exported} hóa đơn chưa thu vào Downloads${lastPath ? ` (${lastPath})` : ''}.`)
    } catch (err) {
      setBulkExportMessage(err instanceof Error ? err.message : 'Không thể xuất hóa đơn hàng loạt.')
    } finally {
      setBulkExporting(false)
    }
  }

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
            <button
              onClick={() => setShowSePaySync(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium text-sm transition"
            >
              <i className="fa-solid fa-rotate"></i><span>Đồng bộ SePay</span>
            </button>
            <button
              onClick={handleBulkExportUnpaid}
              disabled={bulkExporting}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
              title="Xuất toàn bộ hóa đơn chưa thu của tháng đang chọn vào Downloads"
            >
              <i className="fa-solid fa-print"></i><span>{bulkExporting ? 'Đang xuất...' : 'Xuất HĐ'}</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium text-sm transition">
              <i className="fa-solid fa-file-export"></i><span>Xuất excel</span>
            </button>
          </div>
        </div>
        {bulkExportMessage && (
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-xs font-semibold text-emerald-700">
            <i className="fa-solid fa-circle-info mr-1.5"></i>
            {bulkExportMessage}
          </div>
        )}

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
                    <LogoLoading message="Đang tải hóa đơn..." className="min-h-[45vh]" />
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
                  const exported = isInvoiceExported(invoice);
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
                        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                          <i className="fa-regular fa-clock text-[9px]"></i>
                          {new Date(invoice.created_at).toLocaleString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </div>
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
                          <div>
                            <span className={`font-semibold tabular-nums ${depositAmt < 0 ? 'text-blue-600' : 'text-gray-700'}`}>
                              {depositAmt < 0 ? '-' : '+'}{formatVND(Math.abs(depositAmt))} đ
                            </span>
                            {isSettlement && depositAmt < 0 && (
                              <div className="text-[10px] text-blue-500 font-medium mt-0.5">Hoàn cọc</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">0 đ</span>
                        )}
                      </td>

                      {/* Cộng thêm / Giảm trừ */}
                      <td className="px-3 py-3 text-right">
                        {adjustmentAmt !== 0 ? (
                          <div>
                            <span className={`font-semibold tabular-nums ${adjustmentAmt < 0 ? 'text-red-500' : 'text-orange-600'}`}>
                              {adjustmentAmt < 0 ? '-' : '+'}{formatVND(Math.abs(adjustmentAmt))} đ
                            </span>
                            {isSettlement && adjustmentAmt > 0 && invoice.adjustment_note && (
                              <div className="text-[10px] text-orange-500 font-medium mt-0.5 max-w-[100px] truncate" title={invoice.adjustment_note}>{invoice.adjustment_note}</div>
                            )}
                          </div>
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
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="bg-orange-100 text-orange-600 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                              <i className="fa-solid fa-clock mr-1"></i>Chưa thu
                            </span>
                            {exported && (
                              <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">
                                <i className="fa-solid fa-file-export mr-1"></i>Đã xuất HĐ
                              </span>
                            )}
                          </div>
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
        const canEditInvoice = (invoice.payment_status === 'unpaid' && Number(invoice.paid_amount || 0) <= 0) || (isPaidMenu && isAdmin);
        const canDeleteInvoice = !isPaidMenu || isAdmin;
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
              onClick={() => {
                if (!canEditInvoice) return;
                setEditingInvoice(invoice);
                setOpenMenuId(null);
              }}
              disabled={!canEditInvoice}
              className={`flex w-full items-center gap-2 px-4 py-2 font-semibold ${canEditInvoice ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 cursor-not-allowed'}`}
              title={canEditInvoice ? 'Sửa hóa đơn' : 'Đã thu tiền — chỉ admin mới sửa được'}
            >
              <i className="fa-solid fa-pen-to-square w-4"></i>
              {canEditInvoice ? 'Sửa hóa đơn' : 'Đã khóa'}
            </button>
            <button
              onClick={() => {
                if (!canDeleteInvoice) return;
                setDeletingId(invoice.id); setDeleteError(null); setOpenMenuId(null);
              }}
              disabled={!canDeleteInvoice}
              className={`flex w-full items-center gap-2 px-4 py-2 font-semibold ${canDeleteInvoice ? 'text-red-600 hover:bg-red-50' : 'text-gray-400 cursor-not-allowed'}`}
              title={canDeleteInvoice ? 'Hủy phiếu thu' : 'Đã thu tiền — chỉ admin mới hủy được'}
            >
              <i className="fa-solid fa-ban w-4"></i>
              {canDeleteInvoice ? 'Hủy phiếu' : 'Đã khóa'}
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

      {showSePaySync && (
        <SePaySyncModal
          apiToken={appSettings?.sepay_api_token ?? ''}
          invoices={invoices}
          rooms={rooms}
          onClose={() => setShowSePaySync(false)}
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
