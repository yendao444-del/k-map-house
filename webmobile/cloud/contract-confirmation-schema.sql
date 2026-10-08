begin;
-- Deploy only through a script that validates the target project and schema.
-- No anonymous table access. No tenant, room or invoice rows are seeded.
alter table public.contracts add column if not exists tenant_id_card_issued_date date,
  add column if not exists tenant_id_card_issued_place text, add column if not exists tenant_address text;
alter table public.contract_drafts drop constraint if exists contract_drafts_status_check;
alter table public.contract_drafts add constraint contract_drafts_status_check check(status in ('draft','cancelled','confirmed'));
create table if not exists public.contract_confirmations (
  id uuid primary key default gen_random_uuid(), draft_id uuid not null references public.contract_drafts(id),
  revision integer not null, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null, document_html text not null, recipient_email text not null,
  status text not null default 'prepared' check(status in ('prepared','sent','viewed','confirmed','failed','revoked')),
  expires_at timestamptz not null default now()+interval '72 hours', created_at timestamptz not null default now(),
  sent_at timestamptz, viewed_at timestamptz, confirmed_at timestamptz, gmail_message_id text,
  contract_id text, created_by uuid not null references public.users(id),
  account_user_id uuid not null default gen_random_uuid(), account_ready_at timestamptz,
  account_lease uuid, account_locked_until timestamptz
);
create index if not exists contract_confirmations_draft_idx on public.contract_confirmations(draft_id,created_at desc);
alter table public.contract_confirmations enable row level security;
revoke all on public.contract_confirmations from public,anon,authenticated;
grant all on public.contract_confirmations to service_role;

create or replace function public.contract_confirmation_status(p_draft uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',id,'status',case when status not in ('confirmed','failed','revoked') and expires_at<=now() then 'expired' else status end,
    'revision',revision,'expiresAt',expires_at,'sentAt',sent_at,'viewedAt',viewed_at,'confirmedAt',confirmed_at,'contractId',contract_id,'accountReady',account_ready_at is not null)
  from contract_confirmations where draft_id=p_draft order by created_at desc limit 1;
$$;

