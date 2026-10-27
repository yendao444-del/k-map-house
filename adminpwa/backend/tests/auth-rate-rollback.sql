begin;
do $test$
declare k text := encode(extensions.gen_random_bytes(32),'hex'); l text := encode(extensions.gen_random_bytes(32),'hex'); i integer;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  for i in 1..10 loop
    if not public.admin_pwa_auth_rate(k,l) then raise exception 'Rate limiter rejected allowed attempt'; end if;
  end loop;
  if public.admin_pwa_auth_rate(k,l) then raise exception 'Rate limiter allowed excess attempt'; end if;
  update public.admin_pwa_auth_limits set window_started_at=clock_timestamp()-interval '16 minutes' where key in ('ip:'||k,'login:'||l);
  if not public.admin_pwa_auth_rate(k,l) then raise exception 'Expired window did not recover'; end if;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  begin
    perform public.admin_pwa_auth_rate(k,l);
    raise exception 'Anonymous caller accessed rate service';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$test$;
rollback;
