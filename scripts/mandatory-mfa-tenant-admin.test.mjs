import test from 'node:test'
import assert from 'node:assert/strict'
import { tenantAdminHandler } from '../webmobile/cloud/tenant-admin.mjs'
import { contractConfirmationHandler } from '../webmobile/cloud/contract-confirmation.mjs'
const env = { SUPABASE_URL: 'https://wtrycmiojsiliyjxsewz.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service', SUPABASE_ANON_KEY: 'fixture-anon', CONTRACT_ENVIRONMENT: 'production', CONTRACT_DB_SCHEMA: 'public', CONTRACT_PUBLIC_URL: 'https://pay.phongtroankhang.com' }
for (const kind of ['tenant-admin', 'contract-confirmation']) {
  test(kind + ' rejects MFA denial or outage before privileged customer-data access', async () => {
    for (const [allowed, status] of [[false, 200], [null, 200], [true, 403], [true, 503]]) {
      const calls = []
      const fetcher = async (url, options) => {
        calls.push({ url, options })
        if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'fixture-admin' })
        if (url.endsWith('/rpc/security_management_access_allowed')) return Response.json(allowed, { status })
        throw new Error('Unexpected privileged operation')
      }
      const handler = kind === 'tenant-admin' ? tenantAdminHandler(env, fetcher) : contractConfirmationHandler(env, () => '', fetcher)
      const response = await handler(new Request('https://fixture', { method: 'POST', headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'history' }) }))
      assert.equal(response.status, 403)
      assert.equal(calls.length, 2)
      const guard = calls[1].options
      assert.equal(guard.headers.apikey, 'fixture-anon')
      assert.equal(guard.headers.Authorization, 'Bearer fixture-token')
      assert.equal(guard.headers['Content-Profile'], 'public')
      assert.deepEqual(JSON.parse(guard.body), { p_sensitive: true })
    }
  })
}
