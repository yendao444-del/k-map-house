begin;
alter table public.users
  add column if not exists email_notification_preferences jsonb not null default
  '{"room_checkout_due":true,"rent_overdue":true,"rent_long_unpaid":true,"sepay_unmatched":true,"sepay_matched":false,"invoices_services":false,"contract_expiring":true}'::jsonb;
comment on column public.users.email_notification_preferences is
  'Per-account email topics. Effective only when email_notifications_enabled is true.';
commit;
