import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { privateConfig,management } from '../../webmobile/scripts/private-config.mjs'
const env=await privateConfig()
const project=new URL(env.SUPABASE_URL||env.VITE_SUPABASE_URL).hostname.split('.')[0]
async function query(sql) {
  const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(30000)})
  const body=await response.json()
  if(!response.ok) throw new Error(`Isolated QA HTTP ${response.status}: ${JSON.stringify(body).slice(0,1800)}`)
  return body
}
const schema='admin_pwa_bank_rollback_qa'
const translate=sql=>sql.replaceAll('public.',`${schema}.`).replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'')
const definitions=await query("select p.proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_invoice_payment_atomic'")
assert.equal(definitions.length,1)
const migrations=await Promise.all(['20261008_verified_bank_reconciliation.sql','20261008_sepay_provenance_guard.sql','20261014_sepay_suggested_reconciliation.sql'].map(name=>readFile(new URL(`../backend/migrations/${name}`,import.meta.url),'utf8')))
const tables=['users','rooms','tenants','invoices','contracts','app_settings','cash_transactions','payment_events','payment_event_keys','sepay_server_transactions']
const fixtures=await readFile(new URL('../backend/tests/bank-reconciliation-rollback.sql',import.meta.url),'utf8')
const suggestionFixtures=await readFile(new URL('../backend/tests/sepay-suggestions-rollback.sql',import.meta.url),'utf8')
const fingerprintSql="select (select count(*) from public.admin_pwa_bank_claims)::int claims,(select count(*) from public.payment_events)::int events,(select count(*) from public.sepay_server_transactions)::int observed,(select md5(coalesce(string_agg(row_to_json(c)::text,'|' order by c.id),'')) from public.cash_transactions c) cash_fingerprint,(select md5(coalesce(string_agg(row_to_json(i)::text,'|' order by i.id),'')) from public.invoices i) invoice_fingerprint"
const before=await query(fingerprintSql)
const sql=`begin; create temporary table bank_qa_actor(id uuid);insert into bank_qa_actor select id from public.users where role='admin' and status='active' order by created_at,id limit 1;
create schema ${schema}; ${tables.map(name=>`create table ${schema}.${name}(like public.${name} including all);`).join('\n')}
${translate(definitions[0].definition)};
${migrations.map(translate).join('\n')}
${translate(fixtures)}
${translate(suggestionFixtures)}
rollback;`
const assertions=await query(sql)
assert.equal(assertions.length,46,'Missing bank reconciliation assertions')
assert.ok(assertions.every(item=>item.passed===true))
const after=await query(fingerprintSql);assert.deepEqual(after,before,'Production business fingerprints changed during isolated rollback test')
const report={testedAt:new Date().toISOString(),mode:'isolated schema in one rollback-only transaction; current production payment RPC copied read-only; synthetic bank data, no provider request/email/money transfer',assertions,before,after,limitations:['Shared production wallet triggers are not copied into this isolated fixture; full financial integration needs a separate acceptance check.','Actual authenticated HTTP provider lookup and mobile reconciliation still require verification.']}
await writeFile(new URL('../qa/bank-reconciliation-rollback.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
