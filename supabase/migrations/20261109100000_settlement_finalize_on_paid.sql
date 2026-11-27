-- Finish the move-out in the same transaction that marks a settlement invoice paid.
-- Previously the client issued separate room/contract updates after the payment RPC;
-- RLS (management MFA guard) could silently filter them, leaving a paid settlement
-- with the room still 'ending' and the contract still 'active'.
begin;

create or replace function public.finalize_settlement_move_out()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ctr record;
begin
  select id, tenant_id into ctr
  from contracts
  where room_id = new.room_id and status = 'active'
  order by created_at desc
  limit 1
  for update;

  if ctr.id is null or (ctr.tenant_id is not null and ctr.tenant_id is distinct from new.tenant_id) then
    return new;
  end if;

  update rooms
  set status = 'vacant', tenant_name = null, tenant_phone = null, move_in_date = null, expected_end_date = null,
      electric_old = new.electric_new, electric_new = new.electric_new,
      water_old = new.water_new, water_new = new.water_new,
      has_move_in_receipt = false
  where id = new.room_id and status = 'ending';

  if found then
    update contracts
    set status = 'terminated',
        end_date = coalesce(new.invoice_date, new.payment_date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
        end_note = coalesce(new.damage_note, new.adjustment_note),
        final_electric = new.electric_new,
        final_water = new.water_new
    where id = ctr.id;
  end if;

  return new;
end $$;

revoke all on function public.finalize_settlement_move_out() from public, anon, authenticated;

drop trigger if exists finalize_settlement_move_out on public.invoices;
create trigger finalize_settlement_move_out
after update of payment_status on public.invoices
for each row
when (new.is_settlement is true and new.payment_status = 'paid' and old.payment_status is distinct from 'paid')
execute function public.finalize_settlement_move_out();

commit;
