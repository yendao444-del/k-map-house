begin;

-- Installation never enables sending or replays the historical bank ledger.
create table if not exists public.email_automation_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 enabled_at timestamptz, reminder_hour integer not null default 8 check(reminder_hour between 0 and 23),
 repeat_days integer not null default 7 check(repeat_days between 1 and 30),
 long_unpaid_days integer not null default 30 check(long_unpaid_days>=15),
 daily_limit integer not null default 90 check(daily_limit between 1 and 100),
 sepay_enabled boolean not null default false, sepay_started_at timestamptz,
 last_poll_at timestamptz, last_poll_error text, last_worker_at timestamptz,
 updated_at timestamptz not null default now()
);
insert into public.email_automation_settings(id) values(true) on conflict do nothing;
alter table public.email_automation_settings enable row level security;
revoke all on public.email_automation_settings from public,anon,authenticated;
grant all on public.email_automation_settings to service_role;

alter table public.email_notification_deliveries add column if not exists server_queue boolean not null default false;
alter table public.email_notification_deliveries add column if not exists attempts integer not null default 0;
alter table public.email_notification_deliveries add column if not exists next_attempt_at timestamptz not null default now();
alter table public.email_notification_deliveries add column if not exists lease_token uuid;
alter table public.email_notification_deliveries add column if not exists lease_until timestamptz;
alter table public.email_notification_deliveries add column if not exists first_attempt_at timestamptz;
alter table public.email_notification_deliveries add column if not exists last_attempt_at timestamptz;
create index if not exists email_server_queue_due_idx on public.email_notification_deliveries(next_attempt_at)
 where server_queue and status in ('queued','failed','sending');
grant all on public.email_notification_deliveries to service_role;

create table if not exists public.email_send_budget (
 day date primary key, reservations integer not null default 0
);
alter table public.email_send_budget enable row level security;
revoke all on public.email_send_budget from public,anon,authenticated;
grant all on public.email_send_budget to service_role;

create table if not exists public.sepay_server_transactions (
 transaction_key text primary key, external_id text not null, reference_number text,
 amount bigint not null check(amount>0), content text not null default '',
 occurred_at timestamptz not null, invoice_id text references public.invoices(id),
 status text not null check(status in ('recorded','partial','over','unmatched','ambiguous','historical')),
 observed_at timestamptz not null default now()
);
alter table public.sepay_server_transactions enable row level security;
revoke all on public.sepay_server_transactions from public,anon,authenticated;
grant all on public.sepay_server_transactions to service_role;

create or replace function public.email_preference_allowed(p_user uuid,p_type text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from users u left join auth.users a on a.id=u.id
 where u.id=p_user and u.status='active' and u.role in ('admin','user')
 and coalesce(a.raw_app_meta_data->>'portal_role','') not in ('webmobile_tenant','webmobile_demo_tenant')
 and u.email_notifications_enabled and nullif(btrim(u.notification_email),'') is not null
 and coalesce(u.email_notification_preferences->p_type,
   case when p_type in ('room_checkout_due','rent_overdue','rent_long_unpaid','sepay_unmatched','contract_expiring')
     then 'true'::jsonb else 'false'::jsonb end)='true'::jsonb);
$$;
revoke all on function public.email_preference_allowed(uuid,text) from public,anon,authenticated;

create or replace function public.enqueue_server_email(p_type text,p_key text,p_payload jsonb,p_recipient uuid default null,p_subject text default null)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if not exists(select 1 from email_automation_settings where enabled) then return 0; end if;
 insert into email_notification_deliveries(recipient_user_id,recipient_email,recipient_name,event_type,dedupe_key,subject,payload,status,server_queue,provider)
 select u.id,btrim(u.notification_email),u.full_name,p_type,
   case when p_recipient is not null then p_key else u.id||':'||p_type||':'||p_key end,
   coalesce(p_subject,'[AN KHANG HOME] Thông báo'),p_payload,'queued',true,'resend'
 from users u where (p_recipient is null or u.id=p_recipient) and email_preference_allowed(u.id,p_type)
 on conflict(dedupe_key) do nothing;
 get diagnostics n=row_count; return n;
