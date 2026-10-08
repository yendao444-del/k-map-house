import { privateConfig, management } from './private-config.mjs'
const env = await privateConfig()
const rows = await management(env, '/database/query', { query: `
  select relname,relrowsecurity from pg_class where oid in ('public.tenant_web_accounts'::regclass,'public.webmobile_auth_sessions'::regclass);
` })
if (rows.length !== 2 || rows.some(row => !row.relrowsecurity)) throw new Error('Portal account/session RLS missing')
const permissions = await management(env, '/database/query', { query: `
  select has_table_privilege('anon','public.tenant_web_accounts','SELECT') as anon_accounts,
    has_table_privilege('authenticated','public.tenant_web_accounts','INSERT') as staff_write,
    has_table_privilege('anon','public.webmobile_auth_sessions','SELECT') as anon_sessions,
    has_function_privilege('authenticated','public.webmobile_enroll_tenant(uuid,text,text,uuid)','EXECUTE') as client_enroll,
    has_function_privilege('anon','public.webmobile_revoke_tenant(text,text)','EXECUTE') as client_revoke;
` })
if (Object.values(permissions[0]).some(Boolean)) throw new Error('Portal sensitive permissions unexpectedly granted')
const domain = 'https://pay.phongtroankhang.com'
const health = await (await fetch(`${domain}/api/health`)).json()
if (!health.realTenantAccounts || !health.authRequired || health.realPayments) throw new Error('Public portal health mismatch')
const response = await fetch(`${env.SUPABASE_URL || env.VITE_SUPABASE_URL}/functions/v1/tenant-web-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
if (response.status !== 401) throw new Error('Admin function did not reject unauthenticated request')
console.log('Deployed tenant tables have RLS; client writes/session reads/RPC enrollment denied. Public login and unauthenticated admin rejection verified. No accounts modified.')
