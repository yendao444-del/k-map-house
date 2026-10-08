import test from 'node:test'
import assert from 'node:assert/strict'
import { createDemoPaymentStore } from './demo-payments.mjs'
import { buildInvoiceTransferDescription } from './electron-transfer-adapter.mjs'

function fixture() {
  let time = Date.parse('2026-10-06T10:00:00Z')
  const readings = new Map()
  const add = (key, meter, reading, contractId = 'demo-current-101') => readings.set(key, { contractId, meter, reading, source: 'ai-ocr', expiresAt: time + 60_000 })
  add('e', 'electric', 12692); add('w', 'water', 287)
  const store = createDemoPaymentStore({ confirmedReading: token => readings.get(token), now: () => time })
  const input = { contractId: 'demo-current-101', electricToken: 'e', waterToken: 'w' }
  const tx = (invoice, changes = {}) => ({ id: 123, reference_number: 'REF-123', amount_in: String(invoice.total), amount_out: '0', account_number: invoice.bank.account, transaction_content: `Chuyen tien ${invoice.transferContent}`, ...changes })
  return { store, input, readings, add, tx, advance: ms => { time += ms } }
}

test('server calculates invoice from confirmed readings and reuses Electron transfer helper', async () => {
  const { store, input } = fixture()
  const { invoice, accessToken } = await store.create({ ...input, total: 1, previousReading: 0 })
  assert.equal(invoice.total, 3_472_000)
  assert.deepEqual(invoice.lines.map(x => x.amount), [3_000_000, 322_000, 70_000, 50_000, 30_000, 0, 0])
  assert.deepEqual(invoice.readings.electric, { old: 12600, new: 12692, source: 'ai-ocr' })
  assert.equal(invoice.transferContent, buildInvoiceTransferDescription(invoice, '101'))
  assert.match(invoice.qr, /^data:image\/png;base64,/)
  assert.equal(invoice.status, 'pending')
  assert.equal(invoice.details.electric_price_snapshot, 3500)
  assert.equal(invoice.details.electric_usage, 92)
  assert.equal(invoice.details.water_usage, 7)
  assert.equal(invoice.details.wifi_cost, 50_000); assert.equal(invoice.details.garbage_cost, 30_000)
  assert.equal(invoice.details.total_amount, invoice.total)
  assert.equal(invoice.details.amount_in_words, 'Ba triệu bốn trăm bảy mươi hai nghìn đồng')
  assert.equal(invoice.details.billing_period_start, '2026-09-01'); assert.equal(invoice.details.billing_period_end, '2026-09-30'); assert.equal(invoice.details.due_date, '2026-10-05')
  assert.throws(() => store.status(invoice.id, 'forged'), { status: 404 })
  assert.equal(store.status(invoice.id, accessToken).total, invoice.total)
})

test('missing, swapped, foreign, expired or abnormal confirmations cannot create invoice', async () => {
  const f = fixture()
  await assert.rejects(f.store.create({ ...f.input, electricToken: 'forged' }), { status: 400 })
  await assert.rejects(f.store.create({ ...f.input, electricToken: 'w', waterToken: 'e' }), { status: 400 })
  f.add('other', 'electric', 12692, 'demo-current-102')
  await assert.rejects(f.store.create({ ...f.input, electricToken: 'other' }), { status: 400 })
  f.add('bad', 'electric', 14000)
  await assert.rejects(f.store.create({ ...f.input, electricToken: 'bad' }), { status: 400 })
  f.advance(60_000)
  await assert.rejects(f.store.create(f.input), { status: 400 })
})

test('concurrent requests produce one invoice; changed readings cannot replace it', async () => {
  const f = fixture()
  const [a, b] = await Promise.all([f.store.create(f.input), f.store.create(f.input)])
  assert.deepEqual(a, b)
  f.add('changed', 'electric', 12693)
  await assert.rejects(f.store.create({ ...f.input, electricToken: 'changed' }), { status: 409 })
})

