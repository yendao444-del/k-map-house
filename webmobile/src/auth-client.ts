export type TenantProfile = { mode: 'demo' | 'tenant'; kind: 'existing' | 'new'; name: string; room: string; contractId: string; email: string; userId: string; start: string; tenantId?: string; floor?: number | null; area?: number | null; rent?: number | null }
export class AuthError extends Error { constructor(message: string, public status: number) { super(message) } }
export async function authRequest(action: 'session' | 'login' | 'logout', credentials?: { email: string; password: string }): Promise<TenantProfile | null> {
  let response: Response
  try { response = await fetch('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...credentials }), signal: AbortSignal.timeout(20000) }) }
  catch { throw new AuthError('Chưa kết nối được dịch vụ đăng nhập. Hãy thử lại.', 503) }
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.ok) throw new AuthError(data?.reason || 'Chưa xử lý được yêu cầu.', response.status)
  if (action !== 'logout' && !(data.profile?.mode === 'tenant' && data.profile.tenantId && data.profile.userId) && !['demo-current-101', 'demo-current-102'].includes(data.profile?.contractId)) throw new AuthError('Tài khoản chưa được gắn với phòng.', 403)
  return data.profile || null
}
