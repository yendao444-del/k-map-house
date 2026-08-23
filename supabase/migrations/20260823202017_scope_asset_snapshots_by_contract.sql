set lock_timeout = '5s';
set statement_timeout = '2min';

-- Keep an immutable copy of the pre-migration snapshot data outside the
-- exposed public schema. Legacy rows remain in public.asset_snapshots too.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.asset_snapshots_backup_20260824
as table public.asset_snapshots;

alter table private.asset_snapshots_backup_20260824 enable row level security;

comment on table private.asset_snapshots_backup_20260824 is
  'Pre-contract-scope backup of public.asset_snapshots created on 2026-08-24.';

alter table public.asset_snapshots
  add column if not exists contract_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'asset_snapshots_contract_id_fkey'
      and conrelid = 'public.asset_snapshots'::regclass
  ) then
    alter table public.asset_snapshots
      add constraint asset_snapshots_contract_id_fkey
      foreign key (contract_id)
      references public.contracts(id)
      on delete set null;
  end if;
end $$;

create index if not exists asset_snapshots_contract_room_type_recorded_idx
  on public.asset_snapshots (contract_id, room_id, type, recorded_at desc);

comment on column public.asset_snapshots.contract_id is
  'Contract/rental cycle that owns this asset snapshot. NULL identifies legacy history.';
