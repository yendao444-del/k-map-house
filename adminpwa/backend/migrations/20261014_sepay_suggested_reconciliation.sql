begin;

-- One rule for both read-only suggestions and the locked approval path.
-- Names come from the invoice's tenant, never the room's current occupant.
create or replace function public.sepay_person_text(p_text text)
returns text language sql immutable set search_path='' as $$
  select btrim(regexp_replace(lower(translate(
    regexp_replace(normalize(coalesce(p_text,''),NFD), U&'[\0300-\036f]', '', 'g'),
    'đĐ','dD')), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.admin_pwa_sepay_candidate(p_tx jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare amount bigint; content text; occurred date; tx_id text; ref text; tx_key text;
  candidates jsonb; match jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Verified server only.' using errcode='42501';end if;
  amount:=(p_tx->>'amount_in')::bigint; tx_id:=p_tx->>'id'; ref:=nullif(p_tx->>'reference_number','');
  tx_key:=regexp_replace(upper(coalesce(ref,tx_id)),'[^A-Z0-9]','','g');
  content:=public.sepay_person_text(p_tx->>'transaction_content');
  occurred:=((p_tx->>'transaction_date')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date;
  if amount<=0 or occurred is null or tx_id is null then return jsonb_build_object('status','invalid');end if;
  if exists(select 1 from public.admin_pwa_bank_claims c where c.external_id=tx_id or c.transaction_key=tx_key)
    or exists(select 1 from public.sepay_server_transactions t where (t.external_id=tx_id or t.transaction_key=tx_key) and t.status='recorded')
    or exists(select 1 from public.payment_event_keys k where k.key in(lower(ref),lower(tx_id)))
    or exists(select 1 from public.invoices i cross join lateral jsonb_array_elements(coalesce(i.payment_records,'[]'::jsonb)) r
      where lower(btrim(r->>'external_ref')) in(lower(ref),lower(tx_id)) or lower(btrim(r->>'external_id')) in(lower(ref),lower(tx_id)))
    or exists(select 1 from public.cash_transactions c where c.payment_method='transfer' and (
      (ref is not null and position('Ref: '||ref||')' in c.note)>0) or position('Ref: '||tx_id||')' in c.note)>0)) then
    return jsonb_build_object('status','recorded');
  end if;
  -- A supplied invoice code, including an unknown/wrong code, is never
  -- reinterpreted through a name match.
  if replace(content,' ','') ~ 'p[a-z0-9]+t[0-9]{6}c[a-z0-9]+' then
    return jsonb_build_object('status','code');
  end if;
  select jsonb_agg(jsonb_build_object('invoiceId',i.id,'roomName',r.name,'tenantName',t.full_name,
    'month',i.month,'year',i.year,'remaining',greatest(i.total_amount-coalesce(i.paid_amount,0),0),
    'status',case when i.payment_status='paid' or coalesce(i.paid_amount,0)>=i.total_amount then 'paid'
      when exists(select 1 from jsonb_array_elements(coalesce(i.payment_records,'[]'::jsonb)) p
        where p->>'payment_method'='transfer' and coalesce(p->>'source','')<>'sepay'
          and coalesce(p->>'external_ref','')='' and coalesce(p->>'external_id','')=''
          and (p->>'amount')::numeric=amount) then 'manual-review' else 'suggestion' end)) into candidates
  from public.invoices i join public.tenants t on t.id=i.tenant_id join public.rooms r on r.id=i.room_id
  where i.payment_status in('unpaid','partial','paid') and i.total_amount>0 and not coalesce(i.is_settlement,false)
    and coalesce(nullif(i.billing_reason,''),'monthly')='monthly'
    and (amount=i.total_amount-coalesce(i.paid_amount,0) or (i.payment_status='paid' and amount=i.total_amount))
    and public.sepay_person_text(t.full_name) like '% %'
    and position(' '||public.sepay_person_text(t.full_name)||' ' in ' '||content||' ')>0
    and i.month between 1 and 12 and i.year between 2000 and 2200
    and occurred between coalesce(i.billing_period_start,make_date(i.year,i.month,1))-7
      and coalesce(i.billing_period_end,(make_date(i.year,i.month,1)+interval '1 month - 1 day')::date)+7;
  if candidates is null then return jsonb_build_object('status','none');end if;
  if jsonb_array_length(candidates)<>1 then return jsonb_build_object('status','ambiguous','candidateCount',jsonb_array_length(candidates));end if;
  match:=candidates->0;
  return match;
end;
$$;

create or replace function public.admin_pwa_sepay_suggestions(p_transactions jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare answer jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Verified server only.' using errcode='42501';end if;
  if jsonb_typeof(p_transactions) is distinct from 'array' or jsonb_array_length(p_transactions)>500 then
    raise exception 'Invalid transaction list.' using errcode='22023';end if;
  select coalesce(jsonb_object_agg(tx->>'id',public.admin_pwa_sepay_candidate(tx)),'{}'::jsonb) into answer
    from jsonb_array_elements(p_transactions) tx;
  return answer;
end;
$$;
revoke all on function public.admin_pwa_sepay_candidate(jsonb),public.admin_pwa_sepay_suggestions(jsonb) from public,anon,authenticated;
grant execute on function public.admin_pwa_sepay_candidate(jsonb),public.admin_pwa_sepay_suggestions(jsonb) to service_role;

-- Patch the deployed financial function rather than replacing later fixes.
alter table public.admin_pwa_bank_claims drop constraint if exists admin_pwa_bank_claims_mode_check;
alter table public.admin_pwa_bank_claims add constraint admin_pwa_bank_claims_mode_check check(mode in('reconcile','suggested-reconcile','bank-receipt'));
do $migration$
declare definition text;
  old_rule text := $old$if coalesce(cardinality(matches),0)<>1 or matches[1]<>p_invoice_id then raise exception 'No unique matching invoice.' using errcode='22023';end if;$old$;
  new_rule text := $new$if p_mode='suggested-reconcile' then
      -- The shared financial lock is held. Lock the target before rechecking
      -- remaining balance and all competing candidates at approval time.
      perform 1 from public.invoices where id=p_invoice_id for update;
      if public.admin_pwa_sepay_candidate(p_tx)->>'status' is distinct from 'suggestion'
        or public.admin_pwa_sepay_candidate(p_tx)->>'invoiceId' is distinct from p_invoice_id then
        raise exception 'Suggestion is no longer unique or payable.' using errcode='22023';end if;
    elsif coalesce(cardinality(matches),0)<>1 or matches[1]<>p_invoice_id then raise exception 'No unique matching invoice.' using errcode='22023';end if;$new$;
  old_bank text := $old$elsif coalesce(cardinality(matches),0)>0 then raise exception 'Invoice transfer cannot be credited again as other bank income.' using errcode='22023';end if;$old$;
  new_bank text := $new$elsif coalesce(cardinality(matches),0)>0 or public.admin_pwa_sepay_candidate(p_tx)->>'status'<>'none' then
    raise exception 'Possible invoice payment cannot be credited again as other bank income.' using errcode='22023';end if;$new$;
begin
  definition:=pg_get_functiondef('public.admin_pwa_reconcile_verified_sepay(jsonb,text,uuid,text)'::regprocedure);
  if position(new_rule in definition)>0 then return;end if;
  if position(old_rule in definition)=0 or position(old_bank in definition)=0
    or position($$p_mode not in ('reconcile','bank-receipt')$$ in definition)=0 then
    raise exception 'SePay approval function changed; review before applying';end if;
  definition:=replace(definition,$$p_mode not in ('reconcile','bank-receipt')$$,$$p_mode not in ('reconcile','suggested-reconcile','bank-receipt')$$);
  definition:=replace(definition,$$p_mode='reconcile'$$,$$p_mode in ('reconcile','suggested-reconcile')$$);
  definition:=replace(definition,old_rule,new_rule);
  definition:=replace(definition,old_bank,new_bank);
  definition:=replace(definition,$$'Đối soát SePay đã xác minh (Ref: '||coalesce(ref,tx_id)||')'$$,
    $$case when p_mode='suggested-reconcile' then 'Duyệt gợi ý SePay: khớp tên khách, số còn thu và kỳ thanh toán (Ref: ' else 'Đối soát SePay đã xác minh (Ref: ' end||coalesce(ref,tx_id)||')'$$);
  execute definition;
end;
$migration$;
notify pgrst,'reload schema';
commit;
