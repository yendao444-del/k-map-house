-- Active users may record repayments and offsets. Opening debt and debt
-- adjustments remain admin-only, while updates and deletes keep their existing policies.
alter table public.debt_entries
  alter column created_by set default auth.uid();

drop policy if exists debt_entries_insert_admin on public.debt_entries;
drop policy if exists debt_entries_insert_active_user on public.debt_entries;

create policy debt_entries_insert_active_user
  on public.debt_entries for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.status = 'active'
        and (
          public.users.role = 'admin'
          or (
            public.users.role = 'user'
            and debt_entries.type in ('paid', 'offset')
          )
        )
    )
  );
