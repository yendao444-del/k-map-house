begin;
-- Mirror the Storage API setting, solely for rollback-only metadata fixtures.
set local storage.allow_delete_query = 'true';
do $test$
declare
  actor record;
  object_name text := 'security-rollback/' || gen_random_uuid()::text || '.jpg';
  affected integer;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    insert into storage.objects(bucket_id,name) values('room-images',object_name);
    raise exception 'Anonymous upload unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  for actor in select distinct on (role) id,role from public.users where status='active' and role in ('admin','user') order by role,id loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub',actor.id,'role','authenticated')::text, true);
    execute 'set local role authenticated';
    insert into storage.objects(bucket_id,name) values('room-images',object_name);
    execute 'reset role';
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    delete from storage.objects where bucket_id='room-images' and name=object_name;
    get diagnostics affected=row_count;
    if affected<>0 then raise exception 'Anonymous delete unexpectedly allowed'; end if;
    execute 'reset role';
    perform set_config('request.jwt.claims', jsonb_build_object('sub',actor.id,'role','authenticated')::text, true);
    execute 'set local role authenticated';
    delete from storage.objects where bucket_id='room-images' and name=object_name;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'Manager delete unexpectedly denied'; end if;
    execute 'reset role';
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin
    insert into storage.objects(bucket_id,name) values('room-images',object_name);
    raise exception 'Unknown user upload unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$test$;
rollback;
