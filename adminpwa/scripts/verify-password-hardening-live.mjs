import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'
import { privateConfig } from '../../webmobile/scripts/private-config.mjs'

// Use only a disposable account. Never record credentials or recovery links.
const env = await privateConfig()
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
assert.equal(new URL(url).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
const service = env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const email = 'securityqa_' + randomUUID().replaceAll('-', '') + '@example.com'
let password = 'Ak!' + randomBytes(24).toString('base64url')
let userId
const checks = []
async function managementLogin(login, password) {
  const response = await fetch('https://app.phongtroankhang.com/api/management-auth', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.phongtroankhang.com' },
    body: JSON.stringify({ action: 'login', login, password }), signal: AbortSignal.timeout(30000)
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.session?.access_token) throw new Error('QA login HTTP ' + response.status)
  return data.session
}
try {
  const provisioned = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Security QA temporary account' } })
  assert.ok(!provisioned.error && provisioned.data.user?.id, 'QA provisioning failed')
  userId = provisioned.data.user.id
  const signed = await client.auth.setSession(await managementLogin(email, password))
  assert.equal(signed.error, null)
  const withoutCurrent = await client.auth.updateUser({ password: 'Ak!' + randomBytes(24).toString('base64url') })
  assert.ok(withoutCurrent.error, 'Session alone must not permit changing password')
  checks.push({ case: 'password-update-without-current-password', rejected: true, code: withoutCurrent.error.code })
  const wrongCurrent = await client.auth.updateUser({ password: 'Ak!' + randomBytes(24).toString('base64url'), current_password: 'invalid-current-password' })
  assert.ok(wrongCurrent.error, 'Wrong current password must be rejected')
  checks.push({ case: 'password-update-with-wrong-current-password', rejected: true, code: wrongCurrent.error.code })
  for (const sourcePath of ['../src/renderer/src/lib/db.ts', '../../src/renderer/src/lib/db.ts']) {
    const source = await readFile(new URL(sourcePath, import.meta.url), 'utf8')
    const start = source.indexOf('const ensureOwnPasswordChangeAllowed =')
    const end = source.indexOf('export const deleteUser', start)
    assert.ok(start >= 0 && end > start)
    const js = ts.transpileModule(source.slice(start, end).replaceAll('export const', 'var'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    const calls = []
    const context = vm.createContext({
      normalizeRemoteErrorMessage: message => message,
      securityState: async () => { calls.push('security'); return { state: 'ready', recent_mfa: true } },
      supabase: { auth: {
        reauthenticate: async () => { calls.push('reauthenticate'); return { error: null } },
        updateUser: async payload => { calls.push({ update: payload }); return { error: null } }
      } }
    })
    vm.runInContext(js, context)
    const nextPassword = 'Ak!' + randomBytes(24).toString('base64url')
    await assert.rejects(context.changeOwnPassword(nextPassword, password, 'bad'))
    await context.sendOwnPasswordChangeVerification(nextPassword, password)
    await context.changeOwnPassword(nextPassword, password, '123456')
    assert.deepEqual(calls.slice(0, 2), ['security', 'reauthenticate'])
    const update = calls.find(call => typeof call === 'object')?.update
    assert.equal(update?.current_password, password)
    assert.equal(update?.nonce, '123456')
    checks.push({ case: sourcePath.startsWith('../../') ? 'electron-source-password-email-otp' : 'pwa-source-password-email-otp', reauthenticationRequested: true, currentPasswordIncluded: true, nonceIncluded: true, emailSent: false })
  }
  // Generate/verify a recovery token without sending an email to anyone.
  const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: 'https://app.phongtroankhang.com/?password-recovery=1' } })
  assert.equal(recovery.error, null)
  const verified = await client.auth.verifyOtp({ token_hash: recovery.data.properties.hashed_token, type: 'recovery' })
  assert.equal(verified.error, null)
  const recoveredPassword = 'Ak!' + randomBytes(24).toString('base64url')
  const recovered = await client.auth.updateUser({ password: recoveredPassword })
  assert.equal(recovered.error, null, 'A verified recovery session must support reset without current password')
  const recoveryLogin = await client.auth.signInWithPassword({ email, password: recoveredPassword })
  assert.equal(recoveryLogin.error, null)
  checks.push({ case: 'verified-recovery-password-reset', passed: true, emailSent: false })
} finally {
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
  if (userId) {
    const removed = await admin.auth.admin.deleteUser(userId)
    assert.equal(removed.error, null, 'QA auth cleanup failed')
    const cleaned = await admin.from('users').delete().eq('id', userId)
    assert.equal(cleaned.error, null, 'QA profile cleanup failed')
    const remaining = await admin.from('users').select('id').eq('id', userId)
    assert.equal(remaining.error, null)
    assert.equal(remaining.data.length, 0)
    checks.push({ case: 'temporary-account-cleanup', passed: true })
  }
}
const report = { verifiedAt: new Date().toISOString(), environment: 'production', checks, scope: 'Disposable QA identity only; native email-OTP source contract plus live Auth hardening checks; no customer passwords changed; no email sent; no credentials saved.' }
await writeFile(new URL('../qa/security-password-live-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
