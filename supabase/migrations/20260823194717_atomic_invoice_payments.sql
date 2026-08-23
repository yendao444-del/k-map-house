-- Append-only payment ledger for globally unique external transaction keys.
-- Existing invoice rows are intentionally not modified or backfilled.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null references public.invoices(id) on delete restrict,
  amount integer not null check (amount <> 0),
  payment_method text not null check (payment_method in ('cash', 'transfer')),
  payment_date date not null,
  note text,
  external_ref text,
  external_id text,
  source text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_event_keys (
  key text primary key check (key = lower(btrim(key)) and key <> ''),
  event_id uuid not null references public.payment_events(id) on delete cascade,
  invoice_id text not null references public.invoices(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_invoice_id_created_at_idx
  on public.payment_events (invoice_id, created_at desc);

alter table public.payment_events enable row level security;
alter table public.payment_event_keys enable row level security;

revoke all on table public.payment_events from public, anon, authenticated;
revoke all on table public.payment_event_keys from public, anon, authenticated;

create or replace function public.record_invoice_payment_atomic(
  p_invoice_id text,
  p_amount integer,
  p_payment_method text,
  p_payment_date date,
  p_note text default null,
  p_external_ref text default null,
  p_external_id text default null,
  p_source text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invoice_row public.invoices%rowtype;
  updated_row public.invoices%rowtype;
  event_id uuid;
  duplicate_invoice_id text;
  ref_key text := nullif(lower(btrim(p_external_ref)), '');
  id_key text := nullif(lower(btrim(p_external_id)), '');
  current_paid integer;
  new_paid integer;
  next_status text;
  payment_record jsonb;
  transitioned_to_paid boolean;
begin
  if actor_id is null or not exists (
    select 1
    from public.users as u
    where u.id = actor_id and u.status = 'active'
  ) then
    raise exception 'Phiên đăng nhập không hợp lệ hoặc tài khoản đã bị vô hiệu hóa.'
      using errcode = '42501';
  end if;

  if p_amount is null or p_amount = 0 then
    raise exception 'Số tiền thu không hợp lệ.';
  end if;

  if p_payment_method not in ('cash', 'transfer') then
    raise exception 'Phương thức thanh toán không hợp lệ.';
  end if;

  if p_payment_date is null then
    raise exception 'Ngày thanh toán không hợp lệ.';
  end if;

  if lower(coalesce(p_source, '')) = 'sepay' and ref_key is null and id_key is null then
    raise exception 'Giao dịch SePay thiếu mã đối soát.';
  end if;

  select *
  into invoice_row
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Không tìm thấy hóa đơn.';
  end if;

  if invoice_row.payment_status in ('cancelled', 'merged') then
    raise exception 'Không thể ghi nhận tiền vào hóa đơn đã hủy hoặc đã gộp.';
  end if;

  -- Detect keys already stored in legacy JSON payment records without altering them.
  if ref_key is not null or id_key is not null then
    select i.id
    into duplicate_invoice_id
    from public.invoices as i
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(i.payment_records) = 'array' then i.payment_records
        else '[]'::jsonb
      end
    ) as record(value)
    where (
      ref_key is not null
      and ref_key in (
        nullif(lower(btrim(record.value->>'external_ref')), ''),
        nullif(lower(btrim(record.value->>'external_id')), '')
      )
    ) or (
      id_key is not null
      and id_key in (
        nullif(lower(btrim(record.value->>'external_ref')), ''),
        nullif(lower(btrim(record.value->>'external_id')), '')
      )
    )
    limit 1;

    if duplicate_invoice_id is not null then
      if duplicate_invoice_id = p_invoice_id then
        return jsonb_build_object(
          'invoice', to_jsonb(invoice_row),
          'applied', false,
          'duplicate', true,
          'transitioned_to_paid', false
        );
      end if;
      raise exception 'Giao dịch này đã được ghi nhận cho một hóa đơn khác.';
    end if;

    select k.invoice_id
    into duplicate_invoice_id
    from public.payment_event_keys as k
    where k.key in (ref_key, id_key)
    limit 1;

    if duplicate_invoice_id is not null then
      if duplicate_invoice_id = p_invoice_id then
        return jsonb_build_object(
          'invoice', to_jsonb(invoice_row),
          'applied', false,
          'duplicate', true,
          'transitioned_to_paid', false
        );
      end if;
      raise exception 'Giao dịch này đã được ghi nhận cho một hóa đơn khác.';
    end if;
  end if;

  if invoice_row.payment_status = 'paid' then
    return jsonb_build_object(
      'invoice', to_jsonb(invoice_row),
      'applied', false,
      'duplicate', false,
      'transitioned_to_paid', false
    );
  end if;

  current_paid := coalesce(invoice_row.paid_amount, 0);
  new_paid := current_paid + p_amount;

  if coalesce(invoice_row.total_amount, 0) > 0 then
    if p_amount < 0 or new_paid > invoice_row.total_amount then
      raise exception 'Số tiền vượt quá số tiền còn phải thu của hóa đơn.';
    end if;
    next_status := case when new_paid = invoice_row.total_amount then 'paid' else 'partial' end;
  elsif coalesce(invoice_row.total_amount, 0) < 0 then
    if p_amount > 0 or new_paid < invoice_row.total_amount then
      raise exception 'Số tiền hoàn vượt quá giá trị phải hoàn của hóa đơn.';
    end if;
    next_status := case when new_paid = invoice_row.total_amount then 'paid' else 'partial' end;
  else
    raise exception 'Hóa đơn có tổng tiền bằng 0, không thể ghi nhận thêm thanh toán.';
  end if;

  begin
    insert into public.payment_events (
      invoice_id, amount, payment_method, payment_date, note,
      external_ref, external_id, source, created_by
    )
    values (
      p_invoice_id, p_amount, p_payment_method, p_payment_date, p_note,
      nullif(btrim(p_external_ref), ''), nullif(btrim(p_external_id), ''),
      nullif(btrim(p_source), ''), actor_id
    )
    returning id into event_id;

    insert into public.payment_event_keys (key, event_id, invoice_id)
    select distinct candidate.key, event_id, p_invoice_id
    from (
      values (ref_key), (id_key)
    ) as candidate(key)
    where candidate.key is not null
    order by candidate.key;
  exception
    when unique_violation then
      select k.invoice_id
      into duplicate_invoice_id
      from public.payment_event_keys as k
      where k.key in (ref_key, id_key)
      limit 1;

      if duplicate_invoice_id = p_invoice_id then
        return jsonb_build_object(
          'invoice', to_jsonb(invoice_row),
          'applied', false,
          'duplicate', true,
          'transitioned_to_paid', false
        );
      end if;
      raise exception 'Giao dịch này đã được ghi nhận cho một hóa đơn khác.';
  end;

  payment_record := jsonb_strip_nulls(jsonb_build_object(
    'id', 'pay-' || replace(gen_random_uuid()::text, '-', ''),
    'amount', p_amount,
    'payment_method', p_payment_method,
    'payment_date', p_payment_date,
    'note', p_note,
    'external_ref', nullif(btrim(p_external_ref), ''),
    'external_id', nullif(btrim(p_external_id), ''),
    'source', nullif(btrim(p_source), ''),
    'created_at', now()
  ));

  transitioned_to_paid := invoice_row.payment_status is distinct from 'paid' and next_status = 'paid';

  update public.invoices
  set paid_amount = new_paid,
      payment_status = next_status,
      payment_method = p_payment_method,
      payment_date = p_payment_date,
      payment_records = coalesce(payment_records, '[]'::jsonb) || jsonb_build_array(payment_record)
  where id = p_invoice_id
  returning * into updated_row;

  return jsonb_build_object(
    'invoice', to_jsonb(updated_row),
    'applied', true,
    'duplicate', false,
    'transitioned_to_paid', transitioned_to_paid
  );
end;
$$;

revoke all on function public.record_invoice_payment_atomic(
  text, integer, text, date, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.record_invoice_payment_atomic(
  text, integer, text, date, text, text, text, text
) to authenticated;

comment on function public.record_invoice_payment_atomic(
  text, integer, text, date, text, text, text, text
) is 'Atomically records an invoice payment and globally deduplicates external transaction keys.';
