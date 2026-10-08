-- One audited allocation correction; no rewriting legacy transactions.
begin;

create table public.wallet_reconciliations (
  id text primary key default 'initial-wallet-reconciliation' check (id = 'initial-wallet-reconciliation'),
  bank_balance bigint not null check (bank_balance >= 0),
  cash_balance bigint not null check (cash_balance >= 0),
  bank_balance_before bigint not null,
  cash_balance_before bigint not null,
  total_before bigint not null,
  entry_ids text[] not null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid not null references auth.users(id),
  reason text not null check (length(btrim(reason)) > 0)
);
alter table public.wallet_reconciliations enable row level security;
revoke all on public.wallet_reconciliations from public, anon, authenticated;
grant select on public.wallet_reconciliations to authenticated;
create policy wallet_reconciliation_read on public.wallet_reconciliations for select to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active'));

-- Every ledger writer uses the same transaction-scoped lock, including RPCs,
-- direct updates, edits, cancellations and deletes. Clients cannot bypass this.
create function public.wallet_serialize_writes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(20261005, 120000);
  return null;
end;
$$;
create trigger wallet_cash_serialize before insert or update or delete on public.cash_transactions
for each statement execute function public.wallet_serialize_writes();
create trigger wallet_invoice_serialize before insert or update or delete on public.invoices
for each statement execute function public.wallet_serialize_writes();
create trigger wallet_settings_serialize before insert or update or delete on public.app_settings
for each statement execute function public.wallet_serialize_writes();

-- A single canonical ledger includes signed invoice refunds and manual entries.
create function public.wallet_ledger_entries()
returns table (entry_id text, entry_date text, delta bigint, method text)
language sql volatile security definer set search_path = '' as $$
  select 'cash-' || c.id, c.transaction_date::text,
    case when c.type = 'income' then c.amount::bigint else -c.amount::bigint end,
    case when c.payment_method in ('cash', 'transfer') then c.payment_method else 'unknown' end
  from public.cash_transactions c
  union all
  select 'invoice-' || i.id || '-' || (p->>'id'), coalesce(p->>'payment_date', p->>'created_at'),
    coalesce((p->>'amount')::bigint, 0),
    case when p->>'payment_method' in ('cash', 'transfer') then p->>'payment_method'
      when p->>'source' = 'sepay' then 'transfer' else 'unknown' end
  from public.invoices i
  cross join lateral jsonb_array_elements(case when jsonb_typeof(i.payment_records) = 'array'
    then i.payment_records else '[]'::jsonb end) p
  where i.payment_status not in ('cancelled', 'merged');
$$;

create function public.wallet_position()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  checkpoint public.wallet_reconciliations%rowtype;
  settings public.app_settings%rowtype;
  bank_amount bigint;
  cash_amount bigint;
  unknown_amount bigint;
  unknown_count bigint;
begin
  select * into checkpoint from public.wallet_reconciliations limit 1;
  select * into settings from public.app_settings limit 1;
  select coalesce(sum(e.delta) filter (where e.method = 'transfer'), 0),
    coalesce(sum(e.delta) filter (where e.method = 'cash'), 0),
    coalesce(sum(e.delta) filter (where e.method = 'unknown'), 0),
    count(*) filter (where e.method = 'unknown')
  into bank_amount, cash_amount, unknown_amount, unknown_count
  from public.wallet_ledger_entries() e
  where case when checkpoint.id is not null then not (e.entry_id = any(checkpoint.entry_ids))
    else settings.opening_balance_date is null or e.entry_date >= settings.opening_balance_date::text end;
  bank_amount := bank_amount + coalesce(checkpoint.bank_balance, settings.opening_balance_bank, 0);
  cash_amount := cash_amount + coalesce(checkpoint.cash_balance, settings.opening_balance_cash, 0);
  return jsonb_build_object('bank', bank_amount, 'cash', cash_amount, 'unknown', unknown_amount,
    'unknown_count', unknown_count, 'total', bank_amount + cash_amount + unknown_amount);
end;
$$;

