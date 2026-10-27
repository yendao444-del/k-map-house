if (!import.meta.env.DEV) throw new Error('Development only')
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LoginScreen } from '../../src/renderer/src/components/LoginScreen'
import { supabase } from '../../src/renderer/src/lib/supabase'
import '../../src/renderer/src/assets/main.css'
import '../../src/renderer/src/components/account-profile.css'
const scenario = new URLSearchParams(location.search).get('scenario') || 'email'
const uid = '12345678-1234-1234-1234-123456789abc'
const factor = 'abcdefab-1234-1234-1234-123456789abc'
const challengeId = 'abcdefab-5678-1234-1234-123456789abc'
let emailVerified = false, totpVerified = false
;(window as any).qaEmailLoginCalls = []
const user = { id: uid, email: 'fixture@example.invalid' }
supabase.auth.getSession = async () => ({ data: { session: { access_token: 'qa-token', expires_at: 4102444800, user } } as any, error: null })
supabase.auth.setSession = async () => ({ data: { session: { user } } as any, error: null })
supabase.auth.signOut = async () => { (window as any).qaEmailLoginCalls.push('signout'); return { error: null } }
supabase.auth.mfa.listFactors = async () => ({ data: { all: [{ id: factor, status: 'verified', factor_type: 'totp' }], totp: [], phone: [] } as any, error: null })
supabase.auth.mfa.getAuthenticatorAssuranceLevel = async () => ({ data: { currentLevel: totpVerified ? 'aal2' : 'aal1' } as any, error: null })
supabase.from = (() => {
  const builder: any = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: { ...user, username: 'fixture', full_name: 'Tài khoản Demo', status: 'active', role: 'user' }, error: null }) }
  return builder
}) as any
window.fetch = async (_input, init) => {
  const payload = JSON.parse(String(init?.body || '{}')), action = payload.security_action
  ;(window as any).qaEmailLoginCalls.push({ action, data: payload.data })
  if (action === 'status') return Response.json({ ok: true, state: emailVerified || totpVerified ? 'ready' : 'totp', email_login_available: scenario !== 'unverified', second_factor_verified: emailVerified || totpVerified, login_method: emailVerified ? 'email' : totpVerified ? 'totp' : null, expires_at: '2099-01-01T00:00:00Z' })
  if (action === 'email_send') {
    if (payload.data.purpose !== 'login' || scenario === 'unverified') throw Error('Unexpected email send')
    return scenario === 'send-failed' ? Response.json({ ok: false, error: 'Chưa gửi được email xác minh.' }, { status: 503 }) : Response.json({ ok: true, challenge_id: challengeId, masked_email: 'f***@example.invalid' })
  }
  if (action === 'email_verify') {
    if (payload.data.purpose !== 'login') throw Error('Unexpected purpose')
    if (payload.data.code !== '123456') return Response.json({ ok: false, error: 'Mã xác minh không đúng hoặc đã hết hạn.' }, { status: 401 })
    emailVerified = true; return Response.json({ ok: true })
  }
  if (action === 'totp_verify') { totpVerified = true; return Response.json({ ok: true, session: { access_token: 'qa-token', refresh_token: 'qa-refresh' } }) }
  throw Error('Unexpected fixture action: ' + action)
}
function QA() {
  const [done, setDone] = useState(false)
  return done ? <p role="status">Đăng nhập thành công</p> : <LoginScreen initialMfaChallenge={{ factorId: factor, challengeId }} onLogin={() => setDone(true)} />
}
createRoot(document.getElementById('root')!).render(<QA />)
