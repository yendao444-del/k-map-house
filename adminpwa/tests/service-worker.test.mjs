import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

const template = await readFile(new URL('../scripts/service-worker.template.js', import.meta.url), 'utf8')
function runtime() {
  const handlers = new Map(), cached = new Map([['/index.html', 'old-build-document'], ['/assets/old.js', 'old-build-script']])
  const writes = [], removed = [], observed = []
  let network = async request => { observed.push(request.url); return 'new-build-document' }
  const cache = { match: async key => cached.get(typeof key === 'string' ? key : new URL(key.url).pathname), addAll: async paths => { writes.push(...paths) }, put: async (...args) => { writes.push(args) } }
  let skipped = false
  const context = {
    URL, Response,
    self: { location: { origin: 'https://app.phongtroankhang.com' }, addEventListener: (type, callback) => handlers.set(type, callback), skipWaiting: () => { skipped = true }, clients: { claim: async () => undefined } },
    caches: { open: async name => { assert.equal(name, 'ankhang-management-shell-test-old'); return cache }, keys: async () => ['ankhang-management-shell-test-old', 'ankhang-management-shell-other', 'tenant-portal-cache'], delete: async key => { removed.push(key) } },
    fetch: request => network(request)
  }
  vm.runInNewContext(template.replace('__BUILD_ID__', 'test-old').replace('__ASSETS__', JSON.stringify(['/index.html', '/assets/old.js'])), context)
  return {
    writes, removed, observed, cached,
    offline: () => { network = async () => { throw new Error('offline') } },
    skipped: () => skipped,
    lifecycle: async type => { let pending; handlers.get(type)({ waitUntil: promise => { pending = promise } }); await pending },
    message: data => handlers.get('message')({ data }),
    request: async (path, { mode = 'navigate', method = 'GET', authorized = false } = {}) => {
      let intercepted = false, pending
      const url = path.startsWith('https:') ? path : `https://app.phongtroankhang.com${path}`
      handlers.get('fetch')({ request: { url, mode, method, headers: { has: key => key === 'authorization' && authorized } }, respondWith: promise => { intercepted = true; pending = promise } })
      return { intercepted, response: await pending }
    }
  }
}

test('online navigation does not overwrite the old build offline index', async () => {
  const worker = runtime()
  assert.equal((await worker.request('/')).response, 'new-build-document')
  assert.equal(worker.cached.get('/index.html'), 'old-build-document')
  assert.equal(worker.writes.length, 0)
  worker.offline()
  assert.equal((await worker.request('/')).response, 'old-build-document')
})
test('offline shell reads its own build cache and public assets only', async () => {
  const worker = runtime(); worker.offline()
  assert.equal((await worker.request('/assets/old.js', { mode: 'cors' })).response, 'old-build-script')
  assert.equal((await worker.request('/customer-document.png', { mode: 'cors' })).intercepted, false)
})
for (const [label, path, options] of [
  ['recovery', '/?code=secret', {}], ['rest', '/rest/v1/rooms', { mode: 'cors' }],
  ['cross origin', 'https://backend.supabase.co/rest/v1/rooms', { mode: 'cors' }],
  ['write', '/', { method: 'POST' }], ['authorization', '/', { authorized: true }],
  ['asset query', '/assets/old.js?token=secret', { mode: 'cors' }]
]) test(`worker leaves ${label} traffic entirely to the network`, async () => assert.equal((await runtime().request(path, options)).intercepted, false))
test('install does not skip waiting; accepted update alone activates it', async () => {
  const worker = runtime(); await worker.lifecycle('install')
  assert.deepEqual(worker.writes, ['/index.html', '/assets/old.js']); assert.equal(worker.skipped(), false)
  worker.message({ type: 'OTHER' }); assert.equal(worker.skipped(), false)
  worker.message({ type: 'ACCEPT_UPDATE' }); assert.equal(worker.skipped(), true)
})
test('activate only removes previous management shell caches', async () => {
  const worker = runtime(); await worker.lifecycle('activate')
  assert.deepEqual(worker.removed, ['ankhang-management-shell-other'])
})