test('wrong account, outgoing, ambiguous code and malformed amount never settle invoices', async () => {
  const f = fixture(), a = await f.store.create(f.input)
  f.add('e2', 'electric', 777, 'demo-current-102'); f.add('w2', 'water', 20, 'demo-current-102')
  const b = await f.store.create({ contractId: 'demo-current-102', electricToken: 'e2', waterToken: 'w2' })
  for (const change of [{ account_number: 'real-bank' }, { amount_out: '1' }, { amount_in: '1.5' }, { amount_in: 'NaN' }, { amount_in: '-1' }]) assert.equal(f.store.reconcile(f.tx(a.invoice, change)).status, 'ignored')
  assert.equal(f.store.reconcile(f.tx(a.invoice, { transaction_content: `${a.invoice.transferContent} ${b.invoice.transferContent}` })).status, 'ambiguous')
  assert.equal(f.store.status(a.invoice.id, a.accessToken).paid, 0)
  assert.equal(f.store.status(b.invoice.id, b.accessToken).paid, 0)
})

test('partial, over and wrong-code remain unpaid; exact money settles once; duplicate id/ref ignored', async () => {
  const f = fixture(), a = await f.store.create(f.input)
  for (const [id, amount, status] of [[1, a.invoice.total - 10_000, 'partial'], [2, a.invoice.total + 10_000, 'over']]) {
    assert.equal(f.store.reconcile(f.tx(a.invoice, { id, reference_number: `R${id}`, amount_in: String(amount) })).status, status)
    assert.equal(f.store.status(a.invoice.id, a.accessToken).paid, 0)
  }
  assert.equal(f.store.reconcile(f.tx(a.invoice, { id: 3, reference_number: 'R3', transaction_content: 'WRONG' })).status, 'unmatched')
  const exact = f.tx(a.invoice)
  assert.equal(f.store.reconcile(exact).status, 'paid')
  assert.equal(f.store.reconcile(exact).status, 'duplicate')
  assert.equal(f.store.reconcile({ ...exact, id: 999 }).status, 'duplicate')
  assert.equal(f.store.reconcile({ ...exact, reference_number: 'NEW' }).status, 'duplicate')
  assert.equal(f.store.reconcile({ ...exact, reference_number: 'NEW', id: 999 }).status, 'already_paid')
  const paid = f.store.status(a.invoice.id, a.accessToken)
  assert.equal(paid.paid, paid.total); assert.equal(paid.remaining, 0); assert.equal(paid.receipt.amount, paid.total)
  assert.equal(paid.details.payment_status, 'paid'); assert.equal(paid.details.paid_amount, paid.total)
  assert.equal(paid.details.payment_records.length, 1); assert.equal(paid.details.payment_records[0].external_ref, exact.reference_number)
})

test('demo transaction queue updates through status polling and blocks duplicate before payment', async () => {
  const f = fixture(), a = await f.store.create(f.input)
  assert.throws(() => f.store.simulate(a.invoice.id, a.accessToken, 'duplicate'), { status: 400 })
  f.store.simulate(a.invoice.id, a.accessToken, 'wrong-code'); f.advance(1200)
  assert.equal(f.store.status(a.invoice.id, a.accessToken).status, 'review')
  f.store.simulate(a.invoice.id, a.accessToken, 'exact')
  assert.equal(f.store.status(a.invoice.id, a.accessToken).paid, 0)
  f.advance(1200)
  assert.equal(f.store.status(a.invoice.id, a.accessToken).status, 'paid')
  assert.deepEqual(f.store.simulate(a.invoice.id, a.accessToken, 'duplicate'), { queued: false, status: 'duplicate' })
  assert.equal(f.store.status(a.invoice.id, a.accessToken).paid, a.invoice.total)
})

test('new tenant only has its own rent and handover readings, without former meter data', async () => {
  const f = fixture(), former = await f.store.create(f.input)
  f.add('en', 'electric', 777, 'demo-current-102'); f.add('wn', 'water', 20, 'demo-current-102')
  const fresh = await f.store.create({ contractId: 'demo-current-102', electricToken: 'en', waterToken: 'wn' })
  assert.equal(fresh.invoice.total, 3_080_000)
  assert.equal(fresh.invoice.readings.electric.old, null); assert.equal(fresh.invoice.readings.water.old, null)
  assert.equal(fresh.invoice.readings.electric.new, 777)
  assert.throws(() => f.store.status(former.invoice.id, fresh.accessToken), { status: 404 })
})
