const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadTs } = require('./load-email-test-module.cjs')
const { parseBenchmarkCurrent, parseBenchmarkHistory, estimateMyHanh, fetchMyHanhGoldPrices } = loadTs('src/main/my-hanh-gold.ts')
const { fetchCurrentGoldPrices, fetchGoldHistory, suggestedGoldPricePerChi } = loadTs('src/renderer/src/lib/goldApi.ts')
const { transactionsForCategory } = loadTs('src/renderer/src/lib/investment-history.ts')
const now = Date.parse('2026-10-27T16:00:00+07:00')
const ring = (buy, sell) => ({ PQHN24NTT: { name: 'PNJ 24K', buy, sell, currency: 'VND' } })
const current = () => ({ success: true, timestamp: now / 1000, prices: { ...ring(137500000, 140500000), SJ9999: { name: 'SJC', buy: 1, sell: 2, currency: 'VND' } } })
const history = () => ({ success: true, history: [
  { date: '2026-10-27', prices: ring(137500000, 140500000) },
  { date: '2026-10-26', prices: ring(137700000, 140700000) },
  { date: '2026-10-25', prices: ring(137700000, 140700000) }
] })
const benchmark = () => ({ ...parseBenchmarkCurrent(current(), now), days: parseBenchmarkHistory(history(), now) })
const serve = body => ({ ok: true, headers: new Headers(), text: async () => JSON.stringify(body) })

test('closed Mỹ Hạnh positions remain visible in the gold transaction history', () => {
  const tx = { assetSymbol: 'MH9999', id: 'closed-local-gold' }
  assert.deepEqual(transactionsForCategory([tx], [], 'gold'), [tx])
  assert.deepEqual(transactionsForCategory([tx], [], 'stocks'), [])
})

test('estimates MH 9999 from PNJ rings with the shop-confirmed 26/10 sell price as anchor', () => {
  const { prices, points } = estimateMyHanh(benchmark(), now)
  // Offset = 13.020.000 − 14.070.000; the benchmark spread is kept.
  assert.deepEqual(prices.products, [{ code: 'MH9999', name: 'Vàng MH 9999', metal: 'gold', buyPerChi: 12700000, sellPerChi: 13000000 }])
  assert.equal(prices.quotedAt, '2026-10-27T16:00:00+07:00')
  assert.equal(prices.stale, false)
  assert.equal(prices.source, 'Ước tính theo nhẫn PNJ Hà Nội')
  assert.deepEqual(points.map(point => [point.date, point.sellPerChi]), [['2026-10-25', 13020000], ['2026-10-26', 13020000], ['2026-10-27', 13000000]])
  assert.equal(estimateMyHanh(benchmark(), now + 48 * 3600000).prices.stale, true)
})

test('rejects malformed benchmark quotes, skips malformed days and never calibrates without an anchor day', () => {
  for (const price of [undefined, { buy: 0, sell: 1 }, { buy: 2, sell: 1 }, { buy: 'x', sell: 1 }, { buy: 1, sell: 2, currency: 'USD' }]) {
    assert.throws(() => parseBenchmarkCurrent({ ...current(), prices: { PQHN24NTT: price } }, now))
  }
  assert.throws(() => parseBenchmarkCurrent({ ...current(), timestamp: now / 1000 + 3600 }, now))
  assert.throws(() => parseBenchmarkHistory({ success: false }, now))
  const data = history()
  data.history.push({ date: '2026-02-31', prices: ring(1, 2) }, { date: '2026-10-24', prices: ring(5, 1) }, { date: '2026-10-28', prices: ring(1, 2) })
  assert.equal(parseBenchmarkHistory(data, now).length, 3)
  assert.throws(() => estimateMyHanh({ ...benchmark(), days: [{ date: '2026-10-27', buyPerChi: 13750000, sellPerChi: 14050000 }] }, now))
})

