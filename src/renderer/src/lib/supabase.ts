import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Thiếu biến môi trường Supabase.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function safeQuery<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T> {
  try {
    const { data, error } = await queryFn()
    if (error) {
      const errorMessage = String(error.message || '')
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
