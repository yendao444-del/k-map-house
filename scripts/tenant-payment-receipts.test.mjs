import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['supabase/functions/_shared/tenant-payment-receipts.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022'
})
const { deliverTenantPaymentReceipts } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
)

const job = {
  id: 'receipt-qa', lease_token: 'lease-qa', invoice_id: 'inv-qa',
  recipient_email: 'tenant@example.invalid', recipient_name: 'Người thuê QA',
  payload: {
    transactionKey: 'BANK-QA', roomName: 'Phòng 221',
    record: { amount: 2534000 },
    invoice: { month: 10, year: 2026, total_amount: 2534000, paid_amount: 2534000,
      room_cost: 2400000, wifi_cost: 50000, garbage_cost: 70000 }
  }
}

function fixture(valid = true) {
  const calls = []
  const db = {
    async rpc(name, args) {
      calls.push({ name, args })
      if (name === 'claim_tenant_payment_receipts') return { data: [job], error: null }
      if (name === 'tenant_payment_receipt_valid') return { data: valid, error: null }
      return { data: true, error: null }
    }
  }
  return { db, calls }
}

test('tenant receipt uses the same full payment receipt and its own recipient', async () => {
  const f = fixture(), sent = []
  const result = await deliverTenantPaymentReceipts(f.db, { apiKey: 'qa', from: 'AN KHANG HOME <thongbao@phongtroankhang.com>' }, async (_url, options) => {
    sent.push(JSON.parse(options.body))
    return Response.json({ id: 'provider-qa' })
  }, async () => {})
  assert.deepEqual(result, { configured: true, sent: 1, failed: 0, skipped: 0 })
  assert.deepEqual(sent[0].to, ['tenant@example.invalid'])
  assert.match(sent[0].subject, /Thanh toán thành công/)
  assert.match(sent[0].html, /cid:02-thanh-toan-thanh-cong@ankhanghome/)
  assert.match(sent[0].html, /2\.534\.000/)
  assert.equal(f.calls.at(-1).args.p_provider, 'provider-qa')
})

test('changed tenant or invoice is skipped without provider request', async () => {
  const f = fixture(false)
  let requests = 0
  const result = await deliverTenantPaymentReceipts(f.db, { apiKey: 'qa', from: 'QA' }, async () => { requests++; return Response.json({ id: 'nope' }) }, async () => {})
  assert.deepEqual(result, { configured: true, sent: 0, failed: 0, skipped: 1 })
  assert.equal(requests, 0)
  assert.equal(f.calls.at(-1).args.p_status, 'skipped')
})

test('provider rejection is retryable and never reported as sent', async () => {
  const f = fixture()
  const result = await deliverTenantPaymentReceipts(f.db, { apiKey: 'qa', from: 'QA' }, async () => Response.json({ message: 'rate limited' }, { status: 429 }), async () => {})
  assert.deepEqual(result, { configured: true, sent: 0, failed: 1, skipped: 0 })
  assert.equal(f.calls.at(-1).args.p_status, 'failed')
})

test('retry keeps the same provider key and persistence failure stops the batch', async () => {
  const keys = []
  const request = async (_url, options) => {
    keys.push(options.headers['Idempotency-Key'])
    return Response.json({ id: 'accepted-qa' })
  }
  for (let i = 0; i < 2; i++) {
    const f = fixture()
    await deliverTenantPaymentReceipts(f.db, { apiKey: 'qa', from: 'QA' }, request, async () => {})
  }
  assert.deepEqual(keys, ['tenant-receipt-receipt-qa', 'tenant-receipt-receipt-qa'])
  const db = {
    async rpc(name) {
      if (name === 'claim_tenant_payment_receipts') return { data: [job, { ...job, id: 'second' }] }
      if (name === 'tenant_payment_receipt_valid') return { data: true }
      return { data: false }
    }
  }
  await assert.rejects(deliverTenantPaymentReceipts(db, { apiKey: 'qa', from: 'QA' }, request, async () => {}), /lease changed/)
  assert.equal(keys.length, 3)
})

test('unconfigured provider never claims customer receipts', async () => {
  const result = await deliverTenantPaymentReceipts({ rpc() { throw new Error('must not claim') } }, {})
  assert.equal(result.configured, false)
})
