-- Protect SePay provenance even when someone bypasses the PWA UI and calls
-- the older shared payment RPC directly. No Electron source changes.
begin;
create or replace function public.admin_pwa_guard_sepay_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare verified public.sepay_server_transactions%rowtype; matches text[];
begin
  if lower(btrim(coalesce(new.source,'')))<>'sepay' or coalesce(auth.role(),'')='service_role' then return new;end if;
  if not exists(select 1 from public.users u where u.id=auth.uid() and u.role='admin' and u.status='active') then raise exception 'Only verified bank reconciliation can record SePay.' using errcode='42501';end if;
  -- Legacy Electron may still call the atomic RPC, but only against a real
  -- server-observed bank record, with the exact amount and target transfer code.
  select * into verified from public.sepay_server_transactions t where t.external_id=new.external_id and (new.external_ref is null or new.external_ref=t.reference_number);
  if not found or verified.status='recorded' or verified.amount<>new.amount or new.payment_method<>'transfer' then raise exception 'SePay bank provenance is missing or inconsistent.' using errcode='22023';end if;
  select array_agg(i.id) into matches from public.invoices i join public.rooms r on r.id=i.room_id where i.payment_status not in ('cancelled','merged')
    and position('P'||coalesce(nullif(regexp_replace(r.name,'\D','','g'),''),nullif(left(regexp_replace(upper(r.name),'[^A-Z0-9]','','g'),6),''),'XX')||'T'||lpad(i.month::text,2,'0')||i.year||'C'||right(regexp_replace(upper(i.id),'[^A-Z0-9]','','g'),12) in regexp_replace(upper(verified.content),'[^A-Z0-9]','','g'))>0;
  if coalesce(cardinality(matches),0)<>1 or matches[1]<>new.invoice_id then raise exception 'Bank transfer does not uniquely identify this invoice.' using errcode='22023';end if;
  return new;
end;
$$;
create or replace function public.admin_pwa_guard_sepay_invoice()
returns trigger language plpgsql security definer set search_path='' as $$
declare previous_records jsonb := '[]'::jsonb; next_records jsonb; payment jsonb; old_sum numeric; next_sum numeric;
begin
  if coalesce(auth.role(),'')='service_role' then return new;end if;
  if tg_op='UPDATE' then previous_records:=coalesce(old.payment_records,'[]'::jsonb);end if;
  next_records:=coalesce(new.payment_records,'[]'::jsonb);
  if jsonb_typeof(next_records)<>'array' or jsonb_typeof(previous_records)<>'array' then raise exception 'Invalid payment history.' using errcode='22023';end if;
  for payment in select r from jsonb_array_elements(previous_records) r where lower(btrim(coalesce(r->>'source','')))='sepay' loop
    if not exists(select 1 from jsonb_array_elements(next_records) n where n=payment) then raise exception 'Verified SePay history is immutable.' using errcode='22023';end if;
  end loop;
  for payment in select r from jsonb_array_elements(next_records) r where lower(btrim(coalesce(r->>'source','')))='sepay' loop
    if exists(select 1 from jsonb_array_elements(previous_records) p where p=payment) then continue;end if;
    if not exists(select 1 from public.payment_events e where e.invoice_id=new.id and lower(btrim(coalesce(e.source,'')))='sepay'
      and e.amount=(payment->>'amount')::numeric and e.payment_method=payment->>'payment_method'
      and e.payment_date::text=payment->>'payment_date'
      and e.external_id is not distinct from nullif(payment->>'external_id','')
      and e.external_ref is not distinct from nullif(payment->>'external_ref','')) then raise exception 'SePay record must originate from the verified payment ledger.' using errcode='22023';end if;
    if (select count(*) from jsonb_array_elements(next_records) n where n->>'external_id'=payment->>'external_id' or (nullif(payment->>'external_ref','') is not null and n->>'external_ref'=payment->>'external_ref'))>1 then raise exception 'Bank transaction cannot be appended twice.' using errcode='22023';end if;
  end loop;
  if tg_op='UPDATE' and exists(select 1 from jsonb_array_elements(previous_records||next_records) p where lower(btrim(coalesce(p->>'source','')))='sepay') then
    select coalesce(sum((p->>'amount')::numeric),0) into old_sum from jsonb_array_elements(previous_records) p;
    select coalesce(sum((p->>'amount')::numeric),0) into next_sum from jsonb_array_elements(next_records) p;
    if coalesce(new.paid_amount,0)-coalesce(old.paid_amount,0)<>next_sum-old_sum then raise exception 'Paid amount must match the payment-history change.' using errcode='22023';end if;
  end if;
  return new;
end;
$$;
revoke all on function public.admin_pwa_guard_sepay_event(),public.admin_pwa_guard_sepay_invoice() from public,anon,authenticated;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='admin_pwa_sepay_event_guard' and tgrelid='public.payment_events'::regclass and not tgisinternal) then
    create trigger admin_pwa_sepay_event_guard before insert on public.payment_events for each row execute function public.admin_pwa_guard_sepay_event();
  end if;
  if not exists(select 1 from pg_trigger where tgname='admin_pwa_sepay_invoice_guard' and tgrelid='public.invoices'::regclass and not tgisinternal) then
    create trigger admin_pwa_sepay_invoice_guard before insert or update on public.invoices for each row execute function public.admin_pwa_guard_sepay_invoice();
  end if;
end; $$;
commit;
