// Development-only regression fixture. No real Auth sessions, codes or network writes.
if (!import.meta.env.DEV) throw new Error('Development only')
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProfileModal } from '../../src/renderer/src/components/ProfileModal'
import { supabase } from '../../src/renderer/src/lib/supabase'
import '../../src/renderer/src/assets/main.css'
import '../../src/renderer/src/assets/mobile.css'
import '../../src/renderer/src/components/account-profile.css'

const scenario = new URLSearchParams(location.search).get('scenario') || 'expired'
let verified = scenario === 'ready'
let authorized = scenario !== 'unauthorized'
let overviewFails = scenario === 'overview-error'
const user = { id: 'fixture-profile', username: 'qa_demo', email: 'qa@example.invalid', full_name: 'Tài khoản kiểm thử', role: 'admin' as const, status: 'active' as const }
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const factor = { id: 'fixture-factor', factor_type: 'totp', status: 'verified' }
const calls: string[] = []
;(window as any).qaSecurityCalls = calls
supabase.auth.getSession = async () => ({ data: { session: { access_token: 'qa-session', user: { id: user.id } } } as any, error: null })
supabase.auth.setSession = async () => { calls.push('setSession'); return { data: {} as any, error: null } }
let factorReads = 0
supabase.auth.mfa.listFactors = async () => {
  factorReads++
  if ((scenario === 'load-timeout' && factorReads === 1) || (scenario === 'challenge-timeout' && factorReads === 2)) return new Promise(() => {})
  return { data: { all: [factor] } as any, error: null }
}
supabase.auth.mfa.enroll = async () => ({ data: { id: 'qa-new-factor', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="white"/><text x="20" y="80">QR fixture</text></svg>', secret: 'QAONLYNOTAREALSECRET' } } as any, error: null })
supabase.auth.mfa.unenroll = async () => ({ data: {} as any, error: null })
supabase.rpc = ((name: string) => name === 'management_user_directory' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { authenticator_verified: true, email_verified: true }, error: null }) }) }) } : Promise.resolve({ data: { enrollment_enabled: true }, error: null })) as any
window.fetch = async (input, init) => {
  if (String(input) !== '/api/management-auth') throw new Error('Unexpected fixture request')
  const payload = JSON.parse(String(init?.body || '{}'))
  const action = payload.security_action
  calls.push(action)
  if (['totp_replace_begin','totp_replace_register','totp_replace_cancel','totp_retire','recovery_ack'].includes(action)) return Response.json({ ok: true })
  if (action === 'recovery_issue') return Response.json({ ok: true, batch_id: 'qa-batch', codes: Array.from({ length: 10 }, (_, i) => `${String(i).padStart(8,'0')}-DEADBEEF-12345678-90ABCDEF`) })
  if (action === 'status') return Response.json({ ok: true, state: verified && scenario === 'email' ? 'email' : verified && !authorized ? 'authorize' : 'ready', recent_mfa: verified, recovery_acknowledged: true })
  if (action === 'totp_challenge') return Response.json({ ok: true, challenge_id: 'qa-challenge' })
  if (action === 'totp_verify') {
    if (payload.data.code !== '123456') return Response.json({ ok: false, error: 'Mã xác minh không đúng hoặc đã hết hạn.' }, { status: 401 })
    verified = true
    return Response.json({ ok: true, session: { access_token: 'qa-verified', refresh_token: 'qa-refresh' } })
  }
  if (action === 'authorize') {
    if (!verified || scenario === 'email') return Response.json({ ok: false }, { status: 403 })
    authorized = true
    return Response.json({ ok: true })
  }
  if (action === 'overview') {
    if (!authorized) return Response.json({ ok: false, error: 'Cần đăng nhập.' }, { status: 403 })
    if (overviewFails) { overviewFails = false; return Response.json({ ok: false, error: 'Chưa tải được thông tin bảo mật. Vui lòng thử lại.' }, { status: 503 }) }
    return Response.json({ ok: true, devices: [{ id: 'qa-device', label: 'Máy kiểm thử', expires_at: '2099-01-01T00:00:00Z' }], sessions: [], events: [{ id: 'qa-event', event_type: 'mfa_challenge_verified', success: true, created_at: '2026-10-12T02:00:00Z' }] })
  }
  if (action === 'device_create') return Response.json(authorized ? { ok: true, device_token: 'qa-device' } : { ok: false }, { status: authorized ? 200 : 403 })
  if (action === 'device_revoke') return Response.json({ ok: true })
  throw new Error('Unexpected fixture security action: ' + action)
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><ProfileModal currentUser={user} initialSection="security" onClose={() => {}} onUpdate={() => {}} /></QueryClientProvider>)
