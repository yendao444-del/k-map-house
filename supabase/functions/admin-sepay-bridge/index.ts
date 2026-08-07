import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

type Json = Record<string, unknown>

const response = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

async function requireAdmin(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return { ok: false, response: response({ ok: false, error: 'Phiên đăng nhập không hợp lệ.' }, 401) }

  const { data: authData, error: authError } = await admin.auth.getUser(token)
  const userId = authData.user?.id
  if (authError || !userId) return { ok: false, response: response({ ok: false, error: 'Phiên đăng nhập đã hết hạn.' }, 401) }

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('role,status')
    .eq('id', userId)
    .maybeSingle()
  if (profileError || profile?.role !== 'admin' || profile?.status !== 'active') {
    return { ok: false, response: response({ ok: false, error: 'Bạn không có quyền quản trị.' }, 403) }
  }
  return { ok: true }
}

async function fetchSepay(): Promise<Response> {
  const { data, error } = await admin.from('app_secrets').select('sepay_api_token').eq('id', 'default').maybeSingle()
  const token = typeof data?.sepay_api_token === 'string' ? data.sepay_api_token.trim() : ''
  if (error || !token) return response({ ok: false, error: 'Vui lòng thiết lập API Token SePay trong Cài đặt.' }, 400)

  const sepayResponse = await fetch('https://my.sepay.vn/userapi/transactions/list', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'AN-KHANG-HOME/1.0' }
  })
  const text = await sepayResponse.text()
  let dataJson: unknown
  try { dataJson = JSON.parse(text) } catch { return response({ ok: false, error: `SePay trả phản hồi không phải JSON (HTTP ${sepayResponse.status}).` }, 502) }
  if (!sepayResponse.ok) {
    const detail = (dataJson as Json)?.error || (dataJson as Json)?.message || `HTTP ${sepayResponse.status}`
    return response({ ok: false, error: `SePay từ chối yêu cầu: ${detail}` }, 502)
  }
  return response({ ok: true, data: dataJson })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed.' }, 405)

  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  let body: Json
  try { body = await req.json() } catch { return response({ ok: false, error: 'Dữ liệu yêu cầu không hợp lệ.' }, 400) }

  switch (body.action) {
    case 'sepay_fetch': return fetchSepay()
    case 'sepay_status': {
      const { data, error } = await admin.from('app_secrets').select('sepay_api_token').eq('id', 'default').maybeSingle()
      if (error) return response({ ok: false, error: 'Không đọc được cấu hình SePay.' }, 500)
      const token = typeof data?.sepay_api_token === 'string' ? data.sepay_api_token.trim() : ''
      return response({ ok: true, configured: Boolean(token), maskedToken: token ? `••••••••${token.slice(-4)}` : '' })
    }
    case 'sepay_set': {
      const token = typeof body.token === 'string' ? body.token.trim() : ''
      if (token && token.length < 12) return response({ ok: false, error: 'API Token SePay không hợp lệ.' }, 400)
      const { error } = await admin.from('app_secrets').upsert({ id: 'default', sepay_api_token: token || null })
      return error ? response({ ok: false, error: 'Không lưu được API Token SePay.' }, 500) : response({ ok: true })
    }
    case 'admin_create': {
      const input = (body.data || {}) as Json
      const email = typeof input.email === 'string' ? input.email.trim() : ''
      const password = typeof input.password === 'string' ? input.password : ''
      const fullName = typeof input.full_name === 'string' ? input.full_name.trim() : ''
      const username = typeof input.username === 'string' ? input.username.trim() : email.split('@')[0]
      if (!email || !password || !fullName) return response({ ok: false, error: 'Thiếu thông tin tài khoản.' }, 400)
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, username } })
      return error ? response({ ok: false, error: error.message }, 400) : response({ ok: true, data })
    }
    case 'admin_reset_password': {
      const userId = typeof body.userId === 'string' ? body.userId : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const { data, error } = await admin.auth.admin.updateUserById(userId, { password })
      return error ? response({ ok: false, error: error.message }, 400) : response({ ok: true, data })
    }
    case 'admin_delete': {
      const userId = typeof body.userId === 'string' ? body.userId : ''
      const { error } = await admin.auth.admin.deleteUser(userId)
      return error ? response({ ok: false, error: error.message }, 400) : response({ ok: true })
    }
    default: return response({ ok: false, error: 'Thao tác không được hỗ trợ.' }, 400)
  }
})
