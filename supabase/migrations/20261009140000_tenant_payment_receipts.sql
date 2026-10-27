begin;

-- Independent copies for the invoice's tenant and opted-in system accounts.
-- The cutover is durable: reinstalling this migration never replays old receipts.
create table if not exists public.tenant_payment_receipt_settings (
 id boolean primary key default true check(id), started_at timestamptz not null default now()
);
insert into public.tenant_payment_receipt_settings(id) values(true) on conflict do nothing;
create table if not exists public.tenant_payment_receipts (
 id uuid primary key default gen_random_uuid(), invoice_id text not null references public.invoices(id),
 tenant_id text not null references public.tenants(id), transaction_key text not null,
 recipient_email text, recipient_name text not null, payload jsonb not null,
 status text not null check(status in ('blocked','queued','sending','sent','failed','skipped')),
 attempts integer not null default 0, lease_token uuid, lease_until timestamptz,
 first_attempt_at timestamptz, next_attempt_at timestamptz not null default now(),
 provider_message_id text, error_message text, sent_at timestamptz, created_at timestamptz not null default now(),
 unique(invoice_id,transaction_key)
);
alter table public.tenant_payment_receipt_settings enable row level security;
alter table public.tenant_payment_receipts enable row level security;
revoke all on public.tenant_payment_receipt_settings,public.tenant_payment_receipts from public,anon,authenticated;
grant all on public.tenant_payment_receipt_settings,public.tenant_payment_receipts to service_role;

create or replace function public.tenant_receipt_address(p_tenant text)
returns text language sql stable security definer set search_path=public,pg_temp as $$
 select lower(btrim(case when a.tenant_id is not null then a.email else t.email end))
 from tenants t left join tenant_web_accounts a on a.tenant_id=t.id
 where t.id=p_tenant and t.is_active
 and (a.tenant_id is null or a.status='active')
 and coalesce(case when a.tenant_id is not null then a.email else t.email end,'') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 -- Never mistake the landlord's login/notification contact for a tenant.
 and not exists(select 1 from users u where
  lower(btrim(u.email))=lower(btrim(case when a.tenant_id is not null then a.email else t.email end))
  or lower(btrim(u.notification_email))=lower(btrim(case when a.tenant_id is not null then a.email else t.email end)));
$$;

create or replace function public.capture_tenant_payment_receipt()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare rec jsonb; previous jsonb:='[]'; started timestamptz; address text; tenant_name text; room_name text; key text;
begin
 if not exists(select 1 from email_automation_settings where enabled) or new.tenant_id is null then return new;end if;
 select started_at into started from tenant_payment_receipt_settings where id=true;
 select full_name into tenant_name from tenants where id=new.tenant_id;
 if tenant_name is null or started is null then return new;end if;
 address:=tenant_receipt_address(new.tenant_id);
 select name into room_name from rooms where id=new.room_id;
 if tg_op='UPDATE' then previous:=coalesce(old.payment_records,'[]');end if;
 for rec in select value from jsonb_array_elements(coalesce(new.payment_records,'[]')) loop
  key:=regexp_replace(upper(coalesce(nullif(rec->>'external_ref',''),rec->>'external_id','')),'[^A-Z0-9]','','g');
  if rec->>'source'='sepay' and (rec->>'amount')::numeric>0 and key<>''
   and nullif(rec->>'created_at','')::timestamptz>=started
   and not exists(select 1 from jsonb_array_elements(previous) p where p->>'id'=rec->>'id') then
   insert into tenant_payment_receipts(invoice_id,tenant_id,transaction_key,recipient_email,recipient_name,payload,status,error_message)
   values(new.id,new.tenant_id,key,address,tenant_name,
    jsonb_build_object('invoiceId',new.id,'roomId',new.room_id,'roomName',room_name,'invoice',to_jsonb(new),'record',rec,
     'transactionKey',coalesce(nullif(rec->>'external_ref',''),rec->>'external_id')),
    case when address is null then 'blocked' else 'queued' end,
    case when address is null then 'Chưa có email người thuê hợp lệ hoặc tài khoản đã khóa.' else null end)
   on conflict(invoice_id,transaction_key) do nothing;
  end if;
 end loop;
 return new;
end $$;
drop trigger if exists tenant_sepay_receipt on public.invoices;
create trigger tenant_sepay_receipt after insert or update of payment_records on public.invoices
 for each row execute function public.capture_tenant_payment_receipt();

