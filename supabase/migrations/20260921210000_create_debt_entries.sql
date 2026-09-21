-- Shared manual debt ledger. This data is intentionally independent from invoices,
-- SePay, cash transactions, and other operational modules.
create table if not exists public.debt_entries (
  id text primary key,
  type text not null check (type in ('totalDebt', 'paid', 'offset')),
  amount bigint not null check (amount <> 0),
  reason text not null check (btrim(reason) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists debt_entries_created_at_idx
  on public.debt_entries (created_at desc);

alter table public.debt_entries enable row level security;

drop policy if exists debt_entries_select_authenticated on public.debt_entries;
create policy debt_entries_select_authenticated
  on public.debt_entries for select
  to authenticated
  using (true);

drop policy if exists debt_entries_insert_admin on public.debt_entries;
create policy debt_entries_insert_admin
  on public.debt_entries for insert
  to authenticated
  with check (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role = 'admin'
        and public.users.status = 'active'
    )
  );

drop policy if exists debt_entries_update_admin on public.debt_entries;
create policy debt_entries_update_admin
  on public.debt_entries for update
  to authenticated
  using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role = 'admin'
        and public.users.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role = 'admin'
        and public.users.status = 'active'
    )
  );

drop policy if exists debt_entries_delete_admin on public.debt_entries;
create policy debt_entries_delete_admin
  on public.debt_entries for delete
  to authenticated
  using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role = 'admin'
        and public.users.status = 'active'
    )
  );

revoke all on table public.debt_entries from anon;
grant select on table public.debt_entries to authenticated;
grant insert, update, delete on table public.debt_entries to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.debt_entries;
exception
  when duplicate_object then null;
end $$;
