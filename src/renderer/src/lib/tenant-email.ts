import { supabase } from './supabase'

export const normalizeTenantEmail = (email?: string | null): string => email?.trim().toLowerCase() || ''
export const tenantEmailFormatValid = (email: string): boolean => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
export async function checkTenantEmail(email?: string | null): Promise<string | null> {
  const normalized = normalizeTenantEmail(email)
  if (!normalized) return null
  if (!tenantEmailFormatValid(normalized)) return 'Email chưa đúng định dạng.'
  const { data, error } = await supabase.rpc('tenant_email_check', { p_email: normalized })
  if (error || typeof data?.allowed !== 'boolean') throw new Error('Chưa kiểm tra được email. Vui lòng thử lại trước khi lưu hoặc gửi hợp đồng.')
  return data.allowed ? null : data.reason || 'Email này thuộc tài khoản hệ thống. Hãy dùng email riêng của người thuê.'
}

export async function assertTenantEmail(email?: string | null): Promise<void> {
  const error = await checkTenantEmail(email)
  if (error) throw new Error(error)
}
