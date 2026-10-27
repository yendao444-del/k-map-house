begin;
-- Username resolution is now private to the server login endpoint.
revoke all on function public.resolve_login_email(text) from public,anon,authenticated;
grant execute on function public.resolve_login_email(text) to service_role;
commit;
