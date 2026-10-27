import { useState } from 'react'
import { MobileInvoiceCard } from '../components/MobileInvoiceCard'
import type { Invoice } from '../lib/db'
import type { Room, AppSettings } from '../lib/db'
import { InvoiceToolbar } from '../components/InvoiceToolbar'
import { InvoiceExportPicker } from '../components/InvoiceExportPicker'
import { InvoiceDetailModal } from '../components/InvoiceDetailModal'
import { selectedExportInvoice } from '../lib/invoice-export-selection'
import { buildInvoiceDetailExportHtml, getImageDataUrl } from '../lib/invoice-export'
import { invoiceImage } from '../platform/export-image'
import logo from '../assets/an_khang_home_logo_ngang.png'
import mark from '../assets/an_khang_home_logo.png'

// No Auth, queries, payment mutation, contracts, emails or customer records.
// Renders the same card component as InvoicesTab with synthetic fixtures only.
const base = { month: 10, year: 2026, created_at: '2026-10-09T02:00:00Z', invoice_date: '2026-10-09', billing_period_start: '2026-10-01', billing_period_end: '2026-10-31', room_cost: 2900000, electric_cost: 350000, electric_old: 100, electric_new: 200, electric_usage: 100, water_cost: 100000, water_old: 10, water_new: 20, water_usage: 10, wifi_cost: 50000, garbage_cost: 20000, old_debt: 0, total_amount: 3420000, paid_amount: 0, payment_status: 'unpaid' } as Invoice
const cases = [
  { ...base, id: 'fixture-refund', room_id: '151', total_amount: -500000, room_cost: 0, electric_cost: 0, water_cost: 0, wifi_cost: 0, garbage_cost: 0, deposit_amount: -500000, billing_reason: 'deposit_refund' },
  { ...base, id: 'fixture-partial-refund', room_id: '152', total_amount: -500000, paid_amount: -200000, payment_status: 'partial', is_settlement: true },
  { ...base, id: 'fixture-unpaid', room_id: '161' },
  { ...base, id: 'fixture-second-invoice', room_id: '161', billing_reason: 'deposit_collect', room_cost: 0, total_amount: 1000000, deposit_amount: 1000000 },
  { ...base, id: 'fixture-confirmed', room_id: '221', debt_confirmed_at: '2026-10-08' },
  { ...base, id: 'fixture-merged', room_id: '222', payment_status: 'merged' },
  { ...base, id: 'fixture-cancelled', room_id: '231', payment_status: 'cancelled' },
  { ...base, id: 'fixture-refunded', room_id: '232', total_amount: -500000, paid_amount: -500000, payment_status: 'paid' }
] as Invoice[]
const rooms = [...new Set(cases.map(item => item.room_id))].map(id => ({ id, name: `Phòng ${id}`, base_rent: 2900000 })) as Room[]
const settings = { property_address: 'Địa chỉ thử nghiệm', property_owner_name: 'Chủ nhà thử nghiệm', bank_id: 'BIDV', account_no: '123456789', account_name: 'TAI KHOAN THU NGHIEM' } as AppSettings

export default function InvoiceVisualHarness() {
  const [notice, setNotice] = useState('')
  const [picker, setPicker] = useState(false)
  const [view, setView] = useState<Invoice | null>(null)
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const exportFixture = async (roomId: string, invoiceId: string) => {
    setBusy(true); setError('')
    try {
      const invoice = selectedExportInvoice(cases, roomId, invoiceId)
      const html = buildInvoiceDetailExportHtml(invoice, rooms.find(room => room.id === roomId), { full_name: 'Khách thử nghiệm', phone: '' }, settings, await getImageDataUrl(logo), await getImageDataUrl(mark))
      const file = await invoiceImage({ html, fileName: `${invoice.id}.png` })
      if (image) URL.revokeObjectURL(image)
      setImage(URL.createObjectURL(file)); setPicker(false)
    } catch (error) { setError(String(error)) } finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-[#f8fbfa] p-3">
    <InvoiceToolbar onExport={() => setPicker(true)} onSync={() => setNotice('Đồng bộ — QA không kết nối ngân hàng')} busy={busy} settingsLoading={false} />
    {picker && <InvoiceExportPicker invoices={cases} rooms={rooms} period="Kỳ 10/2026" loading={false} busy={busy} error={error} onClose={() => setPicker(false)} onExport={(room, invoice) => void exportFixture(room, invoice)} />}
    {image && <section><h2>Ảnh xuất thật từ bộ tạo ảnh</h2><img alt="Hóa đơn xuất thử nghiệm" src={image} className="w-full" /><button type="button" onClick={() => { URL.revokeObjectURL(image); setImage('') }}>Đóng ảnh xuất</button></section>}
    {view && <InvoiceDetailModal invoice={view} room={rooms.find(room => room.id === view.room_id)} settings={settings} tenantName="Khách thử nghiệm" onClose={() => setView(null)} />}
    <h1 className="mb-1 text-lg font-bold text-slate-900">Hóa đơn — kiểm tra mobile</h1>
    <p className="mb-3 text-xs text-slate-500">Dữ liệu giả lập · Không ghi nhận tiền hoặc gửi thư</p>
    <div className="space-y-3">{cases.map(invoice => <MobileInvoiceCard key={invoice.id} invoice={invoice} roomName={`Phòng ${invoice.room_id}`} tenantName="Khách thuê thử nghiệm tên dài để kiểm tra xuống dòng" label={invoice.is_settlement ? 'Hóa đơn tất toán hợp đồng' : invoice.billing_reason === 'deposit_refund' ? 'Trả tiền cọc' : 'Thu tiền tháng 10/2026'} onView={() => setView(invoice)} onPay={() => setNotice(`Mở thao tác tiền ${invoice.room_id} — fixture không ghi dữ liệu`)} onMenu={() => setNotice(`Menu ${invoice.room_id} — callback fixture, không kiểm chứng menu thật`)} />)}</div>
    {notice && <section role="dialog" aria-label="Thao tác thử nghiệm" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"><div className="rounded-xl bg-white p-5"><p className="text-sm">{notice}</p><button type="button" onClick={() => setNotice('')} className="mt-4 min-h-11 rounded-lg bg-primary px-4 text-white">Đóng</button></div></section>}
  </main>
}
