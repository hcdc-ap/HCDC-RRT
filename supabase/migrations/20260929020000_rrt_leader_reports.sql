-- ============================================================================
-- Đội trưởng (profiles.position = 'Leader') đang tham gia sự kiện được LẬP BÁO
-- CÁO tình hình (thêm mới incident_reports). Không sửa/xóa báo cáo; phương án
-- (IAP) vẫn chỉ HCDC + tuyến cơ sở sửa.
-- (Quyết định HCDC 29/09/2026 — nút "Lập báo cáo" trong hồ sơ sự kiện)
-- Chạy lại được nhiều lần.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.rrt_is_leader()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.registration_status = 'approved'
      AND lower(trim(coalesce(p.position, ''))) = 'leader'
  );
$$;

DROP POLICY IF EXISTS rrt_insert_leader ON public.incident_reports;
CREATE POLICY rrt_insert_leader ON public.incident_reports FOR INSERT TO authenticated
  WITH CHECK (public.rrt_is_leader() AND public.rrt_can_view_incident(incident_id));

COMMIT;
