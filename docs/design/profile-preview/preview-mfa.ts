// This fixture never connects to Supabase or enrolls a real account.
export type TotpFactor = { id: string; factor_type: 'totp'; status: 'verified' | 'unverified' }
export async function listTotpFactors(): Promise<TotpFactor[]> { return [] }
export async function isTotpEnrollmentAvailable(): Promise<boolean> { return false }
const unavailable = async (): Promise<never> => { throw new Error('Bản xem trước không thiết lập MFA hoặc kết nối tài khoản thật.') }
export const startTotpEnrollment = unavailable
export const verifyTotpEnrollment = unavailable
export const unenrollTotp = unavailable
export const issueRecoveryCodes = unavailable
export const logSecurityEvent = unavailable
export const beginTotpChallenge = unavailable
export const verifyTotpChallenge = unavailable
export const securityState = async () => ({ state: 'optional' as const, recent_mfa: false })
export const securityOverview = async () => ({ devices: [], sessions: [], events: [] })
export const trustSecurityDevice = unavailable
export const revokeSecurityDevice = unavailable
export const revokeSecuritySessions = unavailable
export const authorizeSecuritySession = unavailable
export const sendSecurityEmailCode = unavailable
export const verifySecurityEmailCode = unavailable
export const acknowledgeRecoveryCodes = unavailable
export async function issueRecoveryBundle(): Promise<{ batchId: string; codes: string[] }> {
  return { batchId: 'preview-batch', codes: ['ABCD1234-EFGH5678-IJKL9012-MNOP3456', 'QRST7890-UVWX1234-YZAB5678-CDEF9012', 'GHIJ3456-KLMN7890-OPQR1234-STUV5678', 'WXYZ9012-ABCD3456-EFGH7890-IJKL1234'] }
}
export const consumeSecurityRecoveryCode = unavailable
export const resetMfaAfterRecovery = unavailable
export const beginSecurityRecovery = unavailable

export const cancelMfaLogin = unavailable
