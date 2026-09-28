-- ============================================================================
-- PHÂN QUYỀN DỮ LIỆU RRT THEO VAI TRÒ (RLS)
-- ============================================================================
-- Trước migration này, mọi tài khoản đăng nhập — kể cả tài khoản vừa tự đăng ký,
-- chưa được duyệt — đọc/ghi/xóa được phần lớn dữ liệu RRT qua API
-- (policy "authenticated_full_access" USING (true)).
--
-- Quy tắc mới (đã thống nhất với HCDC):
--   * Chỉ tài khoản ĐÃ DUYỆT (profiles.registration_status = 'approved') mới
--     truy cập dữ liệu RRT. Chưa duyệt: chỉ xem/sửa hồ sơ của chính mình.
--   * Quản trị HCDC (role admin / super_admin): toàn quyền. XÓA chỉ Quản trị.
--   * Tuyến cơ sở (ward_admin): chỉ nội bộ phường/xã (profiles.workplace_ma_xa)
--       - duyệt đăng ký, sửa hồ sơ + năng lực chuyên môn nhân sự phường/xã
--       - tạo/quản lý sự kiện có ma_xa = phường/xã mình
--       - chỉ điều động/phân công nhân sự phường/xã mình
--       - tạo lịch trực, sửa/xóa lịch trực do mình tạo
--       - KHÔNG ghi nhận đào tạo (chỉ HCDC)
--   * Nhân viên (user): xem lịch trực cả đội, thông báo của mình, sự kiện mình
--     được điều động; chỉ trả lời (nhận/từ chối) phần của mình.
--
-- Không đụng tới bảng LIMS (lims_*, lab_*, laboratories, inventory_transactions),
-- training_*, pathogens, test_types, technique_equivalences, website_stats.
--
-- Thay luôn bản thử "restrict_notifications_rls" (không cần áp riêng; nếu đã
-- áp thì các policy notif_* của nó cũng bị xóa ở bước 2).
--
-- Hoàn tác: supabase/migrations/rollback/20260929000000_rrt_rls_roles_down.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Trạng thái duyệt tài khoản
-- ----------------------------------------------------------------------------
-- App đang duyệt bằng cột approval_status (duyệt HỒ SƠ — tự quay về 'pending'
-- mỗi khi nhân viên tự sửa hồ sơ), nên không dùng được làm "được phép truy cập".
-- Dùng registration_status làm cờ DUYỆT TÀI KHOẢN (một lần), tự bật khi
-- approval_status được duyệt lần đầu.

-- Tài khoản hiện có: coi là đã duyệt nếu hồ sơ đã từng được duyệt ('approved',
-- 'edit' = đã duyệt rồi bị yêu cầu sửa) hoặc là tài khoản quản trị/LIMS.
UPDATE public.profiles
SET registration_status = 'approved'
WHERE coalesce(registration_status, '') <> 'approved'
  AND (
    lower(coalesce(approval_status, '')) IN ('approved', 'edit')
    OR lower(coalesce(role, '')) IN ('admin', 'super_admin', 'ward_admin', 'hcdc_admin', 'lab_admin')
  );

CREATE OR REPLACE FUNCTION public.rrt_sync_registration_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF lower(coalesce(NEW.approval_status, '')) = 'approved'
     AND coalesce(NEW.registration_status, '') <> 'approved' THEN
    NEW.registration_status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rrt_sync_registration_status ON public.profiles;
CREATE TRIGGER trg_rrt_sync_registration_status
  BEFORE INSERT OR UPDATE OF approval_status, registration_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.rrt_sync_registration_status();

-- ----------------------------------------------------------------------------
-- 1. Hàm hỗ trợ (SECURITY DEFINER để đọc profiles mà không vòng lặp RLS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rrt_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(coalesce(p.role, '')) IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.rrt_is_approved()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.registration_status = 'approved'
        OR lower(coalesce(p.role, '')) IN ('admin', 'super_admin')
      )
  );
$$;

-- Tuyến cơ sở ĐÃ DUYỆT và có phường/xã công tác
CREATE OR REPLACE FUNCTION public.rrt_is_ward_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(coalesce(p.role, '')) = 'ward_admin'
      AND p.registration_status = 'approved'
      AND p.workplace_ma_xa IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.rrt_my_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT lower(trim(p.email)) FROM public.profiles p WHERE p.id = auth.uid();
