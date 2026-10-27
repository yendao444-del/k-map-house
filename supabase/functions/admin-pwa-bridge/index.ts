import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { emailPlainText, inlineEmailAttachments } from '../_shared/email-renderer.ts'

const allowedOrigin = (origin: string | null): string | null => {
  if (!origin) return null
  try {
    const url = new URL(origin)
    if (
      origin === 'https://app.phongtroankhang.com' ||
      origin === 'https://ankhanghome-admin-pwa.pages.dev' ||
      origin === 'http://127.0.0.1:4178' ||
      (url.protocol === 'https:' && url.hostname.endsWith('.ankhanghome-admin-pwa.pages.dev'))
    )
      return origin
  } catch {
    // An invalid Origin is never granted CORS access.
  }
  return null
}

const response = (body: Record<string, unknown>, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {})
    }
  })

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const subjectPattern = /^AN KHANG HOME · (?:Xác nhận (?:bản sửa )?hợp đồng|Thông báo hủy hợp đồng) phòng .{1,120}$/

const digest = async (input: string): Promise<string> => {
  const bytes = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

type Access = { ok: true } | { ok: false; response: Response }

async function requireAdmin(req: Request, origin: string | null): Promise<Access> {
  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token)
    return { ok: false, response: response({ ok: false, error: 'Phiên đăng nhập không hợp lệ.' }, 401, origin) }

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey)
    return { ok: false, response: response({ ok: false, error: 'Máy chủ chưa sẵn sàng.' }, 503, origin) }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  const userId = authData.user?.id
  if (authError || !userId)
    return { ok: false, response: response({ ok: false, error: 'Phiên đăng nhập đã hết hạn.' }, 401, origin) }

  const userDb = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const { data: allowed, error: securityError } = await userDb.rpc('security_management_access_allowed', { p_sensitive: true })
  if (securityError || allowed !== true)
    return {
      ok: false,
      response: response({ ok: false, error: 'Cần hoàn tất xác minh 2FA trước khi thao tác quản trị.' }, 403, origin)
    }

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('role,status')
    .eq('id', userId)
    .maybeSingle()
  if (profileError || profile?.role !== 'admin' || profile.status !== 'active')
    return { ok: false, response: response({ ok: false, error: 'Bạn không có quyền quản trị.' }, 403, origin) }
  return { ok: true }
}

Deno.serve(async (req) => {
  const origin = allowedOrigin(req.headers.get('Origin'))
  if (req.method === 'OPTIONS')
    return origin ? response({ ok: true }, 200, origin) : response({ ok: false, error: 'Origin không được phép.' }, 403)
  if (!origin) return response({ ok: false, error: 'Origin không được phép.' }, 403)
  if (req.method !== 'POST') return response({ ok: false, error: 'Method not allowed.' }, 405, origin)

  const access = await requireAdmin(req, origin)
  if (!access.ok) return access.response

  let body: { action?: unknown; payload?: unknown }
  try {
    body = await req.json()
  } catch {
    return response({ ok: false, error: 'Dữ liệu yêu cầu không hợp lệ.' }, 400, origin)
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  const from = Deno.env.get('MAIL_FROM')?.trim()
  const replyTo = Deno.env.get('MAIL_REPLY_TO')?.trim()
  if (body.action === 'email-availability')
    return response({ ok: true, data: { available: Boolean(apiKey && from), authenticated: true, server: true } }, 200, origin)
  if (body.action !== 'email-send') return response({ ok: false, error: 'Thao tác không được hỗ trợ.' }, 400, origin)
  if (!apiKey || !from)
    return response({ ok: false, error: 'Máy chủ email chưa được cấu hình Resend.' }, 503, origin)

  const payload = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Record<string, unknown>
  const to = typeof payload.to === 'string' ? payload.to.trim().toLowerCase() : ''
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : ''
  const html = typeof payload.html === 'string' ? payload.html : ''
  if (!emailPattern.test(to) || to.length > 254 || !subjectPattern.test(subject) || html.length < 1 || html.length > 200_000)
    return response({ ok: false, error: 'Nội dung email hợp đồng không hợp lệ.' }, 400, origin)

  try {
    const idempotency = `ankhang-pwa-contract-${await digest(`${to}\n${subject}\n${html}`)}`
    const provider = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotency
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text: emailPlainText(html),
        attachments: inlineEmailAttachments(html),
        ...(replyTo ? { reply_to: replyTo } : {})
      }),
      signal: AbortSignal.timeout(15_000)
    })
    const result = await provider.json().catch(() => ({})) as { id?: string; message?: string }
    if (!provider.ok || !result.id)
      return response({ ok: false, error: result.message || `Resend HTTP ${provider.status}` }, 502, origin)
    return response({ ok: true, data: { ok: true, messageId: result.id } }, 200, origin)
  } catch (error) {
    console.error('admin-pwa-bridge email-send:', error instanceof Error ? error.message : 'unknown')
    return response({ ok: false, error: 'Không gửi được email trên máy chủ.' }, 502, origin)
  }
})
