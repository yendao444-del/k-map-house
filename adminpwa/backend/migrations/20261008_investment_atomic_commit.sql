-- PWA-only writer. Append compensating ledger entries and portfolio revision
-- in one SQL transaction; never edit/delete Electron's historical receipts.
begin;
create or replace function public.admin_pwa_investment_commit(p_data jsonb, p_expected_version bigint, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old_data jsonb; old_tx jsonb; next_tx jsonb; existing public.admin_pwa_investment_commits%rowtype;
  actor_role text; fund_balance numeric; old_operating numeric; next_operating numeric;
  cash_delta numeric := 0; bank_delta numeric := 0; method text; next_method text; amount numeric;
  holding jsonb; available_quantity numeric; trade_quantity numeric; old_quantity numeric; result jsonb;
begin
  select u.role into actor_role from public.users u where u.id = auth.uid() and u.status = 'active' and u.role in ('admin','user');
  if actor_role is null then raise exception 'Tài khoản quản lý không hoạt động hoặc không có quyền.' using errcode = '42501'; end if;
  if p_request_id is null or p_expected_version is null or p_expected_version < 0 or p_data is null
    or jsonb_typeof(p_data->'transactions') is distinct from 'array' then
    raise exception 'Dữ liệu hoặc phiên bản danh mục không hợp lệ.' using errcode = '22023';
  end if;
  -- Acquire the SAME global ledger lock used by invoices/cash/settings before
  -- the portfolio lock. Consistent order avoids cross-table deadlocks.
  perform pg_advisory_xact_lock(20261005,120000);
  perform pg_advisory_xact_lock(20261008,417800);
  select * into existing from public.admin_pwa_investment_commits where request_id = p_request_id;
  if found then
    if existing.actor_id <> auth.uid() or existing.expected_version <> p_expected_version
      or existing.data <> p_data then
      raise exception 'Mã lưu đã được dùng cho một thao tác khác.' using errcode = '22023';
    end if;
    return jsonb_build_object('version',existing.version,'data',existing.data);
  end if;
  old_data := public.admin_pwa_investment_read();
  if (old_data->>'version')::bigint <> p_expected_version then
    raise exception 'Danh mục đã thay đổi trên thiết bị khác. Hãy tải lại trước khi lưu.' using errcode = '40001';
  end if;
  old_data := old_data->'data';
  -- New transactions cannot invent opening funds or bypass the operating
  -- wallet by labeling themselves legacy. Explicit import is separate.
  for next_tx in select t from jsonb_array_elements(p_data->'transactions') t loop
    select t into old_tx from jsonb_array_elements(old_data->'transactions') t where t->>'id' = next_tx->>'id';
    if next_tx->>'fundingSource' is distinct from 'investment-wallet' then
      if old_tx is null or next_tx <> old_tx then
        raise exception 'Giao dịch cũ phải nhập từ bản sao Electron đã đối soát; không được tạo hoặc sửa như giao dịch mới.' using errcode = '22023';
      end if;
      continue;
    end if;
    if old_tx is not null and old_tx->>'fundingSource' is distinct from 'investment-wallet' then
      raise exception 'Không được đổi nguồn vốn giao dịch cũ.' using errcode = '22023';
    end if;
    method := next_tx->'walletPosting'->>'paymentMethod';
    if method is null or method not in ('cash','transfer') or jsonb_typeof(next_tx->'walletPosting'->'amount') is distinct from 'number'
      or jsonb_typeof(next_tx->'amountVnd') is distinct from 'number' then
      raise exception 'Giao dịch phải có số tiền và ví thanh toán hợp lệ.' using errcode = '22023';
    end if;
    amount := (next_tx->>'amountVnd')::numeric;
    if amount <= 0 or amount <> trunc(amount) or amount > 9007199254740991
      or (next_tx->'walletPosting'->>'amount')::numeric <> (case when next_tx->>'transactionType' in ('buy','withdraw') then -amount when next_tx->>'transactionType' in ('sell','deposit') then amount else null end)
      or next_tx->>'transactionType' not in ('buy','withdraw','sell','deposit') then
      raise exception 'Dấu hoặc số tiền giao dịch đầu tư không hợp lệ.' using errcode = '22023';
    end if;
    if next_tx is distinct from old_tx and next_tx->>'transactionType' in ('buy','sell') then
      if jsonb_typeof(next_tx->'quantity') is distinct from 'number' or (next_tx->>'quantity')::numeric <= 0 then
        raise exception 'Số lượng tài sản giao dịch phải lớn hơn 0.' using errcode = '22023';
      end if;
      trade_quantity := (next_tx->>'quantity')::numeric;
      if next_tx->>'transactionType' = 'sell' then
        select h into holding from jsonb_array_elements(old_data->'holdings') h where upper(h->>'symbol') = upper(next_tx->>'assetSymbol');
        if holding is null then raise exception 'Không có tài sản để bán/tất toán.' using errcode = '22023'; end if;
        if holding->>'category' = 'savings' then
          available_quantity := case when (holding->>'quantity')::jsonb->>'status' = 'settled' then 0 else 1 end;
        elsif split_part(holding->>'quantity',' ',1) ~ '^([0-9]+)(\.[0-9]+)?$' then
          available_quantity := split_part(holding->>'quantity',' ',1)::numeric;
        else raise exception 'Chưa xác định được số lượng tài sản để bán.' using errcode = '22023'; end if;
        if old_tx is not null and upper(old_tx->>'assetSymbol') = upper(next_tx->>'assetSymbol') then
          old_quantity := coalesce((old_tx->>'quantity')::numeric,0);
          available_quantity := available_quantity + case when old_tx->>'transactionType' = 'sell' then old_quantity when old_tx->>'transactionType' = 'buy' then -old_quantity else 0 end;
        end if;
        if trade_quantity > available_quantity then raise exception 'Số lượng bán vượt quá tài sản đang nắm giữ.' using errcode = '22023'; end if;
      end if;
    end if;
  end loop;
  select coalesce(sum((t->'walletPosting'->>'amount')::numeric),0) into fund_balance
    from jsonb_array_elements(p_data->'transactions') t where t->>'fundingSource' = 'investment-wallet';
  if fund_balance < 0 or fund_balance > 9007199254740991 then
    raise exception 'Ví đầu tư không đủ tiền hoặc số dư vượt giới hạn.' using errcode = '22023';
  end if;
  -- Compare each transaction against the locked cloud snapshot, deriving
  -- operating movements server-side. Client supplies no arbitrary receipts.
  for old_tx,next_tx in
    select o.t,n.t from jsonb_array_elements(old_data->'transactions') o(t)
    full join jsonb_array_elements(p_data->'transactions') n(t) on o.t->>'id' = n.t->>'id'
  loop
    if old_tx is not distinct from next_tx then continue; end if;
    old_operating := 0; next_operating := 0;
    method := old_tx->'walletPosting'->>'paymentMethod';
    next_method := next_tx->'walletPosting'->>'paymentMethod';
    if old_tx is not null and old_tx->>'fundingSource' is distinct from 'investment-wallet' then
      if actor_role <> 'admin' or next_tx is not null then
        raise exception 'Chỉ admin được hoàn tác giao dịch cũ thuộc Ví vận hành.' using errcode = '42501';
      end if;
      old_operating := coalesce((old_tx->'walletPosting'->>'amount')::numeric,0);
    elsif old_tx->>'transactionType' in ('deposit','withdraw') then
      old_operating := -(old_tx->'walletPosting'->>'amount')::numeric;
    end if;
    if next_tx->>'transactionType' in ('deposit','withdraw') then
      next_operating := -(next_tx->'walletPosting'->>'amount')::numeric;
    end if;
    if old_operating <> 0 then
      if method = 'cash' then cash_delta := cash_delta-old_operating;
      elsif method = 'transfer' then bank_delta := bank_delta-old_operating;
      else raise exception 'Không xác định ví của giao dịch cũ.' using errcode = '22023'; end if;
    end if;
    if next_operating <> 0 then
      if next_method = 'cash' then cash_delta := cash_delta+next_operating;
      elsif next_method = 'transfer' then bank_delta := bank_delta+next_operating;
      else raise exception 'Không xác định ví của giao dịch mới.' using errcode = '22023'; end if;
    end if;
  end loop;
  -- Preserve existing server wallet triggers/constraints and chosen wallet.
  -- Credits are inserted first, then debits, all within this transaction.
  for method,amount in select x.method,x.amount from (values('cash',cash_delta),('transfer',bank_delta)) x(method,amount) where x.amount <> 0 order by x.amount desc loop
    if amount <> trunc(amount) or abs(amount) > 9007199254740991 then raise exception 'Chứng từ nguồn vốn không hợp lệ.' using errcode = '22023'; end if;
    insert into public.cash_transactions(id,type,category,transaction_date,amount,payment_method,note,created_at,updated_at)
    values('pwa-investment-'||p_request_id::text||'-'||method,case when amount > 0 then 'income' else 'expense' end,'investment_transfer',now(),abs(amount),method,'[Đầu tư PWA] Chuyển/hoàn tác vốn · '||p_request_id::text,now(),now());
  end loop;
  -- Validation/version/history/update run last, so any rejection rolls back
  -- ALL new receipts automatically, including role/shape/version failures.
  result := public.admin_pwa_investment_write(p_data,p_expected_version,p_request_id);
  return result;
end;
$$;
revoke all on function public.admin_pwa_investment_write(jsonb,bigint,uuid) from authenticated;
revoke all on function public.admin_pwa_investment_commit(jsonb,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_pwa_investment_commit(jsonb,bigint,uuid) to authenticated;
commit;
