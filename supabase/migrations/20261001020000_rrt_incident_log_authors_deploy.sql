-- ============================================================================
-- rrt_incident_log_authors: thêm người trong lịch sử điều động của sự kiện
-- (deployment_history.user_id, replaced_by) bên cạnh người viết nhật ký.
--
-- Vì sao: mục "Biến động nhân sự" (AAR) lấy tên qua join profiles → RLS chặn
-- hồ sơ HCDC/xã khác, hiện "Điều động: Thành viên" (ghi nhận tập dượt 01/10).
-- Cùng kiểu trả về, cùng điều kiện rrt_can_view_incident. Chạy lại được.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.rrt_incident_log_authors(p_incident_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  "position" text,
  unit text,
  workplace_ward text,
  is_external boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ids AS (
    SELECT l.user_id AS id FROM public.incident_logs l WHERE l.incident_id = p_incident_id
    UNION
    SELECT d.user_id FROM public.deployment_history d WHERE d.incident_id = p_incident_id
    UNION
    SELECT d.replaced_by FROM public.deployment_history d WHERE d.incident_id = p_incident_id
  )
  SELECT p.id,
         p.full_name,
         p.position,
         p.fax,
         p.workplace_ward,
         (i.ma_xa IS NOT NULL AND NOT (
           p.workplace_ma_xa IS NOT DISTINCT FROM i.ma_xa
           AND lower(btrim(coalesce(p.fax, ''))) IN ('trạm y tế phường/xã/ đặc khu', 'ubnd phường/xã/ đặc khu')
         ))
  FROM public.incidents i
  JOIN public.profiles p ON p.id IN (SELECT id FROM ids WHERE id IS NOT NULL)
  WHERE i.id = p_incident_id
    AND public.rrt_can_view_incident(p_incident_id);
$$;

REVOKE ALL ON FUNCTION public.rrt_incident_log_authors(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_incident_log_authors(uuid) TO authenticated;

COMMIT;
