begin;
set local search_path=public,pg_temp;
alter table public.contracts add column if not exists original_confirmed_at timestamptz,
 add column if not exists cancellation_kind text, add column if not exists cancellation_reference text;
select set_config('app.contract_original_confirmation','1',true);
update public.contracts c set original_confirmed_at=x.at from
 (select cc.contract_id,min(cc.confirmed_at) at from public.contract_confirmations cc
 join public.contract_drafts d on d.id=cc.draft_id where cc.confirmed_at is not null and d.parent_contract_id is null group by cc.contract_id) x
 where c.id=x.contract_id and c.original_confirmed_at is null;

create or replace function public.contract_original_confirmation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.confirmed_at is not null and new.contract_id is not null and
  exists(select 1 from contract_drafts where id=new.draft_id and parent_contract_id is null) then
  perform set_config('app.contract_original_confirmation','1',true);
  update contracts set original_confirmed_at=new.confirmed_at where id=new.contract_id and original_confirmed_at is null;
 end if;
 return new;
end $$;
drop trigger if exists contract_original_confirmation on public.contract_confirmations;
create trigger contract_original_confirmation after insert or update on public.contract_confirmations for each row execute function public.contract_original_confirmation();
create or replace function public.guard_contract_cancellation_metadata() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if old.status='cancelled' and new.status is distinct from old.status then raise exception 'Hợp đồng đã hủy không được khôi phục. Lập hợp đồng mới.'; end if;
 if new.original_confirmed_at is distinct from old.original_confirmed_at and
  (old.original_confirmed_at is not null or current_setting('app.contract_original_confirmation',true) is distinct from '1' or current_setting('role',true) in ('anon','authenticated')) then
  raise exception 'Không được thay đổi thời điểm xác nhận hợp đồng đầu tiên.';
 end if;
 if (new.cancelled_at,new.cancelled_by,new.cancellation_reason,new.cancellation_kind,new.cancellation_reference)
  is distinct from (old.cancelled_at,old.cancelled_by,old.cancellation_reason,old.cancellation_kind,old.cancellation_reference) and
  (old.status='cancelled' or current_setting('app.contract_revision_write',true) is distinct from '1' or current_setting('role',true) in ('anon','authenticated')) then
  raise exception 'Thông tin hủy chỉ được lưu bởi backend và không được ghi đè.';
 end if;
 return new;
end $$;
drop trigger if exists guard_contract_cancellation_metadata on public.contracts;
create trigger guard_contract_cancellation_metadata before update on public.contracts for each row execute function public.guard_contract_cancellation_metadata();

