const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  const exports = {}
  new Function('require', 'exports', code)((name) => {
    if (name in imports) return imports[name]
    if (name.startsWith('.')) {
      const resolved = path.resolve(path.dirname(file), name)
      return load(fs.existsSync(resolved + '.ts') ? resolved + '.ts' : resolved + '.tsx', imports)
    }
    return require(name)
  }, exports)
  return exports
}
const lib = load('src/renderer/src/lib/sepay-email.ts')
const success = load('src/renderer/src/lib/payment-success-email.ts')
const since = Date.parse('2026-10-05T02:00:00Z')
const record = { source: 'sepay', external_ref: 'BANK-123', amount: 1500000, created_at: '2026-10-05T02:05:00Z' }
const invoice = { id: 'old-debt', room_id: '152', month: 9, year: 2026, total_amount: 4388000, paid_amount: 1500000, payment_status: 'partial', debt_confirmed_at: '2026-10-01', payment_records: [record] }

test('new SePay receipt on an old confirmed invoice creates matched email with remaining balance', () => {
  const events = lib.getNewSepayPaymentEmails([invoice], since, () => 'Phòng 152')
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'sepay_matched')
  assert.equal(events[0].remaining, 2888000)
  assert.equal(events[0].month, 9)
  assert.match(lib.buildSepayEmail(events[0]).html, /2\.888\.000 đ/)
})

