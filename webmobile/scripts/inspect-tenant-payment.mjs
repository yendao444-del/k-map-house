import { privateConfig, management } from './private-config.mjs'
import { contractTestConfig, testManagement } from './contract-test-config.mjs'
const test=process.argv.includes('--test'), env=await (test?contractTestConfig:privateConfig)()
const run=sql=>(test?testManagement:management)(env,'/database/query',{query:sql})
console.log(JSON.stringify(await run(`select table_schema,table_name,string_agg(column_name||':'||data_type,', ' order by ordinal_position) columns from information_schema.columns where table_schema not in ('auth','pg_catalog','information_schema') and table_name in ('invoices','contracts','rooms','app_settings','tenant_web_accounts') group by table_schema,table_name`)))
console.log(JSON.stringify(await run(`select n.nspname schema,p.proname name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('process_server_sepay','record_invoice_payment_atomic','webmobile_save_tenant_session')`)))
console.log(JSON.stringify(await run(`select jobname,active from cron.job`).catch(()=>[])))
if(!test) {
 console.log(JSON.stringify(await run(`select enabled,sepay_enabled,last_worker_at,last_poll_at,last_poll_error from email_automation_settings`)))
 console.log(JSON.stringify(await run(`select bank_id,account_name,case when length(account_no)>5 then true else false end account_configured from app_settings limit 1`)))
 console.log(JSON.stringify((await management(env,'/secrets')).map(s=>s.name)))
}
