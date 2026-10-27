import { createMarketHandler } from './handler'
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void }
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
if (!/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl) || !anonKey) throw new Error('Missing trusted Supabase runtime configuration.')
Deno.serve(createMarketHandler({supabaseUrl,anonKey}))
