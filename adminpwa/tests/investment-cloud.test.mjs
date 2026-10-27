import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
async function moduleFrom(file) {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL(`../src/renderer/src/lib/${file}.ts`, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const cloud = await moduleFrom('investment-cloud-policy')
const funding = await moduleFrom('investment-funding')
const importer = await moduleFrom('investment-import')
const store = { holdings: [], transactions: [], portfolioSnapshots: [], categoryTargets: {}, pwaVersion: 3 }
const requestId = '11111111-1111-4111-8111-111111111111'

test('snapshot version stays attached to its own data, not a global last-read token', () => {
  const first = cloud.parseInvestmentSnapshot({ version: 3, data: store }).data
  cloud.parseInvestmentSnapshot({ version: 4, data: store })
  assert.equal(first.pwaVersion, 3)
  assert.equal(cloud.investmentPayload(first).pwaVersion, undefined)
})
test('missing/invalid server version fails closed', () => {
  for (const version of [undefined, -1, NaN, 1.2, '3']) assert.throws(() => cloud.parseInvestmentSnapshot({ version, data: store }))
})
test('successful save validates the next version and excludes metadata from storage', async () => {
  const result = await cloud.commitCloudInvestment({ store, requestId, send: async payload => {
    assert.equal(payload.p_expected_version, 3); assert.equal(payload.p_data.pwaVersion, undefined)
    return { version: 4, data: payload.p_data }
  } })
  assert.equal(result.data.pwaVersion, 4)
})
test('network retry reuses the same request ID, payload and expected version', async () => {
  const calls = []
  const result = await cloud.commitCloudInvestment({ store, requestId, send: async payload => {
    calls.push(payload)
    if (calls.length === 1) throw new TypeError('Connection lost after server commit')
    return { version: 4, data: payload.p_data }
  } })
  assert.equal(result.version, 4); assert.equal(calls.length, 2); assert.strictEqual(calls[0], calls[1])
})
test('version conflict and role rejection do not retry', async () => {
  for (const code of ['40001', '42501', '22023']) {
    let attempts = 0
    await assert.rejects(() => cloud.commitCloudInvestment({ store, requestId, send: async () => { attempts++; throw { code, message: 'Rejected' } } }), error => error.code === code)
    assert.equal(attempts, 1)
  }
})
test('unresolved transport loss is uncertain, never definitive rejection', async () => {
  await assert.rejects(() => cloud.commitCloudInvestment({ store, requestId, send: async () => { throw new TypeError('Network unavailable') } }), error => error.uncertain === true && error.requestId === requestId)
})
test('wrong success version cannot advance local state', async () => {
  await assert.rejects(() => cloud.commitCloudInvestment({ store, requestId, send: async () => ({ version: 5, data: store }) }), error => error.uncertain === true)
})
test('unloaded store cannot be written', async () => {
  let called = false
  await assert.rejects(() => cloud.commitCloudInvestment({ store: { ...store, pwaVersion: undefined }, requestId, send: async () => { called = true } }))
  assert.equal(called, false)
})
test('reject duplicate asset symbols, transaction IDs and nonfinite amounts', () => {
  const holding = { symbol: 'VFF', category: 'bonds', valueVnd: 100 }
  const tx = { id: '1', date: '2026-10-08', transactionType: 'buy', amountVnd: 100 }
  assert.throws(() => cloud.investmentPayload({ ...store, holdings: [holding, { ...holding, symbol: 'vff' }] }))
  assert.throws(() => cloud.investmentPayload({ ...store, transactions: [tx, tx] }))
  assert.throws(() => cloud.investmentPayload({ ...store, holdings: [{ ...holding, valueVnd: Infinity }] }))
})
test('uncertain portfolio commit never compensates already-created wallet entries', async () => {
  let removed = 0
  const next = { id: 'tx1', transactionType: 'deposit', fundingSource: 'investment-wallet', walletPosting: { paymentMethod: 'cash', amount: 100 } }
  await assert.rejects(() => funding.commitInvestmentWallet({
    next, nextStore: { ...store, transactions: [next] }, readCurrent: async () => store,
    readOperating: async () => ({ cashBalance: 1000, bankBalance: 1000, totalBalance: 2000 }),
    createPosting: async () => 'cash-test', removePosting: async () => { removed++ },
    persist: async () => { throw new cloud.InvestmentCommitUncertainError(requestId) }
  }), /không tự hoàn tác/)
  assert.equal(removed, 0)
})
test('definitive failure compensates wallet entries instead of claiming success', async () => {
  let removed = 0
  const next = { id: 'tx1', transactionType: 'deposit', fundingSource: 'investment-wallet', walletPosting: { paymentMethod: 'cash', amount: 100 } }
  await assert.rejects(() => funding.commitInvestmentWallet({
    next, nextStore: { ...store, transactions: [next] }, readCurrent: async () => store,
    readOperating: async () => ({ cashBalance: 1000, bankBalance: 1000, totalBalance: 2000 }),
    createPosting: async () => 'cash-test', removePosting: async () => { removed++ },
    persist: async () => { throw new Error('Conflict') }
  }), /Conflict/)
  assert.equal(removed, 1)
})

test('Electron import removes crypto using the source migration rule and rebuilds aggregate history', () => {
  const holding = { symbol: 'VFF', category: 'bonds', valueVnd: 100 }
  const result = importer.parseElectronInvestmentImport(JSON.stringify({
    ...store, holdings: [holding, { symbol: 'BTC', category: 'crypto', valueVnd: 100 }],
    transactions: [{ id: 'btc', date: '2026-10-08', assetSymbol: 'BTC', transactionType: 'buy', amountVnd: 100 }],
    portfolioSnapshots: [{ id: 'old', totalValueVnd: 200 }], categoryTargets: { crypto: 50, bonds: 50 }
  }))
  assert.deepEqual(result.holdings, [holding]); assert.equal(result.transactions.length, 0)
  assert.equal(result.portfolioSnapshots.length, 0); assert.deepEqual(result.categoryTargets, { bonds: 50 })
  assert.equal(result.pwaVersion, undefined)
})
test('Electron import rejects unrelated or malformed files without uploading anything', () => {
  for (const text of ['', 'invalid', 'null', '{}', '{"holdings":[],"transactions":{}}']) assert.throws(() => importer.parseElectronInvestmentImport(text))
})
test('valid noncrypto legacy import retains history but never trusts a file cloud version', () => {
  const result = importer.parseElectronInvestmentImport(JSON.stringify({ ...store, portfolioSnapshots: [{ id: 'old', totalValueVnd: 200 }] }))
  assert.equal(result.portfolioSnapshots.length, 1); assert.equal(result.pwaVersion, undefined)
})
