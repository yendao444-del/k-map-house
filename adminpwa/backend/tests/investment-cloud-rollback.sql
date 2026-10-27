-- All test data lives in a transaction that is always rolled back. No cash,
-- invoice, contract, user or other existing business record is changed.
-- Positive funding tests create a synthetic 1 VND ledger entry inside this
-- rollback-only transaction, never a retained receipt or actual transfer.
begin;
create temporary table pwa_test_assertions(name text primary key, passed boolean not null);
create temporary table pwa_test_wallet(method text);
create temporary table pwa_test_import_context(data jsonb, expected_version bigint, request_id uuid);
insert into pwa_test_wallet select case when (p->>'bank')::bigint >= 2 then 'transfer' when (p->>'cash')::bigint >= 2 then 'cash' end from (select public.wallet_position() p) x where (p->>'unknown_count')::bigint=0;
grant select, insert on pwa_test_assertions to authenticated, anon;
grant select on pwa_test_wallet to authenticated;
grant select, insert on pwa_test_import_context to authenticated;
select set_config('request.jwt.claim.sub', (select id::text from public.users where role = 'admin' and status = 'active' order by created_at limit 1), true);
set local role authenticated;
do $$
declare before_snapshot jsonb; result jsonb; retry_result jsonb;
  request uuid := gen_random_uuid(); data jsonb := '{"holdings":[],"transactions":[],"portfolioSnapshots":[],"categoryTargets":{}}';
  version bigint; method text; funded jsonb; failed_data jsonb; failed_request uuid; funded_request uuid := gen_random_uuid();
  import_data jsonb; imported jsonb; import_request uuid := gen_random_uuid(); cash_count bigint;
