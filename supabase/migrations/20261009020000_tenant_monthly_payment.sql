begin;

-- Browser tenants have no direct table/RPC access. The authenticated gateway
-- derives p_user/p_contract from its server session; all writes are atomic.
alter table public.invoices add column if not exists web_contract_id text;
create index if not exists invoices_web_contract on public.invoices(web_contract_id);
create table if not exists public.tenant_payment_cycles (
 id uuid primary key default gen_random_uuid(), contract_id text not null references public.contracts(id),
 tenant_id text not null references public.tenants(id), room_id text not null references public.rooms(id),
 period date not null, opened_on date not null, period_start date not null, period_end date not null,
 revision integer not null, electric_old integer not null, water_old integer not null,
 electric_price integer not null check(electric_price>=0), water_price integer not null check(water_price>=0),
 room_cost integer not null check(room_cost>=0), wifi_cost integer not null check(wifi_cost>=0),
 garbage_cost integer not null check(garbage_cost>=0), elapsed_days integer not null check(elapsed_days>0),
 electric_new integer, water_new integer, electric_source text, water_source text,
 invoice_id text references public.invoices(id), created_at timestamptz not null default now(),
 unique(contract_id,period)
);
create table if not exists public.tenant_meter_photos (
 token uuid primary key default gen_random_uuid(), cycle_id uuid not null references public.tenant_payment_cycles(id),
 user_id uuid not null, meter text not null check(meter in ('electric','water')), reading integer not null,
 image text not null check(length(image)<=4000000), expires_at timestamptz not null default now()+interval '10 minutes',
 confirmed_at timestamptz, corrected_reading integer, source text,
 created_at timestamptz not null default now()
);
create table if not exists public.tenant_payment_emails (
 id uuid primary key default gen_random_uuid(), cycle_id uuid not null references public.tenant_payment_cycles(id),
 kind text not null check(kind in ('readings','invoice','receipt')), recipient text not null,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed','skipped')),
 attempts integer not null default 0, lease uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
 provider_id text, sent_at timestamptz, error text, created_at timestamptz not null default now(), unique(cycle_id,kind)
);
alter table public.tenant_payment_cycles enable row level security;
alter table public.tenant_meter_photos enable row level security;
alter table public.tenant_payment_emails enable row level security;
revoke all on public.tenant_payment_cycles,public.tenant_meter_photos,public.tenant_payment_emails from public,anon,authenticated;
grant all on public.tenant_payment_cycles,public.tenant_meter_photos,public.tenant_payment_emails to service_role;

create or replace function public.tenant_payment_scope(p_user uuid,p_contract text)
returns public.contracts language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Không có quyền truy cập.' using errcode='42501';end if;
 select ctr.* into c from contracts ctr join tenants t on t.id=ctr.tenant_id
 join tenant_web_accounts a on a.tenant_id=t.id
 where ctr.id=p_contract and ctr.status='active' and t.is_active and a.status='active' and a.auth_user_id=p_user;
 if not found then raise exception 'Hợp đồng hoặc tài khoản không còn hoạt động.';end if;
 return c;
end $$;

