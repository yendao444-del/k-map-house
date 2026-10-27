import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { build } from '../adminpwa/node_modules/esbuild/lib/main.js'
const bundle = await build({ entryPoints: ['supabase/functions/resend-security-webhook/handler.ts'], bundle: true, write: false, format: 'esm', platform: 'node' })
const { createResendSecurityWebhook } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const secret = randomBytes(32), now = Date.now(), provider = '12345678-1234-1234-1234-123456789abc'
const event = { type: 'email.delivered', created_at: new Date(now).toISOString(), data: { from: 'AN KHANG HOME <baomat@phongtroankhang.com>', email_id: provider, to: ['private@example.invalid'], subject: 'Private', text: 'Never persist this' } }
function fixture(options = {}) {
  const calls = []
  const handler = createResendSecurityWebhook({ supabaseUrl: 'https://fixture.supabase.co', serviceKey: 'service', webhookSecret: options.noSecret ? '' : 'whsec_' + secret.toString('base64'), sender: 'baomat@phongtroankhang.com' }, async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) }); return Response.json(options.dbFail ? false : true)
  }, () => now)
  const request = (data = event, override = {}) => {
    const body = JSON.stringify(data), id = 'msg_fixture', timestamp = String(Math.floor(now / 1000))
    const signature = createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64')
    return new Request('https://fixture.supabase.co/webhook', { method: 'POST', body, headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}`, ...override } })
  }
  return { handler, request, calls }
}
test('valid signed event persists only delivery metadata, never identities, bodies or OTP', async () => {
  const f = fixture(); assert.equal((await f.handler(f.request())).status, 200)
  assert.deepEqual(f.calls[0].body, { p_event: 'msg_fixture', p_provider: provider, p_type: 'email.delivered', p_at: event.created_at })
})
test('forged, missing, stale, future and body-tampered signatures never reach DB', async () => {
  for (const headers of [{ 'svix-signature': 'v1,Zm9yZ2Vk' }, { 'svix-id': '' }, { 'svix-timestamp': String(Math.floor(now / 1000) - 301) }, { 'svix-timestamp': String(Math.floor(now / 1000) + 301) }]) {
    const f = fixture(); assert.equal((await f.handler(f.request(event, headers))).status, 401); assert.equal(f.calls.length, 0)
  }
  const f = fixture(), request = f.request(); const changed = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ ...event, type: 'email.bounced' }) })
  assert.equal((await f.handler(changed)).status, 401); assert.equal(f.calls.length, 0)
})
test('rotation accepts any valid v1 signature and rejects malformed alternatives', async () => {
  const f = fixture(), r = f.request(); r.headers.set('svix-signature', 'v1,invalid v2,unknown ' + r.headers.get('svix-signature')); assert.equal((await f.handler(r)).status, 200)
})
test('unrelated sender and unsupported events are acknowledged without retaining data', async () => {
  for (const data of [{ ...event, type: 'email.opened' }, { ...event, data: { ...event.data, from: 'AN KHANG HOME <thongbao@phongtroankhang.com>' } }]) {
    const f = fixture(); assert.equal((await f.handler(f.request(data))).status, 200); assert.equal(f.calls.length, 0)
  }
})
test('invalid provider IDs/timestamps are rejected and DB failures trigger provider retry', async () => {
  for (const data of [{ ...event, created_at: 'invalid' }, { ...event, data: { ...event.data, email_id: 'bad-id' } }]) {
    const f = fixture(); assert.equal((await f.handler(f.request(data))).status, 400); assert.equal(f.calls.length, 0)
  }
  const f = fixture({ dbFail: true }); assert.equal((await f.handler(f.request())).status, 503)
})
test('unconfigured endpoint fails closed and oversized payload is rejected', async () => {
  const f = fixture({ noSecret: true }); assert.equal((await f.handler(f.request())).status, 503)
  const configured = fixture(); assert.equal((await configured.handler(configured.request({ ...event, padding: 'a'.repeat(65536) }))).status, 413); assert.equal(configured.calls.length, 0)
})
