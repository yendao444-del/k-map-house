-- Manual entry is separate from OCR photo confirmation; never invent a photo.
alter table public.tenant_payment_cycles add column if not exists electric_ocr_failures integer not null default 0;
alter table public.tenant_payment_cycles add column if not exists water_ocr_failures integer not null default 0;
create table if not exists public.tenant_meter_manual_entries (
 id uuid primary key default gen_random_uuid(), cycle_id uuid not null references public.tenant_payment_cycles(id),
 user_id uuid not null, meter text not null check(meter in ('electric','water')),
 reading integer not null, reason text not null check(reason in ('ocr_failed','camera_unavailable')),
 created_at timestamptz not null default now()
);
alter table public.tenant_meter_manual_entries enable row level security;
revoke all on public.tenant_meter_manual_entries from public,anon,authenticated;
grant all on public.tenant_meter_manual_entries to service_role;

create or replace function public.tenant_payment_fallback(p_user uuid,p_contract text,p_cycle uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contracts%rowtype; cy tenant_payment_cycles%rowtype; token uuid;
 m text:=p_data->>'meter'; n integer; old_n integer; failures integer; camera_error boolean:=p_data->'cameraError'='true'::jsonb;
begin
 c:=tenant_payment_scope(p_user,p_contract);
 perform pg_advisory_xact_lock(20261005,120000);
 select * into c from contracts where id=c.id for update;
 select * into cy from tenant_payment_cycles where id=p_cycle and contract_id=c.id for update;
 if not found or cy.invoice_id is not null then raise exception 'Kỳ này chưa mở ghi số hoặc đã có hóa đơn.';end if;
 if cy.revision<>coalesce(c.revision_no,1) then raise exception 'Hợp đồng đã thay đổi. Chủ nhà cần kiểm tra.';end if;
 if not exists(select 1 from rooms where id=c.room_id and status='occupied') then raise exception 'Phòng không còn đang thuê.';end if;
 if m is null or m not in ('electric','water') then raise exception 'Loại công tơ không hợp lệ.';end if;
 if p_action='ocr_failure' then
  if m='electric' then update tenant_payment_cycles set electric_ocr_failures=least(electric_ocr_failures+1,100) where id=cy.id;
  else update tenant_payment_cycles set water_ocr_failures=least(water_ocr_failures+1,100) where id=cy.id;end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_action is distinct from 'manual' then raise exception 'Thao tác không hợp lệ.';end if;
 failures:=case when m='electric' then cy.electric_ocr_failures else cy.water_ocr_failures end;
 -- Camera availability is declared by the user device, not proof of a photograph.
 if failures<2 and not coalesce(camera_error,false) then raise exception 'Hãy chụp lại. Nhập thủ công được mở sau 2 lần OCR lỗi hoặc khi camera không mở được.';end if;
 if jsonb_typeof(p_data->'reading') is distinct from 'number' or (p_data->>'reading') !~ '^\d{1,8}$' then raise exception 'Chỉ số phải là số nguyên.';end if;
 n:=(p_data->>'reading')::integer;old_n:=case when m='electric' then cy.electric_old else cy.water_old end;
 if n<old_n or n>99999999 or n-old_n>cy.elapsed_days*(case when m='electric' then 40 else 2 end) then raise exception 'Chỉ số thấp hơn số cũ hoặc tăng bất thường.';end if;
 insert into tenant_meter_manual_entries(cycle_id,user_id,meter,reading,reason)
 values(cy.id,p_user,m,n,case when coalesce(camera_error,false) then 'camera_unavailable' else 'ocr_failed' end) returning id into token;
 if m='electric' then update tenant_payment_cycles set electric_new=n,electric_source='manual' where id=cy.id;
 else update tenant_payment_cycles set water_new=n,water_source='manual' where id=cy.id;end if;
 return jsonb_build_object('source','manual','confirmationToken',token);
end $$;
revoke all on function public.tenant_payment_fallback(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tenant_payment_fallback(uuid,text,uuid,text,jsonb) to service_role;
