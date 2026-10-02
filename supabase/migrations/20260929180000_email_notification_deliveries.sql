create table if not exists public.email_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  recipient_email text not null,
  recipient_name text not null,
  event_type text not null,
  dedupe_key text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  provider text,
  provider_message_id text,
  error_message text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index if not exists email_notification_deliveries_dedupe_key_idx on public.email_notification_deliveries(dedupe_key);
create index if not exists email_notification_deliveries_recipient_idx on public.email_notification_deliveries(recipient_user_id, created_at desc);
alter table public.email_notification_deliveries enable row level security;
drop policy if exists "Admins manage email notification deliveries" on public.email_notification_deliveries;
create policy "Admins manage email notification deliveries" on public.email_notification_deliveries
  for all using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin' and u.status = 'active'));