test('renderer merges independent sources and converts only once; buy uses dealer sell', async () => {
  const originalFetch = global.fetch, originalWindow = global.window
  try {
    const myHanh = estimateMyHanh(benchmark(), now).prices
    global.window = { api: { investment: { myHanhGold: async () => myHanh } } }
    global.fetch = async () => ({ ok: true, json: async () => ({ success: true, date: '2026-10-27', time: '16:00', prices: {
      SJ9999: { name: 'SJC', buy: 139300000, sell: 142300000, currency: 'VND' }
    } }) })
    const response = await fetchCurrentGoldPrices()
    assert.equal(response.prices.MH9999.buy, 127000000)
    assert.equal(suggestedGoldPricePerChi(response, 'MH9999', 'buy'), 13000000)
    assert.equal(suggestedGoldPricePerChi(response, 'MH9999', 'sell'), 12700000)
    assert.equal(suggestedGoldPricePerChi(response, 'SJ9999', 'buy'), 14230000)
    assert.equal(suggestedGoldPricePerChi({ ...response, myHanh: { ...myHanh, stale: true } }, 'MH9999', 'buy'), 0)
    global.fetch = async () => { throw new Error('offline') }
    const onlyLocal = await fetchCurrentGoldPrices()
    assert.equal(onlyLocal.prices.SJ9999, undefined)
    assert.equal(suggestedGoldPricePerChi(onlyLocal, 'MH9999', 'buy'), 13000000)
    global.window.api.investment.myHanhGold = async () => { throw new Error('source down') }
    const failed = await fetchCurrentGoldPrices()
    assert.equal(failed.success, false)
    assert.deepEqual(failed.prices, {})
    assert.equal(suggestedGoldPricePerChi(failed, 'MH9999', 'buy'), 0)
  } finally { global.fetch = originalFetch; global.window = originalWindow }
})

test('history never fabricates points, cross-maps brands or appends old SJC references', async () => {
  const originalFetch = global.fetch
  try {
    global.fetch = async () => { throw new Error('offline') }
    assert.deepEqual((await fetchGoldHistory('MH9999')).history, [])
    assert.equal((await fetchGoldHistory('SJ9999')).success, false)
    assert.deepEqual((await fetchGoldHistory('PQHN24NTT', 1095)).history, [])
    global.fetch = async () => ({ ok: true, json: async () => ({ success: true, history: [
      { date: '2026-10-19', prices: { PQHN24NTT: { name: 'PNJ', buy: 139600000, sell: 142600000 } } },
      { date: '2026-10-18', prices: { SJ9999: { name: 'SJC', buy: 1, sell: 2 } } }
    ] }) })
    const result = await fetchGoldHistory('PQHN24NTT', 1095)
    assert.equal(result.history.length, 1)
    assert.equal(result.history[0].date, '2026-10-19')
    assert.equal(result.source, 'Vang.Today')
  } finally { global.fetch = originalFetch }
})

test('main provider reports network and malformed-source failures without any replacement quote', async () => {
  const originalFetch = global.fetch
  try {
    for (const body of [null, '<html>blocked</html>', JSON.stringify({ success: true, history: [] })]) {
      global.fetch = async () => {
        if (body === null) throw new Error('offline')
        return { ok: true, headers: new Headers(), text: async () => body }
      }
      const result = await fetchMyHanhGoldPrices()
      assert.equal(result.success, false)
      assert.deepEqual(result.products, [])
      assert.equal(result.quotedAt, undefined)
    }
  } finally { global.fetch = originalFetch }
})

test('main provider uses fixed URLs, coalesces requests, caches success, and disables redirects', async () => {
  const originalFetch = global.fetch
  const originalNow = Date.now
  try {
    Date.now = () => now
    const urls = []
    global.fetch = async (url, options) => {
      urls.push(url)
      assert.equal(options.redirect, 'error')
      return serve(url.includes('type=') ? history() : current())
    }
    const responses = await Promise.all([fetchMyHanhGoldPrices(), fetchMyHanhGoldPrices()])
    assert.equal(responses[0].success, true)
    await fetchMyHanhGoldPrices()
    assert.deepEqual(urls.sort(), ['https://www.vang.today/api/prices', 'https://www.vang.today/api/prices?type=PQHN24NTT&days=400'])
  } finally { global.fetch = originalFetch; Date.now = originalNow }
})
