begin;
-- Remember this browser using its completed login. Only this operation may
-- reuse older MFA proof; revocation and all other transitions keep recency.
-- Patch the dispatcher in place so earlier session/recovery fixes survive.
do $migration$
declare definition text; original_guard text; replacement_guard text;
  original_device_guard text; replacement_device_guard text;
begin
  select pg_get_functiondef('public.security_service(text,uuid,uuid,text,text,jsonb)'::regprocedure) into definition;
  original_guard := 'if s.authorized_at is null or s.recovery_only or mfa_time is null or mfa_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds) then raise insufficient_privilege; end if;';
  replacement_guard := 'if s.authorized_at is null or s.recovery_only or mfa_time is null or (p_action is distinct from ''device_create'' and mfa_time<clock_timestamp()-make_interval(secs=>cfg.recent_seconds)) then raise insufficient_privilege; end if;';
  original_device_guard := 'if not email_ok then raise insufficient_privilege; end if;';
  replacement_device_guard := $guard$if a.user_id is null or a.recovery_ack_at is null
      or (s.email_required and not coalesce(email_ok,false))
      or (s.device_id is not null and not exists(
        select 1 from management_security.devices
        where id=s.device_id and user_id=p_user and revoked_at is null
          and expires_at>clock_timestamp() and ip_hash=p_ip and agent_hash=p_agent))
      or (not coalesce(email_ok,false) and (s.email_required or s.device_id is null))
    then raise insufficient_privilege; end if;$guard$;
  if position(replacement_guard in definition)>0 and position(replacement_device_guard in definition)>0 then return; end if;
  if (length(definition)-length(replace(definition,original_guard,'')))/length(original_guard)<>1
    or (length(definition)-length(replace(definition,original_device_guard,'')))/length(original_device_guard)<>1 then
    raise exception 'Remember-device migration: unexpected security dispatcher definition';
  end if;
  definition := replace(replace(definition,original_guard,replacement_guard),original_device_guard,replacement_device_guard);
  execute definition;
end $migration$;
notify pgrst,'reload schema';
commit;
