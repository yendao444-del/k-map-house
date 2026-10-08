begin;
set local search_path=public,pg_temp;
-- Extend the existing audited policy; keep its 24-hour deadline, admin check,
-- financial checks and account revocation transaction intact.
do $$ declare source text; begin
 select pg_get_functiondef('public.contract_cancel(text,uuid,text,text,text)'::regprocedure) into source;
 if position('p_kind=''wrong_email''' in source)=0 then
  if position('elsif p_kind=''wrong_tenant'' then' in source)=0 then raise exception 'Cancellation function shape changed; inspect before migration.'; end if;
  source:=replace(source,'elsif p_kind=''wrong_tenant'' then',
  'elsif p_kind=''wrong_email'' then
   select lower(btrim(t.email)) into target_label from tenants t
    where t.id=c.tenant_id and t.id=p_reference and t.is_active
    and t.email ~ ''^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$''
    and not tenant_system_email_conflict(t.email)
    and lower(btrim(t.email)) is distinct from (select lower(btrim(cc.recipient_email)) from contract_confirmations cc
      join contract_drafts d on d.id=cc.draft_id where cc.contract_id=c.id and cc.confirmed_at is not null and d.parent_contract_id is null order by cc.confirmed_at limit 1);
   explanation:=''Nhập nhầm email; email đúng trong hồ sơ: '';
  elsif p_kind=''wrong_tenant'' then');
  source:=replace(source,'when ''wrong_tenant'' then ''Chọn nhầm hồ sơ khách thuê. ''','when ''wrong_email'' then ''Nhập nhầm email nhận hợp đồng. '' when ''wrong_tenant'' then ''Chọn nhầm hồ sơ khách thuê. ''');
  execute source;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
