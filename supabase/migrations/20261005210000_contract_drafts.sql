begin;

create table if not exists public.contract_drafts (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete restrict,
  tenant_id text not null references public.tenants(id) on delete restrict,
  recipient_email text not null default '',
  status text not null default 'draft' check (status in ('draft', 'cancelled')),
  snapshot jsonb not null check ((
    snapshot ->> 'version' = '1'
    and snapshot #>> '{room,id}' = room_id
    and snapshot #>> '{tenant,id}' = tenant_id
    and jsonb_typeof(snapshot -> 'form') = 'object'
  ) is true),
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contract_drafts_room_open_idx
  on public.contract_drafts(room_id) where status = 'draft';
create index if not exists contract_drafts_tenant_idx on public.contract_drafts(tenant_id);

create or replace function public.guard_contract_draft()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare target_status text; tenant_active boolean;
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' then raise exception 'Bản nháp đã đóng, không thể thay đổi.'; end if;
    if new.revision <> old.revision + 1 then raise exception 'Phiên bản bản nháp không hợp lệ.'; end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.status = 'draft' then
    select status into target_status from public.rooms where id = new.room_id;
    if target_status is distinct from 'vacant' then raise exception 'Phòng không còn trống. Hãy chọn lại phòng.'; end if;
    select is_active into tenant_active from public.tenants where id = new.tenant_id;
    if tenant_active is distinct from true then raise exception 'Hồ sơ khách thuê đã ngừng hoạt động.'; end if;
    if exists (select 1 from public.contracts where status = 'active' and (room_id = new.room_id or tenant_id = new.tenant_id)) then
      raise exception 'Phòng hoặc khách thuê đang có hợp đồng hiệu lực.';
    end if;
    if new.snapshot #> '{settings,sepay_api_token}' is not null or new.snapshot #> '{tenant,identity_image_url}' is not null then
      raise exception 'Bản nháp không được chứa token dịch vụ hoặc ảnh giấy tờ.';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists guard_contract_draft on public.contract_drafts;
create trigger guard_contract_draft before insert or update on public.contract_drafts
  for each row execute function public.guard_contract_draft();
revoke all on function public.guard_contract_draft() from public;

alter table public.contract_drafts enable row level security;
revoke all on public.contract_drafts from anon;
grant select, insert, update on public.contract_drafts to authenticated;
grant all on public.contract_drafts to service_role;

drop policy if exists contract_drafts_select_admin on public.contract_drafts;
create policy contract_drafts_select_admin on public.contract_drafts for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'));
drop policy if exists contract_drafts_insert_admin on public.contract_drafts;
create policy contract_drafts_insert_admin on public.contract_drafts for insert to authenticated
  with check (status = 'draft' and created_by = auth.uid() and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'));
drop policy if exists contract_drafts_update_admin on public.contract_drafts;
create policy contract_drafts_update_admin on public.contract_drafts for update to authenticated
  using (status = 'draft' and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'));

notify pgrst, 'reload schema';
commit;
