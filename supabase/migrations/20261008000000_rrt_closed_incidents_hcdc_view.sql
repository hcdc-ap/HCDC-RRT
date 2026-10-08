-- ============================================================================
-- Sự kiện ĐÃ ĐÓNG: nhân sự RRT của HCDC được XEM (rút kinh nghiệm).
--
-- Góp ý diễn tập 08/10 (5.1): sau khi đóng, sự kiện được "đẩy lên hệ thống" để
-- các thành viên RRT HCDC còn lại xem bối cảnh, nhật ký, IAP, AAR và rút bài học.
--
-- Phạm vi:
--   - Chỉ sự kiện status = 'closed'; sự kiện đang hoạt động giữ nguyên quyền cũ.
--   - Chỉ nhân sự HCDC đã duyệt (đơn vị "Trung tâm Kiểm soát bệnh tật Thành phố
--     Hồ Chí Minh"); nhân sự Trạm Y tế / UBND xã không được mở rộng quyền.
--   - Chỉ XEM. rrt_can_view_incident GIỮ NGUYÊN vì nó còn nằm trong quy tắc GHI
--     (nhật ký, báo cáo Đội trưởng, hoạt động IAP, lịch sử điều động…). Thêm
--     rrt_can_read_incident = rrt_can_view_incident + (HCDC & đã đóng), và chỉ
--     các quy tắc SELECT + hàm chỉ-đọc (thẻ thành viên, người viết tin) dùng nó.
-- Không ảnh hưởng LIMS. Chạy lại được nhiều lần.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.rrt_is_hcdc_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.registration_status = 'approved'
      AND lower(btrim(coalesce(p.fax, ''))) = 'trung tâm kiểm soát bệnh tật thành phố hồ chí minh'
  );
$$;

CREATE OR REPLACE FUNCTION public.rrt_can_read_incident(p_incident_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.rrt_can_view_incident(p_incident_id) OR (
    public.rrt_is_hcdc_staff() AND EXISTS (
      SELECT 1 FROM public.incidents i WHERE i.id = p_incident_id AND i.status = 'closed'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.rrt_is_hcdc_staff() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_is_hcdc_staff() TO authenticated;
REVOKE ALL ON FUNCTION public.rrt_can_read_incident(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_can_read_incident(uuid) TO authenticated;

-- Bảng incidents
DROP POLICY IF EXISTS rrt_incidents_select ON public.incidents;
CREATE POLICY rrt_incidents_select ON public.incidents FOR SELECT TO authenticated
  USING (
    public.rrt_is_admin()
    OR (public.rrt_is_ward_admin() AND ma_xa = public.current_user_workplace_ma_xa())
    OR (public.rrt_is_approved() AND (
          public.rrt_email_in_list(public.rrt_my_email(), members)
          OR public.rrt_email_in_list(public.rrt_my_email(), initial_selected_members)))
    OR (status = 'closed' AND public.rrt_is_hcdc_staff())
  );

-- Các bảng con: chỉ quy tắc SELECT chuyển sang rrt_can_read_incident
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public' AND cmd = 'SELECT'
      AND qual LIKE '%rrt_can_view_incident(%'
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)',
      r.policyname, r.schemaname, r.tablename,
      replace(r.qual, 'rrt_can_view_incident(', 'rrt_can_read_incident('));
  END LOOP;
END $$;

-- Hàm chỉ-đọc dùng cho hồ sơ sự kiện (giữ nguyên thân hàm hiện có, chỉ đổi điều kiện xem)
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['rrt_incident_member_cards', 'rrt_incident_log_authors'] LOOP
    IF to_regprocedure('public.' || f || '(uuid)') IS NOT NULL THEN
      EXECUTE replace(pg_get_functiondef(('public.' || f || '(uuid)')::regprocedure),
                      'rrt_can_view_incident(', 'rrt_can_read_incident(');
    END IF;
  END LOOP;
END $$;

COMMIT;
