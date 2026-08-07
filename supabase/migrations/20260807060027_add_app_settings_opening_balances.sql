alter table public.app_settings
  add column if not exists opening_balance_cash integer not null default 0,
  add column if not exists opening_balance_bank integer not null default 0,
  add column if not exists opening_balance_date date;
