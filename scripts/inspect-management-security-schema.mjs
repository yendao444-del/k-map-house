import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const metadata = await management(env, '/database/query', { query: `
select jsonb_build_object(
 'auth_columns', (select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type) order by table_name,ordinal_position) from information_schema.columns where table_schema='auth' and table_name in ('sessions','mfa_factors','mfa_challenges','mfa_amr_claims')),
 'users_columns', (select jsonb_agg(jsonb_build_object('column',column_name,'type',data_type) order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='users'),
 'policies', (select jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'policy',policyname,'mode',permissive,'command',cmd,'roles',roles) order by schemaname,tablename,policyname) from pg_policies where schemaname in ('public','storage')),
 'client_definer_rpcs', (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid)) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'EXECUTE')),
 'management_directory_access', pg_get_functiondef(to_regprocedure('public.management_directory_access()'))
) metadata;` })
await writeFile(new URL('../docs/security/qa/management-security-schema-2026-10-09.json', import.meta.url), JSON.stringify(metadata[0]?.metadata, null, 2) + '\n')
console.log(JSON.stringify(metadata[0]?.metadata, null, 2))
