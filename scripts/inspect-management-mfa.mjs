import { mkdir, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'

// Read metadata only. Never emit identities, tokens, secrets, or key values.
const env = await privateConfig()
const state = await management(env, '/database/query', { query: `
select jsonb_build_object(
 'security_sessions_table', to_regclass('management_security.sessions') is not null,
 'recovery_codes_table', to_regclass('management_security.recovery_codes') is not null,
 'trusted_devices_table', to_regclass('management_security.devices') is not null,
 'audit_events_table', to_regclass('management_security.audit_events') is not null,
 'readiness_rpc', to_regprocedure('public.security_mfa_readiness()') is not null,
 'aal2_guard_rpc', to_regprocedure('public.security_management_access_allowed(boolean)') is not null,
 'security_service_rpc', to_regprocedure('public.security_service(text,uuid,uuid,text,text,jsonb)') is not null,
 'rollout_flags', (select jsonb_build_object('enrollment_enabled',enrollment_enabled,'enforce_management',enforce_management) from management_security.settings where singleton),
 'remaining_disposable_auth_accounts', (select count(*) from auth.users where raw_user_meta_data->>'purpose'='management-mfa-disposable-verification'),
 'verified_totp_factors', (select count(*) from auth.mfa_factors where factor_type='totp' and status='verified'),
 'active_management_accounts', (select count(*) from public.users where status='active' and role in ('admin','user')),
 'ready_management_accounts', (select count(*) from public.users u join management_security.accounts a on a.user_id=u.id where u.status='active' and u.role in ('admin','user') and a.recovery_ack_at is not null and exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.factor_type='totp' and f.status='verified')),
 'public_rls_tables', (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),
 'guarded_rls_policies', (select count(*) from pg_policies where schemaname in ('public','storage') and (coalesce(qual,'') || coalesce(with_check,'')) ilike '%security_management_access_allowed%'),
 'pre_request_configured', exists(select 1 from pg_db_role_setting s, unnest(s.setconfig) setting where setting like 'pgrst.db_pre_request=%')
) as metadata;` })
const auth = await management(env, '/config/auth')
const report = {
  inspectedAt: new Date().toISOString(),
  scope: 'Read-only production metadata; no account or customer data changed.',
  database: state?.[0]?.metadata ?? state,
  auth: Object.fromEntries([
    'password_min_length', 'security_update_password_require_reauthentication',
    'security_update_password_require_current_password', 'security_refresh_token_reuse_interval',
    'mfa_totp_enroll_enabled', 'mfa_totp_verify_enabled',
    'sessions_timebox', 'sessions_inactivity_timeout', 'password_hibp_enabled'
  ].filter(key => Object.hasOwn(auth, key)).map(key => [key, auth[key]]))
}
await mkdir(new URL('../docs/security/qa/', import.meta.url), { recursive: true })
await writeFile(new URL('../docs/security/qa/mfa-production-metadata-2026-10-09.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
