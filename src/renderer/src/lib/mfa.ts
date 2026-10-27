import { supabase } from './supabase'
import { managementSecurity, managementLogin } from './management-auth-client'
import { securityRead } from './security-request'

export class MfaChallengeRequired extends Error {
  constructor(public readonly factorId: string, public readonly challengeId: string) {
    super('Cần xác minh Google Authenticator.')
    this.name = 'MfaChallengeRequired'
  }
}
export class SecurityStepUpRequired extends Error {
  constructor(public readonly state: string) { super('Cần xác minh thêm để bảo vệ phiên đăng nhập.'); this.name = 'SecurityStepUpRequired' }
}

export type TotpFactor = {
  id: string
  friendly_name?: string | null
  factor_type: 'totp'
  status: 'verified' | 'unverified'
  created_at?: string
  updated_at?: string
}

export async function listTotpFactors(): Promise<TotpFactor[]> {
  const { data, error } = await securityRead(() => supabase.auth.mfa.listFactors())
  if (error) throw new Error('Không thể tải trạng thái Google Authenticator.')
  // auth-js exposes only verified factors in `totp`; abandoned/unverified
  // factors are retained in the complete `all` collection.
  const all = Array.isArray(data?.all) ? data.all : data?.totp || []
  return all.filter(factor => factor.factor_type === 'totp') as TotpFactor[]
}

export async function isTotpEnrollmentAvailable(): Promise<boolean> {
  // Enrollment must wait for the deployed recovery/session service, rather
  // than leave a verified factor behind when the recovery RPC is missing.
  const { data, error } = await securityRead(() => supabase.rpc('security_mfa_readiness'))
  return !error && data?.enrollment_enabled === true
}

export async function startTotpEnrollment(friendlyName = 'Google Authenticator'): Promise<{ factorId: string; challengeId: string; qrCode: string; secret: string }> {
  if (!await isTotpEnrollmentAvailable()) throw new Error('Thiết lập MFA chưa được mở. Vui lòng thử lại sau.')
  // Supabase keeps an unverified factor when a QR setup is abandoned. Remove
  // only those stale factors so the user can safely restart enrollment.
  const existing = await listTotpFactors()
  if (existing.some(factor => factor.status === 'verified')) {
    throw new Error('Google Authenticator đã được bật cho tài khoản này.')
  }
  for (const factor of existing.filter(item => item.status === 'unverified')) {
    const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (cleanupError) throw new Error('Thiết lập MFA trước đó chưa hoàn tất. Hãy tải lại trang rồi thử lại.')
  }
  return enrollTotpFactor(friendlyName)
}

async function enrollTotpFactor(friendlyName: string): Promise<{ factorId: string; challengeId: string; qrCode: string; secret: string }> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName })
  if (error || !data?.id || !data.totp?.qr_code || !data.totp.secret) {
    throw new Error(error?.message || 'Không thể bắt đầu thiết lập Google Authenticator.')
  }
  const challengeId = await beginTotpChallenge(data.id)
  return { factorId: data.id, challengeId, qrCode: data.totp.qr_code, secret: data.totp.secret }
}

/** Enroll a replacement while the existing verified factor remains active. */
export async function startTotpReplacementEnrollment(friendlyName = 'Google Authenticator mới') {
  if (!await isTotpEnrollmentAvailable()) throw new Error('Thiết lập MFA chưa được mở. Vui lòng thử lại sau.')
  for (const factor of (await listTotpFactors()).filter(item => item.status === 'unverified')) await unenrollTotp(factor.id)
  const setup = await enrollTotpFactor(friendlyName)
  try {
    const result = await securityCall('totp_replace_register', { factor_id: setup.factorId })
    if (result.ok !== true) throw new Error('Chưa đăng ký được thiết bị xác thực mới.')
  } catch (caught) { await unenrollTotp(setup.factorId).catch(() => undefined); throw caught }
  return setup
}

export async function prepareTotpReplacement(factorId: string) {
  const result = await securityCall('totp_replace_begin', { factor_id: factorId })
  if (result.ok !== true) throw new Error('Chưa bắt đầu được việc đổi Authenticator. Vui lòng xác minh lại mã hiện tại.')
}
export async function cancelTotpReplacement() {
  const result = await securityCall('totp_replace_cancel')
  if (result.ok !== true) throw new Error('Thiết bị mới đã xác minh. Hãy hoàn tất lưu mã khôi phục.')
}

let profileSecurityFlowCount = 0
/** UI-only: retain a once-visible QR/code bundle; backend access remains gated. */
export function retainProfileSecurityFlow() { profileSecurityFlowCount++; return () => { profileSecurityFlowCount = Math.max(0, profileSecurityFlowCount - 1) } }
export function isProfileSecurityFlowPending() { return profileSecurityFlowCount > 0 }

