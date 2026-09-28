-- ============================================================================
-- Tuyến cơ sở / Đội trưởng ĐỀ XUẤT phòng xét nghiệm cho HCDC chốt.
--
-- Trong app, tuyến cơ sở và Đội trưởng thấy nút "Đề xuất lên điều phối" ở công
-- cụ Tìm PXN (HCDC mới có nút xác nhận điều phối). Nút này chưa bao giờ chạy:
--   1. lab_dispatch_log chỉ cho is_admin() ghi → ghi đề xuất bị chặn;
--   2. báo cho HCDC phải đọc danh sách tài khoản admin → tuyến cơ sở không đọc
--      được, và RLS thông báo cũng không cho gửi tới người ngoài phường/xã.
--
-- Sửa:
--   * Cho ghi dòng lab_dispatch_log trạng thái 'suggested' của CHÍNH MÌNH, khi
--     là tuyến cơ sở / Đội trưởng đã duyệt và (nếu gắn sự kiện) xem được sự kiện.
--   * Hàm rrt_notify_admins(): gửi thông báo tới mọi Quản trị HCDC (không lộ
--     danh sách email admin cho người gọi).
-- Không đổi quyền chốt/gửi yêu cầu tới PXN (vẫn chỉ HCDC). Chạy lại được.
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS rrt_insert_suggestion ON public.lab_dispatch_log;
CREATE POLICY rrt_insert_suggestion ON public.lab_dispatch_log FOR INSERT TO authenticated
  WITH CHECK (
    status = 'suggested'
    AND dispatched_by = auth.uid()
    AND (public.rrt_is_ward_admin() OR public.rrt_is_leader())
    AND (incident_id IS NULL OR public.rrt_can_view_incident(incident_id))
  );

CREATE OR REPLACE FUNCTION public.rrt_notify_admins(p_message text, p_incident_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT (public.rrt_is_admin() OR public.rrt_is_ward_admin() OR public.rrt_is_leader()) THEN
    RAISE EXCEPTION 'Không có quyền' USING ERRCODE = '42501';
  END IF;
  IF p_incident_id IS NOT NULL AND NOT public.rrt_can_view_incident(p_incident_id) THEN
    RAISE EXCEPTION 'Không có quyền với sự kiện này' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.notifications (user_email, message, notification_type, incident_id, is_read)
  SELECT p.email, left(coalesce(p_message, ''), 1000), 'thong_tin', p_incident_id, false
  FROM public.profiles p
  WHERE lower(coalesce(p.role, '')) IN ('admin', 'super_admin')
    AND p.email IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rrt_notify_admins(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rrt_notify_admins(text, uuid) TO authenticated;

COMMIT;
