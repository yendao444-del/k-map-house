begin;

-- Mandatory rollout sends unprepared accounts to enrollment. Enrollment itself
-- must remain available; account readiness is a progress metric, not a gate.
create or replace function management_security.guard_rollout_settings()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.enforce_management then
    if not new.enrollment_enabled then
      raise exception 'Mandatory MFA requires enrollment to remain enabled' using errcode='42501';
    end if;
    if to_regprocedure('public.security_mfa_readiness()') is null
      or to_regprocedure('public.security_service(text,uuid,uuid,text,text,jsonb)') is null
      or not exists (
        select 1 from pg_db_role_setting s join pg_roles r on r.oid=s.setrole,
          unnest(s.setconfig) setting
        where r.rolname='authenticator'
          and setting='pgrst.db_pre_request=public.security_management_pre_request'
      ) then
      raise exception 'Mandatory MFA requires the enrollment service and business request guard' using errcode='42501';
    end if;
  end if;
  return new;
end $$;

create or replace function public.security_rollout_status()
returns jsonb language plpgsql security definer set search_path='' as $$
declare total_count integer; ready_count integer; cfg management_security.settings; hook_ready boolean;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise insufficient_privilege; end if;
  select * into cfg from management_security.settings where singleton;
  select count(*) into total_count from public.users where status='active' and role in ('admin','user');
  select count(*) into ready_count
    from public.users u join management_security.accounts a on a.user_id=u.id
    where u.status='active' and u.role in ('admin','user') and a.recovery_ack_at is not null
      and exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.factor_type='totp' and f.status='verified');
  select exists(select 1 from pg_db_role_setting s join pg_roles r on r.oid=s.setrole,
    unnest(s.setconfig) setting where r.rolname='authenticator'
    and setting='pgrst.db_pre_request=public.security_management_pre_request') into hook_ready;
  return jsonb_build_object(
    'enrollment_enabled',cfg.enrollment_enabled,'enforce_management',cfg.enforce_management,
    'active_management_accounts',total_count,'ready_management_accounts',ready_count,
    'pending_enrollment_accounts',total_count-ready_count,
    'all_accounts_enrolled',total_count>0 and total_count=ready_count,
    'ready_for_enforcement',cfg.enrollment_enabled and hook_ready,
    'policy','mandatory_enrollment_before_business_access'
  );
end $$;
revoke all on function public.security_rollout_status() from public, anon, authenticated;
grant execute on function public.security_rollout_status() to service_role;
notify pgrst,'reload schema';
commit;
