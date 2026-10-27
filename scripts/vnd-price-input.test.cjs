const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadTs } = require('./load-email-test-module.cjs')
const { formatVndPriceInput, normalizeVndPriceInput } = loadTs('src/renderer/src/lib/vnd-price-input.ts')

test('gold price suggestions and manual input display Vietnamese thousands separators', () => {
  assert.equal(formatVndPriceInput(13550000), '13.550.000')
  assert.equal(formatVndPriceInput('13250000'), '13.250.000')
  for (const [raw, formatted] of [['1', '1'], ['500', '500'], ['1000', '1.000'], ['1000000', '1.000.000'], ['', ''], ['0', '0']]) {
    assert.equal(formatVndPriceInput(raw), formatted)
  }
})

test('pasting separators and clearing keep numeric transaction math unchanged', () => {
  for (const input of ['13550000', '13.550.000', ' 13.550.000 ', '013550000']) {
    const raw = normalizeVndPriceInput(input)
    assert.equal(raw, '13550000')
    assert.equal(Number(raw) * 2, 27100000)
    assert.equal(formatVndPriceInput(raw), '13.550.000')
  }
  assert.equal(normalizeVndPriceInput(''), '')
  for (const invalid of ['-13550000', '1e6', 'abc', '13,5']) assert.equal(normalizeVndPriceInput(invalid), null)
})
