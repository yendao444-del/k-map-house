import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function safeQuery<T>(
    queryFn: () => PromiseLike<{ data: T | null; error: any }>
): Promise<T> {
    try {
        const { data, error } = await queryFn()
        if (error) throw new Error(error.message)
        if (data === null) return [] as unknown as T // Handle empty selects
        return data
    } catch (err) {
        if (!navigator.onLine) {
            throw new Error('Mất kết nối internet. Kiểm tra mạng và thử lại.')
        }
        throw err
    }
}
