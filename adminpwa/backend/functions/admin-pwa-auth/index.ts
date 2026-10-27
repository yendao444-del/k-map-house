import { createManagementAuthHandler } from './handler'
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void }
const config = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') || '', anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', gatewaySecret: Deno.env.get('ADMIN_PWA_AUTH_GATEWAY_SECRET') || '',
  resendApiKey: Deno.env.get('RESEND_API_KEY'), mailFrom: Deno.env.get('SECURITY_MAIL_FROM') || Deno.env.get('MAIL_FROM')
}
if (!/^https:\/\/[^/]+\.supabase\.co$/.test(config.supabaseUrl) || !config.anonKey || !config.serviceKey || config.gatewaySecret.length < 32) throw new Error('Missing server Auth configuration.')
Deno.serve(createManagementAuthHandler(config))
