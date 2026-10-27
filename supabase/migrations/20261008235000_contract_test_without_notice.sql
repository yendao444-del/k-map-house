begin;
-- Keep test cancellation outside the notification outbox, including legacy
-- pending rows; retain sent/uncertain records as historical evidence.
do $$ declare source text; begin
 source:=pg_get_functiondef('public.contract_cancel(text,uuid,text,text,text)'::regprocedure);
 if position('Đang kiểm thử hệ thống.' in source)=0 then
  source:=replace(source,'if length(btrim(coalesce(p_reason,''''))) not between 5 and 1000 then',
   'if p_kind=''test_reset'' then p_reason:=''Đang kiểm thử hệ thống.''; end if;
 if length(btrim(coalesce(p_reason,''''))) not between 5 and 1000 then');
 end if;
 -- Handles existing deployments which still create a notice for test resets.
 if position('if p_kind<>''test_reset'' then' in source)=0 then
  source:=replace(source,'insert into contract_cancellation_notices(contract_id,recipient,tenant_name,room_name,reason,cancelled_at)',
   'if p_kind<>''test_reset'' then
 insert into contract_cancellation_notices(contract_id,recipient,tenant_name,room_name,reason,cancelled_at)');
  source:=replace(source,'on conflict do nothing;
 return result;', 'on conflict do nothing;
 end if;
 return result;');
 end if;
 if position('if p_kind<>''test_reset'' then' in source)=0 or position('Đang kiểm thử hệ thống.' in source)=0 then raise exception 'Unexpected cancellation function shape'; end if;
 execute source;

 source:=pg_get_functiondef('public.contract_cancellation_notice(text,uuid,text,uuid,text,text)'::regprocedure);
 if position('Test cancellation has no notification' in source)=0 then
  source:=replace(source,'if p_action=''list'' then',
   '-- Test cancellation has no notification, regardless of the calling UI.
 if p_action=''claim'' and exists(select 1 from contracts where id=p_contract and cancellation_kind=''test_reset'') then
  return jsonb_build_object(''claimed'',false,''status'',''suppressed'');
 end if;
 if p_action=''list'' then');
  source:=replace(source,'from contract_cancellation_notices where status=''pending''',
   'from contract_cancellation_notices queued where status=''pending'' and not exists(select 1 from contracts c where c.id=queued.contract_id and c.cancellation_kind=''test_reset'')');
 end if;
 source:=replace(source,'from contract_cancellation_notices n where status=''pending'' and not exists(select 1 from contracts c where c.id=n.contract_id',
  'from contract_cancellation_notices queued where status=''pending'' and not exists(select 1 from contracts c where c.id=queued.contract_id');
 if position('Test cancellation has no notification' in source)=0 then raise exception 'Unexpected notification function shape'; end if;
 execute source;
end $$;
notify pgrst,'reload schema';
commit;