create function public.wallet_check_result() returns void
language plpgsql security definer set search_path = '' as $$
declare position jsonb;
begin
  position := public.wallet_position();
  if (position->>'unknown_count')::bigint > 0 then
    raise exception 'Có giao dịch chưa xác định ví. Phải đối soát trước khi chi.';
  end if;
  if (position->>'cash')::bigint < 0 or (position->>'bank')::bigint < 0 then
    raise exception 'Ví đã chọn không đủ tiền. Phải chuyển giữa các ví trước khi chi; không cộng gộp hoặc tự đổi ví.';
  end if;
end;
$$;

create function public.wallet_guard_cash() returns trigger
language plpgsql security definer set search_path = '' as $$
declare checkpoint public.wallet_reconciliations%rowtype; valid_transfer boolean;
begin
  select * into checkpoint from public.wallet_reconciliations limit 1;
  if tg_op <> 'INSERT' and checkpoint.id is not null and ('cash-' || old.id) = any(checkpoint.entry_ids) then
    raise exception 'Giao dịch trước mốc đối soát đã khóa. Không được sửa/xóa lịch sử.';
  end if;
  if tg_op <> 'INSERT' and old.category = 'wallet_transfer' then
    raise exception 'Hai phần chuyển ví được ghi cùng nhau, không được sửa/xóa riêng một phần.';
  end if;
  if tg_op <> 'DELETE' then
    if new.type not in ('income', 'expense') or new.type is null or new.amount is null or new.amount <= 0
      or new.payment_method is null or new.payment_method not in ('cash', 'transfer') then
      raise exception 'Giao dịch phải có số tiền dương và một ví thanh toán hợp lệ.';
    end if;
    if tg_op = 'UPDATE' and new.id is distinct from old.id then raise exception 'Không được đổi mã giao dịch.'; end if;
    if new.category = 'wallet_transfer' then
      select exists(select 1 from public.wallet_transfer_requests r where r.amount = new.amount and (
        (new.id = 'wallet-out-' || r.id and new.type = 'expense' and new.payment_method = r.source)
        or (new.id = 'wallet-in-' || r.id and new.type = 'income' and new.payment_method = case when r.source = 'cash' then 'transfer' else 'cash' end)
      )) into valid_transfer;
      if not valid_transfer then raise exception 'Phải dùng nghiệp vụ chuyển giữa các ví để ghi đồng thời hai phần.'; end if;
    end if;
    if checkpoint.id is not null and new.transaction_date::date < (checkpoint.confirmed_at at time zone 'Asia/Bangkok')::date then
      raise exception 'Không được ghi lùi ngày trước mốc đối soát đã khóa.';
    end if;
  end if;
  -- Incoming funds can repair an unreconciled legacy ledger. Once reconciled,
  -- every edit/delete and outgoing posting must preserve both nonnegative wallets.
  if checkpoint.id is not null or tg_op = 'DELETE' or tg_op = 'UPDATE' or new.type = 'expense' then
    perform public.wallet_check_result();
  end if;
  return null;
end;
$$;
create trigger wallet_cash_guard after insert or update or delete on public.cash_transactions
for each row execute function public.wallet_guard_cash();

create function public.wallet_guard_invoice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  checkpoint public.wallet_reconciliations%rowtype;
  old_records jsonb := '[]'::jsonb;
  new_records jsonb := '[]'::jsonb;
  record jsonb;
  n integer;
  had_frozen boolean := false;
