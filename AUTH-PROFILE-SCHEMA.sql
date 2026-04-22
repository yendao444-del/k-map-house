create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  full_name text not null,
  avatar_url text,
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.users enable row level security;

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_username text;
  derived_full_name text;
begin
  derived_username := coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(coalesce(new.email, new.id::text), '@', 1)
  );

  derived_full_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    derived_username,
    new.email,
    new.id::text
  );

  insert into public.users (id, email, username, full_name, avatar_url)
  values (
    new.id,
    new.email,
    derived_username,
    derived_full_name,
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    username = coalesce(public.users.username, excluded.username),
    full_name = coalesce(public.users.full_name, excluded.full_name),
    avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();

create or replace function public.handle_auth_user_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set
    email = new.email,
    last_login_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;

create trigger on_auth_user_login
after update of last_sign_in_at on auth.users
for each row
when (old.last_sign_in_at is distinct from new.last_sign_in_at)
execute function public.handle_auth_user_login();

drop policy if exists "users_select_authenticated" on public.users;
create policy "users_select_authenticated"
on public.users
for select
to authenticated
using (true);

drop policy if exists "users_update_self_profile" on public.users;
create policy "users_update_self_profile"
on public.users
for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  and role = (select u.role from public.users u where u.id = auth.uid())
  and status = (select u.status from public.users u where u.id = auth.uid())
);

drop policy if exists "users_update_admin" on public.users;
create policy "users_update_admin"
on public.users
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
      and u.status = 'active'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
      and u.status = 'active'
  )
);
