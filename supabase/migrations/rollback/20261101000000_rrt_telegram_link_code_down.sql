-- Hoàn tác 20261101000000_rrt_telegram_link_code.sql
BEGIN;
DROP FUNCTION IF EXISTS public.rrt_create_telegram_link_code();
DROP TABLE IF EXISTS public.rrt_telegram_link_codes;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, approval_status, role)
  values (new.id, new.email, 'pending', 'user');
  return new;
end;
$function$;
COMMIT;
