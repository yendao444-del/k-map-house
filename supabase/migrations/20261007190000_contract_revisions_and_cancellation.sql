begin;
alter table public.contracts add column if not exists revision_no integer not null default 1,
 add column if not exists cancelled_at timestamptz, add column if not exists cancelled_by uuid references public.users(id),
 add column if not exists cancellation_reason text;
alter table public.contract_drafts add column if not exists parent_contract_id text references public.contracts(id),
 add column if not exists base_contract jsonb, add column if not exists before_snapshot jsonb;
create table if not exists public.contract_lifecycle_events (
 id uuid primary key default gen_random_uuid(), contract_id text not null references public.contracts(id),
 draft_id uuid references public.contract_drafts(id), event_type text not null check(event_type in ('amendment_created','amendment_applied','cancelled')),
 occurred_at timestamptz not null default now(), actor uuid not null references public.users(id), reason text not null,
 before_snapshot jsonb, after_snapshot jsonb
);
alter table public.contract_lifecycle_events add column if not exists cancelled_account_version integer;
alter table public.contract_lifecycle_events enable row level security;
revoke all on public.contract_lifecycle_events from public,anon,authenticated;
grant all on public.contract_lifecycle_events to service_role;
create index if not exists contract_lifecycle_contract_idx on public.contract_lifecycle_events(contract_id,occurred_at);
create index if not exists contract_drafts_parent_idx on public.contract_drafts(parent_contract_id);

create or replace function public.contract_term_values(p_row jsonb)
returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_object_agg(key,value) from jsonb_each(p_row) where key in ('room_id','tenant_id','tenant_name','tenant_phone','tenant_id_card',
 'tenant_id_card_issued_date','tenant_id_card_issued_place','tenant_address','base_rent','deposit_amount','move_in_date','duration_months',
 'expiration_date','invoice_day','occupant_count','billing_cycle','electric_init','water_init','notes','status','revision_no');
$$;

create or replace function public.guard_confirmed_contract_terms()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from contract_confirmations where contract_id=old.id and confirmed_at is not null) and
  (contract_term_values(to_jsonb(new))-'status') is distinct from (contract_term_values(to_jsonb(old))-'status') and
  (current_setting('app.contract_revision_write',true) is distinct from '1' or current_setting('role',true) in ('authenticated','anon')) then
  raise exception 'Hợp đồng đã xác nhận. Dùng Sửa hợp đồng để khách xác nhận bản mới.';
 end if;
 if new.status='cancelled' and old.status<>'cancelled' and (current_setting('app.contract_revision_write',true) is distinct from '1' or current_setting('role',true) in ('authenticated','anon')) then
  raise exception 'Dùng Hủy hợp đồng để kiểm tra hóa đơn, tài khoản và lưu lý do.';
 end if;
 return new;
end $$;
drop trigger if exists guard_confirmed_contract_terms on public.contracts;
create trigger guard_confirmed_contract_terms before update on public.contracts for each row execute function public.guard_confirmed_contract_terms();
revoke all on function public.guard_confirmed_contract_terms() from public,anon,authenticated;
create or replace function public.contract_form_values(p_row jsonb)
returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object('baseRent',p_row->'base_rent','depositAmount',p_row->'deposit_amount','moveInDate',p_row->'move_in_date',
 'durationMonths',coalesce(p_row->'duration_months','0'::jsonb),'invoiceDay',p_row->'invoice_day','occupantCount',coalesce(p_row->'occupant_count','1'::jsonb),
 'electricInitial',coalesce(p_row->'electric_init','0'::jsonb),'waterInitial',coalesce(p_row->'water_init','0'::jsonb),'readingEditReason','',
 'additionalTerms',coalesce(p_row->>'notes',''));
$$;

-- Preserve the existing initial-contract flow; wrappers add revision behavior.
do $$ begin
 if to_regprocedure('public.contract_confirmation_accept_initial(text)') is null then
  alter function public.contract_confirmation_accept(text) rename to contract_confirmation_accept_initial;
 end if;
 if to_regprocedure('public.contract_confirmation_view_initial(text)') is null then
  alter function public.contract_confirmation_view(text) rename to contract_confirmation_view_initial;
 end if;
 if to_regprocedure('public.contract_confirmation_create_initial(uuid,integer,text,uuid,text)') is null then
  alter function public.contract_confirmation_create(uuid,integer,text,uuid,text) rename to contract_confirmation_create_initial;
 end if;
