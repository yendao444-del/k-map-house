-- Release prerequisite, not yet applied. Keep existing Electron permissions;
-- restrictive guards prevent permissive validation policies bypassing them.
-- This migration never rewrites Electron source or deletes current policies.
begin;

create policy pwa_management_active_guard on public.app_settings
  as restrictive for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role in ('admin', 'user')))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role in ('admin', 'user')));

create policy pwa_debt_active_guard on public.debt_entries
  as restrictive for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role in ('admin', 'user')))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role in ('admin', 'user')));

create policy pwa_debt_insert_permission_guard on public.debt_entries
  as restrictive for insert to authenticated
  with check (created_by = auth.uid() and exists (
    select 1 from public.users u where u.id = auth.uid() and u.status = 'active'
    and (u.role = 'admin' or (u.role = 'user' and (
      type in ('paid', 'offset') or (type = 'totalDebt' and amount > 0 and reason = 'Vay thêm')
    )))
  ));

create policy pwa_debt_update_permission_guard on public.debt_entries
  as restrictive for update to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role = 'admin'));

create policy pwa_debt_delete_permission_guard on public.debt_entries
  as restrictive for delete to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active' and u.role = 'admin'));

commit;
