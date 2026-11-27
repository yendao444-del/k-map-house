-- The pre-request hook guards every API call, including DBY Finance RPCs. It
-- must only check the login session (as before app access existed), not the
-- rental-app grant; otherwise a DBY-only account is blocked everywhere.
-- Rental data stays gated by RLS via public.security_management_access_allowed.
-- The allowlist of non-sensitive paths is unchanged.
do $$
declare def text;
begin
  def := pg_get_functiondef('public.security_management_pre_request()'::regprocedure);
  if position('public.security_management_access_allowed(sensitive)' in def) = 0 then
    raise exception 'Unexpected security_management_pre_request definition';
  end if;
  execute replace(def, 'public.security_management_access_allowed(sensitive)', 'management_security.session_access_allowed(sensitive)');
end $$;
