import { createResendSecurityWebhook } from './handler'
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void }
const from = Deno.env.get('SECURITY_MAIL_FROM') || ''
Deno.serve(createResendSecurityWebhook({
  supabaseUrl: Deno.env.get('SUPABASE_URL') || '', serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  webhookSecret: Deno.env.get('RESEND_SECURITY_WEBHOOK_SECRET') || '', sender: (from.match(/<([^<>]+)>/)?.[1] || from).trim()
}))
