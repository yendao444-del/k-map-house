import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Thiếu biến môi trường Supabase.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null

export async function safeQuery<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T> {
  try {
    const { data, error } = await queryFn()
    if (error) {
      if (
        error.code === 'PGRST205' ||
        String(error.message || '').includes("Could not find the table 'public.users'")
      ) {
        throw new Error(
          'Thiếu bảng public.users trên Supabase. Hãy chạy schema auth/profile trước khi dùng tab Tài khoản hoặc đăng nhập.'
        )
      }
      throw new Error(error.message)
    }
    if (data === null) return [] as unknown as T // Handle empty selects
    return data
  } catch (err) {
    if (!navigator.onLine) {
      throw new Error('Mất kết nối internet. Kiểm tra mạng và thử lại.')
    }
    throw err
  }
}
