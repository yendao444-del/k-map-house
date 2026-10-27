import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deliverServerEmails, pollServerSepay } from '../_shared/email-worker.ts'
import { deliverTenantPaymentEmails } from '../_shared/tenant-payment-emails.ts'
import { deliverTenantPaymentReceipts } from '../_shared/tenant-payment-receipts.ts'
import {
  inlineEmailAttachments,
  renderServerEmail,
  vietnamDate
} from '../_shared/email-renderer.ts'
import { buildNotificationEmailLayout } from '../../../src/renderer/src/lib/payment-success-email.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
})
const mailEnv = () => ({
  apiKey: Deno.env.get('RESEND_API_KEY'),
  from: Deno.env.get('MAIL_FROM'),
  replyTo: Deno.env.get('MAIL_REPLY_TO')
})
Deno.serve(async (req) => {
  if (req.method !== 'POST')
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 })
  const secret = Deno.env.get('EMAIL_AUTOMATION_SECRET')
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const { data: cfg, error } = await db
      .from('email_automation_settings')
      .select('enabled,sepay_enabled,last_worker_at,last_poll_at,last_poll_error')
      .eq('id', true)
      .single()
    if (error) throw error
    const input = await req.json().catch(() => ({}))
    if (input.action === 'status')
      return Response.json({
        ok: true,
        ...cfg,
        configured: Boolean(mailEnv().apiKey && mailEnv().from)
      })
    if (input.action === 'provider_test') {
      const env = mailEnv(),
        day = vietnamDate(new Date())
      if (!env.apiKey || !env.from)
        return Response.json({ ok: false, error: 'Provider not configured' }, { status: 503 })
      // Resend's official simulation address. No user/tenant data or business
      // rows are used. The daily idempotency key also covers uncertain retries.
      const mail = renderServerEmail({
        subject: '[AN KHANG HOME] Kiểm tra kết nối Resend',
        payload: {
          manualHtml: buildNotificationEmailLayout({
            title: 'Kiểm tra kết nối email',
            tone: 'info',
            statusLabel: 'DỮ LIỆU MẪU',
            recipientName: 'Môi trường mô phỏng Resend',
            introduction:
              'Đây là email kiểm tra đường gửi máy chủ, không liên quan hóa đơn hoặc thanh toán thật.',
            highlight: 'AN KHANG HOME',
            highlightLabel: 'Hệ thống gửi',
            compact: true,
            rows: [
              ['Tên miền', 'phongtroankhang.com'],
              ['Ngày kiểm thử', day]
            ],
            conclusion: 'Email này được gửi tới địa chỉ mô phỏng chính thức của Resend.'
          })
        }
      })
      const provider = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `ankhang-provider-check-v1-${day}`
        },
        body: JSON.stringify({
          from: env.from,
          to: ['delivered@resend.dev'],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          attachments: inlineEmailAttachments(mail.html)
        }),
        signal: AbortSignal.timeout(15000)
      })
      const result = await provider.json()
      if (!provider.ok || !result.id)
        return Response.json(
          {
            ok: false,
            simulatedRecipient: true,
            providerStatus: provider.status,
            error: result.message || 'Provider failed'
          },
          { status: 502 }
        )
      return Response.json({ ok: true, simulatedRecipient: true, providerMessageId: result.id })
    }
    if (!cfg.enabled)
      return Response.json({
        ok: true,
        enabled: false,
        configured: Boolean(mailEnv().apiKey && mailEnv().from)
      })
    let sepay: Record<string, unknown>
    try {
      sepay = await pollServerSepay(db)
    } catch (cause) {
      sepay = { error: 'Đồng bộ SePay thất bại.' }
      await db
        .from('email_automation_settings')
        .update({ last_poll_error: cause instanceof Error ? cause.message : 'SePay failed' })
        .eq('id', true)
    }
    const { data: queued, error: queueError } = await db.rpc('enqueue_due_server_emails')
    if (queueError) throw queueError
    const delivery = await deliverServerEmails(db, mailEnv())
    const tenantReceipts = await deliverTenantPaymentReceipts(db, mailEnv())
    const tenantDelivery = await deliverTenantPaymentEmails(db, mailEnv())
    await db
      .from('email_automation_settings')
      .update({ last_worker_at: new Date().toISOString() })
      .eq('id', true)
    return Response.json({ ok: true, queued, sepay, delivery, tenantDelivery, tenantReceipts })
  } catch (cause) {
    console.error(
      'Email automation failed:',
      cause instanceof Error ? cause.message : 'Worker error'
    )
    return Response.json(
      { ok: false, error: 'Xử lý email trên máy chủ thất bại.' },
      { status: 500 }
    )
  }
})