test('success email includes stored invoice details and recipient without external links', () => {
  const source = { ...invoice, room_cost: 2500000, electric_cost: 250000, water_cost: 100000,
    wifi_cost: 100000, garbage_cost: 50000, total_amount: 3000000, paid_amount: 3000000 }
  const event = lib.getNewSepayPaymentEmails([source], since, () => 'Phòng <152>')[0]
  const mail = lib.buildSepayEmail({ ...event, recipientName: 'Người nhận <A>' })
  assert.match(mail.html, /Xin chào Người nhận &lt;A&gt;,/)
  assert.match(mail.html, /Phòng &lt;152&gt;/)
  for (const label of ['Chi tiết hóa đơn', 'Tiền phòng', 'Tiền điện', 'Tiền nước', 'Internet', 'Vệ sinh', 'Tổng hóa đơn', 'Đã thanh toán']) assert.ok(mail.html.includes(label))
  assert.match(mail.html, /2\.500\.000 đ/)
  assert.equal(event.invoiceTotal, 3000000)
  assert.equal(event.paidAmount, 3000000)
  assert.equal(event.remaining, 0)
  assert.equal(event.amount, 1500000) // Receipt amount differs from accumulated paid total.
  assert.doesNotMatch(mail.html, /<a\b|<button\b|https?:\/\//i)
  assert.doesNotMatch(mail.html, /Đào Bình Yên|Xem hóa đơn/)
})

test('settlement receipt preserves signed deposit and stored debt totals without adding damage twice', () => {
  const source = { ...invoice, room_cost: 3000000, old_debt: 500000, merged_debt_total: 1000000,
    deposit_amount: -2000000, adjustment_amount: 200000, adjustment_note: '<Hư hỏng>',
    damage_amount: 200000, total_amount: 2700000, paid_amount: 1500000 }
  const event = lib.getNewSepayPaymentEmails([source], since, () => 'Phòng 152')[0]
  assert.equal(event.invoiceTotal, 2700000)
  assert.equal(event.remaining, 1200000)
  assert.equal(event.invoiceLines.find(line => line.label === 'Trừ / hoàn tiền cọc').amount, -2000000)
  assert.equal(event.invoiceLines.filter(line => line.amount === 200000).length, 1)
  const mail = lib.buildSepayEmail(event)
  assert.match(mail.html, /-2\.000\.000 đ/)
  assert.match(mail.html, /Điều chỉnh \(&lt;Hư hỏng&gt;\)/)
  assert.match(mail.html, /1\.200\.000 đ/)
  assert.equal(source.total_amount, 2700000)
})

test('transfer invoice includes prior room charges and missing snapshots remain explicit', () => {
  const snapshot = success.getInvoiceEmailSnapshot({ ...invoice, has_transfer: true,
    transfer_old_room_name: '101', transfer_room_cost: 500000, transfer_electric_cost: 100000,
    transfer_water_cost: 50000, transfer_service_cost: 20000, room_cost: 2000000 })
  assert.equal(snapshot.invoiceLines[0].label, 'Tiền phòng cũ (101)')
  assert.ok(snapshot.invoiceLines.some(line => line.label === 'Tiền phòng mới'))
  assert.equal(snapshot.invoiceTotal, invoice.total_amount)
  const html = lib.buildSepayEmail({ type: 'sepay_matched', transactionKey: 'BANK', amount: 1000 }).html
  assert.match(html, /Chưa có dữ liệu chi tiết hóa đơn/)
  assert.doesNotMatch(html, /undefined|NaN/)
})

test('opening the app does not replay old receipts, cash payments, or missing transaction refs', () => {
  const mixed = { ...invoice, payment_records: [
    { ...record, created_at: '2026-10-04T00:00:00Z' },
    { ...record, source: 'manual' },
    { ...record, external_ref: null },
    { ...record, amount: -1500000 },
    { ...record, created_at: 'bad-date' }
  ] }
  assert.deepEqual(lib.getNewSepayPaymentEmails([mixed], since, () => ''), [])
})

test('recipient preferences honor opt-out, inactive accounts and missing email', () => {
  const user = { id: 'u', status: 'active', notification_email: 'receiver@example.com', email_notifications_enabled: true, email_notification_preferences: { sepay_matched: true } }
  const event = { type: 'sepay_matched' }
  assert.equal(lib.canReceiveSepayEmail(user, event), true)
  for (const change of [
    { email_notifications_enabled: false }, { status: 'inactive' },
    { notification_email: '' }, { email_notification_preferences: { sepay_matched: false } },
    { email_notification_preferences: {} }
  ]) assert.equal(lib.canReceiveSepayEmail({ ...user, ...change }, event), false)
})

test('dedupe keys survive different transaction formatting; email escapes bank content', () => {
  const event = { type: 'sepay_unmatched', transactionKey: 'BANK-123', amount: 1000, content: '<script>bad</script>' }
  assert.equal(lib.sepayEmailKey(event, 'u'), lib.sepayEmailKey({ ...event, transactionKey: 'bank 123' }, 'u'))
  assert.notEqual(lib.sepayEmailKey(event, 'u'), lib.sepayEmailKey({ ...event, type: 'sepay_matched' }, 'u'))
  assert.match(lib.buildSepayEmail(event).html, /&lt;script&gt;/)
  assert.doesNotMatch(lib.buildSepayEmail(event).html, /<script>/)
})

function notificationHarness() {
  let props, callbacks = [], query = {}, sends = [], invalidations = []
  const refs = []; let cursor = 0
  const hook = load('src/renderer/src/lib/use-sepay-email-notifications.ts', {
    react: { useRef(initial) { const slot = cursor++; return refs[slot] ||= { current: initial } }, useEffect(fn) { callbacks.push(fn) } },
    '@tanstack/react-query': {
      useQuery: () => ({ data: query }),
      useQueryClient: () => ({ invalidateQueries: (key) => { invalidations.push(key) } })
    },
    './db': {
      getUsers: async () => [{ id: 'u', status: 'active', notification_email: 'receiver@example.com', email_notifications_enabled: true, email_notification_preferences: { sepay_matched: true, sepay_unmatched: true } }],
      sendEmailNotification: async (mail) => { sends.push(mail); return { ok: true } }
    }
  })
  const render = (extra = {}) => {
    props = { enabled: true, userId: 'admin', invoices: [], rooms: [], transactions: [], transactionsReady: false, ...props, ...extra }
    cursor = 0; callbacks = []
    hook.useSepayEmailNotifications(props)
    return callbacks
  }
  return { render, sends, invalidations, setGmail: (value) => { query = value } }
}

test('background hook waits for Gmail, then sends new receipts once without touching payment amounts', async () => {
  const h = notificationHarness()
  h.setGmail({ available: true, authenticated: false })
  const initial = h.render()
  initial.forEach((fn) => fn())
  const recent = { ...invoice, payment_records: [{ ...record, created_at: new Date(Date.now() + 1000).toISOString() }] }
  let effects = h.render({ invoices: [recent] })
  effects[effects.length - 1]()
  assert.equal(h.sends.length, 0)
  h.setGmail({ available: true, authenticated: true })
  effects = h.render()
  const cleanup = effects[effects.length - 1]()
  await new Promise((resolve) => setImmediate(resolve))
  cleanup()
  assert.equal(h.sends.length, 1)
  assert.equal(h.sends[0].eventType, 'sepay_matched')
  assert.equal(recent.paid_amount, 1500000)
  effects = h.render()
  const cleanup2 = effects[effects.length - 1]()
  await new Promise((resolve) => setImmediate(resolve))
  cleanup2()
  assert.equal(h.sends.length, 1)
  assert.equal(h.invalidations.length, 1)
})

function senderHarness(existing, claimed = { id: 'delivery' }, sendThrows = false, options = {}) {
  const stages = [
    { data: { id: 'u', notification_email: 'receiver@example.com', email_notifications_enabled: true, email_notification_preferences: { sepay_matched: true }, ...options.recipient } },
    { data: existing },
    { data: claimed },
    { data: null }
  ]
  const changes = []; let sent = 0
  const supabase = {
    rpc: async () => ({ data: { enabled: false }, error: null }),
    auth: { getSession: async () => ({ data: { session: { user: { id: 'admin' } } } }) },
    from() {
      const chain = { then(resolve) { return Promise.resolve(stages.shift()).then(resolve) } }
      for (const name of ['select','eq','insert','update','single','maybeSingle']) {
        chain[name] = (...args) => { if (name === 'update' || name === 'insert') changes.push(args[0]); return chain }
      }
      return chain
    }
  }
  const source = fs.readFileSync('src/renderer/src/lib/db.ts', 'utf8')
  const fn = source.slice(source.indexOf('export const sendEmailNotification = '), source.indexOf('export const resetUserPassword = '))
  const code = ts.transpileModule(fn, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  new Function('exports','window','supabase','normalizeEmailNotificationPreferences',code)(exports,
    { api: { gmail: {
      getAvailability: async () => ({ available: true, authenticated: true }),
      sendNotification: async () => { sent++; if (sendThrows) throw new Error('Phiên hết hạn'); return { ok: true, messageId: 'gmail-id' } }
    } } },supabase, (prefs) => prefs)
  return { send: () => exports.sendEmailNotification({ recipientUserId: 'u', eventType: options.eventType || 'sepay_matched', subject: 'Test', html: 'Test', dedupeKey: 'u:tx' }), changes, sent: () => sent }
}

test('failed emails can be retried with the same dedupe key, sent emails are skipped', async () => {
  const failed = senderHarness({ id: 'delivery', status: 'failed' })
  assert.equal((await failed.send()).status, 'sent')
  assert.equal(failed.sent(), 1)
  assert.equal(failed.changes[0].status, 'sending')
  assert.equal(failed.changes[1].status, 'sent')
  const completed = senderHarness({ id: 'delivery', status: 'sent' })
  assert.equal((await completed.send()).status, 'skipped')
  assert.equal(completed.sent(), 0)
})

test('another sender claiming the row does not send duplicate mail', async () => {
  const h = senderHarness({ id: 'delivery', status: 'failed' }, null)
  assert.equal((await h.send()).status, 'skipped')
  assert.equal(h.sent(), 0)
})

test('IPC failure is recorded as failed instead of leaving the email stuck sending', async () => {
  const h = senderHarness({ id: 'delivery', status: 'failed' }, { id: 'delivery' }, true)
  assert.equal((await h.send()).ok, false)
  assert.equal(h.changes[1].status, 'failed')
  assert.equal(h.changes[1].error_message, 'Phiên hết hạn')
})

test('manual test email works with all categories off, while real notifications still respect opt-out', async () => {
  const options = { eventType: 'email_test', recipient: { email_notification_preferences: {} } }
  const trial = senderHarness(null, { id: 'delivery' }, false, options)
  assert.equal((await trial.send()).status, 'sent')
  assert.equal(trial.sent(), 1)
  assert.equal(trial.changes[0].event_type, 'email_test')
  const real = senderHarness(null, { id: 'delivery' }, false, { recipient: options.recipient })
  assert.equal((await real.send()).ok, false)
  assert.equal(real.sent(), 0)
  assert.equal(real.changes.length, 0)
  const disabled = senderHarness(null, { id: 'delivery' }, false, { ...options, recipient: { email_notifications_enabled: false } })
  assert.equal((await disabled.send()).ok, false)
  assert.equal(disabled.sent(), 0)
})

function panelHarness({ authenticated = true, enabled = true, email = 'receiver@example.com', state = {}, result = { ok: true, status: 'sent' } } = {}) {
  const mutations = [], sends = [], invalidations = [], queries = [], stateUpdates = {}
  let cursor = 0
  const component = load('src/renderer/src/components/EmailNotificationPanel.tsx', {
    react: { useRef: value => ({ current: value }), useMemo: (fn) => fn(), useState: (initial) => { const slot = cursor++; const value = slot in state ? state[slot] : initial; return [value, next => { stateUpdates[slot] = typeof next === 'function' ? next(value) : next }] } },
    '@tanstack/react-query': {
      useQuery: (config) => { queries.push(config); return { data: config.queryKey[0] === 'gmail-availability' ? { available: true, authenticated } : [] } },
      useMutation: (config) => { mutations.push(config); return { isPending: false, mutate: () => {} } },
      useQueryClient: () => ({ invalidateQueries: (key) => { invalidations.push(key) } })
    },
    '../lib/db': {
      getEmailDeliveryAvailability: async () => ({ available: true, authenticated }),
      sendEmailNotification: async (mail) => { sends.push(mail); return result },
      updateUserProfile: () => { throw new Error('Unexpected real settings write') }
    },
    '../lib/email-notification-preferences': { emailNotificationOptions: [], normalizeEmailNotificationPreferences: (value) => value || {} },
  })
  const tree = component.EmailNotificationPanel({ user: { id: 'u', full_name: '<User>', status: 'active', notification_email: email, email_notifications_enabled: enabled }, onClose() {} })
  const buttons = []
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    if (node.type === 'button') buttons.push(node)
    visit(node.props?.children)
  }
  visit(tree)
  return { buttons, mutations, sends, invalidations, queries, stateUpdates, tree }
}

test('original Gmail buttons open testing without sending or appending a second testing panel', () => {
  const h = panelHarness()
  assert.equal(h.buttons.find(button => button.props.children === 'Gửi Gmail').props.disabled, true)
  h.buttons.find(button => button.props.children === 'Kiểm thử').props.onClick()
  assert.equal(h.stateUpdates[8], true)
  assert.equal(h.sends.length, 0)
  assert.ok(!JSON.stringify(h.tree).includes('Kiểm thử từng loại thông báo'))
  assert.ok(!JSON.stringify(h.tree).includes('Loại thông báo'))
  assert.ok(!JSON.stringify(h.tree).includes('Gửi mẫu này'))
})

test('sandbox receives no live data and disables queries and real send/connect/save mutations', async () => {
  const h = panelHarness({ authenticated: false, enabled: false, email: '', state: { 8: true } })
  assert.equal(h.tree.type.name, 'EmailNotificationSandbox')
  assert.deepEqual(Object.keys(h.tree.props).sort(), ['onBack', 'onClose'])
  assert.equal(h.queries.length, 4)
  assert.ok(h.queries.every(query => query.enabled === false))
  for (const mutation of h.mutations) {
    await assert.rejects(mutation.mutationFn(), /Chế độ kiểm thử/)
  }
  assert.equal(h.sends.length, 0)
  assert.equal(h.invalidations.length, 0)
  h.tree.props.onBack()
  assert.equal(h.stateUpdates[8], false)
})

function sandboxHarness(state = {}) {
  let cursor = 0
  const updates = {}, nodes = []
  const forbidden = new Proxy({}, { get() { throw new Error('Sandbox accessed real infrastructure') } })
  const component = load('src/renderer/src/components/EmailNotificationSandbox.tsx', {
    react: {
      useMemo: fn => fn(),
      useState: initial => {
        const slot = cursor++
        const value = slot in state ? state[slot] : initial
        return [value, next => { updates[slot] = typeof next === 'function' ? next(value) : next }]
      }
    },
    '../lib/db': forbidden,
    './db': forbidden,
    '@tanstack/react-query': forbidden
  })
  const tree = component.EmailNotificationSandbox({ onBack() {}, onClose() {} })
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    nodes.push(node)
    visit(node.props?.children)
  }
  visit(tree)
  return { tree, nodes, updates }
}

