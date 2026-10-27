-- Additive PWA storage only. No existing business table/policy/function is
-- rewritten. Electron's local investment JSON remains unchanged.
begin;

create table if not exists public.admin_pwa_investment_store (
  id text primary key check (id = 'property-portfolio'),
  version bigint not null default 0 check (version >= 0),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table if not exists public.admin_pwa_investment_commits (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  expected_version bigint not null,
  version bigint not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.admin_pwa_investment_store enable row level security;
alter table public.admin_pwa_investment_commits enable row level security;
revoke all on public.admin_pwa_investment_store, public.admin_pwa_investment_commits from public, anon, authenticated;

create or replace function public.admin_pwa_investment_read()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot public.admin_pwa_investment_store%rowtype;
begin
  if not exists(select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role in ('admin','user')) then
    raise exception 'Tài khoản quản lý không hoạt động hoặc không có quyền.' using errcode = '42501';
  end if;
  select * into snapshot from public.admin_pwa_investment_store where id = 'property-portfolio';
  if not found then return jsonb_build_object('version',0,'data',jsonb_build_object('holdings','[]'::jsonb,'transactions','[]'::jsonb,'portfolioSnapshots','[]'::jsonb,'categoryTargets','{}'::jsonb)); end if;
  return jsonb_build_object('version',snapshot.version,'data',snapshot.data);
end;
$$;

create or replace function public.admin_pwa_investment_write(p_data jsonb, p_expected_version bigint, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot public.admin_pwa_investment_store%rowtype; previous public.admin_pwa_investment_commits%rowtype;
begin
  if not exists(select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role in ('admin','user')) then
    raise exception 'Tài khoản quản lý không hoạt động hoặc không có quyền.' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 0 or p_request_id is null or p_data is null
    or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 8388608
    or jsonb_typeof(p_data->'holdings') is distinct from 'array'
    or jsonb_typeof(p_data->'transactions') is distinct from 'array'
    or jsonb_typeof(p_data->'portfolioSnapshots') is distinct from 'array'
    or jsonb_typeof(p_data->'categoryTargets') is distinct from 'object' then
    raise exception 'Dữ liệu danh mục hoặc phiên bản không hợp lệ.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_data) as keys(key) where key not in ('holdings','transactions','portfolioSnapshots','categoryTargets'))
    or jsonb_array_length(p_data->'holdings') > 10000 or jsonb_array_length(p_data->'transactions') > 100000 or jsonb_array_length(p_data->'portfolioSnapshots') > 20000 then
    raise exception 'Danh mục vượt giới hạn hoặc chứa trường không hỗ trợ.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_data->'holdings') h where jsonb_typeof(h) <> 'object' or nullif(btrim(h->>'symbol'),'') is null or (h->>'category') is null or h->>'category' not in ('cash','gold','stocks','bonds','savings') or jsonb_typeof(h->'valueVnd') is distinct from 'number' or (h->>'valueVnd')::numeric < 0)
    or exists(select 1 from jsonb_array_elements(p_data->'holdings') h group by upper(h->>'symbol') having count(*) > 1)
    or exists(select 1 from jsonb_array_elements(p_data->'transactions') t where jsonb_typeof(t) <> 'object' or nullif(t->>'id','') is null or t->>'transactionType' is null or t->>'transactionType' not in ('deposit','withdraw','buy','sell','import-existing') or jsonb_typeof(t->'amountVnd') is distinct from 'number' or (t->>'amountVnd')::numeric < 0 or nullif(t->>'date','') is null)
    or exists(select 1 from jsonb_array_elements(p_data->'transactions') t group by t->>'id' having count(*) > 1) then
    raise exception 'Tài sản hoặc giao dịch không hợp lệ/trùng mã.' using errcode = '22023';
  end if;
  -- Single property portfolio: preserve the Electron shared management scope.
  -- Lock covers first insert, version check, history and row update together.
  perform pg_advisory_xact_lock(20261008, 417800);
  select * into previous from public.admin_pwa_investment_commits where request_id = p_request_id;
  if found then
    if previous.actor_id <> auth.uid() or previous.expected_version <> p_expected_version or previous.data <> p_data then
      raise exception 'Mã lưu đã được dùng cho một thao tác khác.' using errcode = '22023';
    end if;
    return jsonb_build_object('version',previous.version,'data',previous.data);
  end if;
  select * into snapshot from public.admin_pwa_investment_store where id = 'property-portfolio' for update;
  if coalesce(snapshot.version,0) <> p_expected_version then
    raise exception 'Danh mục đã thay đổi trên thiết bị khác. Hãy tải lại trước khi lưu.' using errcode = '40001';
  end if;
  insert into public.admin_pwa_investment_store(id,version,data,updated_by) values('property-portfolio',p_expected_version+1,p_data,auth.uid())
  on conflict(id) do update set version = excluded.version, data = excluded.data, updated_by = excluded.updated_by, updated_at = now();
  insert into public.admin_pwa_investment_commits(request_id,actor_id,expected_version,version,data) values(p_request_id,auth.uid(),p_expected_version,p_expected_version+1,p_data);
  return jsonb_build_object('version',p_expected_version+1,'data',p_data);
end;
$$;
revoke all on function public.admin_pwa_investment_read(), public.admin_pwa_investment_write(jsonb,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_pwa_investment_read() to authenticated;
commit;
