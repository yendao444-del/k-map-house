-- DBY Finance: allow "import-existing" transactions, i.e. assets the admin
-- already owned before using the app. They add to holdings at their cost but
-- never move money: walletPosting.amount must be exactly 0. All other rules
-- (admin-only, per-user lock, idempotency, version check, non-negative fund)
-- are unchanged from 20261126100000_dby_finance_personal_portfolio.sql.
begin;

create or replace function public.dby_finance_investment_commit(p_data jsonb, p_expected_version bigint, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.dby_finance_commits%rowtype; current_version bigint; next_tx jsonb;
  amount numeric; fund_balance numeric; tx_type text;
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
  insert into public.dby_finance_portfolios(owner_id,version,data,updated_at) values(auth.uid(),p_expected_version+1,p_data,now())
    on conflict (owner_id) do update set version = excluded.version, data = excluded.data, updated_at = now();
  insert into public.dby_finance_commits(request_id,actor_id,expected_version,version,data) values(p_request_id,auth.uid(),p_expected_version,p_expected_version+1,p_data);
  return jsonb_build_object('version',p_expected_version+1,'data',p_data);
end;
$$;

revoke all on function public.dby_finance_investment_commit(jsonb,bigint,uuid) from public, anon, authenticated;
grant execute on function public.dby_finance_investment_commit(jsonb,bigint,uuid) to authenticated;

commit;
