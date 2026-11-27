-- DBY Finance: a personal investment portfolio per admin, fully separated
-- from the rental property portfolio. Nothing here reads or writes
-- cash_transactions; deposits/withdrawals are external money only.
begin;

create table if not exists public.dby_finance_portfolios (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.dby_finance_commits (
  request_id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  expected_version bigint not null,
  version bigint not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.dby_finance_portfolios enable row level security;
alter table public.dby_finance_commits enable row level security;
revoke all on public.dby_finance_portfolios, public.dby_finance_commits from public, anon, authenticated;

-- Root permission comes from the rental app's users table: only an active
-- admin may open DBY Finance, and each admin only ever sees their own data.
create or replace function public.dby_finance_assert_access()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role = 'admin') then
    raise exception 'Chỉ tài khoản admin đang hoạt động được dùng DBY Finance.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.dby_finance_investment_read()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot public.dby_finance_portfolios%rowtype;
begin
  perform public.dby_finance_assert_access();
  select * into snapshot from public.dby_finance_portfolios where owner_id = auth.uid();
  if not found then
    return jsonb_build_object('version',0,'data',jsonb_build_object('holdings','[]'::jsonb,'transactions','[]'::jsonb,'portfolioSnapshots','[]'::jsonb,'categoryTargets','{}'::jsonb));
  end if;
  return jsonb_build_object('version',snapshot.version,'data',snapshot.data);
end;
$$;

create or replace function public.dby_finance_investment_commit(p_data jsonb, p_expected_version bigint, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.dby_finance_commits%rowtype; current_version bigint; next_tx jsonb;
  amount numeric; fund_balance numeric;
begin
  perform public.dby_finance_assert_access();
  if p_request_id is null or p_expected_version is null or p_expected_version < 0 or p_data is null
    or jsonb_typeof(p_data->'holdings') is distinct from 'array'
    or jsonb_typeof(p_data->'transactions') is distinct from 'array'
    or jsonb_typeof(p_data->'portfolioSnapshots') is distinct from 'array'
    or pg_column_size(p_data) > 8000000 then
    raise exception 'Dữ liệu hoặc phiên bản danh mục không hợp lệ.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(20261126, hashtext(auth.uid()::text));
  select * into existing from public.dby_finance_commits where request_id = p_request_id;
  if found then
    if existing.actor_id <> auth.uid() or existing.expected_version <> p_expected_version or existing.data <> p_data then
      raise exception 'Mã lưu đã được dùng cho một thao tác khác.' using errcode = '22023';
    end if;
    return jsonb_build_object('version',existing.version,'data',existing.data);
  end if;
  select version into current_version from public.dby_finance_portfolios where owner_id = auth.uid() for update;
  if coalesce(current_version,0) <> p_expected_version then
    raise exception 'Danh mục đã thay đổi trên thiết bị khác. Hãy tải lại trước khi lưu.' using errcode = '40001';
  end if;
  -- Every personal transaction moves money only inside the DBY investment
  -- wallet. Same sign rules as the rental portfolio, minus operating wallets.
  for next_tx in select t from jsonb_array_elements(p_data->'transactions') t loop
    if next_tx->>'fundingSource' is distinct from 'investment-wallet'
      or next_tx->>'transactionType' not in ('buy','withdraw','sell','deposit')
      or jsonb_typeof(next_tx->'amountVnd') is distinct from 'number'
      or jsonb_typeof(next_tx->'walletPosting'->'amount') is distinct from 'number' then
      raise exception 'Giao dịch DBY Finance phải có loại, số tiền và nguồn vốn hợp lệ.' using errcode = '22023';
    end if;
    amount := (next_tx->>'amountVnd')::numeric;
    if amount <= 0 or amount <> trunc(amount) or amount > 9007199254740991
      or (next_tx->'walletPosting'->>'amount')::numeric <> (case when next_tx->>'transactionType' in ('buy','withdraw') then -amount else amount end) then
      raise exception 'Dấu hoặc số tiền giao dịch đầu tư không hợp lệ.' using errcode = '22023';
    end if;
  end loop;
  select coalesce(sum((t->'walletPosting'->>'amount')::numeric),0) into fund_balance from jsonb_array_elements(p_data->'transactions') t;
  if fund_balance < 0 or fund_balance > 9007199254740991 then
    raise exception 'Ví đầu tư không đủ tiền. Hãy nạp vốn trước khi mua.' using errcode = '22023';
  end if;
  insert into public.dby_finance_portfolios(owner_id,version,data,updated_at) values(auth.uid(),p_expected_version+1,p_data,now())
    on conflict (owner_id) do update set version = excluded.version, data = excluded.data, updated_at = now();
  insert into public.dby_finance_commits(request_id,actor_id,expected_version,version,data) values(p_request_id,auth.uid(),p_expected_version,p_expected_version+1,p_data);
  return jsonb_build_object('version',p_expected_version+1,'data',p_data);
end;
$$;

revoke all on function public.dby_finance_assert_access(), public.dby_finance_investment_read(), public.dby_finance_investment_commit(jsonb,bigint,uuid) from public, anon, authenticated;
grant execute on function public.dby_finance_investment_read(), public.dby_finance_investment_commit(jsonb,bigint,uuid) to authenticated;

commit;
