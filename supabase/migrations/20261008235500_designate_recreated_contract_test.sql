begin;
-- Owner is testing this recreated lease. Scope to its exact identity;
-- a future tenant/lease in room 999 does not inherit test privileges.
insert into public.contract_test_designations(contract_id,room_id,tenant_id,reason)
 select id,room_id,tenant_id,'Chủ nhà yêu cầu lý do Đang kiểm thử hệ thống, không gửi thông báo hủy, ngày 08/10/2026'
 from public.contracts where id='contract_fc8c6ddc-ad62-41d4-a26a-0b750f1ee24f'
 and room_id='room-1791197579415-sgwfup89'
 and tenant_id='tenant-1791206769026-rqk3wsos' and tenant_name='Đỗ Kim Ngân'
 and status='active' and (public.contract_cancellation_check(id)->>'allowed')::boolean
 on conflict do nothing;
commit;
