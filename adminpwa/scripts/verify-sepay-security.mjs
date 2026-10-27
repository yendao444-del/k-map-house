import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../../webmobile/scripts/private-config.mjs'
const env=await privateConfig(); const query=sql=>management(env,'/database/query',{query:sql})
const before=await query("select (select count(*) from public.payment_events)::int payment_events,(select count(*) from public.invoices)::int invoices,(select count(*) from public.cash_transactions)::int cash_transactions,(select md5(coalesce(string_agg(row_to_json(c)::text,'|' order by c.id),'')) from public.cash_transactions c) cash_fingerprint")
const result=await query(`begin;
select set_config('request.jwt.claim.sub',(select id::text from public.users where role='admin' and status='active' order by created_at,id limit 1),true);
set local role authenticated;
do $$ declare invoice_id text; amount integer; begin
  select i.id, greatest(1,least(100,coalesce(i.total_amount,0)-coalesce(i.paid_amount,0))) into invoice_id,amount from public.invoices i where i.payment_status in ('unpaid','partial') and coalesce(i.total_amount,0)>coalesce(i.paid_amount,0) order by i.created_at limit 1;
  if invoice_id is null then raise exception 'No safe unpaid fixture available'; end if;
  begin
    perform public.record_invoice_payment_atomic(invoice_id,amount,'transfer',current_date,'synthetic unverified sepay','FAKE-PWA-SECURITY','FAKE-PWA-SECURITY','sepay');
    raise exception 'Browser-style SePay write was accepted';
  exception when others then
    if position('provenance' in lower(sqlerrm))=0 and position('verified' in lower(sqlerrm))=0 then raise; end if;
  end;
end $$;
do $$ begin
  begin perform public.admin_pwa_reconcile_verified_sepay('{}',null,auth.uid(),'reconcile'); raise exception 'Authenticated role executed service-only verifier'; exception when insufficient_privilege then null; end;
end $$;
rollback;`)
const after=await query("select (select count(*) from public.payment_events)::int payment_events,(select count(*) from public.invoices)::int invoices,(select count(*) from public.cash_transactions)::int cash_transactions,(select md5(coalesce(string_agg(row_to_json(c)::text,'|' order by c.id),'')) from public.cash_transactions c) cash_fingerprint")
if(JSON.stringify(before)!==JSON.stringify(after)) throw new Error('Rollback fingerprint changed during security test')
const report={verifiedAt:new Date().toISOString(),mode:'production database rollback-only; synthetic unverified browser-style SePay write; no retained payment or bank transfer',before,after,result,assertions:['direct authenticated source=sepay write rejected by provenance guard','service-only verified reconciler unavailable to authenticated role','financial counts and cash fingerprint unchanged']}
await writeFile(new URL('../qa/sepay-security-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2))
