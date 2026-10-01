-- ============================================================================
-- Xóa sự kiện (chỉ Quản trị RRT HCDC) — phải gõ đúng tên sự kiện để xác nhận.
--
-- Vì sao: webapp chưa có chức năng xóa sự kiện; dọn sự kiện diễn tập/tạo nhầm
-- phải chạy SQL tay. Xóa sự kiện kéo theo (ON DELETE CASCADE) nhật ký, IAP, báo
-- cáo, lịch sử điều động...; thông báo không có khóa ngoại nên xóa kèm ở đây.
-- Chốt an toàn: chỉ rrt_is_admin(); tên xác nhận phải trùng tên sự kiện.
--
-- Không ảnh hưởng LIMS. Chạy lại được nhiều lần.
-- Gỡ bỏ: DROP FUNCTION IF EXISTS public.rrt_delete_incident(uuid, text);
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.rrt_delete_incident(p_incident_id uuid, p_confirm_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name    text;
  v_notif   int;
BEGIN
  IF NOT public.rrt_is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Chỉ Quản trị RRT (HCDC) được xóa sự kiện.' USING ERRCODE = '42501';
  END IF;

  SELECT event_name INTO v_name FROM public.incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Sự kiện không tồn tại.';
  END IF;
  IF btrim(coalesce(v_name, '')) <> btrim(coalesce(p_confirm_name, '')) THEN
    RAISE EXCEPTION 'BAD_REQUEST: Tên xác nhận không khớp tên sự kiện — không xóa.';
  END IF;

  DELETE FROM public.notifications WHERE incident_id = p_incident_id;
  GET DIAGNOSTICS v_notif = ROW_COUNT;
  DELETE FROM public.incidents WHERE id = p_incident_id;

  RETURN jsonb_build_object('deleted', v_name, 'notifications', v_notif);
END $$;

REVOKE ALL ON FUNCTION public.rrt_delete_incident(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_delete_incident(uuid, text) TO authenticated;

COMMIT;
