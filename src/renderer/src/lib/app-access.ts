import { supabase } from './supabase'

// Apps an account may open. Admins always have both; the server enforces this
// (user_has_app / security_management_access_allowed), the UI only mirrors it.
export type AppKey = 'property' | 'dby-finance'
export const ALL_APPS: AppKey[] = ['property', 'dby-finance']
export const DEFAULT_APPS: AppKey[] = ['property']

const normalize = (value: unknown): AppKey[] =>
  Array.isArray(value) ? ALL_APPS.filter(app => value.includes(app)) : []

const friendly = (error: { message?: string } | null, fallback: string): Error =>
  new Error(error?.message && /[À-ỹ]/.test(error.message) ? error.message : fallback)

// Admin: every management account. Others: only their own row.
export async function getUserAppAccess(): Promise<Record<string, AppKey[]>> {
  const { data, error } = await supabase.rpc('user_app_access_read')
  if (error) throw friendly(error, 'Chưa tải được quyền ứng dụng.')
  const result: Record<string, AppKey[]> = {}
  for (const row of (data || []) as Array<{ user_id: string; apps: unknown }>) result[row.user_id] = normalize(row.apps)
  return result
}

export async function setUserAppAccess(userId: string, apps: AppKey[]): Promise<AppKey[]> {
  const { data, error } = await supabase.rpc('admin_set_user_app_access', { p_user_id: userId, p_apps: normalize(apps) })
  if (error) throw friendly(error, 'Không lưu được quyền ứng dụng.')
  return normalize(data)
}
