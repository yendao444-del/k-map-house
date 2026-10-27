const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadTs } = require('./load-email-test-module.cjs')
const funding = loadTs('src/renderer/src/lib/investment-funding.ts')
const store = transactions => ({ holdings: [], transactions, portfolioSnapshots: [], categoryTargets: {}, pwaVersion: 3 })
const tx = (id, type, amount, method = 'transfer') => ({ id, date: '2026-10-20', status: 'done', assetSymbol: type === 'deposit' ? 'CASH' : 'MH9999', amountVnd: Math.abs(amount), transactionType: type, fundingSource: 'investment-wallet', walletPosting: { paymentMethod: method, amount } })
const rich = { totalBalance: 20000000, bankBalance: 17000000, cashBalance: 3000000 }

for (const root of ['src/renderer/src', 'adminpwa/src/renderer/src']) {
  const api = loadTs(`${root}/lib/investment-auto-funding.ts`)
  const prepare = (transactions, overrides = {}) => api.prepareInvestmentPurchase({ next: transactions.at(-1), nextStore: store(transactions), readOperating: async () => rich, confirm: () => true, ...overrides })
  test(`${root}: enough investment balance never asks or moves operating money`, async () => {
    const result = await prepare([tx('d', 'deposit', 15000000), tx('b', 'buy', -14000000)], {
      confirm: () => assert.fail('Unexpected confirmation'), readOperating: () => assert.fail('Unexpected operating read')
    })
    assert.equal(funding.investmentBalance(result.store), 1000000)
    assert.deepEqual(result.transfers, [])
  })
  test(`${root}: zero/partial investment uses only exact shortfall`, async () => {
    for (const initial of [0, 5000000]) {
      let confirmation
      const transactions = [...(initial ? [tx('d', 'deposit', initial)] : []), tx('b', 'buy', -14000000)]
      const result = await prepare(transactions, { confirm: plan => { confirmation = plan; return true } })
      assert.equal(confirmation.shortfall, 14000000 - initial)
      assert.equal(confirmation.investmentAvailable, initial)
      assert.equal(funding.investmentBalance(result.store), 0)
      assert.equal(result.transfers.reduce((sum, t) => sum + t.amountVnd, 0), 14000000 - initial)
      assert.equal(result.store.transactions.at(-1).id, 'b')
      assert.ok(result.transfers.every(t => t.transactionType === 'deposit' && t.note.includes('MH9999') && t.linkedAssetSymbol === 'MH9999'))
      assert.equal(result.store.pwaVersion, 3)
    }
  })
  test(`${root}: cash/bank split respects preferred account and net balance`, () => {
    assert.deepEqual(api.planInvestmentTopUp(5000000, rich, 'cash'), [{ paymentMethod: 'cash', amount: -3000000 }, { paymentMethod: 'transfer', amount: -2000000 }])
    assert.deepEqual(api.planInvestmentTopUp(5000000, rich, 'transfer'), [{ paymentMethod: 'transfer', amount: -5000000 }])
    assert.throws(() => api.planInvestmentTopUp(14000000, { totalBalance: 400000, bankBalance: -5200000, cashBalance: 5600000 }, 'cash'), /Chưa thể mua/)
    assert.deepEqual(api.planInvestmentTopUp(400000, { totalBalance: 400000, bankBalance: -5200000, cashBalance: 5600000 }, 'transfer'), [{ paymentMethod: 'cash', amount: -400000 }])
    assert.throws(() => api.planInvestmentTopUp(1, { ...rich, bankBalance: NaN }, 'cash'))
  })
  test(`${root}: cancel is typed and input remains unchanged`, async () => {
    const transactions = [tx('b', 'buy', -14000000)]
    const original = JSON.stringify(transactions)
    await assert.rejects(prepare(transactions, { confirm: () => false }), api.InvestmentFundingCancelled)
    assert.equal(JSON.stringify(transactions), original)
  })
  test(`${root}: reject insufficient funds before asking; recheck after approval`, async () => {
    await assert.rejects(prepare([tx('b', 'buy', -21000000)], { confirm: () => assert.fail('Should not ask') }), /Chưa thể mua/)
    let reads = 0
    await assert.rejects(prepare([tx('b', 'buy', -14000000)], { readOperating: async () => ++reads === 1 ? rich : { totalBalance: 0, cashBalance: 0, bankBalance: 0 } }), /không đủ tiền/)
    assert.equal(reads, 2)
  })
  test(`${root}: reject duplicate/missing purchase, wrong amount and preexisting deficit`, async () => {
    const buy = tx('b', 'buy', -14000000)
    for (const nextStore of [store([]), store([buy, buy]), store([tx('old', 'buy', -1), buy])]) {
      await assert.rejects(prepare([], { next: buy, nextStore }))
    }
    await assert.rejects(prepare([{ ...buy, amountVnd: 1 }]))
  })
  test(`${root}: withdrawal, sale, delete and legacy never auto-fund`, async () => {
    for (const next of [tx('w', 'withdraw', -14000000), tx('s', 'sell', 1), undefined, { ...tx('b', 'buy', -1), fundingSource: 'wallet' }]) {
      const result = await prepare([], { next, confirm: () => assert.fail('Unexpected confirmation') })
      assert.deepEqual(result.transfers, [])
    }
  })
}

