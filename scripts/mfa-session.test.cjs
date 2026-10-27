const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')

function load(file, dependencies) {
  const context = vm.createContext({ exports: {}, require: name => {
    if (!(name in dependencies)) throw new Error('Unexpected import ' + name)
    return dependencies[name]
  } })
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.exports
}
function harness(base, options = {}) {
  const calls = []
  const supabase = {
    rpc: async name => {
      assert.equal(name, 'security_mfa_readiness')
      return { data: options.readiness ?? null, error: options.readinessError ? new Error('not deployed') : null }
    },
    auth: {
    getSession: async () => ({ data: { session: { access_token: 'fixture-access' } } }),
    setSession: async () => ({ error: null }),
    mfa: {
      listFactors: async () => { calls.push('factors'); const factors = options.factors ?? [{ id: 'test-factor', status: 'verified', factor_type: 'totp' }]; return { data: { totp: factors.filter(factor => factor.status === 'verified'), all: options.allFactors ?? factors }, error: options.factorError ? new Error('offline') : null } },
      getAuthenticatorAssuranceLevel: async () => { calls.push('level'); return { data: options.missingLevel ? null : { currentLevel: options.level || 'aal1' }, error: options.levelError ? new Error('offline') : null } },
      challenge: async ({ factorId }) => { calls.push(['challenge', factorId]); return { data: options.challengeError ? null : { id: 'test-challenge' }, error: options.challengeError ? new Error('offline') : null } },
      enroll: async ({ friendlyName }) => { calls.push(['enroll', friendlyName]); return { data: options.enrollError ? null : { id: 'new-factor', totp: { qr_code: 'data:image/png;base64,fixture', secret: 'JBSWY3DPEHPK3PXP' } }, error: options.enrollError ? new Error('already exists') : null } },
      unenroll: async ({ factorId }) => { calls.push(['unenroll', factorId]); return { error: options.unenrollError ? new Error('cleanup failed') : null } },
      verify: async () => { calls.push('verify'); return { error: options.verifyError ? new Error('invalid') : null } }
    },
    signOut: async ({ scope }) => { calls.push(['signOut', scope]); return { error: options.signOutError ? new Error('offline') : null } }
  } }
  const managementSecurity = async (action, data, token) => {
    assert.equal(token, 'fixture-access')
    if (action === 'totp_challenge') {
      calls.push(['challenge', data.factor_id])
      if (options.challengeError) throw new Error('offline')
      return { ok: true, challenge_id: 'test-challenge' }
    }
    if (action === 'totp_verify') {
      calls.push('verify')
      if (options.verifyError) throw new Error('invalid')
      return { ok: true, session: { access_token: 'fixture-verified', refresh_token: 'fixture-refresh' } }
    }
    throw new Error('Unexpected action ' + action)
  }
  return { calls, mfa: load(base + '/lib/mfa.ts', { './supabase': { supabase }, './management-auth-client': { managementSecurity }, './security-request': { securityRead: async read => read() } }) }
}

