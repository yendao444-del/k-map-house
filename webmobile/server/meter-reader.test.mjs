import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { parseMeterResult, readMeterImage } from './meter-reader.mjs'
import { prepareMeterViews } from './meter-image.mjs'
const result = (reading = '00126', overrides = {}) => JSON.stringify({ meterType: 'electric', unit: 'kWh', reading, certainty: 'clear', meterCount: 1, framing: 'close', issue: 'none', ...overrides })
test('strict meter, clarity, and whole-digit validation', () => {
  assert.deepEqual(parseMeterResult(result(), 'electric'), { ok: true, digits: '00126', reading: 126, unit: 'kWh' })
  for (const text of ['not JSON', 'null', '[]', '"12692"', result('12.6'), result('-126'), result(''), result('123456789'), result(null), result('126', { certainty: 'unclear' }), result('126', { meterType: 'water' }), result('126', { unit: 'm3' })]) assert.equal(parseMeterResult(text, 'electric').ok, false)
})
test('parallel reads must agree and unreadable results never pass', async () => {
  const original = globalThis.fetch
  try {
    const image = `data:image/jpeg;base64,${(await sharp(Buffer.from('<svg width="400" height="600"><rect width="400" height="600" fill="white"/><rect x="100" y="120" width="200" height="100" fill="black"/></svg>')).jpeg().toBuffer()).toString('base64')}`
    const options = { baseUrl: 'http://local-test', model: 'test-model' }
    let calls = []
    const mock = (responses) => { calls = []; globalThis.fetch = async (url, options) => { const index = calls.length; calls.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ choices: [{ message: { content: responses[index] } }] }) } } }
    mock([result('12692'), result('12692')])
    const accepted = await readMeterImage(image, 'electric', options)
    assert.equal(accepted.reading, 12692); assert.equal(accepted.needsConfirmation, true); assert.equal(calls.length, 2)
    assert.notEqual(calls[0].messages[0].content[0].text, calls[1].messages[0].content[0].text)
    assert.equal(calls[0].messages[0].content.filter(part => part.type === 'image_url').length, 2)
    mock([result('12692'), result('12693')])
    assert.equal((await readMeterImage(image, 'electric', options)).ok, false)
    mock([result('00126'), result('0126')])
    assert.equal((await readMeterImage(image, 'electric', options)).ok, false)
    mock([result(null, { certainty: 'unclear' }), result('12692')])
    assert.equal((await readMeterImage(image, 'electric', options)).ok, false); assert.equal(calls.length, 2)
    await assert.rejects(readMeterImage('invalid', 'electric', options), /invalid_image/)
    await assert.rejects(readMeterImage(image, 'gas', options), /invalid_meter/)
  } finally { globalThis.fetch = original }
})
test('multiple, distant, clipped, glare/blur or missing quality evidence cannot pass', () => {
  for (const overrides of [{ meterCount: 2 }, { meterCount: 0 }, { meterCount: undefined }, { framing: 'distant' }, { framing: 'cut_off' }, { framing: undefined }, { issue: 'glare' }, { issue: 'blur' }, { issue: 'unreadable' }, { issue: undefined }]) assert.equal(parseMeterResult(result('02428', overrides), 'electric').ok, false)
  assert.match(parseMeterResult(result('02428', { meterCount: 2 }), 'electric').reason, /nhiều công tơ/)
  assert.match(parseMeterResult(result('02428', { issue: 'glare' }), 'electric').reason, /lóa/)
})
test('resolution and blank image gates reject before provider; both views preserve uploaded image edges', async () => {
  const encode = async image => `data:image/jpeg;base64,${(await image.jpeg().toBuffer()).toString('base64')}`
  await assert.rejects(prepareMeterViews(await encode(sharp({ create: { width: 230, height: 300, channels: 3, background: 'white' } }))), /image_too_small/)
  await assert.rejects(prepareMeterViews(await encode(sharp({ create: { width: 500, height: 500, channels: 3, background: 'white' } }))), /image_blank/)
  const views = await prepareMeterViews(await encode(sharp(Buffer.from('<svg width="500" height="400"><rect width="500" height="400" fill="white"/><rect width="80" height="400" fill="black"/></svg>'))))
  const normal = await sharp(Buffer.from(views.full.split(',')[1], 'base64')).metadata(), enhanced = await sharp(Buffer.from(views.detail.split(',')[1], 'base64')).metadata()
  assert.equal(normal.width, enhanced.width); assert.equal(normal.height, enhanced.height)
  const { data, info } = await sharp(Buffer.from(views.detail.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true })
  assert.ok(data[(200 * info.width + 10) * info.channels] < 20)
})
test('both provider requests overlap and use server crops from one image', async () => {
  const original = globalThis.fetch
  const image = `data:image/jpeg;base64,${(await sharp(Buffer.from('<svg width="400" height="600"><rect width="400" height="600" fill="white"/><rect x="100" y="120" width="200" height="100" fill="black"/></svg>')).jpeg().toBuffer()).toString('base64')}`
  let active = 0, maximum = 0, release
  const bothStarted = new Promise(resolve => { release = resolve })
  try {
    globalThis.fetch = async (_url, options) => {
      active++; maximum = Math.max(maximum, active); if (active === 2) release()
      await bothStarted
      const body = JSON.parse(options.body)
      assert.equal(body.reasoning_effort, 'low')
      assert.notEqual(body.messages[0].content[1].image_url.url, body.messages[0].content[2].image_url.url)
      active--
      return { ok: true, json: async () => ({ choices: [{ message: { content: result('12692') } }] }) }
    }
    assert.equal((await readMeterImage(image, 'electric', { baseUrl: 'http://test', model: 'test' })).ok, true)
    assert.equal(maximum, 2)
  } finally { globalThis.fetch = original }
})
test('provider time limit aborts both requests', async () => {
  const original = globalThis.fetch
  const image = `data:image/jpeg;base64,${(await sharp(Buffer.from('<svg width="400" height="600"><rect width="400" height="600" fill="white"/><rect x="100" y="120" width="200" height="100" fill="black"/></svg>')).jpeg().toBuffer()).toString('base64')}`
  let aborted = 0
  try {
    globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { aborted++; reject(options.signal.reason) }, { once: true }))
    // Keep the event loop alive; AbortSignal.timeout timers are unref'ed.
    const keepAlive = setTimeout(() => {}, 1000)
    try { await assert.rejects(readMeterImage(image, 'electric', { baseUrl: 'http://test', model: 'test', timeoutMs: 20 }), error => error.name === 'TimeoutError') } finally { clearTimeout(keepAlive) }
    assert.equal(aborted, 2)
  } finally { globalThis.fetch = original }
})
