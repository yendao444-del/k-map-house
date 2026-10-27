// Metadata-only audit. Never request bank balances, transactions, tokens or
// identity/contact rows; record privileges and deployed SQL, not local intent.
import { writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
const query = sql => management(env, '/database/query', { query: sql })
const [routines, tables, privileges, policies, triggers, definitions, functions] = await Promise.all([
  query("select p.oid::regprocedure::text signature,p.prosecdef security_definer,p.proconfig config,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,has_function_privilege('service_role',p.oid,'EXECUTE') service_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%sepay%' or p.proname like '%payment%' or p.proname like '%wallet%') order by p.proname"),
  query("select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ('app_secrets','app_settings','payment_events','payment_event_keys','sepay_server_transactions','invoices','cash_transactions','email_automation_settings') order by c.relname"),
  query("select table_name,grantee,privilege_type from information_schema.table_privileges where table_schema='public' and grantee in ('anon','authenticated') and table_name in ('app_secrets','app_settings','payment_events','payment_event_keys','sepay_server_transactions','invoices','cash_transactions','email_automation_settings') order by table_name,grantee,privilege_type"),
  query("select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('app_secrets','app_settings','payment_events','payment_event_keys','sepay_server_transactions','invoices','cash_transactions','debt_entries') order by tablename,policyname"),
  query("select c.relname table_name,t.tgname,pg_get_triggerdef(t.oid) definition,p.proname function_name,pg_get_functiondef(p.oid) function_definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and not t.tgisinternal and c.relname in ('app_settings','invoices','cash_transactions','payment_events','payment_event_keys','sepay_server_transactions') order by c.relname,t.tgname"),
  query("select p.proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('process_server_sepay','record_invoice_payment_atomic','wallet_position','transfer_between_wallets','reconcile_wallet_balances','advance_room_meter_on_invoice_payment','email_automation_status') order by p.proname"),
  management(env, '/functions')
])
const report = { checkedAt: new Date().toISOString(), mode: 'read-only metadata; no token/customer/bank-transaction query, no mutation', routines, tables, privileges, policies, triggers, definitions, edgeFunctions: functions.filter(item => /sepay|email/.test(item.name)).map(item => ({ name: item.name, version: item.version, status: item.status, verifyJwt: item.verify_jwt })) }
await writeFile(new URL('../qa/payment-security-readonly-audit.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ checkedAt: report.checkedAt, tables: report.tables, routines, edgeFunctions: report.edgeFunctions }, null, 2))
