import assert from 'node:assert/strict'
import { test } from 'node:test'
import { transactionsForCategory } from '../src/renderer/src/lib/investment-history.ts'

test('gold history retains sold-out positions and all supported ring brands', () => {
  const holdings = [{ symbol: 'CUSTOM-GOLD', category: 'gold', valueVnd: 0, quantity: '0 chỉ' }]
  const transactions = ['VNHAN', 'PQHN24NTT', 'BT9999NTT', 'CUSTOM-GOLD', 'CASH', 'FPT'].map((assetSymbol, index) => ({ id: String(index), assetSymbol }))
  assert.deepEqual(transactionsForCategory(transactions, holdings, 'gold').map((tx) => tx.assetSymbol), ['VNHAN', 'PQHN24NTT', 'BT9999NTT', 'CUSTOM-GOLD'])
})

test('category history matches symbols without case sensitivity and preserves order', () => {
  const holdings = [{ symbol: 'fpt', category: 'stocks', valueVnd: 0 }]
  const transactions = [{ id: 'new', assetSymbol: 'FPT' }, { id: 'gold', assetSymbol: 'VNHAN' }, { id: 'old', assetSymbol: 'fpt' }]
  assert.deepEqual(transactionsForCategory(transactions, holdings, 'stocks').map((tx) => tx.id), ['new', 'old'])
})
