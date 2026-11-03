-- Hoàn tác 20261103000000_rrt_mfa_audit.sql
-- CẢNH BÁO: xóa bảng nhật ký truy cập và mã dự phòng MFA. Sao lưu rrt_access_log trước nếu cần giữ.
BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.polname = 'rrt_mfa_gate' AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP POLICY rrt_mfa_gate ON %I.%I', r.nspname, r.relname);
  END LOOP;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_rrt_log_mfa_factor ON auth.mfa_factors;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'bỏ qua: %', SQLERRM; END $$;
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_rrt_log_password_changed ON auth.users;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'bỏ qua: %', SQLERRM; END $$;
DROP TRIGGER IF EXISTS trg_rrt_log_account_approved ON public.profiles;

DROP FUNCTION IF EXISTS public.rrt_log_mfa_factor();
DROP FUNCTION IF EXISTS public.rrt_log_password_changed();
DROP FUNCTION IF EXISTS public.rrt_log_account_approved();
DROP FUNCTION IF EXISTS public.rrt_log_event(text, jsonb);
DROP FUNCTION IF EXISTS public.rrt_write_log(uuid, text, text, boolean, jsonb);

DROP TABLE IF EXISTS public.rrt_access_log;
DROP FUNCTION IF EXISTS public.rrt_access_log_immutable();
DROP TABLE IF EXISTS public.rrt_mfa_attempts;
DROP TABLE IF EXISTS public.rrt_mfa_backup_codes;
DROP FUNCTION IF EXISTS public.rrt_mfa_ok();

COMMIT;
