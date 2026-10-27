begin;
-- OTP metadata only: no recipient, message body, OTP or provider payload.
alter table management_security.email_challenges
  add column if not exists provider_id uuid,
  add column if not exists provider_accepted_at timestamptz;
create unique index if not exists security_email_provider_unique
  on management_security.email_challenges(provider_id) where provider_id is not null;

-- Events may arrive before the send request has persisted its provider ID.
create table if not exists management_security.email_delivery_events (
  event_id text primary key check(length(event_id) between 1 and 200),
  provider_id uuid not null,
  event_type text not null check(event_type in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp()
);
create index if not exists security_email_events_provider
  on management_security.email_delivery_events(provider_id,occurred_at desc);
alter table management_security.email_delivery_events enable row level security;
revoke all on management_security.email_delivery_events from public,anon,authenticated,service_role;

create or replace function public.security_email_accepted(p_challenge uuid,p_user uuid,p_session uuid,p_provider uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if p_provider is null then return false; end if;
  update management_security.email_challenges
    set provider_id=p_provider,provider_accepted_at=coalesce(provider_accepted_at,clock_timestamp())
    where id=p_challenge and user_id=p_user and session_id=p_session
      and delivery_failed_at is null and (provider_id is null or provider_id=p_provider);
  get diagnostics n=row_count;
  delete from management_security.email_delivery_events where received_at<clock_timestamp()-interval '30 days';
  return n=1;
end $$;

create or replace function public.security_email_delivery_event(p_event text,p_provider uuid,p_type text,p_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if p_event is null or length(p_event) not between 1 and 200 or p_provider is null or p_type is null
     or p_type not in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')
     or p_at is null or p_at>clock_timestamp()+interval '5 minutes' then return false; end if;
  insert into management_security.email_delivery_events(event_id,provider_id,event_type,occurred_at)
    values(p_event,p_provider,p_type,p_at) on conflict(event_id) do nothing;
  return exists(select 1 from management_security.email_delivery_events
    where event_id=p_event and provider_id=p_provider and event_type=p_type and occurred_at=p_at);
end $$;

-- Derive status from immutable events so duplicates/out-of-order webhooks never
-- regress a delivered/bounced/complained result back to sent or delayed.
create or replace view management_security.email_delivery_status as
select c.id as challenge_id,c.user_id,c.purpose,c.created_at,c.provider_id,c.provider_accepted_at,
  coalesce(e.event_type,case when c.delivery_failed_at is not null then 'api_failed'
    when c.provider_accepted_at is not null then 'accepted' else 'unknown' end) as delivery_status,
  e.occurred_at as provider_event_at
from management_security.email_challenges c left join lateral (
  select d.event_type,d.occurred_at from management_security.email_delivery_events d
  where d.provider_id=c.provider_id order by case d.event_type
    when 'email.complained' then 7 when 'email.bounced' then 6 when 'email.suppressed' then 5
    when 'email.failed' then 4 when 'email.delivered' then 3 when 'email.delivery_delayed' then 2 else 1 end desc,
    d.occurred_at desc limit 1
) e on true;
revoke all on management_security.email_delivery_status from public,anon,authenticated,service_role;
revoke all on function public.security_email_accepted(uuid,uuid,uuid,uuid),public.security_email_delivery_event(text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.security_email_accepted(uuid,uuid,uuid,uuid),public.security_email_delivery_event(text,uuid,text,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
