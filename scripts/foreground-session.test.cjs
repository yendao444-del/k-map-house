const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/src/App.tsx'), 'utf8').replaceAll('\r\n', '\n')
const start = source.indexOf('  useEffect(() => {\n    if (!currentUser) return undefined')
const end = source.indexOf('}, [currentUser?.id])', start)
assert.ok(start >= 0 && end > start, 'Locate the actual session monitor')
const monitor = source.slice(start, end + '}, [currentUser?.id])'.length)
class MfaChallengeRequired extends Error { factorId = 'factor'; challengeId = 'challenge' }
class SecurityStepUpRequired extends Error { state = 'email' }
const settle = () => new Promise(resolve => setImmediate(resolve))

function harness() {
  const state = { ready: true, user: { id: 'admin' }, error: '', clears: 0, requests: 0 }
  const events = new Map(), timers = new Map()
  let finish, fail, cleanup
  let expired = false, profilePending = false
  const queryClient = {
    clear: () => { state.clears++ }, cancelQueries: async () => {}
  }
  const context = {
    Date, Error, currentUser: state.user, queryClient, MfaChallengeRequired, SecurityStepUpRequired,
    useEffect: fn => { cleanup = fn() },
    document: { hidden: false, addEventListener: (name, fn) => events.set(name, fn), removeEventListener() {} },
    window: { setInterval: fn => { timers.set('poll', fn); return 1 }, setTimeout: fn => { timers.set('deadline', fn); return 2 }, clearInterval() {}, clearTimeout() {}, addEventListener: (name, fn) => events.set(name, fn), removeEventListener() {} },
    setAuthReady: value => { state.ready = value },
    setCurrentUser: value => { state.user = value },
    setAuthValidationError: value => { state.error = value },
    setPendingMfa: value => { state.mfa = value },
    setPendingSecurity: value => { state.security = value },
    isManagementSessionExpired: () => expired,
    getManagementSessionExpiry: () => Date.now() + 60_000,
    isProfileSecurityFlowPending: () => profilePending,
    signOutUser: async () => { state.signedOut = true },
    securityState: async () => ({ state: 'ready' }),
    getCurrentSessionUser: () => { state.requests++; return new Promise((resolve, reject) => { finish = resolve; fail = reject }) }
  }
  vm.runInNewContext(ts.transpileModule(monitor, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { state, events, timers, context, complete: value => finish(value), reject: error => fail(error), expire: () => { expired = true }, pending: () => { profilePending = true }, cleanup: () => cleanup() }
}

test('returning to the app preserves the workspace during validation and after success', async () => {
  const h = harness()
  h.events.get('visibilitychange')()
  assert.equal(h.state.ready, true)
  assert.equal(h.state.user.id, 'admin')
  h.events.get('online')()
  assert.equal(h.state.requests, 1, 'Coalesce simultaneous foreground/reconnect checks')
  h.complete({ id: 'admin', full_name: 'Updated profile' })
  await settle()
  assert.equal(h.state.ready, true)
  assert.equal(h.state.user.full_name, 'Updated profile')
  assert.equal(h.state.clears, 0)
})

test('a failed validation blocks access and retry stays blocked until success', async () => {
  const h = harness()
  h.events.get('online')(); h.reject(new Error('offline')); await settle()
  assert.equal(h.state.error, 'offline')
  h.events.get('management-retry-auth')()
  assert.equal(h.state.error, 'offline', 'Do not expose the workspace while retry is pending')
  h.complete({ id: 'admin' }); await settle()
  assert.equal(h.state.error, '')
})

test('missing session and MFA/step-up results still remove private screens and cache', async () => {
  for (const result of [null, new MfaChallengeRequired(), new SecurityStepUpRequired()]) {
    const h = harness()
    h.events.get('visibilitychange')()
    if (result instanceof Error) h.reject(result); else h.complete(result)
    await settle()
    assert.equal(h.state.user, null)
    assert.equal(h.state.clears, 1)
    if (result instanceof MfaChallengeRequired) assert.equal(h.state.mfa.factorId, 'factor')
    if (result instanceof SecurityStepUpRequired) assert.equal(h.state.security, 'email')
  }
})

test('expiry wins over an in-flight check and late success cannot restore a logged-out workspace', async () => {
  const h = harness()
  h.events.get('visibilitychange')()
  h.timers.get('deadline')(); await settle()
  assert.equal(h.state.user, null)
  assert.equal(h.state.signedOut, true)
  h.complete({ id: 'admin' }); await settle()
  assert.equal(h.state.user, null)
})

test('hidden windows, security enrollment and disposed monitors do not change the active screen', async () => {
  const hidden = harness(); hidden.context.document.hidden = true; hidden.events.get('visibilitychange')()
  assert.equal(hidden.state.requests, 0)
  const enrollment = harness(); enrollment.pending(); enrollment.events.get('online')()
  assert.equal(enrollment.state.requests, 0)
  const disposed = harness(); disposed.events.get('online')(); disposed.cleanup(); disposed.complete({ id: 'other' }); await settle()
  assert.equal(disposed.state.user.id, 'admin')
})

test('refreshing the same user profile does not tear down the Realtime subscription', () => {
  const section = source.slice(source.indexOf('  // --- REALTIME SYNC ---'), source.indexOf('  const [editRoom'))
  let subscriptions = 0, cleanups = 0, prior, cleanup
  const render = user => vm.runInNewContext(ts.transpileModule(section, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    currentUser: user, queryClient: 'same-client',
    setupRealtime: () => { subscriptions++; return () => { cleanups++ } },
    useEffect: (fn, deps) => { if (!prior || deps.some((value, i) => value !== prior[i])) { cleanup?.(); cleanup = fn(); prior = deps } }
  })
  render({ id: 'admin', full_name: 'Before' }); render({ id: 'admin', full_name: 'After' })
  assert.equal(subscriptions, 1); assert.equal(cleanups, 0)
  render(null)
  assert.equal(cleanups, 1)
  render({ id: 'another-admin' })
  assert.equal(subscriptions, 2)
})
