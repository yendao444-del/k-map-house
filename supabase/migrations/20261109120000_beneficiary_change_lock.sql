-- Payment beneficiary (bank_id, account_no, account_name) is the single most
-- valuable field in the system: every invoice QR and the SePay webhook trust
-- it. It can no longer be changed by any direct write - not by an admin, not
-- by a password step-up, not by service_role scripts. The only path is
-- security_beneficiary_confirm(), reached through the management gateway
-- after BOTH a fresh Authenticator (TOTP) verification and a one-time code
-- delivered to the admin's own login mailbox (Gmail), bound to one session.
begin;

create table if not exists management_security.beneficiary_changes (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  session_id uuid not null,
  ip_hash text not null,
  agent_hash text not null,
  email_identity_hash text not null,
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  totp_at timestamptz not null,
  old_bank_id text, old_account_no text, old_account_name text,
  new_bank_id text not null, new_account_no text not null, new_account_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '10 minutes',
  attempts integer not null default 0,
  provider_id text, provider_accepted_at timestamptz, delivery_failed_at timestamptz,
  verified_at timestamptz, applied_at timestamptz, closed_at timestamptz
);
alter table management_security.beneficiary_changes enable row level security;
revoke all on management_security.beneficiary_changes from public, anon, authenticated;

create or replace function management_security.beneficiary_input_valid(p_bank text, p_account text, p_name text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_bank in ('VCB','MBBANK','TCB','ACB','BIDV','VPB','TPB','AGRIBANK','SHB','OCB','MSB','VIB','HDB','SCB','SACOMBANK','EXIMBANK')
    and p_account ~ '^[A-Za-z0-9]{4,19}$' and p_name ~ '^[A-Z][A-Z ]{0,58}[A-Z]$', false);
$$;

-- Row guard on the settings table. Any change of the three fields, insert of
-- a row carrying them, or delete of a row carrying them is rejected unless the
-- SAME transaction is applying a verified, unexpired, unapplied challenge with
-- exactly these values.
create or replace function public.app_settings_beneficiary_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare flag text := nullif(current_setting('app.beneficiary_change', true), ''); ch management_security.beneficiary_changes;
begin
  if tg_op = 'UPDATE' and new.bank_id is not distinct from old.bank_id and new.account_no is not distinct from old.account_no
    and new.account_name is not distinct from old.account_name then return new; end if;
  if tg_op = 'INSERT' and new.bank_id is null and new.account_no is null and new.account_name is null then return new; end if;
  if tg_op = 'DELETE' and old.bank_id is null and old.account_no is null and old.account_name is null then return old; end if;
  if tg_op = 'UPDATE' and flag ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    select * into ch from management_security.beneficiary_changes where id = flag::uuid;
    if ch.id is not null and ch.verified_at is not null and ch.applied_at is null and ch.closed_at is null
      and ch.expires_at > clock_timestamp()
      and new.bank_id = ch.new_bank_id and new.account_no = ch.new_account_no and new.account_name = ch.new_account_name
      and old.bank_id is not distinct from ch.old_bank_id and old.account_no is not distinct from ch.old_account_no
      and old.account_name is not distinct from ch.old_account_name then
      return new;
    end if;
  end if;
  raise exception 'Thông tin người thụ hưởng chỉ được đổi qua xác minh Gmail và Authenticator.' using errcode = '42501';
end $$;
revoke all on function public.app_settings_beneficiary_guard() from public, anon, authenticated;
drop trigger if exists app_settings_beneficiary_guard on public.app_settings;
create trigger app_settings_beneficiary_guard before insert or update or delete on public.app_settings
  for each row execute function public.app_settings_beneficiary_guard();

