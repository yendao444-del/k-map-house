import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const query = async sql => {
  const response = await fetch('https://api.supabase.com/v1/projects/wtrycmiojsiliyjxsewz/database/query', { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(30000) })
  const data = await response.json()
  if (!response.ok) throw new Error(String(data.message || 'Database verification failed').split('\n')[0].slice(0,250))
  return data
}
const migration = await readFile(new URL('../../supabase/migrations/20261009081500_sepay_sub_account_guard.sql', import.meta.url), 'utf8')
const [secret] = await query("select sepay_api_token from public.app_secrets where id='default'")
const source = await fetch('https://my.sepay.vn/userapi/transactions/list', { headers: { Authorization: `Bearer ${secret.sepay_api_token}` }, signal: AbortSignal.timeout(20000) })
assert.ok(source.ok)
const provider = await source.json()
const transaction = provider.transactions.find(tx => String(tx.transaction_content || '').includes('P251T102026C9627R1RY5277'))
assert.ok(transaction, 'Screenshot transaction not found in the verified bank source')
const normalized = { id: String(transaction.id), reference_number: transaction.reference_number, amount_in: transaction.amount_in, amount_out: transaction.amount_out, transaction_date: transaction.transaction_date, transaction_content: transaction.transaction_content, account_number: transaction.account_number, sub_account: transaction.sub_account }
const literal = JSON.stringify(normalized).replaceAll("'", "''")
const tests = `
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $test$
declare tx jsonb := '${literal}'::jsonb; result jsonb; cfg public.email_automation_settings%rowtype; invoice public.invoices%rowtype;
begin
 select * into cfg from public.email_automation_settings where id=true;
 if not cfg.enabled or not cfg.sepay_enabled then raise exception 'SePay automation must stay enabled';end if;
 result:=public.process_server_sepay(tx||jsonb_build_object('id','security-test-wrong-recipient','reference_number','security-test-wrong-recipient','account_number','111111111111111111111','sub_account','222222222222222222222'));
 if result->>'status'<>'wrong_account' then raise exception 'Incorrect recipient was accepted'; end if;
 result:=public.process_server_sepay(tx||jsonb_build_object('id','security-test-bad-subaccount','reference_number','security-test-bad-subaccount','account_number','111111111111111111111','sub_account','attack'||(tx->>'sub_account')));
 if result->>'status'<>'wrong_account' then raise exception 'Malformed account was accepted'; end if;
 result:=public.process_server_sepay(tx||jsonb_build_object('id','security-test-outgoing','reference_number','security-test-outgoing','amount_out',100));
 if result->>'status'<>'ignored' then raise exception 'Outgoing transfer was accepted'; end if;
 result:=public.process_server_sepay(tx);
 if result->>'status' not in ('recorded','duplicate') then raise exception 'Verified transaction not reconciled: %',result->>'status';end if;
 select * into invoice from public.invoices where id=coalesce(result->>'invoiceId',(select invoice_id from public.sepay_server_transactions where external_id=tx->>'id'));
 if invoice.id is null or invoice.payment_status<>'paid' or invoice.total_amount<>invoice.paid_amount then raise exception 'Invoice not fully paid'; end if;
 result:=public.process_server_sepay(tx);
 if result->>'status'<>'duplicate' then raise exception 'Duplicate prevention failed';end if;
end;
$test$;
rollback;`
// Exercise the real verified transaction exclusively inside rollback; allow the
// existing scheduled worker to perform the actual reconciliation after release.
await query(migration.replace(/commit;\s*$/, '') + tests)
await query(migration)
const report = { appliedAt: new Date().toISOString(), verification: ['Wrong recipient rejected','Malformed sub-account rejected','Outgoing transaction rejected','Verified screenshot transaction reconciles and pays invoice in rollback','Repeat transaction rejected as duplicate'], realPaymentsWrittenByTest: false, scope: 'Recipient verification accepts trusted SePay sub_account; accounting and management permissions preserved.' }
await writeFile(new URL('../qa/security-sepay-sub-account-fix.json', import.meta.url), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