begin
  select * into checkpoint from public.wallet_reconciliations limit 1;
  if tg_op <> 'INSERT' then
    old_records := coalesce(old.payment_records, '[]'::jsonb);
    select exists(select 1 from jsonb_array_elements(old_records) p
      where ('invoice-' || old.id || '-' || (p->>'id')) = any(checkpoint.entry_ids)) into had_frozen;
  end if;
  if tg_op = 'DELETE' then
    if had_frozen then raise exception 'Lịch sử thanh toán trước mốc đối soát đã khóa.'; end if;
  else
    new_records := coalesce(new.payment_records, '[]'::jsonb);
    if jsonb_typeof(new_records) <> 'array' then raise exception 'Lịch sử thanh toán không hợp lệ.'; end if;
    if tg_op = 'UPDATE' then
      if new.id is distinct from old.id then raise exception 'Không được đổi mã hóa đơn.'; end if;
      if had_frozen and (
        new.payment_status in ('cancelled', 'merged')
        or (old.payment_status in ('cancelled', 'merged') and new.payment_status is distinct from old.payment_status)
        or jsonb_array_length(new_records) < jsonb_array_length(old_records)
        or exists(select 1 from jsonb_array_elements(old_records) with ordinality p(value, idx)
          where p.value is distinct from new_records->(p.idx::integer - 1))
        or new.total_amount is distinct from old.total_amount
      ) then raise exception 'Lịch sử thanh toán trước mốc đối soát đã khóa; chỉ được ghi thêm thanh toán mới.'; end if;
    end if;
    -- Validate all newly added/changed records, not just the official payment RPC.
    n := 0;
    for record in select value from jsonb_array_elements(new_records) loop
      if tg_op = 'INSERT' or record is distinct from old_records->n then
        if record->>'id' is null or record->>'payment_method' is null
          or record->>'payment_method' not in ('cash', 'transfer') or coalesce((record->>'amount')::bigint, 0) = 0 then
          raise exception 'Thanh toán phải có mã, số tiền và một ví hợp lệ.';
        end if;
        if checkpoint.id is not null then
          if (record->>'payment_date') is null
            or (record->>'payment_date')::date < (checkpoint.confirmed_at at time zone 'Asia/Bangkok')::date
            or exists(select 1 from public.wallet_reconciliations r
              where ('invoice-' || new.id || '-' || (record->>'id')) = any(r.entry_ids)) then
            raise exception 'Không được ghi lại thanh toán hoặc ghi lùi trước mốc đối soát.';
          end if;
        end if;
      end if;
      n := n + 1;
    end loop;
    if exists(select 1 from jsonb_array_elements(new_records) p group by p->>'id' having count(*) > 1) then
      raise exception 'Mã thanh toán không được trùng.';
    end if;
  end if;
  if checkpoint.id is not null or old_records is distinct from new_records then perform public.wallet_check_result(); end if;
  return null;
end;
$$;
create trigger wallet_invoice_guard after insert or update or delete on public.invoices
for each row execute function public.wallet_guard_invoice();

create function public.wallet_guard_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.wallet_reconciliations) then
    if tg_op <> 'UPDATE' then raise exception 'Thiết lập số dư đầu kỳ đã khóa sau đối soát.'; end if;
    if new.id is distinct from old.id or new.opening_balance_cash is distinct from old.opening_balance_cash
      or new.opening_balance_bank is distinct from old.opening_balance_bank
      or new.opening_balance_date is distinct from old.opening_balance_date then
      raise exception 'Không được thay đổi số dư đầu kỳ sau đối soát.';
    end if;
  end if;
  return null;
end;
$$;
create trigger wallet_settings_guard after insert or update or delete on public.app_settings
for each row execute function public.wallet_guard_settings();

