const assert = require('node:assert/strict')
const { test } = require('node:test')
const { mkdtempSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmdirSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { loadTs } = require('./load-email-test-module.cjs')
const { MyHanhHistoryStore, validHistoryPoint } = loadTs('src/main/my-hanh-history.ts')
const { fetchMyHanhGoldHistory } = loadTs('src/main/my-hanh-gold.ts')
const { fetchGoldHistory } = loadTs('src/renderer/src/lib/goldApi.ts')
const now = Date.parse('2026-10-19T12:00:00+07:00')
const point = { date: '2026-10-18', code: 'MH9999', buyPerChi: 13250000, sellPerChi: 13550000 }

test('only real valid daily records enter history', () => {
  assert.equal(validHistoryPoint(point, now), true)
  assert.equal(validHistoryPoint({ ...point, date: '2026-02-31' }, now), false)
  assert.equal(validHistoryPoint({ ...point, date: '2026-10-20' }, now), false)
  assert.equal(validHistoryPoint({ ...point, sellPerChi: 1 }, now), false)
  assert.equal(validHistoryPoint({ ...point, code: 'SJ9999' }, now), false)
})

test('daily close persistence survives reload, deduplicates and cannot roll back a later quote', () => {
  const folder = mkdtempSync(join(tmpdir(), 'my-hanh-history-test-'))
  const file = join(folder, 'history.json')
  try {
    const store = new MyHanhHistoryStore(file)
    const early = { ...point, quotedAt: '2026-10-18T09:00:00+07:00' }
    const late = { ...point, quotedAt: '2026-10-18T12:00:00+07:00', sellPerChi: 13600000 }
    store.record([early, late, early, { ...point, code: 'SJ9999' }])
    assert.deepEqual(new MyHanhHistoryStore(file).read(), [late])
    assert.deepEqual(readdirSync(folder), ['history.json'])
    store.read()[0].sellPerChi = 1
    assert.equal(store.read()[0].sellPerChi, 13600000)
    writeFileSync(file, 'corrupt original data')
    const corrupt = new MyHanhHistoryStore(file)
    corrupt.record([point])
    assert.equal(corrupt.available, false)
    assert.equal(readFileSync(file, 'utf8'), 'corrupt original data')
  } finally {
    for (const name of readdirSync(folder)) unlinkSync(join(folder, name))
    rmdirSync(folder)
  }
})

test('estimated history covers past days; cache and outage preserve recorded observations', async () => {
  const originalFetch = global.fetch, originalNow = Date.now
  let clock = Date.parse('2026-10-27T16:00:00+07:00')
  const requests = []
  const ring = (buy, sell) => ({ PQHN24NTT: { name: 'PNJ 24K', buy, sell, currency: 'VND' } })
  try {
    Date.now = () => clock
    global.fetch = async (url, options) => {
      requests.push(url)
      assert.equal(options.redirect, 'error')
      const result = url.includes('type=')
        ? { success: true, history: [
          { date: '2026-10-26', prices: ring(137700000, 140700000) },
          { date: '2026-10-25', prices: ring(137700000, 140700000) }
        ] }
        : { success: true, timestamp: clock / 1000, prices: ring(137500000, 140500000) }
      return { ok: true, headers: new Headers(), text: async () => JSON.stringify(result) }
    }
    const [first, second] = await Promise.all([fetchMyHanhGoldHistory(), fetchMyHanhGoldHistory()])
    assert.equal(requests.length, 2)
    assert.equal(first.origin, 'mixed')
    assert.equal(first.providerState, 'available')
    assert.deepEqual(first.points.map(item => [item.date, item.sellPerChi]), [['2026-10-27', 13000000], ['2026-10-26', 13020000], ['2026-10-25', 13020000]])
    assert.deepEqual(first, second)
    await fetchMyHanhGoldHistory()
    assert.equal(requests.length, 2)
    clock += 6 * 60000
    global.fetch = async () => { throw new Error('offline') }
    const offline = await fetchMyHanhGoldHistory()
    assert.equal(offline.providerState, 'error')
    assert.equal(offline.origin, 'recorded')
    assert.deepEqual(offline.points.map(item => [item.date, item.sellPerChi]), [['2026-10-27', 13000000]])
    assert.equal(offline.success, true)
  } finally { global.fetch = originalFetch; Date.now = originalNow }
})

test('renderer filters the selected purity and date range; conversion to legacy lượng occurs once', async () => {
  const originalWindow = global.window, originalNow = Date.now
  try {
    Date.now = () => now
    global.window = { api: { investment: { myHanhGoldHistory: async () => ({ success: true, origin: 'recorded', providerState: 'empty', storageAvailable: true, points: [
      point, { ...point, code: 'MH24K' }, { ...point, date: '2025-10-01' }
    ] }) } } }
    const data = await fetchGoldHistory('MH9999', 30)
    assert.equal(data.history.length, 1)
    assert.equal(data.history[0].prices.MH9999.buy, 132500000)
    assert.match(data.note, /1 mốc/)
    assert.match(data.note, /chưa có dữ liệu quá khứ/)
    global.window.api.investment.myHanhGoldHistory = async () => { throw new Error('old preload') }
    assert.equal((await fetchGoldHistory('MH9999')).success, false)
  } finally { global.window = originalWindow; Date.now = originalNow }
})
