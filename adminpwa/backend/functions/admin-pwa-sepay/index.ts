import { createSepayHandler } from './handler'
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void }
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
if (!/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl) || !anonKey || !serviceKey) throw new Error('Missing trusted backend configuration.')
Deno.serve(createSepayHandler({supabaseUrl,anonKey,serviceKey}))
