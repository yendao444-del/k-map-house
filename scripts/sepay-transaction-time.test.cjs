const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports = {}
  new Function('exports', code)(exports)
  return exports
}

const electron = load('src/renderer/src/lib/sepay-transaction-time.ts')
const pwa = load('adminpwa/src/renderer/src/lib/sepay-transaction-time.ts')

test('formats SePay local timestamps as Vietnamese date and precise time', () => {
  assert.deepEqual(electron.formatSepayTransactionTime('2026-10-12 13:34:05'), {
    date: '12/10/2026',
    time: '13:34:05',
    full: '12/10/2026 13:34:05'
  })
})

test('converts explicit UTC timestamps to Vietnam time and keeps midnight as 00', () => {
  assert.equal(electron.formatSepayTransactionTime('2026-10-11T17:00:00Z').full, '12/10/2026 00:00:00')
  assert.equal(electron.formatSepayTransactionTime('2026-10-12T13:34:05+07:00').full, '12/10/2026 13:34:05')
})

test('does not invent a time for date-only or invalid values', () => {
  assert.deepEqual(electron.formatSepayTransactionTime('2026-10-12'), {
    date: '12/10/2026', time: '', full: '12/10/2026'
  })
  assert.deepEqual(electron.formatSepayTransactionTime('not-a-date'), { date: '', time: '', full: '' })
  assert.deepEqual(electron.formatSepayTransactionTime(), { date: '', time: '', full: '' })
  assert.deepEqual(electron.formatSepayTransactionTime(''), { date: '', time: '', full: '' })
})

test('does not depend on the computer timezone', () => {
  const previousZone = process.env.TZ
  try {
    for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
      process.env.TZ = zone
      assert.equal(electron.formatSepayTransactionTime('2026-10-12 13:34:05').full, '12/10/2026 13:34:05')
    }
  } finally {
    if (previousZone === undefined) delete process.env.TZ
    else process.env.TZ = previousZone
  }
})

test('Electron and PWA timestamp formatters stay in sync', () => {
  for (const value of ['2026-10-12 08:01:02', '2026-10-11T17:00:00Z', '2026-10-12']) {
    assert.deepEqual(pwa.formatSepayTransactionTime(value), electron.formatSepayTransactionTime(value))
  }
})
