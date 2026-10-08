const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/src/lib/contract-email-delivery.ts'), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const compiled = { exports: {} }
new Function('module', 'exports', output)(compiled, compiled.exports)
const { deliverContractEmail, saveAndDeliverContractEmail } = compiled.exports

function operations(overrides = {}) {
  const calls = []
  return { calls, prepare: async () => ({ email: 'test@example.com', id: 'confirmation-test' }), send: async () => ({ ok: true, messageId: 'gmail-id' }), mark: async (...args) => { calls.push(args) }, ...overrides }
}

test('successful send records Gmail ID and shows recipient and pending activation', async () => {
  const ops = operations()
  const result = await deliverContractEmail(ops)
  assert.equal(result.outcome, 'success')
  assert.match(result.message, /test@example.com.*72 giờ/)
  assert.match(result.message, /chưa được kích hoạt/)
  assert.equal(ops.calls[0][1], 'gmail-id')
  assert.equal(ops.calls[0][2], undefined)
})

test('failure before sending never calls Gmail', async () => {
  let sent = false
  const result = await deliverContractEmail(operations({ prepare: async () => { throw new Error('Link chưa sẵn sàng') }, send: async () => { sent = true } }))
  assert.equal(result.outcome, 'failed')
  assert.equal(sent, false)
  assert.match(result.message, /Link chưa sẵn sàng/)
})

test('explicit Gmail rejection records failed delivery before offering retry', async () => {
  const ops = operations({ send: async () => ({ ok: false, notSent: true, error: 'Gmail hết hạn' }) })
  const result = await deliverContractEmail(ops)
  assert.equal(result.outcome, 'failed')
  assert.match(result.message, /Thư chưa được gửi tới test@example.com/)
  assert.equal(ops.calls[0][2], true)
})

test('lost Gmail response keeps delivery reserved and warns against duplicate send', async () => {
  for (const send of [async () => ({ ok: false, notSent: false, error: 'ETIMEDOUT' }), async () => { throw new Error('IPC mất kết nối') }]) {
    const ops = operations({ send })
    const result = await deliverContractEmail(ops)
    assert.equal(result.outcome, 'uncertain')
    assert.equal(ops.calls.length, 0)
    assert.match(result.message, /tránh gửi trùng/)
  }
})

test('accepted email with failed status save never reports email send failure', async () => {
  const result = await deliverContractEmail(operations({ mark: async () => { throw new Error('Database offline') } }))
  assert.equal(result.outcome, 'uncertain')
  assert.match(result.title, /Gmail đã nhận thư/)
  assert.match(result.message, /Gmail đã tiếp nhận thư gửi tới test@example.com/)
})

test('failed status save after explicit rejection still identifies unsent email', async () => {
  const result = await deliverContractEmail(operations({ send: async () => ({ ok: false, notSent: true }), mark: async () => { throw new Error('Database offline') } }))
  assert.equal(result.outcome, 'failed')
  assert.match(result.message, /Thư chưa được gửi.*Chưa lưu được trạng thái lỗi/)
})

test('save-and-send waits for persistence and uses the returned draft revision throughout', async () => {
  const calls = []
  const draft = { id: 'persisted-draft', revision: 4, snapshot: { updatedTerms: 'latest terms' } }
  let resolveSave
  const saved = new Promise(resolve => { resolveSave = resolve })
  const pending = saveAndDeliverContractEmail({
    save: async () => { calls.push('saving'); return saved },
    prepare: async received => { assert.strictEqual(received, draft); calls.push('prepare'); return { email: 'test@example.com', id: 'new-link' } },
    send: async () => { calls.push('gmail'); return { ok: true, messageId: 'new-message' } },
    mark: async (received, confirmation, messageId) => { assert.strictEqual(received, draft); assert.equal(confirmation.id, 'new-link'); assert.equal(messageId, 'new-message'); calls.push('record') }
  })
  await Promise.resolve()
  assert.deepEqual(calls, ['saving'])
  resolveSave(draft)
  const result = await pending
  assert.equal(result.outcome, 'success')
  assert.deepEqual(calls, ['saving', 'prepare', 'gmail', 'record'])
})

test('save failure prevents both confirmation creation and Gmail sending', async () => {
  const calls = []
  const result = await saveAndDeliverContractEmail({
    save: async () => { throw new Error('Không lưu được bản nháp') },
    prepare: async () => { calls.push('prepare') },
    send: async () => { calls.push('gmail') },
    mark: async () => { calls.push('record') }
  })
  assert.equal(result.outcome, 'failed')
  assert.match(result.message, /Không lưu được bản nháp/)
  assert.deepEqual(calls, [])
})

test('confirmation failure after saving retains the saved draft and never sends mail', async () => {
  let persisted = false
  let sent = false
  const result = await saveAndDeliverContractEmail({
    save: async () => { persisted = true; return { id: 'saved-draft', revision: 1 } },
    prepare: async () => { throw new Error('Không tạo được link xác nhận') },
    send: async () => { sent = true },
    mark: async () => { throw new Error('Should not record delivery') }
  })
  assert.equal(persisted, true)
  assert.equal(sent, false)
  assert.equal(result.outcome, 'failed')
  assert.match(result.message, /Không tạo được link xác nhận/)
})
