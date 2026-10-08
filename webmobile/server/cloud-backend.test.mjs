import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { cloudHandler } from '../cloud/handler.mjs'
import { readCloudMeter } from '../cloud/online-reader.mjs'
import { createDemoPaymentStore } from './demo-payments.mjs'
import { onRequest } from '../functions/api/[[path]].js'

const session = 'f629fada-9445-4b51-9e91-11dc961d2f48'
const secret = 'test-only-secret'
function request(endpoint, data, id = session) {
  return new Request('https://edge.example.invalid/', { method: endpoint === 'health' ? 'GET' : 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', 'x-webmobile-endpoint': endpoint, 'x-webmobile-session': id, 'x-webmobile-ip': 'a'.repeat(64) }, ...(data ? { body: JSON.stringify(data) } : {}) })
}
test('cloud reports missing AI key and makes no state, quota or provider request', async () => {
  const handler = cloudHandler({ WEBMOBILE_GATEWAY_SECRET: secret }, () => { throw new Error('RPC must not run') }, () => { throw new Error('Provider must not run') })
  const health = await handler(request('health'))
  assert.equal((await health.json()).ocrConfigured, false)
  const result = await handler(request('meter-ocr', { contractId: 'demo-current-101', meter: 'electric', image: 'any' }))
  assert.equal(result.status, 503); assert.equal((await result.json()).code, 'OCR_NOT_CONFIGURED')
  assert.equal((await handler(new Request('https://edge.example.invalid/'))).status, 403)
})
test('cloud sessions isolate confirmations/invoices across cold starts and keep invoice fields', async () => {
  const database = new Map()
  async function rpc(name, data) {
    if (name === 'webmobile_demo_quota') return true
    if (name === 'webmobile_demo_claim') return { busy: false, state: structuredClone(database.get(data.p_id) || {}) }
    database.set(data.p_id, structuredClone(data.p_state)); return true
  }
  const env = { WEBMOBILE_GATEWAY_SECRET: secret, METER_CLOUD_API_KEY: 'synthetic-test-key' }
  const reader = async (_, meter) => ({ ok: true, reading: meter === 'electric' ? 12692 : 287, digits: meter === 'electric' ? '12692' : '00287', unit: meter === 'electric' ? 'kWh' : 'm3', source: 'ai-ocr' })
  const send = async (endpoint, body, id) => (await cloudHandler(env, rpc, reader)(request(endpoint, body, id))).json()
  const tokens = {}
  for (const meter of ['electric', 'water']) {
    const read = await send('meter-ocr', { image: 'fixture', contractId: 'demo-current-101', meter })
    const confirm = await send('meter-ocr', { mode: 'check', reviewToken: read.reviewToken, contractId: 'demo-current-101', meter, reading: read.reading })
    tokens[meter] = confirm.confirmationToken
  }
  const create = { action: 'create', contractId: 'demo-current-101', electricToken: tokens.electric, waterToken: tokens.water }
  assert.equal((await send('demo-payments', create, 'f629fada-9445-4b51-9e91-11dc961d2f49')).ok, false)
  const payment = await send('demo-payments', create)
  assert.equal(payment.invoice.total, 3472000)
  assert.equal(payment.invoice.details.electric_new, 12692)
  assert.equal((await send('demo-payments', create)).invoice.id, payment.invoice.id)
  assert.equal((await send('demo-payments', { action: 'status', id: payment.invoice.id, accessToken: payment.accessToken })).invoice.status, 'pending')
  assert.equal((await send('demo-payments', { action: 'status', id: payment.invoice.id, accessToken: payment.accessToken }, 'f629fada-9445-4b51-9e91-11dc961d2f49')).ok, false)
})
test('persistent demo queue reconciles once after restoring the store', async () => {
  let time = Date.now()
  const confirmedReading = token => ({ contractId: 'demo-current-101', meter: token, reading: token === 'electric' ? 12692 : 287, expiresAt: time + 100000 })
  const first = createDemoPaymentStore({ confirmedReading, now: () => time })
  const payment = await first.create({ contractId: 'demo-current-101', electricToken: 'electric', waterToken: 'water' })
  first.simulate(payment.invoice.id, payment.accessToken, 'exact')
  time += 1300
  const restored = createDemoPaymentStore({ confirmedReading, now: () => time, snapshot: JSON.parse(JSON.stringify(first.snapshot())) })
  assert.equal(restored.status(payment.invoice.id, payment.accessToken).status, 'paid')
  assert.equal(restored.simulate(payment.invoice.id, payment.accessToken, 'duplicate').status, 'duplicate')
  assert.equal(restored.status(payment.invoice.id, payment.accessToken).paid, 3472000)
})
test('online reader rejects blank photos without provider call and compares complete digit strings', async () => {
  const image = async markup => `data:image/jpeg;base64,${(await sharp(Buffer.from(markup)).jpeg().toBuffer()).toString('base64')}`
  const env = { METER_CLOUD_PROVIDER: 'gemini', METER_CLOUD_MODEL: 'fixture', METER_CLOUD_API_KEY: 'test' }
  const blank = await image('<svg width="400" height="600"><rect width="400" height="600" fill="white"/></svg>')
  await assert.rejects(readCloudMeter(blank, 'electric', env, () => { throw new Error('Provider must not run') }), /image_blank/)
  const photo = await image('<svg width="400" height="600"><rect width="400" height="600" fill="white"/><rect x="100" y="200" width="200" height="100" fill="black"/></svg>')
  let count = 0
  const fakeProvider = async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ meterType: 'electric', meterCount: 1, framing: 'close', issue: 'none', reading: ++count === 1 ? '012692' : '12692', unit: 'kWh', certainty: 'clear' }) }] } }] })
  assert.equal((await readCloudMeter(photo, 'electric', env, fakeProvider)).ok, false)
})
test('Pages rejects foreign origins and unsupported methods before contacting backend', async () => {
  const env = { WEBMOBILE_EDGE_URL: 'https://backend.example.invalid', WEBMOBILE_GATEWAY_SECRET: secret }
  const context = { env, params: { path: ['meter-ocr'] }, request: new Request('https://phongtroankhang.com/api/meter-ocr', { method: 'POST', headers: { origin: 'https://untrusted.example.invalid' } }) }
  assert.equal((await onRequest(context)).status, 403)
  context.request = new Request('https://phongtroankhang.com/api/meter-ocr')
  assert.equal((await onRequest(context)).status, 405)
})