create or replace function public.claim_tenant_payment_receipts(p_limit integer default 10)
returns setof public.tenant_payment_receipts language plpgsql security definer set search_path=public,pg_temp as $$
declare daily integer; remaining integer; n integer; today date:=(now() at time zone 'UTC')::date;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service only' using errcode='42501';end if;
 select daily_limit into daily from email_automation_settings where enabled for update;
 if not found then return;end if;
 insert into email_send_budget(day) values(today) on conflict do nothing;
 select greatest(0,daily-reservations) into remaining from email_send_budget where day=today for update;
 update tenant_payment_receipts set status='failed',next_attempt_at='infinity',lease_token=null,lease_until=null,
  error_message='Cần kiểm tra lịch sử Resend trước khi gửi lại: đã hết thời hạn chống trùng.'
  where status in ('queued','sending','failed') and first_attempt_at<now()-interval '23 hours';
 return query with candidates as (
  select id from tenant_payment_receipts where attempts<5 and next_attempt_at<=now()
   and (status in ('queued','failed') or (status='sending' and lease_until<now()))
  order by created_at,id for update skip locked limit least(greatest(p_limit,1),25,remaining)
 ), claimed as (
  update tenant_payment_receipts d set status='sending',attempts=attempts+1,
   first_attempt_at=coalesce(first_attempt_at,now()),lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',error_message=null
   where d.id in(select id from candidates) returning d.*
 ) select * from claimed;
 get diagnostics n=row_count;
 update email_send_budget set reservations=reservations+n where day=today;
end $$;

create or replace function public.tenant_payment_receipt_valid(p_id uuid,p_lease uuid)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service only' using errcode='42501';end if;
 return exists(select 1 from tenant_payment_receipts d join invoices i on i.id=d.invoice_id
  where d.id=p_id and d.status='sending' and d.lease_token=p_lease and d.lease_until>now()
   and i.tenant_id=d.tenant_id and i.payment_status not in ('cancelled','merged')
   and tenant_receipt_address(d.tenant_id)=d.recipient_email
   and exists(select 1 from jsonb_array_elements(coalesce(i.payment_records,'[]')) r
    where r->>'id'=d.payload->'record'->>'id' and r->>'source'='sepay'
     and (r->>'amount')::numeric=(d.payload->'record'->>'amount')::numeric
     and regexp_replace(upper(coalesce(nullif(r->>'external_ref',''),r->>'external_id','')),'[^A-Z0-9]','','g')=d.transaction_key));
end $$;

create or replace function public.finish_tenant_payment_receipt(p_id uuid,p_lease uuid,p_status text,p_provider text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if coalesce(auth.role(),'')<>'service_role' or p_status not in ('sent','failed','skipped') then raise exception 'Service only' using errcode='42501';end if;
 update tenant_payment_receipts set status=p_status,provider_message_id=p_provider,error_message=p_error,
  sent_at=case when p_status='sent' then now() else sent_at end,
  next_attempt_at=case when p_status='failed' and attempts<5 then now()+interval '2 minutes'*power(2,attempts-1) else 'infinity'::timestamptz end,
  lease_token=null,lease_until=null where id=p_id and lease_token=p_lease and status='sending';
 get diagnostics n=row_count;return n=1;
end $$;

-- The older monthly-cycle receipt must not send a second, smaller receipt for
-- a SePay transaction already handled here, including a missing-email block.
create or replace function public.tenant_receipt_supersedes(p_invoice text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service only' using errcode='42501';end if;
 return exists(select 1 from tenant_payment_receipts where invoice_id=p_invoice);
end $$;

revoke all on function public.tenant_receipt_address(text),public.capture_tenant_payment_receipt(),
 public.claim_tenant_payment_receipts(integer),public.tenant_payment_receipt_valid(uuid,uuid),
 public.finish_tenant_payment_receipt(uuid,uuid,text,text,text),public.tenant_receipt_supersedes(text) from public,anon,authenticated;
grant execute on function public.claim_tenant_payment_receipts(integer),public.tenant_payment_receipt_valid(uuid,uuid),
 public.finish_tenant_payment_receipt(uuid,uuid,text,text,text),public.tenant_receipt_supersedes(text) to service_role;
notify pgrst,'reload schema';
commit;
