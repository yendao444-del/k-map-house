-- Resolve an active app username to the email expected by Supabase Auth.
-- This function must be callable before sign-in, so access is limited to anon.
create or replace function public.resolve_login_email(login_name text)
returns text
language sql
stable
strict
security definer
set search_path = ''
as $$
  select u.email
  from public.users as u
  where char_length(btrim(login_name)) between 1 and 128
    and u.status = 'active'
    and u.username is not null
    and lower(u.username) = lower(btrim(login_name))
    and u.email is not null
  limit 1
$$;

revoke all on function public.resolve_login_email(text) from public;
revoke all on function public.resolve_login_email(text) from anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon;

comment on function public.resolve_login_email(text) is
  'Pre-auth username lookup used by the desktop sign-in flow. Returns an email only for an exact active username.';
