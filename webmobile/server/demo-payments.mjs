import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import { demoMeterContexts, assessReading } from '../src/meter-policy.mjs'
import { buildInvoiceTransferDescription, normalizeTransferText, createInvoiceTransferIndex, findInvoiceTransferMatches, numberToWords } from './electron-transfer-adapter.mjs'
import { fetchBankQr } from './payment-recipient.mjs'

// Contracts/rates stay synthetic; recipient/property settings may be supplied by Electron.
const contracts = {
  'demo-current-101': { room: '101', name: 'Nguyễn Minh Anh', month: 9, year: 2026 },
  'demo-current-102': { room: '102', name: 'Trần Hoài Nam', month: 10, year: 2026 }
}
const rates = { rent: 3_000_000, electric: 3500, water: 10_000, wifi: 50_000, garbage: 30_000 }
const bank = { name: 'SePay mô phỏng', account: 'DEMO-KHONG-CHUYEN-TIEN', owner: 'AN KHANG HOME · DEMO' }
const error = (message, status = 400) => Object.assign(new Error(message), { status })

export function createDemoPaymentStore({ confirmedReading, now = Date.now, snapshot, paymentBank, qrFetcher = fetch, propertyInfo = {} }) {
  const recipient = paymentBank || bank
  const qrKind = paymentBank ? 'bank' : 'demo'
  async function prepareQr(invoice) {
    invoice.qr = paymentBank ? await fetchBankQr(recipient, Math.max(0, invoice.total_amount - invoice.paid_amount), invoice.transferContent, qrFetcher) : await QRCode.toDataURL(`ANKHANGHOME-DEMO:${invoice.id}:${invoice.total_amount}`, { width: 256, margin: 2 })
    invoice.recipient = { ...recipient }; invoice.qrKind = qrKind
  }
  const invoices = new Map(), periods = new Map(), seen = new Set(snapshot?.seen || []), queue = []
  for (const saved of snapshot?.invoices || []) {
    const invoice = { ...saved, qrReady: Promise.resolve() }
    invoice.details = { ...invoice.details, ...propertyInfo }
    if (saved.qrKind !== qrKind || JSON.stringify(saved.recipient) !== JSON.stringify(recipient)) invoice.qrReady = prepareQr(invoice)
    invoices.set(invoice.id, invoice)
    periods.set(`${invoice.contractId}:${invoice.year}-${invoice.month}`, invoice)
  }
  for (const item of snapshot?.queue || []) {
    const invoice = invoices.get(item.invoiceId)
    if (invoice) queue.push({ ...item, invoice })
  }
  const publicInvoice = invoice => ({ id: invoice.id, contractId: invoice.contractId, room: invoice.room, tenantName: invoice.tenantName, month: invoice.month, year: invoice.year, status: invoice.status, total: invoice.total_amount, paid: invoice.paid_amount, remaining: Math.max(0, invoice.total_amount - invoice.paid_amount), transferContent: invoice.transferContent, qr: invoice.qr, qrKind: invoice.qrKind, lines: invoice.lines, readings: invoice.readings, notice: invoice.notice, receipt: invoice.receipt, bank: recipient, details: { ...invoice.details, paid_amount: invoice.paid_amount, payment_status: invoice.status === 'paid' ? 'paid' : 'unpaid', payment_date: invoice.receipt?.date || null, payment_method: invoice.receipt ? 'transfer' : null, payment_records: invoice.receipt ? [{ id: invoice.receipt.id, amount: invoice.receipt.amount, payment_method: 'transfer', payment_date: invoice.receipt.date, created_at: invoice.receipt.date, external_ref: invoice.receipt.transactionRef, external_id: invoice.receipt.id, source: 'sepay_demo', note: 'Giao dịch mô phỏng'  }] : [] }, demo: true })
  function authorize(id, token) {
    const invoice = invoices.get(id)
    if (!invoice || !token || invoice.accessToken !== token) throw error('Không tìm thấy hóa đơn demo của phiên này.', 404)
    return invoice
  }
  function reconcile(transaction) {
    const keys = [transaction.reference_number, transaction.id].filter(value => value !== undefined && value !== null && value !== '').map(value => normalizeTransferText(String(value))).filter(Boolean)
    if (!keys.length || transaction.account_number !== recipient.account || !Number.isSafeInteger(Number(transaction.amount_in)) || Number(transaction.amount_in) <= 0 || Number(transaction.amount_out || 0) !== 0) return { status: 'ignored' }
    if (keys.some(key => seen.has(key))) return { status: 'duplicate' }
    keys.forEach(key => seen.add(key))
    const all = [...invoices.values()]
    const index = createInvoiceTransferIndex(all, roomId => all.find(x => x.room_id === roomId)?.room)
    const matches = findInvoiceTransferMatches(index, transaction.transaction_content || '')
    if (matches.length !== 1) return { status: matches.length ? 'ambiguous' : 'unmatched' }
    const invoice = matches[0]
    if (invoice.status === 'paid') return { status: 'already_paid' }
    const amount = Number(transaction.amount_in), remaining = invoice.total_amount - invoice.paid_amount
    if (amount !== remaining) {
      invoice.status = 'review'; invoice.notice = amount < remaining ? 'Giao dịch demo đúng mã nhưng thiếu tiền. Chưa xác nhận thanh toán; cần đối soát.' : 'Giao dịch demo đúng mã nhưng thừa tiền. Chưa xác nhận thanh toán; cần đối soát.'
      return { status: amount < remaining ? 'partial' : 'over' }
    }
    invoice.paid_amount += amount; invoice.status = 'paid'; invoice.notice = 'Đã khớp giao dịch SePay demo.'
    invoice.receipt = { id: `DEMO-${transaction.id}`, transactionRef: transaction.reference_number || transaction.id, date: new Date(now()).toISOString(), amount }
    return { status: 'paid' }
  }
  function drain() {
    for (const item of queue.splice(0)) {
      if (item.at > now()) { queue.push(item); continue }
      const result = reconcile(item.transaction)
      if (['unmatched', 'ambiguous'].includes(result.status) && item.invoice.status !== 'paid') { item.invoice.status = 'review'; item.invoice.notice = 'Giao dịch demo chưa khớp mã hóa đơn. Chưa xác nhận thanh toán; cần đối soát.' }
    }
  }
  return {
    async ready() { await Promise.all([...invoices.values()].map(invoice => invoice.qrReady)) },
    snapshot() {
      return { invoices: [...invoices.values()].map(({ qrReady, ...invoice }) => invoice), seen: [...seen], queue: queue.map(({ invoice, ...item }) => ({ ...item, invoiceId: invoice.id })) }
    },
    async create({ contractId, electricToken, waterToken }) {
      const contract = contracts[contractId]
      if (!contract) throw error('Hợp đồng demo không hợp lệ.')
      const electric = confirmedReading(electricToken), water = confirmedReading(waterToken)
      if (![electric, water].every(x => x && x.contractId === contractId && x.expiresAt > now()) || electric.meter !== 'electric' || water.meter !== 'water') throw error('Cần xác nhận ảnh điện và nước hợp lệ trước khi lập hóa đơn.')
      const contexts = demoMeterContexts[contractId]
      const electricity = assessReading(electric.reading, 'electric', contexts.electric), waterUse = assessReading(water.reading, 'water', contexts.water)
      if (electricity.status !== 'pass' || waterUse.status !== 'pass') throw error('Chỉ số cần kiểm tra trước khi lập hóa đơn.')
      const key = `${contractId}:${contract.year}-${contract.month}`
      const existing = periods.get(key)
      if (existing) {
        if (existing.readings.electric.new !== electric.reading || existing.readings.water.new !== water.reading) throw error('Kỳ này đã có hóa đơn demo. Không thay chỉ số của hóa đơn đã lập.', 409)
        await existing.qrReady
        return { invoice: publicInvoice(existing), accessToken: existing.accessToken }
      }
      if (invoices.size >= 100) throw error('Phiên demo đã đạt giới hạn. Khởi động lại server để làm mới.', 429)
      const dateKey = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const periodStart = dateKey(contract.year, contract.month, 1), periodEnd = dateKey(contract.year, contract.month, new Date(Date.UTC(contract.year, contract.month, 0)).getUTCDate())
      const dueDate = new Date(Date.UTC(contract.year, contract.month, 5)).toISOString().slice(0, 10)
      const lines = [{ label: 'Tiền phòng', detail: '3.000.000đ / tháng', amount: rates.rent }, { label: 'Tiền điện', detail: electricity.usage === null ? 'Bàn giao · chưa phát sinh' : `${electricity.usage} kWh × ${rates.electric.toLocaleString('vi-VN')}đ`, amount: (electricity.usage || 0) * rates.electric }, { label: 'Tiền nước', detail: waterUse.usage === null ? 'Bàn giao · chưa phát sinh' : `${waterUse.usage} m³ × ${rates.water.toLocaleString('vi-VN')}đ`, amount: (waterUse.usage || 0) * rates.water }, { label: 'Internet / WiFi', detail: 'Phí tháng · dữ liệu mẫu', amount: rates.wifi }, { label: 'Phí vệ sinh', detail: 'Phí tháng · dữ liệu mẫu', amount: rates.garbage }, { label: 'Nợ kỳ trước', detail: 'Thuộc hợp đồng hiện tại', amount: 0 }, { label: 'Điều chỉnh', detail: 'Không có điều chỉnh', amount: 0 }]
      const invoice = { id: randomUUID(), accessToken: randomUUID(), contractId, room_id: contractId, room: contract.room, tenantName: contract.name, month: contract.month, year: contract.year, total_amount: lines.reduce((sum, x) => sum + x.amount, 0), paid_amount: 0, status: 'pending', lines, readings: { electric: { old: contexts.electric.previousReading, new: electric.reading, source: electric.source }, water: { old: contexts.water.previousReading, new: water.reading, source: water.source } }, notice: '', receipt: null }
      // Mirror the monthly invoice fields of Electron; all values here are fixtures.
      invoice.details = { invoice_number: `HD-${contract.room}-${String(contract.month).padStart(2, '0')}${contract.year}-${invoice.id.slice(-6).toUpperCase()}`, invoice_date: periodEnd, due_date: dueDate, billing_period_start: periodStart, billing_period_end: periodEnd, billing_reason: 'monthly', is_first_month: contractId === 'demo-current-102', room_id: contractId, tenant_id: `tenant-${contractId}`, contract_id: contractId, tenant_phone: 'Chưa cấu hình · demo', tenant_email: `phong${contract.room}@example.invalid`, property_name: 'AN KHANG HOME', property_address: 'Địa chỉ cơ sở mẫu · chưa kết nối phần mềm', owner_name: 'AN KHANG HOME · DEMO', owner_phone: 'Chưa cấu hình · demo', electric_old: contexts.electric.previousReading, electric_new: electric.reading, electric_usage: electricity.usage, electric_cost: lines[1].amount, electric_price_snapshot: rates.electric, water_old: contexts.water.previousReading, water_new: water.reading, water_usage: waterUse.usage, water_cost: lines[2].amount, water_price_snapshot: rates.water, room_cost: rates.rent, wifi_cost: rates.wifi, garbage_cost: rates.garbage, old_debt: 0, adjustment_amount: 0, adjustment_note: '', deposit_amount: 0, deposit_applied: 0, damage_amount: 0, total_amount: invoice.total_amount, amount_in_words: numberToWords(invoice.total_amount), note: contractId === 'demo-current-102' ? 'Chỉ số ghi nhận khi bàn giao hợp đồng mới. Điện nước chưa phát sinh.' : 'Hóa đơn thử nghiệm. Đơn giá và phí dịch vụ là dữ liệu mẫu.', created_at: new Date(now()).toISOString() }
      Object.assign(invoice.details, propertyInfo)
      invoice.transferContent = buildInvoiceTransferDescription(invoice, invoice.room)
      // Bank QR is opt-in from trusted Electron settings; settlement is still simulated.
      invoice.qrReady = prepareQr(invoice)
      invoices.set(invoice.id, invoice); periods.set(key, invoice)
      await invoice.qrReady
      return { invoice: publicInvoice(invoice), accessToken: invoice.accessToken }
    },
    status(id, token) { const invoice = authorize(id, token); drain(); return publicInvoice(invoice) },
    simulate(id, token, scenario) {
      const invoice = authorize(id, token)
      if (!['exact', 'partial', 'over', 'wrong-code', 'duplicate'].includes(scenario)) throw error('Tình huống demo không hợp lệ.')
      if (scenario === 'duplicate' && !invoice.receipt) throw error('Hãy thử nhận đủ tiền trước khi gửi lại giao dịch.')
      if (queue.length >= 100) throw error('Đang có nhiều giao dịch mẫu. Chờ đối soát rồi thử lại.', 429)
      const transaction = { id: `${invoice.id}-${scenario === 'duplicate' ? 'exact' : scenario}`, reference_number: `DEMO-${invoice.id}-${scenario === 'duplicate' ? 'exact' : scenario}`, amount_in: String(invoice.total_amount + (scenario === 'partial' ? -10_000 : scenario === 'over' ? 10_000 : 0)), amount_out: '0', transaction_content: scenario === 'wrong-code' ? 'DEMO SAI NOI DUNG' : invoice.transferContent, account_number: recipient.account, bank_brand_name: 'DEMO', transaction_date: new Date(now()).toISOString() }
      if (scenario === 'duplicate') return { queued: false, status: reconcile(transaction).status }
      queue.push({ invoice, transaction, at: now() + 1200 })
      return { queued: true }
    },
    reconcile // Purely local test source; not a public webhook.
  }
}

