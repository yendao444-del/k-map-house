begin;

create or replace function management_security.guard_rollout_settings()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.enforce_management and exists (
    select 1 from public.users u
    where u.status='active' and u.role in ('admin','user')
      and not exists (select 1 from auth.mfa_factors f where f.user_id=u.id and f.factor_type='totp' and f.status='verified')
  ) then
    raise exception 'Management MFA rollout requires every active admin/staff account to verify TOTP' using errcode='42501';
  end if;
  if new.enforce_management and exists (
    select 1 from public.users u
    left join management_security.accounts a on a.user_id=u.id
    where u.status='active' and u.role in ('admin','user')
      and (a.recovery_ack_at is null or not exists (select 1 from auth.mfa_factors f where f.user_id=u.id and f.factor_type='totp' and f.status='verified'))
  ) then
    raise exception 'Management MFA rollout requires recovery acknowledgement for every active admin/staff account' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists management_security_rollout_guard on management_security.settings;
create trigger management_security_rollout_guard
before insert or update on management_security.settings
for each row execute function management_security.guard_rollout_settings();

create or replace function public.security_rollout_status()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare total_count integer; ready_count integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise insufficient_privilege; end if;
  select count(*) into total_count from public.users where status='active' and role in ('admin','user');
  select count(*) into ready_count
  from public.users u join management_security.accounts a on a.user_id=u.id
  where u.status='active' and u.role in ('admin','user') and a.recovery_ack_at is not null
    and exists (select 1 from auth.mfa_factors f where f.user_id=u.id and f.factor_type='totp' and f.status='verified');
  return jsonb_build_object(
    'enrollment_enabled',(select enrollment_enabled from management_security.settings where singleton),
    'enforce_management',(select enforce_management from management_security.settings where singleton),
    'active_management_accounts',total_count,
    'ready_management_accounts',ready_count,
    'ready_for_enforcement',total_count>0 and total_count=ready_count
  );
end;
$$;
revoke all on function public.security_rollout_status() from public, anon, authenticated;
grant execute on function public.security_rollout_status() to service_role;
notify pgrst,'reload schema';
commit;
