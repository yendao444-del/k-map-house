-- Borrowing is available to active users even if no opening entry exists.
-- Repayment/offset and existing admin update/delete policies are preserved.
begin;

alter table public.debt_entries alter column created_by set default auth.uid();
drop policy if exists debt_entries_insert_admin on public.debt_entries;
drop policy if exists debt_entries_insert_active_user on public.debt_entries;
create policy debt_entries_insert_active_user
  on public.debt_entries for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.users
      where users.id = auth.uid() and users.status = 'active'
        and (
          users.role = 'admin'
          or (users.role = 'user' and (
            debt_entries.type in ('paid', 'offset')
            or (debt_entries.type = 'totalDebt'
                and debt_entries.amount > 0 and debt_entries.reason = 'Vay thêm')
          ))
        )
    )
  );

-- Restrictive policies also apply to admins. Keep historical negative rows
-- untouched; prevent new negative principal entries or edits producing them.
drop policy if exists debt_entries_positive_principal_insert on public.debt_entries;
create policy debt_entries_positive_principal_insert
  on public.debt_entries as restrictive for insert to authenticated
  with check (type <> 'totalDebt' or amount > 0);
drop policy if exists debt_entries_positive_principal_update on public.debt_entries;
create policy debt_entries_positive_principal_update
  on public.debt_entries as restrictive for update to authenticated
  using (true)
  with check (type <> 'totalDebt' or amount > 0);

commit;
