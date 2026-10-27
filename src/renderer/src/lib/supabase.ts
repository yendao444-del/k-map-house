import { createClient } from '@supabase/supabase-js'
import { authStorage, authStorageKey, migrateLegacyAuthStorage } from './auth-storage'
import { securityFetch } from './security-request'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Capture the recovery intent before Supabase consumes the URL hash. The query
// flag survives page reloads; sessionStorage also keeps the state during HMR.
const recoveryStorageKey = 'an-khang-password-recovery'
const recoveryHashDetected =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type') === 'recovery'
const recoveryQueryDetected =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('password-recovery') === '1'

if (recoveryHashDetected || recoveryQueryDetected) {
  window.sessionStorage.setItem(recoveryStorageKey, '1')
}

const openedFromPasswordRecoveryLink =
  typeof window !== 'undefined' &&
  (recoveryHashDetected ||
    recoveryQueryDetected ||
    window.sessionStorage.getItem(recoveryStorageKey) === '1')

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Thiếu biến môi trường Supabase.')
}

migrateLegacyAuthStorage(supabaseUrl)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: import.meta.env.VITE_CONTRACT_DB_SCHEMA || 'public' },
  auth: { storage: authStorage, storageKey: authStorageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: {
    fetch: (input, options) => {
      const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const securityRequest = url.includes('/auth/v1/') || url.includes('/rpc/resolve_login_email') || url.includes('/rpc/security_mfa_readiness') || url.includes('/rpc/management_user_directory') || (url.includes('/rest/v1/users?') && (!options?.method || options.method === 'GET'))
      return securityRequest ? securityFetch(input, options) : fetch(input, options)
    }
  }
})

export const isPasswordRecoveryRedirect = (): boolean => openedFromPasswordRecoveryLink

export const clearPasswordRecoveryRedirect = (): void => {
  window.sessionStorage.removeItem(recoveryStorageKey)
}

export async function safeQuery<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T> {
  try {
    const { data, error } = await queryFn()
    if (error) {
      const errorMessage = String(error.message || '')
      if (errorMessage.includes('Management MFA/session verification required')) {
        throw new Error('Phiên bảo mật cần xác nhận lại. Vui lòng thử thao tác và nhập mật khẩu hiện tại; nếu phiên đã hết hạn, hãy đăng nhập lại.')
      }
      const missingTableMatch = errorMessage.match(/Could not find the table '([^']+)'/i)
      const missingTable = missingTableMatch?.[1]

      if (error.code === 'PGRST205' || missingTable) {
        if (missingTable === 'public.users') {
          throw new Error(
            'Thiếu bảng public.users trên Supabase. Hãy chạy schema auth/profile trước khi dùng tab Tài khoản hoặc đăng nhập.'
          )
        }
        if (missingTable) {
          throw new Error(
            `Thiếu bảng ${missingTable} trên Supabase. Hãy tạo bảng này rồi tải lại ứng dụng.`
          )
        }
        throw new Error('Thiếu bảng dữ liệu trên Supabase. Hãy kiểm tra lại schema đã chạy đầy đủ chưa.')
      }

      throw new Error(errorMessage)
    }

    if (data === null) return [] as unknown as T
    return data
  } catch (err) {
    if (!navigator.onLine) {
      throw new Error('Mất kết nối internet. Kiểm tra mạng và thử lại.')
    }
    throw err
  }
}
