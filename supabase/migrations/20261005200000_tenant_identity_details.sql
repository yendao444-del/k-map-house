begin;

-- Nullable additions preserve existing tenant profiles and allow QR details
-- to be stored without dropping address or issue information from the form.
alter table public.tenants
  add column if not exists address text,
  add column if not exists id_card_issued_date date,
  add column if not exists id_card_issued_place text;

notify pgrst, 'reload schema';

commit;
