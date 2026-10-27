const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadTs } = require('./load-email-test-module.cjs')
const { renderServerEmail } = loadTs('supabase/functions/_shared/email-renderer.ts')
const { getInvoiceEmailSnapshot } = loadTs('src/renderer/src/lib/payment-success-email.ts')

const invoice = {
  month: 10, year: 2026, room_cost: 2200000,
  electric_old: 1245, electric_new: 1387, electric_usage: 142,
  electric_price_snapshot: 3200, electric_cost: 454400,
  water_old: 98, water_new: 103, water_usage: 5,
  water_price_snapshot: 21000, water_cost: 105000,
  wifi_cost: 50000, garbage_cost: 100000, total_amount: 2909400, paid_amount: 2909400
}
const receipt = (snapshot, current = snapshot) => renderServerEmail({
  event_type: 'sepay_matched', recipient_name: 'Chủ nhà',
  payload: { invoice: snapshot, record: { amount: 2909400 }, roomName: 'Phòng 261', transactionKey: 'TEST-261' }
}, current)

test('landlord receipt renders stored readings, units and price in HTML and plain text', () => {
  const before = JSON.stringify(invoice)
  const mail = receipt(invoice, { ...invoice, electric_new: 9999, electric_price_snapshot: 9000 })
  for (const content of [mail.html, mail.text]) {
    for (const text of ['Chỉ số đầu kỳ: 1.245 kWh', 'Chỉ số cuối kỳ: 1.387 kWh',
      'Sử dụng: 142 kWh', 'Đơn giá: 3.200 đ/kWh', 'Chỉ số đầu kỳ: 98 m³',
      'Chỉ số cuối kỳ: 103 m³', 'Sử dụng: 5 m³', 'Đơn giá: 21.000 đ/m³',
      '454.400 đ', '105.000 đ', '2.909.400 đ']) assert.ok(content.includes(text), text)
    assert.doesNotMatch(content, /9\.999|9\.000 đ\/kWh|undefined|NaN/)
  }
  assert.equal(JSON.stringify(invoice), before)
  assert.doesNotMatch(mail.html, /<a\b|<script\b/)
})

test('old invoices show missing readings/rates explicitly without borrowing current room data', () => {
  const old = { ...invoice, electric_old: null, electric_new: undefined, electric_usage: undefined,
    electric_price_snapshot: null, water_old: undefined, water_new: undefined, water_usage: undefined,
    water_price_snapshot: undefined }
  const mail = receipt(old)
  assert.match(mail.text, /Chỉ số đầu kỳ: Chưa có dữ liệu/)
  assert.match(mail.text, /Đơn giá: Chưa có dữ liệu/)
  assert.doesNotMatch(mail.text, /undefined|NaN|Infinity/)
  assert.match(mail.text, /454\.400 đ/)
  assert.equal(getInvoiceEmailSnapshot(old).invoiceTotal, 2909400)
})

test('zero readings and decimal water consumption remain valid, stored amounts are authoritative', () => {
  const snapshot = getInvoiceEmailSnapshot({ ...invoice, water_old: 0, water_new: 0.75,
    water_usage: 0.75, water_price_snapshot: 21000, water_cost: 15751 })
  const line = snapshot.invoiceLines.find(l => l.label === 'Tiền nước')
  assert.deepEqual(line.details, [['Chỉ số đầu kỳ', '0 m³'], ['Chỉ số cuối kỳ', '0,75 m³'],
    ['Sử dụng', '0,75 m³'], ['Đơn giá', '21.000 đ/m³']])
  assert.equal(line.amount, 15751) // Never replace a stored charge with a calculated product.
})

test('transfer invoice separates previous room usage from new room readings', () => {
  const snapshot = getInvoiceEmailSnapshot({ ...invoice, has_transfer: true,
    transfer_old_room_name: '101', transfer_electric_cost: 32000, transfer_electric_usage: 10,
    transfer_water_cost: 21000, transfer_water_usage: 1 })
  assert.deepEqual(snapshot.invoiceLines.find(l => l.label === 'Tiền điện phòng cũ').details,
    [['Sử dụng', '10 kWh']])
  assert.ok(snapshot.invoiceLines.find(l => l.label === 'Tiền điện').details.some(([label, value]) =>
    label === 'Chỉ số đầu kỳ' && value === '1.245 kWh'))
})
