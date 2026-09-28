import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  commitFundedInvestment,
  fundingAdjustments,
  investmentWalletImpact,
  validateFunding
} from '../src/renderer/src/lib/investment-funding.ts'

test('400K cannot fund a 14M purchase even if one account has more money', () => {
  assert.throws(
    () =>
      validateFunding({ totalBalance: 400000, bankBalance: -5200000, cashBalance: 5600000 }, [
        { paymentMethod: 'cash', amount: -14000000 }
      ]),
    /không đủ tiền/
  )
})
test('exact balance is allowed; source wallet cannot overdraw', () => {
  const balances = { totalBalance: 14000000, bankBalance: 14000000, cashBalance: 0 }
  assert.doesNotThrow(() =>
    validateFunding(balances, [{ paymentMethod: 'transfer', amount: -14000000 }])
  )
  assert.throws(
    () => validateFunding(balances, [{ paymentMethod: 'cash', amount: -1 }]),
    /Ví tiền mặt/
  )
})
test('all purchase types use wallet, invalid and imported capital cannot bypass funding', () => {
  assert.equal(investmentWalletImpact('buy', 14000000), -14000000)
  assert.equal(investmentWalletImpact('sell', 15000000), 15000000)
  for (const amount of [NaN, Infinity, -1, 0])
    assert.throws(() => investmentWalletImpact('buy', amount))
  assert.throws(() => investmentWalletImpact('import-existing', 14000000))
})
test('legacy trades do not invent refunds; editing linked trades posts only the difference', () => {
  assert.deepEqual(fundingAdjustments({ walletImpactVnd: -14000000 }), [])
  assert.deepEqual(
    fundingAdjustments(
      { walletPosting: { paymentMethod: 'transfer', amount: -14000000 } },
      { paymentMethod: 'transfer', amount: -15000000 }
    ),
    [{ paymentMethod: 'transfer', amount: -1000000 }]
  )
  assert.deepEqual(
    fundingAdjustments({ walletPosting: { paymentMethod: 'transfer', amount: -14000000 } }),
    [{ paymentMethod: 'transfer', amount: 14000000 }]
  )
})
test('deleting a sale cannot spend proceeds already used', () => {
  const adjustments = fundingAdjustments({
    walletPosting: { paymentMethod: 'transfer', amount: 14000000 }
  })
  assert.throws(
    () =>
      validateFunding({ totalBalance: 400000, bankBalance: 400000, cashBalance: 0 }, adjustments),
    /không đủ tiền/
  )
})
function fixture(overrides = {}) {
  const log = []
  return {
    log,
    options: {
      nextPosting: { paymentMethod: 'transfer', amount: -14000000 },
      nextStore: {},
      reference: 'test',
      date: '2026-09-28',
      readBalances: async () => ({ totalBalance: 15000000, bankBalance: 15000000, cashBalance: 0 }),
      createPosting: async (p) => {
        log.push(['post', p.amount])
        return 'ledger-1'
      },
      removePosting: async (id) => {
        log.push(['rollback', id])
      },
      persist: async () => {
        log.push(['persist'])
      },
      ...overrides
    }
  }
}
test('funding is checked again at commit; rejected purchase writes nothing', async () => {
  const { log, options } = fixture({
    readBalances: async () => ({ totalBalance: 400000, bankBalance: 400000, cashBalance: 0 })
  })
  await assert.rejects(commitFundedInvestment(options), /không đủ tiền/)
  assert.deepEqual(log, [])
})
test('successful purchase debits ledger before saving holdings', async () => {
  const { log, options } = fixture()
  await commitFundedInvestment(options)
  assert.deepEqual(log, [['post', -14000000], ['persist']])
})
test('portfolio write failure rolls back ledger and reports failure', async () => {
  const { log, options } = fixture({
    persist: async () => {
      throw new Error('disk full')
    }
  })
  await assert.rejects(commitFundedInvestment(options), /disk full/)
  assert.deepEqual(log, [
    ['post', -14000000],
    ['rollback', 'ledger-1']
  ])
})
test('rollback failure requires reconciliation instead of claiming success', async () => {
  const { options } = fixture({
    persist: async () => {
      throw new Error('disk full')
    },
    removePosting: async () => {
      throw new Error('offline')
    }
  })
  await assert.rejects(commitFundedInvestment(options), /đối soát/)
})
test('changing source wallet rolls back the first leg if the second leg fails', async () => {
  let count = 0
  const { log, options } = fixture({
    previous: { walletPosting: { paymentMethod: 'cash', amount: -14000000 } },
    createPosting: async () => {
      if (++count === 2) throw new Error('network')
      return 'first-leg'
    }
  })
  await assert.rejects(commitFundedInvestment(options), /network/)
  assert.deepEqual(log, [['rollback', 'first-leg']])
})
test('unavailable or invalid balance never authorizes a purchase', async () => {
  assert.throws(
    () => validateFunding({ totalBalance: NaN, bankBalance: 0, cashBalance: 0 }, []),
    /số dư Ví/
  )
  const { log, options } = fixture({
    readBalances: async () => {
      throw new Error('offline')
    }
  })
  await assert.rejects(commitFundedInvestment(options), /offline/)
  assert.deepEqual(log, [])
})
