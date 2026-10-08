import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import sharp from 'sharp'
import { meterDevApi } from './meter-dev-api.mjs'

test('API requires an approved photo and rechecks manual values against server context', async () => {
  const originalFetch = globalThis.fetch
  let meterType = 'electric', unit = 'kWh', reading = '12692', certainty = 'clear'
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('http://fake-provider/')) return originalFetch(url, options)
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ meterType, unit, reading, certainty, meterCount: 1, framing: 'close', issue: 'none' }) } }] }) }
  }
  const handlers = new Map()
  meterDevApi({ METER_OCR_BASE_URL: 'http://fake-provider', METER_OCR_MODEL: 'test' }).configureServer({ middlewares: { use: (path, callback) => { handlers.set(path, callback) } } })
  const server = createServer((req, res) => handlers.get(req.url)(req, res))
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/api/meter-ocr`
  const image = `data:image/jpeg;base64,${(await sharp(Buffer.from('<svg width="400" height="600"><rect width="400" height="600" fill="white"/><rect x="100" y="120" width="200" height="100" fill="black"/></svg>')).jpeg().toBuffer()).toString('base64')}`
  const upload = { image, meter: 'electric', contractId: 'demo-current-101' }
  const send = async (body, headers = {}) => (await originalFetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })).json()
  try {
    const accepted = await send(upload)
    assert.equal(accepted.ok, true) // Upload goes directly to OCR without a manual selection flag.
    assert.equal(accepted.assessment.status, 'pass'); assert.equal(typeof accepted.reviewToken, 'string')
    const check = { mode: 'check', reviewToken: accepted.reviewToken, meter: upload.meter, contractId: upload.contractId, source: 'manual' }
    assert.equal((await send({ ...check, reading: 12693 })).ok, true)
    assert.equal((await send({ ...check, reading: 287, previousReading: 0 })).ok, false)
    assert.equal((await send({ ...check, reading: 14000, maxDailyUsage: 9999 })).ok, false)
    assert.equal((await send({ ...check, reading: 12692, meter: 'water' })).ok, false)
    assert.equal((await send({ ...check, reading: 12692, reviewToken: 'forged' })).ok, false)
    assert.equal((await send(upload, { origin: 'https://untrusted.example' })).ok, false)

    reading = '13000'
    const spike = await send(upload)
    assert.equal(spike.assessment.status, 'review'); assert.equal(spike.reviewToken, null)
    certainty = 'unclear'; reading = null
    const blurred = await send(upload)
    assert.equal(blurred.ok, false); assert.equal(blurred.reviewToken, undefined)
    certainty = 'clear'; reading = '00287'; meterType = 'water'; unit = 'm3'
    const swapped = await send(upload)
    assert.equal(swapped.ok, false); assert.equal(swapped.reviewToken, undefined)
    const acceptedWater = await send({ ...upload, meter: 'water' })
    const waterConfirmation = await send({ ...check, meter: 'water', reviewToken: acceptedWater.reviewToken, reading: 287 })
    const electricConfirmation = await send({ ...check, reading: 12692 })
    const paymentUrl = url.replace('/api/meter-ocr', '/api/demo-payments')
    const sendPayment = async body => (await originalFetch(paymentUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
    const create = { action: 'create', contractId: upload.contractId, electricToken: electricConfirmation.confirmationToken, waterToken: waterConfirmation.confirmationToken }
    assert.equal((await sendPayment({ ...create, waterToken: 'forged' })).ok, false)
    const payment = await sendPayment(create)
    assert.equal(payment.ok, true); assert.equal(payment.invoice.total, 3_472_000)
    assert.equal((await sendPayment({ action: 'status', id: payment.invoice.id, accessToken: 'forged' })).ok, false)
    assert.equal((await sendPayment({ action: 'status', id: payment.invoice.id, accessToken: payment.accessToken })).invoice.status, 'pending')
    const originalNow = Date.now
    try {
      Date.now = () => originalNow() + 11 * 60_000
      assert.equal((await send({ ...check, reading: 12692 })).ok, false)
    } finally { Date.now = originalNow }
  } finally {
    globalThis.fetch = originalFetch
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  }
})
