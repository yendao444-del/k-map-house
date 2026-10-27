begin;

-- A monthly-payment request uses Resend's 24-hour idempotency window too.
-- Preserve the first claim so an uncertain old request is never replayed.
alter table public.tenant_payment_emails
  add column if not exists first_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz;

create or replace function public.claim_tenant_payment_emails()
returns setof public.tenant_payment_emails language plpgsql security definer set search_path=public,pg_temp as $$
declare daily int; remaining int; n int; today date:=(now() at time zone 'UTC')::date;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service only';end if;
 select daily_limit into daily from email_automation_settings where enabled for update;
 if not found then return;end if;
 insert into email_send_budget(day,reservations) values(today,0) on conflict do nothing;
 select greatest(0,daily-reservations) into remaining from email_send_budget where day=today for update;
 update tenant_payment_emails set status='failed',next_attempt_at='infinity',lease=null,lease_until=null,
  error='Cần kiểm tra lịch sử Resend trước khi gửi lại: đã hết thời hạn chống trùng.'
  where status in ('queued','sending','failed') and first_attempt_at<now()-interval '23 hours';
 return query with picked as (
  select id from tenant_payment_emails where
   ((status in ('queued','failed') and next_attempt_at<=now()) or (status='sending' and lease_until<now())) and attempts<5
  order by created_at,id for update skip locked limit least(remaining,10)
 ), claimed as (
  update tenant_payment_emails e set status='sending',attempts=attempts+1,
   first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),lease=gen_random_uuid(),lease_until=now()+interval '5 minutes'
  from picked p where e.id=p.id returning e.*
 ) select * from claimed;
 get diagnostics n=row_count;update email_send_budget set reservations=reservations+n where day=today;
end $$;

-- A receipt can be blocked only because the tenant did not have an email at
-- payment time. Requeue it after a valid tenant address is later saved.
create or replace function public.release_blocked_tenant_payment_receipts()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service only' using errcode='42501';end if;
 update tenant_payment_receipts d set
  recipient_email=tenant_receipt_address(d.tenant_id),
  recipient_name=t.full_name,
  status='queued',error_message=null,next_attempt_at=now()
 from invoices i join tenants t on t.id=i.tenant_id
 where d.status='blocked' and d.invoice_id=i.id and d.tenant_id=i.tenant_id and t.is_active
  and i.payment_status not in ('cancelled','merged')
  and tenant_receipt_address(d.tenant_id) is not null
  and exists(select 1 from jsonb_array_elements(coalesce(i.payment_records,'[]')) r
    where r->>'id'=d.payload->'record'->>'id' and r->>'source'='sepay'
      and (r->>'amount')::numeric=(d.payload->'record'->>'amount')::numeric
      and regexp_replace(upper(coalesce(nullif(r->>'external_ref',''),r->>'external_id','')),'[^A-Z0-9]','','g')=d.transaction_key);
 get diagnostics n=row_count;
 return n;
end $$;

-- Management users need one read-only history that includes system mail and
-- tenant payment mail; the tenant queue itself remains private from browsers.
create or replace function public.email_delivery_history(p_limit integer default 100)
returns table(
 id uuid,recipient_user_id uuid,recipient_email text,recipient_name text,event_type text,
 dedupe_key text,subject text,payload jsonb,status text,provider text,error_message text,
 created_at timestamptz,sent_at timestamptz
) language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from users u where u.id=auth.uid() and u.role='admin' and u.status='active') then
  raise exception 'Chỉ admin được xem lịch sử email.' using errcode='42501';
 end if;
 return query
 select * from (
  select d.id,d.recipient_user_id,d.recipient_email,d.recipient_name,d.event_type,d.dedupe_key,d.subject,d.payload,
   d.status,d.provider,d.error_message,d.created_at,d.sent_at from email_notification_deliveries d
  union all
  select r.id,null::uuid,r.recipient_email,r.recipient_name,'sepay_matched','tenant-receipt:'||r.id::text,
   '[AN KHANG HOME] Thanh toán thành công',r.payload,r.status,'resend',r.error_message,r.created_at,r.sent_at
   from tenant_payment_receipts r
  union all
  select e.id,null::uuid,e.recipient,t.full_name,'tenant_'||e.kind,'tenant-payment:'||e.id::text,
   '[AN KHANG HOME] '||case e.kind when 'readings' then 'Đến kỳ thanh toán' when 'invoice' then 'Hóa đơn và dịch vụ' else 'Thanh toán thành công' end,
   jsonb_build_object('cycleId',e.cycle_id),e.status,case when e.provider_id is null then null else 'resend' end,
   e.error,e.created_at,e.sent_at
   from tenant_payment_emails e join tenant_payment_cycles c on c.id=e.cycle_id join tenants t on t.id=c.tenant_id
 ) history order by created_at desc limit least(greatest(coalesce(p_limit,100),1),100);
end $$;

revoke all on function public.release_blocked_tenant_payment_receipts(),public.email_delivery_history(integer) from public,anon,authenticated;
grant execute on function public.release_blocked_tenant_payment_receipts() to service_role;
grant execute on function public.email_delivery_history(integer) to authenticated;
notify pgrst,'reload schema';
commit;
