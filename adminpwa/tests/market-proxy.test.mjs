import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

async function load(name) {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL(`../backend/functions/admin-pwa-market/${name}.ts`, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const { createMarketHandler } = await load('handler')
const { parseFmarketNav } = await load('fund-nav')
const now = Date.parse('2026-10-08T09:00:00Z')
const userId = '11111111-1111-4111-8111-111111111111'
const authorization = 'Bearer test-header.test-payload.test-signature'
const origin = 'https://app.phongtroankhang.com'
const html = (code = 'VFF', price = '12,345.67', date = '07/10/2026') => `<title>Quỹ ${code} - Fmarket</title><div class="fund__nav"><span class="nav">${price} VND</span><span>${date}</span></div>`
const req = (body = { action: 'fund-nav', symbol: 'VFF' }, extra = {}) => new Request('https://trusted.supabase.co/functions/v1/admin-pwa-market', { method: 'POST', headers: { authorization, origin, 'content-type': 'application/json' }, body: JSON.stringify(body), ...extra })
function harness({ authStatus = 200, profileStatus = 200, profiles = [{ id: userId, role: 'admin', status: 'active' }], marketStatus = 200, marketHtml = html(), throws = false } = {}) {
  const calls = []
  let clock = now
  const handler = createMarketHandler({ supabaseUrl: 'https://trusted.supabase.co', anonKey: 'public-key' }, {
    now: () => clock,
    fetch: async (url, options) => {
      calls.push({ url, options })
      if (throws) throw new TypeError('Network failure')
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: userId }, { status: authStatus })
      if (url.includes('/rest/v1/users?')) return Response.json(profiles, { status: profileStatus })
      assert.equal(url, 'https://fmarket.vn/quy/VFF')
      return new Response(marketHtml, { status: marketStatus })
    }
  })
  return { handler, calls, advance: ms => { clock += ms } }
}

test('NAV parser reads the declared fund, numeric amount and publication date', () => {
  assert.deepEqual(parseFmarketNav(html(), ' vff ', now), { priceVnd: 12345.67, quotedAt: '2026-10-07', source: 'Fmarket · NAV công bố gần nhất' })
})
test('NAV rejects wrong fund, missing data, stale/future/rolled dates and invalid prices', () => {
  for (const invalid of [html('VLBF'), '<title>VFF</title>', html('VFF', '0'), html('VFF', '1..2'), html('VFF', '1', '01/09/2026'), html('VFF', '1', '10/10/2026'), html('VFF', '1', '31/09/2026')]) assert.throws(() => parseFmarketNav(invalid, 'VFF', now))
  assert.throws(() => parseFmarketNav(html(), '.*', now))
})
test('CORS preflight only reflects allowed production/preview origins', async () => {
  const { handler, calls } = harness()
  for (const accepted of [origin, 'https://ankhanghome-admin-pwa.pages.dev', 'https://abc-123.ankhanghome-admin-pwa.pages.dev']) {
    const response = await handler(new Request('https://trusted.supabase.co', { method: 'OPTIONS', headers: { origin: accepted } }))
    assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), accepted)
  }
  for (const rejected of ['https://evil.test', 'https://ankhanghome-admin-pwa.pages.dev.evil.test']) {
    const response = await handler(new Request('https://trusted.supabase.co', { method: 'OPTIONS', headers: { origin: rejected } }))
    assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null)
  }
  assert.equal(calls.length, 0)
})
test('method and missing/bad bearer fail before any remote call', async () => {
  const { handler, calls } = harness()
  assert.equal((await handler(new Request('https://trusted.supabase.co'))).status, 405)
  for (const value of ['', 'Bearer bad', 'Basic abc']) assert.equal((await handler(req(undefined, { headers: { authorization: value } }))).status, 401)
  assert.equal(calls.length, 0)
})
test('expired session and unavailable profile cannot fetch quotes', async () => {
  for (const [config, status, count] of [[{ authStatus: 401 }, 401, 1], [{ profileStatus: 403 }, 403, 2]]) {
    const { handler, calls } = harness(config)
    assert.equal((await handler(req())).status, status); assert.equal(calls.length, count)
  }
})
test('inactive, tenant, missing, duplicate and different-user profiles are denied', async () => {
  for (const profiles of [[], [{ id: userId, role: 'tenant', status: 'active' }], [{ id: userId, role: 'admin', status: 'inactive' }], [{ id: userId, role: 'unknown', status: 'active' }], [{ id: 'other', role: 'admin', status: 'active' }], [{ id: userId, role: 'admin', status: 'active' }, { id: userId, role: 'admin', status: 'active' }]]) {
    const { handler, calls } = harness({ profiles })
    assert.equal((await handler(req())).status, 403); assert.equal(calls.length, 2)
  }
})
test('active management user gets an authenticated, uncached real quote', async () => {
  const { handler, calls } = harness({ profiles: [{ id: userId, role: 'user', status: 'active' }] })
  const response = await handler(req({ action: 'fund-nav', symbol: ' vff ' }))
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await response.json()).data.priceVnd, 12345.67)
  assert.equal(calls.length, 3)
  for (const call of calls.slice(0, 2)) assert.equal(call.options.headers.Authorization, authorization)
  assert.equal(calls[2].options.headers.Authorization, undefined)
})
test('quote cache expires at five minutes but never skips auth or profile checks', async () => {
  const profiles = [{ id: userId, role: 'admin', status: 'active' }]
  const { handler, calls, advance } = harness({ profiles })
  assert.equal((await handler(req())).status, 200)
  assert.equal((await handler(req())).status, 200)
  assert.equal(calls.length, 5)
  advance(300000)
  assert.equal((await handler(req())).status, 200); assert.equal(calls.length, 8)
  profiles[0].status = 'inactive'
  assert.equal((await handler(req())).status, 403); assert.equal(calls.length, 10)
})
test('invalid JSON, null/array/actions, large payloads and arbitrary URLs are rejected', async () => {
  const { handler, calls } = harness()
  for (const body of [null, [], { action: 'scan', symbol: 'VFF' }, { action: 'fund-nav', symbol: 1 }]) assert.equal((await handler(req(body))).status, 400)
  assert.equal((await handler(req(undefined, { body: 'invalid' }))).status, 400)
  assert.equal((await handler(req({ action: 'fund-nav', symbol: 'https://evil.test' }))).status, 422)
  assert.equal((await handler(req({ action: 'fund-nav', symbol: 'VFF', extra: 'x'.repeat(2048) }))).status, 413)
  assert.equal(calls.filter(call => call.url.startsWith('https://fmarket.vn')).length, 0)
})
test('upstream failures never return simulated prices or poison the cache', async () => {
  for (const options of [{ marketStatus: 503 }, { marketHtml: html('VFF', '0') }, { marketHtml: 'x'.repeat(2000001) }, { throws: true }]) {
    const { handler } = harness(options)
    for (let i = 0; i < 2; i++) {
      const response = await handler(req()); assert.equal(response.status, 502)
      const result = await response.json(); assert.equal(result.ok, false); assert.equal(result.data, undefined)
    }
  }
})
