begin;
do $test$
declare
  actor record;
  expected integer;
  visible integer;
  affected integer;
begin
  select count(*) into expected from public.users;
  for actor in select distinct on (role) id,role from public.users where status='active' and role in ('admin','user') order by role,id loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    select count(*) into visible from public.users;
    if actor.role='admin' and visible <> expected then raise exception 'Admin directory read denied'; end if;
    if actor.role='user' and visible <> 1 then raise exception 'Staff directory overexposed'; end if;
    update public.users set full_name=full_name where id=actor.id;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'Self profile update denied'; end if;
    if actor.role='user' then
      begin
        update public.users set role='admin' where id=actor.id;
        raise exception 'Staff escalation unexpectedly allowed';
      exception when insufficient_privilege then null;
      end;
    end if;
    execute 'reset role';
    -- Simulate a revoked management account inside this transaction only.
    update public.users set status='inactive' where id=actor.id;
    execute 'set local role authenticated';
    select count(*) into visible from public.users where id<>auth.uid();
    if visible<>0 then raise exception 'Inactive account directory leak'; end if;
    if public.management_directory_access() then raise exception 'Inactive directory access allowed'; end if;
    select count(*) into visible from public.app_settings;
    if visible<>0 then raise exception 'Inactive account settings leak'; end if;
    execute 'reset role';
    update public.users set status='active' where id=actor.id;
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select count(*) into visible from public.users;
  if visible<>0 then raise exception 'Unknown authenticated directory leak'; end if;
  if public.management_directory_access() then raise exception 'Unknown directory access allowed'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  begin
    perform public.management_directory_access();
    raise exception 'Anonymous helper access unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$test$;
rollback;
