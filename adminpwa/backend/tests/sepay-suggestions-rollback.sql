-- Synthetic fixtures in the same rollback transaction as the existing ledger tests.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.tenants(id,full_name) values('suggest-tenant','Trần Thị Ly'),('suggest-other','Trần Thị Ly'),('suggest-short','Ly');
insert into public.rooms(id,name,status,tenant_name) values('suggest-room','342','occupied','Khách hiện tại khác');
insert into public.invoices(id,room_id,tenant_id,month,year,billing_reason,total_amount,paid_amount,payment_status,payment_records,is_settlement)
values('suggest-inv','suggest-room','suggest-tenant',10,2026,'monthly',2850000,0,'unpaid','[]',false);
create function public.suggestion_qa_tx(p_id text,p_amount integer default 2850000,p_content text default 'Tran Thi Ly thanh toan tien nha thang 10') returns jsonb language sql as $$
  select public.bank_qa_tx(p_id,p_amount,p_content)||jsonb_build_object('transaction_date','2026-10-06T06:33:24Z');
$$;
do $$ declare actor uuid; tx jsonb; result jsonb; before_events integer; begin
  select id into actor from bank_qa_actor;
  tx:=public.suggestion_qa_tx('suggest-payment');
  result:=public.admin_pwa_sepay_candidate(tx);
  if result->>'status'<>'suggestion' or result->>'invoiceId'<>'suggest-inv' or result->>'tenantName'<>'Trần Thị Ly' then raise exception 'Missing suggestion';end if;
  insert into bank_qa_assertions values('suggestion-authoritative-historical-tenant',true);
  if public.admin_pwa_sepay_candidate(public.suggestion_qa_tx('accent',2850000,'Trần Thị Ly thanh toán'))->>'status'<>'suggestion'
    or public.sepay_person_text('Đỗ Đình Đức')<>'do dinh duc' then raise exception 'Vietnamese normalization failed';end if;
  insert into bank_qa_assertions values('suggestion-vietnamese-accent-normalization',true);
  if public.admin_pwa_sepay_candidate(public.suggestion_qa_tx('suffix',2850000,'Tran Thi Lyyy'))->>'status'<>'none' then raise exception 'Substring matched tenant';end if;
  insert into bank_qa_assertions values('suggestion-full-name-word-boundaries',true);
  if public.admin_pwa_sepay_candidate(public.suggestion_qa_tx('wrong-code',2850000,'Tran Thi Ly P342T102026CUNKNOWN'))->>'status'<>'code' then raise exception 'Wrong code reinterpreted';end if;
  insert into bank_qa_assertions values('suggestion-wrong-explicit-code-denied',true);
  if public.admin_pwa_sepay_candidate(public.suggestion_qa_tx('wrong-amount',2849999))->>'status'<>'none' then raise exception 'Wrong amount matched';end if;
  insert into bank_qa_assertions values('suggestion-exact-remaining-amount-required',true);
  if public.admin_pwa_sepay_candidate(tx||jsonb_build_object('transaction_date','2026-08-06T06:00:00Z'))->>'status'<>'none' then raise exception 'Old transfer matched';end if;
  insert into bank_qa_assertions values('suggestion-billing-window-required',true);
  if public.admin_pwa_sepay_candidate(tx||jsonb_build_object('transaction_date','2026-09-23T18:00:00Z'))->>'status'<>'suggestion' then raise exception 'Local date boundary failed';end if;
  insert into bank_qa_assertions values('suggestion-vietnam-timezone-window',true);
  insert into public.invoices(id,room_id,tenant_id,month,year,billing_reason,total_amount,paid_amount,payment_status,payment_records,is_settlement)
    values('suggest-competitor','suggest-room','suggest-other',10,2026,'monthly',2850000,2850000,'paid','[]',false);
  if public.admin_pwa_sepay_candidate(tx)->>'status'<>'ambiguous' then raise exception 'Paid competitor ignored';end if;
  begin perform public.admin_pwa_reconcile_verified_sepay(tx,'suggest-inv',actor,'suggested-reconcile');raise exception 'Ambiguous approval accepted';
    exception when invalid_parameter_value then insert into bank_qa_assertions values('suggestion-ambiguity-rechecked-on-approval',true);end;
  insert into bank_qa_assertions values('suggestion-includes-paid-competing-invoices',true);
  delete from public.invoices where id='suggest-competitor';
  update public.invoices set tenant_id='suggest-short' where id='suggest-inv';
  if public.admin_pwa_sepay_candidate(tx)->>'status'<>'none' then raise exception 'Single word tenant matched';end if;
  insert into bank_qa_assertions values('suggestion-short-name-denied',true);
  update public.invoices set tenant_id='suggest-tenant',billing_reason='deposit_collect' where id='suggest-inv';
  if public.admin_pwa_sepay_candidate(tx)->>'status'<>'none' then raise exception 'Deposit matched as monthly';end if;
  insert into bank_qa_assertions values('suggestion-monthly-invoices-only',true);
  update public.invoices set billing_reason='monthly',paid_amount=2850000,payment_status='paid' where id='suggest-inv';
  if public.admin_pwa_sepay_candidate(tx)->>'status'<>'paid' then raise exception 'Paid invoice not detected';end if;
  insert into bank_qa_assertions values('suggestion-room342-manually-paid-warning',true);
  begin perform public.admin_pwa_reconcile_verified_sepay(tx,'suggest-inv',actor,'suggested-reconcile');raise exception 'Paid invoice credited again';
    exception when invalid_parameter_value then insert into bank_qa_assertions values('suggestion-paid-invoice-approval-denied',true);end;
  begin perform public.admin_pwa_reconcile_verified_sepay(tx,null,actor,'bank-receipt');raise exception 'Paid invoice bank double credit';
    exception when invalid_parameter_value then insert into bank_qa_assertions values('suggestion-paid-invoice-bank-double-credit-denied',true);end;
  update public.invoices set paid_amount=0,payment_status='unpaid' where id='suggest-inv';
  begin perform public.admin_pwa_reconcile_verified_sepay(tx,'suggest-inv',actor,'reconcile');raise exception 'Missing code accepted as exact';
    exception when invalid_parameter_value then insert into bank_qa_assertions values('suggestion-never-accepted-as-exact-reconciliation',true);end;
  begin perform public.admin_pwa_reconcile_verified_sepay(tx,null,actor,'bank-receipt');raise exception 'Suggestion posted as bank income';
    exception when invalid_parameter_value then insert into bank_qa_assertions values('suggestion-bank-income-denied-until-invoice-review',true);end;
  begin perform public.admin_pwa_reconcile_verified_sepay(tx,'qa-wrong',actor,'suggested-reconcile');raise exception 'Suggestion wrong target accepted';
    exception when invalid_parameter_value then insert into bank_qa_assertions values('suggestion-target-binding-rechecked',true);end;
  result:=public.admin_pwa_reconcile_verified_sepay(tx,'suggest-inv',actor,'suggested-reconcile');
  if result->'invoice'->>'payment_status'<>'paid' then raise exception 'Suggestion did not settle invoice';end if;
  insert into bank_qa_assertions values('suggestion-approved-payment-atomic',true);
  if not exists(select 1 from public.payment_events where invoice_id='suggest-inv' and external_ref='REF-suggest-payment' and external_id='suggest-payment' and source='sepay')
    or not exists(select 1 from public.admin_pwa_bank_claims where external_id='suggest-payment' and mode='suggested-reconcile') then raise exception 'Missing provenance';end if;
  insert into bank_qa_assertions values('suggestion-preserves-provider-reference-and-audit-mode',true);
  before_events:=(select count(*) from public.payment_events);
  result:=public.admin_pwa_reconcile_verified_sepay(tx,'suggest-inv',actor,'suggested-reconcile');
  if result->>'duplicate'<>'true' or (select count(*) from public.payment_events)<>before_events then raise exception 'Suggestion replay double payment';end if;
  insert into bank_qa_assertions values('suggestion-approval-idempotent',true);
  if public.admin_pwa_sepay_candidate(tx)->>'status'<>'recorded' then raise exception 'Recorded suggestion still actionable';end if;
  insert into bank_qa_assertions values('suggestion-recorded-transaction-not-actionable',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  begin perform public.admin_pwa_sepay_suggestions(jsonb_build_array(tx));raise exception 'Client can read privileged candidates';
    exception when insufficient_privilege then insert into bank_qa_assertions values('suggestion-service-only-candidate-rpc',true);end;
end $$;
-- Return one combined assertion set to the script.
select name,passed from bank_qa_assertions order by name;
