import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'

const env = await privateConfig()
const query = sql => management(env, '/database/query', { query: sql })
const [columns, policies, grants, settingExposure, columnPrivileges] = await Promise.all([
  query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('app_settings','app_secrets') order by table_name,ordinal_position"),
  query("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('app_settings','app_secrets') order by tablename,policyname"),
  query("select grantee,table_name,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('app_settings','app_secrets') and grantee in ('anon','authenticated','service_role') order by table_name,grantee,privilege_type"),
  query("select count(*)::int as rows, count(*) filter (where sepay_api_token is not null and btrim(sepay_api_token) <> '')::int as nonempty, max(length(sepay_api_token))::int as max_length from public.app_settings"),
  query("select has_column_privilege('anon','public.app_settings','sepay_api_token','SELECT') as anon_select, has_column_privilege('authenticated','public.app_settings','sepay_api_token','SELECT') as authenticated_select, has_column_privilege('authenticated','public.app_settings','sepay_api_token','UPDATE') as authenticated_update")
])

const sensitive = new Set(['sepay_api_token', 'smtp_pass', 'service_role_key'])
const sensitiveColumns = columns.filter(column => sensitive.has(column.column_name)).map(column => `${column.table_name}.${column.column_name}`)
const publicSecretGrants = grants.filter(grant => ['anon', 'authenticated'].includes(grant.grantee) && sensitiveColumns.some(name => name.startsWith(`${grant.table_name}.`)))
const report = {
  auditedAt: new Date().toISOString(),
  mode: 'metadata-only; no configuration values selected',
  sensitiveColumns,
  policies,
  grants,
  settingExposure,
  columnPrivileges,
  publicSecretGrants,
  verified: publicSecretGrants.filter(grant => grant.table_name === 'app_secrets').length === 0 && Number(settingExposure?.[0]?.nonempty || 0) === 0 && columnPrivileges?.[0]?.anon_select === false && columnPrivileges?.[0]?.authenticated_select === false && columnPrivileges?.[0]?.authenticated_update === false
}
await writeFile(new URL('../qa/secret-surface-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ auditedAt: report.auditedAt, sensitiveColumns: report.sensitiveColumns, publicSecretGrants: report.publicSecretGrants, verified: report.verified }, null, 2))
if (!report.verified) process.exitCode = 1
