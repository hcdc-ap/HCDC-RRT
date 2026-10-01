-- ============================================================================
-- Siết thêm các trường hồ sơ người dùng không được tự đổi (rrt_profiles_guard).
--
-- Rà soát sau tập dượt 01/10: biểu mẫu RRT chỉ gửi thông tin cá nhân, nhưng gọi
-- thẳng API thì nhân sự (không phải quản trị) vẫn đổi được:
--   - team (tự chuyển đội → lọt vào lịch trực / luân chuyển của đội khác),
--   - deployment_status (tự đặt "Sẵn sàng"), edit_comment (ghi chú duyệt của
--     quản trị), created_at;
--   - telegram_chat_id — kể cả quản trị tuyến cơ sở sửa hồ sơ nhân viên: gắn
--     chat Telegram của mình vào hồ sơ người khác để nhận / bấm thay thông báo.
-- Cách xử lý giống phần cũ: GIỮ GIÁ TRỊ CŨ (không báo lỗi) để không chặn việc
-- lưu biểu mẫu. Đội, vị trí do quản trị đổi ở trang Thành viên; Telegram do bot
-- liên kết (service role — không qua chốt này).
--
-- Quản trị RRT (HCDC), service role (bot, Edge Function, LIMS server) không bị
-- ảnh hưởng. Các quy tắc cũ giữ nguyên. Chạy lại được nhiều lần.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.rrt_profiles_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.rrt_is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.role := 'user';
    NEW.registration_status := 'pending';
    NEW.approval_status := 'pending';
    NEW.lab_id := NULL;
    NEW.position := NULL;
    NEW.telegram_chat_id := NULL;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.lab_id IS DISTINCT FROM OLD.lab_id
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Không có quyền đổi vai trò / phòng xét nghiệm của tài khoản'
      USING ERRCODE = '42501';
  END IF;

  -- Email hồ sơ gắn với email đăng nhập: chỉ Quản trị đổi (form hồ sơ gửi kèm
  -- email — giữ nguyên thay vì báo lỗi để không chặn việc lưu hồ sơ)
  NEW.email := OLD.email;
  -- Liên kết Telegram chỉ do bot (service role) hoặc Quản trị HCDC đặt
  NEW.telegram_chat_id := OLD.telegram_chat_id;
  NEW.created_at := OLD.created_at;

  IF OLD.id = auth.uid() THEN
    -- Tự sửa hồ sơ của mình
    IF NEW.registration_status IS DISTINCT FROM OLD.registration_status
       OR NEW.position IS DISTINCT FROM OLD.position THEN
      RAISE EXCEPTION 'Không tự duyệt tài khoản hoặc tự đổi chức vụ được'
        USING ERRCODE = '42501';
    END IF;
    -- Chỉ được đưa hồ sơ về "chờ duyệt" (khi gửi cập nhật), không tự duyệt
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
       AND lower(coalesce(NEW.approval_status, '')) <> 'pending' THEN
      RAISE EXCEPTION 'Không tự duyệt hồ sơ được' USING ERRCODE = '42501';
    END IF;
    -- Đội, trạng thái sẵn sàng, ghi chú duyệt: do quản trị quản lý
    NEW.team := OLD.team;
    NEW.deployment_status := OLD.deployment_status;
    NEW.edit_comment := OLD.edit_comment;
    -- Đã duyệt thì không tự đổi nơi công tác / đơn vị: giữ nguyên giá trị cũ
    -- (form hồ sơ luôn gửi kèm các trường này; báo lỗi sẽ chặn cả việc lưu hồ
    -- sơ khi dropdown chưa tải kịp). Chuyển nơi công tác: nhờ HCDC.
    IF OLD.registration_status = 'approved' THEN
      NEW.workplace_ward := OLD.workplace_ward;
      NEW.workplace_ma_xa := OLD.workplace_ma_xa;
      NEW.fax := OLD.fax;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