create function public.reconcile_wallet_balances(p_bank bigint, p_cash bigint, p_expected_total bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare position jsonb; result public.wallet_reconciliations%rowtype; ids text[];
begin
  if not exists(select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role = 'admin') then
    raise exception 'Chỉ quản trị viên được xác nhận đối soát.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(20261005, 120000);
  select * into result from public.wallet_reconciliations limit 1;
  if found then
    if result.bank_balance = p_bank and result.cash_balance = p_cash then return to_jsonb(result); end if;
    raise exception 'Đã chốt số dư một lần. Không được điều chỉnh lặp lại.';
  end if;
  if p_bank is null or p_cash is null or p_bank < 0 or p_cash < 0 or nullif(btrim(p_reason), '') is null then
    raise exception 'Số dư thực tế và lý do đối soát không hợp lệ.';
  end if;
  position := public.wallet_position();
  if p_expected_total is null or (position->>'total')::bigint <> p_expected_total
    or p_bank + p_cash <> p_expected_total then
    raise exception 'Tổng sổ đã thay đổi hoặc số dư xác nhận không khớp tổng tiền. Tải lại và đối soát; không tự tạo tiền bù.';
  end if;
  select coalesce(array_agg(entry_id order by entry_id), '{}'::text[]) into ids from (
    select 'cash-' || id as entry_id from public.cash_transactions
    union all
    select 'invoice-' || i.id || '-' || (p->>'id') from public.invoices i
    cross join lateral jsonb_array_elements(coalesce(i.payment_records, '[]'::jsonb)) p
  ) existing_entries;
  if array_position(ids, null) is not null then raise exception 'Có thanh toán cũ thiếu mã lịch sử, cần kiểm tra trước khi khóa.'; end if;
  insert into public.wallet_reconciliations(bank_balance, cash_balance, bank_balance_before, cash_balance_before,
    total_before, entry_ids, confirmed_by, reason)
  values(p_bank, p_cash, (position->>'bank')::bigint, (position->>'cash')::bigint, p_expected_total, ids, auth.uid(), btrim(p_reason))
  returning * into result;
  return to_jsonb(result);
end;
$$;

-- Persist both legs in one transaction and dedupe retries. This is real movement,
-- unlike the checkpoint above, and never contributes to operating revenue/costs.
create table public.wallet_transfer_requests (
  id text primary key, source text not null, amount bigint not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.wallet_transfer_requests enable row level security;
revoke all on public.wallet_transfer_requests from public, anon, authenticated;
create function public.transfer_between_wallets(p_source text, p_amount bigint, p_request_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare position jsonb; existing public.wallet_transfer_requests%rowtype; target text; note text;
begin
  if not exists(select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role = 'admin') then
    raise exception 'Chỉ quản trị viên được ghi chuyển giữa các ví.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(20261005, 120000);
  if p_source is null or p_source not in ('cash', 'transfer') or p_amount is null or p_amount <= 0 or nullif(btrim(p_request_id), '') is null then
    raise exception 'Thông tin chuyển ví không hợp lệ.';
  end if;
  select * into existing from public.wallet_transfer_requests where id = p_request_id;
  if found then
    if existing.source = p_source and existing.amount = p_amount and existing.created_by = auth.uid() then return; end if;
    raise exception 'Mã chuyển ví đã được sử dụng.';
  end if;
  position := public.wallet_position();
  if (position->>'unknown_count')::bigint > 0 or (position->>'cash')::bigint < 0 or (position->>'bank')::bigint < 0 then
    raise exception 'Phải đối soát số dư cũ trước khi chuyển giữa các ví.';
  end if;
  if p_amount > (position->>(case when p_source = 'cash' then 'cash' else 'bank' end))::bigint then
    raise exception 'Ví nguồn không đủ tiền.';
  end if;
  target := case when p_source = 'cash' then 'transfer' else 'cash' end;
  note := 'Chuyển giữa các ví: ' || case when p_source = 'cash' then 'Tiền mặt → Ngân hàng' else 'Ngân hàng → Tiền mặt' end;
  insert into public.wallet_transfer_requests(id, source, amount, created_by) values(p_request_id, p_source, p_amount, auth.uid());
  insert into public.cash_transactions(id, type, category, transaction_date, amount, payment_method, note, created_at, updated_at)
  values ('wallet-out-' || p_request_id, 'expense', 'wallet_transfer', now(), p_amount, p_source, note, now(), now()),
    ('wallet-in-' || p_request_id, 'income', 'wallet_transfer', now(), p_amount, target, note, now(), now());
end;
$$;

create function public.wallet_checkpoint_immutable() returns trigger language plpgsql as $$
begin raise exception 'Bản đối soát được lưu vĩnh viễn, không được sửa/xóa.'; end;
$$;
create trigger wallet_checkpoint_lock before update or delete on public.wallet_reconciliations
for each row execute function public.wallet_checkpoint_immutable();

do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.wallet_reconciliations;
  end if;
end;
$$;

create function public.wallet_guard_version() returns integer language sql stable as $$ select 1; $$;
revoke all on function public.wallet_ledger_entries(), public.wallet_position(), public.wallet_check_result(),
  public.wallet_serialize_writes(), public.wallet_guard_cash(), public.wallet_guard_invoice(), public.wallet_guard_settings(),
  public.wallet_checkpoint_immutable(), public.reconcile_wallet_balances(bigint,bigint,bigint,text),
  public.transfer_between_wallets(text,bigint,text), public.wallet_guard_version() from public, anon, authenticated;
grant execute on function public.reconcile_wallet_balances(bigint,bigint,bigint,text), public.transfer_between_wallets(text,bigint,text),
  public.wallet_guard_version() to authenticated;

commit;
