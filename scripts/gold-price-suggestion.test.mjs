import assert from 'node:assert/strict'
import { test } from 'node:test'
import { suggestedGoldPricePerChi } from '../src/renderer/src/lib/goldApi.ts'

const quote = {
  success: true,
  source: 'live',
  livePriceCodes: ['SJ9999'],
  timestamp: 1790371806,
  time: '04:30',
  date: '2026-09-26',
  prices: {
    SJ9999: { name: 'SJC Ring', buy: 140900000, sell: 143900000, currency: 'VND' },
    PQHN24NTT: { name: 'PNJ 24K', buy: 141400000, sell: 144400000, currency: 'VND' }
  }
}

test('suggests the dealer sell price for a purchase and buy price for a sale', () => {
  assert.equal(suggestedGoldPricePerChi(quote, 'SJ9999', 'buy'), 14390000)
  assert.equal(suggestedGoldPricePerChi(quote, 'SJ9999', 'sell'), 14090000)
})

test('does not present fallback or missing quotes as current prices', () => {
  assert.equal(suggestedGoldPricePerChi({ ...quote, source: 'fallback' }, 'SJ9999', 'buy'), 0)
  assert.equal(suggestedGoldPricePerChi(quote, 'PQHN24NTT', 'buy'), 0)
  assert.equal(suggestedGoldPricePerChi(null, 'SJ9999', 'buy'), 0)
})