begin
  before_snapshot := public.admin_pwa_investment_read();
  version := (before_snapshot->>'version')::bigint;
  result := public.admin_pwa_investment_commit(data, version, request);
  if (result->>'version')::bigint <> version+1 then raise exception 'write did not advance one version'; end if;
  insert into pwa_test_assertions values('authorized-management-save',true);
  retry_result := public.admin_pwa_investment_commit(data, version, request);
  if retry_result <> result then raise exception 'retry did not return original result'; end if;
  if public.admin_pwa_investment_read() <> result then raise exception 'retry altered current version'; end if;
  insert into pwa_test_assertions values('idempotent-retry-no-duplicate-version',true);
  begin
    perform public.admin_pwa_investment_commit(data, version, gen_random_uuid());
    raise exception 'stale version incorrectly accepted';
  exception when serialization_failure then insert into pwa_test_assertions values('stale-device-conflict',true); end;
  begin
    perform public.admin_pwa_investment_commit(jsonb_set(data,'{categoryTargets}','{"cash":20}'::jsonb), version, request);
    raise exception 'request ID payload mismatch incorrectly accepted';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('idempotency-key-payload-binding',true); end;
  begin
    perform public.admin_pwa_investment_commit('{"holdings":null,"transactions":[],"portfolioSnapshots":[],"categoryTargets":{}}',version+1,gen_random_uuid());
    raise exception 'malformed data incorrectly accepted';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('malformed-store-rejected',true); end;
  begin
    perform count(*) from public.admin_pwa_investment_store;
    raise exception 'direct table access incorrectly allowed';
  exception when insufficient_privilege then insert into pwa_test_assertions values('direct-table-access-denied',true); end;
  begin
    perform public.admin_pwa_investment_write(data,version+1,gen_random_uuid());
    raise exception 'internal writer incorrectly exposed';
  exception when insufficient_privilege then insert into pwa_test_assertions values('non-atomic-writer-denied',true); end;
  begin
    perform public.admin_pwa_investment_commit(jsonb_set(data,'{transactions}','[{"id":"fake-opening","date":"2026-10-08","transactionType":"deposit","amountVnd":100,"walletPosting":{"paymentMethod":"cash","amount":100}}]'),version+1,gen_random_uuid());
    raise exception 'unfunded opening transaction incorrectly accepted';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('opening-fund-bypass-denied',true); end;
  begin
    perform public.admin_pwa_investment_commit(jsonb_set(data,'{transactions}','[{"id":"fake-withdraw","date":"2026-10-08","transactionType":"withdraw","fundingSource":"investment-wallet","amountVnd":100,"walletPosting":{"paymentMethod":"cash","amount":-100}}]'),version+1,gen_random_uuid());
    raise exception 'negative investment wallet incorrectly accepted';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('negative-investment-wallet-denied',true); end;
  begin
    perform public.admin_pwa_investment_commit(jsonb_set(data,'{transactions}','[{"id":"fake-sale","date":"2026-10-08","assetSymbol":"NO-ASSET","quantity":1,"transactionType":"sell","fundingSource":"investment-wallet","amountVnd":100,"walletPosting":{"paymentMethod":"cash","amount":100}}]'),version+1,gen_random_uuid());
    raise exception 'sale without asset incorrectly accepted';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('sale-without-asset-denied',true); end;
  select w.method into method from pwa_test_wallet w;
  if method is null then raise exception 'Existing wallet is not ready for the rollback-only funded test; reconciliation/input is required.'; end if;
  funded := jsonb_set(data,'{transactions}',jsonb_build_array(jsonb_build_object('id','pwa-test-deposit','date','2026-10-08','assetSymbol','CASH','transactionType','deposit','fundingSource','investment-wallet','amountVnd',1,'walletPosting',jsonb_build_object('paymentMethod',method,'amount',1))));
  result := public.admin_pwa_investment_commit(funded,version+1,funded_request);
  if (result->>'version')::bigint <> version+2 or not exists(select 1 from public.cash_transactions c where c.id = 'pwa-investment-'||funded_request::text||'-'||method and c.type='expense' and c.amount=1 and c.category='investment_transfer' and c.payment_method=method) then raise exception 'Funded save was not atomic'; end if;
  insert into pwa_test_assertions values('funded-save-and-receipt-atomic',true);
  retry_result := public.admin_pwa_investment_commit(funded,version+1,funded_request);
  if retry_result <> result or (select count(*) from public.cash_transactions c where c.id like 'pwa-investment-'||funded_request::text||'%') <> 1 then raise exception 'Funded retry duplicated receipt'; end if;
  insert into pwa_test_assertions values('funded-retry-no-double-posting',true);
  begin
    perform public.admin_pwa_investment_commit(jsonb_set(funded,'{transactions}',(funded->'transactions')||(funded->'transactions')),version+2,gen_random_uuid());
    raise exception 'duplicate transaction IDs incorrectly accepted';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('duplicate-transaction-id-denied',true); end;
  failed_request := gen_random_uuid();
  failed_data := jsonb_set(jsonb_set(funded,'{transactions}',(funded->'transactions')||jsonb_build_array(jsonb_build_object('id','pwa-test-deposit-2','date','2026-10-08','assetSymbol','CASH','transactionType','deposit','fundingSource','investment-wallet','amountVnd',1,'walletPosting',jsonb_build_object('paymentMethod',method,'amount',1)))),'{holdings}','null'::jsonb);
  begin
    perform public.admin_pwa_investment_commit(failed_data,version+2,failed_request);
    raise exception 'Malformed funded save incorrectly succeeded';
  exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.cash_transactions c where c.id like 'pwa-investment-'||failed_request::text||'%') or public.admin_pwa_investment_read() <> result then raise exception 'Rejected snapshot left a receipt or changed the portfolio'; end if;
  insert into pwa_test_assertions values('snapshot-failure-rolls-back-receipt',true);
  begin
    perform public.admin_pwa_investment_commit(funded,version+1,failed_request);
    raise exception 'Stale funded save incorrectly accepted';
  exception when serialization_failure then null; end;
  if exists(select 1 from public.cash_transactions c where c.id like 'pwa-investment-'||failed_request::text||'%') then raise exception 'Stale device left receipt'; end if;
  insert into pwa_test_assertions values('stale-funded-save-no-receipt',true);
  begin
    update public.cash_transactions set amount=2 where id='pwa-investment-'||funded_request::text||'-'||method;
    raise exception 'atomic receipt incorrectly edited separately';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('atomic-receipt-edit-denied',true); end;
  begin
    delete from public.cash_transactions where id='pwa-investment-'||funded_request::text||'-'||method;
    raise exception 'atomic receipt incorrectly deleted separately';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('atomic-receipt-delete-denied',true); end;
  begin
    perform public.admin_pwa_investment_import(data,version+2,gen_random_uuid());
    raise exception 'nonempty cloud incorrectly overwritten by import';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('import-overwrite-denied',true); end;
  -- Empty the synthetic portfolio through the normal atomic path, then
  -- import a legacy fixture. Neither step changes a retained business row.
  result := public.admin_pwa_investment_commit(data,version+2,gen_random_uuid());
  import_data := jsonb_set(data,'{holdings}','[{"symbol":"LEGACY","name":"Import fixture","category":"stocks","valueVnd":100,"quantity":"1 CP"}]');
  select count(*) into cash_count from public.cash_transactions;
  imported := public.admin_pwa_investment_import(import_data,version+3,import_request);
  if (imported->>'version')::bigint <> version+4 or (select count(*) from public.cash_transactions) <> cash_count then raise exception 'Import incorrectly posted money'; end if;
  insert into pwa_test_assertions values('explicit-import-no-double-wallet-posting',true);
  if public.admin_pwa_investment_import(import_data,version+3,import_request) <> imported then raise exception 'Import retry failed'; end if;
  insert into pwa_test_assertions values('import-idempotent-retry',true);
  insert into pwa_test_import_context values(import_data,version+3,import_request);
  begin
    perform public.admin_pwa_investment_commit(jsonb_set(import_data,'{holdings}',(import_data->'holdings')||(import_data->'holdings')),version+4,gen_random_uuid());
    raise exception 'duplicate holding symbols incorrectly accepted';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('duplicate-asset-symbol-denied',true); end;
