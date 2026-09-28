-- ============================================================================
-- VÁ 2 lỗ hổng do quyền "tự sửa hồ sơ" (p_self_update) của migration
-- 20260929000000_rrt_rls_roles.sql:
--
-- 1. rrt_my_email() lấy email từ profiles.email — cột người dùng tự sửa được.
--    Nhân viên đổi email hồ sơ thành email người khác (khác hoa/thường để lọt
--    ràng buộc unique) là đọc được thông báo / sự kiện của người đó.
--    → Lấy email từ auth.users (email đăng nhập, người dùng không tự sửa được),
--      và không cho tài khoản không phải Quản trị đổi profiles.email.
--
-- 2. Tuyến cơ sở tự đổi nơi công tác (workplace_ward) của mình là trở thành
--    tuyến cơ sở của phường/xã khác.
--    → Tài khoản ĐÃ DUYỆT tự sửa hồ sơ thì nơi công tác / đơn vị (fax) được giữ
--      nguyên; cần Quản trị đổi. Tài khoản chưa duyệt vẫn tự chọn được (để đăng ký).
--
-- Chạy lại được nhiều lần. Hoàn tác: chạy lại phần hàm tương ứng trong
-- 20260929000000_rrt_rls_roles.sql (hoặc rollback toàn bộ bằng file rollback/).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rrt_my_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT lower(trim(u.email)) FROM auth.users u WHERE u.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.rrt_profiles_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
$$;

COMMIT;
