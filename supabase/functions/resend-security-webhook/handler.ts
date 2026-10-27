type Config = { supabaseUrl: string; serviceKey: string; webhookSecret: string; sender: string }
const events = new Set(['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed'])
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const unbase64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))

export function createResendSecurityWebhook(config: Config, fetcher: typeof fetch = fetch, now = () => Date.now()) {
  const reply = (status: number, ok: boolean) => Response.json({ ok }, { status, headers: { 'Cache-Control': 'no-store' } })
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply(405, false)
    if (!config.webhookSecret || !config.serviceKey || !config.sender) return reply(503, false)
    const id = request.headers.get('svix-id') || '', timestamp = request.headers.get('svix-timestamp') || ''
    const signatures = request.headers.get('svix-signature') || ''
    if (!id || id.length > 200 || !/^\d{1,12}$/.test(timestamp) || Math.abs(now() / 1000 - Number(timestamp)) > 300 || signatures.length > 2048) return reply(401, false)
    try {
      const reader = request.body?.getReader()
      if (!reader) return reply(400, false)
      const chunks: Uint8Array[] = []; let size = 0
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break
          size += value.byteLength
          if (size > 65536) { await reader.cancel(); return reply(413, false) }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
      const bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      // Standard Webhooks/Svix authenticates the untouched body, ID and timestamp.
      const prefix = new TextEncoder().encode(`${id}.${timestamp}.`)
      const signed = new Uint8Array(prefix.length + bytes.length); signed.set(prefix); signed.set(bytes, prefix.length)
      const key = await crypto.subtle.importKey('raw', unbase64(config.webhookSecret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
      let verified = false
      for (const signature of signatures.split(/\s+/)) {
        if (!signature.startsWith('v1,')) continue
        try { if (await crypto.subtle.verify('HMAC', key, unbase64(signature.slice(3)), signed)) { verified = true; break } } catch { /* Invalid signature candidate. */ }
      }
      if (!verified) return reply(401, false)
      const event = JSON.parse(new TextDecoder().decode(bytes))
      if (!event || typeof event.type !== 'string') return reply(400, false)
      if (!events.has(event.type)) return reply(200, true)
      // This endpoint only retains security mail metadata, never other emails.
      const from = typeof event.data?.from === 'string' ? event.data.from : ''
      const address = (from.match(/<([^<>]+)>/)?.[1] || from).trim().toLowerCase()
      if (address !== config.sender.toLowerCase()) return reply(200, true)
      if (!uuid.test(String(event.data?.email_id || '')) || typeof event.created_at !== 'string' || !Number.isFinite(Date.parse(event.created_at)) || Date.parse(event.created_at) > now() + 300000) return reply(400, false)
      const result = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/security_email_delivery_event`, {
        method: 'POST', headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_event: id, p_provider: event.data.email_id, p_type: event.type, p_at: event.created_at }), signal: AbortSignal.timeout(12000)
      })
      if (!result.ok || await result.json() !== true) return reply(503, false)
      return reply(200, true)
    } catch { return reply(503, false) }
  }
}
