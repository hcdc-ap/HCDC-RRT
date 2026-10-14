-- ============================================================================
-- lab_dispatch_log: thu hẹp quyền ĐỌC (trước: mọi tài khoản đăng nhập đọc mọi dòng).
--
-- Rà soát cùng đội LIMS (14/10/2026). Ai đang đọc bảng này:
--   RRT  - HCDC: bảng điều phối, đề xuất, lịch sử (lab-dispatch-actions.js).
--        - tuyến cơ sở / Đội trưởng: các dòng của sự kiện mình xem (công cụ Xét
--          nghiệm), dòng đề xuất do chính mình tạo.
--        - find_candidate_labs (SECURITY INVOKER): tải đã dùng HÔM NAY.
--   LIMS - lab-status-data.ts, network-data.ts: dòng HÔM NAY (ngày UTC).
--        - reports/run.ts: theo KHOẢNG NGÀY (lịch sử) — hcdc_admin mọi PXN,
--          lab_admin chỉ PXN của mình. (Không có trong phân tích ban đầu của LIMS:
--          chỉ cho đọc "hôm nay" sẽ làm hỏng báo cáo LIMS.)
--        - lims_dispatch_candidate_labs: SECURITY DEFINER, không chịu RLS.
-- Quy tắc mới (đọc được nếu thỏa MỘT trong ba):
--   1. RRT nội bộ: Quản trị RRT; hoặc dòng thuộc sự kiện mình xem được; hoặc dòng
--      do mình tạo (dispatched_by).
--   2. LIMS: hcdc_admin mọi dòng; lab_admin dòng của PXN mình (mọi ngày).
--   3. Tải trong ngày: tài khoản RRT đã duyệt / tài khoản LIMS đọc dòng có
--      dispatch_date từ hôm qua (UTC) trở đi — đủ cho find_candidate_labs và
--      trang tình trạng LIMS (dùng ngày UTC hôm nay).
-- Tài khoản chưa duyệt / không vai trò: không đọc được gì. Cột action_token vẫn bị
-- ẩn (20260929040000). Quyền GHI không đổi.
-- Chạy lại được nhiều lần. Hoàn tác: tạo lại
--   CREATE POLICY disp_select_all ON public.lab_dispatch_log FOR SELECT TO authenticated USING (true);
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS disp_select_all ON public.lab_dispatch_log;

DROP POLICY IF EXISTS disp_select_rrt ON public.lab_dispatch_log;
CREATE POLICY disp_select_rrt ON public.lab_dispatch_log FOR SELECT TO authenticated
  USING (
    public.rrt_is_admin()
    OR (incident_id IS NOT NULL AND public.rrt_can_view_incident(incident_id))
    OR (dispatched_by = auth.uid())
  );

DROP POLICY IF EXISTS disp_select_lims ON public.lab_dispatch_log;
CREATE POLICY disp_select_lims ON public.lab_dispatch_log FOR SELECT TO authenticated
  USING (
    public.lims_current_role() = 'hcdc_admin'
    OR (public.lims_current_role() = 'lab_admin' AND lab_id = public.lims_current_lab_id())
  );

DROP POLICY IF EXISTS disp_select_today_load ON public.lab_dispatch_log;
CREATE POLICY disp_select_today_load ON public.lab_dispatch_log FOR SELECT TO authenticated
  USING (
    dispatch_date >= (now() AT TIME ZONE 'utc')::date - 1
    AND (public.rrt_is_approved() OR public.lims_current_role() IN ('hcdc_admin', 'lab_admin'))
  );

COMMIT;
