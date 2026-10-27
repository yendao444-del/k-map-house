-- Called inside an already-open rollback-only transaction and translated into
-- an isolated schema. No business/customer row or mail queue is written.
set search_path=admin_pwa_bank_rollback_qa,pg_temp;
create temporary table bank_qa_assertions(name text primary key,passed boolean not null);
insert into public.users(id,full_name,role,status) select id,'Synthetic QA admin','admin','active' from bank_qa_actor;
insert into public.app_settings(id,account_no) values('qa','123456789');
insert into public.rooms(id,name,status) values('qa-room','999','occupied'),('qa-end','998','ending');
insert into public.invoices(id,room_id,tenant_id,month,year,total_amount,paid_amount,payment_status,payment_records,is_settlement)
values('qa-inv','qa-room','qa-tenant',10,2026,1000,0,'unpaid','[]',false),('qa-wrong','qa-room','qa-tenant',9,2026,1000,0,'unpaid','[]',false),('qa-settle','qa-end','qa-end-tenant',10,2026,1000,0,'unpaid','[]',true),('qa-cancel','qa-room','qa-tenant',8,2026,1000,0,'cancelled','[]',false);
insert into public.contracts(id,room_id,tenant_id,tenant_name,move_in_date,status) values('qa-contract','qa-end','qa-end-tenant','Synthetic','2026-01-01','active');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create function public.bank_qa_tx(p_id text,p_amount integer,p_content text) returns jsonb language sql as $$
select jsonb_build_object('id',p_id,'reference_number','REF-'||p_id,'amount_in',p_amount,'transaction_content',p_content,'account_number','123456789','transaction_date',now());
$$;
do $$ declare actor uuid; answer jsonb; first_receipt text; saved jsonb; before_events integer; begin
  select id into actor from bank_qa_actor;
  if actor is null then raise exception 'Missing QA admin';end if;
  answer:=public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('partial',400,'P999T102026CQAINV'),'qa-inv',actor,'reconcile');
  if (answer->'invoice'->>'paid_amount')::integer<>400 or answer->'invoice'->>'payment_status'<>'partial' then raise exception 'partial payment failed';end if;
  insert into bank_qa_assertions values('verified-partial-payment',true);
  before_events:=(select count(*) from public.payment_events);
  answer:=public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('partial',400,'P999T102026CQAINV'),'qa-inv',actor,'reconcile');
  if answer->>'duplicate'<>'true' or (select count(*) from public.payment_events)<>before_events then raise exception 'retry duplicated payment';end if;
  insert into bank_qa_assertions values('payment-replay-idempotent',true);
  begin perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('partial',401,'P999T102026CQAINV'),'qa-inv',actor,'reconcile');raise exception 'changed replay accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('replay-amount-binding',true);end;
  begin perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('partial',400,'P999T102026CQAINV'),'qa-wrong',actor,'reconcile');raise exception 'wrong target replay accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('replay-invoice-binding',true);end;
  begin perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('partial',400,'P999T102026CQAINV'),null,actor,'bank-receipt');raise exception 'double bank credit accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('invoice-bank-double-credit-denied',true);end;
  begin perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('over',601,'P999T102026CQAINV'),'qa-inv',actor,'reconcile');raise exception 'overpayment accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('overpayment-denied',true);end;
  if exists(select 1 from public.admin_pwa_bank_claims where external_id='over') or exists(select 1 from public.sepay_server_transactions where external_id='over') then raise exception 'rejected attempt retained reservation';end if;
  insert into bank_qa_assertions values('rejection-no-reservation',true);
  begin perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('wrong-inv',600,'P999T102026CQAINV'),'qa-wrong',actor,'reconcile');raise exception 'wrong invoice accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('wrong-target-invoice-denied',true);end;
  begin perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('ambiguous',600,'P999T102026CQAINV P999T092026CQAWRONG'),'qa-inv',actor,'reconcile');raise exception 'ambiguous accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('ambiguous-transfer-denied',true);end;
  begin perform public.admin_pwa_reconcile_verified_sepay(jsonb_set(public.bank_qa_tx('wrong-account',600,'P999T102026CQAINV'),'{account_number}','"999"'),'qa-inv',actor,'reconcile');raise exception 'wrong account accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('wrong-bank-account-denied',true);end;
  begin perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('cancel',1000,'P999T082026CQACANCEL'),'qa-cancel',actor,'reconcile');raise exception 'cancelled accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('cancelled-invoice-denied',true);end;
  begin perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('zero',0,'P999T102026CQAINV'),'qa-inv',actor,'reconcile');raise exception 'zero amount accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('zero-amount-denied',true);end;
  answer:=public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('exact',600,'P999T102026CQAINV'),'qa-inv',actor,'reconcile');
  if answer->'invoice'->>'payment_status'<>'paid' or (answer->'invoice'->>'paid_amount')::integer<>1000 then raise exception 'exact payment failed';end if;
  insert into bank_qa_assertions values('verified-exact-payment',true);
  answer:=public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('other-income',123,'No invoice reference'),null,actor,'bank-receipt');first_receipt:=answer->>'receiptId';
  if not exists(select 1 from public.cash_transactions where id=first_receipt and amount=123 and payment_method='transfer') then raise exception 'verified bank receipt failed';end if;
  insert into bank_qa_assertions values('verified-unmatched-bank-receipt',true);
  answer:=public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('other-income',123,'No invoice reference'),null,actor,'bank-receipt');
  if answer->>'duplicate'<>'true' or answer->>'receiptId'<>first_receipt or (select count(*) from public.cash_transactions)<>1 then raise exception 'receipt duplicated';end if;
  insert into bank_qa_assertions values('bank-receipt-replay-idempotent',true);
  answer:=public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('settle',1000,'P998T102026CQASETTLE'),'qa-settle',actor,'reconcile');
  if (select status from public.rooms where id='qa-end')<>'vacant' or (select status from public.contracts where id='qa-contract')<>'terminated' then raise exception 'settlement failed';end if;
  insert into bank_qa_assertions values('settlement-room-contract-transition',true);
  update public.app_settings set account_no='ab-1234';
  begin
    perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('wrong-virtual',50,'No invoice reference')||jsonb_build_object('account_number','XY1234'),null,actor,'bank-receipt');
    raise exception 'different virtual account with same digits accepted';
  exception when invalid_parameter_value then insert into bank_qa_assertions values('virtual-account-letter-collision-denied',true);end;
  answer:=public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('virtual-subaccount',50,'No invoice reference')||jsonb_build_object('account_number','MAIN123','sub_account','AB 1234'),null,actor,'bank-receipt');
  if not exists(select 1 from public.cash_transactions where id=answer->>'receiptId' and amount=50) then raise exception 'verified virtual sub-account failed';end if;
  insert into bank_qa_assertions values('verified-alphanumeric-sub-account',true);
  update public.app_settings set account_no='123456789';
  begin perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('unknown',1000,'P999T102026CQAINV'),'qa-inv','00000000-0000-4000-8000-000000000000','reconcile');raise exception 'unknown actor accepted';exception when insufficient_privilege then insert into bank_qa_assertions values('unknown-admin-denied',true);end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);
  begin perform public.admin_pwa_reconcile_verified_sepay(public.bank_qa_tx('client',10,''),null,actor,'bank-receipt');raise exception 'authenticated service call accepted';exception when insufficient_privilege then insert into bank_qa_assertions values('authenticated-role-service-rpc-denied',true);end;
  begin perform public.record_invoice_payment_atomic('qa-wrong',10,'transfer',current_date,'fake','fake-ref','fake-id','sepay');raise exception 'fake sepay accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('fake-direct-sepay-payment-denied',true);end;
  begin update public.invoices set payment_records='[]'::jsonb where id='qa-inv';raise exception 'history deletion accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('verified-history-deletion-denied',true);end;
  begin update public.invoices set paid_amount=999 where id='qa-inv';raise exception 'paid amount overwrite accepted';exception when invalid_parameter_value then insert into bank_qa_assertions values('paid-amount-overwrite-denied',true);end;
  if has_function_privilege('authenticated','public.admin_pwa_reconcile_verified_sepay(jsonb,text,uuid,text)','EXECUTE') or has_table_privilege('authenticated','public.admin_pwa_bank_claims','SELECT') then raise exception 'service state exposed';end if;
  insert into bank_qa_assertions values('service-function-and-claim-table-private',true);
end $$;
select name,passed from bank_qa_assertions order by name;
