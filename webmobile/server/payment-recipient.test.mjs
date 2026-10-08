import test from 'node:test'
import assert from 'node:assert/strict'
import QRCode from 'qrcode'
import { paymentBankFromEnv } from './payment-recipient.mjs'
import { createDemoPaymentStore } from './demo-payments.mjs'

test('recipient uses trusted configuration; QR matches recipient, invoice amount and exact code across restored sessions', async () => {
  const env = { WEBMOBILE_PAYMENT_BANK: 'BIDV', WEBMOBILE_PAYMENT_ACCOUNT: 'TESTACCOUNT01', WEBMOBILE_PAYMENT_OWNER: 'DO KIM NGAN' }
  const bank = paymentBankFromEnv(env)
  assert.equal(bank.owner, 'Đỗ Kim Ngân')
  const png = Buffer.from((await QRCode.toDataURL('synthetic-test-only')).split(',')[1], 'base64')
  const requested = []
  const qrFetcher = async url => { requested.push(new URL(url)); return new Response(png, { headers: { 'Content-Type': 'image/png' } }) }
  const confirmedReading = token => ({ contractId: 'demo-current-101', meter: token, reading: token === 'electric' ? 12692 : 287, expiresAt: Date.now() + 100000 })
  const old = createDemoPaymentStore({ confirmedReading })
  const payment = await old.create({ contractId: 'demo-current-101', electricToken: 'electric', waterToken: 'water' })
  const updated = createDemoPaymentStore({ confirmedReading, snapshot: old.snapshot(), paymentBank: bank, qrFetcher })
  await updated.ready()
  const invoice = updated.status(payment.invoice.id, payment.accessToken)
  assert.equal(invoice.qrKind, 'bank'); assert.deepEqual(invoice.bank, bank)
  assert.equal(requested[0].hostname, 'qr.sepay.vn')
  assert.equal(requested[0].searchParams.get('acc'), bank.account)
  assert.equal(requested[0].searchParams.get('bank'), 'BIDV')
  assert.equal(requested[0].searchParams.get('amount'), String(invoice.remaining))
  assert.equal(requested[0].searchParams.get('des'), invoice.transferContent)
  const restored = createDemoPaymentStore({ confirmedReading, snapshot: updated.snapshot(), paymentBank: bank, qrFetcher: () => { throw new Error('Must reuse matching QR') } })
  await restored.ready(); assert.equal(restored.status(invoice.id, payment.accessToken).qr, invoice.qr)
})

test('invalid recipient configuration and failed QR never produce a confirmed bank QR', async () => {
  assert.throws(() => paymentBankFromEnv({ WEBMOBILE_PAYMENT_BANK: 'BIDV' }))
  const store = createDemoPaymentStore({ confirmedReading: token => ({ contractId: 'demo-current-101', meter: token, reading: token === 'electric' ? 12692 : 287, expiresAt: Date.now() + 100000 }), paymentBank: { name: 'BIDV', account: 'TESTACCOUNT01', owner: 'test' }, qrFetcher: async () => new Response('error', { status: 500 }) })
  await assert.rejects(store.create({ contractId: 'demo-current-101', electricToken: 'electric', waterToken: 'water' }), /QR ngân hàng/)
})