end;
$$;
select set_config('request.jwt.claim.sub', (select id::text from public.users where role = 'user' and status = 'active' order by created_at limit 1), true);
do $$
declare snapshot jsonb; changed jsonb; context record;
begin
  snapshot := public.admin_pwa_investment_read();
  if snapshot->'data' is null then raise exception 'Active staff failed to read portfolio'; end if;
  insert into pwa_test_assertions values('active-staff-read-allowed',true);
  select * into context from pwa_test_import_context;
  begin
    perform public.admin_pwa_investment_commit(context.data,context.expected_version,context.request_id);
    raise exception 'another actor incorrectly replayed an admin request';
  exception when invalid_parameter_value then insert into pwa_test_assertions values('idempotency-key-actor-binding',true); end;
  begin
    perform public.admin_pwa_investment_import(context.data,(snapshot->>'version')::bigint,gen_random_uuid());
    raise exception 'nonadmin incorrectly imported Electron data';
  exception when insufficient_privilege then insert into pwa_test_assertions values('staff-import-denied',true); end;
  changed := jsonb_set(snapshot->'data','{categoryTargets}','{"stocks":100}'::jsonb);
  if (public.admin_pwa_investment_commit(changed,(snapshot->>'version')::bigint,gen_random_uuid())->>'version')::bigint <> (snapshot->>'version')::bigint+1 then raise exception 'Active staff could not save valid targets'; end if;
  insert into pwa_test_assertions values('active-staff-save-allowed',true);
end;
$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
do $$
begin
  begin
    perform public.admin_pwa_investment_read();
    raise exception 'missing management profile incorrectly allowed';
  exception when insufficient_privilege then insert into pwa_test_assertions values('unknown-auth-user-denied',true); end;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform public.admin_pwa_investment_read();
    raise exception 'anonymous RPC incorrectly allowed';
  exception when insufficient_privilege then insert into pwa_test_assertions values('anonymous-rpc-denied',true); end;
  begin
    perform public.admin_pwa_investment_commit('{"holdings":[],"transactions":[],"portfolioSnapshots":[],"categoryTargets":{}}',0,gen_random_uuid());
    raise exception 'anonymous commit incorrectly allowed';
  exception when insufficient_privilege then insert into pwa_test_assertions values('anonymous-commit-denied',true); end;
  begin
    perform public.admin_pwa_investment_import('{"holdings":[],"transactions":[],"portfolioSnapshots":[],"categoryTargets":{}}',0,gen_random_uuid());
    raise exception 'anonymous import incorrectly allowed';
  exception when insufficient_privilege then insert into pwa_test_assertions values('anonymous-import-denied',true); end;
end;
$$;
reset role;
select name,passed from pwa_test_assertions order by name;
rollback;
