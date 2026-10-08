begin;
set local search_path=public,pg_temp;
create or replace function public.contract_account_readiness()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if coalesce(auth.role(),'')<>'service_role' and not exists(select 1 from users where id=auth.uid() and status='active') then raise exception 'Cần đăng nhập tài khoản hệ thống.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('contractId',c.id,'tenantId',c.tenant_id,
  'status',case when a.status='locked' then 'locked' when a.activated_at is not null then 'ready' else 'pending' end,
  'reason',case when a.activated_at is not null then null
   when tenant_system_email_conflict(cc.recipient_email) then 'Email nhận hợp đồng trùng tài khoản hệ thống. Cần xử lý hợp đồng lập nhầm và gửi lại bằng email riêng của khách.'
   when lower(btrim(t.email)) is distinct from lower(btrim(cc.recipient_email)) then 'Email hồ sơ đã thay đổi sau xác nhận. Link cũ vẫn dùng email lúc gửi hợp đồng.'
   else 'Khách đã xác nhận hợp đồng nhưng chưa hoàn tất đặt mật khẩu tài khoản website.' end))
  from contracts c join lateral (select recipient_email from contract_confirmations where contract_id=c.id and status='confirmed' order by confirmed_at desc limit 1) cc on true
  left join tenants t on t.id=c.tenant_id left join tenant_web_accounts a on a.tenant_id=c.tenant_id
  where c.status='active'),'[]'::jsonb);
end $$;
revoke all on function public.contract_account_readiness() from public,anon;
grant execute on function public.contract_account_readiness() to authenticated,service_role;

-- Publish only tables with staff RLS. Confirmation tokens/snapshots stay private.
do $$ declare relation text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
  foreach relation in array array['contracts','contract_drafts','tenant_web_accounts'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname=current_schema() and tablename=relation) then
    execute format('alter publication supabase_realtime add table %I.%I',current_schema(),relation);
   end if;
  end loop;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
