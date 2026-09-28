-- ============================================================================
-- Ẩn lab_dispatch_log.action_token khỏi mọi tài khoản đăng nhập.
--
-- Lỗ hổng (có từ trước): policy disp_select_all cho MỌI tài khoản đăng nhập —
-- kể cả vừa tự đăng ký — đọc toàn bộ lab_dispatch_log, gồm cột action_token.
-- Trang lab-response.html chỉ cần token này để gọi Edge Function
-- handle-lab-callback báo "nhận / không nhận mẫu" (PXN không cần đăng nhập),
-- nên ai đọc được token là phản hồi được THAY cho phòng xét nghiệm.
--
-- Sửa: bỏ quyền SELECT cả bảng, cấp lại SELECT từng cột TRỪ action_token.
-- App không bao giờ đọc cột này (chỉ ghi khi gửi yêu cầu); Edge Function dùng
-- service_role nên không bị ảnh hưởng. Đề xuất của tuyến cơ sở/Đội trưởng
-- không được kèm token.
--
-- LƯU Ý: truy vấn select('*') trên bảng này sẽ bị lỗi quyền — phải liệt kê cột.
-- App RRT đã đổi theo (lab-dispatch-actions.js). Nếu app LIMS có select('*')
-- trên lab_dispatch_log thì cần đổi tương tự.
-- Chạy lại được nhiều lần. Hoàn tác: GRANT SELECT ON public.lab_dispatch_log TO anon, authenticated;
-- ============================================================================
BEGIN;

REVOKE SELECT ON public.lab_dispatch_log FROM anon, authenticated;

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'lab_dispatch_log'
    AND column_name <> 'action_token';
  EXECUTE format('GRANT SELECT (%s) ON public.lab_dispatch_log TO authenticated', cols);
END $$;

-- Đề xuất (status = 'suggested') không được tự gắn token
DROP POLICY IF EXISTS rrt_insert_suggestion ON public.lab_dispatch_log;
CREATE POLICY rrt_insert_suggestion ON public.lab_dispatch_log FOR INSERT TO authenticated
  WITH CHECK (
    status = 'suggested'
    AND action_token IS NULL
    AND dispatched_by = auth.uid()
    AND (public.rrt_is_ward_admin() OR public.rrt_is_leader())
    AND (incident_id IS NULL OR public.rrt_can_view_incident(incident_id))
  );

COMMIT;
