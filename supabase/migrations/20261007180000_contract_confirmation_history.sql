begin;
create table if not exists public.contract_confirmation_events (
  id bigint generated always as identity primary key,
  confirmation_id uuid not null references public.contract_confirmations(id) on delete restrict,
  event_type text not null check(event_type in ('created','sent','delivery_failed','link_opened','document_viewed','confirmed','account_ready','revoked')),
  occurred_at timestamptz not null default now(),
  visit_id uuid,
  historical boolean not null default false
);
create unique index if not exists contract_events_single_idx on public.contract_confirmation_events(confirmation_id,event_type) where visit_id is null;
create unique index if not exists contract_events_visit_idx on public.contract_confirmation_events(confirmation_id,event_type,visit_id) where visit_id is not null;
alter table public.contract_confirmation_events enable row level security;
revoke all on public.contract_confirmation_events from public,anon,authenticated;
grant all on public.contract_confirmation_events to service_role;
grant usage,select on sequence public.contract_confirmation_events_id_seq to service_role;

create or replace function public.contract_confirmation_log_event(p_confirmation uuid,p_event text,p_at timestamptz default now(),p_visit uuid default null,p_historical boolean default false)
returns void language sql security definer set search_path=public,pg_temp as $$
  insert into contract_confirmation_events(confirmation_id,event_type,occurred_at,visit_id,historical)
  values(p_confirmation,p_event,p_at,p_visit,p_historical) on conflict do nothing;
$$;

create or replace function public.contract_confirmation_audit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    perform contract_confirmation_log_event(new.id,'created',new.created_at);
  else
    if old.sent_at is null and new.sent_at is not null then perform contract_confirmation_log_event(new.id,'sent',new.sent_at); end if;
    if old.status is distinct from new.status and new.status='failed' then perform contract_confirmation_log_event(new.id,'delivery_failed'); end if;
    if old.confirmed_at is null and new.confirmed_at is not null then perform contract_confirmation_log_event(new.id,'confirmed',new.confirmed_at); end if;
    if old.account_ready_at is null and new.account_ready_at is not null then perform contract_confirmation_log_event(new.id,'account_ready',new.account_ready_at); end if;
    if old.status is distinct from new.status and new.status='revoked' then perform contract_confirmation_log_event(new.id,'revoked'); end if;
  end if;
  return new;
end $$;
drop trigger if exists contract_confirmation_audit on public.contract_confirmations;
create trigger contract_confirmation_audit after insert or update on public.contract_confirmations for each row execute function public.contract_confirmation_audit();

-- Import only timestamps that already exist; never fabricate click/read times.
insert into public.contract_confirmation_events(confirmation_id,event_type,occurred_at,historical)
select c.id,v.event_type,v.at,true from public.contract_confirmations c
cross join lateral (values ('created',c.created_at),('sent',c.sent_at),('link_opened',c.viewed_at),('confirmed',c.confirmed_at),('account_ready',c.account_ready_at)) v(event_type,at)
where v.at is not null and not exists(select 1 from public.contract_confirmation_events existing where existing.confirmation_id=c.id)
on conflict do nothing;

create or replace function public.contract_confirmation_open(p_hash text,p_visit uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare document jsonb; cid uuid;
begin
  document:=contract_confirmation_view(p_hash);
  select id into cid from contract_confirmations where token_hash=p_hash;
  perform contract_confirmation_log_event(cid,'link_opened',clock_timestamp(),p_visit);
  return document;
end $$;

create or replace function public.contract_confirmation_document_view(p_hash text,p_visit uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare cid uuid;
begin
  if p_visit is null then raise exception 'Phiên xem hợp đồng không hợp lệ.'; end if;
  -- The same validation/row lock used to display the document prevents logging
  -- a changed, revoked or expired link. This is display telemetry, not proof of reading.
  perform contract_confirmation_view(p_hash);
  select id into cid from contract_confirmations where token_hash=p_hash;
  perform contract_confirmation_log_event(cid,'document_viewed',clock_timestamp(),p_visit);
end $$;

create or replace function public.contract_confirmation_history(p_draft uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  with attempts as (
    select c.*,dense_rank() over(order by c.created_at,c.id) as attempt from contract_confirmations c where c.draft_id=p_draft
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'type',e.event_type,'at',e.occurred_at,'historical',e.historical,
    'attempt',c.attempt,'revision',c.revision,'email',c.recipient_email) order by e.occurred_at,e.id),'[]'::jsonb)
  from attempts c join contract_confirmation_events e on e.confirmation_id=c.id;
$$;
revoke all on function public.contract_confirmation_log_event(uuid,text,timestamptz,uuid,boolean),public.contract_confirmation_audit(),
 public.contract_confirmation_open(text,uuid),public.contract_confirmation_document_view(text,uuid),public.contract_confirmation_history(uuid) from public,anon,authenticated;
grant execute on function public.contract_confirmation_log_event(uuid,text,timestamptz,uuid,boolean),
 public.contract_confirmation_open(text,uuid),public.contract_confirmation_document_view(text,uuid),public.contract_confirmation_history(uuid) to service_role;
notify pgrst,'reload schema';
commit;
