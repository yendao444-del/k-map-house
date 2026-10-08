// Local preview of the actual email builder. This never imports DB or Gmail senders.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
function load(file) {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  new Function('require', 'exports', code)(name => {
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'))
    return require(name)
  }, exports)
  return exports
}
const { buildSepayEmail } = load(path.join(root, 'src/renderer/src/lib/sepay-email.ts'))
const { getInvoiceEmailSnapshot } = load(path.join(root, 'src/renderer/src/lib/payment-success-email.ts'))
const { paymentEmailPreviewHtml } = load(path.join(root, 'src/shared/payment-email-assets.ts'))
const invoice = {
  room_cost: 2500000, electric_cost: 250000, water_cost: 100000, wifi_cost: 100000,
  garbage_cost: 50000, total_amount: 3000000, paid_amount: 3000000
}
const base = {
  type: 'sepay_matched', recipientName: 'Đào Bình Yên', roomName: 'Phòng 101',
  transactionKey: 'TEST-BANK-101', month: 10, year: 2026, amount: 3000000, remaining: 0
}
const fixtures = {
  'preview.html': { ...base, ...getInvoiceEmailSnapshot(invoice) },
  'partial.html': { ...base, month: 9, amount: 1000000, remaining: 2000000,
    ...getInvoiceEmailSnapshot({ ...invoice, paid_amount: 1000000 }) },
  'settlement.html': { ...base, recipientName: 'Nguyễn Thị Thanh & Gia đình',
    transactionKey: 'TEST-BANK-101-REFERENCE-LONG-0123456789012345678901234567890123456789',
    amount: 1200000, remaining: 0,
    ...getInvoiceEmailSnapshot({ ...invoice, old_debt: 500000, merged_debt_total: 1000000,
      deposit_amount: -2000000, adjustment_amount: 200000, adjustment_note: 'Chi phí sửa chữa',
      total_amount: 2700000, paid_amount: 2700000 }) }
}
for (const [filename, event] of Object.entries(fixtures)) {
  const mail = buildSepayEmail(event)
  fs.writeFileSync(path.join(__dirname, filename), `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${mail.subject}</title><style>body{margin:0;background:#fff}</style></head><body>${paymentEmailPreviewHtml(mail.html)}</body></html>`)
}
if (process.argv.includes('--serve')) {
  const server = http.createServer((request, response) => {
    const filename = new URL(request.url, 'http://127.0.0.1').pathname.slice(1) || 'preview.html'
    if (!(filename in fixtures)) { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(fs.readFileSync(path.join(__dirname, filename)))
  })
  server.listen(4186, '127.0.0.1', () => console.log('Email preview: http://127.0.0.1:4186/preview.html'))
}
