import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequest as middleware } from '../functions/_middleware.js'
import { onRequest as gateway } from '../functions/api/[[path]].js'

test('security headers preserve static HTML and dynamic error status, body and cookies', async () => {
  for (const [status, body, type] of [[200, '<html>app</html>', 'text/html'], [401, '{"ok":false}', 'application/json']]) {
    const result = await middleware({ request: new Request('https://pay.phongtroankhang.com/api/auth'), next: async () => new Response(body, { status, headers: { 'Content-Type': type, 'Set-Cookie': 'session=; HttpOnly; Secure; Max-Age=0', 'Cache-Control': 'no-store' } }) })
    assert.equal(result.status, status)
    assert.equal(await result.text(), body)
    assert.equal(result.headers.get('content-type'), type)
    assert.match(result.headers.get('set-cookie'), /HttpOnly/)
    assert.equal(result.headers.get('cache-control'), 'no-store')
    assert.equal(result.headers.get('x-frame-options'), 'DENY')
    assert.match(result.headers.get('strict-transport-security'), /max-age=31536000/)
  }
})

test('root redirect preserves path and query and does not run downstream handlers', async () => {
  const result = await middleware({ request: new Request('https://phongtroankhang.com/contract-confirmation?check=1'), next: () => { throw new Error('must not run') } })
  assert.equal(result.status, 302)
  assert.equal(result.headers.get('location'), 'https://pay.phongtroankhang.com/contract-confirmation?check=1')
})

test('public health uses an allowlist even if the upstream returns new private metadata', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => Response.json({ ok: true, backend: 'online', ocrConfigured: true, provider: 'private-provider', realTenantData: true, realPayments: true, apiKey: 'never-return-me' })
  try {
    const result = await gateway({ request: new Request('https://pay.phongtroankhang.com/api/health'), params: {path:['health']}, env: {WEBMOBILE_EDGE_URL:'https://backend.invalid', WEBMOBILE_GATEWAY_SECRET:'private-gateway'} })
    assert.deepEqual(await result.json(), {ok:true,backend:'online',ocrConfigured:true})
    assert.equal(result.headers.get('cache-control'), 'no-store')
  } finally { globalThis.fetch = original }
})
