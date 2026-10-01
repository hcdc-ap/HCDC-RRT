-- ============================================================================
-- Tên đội của nhân sự Trạm Y tế / UBND xã phải theo mẫu "Team <xã công tác> NN"
-- (vd. "Team Xã Hóc Môn 01") — quy ước đã thống nhất.
--
-- Vì sao: giao diện trang Thành viên đã tạo đúng mẫu, nhưng database chưa chặn:
-- gọi thẳng API (hoặc HCDC chọn nhầm) có thể gán nhân viên Trạm vào đội HCDC
-- ("Team 5") → lọt vào lịch trực / luân chuyển của đội HCDC.
--
-- Quy tắc (mọi tài khoản đăng nhập, kể cả Quản trị HCDC; service role/SQL quản
-- trị không bị chặn):
--   - Hồ sơ thuộc tuyến cơ sở (fax = Trạm Y tế / UBND Phường/Xã/ Đặc khu):
--     đội = NULL, 'No team' hoặc 'Team ' || workplace_ward || ' ' || 2–3 chữ số.
--     Đổi đội sai mẫu → báo lỗi. Chuyển người về Trạm mà đội cũ sai mẫu → đội
--     tự về 'No team' (chờ quản trị phân đội).
--   - Nhân sự HCDC / đơn vị khác: không ràng buộc (Team 1..10 như cũ).
-- Dữ liệu hiện có đều đúng mẫu (đã kiểm tra trước khi áp dụng).
-- Chạy lại được nhiều lần. Gỡ: DROP TRIGGER trg_rrt_ward_team_naming ON public.profiles;
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.rrt_ward_team_name_ok(p_team text, p_workplace_ward text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_team IS NULL OR btrim(p_team) IN ('', 'No team') OR (
    p_workplace_ward IS NOT NULL AND btrim(p_workplace_ward) <> ''
    AND left(p_team, length('Team ' || btrim(p_workplace_ward) || ' ')) = 'Team ' || btrim(p_workplace_ward) || ' '
    AND substr(p_team, length('Team ' || btrim(p_workplace_ward) || ' ') + 1) ~ '^[0-9]{2,3}$'
  );
$$;

CREATE OR REPLACE FUNCTION public.rrt_ward_team_naming()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- service role / SQL quản trị (bot, LIMS server, script) không qua chốt này
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF lower(btrim(coalesce(NEW.fax, ''))) NOT IN ('trạm y tế phường/xã/ đặc khu', 'ubnd phường/xã/ đặc khu') THEN
    RETURN NEW;
  END IF;
  IF public.rrt_ward_team_name_ok(NEW.team, NEW.workplace_ward) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.team IS NOT DISTINCT FROM OLD.team THEN
    -- Đội không đổi nhưng người vừa được chuyển về Trạm (đổi đơn vị / xã):
    -- đội cũ không còn hợp lệ → về "Chưa có đội"
    IF NEW.fax IS DISTINCT FROM OLD.fax OR NEW.workplace_ward IS DISTINCT FROM OLD.workplace_ward THEN
      NEW.team := 'No team';
    END IF;
    -- Không đổi đội, không đổi nơi công tác (vd. tự sửa số điện thoại): để nguyên
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Đội của nhân sự Trạm Y tế phải đặt theo mẫu "Team % 01" (đang chọn: "%")',
    coalesce(NEW.workplace_ward, '<xã/phường>'), NEW.team
    USING ERRCODE = '23514';
END $$;

DROP TRIGGER IF EXISTS trg_rrt_ward_team_naming ON public.profiles;
-- Tên trigger xếp sau trg_rrt_profiles_guard (BEFORE trigger chạy theo tên):
-- kiểm tra trên giá trị đã được chốt hồ sơ giữ nguyên.
CREATE TRIGGER trg_rrt_ward_team_naming
  BEFORE INSERT OR UPDATE OF team, fax, workplace_ward ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.rrt_ward_team_naming();

COMMIT;
