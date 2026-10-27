-- A management session may be restored after closing the app, but never past
-- this server-enforced absolute deadline. Keep idle handling aligned so a
-- legitimate closed tab can also resume during the same six-hour window.
begin;

alter table management_security.settings
  drop constraint if exists settings_idle_seconds_check;
alter table management_security.settings
  drop constraint if exists management_security_settings_idle_seconds_check;
alter table management_security.settings
  add constraint management_security_settings_idle_seconds_check
  check (idle_seconds between 300 and 86400);
alter table management_security.settings
  alter column idle_seconds set default 21600,
  alter column lifetime_seconds set default 21600;

update management_security.settings
  set idle_seconds = 21600,
      lifetime_seconds = 21600
  where singleton;

-- Do not let an already-created eight-hour session retain its old deadline.
update management_security.sessions
  set expires_at = least(expires_at, created_at + interval '6 hours')
  where expires_at > created_at + interval '6 hours';

commit;
