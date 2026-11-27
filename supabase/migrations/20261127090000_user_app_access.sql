-- Per-user app access: which apps (Nhà trọ / DBY Finance) each account may open.
-- Admins always have every app. DBY Finance becomes ONE shared wallet that every
-- account granted 'dby-finance' reads and writes; commits still record the actor.
begin;

create table if not exists public.user_app_access (
  user_id uuid primary key references public.users(id) on delete cascade,
  apps text[] not null default array['property']::text[],
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint user_app_access_apps_valid check (apps <@ array['property','dby-finance']::text[] and cardinality(apps) <= 2)
);
alter table public.user_app_access enable row level security;
revoke all on public.user_app_access from public, anon, authenticated;

-- Effective access. No row means the historic default: rental app only.
create or replace function public.user_has_app(p_user_id uuid, p_app text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare role_name text; profile_status text; granted text[];
begin
  if p_user_id is null or p_app not in ('property','dby-finance') then return false; end if;
  select role, status into role_name, profile_status from public.users where id = p_user_id;
  if role_name is null or profile_status is distinct from 'active' then return false; end if;
  if role_name = 'admin' then return true; end if;
  if role_name <> 'user' then return false; end if;
  select apps into granted from public.user_app_access where user_id = p_user_id;
  return p_app = any(coalesce(granted, array['property']::text[]));
end;
$$;
revoke all on function public.user_has_app(uuid,text) from public, anon, authenticated;

-- Split the shared management gate: keep the original session/MFA checks as
-- management_security.session_access_allowed, and make the public gate (used by
-- every rental-data RLS policy) additionally require the 'property' app.
do $$
declare def text;
begin
  if to_regprocedure('management_security.session_access_allowed(boolean)') is null then
    def := pg_get_functiondef('public.security_management_access_allowed(boolean)'::regprocedure);
    if position('FUNCTION public.security_management_access_allowed(' in def) = 0 then
      raise exception 'Unexpected security_management_access_allowed definition';
    end if;
    execute replace(def, 'FUNCTION public.security_management_access_allowed(', 'FUNCTION management_security.session_access_allowed(');
  end if;
end $$;
revoke all on function management_security.session_access_allowed(boolean) from public, anon, authenticated;

create or replace function public.security_management_access_allowed(p_sensitive boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare role_name text;
begin
  if not management_security.session_access_allowed(p_sensitive) then return false; end if;
  if auth.role() = 'service_role' then return true; end if;
  select role into role_name from public.users where id = auth.uid();
  -- Tenant portal accounts are not management users; their own checks apply.
  if role_name = 'user' then return public.user_has_app(auth.uid(), 'property'); end if;
  return true;
end;
$$;

-- Read effective access: admins get every management account, others only themselves.
create or replace function public.user_app_access_read()
returns table(user_id uuid, apps text[]) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not management_security.session_access_allowed(false) then
    raise exception 'Phiên đăng nhập không hợp lệ.' using errcode = '42501';
  end if;
  return query
    select u.id,
      array_remove(array[
        case when public.user_has_app(u.id,'property') then 'property' end,
        case when public.user_has_app(u.id,'dby-finance') then 'dby-finance' end
      ], null)::text[]
    from public.users u
    where u.role in ('admin','user')
      and (u.id = auth.uid() or exists(select 1 from public.users me where me.id = auth.uid() and me.role = 'admin' and me.status = 'active'));
end;
$$;

-- Admin-only write, behind a recent password/MFA confirmation.
create or replace function public.admin_set_user_app_access(p_user_id uuid, p_apps text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare target_role text; clean text[];
begin
  if auth.uid() is null or not exists(select 1 from public.users where id = auth.uid() and role = 'admin' and status = 'active') then
    raise exception 'Chỉ quản trị viên mới được phân quyền ứng dụng.' using errcode = '42501';
  end if;
  if not public.security_management_access_allowed(true) then
    raise exception 'Hãy xác nhận lại mật khẩu trước khi phân quyền.' using errcode = '42501';
  end if;
  select role into target_role from public.users where id = p_user_id;
  if target_role is null then raise exception 'Không tìm thấy tài khoản.' using errcode = '22023'; end if;
  if target_role = 'admin' then raise exception 'Quản trị viên luôn có mọi ứng dụng.' using errcode = '22023'; end if;
  if target_role <> 'user' then raise exception 'Tài khoản này không phải tài khoản quản lý.' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct a order by a), array[]::text[]) into clean from unnest(coalesce(p_apps, array[]::text[])) a;
  if not clean <@ array['property','dby-finance']::text[] then
    raise exception 'Ứng dụng không hợp lệ.' using errcode = '22023';
  end if;
  insert into public.user_app_access(user_id, apps, updated_at, updated_by) values (p_user_id, clean, now(), auth.uid())
    on conflict (user_id) do update set apps = excluded.apps, updated_at = now(), updated_by = auth.uid();
  return clean;
end;
$$;

-- Shared DBY wallet: one owner row, seeded from the existing wallet (or the
-- earliest admin when none exists yet).
create table if not exists public.dby_finance_settings (
  id boolean primary key default true check (id),
  wallet_owner uuid not null references auth.users(id) on delete restrict
);
alter table public.dby_finance_settings enable row level security;
revoke all on public.dby_finance_settings from public, anon, authenticated;
insert into public.dby_finance_settings(id, wallet_owner)
select true, coalesce(
  (select owner_id from public.dby_finance_portfolios order by version desc, updated_at desc limit 1),
  (select id from public.users where role = 'admin' and status = 'active' order by created_at limit 1))
where not exists(select 1 from public.dby_finance_settings)
  and coalesce(
  (select owner_id from public.dby_finance_portfolios limit 1),
  (select id from public.users where role = 'admin' and status = 'active' limit 1)) is not null;

create or replace function public.dby_finance_wallet_owner()
returns uuid language sql stable security definer set search_path = '' as $$
  select wallet_owner from public.dby_finance_settings where id
$$;
revoke all on function public.dby_finance_wallet_owner() from public, anon, authenticated;

create or replace function public.dby_finance_assert_access()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not management_security.session_access_allowed(false) or not public.user_has_app(auth.uid(), 'dby-finance') then
    raise exception 'Tài khoản chưa được cấp quyền dùng DBY Finance.' using errcode = '42501';
  end if;
  if public.dby_finance_wallet_owner() is null then
    raise exception 'Chưa cấu hình ví DBY Finance.' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.dby_finance_investment_read()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot public.dby_finance_portfolios%rowtype;
begin
  perform public.dby_finance_assert_access();
  select * into snapshot from public.dby_finance_portfolios where owner_id = public.dby_finance_wallet_owner();
  if not found then
    return jsonb_build_object('version',0,'data',jsonb_build_object('holdings','[]'::jsonb,'transactions','[]'::jsonb,'portfolioSnapshots','[]'::jsonb,'categoryTargets','{}'::jsonb));
  end if;
  return jsonb_build_object('version',snapshot.version,'data',snapshot.data);
end;
$$;

create or replace function public.dby_finance_investment_commit(p_data jsonb, p_expected_version bigint, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.dby_finance_commits%rowtype; current_version bigint; next_tx jsonb;
  amount numeric; fund_balance numeric; tx_type text; wallet uuid;
begin
  perform public.dby_finance_assert_access();
  wallet := public.dby_finance_wallet_owner();
  if p_request_id is null or p_expected_version is null or p_expected_version < 0 or p_data is null
    or jsonb_typeof(p_data->'holdings') is distinct from 'array'
    or jsonb_typeof(p_data->'transactions') is distinct from 'array'
    or jsonb_typeof(p_data->'portfolioSnapshots') is distinct from 'array'
    or pg_column_size(p_data) > 8000000 then
    raise exception 'Dữ liệu hoặc phiên bản danh mục không hợp lệ.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(20261126, hashtext(wallet::text));
  select * into existing from public.dby_finance_commits where request_id = p_request_id;
  if found then
    if existing.actor_id <> auth.uid() or existing.expected_version <> p_expected_version or existing.data <> p_data then
      raise exception 'Mã lưu đã được dùng cho một thao tác khác.' using errcode = '22023';
    end if;
    return jsonb_build_object('version',existing.version,'data',existing.data);
  end if;
  select version into current_version from public.dby_finance_portfolios where owner_id = wallet for update;
  if coalesce(current_version,0) <> p_expected_version then
    raise exception 'Danh mục đã thay đổi trên thiết bị khác. Hãy tải lại trước khi lưu.' using errcode = '40001';
  end if;
  for next_tx in select t from jsonb_array_elements(p_data->'transactions') t loop
    tx_type := next_tx->>'transactionType';
    if next_tx->>'fundingSource' is distinct from 'investment-wallet'
      or tx_type is null or tx_type not in ('buy','withdraw','sell','deposit','import-existing')
      or jsonb_typeof(next_tx->'amountVnd') is distinct from 'number'
      or jsonb_typeof(next_tx->'walletPosting'->'amount') is distinct from 'number' then
      raise exception 'Giao dịch DBY Finance phải có loại, số tiền và nguồn vốn hợp lệ.' using errcode = '22023';
    end if;
    amount := (next_tx->>'amountVnd')::numeric;
    if amount <= 0 or amount <> trunc(amount) or amount > 9007199254740991
      or (next_tx->'walletPosting'->>'amount')::numeric <> (case
        when tx_type = 'import-existing' then 0
        when tx_type in ('buy','withdraw') then -amount
        else amount end) then
      raise exception 'Dấu hoặc số tiền giao dịch đầu tư không hợp lệ.' using errcode = '22023';
    end if;
  end loop;
  select coalesce(sum((t->'walletPosting'->>'amount')::numeric),0) into fund_balance from jsonb_array_elements(p_data->'transactions') t;
  if fund_balance < 0 or fund_balance > 9007199254740991 then
    raise exception 'Ví đầu tư không đủ tiền. Hãy nạp tiền trước khi mua.' using errcode = '22023';
  end if;
  insert into public.dby_finance_portfolios(owner_id,version,data,updated_at) values(wallet,p_expected_version+1,p_data,now())
    on conflict (owner_id) do update set version = excluded.version, data = excluded.data, updated_at = now();
  insert into public.dby_finance_commits(request_id,actor_id,expected_version,version,data) values(p_request_id,auth.uid(),p_expected_version,p_expected_version+1,p_data);
  return jsonb_build_object('version',p_expected_version+1,'data',p_data);
end;
$$;

revoke all on function public.user_app_access_read(), public.admin_set_user_app_access(uuid,text[]),
  public.dby_finance_assert_access(), public.dby_finance_investment_read(), public.dby_finance_investment_commit(jsonb,bigint,uuid)
  from public, anon, authenticated;
grant execute on function public.user_app_access_read(), public.admin_set_user_app_access(uuid,text[]),
  public.dby_finance_investment_read(), public.dby_finance_investment_commit(jsonb,bigint,uuid) to authenticated;

commit;
