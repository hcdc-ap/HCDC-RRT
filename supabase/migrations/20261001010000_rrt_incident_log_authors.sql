-- ============================================================================
-- Người viết nhật ký / tin nhắn của MỘT sự kiện: họ tên, vị trí, đơn vị theo
-- user_id, cho người được xem sự kiện đó (rrt_can_view_incident).
--
-- Vì sao: incident_logs chỉ lưu user_id; RLS profiles chỉ cho đọc hồ sơ cùng
-- phường/xã, nên khung chat hiện "Thành viên" cho mọi tin nhắn của người khác
-- (ghi nhận buổi tập dượt 01/10, E1). Chỉ trả người ĐÃ viết trong sự kiện này
-- (kể cả quản trị HCDC / tuyến cơ sở không nằm trong danh sách thành viên).
--
-- is_external = người không thuộc phường/xã của sự kiện (sự kiện có ma_xa).
-- Không ảnh hưởng LIMS. Chạy lại được nhiều lần.
-- Gỡ bỏ: DROP FUNCTION IF EXISTS public.rrt_incident_log_authors(uuid);
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
  JOIN public.profiles p
    ON p.id IN (SELECT DISTINCT l.user_id FROM public.incident_logs l WHERE l.incident_id = i.id)
  WHERE i.id = p_incident_id
    AND public.rrt_can_view_incident(p_incident_id);
$$;

REVOKE ALL ON FUNCTION public.rrt_incident_log_authors(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_incident_log_authors(uuid) TO authenticated;

COMMIT;
