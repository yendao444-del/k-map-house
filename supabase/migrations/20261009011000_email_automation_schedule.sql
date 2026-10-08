begin;

-- Supabase-hosted worker prerequisites. The schedule remains inert until the
-- EMAIL_AUTOMATION_SECRET is placed in Vault and the installer is called.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.install_email_automation_schedule()
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $fn$
declare secret text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Service only' using errcode='42501';
  end if;
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name='EMAIL_AUTOMATION_SECRET'
  order by created_at desc
  limit 1;
  if nullif(secret,'') is null then return false; end if;
  if exists(select 1 from cron.job where jobname='ankhang-email-automation') then
    perform cron.unschedule('ankhang-email-automation');
  end if;
  perform cron.schedule(
    'ankhang-email-automation',
    '*/2 * * * *',
    $job$select net.http_post(
      url := 'https://wtrycmiojsiliyjxsewz.supabase.co/functions/v1/email-automation',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='EMAIL_AUTOMATION_SECRET' order by created_at desc limit 1)),
      body := '{}'::jsonb
    ) as request_id;$job$
  );
  return true;
end;
$fn$;
revoke all on function public.install_email_automation_schedule() from public,anon,authenticated;
grant execute on function public.install_email_automation_schedule() to service_role;

notify pgrst,'reload schema';
commit;