export async function retireTotpFactor(oldFactorId: string, newFactorId: string): Promise<void> {
  const result = await securityCall('totp_retire', { old_factor_id: oldFactorId, new_factor_id: newFactorId })
  if (result.ok !== true) throw new Error('Chưa thể hoàn tất đổi Google Authenticator. Thiết bị cũ vẫn được giữ nguyên.')
}

export async function verifyTotpEnrollment(factorId: string, challengeId: string, code: string): Promise<void> {
  await verifyTotpChallenge(factorId, challengeId, code)
}

export async function unenrollTotp(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw new Error('Không thể tắt Google Authenticator.')
}

export async function beginTotpChallenge(factorId: string): Promise<string> {
  const result = await securityCall('totp_challenge', { factor_id: factorId })
  if (typeof result.challenge_id !== 'string') throw new Error('Không thể tạo phiên xác minh MFA.')
  return result.challenge_id
}

export async function verifyTotpChallenge(factorId: string, challengeId: string, code: string): Promise<void> {
  const result = await securityCall('totp_verify', { factor_id: factorId, challenge_id: challengeId, code: code.trim() })
  const accessToken = typeof result.session === 'object' && result.session && 'access_token' in result.session ? (result.session as { access_token?: unknown }).access_token : null
  const refreshToken = typeof result.session === 'object' && result.session && 'refresh_token' in result.session ? (result.session as { refresh_token?: unknown }).refresh_token : null
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') throw new Error('Phiên MFA không hợp lệ. Vui lòng thử lại.')
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (error) throw new Error('Không thể hoàn tất phiên MFA. Vui lòng thử lại.')
}

async function securityCall(action: string, data: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const { data: sessionData } = await securityRead(() => supabase.auth.getSession())
  if (!sessionData.session?.access_token) throw new Error('Phiên bảo mật đã hết hạn. Vui lòng đăng nhập lại.')
  return managementSecurity(action, data, sessionData.session.access_token)
}

export async function authorizeSecuritySession(): Promise<void> {
  const result = await securityCall('authorize')
  if (result.ok !== true) throw new Error('Cần hoàn tất xác minh bảo mật trước khi vào hệ thống.')
}

export async function securityState(): Promise<Record<string, unknown>> { return securityCall('status') }
/** Read only this signed-in account's security badges. */
export async function ownSecurityMethods(): Promise<{ authenticatorVerified: boolean; emailVerified: boolean }> {
  const { data: sessionData } = await securityRead(() => supabase.auth.getSession())
  const userId = sessionData.session?.user?.id
  if (!userId) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
  const { data, error } = await securityRead(() => supabase.rpc('management_user_directory', undefined, { get: true }).select('authenticator_verified,email_verified').eq('id', userId).maybeSingle())
  if (error || !data || typeof data !== 'object') throw new Error('Không thể tải trạng thái phương thức xác minh.')
  const row = data as { authenticator_verified?: unknown; email_verified?: unknown }
  if (typeof row.authenticator_verified !== 'boolean' || typeof row.email_verified !== 'boolean') throw new Error('Trạng thái phương thức xác minh không hợp lệ.')
  return { authenticatorVerified: row.authenticator_verified, emailVerified: row.email_verified }
}
export async function hasRecentPasswordConfirmation(): Promise<boolean> {
  const result = await securityCall('password_status')
  return result.ok === true && result.recent_password === true
}
export async function confirmSensitivePassword(password: string): Promise<void> {
  if (typeof password !== 'string' || password.length === 0 || password.length > 256) throw new Error('Nhập mật khẩu hiện tại.')
  const result = await securityCall('password_confirm', { password })
  if (result.ok !== true) throw new Error('Mật khẩu hiện tại không đúng.')
}
export async function changeOwnPasswordWithConfirmation(newPassword: string, currentPassword: string): Promise<void> {
  if (!currentPassword || newPassword.length < 12) throw new Error('Nhập mật khẩu hiện tại và mật khẩu mới từ 12 ký tự.')
  const result = await securityCall('password_change', { password: currentPassword, new_password: newPassword })
  if (result.ok !== true) throw new Error('Chưa đổi được mật khẩu. Vui lòng thử lại.')
}
export async function sendSecurityEmailCode(purpose: 'signin' | 'recovery' | 'login'): Promise<{ challengeId: string; maskedEmail?: string }> {
  const result = await securityCall('email_send', { purpose })
  if (typeof result.challenge_id !== 'string') throw new Error('Chưa tạo được mã email xác minh.')
  return { challengeId: result.challenge_id, maskedEmail: typeof result.masked_email === 'string' ? result.masked_email : undefined }
}
export async function verifySecurityEmailCode(purpose: 'signin' | 'recovery' | 'login', challengeId: string, code: string): Promise<void> {
  const result = await securityCall('email_verify', { purpose, challenge_id: challengeId, code: code.trim() })
  if (result.ok !== true) throw new Error('Mã email không đúng hoặc đã hết hạn.')
}
export async function acknowledgeRecoveryCodes(batchId: string): Promise<void> {
  const result = await securityCall('recovery_ack', { batch_id: batchId })
  if (result.ok !== true) throw new Error('Chưa ghi nhận việc lưu mã khôi phục.')
}
export async function issueRecoveryBundle(): Promise<{ batchId: string; codes: string[] }> {
  const data = await securityCall('recovery_issue')
  if (typeof data.batch_id !== 'string' || !Array.isArray(data.codes)) throw new Error('Chưa thể tạo mã khôi phục.')
  return { batchId: data.batch_id, codes: data.codes.filter((code): code is string => typeof code === 'string') }
}
export async function consumeSecurityRecoveryCode(code: string): Promise<void> {
  const result = await securityCall('recovery_consume', { code: code.trim() })
  if (result.ok !== true) throw new Error('Mã khôi phục không đúng hoặc đã được sử dụng.')
}

