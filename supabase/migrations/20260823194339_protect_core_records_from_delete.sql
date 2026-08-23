-- Safety fuse: immutable business history must not be hard-deleted by the app.
-- Removing the DELETE policies changes permissions only; it does not modify rows.
drop policy if exists authenticated_active_delete on public.rooms;
drop policy if exists authenticated_active_delete on public.tenants;
drop policy if exists authenticated_active_delete on public.invoices;
drop policy if exists authenticated_active_delete on public.contracts;
drop policy if exists authenticated_active_delete on public.move_in_receipts;
drop policy if exists authenticated_active_delete on public.room_assets;
drop policy if exists authenticated_active_delete on public.asset_snapshots;
drop policy if exists authenticated_active_delete on public.room_vehicles;
drop policy if exists authenticated_active_delete on public.room_asset_adjustments;
