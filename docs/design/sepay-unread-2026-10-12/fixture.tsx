import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SePaySyncModal } from '../../../adminpwa/src/renderer/src/components/SePaySyncModal'
import { loadSepayReadKeys, sepayReadStorageKey } from '../../../adminpwa/src/renderer/src/lib/sepay-read-state'
import { buildInvoiceTransferDescription } from '../../../adminpwa/src/renderer/src/lib/invoiceTransfer'
import type { Invoice, Room } from '../../../adminpwa/src/renderer/src/lib/db'

export const QA_USER = 'sepay-read-visual-fixture'
const query = new URLSearchParams(location.search)
const rooms = [
  ['151', 'Nguyễn An', '0900000001'],
  ['361', 'Trần Bình', '0900000002'],
  ['162', 'Lê Chi', '0900000003']
].map(([id, tenant_name, tenant_phone]) => ({ id, name: `Phòng ${id}`, tenant_name, tenant_phone })) as Room[]
const amounts = [3551000, 2350000, 2800000]
const invoices = rooms.map((room, index) => ({
  id: `fixture-invoice-${room.id}`, room_id: room.id, month: 10, year: 2026,
  total_amount: amounts[index], paid_amount: amounts[index], payment_status: 'paid'
})) as Invoice[]
export const fixtureTransactions = rooms.map((room, index) => ({
  id: `fixture-tx-${room.id}`, reference_number: `DEMO-P${room.id}-1012`,
  amount_in: String(amounts[index]), transaction_content: buildInvoiceTransferDescription(invoices[index], room.name),
  transaction_date: ['2026-10-12 13:34:40', '2026-10-12 11:08:12', '2026-10-11 16:25:03'][index],
  bank_brand_name: 'BIDV', account_number: '•••• 2931'
}))
// Touch only the named, fictional QA user's read markers. No real bank calls.
if (!localStorage.getItem(sepayReadStorageKey(QA_USER))) {
  localStorage.setItem(sepayReadStorageKey(QA_USER), JSON.stringify(['id:fixture-tx-162']))
}
if (query.get('state') === 'unmatched') fixtureTransactions[0].transaction_content = 'DEMO chưa khớp hóa đơn'
if (query.get('state') === 'pending') { invoices[0].payment_status = 'unpaid'; invoices[0].paid_amount = 0 }
if (query.get('state') === 'many') {
  for (let index = 0; index < 12; index++) fixtureTransactions.push({
    ...fixtureTransactions[0], id: `fixture-extra-${index}`, reference_number: `DEMO-EXTRA-${index}`
  })
}

function Fixture() {
  const [open, setOpen] = useState(true)
  const [version, setVersion] = useState(0)
  return <main className="min-h-screen bg-slate-100 p-6 text-slate-800">
    <h1 className="text-xl font-bold">AN KHANG HOME · Kiểm tra SePay</h1>
    <p className="mt-2 text-sm">Dữ liệu giả lập · Không kết nối ngân hàng hoặc ghi nhận tiền</p>
    <button className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => setOpen(true)}>Mở bảng SePay</button>
    <button className="ml-3 rounded-lg bg-white px-4 py-2" onClick={() => {
      localStorage.setItem(sepayReadStorageKey(QA_USER), JSON.stringify(['id:fixture-tx-162']))
      setVersion(value => value + 1)
    }}>Khôi phục trạng thái demo</button>
    <p className="mt-3 text-xs">Đã xem trên thiết bị: {loadSepayReadKeys(QA_USER).length}</p>
    {open && <SePaySyncModal key={version} invoices={invoices} rooms={rooms} userId={QA_USER} onClose={() => setOpen(false)} />}
  </main>
}

createRoot(document.getElementById('qa-root')!).render(
  <QueryClientProvider client={new QueryClient()}><Fixture /></QueryClientProvider>
)
