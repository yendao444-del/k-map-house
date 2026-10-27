import { writeFile, mkdir } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
if (!env.SUPABASE_ACCESS_TOKEN) throw new Error('No Supabase management credential available for read-only audit')
const query = async (sql) => management(env, '/database/query', { query: sql })
const [tables, policies, routines, profiles, authConfig] = await Promise.all([
  query("select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename"),
  query("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname"),
  query("select p.proname,p.prosecdef as security_definer,p.proconfig as config from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname"),
  query("select role,status,count(*)::int as count from public.users group by role,status order by role,status"),
  management(env, '/config/auth')
])
// Deliberately omit identity/contact data, auth keys and provider credentials.
const report = {
  capturedAt: new Date().toISOString(), access: 'read-only management audit; no changes',
  tables, policies, routines, profileCounts: profiles,
  auth: { siteUrl: authConfig.site_url, redirectAllowList: authConfig.uri_allow_list, signupDisabled: authConfig.disable_signup }
}
await mkdir(new URL('../qa/', import.meta.url), { recursive: true })
await writeFile(new URL('../qa/backend-readonly-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ tableCount: tables.length, unprotectedTables: tables.filter(t => !t.rowsecurity).map(t => t.tablename), policies: policies.length, profileCounts: profiles, auth: report.auth }, null, 2))