create or replace function public.ensure_tenant_payment_cycle(p_user uuid,p_contract text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts%rowtype; r rooms%rowtype; z service_zones%rowtype; v invoices%rowtype;
 cy tenant_payment_cycles%rowtype; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
 m date:=date_trunc('month',today)::date; due date; old_e int; old_w int; days int; linked text; enrolled date;
begin
 c:=tenant_payment_scope(p_user,p_contract);
 perform pg_advisory_xact_lock(20261005,120000);
 perform pg_advisory_xact_lock(hashtext('tenant-cycle:'||c.id));
 select * into c from contracts where id=c.id for update;
 select * into r from rooms where id=c.room_id for update;
 if r.status<>'occupied' then return null;end if;
 -- No invented charges for non-monthly or unsettled room transfers.
 if coalesce(c.billing_cycle,1)<>1 or (c.transfer_history is not null and nullif(c.transfer_history->>'history_billed_in_invoice_id','') is null) then return null;end if;
 select * into z from service_zones where id=r.service_zone_id;
 if not found or z.electric_price is null or z.water_price is null then return null;end if;
 select (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date into enrolled from tenant_web_accounts a where a.auth_user_id=p_user;
 due:=m+least(greatest(coalesce(c.invoice_day,5),1),extract(day from m+interval '1 month' - interval '1 day')::int)-1;
 -- Opening is automatic only when the agreed invoice day has arrived.
 if today<due or c.move_in_date>due or enrolled>today then return null;end if;
 select * into cy from tenant_payment_cycles where contract_id=c.id and invoice_id is null order by period limit 1;
 if found then return cy.id;end if;
 select * into cy from tenant_payment_cycles where contract_id=c.id and period=m;
 if found then return cy.id;end if;
 select * into v from invoices i where i.room_id=c.room_id and i.tenant_id=c.tenant_id
 and (i.web_contract_id=c.id or (i.web_contract_id is null and i.created_at>=c.created_at))
 and i.payment_status not in ('cancelled','merged') and i.month=extract(month from m) and i.year=extract(year from m)
 and (i.billing_reason in ('monthly','first_month','room_cycle') or i.is_first_month)
 order by i.created_at desc limit 1;
 linked:=v.id;
 if linked is not null then old_e:=coalesce(v.electric_old,c.electric_init);old_w:=coalesce(v.water_old,c.water_init);
 else
  select * into v from invoices i where i.room_id=c.room_id and i.tenant_id=c.tenant_id
   and (i.web_contract_id=c.id or (i.web_contract_id is null and i.created_at>=c.created_at))
   and i.payment_status not in ('cancelled','merged') and coalesce(i.billing_period_end,i.invoice_date,make_date(i.year,i.month,1))<m
   and i.billing_reason in ('monthly','first_month','contract_end') order by coalesce(i.billing_period_end,i.invoice_date) desc,i.created_at desc limit 1;
  old_e:=coalesce(v.electric_new,c.electric_init);old_w:=coalesce(v.water_new,c.water_init);
 end if;
 if old_e is null or old_w is null or old_e<0 or old_w<0 then return null;end if;
 -- First-month deposits/proration remain in the existing initial invoice.
 -- A new tenant does not receive a full-month monthly invoice in move-in month.
 if linked is null and date_trunc('month',c.move_in_date)::date=m and not coalesce(c.is_migration,false) then return null;end if;
 days:=greatest(1,due-coalesce(v.billing_period_end,c.move_in_date));
 insert into tenant_payment_cycles(contract_id,tenant_id,room_id,period,opened_on,period_start,period_end,revision,
 electric_old,water_old,electric_price,water_price,room_cost,wifi_cost,garbage_cost,elapsed_days,invoice_id)
 values(c.id,c.tenant_id,c.room_id,m,due,m,(m+interval '1 month' - interval '1 day')::date,coalesce(c.revision_no,1),
 old_e,old_w,z.electric_price,z.water_price,c.base_rent,coalesce(z.internet_price,0),coalesce(z.cleaning_price,0),days,linked)
 returning id into cy.id;
 return cy.id;
end $$;

create or replace function public.tenant_payment_state(p_user uuid,p_contract text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts%rowtype; current_id uuid; cy tenant_payment_cycles%rowtype; history jsonb; bills jsonb; bank jsonb; notices jsonb;
begin
 c:=tenant_payment_scope(p_user,p_contract); current_id:=ensure_tenant_payment_cycle(p_user,p_contract);
 select * into cy from tenant_payment_cycles where contract_id=c.id and invoice_id is null order by period limit 1;
 if cy.id is null then select * into cy from tenant_payment_cycles where id=current_id;end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.year desc,q.month desc,q.created_at desc),'[]') into bills from (
 select i.* from invoices i where i.room_id=c.room_id and i.tenant_id=c.tenant_id
  and (i.web_contract_id=c.id or (i.web_contract_id is null and i.created_at>=c.created_at))
  and i.payment_status not in ('cancelled','merged') order by i.year desc,i.month desc,i.created_at desc limit 60) q;
 -- Expose invoice business fields only; internal payment notes/actor IDs stay private.
 bills:=(select coalesce(jsonb_agg(value-'payment_records'-'note'-'damage_note'-'debt_confirmed_by'), '[]') from jsonb_array_elements(bills));
 select jsonb_build_object('name',bank_id,'account',account_no,'owner',case when upper(account_name)='DO KIM NGAN' then 'Đỗ Kim Ngân' else account_name end) into bank from app_settings limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('invoiceId',s.invoice_id,'status',s.status,'amount',s.amount)),'[]') into notices
  from sepay_server_transactions s where s.invoice_id in (select value->>'id' from jsonb_array_elements(bills)) and s.status in ('partial','over','ambiguous');
 return jsonb_build_object('cycle',case when cy.id is null then null else to_jsonb(cy) end,'invoices',bills,'bank',bank,'notices',notices,
 'blockedReason',case when coalesce(c.billing_cycle,1)<>1 then 'Hợp đồng có chu kỳ thu tiền nhiều tháng. Chủ nhà cần lập hóa đơn theo chu kỳ đã thỏa thuận.'
 when c.transfer_history is not null and nullif(c.transfer_history->>'history_billed_in_invoice_id','') is null then 'Có kỳ chuyển phòng chưa quyết toán. Chủ nhà cần kiểm tra trước khi mở ghi số.'
 when cy.invoice_id is not null and exists(select 1 from invoices where id=cy.invoice_id and payment_status in ('cancelled','merged')) then 'Hóa đơn kỳ này đã được hủy hoặc gộp. Chủ nhà cần kiểm tra trước khi lập lại.'
 when cy.id is null and date_trunc('month',c.move_in_date)=date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh') and not coalesce(c.is_migration,false) then 'Hóa đơn tháng đầu và tiền cọc cần được lập theo bàn giao trong phần mềm. Ghi số điện nước hằng tháng bắt đầu từ kỳ tiếp theo.'
 else null end,
 'nextDate',case when (now() at time zone 'Asia/Ho_Chi_Minh')::date < date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date+coalesce(c.invoice_day,5)-1
  then date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')::date+coalesce(c.invoice_day,5)-1 else (date_trunc('month',now() at time zone 'Asia/Ho_Chi_Minh')+interval '1 month')::date+coalesce(c.invoice_day,5)-1 end);
end $$;

create or replace function public.tenant_payment_write(p_user uuid,p_contract text,p_cycle uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts%rowtype; cy tenant_payment_cycles%rowtype; ph tenant_meter_photos%rowtype; token uuid;
 n int; old_n int; v_meter text:=p_data->>'meter'; src text; inv invoices%rowtype; total bigint; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
 c:=tenant_payment_scope(p_user,p_contract);
 perform pg_advisory_xact_lock(20261005,120000);
 select * into c from contracts where id=c.id for update;
 select * into cy from tenant_payment_cycles where id=p_cycle and contract_id=c.id for update;
 if not found then raise exception 'Kỳ thanh toán không thuộc tài khoản này.';end if;
 if cy.invoice_id is not null then return jsonb_build_object('invoiceId',cy.invoice_id);end if;
 if cy.revision<>coalesce(c.revision_no,1) then raise exception 'Hợp đồng đã thay đổi. Chủ nhà cần kiểm tra kỳ thanh toán.';end if;
 if not exists(select 1 from rooms where id=c.room_id and status='occupied') then raise exception 'Phòng không còn trong trạng thái đang thuê.';end if;
 if p_action in ('photo','confirm') then
  if v_meter not in ('electric','water') or v_meter is null then raise exception 'Loại công tơ không hợp lệ.';end if;
  n:=(p_data->>'reading')::integer;old_n:=case when v_meter='electric' then cy.electric_old else cy.water_old end;
  if n is null or n<old_n or n>99999999 or n-old_n>cy.elapsed_days*(case when v_meter='electric' then 40 else 2 end) then raise exception 'Chỉ số tăng bất thường hoặc thấp hơn số cũ. Cần chụp lại và kiểm tra.';end if;
  if p_action='photo' then
   insert into tenant_meter_photos(cycle_id,user_id,meter,reading,image) values(cy.id,p_user,v_meter,n,p_data->>'image') returning tenant_meter_photos.token into token;
   return jsonb_build_object('reviewToken',token);
  end if;
  select * into ph from tenant_meter_photos where tenant_meter_photos.token=(p_data->>'reviewToken')::uuid and cycle_id=cy.id and user_id=p_user and tenant_meter_photos.meter=v_meter for update;
  if not found or ph.expires_at<now() then raise exception 'Ảnh đã hết hạn hoặc chưa được kiểm tra. Hãy chụp lại.';end if;
  src:=case when n=ph.reading then 'ai-ocr' else 'manual' end;
  update tenant_meter_photos set confirmed_at=now(),corrected_reading=n,source=src where tenant_meter_photos.token=ph.token;
  if v_meter='electric' then update tenant_payment_cycles set electric_new=n,electric_source=src where id=cy.id;
  else update tenant_payment_cycles set water_new=n,water_source=src where id=cy.id;end if;
  return jsonb_build_object('source',src,'confirmationToken',ph.token);
 end if;
 if p_action<>'create' then raise exception 'Thao tác không hợp lệ.';end if;
 if cy.electric_new is null or cy.water_new is null then raise exception 'Cần xác nhận cả điện và nước trước khi lập hóa đơn.';end if;
 -- Recheck against Electron invoices and reading changes under the same lock.
 select * into inv from invoices i where i.room_id=c.room_id and i.tenant_id=c.tenant_id
 and (i.web_contract_id=c.id or (i.web_contract_id is null and i.created_at>=c.created_at))
 and i.month=extract(month from cy.period) and i.year=extract(year from cy.period)
 and i.payment_status not in ('cancelled','merged') and (i.billing_reason in ('monthly','first_month','room_cycle') or i.is_first_month) order by i.created_at desc limit 1;
 if inv.id is not null then update tenant_payment_cycles set invoice_id=inv.id where id=cy.id;return jsonb_build_object('invoiceId',inv.id);end if;
 if exists(select 1 from invoices i where i.room_id=c.room_id and i.tenant_id=c.tenant_id
  and (i.web_contract_id=c.id or (i.web_contract_id is null and i.created_at>=c.created_at))
  and i.payment_status not in ('cancelled','merged') and i.billing_reason='monthly'
  and coalesce(i.billing_period_end,i.invoice_date)>=cy.period_start) then raise exception 'Đã có hóa đơn với kỳ ghi số chồng lấn. Chủ nhà cần kiểm tra.';end if;
 select * into inv from invoices i where i.room_id=c.room_id and i.tenant_id=c.tenant_id
 and (i.web_contract_id=c.id or (i.web_contract_id is null and i.created_at>=c.created_at)) and i.payment_status not in ('cancelled','merged')
 and i.billing_reason in ('monthly','first_month','contract_end') and coalesce(i.billing_period_end,i.invoice_date)<cy.period
 order by coalesce(i.billing_period_end,i.invoice_date) desc,i.created_at desc limit 1;
 if coalesce(inv.electric_new,c.electric_init)<>cy.electric_old or coalesce(inv.water_new,c.water_init)<>cy.water_old then raise exception 'Chỉ số kỳ trước đã thay đổi. Chủ nhà cần kiểm tra trước khi lập hóa đơn.';end if;
 total:=cy.room_cost::bigint+cy.wifi_cost+cy.garbage_cost+(cy.electric_new-cy.electric_old)::bigint*cy.electric_price+(cy.water_new-cy.water_old)::bigint*cy.water_price;
 if total<0 or total>2147483647 then raise exception 'Tổng tiền vượt giới hạn hóa đơn.';end if;
 inv.id:='inv-web-'||replace(gen_random_uuid()::text,'-','');
 insert into invoices(id,room_id,tenant_id,web_contract_id,billing_reason,month,year,invoice_date,due_date,billing_period_start,billing_period_end,
 electric_old,electric_new,electric_usage,electric_cost,electric_price_snapshot,water_old,water_new,water_usage,water_cost,water_price_snapshot,
 room_cost,wifi_cost,garbage_cost,old_debt,total_amount,paid_amount,payment_status,payment_method,payment_records,is_first_month,is_settlement)
 values(inv.id,cy.room_id,cy.tenant_id,c.id,'monthly',extract(month from cy.period),extract(year from cy.period),today,today+5,cy.period_start,cy.period_end,
 cy.electric_old,cy.electric_new,cy.electric_new-cy.electric_old,(cy.electric_new-cy.electric_old)*cy.electric_price,cy.electric_price,
 cy.water_old,cy.water_new,cy.water_new-cy.water_old,(cy.water_new-cy.water_old)*cy.water_price,cy.water_price,
 cy.room_cost,cy.wifi_cost,cy.garbage_cost,0,total,0,case when total=0 then 'paid' else 'unpaid' end,'transfer','[]',false,false);
 update tenant_payment_cycles set invoice_id=inv.id where id=cy.id;
 -- Existing invoice/payment ledger is reused. Tenant cannot mark it paid.
 return jsonb_build_object('invoiceId',inv.id);
end $$;

create or replace function public.queue_tenant_payment_emails()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; cy tenant_payment_cycles%rowtype; cid uuid; kind text; n int:=0; added int;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service only';end if;
 if not exists(select 1 from email_automation_settings where enabled) then return 0;end if;
 for a in select ac.auth_user_id,ac.email,c.id from tenant_web_accounts ac join contracts c on c.tenant_id=ac.tenant_id
  join tenants t on t.id=c.tenant_id where ac.status='active' and c.status='active' and t.is_active loop
  cid:=ensure_tenant_payment_cycle(a.auth_user_id,a.id);
  for cy in select * from tenant_payment_cycles where contract_id=a.id loop
   kind:=case when cy.invoice_id is null then 'readings' when exists(select 1 from invoices where id=cy.invoice_id and payment_status='paid') then 'receipt' else 'invoice' end;
   insert into tenant_payment_emails(cycle_id,kind,recipient) values(cy.id,kind,a.email) on conflict do nothing;
   get diagnostics added=row_count;n:=n+added;
  end loop;
 end loop;
 -- Keep confirmed photo evidence for the tenancy; discard failed/expired previews.
 delete from tenant_meter_photos where confirmed_at is null and expires_at<now()-interval '1 day';
 return n;
end $$;

create or replace function public.claim_tenant_payment_emails()
returns setof public.tenant_payment_emails language plpgsql security definer set search_path=public,pg_temp as $$
declare daily int; remaining int; n int; today date:=(now() at time zone 'UTC')::date;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service only';end if;
 select daily_limit into daily from email_automation_settings where enabled for update;
 if not found then return;end if;
 insert into email_send_budget(day,reservations) values(today,0) on conflict do nothing;
 select greatest(0,daily-reservations) into remaining from email_send_budget where day=today for update;
 return query with picked as (select id from tenant_payment_emails where
  ((status in ('queued','failed') and next_attempt_at<=now()) or (status='sending' and lease_until<now())) and attempts<5
  order by created_at for update skip locked limit least(remaining,10))
 update tenant_payment_emails e set status='sending',attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '5 minutes'
 from picked p where e.id=p.id returning e.*;
 get diagnostics n=row_count;update email_send_budget set reservations=reservations+n where day=today;
end $$;

create or replace function public.finish_tenant_payment_email(p_id uuid,p_lease uuid,p_status text,p_provider text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n int;
begin
 if coalesce(auth.role(),'')<>'service_role' or p_status not in ('sent','failed','skipped') then raise exception 'Không có quyền cập nhật thư.';end if;
 update tenant_payment_emails set status=p_status,provider_id=p_provider,sent_at=case when p_status='sent' then now() else sent_at end,
 error=case when p_status='failed' then 'Chưa hoàn tất gửi email.' else null end,
 next_attempt_at=case when p_status='failed' and attempts<5 then now()+interval '2 minutes'*power(2,attempts-1) else 'infinity'::timestamptz end,
 lease=null,lease_until=null where id=p_id and lease=p_lease and status='sending';
 get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.finish_tenant_payment_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_tenant_payment_email(uuid,uuid,text,text) to service_role;

-- Electron and the web take the same lock before inserting a cycle's invoice.
-- This prevents an admin/tenant race from charging the same period twice.
create or replace function public.guard_tenant_cycle_invoice()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts%rowtype;
begin
 if coalesce(new.billing_reason,'') not in ('monthly','first_month','room_cycle') and not coalesce(new.is_first_month,false) then return new;end if;
 perform pg_advisory_xact_lock(20261005,120000);
 select * into c from contracts where room_id=new.room_id and tenant_id=new.tenant_id and status='active' order by created_at desc limit 1;
 if c.id is null or not exists(select 1 from tenant_payment_cycles where contract_id=c.id and extract(month from period)=new.month and extract(year from period)=new.year) then return new;end if;
 if exists(select 1 from invoices i where i.room_id=new.room_id and i.tenant_id=new.tenant_id
  and (i.web_contract_id=c.id or (i.web_contract_id is null and i.created_at>=c.created_at))
  and i.month=new.month and i.year=new.year and i.payment_status not in ('cancelled','merged')
  and (i.billing_reason in ('monthly','first_month','room_cycle') or i.is_first_month)) then raise exception 'Kỳ này đã có hóa đơn cho hợp đồng hiện tại.';end if;
 new.web_contract_id:=c.id;return new;
end $$;
revoke all on function public.guard_tenant_cycle_invoice() from public,anon,authenticated;
drop trigger if exists guard_tenant_cycle_invoice on public.invoices;
create trigger guard_tenant_cycle_invoice before insert on public.invoices for each row execute function public.guard_tenant_cycle_invoice();

create or replace function public.sync_tenant_paid_readings()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts%rowtype;
begin
 if new.payment_status='paid' and old.payment_status is distinct from 'paid' and new.web_contract_id is not null
 and new.billing_reason='monthly' and not coalesce(new.is_settlement,false) then
  select * into c from contracts where id=new.web_contract_id and status='active' and room_id=new.room_id and tenant_id=new.tenant_id;
  if c.id is not null then
   -- An older invoice paid later must never rewind the current meter.
   update rooms set electric_old=greatest(coalesce(electric_old,0),new.electric_new),electric_new=greatest(coalesce(electric_new,0),new.electric_new),
    water_old=greatest(coalesce(water_old,0),new.water_new),water_new=greatest(coalesce(water_new,0),new.water_new)
   where id=c.room_id and status='occupied';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.sync_tenant_paid_readings() from public,anon,authenticated;
drop trigger if exists sync_tenant_paid_readings on public.invoices;
create trigger sync_tenant_paid_readings after update of payment_status on public.invoices for each row execute function public.sync_tenant_paid_readings();

revoke all on function public.tenant_payment_scope(uuid,text),public.ensure_tenant_payment_cycle(uuid,text),public.tenant_payment_state(uuid,text),public.tenant_payment_write(uuid,text,uuid,text,jsonb),public.queue_tenant_payment_emails(),public.claim_tenant_payment_emails() from public,anon,authenticated;
grant execute on function public.tenant_payment_scope(uuid,text),public.ensure_tenant_payment_cycle(uuid,text),public.tenant_payment_state(uuid,text),public.tenant_payment_write(uuid,text,uuid,text,jsonb),public.queue_tenant_payment_emails(),public.claim_tenant_payment_emails() to service_role;
notify pgrst,'reload schema';
commit;

