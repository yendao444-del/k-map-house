import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'

// Exercise the shipped renderer functions with real SDKs, Auth, and deployed
// security challenges. Only the explicitly disposable identity is modified.
const env = await privateConfig()
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
const { gatewaySecret } = JSON.parse(await readFile(new URL('../adminpwa/.env.auth-private.json', import.meta.url), 'utf8'))
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const email = `mfa-retry-${randomBytes(8).toString('hex')}@example.invalid`
const password = randomBytes(24).toString('base64url')
const checks = []
let uid
const gateway = async (body, token) => {
  const response = await fetch(`${url}/functions/v1/admin-pwa-auth`, {
    method: 'POST', headers: {
      Authorization: `Bearer ${gatewaySecret}`, 'Content-Type': 'application/json',
      'x-management-ip': 'b'.repeat(64), 'x-management-agent': 'Disposable enrollment retry verifier',
      ...(token ? { 'x-management-session': token } : {})
    }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
  })
  const result = await response.json()
  assert.ok(response.ok && result.ok === true, `Gateway HTTP ${response.status}`)
  return result
}
try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { purpose: 'management-mfa-disposable-verification' } })
  assert.ok(!created.error && created.data.user, 'Disposable creation failed')
  uid = created.data.user.id
  assert.match(uid, /^[0-9a-f-]{36}$/i)
  await management(env, '/database/query', { query: `insert into public.users(id,email,username,full_name,role,status) values('${uid}','${email}','${uid}','Enrollment retry fixture','admin','active') on conflict(id) do update set username=excluded.username,role='admin',status='active';` })
  for (const base of ['src/renderer/src', 'adminpwa/src/renderer/src']) {
    const require = createRequire(new URL(base.startsWith('adminpwa') ? '../adminpwa/package.json' : '../package.json', import.meta.url))
    const { createClient: createSDK } = require('@supabase/supabase-js')
    const client = createSDK(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    try {
      const login = await gateway({ action: 'login', login: email, password })
      assert.equal((await client.auth.setSession(login.session)).error, null)
      const abandoned = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Google Authenticator' })
      assert.ok(!abandoned.error && abandoned.data?.id, 'Initial enrollment failed')
      const duplicate = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Google Authenticator' })
      assert.ok(duplicate.error, 'Duplicate setup must reproduce the original failure')
      const listed = await client.auth.mfa.listFactors()
      assert.equal(listed.error, null)
      assert.equal(listed.data.totp.length, 0)
      assert.ok(listed.data.all.some(f => f.id === abandoned.data.id && f.status === 'unverified'))
      const context = vm.createContext({ exports: {}, require: name => {
        if (name === './supabase') return { supabase: client }
        if (name === './management-auth-client') return { managementSecurity: (action, data, token) => gateway({ action: 'security', security_action: action, data }, token) }
        throw new Error('Unexpected import')
      } })
      const source = await readFile(new URL(`../${base}/lib/mfa.ts`, import.meta.url), 'utf8')
      vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
      const restarted = await context.exports.startTotpEnrollment()
      assert.notEqual(restarted.factorId, abandoned.data.id)
      assert.ok(restarted.challengeId && restarted.qrCode.startsWith('data:image/svg+xml;') && restarted.secret)
      const current = await client.auth.mfa.listFactors()
      assert.equal(current.error, null)
      assert.equal(current.data.all.length, 1)
      assert.equal(current.data.all[0].id, restarted.factorId)
      assert.equal((await client.auth.mfa.unenroll({ factorId: restarted.factorId })).error, null)
      checks.push(`${base}: reproduced duplicate friendly name; real SDK all includes unverified while totp is empty; shipped retry replaced stale factor and returned a real QR and gateway challenge`)
    } finally { await client.auth.signOut({ scope: 'local' }) }
  }
} finally {
  if (uid) {
    await management(env, '/database/query', { query: `delete from public.users where id='${uid}' and username='${uid}';` })
    assert.equal((await admin.auth.admin.deleteUser(uid)).error, null, 'Disposable Auth cleanup failed')
  }
}
const report = { checkedAt: new Date().toISOString(), checks, disposableRemoved: true, customerDataChanged: false, secretsLogged: false, scope: 'Real renderer functions, installed Supabase SDKs, production Auth and deployed Edge challenge; only disposable account.' }
await writeFile(new URL('../docs/security/qa/mfa-enrollment-retry-2026-10-10.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