-- Durable evidence survives edits/deletes of the operational source row.
create table if not exists public.contract_usage_evidence (
 contract_id text not null references public.contracts(id), source_table text not null, source_id text not null,
 occurred_at timestamptz not null default now(), primary key(contract_id,source_table,source_id)
);
alter table public.contract_usage_evidence enable row level security;
revoke all on public.contract_usage_evidence from public,anon,authenticated;
grant all on public.contract_usage_evidence to service_role;
create or replace function public.contract_capture_usage() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb; cid text; room_key text; tenant_key text; used boolean;
begin
 for r in select value from jsonb_array_elements(case when tg_op='UPDATE' and tg_table_name<>'rooms' then jsonb_build_array(to_jsonb(old),to_jsonb(new)) when tg_op='DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(new)) end) loop
 room_key:=r->>'room_id'; tenant_key:=r->>'tenant_id';
 used:=case tg_table_name
  when 'invoices' then coalesce((r->>'paid_amount')::numeric,0)>0 or coalesce((r->>'deposit_applied')::numeric,0)>0 or coalesce(nullif(r->'payment_records','null'::jsonb),'[]'::jsonb)<>'[]'::jsonb or r->>'payment_date' is not null or coalesce((r->>'electric_usage')::numeric,0)>0 or coalesce((r->>'water_usage')::numeric,0)>0
  when 'move_in_receipts' then r->>'payment_status'='paid' or r->>'payment_date' is not null
  when 'cash_transactions' then coalesce((r->>'amount')::numeric,0)<>0
  when 'payment_events' then coalesce((r->>'amount')::numeric,0)<>0
  when 'asset_snapshots' then true
  when 'rooms' then (r->'electric_old',r->'electric_new',r->'water_old',r->'water_new') is distinct from (to_jsonb(old)->'electric_old',to_jsonb(old)->'electric_new',to_jsonb(old)->'water_old',to_jsonb(old)->'water_new')
  else true end;
 if tg_table_name='rooms' then room_key:=r->>'id'; end if;
 if tg_table_name='payment_events' then select room_id,tenant_id into room_key,tenant_key from invoices where id=r->>'invoice_id'; end if;
 -- Reject stale operations that acquire a table lock after cancellation commits.
 if tg_op<>'DELETE' and (tg_op='INSERT' or used) and
  (exists(select 1 from contracts where id=r->>'contract_id' and status='cancelled') or
   tenant_key is not null and room_key is not null and not exists(select 1 from contracts where room_id=room_key and tenant_id=tenant_key and status='active') and
   (select status='cancelled' from contracts where room_id=room_key and tenant_id=tenant_key order by created_at desc,id desc limit 1)) then
  raise exception 'Hợp đồng đã hủy. Không được ghi thêm thanh toán, hóa đơn hoặc bàn giao cho hợp đồng này.';
 end if;
 if used then
  for cid in select c.id from contracts c where c.status='active' and c.original_confirmed_at is not null and
   (c.id=r->>'contract_id' or c.room_id=room_key and (tenant_key is null or c.tenant_id=tenant_key)) loop
   insert into contract_usage_evidence(contract_id,source_table,source_id) values(cid,tg_table_name,r->>'id') on conflict do nothing;
  end loop;
 end if;
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin
 foreach t in array array['invoices','move_in_receipts','cash_transactions','payment_events','asset_snapshots'] loop
  execute format('drop trigger if exists contract_capture_usage on %I',t);
  execute format('create trigger contract_capture_usage before insert or update or delete on %I for each row execute function contract_capture_usage()',t);
 end loop;
end $$;
drop trigger if exists contract_capture_usage on public.rooms;
create trigger contract_capture_usage before update on public.rooms for each row execute function public.contract_capture_usage();

create table if not exists public.contract_cancellation_notices (
 contract_id text primary key references public.contracts(id), recipient text not null, tenant_name text not null,
 room_name text not null, reason text not null, cancelled_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','uncertain')),
 attempt_id uuid, attempted_at timestamptz, sent_at timestamptz, message_id text, error text
);
alter table public.contract_cancellation_notices enable row level security;
revoke all on public.contract_cancellation_notices from public,anon,authenticated;
grant all on public.contract_cancellation_notices to service_role;

create or replace function public.contract_cancellation_check(p_contract text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts; r rooms; ic integer; rc integer; cc integer; uc integer; explanation text;
begin
 select * into c from contracts where id=p_contract;
 if c.id is null then raise exception 'Không tìm thấy hợp đồng.'; end if;
 select * into r from rooms where id=c.room_id;
 select count(*) into ic from invoices where room_id=c.room_id and tenant_id=c.tenant_id and
  (payment_status not in ('cancelled','merged') or coalesce(paid_amount,0)>0 or coalesce(deposit_applied,0)>0 or coalesce(payment_records,'[]'::jsonb)<>'[]'::jsonb or payment_date is not null or coalesce(electric_usage,0)>0 or coalesce(water_usage,0)>0);
 select count(*) into rc from move_in_receipts where room_id=c.room_id and tenant_id=c.tenant_id and (payment_status<>'cancelled' or payment_date is not null);
 select count(*) into cc from cash_transactions where room_id=c.room_id and transaction_date>=c.move_in_date and amount<>0;
 select count(*) into uc from contract_usage_evidence where contract_id=c.id;
 uc:=uc+(select count(*) from asset_snapshots where contract_id=c.id or contract_id is null and room_id=c.room_id and tenant_id=c.tenant_id and recorded_at>=c.created_at)
  +(select count(*) from payment_events p join invoices i on i.id=p.invoice_id where i.room_id=c.room_id and i.tenant_id=c.tenant_id and p.amount<>0);
 explanation:=case when c.status<>'active' then 'Hợp đồng không còn hiệu lực.'
  when c.original_confirmed_at is null then 'Không có mốc xác nhận đầu tiên. Dùng Trả phòng / chấm dứt hợp đồng.'
  when now()<c.original_confirmed_at or now()>=c.original_confirmed_at+interval '24 hours' then 'Đã hết hạn hủy do lập nhầm (24 giờ từ lần xác nhận đầu tiên). Dùng Trả phòng / chấm dứt hợp đồng.'
  when ic+rc+cc>0 or coalesce(c.deposit_pre_collected,false) or coalesce(c.migration_debt,0)<>0 or coalesce(r.old_debt,0)<>0 then 'Đã có hóa đơn, công nợ, tiền cọc hoặc lịch sử thanh toán. Dùng Trả phòng / chấm dứt hợp đồng.'
  when uc>0 or c.transfer_history is not null or coalesce(r.has_move_in_receipt,false) or r.electric_new is distinct from c.electric_init or r.water_new is distinct from c.water_init then 'Đã có bàn giao, sử dụng điện nước, chuyển phòng hoặc lịch sử nghiệp vụ. Dùng Trả phòng / chấm dứt hợp đồng.'
  else null end;
 return jsonb_build_object('allowed',explanation is null,'reason',coalesce(explanation,'Đủ điều kiện kiểm tra hủy do lập nhầm. Chọn lý do và hồ sơ đối chiếu; backend kiểm tra lại khi hủy.'),
  'status',c.status,'invoices',ic,'receipts',rc,'cashTransactions',cc,'usageEvidence',uc,'confirmedAt',c.original_confirmed_at,'deadline',c.original_confirmed_at+interval '24 hours',
  'notice',(select to_jsonb(n)-'attempt_id' from contract_cancellation_notices n where n.contract_id=c.id));
end $$;

-- Remove the old arbitrary-reason entry point from every API role.
do $$ begin if to_regprocedure('public.contract_cancel_internal(text,uuid,text)') is null then
 alter function public.contract_cancel(text,uuid,text) rename to contract_cancel_internal;
elsif to_regprocedure('public.contract_cancel(text,uuid,text)') is not null then
 drop function public.contract_cancel(text,uuid,text);
end if; end $$;
revoke all on function public.contract_cancel_internal(text,uuid,text) from public,anon,authenticated,service_role;
create or replace function public.contract_cancel(p_contract text,p_actor uuid,p_reason text,p_kind text,p_reference text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts; retained contracts; target_label text; explanation text; result jsonb; email text;
begin
 perform pg_advisory_xact_lock(hashtext('contract-lifecycle'));
 if not exists(select 1 from users where id=p_actor and role='admin' and status='active') then raise exception 'Chỉ admin được hủy hợp đồng.'; end if;
 lock table invoices,move_in_receipts,cash_transactions,payment_events,asset_snapshots in share row exclusive mode;
 select * into c from contracts where id=p_contract for update;
 if c.id is null then raise exception 'Không tìm thấy hợp đồng.'; end if;
 if c.status='cancelled' then return jsonb_build_object('cancelled',true,'contractId',c.id); end if;
 perform 1 from rooms where id=c.room_id for update;
 result:=contract_cancellation_check(c.id);
 if not (result->>'allowed')::boolean then raise exception '%',result->>'reason'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Nhập lý do hủy (5–1000 ký tự).'; end if;
 if p_kind='wrong_tenant' then
  select full_name into target_label from tenants where id=p_reference and id<>c.tenant_id and is_active;
  explanation:='Chọn nhầm khách; hồ sơ đúng: ';
 elsif p_kind='wrong_room' then
  select name into target_label from rooms where id=p_reference and id<>c.room_id;
  explanation:='Chọn nhầm phòng; phòng đúng: ';
 elsif p_kind='duplicate' then
  select * into retained from contracts where id=p_reference and id<>c.id and status='active' and room_id=c.room_id and tenant_id=c.tenant_id;
  if retained.id is not null and contract_term_values(to_jsonb(retained))-'revision_no' is not distinct from contract_term_values(to_jsonb(c))-'revision_no' then target_label:=retained.id; end if;
  explanation:='Lập trùng; giữ hợp đồng: ';
 else raise exception 'Chọn lý do hợp lệ: nhầm khách, nhầm phòng hoặc lập trùng.'; end if;
 if target_label is null then raise exception 'Hồ sơ đối chiếu không hợp lệ hoặc không khớp lý do hủy.'; end if;
 select cc.recipient_email into email from contract_confirmations cc join contract_drafts d on d.id=cc.draft_id
  where cc.contract_id=c.id and cc.confirmed_at is not null and d.parent_contract_id is null order by cc.confirmed_at limit 1;
 if email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Không có email nhận thông báo từ hợp đồng đã xác nhận.'; end if;
 -- The internal operation still rechecks the policy in the same transaction.
 perform set_config('app.contract_revision_write','1',true);
 update contracts set cancellation_kind=p_kind,cancellation_reference=p_reference where id=c.id;
 result:=contract_cancel_internal(c.id,p_actor,left(explanation||target_label||'. '||btrim(p_reason),1000));
 insert into contract_cancellation_notices(contract_id,recipient,tenant_name,room_name,reason,cancelled_at)
  select c.id,email,c.tenant_name,r.name,case p_kind when 'wrong_tenant' then 'Chọn nhầm hồ sơ khách thuê. ' when 'wrong_room' then 'Chọn nhầm phòng. ' else 'Lập trùng hợp đồng. ' end||btrim(p_reason),x.cancelled_at from contracts x join rooms r on r.id=x.room_id where x.id=c.id on conflict do nothing;
 return result;
end $$;

create or replace function public.contract_cancellation_notice(p_contract text,p_actor uuid,p_action text,p_attempt uuid default null,p_message text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare n contract_cancellation_notices;
begin
 if not exists(select 1 from users where id=p_actor and role='admin' and status='active') then raise exception 'Chỉ admin được xử lý thông báo hủy.'; end if;
 if p_action='list' then return coalesce((select jsonb_agg(contract_id order by cancelled_at) from contract_cancellation_notices where status='pending'),'[]'::jsonb); end if;
 select * into n from contract_cancellation_notices where contract_id=p_contract for update;
 if n.contract_id is null then raise exception 'Không có thông báo hủy hợp đồng.'; end if;
 if p_action='claim' then
  if n.status not in ('pending','failed') then return jsonb_build_object('claimed',false,'status',n.status); end if;
  update contract_cancellation_notices set status='sending',attempt_id=gen_random_uuid(),attempted_at=now(),error=null where contract_id=p_contract returning * into n;
  return to_jsonb(n)||jsonb_build_object('claimed',true);
 elsif p_action in ('sent','failed','uncertain') then
  if n.attempt_id is distinct from p_attempt then raise exception 'Lượt gửi thông báo không hợp lệ.'; end if;
  if n.status<>'sending' then return jsonb_build_object('status',n.status); end if;
  if p_action='sent' and length(coalesce(p_message,'')) not between 1 and 128 then raise exception 'Thiếu mã thư Gmail.'; end if;
  update contract_cancellation_notices set status=p_action,sent_at=case when p_action='sent' then now() end,message_id=left(p_message,128),error=left(p_error,1000) where contract_id=p_contract;
  insert into contract_lifecycle_events(contract_id,event_type,actor,reason) values(p_contract,'cancellation_email_'||p_action,p_actor,case when p_action='sent' then 'Gmail đã nhận thư gửi tới '||n.recipient else 'Gửi tới '||n.recipient||': '||coalesce(left(p_error,800),'Chưa xác định kết quả gửi') end);
 else raise exception 'Thao tác thông báo không hợp lệ.'; end if;
 return jsonb_build_object('status',p_action);
end $$;
alter table public.contract_lifecycle_events drop constraint if exists contract_lifecycle_events_event_type_check;
alter table public.contract_lifecycle_events add constraint contract_lifecycle_events_event_type_check check(event_type in ('amendment_created','amendment_applied','cancelled','cancellation_email_sent','cancellation_email_failed','cancellation_email_uncertain'));
revoke all on function public.contract_original_confirmation(),public.guard_contract_cancellation_metadata(),public.contract_capture_usage(),public.contract_cancel(text,uuid,text,text,text),public.contract_cancellation_notice(text,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.contract_cancel(text,uuid,text,text,text),public.contract_cancellation_notice(text,uuid,text,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
