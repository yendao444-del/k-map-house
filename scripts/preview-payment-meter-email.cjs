// Synthetic fixture rendered by the actual server template. No mail is sent.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { loadTs } = require('./load-email-test-module.cjs')
const { renderServerEmail } = loadTs('supabase/functions/_shared/email-renderer.ts')
const { notificationEmailPreviewHtml } = loadTs('src/shared/notification-email-assets.ts')
const dir = path.resolve('docs/email-automation/payment-meter-details')
fs.mkdirSync(dir, { recursive: true })
const invoice = { month: 10, year: 2026, room_cost: 2200000,
  electric_old: 1245, electric_new: 1387, electric_usage: 142,
  electric_price_snapshot: 3200, electric_cost: 454400,
  water_old: 98, water_new: 103, water_usage: 5, water_price_snapshot: 21000, water_cost: 105000,
  wifi_cost: 50000, garbage_cost: 100000, total_amount: 2909400, paid_amount: 2909400 }
const mail = renderServerEmail({ event_type: 'sepay_matched', audience: 'landlord', recipient_name: 'Chủ nhà',
  payload: { invoice, record: { amount: 2909400 }, roomName: 'Phòng 261',
    transactionKey: '9e2bb9da-8c1c-4566-994b-18a82a028e3b' } })
fs.writeFileSync(path.join(dir, 'outbound.html'), mail.html)
fs.writeFileSync(path.join(dir, 'outbound.txt'), mail.text)
const html = '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hóa đơn có chỉ số điện nước</title><body style="margin:0">' + notificationEmailPreviewHtml(mail.html) + '</body></html>'
fs.writeFileSync(path.join(dir, 'index.html'), html)
http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html) })
  .listen(4188, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4188'))
