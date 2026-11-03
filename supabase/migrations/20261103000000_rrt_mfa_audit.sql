-- ============================================================================
-- XÁC THỰC 2 BƯỚC (MFA) + NHẬT KÝ TRUY CẬP
-- ============================================================================
-- Gồm:
--  1. rrt_mfa_ok(): true nếu người dùng KHÔNG bật MFA, hoặc phiên đã qua bước 2 (aal2).
--  2. Policy RESTRICTIVE "rrt_mfa_gate" trên MỌI bảng public đang bật RLS: người đã bật
--     MFA nhưng phiên mới qua mật khẩu (aal1) không đọc/ghi được dữ liệu, kể cả gọi
--     thẳng API. RESTRICTIVE chỉ THU HẸP quyền, không nới quyền nào của policy cũ;
--     người chưa bật MFA, anon và service_role không bị ảnh hưởng.
--  3. Bảng mã dự phòng + đếm lần thử (chỉ service_role/Edge Function truy cập).
--  4. Bảng nhật ký truy cập (chỉ thêm, không sửa/xóa; chỉ admin đọc) + RPC rrt_log_event.
--  5. Trigger ghi nhật ký: bật/tắt MFA, đổi mật khẩu (bảng auth — bỏ qua nếu không đủ
--     quyền, khi đó app tự báo qua rrt_log_event), duyệt tài khoản.
-- Hoàn tác: supabase/migrations/rollback/20261103000000_rrt_mfa_audit_down.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Hàm kiểm tra MFA
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rrt_mfa_ok()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = auth.uid() AND f.status = 'verified'
      );
$$;
REVOKE ALL ON FUNCTION public.rrt_mfa_ok() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_mfa_ok() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Mã dự phòng + đếm lần thử (không policy = người dùng thường không thấy gì)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rrt_mfa_backup_codes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);
CREATE TABLE IF NOT EXISTS public.rrt_mfa_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rrt_mfa_attempts_user ON public.rrt_mfa_attempts (user_id, attempted_at DESC);
ALTER TABLE public.rrt_mfa_backup_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rrt_mfa_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rrt_mfa_backup_codes, public.rrt_mfa_attempts FROM anon, public, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rrt_mfa_backup_codes, public.rrt_mfa_attempts TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Nhật ký truy cập: chỉ thêm, không sửa/xóa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rrt_access_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id    uuid,          -- không khóa ngoại: xóa tài khoản vẫn giữ nhật ký
  email      text,
  event      text NOT NULL,
  success    boolean NOT NULL DEFAULT true,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  user_agent text
);
CREATE INDEX IF NOT EXISTS idx_rrt_access_log_created ON public.rrt_access_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rrt_access_log_user ON public.rrt_access_log (user_id, created_at DESC);
ALTER TABLE public.rrt_access_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rrt_access_log FROM anon, public, authenticated;
GRANT SELECT ON public.rrt_access_log TO authenticated;
GRANT SELECT, INSERT ON public.rrt_access_log TO service_role;

DROP POLICY IF EXISTS rrt_access_log_admin_read ON public.rrt_access_log;
CREATE POLICY rrt_access_log_admin_read ON public.rrt_access_log
  FOR SELECT TO authenticated
  USING (public.rrt_is_admin());

CREATE OR REPLACE FUNCTION public.rrt_access_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Nhật ký truy cập chỉ được thêm, không được sửa hoặc xóa' USING ERRCODE = '42501';
END;
$$;
DROP TRIGGER IF EXISTS trg_rrt_access_log_immutable ON public.rrt_access_log;
CREATE TRIGGER trg_rrt_access_log_immutable
  BEFORE UPDATE OR DELETE ON public.rrt_access_log
  FOR EACH ROW EXECUTE FUNCTION public.rrt_access_log_immutable();
DROP TRIGGER IF EXISTS trg_rrt_access_log_no_truncate ON public.rrt_access_log;
CREATE TRIGGER trg_rrt_access_log_no_truncate
  BEFORE TRUNCATE ON public.rrt_access_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.rrt_access_log_immutable();

