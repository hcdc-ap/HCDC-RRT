-- ============================================================================
-- Bảng lưu kết quả tập dượt (trang tap-duot.html) — tách riêng, không đụng bảng
-- nghiệp vụ. Mỗi dòng: một tình huống ('result', key = mã tình huống) hoặc một
-- vai ('cast', key = mã vai); nội dung trong cột data (JSON nhỏ).
--
-- Quyền: chỉ tài khoản RRT đã duyệt (hoặc quản trị) đọc/ghi; khách chưa đăng
-- nhập và tài khoản chờ duyệt không thấy gì. Chỉ quản trị HCDC xóa.
-- Người ghi và thời điểm do trigger đặt (không tin giá trị client gửi lên).
--
-- Không ảnh hưởng LIMS. Chạy lại được nhiều lần.
-- Gỡ bỏ sau khi dùng xong:  DROP TABLE IF EXISTS public.rrt_rehearsal;
--                           DROP FUNCTION IF EXISTS public.rrt_rehearsal_stamp();
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.rrt_rehearsal (
  kind       text NOT NULL CHECK (kind IN ('result', 'cast')),
  key        text NOT NULL CHECK (key ~ '^[A-Za-z0-9_-]{1,20}$'),
  data       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(data::text) <= 4000),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);

CREATE OR REPLACE FUNCTION public.rrt_rehearsal_stamp()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rrt_rehearsal_stamp ON public.rrt_rehearsal;
CREATE TRIGGER trg_rrt_rehearsal_stamp BEFORE INSERT OR UPDATE ON public.rrt_rehearsal
  FOR EACH ROW EXECUTE FUNCTION public.rrt_rehearsal_stamp();

ALTER TABLE public.rrt_rehearsal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rrt_rehearsal FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rrt_rehearsal TO authenticated;

DROP POLICY IF EXISTS rrt_rehearsal_select ON public.rrt_rehearsal;
CREATE POLICY rrt_rehearsal_select ON public.rrt_rehearsal FOR SELECT TO authenticated
  USING (public.rrt_is_approved());

DROP POLICY IF EXISTS rrt_rehearsal_insert ON public.rrt_rehearsal;
CREATE POLICY rrt_rehearsal_insert ON public.rrt_rehearsal FOR INSERT TO authenticated
  WITH CHECK (public.rrt_is_approved());

DROP POLICY IF EXISTS rrt_rehearsal_update ON public.rrt_rehearsal;
CREATE POLICY rrt_rehearsal_update ON public.rrt_rehearsal FOR UPDATE TO authenticated
  USING (public.rrt_is_approved()) WITH CHECK (public.rrt_is_approved());

DROP POLICY IF EXISTS rrt_rehearsal_delete ON public.rrt_rehearsal;
CREATE POLICY rrt_rehearsal_delete ON public.rrt_rehearsal FOR DELETE TO authenticated
  USING (public.rrt_is_admin());

COMMIT;
