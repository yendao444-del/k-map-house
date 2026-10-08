import test from 'node:test'
import assert from 'node:assert/strict'
import { assessReading, demoMeterContexts } from '../src/meter-policy.mjs'
const electric = demoMeterContexts['demo-current-101'].electric
const water = demoMeterContexts['demo-current-101'].water
test('readings below the previous value and swapped electric/water numbers are blocked', () => {
  assert.equal(assessReading(287, 'electric', electric).status, 'retake')
  assert.equal(assessReading(12692, 'water', water).status, 'review')
  assert.equal(assessReading(12599, 'electric', electric).status, 'retake')
})
test('normal consumption and unchanged reading are allowed', () => {
  assert.deepEqual(assessReading(12692, 'electric', electric), { status: 'pass', reason: '', usage: 92 })
  assert.equal(assessReading(287, 'water', water).usage, 7)
  assert.equal(assessReading(12600, 'electric', electric).status, 'pass')
})
test('historical spikes and configured daily limits require review', () => {
  assert.equal(assessReading(13000, 'electric', electric).status, 'review')
  assert.equal(assessReading(14000, 'electric', { ...electric, recentDailyUsage: [] }).status, 'review')
  assert.equal(assessReading(12692, 'electric', { ...electric, elapsedDays: 1 }).status, 'review')
  assert.equal(assessReading(287, 'water', { ...water, recentDailyUsage: [0, 0, 0] }).status, 'pass')
})
test('a new contract handover does not need or expose former tenant readings', () => {
  assert.equal(assessReading(12692, 'electric', demoMeterContexts['demo-current-102'].electric).status, 'pass')
  assert.equal(assessReading(12692, 'electric', { previousReading: null }).status, 'review')
  assert.equal(assessReading(12692, 'electric').status, 'review')
})
test('invalid readings and invalid period configuration never pass', () => {
  for (const value of [-1, 1.5, NaN, Infinity, 100_000_000, '12692']) assert.notEqual(assessReading(value, 'electric', electric).status, 'pass')
  for (const context of [{ ...electric, elapsedDays: 0 }, { ...electric, previousReading: NaN }, { ...electric, maxDailyUsage: 0 }]) assert.equal(assessReading(12692, 'electric', context).status, 'review')
})