test('running a partial SePay sandbox uses synthetic recipient/invoice and only records an in-memory result', () => {
  const state = { 0: 'sepay_matched', 1: 'partial' }
  const h = sandboxHarness(state)
  const preview = h.nodes.find(node => node.type === 'iframe').props.srcDoc
  assert.match(preview, /Tài khoản mẫu/)
  assert.match(preview, /Phòng mẫu 101/)
  assert.match(preview, /2\.000\.000 đ/)
  assert.doesNotMatch(preview, /receiver@example\.com|&lt;User&gt;/)
  assert.ok(!h.nodes.some(node => node.props.role === 'status'))
  h.nodes.find(node => node.type === 'button' && node.props.children === 'Chạy kiểm thử').props.onClick()
  assert.equal(h.updates[2].wouldSend, true)
  assert.equal(h.updates[2].secondWouldSend, false)
  assert.equal(h.updates[3], 1)
  assert.equal(h.updates[4], true)
  const completed = sandboxHarness({ ...state, ...h.updates })
  assert.ok(completed.nodes.some(node => node.props.role === 'status'))
  assert.doesNotMatch(JSON.stringify(completed.tree), /Lưu cài đặt Gmail|Lịch sử gửi gần đây|Gửi Gmail thử/)
  assert.ok(completed.nodes.some(node => node.type === 'details' && node.props.open === true))
  completed.nodes.find(node => node.type === 'button' && node.props.children === 'Chạy kiểm thử').props.onClick()
  assert.equal(completed.updates[3], 2)
})

test('changing the sandbox scenario or notification type clears the previous result', () => {
  const h = sandboxHarness({ 0: 'sepay_matched', 1: 'partial', 2: { summary: 'old result', checks: [] } })
  const selects = h.nodes.filter(node => node.type === 'select')
  selects[1].props.onChange({ target: { value: 'duplicate' } })
  assert.equal(h.updates[1], 'duplicate')
  assert.equal(h.updates[2], null)
  selects[0].props.onChange({ target: { value: 'rent_overdue' } })
  assert.equal(h.updates[0], 'rent_overdue')
  assert.equal(h.updates[1], 'overdue')
  assert.equal(h.updates[2], null)
})

test('real Gmail action still respects live recipient and connection state', () => {
  for (const options of [{ authenticated: false }, { enabled: false }, { email: '' }, { state: { 4: 'changed@example.com' } }]) {
    const h = panelHarness(options)
    assert.equal(h.buttons.find(button => button.props.children === 'Gửi Gmail').props.disabled, true)
    assert.equal(h.sends.length, 0)
    assert.ok(h.queries.every(query => query.enabled === true))
  }
})