create or replace function public.security_beneficiary_start(
  p_user uuid, p_session uuid, p_ip text, p_agent text, p_challenge uuid, p_code_hash text,
  p_bank_id text, p_account_no text, p_account_name text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s management_security.sessions; au auth.users; cur public.app_settings; totp timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise insufficient_privilege; end if;
  if not exists(select 1 from public.users u where u.id = p_user and u.role = 'admin' and u.status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'role'); end if;
  if not management_security.live(p_user, p_session, p_ip) then return jsonb_build_object('ok', false, 'reason', 'session'); end if;
  select * into s from management_security.sessions where user_id = p_user and session_id = p_session for update;
  if s.session_id is null or s.recovery_only or s.authorized_at is null or s.ip_hash is distinct from p_ip or s.agent_hash is distinct from p_agent
    or p_challenge is null or p_code_hash is null or p_code_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok', false, 'reason', 'session'); end if;
  -- The gateway verified the Authenticator code moments ago in this session.
  totp := management_security.mfa_at(p_user, p_session);
  if totp is null or totp < clock_timestamp() - interval '2 minutes' then return jsonb_build_object('ok', false, 'reason', 'totp'); end if;
  select * into au from auth.users where id = p_user;
  if au.email is null or au.email_confirmed_at is null then return jsonb_build_object('ok', false, 'reason', 'email'); end if;
  if not management_security.beneficiary_input_valid(p_bank_id, p_account_no, p_account_name) then return jsonb_build_object('ok', false, 'reason', 'input'); end if;
  select * into cur from public.app_settings order by id limit 1;
  if cur.id is null then return jsonb_build_object('ok', false, 'reason', 'settings'); end if;
  if cur.bank_id is not distinct from p_bank_id and cur.account_no is not distinct from p_account_no and cur.account_name is not distinct from p_account_name then
    return jsonb_build_object('ok', false, 'reason', 'unchanged'); end if;
  if exists(select 1 from management_security.beneficiary_changes where user_id = p_user and created_at > clock_timestamp() - interval '60 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'wait'); end if;
  update management_security.beneficiary_changes set closed_at = clock_timestamp() where user_id = p_user and closed_at is null;
  insert into management_security.beneficiary_changes(id, user_id, session_id, ip_hash, agent_hash, email_identity_hash, code_hash, totp_at,
    old_bank_id, old_account_no, old_account_name, new_bank_id, new_account_no, new_account_name)
  values(p_challenge, p_user, p_session, p_ip, p_agent, management_security.email_hash(p_user), p_code_hash, totp,
    cur.bank_id, cur.account_no, cur.account_name, p_bank_id, p_account_no, p_account_name);
  perform management_security.audit(p_user, p_session, 'beneficiary_change_requested', true, p_ip,
    jsonb_build_object('old_account', cur.account_no, 'new_account', p_account_no, 'new_bank', p_bank_id));
  return jsonb_build_object('ok', true, 'challenge_id', p_challenge, 'expires_in', 600,
    'old', jsonb_build_object('bank_id', cur.bank_id, 'account_no', cur.account_no, 'account_name', cur.account_name));
end $$;

create or replace function public.security_beneficiary_delivery(p_challenge uuid, p_user uuid, p_session uuid, p_provider text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise insufficient_privilege; end if;
  if p_provider is null then
    update management_security.beneficiary_changes set delivery_failed_at = clock_timestamp(), closed_at = clock_timestamp()
      where id = p_challenge and user_id = p_user and session_id = p_session and closed_at is null;
    return false;
  end if;
  update management_security.beneficiary_changes set provider_id = p_provider, provider_accepted_at = clock_timestamp()
    where id = p_challenge and user_id = p_user and session_id = p_session and closed_at is null and provider_id is null;
  return found;
end $$;

create or replace function public.security_beneficiary_confirm(
  p_user uuid, p_session uuid, p_ip text, p_agent text, p_challenge uuid, p_code_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c management_security.beneficiary_changes; cur public.app_settings; totp timestamptz; n integer; admins jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise insufficient_privilege; end if;
  -- Same financial lock as invoices, wallet and SePay; settings writes serialize on it too.
  perform pg_advisory_xact_lock(20261005, 120000);
  select * into c from management_security.beneficiary_changes where id = p_challenge and user_id = p_user for update;
  totp := management_security.mfa_at(p_user, p_session);
  if c.id is null or c.closed_at is not null or c.applied_at is not null or c.delivery_failed_at is not null
    or c.provider_accepted_at is null or c.expires_at <= clock_timestamp() or c.attempts >= 5
    or c.session_id <> p_session or c.ip_hash is distinct from p_ip or c.agent_hash is distinct from p_agent
    or c.email_identity_hash is distinct from management_security.email_hash(p_user)
    or not exists(select 1 from public.users u where u.id = p_user and u.role = 'admin' and u.status = 'active')
    or not management_security.live(p_user, p_session, p_ip)
    or totp is null or totp < c.totp_at
    or c.code_hash is distinct from p_code_hash then
    if c.id is not null and c.closed_at is null then
      update management_security.beneficiary_changes set attempts = attempts + 1,
        closed_at = case when attempts + 1 >= 5 then clock_timestamp() end where id = c.id;
    end if;
    perform management_security.audit(p_user, p_session, 'beneficiary_change_failed', false, p_ip, jsonb_build_object('challenge', p_challenge));
    return jsonb_build_object('ok', false);
  end if;
  select * into cur from public.app_settings order by id limit 1 for update;
  if cur.bank_id is distinct from c.old_bank_id or cur.account_no is distinct from c.old_account_no or cur.account_name is distinct from c.old_account_name then
    update management_security.beneficiary_changes set closed_at = clock_timestamp() where id = c.id;
    return jsonb_build_object('ok', false, 'reason', 'stale');
  end if;
  update management_security.beneficiary_changes set verified_at = clock_timestamp() where id = c.id;
  perform set_config('app.beneficiary_change', c.id::text, true);
  update public.app_settings set bank_id = c.new_bank_id, account_no = c.new_account_no, account_name = c.new_account_name, updated_at = now()
    where id = cur.id;
  get diagnostics n = row_count;
  perform set_config('app.beneficiary_change', '', true);
  if n <> 1 then raise exception 'Không cập nhật được người thụ hưởng.'; end if;
  update management_security.beneficiary_changes set applied_at = clock_timestamp(), closed_at = clock_timestamp() where id = c.id;
  perform management_security.audit(p_user, p_session, 'beneficiary_changed', true, p_ip,
    jsonb_build_object('old_bank', c.old_bank_id, 'old_account', c.old_account_no, 'new_bank', c.new_bank_id, 'new_account', c.new_account_no));
  select coalesce(jsonb_agg(au.email), '[]'::jsonb) into admins from public.users u join auth.users au on au.id = u.id
    where u.role = 'admin' and u.status = 'active' and au.email is not null and au.email_confirmed_at is not null;
  return jsonb_build_object('ok', true, 'admins', admins,
    'old', jsonb_build_object('bank_id', c.old_bank_id, 'account_no', c.old_account_no, 'account_name', c.old_account_name),
    'new', jsonb_build_object('bank_id', c.new_bank_id, 'account_no', c.new_account_no, 'account_name', c.new_account_name));
end $$;

revoke all on function public.security_beneficiary_start(uuid,uuid,text,text,uuid,text,text,text,text),
  public.security_beneficiary_delivery(uuid,uuid,uuid,text),
  public.security_beneficiary_confirm(uuid,uuid,text,text,uuid,text),
  management_security.beneficiary_input_valid(text,text,text) from public, anon, authenticated;
grant execute on function public.security_beneficiary_start(uuid,uuid,text,text,uuid,text,text,text,text),
  public.security_beneficiary_delivery(uuid,uuid,uuid,text),
  public.security_beneficiary_confirm(uuid,uuid,text,text,uuid,text) to service_role;

commit;
