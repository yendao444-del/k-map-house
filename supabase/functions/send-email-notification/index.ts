import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deliverServerEmails } from '../_shared/email-worker.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const allowedTypes = new Set([
  'invoices_services', 'rent_overdue', 'rent_long_unpaid', 'sepay_matched',
  'sepay_unmatched', 'room_checkout_due', 'contract_expiring', 'contract_confirmation',
])
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)
  try {
    const auth = req.headers.get('authorization') || ''
    const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data: { user } } = await userDb.auth.getUser()
    if (!user) return json({ ok: false, error: 'Chưa đăng nhập.' }, 401)
    const { data: profile, error: profileError } = await admin.from('users').select('id,role,status').eq('id', user.id).maybeSingle()
    if (profileError) throw profileError
    if (profile?.role !== 'admin' || profile.status !== 'active') return json({ ok: false, error: 'Chỉ quản trị viên mới được gửi email.' }, 403)

    const body = await req.json()
    const recipientUserId = String(body?.recipientUserId || '')
    const eventType = String(body?.eventType || '')
    const subject = String(body?.subject || '').trim()
    const html = String(body?.html || '')
    const dedupeKey = body?.dedupeKey ? String(body.dedupeKey) : `${recipientUserId}:${eventType}:${new Date().toISOString().slice(0, 10)}`
    const metadata = body?.payload && typeof body.payload === 'object' ? body.payload : {}
    if (!recipientUserId || !allowedTypes.has(eventType) || !subject || subject.length > 300 || !html || html.length > 200_000) return json({ ok: false, error: 'Thông tin email không hợp lệ.' }, 400)
    if (body?.resend === true) return json({ ok: false, error: 'Kiểm thử dùng sandbox riêng, không gửi email thật.' }, 400)

    const { data: recipient, error: recipientError } = await admin.from('users').select('id,full_name,notification_email,email_notifications_enabled,email_notification_preferences').eq('id', recipientUserId).maybeSingle()
    if (recipientError) throw recipientError
    if (!recipient?.notification_email) return json({ ok: false, error: 'Tài khoản chưa có email nhận thông báo.' }, 400)
    if (!recipient.email_notifications_enabled || recipient.email_notification_preferences?.[eventType] === false) return json({ ok: false, error: 'Tài khoản đã tắt loại thông báo này.' }, 400)

    const { data: cfg, error: cfgError } = await admin.from('email_automation_settings').select('enabled').eq('id', true).single()
    if (cfgError) throw cfgError
    if (!cfg?.enabled || !Deno.env.get('RESEND_API_KEY') || !Deno.env.get('MAIL_FROM')) return json({ ok: false, error: 'Máy chủ email chưa được kích hoạt hoặc chưa cấu hình Resend.' }, 503)

    const payload = { ...metadata, manualHtml: html, manualSubject: subject }
    const { data: inserted, error: insertError } = await admin.rpc('enqueue_server_email', {
      p_type: eventType, p_key: dedupeKey, p_payload: payload, p_recipient: recipient.id, p_subject: subject,
    })
    if (insertError) throw insertError
    const { data: row, error: rowError } = await admin.from('email_notification_deliveries').select('id,status').eq('dedupe_key', dedupeKey).maybeSingle()
    if (rowError) throw rowError
    if (!row) return json({ ok: false, error: 'Không tạo được hàng đợi email.' }, 500)
    if (row.status === 'sent' || row.status === 'skipped') return json({ ok: true, status: row.status, deliveryId: row.id })
    const delivery = await deliverServerEmails(admin, { apiKey: Deno.env.get('RESEND_API_KEY'), from: Deno.env.get('MAIL_FROM'), replyTo: Deno.env.get('MAIL_REPLY_TO') }, { id: row.id, limit: 1 })
    return json({ ok: true, status: delivery.sent ? 'sent' : (delivery.failed ? 'failed' : 'queued'), deliveryId: row.id, queued: inserted })
  } catch (error) {
    console.error('send-email-notification failed:', error instanceof Error ? error.message : 'unknown')
    return json({ ok: false, error: 'Không gửi được email trên máy chủ.' }, 500)
  }
})
