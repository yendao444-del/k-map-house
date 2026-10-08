const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('require', 'exports', code)((name) => {
    if (name in imports) return imports[name]
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'), imports)
    return require(name)
  }, exports)
  return exports
}
const lib = load('src/renderer/src/lib/email-notification-testing.ts', { './db': new Proxy({}, { get() { throw new Error('Simulation accessed DB') } }) })
const prefs = load('src/renderer/src/lib/email-notification-preferences.ts')
const user = { id: 'u', full_name: '<Receiver>', status: 'active', notification_email: 'receiver@example.com', email_notifications_enabled: true, email_notification_preferences: Object.fromEntries(prefs.emailNotificationOptions.map(({ key }) => [key, true])) }
const gmail = { available: true, authenticated: true }
const clock = new Date(2026, 0, 5, 12)
const make = (type, scenario) => lib.createNotificationTestCase(type, scenario, user.full_name, clock)

test('every type and scenario has labelled sample mail and simulation never touches DB', () => {
  assert.equal(Object.keys(lib.notificationTestScenarios).length, 7)
  for (const [type, scenarios] of Object.entries(lib.notificationTestScenarios)) {
    for (const scenario of scenarios) {
      const c = make(type, scenario.id)
      assert.match(c.mail.subject, /^\[KIỂM THỬ\]/)
      assert.match(c.mail.html, /Dữ liệu giả/)
      assert.match(c.mail.html, /max-width:528px/)
      assert.match(c.mail.html, /border-top:6px solid/)
      assert.match(c.mail.html, /font-family:Arial,Helvetica,sans-serif/)
      assert.match(c.mail.html, /aria-label="Thông tin (thanh toán|thông báo)"/)
      assert.match(c.mail.html, /&lt;Receiver&gt;/)
      assert.doesNotMatch(c.mail.html, /<a\b|<button\b|https?:\/\//i)
      if (type !== 'sepay_matched') assert.doesNotMatch(c.mail.html, /Thanh toán thành công/)
      const before = JSON.stringify(c)
      lib.simulateNotification(c, user, gmail)
      assert.equal(JSON.stringify(c), before)
      const payload = lib.buildNotificationSamplePayload(c, user.id, 'unique-run')
      assert.equal(payload.eventType, 'email_test')
      assert.equal(payload.payload.notificationType, type)
      assert.equal(payload.payload.scenarioId, scenario.id)
      assert.equal(payload.payload.test, true)
      assert.match(payload.dedupeKey, /notification_sample/)
    }
  }
})

test('shared email layout preserves scenario facts instead of inventing a successful payment', () => {
  const checkout = make('room_checkout_due', 'future')
  assert.match(checkout.mail.html, /chưa đến hạn trả phòng/)
  assert.match(checkout.mail.html, /Hạn trả phòng/)
  assert.doesNotMatch(checkout.mail.html, /Đã thanh toán|Chi tiết hóa đơn/)
  const paid = make('rent_overdue', 'paid')
  assert.match(paid.mail.html, /đã trả hết, không còn nợ/)
  assert.doesNotMatch(paid.mail.html, /Chi tiết hóa đơn/)
  assert.match(paid.mail.html, />0 đ</)
  const old = make('rent_overdue', 'old_debt')
  assert.match(old.mail.html, /500\.000 đ/)
  assert.doesNotMatch(old.mail.html, /Chi tiết hóa đơn/)
  const unmatched = make('sepay_unmatched', 'no_invoice')
  assert.match(unmatched.mail.html, /Chưa xác định/)
  assert.doesNotMatch(unmatched.mail.html, /Chi tiết hóa đơn|Thanh toán thành công/)
})

test('manual simulation uses real due-room and rent target criteria with positive and negative scenarios', () => {
  for (const [type, scenario, expected] of [
    ['room_checkout_due', 'due', true], ['room_checkout_due', 'future', false],
    ['rent_overdue', 'overdue', true], ['rent_overdue', 'paid', false],
    ['rent_overdue', 'before15', false], ['rent_overdue', 'old_debt', true]
  ]) {
    const result = lib.simulateNotification(make(type, scenario), user, gmail)
    assert.equal(result.wouldSend, expected, `${type}/${scenario}`)
    assert.equal(result.secondWouldSend, false)
  }
  assert.match(make('room_checkout_due', 'due').mail.html, /&lt;Receiver&gt;/)
})

test('confirmed old debt crosses year boundary and partial receipt carries correct remaining amount', () => {
  const old = make('sepay_matched', 'old_debt')
  assert.equal(old.event.month, 12)
  assert.equal(old.event.year, 2025)
  assert.equal(lib.simulateNotification(old, user, gmail).wouldSend, true)
  const partial = make('sepay_matched', 'partial')
  assert.equal(partial.event.remaining, 2000000)
  assert.match(partial.mail.html, /2\.000\.000 đ/)
  assert.equal(lib.simulateNotification(make('sepay_matched', 'historical'), user, gmail).wouldSend, false)
  const duplicate = lib.simulateNotification(make('sepay_matched', 'duplicate'), user, gmail)
  assert.equal(duplicate.wouldSend, false)
  assert.equal(duplicate.secondWouldSend, false)
  assert.equal(duplicate.checks.at(-1).status, 'pass')
})

test('SePay transfer classification respects manual-review and wait-for-record cases', () => {
  for (const scenario of ['no_invoice', 'partial', 'over', 'ambiguous']) {
    const c = make('sepay_unmatched', scenario)
    assert.equal(c.event.type, 'sepay_unmatched')
    assert.equal(lib.simulateNotification(c, user, gmail).wouldSend, true)
  }
  for (const scenario of ['awaiting', 'recorded']) {
    const c = make('sepay_unmatched', scenario)
    assert.equal(c.event, undefined)
    assert.equal(lib.simulateNotification(c, user, gmail).wouldSend, false)
  }
})

test('simulation rejects saved opt-out, inactive/missing recipient and Gmail not ready', () => {
  const c = make('sepay_matched', 'full')
  for (const change of [{ status: 'inactive' }, { notification_email: '' }, { email_notifications_enabled: false }, { email_notification_preferences: { sepay_matched: false } }]) {
    const result = lib.simulateNotification(c, { ...user, ...change }, gmail)
    assert.equal(result.wouldSend, false)
    assert.equal(result.checks[2].status, 'blocked')
  }
  assert.equal(lib.simulateNotification(c, user, { available: true, authenticated: false }).wouldSend, false)
})

test('template-only types never report a working real notification flow', () => {
  for (const type of ['rent_long_unpaid', 'invoices_services', 'contract_expiring']) {
    const result = lib.simulateNotification(make(type, 'sample'), user, gmail)
    assert.equal(result.wouldSend, false)
    assert.equal(result.checks[0].status, 'unavailable')
    assert.match(result.summary, /Chưa có luồng thực tế/)
  }
})

test('semantic colors distinguish review, debt, information and reminders without false success', () => {
  for (const [type, scenario, color] of [
    ['sepay_matched', 'partial', '#00765a'],
    ['sepay_unmatched', 'partial', '#c81e25'],
    ['sepay_unmatched', 'awaiting', '#1d4ed8'],
    ['sepay_unmatched', 'recorded', '#00765a'],
    ['rent_overdue', 'old_debt', '#b45309'],
    ['rent_overdue', 'paid', '#00765a'],
    ['rent_long_unpaid', 'sample', '#b45309'],
    ['invoices_services', 'sample', '#1d4ed8'],
    ['contract_expiring', 'sample', '#6d28d9']
  ]) assert.ok(make(type, scenario).mail.html.includes('border-top:6px solid ' + color), `${type}/${scenario}`)
  assert.doesNotMatch(make('sepay_unmatched', 'awaiting').mail.html, /Giao dịch chưa khớp|CẦN ĐỐI SOÁT/)
  assert.doesNotMatch(make('sepay_unmatched', 'recorded').mail.html, /Giao dịch chưa khớp|CẦN ĐỐI SOÁT/)
})

test('long-unpaid email shows one balance and only concise debt facts', () => {
  const html = make('rent_long_unpaid', 'sample').mail.html
  assert.equal((html.match(/3\.000\.000 đ/g) || []).length, 1)
  assert.equal((html.match(/Còn phải thu/g) || []).length, 1)
  assert.match(html, /45 ngày/)
  assert.doesNotMatch(html, /Chi tiết hóa đơn|Tổng hóa đơn|Đã thanh toán|Chưa có luồng|không thỏa điều kiện/)
})

