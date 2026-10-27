begin;

-- Avoid recursive users RLS lookups. The caller cannot supply an identity;
-- the only output is whether its verified JWT subject is an active manager.
create or replace function public.management_directory_access()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.status = 'active' and u.role in ('admin', 'user')
  );
$$;
alter function public.management_directory_access() owner to postgres;
revoke all on function public.management_directory_access() from public, anon;
grant execute on function public.management_directory_access() to authenticated, service_role;

-- Preserve self-profile reads needed by login and existing admin/staff policies.
-- A restrictive policy also covers any additional permissive SELECT policies.
drop policy if exists management_directory_read_guard on public.users;
create policy management_directory_read_guard on public.users
  as restrictive for select to authenticated
  using (id = auth.uid() or public.management_directory_access());

commit;
