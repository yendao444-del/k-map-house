-- SECURITY P0: protect application settings and remove anonymous full-access policies.
-- Apply this migration to Supabase project k-map-house before distributing the build.

create table if not exists public.app_secrets (
  id text primary key,
  sepay_api_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;
revoke all on table public.app_secrets from anon, authenticated;

insert into public.app_secrets (id, sepay_api_token)
select 'default', nullif(trim(sepay_api_token), '')
from public.app_settings
limit 1
on conflict (id) do update
set sepay_api_token = excluded.sepay_api_token,
    updated_at = now();

-- The renderer no longer reads this column. Remove the old copy after migration.
update public.app_settings
set sepay_api_token = null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'asset_snapshots', 'asset_templates', 'cash_transactions', 'contracts',
    'invoices', 'move_in_receipts', 'room_asset_adjustments', 'room_assets',
    'room_vehicles', 'rooms', 'service_zones', 'tenants'
  ] loop
    execute format('drop policy if exists anon_all on public.%I', table_name);
  end loop;
end
$$;

drop policy if exists "Authenticated users can read settings" on public.app_settings;
drop policy if exists "Authenticated users can update settings" on public.app_settings;
drop policy if exists app_settings_admin_all on public.app_settings;

create policy app_settings_admin_all
on public.app_settings
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
      and u.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
      and u.status = 'active'
  )
);

revoke all on table public.app_settings from anon;

-- Keep the two remote migrations reproducible when this file is applied to a fresh copy.
drop policy if exists app_settings_admin_all on public.app_settings;
create policy app_settings_authenticated_read
on public.app_settings for select to authenticated using (true);
create policy app_settings_admin_write
on public.app_settings for all to authenticated
using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'))
with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'));

revoke execute on function public.handle_auth_user_created() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_login() from public, anon, authenticated;

-- P1: replace broad authenticated_all with active-user CRUD policies.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'asset_snapshots', 'asset_templates', 'cash_transactions', 'contracts',
    'invoices', 'move_in_receipts', 'room_asset_adjustments', 'room_assets',
    'room_vehicles', 'rooms', 'service_zones', 'tenants'
  ] loop
    execute format('drop policy if exists authenticated_all on public.%I', table_name);
    execute format('create policy authenticated_active_select on public.%I for select to authenticated using (exists (select 1 from public.users u where u.id = auth.uid() and u.status = ''active''))', table_name);
    execute format('create policy authenticated_active_insert on public.%I for insert to authenticated with check (exists (select 1 from public.users u where u.id = auth.uid() and u.status = ''active''))', table_name);
    execute format('create policy authenticated_active_update on public.%I for update to authenticated using (exists (select 1 from public.users u where u.id = auth.uid() and u.status = ''active'')) with check (exists (select 1 from public.users u where u.id = auth.uid() and u.status = ''active''))', table_name);
    execute format('create policy authenticated_active_delete on public.%I for delete to authenticated using (exists (select 1 from public.users u where u.id = auth.uid() and u.status = ''active''))', table_name);
  end loop;
end
$$;
