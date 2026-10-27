import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const source = await readFile(new URL('../src/renderer/src/platform/pwa.ts', import.meta.url), 'utf8')
const compiled = transformSync(source, { loader: 'ts', format: 'cjs', define: { 'import.meta.env.PROD': 'true', 'import.meta.env.VITE_APP_VERSION': '"test"' } }).code

async function runtime({ waiting = true, firstInstall = false } = {}) {
  const worker = new EventTarget()
  worker.scriptURL = 'https://app.phongtroankhang.com/sw.js'
  worker.state = 'installed'
  let messages = 0, reloads = 0, checks = 0, rejectMessage = false
  worker.postMessage = () => { if (rejectMessage) throw new Error('worker gone'); messages++ }
  const registration = new EventTarget()
  registration.waiting = waiting ? worker : null
  registration.update = async () => { checks++ }
  const sw = new EventTarget()
  sw.controller = firstInstall ? null : { scriptURL: worker.scriptURL }
  sw.register = async () => registration
  const timers = new Map(), intervals = [], document = new EventTarget(), window = new EventTarget()
  document.visibilityState = 'visible'
  window.api = { update: {} }
  window.location = { reload: () => { reloads++ } }
  window.setTimeout = fn => { const id = timers.size + 1; timers.set(id, fn); return id }
  window.clearTimeout = id => timers.delete(id)
  window.setInterval = fn => { intervals.push(fn) }
  const navigator = { onLine: true, serviceWorker: sw }
  const context = { exports: {}, module: { exports: {} }, window, navigator, document, console, fetch: async () => ({ ok: true, json: async () => ({ version: 'new', releaseNotes: '', publishedAt: '' }) }) }
  context.exports = context.module.exports
  vm.runInNewContext(compiled, context)
  const api = context.module.exports
  api.installPwaRuntime()
  await new Promise(resolve => setImmediate(resolve))
  return {
    api, window, document, registration, worker, navigator, timers, intervals,
    messages: () => messages, reloads: () => reloads, checks: () => checks,
    rejectMessages: value => { rejectMessage = value },
    activate: () => {
      registration.waiting = null
      worker.state = 'activated'
      sw.controller = worker
      sw.dispatchEvent(new Event('controllerchange'))
      worker.dispatchEvent(new Event('statechange'))
    }
  }
}

test('a ready update requires acceptance; no reload or activation occurs on detection', async () => {
  const r = await runtime()
  assert.equal(r.api.hasPwaUpdate(), true)
  assert.equal(r.messages(), 0)
  assert.equal(r.reloads(), 0)
})

test('accepted update reloads once only after activation, with double clicks coalesced', async () => {
  const r = await runtime()
  const first = r.window.api.update.installLatest(), second = r.window.api.update.installLatest()
  assert.equal(first, second)
  assert.equal(r.messages(), 1)
  assert.equal(r.reloads(), 0)
  r.activate()
  assert.equal((await first).success, true)
  assert.equal(r.reloads(), 1)
  assert.equal(r.timers.size, 0)
})

test('activation in another tab keeps this tab locked until its own user accepts', async () => {
  const r = await runtime()
  r.activate()
  assert.equal(r.api.hasPwaUpdate(), true)
  assert.equal(r.reloads(), 0)
  assert.equal((await r.window.api.update.installLatest()).success, true)
  assert.equal(r.reloads(), 1)
})

test('activation timeout returns a retryable error without clearing the update gate', async () => {
  const r = await runtime()
  const pending = r.window.api.update.installLatest()
  for (const expire of r.timers.values()) expire()
  assert.equal((await pending).success, false)
  assert.equal(r.reloads(), 0)
  assert.equal(r.api.hasPwaUpdate(), true)
  const retry = r.window.api.update.installLatest()
  r.activate()
  assert.equal((await retry).success, true)
})

test('same script URL alone cannot acknowledge activation before controller handoff', async () => {
  const r = await runtime()
  const pending = r.window.api.update.installLatest()
  r.worker.state = 'activated'
  r.worker.dispatchEvent(new Event('statechange'))
  assert.equal(r.reloads(), 0)
  r.activate()
  assert.equal((await pending).success, true)
  assert.equal(r.reloads(), 1)
})

test('worker postMessage failure recovers and remains retryable', async () => {
  const r = await runtime()
  r.rejectMessages(true)
  assert.equal((await r.window.api.update.installLatest()).success, false)
  assert.equal(r.timers.size, 0)
  r.rejectMessages(false)
  const retry = r.window.api.update.installLatest()
  r.activate()
  assert.equal((await retry).success, true)
})

test('first install controller claim does not lock a current build', async () => {
  const r = await runtime({ waiting: true, firstInstall: true })
  r.activate()
  assert.equal(r.api.hasPwaUpdate(), false)
  assert.equal(r.reloads(), 0)
  assert.equal((await r.window.api.update.installLatest()).success, false)
})

test('newly installed waiting worker notifies subscribers only when ready', async () => {
  const r = await runtime({ waiting: false })
  let notifications = 0
  r.api.onPwaChange(() => { notifications++ })
  r.registration.installing = r.worker
  r.registration.dispatchEvent(new Event('updatefound'))
  assert.equal(r.api.hasPwaUpdate(), false)
  r.registration.waiting = r.worker
  r.worker.dispatchEvent(new Event('statechange'))
  assert.equal(r.api.hasPwaUpdate(), true)
  assert.equal(notifications, 1)
})

test('foreground, reconnect and periodic checks detect updates; offline polling skips network', async () => {
  const r = await runtime({ waiting: false })
  const initial = r.checks()
  r.document.dispatchEvent(new Event('visibilitychange'))
  r.window.dispatchEvent(new Event('online'))
  r.intervals[0]()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(r.checks(), initial + 3)
  r.navigator.onLine = false
  r.intervals[0]()
  assert.equal(r.checks(), initial + 3)
})
