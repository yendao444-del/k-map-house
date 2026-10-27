begin;
create or replace function public.security_management_pre_request() returns void
language plpgsql security definer set search_path='' as $$
declare method text:=current_setting('request.method',true); path text:=current_setting('request.path',true); sensitive boolean;
begin
  if auth.role() is distinct from 'authenticated' then return; end if;
  if path='/rpc/security_mfa_readiness' then return; end if;
  -- RPCs default to POST in auth-js even when the function is a stable read.
  -- Directory reads require the authorized session, not a fresh step-up.
  sensitive:=coalesce(method,'GET') not in ('GET','HEAD','OPTIONS') and path not in (
    '/rpc/admin_pwa_investment_read','/rpc/email_server_status',
    '/rpc/contract_account_readiness','/rpc/tenant_email_check',
    '/rpc/management_user_directory');
  if not public.security_management_access_allowed(sensitive) then raise exception 'Management MFA/session verification required' using errcode='42501'; end if;
  if current_setting('transaction_read_only')='off' and coalesce(auth.jwt()->>'session_id','') ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    update management_security.sessions set last_activity_at=clock_timestamp()
      where session_id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid() and revoked_at is null and last_activity_at<clock_timestamp()-interval '30 seconds';
  end if;
end $$;
notify pgrst,'reload schema';
commit;
