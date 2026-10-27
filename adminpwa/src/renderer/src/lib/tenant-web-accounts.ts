import { supabase, safeQuery } from './supabase'
import { getCurrentAccessToken } from './db'

export type TenantWebAccount = {
  tenant_id: string
  auth_user_id: string
  email: string
  status: 'pending' | 'active' | 'locked'
  activated_at: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}
export type TenantAccountAction =
  | 'create'
  | 'reset_password'
  | 'lock'
  | 'unlock'
  | 'revoke_sessions'
export const tenantWebAccountQueryKey = ['tenant-web-accounts'] as const
export async function getTenantWebAccounts(): Promise<TenantWebAccount[]> {
  return (await safeQuery(() =>
    supabase
      .from('tenant_web_accounts')
      .select(
        'tenant_id,auth_user_id,email,status,activated_at,last_login_at,created_at,updated_at'
      )
  )) as TenantWebAccount[]
}
export async function manageTenantWebAccount(
  tenantId: string,
  action: TenantAccountAction,
  password?: string
): Promise<TenantWebAccount> {
  const { data, error } = await supabase.functions.invoke('tenant-web-admin', {
    headers: { Authorization: `Bearer ${await getCurrentAccessToken()}` },
    body: { tenantId, action, ...(password ? { password } : {}) }
  })
  if (error) {
    let reason = ''
    try {
      reason = (await error.context?.json())?.error || ''
    } catch {
      /* Gateway errors need a generic message. */
    }
    throw new Error(reason || 'Chưa kết nối được dịch vụ tài khoản website. Hãy thử lại.')
  }
  if (!data?.ok || !data.account)
    throw new Error(data?.error || 'Chưa cập nhật được tài khoản website.')
  return data.account
}
export function generateTenantPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  return 'Ak!' + Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')
}
export function tenantWebAccountLabel(account?: TenantWebAccount): string {
  return !account
    ? 'Chưa cấp'
    : account.status === 'locked'
      ? 'Đã khóa'
      : account.status === 'pending'
        ? 'Chờ đăng nhập'
        : 'Hoạt động'
}
