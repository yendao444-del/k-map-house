begin;
set local search_path=public,pg_temp;
-- Only explicitly designated contracts are tests. A room name or client flag cannot grant an exception.
create table if not exists public.contract_test_designations (
 contract_id text primary key references public.contracts(id), room_id text not null references public.rooms(id),
 tenant_id text not null references public.tenants(id), designated_at timestamptz not null default now(), reason text not null
);
alter table public.contract_test_designations enable row level security;
revoke all on public.contract_test_designations from public,anon,authenticated;
grant all on public.contract_test_designations to service_role;
-- The owner explicitly identified this existing lease in room 999 as their test lease.
-- This does not mark any future lease in the room as a test.
insert into public.contract_test_designations(contract_id,room_id,tenant_id,reason)
 select id,room_id,tenant_id,'Chủ nhà xác định hợp đồng phòng 999 là thử nghiệm, ngày 08/10/2026'
 from public.contracts where id='contract_66753eca-d4f6-4e5d-8ab0-913dc588570e'
 and room_id='room-1791197579415-sgwfup89' and tenant_name='Đỗ Kim Ngân' and status='active'
 on conflict do nothing;
create or replace function public.contract_cancellation_check(p_contract text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts; r rooms; ic integer; rc integer; cc integer; uc integer; explanation text; registered_test boolean;
begin
 select * into c from contracts where id=p_contract;
 if c.id is null then raise exception 'Không tìm thấy hợp đồng.'; end if;
 select * into r from rooms where id=c.room_id;
 registered_test:=exists(select 1 from contract_test_designations where contract_id=c.id and room_id=c.room_id and tenant_id=c.tenant_id);
 select count(*) into ic from invoices where room_id=c.room_id and tenant_id=c.tenant_id and
  (payment_status not in ('cancelled','merged') or coalesce(paid_amount,0)>0 or coalesce(deposit_applied,0)>0 or coalesce(payment_records,'[]'::jsonb)<>'[]'::jsonb or payment_date is not null or coalesce(electric_usage,0)>0 or coalesce(water_usage,0)>0);
 select count(*) into rc from move_in_receipts where room_id=c.room_id and tenant_id=c.tenant_id and (payment_status<>'cancelled' or payment_date is not null);
 select count(*) into cc from cash_transactions where room_id=c.room_id and transaction_date>=c.move_in_date and amount<>0;
 select count(*) into uc from contract_usage_evidence where contract_id=c.id;
 uc:=uc+(select count(*) from asset_snapshots where contract_id=c.id or contract_id is null and room_id=c.room_id and tenant_id=c.tenant_id and recorded_at>=c.created_at)
  +(select count(*) from payment_events p join invoices i on i.id=p.invoice_id where i.room_id=c.room_id and i.tenant_id=c.tenant_id and p.amount<>0);
 explanation:=case when c.status<>'active' then 'Hợp đồng không còn hiệu lực.'
  when c.original_confirmed_at is null then 'Không có mốc xác nhận đầu tiên. Dùng Trả phòng / chấm dứt hợp đồng.'
  when not registered_test and (now()<c.original_confirmed_at or now()>=c.original_confirmed_at+interval '24 hours') then 'Đã hết hạn hủy do lập nhầm (24 giờ từ lần xác nhận đầu tiên). Dùng Trả phòng / chấm dứt hợp đồng.'
  when ic+rc+cc>0 or coalesce(c.deposit_pre_collected,false) or coalesce(c.migration_debt,0)<>0 or coalesce(r.old_debt,0)<>0 then 'Đã có hóa đơn, công nợ, tiền cọc hoặc lịch sử thanh toán. Dùng Trả phòng / chấm dứt hợp đồng.'
  when uc>0 or c.transfer_history is not null or coalesce(r.has_move_in_receipt,false) or r.electric_new is distinct from c.electric_init or r.water_new is distinct from c.water_init then 'Đã có bàn giao, sử dụng điện nước, chuyển phòng hoặc lịch sử nghiệp vụ. Dùng Trả phòng / chấm dứt hợp đồng.'
  else null end;
 return jsonb_build_object('allowed',explanation is null,'reason',coalesce(explanation,case when registered_test then 'Hợp đồng đã được đánh dấu thử nghiệm. Có thể hủy test khi chưa có tài chính hoặc bàn giao; giữ toàn bộ lịch sử.' else 'Đủ điều kiện kiểm tra hủy do lập nhầm. Chọn lý do và hồ sơ đối chiếu; backend kiểm tra lại khi hủy.' end),
  'isTestContract',registered_test,'status',c.status,'invoices',ic,'receipts',rc,'cashTransactions',cc,'usageEvidence',uc,'confirmedAt',c.original_confirmed_at,'deadline',c.original_confirmed_at+interval '24 hours',
  'notice',(select to_jsonb(n)-'attempt_id' from contract_cancellation_notices n where n.contract_id=c.id));
end $$;

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
 if p_kind='test_reset' then
  if not exists(select 1 from contract_test_designations where contract_id=c.id and room_id=c.room_id and tenant_id=c.tenant_id) then raise exception 'Hợp đồng chưa được đánh dấu thử nghiệm ở backend.'; end if;
  target_label:=c.id; explanation:='Kết thúc hợp đồng thử nghiệm: ';
 elsif p_kind='wrong_tenant' then
  select full_name into target_label from tenants where id=p_reference and id<>c.tenant_id and is_active;
  explanation:='Chọn nhầm khách; hồ sơ đúng: ';
 elsif p_kind='wrong_room' then
  select name into target_label from rooms where id=p_reference and id<>c.room_id;
  explanation:='Chọn nhầm phòng; phòng đúng: ';
 elsif p_kind='duplicate' then
  select * into retained from contracts where id=p_reference and id<>c.id and status='active' and room_id=c.room_id and tenant_id=c.tenant_id;
  if retained.id is not null and contract_term_values(to_jsonb(retained))-'revision_no' is not distinct from contract_term_values(to_jsonb(c))-'revision_no' then target_label:=retained.id; end if;
  explanation:='Lập trùng; giữ hợp đồng: ';
 else raise exception 'Chọn lý do hủy hợp lệ.'; end if;
 if target_label is null then raise exception 'Hồ sơ đối chiếu không hợp lệ hoặc không khớp lý do hủy.'; end if;
 select cc.recipient_email into email from contract_confirmations cc join contract_drafts d on d.id=cc.draft_id
  where cc.contract_id=c.id and cc.confirmed_at is not null and d.parent_contract_id is null order by cc.confirmed_at limit 1;
 if p_kind<>'test_reset' and (email is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Không có email nhận thông báo từ hợp đồng đã xác nhận.'; end if;
 -- The internal operation still rechecks the policy in the same transaction.
 perform set_config('app.contract_revision_write','1',true);
 update contracts set cancellation_kind=p_kind,cancellation_reference=case when p_kind='test_reset' then c.id else p_reference end where id=c.id;
 result:=contract_cancel_internal(c.id,p_actor,left(explanation||target_label||'. '||btrim(p_reason),1000));
 if p_kind<>'test_reset' then
  insert into contract_cancellation_notices(contract_id,recipient,tenant_name,room_name,reason,cancelled_at)
   select c.id,email,c.tenant_name,r.name,case p_kind when 'wrong_tenant' then 'Chọn nhầm hồ sơ khách thuê. ' when 'wrong_room' then 'Chọn nhầm phòng. ' else 'Lập trùng hợp đồng. ' end||btrim(p_reason),x.cancelled_at from contracts x join rooms r on r.id=x.room_id where x.id=c.id on conflict do nothing;
 end if;
 return result;
end $$;

notify pgrst,'reload schema';
commit;
