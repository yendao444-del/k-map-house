-- The legacy app_settings column must never carry a provider credential.
-- Keep the column for compatibility with old snapshots, but make it
-- inaccessible to browser roles. The server-only app_secrets row remains the
-- sole storage used by SePay functions.
revoke select (sepay_api_token), insert (sepay_api_token), update (sepay_api_token), references (sepay_api_token)
  on table public.app_settings from anon, authenticated;