end $$;

create or replace function public.guard_contract_draft()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare target_status text; tenant_active boolean; c public.contracts;
begin
 if tg_op='UPDATE' then
  if old.status<>'draft' then raise exception 'Bản nháp đã đóng, không thể thay đổi.'; end if;
  if new.revision<>old.revision+1 then raise exception 'Phiên bản bản nháp không hợp lệ.'; end if;
  if new.parent_contract_id is distinct from old.parent_contract_id or new.base_contract is distinct from old.base_contract or new.before_snapshot is distinct from old.before_snapshot then raise exception 'Không được thay bản gốc của hợp đồng.'; end if;
  new.created_by:=old.created_by; new.created_at:=old.created_at;
 elsif new.parent_contract_id is not null and (current_setting('app.contract_revision_write',true) is distinct from '1' or current_user in ('authenticated','anon')) then
  raise exception 'Tạo bản sửa từ chức năng Sửa hợp đồng.';
 end if;
 if new.status='draft' then
  if new.parent_contract_id is null then
   select status into target_status from public.rooms where id=new.room_id;
   if target_status is distinct from 'vacant' then raise exception 'Phòng không còn trống. Hãy chọn lại phòng.'; end if;
   if exists(select 1 from public.contracts where status='active' and (room_id=new.room_id or tenant_id=new.tenant_id)) then raise exception 'Phòng hoặc khách thuê đang có hợp đồng hiệu lực.'; end if;
  else
   select * into c from public.contracts where id=new.parent_contract_id;
   if c.id is null or c.status<>'active' or c.room_id<>new.room_id or c.tenant_id<>new.tenant_id or public.contract_term_values(to_jsonb(c)) is distinct from new.base_contract then raise exception 'Hợp đồng gốc đã thay đổi hoặc không còn hiệu lực. Hủy bản sửa và tạo lại.'; end if;
   if new.recipient_email is distinct from new.before_snapshot#>>'{tenant,email}' or
    (new.snapshot-'form'-'amendment') is distinct from (new.before_snapshot-'form'-'amendment') or
    new.snapshot#>'{amendment,previousForm}' is distinct from new.before_snapshot->'form' or
    new.snapshot#>>'{amendment,contractId}' is distinct from new.parent_contract_id then raise exception 'Không đổi khách, phòng hoặc nội dung bàn giao trong bản sửa. Hủy và lập lại nếu chọn nhầm.'; end if;
   if length(btrim(coalesce(new.snapshot#>>'{amendment,reason}','')))<5 or length(new.snapshot#>>'{amendment,reason}')>1000 then raise exception 'Nhập lý do sửa hợp đồng (5–1000 ký tự).'; end if;
   if new.snapshot#>'{form,electricInitial}' is distinct from new.before_snapshot#>'{form,electricInitial}' or new.snapshot#>'{form,waterInitial}' is distinct from new.before_snapshot#>'{form,waterInitial}' then raise exception 'Giữ nguyên chỉ số bàn giao. Điều chỉnh chỉ số qua nghiệp vụ điện nước.'; end if;
   if new.snapshot#>>'{form,moveInDate}' is distinct from new.before_snapshot#>>'{form,moveInDate}' and exists(select 1 from public.invoices where room_id=c.room_id and tenant_id=c.tenant_id) then raise exception 'Đã có hóa đơn, không đổi ngày vào qua bản sửa hợp đồng.'; end if;
  end if;
  select is_active into tenant_active from public.tenants where id=new.tenant_id;
  if tenant_active is distinct from true then raise exception 'Hồ sơ khách thuê đã ngừng hoạt động.'; end if;
  if new.snapshot#>'{settings,sepay_api_token}' is not null or new.snapshot#>'{tenant,identity_image_url}' is not null then raise exception 'Bản nháp không được chứa token dịch vụ hoặc ảnh giấy tờ.'; end if;
 end if;
 new.updated_at:=clock_timestamp(); return new;
end $$;

create or replace function public.contract_amendment_start(p_contract text,p_actor uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts; r rooms; t tenants; z service_zones; d contract_drafts; s jsonb; f jsonb; settings jsonb;
begin
 perform pg_advisory_xact_lock(hashtext('contract-lifecycle'));
 if not exists(select 1 from users where id=p_actor and role='admin' and status='active') then raise exception 'Chỉ admin được sửa hợp đồng.'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Nhập lý do sửa (5–1000 ký tự).'; end if;
 select * into c from contracts where id=p_contract for update;
 if c.id is null or c.status<>'active' then raise exception 'Chỉ sửa hợp đồng đang hiệu lực.'; end if;
 select * into r from rooms where id=c.room_id;
 select * into t from tenants where id=c.tenant_id;
 if t.id is null or not t.is_active or coalesce(t.email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Bổ sung email hợp lệ trong hồ sơ khách thuê trước khi sửa.'; end if;
 if c.transfer_history is not null then raise exception 'Hợp đồng có nghiệp vụ chuyển phòng. Xử lý chuyển phòng trước khi sửa.'; end if;
 select * into d from contract_drafts where parent_contract_id=c.id and status='draft';
 if d.id is not null then return to_jsonb(d); end if;
 select snapshot into s from contract_confirmations where contract_id=c.id and status='confirmed' order by confirmed_at desc limit 1;
 f:=contract_form_values(to_jsonb(c));
 if s is null then
  select * into z from service_zones where id=r.service_zone_id;
  select jsonb_build_object('property_name',property_name,'property_address',property_address,'property_owner_name',property_owner_name,
   'property_owner_phone',property_owner_phone,'property_owner_id_card',property_owner_id_card,'bank_id',bank_id,'account_no',account_no,'account_name',account_name) into settings from app_settings limit 1;
  s:=jsonb_build_object('version',1,'room',jsonb_build_object('id',r.id,'name',r.name,'area',r.area),
   'tenant',jsonb_build_object('id',c.tenant_id,'full_name',c.tenant_name,'phone',c.tenant_phone,'email',lower(btrim(t.email)),'identity_card',c.tenant_id_card,
    'id_card_issued_date',c.tenant_id_card_issued_date,'id_card_issued_place',c.tenant_id_card_issued_place,'address',c.tenant_address),
   'settings',coalesce(settings,'{}'::jsonb),'services',jsonb_build_object('electricPrice',coalesce((to_jsonb(r)->>'electric_price')::integer,z.electric_price,0),'waterPrice',coalesce((to_jsonb(r)->>'water_price')::integer,z.water_price,0),
    'internetPrice',coalesce((to_jsonb(r)->>'wifi_price')::integer,z.internet_price,0),'cleaningPrice',coalesce((to_jsonb(r)->>'garbage_price')::integer,z.cleaning_price,0)),
   'assets',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'quantity',a.quantity,'condition',case a.status when 'error' then 'Có lỗi' when 'repairing' then 'Đang sửa' when 'ok' then 'Bình thường' else 'Chưa ghi nhận' end) order by a.sort_order),'[]'::jsonb) from room_assets a where a.room_id=r.id and a.quantity>0));
 end if;
 s:=(s-'amendment')||jsonb_build_object('form',f);
 if lower(btrim(t.email)) is distinct from lower(btrim(s#>>'{tenant,email}')) then raise exception 'Email đã đổi so với hợp đồng đã xác nhận. Xử lý tài khoản trước khi sửa.'; end if;
 s:=jsonb_set(s,'{tenant,email}',to_jsonb(lower(btrim(t.email))));
 perform set_config('app.contract_revision_write','1',true);
 insert into contract_drafts(room_id,tenant_id,recipient_email,snapshot,parent_contract_id,base_contract,before_snapshot,created_by)
 values(c.room_id,c.tenant_id,lower(btrim(t.email)),s||jsonb_build_object('amendment',jsonb_build_object('contractId',c.id,'previousForm',f,'reason',btrim(p_reason))),c.id,contract_term_values(to_jsonb(c)),s,p_actor) returning * into d;
 insert into contract_lifecycle_events(contract_id,draft_id,event_type,actor,reason,before_snapshot) values(c.id,d.id,'amendment_created',p_actor,btrim(p_reason),s);
 return to_jsonb(d);
end $$;

create or replace function public.contract_confirmation_create(p_draft uuid,p_revision integer,p_hash text,p_actor uuid,p_document text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d contract_drafts; c contracts;
begin
 perform pg_advisory_xact_lock(hashtext('contract-lifecycle'));
 select * into d from contract_drafts where id=p_draft;
 if d.parent_contract_id is not null then
  select * into c from contracts where id=d.parent_contract_id;
  if c.status is distinct from 'active' or contract_term_values(to_jsonb(c)) is distinct from d.base_contract then raise exception 'Hợp đồng gốc đã thay đổi. Hủy bản sửa và tạo lại.'; end if;
  if d.snapshot->'form'=d.before_snapshot->'form' then raise exception 'Chưa thay đổi nội dung hợp đồng.'; end if;
 end if;
 return contract_confirmation_create_initial(p_draft,p_revision,p_hash,p_actor,p_document);
end $$;

create or replace function public.contract_confirmation_view(p_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; c contract_confirmations; d contract_drafts; original contracts;
begin
 perform pg_advisory_xact_lock(hashtext('contract-lifecycle'));
 result:=contract_confirmation_view_initial(p_hash);
 select * into c from contract_confirmations where token_hash=p_hash;
 select * into d from contract_drafts where id=c.draft_id;
 if d.parent_contract_id is not null then
  select * into original from contracts where id=d.parent_contract_id;
  if original.status<>'active' or (c.status<>'confirmed' and contract_term_values(to_jsonb(original)) is distinct from d.base_contract) then raise exception 'Hợp đồng gốc đã thay đổi hoặc bị hủy. Liên hệ chủ nhà.'; end if;
  result:=result||jsonb_build_object('amendment',c.snapshot->'amendment','newForm',c.snapshot->'form');
 end if;
 return result;
end $$;

create or replace function public.contract_confirmation_accept(p_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contract_confirmations; d contract_drafts; original contracts; f jsonb; ready timestamptz;
begin
 perform pg_advisory_xact_lock(hashtext('contract-lifecycle'));
 select * into c from contract_confirmations where token_hash=p_hash for update;
 select * into d from contract_drafts where id=c.draft_id for update;
 if d.parent_contract_id is null then
  -- A corrected contract for the same verified tenant may reuse their existing
  -- account. Unlock only within acceptance; any failed validation rolls it back.
  if c.status in ('prepared','sent','viewed') and c.expires_at>now() and d.status='draft' and d.revision=c.revision and
   exists(select 1 from tenant_web_accounts a join contract_lifecycle_events e on e.cancelled_account_version=a.session_version and e.event_type='cancelled'
    join contracts previous on previous.id=e.contract_id and previous.tenant_id=a.tenant_id
    where a.tenant_id=d.tenant_id and a.email=c.recipient_email and a.status='locked' and a.activated_at is not null) then
   perform webmobile_revoke_tenant(d.tenant_id,'unlock');
  end if;
  return contract_confirmation_accept_initial(p_hash);
 end if;
 lock table invoices in share row exclusive mode;
 if c.id is null or c.status in ('failed','revoked') or c.expires_at<=now() then raise exception 'Link không hợp lệ hoặc đã hết hạn.'; end if;
 if c.status='confirmed' then return jsonb_build_object('confirmed',true,'contractId',c.contract_id,'requirePassword',c.account_ready_at is null); end if;
 select * into original from contracts where id=d.parent_contract_id for update;
 perform 1 from rooms where id=original.room_id for update;
 if d.status<>'draft' or d.revision<>c.revision or original.status<>'active' or contract_term_values(to_jsonb(original)) is distinct from d.base_contract then raise exception 'Bản sửa hoặc hợp đồng gốc đã thay đổi. Liên hệ chủ nhà.'; end if;
 if not exists(select 1 from users where id=c.created_by and role='admin' and status='active') or
  not exists(select 1 from tenants where id=d.tenant_id and is_active and lower(btrim(email))=c.recipient_email) then raise exception 'Hồ sơ hoặc quyền người lập đã thay đổi.'; end if;
 f:=c.snapshot->'form';
 if f->>'moveInDate' is distinct from original.move_in_date::text and exists(select 1 from invoices where room_id=original.room_id and tenant_id=original.tenant_id) then raise exception 'Đã có hóa đơn, không đổi ngày vào.'; end if;
 perform set_config('app.contract_revision_write','1',true);
 update contracts set base_rent=(f->>'baseRent')::integer,deposit_amount=(f->>'depositAmount')::integer,move_in_date=(f->>'moveInDate')::date,
  duration_months=(f->>'durationMonths')::integer,expiration_date=case when (f->>'durationMonths')::integer=0 then null else ((f->>'moveInDate')::date+make_interval(months=>(f->>'durationMonths')::integer))::date end,
  invoice_day=(f->>'invoiceDay')::integer,occupant_count=(f->>'occupantCount')::integer,notes=f->>'additionalTerms',revision_no=revision_no+1 where id=original.id;
 update rooms set base_rent=(f->>'baseRent')::integer,invoice_day=(f->>'invoiceDay')::integer,move_in_date=(f->>'moveInDate')::date,
  contract_expiration=case when (f->>'durationMonths')::integer=0 then null else ((f->>'moveInDate')::date+make_interval(months=>(f->>'durationMonths')::integer))::date end where id=original.room_id;
 -- Leave current meter readings, existing invoices, receipts and bank records intact.
 update contract_drafts set status='confirmed',revision=revision+1 where id=d.id;
 select activated_at into ready from tenant_web_accounts where tenant_id=original.tenant_id and status='active' and email=c.recipient_email;
 if ready is null then
  if exists(select 1 from tenant_web_accounts where tenant_id=original.tenant_id) then raise exception 'Tài khoản khách đang khóa hoặc email đã thay đổi. Liên hệ chủ nhà.'; end if;
  update contract_confirmations set status='revoked' where contract_id=original.id and status='confirmed' and account_ready_at is null;
 end if;
 update contract_confirmations set status='confirmed',confirmed_at=now(),contract_id=original.id,account_ready_at=case when ready is not null then now() else null end where id=c.id;
 insert into contract_lifecycle_events(contract_id,draft_id,event_type,actor,reason,before_snapshot,after_snapshot)
  values(original.id,d.id,'amendment_applied',c.created_by,c.snapshot#>>'{amendment,reason}',d.before_snapshot,c.snapshot);
 return jsonb_build_object('confirmed',true,'contractId',original.id,'requirePassword',ready is null);
end $$;

create or replace function public.contract_cancellation_check(p_contract text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts; invoice_count integer; receipt_count integer; cash_count integer;
begin
 select * into c from contracts where id=p_contract;
 if c.id is null then raise exception 'Không tìm thấy hợp đồng.'; end if;
 select count(*) into invoice_count from invoices where room_id=c.room_id and tenant_id=c.tenant_id and
  (payment_status not in ('cancelled','merged') or coalesce(paid_amount,0)>0 or coalesce(deposit_applied,0)>0 or coalesce(payment_records,'[]'::jsonb)<>'[]'::jsonb);
 select count(*) into receipt_count from move_in_receipts where room_id=c.room_id and tenant_id=c.tenant_id and (payment_status<>'cancelled' or payment_date is not null);
 select count(*) into cash_count from cash_transactions where room_id=c.room_id and transaction_date>=c.move_in_date and amount<>0;
 return jsonb_build_object('allowed',c.status='active' and invoice_count=0 and receipt_count=0 and cash_count=0 and
  not coalesce(c.deposit_pre_collected,false) and coalesce(c.migration_debt,0)=0 and c.transfer_history is null,
  'status',c.status,'invoices',invoice_count,'receipts',receipt_count,'cashTransactions',cash_count,
  'reason',case when c.status<>'active' then 'Hợp đồng không còn hiệu lực.'
   when invoice_count+receipt_count+cash_count>0 or coalesce(c.deposit_pre_collected,false) or coalesce(c.migration_debt,0)<>0 or c.transfer_history is not null then 'Có hóa đơn, tiền cọc, giao dịch hoặc chuyển phòng. Xử lý các khoản liên quan hoặc dùng Trả phòng / thanh lý trước khi hủy.'
   else 'Có thể hủy do lập nhầm. Giữ hợp đồng và lịch sử; phòng về trống, thu hồi link và quyền truy cập hợp đồng.' end);
end $$;

create or replace function public.contract_cancel(p_contract text,p_actor uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts; check_result jsonb; account_was_unlocked boolean;
begin
 perform pg_advisory_xact_lock(hashtext('contract-lifecycle'));
 if not exists(select 1 from users where id=p_actor and role='admin' and status='active') then raise exception 'Chỉ admin được hủy hợp đồng.'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Nhập lý do hủy (5–1000 ký tự).'; end if;
 -- Serialize financial writes too, including invoice inserts and payment updates.
 lock table invoices,move_in_receipts,cash_transactions in share row exclusive mode;
 select * into c from contracts where id=p_contract for update;
 if c.id is null then raise exception 'Không tìm thấy hợp đồng.'; end if;
 if c.status='cancelled' then return jsonb_build_object('cancelled',true,'contractId',c.id); end if;
 perform 1 from rooms where id=c.room_id for update;
 check_result:=contract_cancellation_check(c.id);
 if not (check_result->>'allowed')::boolean then raise exception '%',check_result->>'reason'; end if;
 select status<>'locked' into account_was_unlocked from tenant_web_accounts where tenant_id=c.tenant_id for update;
 perform set_config('app.contract_revision_write','1',true);
 update contract_drafts set status='cancelled',revision=revision+1 where parent_contract_id=c.id and status='draft';
 update contract_confirmations set status='revoked',account_lease=null,account_locked_until=null where
  (contract_id=c.id or draft_id in(select id from contract_drafts where parent_contract_id=c.id)) and status<>'revoked';
 update contracts set status='cancelled',cancelled_at=now(),cancelled_by=p_actor,cancellation_reason=btrim(p_reason) where id=c.id;
 if not exists(select 1 from contracts where room_id=c.room_id and status='active') then
  update rooms set status='vacant',tenant_name=null,tenant_phone=null,tenant_email=null,tenant_id_card=null,move_in_date=null,
   contract_expiration=null,expected_end_date=null,has_move_in_receipt=false where id=c.room_id;
 end if;
 insert into contract_lifecycle_events(contract_id,event_type,actor,reason,before_snapshot,cancelled_account_version)
  values(c.id,'cancelled',p_actor,btrim(p_reason),to_jsonb(c),case when account_was_unlocked then (select session_version from tenant_web_accounts where tenant_id=c.tenant_id and status='locked') else null end);
 return jsonb_build_object('cancelled',true,'contractId',c.id);
end $$;

create or replace function public.contract_history(p_contract text)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 with attempts as (
  select c.*,dense_rank() over(order by c.created_at,c.id) as attempt from contract_confirmations c
  where c.contract_id=p_contract or c.draft_id in(select id from contract_drafts where parent_contract_id=p_contract)
 ), entries as (
  select e.occurred_at,e.id::text as sort_id,jsonb_build_object('id','confirmation-'||e.id,'type',e.event_type,'at',e.occurred_at,'historical',e.historical,
   'attempt',c.attempt,'revision',c.revision,'email',c.recipient_email) as value from attempts c join contract_confirmation_events e on e.confirmation_id=c.id
  union all select e.occurred_at,e.id::text,jsonb_build_object('id',e.id,'type',e.event_type,'at',e.occurred_at,'reason',e.reason,
   'actor',coalesce(u.full_name,'Admin'),'beforeForm',e.before_snapshot->'form','afterForm',e.after_snapshot->'form')
   from contract_lifecycle_events e left join users u on u.id=e.actor where e.contract_id=p_contract
 ) select coalesce(jsonb_agg(value order by occurred_at,sort_id),'[]'::jsonb) from entries;
$$;

create or replace function public.contract_draft_revoke_links()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='cancelled' or new.revision<>old.revision and new.status='draft' then
  update contract_confirmations set status='revoked' where draft_id=new.id and status in ('prepared','sent','viewed');
 end if;
 return new;
end $$;
drop trigger if exists contract_draft_revoke_links on public.contract_drafts;
create trigger contract_draft_revoke_links after update on public.contract_drafts for each row execute function public.contract_draft_revoke_links();
revoke all on function public.contract_draft_revoke_links() from public,anon,authenticated;

revoke all on function public.contract_term_values(jsonb),public.contract_form_values(jsonb) from public,anon;
grant execute on function public.contract_term_values(jsonb),public.contract_form_values(jsonb) to authenticated,service_role;
revoke all on function public.contract_confirmation_accept_initial(text),public.contract_confirmation_view_initial(text),public.contract_confirmation_create_initial(uuid,integer,text,uuid,text),
 public.contract_amendment_start(text,uuid,text),public.contract_confirmation_create(uuid,integer,text,uuid,text),public.contract_confirmation_view(text),public.contract_confirmation_accept(text),
 public.contract_cancellation_check(text),public.contract_cancel(text,uuid,text),public.contract_history(text) from public,anon,authenticated;
grant execute on function public.contract_amendment_start(text,uuid,text),public.contract_confirmation_create(uuid,integer,text,uuid,text),public.contract_confirmation_view(text),public.contract_confirmation_accept(text),
 public.contract_cancellation_check(text),public.contract_cancel(text,uuid,text),public.contract_history(text) to service_role;
notify pgrst,'reload schema';
commit;
