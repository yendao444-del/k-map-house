begin;
-- Patch only the recipient check in the deployed worker function. Preserve all
-- concurrent changes to matching, accounting, idempotency and email handling.
do $migration$
declare definition text;
  old_check text := $old$if nullif(account,'') is null or regexp_replace(coalesce(p_tx->>'account_number',''),'\D','','g')<>account then return jsonb_build_object('status','wrong_account');end if;$old$;
  new_check text := $new$if nullif(account,'') is null or not (
   upper(regexp_replace(coalesce(p_tx->>'account_number',''),'[^A-Z0-9]','','gi'))=upper(regexp_replace(account,'[^A-Z0-9]','','g'))
   or upper(regexp_replace(coalesce(p_tx->>'sub_account',''),'[^A-Z0-9]','','gi'))=upper(regexp_replace(account,'[^A-Z0-9]','','g'))
 ) then return jsonb_build_object('status','wrong_account');end if;
 if coalesce((p_tx->>'amount_out')::numeric,0)<>0 then return jsonb_build_object('status','ignored');end if;$new$;
begin
  definition := pg_get_functiondef('public.process_server_sepay(jsonb)'::regprocedure);
  -- The configured SePay account can be alphanumeric (for example a BIDV
  -- virtual sub-account), so normalize it without stripping letters.
  definition := replace(definition, $$select regexp_replace(account_no,'\D','','g') into account from app_settings limit 1;$$, $$select upper(regexp_replace(account_no,'[^A-Z0-9]','','gi')) into account from app_settings limit 1;$$);
  if position(new_check in definition)>0 and position($$select upper(regexp_replace(account_no,'[^A-Z0-9]','','gi'))$$ in definition)>0 then return; end if;
  if position(old_check in definition)=0 then raise exception 'SePay recipient check changed; review migration before applying'; end if;
  execute replace(definition,old_check,new_check);
end;
$migration$;
commit;
