-- Closing an unpaid billing period confirms its meter readings without recording payment.
alter table public.invoices
  add column if not exists debt_confirmed_at timestamptz,
  add column if not exists debt_confirmed_by uuid references auth.users(id);

create index if not exists invoices_open_debt_by_room_period_idx
  on public.invoices (room_id, tenant_id, year, month)
  where debt_confirmed_at is not null;

create or replace function public.confirm_invoice_debt_atomic(
  p_invoice_id text,
  p_expected_total integer,
  p_expected_paid integer,
  p_expected_electric_new numeric,
  p_expected_water_new numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invoice_row public.invoices%rowtype;
  room_row public.rooms%rowtype;
  contract_tenant_id text;
begin
  if actor_id is null or not exists (
    select 1 from public.users u where u.id = actor_id and u.status = 'active'
  ) then
    raise exception 'Phiên đăng nhập không hợp lệ hoặc tài khoản đã bị vô hiệu hóa.'
      using errcode = '42501';
  end if;

  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Không tìm thấy hóa đơn.'; end if;

  if invoice_row.debt_confirmed_at is not null then
    return jsonb_build_object('invoice', to_jsonb(invoice_row), 'applied', false);
  end if;

  if invoice_row.payment_status not in ('unpaid', 'partial')
     or coalesce(invoice_row.total_amount, 0) <= coalesce(invoice_row.paid_amount, 0)
     or invoice_row.is_settlement is true
     or (coalesce(invoice_row.billing_reason, '') not in ('first_month', 'monthly', 'room_cycle')
         and invoice_row.is_first_month is not true) then
    raise exception 'Chỉ được chốt nợ hóa đơn kỳ thuê còn tiền phải thu.';
  end if;

  if (invoice_row.year, invoice_row.month) >=
     (extract(year from (now() at time zone 'Asia/Bangkok'))::integer,
      extract(month from (now() at time zone 'Asia/Bangkok'))::integer) then
    raise exception 'Chỉ được chốt nợ khi đã sang tháng mới.';
  end if;

  if invoice_row.total_amount is distinct from p_expected_total
     or invoice_row.paid_amount is distinct from p_expected_paid
     or invoice_row.electric_new is distinct from p_expected_electric_new
     or invoice_row.water_new is distinct from p_expected_water_new then
    raise exception 'Hóa đơn vừa thay đổi. Vui lòng tải lại và kiểm tra trước khi chốt.';
  end if;

  select tenant_id into contract_tenant_id
  from public.contracts
  where room_id = invoice_row.room_id and status = 'active'
  order by created_at desc limit 1;
  if contract_tenant_id is distinct from invoice_row.tenant_id then
    raise exception 'Hóa đơn không thuộc hợp đồng đang hoạt động của phòng.';
  end if;

  if exists (
    select 1 from public.invoices later
    where later.room_id = invoice_row.room_id
      and later.tenant_id = invoice_row.tenant_id
      and later.id <> invoice_row.id
      and later.payment_status not in ('cancelled', 'merged')
      and (coalesce(later.billing_reason, '') in ('first_month', 'monthly', 'room_cycle')
           or later.is_first_month is true)
      and (later.year, later.month) > (invoice_row.year, invoice_row.month)
  ) then
    raise exception 'Đã có hóa đơn kỳ sau. Cần kiểm tra chuỗi chỉ số trước khi chốt.';
  end if;

  select * into room_row from public.rooms where id = invoice_row.room_id for update;
  if not found or room_row.status not in ('occupied', 'ending') then
    raise exception 'Phòng không còn ở trạng thái được chốt nợ.';
  end if;
  if room_row.electric_new is distinct from invoice_row.electric_old
     or room_row.water_new is distinct from invoice_row.water_old then
    raise exception 'Chỉ số phòng không khớp đầu kỳ hóa đơn. Cần đối chiếu trước khi chốt.';
  end if;

  perform set_config('app.invoice_debt_closing', 'on', true);
  update public.invoices
  set debt_confirmed_at = now(), debt_confirmed_by = actor_id
  where id = p_invoice_id
  returning * into invoice_row;

  update public.rooms
  set electric_old = invoice_row.electric_new,
      electric_new = invoice_row.electric_new,
      water_old = invoice_row.water_new,
      water_new = invoice_row.water_new
  where id = invoice_row.room_id;

  return jsonb_build_object('invoice', to_jsonb(invoice_row), 'applied', true);
end;
$$;

revoke all on function public.confirm_invoice_debt_atomic(text, integer, integer, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.confirm_invoice_debt_atomic(text, integer, integer, numeric, numeric)
  to authenticated;

-- Payment can complete an older invoice after a newer period has already advanced the meter.
create or replace function public.advance_room_meter_on_invoice_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_status <> 'paid' or old.payment_status = 'paid'
     or new.is_settlement is true
     or (coalesce(new.billing_reason, '') not in ('first_month', 'monthly', 'room_cycle')
         and new.is_first_month is not true) then
    return new;
  end if;

  if exists (
    select 1 from public.invoices later
    where later.room_id = new.room_id and later.tenant_id = new.tenant_id
      and later.id <> new.id
      and later.payment_status not in ('cancelled', 'merged')
      and (coalesce(later.billing_reason, '') in ('first_month', 'monthly', 'room_cycle')
           or later.is_first_month is true)
      and (later.year, later.month) > (new.year, new.month)
  ) then
    return new;
  end if;

  update public.rooms room
  set electric_old = new.electric_new,
      electric_new = new.electric_new,
      water_old = new.water_new,
      water_new = new.water_new
  where room.id = new.room_id
    and room.status in ('occupied', 'ending')
    and room.electric_new <= new.electric_new
    and room.water_new <= new.water_new
    and exists (
      select 1 from public.contracts contract
      where contract.room_id = new.room_id and contract.tenant_id = new.tenant_id
        and contract.status = 'active'
    );
  return new;
end;
$$;

drop trigger if exists advance_room_meter_on_invoice_payment on public.invoices;
create trigger advance_room_meter_on_invoice_payment
after update of payment_status on public.invoices
for each row execute function public.advance_room_meter_on_invoice_payment();

create or replace function public.protect_confirmed_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.debt_confirmed_at is null then
    if new.debt_confirmed_at is not null and current_setting('app.invoice_debt_closing', true) is distinct from 'on' then
      raise exception 'Phải xác nhận chốt nợ qua nghiệp vụ chốt kỳ.';
    end if;
    return new;
  end if;
  if current_setting('app.invoice_debt_reopen', true) = 'on' then return new; end if;
  if new.debt_confirmed_at is distinct from old.debt_confirmed_at
     or new.debt_confirmed_by is distinct from old.debt_confirmed_by
     or new.total_amount is distinct from old.total_amount
     or new.room_cost is distinct from old.room_cost
     or new.electric_old is distinct from old.electric_old
     or new.electric_new is distinct from old.electric_new
     or new.electric_cost is distinct from old.electric_cost
     or new.water_old is distinct from old.water_old
     or new.water_new is distinct from old.water_new
     or new.water_cost is distinct from old.water_cost
     or new.wifi_cost is distinct from old.wifi_cost
     or new.garbage_cost is distinct from old.garbage_cost
     or new.adjustment_amount is distinct from old.adjustment_amount
     or new.deposit_amount is distinct from old.deposit_amount
     or new.payment_status = 'cancelled' then
    raise exception 'Hóa đơn đã chốt nợ. Hãy dùng quy trình điều chỉnh để sửa hoặc hủy.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_confirmed_invoice on public.invoices;
create trigger protect_confirmed_invoice
before update on public.invoices
for each row execute function public.protect_confirmed_invoice();

create or replace function public.protect_billing_period_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  room_row public.rooms%rowtype;
begin
  if coalesce(new.billing_reason, '') not in ('monthly', 'room_cycle') then
    return new;
  end if;

  select * into room_row from public.rooms where id = new.room_id for update;
  if not found then raise exception 'Không tìm thấy phòng lập hóa đơn.'; end if;
  if room_row.electric_new is distinct from new.electric_old
     or room_row.water_new is distinct from new.water_old then
    raise exception 'Chỉ số đầu kỳ không khớp phòng. Vui lòng tải lại trước khi lập hóa đơn.';
  end if;

  if exists (
    select 1 from public.invoices previous
    where previous.room_id = new.room_id and previous.tenant_id = new.tenant_id
      and previous.payment_status in ('unpaid', 'partial')
      and previous.total_amount > previous.paid_amount
      and previous.debt_confirmed_at is null
      and (coalesce(previous.billing_reason, '') in ('first_month', 'monthly', 'room_cycle')
           or previous.is_first_month is true)
      and (previous.year, previous.month) < (new.year, new.month)
  ) then
    raise exception 'Còn hóa đơn kỳ trước chưa chốt nợ. Hãy xác nhận trước khi lập kỳ mới.';
  end if;

  if exists (
    select 1 from public.invoices later
    where later.room_id = new.room_id and later.tenant_id = new.tenant_id
      and later.payment_status not in ('cancelled', 'merged')
      and (coalesce(later.billing_reason, '') in ('first_month', 'monthly', 'room_cycle')
           or later.is_first_month is true)
      and (later.year, later.month) > (new.year, new.month)
  ) then
    raise exception 'Đã có hóa đơn kỳ sau. Không thể lập lùi kỳ điện nước.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_billing_period_insert on public.invoices;
create trigger protect_billing_period_insert
before insert on public.invoices
for each row execute function public.protect_billing_period_insert();

create or replace function public.reopen_invoice_debt_atomic(p_invoice_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  invoice_row public.invoices%rowtype;
  room_row public.rooms%rowtype;
begin
  select u.role into actor_role
  from public.users u
  where u.id = actor_id and u.status = 'active';
  if actor_id is null or actor_role is distinct from 'admin' then
    raise exception 'Chỉ quản trị viên mới được hoàn tác chốt nợ.' using errcode = '42501';
  end if;

  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Không tìm thấy hóa đơn.'; end if;
  if invoice_row.debt_confirmed_at is null then
    return jsonb_build_object('invoice', to_jsonb(invoice_row), 'applied', false);
  end if;
  if invoice_row.paid_amount > 0 then
    raise exception 'Hóa đơn đã có tiền thanh toán. Không thể hoàn tác chốt nợ.';
  end if;
  if invoice_row.payment_status <> 'unpaid' or invoice_row.is_settlement is true then
    raise exception 'Chỉ được hoàn tác hóa đơn chưa thu, chưa gộp hoặc hủy.';
  end if;
  select * into room_row from public.rooms where id = invoice_row.room_id for update;
  if not found or room_row.status <> 'occupied' or not exists (
    select 1 from public.contracts c
    where c.room_id = invoice_row.room_id and c.tenant_id = invoice_row.tenant_id
      and c.status = 'active' and c.created_at <= invoice_row.created_at
  ) then
    raise exception 'Phòng hoặc hợp đồng đã thay đổi. Không thể hoàn tác mốc điện nước.';
  end if;
  if exists (
    select 1 from public.invoices later
    where later.room_id = invoice_row.room_id
      and later.tenant_id = invoice_row.tenant_id
      and later.id <> invoice_row.id
      and later.payment_status not in ('cancelled', 'merged')
      and (coalesce(later.billing_reason, '') in ('first_month', 'monthly', 'room_cycle')
           or later.is_first_month is true)
      and (later.year, later.month) > (invoice_row.year, invoice_row.month)
  ) then
    raise exception 'Đã có hóa đơn kỳ sau. Không thể hoàn tác mốc điện nước.';
  end if;

  select * into room_row from public.rooms where id = invoice_row.room_id for update;
  if not found then raise exception 'Không tìm thấy phòng.'; end if;
  if room_row.electric_new is distinct from invoice_row.electric_new
     or room_row.water_new is distinct from invoice_row.water_new then
    raise exception 'Mốc điện nước đã thay đổi. Cần điều chỉnh thủ công trước khi hoàn tác.';
  end if;

  perform set_config('app.invoice_debt_reopen', 'on', true);
  update public.invoices
  set debt_confirmed_at = null, debt_confirmed_by = null,
      note = concat_ws(E'\n', note, '[Hoàn tác chốt nợ] ' || actor_id::text || ' ' || now()::text)
  where id = p_invoice_id
  returning * into invoice_row;

  update public.rooms
  set electric_old = invoice_row.electric_old,
      electric_new = invoice_row.electric_old,
      water_old = invoice_row.water_old,
      water_new = invoice_row.water_old
  where id = invoice_row.room_id;

  return jsonb_build_object('invoice', to_jsonb(invoice_row), 'applied', true);
end;
$$;

revoke all on function public.reopen_invoice_debt_atomic(text)
  from public, anon, authenticated;
grant execute on function public.reopen_invoice_debt_atomic(text)
  to authenticated;

create or replace function public.invoice_debt_schema_version()
returns integer language sql stable set search_path = ''
as $$ select 1; $$;
revoke all on function public.invoice_debt_schema_version() from public, anon;
grant execute on function public.invoice_debt_schema_version() to authenticated;
