begin;

alter table public.users
  add column if not exists phone text not null default '',
  add column if not exists notification_email text,
  add column if not exists email_notifications_enabled boolean not null default false;

comment on column public.users.notification_email is
  'Notification destination only. Does not change the Supabase Auth login email.';

commit;