export async function resetMfaAfterRecovery(): Promise<void> {
  const result = await securityCall('recovery_reset')
  if (result.ok !== true) throw new Error('Chưa thể đặt lại Google Authenticator.')
}

export async function beginSecurityRecovery(login: string, password: string): Promise<void> {
  if (!login.trim() || !password) throw new Error('Nhập tài khoản và mật khẩu hiện tại.')
  const tokens = await managementLogin(login.trim(), password)
  const { error } = await supabase.auth.setSession(tokens)
  if (error) throw new Error('Không thể xác minh lại tài khoản.')
}

export async function securityOverview(): Promise<{ devices: Array<Record<string, unknown>>; sessions: Array<Record<string, unknown>>; events: Array<Record<string, unknown>> }> {
  const result = await securityCall('overview')
  return {
    devices: Array.isArray(result.devices) ? result.devices as Array<Record<string, unknown>> : [],
    sessions: Array.isArray(result.sessions) ? result.sessions as Array<Record<string, unknown>> : [],
    events: Array.isArray(result.events) ? result.events as Array<Record<string, unknown>> : []
  }
}

export async function trustSecurityDevice(label: string): Promise<void> {
  const result = await securityCall('device_create', { label })
  if (result.ok !== true || typeof result.device_token !== 'string') throw new Error('Chưa ghi nhận được thiết bị tin cậy.')
  window.localStorage.setItem('ankhang-management-device', result.device_token)
}

export async function revokeSecurityDevice(deviceId: string): Promise<void> {
  const result = await securityCall('device_revoke', { device_id: deviceId })
  if (result.ok !== true) throw new Error('Không thể thu hồi thiết bị.')
}

export async function revokeSecuritySessions(): Promise<void> {
  const result = await securityCall('revoke_session', { all: true })
  if (result.ok !== true) throw new Error('Không thể thu hồi phiên đăng nhập.')
  window.localStorage.removeItem('ankhang-management-device')
  await supabase.auth.signOut({ scope: 'global' })
}

export async function currentAssuranceLevel(): Promise<'aal1' | 'aal2'> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data?.currentLevel) throw new Error('Không thể kiểm tra mức xác minh của phiên đăng nhập.')
  return data?.currentLevel === 'aal2' ? 'aal2' : 'aal1'
}

// This is a UI guard, not a replacement for the backend AAL2 policy. Always
// check restored sessions too, and never treat a failed factor lookup as none.
export async function requireSessionMfa(state?: Record<string, unknown>): Promise<void> {
  if (state?.state === 'ready' && state.device_verified === true && state.login_method === 'dev_device') return
  // This proof comes from the trusted service; database guards verify it again.
  if (state?.state === 'ready' && state.second_factor_verified === true && state.login_method === 'email') return
  const factors = await listTotpFactors()
  const verified = factors.find(factor => factor.status === 'verified')
  if (!verified) return
  if (await currentAssuranceLevel() === 'aal2') return
  throw new MfaChallengeRequired(verified.id, await beginTotpChallenge(verified.id))
}

export async function cancelMfaLogin(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw new Error('Chưa thể đóng phiên đăng nhập. Hãy thử lại.')
}

export async function issueRecoveryCodes(): Promise<string[]> {
  return (await issueRecoveryBundle()).codes
}

