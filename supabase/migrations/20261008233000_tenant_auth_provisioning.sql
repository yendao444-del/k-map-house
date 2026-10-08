begin;

-- GoTrue applies admin app_metadata AFTER its initial auth.users INSERT.
-- A service-only reservation lets the INSERT trigger classify that initial row
-- from a verified tenant/confirmation, never from client user_metadata.
create table if not exists public.tenant_auth_provisions (
 user_id uuid primary key,
 tenant_id text not null references public.tenants(id) on delete cascade,
 email text not null unique,
 confirmation_id uuid references public.contract_confirmations(id) on delete cascade,
 expires_at timestamptz not null
);
alter table public.tenant_auth_provisions enable row level security;
revoke all on public.tenant_auth_provisions from public,anon,authenticated;
grant all on public.tenant_auth_provisions to service_role;

create or replace function public.webmobile_prepare_tenant_auth(p_user uuid,p_tenant text,p_email text,p_actor uuid,p_confirmation uuid default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c contract_confirmations;
begin
 if p_user is null or p_user='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'Invalid portal identity'; end if;
 if not exists(select 1 from users where id=p_actor and role='admin' and status='active') then raise exception 'Admin required'; end if;
 if not exists(select 1 from tenants where id=p_tenant and is_active and lower(btrim(email))=p_email) then raise exception 'Tenant/email mismatch'; end if;
 if p_confirmation is not null then
  select * into c from contract_confirmations where id=p_confirmation;
  if c.id is null or c.status<>'confirmed' or c.account_ready_at is not null or c.expires_at<=now()
   or c.account_locked_until is null or c.account_locked_until<=now() or c.account_lease is null or c.account_user_id is distinct from p_user
   or c.recipient_email is distinct from p_email or c.created_by is distinct from p_actor
   or (c.snapshot#>>'{tenant,id}') is distinct from p_tenant
   or not exists(select 1 from contracts where id=c.contract_id and tenant_id=p_tenant and status='active') then
   raise exception 'Phiên cấp tài khoản đã thay đổi.';
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtext('tenant-email:'||p_email));
 if tenant_system_email_conflict(p_email) then raise exception 'Email này thuộc tài khoản hệ thống. Hãy dùng email riêng của người thuê.'; end if;
 if exists(select 1 from auth.users where id=p_user) or exists(select 1 from tenant_web_accounts where tenant_id=p_tenant or email=p_email) then raise exception 'Khách này đã có tài khoản website.'; end if;
 delete from tenant_auth_provisions where expires_at<=now();
 insert into tenant_auth_provisions(user_id,tenant_id,email,confirmation_id,expires_at)
 values(p_user,p_tenant,p_email,p_confirmation,now()+interval '60 seconds')
 on conflict(user_id) do update set expires_at=excluded.expires_at
 where tenant_auth_provisions.tenant_id=excluded.tenant_id and tenant_auth_provisions.email=excluded.email
  and tenant_auth_provisions.confirmation_id is not distinct from excluded.confirmation_id;
 if not found then raise exception 'Portal reservation mismatch'; end if;
end $$;
revoke all on function public.webmobile_prepare_tenant_auth(uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.webmobile_prepare_tenant_auth(uuid,text,text,uuid,uuid) to service_role;

create or replace function public.guard_system_tenant_email()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare portal text; provision tenant_auth_provisions;
begin
 if tg_op='UPDATE' and new.email is not distinct from old.email then return new; end if;
 if tg_table_schema='auth' then
  if tg_op='INSERT' then
   select * into provision from tenant_auth_provisions where user_id=new.id and email=lower(btrim(new.email)) and expires_at>now() for update;
   if provision.user_id is not null then
    perform pg_advisory_xact_lock(hashtext('tenant-email:'||provision.email));
    if tenant_system_email_conflict(provision.email) then raise exception 'Email này thuộc tài khoản hệ thống. Hãy dùng email riêng của người thuê.'; end if;
    if not exists(select 1 from tenants where id=provision.tenant_id and is_active and lower(btrim(email))=provision.email) then raise exception 'Tenant/email mismatch'; end if;
    new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('portal_role','webmobile_tenant');
    if provision.confirmation_id is not null then
     new.raw_app_meta_data:=new.raw_app_meta_data||jsonb_build_object('contract_confirmation_id',provision.confirmation_id);
    end if;
    new.role:='anon';
    delete from tenant_auth_provisions where user_id=new.id;
   end if;
  end if;
  portal:=new.raw_app_meta_data->>'portal_role';
 else select raw_app_meta_data->>'portal_role' into portal from auth.users where id=new.id; end if;
 if coalesce(portal,'') in ('webmobile_tenant','webmobile_demo_tenant') then
  -- Portal users must never get a staff profile, even during Auth provisioning.
  if tg_table_schema<>'auth' and tg_op='INSERT' then return null; end if;
  return new;
 end if;
 if nullif(btrim(new.email),'') is null then return new; end if;
 perform pg_advisory_xact_lock(hashtext('tenant-email:'||lower(btrim(new.email))));
 if exists(select 1 from tenants where lower(btrim(email))=lower(btrim(new.email))) then
  raise exception 'Email này đã được dùng trong hồ sơ khách thuê. Tài khoản hệ thống phải dùng email riêng.';
 end if;
 return new;
end $$;
revoke all on function public.guard_system_tenant_email() from public,anon,authenticated;

create or replace function public.contract_account_claim(p_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c contract_confirmations; lease uuid:=gen_random_uuid();
begin
 select * into c from contract_confirmations where token_hash=p_hash for update;
 if c.id is null or c.status<>'confirmed' or c.expires_at<=now() or c.account_ready_at is not null then raise exception 'Link cấp tài khoản đã dùng hoặc hết hạn.'; end if;
 if c.account_locked_until>now() then raise exception 'Đang cấp tài khoản. Hãy chờ một phút rồi thử lại.'; end if;
 if not exists(select 1 from contracts where id=c.contract_id and status='active') then raise exception 'Hợp đồng không còn hiệu lực.'; end if;
 update contract_confirmations set account_lease=lease,account_locked_until=now()+interval '60 seconds' where id=c.id;
 if not exists(select 1 from auth.users where id=c.account_user_id) then
  perform webmobile_prepare_tenant_auth(c.account_user_id,c.snapshot#>>'{tenant,id}',c.recipient_email,c.created_by,c.id);
 end if;
 return jsonb_build_object('id',c.id,'lease',lease,'userId',c.account_user_id,'email',c.recipient_email,'name',c.snapshot#>>'{tenant,full_name}');
end $$;
revoke all on function public.contract_account_claim(text) from public,anon,authenticated;
grant execute on function public.contract_account_claim(text) to service_role;
notify pgrst,'reload schema';
commit;