export function installDemoPaymentApi(server, store) {
  server.middlewares.use('/api/demo-payments', async (req, res) => {
    const send = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)) }
    if (req.method !== 'POST') return send(405, { ok: false, reason: 'Yêu cầu không hợp lệ.' })
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { ok: false, reason: 'Không cho phép truy cập.' })
    if (!String(req.headers['content-type']).startsWith('application/json')) return send(415, { ok: false, reason: 'Yêu cầu không hợp lệ.' })
    try {
      let body = '', length = 0
      for await (const chunk of req) { length += chunk.length; if (length > 8192) return send(413, { ok: false, reason: 'Yêu cầu quá lớn.' }); body += chunk.toString() }
      const data = JSON.parse(body)
      await store.ready()
      if (data.action === 'create') return send(200, { ok: true, ...await store.create(data) })
      if (data.action === 'status') return send(200, { ok: true, invoice: store.status(data.id, data.accessToken) })
      if (data.action === 'simulate') return send(200, { ok: true, ...store.simulate(data.id, data.accessToken, data.scenario) })
      send(400, { ok: false, reason: 'Thao tác demo không hợp lệ.' })
    } catch (cause) { send(cause.status || 400, { ok: false, reason: cause.message || 'Chưa xử lý được hóa đơn demo.' }) }
  })
}
