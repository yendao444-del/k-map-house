begin;
set local search_path=public,pg_temp;

-- Owner identified this replacement lease as a test on 08/10/2026.
-- Scope designation to the exact lease, room and tenant, never future leases.
insert into public.contract_test_designations(contract_id,room_id,tenant_id,reason)
select c.id,c.room_id,c.tenant_id,'Chủ nhà yêu cầu bổ sung lý do thử nghiệm / kiểm thử cho hợp đồng phòng 999, ngày 08/10/2026'
from public.contracts c
where c.id='contract_5f951395-b5a5-4f2c-9fd2-766b0aa388de'
  and c.room_id='room-1791197579415-sgwfup89'
  and c.tenant_id='tenant-1791206769026-rqk3wsos'
  and c.tenant_name='Đỗ Kim Ngân'
  and c.status='active'
  and (public.contract_cancellation_check(c.id)->>'allowed')::boolean
on conflict do nothing;

commit;
