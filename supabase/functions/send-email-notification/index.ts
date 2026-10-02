import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Chưa đăng nhập.')
    const { data: profile } = await admin.from('users').select('role,status').eq('id', user.id).maybeSingle()
    if (profile?.role !== 'admin' || profile?.status !== 'active') throw new Error('Chỉ quản trị viên mới được gửi email.')
    const body = await req.json()
    const { recipientUserId, eventType, subject, html, dedupeKey, payload = {}, resend = false } = body
    if (!recipientUserId || !eventType || !subject || !html) throw new Error('Thiếu thông tin email.')
    const { data: recipient } = await admin.from('users').select('id,full_name,notification_email,email_notifications_enabled,email_notification_preferences').eq('id', recipientUserId).single()
    if (!recipient?.notification_email) throw new Error('Tài khoản chưa có Gmail nhận thông báo.')
    if (!recipient.email_notifications_enabled || recipient.email_notification_preferences?.[eventType] === false) throw new Error('Tài khoản đã tắt loại thông báo này.')
    if (!resend && dedupeKey) {
      const { data: existing } = await admin.from('email_notification_deliveries').select('id,status').eq('dedupe_key', dedupeKey).maybeSingle()
      if (existing) return Response.json({ ok: true, status: 'skipped', delivery: existing }, { headers: cors })
    }
    const key = resend ? `${dedupeKey || eventType}:${crypto.randomUUID()}` : (dedupeKey || `${recipientUserId}:${eventType}:${new Date().toISOString().slice(0,10)}`)
    const { data: row, error: insertError } = await admin.from('email_notification_deliveries').insert({ recipient_user_id: recipient.id, recipient_email: recipient.notification_email, recipient_name: recipient.full_name, event_type: eventType, dedupe_key: key, subject, payload, status: 'sending', created_by: user.id }).select().single()
    if (insertError) throw insertError
    try {
      const apiKey = Deno.env.get('RESEND_API_KEY')
      const from = Deno.env.get('MAIL_FROM')
      if (!apiKey || !from) throw new Error('Chưa cấu hình RESEND_API_KEY và MAIL_FROM trên Edge Function.')
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [recipient.notification_email], subject, html }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.message || 'Resend gửi email thất bại.')
      await admin.from('email_notification_deliveries').update({ status: 'sent', provider: 'resend', provider_message_id: result.id, sent_at: new Date().toISOString() }).eq('id', row.id)
      return Response.json({ ok: true, status: 'sent', deliveryId: row.id }, { headers: cors })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Gửi email thất bại.'
      await admin.from('email_notification_deliveries').update({ status: 'failed', error_message: message }).eq('id', row.id)
      throw sendError
    }
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'Gửi email thất bại.' }, { status: 400, headers: cors })
  }
})