-- Ghi nhật ký nội bộ (trigger/RPC dùng chung). Lỗi ghi log KHÔNG được làm hỏng thao tác chính.
CREATE OR REPLACE FUNCTION public.rrt_write_log(
  p_user uuid, p_email text, p_event text, p_success boolean, p_detail jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.rrt_access_log (user_id, email, event, success, detail)
  VALUES (p_user, p_email, p_event, coalesce(p_success, true), coalesce(p_detail, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'rrt_write_log: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.rrt_write_log(uuid, text, text, boolean, jsonb) FROM public, anon, authenticated;

-- App báo sự kiện của CHÍNH người đăng nhập. Chỉ nhận các sự kiện trong danh sách,
-- user_id/email luôn lấy từ phiên (không giả mạo được người khác).
-- Sự kiện bật/tắt MFA, đổi mật khẩu: bỏ qua nếu trigger đã ghi trong 15 giây gần nhất.
CREATE OR REPLACE FUNCTION public.rrt_log_event(p_event text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập' USING ERRCODE = '28000';
  END IF;
  IF p_event NOT IN ('login_success', 'logout', 'mfa_verify_failed',
                     'mfa_enabled', 'mfa_disabled', 'password_changed') THEN
    RAISE EXCEPTION 'Sự kiện không hợp lệ: %', p_event USING ERRCODE = '22023';
  END IF;
  IF p_event IN ('mfa_enabled', 'mfa_disabled', 'password_changed') AND EXISTS (
    SELECT 1 FROM public.rrt_access_log
    WHERE user_id = v_uid AND event = p_event AND created_at > now() - interval '15 seconds'
  ) THEN
    RETURN;
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  PERFORM public.rrt_write_log(v_uid, v_email, p_event, p_event <> 'mfa_verify_failed',
                               jsonb_build_object('source', 'client') || coalesce(p_detail, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.rrt_log_event(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_log_event(text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Trigger ghi nhật ký
-- ---------------------------------------------------------------------------
-- 4a. Duyệt tài khoản (bảng của app)
CREATE OR REPLACE FUNCTION public.rrt_log_account_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
DECLARE v_actor_email text;
BEGIN
  IF lower(coalesce(NEW.approval_status, '')) = 'approved'
     AND lower(coalesce(OLD.approval_status, '')) <> 'approved' THEN
    SELECT email INTO v_actor_email FROM auth.users WHERE id = auth.uid();
    PERFORM public.rrt_write_log(
      auth.uid(), v_actor_email, 'account_approved', true,
      jsonb_build_object('target_user_id', NEW.id, 'target_email', NEW.email));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_rrt_log_account_approved ON public.profiles;
CREATE TRIGGER trg_rrt_log_account_approved
  AFTER UPDATE OF approval_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.rrt_log_account_approved();

-- 4b. Bật/tắt MFA, đổi mật khẩu: trigger trên bảng auth.* — có thể không đủ quyền trên
-- Supabase; khi đó bỏ qua (app tự báo qua rrt_log_event).
CREATE OR REPLACE FUNCTION public.rrt_log_mfa_factor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
DECLARE v_uid uuid; v_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'verified' THEN RETURN OLD; END IF;
    v_uid := OLD.user_id;
  ELSE
    IF NEW.status <> 'verified' OR (TG_OP = 'UPDATE' AND OLD.status = 'verified') THEN RETURN NEW; END IF;
    v_uid := NEW.user_id;
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  PERFORM public.rrt_write_log(v_uid, v_email,
    CASE WHEN TG_OP = 'DELETE' THEN 'mfa_disabled' ELSE 'mfa_enabled' END, true,
    jsonb_build_object('source', 'trigger'));
  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.rrt_log_password_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    PERFORM public.rrt_write_log(NEW.id, NEW.email, 'password_changed', true,
                                 jsonb_build_object('source', 'trigger'));
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_rrt_log_mfa_factor ON auth.mfa_factors;
  CREATE TRIGGER trg_rrt_log_mfa_factor
    AFTER INSERT OR UPDATE OF status OR DELETE ON auth.mfa_factors
    FOR EACH ROW EXECUTE FUNCTION public.rrt_log_mfa_factor();
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'Không tạo được trigger trên auth.mfa_factors (%): app sẽ tự báo bật/tắt MFA', SQLERRM;
END $$;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS trg_rrt_log_password_changed ON auth.users;
  CREATE TRIGGER trg_rrt_log_password_changed
    AFTER UPDATE OF encrypted_password ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.rrt_log_password_changed();
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE 'Không tạo được trigger trên auth.users (%): app sẽ tự báo đổi mật khẩu', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Cổng MFA trên mọi bảng public đang bật RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity AND NOT c.relispartition
      AND c.relname <> 'spatial_ref_sys'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rrt_mfa_gate ON public.%I', r.relname);
    EXECUTE format(
      'CREATE POLICY rrt_mfa_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING ((SELECT public.rrt_mfa_ok())) WITH CHECK ((SELECT public.rrt_mfa_ok()))',
      r.relname);
  END LOOP;
END $$;

COMMIT;