create or replace function public.contract_confirmation_create(p_draft uuid,p_revision integer,p_hash text,p_actor uuid,p_document text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d contract_drafts; prior contract_confirmations; f jsonb; reading text;
begin
  if not exists(select 1 from users where id=p_actor and role='admin' and status='active') then raise exception 'Chỉ admin được gửi hợp đồng.'; end if;
  select * into d from contract_drafts where id=p_draft for update;
  if d.id is null or d.status<>'draft' or d.revision<>p_revision then raise exception 'Bản nháp đã thay đổi hoặc đã đóng.'; end if;
  if not exists(select 1 from tenants where id=d.tenant_id and is_active and lower(btrim(email))=lower(btrim(d.recipient_email))) then raise exception 'Email hồ sơ đã thay đổi. Lưu lại bản nháp.'; end if;
  select * into prior from contract_confirmations where draft_id=p_draft order by created_at desc limit 1;
  if prior.id is not null and prior.revision=p_revision and prior.status not in ('failed','revoked') and prior.expires_at>now() then
    raise exception 'Hợp đồng đã được gửi hoặc đang gửi. Không gửi trùng; kiểm tra trạng thái trước.';
  end if;
  f:=d.snapshot->'form';
  if coalesce((f->>'baseRent')::bigint,0)<=0 or coalesce((f->>'depositAmount')::bigint,-1)<0 or
     coalesce((f->>'invoiceDay')::integer,0) not between 1 and 28 or
     coalesce((f->>'occupantCount')::integer,0) not between 1 and 20 or
     coalesce((f->>'durationMonths')::integer,-1) not between 0 and 120 then raise exception 'Nội dung hợp đồng chưa hợp lệ.'; end if;
  perform (f->>'moveInDate')::date;
  foreach reading in array array['electricInitial','waterInitial'] loop
    if coalesce(f->>reading,'') !~ '^\d+$' or (f->>reading)::bigint>2147483647 then raise exception 'Nhập đầy đủ chỉ số điện và nước bàn giao trước khi gửi.'; end if;
  end loop;
  if length(p_document)<100 or length(p_document)>200000 then raise exception 'Bản hợp đồng chưa đầy đủ.'; end if;
  update contract_confirmations set status='revoked' where draft_id=p_draft and status in ('prepared','sent','viewed');
  insert into contract_confirmations(draft_id,revision,token_hash,snapshot,document_html,recipient_email,created_by)
    values(d.id,d.revision,p_hash,d.snapshot,p_document,lower(btrim(d.recipient_email)),p_actor);
  return contract_confirmation_status(p_draft);
end $$;

create or replace function public.contract_confirmation_delivery(p_draft uuid,p_id uuid,p_message text,p_failed boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not p_failed and coalesce(btrim(p_message),'')='' then raise exception 'Gmail chưa trả mã thư. Chưa thể ghi nhận đã gửi.'; end if;
  update contract_confirmations set status=case when p_failed then 'failed' else case when status='prepared' then 'sent' else status end end,
    sent_at=case when p_failed then sent_at else coalesce(sent_at,now()) end,gmail_message_id=nullif(p_message,'')
    where id=p_id and draft_id=p_draft and (status='prepared' or (not p_failed and status in ('sent','viewed','confirmed')));
  return contract_confirmation_status(p_draft);
end $$;

create or replace function public.contract_confirmation_view(p_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contract_confirmations; d contract_drafts;
begin
  select * into c from contract_confirmations where token_hash=p_hash for update;
  if c.id is null or c.status in ('failed','revoked') or c.expires_at<=now() then raise exception 'Link không hợp lệ, đã bị hủy hoặc hết hạn.'; end if;
  select * into d from contract_drafts where id=c.draft_id;
  if d.revision<>c.revision and c.status<>'confirmed' or d.status='cancelled' then raise exception 'Hợp đồng đã thay đổi. Vui lòng liên hệ chủ nhà để nhận link mới.'; end if;
  if c.status in ('prepared','sent') then update contract_confirmations set status='viewed',viewed_at=coalesce(viewed_at,now()) where id=c.id; end if;
  return jsonb_build_object('html',c.document_html,'room',c.snapshot#>>'{room,name}','name',c.snapshot#>>'{tenant,full_name}',
    'email',c.recipient_email,'status',case when c.status='confirmed' then 'confirmed' else 'viewed' end,
    'expiresAt',c.expires_at,'requirePassword',c.status='confirmed' and c.account_ready_at is null);
end $$;

create or replace function public.contract_confirmation_accept(p_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contract_confirmations; d contract_drafts; f jsonb; t jsonb; cid text; account tenant_web_accounts;
begin
  select * into c from contract_confirmations where token_hash=p_hash for update;
  if c.id is null or c.status in ('failed','revoked') or c.expires_at<=now() then raise exception 'Link không hợp lệ hoặc đã hết hạn.'; end if;
  if c.status='confirmed' then return jsonb_build_object('confirmed',true,'contractId',c.contract_id,'requirePassword',c.account_ready_at is null); end if;
  select * into d from contract_drafts where id=c.draft_id for update;
  if d.status<>'draft' or d.revision<>c.revision then raise exception 'Hợp đồng đã thay đổi hoặc đã đóng. Liên hệ chủ nhà.'; end if;
  perform 1 from rooms where id=d.room_id and status='vacant' for update;
  if not found then raise exception 'Phòng không còn trống.'; end if;
  perform 1 from tenants where id=d.tenant_id and is_active and lower(btrim(email))=c.recipient_email for update;
  if not found then raise exception 'Thông tin khách thuê đã thay đổi.'; end if;
  if exists(select 1 from contracts where status='active' and (room_id=d.room_id or tenant_id=d.tenant_id)) then raise exception 'Phòng hoặc khách đã có hợp đồng hiệu lực.'; end if;
  if not exists(select 1 from users where id=c.created_by and role='admin' and status='active') then raise exception 'Người lập hợp đồng không còn quyền quản trị.'; end if;
  f:=c.snapshot->'form'; t:=c.snapshot->'tenant'; cid:='contract_'||c.id::text;
  insert into contracts(id,room_id,tenant_id,tenant_name,tenant_phone,tenant_id_card,tenant_id_card_issued_date,tenant_id_card_issued_place,tenant_address,
    base_rent,deposit_amount,move_in_date,duration_months,expiration_date,invoice_day,occupant_count,billing_cycle,electric_init,water_init,notes,status,created_at)
    values(cid,d.room_id,d.tenant_id,t->>'full_name',t->>'phone',t->>'identity_card',nullif(t->>'id_card_issued_date','')::date,t->>'id_card_issued_place',t->>'address',
      (f->>'baseRent')::integer,(f->>'depositAmount')::integer,(f->>'moveInDate')::date,(f->>'durationMonths')::integer,
      case when (f->>'durationMonths')::integer=0 then null else ((f->>'moveInDate')::date+make_interval(months=>(f->>'durationMonths')::integer))::date end,
      (f->>'invoiceDay')::integer,(f->>'occupantCount')::integer,1,(f->>'electricInitial')::integer,(f->>'waterInitial')::integer,f->>'additionalTerms','active',c.created_at);
  update rooms set status='occupied',tenant_name=t->>'full_name',tenant_phone=t->>'phone',tenant_email=c.recipient_email,tenant_id_card=t->>'identity_card',
    move_in_date=(f->>'moveInDate')::date,base_rent=(f->>'baseRent')::integer,invoice_day=(f->>'invoiceDay')::integer,
    electric_old=(f->>'electricInitial')::integer,electric_new=(f->>'electricInitial')::integer,water_old=(f->>'waterInitial')::integer,water_new=(f->>'waterInitial')::integer,
    contract_expiration=case when (f->>'durationMonths')::integer=0 then null else ((f->>'moveInDate')::date+make_interval(months=>(f->>'durationMonths')::integer))::date end,
    has_move_in_receipt=false,expected_end_date=null where id=d.room_id;
  update contract_drafts set status='confirmed',revision=revision+1 where id=d.id;
  select * into account from tenant_web_accounts where tenant_id=d.tenant_id;
  if account.tenant_id is not null and (account.status='locked' or account.email<>c.recipient_email) then raise exception 'Tài khoản khách đang khóa hoặc email đã thay đổi. Liên hệ chủ nhà.'; end if;
  update contract_confirmations set status='confirmed',confirmed_at=now(),contract_id=cid,
    account_ready_at=case when account.tenant_id is not null then now() else null end where id=c.id;
  return jsonb_build_object('confirmed',true,'contractId',cid,'requirePassword',account.tenant_id is null);
end $$;

create or replace function public.contract_account_claim(p_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contract_confirmations; lease uuid:=gen_random_uuid();
begin
  select * into c from contract_confirmations where token_hash=p_hash for update;
  if c.id is null or c.status<>'confirmed' or c.expires_at<=now() or c.account_ready_at is not null then raise exception 'Link cấp tài khoản đã dùng hoặc hết hạn.'; end if;
  if c.account_locked_until>now() then raise exception 'Đang cấp tài khoản. Hãy chờ một phút rồi thử lại.'; end if;
  if not exists(select 1 from contracts where id=c.contract_id and status='active') then raise exception 'Hợp đồng không còn hiệu lực.'; end if;
  update contract_confirmations set account_lease=lease,account_locked_until=now()+interval '60 seconds' where id=c.id;
  return jsonb_build_object('id',c.id,'lease',lease,'userId',c.account_user_id,'email',c.recipient_email,'name',c.snapshot#>>'{tenant,full_name}');
end $$;

create or replace function public.contract_account_finish(p_hash text,p_user uuid,p_lease uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c contract_confirmations; tid text;
begin
  select * into c from contract_confirmations where token_hash=p_hash for update;
  if c.id is null or c.status<>'confirmed' or c.expires_at<=now() or c.account_ready_at is not null or c.account_user_id<>p_user or c.account_lease<>p_lease or c.account_locked_until<=now() then raise exception 'Phiên cấp tài khoản đã thay đổi.'; end if;
  tid:=c.snapshot#>>'{tenant,id}';
  if not exists(select 1 from contracts where id=c.contract_id and tenant_id=tid and status='active') then raise exception 'Hợp đồng không còn hiệu lực.'; end if;
  perform webmobile_enroll_tenant(p_user,tid,c.recipient_email,c.created_by);
  update tenant_web_accounts set status='active',activated_at=now() where tenant_id=tid;
  update contract_confirmations set account_ready_at=now(),account_lease=null,account_locked_until=null where id=c.id;
end $$;

-- Hashes, private snapshots and mutation RPCs are service-only.
create or replace function public.contract_account_on_end()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.status='active' and new.status<>'active' and new.tenant_id is not null and
    not exists(select 1 from contracts where tenant_id=new.tenant_id and status='active') then
    if exists(select 1 from tenant_web_accounts where tenant_id=new.tenant_id) then perform webmobile_revoke_tenant(new.tenant_id,'lock'); end if;
    update contract_confirmations set status='revoked' where contract_id=new.id and status='confirmed';
  end if;
  return new;
end $$;
drop trigger if exists contract_account_on_end on public.contracts;
create trigger contract_account_on_end after update of status on public.contracts for each row execute function public.contract_account_on_end();
revoke all on function public.contract_account_on_end() from public,anon,authenticated;

revoke all on function public.contract_confirmation_status(uuid),public.contract_confirmation_create(uuid,integer,text,uuid,text),
  public.contract_confirmation_delivery(uuid,uuid,text,boolean),public.contract_confirmation_view(text),public.contract_confirmation_accept(text),
  public.contract_account_claim(text),public.contract_account_finish(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.contract_confirmation_status(uuid),public.contract_confirmation_create(uuid,integer,text,uuid,text),
  public.contract_confirmation_delivery(uuid,uuid,text,boolean),public.contract_confirmation_view(text),public.contract_confirmation_accept(text),
  public.contract_account_claim(text),public.contract_account_finish(text,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
