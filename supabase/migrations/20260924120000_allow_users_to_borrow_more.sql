-- Active non-admin users may record a new positive "Vay thêm" debt entry.
-- Opening debt, reducing debt, editing, and deleting entries remain admin-only.
alter table public.debt_entries
  alter column created_by set default auth.uid();

drop policy if exists debt_entries_insert_active_user on public.debt_entries;
drop policy if exists debt_entries_insert_admin on public.debt_entries;

create policy debt_entries_insert_active_user
  on public.debt_entries for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.users
      where public.users.id = auth.uid()
        and public.users.status = 'active'
        and (
          public.users.role = 'admin'
          or (
            public.users.role = 'user'
            and (
              debt_entries.type in ('paid', 'offset')
              or (
                debt_entries.type = 'totalDebt'
                and debt_entries.amount > 0
                and debt_entries.reason = 'Vay thêm'
                and exists (
                  select 1
                  from public.debt_entries as existing_debt
                  where existing_debt.type = 'totalDebt'
                    and existing_debt.amount > 0
                    and existing_debt.id <> debt_entries.id
                )
              )
            )
          )
        )
    )
  );
