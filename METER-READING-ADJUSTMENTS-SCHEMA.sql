create table if not exists public.meter_reading_adjustments (
  id text primary key,
  room_id text not null,
  invoice_id text,
  contract_id text,
  old_electric numeric not null default 0,
  new_electric numeric not null default 0,
  old_water numeric not null default 0,
  new_water numeric not null default 0,
  reason text not null,
  adjusted_by text,
  adjusted_by_name text,
  recorded_at timestamptz not null default now()
);

create index if not exists meter_reading_adjustments_room_id_idx
  on public.meter_reading_adjustments(room_id);

create index if not exists meter_reading_adjustments_recorded_at_idx
  on public.meter_reading_adjustments(recorded_at desc);
