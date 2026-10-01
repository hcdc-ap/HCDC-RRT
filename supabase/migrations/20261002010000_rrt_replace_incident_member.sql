-- ============================================================================
-- Thay một người trong sự kiện + ghi lịch sử điều động (một giao dịch).
--
-- Vì sao: nút "Người" (thay quân) đổi danh sách thành viên từ trình duyệt rồi
-- ghi deployment_history riêng, không kiểm tra lỗi; mã người cũ lấy qua bảng
-- profiles (RLS chặn hồ sơ ngoài phường/xã → mã rỗng) nên lịch sử không được
-- ghi — mục "Biến động nhân sự" không thấy lần thay người (tập dượt 01/10, E6).
--
-- Quyền: người quản lý được sự kiện (rrt_can_manage_incident: HCDC, tuyến cơ sở
-- của phường/xã sự kiện). Tuyến cơ sở chỉ đưa vào người cùng phường/xã (trigger
-- rrt_incidents_guard kiểm thêm lần nữa).
-- Lịch sử: user_id = người bị thay, replaced_by = người thay (cách AAR hiển thị
-- "🔄 Thay thế: cũ → mới"); reason ghi ai thực hiện.
--
-- Không ảnh hưởng LIMS. Chạy lại được nhiều lần.
-- Gỡ bỏ: DROP FUNCTION IF EXISTS public.rrt_replace_incident_member(uuid, text, text);
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.rrt_replace_incident_member(
  p_incident_id uuid,
  p_old_email text,
  p_new_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old      text := lower(trim(coalesce(p_old_email, '')));
  v_new      text := lower(trim(coalesce(p_new_email, '')));
  v_inc      public.incidents%ROWTYPE;
  v_old_id   uuid;
  v_new_id   uuid;
  v_new_ma   text;
  v_new_fax  text;
  v_actor    text;
  v_is_admin boolean := public.rrt_is_admin();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Vui lòng đăng nhập lại.' USING ERRCODE = '42501';
  END IF;
  IF v_old = '' OR v_new = '' OR v_old = v_new THEN
    RAISE EXCEPTION 'BAD_REQUEST: Thiếu người cần thay hoặc người thay thế.';
  END IF;
  IF NOT public.rrt_can_manage_incident(p_incident_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Bạn không quản lý sự kiện này.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inc FROM public.incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND OR v_inc.status = 'closed' THEN
    RAISE EXCEPTION 'NOT_FOUND: Sự kiện không tồn tại hoặc đã đóng.';
  END IF;

  SELECT id INTO v_old_id FROM public.profiles WHERE lower(trim(email)) = v_old LIMIT 1;
  SELECT id, workplace_ma_xa, fax INTO v_new_id, v_new_ma, v_new_fax
  FROM public.profiles WHERE lower(trim(email)) = v_new LIMIT 1;
  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Không tìm thấy hồ sơ người thay thế.';
  END IF;

  -- Tuyến cơ sở: người thay phải cùng phường/xã của sự kiện, thuộc tuyến cơ sở
  IF NOT v_is_admin AND NOT (
    v_new_ma IS NOT DISTINCT FROM v_inc.ma_xa
    AND lower(btrim(coalesce(v_new_fax, ''))) IN ('trạm y tế phường/xã/ đặc khu', 'ubnd phường/xã/ đặc khu')
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: Tuyến cơ sở chỉ điều động được nhân sự thuộc phường/xã mình.'
      USING ERRCODE = '42501';
  END IF;

  -- Bỏ người cũ khỏi danh sách mời / đã tham gia, thêm người mới vào danh sách mời
  UPDATE public.incidents i
  SET initial_selected_members = (
        SELECT string_agg(e, ';' ORDER BY e) FROM (
          SELECT DISTINCT lower(trim(x)) AS e
          FROM unnest(string_to_array(coalesce(i.initial_selected_members, ''), ';') || ARRAY[v_new]) AS x
          WHERE trim(x) <> '' AND lower(trim(x)) <> v_old
        ) s),
      members = nullif((
        SELECT string_agg(trim(x), ';')
        FROM unnest(string_to_array(coalesce(i.members, ''), ';')) AS x
        WHERE trim(x) <> '' AND lower(trim(x)) <> v_old), '')
  WHERE i.id = p_incident_id;

  SELECT CASE WHEN v_is_admin THEN 'HCDC' ELSE 'tuyến cơ sở' END
         || coalesce(' (' || nullif(full_name, '') || ')', '')
  INTO v_actor FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.deployment_history (incident_id, user_id, replaced_by, profile_id, action_type, reason)
  VALUES (p_incident_id, coalesce(v_old_id, v_new_id), v_new_id, v_new_id, 'replace_in',
          'Thay quân bởi ' || coalesce(v_actor, 'quản trị'));

  RETURN jsonb_build_object('old_id', v_old_id, 'new_id', v_new_id);
END $$;

REVOKE ALL ON FUNCTION public.rrt_replace_incident_member(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rrt_replace_incident_member(uuid, text, text) TO authenticated;

COMMIT;
