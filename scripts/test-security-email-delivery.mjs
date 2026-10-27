import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { privateConfig, management } from '../webmobile/scripts/private-config.mjs'
const env = await privateConfig()
assert.equal(new URL(env.SUPABASE_URL).hostname, 'wtrycmiojsiliyjxsewz.supabase.co')
const migration = (await readFile('supabase/migrations/20261011150000_security_email_delivery.sql', 'utf8')).replace(/^begin;\s*/, '').replace(/commit;\s*$/, '')
const sql = `begin;
${migration}
do $$
declare uid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); cid uuid:=gen_random_uuid(); provider uuid:=gen_random_uuid();
  at_time timestamptz:=clock_timestamp(); event_key text:='test-'||gen_random_uuid();
begin
  insert into auth.users(id,email,email_confirmed_at) values(uid,'delivery-fixture-'||uid||'@example.invalid',clock_timestamp());
  insert into auth.sessions(id,user_id,aal,created_at,updated_at) values(sid,uid,'aal1',clock_timestamp(),clock_timestamp());
  insert into management_security.sessions(session_id,user_id,ip_hash,agent_hash,password_verified_at,expires_at)
    values(sid,uid,repeat('a',64),repeat('b',64),clock_timestamp(),clock_timestamp()+interval '5 minutes');
  insert into management_security.email_challenges(id,user_id,session_id,purpose,ip_hash,email_identity_hash,code_hash)
    values(cid,uid,sid,'signin',repeat('a',64),repeat('b',64),repeat('c',64));
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  -- Webhook beats provider acceptance registration; immutable event remains joinable.
  if not public.security_email_delivery_event(event_key,provider,'email.delivered',at_time) then raise exception 'Early event rejected'; end if;
  if public.security_email_accepted(cid,gen_random_uuid(),sid,provider) then raise exception 'Cross-user acceptance'; end if;
  if public.security_email_accepted(cid,uid,gen_random_uuid(),provider) then raise exception 'Cross-session acceptance'; end if;
  if not public.security_email_accepted(cid,uid,sid,provider) then raise exception 'Acceptance failed'; end if;
  if not public.security_email_accepted(cid,uid,sid,provider) then raise exception 'Acceptance not idempotent'; end if;
  if public.security_email_accepted(cid,uid,sid,gen_random_uuid()) then raise exception 'Rebound provider'; end if;
  if not exists(select 1 from management_security.email_delivery_status where challenge_id=cid and delivery_status='email.delivered') then raise exception 'Early event lost'; end if;
  if not public.security_email_delivery_event(event_key,provider,'email.delivered',at_time) then raise exception 'Duplicate retry failed'; end if;
  if public.security_email_delivery_event(event_key,provider,'email.bounced',at_time) then raise exception 'Event collision accepted'; end if;
  if (select count(*) from management_security.email_delivery_events where event_id=event_key)<>1 then raise exception 'Duplicate stored'; end if;
  if not public.security_email_delivery_event(event_key||'-sent',provider,'email.sent',at_time+interval '1 second') then raise exception 'Late sent failed'; end if;
  if not exists(select 1 from management_security.email_delivery_status where challenge_id=cid and delivery_status='email.delivered') then raise exception 'Status regressed'; end if;
  perform public.security_email_delivery_event(event_key||'-complaint',provider,'email.complained',at_time);
  if not exists(select 1 from management_security.email_delivery_status where challenge_id=cid and delivery_status='email.complained') then raise exception 'Complaint lost'; end if;
  if public.security_email_delivery_event(event_key||'-future',provider,'email.delivered',at_time+interval '1 day') then raise exception 'Future event accepted'; end if;
  if public.security_email_delivery_event(event_key||'-unknown',provider,'email.opened',at_time) then raise exception 'Tracking event retained'; end if;
  if exists(select 1 from management_security.email_challenges where id=cid and (verified_at is not null or closed_at is not null)) then raise exception 'Delivery webhook changed MFA verification'; end if;
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin perform public.security_email_accepted(cid,uid,sid,provider); raise exception 'Browser registered delivery'; exception when insufficient_privilege then null; end;
  begin perform public.security_email_delivery_event(event_key,provider,'email.delivered',at_time); raise exception 'Browser forged webhook'; exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','public.security_email_delivery_event(text,uuid,text,timestamptz)','EXECUTE')
    or has_function_privilege('anon','public.security_email_accepted(uuid,uuid,uuid,uuid)','EXECUTE')
    or has_table_privilege('authenticated','management_security.email_delivery_status','SELECT')
    or has_table_privilege('anon','management_security.email_delivery_events','SELECT') then raise exception 'Metadata exposed'; end if;
end $$;
select 'Security mail delivery: race, replay, ordering and isolation passed; rolled back' verification;
rollback;`
const result = await management(env, '/database/query', { query: sql })
const report = { at: new Date().toISOString(), passed: true, scope: 'Transaction-local fixtures, all rolled back; no email sent or real account changed.', result }
await writeFile('docs/security/qa/security-email-delivery-database.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
