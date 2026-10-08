begin;

-- Staff and tenant logins must have separate email identities. Existing records
-- are preserved; checks apply to new writes and subsequent lifecycle actions.
create or replace function public.tenant_system_email_conflict(p_email text)
returns boolean language sql volatile security definer set search_path=public,pg_temp as $$
 select nullif(lower(btrim(p_email)),'') is not null and (
  exists(select 1 from users u left join auth.users a on a.id=u.id
   where lower(btrim(u.email))=lower(btrim(p_email))
    and coalesce(a.raw_app_meta_data->>'portal_role','') not in ('webmobile_tenant','webmobile_demo_tenant'))
  or exists(select 1 from auth.users a where lower(btrim(a.email))=lower(btrim(p_email))
   and coalesce(a.raw_app_meta_data->>'portal_role','') not in ('webmobile_tenant','webmobile_demo_tenant'))
 );
$$;
revoke all on function public.tenant_system_email_conflict(text) from public,anon,authenticated;
grant execute on function public.tenant_system_email_conflict(text) to service_role;

-- UI receives only a verdict, never staff emails or identities. Both active and
-- disabled staff accounts reserve their email. No anonymous lookup endpoint.
create or replace function public.tenant_email_check(p_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if coalesce(auth.role(),'')<>'service_role' and not exists(select 1 from users where id=auth.uid() and status='active') then
  raise exception 'Cần đăng nhập tài khoản hệ thống để kiểm tra email.';
 end if;
 return jsonb_build_object('allowed',not tenant_system_email_conflict(p_email),
  'reason',case when tenant_system_email_conflict(p_email) then 'Email này thuộc tài khoản hệ thống. Hãy dùng email riêng của người thuê.' else null end);
end $$;
revoke all on function public.tenant_email_check(text) from public,anon;
grant execute on function public.tenant_email_check(text) to authenticated,service_role;

create or replace function public.guard_tenant_system_email()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare email_value text;
begin
 if tg_table_name='tenants' then
  if tg_op='UPDATE' and new.email is not distinct from old.email then return new; end if;
  email_value:=new.email;
 elsif tg_table_name='contract_drafts' then
  if new.status<>'draft' then return new; end if;
  email_value:=new.recipient_email;
 elsif tg_table_name='contract_confirmations' then
  if tg_op='UPDATE' and not (new.status='confirmed' and old.status is distinct from new.status
    or new.account_lease is not null and old.account_lease is distinct from new.account_lease
    or new.recipient_email is distinct from old.recipient_email) then return new; end if;
  email_value:=new.recipient_email;
 else
  email_value:=new.email;
 end if;
 if nullif(btrim(email_value),'') is not null then
  perform pg_advisory_xact_lock(hashtext('tenant-email:'||lower(btrim(email_value))));
  if tenant_system_email_conflict(email_value) then
   raise exception 'Email này thuộc tài khoản hệ thống. Hãy dùng email riêng của người thuê.';
  end if;
 end if;
 if tg_table_name='contract_drafts' then
  if tenant_system_email_conflict(new.snapshot#>>'{tenant,email}') then
   raise exception 'Email này thuộc tài khoản hệ thống. Hãy dùng email riêng của người thuê.';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_tenant_system_email() from public,anon,authenticated;
drop trigger if exists guard_tenant_system_email on public.tenants;
create trigger guard_tenant_system_email before insert or update of email on public.tenants for each row execute function public.guard_tenant_system_email();
drop trigger if exists guard_draft_system_email on public.contract_drafts;
create trigger guard_draft_system_email before insert or update of recipient_email,snapshot on public.contract_drafts for each row execute function public.guard_tenant_system_email();
drop trigger if exists guard_confirmation_system_email on public.contract_confirmations;
create trigger guard_confirmation_system_email before insert or update of status,account_lease,recipient_email on public.contract_confirmations for each row execute function public.guard_tenant_system_email();
drop trigger if exists guard_account_system_email on public.tenant_web_accounts;
create trigger guard_account_system_email before insert or update of email on public.tenant_web_accounts for each row execute function public.guard_tenant_system_email();

-- The reciprocal guard shares the same lock, so concurrent staff and tenant
-- creation cannot reserve the same email. Portal Auth profile provisioning is
-- excluded using trusted Auth metadata; no client flag on a tenant can bypass it.
create or replace function public.guard_system_tenant_email()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare portal text;
begin
 if tg_op='UPDATE' and new.email is not distinct from old.email then return new; end if;
 if tg_table_schema='auth' then portal:=new.raw_app_meta_data->>'portal_role';
 else select raw_app_meta_data->>'portal_role' into portal from auth.users where id=new.id; end if;
 if coalesce(portal,'') in ('webmobile_tenant','webmobile_demo_tenant') or nullif(btrim(new.email),'') is null then return new; end if;
 perform pg_advisory_xact_lock(hashtext('tenant-email:'||lower(btrim(new.email))));
 if exists(select 1 from tenants where lower(btrim(email))=lower(btrim(new.email))) then
  raise exception 'Email này đã được dùng trong hồ sơ khách thuê. Tài khoản hệ thống phải dùng email riêng.';
 end if;
 return new;
end $$;
revoke all on function public.guard_system_tenant_email() from public,anon,authenticated;
drop trigger if exists guard_system_tenant_email on public.users;
create trigger guard_system_tenant_email before insert or update of email on public.users for each row execute function public.guard_system_tenant_email();
drop trigger if exists guard_system_tenant_email on auth.users;
create trigger guard_system_tenant_email before insert or update of email on auth.users for each row execute function public.guard_system_tenant_email();

notify pgrst,'reload schema';
commit;
