import { requestJson } from './request-json.mjs'
export type TenantRoomAsset = { id: string; name: string; quantity: number; type?: string | null; status?: string | null }
export type TenantProfile = { mode: 'demo' | 'tenant'; kind: 'existing' | 'new'; name: string; room: string; contractId: string; email: string; userId: string; start: string; tenantId?: string; floor?: number | null; area?: number | null; rent?: number | null; assets?: TenantRoomAsset[] | null; services?: { electricPrice: number; waterPrice: number; internetPrice: number; cleaningPrice: number } | null; electricInitial?: number | null; waterInitial?: number | null; invoiceDay?: number | null; simulation?: boolean }
export class AuthError extends Error { constructor(message: string, public status: number) { super(message) } }
export async function authRequest(action: 'session' | 'login' | 'logout', credentials?: { email: string; password: string }): Promise<TenantProfile | null> {
  let response: Response
  let data: any
  try { ({response,data}=await requestJson('/api/auth', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...credentials }) },20000)) }
  catch { throw new AuthError('Chưa kết nối được dịch vụ đăng nhập. Hãy thử lại.', 503) }
  if (!response.ok || !data?.ok) throw new AuthError(data?.reason || 'Chưa xử lý được yêu cầu.', response.status)
  if (action !== 'logout' && !(data.profile?.mode === 'tenant' && data.profile.tenantId && data.profile.userId) && !['demo-current-101', 'demo-current-102'].includes(data.profile?.contractId)) throw new AuthError('Tài khoản chưa được gắn với phòng.', 403)
  return data.profile || null
}
