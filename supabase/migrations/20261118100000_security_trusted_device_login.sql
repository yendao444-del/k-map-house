begin;

-- Facebook-style trusted devices.
-- After a full TOTP/email verification the browser/app is remembered. A later
-- password login from that device skips the second factor only when:
--   * the device token (random, HMAC-signed, stored hashed) matches,
--   * the browser/app family matches (user-agent with versions stripped),
--   * the IP or its network (/24 IPv4, /48 IPv6) is already familiar to this
--     account's trusted devices.
-- A new device, a new network, revocation, recovery or expiry -> normal 2FA.
-- Password, role, status, session lifetime and sensitive-action checks remain.

alter table management_security.devices
  add column if not exists agent_family_hash text check(agent_family_hash is null or agent_family_hash ~ '^[a-f0-9]{64}$'),
  add column if not exists known_networks text[] not null default '{}';

-- Trusted-device sessions reuse the session proof introduced for the local
-- development workstation; the device row must still be live and bound to the
-- session's exact IP and user agent.
create or replace function management_security.dev_device_at(p_user uuid,p_session uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
  select s.dev_device_verified_at from management_security.sessions s
  join management_security.devices d on d.id=s.device_id and d.user_id=s.user_id
  join management_security.accounts a on a.user_id=s.user_id
  where s.user_id=p_user and s.session_id=p_session and not s.recovery_only
    and management_security.live(p_user,p_session) and s.authorized_at is not null
    and d.revoked_at is null and d.expires_at>clock_timestamp()
    and d.ip_hash=s.ip_hash and d.agent_hash=s.agent_hash
    and s.email_identity_hash=management_security.email_hash(p_user)
    and a.recovery_session_id is null and a.recovery_ack_at is not null;
$$;
revoke all on function management_security.dev_device_at(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function management_security.familiar_network(p_user uuid,p_ip text,p_network text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from management_security.devices d
    where d.user_id=p_user and d.revoked_at is null and d.expires_at>clock_timestamp()
      and (d.ip_hash=p_ip or p_ip=any(d.known_networks) or (p_network is not null and p_network=any(d.known_networks))));
$$;
revoke all on function management_security.familiar_network(uuid,text,text) from public,anon,authenticated,service_role;

-- Most recent first, de-duplicated, at most 20 IP/network hashes per device.
create or replace function management_security.merge_networks(p_new text[],p_old text[]) returns text[]
language sql immutable set search_path='' as $$
  select coalesce(array_agg(x order by first_pos),'{}') from (
    select x,min(pos) first_pos from unnest(coalesce(p_new,'{}')||coalesce(p_old,'{}')) with ordinality u(x,pos)
    where x ~ '^[a-f0-9]{64}$' group by x order by min(pos) limit 20) t;
$$;
revoke all on function management_security.merge_networks(text[],text[]) from public,anon,authenticated,service_role;

-- Called by the gateway right after a fresh password login (never alone).
create or replace function public.security_trusted_device_login(p_user uuid,p_session uuid,p_ip text,p_network text,p_agent text,p_agent_family text,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d management_security.devices; s management_security.sessions;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if p_ip !~ '^[a-f0-9]{64}$' or p_agent !~ '^[a-f0-9]{64}$' or p_agent_family !~ '^[a-f0-9]{64}$'
    or coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' or (p_network is not null and p_network !~ '^[a-f0-9]{64}$') then return jsonb_build_object('ok',false); end if;
  select * into s from management_security.sessions where user_id=p_user and session_id=p_session for update;
  if s.session_id is null or s.recovery_only or not management_security.live(p_user,p_session,p_ip)
    or s.agent_hash is distinct from p_agent or s.password_verified_at<clock_timestamp()-interval '2 minutes'
    or not exists(select 1 from auth.mfa_amr_claims where session_id=p_session and authentication_method='password')
    or not exists(select 1 from management_security.accounts where user_id=p_user and recovery_session_id is null and recovery_ack_at is not null)
    then return jsonb_build_object('ok',false); end if;
  select * into d from management_security.devices where user_id=p_user and token_hash=p_token_hash
    and not local_dev and revoked_at is null and expires_at>clock_timestamp() for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','unknown_device'); end if;
  -- Devices remembered before this migration have no family yet: exact agent.
  if coalesce(d.agent_family_hash<>p_agent_family, d.agent_hash<>p_agent) then
    perform management_security.audit(p_user,p_session,'risk_step_up_required',true,p_ip,jsonb_build_object('reason','device_agent_changed','device_id',d.id));
    return jsonb_build_object('ok',false,'reason','agent_changed');
  end if;
  if not management_security.familiar_network(p_user,p_ip,p_network) then
    perform management_security.audit(p_user,p_session,'risk_step_up_required',true,p_ip,jsonb_build_object('reason','new_network','device_id',d.id));
    return jsonb_build_object('ok',false,'reason','new_network');
  end if;
  update management_security.devices set ip_hash=p_ip,agent_hash=p_agent,agent_family_hash=p_agent_family,
    known_networks=management_security.merge_networks(array[p_ip,p_network],d.known_networks),
    last_seen_at=clock_timestamp(),expires_at=greatest(expires_at,clock_timestamp()+interval '60 days')
    where id=d.id;
  update management_security.sessions set device_id=d.id,dev_device_verified_at=clock_timestamp(),
    authorized_at=clock_timestamp(),email_required=false,email_identity_hash=management_security.email_hash(p_user)
    where session_id=p_session;
  perform management_security.audit(p_user,p_session,'session_authorized',true,p_ip,jsonb_build_object('method','trusted_device','device_id',d.id));
  return jsonb_build_object('ok',true);
end $$;

-- Remember (or refresh) this device after a completed verification. The token
-- rotates on every remember; the previous token of the same device is replaced.
create or replace function public.security_trusted_device_remember(p_user uuid,p_session uuid,p_ip text,p_network text,p_agent text,p_agent_family text,p_token_hash text,p_previous_hash text,p_label text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d management_security.devices; s management_security.sessions; nets text[];
begin
  if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
  if p_ip !~ '^[a-f0-9]{64}$' or p_agent !~ '^[a-f0-9]{64}$' or p_agent_family !~ '^[a-f0-9]{64}$'
    or coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' or (p_network is not null and p_network !~ '^[a-f0-9]{64}$')
    or (p_previous_hash is not null and p_previous_hash !~ '^[a-f0-9]{64}$') then return jsonb_build_object('ok',false); end if;
  select * into s from management_security.sessions where user_id=p_user and session_id=p_session for update;
  if s.session_id is null or s.recovery_only or s.authorized_at is null or not management_security.live(p_user,p_session,p_ip)
    or s.agent_hash is distinct from p_agent or management_security.login_factor_at(p_user,p_session) is null
    or not exists(select 1 from management_security.accounts where user_id=p_user and recovery_session_id is null and recovery_ack_at is not null)
    then return jsonb_build_object('ok',false); end if;
  if p_previous_hash is not null then
    select * into d from management_security.devices where user_id=p_user and token_hash=p_previous_hash
      and not local_dev and revoked_at is null and expires_at>clock_timestamp() for update;
  end if;
  nets:=array_remove(array[p_ip,p_network],null);
  if d.id is null then
    insert into management_security.devices(user_id,token_hash,ip_hash,agent_hash,agent_family_hash,known_networks,label,expires_at)
      values(p_user,p_token_hash,p_ip,p_agent,p_agent_family,nets,left(coalesce(nullif(btrim(p_label),''),'Thiết bị của tôi'),120),clock_timestamp()+interval '60 days')
      returning * into d;
    perform management_security.audit(p_user,p_session,'trusted_device_created',true,p_ip,jsonb_build_object('device_id',d.id));
  else
    update management_security.devices set token_hash=p_token_hash,ip_hash=p_ip,agent_hash=p_agent,agent_family_hash=p_agent_family,
      known_networks=management_security.merge_networks(nets,d.known_networks),
      label=case when nullif(btrim(p_label),'') is null then label else left(btrim(p_label),120) end,
      last_seen_at=clock_timestamp(),expires_at=clock_timestamp()+interval '60 days'
      where id=d.id returning * into d;
  end if;
  update management_security.sessions set device_id=d.id where session_id=p_session;
  return jsonb_build_object('ok',true,'device_id',d.id,'expires_at',d.expires_at);
end $$;

revoke all on function public.security_trusted_device_login(uuid,uuid,text,text,text,text,text),
  public.security_trusted_device_remember(uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.security_trusted_device_login(uuid,uuid,text,text,text,text,text),
  public.security_trusted_device_remember(uuid,uuid,text,text,text,text,text,text,text) to service_role;

notify pgrst,'reload schema';
commit;
