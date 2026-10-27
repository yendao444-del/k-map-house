import { inlineEmailAttachments, renderServerEmail } from './email-renderer.ts'
import type { MailEnvironment } from './email-worker.ts'

const value = (result: any) => {
  if (result.error) throw new Error('Tenant receipt query failed')
  return result.data
}

export async function deliverTenantPaymentReceipts(
  db: any,
  env: MailEnvironment,
  fetcher = fetch,
  pace = () => new Promise<void>((resolve) => setTimeout(resolve, 600))
) {
  if (!env.apiKey || !env.from) return { configured: false, sent: 0, failed: 0, skipped: 0 }
  await db.rpc('release_blocked_tenant_payment_receipts').then(value)
  const jobs = value(await db.rpc('claim_tenant_payment_receipts', { p_limit: 10 })) || []
  let sent = 0, failed = 0, skipped = 0
  for (const job of jobs) {
    await pace()
    let status = 'failed', provider: string | null = null, error: string | null = null
    try {
      const valid = value(await db.rpc('tenant_payment_receipt_valid', {
        p_id: job.id, p_lease: job.lease_token
      }))
      if (!valid) {
        status = 'skipped'
        error = 'Email, người thuê hoặc khoản thanh toán đã thay đổi.'
      } else {
        // Reuse the approved full receipt, including the original invoice
        // snapshot, balance and inline details. Only the greeting differs.
        const mail = renderServerEmail({ ...job, event_type: 'sepay_matched', audience: 'tenant' })
        const response = await fetcher('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.apiKey}`, 'Content-Type': 'application/json',
            'Idempotency-Key': `tenant-receipt-${job.id}`
          },
          body: JSON.stringify({
            from: env.from, to: [job.recipient_email], subject: mail.subject,
            html: mail.html, text: mail.text, attachments: inlineEmailAttachments(mail.html),
            ...(env.replyTo ? { reply_to: env.replyTo } : {})
          }),
          signal: AbortSignal.timeout(15000)
        })
        const result = await response.json()
        if (!response.ok || !result.id) throw new Error(`Resend HTTP ${response.status}`)
        status = 'sent'
        provider = result.id
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Gửi email người thuê thất bại.'
    }
    // If acceptance could not be persisted, stop. A later retry must retain
    // this job and the same Resend idempotency key.
    const finished = value(await db.rpc('finish_tenant_payment_receipt', {
      p_id: job.id, p_lease: job.lease_token, p_status: status,
      p_provider: provider, p_error: error
    }))
    if (finished !== true) throw new Error('Tenant receipt lease changed')
    if (status === 'sent') sent++
    else if (status === 'skipped') skipped++
    else failed++
  }
  return { configured: true, sent, failed, skipped }
}
