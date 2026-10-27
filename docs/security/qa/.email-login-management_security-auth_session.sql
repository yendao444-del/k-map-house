CREATE OR REPLACE FUNCTION management_security.auth_session(p_user uuid, p_session uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(select 1 from auth.sessions s join public.users u on u.id=s.user_id
    where s.id=p_session and s.user_id=p_user and u.status='active' and u.role in ('admin','user')
      and (s.not_after is null or s.not_after>clock_timestamp()));
$function$
