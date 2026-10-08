-- Reporting/accounting basis for the operating cash-flow period.
-- This is a classification boundary, not a new transaction and does not
-- update or delete the frozen historical ledger.
begin;

create table if not exists public.wallet_accounting_basis (
  id text primary key check (id = 'operating-cashflow-2026-10'),
  starts_on date not null,
  method_overrides jsonb not null default '{}'::jsonb,
  reason text not null check (length(btrim(reason)) > 0),
  confirmed_at timestamptz not null default now()
);
alter table public.wallet_accounting_basis enable row level security;
revoke all on public.wallet_accounting_basis from public, anon, authenticated;
grant select on public.wallet_accounting_basis to authenticated;
create policy wallet_accounting_basis_read on public.wallet_accounting_basis
  for select to authenticated using (exists(select 1 from public.users u where u.id = auth.uid() and u.status = 'active'));

insert into public.wallet_accounting_basis(id, starts_on, method_overrides, reason)
values (
  'operating-cashflow-2026-10',
  '2026-10-01',
  '{"cash-tx-1791183015353-6iy1odkx":"transfer"}'::jsonb,
  'Báo cáo vận hành tính theo giao dịch từ 01/10/2026; khoản chi điện được ghi nhận từ BIDV vì quỹ tiền mặt thực tế bằng 0.'
)
on conflict (id) do nothing;

create or replace function public.wallet_ledger_entries()
returns table (entry_id text, entry_date text, delta bigint, method text)
language sql volatile security definer set search_path = '' as $$
  with basis as (select * from public.wallet_accounting_basis limit 1)
  select 'cash-' || c.id, c.transaction_date::text,
    case when c.type = 'income' then c.amount::bigint else -c.amount::bigint end,
    coalesce(b.method_overrides->>('cash-' || c.id),
      case when c.payment_method in ('cash', 'transfer') then c.payment_method else 'unknown' end)
  from public.cash_transactions c left join basis b on true
  union all
  select 'invoice-' || i.id || '-' || (p->>'id'), coalesce(p->>'payment_date', p->>'created_at'),
    coalesce((p->>'amount')::bigint, 0),
    coalesce(b.method_overrides->>('invoice-' || i.id || '-' || (p->>'id')),
      case when p->>'payment_method' in ('cash', 'transfer') then p->>'payment_method'
        when p->>'source' = 'sepay' then 'transfer' else 'unknown' end)
  from public.invoices i left join basis b on true
  cross join lateral jsonb_array_elements(case when jsonb_typeof(i.payment_records) = 'array'
    then i.payment_records else '[]'::jsonb end) p
  where i.payment_status not in ('cancelled', 'merged');
$$;

create or replace function public.wallet_position()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  checkpoint public.wallet_reconciliations%rowtype;
  settings public.app_settings%rowtype;
  basis public.wallet_accounting_basis%rowtype;
  bank_amount bigint;
  cash_amount bigint;
  unknown_amount bigint;
  unknown_count bigint;
begin
  select * into checkpoint from public.wallet_reconciliations limit 1;
  select * into settings from public.app_settings limit 1;
  select * into basis from public.wallet_accounting_basis limit 1;
  select coalesce(sum(e.delta) filter (where e.method = 'transfer'), 0),
    coalesce(sum(e.delta) filter (where e.method = 'cash'), 0),
    coalesce(sum(e.delta) filter (where e.method = 'unknown'), 0),
    count(*) filter (where e.method = 'unknown')
  into bank_amount, cash_amount, unknown_amount, unknown_count
  from public.wallet_ledger_entries() e
  where case when basis.id is not null then e.entry_date >= basis.starts_on::text
    when checkpoint.id is not null then not (e.entry_id = any(checkpoint.entry_ids))
    else settings.opening_balance_date is null or e.entry_date >= settings.opening_balance_date::text end;
  bank_amount := bank_amount + case when basis.id is not null then 0 else coalesce(checkpoint.bank_balance, settings.opening_balance_bank, 0) end;
  cash_amount := cash_amount + case when basis.id is not null then 0 else coalesce(checkpoint.cash_balance, settings.opening_balance_cash, 0) end;
  return jsonb_build_object('bank', bank_amount, 'cash', cash_amount, 'unknown', unknown_amount,
    'unknown_count', unknown_count, 'total', bank_amount + cash_amount + unknown_amount);
end;
$$;

create or replace function public.wallet_guard_version() returns integer language sql stable as $$ select 2; $$;
grant execute on function public.wallet_guard_version() to authenticated;

create trigger wallet_accounting_basis_lock before update or delete on public.wallet_accounting_basis
for each row execute function public.wallet_checkpoint_immutable();
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.wallet_accounting_basis;
  end if;
end;
$$;

commit;
