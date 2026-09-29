import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commitInvestmentWallet, investmentBalance } from '../src/renderer/src/lib/investment-funding.ts'

const tx = (id, type, amount) => ({ id, transactionType: type, fundingSource: 'investment-wallet', walletPosting: { paymentMethod: 'cash', amount } })
const store = transactions => ({ holdings: [], transactions, portfolioSnapshots: [] })
function harness(current, next, previous, fail = false, actorRole) {
  const postings = [], removed = []
  let saved
  const nextStore = store([...current.transactions.filter(t => t.id !== previous?.id), ...(next ? [next] : [])])
  return { postings, removed, get saved() { return saved }, run: () => commitInvestmentWallet({
    actorRole, previous, next, nextStore, readCurrent: async () => current,
    readOperating: async () => ({ totalBalance: 10000000, cashBalance: 10000000, bankBalance: 0 }),
    createPosting: async p => { postings.push(p); return 'receipt-1' },
    removePosting: async id => { removed.push(id) },
    persist: async s => { if (fail) throw Error('disk failure'); saved = s }
  }) }
}
test('transfer 2M from operating creates opposite linked posting', async () => {
  const h = harness(store([]), tx('deposit', 'deposit', 2000000))
  await h.run()
  assert.equal(h.postings[0].amount, -2000000)
  assert.equal(investmentBalance(h.saved), 2000000)
  assert.deepEqual(h.saved.transactions[0].operatingPostingIds, ['receipt-1'])
})
test('buy 1.5M leaves 500K; another 600K fails despite rich operating wallet', async () => {
  const h = harness(store([tx('d', 'deposit', 2000000)]), tx('b', 'buy', -1500000))
  await h.run()
  assert.equal(investmentBalance(h.saved), 500000)
  assert.equal(h.postings.length, 0)
  await assert.rejects(harness(h.saved, tx('b2', 'buy', -600000)).run(), /Ví đầu tư không đủ/)
})
test('sell and cancel buy return money only to investment wallet', async () => {
  const buy = tx('b', 'buy', -2000000)
  const current = store([tx('d', 'deposit', 2000000), buy])
  for (const h of [harness(current, tx('s', 'sell', 2100000)), harness(current, undefined, buy)]) {
    await h.run(); assert.equal(h.postings.length, 0); assert.ok(investmentBalance(h.saved) >= 2000000)
  }
})
test('withdraw credits operating, cannot withdraw invested capital', async () => {
  const current = store([tx('d', 'deposit', 2000000)])
  const h = harness(current, tx('w', 'withdraw', -1000000))
  await h.run(); assert.equal(h.postings[0].amount, 1000000)
  await assert.rejects(harness(current, tx('w', 'withdraw', -3000000)).run())
})
test('failed persistence rolls back operating posting; legacy edits blocked', async () => {
  const h = harness(store([]), tx('d', 'deposit', 2000000), undefined, true)
  await assert.rejects(h.run(), /disk failure/); assert.deepEqual(h.removed, ['receipt-1'])
  const legacy = { ...tx('old', 'buy', -100000), fundingSource: 'wallet' }
  assert.equal(investmentBalance(store([legacy])), 0)
  await assert.rejects(harness(store([legacy]), undefined, legacy).run(), /Giao dịch cũ/)
})
test('admin deletes legacy buy/sell against operating wallet only', async () => {
  for (const amount of [-100000, 100000]) {
    const legacy = { ...tx('old', amount < 0 ? 'buy' : 'sell', amount), fundingSource: 'wallet' }
    const h = harness(store([legacy]), undefined, legacy, false, 'admin')
    await h.run()
    assert.equal(h.postings[0].amount, -amount)
    assert.equal(investmentBalance(h.saved), 0)
    assert.equal(h.saved.transactions.length, 0)
    await assert.rejects(harness(store([legacy]), undefined, legacy, false, 'staff').run())
    await assert.rejects(harness(store([legacy]), tx('old', 'buy', -200000), legacy, false, 'admin').run())
  }
})
test('failed admin deletion compensates wallet; unposted legacy never fabricates refund', async () => {
  const legacy = { ...tx('old', 'buy', -100000), fundingSource: 'wallet' }
  const h = harness(store([legacy]), undefined, legacy, true, 'admin')
  await assert.rejects(h.run(), /disk failure/)
  assert.deepEqual(h.removed, ['receipt-1'])
  const unposted = { ...legacy, walletPosting: undefined }
  const clean = harness(store([unposted]), undefined, unposted, false, 'admin')
  await clean.run()
  assert.equal(clean.postings.length, 0)
})
