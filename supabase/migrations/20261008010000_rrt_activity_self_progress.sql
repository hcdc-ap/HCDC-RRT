-- ============================================================================
-- Người được giao công việc trong IAP tự đánh dấu hoàn thành / chưa hoàn thành.
--
-- Góp ý diễn tập 08/10 (3.6): thành viên tick công việc được giao để báo tiến độ,
-- Đội trưởng không phải hỏi từng người. Cột "Phụ trách" (assignee_id) là chữ tự
-- do: khớp theo mã tài khoản, email HOẶC họ tên (không phân biệt hoa thường).
-- Mỗi lần đổi ghi 1 dòng nhật ký sự kiện (log_type 'activity') → hiện ngay trong
-- hồ sơ sự kiện (realtime).
--
-- Quyền: phải xem được sự kiện (rrt_can_view_incident), sự kiện chưa đóng, và
-- đúng người phụ trách. Không đổi nội dung, chỉ trạng thái. Không ảnh hưởng LIMS.
-- Chạy lại được nhiều lần.
-- Gỡ bỏ: DROP FUNCTION IF EXISTS public.rrt_set_my_activity_status(uuid, boolean);
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.rrt_set_my_activity_status(p_activity_id uuid, p_done boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_act   public.incident_activities%ROWTYPE;
  v_name  text;
  v_email text := public.rrt_my_email();
  v_who   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Vui lòng đăng nhập lại.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_act FROM public.incident_activities WHERE id = p_activity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Công việc không tồn tại (phương án vừa được cập nhật — mở lại IAP).';
  END IF;
  IF NOT public.rrt_can_view_incident(v_act.incident_id)
     OR EXISTS (SELECT 1 FROM public.incidents WHERE id = v_act.incident_id AND status = 'closed') THEN
    RAISE EXCEPTION 'FORBIDDEN: Không cập nhật được công việc của sự kiện này.' USING ERRCODE = '42501';
  END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  v_who := lower(btrim(coalesce(v_act.assignee_id, '')));
  IF v_who = '' OR NOT (
       v_who = auth.uid()::text
    OR v_who = coalesce(v_email, '')
    OR v_who = lower(btrim(coalesce(v_name, '')))
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: Chỉ người phụ trách công việc mới tự đánh dấu được.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.incident_activities
  SET status = CASE WHEN p_done THEN 'completed' ELSE 'pending' END,
      completed_by = CASE WHEN p_done THEN auth.uid() ELSE NULL END,
      completed_at = CASE WHEN p_done THEN now() ELSE NULL END
  WHERE id = p_activity_id;

  INSERT INTO public.incident_logs (incident_id, user_id, log_type, content)
  VALUES (v_act.incident_id, auth.uid(), 'activity',
          CASE WHEN p_done THEN '✅ Đã hoàn thành công việc: ' ELSE '↩️ Đánh dấu lại chưa hoàn thành: ' END
          || coalesce(v_act.content, ''));

  RETURN jsonb_build_object('id', p_activity_id, 'done', p_done);
END $$;

REVOKE ALL ON FUNCTION public.rrt_set_my_activity_status(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_set_my_activity_status(uuid, boolean) TO authenticated;

COMMIT;
