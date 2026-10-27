const fs = require('node:fs')
const path = require('node:path')
const { loadTs } = require('./load-email-test-module.cjs')
const { contractEmailHtml } = loadTs('src/shared/contract-email-template.ts')
const { cancellationEmailHtml } = loadTs('src/shared/contract-cancellation-email.ts')
const { buildMonthlyPaymentReminder } = loadTs('src/shared/notification-email-layout.ts')
const { renderServerEmail } = loadTs('supabase/functions/_shared/email-renderer.ts')
const { notificationEmailPreviewHtml } = loadTs('src/shared/notification-email-assets.ts')
const defs = require('./notification-demo-definitions.json')
const out = path.resolve('docs/email-automation/approved-templates')
fs.mkdirSync(out, { recursive: true })
// Synthetic fixtures only. This script has no database, credentials or mail transport.
const invoice = { id: 'synthetic-invoice', room_id: 'synthetic-room', month: 10, year: 2026,
  room_cost: 2400000, electric_cost: 14000, water_cost: 0, wifi_cost: 50000, garbage_cost: 70000,
  total_amount: 2534000, paid_amount: 2534000, due_date: '2026-10-05' }
const room = { name: 'Phòng 221', old_debt: 850000 }
const now = new Date('2026-10-09T03:00:00Z')
const contract = { tenantName: 'Nguyễn Minh Anh', room: 'Phòng 999', moveInDate: '2026-10-09', url: 'https://example.invalid/contract-confirmation#token=synthetic-only' }
function receipt(audience, partial = false) {
  const snapshot = { ...invoice, paid_amount: partial ? 1000000 : invoice.total_amount }
  return renderServerEmail({ event_type: 'sepay_matched', audience,
    recipient_name: audience === 'tenant' ? 'Nguyễn Minh Anh' : 'Chủ nhà',
    payload: { invoice: snapshot, record: { amount: snapshot.paid_amount }, roomName: room.name, transactionKey: 'GD-MAU-221-1009' }
  }, snapshot, room, now).html
}
function review(reviewStatus) {
  return renderServerEmail({ event_type: 'sepay_unmatched', recipient_name: 'Chủ nhà',
    payload: { reviewStatus, amount: reviewStatus === 'partial' ? 2000000 : 3000000,
      roomName: room.name, transactionKey: 'GD-MAU-221-1009', content: 'NOI DUNG MINH HOA' }
  }, { ...invoice, paid_amount: 0 }, room, now).html
}
function reminder(event_type, inv = { ...invoice, paid_amount: 0 }, dueDate = inv?.due_date) {
  return renderServerEmail({ event_type, recipient_name: 'Chủ nhà', payload: { roomName: room.name, dueDate } }, inv, room, now).html
}
const htmls = [contractEmailHtml(contract), receipt('tenant'), receipt('landlord'),
  review('unmatched'), review('partial'), review('over'), review('ambiguous'), receipt('tenant', true),
  reminder('invoices_services'), reminder('rent_overdue'), reminder('rent_long_unpaid', undefined, '2026-08-01'),
  reminder('rent_overdue', null), reminder('room_checkout_due', null, '2026-10-09'),
  reminder('contract_expiring', null, '2026-10-16'),
  buildMonthlyPaymentReminder({ tenantName: 'Nguyễn Minh Anh', room: room.name, period: '10/2026' }),
  contractEmailHtml({ ...contract, amendment: true }),
  cancellationEmailHtml({ tenant_name: 'Nguyễn Minh Anh', room_name: room.name, reason: 'Lập nhầm hợp đồng. Dữ liệu minh họa.', cancelled_at: now.toISOString(), contract_id: 'HD-MAU-221' })]
const manifest = defs.map((d, i) => {
  const html = htmls[i]
  if (!html.includes(`cid:${d.id}@ankhanghome`)) throw new Error(`Wrong business template: ${d.id}`)
  fs.writeFileSync(path.join(out, d.id + '.outbound.html'), html)
  fs.writeFileSync(path.join(out, d.id + '.html'), `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${d.name}</title><body style="margin:0">${notificationEmailPreviewHtml(html)}</body></html>`)
  return { id: d.id, name: d.name, cid: d.id + '@ankhanghome', synthetic: true }
})
const links = defs.map(d => `<li><a href="${d.id}.html">${d.name}</a> · <a href="?template=${d.id}&mobile=1">320px</a></li>`).join('')
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="vi"><meta charset="utf-8"><title>17 mẫu email đã áp dụng</title><body style="font-family:Arial;margin:24px"><h1>17 mẫu email đã áp dụng</h1><p>Dữ liệu minh họa, không gửi email.</p><ol>${links}</ol><script>const q=new URLSearchParams(location.search);if(q.get('template')){document.body.innerHTML='<iframe title="Email ở màn hình nhỏ" style="border:1px solid #ddd;width:320px;height:1500px" src="'+q.get('template')+'.html"></iframe>';}</script></body></html>`)
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('Generated 17 business-renderer previews with synthetic fixtures only.')