$$;

-- Nhân sự (theo id) thuộc phường/xã của tuyến cơ sở đang đăng nhập
CREATE OR REPLACE FUNCTION public.rrt_profile_in_my_ward(p_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.rrt_is_ward_admin() AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_profile_id
      AND public.row_in_my_ward(p.workplace_ma_xa, p.fax)
  );
$$;

-- Nhân sự (theo email) thuộc phường/xã của tuyến cơ sở đang đăng nhập
CREATE OR REPLACE FUNCTION public.rrt_email_in_my_ward(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.rrt_is_ward_admin() AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE (lower(trim(p.email)) = lower(trim(p_email)) OR p.id::text = trim(p_email))
      AND public.row_in_my_ward(p.workplace_ma_xa, p.fax)
  );
$$;

-- Thông báo gửi cho chính mình: user_email là email (không phân biệt hoa thường)
-- hoặc uid (một số luồng cũ lưu uid vào cột này)
CREATE OR REPLACE FUNCTION public.rrt_is_me(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL
     AND (lower(trim(p_email)) = public.rrt_my_email() OR trim(p_email) = auth.uid()::text);
$$;

-- Email có nằm trong chuỗi "a@x;b@y" không (không phân biệt hoa thường)
CREATE OR REPLACE FUNCTION public.rrt_email_in_list(p_email text, p_list text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_email IS NOT NULL AND p_email <> ''
     AND lower(trim(p_email)) = ANY (
       SELECT lower(trim(x)) FROM unnest(string_to_array(coalesce(p_list, ''), ';')) AS x
     );
$$;

-- Quản lý được sự kiện: Quản trị, hoặc tuyến cơ sở có ma_xa của sự kiện
CREATE OR REPLACE FUNCTION public.rrt_can_manage_incident(p_incident_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.rrt_is_admin() OR (
    public.rrt_is_ward_admin() AND EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = p_incident_id
        AND i.ma_xa = public.current_user_workplace_ma_xa()
    )
  );
$$;

-- Xem được sự kiện: người quản lý, hoặc thành viên được điều động
CREATE OR REPLACE FUNCTION public.rrt_can_view_incident(p_incident_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.rrt_can_manage_incident(p_incident_id) OR (
    public.rrt_is_approved() AND EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = p_incident_id
        AND (
          public.rrt_email_in_list(public.rrt_my_email(), i.members)
          OR public.rrt_email_in_list(public.rrt_my_email(), i.initial_selected_members)
        )
    )
  );
$$;

-- Người nhận là thành viên (được điều động/đã xác nhận/từ chối) của sự kiện
-- mà người gọi quản lý — để tuyến cơ sở đóng sự kiện báo được cả thành viên
-- HCDC điều động từ ngoài phường/xã.
CREATE OR REPLACE FUNCTION public.rrt_email_in_managed_incident(p_email text, p_incident_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_incident_id IS NOT NULL
     AND public.rrt_can_manage_incident(p_incident_id)
     AND EXISTS (
       SELECT 1 FROM public.incidents i
       WHERE i.id = p_incident_id
         AND (public.rrt_email_in_list(p_email, i.members)
              OR public.rrt_email_in_list(p_email, i.initial_selected_members)
              OR public.rrt_email_in_list(p_email, i.declined_members))
     );
$$;

-- Lịch trực: xem được nếu là ca của đội mình, ca mình tạo, ca mình được phân
-- công, hoặc (tuyến cơ sở) ca có nhân sự phường/xã mình.
-- Nhận giá trị cột của dòng (không tra lại theo id) để INSERT ... RETURNING chạy đúng.
CREATE OR REPLACE FUNCTION public.rrt_can_view_schedule_row(p_id uuid, p_team_name text, p_created_by uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.rrt_is_admin() OR (
    public.rrt_is_approved() AND (
      p_created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles me
        WHERE me.id = auth.uid()
          AND coalesce(trim(me.team), '') <> ''
          AND lower(trim(me.team)) = lower(trim(p_team_name))
      )
      OR EXISTS (
        SELECT 1 FROM public.roster_assignments a
        WHERE a.schedule_id = p_id
          AND (a.user_id = auth.uid() OR public.rrt_profile_in_my_ward(a.user_id))
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.rrt_can_view_schedule(p_schedule_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.roster_schedules s
    WHERE s.id = p_schedule_id
      AND public.rrt_can_view_schedule_row(s.id, s.team_name, s.created_by)
  );
$$;

-- Quản lý được lịch trực: Quản trị, hoặc tuyến cơ sở đã tạo ca đó
CREATE OR REPLACE FUNCTION public.rrt_can_manage_schedule(p_schedule_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.rrt_is_admin() OR (
    public.rrt_is_ward_admin() AND EXISTS (
      SELECT 1 FROM public.roster_schedules s
      WHERE s.id = p_schedule_id AND s.created_by = auth.uid()
    )
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. Xóa các policy cũ quá rộng trên bảng RRT
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'incidents', 'incident_logs', 'incident_reports', 'incident_plans',
        'incident_assessments', 'incident_objectives', 'incident_activities',
        'incident_logistics', 'deployment_history', 'notifications',
        'roster_schedules', 'roster_assignments', 'rrt_qualifications',
        'logistics_items', 'logistics_logs', 'library_docs', 'helpers',
        'helpers_backup_pre_fix'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- profiles: giữ nguyên p_admin_all, p_self_select, p_ward_select, p_ward_update
-- và các policy LIMS; bổ sung quyền tự sửa hồ sơ của mình (trước đây thiếu —
-- nhân viên không tự lưu được hồ sơ RRT).
DROP POLICY IF EXISTS p_self_update ON public.profiles;
CREATE POLICY p_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS p_self_insert ON public.profiles;
CREATE POLICY p_self_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Chốt chặn cột nhạy cảm (trigger) — RLS chỉ lọc DÒNG, không lọc CỘT
-- ----------------------------------------------------------------------------

-- profiles: chỉ Quản trị (hoặc service_role/Edge Function) đổi được role, lab_id,
-- position (Leader). Tự sửa hồ sơ thì không tự duyệt mình được.
-- Tuyến cơ sở duyệt được nhân sự trong phường/xã (p_ward_update đã chặn đổi
-- role, phường/xã, gán Leader).
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rrt_profiles_guard ON public.profiles;
CREATE TRIGGER trg_rrt_profiles_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.rrt_profiles_guard();

-- incidents: tuyến cơ sở chỉ điều động nhân sự phường/xã mình, không đổi ma_xa
CREATE OR REPLACE FUNCTION public.rrt_incidents_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL OR public.rrt_is_admin() THEN
    RETURN NEW;
  END IF;

  FOR v_email IN
    SELECT lower(trim(x)) FROM unnest(string_to_array(coalesce(NEW.initial_selected_members, ''), ';')) AS x
    WHERE trim(x) <> ''
    EXCEPT
    SELECT lower(trim(x)) FROM unnest(string_to_array(
      CASE WHEN TG_OP = 'UPDATE' THEN coalesce(OLD.initial_selected_members, '') ELSE '' END, ';')) AS x
  LOOP
    IF NOT public.rrt_email_in_my_ward(v_email) THEN
      RAISE EXCEPTION 'Tuyến cơ sở chỉ điều động được nhân sự thuộc phường/xã mình (%)', v_email
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rrt_incidents_guard ON public.incidents;
CREATE TRIGGER trg_rrt_incidents_guard
  BEFORE INSERT OR UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.rrt_incidents_guard();

-- roster_assignments: nhân viên chỉ đổi trạng thái nhận/từ chối ca của mình;
-- tuyến cơ sở chỉ phân công nhân sự phường/xã mình.
CREATE OR REPLACE FUNCTION public.rrt_roster_assignments_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.rrt_is_admin() THEN
    RETURN NEW;
  END IF;

  IF public.rrt_can_manage_schedule(NEW.schedule_id) THEN
    IF (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id)
       AND NOT public.rrt_profile_in_my_ward(NEW.user_id) THEN
      RAISE EXCEPTION 'Tuyến cơ sở chỉ phân công được nhân sự thuộc phường/xã mình'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Nhân viên trả lời ca của mình
  IF TG_OP = 'UPDATE'
     AND OLD.user_id = auth.uid()
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.schedule_id IS NOT DISTINCT FROM OLD.schedule_id THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Không có quyền sửa phân công lịch trực này' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_rrt_roster_assignments_guard ON public.roster_assignments;
CREATE TRIGGER trg_rrt_roster_assignments_guard
  BEFORE INSERT OR UPDATE ON public.roster_assignments
  FOR EACH ROW EXECUTE FUNCTION public.rrt_roster_assignments_guard();

-- notifications: người nhận chỉ được đánh dấu đã đọc / trả lời
CREATE OR REPLACE FUNCTION public.rrt_notifications_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.rrt_is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.user_email IS DISTINCT FROM OLD.user_email
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.notification_type IS DISTINCT FROM OLD.notification_type
     OR NEW.incident_id IS DISTINCT FROM OLD.incident_id
     OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
     OR NEW.action_token IS DISTINCT FROM OLD.action_token THEN
    RAISE EXCEPTION 'Chỉ được đánh dấu đã đọc hoặc trả lời thông báo' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rrt_notifications_guard ON public.notifications;
CREATE TRIGGER trg_rrt_notifications_guard
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.rrt_notifications_guard();

-- Lịch trực do ai tạo: tự điền nếu app không gửi
ALTER TABLE public.roster_schedules ALTER COLUMN created_by SET DEFAULT auth.uid();

-- ----------------------------------------------------------------------------
-- 4. Policy mới
-- ----------------------------------------------------------------------------

-- ---- incidents ----
-- Dùng cột của chính dòng (không tra lại theo id): INSERT/UPDATE ... RETURNING
-- kiểm tra dòng mới, mà hàm STABLE tra theo id chưa thấy dòng vừa ghi.
CREATE POLICY rrt_incidents_select ON public.incidents FOR SELECT TO authenticated
  USING (
    public.rrt_is_admin()
    OR (public.rrt_is_ward_admin() AND ma_xa = public.current_user_workplace_ma_xa())
    OR (public.rrt_is_approved() AND (
          public.rrt_email_in_list(public.rrt_my_email(), members)
          OR public.rrt_email_in_list(public.rrt_my_email(), initial_selected_members)))
  );
CREATE POLICY rrt_incidents_insert ON public.incidents FOR INSERT TO authenticated
  WITH CHECK (
    public.rrt_is_admin()
    OR (public.rrt_is_ward_admin() AND ma_xa = public.current_user_workplace_ma_xa())
  );
CREATE POLICY rrt_incidents_update ON public.incidents FOR UPDATE TO authenticated
  USING (
    public.rrt_is_admin()
    OR (public.rrt_is_ward_admin() AND ma_xa = public.current_user_workplace_ma_xa())
  )
  WITH CHECK (
    public.rrt_is_admin()
    OR (public.rrt_is_ward_admin() AND ma_xa = public.current_user_workplace_ma_xa())
  );
CREATE POLICY rrt_incidents_delete ON public.incidents FOR DELETE TO authenticated
  USING (public.rrt_is_admin());

-- ---- Hồ sơ sự kiện: xem theo sự kiện; ghi = người quản lý sự kiện; xóa = người
-- quản lý (form Kế hoạch IAP lưu bằng cách xóa rồi ghi lại) ----
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['incident_reports', 'incident_plans', 'incident_assessments',
                           'incident_objectives', 'incident_activities', 'incident_logistics']
  LOOP
    EXECUTE format('CREATE POLICY rrt_select ON public.%I FOR SELECT TO authenticated
                      USING (public.rrt_can_view_incident(incident_id))', t);
    EXECUTE format('CREATE POLICY rrt_insert ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (public.rrt_can_manage_incident(incident_id))', t);
    EXECUTE format('CREATE POLICY rrt_update ON public.%I FOR UPDATE TO authenticated
                      USING (public.rrt_can_manage_incident(incident_id))
                      WITH CHECK (public.rrt_can_manage_incident(incident_id))', t);
    EXECUTE format('CREATE POLICY rrt_delete ON public.%I FOR DELETE TO authenticated
                      USING (public.rrt_can_manage_incident(incident_id))', t);
  END LOOP;
END $$;

-- Nhiệm vụ: người được giao cập nhật được nhiệm vụ của mình (assignee_id là text: uuid hoặc email)
CREATE POLICY rrt_update_assignee ON public.incident_activities FOR UPDATE TO authenticated
  USING ((assignee_id = auth.uid()::text OR lower(trim(assignee_id)) = public.rrt_my_email())
         AND public.rrt_can_view_incident(incident_id))
  WITH CHECK ((assignee_id = auth.uid()::text OR lower(trim(assignee_id)) = public.rrt_my_email())
              AND public.rrt_can_view_incident(incident_id));

-- ---- incident_logs (nhật ký/chat hiện trường) ----
CREATE POLICY rrt_select ON public.incident_logs FOR SELECT TO authenticated
  USING (public.rrt_can_view_incident(incident_id));
CREATE POLICY rrt_insert ON public.incident_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.rrt_can_manage_incident(incident_id)
    OR (public.rrt_can_view_incident(incident_id) AND (user_id IS NULL OR user_id = auth.uid()))
  );
CREATE POLICY rrt_update ON public.incident_logs FOR UPDATE TO authenticated
  USING (public.rrt_can_manage_incident(incident_id)
         OR (user_id = auth.uid() AND public.rrt_can_view_incident(incident_id)))
  WITH CHECK (public.rrt_can_manage_incident(incident_id)
              OR (user_id = auth.uid() AND public.rrt_can_view_incident(incident_id)));
CREATE POLICY rrt_delete ON public.incident_logs FOR DELETE TO authenticated
  USING (public.rrt_is_admin() OR (user_id = auth.uid() AND public.rrt_can_view_incident(incident_id)));

-- ---- deployment_history (lịch sử điều động) ----
CREATE POLICY rrt_select ON public.deployment_history FOR SELECT TO authenticated
  USING (
    public.rrt_can_manage_incident(incident_id)
    OR public.rrt_profile_in_my_ward(user_id)
    OR (user_id = auth.uid() AND public.rrt_is_approved())
  );
CREATE POLICY rrt_insert ON public.deployment_history FOR INSERT TO authenticated
  WITH CHECK (
    public.rrt_is_admin()
    OR (public.rrt_can_manage_incident(incident_id) AND public.rrt_profile_in_my_ward(user_id))
    -- nhân viên tự ghi xác nhận/từ chối của mình
    OR (user_id = auth.uid() AND action_type IN ('deployed', 'declined')
        AND public.rrt_can_view_incident(incident_id))
  );
CREATE POLICY rrt_update ON public.deployment_history FOR UPDATE TO authenticated
  USING (
    public.rrt_can_manage_incident(incident_id)
    OR (user_id = auth.uid() AND public.rrt_can_view_incident(incident_id))
  )
  WITH CHECK (
    public.rrt_is_admin()
    OR (public.rrt_can_manage_incident(incident_id) AND public.rrt_profile_in_my_ward(user_id))
    OR (user_id = auth.uid() AND action_type IN ('deployed', 'declined')
        AND public.rrt_can_view_incident(incident_id))
  );
CREATE POLICY rrt_delete ON public.deployment_history FOR DELETE TO authenticated
  USING (public.rrt_is_admin());

-- ---- notifications ----
-- Xem: của mình | Quản trị | tuyến cơ sở: của nhân sự phường/xã mình
-- Tạo: Quản trị | tuyến cơ sở: cho nhân sự phường/xã mình hoặc thành viên sự kiện mình quản lý
-- Sửa: người nhận (chỉ đánh dấu đã đọc/trả lời — trigger chặn cột khác) | Quản trị
-- Xóa: Quản trị
CREATE POLICY rrt_select ON public.notifications FOR SELECT TO authenticated
  USING (
    public.rrt_is_admin()
    OR (public.rrt_is_approved() AND public.rrt_is_me(user_email))
    OR public.rrt_email_in_my_ward(user_email)
  );
CREATE POLICY rrt_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.rrt_is_admin()
    OR public.rrt_email_in_my_ward(user_email)
    OR (public.rrt_is_ward_admin() AND public.rrt_email_in_managed_incident(user_email, incident_id))
  );
CREATE POLICY rrt_update ON public.notifications FOR UPDATE TO authenticated
  USING (public.rrt_is_admin() OR (public.rrt_is_approved() AND public.rrt_is_me(user_email)))
  WITH CHECK (public.rrt_is_admin() OR (public.rrt_is_approved() AND public.rrt_is_me(user_email)));
CREATE POLICY rrt_delete ON public.notifications FOR DELETE TO authenticated
  USING (public.rrt_is_admin());

-- ---- roster_schedules ----
CREATE POLICY rrt_select ON public.roster_schedules FOR SELECT TO authenticated
  USING (public.rrt_can_view_schedule_row(id, team_name, created_by));
CREATE POLICY rrt_insert ON public.roster_schedules FOR INSERT TO authenticated
  WITH CHECK (public.rrt_is_admin() OR (public.rrt_is_ward_admin() AND created_by = auth.uid()));
CREATE POLICY rrt_update ON public.roster_schedules FOR UPDATE TO authenticated
  USING (public.rrt_can_manage_schedule(id))
  WITH CHECK (public.rrt_is_admin() OR (public.rrt_is_ward_admin() AND created_by = auth.uid()));
CREATE POLICY rrt_delete ON public.roster_schedules FOR DELETE TO authenticated
  USING (public.rrt_can_manage_schedule(id));

-- ---- roster_assignments (xem cả đội trong ca mình xem được) ----
CREATE POLICY rrt_select ON public.roster_assignments FOR SELECT TO authenticated
  USING (public.rrt_can_view_schedule(schedule_id));
CREATE POLICY rrt_insert ON public.roster_assignments FOR INSERT TO authenticated
  WITH CHECK (public.rrt_can_manage_schedule(schedule_id));
CREATE POLICY rrt_update ON public.roster_assignments FOR UPDATE TO authenticated
  USING (public.rrt_can_manage_schedule(schedule_id) OR (user_id = auth.uid() AND public.rrt_is_approved()))
  WITH CHECK (public.rrt_can_manage_schedule(schedule_id) OR (user_id = auth.uid() AND public.rrt_is_approved()));
CREATE POLICY rrt_delete ON public.roster_assignments FOR DELETE TO authenticated
  USING (public.rrt_can_manage_schedule(schedule_id));

-- ---- rrt_qualifications (năng lực chuyên môn) ----
CREATE POLICY rrt_select ON public.rrt_qualifications FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.rrt_is_admin() OR public.rrt_profile_in_my_ward(profile_id));
CREATE POLICY rrt_insert ON public.rrt_qualifications FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid() OR public.rrt_is_admin() OR public.rrt_profile_in_my_ward(profile_id));
CREATE POLICY rrt_update ON public.rrt_qualifications FOR UPDATE TO authenticated
  USING (profile_id = auth.uid() OR public.rrt_is_admin() OR public.rrt_profile_in_my_ward(profile_id))
  WITH CHECK (profile_id = auth.uid() OR public.rrt_is_admin() OR public.rrt_profile_in_my_ward(profile_id));
CREATE POLICY rrt_delete ON public.rrt_qualifications FOR DELETE TO authenticated
  USING (public.rrt_is_admin());

-- ---- Kho vật tư, thư viện: tài khoản đã duyệt xem, Quản trị ghi ----
-- (bỏ quyền đọc kho vật tư của khách CHƯA đăng nhập)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['logistics_items', 'logistics_logs', 'library_docs']
  LOOP
    EXECUTE format('CREATE POLICY rrt_select ON public.%I FOR SELECT TO authenticated
                      USING (public.rrt_is_approved())', t);
    EXECUTE format('CREATE POLICY rrt_admin_write ON public.%I FOR ALL TO authenticated
                      USING (public.rrt_is_admin()) WITH CHECK (public.rrt_is_admin())', t);
  END LOOP;
END $$;

-- ---- helpers (danh mục phường/xã, đơn vị): cần cho form hồ sơ lúc CHƯA duyệt ----
CREATE POLICY rrt_select ON public.helpers FOR SELECT TO authenticated USING (true);
CREATE POLICY rrt_admin_write ON public.helpers FOR ALL TO authenticated
  USING (public.rrt_is_admin()) WITH CHECK (public.rrt_is_admin());
-- helpers_backup_pre_fix: bảng sao lưu, không policy = không ai đọc qua API

-- ----------------------------------------------------------------------------
-- 5. RPC xác nhận/từ chối tham gia sự kiện: chỉ cho chính mình
-- ----------------------------------------------------------------------------
-- Bản cũ nhận email bất kỳ (kể cả khách chưa đăng nhập) → ai cũng đổi được
-- danh sách tham gia của người khác. Bản mới: người gọi chỉ đổi phần của mình;
-- Quản trị / người quản lý sự kiện / Edge Function (service_role) đổi được cho người khác.
CREATE OR REPLACE FUNCTION public.update_incident_membership(p_incident_id uuid, p_email text, p_action text)
 RETURNS TABLE(members text, declined_members text, confirmations integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(trim(p_email));
  v_members_raw text;
  v_declined_raw text;
  v_selected_raw text;
  v_confirmations int;
  v_members text[];
  v_declined text[];
  v_trusted boolean := coalesce(auth.role(), '') = 'service_role'
                       or public.rrt_can_manage_incident(p_incident_id);
begin
  if p_action not in ('confirm', 'decline') then
    raise exception 'invalid action: %', p_action;
  end if;

  if v_email = '' or v_email is null then
    raise exception 'email is required';
  end if;

  if not v_trusted then
    if auth.uid() is null or not public.rrt_is_approved() then
      raise exception 'Không có quyền' using errcode = '42501';
    end if;
    if v_email is distinct from public.rrt_my_email() then
      raise exception 'Chỉ được trả lời cho chính mình' using errcode = '42501';
    end if;
  end if;

  -- Khoá dòng incident trong lúc tính toán để 2 request đồng thời không đè lên nhau
  select i.members, i.declined_members, i.initial_selected_members, coalesce(i.confirmations, 0)
    into v_members_raw, v_declined_raw, v_selected_raw, v_confirmations
  from public.incidents i
  where i.id = p_incident_id
  for update;

  if not found then
    raise exception 'incident % not found', p_incident_id;
  end if;

  -- Người không được điều động thì không tự thêm mình vào sự kiện được
  if not v_trusted
     and not public.rrt_email_in_list(v_email, v_selected_raw)
     and not public.rrt_email_in_list(v_email, v_members_raw)
     and not public.rrt_email_in_list(v_email, v_declined_raw) then
    raise exception 'Bạn không có trong danh sách điều động của sự kiện này' using errcode = '42501';
  end if;

  select coalesce(array_agg(lower(trim(x))), '{}')
    into v_members
  from unnest(
    case when coalesce(v_members_raw, '') = '' then '{}'::text[]
         else string_to_array(v_members_raw, ';') end
  ) as x
  where trim(x) <> '';

  select coalesce(array_agg(lower(trim(x))), '{}')
    into v_declined
  from unnest(
    case when coalesce(v_declined_raw, '') = '' then '{}'::text[]
         else string_to_array(v_declined_raw, ';') end
  ) as x
  where trim(x) <> '';

  if p_action = 'confirm' then
    if not (v_email = any (v_members)) then
      v_members := v_members || v_email;
      v_confirmations := v_confirmations + 1;
    end if;
    v_declined := array_remove(v_declined, v_email);
  else
    if not (v_email = any (v_declined)) then
      v_declined := v_declined || v_email;
    end if;
    if v_email = any (v_members) then
      v_members := array_remove(v_members, v_email);
      v_confirmations := greatest(0, v_confirmations - 1);
    end if;
  end if;

  update public.incidents
  set members = case when array_length(v_members, 1) is null then null else array_to_string(v_members, ';') end,
      declined_members = case when array_length(v_declined, 1) is null then null else array_to_string(v_declined, ';') end,
      confirmations = v_confirmations
  where id = p_incident_id;

  return query select
    (case when array_length(v_members, 1) is null then null else array_to_string(v_members, ';') end),
    (case when array_length(v_declined, 1) is null then null else array_to_string(v_declined, ';') end),
    v_confirmations;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_incident_membership(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_incident_membership(uuid, text, text) TO authenticated, service_role;

COMMIT;
