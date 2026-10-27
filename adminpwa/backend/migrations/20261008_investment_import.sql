-- Explicit admin-confirmed, empty-cloud-only import. Never touch Electron's
-- JSON, or debit/credit the existing operating wallet a second time.
begin;
create or replace function public.admin_pwa_investment_import(p_data jsonb,p_expected_version bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb; previous public.admin_pwa_investment_commits%rowtype; fund_balance numeric;
begin
  if not exists(select 1 from public.users u where u.id=auth.uid() and u.status='active' and u.role='admin') then
    raise exception 'Chỉ admin được nhập danh mục Electron đã đối soát.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(20261008,417800);
  select * into previous from public.admin_pwa_investment_commits where request_id=p_request_id;
  if found then return public.admin_pwa_investment_write(p_data,p_expected_version,p_request_id); end if;
  snapshot := public.admin_pwa_investment_read();
  if (snapshot->>'version')::bigint <> p_expected_version then raise exception 'Danh mục đã thay đổi. Tải lại trước khi nhập.' using errcode='40001'; end if;
  if jsonb_array_length(snapshot->'data'->'holdings') > 0 or jsonb_array_length(snapshot->'data'->'transactions') > 0 then
    raise exception 'Chỉ nhập vào danh mục cloud trống; không ghi đè dữ liệu đã có.' using errcode='22023';
  end if;
  if jsonb_typeof(p_data->'transactions') is distinct from 'array' then raise exception 'Tệp giao dịch không hợp lệ.' using errcode='22023'; end if;
  select coalesce(sum((t->'walletPosting'->>'amount')::numeric),0) into fund_balance
    from jsonb_array_elements(p_data->'transactions') t where t->>'fundingSource'='investment-wallet';
  if fund_balance < 0 then raise exception 'Ví đầu tư trong tệp đang âm. Đối soát trên Electron trước khi nhập.' using errcode='22023'; end if;
  return public.admin_pwa_investment_write(p_data,p_expected_version,p_request_id);
end;
$$;
revoke all on function public.admin_pwa_investment_import(jsonb,bigint,uuid) from public, anon, authenticated;
grant execute on function public.admin_pwa_investment_import(jsonb,bigint,uuid) to authenticated;

create or replace function public.admin_pwa_investment_receipt_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.id like 'pwa-investment-%' and old.category='investment_transfer' then
    raise exception 'Chứng từ đầu tư PWA được lưu theo phiên bản. Hoàn tác trong danh mục đầu tư, không sửa/xóa riêng chứng từ Ví.' using errcode='22023';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='admin_pwa_investment_receipt_lock' and tgrelid='public.cash_transactions'::regclass and not tgisinternal) then
    create trigger admin_pwa_investment_receipt_lock before update or delete on public.cash_transactions for each row execute function public.admin_pwa_investment_receipt_immutable();
  end if;
end; $$;
revoke all on function public.admin_pwa_investment_receipt_immutable() from public, anon, authenticated;
commit;
