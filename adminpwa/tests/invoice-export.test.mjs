import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
async function load(name) {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL(`../src/renderer/src/lib/${name}.ts`, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const selection = await load('invoice-export-selection')
const renderer = await load('invoice-export')
const invoice = { id: 'invoice-20261009-demo', room_id: 'r1', tenant_id: 't1', month: 10, year: 2026, created_at: '2026-10-09', invoice_date: '2026-10-09', billing_period_start: '2026-10-01', billing_period_end: '2026-10-31', room_cost: 2900000, electric_cost: 350000, water_cost: 100000, wifi_cost: 50000, garbage_cost: 20000, old_debt: 0, total_amount: 3420000, paid_amount: 0, payment_status: 'unpaid' }
test('room and invoice must both be explicitly selected', () => {
  for (const ids of [['',''], ['r1',''], ['',invoice.id]]) assert.throws(() => selection.selectedExportInvoice([invoice], ...ids))
})
test('selection cannot export another room or an unknown invoice', () => {
  assert.throws(() => selection.selectedExportInvoice([invoice], 'r2', invoice.id))
  assert.throws(() => selection.selectedExportInvoice([invoice], 'r1', 'missing'))
})
test('two invoices in one room require choosing exact invoice', () => {
  const second = { ...invoice, id: 'second', billing_reason: 'deposit_collect' }
  assert.equal(selection.selectedExportInvoice([invoice, second], 'r1', 'second'), second)
})
test('cancelled or merged invoices cannot be exported', () => {
  for (const payment_status of ['cancelled', 'merged']) assert.throws(() => selection.selectedExportInvoice([{ ...invoice, payment_status }], 'r1', invoice.id))
})
test('paid, partial and settlement documents remain available without changing status', () => {
  for (const payment_status of ['paid','partial','unpaid']) {
    const record = { ...invoice, payment_status, is_settlement: true }
    assert.deepEqual(selection.exportableInvoices([record]), [record])
  }
})
test('standalone export uses full width, self contained styles and escaped fields', () => {
  const html = renderer.buildInvoiceDetailExportHtml(invoice, { name: '<script>x</script>', base_rent: 2900000 }, { full_name: '<img onerror=bad>', phone: '' }, { property_address: 'Test' }, 'data:image/png;base64,AA', 'data:image/png;base64,AA')
  assert.match(html, /width: 768px; max-width: none/)
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/)
  assert.match(html, /3\.420\.000/)
  assert.match(html, /Thành tiền/)
  assert.doesNotMatch(html, /<script>|onerror=bad>/)
})
test('monthly end dates do not shift to previous day in GMT+7', () => {
  const html = renderer.buildInvoiceDetailExportHtml({ ...invoice, billing_period_end: '2026-10-20' }, undefined, undefined, {}, '', '')
  assert.match(html, /31\/10\/2026/)
})
test('browser capture resets centered margins and captures explicit dimensions', async () => {
  const code = await readFile(new URL('../src/renderer/src/platform/export-image.ts', import.meta.url), 'utf8')
  assert.match(code, /style: \{ margin: '0', transform: 'none' \}/)
  assert.match(code, /width, height, pixelRatio: 2/)
  assert.match(code, /iframe\.sandbox\.add\('allow-same-origin'\)/)
  assert.match(code, /script-src \\'none\\'/)
})
test('download does not change invoice notes or mark payment', async () => {
  const code = await readFile(new URL('../src/renderer/src/components/InvoicesTab.tsx', import.meta.url), 'utf8')
  const handler = code.slice(code.indexOf('const handleExportSelectedInvoice'), code.indexOf('\n  return (', code.indexOf('const handleExportSelectedInvoice')))
  assert.doesNotMatch(handler, /updateInvoice|recordPayment|appendInvoiceExportNote/)
  assert.match(handler, /selectedExportInvoice\(latest, roomId, invoiceId\)/)
})
test('detail and list use the same standalone invoice template', async () => {
  const code = await readFile(new URL('../src/renderer/src/components/InvoiceDetailModal.tsx', import.meta.url), 'utf8')
  assert.match(code, /buildInvoiceDetailExportHtml/)
  assert.doesNotMatch(code, /content\.innerHTML/)
})
