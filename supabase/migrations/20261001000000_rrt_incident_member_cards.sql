-- ============================================================================
-- Thẻ thành viên sự kiện: họ tên / vị trí / đội / đơn vị của những người thuộc
-- MỘT sự kiện, cho người được xem sự kiện đó (rrt_can_view_incident).
--
-- Vì sao: RLS profiles chỉ cho nhân viên / tuyến cơ sở đọc hồ sơ cùng phường/xã,
-- nên danh sách thành viên sự kiện chỉ hiện email + "Thành viên" cho nhân sự
-- HCDC/xã khác được điều động hỗ trợ (ghi nhận buổi tập dượt 01/10, D6, E1).
-- Hàm này KHÔNG mở rộng quyền đọc profiles: chỉ trả vài cột hiển thị, chỉ cho
-- người nằm trong danh sách mời / tham gia / từ chối của đúng sự kiện đó.
--
-- is_external = người không thuộc phường/xã của sự kiện (sự kiện có ma_xa).
-- Không ảnh hưởng LIMS. Chạy lại được nhiều lần.
-- Gỡ bỏ: DROP FUNCTION IF EXISTS public.rrt_incident_member_cards(uuid);
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.rrt_incident_member_cards(p_incident_id uuid)
RETURNS TABLE (
  email text,
  full_name text,
  "position" text,
  team text,
  unit text,
  workplace_ward text,
  is_external boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH inc AS (
    SELECT i.ma_xa,
           coalesce(i.initial_selected_members, '') || ';' ||
           coalesce(i.members, '') || ';' ||
           coalesce(i.declined_members, '') AS all_emails
    FROM public.incidents i
    WHERE i.id = p_incident_id
      AND public.rrt_can_view_incident(p_incident_id)
  ),
  em AS (
    SELECT DISTINCT lower(trim(x)) AS email
    FROM inc, unnest(string_to_array(inc.all_emails, ';')) AS x
    WHERE trim(x) <> ''
  )
  SELECT em.email,
         p.full_name,
         p.position,
         p.team,
         p.fax,
         p.workplace_ward,
         (inc.ma_xa IS NOT NULL AND NOT (
           p.workplace_ma_xa IS NOT DISTINCT FROM inc.ma_xa
           AND lower(btrim(coalesce(p.fax, ''))) IN ('trạm y tế phường/xã/ đặc khu', 'ubnd phường/xã/ đặc khu')
         ))
  FROM em
  CROSS JOIN inc
  JOIN public.profiles p ON lower(trim(p.email)) = em.email;
$$;

REVOKE ALL ON FUNCTION public.rrt_incident_member_cards(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_incident_member_cards(uuid) TO authenticated;

COMMIT;
