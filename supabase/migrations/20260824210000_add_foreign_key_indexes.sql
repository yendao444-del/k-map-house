-- Add covering indexes for foreign keys reported by Supabase Database Advisor.
-- This migration changes only index metadata; it does not update or delete rows.
set lock_timeout = '5s';
set statement_timeout = '2min';

create index if not exists asset_snapshots_room_asset_id_idx
  on public.asset_snapshots (room_asset_id);

create index if not exists asset_snapshots_room_id_idx
  on public.asset_snapshots (room_id);

create index if not exists contracts_room_id_idx
  on public.contracts (room_id);

create index if not exists contracts_tenant_id_idx
  on public.contracts (tenant_id);

create index if not exists invoices_room_id_idx
  on public.invoices (room_id);

create index if not exists move_in_receipts_room_id_idx
  on public.move_in_receipts (room_id);

create index if not exists payment_event_keys_event_id_idx
  on public.payment_event_keys (event_id);

create index if not exists payment_event_keys_invoice_id_idx
  on public.payment_event_keys (invoice_id);

create index if not exists payment_events_created_by_idx
  on public.payment_events (created_by);

create index if not exists room_asset_adjustments_room_id_idx
  on public.room_asset_adjustments (room_id);

create index if not exists room_assets_room_id_idx
  on public.room_assets (room_id);

create index if not exists room_vehicles_room_id_idx
  on public.room_vehicles (room_id);

create index if not exists rooms_service_zone_id_idx
  on public.rooms (service_zone_id);