end $$;
revoke all on function public.enqueue_server_email(text,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.enqueue_server_email(text,text,jsonb,uuid,text) to service_role;

create or replace function public.capture_server_invoice_email()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare rec jsonb; previous jsonb:='[]'; room_name text; started timestamptz;
begin
 select enabled_at into started from email_automation_settings where enabled;
 if started is null then return new; end if;
 select name into room_name from rooms where id=new.room_id;
 if tg_op='INSERT' and new.payment_status not in ('cancelled','merged','paid') and new.total_amount>new.paid_amount then
  perform enqueue_server_email('invoices_services',new.id,jsonb_build_object('invoiceId',new.id,'roomId',new.room_id));
 end if;
 if tg_op='UPDATE' then previous:=coalesce(old.payment_records,'[]'); end if;
 for rec in select value from jsonb_array_elements(coalesce(new.payment_records,'[]')) loop
  if rec->>'source'='sepay' and (rec->>'amount')::numeric>0
   and nullif(rec->>'created_at','')::timestamptz>=started
   and nullif(coalesce(rec->>'external_ref',rec->>'external_id'),'') is not null
   and not exists(select 1 from jsonb_array_elements(previous) p where p->>'id'=rec->>'id') then
   perform enqueue_server_email('sepay_matched',regexp_replace(upper(coalesce(rec->>'external_ref',rec->>'external_id')),'[^A-Z0-9]','','g'),
    jsonb_build_object('invoiceId',new.id,'roomId',new.room_id,'roomName',room_name,
     'invoice',to_jsonb(new),'record',rec,'transactionKey',coalesce(rec->>'external_ref',rec->>'external_id')));
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.capture_server_invoice_email() from public,anon,authenticated;
drop trigger if exists server_invoice_email on public.invoices;
create trigger server_invoice_email after insert or update of payment_records on public.invoices
 for each row execute function public.capture_server_invoice_email();

create or replace function public.enqueue_due_server_emails(p_now timestamptz default now())
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg email_automation_settings%rowtype; today date:=(p_now at time zone 'Asia/Ho_Chi_Minh')::date;
 i record; r record; c record; due date; age integer; kind text; n integer:=0; bucket integer;
begin
 select * into cfg from email_automation_settings where enabled;
 if not found or extract(hour from p_now at time zone 'Asia/Ho_Chi_Minh')<cfg.reminder_hour then return 0; end if;
 for i in select v.*,r.name room_name from invoices v join rooms r on r.id=v.room_id
  where v.payment_status not in ('paid','cancelled','merged') and v.total_amount>coalesce(v.paid_amount,0) loop
  due:=coalesce(i.due_date,make_date(i.year,i.month,15));
  if due>today then continue; end if;
  age:=today-due; kind:=case when age>=cfg.long_unpaid_days then 'rent_long_unpaid' else 'rent_overdue' end;
  bucket:=age/cfg.repeat_days;
  n:=n+enqueue_server_email(kind,i.id||':'||due||':'||bucket,
    jsonb_build_object('invoiceId',i.id,'roomId',i.room_id,'roomName',i.room_name,'dueDate',due,'daysUnpaid',age));
 end loop;
 for r in select * from rooms where old_debt>0 loop
  -- old_debt is separate from invoice debt. A room with both gets a single combined reminder.
  if exists(select 1 from invoices v where v.room_id=r.id and v.payment_status not in ('paid','cancelled','merged') and v.total_amount>coalesce(v.paid_amount,0)) then continue; end if;
  if extract(day from today)<15 then continue; end if;
  n:=n+enqueue_server_email('rent_overdue',r.id||':old-debt:'||to_char(today,'YYYY-MM')||':'||((extract(day from today)::integer-15)/cfg.repeat_days),
    jsonb_build_object('roomId',r.id,'roomName',r.name,'oldDebt',true,'dueDate',date_trunc('month',today)::date+14));
 end loop;
 for r in select * from rooms where status='ending' and expected_end_date<=today loop
  n:=n+enqueue_server_email('room_checkout_due',r.id||':'||r.expected_end_date||':'||((today-r.expected_end_date)/cfg.repeat_days),
    jsonb_build_object('roomId',r.id,'roomName',r.name,'dueDate',r.expected_end_date));
 end loop;
 for c in select c.*,r.name room_name from contracts c join rooms r on r.id=c.room_id
  where c.status='active' and c.expiration_date between today and today+7 loop
  n:=n+enqueue_server_email('contract_expiring',c.id||':'||c.expiration_date,
    jsonb_build_object('contractId',c.id,'roomId',c.room_id,'roomName',c.room_name,'dueDate',c.expiration_date));
 end loop;
 return n;
end $$;
revoke all on function public.enqueue_due_server_emails(timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_due_server_emails(timestamptz) to service_role;

create or replace function public.claim_server_emails(p_limit integer default 20,p_id uuid default null)
returns setof public.email_notification_deliveries language plpgsql security definer set search_path=public,pg_temp as $$
declare remaining integer; daily integer; today date:=(now() at time zone 'UTC')::date; n integer;
begin
 select daily_limit into daily from email_automation_settings where enabled for update;
 if not found then return; end if;
 insert into email_send_budget(day) values(today) on conflict do nothing;
 select greatest(0,daily-reservations) into remaining from email_send_budget where day=today for update;
 -- Provider idempotency lasts 24 hours. Uncertain sends older than 23h need human review.
 update email_notification_deliveries set status='failed',error_message='Cần kiểm tra lịch sử Resend trước khi gửi lại: đã hết thời hạn chống trùng.',next_attempt_at='infinity',lease_token=null,lease_until=null
 where server_queue and status in ('queued','sending','failed') and first_attempt_at<now()-interval '23 hours';
 return query with candidates as (
  select id from email_notification_deliveries
  where server_queue and (p_id is null or id=p_id) and attempts<5 and next_attempt_at<=now()
   and (status in ('queued','failed') or (status='sending' and lease_until<now()))
  order by created_at,id for update skip locked limit least(greatest(p_limit,1),25,remaining)
 ), claimed as (
  update email_notification_deliveries d set status='sending',attempts=attempts+1,
   first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',error_message=null
  where d.id in(select id from candidates) returning d.*
 ) select * from claimed;
 get diagnostics n=row_count;
 update email_send_budget set reservations=reservations+n where day=today;
end $$;
revoke all on function public.claim_server_emails(integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_server_emails(integer,uuid) to service_role;

create or replace function public.finish_server_email(p_id uuid,p_lease uuid,p_status text,p_message text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if p_status not in ('sent','failed','skipped') then raise exception 'Invalid delivery status'; end if;
 update email_notification_deliveries set status=p_status,provider_message_id=p_message,error_message=left(p_error,500),
  sent_at=case when p_status='sent' then now() else sent_at end,
  next_attempt_at=case when p_status='failed' and attempts<5 then now()+interval '2 minutes'*power(2,attempts-1) else 'infinity'::timestamptz end,
  lease_until=null,lease_token=null where id=p_id and lease_token=p_lease and status='sending';
 get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.finish_server_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_server_email(uuid,uuid,text,text,text) to service_role;

create or replace function public.email_server_status()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from users where id=auth.uid() and status='active') then raise exception 'Cần đăng nhập.'; end if;
 return (select jsonb_build_object('enabled',enabled,'provider','resend','automatic',enabled,
  'sepayEnabled',sepay_enabled,'reminderHour',reminder_hour,'timezone','Asia/Ho_Chi_Minh') from email_automation_settings);
end $$;
revoke all on function public.email_server_status() from public,anon;
grant execute on function public.email_server_status() to authenticated;

-- Only the service-role worker can call this; browser clients cannot submit bank amounts.
create or replace function public.process_server_sepay(p_tx jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg email_automation_settings%rowtype; tx_key text; tx_id text; ref text; amount bigint; content text;
 occurred timestamptz; account text; keys text[]; ids text[]; inv invoices%rowtype; actor uuid; answer jsonb;
 state text; saved_claims text; saved_sub text; matched_room text; ctr contracts%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service only' using errcode='42501'; end if;
 select * into cfg from email_automation_settings where enabled and sepay_enabled;
 if not found then return jsonb_build_object('status','disabled'); end if;
 tx_id:=nullif(btrim(p_tx->>'id'),'');ref:=nullif(btrim(p_tx->>'reference_number'),'');
 amount:=(p_tx->>'amount_in')::numeric;content:=coalesce(p_tx->>'transaction_content','');
 if tx_id is null or amount<=0 or amount>2147483647 or (p_tx->>'amount_in')::numeric<>amount then return jsonb_build_object('status','ignored');end if;
 if nullif(p_tx->>'transaction_date','') is null then return jsonb_build_object('status','ignored');end if;
 occurred:=case when p_tx->>'transaction_date' ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then (p_tx->>'transaction_date')::timestamptz
   else (p_tx->>'transaction_date')::timestamp at time zone 'Asia/Ho_Chi_Minh' end;
 if occurred>now()+interval '5 minutes' then return jsonb_build_object('status','ignored');end if;
 select regexp_replace(account_no,'\D','','g') into account from app_settings limit 1;
 if nullif(account,'') is null or regexp_replace(coalesce(p_tx->>'account_number',''),'\D','','g')<>account then return jsonb_build_object('status','wrong_account');end if;
 tx_key:=regexp_replace(upper(coalesce(ref,tx_id)),'[^A-Z0-9]','','g');
 keys:=array[lower(coalesce(ref,tx_id)),lower(tx_id)];
 -- Serialize with invoice/wallet operations before taking external-key and row locks.
 perform pg_advisory_xact_lock(20261005,120000);
 perform pg_advisory_xact_lock(hashtext('server-sepay:'||tx_key));
 if exists(select 1 from sepay_server_transactions where transaction_key=tx_key or external_id=tx_id) then return jsonb_build_object('status','duplicate');end if;
 if occurred<cfg.sepay_started_at then return jsonb_build_object('status','historical');end if;
 if exists(select 1 from payment_event_keys where key=any(keys)) or exists(
  select 1 from invoices i cross join lateral jsonb_array_elements(coalesce(i.payment_records,'[]')) p
   where lower(btrim(p->>'external_ref'))=any(keys) or lower(btrim(p->>'external_id'))=any(keys)) then
  state:='recorded';
 else
  select array_agg(i.id) into ids from invoices i join rooms r on r.id=i.room_id
  where i.payment_status not in ('cancelled','merged') and position(
   'P'||coalesce(nullif(regexp_replace(r.name,'\D','','g'),''),nullif(left(regexp_replace(upper(r.name),'[^A-Z0-9]','','g'),6),''),'XX')||
   'T'||lpad(i.month::text,2,'0')||i.year||'C'||right(regexp_replace(upper(i.id),'[^A-Z0-9]','','g'),12)
   in regexp_replace(upper(content),'[^A-Z0-9]','','g'))>0;
  state:=case when coalesce(cardinality(ids),0)=0 then 'unmatched' when cardinality(ids)>1 then 'ambiguous' else 'partial' end;
  if cardinality(ids)=1 then
   select * into inv from invoices where id=ids[1] for update;
   if amount=inv.total_amount-coalesce(inv.paid_amount,0) and inv.payment_status<>'paid' and inv.total_amount>0 then
    select id into actor from users where role='admin' and status='active' order by created_at,id limit 1;
    if actor is null then raise exception 'Chưa có quản trị viên để ghi nhận SePay.';end if;
    saved_claims:=current_setting('request.jwt.claims',true);saved_sub:=current_setting('request.jwt.claim.sub',true);
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','service_role')::text,true);
    answer:=record_invoice_payment_atomic(inv.id,amount::integer,'transfer',(occurred at time zone 'Asia/Ho_Chi_Minh')::date,
      'Thu qua SePay: '||content||' (Ref: '||coalesce(ref,tx_id)||')',ref,tx_id,'sepay');
    perform set_config('request.jwt.claim.sub',coalesce(saved_sub,''),true);
    perform set_config('request.jwt.claims',coalesce(saved_claims,'{}'),true);
    if coalesce((answer->>'applied')::boolean,false) or coalesce((answer->>'duplicate')::boolean,false) then state:='recorded';
    else raise exception 'Khoản thu SePay chưa được ghi nhận.';end if;
    -- Complete the same settlement transition that Electron performs, atomically.
    if (answer->>'transitioned_to_paid')::boolean and inv.is_settlement then
     select * into ctr from contracts where room_id=inv.room_id and status='active' order by created_at desc limit 1 for update;
     if ctr.id is not null and (ctr.tenant_id is null or ctr.tenant_id=inv.tenant_id) then
      update rooms set status='vacant',tenant_name=null,tenant_phone=null,move_in_date=null,expected_end_date=null,
       electric_old=inv.electric_new,electric_new=inv.electric_new,water_old=inv.water_new,water_new=inv.water_new,has_move_in_receipt=false
       where id=inv.room_id and status='ending';
      if found then update contracts set status='terminated',end_date=coalesce(inv.invoice_date,(occurred at time zone 'Asia/Ho_Chi_Minh')::date),
       end_note=coalesce(inv.damage_note,inv.adjustment_note),final_electric=inv.electric_new,final_water=inv.water_new where id=ctr.id;end if;
     end if;
    end if;
   else state:=case when amount<inv.total_amount-coalesce(inv.paid_amount,0) then 'partial' else 'over' end;end if;
  end if;
 end if;
 insert into sepay_server_transactions(transaction_key,external_id,reference_number,amount,content,occurred_at,invoice_id,status)
 values(tx_key,tx_id,ref,amount,content,occurred,inv.id,state);
 if state<>'recorded' then
  select name into matched_room from rooms where id=inv.room_id;
  perform enqueue_server_email('sepay_unmatched',tx_key,jsonb_build_object('transactionKey',coalesce(ref,tx_id),'amount',amount,
   'content',content,'roomName',matched_room,'reviewStatus',state,'invoiceId',inv.id));
 end if;
 return jsonb_build_object('status',state,'invoiceId',inv.id);
end $$;
revoke all on function public.process_server_sepay(jsonb) from public,anon,authenticated;
grant execute on function public.process_server_sepay(jsonb) to service_role;

notify pgrst,'reload schema';
commit;