function loadDb(base, dependencies) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', base, 'lib/db.ts'), 'utf8')
  const start = source.indexOf('export const getCurrentSessionUser =')
  const end = source.indexOf('export const requestPasswordReset', start)
  assert.ok(start >= 0 && end > start, 'Could not isolate the management session functions')
  const context = vm.createContext({ exports: {}, console: { log() {} }, ...dependencies })
  vm.runInContext(ts.transpileModule(source.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context
}

const session = (id = 'fixture-user') => ({ user: { id }, expires_at: Date.now() / 1000 + 3600 })
const profileQuery = (profile, calls) => ({
  select: () => profileQuery(profile, calls),
  eq: () => profileQuery(profile, calls),
  maybeSingle: async () => { calls.push('profile'); return { data: profile, error: null } }
})
for (const base of ['src/renderer/src', 'adminpwa/src/renderer/src']) {
  test(base + ' enrollment remains closed until the deployed service explicitly declares readiness', async () => {
    for (const options of [{}, { readinessError: true }, { readiness: { enrollment_enabled: false } }, { readiness: { enrollment_enabled: 'true' } }]) {
      assert.equal(await harness(base, options).mfa.isTotpEnrollmentAvailable(), false)
    }
    assert.equal(await harness(base, { readiness: { enrollment_enabled: true } }).mfa.isTotpEnrollmentAvailable(), true)
  })
  test(base + ' restarts an abandoned TOTP setup without deleting a verified factor', async () => {
    const stale = harness(base, { readiness: { enrollment_enabled: true }, factors: [], allFactors: [{ id: 'stale', status: 'unverified', factor_type: 'totp' }] })
    const setup = await stale.mfa.startTotpEnrollment()
    assert.equal(setup.factorId, 'new-factor')
    assert.deepEqual(stale.calls, ['factors', ['unenroll', 'stale'], ['enroll', 'Google Authenticator'], ['challenge', 'new-factor']])

    const verified = harness(base, { readiness: { enrollment_enabled: true } })
    await assert.rejects(verified.mfa.startTotpEnrollment(), /đã được bật/)
    assert.deepEqual(verified.calls, ['factors'])
  })
  test(base + ' refuses unsafe enrollment cleanup and leaves other factor types intact', async () => {
    const ready = { readiness: { enrollment_enabled: true } }
    const failedLookup = harness(base, { ...ready, factorError: true })
    await assert.rejects(failedLookup.mfa.startTotpEnrollment())
    assert.deepEqual(failedLookup.calls, ['factors'])
    const failedCleanup = harness(base, { ...ready, unenrollError: true, factors: [{ id: 'stale', status: 'unverified', factor_type: 'totp' }] })
    await assert.rejects(failedCleanup.mfa.startTotpEnrollment())
    assert.deepEqual(failedCleanup.calls, ['factors', ['unenroll', 'stale']])
    const mixed = harness(base, { ...ready, allFactors: [{ id: 'stale', status: 'unverified', factor_type: 'totp' }, { id: 'verified', status: 'verified', factor_type: 'totp' }] })
    await assert.rejects(mixed.mfa.startTotpEnrollment())
    assert.deepEqual(mixed.calls, ['factors'])
    const phone = harness(base, { ...ready, allFactors: [{ id: 'phone', status: 'unverified', factor_type: 'phone' }] })
    await phone.mfa.startTotpEnrollment()
    assert.deepEqual(phone.calls, ['factors', ['enroll', 'Google Authenticator'], ['challenge', 'new-factor']])
  })
  test(base + ' restores AAL1 into a bound MFA challenge instead of accepting the profile', async () => {
    const h = harness(base)
    await assert.rejects(h.mfa.requireSessionMfa(), error => error instanceof h.mfa.MfaChallengeRequired && error.factorId === 'test-factor' && error.challengeId === 'test-challenge')
    assert.deepEqual(h.calls, ['factors', 'level', ['challenge', 'test-factor']])
  })
  test(base + ' accepts enrolled sessions only at AAL2 and does not challenge unverified setup', async () => {
    const verified = harness(base, { level: 'aal2' }); await verified.mfa.requireSessionMfa()
    assert.deepEqual(verified.calls, ['factors', 'level'])
    const setup = harness(base, { factors: [{ id: 'setup', status: 'unverified', factor_type: 'totp' }] }); await setup.mfa.requireSessionMfa()
    assert.deepEqual(setup.calls, ['factors'])
  })
  test(base + ' fails closed on unavailable factors, assurance data or challenge', async () => {
    for (const options of [{ factorError: true }, { levelError: true }, { missingLevel: true }, { challengeError: true }]) {
      const h = harness(base, options)
      await assert.rejects(h.mfa.requireSessionMfa())
    }
  })
  test(base + ' refuses invalid TOTP and ends the local AAL1 session on cancellation', async () => {
    const invalid = harness(base, { verifyError: true })
    await assert.rejects(invalid.mfa.verifyTotpChallenge('test-factor', 'test-challenge', '000000'))
    const h = harness(base); await h.mfa.cancelMfaLogin()
    assert.deepEqual(h.calls, [['signOut', 'local']])
    await assert.rejects(harness(base, { signOutError: true }).mfa.cancelMfaLogin())
  })
  test(base + ' signs out an expired server deadline before any Auth, security, or profile query', async () => {
    const calls = []
    const context = loadDb(base, {
      isManagementSessionExpired: () => true,
      recordManagementSessionExpiry: () => calls.push('record'),
      clearManagementSessionExpiry: () => calls.push('clear'),
      supabase: {
        from: () => { calls.push('profile'); throw new Error('Profile must not be queried after expiry') },
        auth: {
          getSession: async () => { calls.push('getSession'); throw new Error('Auth must not be read after expiry') },
          refreshSession: async () => { calls.push('refresh'); throw new Error('Token must not be refreshed after expiry') },
          signOut: async ({ scope }) => { calls.push(['signOut', scope]); return { error: null } }
        }
      },
      securityState: async () => { calls.push('security'); throw new Error('Security must not be queried after expiry') },
      requireSessionMfa: async () => { calls.push('mfa') },
      authorizeSecuritySession: async () => { calls.push('authorize') },
      verifyTotpChallenge: async () => { calls.push('verify') },
      managementLogin: async () => ({ access_token: 'fixture', refresh_token: 'fixture' }),
      buildAppUser: value => value,
      assertManagementProfile: () => {},
      normalizeRemoteErrorMessage: value => value
    })

    assert.equal(await context.exports.getCurrentSessionUser(), null)
    assert.deepEqual(calls, [['signOut', 'local']])
  })
  test(base + ' keeps an AAL2 restore free of a second challenge before the server deadline', async () => {
    const calls = []
    const profile = { id: 'fixture-user', role: 'admin', status: 'active' }
    const expiry = '2032-01-02T09:04:05.000Z'
    const context = loadDb(base, {
      isManagementSessionExpired: () => false,
      recordManagementSessionExpiry: value => calls.push(['record', value]),
      clearManagementSessionExpiry: () => calls.push('clear'),
      supabase: { from: () => profileQuery(profile, calls), auth: {
        getSession: async () => ({ data: { session: session(profile.id) }, error: null }),
        signOut: async ({ scope }) => { calls.push(['signOut', scope]); return { error: null } }
      } },
      securityState: async () => ({ state: 'ready', expires_at: expiry }),
      requireSessionMfa: async () => { calls.push('aal2') },
      authorizeSecuritySession: async () => { calls.push('authorize') },
      verifyTotpChallenge: async () => { calls.push('verify'); throw new Error('A restored AAL2 session must not start a new challenge') },
      managementLogin: async () => ({ access_token: 'fixture', refresh_token: 'fixture' }),
      buildAppUser: value => value,
      assertManagementProfile: () => {},
      normalizeRemoteErrorMessage: value => value
    })

    assert.deepEqual(await context.exports.getCurrentSessionUser(), profile)
    assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === 'record'), [['record', expiry]])
    assert.ok(!calls.includes('verify'))
    assert.ok(!calls.some(call => Array.isArray(call) && call[0] === 'signOut'))
  })
  test(base + ' turns a database MFA guard into the verification flow', async () => {
    const profile = { id: 'fixture-user', role: 'admin', status: 'active' }
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: null, error: { code: '42501', message: 'Management MFA/session verification required' } })
    }
    class SecurityStepUpRequired extends Error { constructor(state) { super(state); this.state = state } }
    const context = loadDb(base, {
      SecurityStepUpRequired,
      isManagementSessionExpired: () => false,
      recordManagementSessionExpiry: () => {},
      clearManagementSessionExpiry: () => {},
      supabase: { from: () => query, auth: {
        getSession: async () => ({ data: { session: session(profile.id) }, error: null }),
        signOut: async () => ({ error: null })
      } },
      securityState: async () => ({ state: 'ready', expires_at: '2032-01-02T09:04:05.000Z' }),
      requireSessionMfa: async () => {},
      authorizeSecuritySession: async () => {},
      verifyTotpChallenge: async () => {},
      managementLogin: async () => ({ access_token: 'fixture', refresh_token: 'fixture' }),
      buildAppUser: value => value,
      normalizeRemoteErrorMessage: value => value
    })
    await assert.rejects(context.exports.getCurrentSessionUser(), error => error instanceof SecurityStepUpRequired && error.state === 'authorize')
  })
  test(base + ' records the server deadline only after a successful TOTP completion', async () => {
    const calls = []
    const profile = { id: 'fixture-user', role: 'admin', status: 'active' }
    const expiry = '2032-01-02T09:04:05.000Z'
    const context = loadDb(base, {
      isManagementSessionExpired: () => false,
      recordManagementSessionExpiry: value => calls.push(['record', value]),
      clearManagementSessionExpiry: () => calls.push('clear'),
      supabase: { from: () => profileQuery(profile, calls), auth: {
        getSession: async () => ({ data: { session: session(profile.id) }, error: null }),
        signOut: async ({ scope }) => { calls.push(['signOut', scope]); return { error: null } }
      } },
      securityState: async () => ({ state: 'ready', expires_at: expiry }),
      requireSessionMfa: async () => { calls.push('aal2') },
      authorizeSecuritySession: async () => { calls.push('authorize') },
      verifyTotpChallenge: async () => { calls.push('verify') },
      managementLogin: async () => ({ access_token: 'fixture', refresh_token: 'fixture' }),
      buildAppUser: value => value,
      assertManagementProfile: () => {},
      normalizeRemoteErrorMessage: value => value
    })

    assert.deepEqual(await context.exports.completeMfaLogin('factor', 'challenge', '123456'), profile)
    assert.ok(calls.indexOf('verify') < calls.findIndex(call => Array.isArray(call) && call[0] === 'record'))
    assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === 'record'), [['record', expiry]])
  })
  test(base + ' never records a deadline from a password-only session awaiting TOTP', async () => {
    const calls = []
    const profile = { id: 'fixture-user', role: 'admin', status: 'active' }
    class SecurityStepUpRequired extends Error {
      constructor(state) { super(state); this.state = state }
    }
    const context = loadDb(base, {
      SecurityStepUpRequired,
      isManagementSessionExpired: () => false,
      recordManagementSessionExpiry: value => calls.push(['record', value]),
      clearManagementSessionExpiry: () => calls.push('clear'),
      supabase: { from: () => { calls.push('profile'); return profileQuery(profile, calls) }, auth: {
        getSession: async () => ({ data: { session: session(profile.id) }, error: null }),
        setSession: async () => { calls.push('setSession'); return { error: null } },
        signOut: async ({ scope }) => { calls.push(['signOut', scope]); return { error: null } }
      } },
      securityState: async () => ({ state: 'totp', expires_at: '2032-01-02T09:04:05.000Z' }),
      requireSessionMfa: async () => { calls.push('mfa') },
      authorizeSecuritySession: async () => { calls.push('authorize') },
      verifyTotpChallenge: async () => { calls.push('verify') },
      managementLogin: async () => { calls.push('login'); return { access_token: 'fixture', refresh_token: 'fixture' } },
      buildAppUser: value => value,
      assertManagementProfile: () => {},
      normalizeRemoteErrorMessage: value => value
    })

    await assert.rejects(context.exports.signInUser('fixture', 'password'), error => error?.state === 'totp')
    assert.ok(calls.includes('clear'))
    assert.ok(calls.includes('login'))
    assert.ok(calls.includes('mfa'))
    assert.ok(!calls.some(call => Array.isArray(call) && call[0] === 'record'))
    assert.ok(!calls.includes('profile'))
  })
  test(base + ' does not return a stale profile when the deadline expires during bootstrap', async () => {
    const calls = []
    const profile = { id: 'fixture-user', role: 'admin', status: 'active' }
    let deadlineChecks = 0
    const context = loadDb(base, {
      isManagementSessionExpired: () => ++deadlineChecks >= 2,
      recordManagementSessionExpiry: value => calls.push(['record', value]),
      clearManagementSessionExpiry: () => calls.push('clear'),
      supabase: { from: () => profileQuery(profile, calls), auth: {
        getSession: async () => ({ data: { session: session(profile.id) }, error: null }),
        signOut: async ({ scope }) => { calls.push(['signOut', scope]); return { error: null } }
      } },
      securityState: async () => ({ state: 'ready', expires_at: '2032-01-02T09:04:05.000Z' }),
      requireSessionMfa: async () => { calls.push('aal2') },
      authorizeSecuritySession: async () => { calls.push('authorize') },
      verifyTotpChallenge: async () => { calls.push('verify') },
      managementLogin: async () => ({ access_token: 'fixture', refresh_token: 'fixture' }),
      buildAppUser: value => { calls.push('build'); return value },
      assertManagementProfile: () => {},
      normalizeRemoteErrorMessage: value => value
    })

    assert.equal(await context.exports.getCurrentSessionUser(), null)
    assert.ok(calls.includes('profile'))
    assert.ok(!calls.includes('build'))
    assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === 'signOut'), [['signOut', 'local']])
  })
  test(base + ' session bootstrap and password login both enforce the shared guard', async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', base, 'lib/db.ts'), 'utf8')
    const start = source.indexOf('export const getCurrentSessionUser =')
    const end = source.indexOf('export const requestPasswordReset', start)
    const fragment = source.slice(start, end)
    const profile = { id: 'fixture-user', role: 'admin', status: 'active' }
    const session = { user: { id: profile.id }, expires_at: Date.now() / 1000 + 3600 }
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: profile, error: null }) }
    const calls = []
    const denied = new Error('MFA required')
    const context = vm.createContext({ console: { log() {} }, exports: {},
      supabase: { from: () => query, auth: {
        getSession: async () => ({ data: { session }, error: null }),
        setSession: async () => ({ error: null }), signOut: async () => ({ error: null })
      } },
      managementLogin: async () => ({ access_token: 'fixture-token', refresh_token: 'fixture-refresh' }),
      registerSecuritySession: async () => {},
      buildAppUser: row => row,
      assertManagementProfile: () => {},
      normalizeRemoteErrorMessage: message => message,
      isManagementSessionExpired: () => false,
      recordManagementSessionExpiry: () => {},
      clearManagementSessionExpiry: () => {},
      securityState: async () => ({ state: 'ready' }),
      requireSessionMfa: async () => { calls.push('guard'); throw denied },
      verifyTotpChallenge: async () => {}
    })
    vm.runInContext(ts.transpileModule(fragment, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
    await assert.rejects(context.exports.getCurrentSessionUser(), error => error === denied)
    await assert.rejects(context.exports.signInUser('fixture', 'fixture-password'), error => error === denied)
    assert.deepEqual(calls, ['guard', 'guard'])
  })
  test(base + ' enrollment and incomplete security steps cannot load a business profile', async () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', base, 'lib/db.ts'), 'utf8')
    const fragment = source.slice(source.indexOf('export const getCurrentSessionUser ='), source.indexOf('export const requestPasswordReset'))
    for (const state of ['enroll', 'email', 'recovery_codes', 'recovery']) {
      const calls = []
      class SecurityStepUpRequired extends Error { constructor(state) { super(state); this.state = state } }
      const context = vm.createContext({ exports: {}, console: { log() {} }, SecurityStepUpRequired,
        supabase: { from: () => { calls.push('profile'); throw new Error('Business profile accessed before enrollment') }, auth: {
          getSession: async () => ({ data: { session: { user: { id: 'fixture' }, expires_at: Date.now() / 1000 + 3600 } }, error: null }),
          setSession: async () => ({ error: null })
        } },
        managementLogin: async () => ({ access_token: 'fixture', refresh_token: 'fixture' }),
        normalizeRemoteErrorMessage: message => message,
        isManagementSessionExpired: () => false,
        recordManagementSessionExpiry: () => {},
        clearManagementSessionExpiry: () => {},
        securityState: async () => ({ state }),
        requireSessionMfa: async () => { calls.push('factor') },
        authorizeSecuritySession: async () => { calls.push('authorize') }
      })
      vm.runInContext(ts.transpileModule(fragment, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
      await assert.rejects(context.exports.getCurrentSessionUser(), error => error instanceof SecurityStepUpRequired && error.state === state)
      await assert.rejects(context.exports.signInUser('fixture', 'fixture-password'), error => error instanceof SecurityStepUpRequired && error.state === state)
      assert.ok(!calls.includes('profile') && !calls.includes('authorize'))
      if (state === 'enroll' || state === 'recovery') assert.deepEqual(calls, [])
    }
  })
}
