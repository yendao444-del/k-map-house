-- Allow pre-auth flows to resolve either an active username or the exact
-- email address stored in the application profile.
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
    and u.email is not null
    and (
      lower(u.username) = lower(btrim(login_name))
      or lower(u.email) = lower(btrim(login_name))
    )
  limit 1
$$;

revoke all on function public.resolve_login_email(text) from public;
revoke all on function public.resolve_login_email(text) from anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon;

comment on function public.resolve_login_email(text) is
  'Pre-auth lookup for an exact active username or system email. Used by sign-in and password recovery.';
