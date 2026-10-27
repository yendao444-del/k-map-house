-- Additive PWA backend. Browser can request IDs, never assert bank amounts.
-- Shared server webhook/ledger remain authoritative; Electron source untouched.
begin;
create table if not exists public.admin_pwa_bank_claims (
  external_id text primary key,
  transaction_key text not null unique,
  actor_id uuid not null references auth.users(id),
  mode text not null check(mode in ('reconcile','bank-receipt')),
  invoice_id text references public.invoices(id),
  amount bigint not null check(amount > 0),
  receipt_id text references public.cash_transactions(id),
  verified_at timestamptz not null default now()
);
alter table public.admin_pwa_bank_claims enable row level security;
revoke all on public.admin_pwa_bank_claims from public,anon,authenticated;
grant all on public.admin_pwa_bank_claims to service_role;

create or replace function public.admin_pwa_reconcile_verified_sepay(p_tx jsonb,p_invoice_id text,p_actor uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare amount bigint; tx_id text; ref text; tx_key text; account text; occurred timestamptz; content text; matches text[];
  claim public.admin_pwa_bank_claims%rowtype; observed public.sepay_server_transactions%rowtype;
  invoice public.invoices%rowtype; event_invoice text; answer jsonb; new_receipt_id text;
  saved_claims text; saved_sub text; ctr public.contracts%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Only verified server requests are allowed.' using errcode='42501'; end if;
  if not exists(select 1 from public.users u where u.id=p_actor and u.role='admin' and u.status='active') then raise exception 'Active admin required.' using errcode='42501'; end if;
  if p_mode is null or p_mode not in ('reconcile','bank-receipt') or p_tx is null or jsonb_typeof(p_tx) <> 'object'
    or jsonb_typeof(p_tx->'amount_in') is distinct from 'number' or nullif(p_tx->>'id','') is null
    or (p_tx->>'amount_in')::numeric <= 0 or (p_tx->>'amount_in')::numeric > 2147483647
    or (p_tx->>'amount_in')::numeric <> trunc((p_tx->>'amount_in')::numeric)
    or (p_mode='reconcile' and nullif(p_invoice_id,'') is null) or (p_mode='bank-receipt' and p_invoice_id is not null) then
    raise exception 'Invalid verified payment.' using errcode='22023';
  end if;
  tx_id:=btrim(p_tx->>'id');ref:=nullif(btrim(p_tx->>'reference_number'),'');amount:=(p_tx->>'amount_in')::bigint;
  content:=coalesce(p_tx->>'transaction_content','');tx_key:=regexp_replace(upper(coalesce(ref,tx_id)),'[^A-Z0-9]','','g');
  if tx_key='' or length(tx_id)>128 or length(ref)>128 or length(content)>4000 or nullif(p_tx->>'transaction_date','') is null then raise exception 'Invalid bank reference/date.' using errcode='22023';end if;
  occurred:=(p_tx->>'transaction_date')::timestamptz;
  if not isfinite(occurred) or occurred>now()+interval '5 minutes' then raise exception 'Invalid bank date.' using errcode='22023';end if;
  select upper(regexp_replace(s.account_no,'[^A-Z0-9]','','gi')) into account from public.app_settings s;
  if nullif(account,'') is null or not (
    upper(regexp_replace(coalesce(p_tx->>'account_number',''),'[^A-Z0-9]','','gi'))=account
    or upper(regexp_replace(coalesce(p_tx->>'sub_account',''),'[^A-Z0-9]','','gi'))=account
  ) then raise exception 'Wrong recipient bank account.' using errcode='22023';end if;
  -- Same lock/order as webhook, invoices, settings and wallet writes.
  perform pg_advisory_xact_lock(20261005,120000);
  perform pg_advisory_xact_lock(hashtext('server-sepay:'||tx_key));
  select * into claim from public.admin_pwa_bank_claims c where c.external_id=tx_id or c.transaction_key=tx_key;
  if found then
    if claim.mode<>p_mode or claim.invoice_id is distinct from p_invoice_id or claim.amount<>amount or claim.external_id<>tx_id then raise exception 'Transaction is already assigned elsewhere.' using errcode='22023';end if;
    if p_mode='reconcile' then select * into invoice from public.invoices where id=claim.invoice_id;return jsonb_build_object('invoice',to_jsonb(invoice),'duplicate',true);end if;
    return jsonb_build_object('receiptId',claim.receipt_id,'duplicate',true);
  end if;
  select k.invoice_id into event_invoice from public.payment_event_keys k where k.key in (lower(ref),lower(tx_id)) limit 1;
  if event_invoice is null then
    select i.id into event_invoice from public.invoices i cross join lateral jsonb_array_elements(coalesce(i.payment_records,'[]'::jsonb)) r
      where lower(btrim(r->>'external_ref')) in (lower(ref),lower(tx_id)) or lower(btrim(r->>'external_id')) in (lower(ref),lower(tx_id)) limit 1;
  end if;
  if event_invoice is not null then
    if p_mode='reconcile' and event_invoice=p_invoice_id then select * into invoice from public.invoices where id=event_invoice;return jsonb_build_object('invoice',to_jsonb(invoice),'duplicate',true);end if;
    raise exception 'Already credited to an invoice.' using errcode='22023';
  end if;
  select * into observed from public.sepay_server_transactions t where t.transaction_key=tx_key or t.external_id=tx_id;
  if found and (observed.amount<>amount or observed.external_id<>tx_id or observed.status='recorded') then raise exception 'Verified bank record conflicts or is already recorded.' using errcode='22023';end if;
  -- Do not double-post a legacy desktop unmatched-bank receipt.
  if exists(select 1 from public.cash_transactions c where c.payment_method='transfer' and c.note is not null and (
    (ref is not null and position('Ref: '||ref||')' in c.note)>0) or position('Ref: '||tx_id||')' in c.note)>0)) then raise exception 'Bank receipt already exists.' using errcode='22023';end if;
  select array_agg(i.id) into matches from public.invoices i join public.rooms r on r.id=i.room_id where i.payment_status not in ('cancelled','merged')
    and position('P'||coalesce(nullif(regexp_replace(r.name,'\D','','g'),''),nullif(left(regexp_replace(upper(r.name),'[^A-Z0-9]','','g'),6),''),'XX')||'T'||lpad(i.month::text,2,'0')||i.year||'C'||right(regexp_replace(upper(i.id),'[^A-Z0-9]','','g'),12) in regexp_replace(upper(content),'[^A-Z0-9]','','g'))>0;
  if p_mode='reconcile' then
    if coalesce(cardinality(matches),0)<>1 or matches[1]<>p_invoice_id then raise exception 'No unique matching invoice.' using errcode='22023';end if;
    select * into invoice from public.invoices where id=p_invoice_id for update;
    if invoice.total_amount<=0 or amount>invoice.total_amount-coalesce(invoice.paid_amount,0) or invoice.payment_status='paid' then raise exception 'Invalid remaining amount.' using errcode='22023';end if;
  elsif coalesce(cardinality(matches),0)>0 then raise exception 'Invoice transfer cannot be credited again as other bank income.' using errcode='22023';end if;
  insert into public.admin_pwa_bank_claims(external_id,transaction_key,actor_id,mode,invoice_id,amount) values(tx_id,tx_key,p_actor,p_mode,p_invoice_id,amount);
  -- Publish verified provenance inside the SAME transaction before payment
  -- append; failure of wallet/RPC/trigger rolls this and the reservation back.
  insert into public.sepay_server_transactions(transaction_key,external_id,reference_number,amount,content,occurred_at,invoice_id,status)
    values(tx_key,tx_id,ref,amount,content,occurred,p_invoice_id,'unmatched')
    on conflict(transaction_key) do update set invoice_id=excluded.invoice_id;
  saved_claims:=current_setting('request.jwt.claims',true);saved_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','service_role')::text,true);
  if p_mode='reconcile' then
    answer:=public.record_invoice_payment_atomic(p_invoice_id,amount::integer,'transfer',(occurred at time zone 'Asia/Ho_Chi_Minh')::date,'Đối soát SePay đã xác minh (Ref: '||coalesce(ref,tx_id)||')',ref,tx_id,'sepay');
    if not coalesce((answer->>'applied')::boolean,false) and not coalesce((answer->>'duplicate')::boolean,false) then raise exception 'Payment was not applied.' using errcode='22023';end if;
    if coalesce((answer->>'transitioned_to_paid')::boolean,false) and invoice.is_settlement then
      select * into ctr from public.contracts c where c.room_id=invoice.room_id and c.status='active' order by c.created_at desc limit 1 for update;
      if ctr.id is not null and (ctr.tenant_id is null or ctr.tenant_id=invoice.tenant_id) then
        update public.rooms set status='vacant',tenant_name=null,tenant_phone=null,move_in_date=null,expected_end_date=null,electric_old=invoice.electric_new,electric_new=invoice.electric_new,water_old=invoice.water_new,water_new=invoice.water_new,has_move_in_receipt=false where id=invoice.room_id and status='ending';
        if found then update public.contracts set status='terminated',end_date=coalesce(invoice.invoice_date,(occurred at time zone 'Asia/Ho_Chi_Minh')::date),end_note=coalesce(invoice.damage_note,invoice.adjustment_note),final_electric=invoice.electric_new,final_water=invoice.water_new where id=ctr.id;end if;
      end if;
    end if;
  else
    new_receipt_id:='pwa-sepay-'||replace(gen_random_uuid()::text,'-','');
    insert into public.cash_transactions(id,type,category,transaction_date,amount,payment_method,note,created_at,updated_at)
      values(new_receipt_id,'income','other_income',occurred,amount,'transfer','Tiền vào ngân hàng chưa ghép hóa đơn qua Sepay: '||content||' (Ref: '||coalesce(ref,tx_id)||')',now(),now());
    update public.admin_pwa_bank_claims set receipt_id=new_receipt_id where external_id=tx_id;
    answer:=jsonb_build_object('receiptId',new_receipt_id,'duplicate',false);
  end if;
  update public.sepay_server_transactions set status='recorded' where transaction_key=tx_key;
  perform set_config('request.jwt.claim.sub',coalesce(saved_sub,''),true);perform set_config('request.jwt.claims',coalesce(saved_claims,'{}'),true);
  return answer;
end;
$$;
revoke all on function public.admin_pwa_reconcile_verified_sepay(jsonb,text,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_pwa_reconcile_verified_sepay(jsonb,text,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