function harness(overrides = {}) {
  const api = loadTs('src/renderer/src/lib/investment-auto-funding.ts')
  const next = tx('b', 'buy', -14000000, 'cash')
  const nextStore = store([next])
  const log = []
  let saved
  const options = {
    next, nextStore, readCurrent: async () => store([]), readOperating: async () => rich,
    createPosting: async p => { log.push(['post', p]); return `receipt-${log.length}` },
    removePosting: async id => { log.push(['rollback', id]) },
    persist: async data => { saved = data },
    ...overrides
  }
  options.preparePurchase = () => api.prepareInvestmentPurchase({ next, nextStore, readOperating: options.readOperating, confirm: overrides.confirm || (() => true) })
  return { log, run: () => funding.commitInvestmentWallet(options), get saved() { return saved } }
}
test('Electron commits split receipts, linked deposits and purchase together', async () => {
  const h = harness()
  await h.run()
  assert.deepEqual(h.log.map(x => x[1]), [{ paymentMethod: 'cash', amount: -3000000 }, { paymentMethod: 'transfer', amount: -11000000 }])
  assert.deepEqual(h.saved.transactions.filter(t => t.transactionType === 'deposit').map(t => t.operatingPostingIds), [['receipt-1'], ['receipt-2']])
  assert.equal(funding.investmentBalance(h.saved), 0)
})
test('Electron cancellation or stale portfolio makes no ledger/persist calls', async () => {
  const cancelled = harness({ confirm: () => false })
  await assert.rejects(cancelled.run()); assert.deepEqual(cancelled.log, []); assert.equal(cancelled.saved, undefined)
  let reads = 0
  const stale = harness({ readCurrent: async () => { if (++reads > 1) throw Error('stale'); return store([]) } })
  await assert.rejects(stale.run(), /stale/); assert.deepEqual(stale.log, []); assert.equal(stale.saved, undefined)
})
test('Electron persistence and second receipt failures roll back existing receipts', async () => {
  const failed = harness({ persist: async () => { throw Error('disk failure') } })
  await assert.rejects(failed.run(), /disk failure/)
  assert.deepEqual(failed.log.filter(x => x[0] === 'rollback').map(x => x[1]), ['receipt-1', 'receipt-2'])
  let posts = 0
  const split = harness({ createPosting: async () => { if (++posts === 2) throw Error('receipt failure'); return 'first' } })
  await assert.rejects(split.run(), /receipt failure/)
  assert.deepEqual(split.log, [['rollback', 'first']]); assert.equal(split.saved, undefined)
})
