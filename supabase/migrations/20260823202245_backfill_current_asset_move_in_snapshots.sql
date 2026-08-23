set lock_timeout = '5s';
set statement_timeout = '2min';

-- Link only an unambiguous current move-in batch to each active contract.
-- If a later legacy move-out exists, keep both batches as legacy history so
-- an old checkout can never be shown as the state of the active rental cycle.
with active_contracts as (
  select distinct on (room_id)
    id,
    room_id,
    tenant_id,
    created_at
  from public.contracts
  where status = 'active'
  order by room_id, created_at desc
),
legacy_cycles as (
  select
    s.room_id,
    max(s.recorded_at) filter (where s.type = 'move_in') as latest_move_in_at,
    max(s.recorded_at) filter (where s.type = 'move_out') as latest_move_out_at
  from public.asset_snapshots s
  join active_contracts c on c.room_id = s.room_id
  where s.contract_id is null
  group by s.room_id
),
eligible as (
  select
    c.id as contract_id,
    c.room_id,
    c.tenant_id,
    l.latest_move_in_at
  from active_contracts c
  join legacy_cycles l on l.room_id = c.room_id
  where l.latest_move_in_at is not null
    and (
      l.latest_move_out_at is null
      or l.latest_move_in_at > l.latest_move_out_at
    )
)
update public.asset_snapshots s
set
  contract_id = e.contract_id,
  tenant_id = coalesce(s.tenant_id, e.tenant_id)
from eligible e
where s.room_id = e.room_id
  and s.type = 'move_in'
  and s.contract_id is null
  and s.recorded_at = e.latest_move_in_at;
