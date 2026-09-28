-- Schema snapshot of project sxzjbygiowpscyhiffqc (schema public), pulled via Supabase Management API.
-- Built from pg_catalog (equivalent content to `supabase db pull`, not byte-identical to pg_dump).
-- Postgres: PostgreSQL 17.6 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit

SET check_function_bodies = false;

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE SEQUENCE IF NOT EXISTS "public"."lims_alert_log_id_seq" AS bigint START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "public"."lims_catalog_log_id_seq" AS bigint START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "public"."lims_disease_report_log_id_seq" AS bigint START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "public"."lims_lab_history_id_seq" AS bigint START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "public"."technique_equivalences_id_seq" AS bigint START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.activate_emergency(p_type text, p_activation_key uuid, p_member_emails text[], p_incident_id uuid DEFAULT NULL::uuid, p_event_name text DEFAULT NULL::text, p_location_text text DEFAULT NULL::text, p_ma_xa text DEFAULT NULL::text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id       uuid := auth.uid();
  v_role           text;
  v_is_ward_admin  boolean := false;
  v_wa_ma_xa       text;          -- workplace_ma_xa của ward_admin (lấy từ DB)
  v_wa_is_grass    boolean := false;
  v_eff_ma_xa      text;          -- ma_xa dùng thực tế cho sự cố
  v_incident_id    uuid;
  v_norm_emails    text[];
  v_allowed_emails text[];        -- email được phép điều động (sau lọc theo xã)
  v_filtered_out   text[] := '{}';-- email bị loại (khác xã) — trả về cho client
  v_found          RECORD;
  v_found_ids      uuid[] := '{}';
  v_found_emails   text[] := '{}';
  v_missing        text[] := '{}';
  v_old_members    text;
  v_old_set        text[];
  v_combined       text;
  v_new_deploy     int := 0;
  v_inc_ma_xa      text;
BEGIN
  -- ------------------------------------------------------------------
  -- A. XÁC THỰC & PHÂN QUYỀN (admin HOẶC ward_admin)
  -- ------------------------------------------------------------------
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Vui lòng đăng nhập lại.';
  END IF;
 
  SELECT lower(trim(coalesce(role, ''))) INTO v_role
  FROM public.profiles WHERE id = v_admin_id;
 
  IF v_role = 'admin' THEN
    v_is_ward_admin := false;                       -- admin: toàn quyền như cũ
  ELSIF v_role = 'ward_admin' THEN
    v_is_ward_admin := true;
    -- Lấy xã công tác + kiểm tuyến cơ sở NGAY TỪ DB (không tin client)
    SELECT workplace_ma_xa, public.is_grassroots_unit(fax)
    INTO v_wa_ma_xa, v_wa_is_grass
    FROM public.profiles WHERE id = v_admin_id;
 
    IF v_wa_ma_xa IS NULL OR trim(v_wa_ma_xa) = '' THEN
      RAISE EXCEPTION 'BAD_REQUEST: Tài khoản ward_admin chưa có xã công tác (workplace_ma_xa).';
    END IF;
    IF NOT v_wa_is_grass THEN
      RAISE EXCEPTION 'FORBIDDEN: Chỉ lãnh đạo tuyến cơ sở (Trạm YT/UBND) mới được kích hoạt.';
    END IF;
  ELSE
    RAISE EXCEPTION 'FORBIDDEN: Tài khoản không có quyền kích hoạt khẩn cấp.';
  END IF;
 
  IF p_type NOT IN ('new', 'add') THEN
    RAISE EXCEPTION 'BAD_REQUEST: p_type phải là new hoặc add.';
  END IF;
 
  IF p_member_emails IS NULL OR array_length(p_member_emails, 1) IS NULL THEN
    RAISE EXCEPTION 'BAD_REQUEST: Danh sách thành viên trống.';
  END IF;
 
  -- ------------------------------------------------------------------
  -- A2. XÁC ĐỊNH ma_xa THỰC TẾ CỦA SỰ CỐ
  --     admin: dùng p_ma_xa client gửi. ward_admin: BẮT BUỘC dùng xã của họ.
  -- ------------------------------------------------------------------
  IF v_is_ward_admin THEN
    v_eff_ma_xa := v_wa_ma_xa;      -- ép theo xã ward_admin, bỏ qua p_ma_xa
  ELSE
    v_eff_ma_xa := p_ma_xa;         -- admin giữ nguyên
  END IF;
 
  -- ------------------------------------------------------------------
  -- B. CHUẨN HÓA EMAIL
  -- ------------------------------------------------------------------
  SELECT array_agg(DISTINCT lower(trim(e)))
  INTO v_norm_emails
  FROM unnest(p_member_emails) AS e
  WHERE trim(coalesce(e, '')) <> '';
 
  -- ------------------------------------------------------------------
  -- B2. ward_admin: LỌC người điều động — chỉ giữ người CÙNG XÃ + tuyến cơ sở
  --     Người khác xã bị loại âm thầm, ghi vào v_filtered_out.
  -- ------------------------------------------------------------------
  IF v_is_ward_admin THEN
    SELECT array_agg(em) INTO v_allowed_emails
    FROM (
      SELECT lower(trim(p.email)) AS em
      FROM public.profiles p
      WHERE lower(trim(p.email)) = ANY (v_norm_emails)
        AND p.workplace_ma_xa = v_wa_ma_xa
        AND public.is_grassroots_unit(p.fax)
    ) sub;
    v_allowed_emails := coalesce(v_allowed_emails, '{}');
 
    -- Danh sách bị loại = norm_emails - allowed
    SELECT array_agg(e) INTO v_filtered_out
    FROM unnest(v_norm_emails) AS e
    WHERE NOT (e = ANY (v_allowed_emails));
    v_filtered_out := coalesce(v_filtered_out, '{}');
 
    IF array_length(v_allowed_emails, 1) IS NULL THEN
      RAISE EXCEPTION 'BAD_REQUEST: Không có nhân sự hợp lệ (cùng xã, tuyến cơ sở) để điều động.';
    END IF;
  ELSE
    v_allowed_emails := v_norm_emails;   -- admin: không lọc
  END IF;
 
  -- ------------------------------------------------------------------
  -- B3. TRA UUID cho danh sách được phép
  -- ------------------------------------------------------------------
  FOR v_found IN
    SELECT id, lower(trim(email)) AS em
    FROM public.profiles
    WHERE lower(trim(email)) = ANY (v_allowed_emails)
  LOOP
    v_found_ids    := array_append(v_found_ids, v_found.id);
    v_found_emails := array_append(v_found_emails, v_found.em);
  END LOOP;
 
  SELECT array_agg(e) INTO v_missing
  FROM unnest(v_allowed_emails) AS e
  WHERE NOT (e = ANY (v_found_emails));
 
  -- ------------------------------------------------------------------
  -- C1. NHÁNH TẠO MỚI
  -- ------------------------------------------------------------------
  IF p_type = 'new' THEN
    IF coalesce(trim(p_event_name), '') = '' OR coalesce(trim(p_location_text), '') = '' THEN
      RAISE EXCEPTION 'BAD_REQUEST: Thiếu tên sự kiện hoặc địa điểm.';
    END IF;
 
    INSERT INTO public.incidents (
      event_name, location_text, ma_xa, latitude, longitude,
      status, activation_time, initial_selected_members,
      admin_activate, activation_key
    )
    VALUES (
      p_event_name, p_location_text, v_eff_ma_xa, p_latitude, p_longitude,
      'active', now(), array_to_string(v_allowed_emails, ';'),
      v_admin_id, p_activation_key
    )
    ON CONFLICT (activation_key) DO NOTHING
    RETURNING id INTO v_incident_id;
 
    IF v_incident_id IS NULL THEN
      SELECT id INTO v_incident_id
      FROM public.incidents WHERE activation_key = p_activation_key;
 
      RETURN jsonb_build_object(
        'incident_id', v_incident_id,
        'duplicated', true,
        'deployed_count', 0,
        'missing_emails', coalesce(to_jsonb(v_missing), '[]'::jsonb),
        'filtered_out', coalesce(to_jsonb(v_filtered_out), '[]'::jsonb)
      );
    END IF;
 
    INSERT INTO public.deployment_history (incident_id, user_id, action_type, reason)
    SELECT v_incident_id, uid, 'deployed', 'Điều động khẩn cấp ban đầu'
    FROM unnest(v_found_ids) AS uid;
 
    v_new_deploy := coalesce(array_length(v_found_ids, 1), 0);
 
  -- ------------------------------------------------------------------
  -- C2. NHÁNH BỔ SUNG
  -- ------------------------------------------------------------------
  ELSE
    IF p_incident_id IS NULL THEN
      RAISE EXCEPTION 'BAD_REQUEST: Thiếu ID sự kiện cần bổ sung.';
    END IF;
 
    SELECT id, coalesce(initial_selected_members, ''), ma_xa
    INTO v_incident_id, v_old_members, v_inc_ma_xa
    FROM public.incidents
    WHERE id = p_incident_id AND status <> 'closed'
    FOR UPDATE;
 
    IF v_incident_id IS NULL THEN
      RAISE EXCEPTION 'NOT_FOUND: Sự kiện không tồn tại hoặc đã đóng.';
    END IF;
 
    -- ward_admin: sự cố bổ sung PHẢI thuộc xã của họ
    IF v_is_ward_admin AND (v_inc_ma_xa IS DISTINCT FROM v_wa_ma_xa) THEN
      RAISE EXCEPTION 'NOT_FOUND: Sự kiện này không thuộc xã bạn quản lý.';
    END IF;
 
    SELECT array_agg(DISTINCT lower(trim(m)))
    INTO v_old_set
    FROM unnest(string_to_array(v_old_members, ';')) AS m
    WHERE trim(coalesce(m, '')) <> '';
    v_old_set := coalesce(v_old_set, '{}');
 
    v_combined := array_to_string(
      ARRAY(SELECT DISTINCT unnest(v_old_set || v_allowed_emails) ORDER BY 1),
      ';'
    );
 
    UPDATE public.incidents
    SET initial_selected_members = v_combined
    WHERE id = v_incident_id;
 
    FOR v_found IN
      SELECT p.id AS uid, lower(trim(p.email)) AS em
      FROM public.profiles p
      WHERE lower(trim(p.email)) = ANY (v_allowed_emails)
        AND NOT (lower(trim(p.email)) = ANY (v_old_set))
    LOOP
      INSERT INTO public.deployment_history (incident_id, user_id, action_type, reason)
      VALUES (v_incident_id, v_found.uid, 'deployed', 'Điều động bổ sung vào đội RRT');
      v_new_deploy := v_new_deploy + 1;
    END LOOP;
  END IF;
 
  -- ------------------------------------------------------------------
  -- D. KẾT QUẢ (thêm 'filtered_out' để client biết ai bị loại vì khác xã)
  -- ------------------------------------------------------------------
  RETURN jsonb_build_object(
    'incident_id', v_incident_id,
    'duplicated', false,
    'deployed_count', v_new_deploy,
    'missing_emails', coalesce(to_jsonb(v_missing), '[]'::jsonb),
    'filtered_out', coalesce(to_jsonb(v_filtered_out), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_capability_tier(p_lab_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qsm        integer;
  v_qms_tier   integer;
  v_soi   boolean; v_cay boolean; v_md boolean;
  v_shpt  boolean; v_cao boolean;
  v_basic_count integer;
  v_tech_ceil  integer;
BEGIN
  SELECT COALESCE(qsm_level, 0) INTO v_qsm
  FROM public.laboratories WHERE id = p_lab_id;

  -- Trục QSM
  v_qms_tier := CASE
    WHEN v_qsm >= 4 THEN 5   -- ISO 15189 hoặc QĐ2429 Mức 4-5
    WHEN v_qsm = 3  THEN 4   -- Mức 3
    WHEN v_qsm = 2  THEN 3   -- Mức 2
    WHEN v_qsm = 1  THEN 2   -- Mức 1
    ELSE 1                   -- chưa có
  END;

  -- Trục kỹ thuật: xét từng NHÓM theo tên (Bảng 1)
  SELECT
    bool_or(t.name IN ('Soi tươi', 'Nhuộm soi')),
    bool_or(t.name IN ('Nuôi cấy – định danh vi khuẩn thông thường', 'Nuôi cấy - định danh vi khuẩn thông thường', 'Định danh vi khuẩn tự động')),  -- [LIMS-PATCH] thêm biến thể dấu gạch nối
    bool_or(t.name IN ('Test nhanh', 'Miễn dịch bán tự động', 'Miễn dịch tự động')),
    bool_or(t.category = 'molecular'),
    bool_or(t.category = 'advanced')
  INTO v_soi, v_cay, v_md, v_shpt, v_cao
  FROM public.lab_capabilities c
  JOIN public.test_types t ON t.id = c.test_type_id
  WHERE c.lab_id = p_lab_id;

  v_soi  := COALESCE(v_soi, false);
  v_cay  := COALESCE(v_cay, false);
  v_md   := COALESCE(v_md, false);
  v_shpt := COALESCE(v_shpt, false);
  v_cao  := COALESCE(v_cao, false);

  v_basic_count := (v_soi::int + v_cay::int + v_md::int);  -- 0..3 nhóm cơ bản

  v_tech_ceil := CASE
    WHEN v_basic_count = 3 AND v_shpt AND v_cao THEN 5
    WHEN v_basic_count = 3 AND v_shpt            THEN 4
    WHEN v_basic_count = 3                       THEN 2
    WHEN v_basic_count >= 2                      THEN 1
    ELSE 0
  END;

  -- Chưa đủ 2/3 nhóm cơ bản → chưa phân hạng
  IF v_tech_ceil = 0 THEN RETURN 0; END IF;

  RETURN LEAST(v_qms_tier, v_tech_ceil);
END $function$;

CREATE OR REPLACE FUNCTION public.current_user_fax()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT fax
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT lower(coalesce(p.role, 'user'))
  FROM public.profiles p
  WHERE p.id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.current_user_workplace_ma_xa()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT workplace_ma_xa
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.current_user_workplace_ward()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.workplace_ward
  FROM public.profiles p
  WHERE p.id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.find_candidate_labs(p_test_type_ids uuid[], p_sample_count integer DEFAULT 1, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 10, p_include_full boolean DEFAULT true, p_min_bsl integer DEFAULT NULL::integer, p_min_qsm integer DEFAULT NULL::integer, p_max_turnaround integer DEFAULT NULL::integer)
 RETURNS TABLE(lab_id uuid, lab_name text, address text, phone text, lat double precision, lng double precision, level text, bsl_level integer, qsm_level integer, qsm_label text, network_tier integer, capability_tier integer, head_name text, head_phone text, head_email text, max_capacity_per_day integer, turnaround_hours integer, used_today integer, remaining_today integer, is_enough boolean, straight_km double precision, match_score numeric, warn_qsm boolean, warn_capacity boolean, warn_turnaround boolean, matched_test_type_id uuid, is_equivalent boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_origin       geography;
  v_required_bsl integer;
BEGIN
  IF p_min_bsl IS NOT NULL THEN
    v_required_bsl := p_min_bsl;
  ELSE
    v_required_bsl := 2;  -- mặc định an toàn (modal luôn truyền)
  END IF;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    v_origin := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  END IF;

  RETURN QUERY
  WITH
  -- (1) Tập kỹ thuật MỞ RỘNG = kỹ thuật chọn + các kỹ thuật CÙNG NHÓM tương đương
  expanded AS (
    SELECT unnest(p_test_type_ids) AS ttid
    UNION
    SELECT te2.test_type_id
    FROM public.technique_equivalences te1
    JOIN public.technique_equivalences te2 ON te2.group_id = te1.group_id
    WHERE te1.test_type_id = ANY(p_test_type_ids)
  ),
  -- (2) Đã dùng hôm nay theo (lab, kỹ thuật) trong tập mở rộng
  used AS (
    SELECT d.lab_id, d.test_type_id, COALESCE(SUM(d.sample_count), 0)::integer AS used_cnt
    FROM public.lab_dispatch_log d
    WHERE d.test_type_id IN (SELECT ttid FROM expanded)
      AND d.dispatch_date = CURRENT_DATE
      AND d.status <> 'cancelled'
    GROUP BY d.lab_id, d.test_type_id
  ),
  -- (3) Mỗi PXN 1 năng lực ĐẠI DIỆN: ưu tiên kỹ thuật ĐƯỢC CHỌN TRỰC TIẾP,
  --     rồi còn nhiều chỗ nhất
  matched AS (
    SELECT DISTINCT ON (l.id)
      l.id, l.name, l.address, l.phone, l.lat, l.lng, l.level, l.bsl_level,
      COALESCE(l.qsm_level, 0) AS qsm_level, l.qsm_label, l.network_tier,
      COALESCE(l.capability_tier, 0) AS capability_tier,
      l.head_name, l.head_phone, l.head_email,
      c.test_type_id AS matched_test_type_id,
      (NOT (c.test_type_id = ANY(p_test_type_ids))) AS is_equivalent,
      c.max_capacity_per_day, c.turnaround_hours,
      COALESCE(u.used_cnt, 0) AS used_today,
      (c.max_capacity_per_day - COALESCE(u.used_cnt, 0)) AS remaining_today,
      ((c.max_capacity_per_day - COALESCE(u.used_cnt, 0)) >= p_sample_count) AS is_enough,
      CASE WHEN v_origin IS NOT NULL AND l.location IS NOT NULL
           THEN ROUND((ST_Distance(v_origin, l.location) / 1000.0)::numeric, 2)::double precision
           ELSE NULL END AS straight_km
    FROM public.laboratories l
    JOIN public.lab_capabilities c ON c.lab_id = l.id
    LEFT JOIN used u ON u.lab_id = l.id AND u.test_type_id = c.test_type_id
    WHERE l.is_active = true
      AND c.test_type_id IN (SELECT ttid FROM expanded)     -- ĐẠT nếu có ≥1 trong nhóm
      AND l.bsl_level >= v_required_bsl                      -- ⛔ ATSH cứng
      AND (p_include_full OR (c.max_capacity_per_day - COALESCE(u.used_cnt, 0)) >= p_sample_count)
    ORDER BY
      l.id,
      (c.test_type_id = ANY(p_test_type_ids)) DESC,          -- ưu tiên khớp trực tiếp
      (c.max_capacity_per_day - COALESCE(u.used_cnt, 0)) DESC -- rồi còn nhiều chỗ
  )
  SELECT
    m.id, m.name, m.address, m.phone, m.lat, m.lng, m.level, m.bsl_level,
    m.qsm_level, m.qsm_label, m.network_tier, m.capability_tier,
    m.head_name, m.head_phone, m.head_email,
    m.max_capacity_per_day, m.turnaround_hours,
    m.used_today, m.remaining_today, m.is_enough,
    m.straight_km,
    (
      (m.qsm_level * 4.0)
      + (m.capability_tier * 4.0)
      + (CASE WHEN m.is_enough THEN 10.0 ELSE 0.0 END)
      + (CASE WHEN m.straight_km IS NOT NULL THEN GREATEST(0.0, 30.0 - m.straight_km) ELSE 0.0 END)
      + (CASE WHEN p_min_qsm IS NOT NULL AND m.qsm_level >= p_min_qsm THEN 15.0 ELSE 0.0 END)
      + (CASE WHEN p_max_turnaround IS NOT NULL AND m.turnaround_hours <= p_max_turnaround THEN 10.0 ELSE 0.0 END)
    )::numeric AS match_score,
    (p_min_qsm IS NOT NULL AND m.qsm_level < p_min_qsm)                      AS warn_qsm,
    (NOT m.is_enough)                                                        AS warn_capacity,
    (p_max_turnaround IS NOT NULL AND m.turnaround_hours > p_max_turnaround) AS warn_turnaround,
    m.matched_test_type_id,
    m.is_equivalent
  FROM matched m
  ORDER BY
    match_score DESC,
    (m.straight_km IS NULL),
    m.straight_km ASC NULLS LAST
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_incident()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.incident_assessments (incident_id, author_id, context) VALUES (NEW.id, NEW.admin_activate, 'Chưa cập nhật bối cảnh');
  INSERT INTO public.incident_plans (incident_id, context) VALUES (NEW.id, 'Kế hoạch phản ứng nhanh');
  INSERT INTO public.incident_objectives (incident_id, objective_text, status) VALUES (NEW.id, 'Khảo sát và khoanh vùng ổ dịch ban đầu', 'Pending');
  INSERT INTO public.incident_activities (incident_id, content, task_group, status) VALUES (NEW.id, 'Đến hiện trường đánh giá tình hình', 'Truy vết / Khảo sát', 'pending');
  INSERT INTO public.incident_reports (incident_id, report_type, event_name) VALUES (NEW.id, 'Khởi tạo', NEW.event_name);
  INSERT INTO public.incident_logs (incident_id, user_id, log_type, content) VALUES (NEW.id, NEW.admin_activate, 'general', 'Hệ thống tự động kích hoạt sự kiện: ' || NEW.event_name);
  
  -- Lệnh chèn vào bảng Logistics (Đã khớp cột với ảnh chụp của bạn)
  INSERT INTO public.incident_logistics (incident_id, name, qty, unit, note) 
  VALUES (NEW.id, 'Vật tư tiêu hao phản ứng nhanh', 0, 'Hộp', 'Khởi tạo tự động từ hệ thống');

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, approval_status, role)
  values (new.id, new.email, 'pending', 'user');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.increment_page_view()
 RETURNS bigint
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  update website_stats
  set total_views = total_views + 1
  where id = 1
  returning total_views;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(coalesce(p.role, '')) = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_grassroots_unit(p_fax text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_fax IN (
    'Trạm Y tế Phường/Xã/ Đặc khu',
    'UBND Phường/Xã/ Đặc khu'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_team_leader()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        lower(coalesce(p.position, '')) = 'leader'
        OR lower(coalesce(p.role, '')) = 'ward_admin'
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_ward_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(coalesce(p.role, '')) = 'ward_admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.lims_apply_inventory_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab_id   uuid;
  v_quantity numeric;
BEGIN
  SELECT lab_id, quantity INTO v_lab_id, v_quantity
  FROM public.lab_inventory
  WHERE id = NEW.inventory_id
  FOR UPDATE;                       -- khoá dòng tồn kho, tránh trừ kho đua nhau

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy mặt hàng tồn kho %', NEW.inventory_id;
  END IF;

  NEW.lab_id := v_lab_id;           -- luôn lấy từ kho, bỏ qua giá trị client gửi

  IF NEW.transaction_type = 'out' AND v_quantity < NEW.amount THEN
    RAISE EXCEPTION 'Tồn kho không đủ: còn %, cần xuất %', v_quantity, NEW.amount;
  END IF;

  UPDATE public.lab_inventory
  SET quantity = quantity + CASE WHEN NEW.transaction_type = 'in'
                                 THEN NEW.amount ELSE -NEW.amount END
  WHERE id = NEW.inventory_id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.lims_cert_set_lab()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid;
BEGIN
  SELECT lab_id INTO v_lab FROM public.lims_lab_staff WHERE id = NEW.staff_id;
  IF v_lab IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy nhân sự';
  END IF;
  NEW.lab_id := v_lab;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_create_lab(p_name text, p_level text, p_address text, p_phone text, p_lat double precision, p_lng double precision, p_bsl_level integer, p_head_name text, p_head_phone text, p_head_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name  text := btrim(coalesce(p_name, ''));
  v_level text := btrim(coalesce(p_level, ''));
  v_id    uuid;
  v_email text := nullif(btrim(coalesce(p_head_email, '')), '');
BEGIN
  PERFORM public.lims_require_hcdc();
  IF char_length(v_name) < 3 OR char_length(v_name) > 200 THEN RAISE EXCEPTION 'Tên phòng xét nghiệm phải từ 3 đến 200 ký tự'; END IF;
  IF v_level = '' OR char_length(v_level) > 80 THEN RAISE EXCEPTION 'Vui lòng chọn loại hình phòng xét nghiệm'; END IF;
  IF EXISTS (SELECT 1 FROM public.laboratories l WHERE lower(btrim(l.name)) = lower(v_name)) THEN
    RAISE EXCEPTION 'Đã có phòng xét nghiệm tên "%"', v_name;
  END IF;
  IF (p_lat IS NULL) <> (p_lng IS NULL) THEN RAISE EXCEPTION 'Nhập đủ cả vĩ độ và kinh độ (hoặc để trống cả hai)'; END IF;
  IF p_lat IS NOT NULL AND (p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Toạ độ không hợp lệ';
  END IF;
  IF p_bsl_level IS NULL OR p_bsl_level NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Cấp an toàn sinh học phải từ 1 đến 4'; END IF;
  IF v_email IS NOT NULL AND v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Email không hợp lệ';
  END IF;

  INSERT INTO public.laboratories (name, level, address, phone, lat, lng, bsl_level, head_name, head_phone, head_email, is_active)
  VALUES (v_name, v_level, nullif(btrim(coalesce(p_address, '')), ''), nullif(btrim(coalesce(p_phone, '')), ''),
          p_lat, p_lng, p_bsl_level, nullif(btrim(coalesce(p_head_name, '')), ''), nullif(btrim(coalesce(p_head_phone, '')), ''),
          v_email, true)
  RETURNING id INTO v_id;

  -- Mốc đầu cho dòng thời gian tiến độ của PXN mới
  INSERT INTO public.lims_lab_history (lab_id, entity, field, new_value)
  SELECT v_id, 'baseline', 'capability_tier', to_jsonb(coalesce(capability_tier, 0)) FROM public.laboratories WHERE id = v_id;
  INSERT INTO public.lims_lab_history (lab_id, entity, field, new_value)
  SELECT v_id, 'baseline', 'qsm_level', to_jsonb(coalesce(qsm_level, 0)) FROM public.laboratories WHERE id = v_id;

  PERFORM public.lims_log_catalog('laboratories', v_id::text, v_name, 'create', NULL,
    jsonb_build_object('name', v_name, 'level', v_level, 'lat', p_lat, 'lng', p_lng, 'bsl_level', p_bsl_level));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_current_lab_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT lab_id FROM public.profiles WHERE id = auth.uid() $function$;

CREATE OR REPLACE FUNCTION public.lims_current_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- lower() để khớp quy ước của RRT: current_user_role() và is_admin() đều
  -- bọc lower() quanh role, nên 'Lab_Admin' và 'lab_admin' phải như nhau.
  SELECT lower(coalesce(role, '')) FROM public.profiles WHERE id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.lims_custom_fields_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  IF NEW.key IS DISTINCT FROM OLD.key THEN
    RAISE EXCEPTION 'Không được đổi mã (key) của trường bổ sung. Hãy tắt trường này và tạo trường mới.';
  END IF;
  IF NEW.field_type IS DISTINCT FROM OLD.field_type
     AND EXISTS (SELECT 1 FROM public.lims_custom_field_values v WHERE v.field_id = OLD.id) THEN
    RAISE EXCEPTION 'Trường này đã có dữ liệu nên không thể đổi kiểu dữ liệu. Hãy tắt trường này và tạo trường mới.';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_delete_disease_report(p_week date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid;
  v_report uuid;
  v_label text;
  o_lines integer; o_tests integer; o_pos integer;
BEGIN
  IF public.lims_current_role() IS DISTINCT FROM 'lab_admin' THEN
    RAISE EXCEPTION 'Chỉ tài khoản quản trị phòng xét nghiệm được xoá báo cáo bệnh truyền nhiễm.' USING ERRCODE = '42501';
  END IF;
  v_lab := public.lims_current_lab_id();
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Tài khoản chưa gắn với phòng xét nghiệm.' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v_report FROM public.lims_disease_reports WHERE lab_id = v_lab AND week_start = p_week FOR UPDATE;
  IF v_report IS NULL THEN RAISE EXCEPTION 'Tuần này chưa có báo cáo để xoá.'; END IF;
  SELECT count(*), coalesce(sum(tests_done), 0), coalesce(sum(positives), 0) INTO o_lines, o_tests, o_pos
    FROM public.lims_disease_report_lines WHERE report_id = v_report;
  DELETE FROM public.lims_disease_reports WHERE id = v_report;
  SELECT coalesce(nullif(btrim(full_name), ''), email) INTO v_label FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.lims_disease_report_log (lab_id, week_start, actor, actor_label, action, old_lines, old_tests, old_pos)
  VALUES (v_lab, p_week, auth.uid(), v_label, 'delete', o_lines, o_tests, o_pos);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_disease_by_pathogen(p_from date, p_to date)
 RETURNS TABLE(pathogen_id uuid, pathogen_name text, tests integer, positives integer, labs integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.lims_disease_check_range(p_from, p_to);
  RETURN QUERY
  SELECT l.pathogen_id, coalesce(p.name, 'Bệnh không còn trong danh mục'),
         sum(l.tests_done)::integer, sum(l.positives)::integer, count(DISTINCT l.lab_id)::integer
    FROM public.lims_disease_report_lines l
    LEFT JOIN public.pathogens p ON p.id = l.pathogen_id
   WHERE l.week_start BETWEEN p_from AND p_to
   GROUP BY l.pathogen_id, p.name
   ORDER BY sum(l.positives) DESC, p.name;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_disease_by_ward(p_from date, p_to date, p_pathogen uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ma_xa text, ward_name text, tests integer, positives integer, labs integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.lims_disease_check_range(p_from, p_to);
  RETURN QUERY
  SELECT l.ma_xa, w.ten_xa,
         sum(l.tests_done)::integer, sum(l.positives)::integer, count(DISTINCT l.lab_id)::integer
    FROM public.lims_disease_report_lines l
    LEFT JOIN public.ward_codes w ON w.ma_xa = l.ma_xa
   WHERE l.week_start BETWEEN p_from AND p_to
     AND (p_pathogen IS NULL OR l.pathogen_id = p_pathogen)
   GROUP BY l.ma_xa, w.ten_xa
   ORDER BY sum(l.positives) DESC, w.ten_xa;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_disease_by_ward_pathogen(p_from date, p_to date)
 RETURNS TABLE(ma_xa text, ward_name text, pathogen_id uuid, pathogen_name text, tests integer, positives integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.lims_disease_check_range(p_from, p_to);
  RETURN QUERY
  SELECT l.ma_xa, w.ten_xa, l.pathogen_id, coalesce(p.name, 'Bệnh không còn trong danh mục'),
         sum(l.tests_done)::integer, sum(l.positives)::integer
    FROM public.lims_disease_report_lines l
    LEFT JOIN public.ward_codes w ON w.ma_xa = l.ma_xa
    LEFT JOIN public.pathogens p ON p.id = l.pathogen_id
   WHERE l.week_start BETWEEN p_from AND p_to
   GROUP BY l.ma_xa, w.ten_xa, l.pathogen_id, p.name
   ORDER BY sum(l.positives) DESC
   LIMIT 20000;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_disease_by_week(p_from date, p_to date, p_pathogen uuid DEFAULT NULL::uuid, p_ma_xa text DEFAULT NULL::text)
 RETURNS TABLE(week_start date, tests integer, positives integer, labs integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.lims_disease_check_range(p_from, p_to);
  RETURN QUERY
  SELECT l.week_start, sum(l.tests_done)::integer, sum(l.positives)::integer, count(DISTINCT l.lab_id)::integer
    FROM public.lims_disease_report_lines l
   WHERE l.week_start BETWEEN p_from AND p_to
     AND (p_pathogen IS NULL OR l.pathogen_id = p_pathogen)
     AND (p_ma_xa IS NULL OR l.ma_xa = p_ma_xa)
   GROUP BY l.week_start
   ORDER BY l.week_start;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_disease_check_range(p_from date, p_to date)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.lims_current_role() IS DISTINCT FROM 'hcdc_admin' THEN
    RAISE EXCEPTION 'Chỉ quản trị HCDC được xem số liệu tổng hợp bệnh truyền nhiễm.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'Khoảng thời gian không hợp lệ.'; END IF;
  IF p_to - p_from > 740 THEN RAISE EXCEPTION 'Khoảng thời gian tối đa 2 năm.'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_disease_compliance(p_week date)
 RETURNS TABLE(lab_id uuid, lab_name text, submitted boolean, submitted_at timestamp with time zone, lines integer, tests integer, positives integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.lims_disease_check_range(p_week, p_week);
  RETURN QUERY
  SELECT lb.id, lb.name, (rp.id IS NOT NULL), rp.updated_at,
         coalesce(s.n, 0)::integer, coalesce(s.t, 0)::integer, coalesce(s.p, 0)::integer
    FROM public.laboratories lb
    LEFT JOIN public.lims_disease_reports rp ON rp.lab_id = lb.id AND rp.week_start = p_week
    LEFT JOIN LATERAL (
      SELECT count(*) AS n, sum(x.tests_done) AS t, sum(x.positives) AS p
        FROM public.lims_disease_report_lines x WHERE x.report_id = rp.id
    ) s ON true
   WHERE lb.is_active IS NOT FALSE
   ORDER BY (rp.id IS NOT NULL), lb.name;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_disease_wards()
 RETURNS TABLE(ma_xa text, ten_xa text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.lims_current_role() IS NULL OR public.lims_current_role() NOT IN ('lab_admin', 'hcdc_admin') THEN
    RAISE EXCEPTION 'Không có quyền xem danh mục phường/xã.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT w.ma_xa, w.ten_xa FROM public.ward_codes w ORDER BY w.ten_xa;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_disease_week_now()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
$function$;

CREATE OR REPLACE FUNCTION public.lims_gen_item_code(p_prefix text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v text := '';
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    v := v || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN p_prefix || '-' || v;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_imp_check_rows(p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Dữ liệu nhập không hợp lệ.'; END IF;
  IF jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'Không có dòng nào để nhập.'; END IF;
  IF jsonb_array_length(p_rows) > 1000 THEN RAISE EXCEPTION 'Mỗi lần nhập tối đa 1000 dòng. Hãy tách file.'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_imp_date(p text, p_label text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v date;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  IF btrim(p) !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION '% không đúng định dạng ngày', p_label; END IF;
  BEGIN
    v := btrim(p)::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '% không phải ngày hợp lệ', p_label;
  END;
  IF v < DATE '1950-01-01' OR v > DATE '2100-12-31' THEN RAISE EXCEPTION '% ngoài khoảng 1950–2100', p_label; END IF;
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_imp_lab(p_lab uuid, p_allow_hcdc boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := public.lims_current_role();
  v_lab  uuid;
BEGIN
  IF v_role = 'lab_admin' THEN
    v_lab := public.lims_current_lab_id();
    IF v_lab IS NULL THEN RAISE EXCEPTION 'Tài khoản chưa gắn với phòng xét nghiệm.' USING ERRCODE = '42501'; END IF;
    IF p_lab IS NOT NULL AND p_lab <> v_lab THEN RAISE EXCEPTION 'Chỉ được nhập dữ liệu cho phòng xét nghiệm của bạn.' USING ERRCODE = '42501'; END IF;
    RETURN v_lab;
  ELSIF v_role = 'hcdc_admin' AND p_allow_hcdc THEN
    IF p_lab IS NULL OR NOT EXISTS (SELECT 1 FROM public.laboratories WHERE id = p_lab) THEN
      RAISE EXCEPTION 'Không tìm thấy phòng xét nghiệm.';
    END IF;
    RETURN p_lab;
  END IF;
  RAISE EXCEPTION 'Bạn không có quyền nhập dữ liệu từ Excel.' USING ERRCODE = '42501';
END $function$;

CREATE OR REPLACE FUNCTION public.lims_imp_text(p text, p_max integer, p_label text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v text := nullif(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[\x01-\x08\x0b-\x1f\x7f]', '', 'g'), '[[:space:]]+', ' ', 'g')), '');
BEGIN
  IF v IS NOT NULL AND char_length(v) > p_max THEN
    RAISE EXCEPTION '% quá dài (tối đa % ký tự)', p_label, p_max;
  END IF;
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_import_disease(p_rows jsonb, p_file_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.lims_imp_lab(NULL, false);
  r jsonb;
  v_row integer; v_day date; v_week date; v_path uuid; v_ward text; v_tests integer; v_pos integer;
  v_report uuid; v_n integer;
  v_state text; v_msg text;
  res jsonb := '[]'::jsonb;
  n_ins integer := 0; n_skip integer := 0; n_err integer := 0;
  touched date[] := ARRAY[]::date[];
  w date; v_label text; t_lines integer; t_tests integer; t_pos integer;
BEGIN
  PERFORM public.lims_imp_check_rows(p_rows);
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_state := 'inserted'; v_msg := NULL; v_row := NULL;
    BEGIN
      v_row := nullif(r->>'row', '')::integer;
      v_day := public.lims_imp_date(r->>'week_start', 'Tuần');
      IF v_day IS NULL THEN RAISE EXCEPTION 'Thiếu tuần báo cáo'; END IF;
      v_week := date_trunc('week', v_day)::date;
      IF v_week > public.lims_disease_week_now() THEN RAISE EXCEPTION 'Tuần chưa bắt đầu — không thể báo cáo'; END IF;
      IF v_week < public.lims_disease_week_now() - 730 THEN RAISE EXCEPTION 'Chỉ nhận báo cáo trong vòng 2 năm gần đây'; END IF;
      IF coalesce(r->>'pathogen_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Chưa xác định được bệnh'; END IF;
      v_path := (r->>'pathogen_id')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.pathogens WHERE id = v_path) THEN RAISE EXCEPTION 'Bệnh không có trong danh mục'; END IF;
      v_ward := public.lims_imp_text(r->>'ma_xa', 20, 'Mã xã/phường/đặc khu');
      IF v_ward IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ward_codes WHERE ma_xa = v_ward) THEN RAISE EXCEPTION 'Xã/phường/đặc khu không có trong danh mục'; END IF;
      IF coalesce(r->>'tests_done', '') !~ '^\d{1,7}$' THEN RAISE EXCEPTION 'Số xét nghiệm phải là số nguyên không âm'; END IF;
      IF coalesce(r->>'positives', '') !~ '^\d{1,7}$' THEN RAISE EXCEPTION 'Số dương tính phải là số nguyên không âm'; END IF;
      v_tests := (r->>'tests_done')::integer; v_pos := (r->>'positives')::integer;
      IF v_tests > 1000000 OR v_pos > 1000000 THEN RAISE EXCEPTION 'Số liệu quá lớn (tối đa 1.000.000)'; END IF;
      IF v_pos > v_tests THEN RAISE EXCEPTION 'Số dương tính không được lớn hơn số xét nghiệm'; END IF;

      SELECT id INTO v_report FROM public.lims_disease_reports WHERE lab_id = v_lab AND week_start = v_week;
      IF v_report IS NULL THEN
        INSERT INTO public.lims_disease_reports (lab_id, week_start, submitted_by) VALUES (v_lab, v_week, auth.uid()) RETURNING id INTO v_report;
      END IF;
      INSERT INTO public.lims_disease_report_lines (report_id, lab_id, week_start, pathogen_id, ma_xa, tests_done, positives)
      VALUES (v_report, v_lab, v_week, v_path, v_ward, v_tests, v_pos)
      ON CONFLICT (report_id, pathogen_id, (coalesce(ma_xa, ''))) DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        v_state := 'skipped'; v_msg := 'Đã có dòng số liệu này trong báo cáo tuần — bỏ qua (sửa số liệu ở trang báo cáo)';
      ELSE
        UPDATE public.lims_disease_reports SET updated_at = now(), submitted_by = auth.uid() WHERE id = v_report;
        IF NOT (v_week = ANY (touched)) THEN touched := touched || v_week; END IF;
      END IF;
    EXCEPTION
      WHEN raise_exception THEN v_state := 'error'; v_msg := SQLERRM;
      WHEN check_violation THEN v_state := 'error'; v_msg := 'Dữ liệu không hợp lệ (vi phạm ràng buộc)';
      WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN v_state := 'error'; v_msg := 'Giá trị không đúng định dạng';
      WHEN OTHERS THEN v_state := 'error'; v_msg := 'Lỗi không xác định: ' || left(SQLERRM, 120);
    END;
    IF v_state = 'inserted' THEN n_ins := n_ins + 1; ELSIF v_state = 'skipped' THEN n_skip := n_skip + 1; ELSE n_err := n_err + 1; END IF;
    res := res || jsonb_build_array(jsonb_build_object('row', v_row, 'status', v_state, 'message', v_msg));
  END LOOP;

  SELECT coalesce(nullif(btrim(full_name), ''), email) INTO v_label FROM public.profiles WHERE id = auth.uid();
  FOREACH w IN ARRAY touched LOOP
    SELECT count(*), coalesce(sum(tests_done), 0), coalesce(sum(positives), 0) INTO t_lines, t_tests, t_pos
      FROM public.lims_disease_report_lines WHERE lab_id = v_lab AND week_start = w;
    INSERT INTO public.lims_disease_report_log (lab_id, week_start, actor, actor_label, action, new_lines, new_tests, new_pos)
    VALUES (v_lab, w, auth.uid(), v_label, 'import', t_lines, t_tests, t_pos);
  END LOOP;

  INSERT INTO public.lims_import_log (lab_id, kind, file_name, rows_total, inserted, skipped, errors, created_by)
  VALUES (v_lab, 'disease', left(p_file_name, 200), jsonb_array_length(p_rows), n_ins, n_skip, n_err, auth.uid());
  RETURN jsonb_build_object('inserted', n_ins, 'skipped', n_skip, 'errors', n_err, 'results', res);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_import_equipment(p_rows jsonb, p_file_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.lims_imp_lab(NULL, false);
  r jsonb;
  v_row integer; v_name text; v_code text; v_barcode text; v_status text; v_due date; v_note text; v_cat uuid;
  v_state text; v_msg text;
  res jsonb := '[]'::jsonb;
  n_ins integer := 0; n_skip integer := 0; n_err integer := 0;
BEGIN
  PERFORM public.lims_imp_check_rows(p_rows);
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_state := 'inserted'; v_msg := NULL; v_row := NULL;
    BEGIN
      v_row := nullif(r->>'row', '')::integer;
      v_name := public.lims_imp_text(r->>'name', 200, 'Tên thiết bị');
      IF v_name IS NULL THEN RAISE EXCEPTION 'Thiếu tên thiết bị'; END IF;
      v_code := public.lims_imp_text(r->>'code', 40, 'Mã nhãn');
      IF v_code IS NOT NULL AND v_code !~ '^\S{3,40}$' THEN RAISE EXCEPTION 'Mã nhãn phải 3–40 ký tự, không có khoảng trắng'; END IF;
      v_barcode := public.lims_imp_text(r->>'barcode', 64, 'Mã vạch / mã tài sản');
      v_status := coalesce(nullif(btrim(r->>'status'), ''), 'hoat_dong');
      IF v_status NOT IN ('hoat_dong', 'bao_tri', 'hong') THEN RAISE EXCEPTION 'Tình trạng không hợp lệ (hoạt động / bảo trì / hỏng)'; END IF;
      v_due := public.lims_imp_date(r->>'calibration_due_date', 'Hạn hiệu chuẩn');
      v_note := public.lims_imp_text(r->>'note', 500, 'Ghi chú');

      IF v_code IS NOT NULL AND EXISTS (SELECT 1 FROM public.lab_equipments WHERE lab_id = v_lab AND lower(code) = lower(v_code)) THEN
        v_state := 'skipped'; v_msg := 'Đã có thiết bị mã ' || v_code;
      ELSIF v_code IS NULL AND EXISTS (
        SELECT 1 FROM public.lab_equipments
         WHERE lab_id = v_lab AND lower(btrim(name)) = lower(v_name) AND coalesce(lower(barcode), '') = coalesce(lower(v_barcode), '')) THEN
        v_state := 'skipped';
        v_msg := 'Đã có thiết bị cùng tên' || CASE WHEN v_barcode IS NULL THEN ' (nếu là máy khác nhau, ghi thêm mã vạch / mã tài sản để phân biệt)' ELSE ' và mã tài sản' END;
      ELSE
        SELECT id INTO v_cat FROM public.lims_equipment_catalog WHERE is_active AND lower(btrim(name)) = lower(v_name) LIMIT 1;
        INSERT INTO public.lab_equipments (lab_id, name, catalog_id, status, calibration_due_date, note, code, barcode)
        VALUES (v_lab, v_name, v_cat, v_status, v_due, v_note, v_code, v_barcode);
      END IF;
    EXCEPTION
      WHEN raise_exception THEN v_state := 'error'; v_msg := SQLERRM;
      WHEN unique_violation THEN v_state := 'error'; v_msg := 'Trùng mã nhãn với thiết bị khác';
      WHEN check_violation THEN v_state := 'error'; v_msg := 'Dữ liệu không hợp lệ (vi phạm ràng buộc)';
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN v_state := 'error'; v_msg := 'Giá trị không đúng định dạng';
      WHEN OTHERS THEN v_state := 'error'; v_msg := 'Lỗi không xác định: ' || left(SQLERRM, 120);
    END;
    IF v_state = 'inserted' THEN n_ins := n_ins + 1; ELSIF v_state = 'skipped' THEN n_skip := n_skip + 1; ELSE n_err := n_err + 1; END IF;
    res := res || jsonb_build_array(jsonb_build_object('row', v_row, 'status', v_state, 'message', v_msg));
  END LOOP;

  INSERT INTO public.lims_import_log (lab_id, kind, file_name, rows_total, inserted, skipped, errors, created_by)
  VALUES (v_lab, 'equipment', left(p_file_name, 200), jsonb_array_length(p_rows), n_ins, n_skip, n_err, auth.uid());
  RETURN jsonb_build_object('inserted', n_ins, 'skipped', n_skip, 'errors', n_err, 'results', res);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_import_inventory(p_rows jsonb, p_file_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.lims_imp_lab(NULL, false);
  r jsonb;
  v_row integer; v_name text; v_lot text; v_qty numeric; v_unit text; v_exp date; v_code text; v_barcode text; v_cat uuid; v_id uuid;
  v_state text; v_msg text;
  res jsonb := '[]'::jsonb;
  n_ins integer := 0; n_skip integer := 0; n_err integer := 0;
BEGIN
  PERFORM public.lims_imp_check_rows(p_rows);
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_state := 'inserted'; v_msg := NULL; v_row := NULL;
    BEGIN
      v_row := nullif(r->>'row', '')::integer;
      v_name := public.lims_imp_text(r->>'item_name', 200, 'Tên vật tư');
      IF v_name IS NULL THEN RAISE EXCEPTION 'Thiếu tên vật tư'; END IF;
      v_lot := public.lims_imp_text(r->>'lot_number', 80, 'Số lô');
      v_qty := coalesce(nullif(btrim(r->>'quantity'), '')::numeric, 0);
      IF v_qty < 0 OR v_qty > 1000000000 THEN RAISE EXCEPTION 'Số lượng phải từ 0 đến 1 tỷ'; END IF;
      v_unit := public.lims_imp_text(r->>'unit', 40, 'Đơn vị tính');
      v_exp := public.lims_imp_date(r->>'expiration_date', 'Hạn sử dụng');
      v_code := public.lims_imp_text(r->>'code', 40, 'Mã nhãn');
      IF v_code IS NOT NULL AND v_code !~ '^\S{3,40}$' THEN RAISE EXCEPTION 'Mã nhãn phải 3–40 ký tự, không có khoảng trắng'; END IF;
      v_barcode := public.lims_imp_text(r->>'barcode', 64, 'Mã vạch');

      IF v_code IS NOT NULL AND EXISTS (SELECT 1 FROM public.lab_inventory WHERE lab_id = v_lab AND lower(code) = lower(v_code)) THEN
        v_state := 'skipped'; v_msg := 'Đã có vật tư mã ' || v_code;
      ELSIF v_code IS NULL AND EXISTS (
        SELECT 1 FROM public.lab_inventory
         WHERE lab_id = v_lab AND lower(btrim(item_name)) = lower(v_name) AND coalesce(lower(btrim(lot_number)), '') = coalesce(lower(v_lot), '')) THEN
        v_state := 'skipped'; v_msg := 'Đã có vật tư cùng tên' || CASE WHEN v_lot IS NULL THEN ' (không số lô)' ELSE ' và số lô ' || v_lot END;
      ELSE
        SELECT id INTO v_cat FROM public.lims_reagent_catalog WHERE is_active AND lower(btrim(name)) = lower(v_name) LIMIT 1;
        -- Thêm với tồn 0 rồi ghi giao dịch NHẬP: nhật ký và tồn kho luôn khớp (trigger lims_apply_inventory_transaction).
        INSERT INTO public.lab_inventory (lab_id, item_name, catalog_id, lot_number, quantity, unit, expiration_date, code, barcode)
        VALUES (v_lab, v_name, v_cat, v_lot, 0, v_unit, v_exp, v_code, v_barcode) RETURNING id INTO v_id;
        IF v_qty > 0 THEN
          INSERT INTO public.inventory_transactions (inventory_id, lab_id, transaction_type, amount, note)
          VALUES (v_id, v_lab, 'in', v_qty, 'Nhập từ file Excel' || coalesce(' (' || left(p_file_name, 80) || ')', ''));
        END IF;
      END IF;
    EXCEPTION
      WHEN raise_exception THEN v_state := 'error'; v_msg := SQLERRM;
      WHEN unique_violation THEN v_state := 'error'; v_msg := 'Trùng mã nhãn với vật tư khác';
      WHEN check_violation THEN v_state := 'error'; v_msg := 'Dữ liệu không hợp lệ (vi phạm ràng buộc)';
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN v_state := 'error'; v_msg := 'Giá trị không đúng định dạng (số lượng phải là số)';
      WHEN OTHERS THEN v_state := 'error'; v_msg := 'Lỗi không xác định: ' || left(SQLERRM, 120);
    END;
    IF v_state = 'inserted' THEN n_ins := n_ins + 1; ELSIF v_state = 'skipped' THEN n_skip := n_skip + 1; ELSE n_err := n_err + 1; END IF;
    res := res || jsonb_build_array(jsonb_build_object('row', v_row, 'status', v_state, 'message', v_msg));
  END LOOP;

  INSERT INTO public.lims_import_log (lab_id, kind, file_name, rows_total, inserted, skipped, errors, created_by)
  VALUES (v_lab, 'inventory', left(p_file_name, 200), jsonb_array_length(p_rows), n_ins, n_skip, n_err, auth.uid());
  RETURN jsonb_build_object('inserted', n_ins, 'skipped', n_skip, 'errors', n_err, 'results', res);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_import_staff(p_lab uuid, p_rows jsonb, p_file_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid := public.lims_imp_lab(p_lab, true);
  r jsonb;
  v_row integer; v_name text; v_title text; v_degree text; v_spec text; v_emp text; v_bio boolean; v_note text;
  v_ct text; v_cn text; v_ci text; v_cf date; v_cx date; v_has_cert boolean;
  v_sid uuid; v_new boolean;
  v_state text; v_msg text;
  res jsonb := '[]'::jsonb;
  n_ins integer := 0; n_skip integer := 0; n_err integer := 0;
BEGIN
  PERFORM public.lims_imp_check_rows(p_rows);
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_state := 'inserted'; v_msg := NULL; v_row := NULL; v_new := false;
    BEGIN
      v_row := nullif(r->>'row', '')::integer;
      v_name := public.lims_imp_text(r->>'full_name', 120, 'Họ tên');
      IF v_name IS NULL OR char_length(v_name) < 2 THEN RAISE EXCEPTION 'Thiếu họ tên (ít nhất 2 ký tự)'; END IF;
      v_title  := public.lims_imp_text(r->>'job_title', 120, 'Chức danh');
      v_degree := public.lims_imp_text(r->>'degree', 120, 'Trình độ');
      v_spec   := public.lims_imp_text(r->>'specialty', 120, 'Chuyên ngành');
      v_emp    := coalesce(nullif(btrim(r->>'employment'), ''), 'bien_che');
      IF v_emp NOT IN ('bien_che', 'hop_dong', 'thinh_giang', 'khac') THEN RAISE EXCEPTION 'Hình thức làm việc không hợp lệ'; END IF;
      v_bio    := coalesce(nullif(btrim(r->>'biosafety_role'), '')::boolean, false);
      v_note   := public.lims_imp_text(r->>'note', 500, 'Ghi chú');
      v_ct := public.lims_imp_text(r->>'cert_type', 150, 'Loại chứng chỉ');
      v_cn := public.lims_imp_text(r->>'cert_no', 100, 'Số chứng chỉ');
      v_ci := public.lims_imp_text(r->>'issuer', 150, 'Nơi cấp');
      v_cf := public.lims_imp_date(r->>'issued_on', 'Ngày cấp');
      v_cx := public.lims_imp_date(r->>'expires_on', 'Ngày hết hạn');
      v_has_cert := v_ct IS NOT NULL;
      IF NOT v_has_cert AND (v_cn IS NOT NULL OR v_ci IS NOT NULL OR v_cf IS NOT NULL OR v_cx IS NOT NULL) THEN
        RAISE EXCEPTION 'Có thông tin chứng chỉ nhưng thiếu loại chứng chỉ';
      END IF;
      IF v_has_cert AND char_length(v_ct) < 2 THEN RAISE EXCEPTION 'Loại chứng chỉ quá ngắn'; END IF;
      IF v_cf IS NOT NULL AND v_cx IS NOT NULL AND v_cx < v_cf THEN RAISE EXCEPTION 'Ngày hết hạn phải sau ngày cấp'; END IF;

      SELECT id INTO v_sid FROM public.lims_lab_staff WHERE lab_id = v_lab AND lower(btrim(full_name)) = lower(v_name) ORDER BY created_at LIMIT 1;
      IF v_sid IS NULL THEN
        INSERT INTO public.lims_lab_staff (lab_id, full_name, job_title, degree, specialty, employment, biosafety_role, note)
        VALUES (v_lab, v_name, v_title, v_degree, v_spec, v_emp, v_bio, v_note) RETURNING id INTO v_sid;
        v_new := true;
      END IF;

      IF v_has_cert THEN
        IF EXISTS (SELECT 1 FROM public.lims_staff_certificates
                    WHERE staff_id = v_sid AND lower(btrim(cert_type)) = lower(v_ct) AND coalesce(lower(btrim(cert_no)), '') = coalesce(lower(v_cn), '')) THEN
          IF v_new THEN NULL; ELSE v_state := 'skipped'; v_msg := 'Nhân sự và chứng chỉ này đã có'; END IF;
        ELSE
          INSERT INTO public.lims_staff_certificates (staff_id, lab_id, cert_type, cert_no, issuer, issued_on, expires_on)
          VALUES (v_sid, v_lab, v_ct, v_cn, v_ci, v_cf, v_cx);
          IF NOT v_new THEN v_msg := 'Đã thêm chứng chỉ cho nhân sự đã có'; END IF;
        END IF;
      ELSIF NOT v_new THEN
        v_state := 'skipped'; v_msg := 'Đã có nhân sự này';
      END IF;
    EXCEPTION
      WHEN raise_exception THEN v_state := 'error'; v_msg := SQLERRM;
      WHEN check_violation THEN v_state := 'error'; v_msg := 'Dữ liệu không hợp lệ (vi phạm ràng buộc)';
      WHEN invalid_text_representation THEN v_state := 'error'; v_msg := 'Giá trị không đúng định dạng';
      WHEN OTHERS THEN v_state := 'error'; v_msg := 'Lỗi không xác định: ' || left(SQLERRM, 120);
    END;
    IF v_state = 'inserted' THEN n_ins := n_ins + 1; ELSIF v_state = 'skipped' THEN n_skip := n_skip + 1; ELSE n_err := n_err + 1; END IF;
    res := res || jsonb_build_array(jsonb_build_object('row', v_row, 'status', v_state, 'message', v_msg));
  END LOOP;

  INSERT INTO public.lims_import_log (lab_id, kind, file_name, rows_total, inserted, skipped, errors, created_by)
  VALUES (v_lab, 'staff', left(p_file_name, 200), jsonb_array_length(p_rows), n_ins, n_skip, n_err, auth.uid());
  RETURN jsonb_build_object('inserted', n_ins, 'skipped', n_skip, 'errors', n_err, 'results', res);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_item_code_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v text;
  tries int := 0;
  taken boolean;
BEGIN
  NEW.code    := nullif(btrim(coalesce(NEW.code, '')), '');
  NEW.barcode := nullif(btrim(coalesce(NEW.barcode, '')), '');
  IF NEW.code IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.code IS NOT NULL THEN
      NEW.code := OLD.code;
    ELSE
      LOOP
        v := public.lims_gen_item_code(TG_ARGV[0]);
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE lab_id = $1 AND code = $2)', TG_TABLE_NAME)
          INTO taken USING NEW.lab_id, v;
        EXIT WHEN NOT taken;
        tries := tries + 1;
        IF tries > 30 THEN RAISE EXCEPTION 'Không sinh được mã nhãn duy nhất, thử lại.'; END IF;
      END LOOP;
      NEW.code := v;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_log_catalog(p_catalog text, p_item_id text, p_item_label text, p_action text, p_old jsonb, p_new jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_label text;
BEGIN
  BEGIN
    IF v_uid IS NOT NULL THEN
      SELECT coalesce(nullif(btrim(full_name), ''), email) INTO v_label FROM public.profiles WHERE id = v_uid;
    END IF;
    INSERT INTO public.lims_catalog_log (actor, actor_label, catalog, item_id, item_label, action, old_value, new_value)
    VALUES (v_uid, v_label, p_catalog, p_item_id, p_item_label, p_action, p_old, p_new);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lims_log_catalog bỏ qua do lỗi: %', SQLERRM;
  END;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_log_change(p_lab uuid, p_entity text, p_field text, p_old jsonb, p_new jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_label text;
  v_role  text;
BEGIN
  BEGIN
    IF v_uid IS NOT NULL THEN
      SELECT coalesce(nullif(btrim(full_name), ''), email), lower(role)
        INTO v_label, v_role FROM public.profiles WHERE id = v_uid;
    END IF;
    INSERT INTO public.lims_lab_history (lab_id, changed_by, actor_label, actor_role, entity, field, old_value, new_value)
    VALUES (p_lab, v_uid, v_label, v_role, p_entity, p_field, p_old, p_new);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lims_log_change bỏ qua do lỗi: %', SQLERRM;
  END;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_map_incidents()
 RETURNS TABLE(id uuid, event_name text, status text, ma_xa text, ward_name text, latitude double precision, longitude double precision, started_at timestamp with time zone, cases_total integer, suspected_total integer, deaths_total integer, report_count integer, last_report_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.lims_current_role() IS DISTINCT FROM 'hcdc_admin' THEN
    RAISE EXCEPTION 'Chỉ quản trị HCDC được xem lớp sự kiện dịch tễ.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.id,
         i.event_name,
         i.status,
         i.ma_xa,
         w.ten_xa,
         round(i.latitude::numeric, 3)::double precision,
         round(i.longitude::numeric, 3)::double precision,
         coalesce(i.activation_time, i.created_at),
         coalesce(r.cases_total, 0)::integer,
         coalesce(r.suspected_total, 0)::integer,
         coalesce(r.deaths_total, 0)::integer,
         coalesce(r.n, 0)::integer,
         r.last_at
    FROM public.incidents i
    LEFT JOIN public.ward_codes w ON w.ma_xa = i.ma_xa
    LEFT JOIN LATERAL (
      -- số liệu luỹ kế: lấy giá trị lớn nhất đã từng báo cáo (báo cáo sau có thể để trống/0 khi chỉ cập nhật hoạt động)
      SELECT max(ir.cases_total)     AS cases_total,
             max(ir.suspected_total) AS suspected_total,
             max(ir.deaths_total)    AS deaths_total,
             count(*)                AS n,
             max(ir.created_at)      AS last_at
        FROM public.incident_reports ir
       WHERE ir.incident_id = i.id
    ) r ON true
   ORDER BY coalesce(i.activation_time, i.created_at) DESC
   LIMIT 500;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_record_scan(p_kind text, p_id uuid, p_qty numeric DEFAULT NULL::numeric, p_status text DEFAULT NULL::text, p_due date DEFAULT NULL::date, p_note text DEFAULT NULL::text, p_stocktake uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab   uuid := public.lims_require_lab_admin();
  v_note  text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
  v_st    public.lims_stocktakes%ROWTYPE;
  v_inv   public.lab_inventory%ROWTYPE;
  v_eq    public.lab_equipments%ROWTYPE;
  v_delta numeric := 0;
  v_tx    text;
  v_changed boolean := false;
BEGIN
  IF p_stocktake IS NOT NULL THEN
    SELECT * INTO v_st FROM public.lims_stocktakes WHERE id = p_stocktake AND lab_id = v_lab FOR SHARE;
    IF NOT FOUND OR v_st.status <> 'open' THEN RAISE EXCEPTION 'Đợt kiểm kê không tồn tại hoặc đã kết thúc.'; END IF;
  END IF;

  IF p_kind = 'inventory' THEN
    SELECT * INTO v_inv FROM public.lab_inventory WHERE id = p_id AND lab_id = v_lab FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy vật tư trong PXN của bạn.'; END IF;
    IF p_qty IS NULL OR p_qty < 0 OR p_qty > 1000000000 THEN RAISE EXCEPTION 'Số lượng thực tế phải là số không âm.'; END IF;
    v_delta := p_qty - v_inv.quantity;
    IF v_delta <> 0 THEN
      v_tx := CASE WHEN p_stocktake IS NULL THEN 'Cập nhật qua quét mã' ELSE 'Kiểm kê: ' || v_st.name END
              || CASE WHEN v_note IS NULL THEN '' ELSE ' — ' || v_note END;
      INSERT INTO public.inventory_transactions (inventory_id, lab_id, transaction_type, amount, note)
      VALUES (p_id, v_lab, CASE WHEN v_delta > 0 THEN 'in' ELSE 'out' END, abs(v_delta), left(v_tx, 400));
      v_changed := true;
    END IF;
    IF p_stocktake IS NOT NULL THEN
      INSERT INTO public.lims_stocktake_lines (stocktake_id, lab_id, kind, inventory_id, item_label, code, lot_label,
                                               qty_before, qty_after, note, counted_by)
      VALUES (p_stocktake, v_lab, 'inventory', p_id, v_inv.item_name, v_inv.code, v_inv.lot_number,
              v_inv.quantity, p_qty, v_note, auth.uid())
      ON CONFLICT (stocktake_id, inventory_id) WHERE inventory_id IS NOT NULL
      DO UPDATE SET qty_after = EXCLUDED.qty_after, note = EXCLUDED.note, counted_by = EXCLUDED.counted_by, counted_at = now();
    END IF;

  ELSIF p_kind = 'equipment' THEN
    SELECT * INTO v_eq FROM public.lab_equipments WHERE id = p_id AND lab_id = v_lab FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy thiết bị trong PXN của bạn.'; END IF;
    IF p_status IS NULL OR p_status NOT IN ('hoat_dong', 'bao_tri', 'hong') THEN RAISE EXCEPTION 'Tình trạng thiết bị không hợp lệ.'; END IF;
    v_changed := v_eq.status IS DISTINCT FROM p_status OR v_eq.calibration_due_date IS DISTINCT FROM p_due;
    IF v_changed THEN
      UPDATE public.lab_equipments SET status = p_status, calibration_due_date = p_due WHERE id = p_id;
    END IF;
    IF p_stocktake IS NOT NULL THEN
      INSERT INTO public.lims_stocktake_lines (stocktake_id, lab_id, kind, equipment_id, item_label, code,
                                               status_before, status_after, due_before, due_after, note, counted_by)
      VALUES (p_stocktake, v_lab, 'equipment', p_id, v_eq.name, v_eq.code,
              v_eq.status, p_status, v_eq.calibration_due_date, p_due, v_note, auth.uid())
      ON CONFLICT (stocktake_id, equipment_id) WHERE equipment_id IS NOT NULL
      DO UPDATE SET status_after = EXCLUDED.status_after, due_after = EXCLUDED.due_after, note = EXCLUDED.note,
                    counted_by = EXCLUDED.counted_by, counted_at = now();
    END IF;

  ELSE
    RAISE EXCEPTION 'Loại mục không hợp lệ (equipment | inventory).';
  END IF;

  RETURN jsonb_build_object('ok', true, 'changed', v_changed, 'delta', v_delta);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_report_daily_load(p_lab_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role  text := public.lims_current_role();
  v_today date := public.lims_today();
  v_item  jsonb;
  v_tt    uuid;
  v_n     numeric;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'lab_admin' THEN
    IF p_lab_id IS NULL OR p_lab_id IS DISTINCT FROM public.lims_current_lab_id() THEN
      RAISE EXCEPTION 'Bạn không có quyền khai báo tải của phòng xét nghiệm khác' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role IS DISTINCT FROM 'hcdc_admin' THEN
    RAISE EXCEPTION 'Tài khoản không có quyền khai báo tải' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Dữ liệu khai báo không hợp lệ';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'Quá nhiều dòng khai báo';
  END IF;
  PERFORM 1 FROM public.laboratories WHERE id = p_lab_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phòng xét nghiệm'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) <> 'object' OR NOT (v_item ? 'test_type_id') THEN
      RAISE EXCEPTION 'Dòng khai báo thiếu kỹ thuật';
    END IF;
    BEGIN
      v_tt := (v_item ->> 'test_type_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Mã kỹ thuật không hợp lệ';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.lab_capabilities c WHERE c.lab_id = p_lab_id AND c.test_type_id = v_tt) THEN
      RAISE EXCEPTION 'Phòng chưa khai báo công suất cho kỹ thuật này — hãy thêm ở mục Công suất xét nghiệm trước';
    END IF;

    IF (v_item -> 'samples') IS NULL OR jsonb_typeof(v_item -> 'samples') = 'null' THEN
      DELETE FROM public.lims_lab_daily_load WHERE lab_id = p_lab_id AND load_date = v_today AND test_type_id = v_tt;
    ELSE
      IF jsonb_typeof(v_item -> 'samples') <> 'number' THEN
        RAISE EXCEPTION 'Số mẫu phải là số';
      END IF;
      v_n := (v_item ->> 'samples')::numeric;
      IF v_n <> trunc(v_n) OR v_n < 0 OR v_n > 1000000 THEN
        RAISE EXCEPTION 'Số mẫu phải là số nguyên từ 0 đến 1.000.000';
      END IF;
      INSERT INTO public.lims_lab_daily_load (lab_id, load_date, test_type_id, samples, updated_at, updated_by)
      VALUES (p_lab_id, v_today, v_tt, v_n::integer, now(), auth.uid())
      ON CONFLICT (lab_id, load_date, test_type_id) DO UPDATE
        SET samples = EXCLUDED.samples, updated_at = now(), updated_by = auth.uid();
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'date', v_today, 'count', v_count);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_require_hcdc()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập' USING ERRCODE = '42501'; END IF;
  IF public.lims_current_role() IS DISTINCT FROM 'hcdc_admin' THEN
    RAISE EXCEPTION 'Chỉ quản trị mạng lưới (HCDC) được thay đổi danh mục này' USING ERRCODE = '42501';
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_require_lab_admin()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lab uuid := public.lims_current_lab_id();
BEGIN
  IF public.lims_current_role() IS DISTINCT FROM 'lab_admin' OR v_lab IS NULL THEN
    RAISE EXCEPTION 'Chỉ quản trị PXN được kiểm kê / cập nhật qua quét mã.' USING ERRCODE = '42501';
  END IF;
  RETURN v_lab;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_save_alert_settings(p_enabled boolean, p_recipients text[], p_include_admins boolean, p_weeks integer, p_min_positives integer, p_ratio numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e text;
  clean text[] := ARRAY[]::text[];
BEGIN
  IF public.lims_current_role() IS DISTINCT FROM 'hcdc_admin' THEN
    RAISE EXCEPTION 'Chỉ quản trị HCDC được cấu hình cảnh báo.' USING ERRCODE = '42501';
  END IF;
  IF p_weeks IS NULL OR p_weeks NOT IN (1, 2, 4) THEN RAISE EXCEPTION 'Khoảng thời gian phải là 1, 2 hoặc 4 tuần.'; END IF;
  IF p_min_positives IS NULL OR p_min_positives < 1 OR p_min_positives > 1000 THEN RAISE EXCEPTION 'Số ca tối thiểu phải từ 1 đến 1000.'; END IF;
  IF p_ratio IS NULL OR p_ratio < 1.2 OR p_ratio > 10 THEN RAISE EXCEPTION 'Hệ số tăng phải từ 1,2 đến 10.'; END IF;
  FOREACH e IN ARRAY coalesce(p_recipients, ARRAY[]::text[]) LOOP
    e := lower(btrim(e));
    IF e = '' THEN CONTINUE; END IF;
    IF char_length(e) > 200 OR e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN RAISE EXCEPTION 'Địa chỉ email không hợp lệ: %', left(e, 60); END IF;
    IF NOT (e = ANY (clean)) THEN clean := clean || e; END IF;
  END LOOP;
  IF cardinality(clean) > 20 THEN RAISE EXCEPTION 'Tối đa 20 địa chỉ email nhận cảnh báo.'; END IF;
  IF p_enabled AND cardinality(clean) = 0 AND NOT coalesce(p_include_admins, false) THEN
    RAISE EXCEPTION 'Chưa có người nhận: thêm địa chỉ email hoặc bật gửi cho các tài khoản quản trị HCDC.';
  END IF;
  UPDATE public.lims_alert_settings
     SET enabled = coalesce(p_enabled, false), recipients = clean, include_admins = coalesce(p_include_admins, false),
         weeks = p_weeks, min_positives = p_min_positives, ratio = p_ratio, updated_by = auth.uid(), updated_at = now()
   WHERE id = 1;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_save_disease_report(p_week date, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab    uuid;
  v_report uuid;
  v_exists boolean;
  r        jsonb;
  n        integer := 0;
  v_path   uuid;
  v_ward   text;
  v_tests  integer;
  v_pos    integer;
  v_label  text;
  o_lines integer := 0; o_tests integer := 0; o_pos integer := 0;
  n_tests integer := 0; n_pos integer := 0;
BEGIN
  IF public.lims_current_role() IS DISTINCT FROM 'lab_admin' THEN
    RAISE EXCEPTION 'Chỉ tài khoản quản trị phòng xét nghiệm được nộp báo cáo bệnh truyền nhiễm.' USING ERRCODE = '42501';
  END IF;
  v_lab := public.lims_current_lab_id();
  IF v_lab IS NULL THEN RAISE EXCEPTION 'Tài khoản chưa gắn với phòng xét nghiệm.' USING ERRCODE = '42501'; END IF;

  IF p_week IS NULL OR extract(isodow FROM p_week) <> 1 THEN RAISE EXCEPTION 'Tuần báo cáo phải bắt đầu từ thứ Hai.'; END IF;
  IF p_week > public.lims_disease_week_now() THEN RAISE EXCEPTION 'Không thể báo cáo cho tuần chưa bắt đầu.'; END IF;
  IF p_week < public.lims_disease_week_now() - 730 THEN RAISE EXCEPTION 'Chỉ nhận báo cáo trong vòng 2 năm gần đây.'; END IF;

  p_lines := coalesce(p_lines, '[]'::jsonb);
  IF jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'Dữ liệu báo cáo không hợp lệ.'; END IF;
  IF jsonb_array_length(p_lines) > 500 THEN RAISE EXCEPTION 'Mỗi báo cáo tuần tối đa 500 dòng.'; END IF;

  SELECT id INTO v_report FROM public.lims_disease_reports WHERE lab_id = v_lab AND week_start = p_week FOR UPDATE;
  v_exists := v_report IS NOT NULL;
  IF v_exists THEN
    SELECT count(*), coalesce(sum(tests_done), 0), coalesce(sum(positives), 0) INTO o_lines, o_tests, o_pos
      FROM public.lims_disease_report_lines WHERE report_id = v_report;
    UPDATE public.lims_disease_reports SET submitted_by = auth.uid(), updated_at = now() WHERE id = v_report;
    DELETE FROM public.lims_disease_report_lines WHERE report_id = v_report;
  ELSE
    INSERT INTO public.lims_disease_reports (lab_id, week_start, submitted_by) VALUES (v_lab, p_week, auth.uid()) RETURNING id INTO v_report;
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    n := n + 1;
    IF jsonb_typeof(r) <> 'object' THEN RAISE EXCEPTION 'Dòng %: dữ liệu không hợp lệ.', n; END IF;
    IF coalesce(r->>'pathogen_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Dòng %: chưa chọn bệnh.', n;
    END IF;
    v_path := (r->>'pathogen_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.pathogens WHERE id = v_path) THEN RAISE EXCEPTION 'Dòng %: bệnh không có trong danh mục.', n; END IF;
    v_ward := nullif(btrim(coalesce(r->>'ma_xa', '')), '');
    IF v_ward IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ward_codes WHERE ma_xa = v_ward) THEN
      RAISE EXCEPTION 'Dòng %: phường/xã không có trong danh mục.', n;
    END IF;
    IF coalesce(r->>'tests_done', '') !~ '^\d{1,7}$' THEN RAISE EXCEPTION 'Dòng %: số xét nghiệm phải là số nguyên không âm.', n; END IF;
    IF coalesce(r->>'positives', '') !~ '^\d{1,7}$' THEN RAISE EXCEPTION 'Dòng %: số dương tính phải là số nguyên không âm.', n; END IF;
    v_tests := (r->>'tests_done')::integer;
    v_pos := (r->>'positives')::integer;
    IF v_tests > 1000000 OR v_pos > 1000000 THEN RAISE EXCEPTION 'Dòng %: số liệu quá lớn (tối đa 1.000.000).', n; END IF;
    IF v_pos > v_tests THEN RAISE EXCEPTION 'Dòng %: số dương tính không được lớn hơn số xét nghiệm.', n; END IF;
    BEGIN
      INSERT INTO public.lims_disease_report_lines (report_id, lab_id, week_start, pathogen_id, ma_xa, tests_done, positives)
      VALUES (v_report, v_lab, p_week, v_path, v_ward, v_tests, v_pos);
    EXCEPTION WHEN unique_violation THEN
      RAISE EXCEPTION 'Dòng %: trùng bệnh và phường/xã với một dòng khác — hãy gộp số liệu vào một dòng.', n;
    END;
    n_tests := n_tests + v_tests;
    n_pos := n_pos + v_pos;
  END LOOP;

  SELECT coalesce(nullif(btrim(full_name), ''), email) INTO v_label FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.lims_disease_report_log (lab_id, week_start, actor, actor_label, action, old_lines, old_tests, old_pos, new_lines, new_tests, new_pos)
  VALUES (v_lab, p_week, auth.uid(), v_label, CASE WHEN v_exists THEN 'update' ELSE 'submit' END,
          CASE WHEN v_exists THEN o_lines END, CASE WHEN v_exists THEN o_tests END, CASE WHEN v_exists THEN o_pos END, n, n_tests, n_pos);

  RETURN jsonb_build_object('report_id', v_report, 'created', NOT v_exists, 'lines', n, 'tests', n_tests, 'positives', n_pos);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_save_lab_profile(p_lab_id uuid, p_patch jsonb DEFAULT '{}'::jsonb, p_custom jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role     text := public.lims_current_role();
  -- Cột PXN được tự cập nhật (hồ sơ + tự đánh giá).
  c_lab_cols constant text[] := ARRAY[
    'address', 'phone', 'head_name', 'head_phone', 'head_email', 'survey_email',
    'bsl_level', 'total_biosafety_staff', 'dedicated_staff', 'does_microbiology',
    'qsm_level', 'qsm_label', 'iso15189_scope',
    'external_qa', 'external_qa_detail', 'interlab', 'interlab_detail',
    'reports_positive', 'report_method', 'periodic_report', 'periodic_report_detail',
    'capacity_needs'
  ];
  -- hcdc_admin được sửa thêm thông tin định danh/vị trí.
  c_admin_cols constant text[] := ARRAY['name', 'level', 'lat', 'lng'];
  c_bool_cols  constant text[] := ARRAY['does_microbiology', 'external_qa', 'interlab', 'reports_positive', 'periodic_report'];
  v_allowed  text[];
  v_before   jsonb;
  v_after    jsonb;
  v_clean    jsonb := '{}'::jsonb;
  v_key      text;
  v_val      jsonb;
  v_txt      text;
  v_set      text;
  v_rec      public.laboratories;
  v_total    numeric;
  v_ded      numeric;
  v_def      public.lims_custom_fields;
  v_changed  text[] := ARRAY[]::text[];
  v_cust_chg text[] := ARRAY[]::text[];
  v_cur      jsonb;
  v_elem     jsonb;
  v_maxlen   integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập' USING ERRCODE = '42501';
  END IF;

  IF v_role = 'lab_admin' THEN
    IF p_lab_id IS NULL OR p_lab_id IS DISTINCT FROM public.lims_current_lab_id() THEN
      RAISE EXCEPTION 'Bạn không có quyền sửa hồ sơ của phòng xét nghiệm khác' USING ERRCODE = '42501';
    END IF;
    v_allowed := c_lab_cols;
  ELSIF v_role = 'hcdc_admin' THEN
    v_allowed := c_lab_cols || c_admin_cols;
  ELSE
    RAISE EXCEPTION 'Tài khoản không có quyền cập nhật hồ sơ phòng xét nghiệm' USING ERRCODE = '42501';
  END IF;

  -- Khoá dòng để hai người cùng sửa không ghi đè nhau giữa chừng.
  PERFORM 1 FROM public.laboratories WHERE id = p_lab_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phòng xét nghiệm';
  END IF;

  IF p_patch IS NULL THEN p_patch := '{}'::jsonb; END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu hồ sơ không hợp lệ';
  END IF;
  IF p_custom IS NOT NULL AND jsonb_typeof(p_custom) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu trường bổ sung không hợp lệ';
  END IF;

  SELECT to_jsonb(l) - 'location' INTO v_before FROM public.laboratories l WHERE l.id = p_lab_id;

  -- ---- Chuẩn hoá + kiểm tra danh sách cột cho phép ----
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_patch) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Trường "%" không được phép chỉnh sửa', v_key USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(v_val) = 'string' THEN
      v_txt := btrim(v_val #>> '{}');
      IF char_length(v_txt) > 2000 THEN
        RAISE EXCEPTION 'Trường "%" quá dài (tối đa 2000 ký tự)', v_key;
      END IF;
      v_val := CASE WHEN v_txt = '' THEN 'null'::jsonb ELSE to_jsonb(v_txt) END;
    END IF;
    v_clean := v_clean || jsonb_build_object(v_key, v_val);
  END LOOP;

  -- ---- Kiểm tra giá trị ----
  IF v_clean ? 'qsm_level' THEN
    v_val := v_clean -> 'qsm_level';
    IF jsonb_typeof(v_val) <> 'number' OR (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric)
       OR (v_val #>> '{}')::numeric NOT BETWEEN 0 AND 5 THEN
      RAISE EXCEPTION 'Mức hệ thống quản lý chất lượng (QSM) phải là số nguyên từ 0 đến 5';
    END IF;
  END IF;
  IF v_clean ? 'bsl_level' THEN
    v_val := v_clean -> 'bsl_level';
    IF jsonb_typeof(v_val) <> 'number' OR (v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric)
       OR (v_val #>> '{}')::numeric NOT BETWEEN 1 AND 4 THEN
      RAISE EXCEPTION 'Cấp an toàn sinh học (BSL) phải là số nguyên từ 1 đến 4';
    END IF;
  END IF;
  FOREACH v_key IN ARRAY ARRAY['total_biosafety_staff', 'dedicated_staff'] LOOP
    IF v_clean ? v_key THEN
      v_val := v_clean -> v_key;
      IF jsonb_typeof(v_val) NOT IN ('number', 'null') THEN
        RAISE EXCEPTION 'Số nhân sự phải là số';
      END IF;
      IF jsonb_typeof(v_val) = 'number' AND ((v_val #>> '{}')::numeric <> trunc((v_val #>> '{}')::numeric)
         OR (v_val #>> '{}')::numeric NOT BETWEEN 0 AND 100000) THEN
        RAISE EXCEPTION 'Số nhân sự phải là số nguyên không âm';
      END IF;
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY c_bool_cols LOOP
    IF v_clean ? v_key AND jsonb_typeof(v_clean -> v_key) <> 'boolean' THEN
      RAISE EXCEPTION 'Trường "%" chỉ nhận Có/Không', v_key;
    END IF;
  END LOOP;
  FOREACH v_key IN ARRAY ARRAY['head_email', 'survey_email'] LOOP
    IF v_clean ? v_key AND jsonb_typeof(v_clean -> v_key) = 'string'
       AND (v_clean ->> v_key) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'Email "%" không hợp lệ', v_clean ->> v_key;
    END IF;
  END LOOP;
  IF v_clean ? 'name' AND jsonb_typeof(v_clean -> 'name') <> 'string' THEN
    RAISE EXCEPTION 'Tên phòng xét nghiệm không được để trống';
  END IF;
  IF v_clean ? 'lat' AND jsonb_typeof(v_clean -> 'lat') = 'number' AND (v_clean ->> 'lat')::numeric NOT BETWEEN -90 AND 90 THEN
    RAISE EXCEPTION 'Vĩ độ phải nằm trong khoảng -90 đến 90';
  END IF;
  IF v_clean ? 'lng' AND jsonb_typeof(v_clean -> 'lng') = 'number' AND (v_clean ->> 'lng')::numeric NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Kinh độ phải nằm trong khoảng -180 đến 180';
  END IF;
  IF (v_clean ? 'lat' AND jsonb_typeof(v_clean -> 'lat') NOT IN ('number', 'null'))
     OR (v_clean ? 'lng' AND jsonb_typeof(v_clean -> 'lng') NOT IN ('number', 'null')) THEN
    RAISE EXCEPTION 'Toạ độ phải là số';
  END IF;

  -- Nhân sự chuyên trách không thể vượt tổng nhân sự (so sánh trên giá trị sau khi sửa).
  v_total := coalesce((v_clean ->> 'total_biosafety_staff')::numeric,
                      CASE WHEN v_clean ? 'total_biosafety_staff' THEN NULL ELSE (v_before ->> 'total_biosafety_staff')::numeric END);
  v_ded   := coalesce((v_clean ->> 'dedicated_staff')::numeric,
                      CASE WHEN v_clean ? 'dedicated_staff' THEN NULL ELSE (v_before ->> 'dedicated_staff')::numeric END);
  IF v_total IS NOT NULL AND v_ded IS NOT NULL AND v_ded > v_total THEN
    RAISE EXCEPTION 'Số nhân sự chuyên trách (%) không thể lớn hơn tổng số nhân sự (%)', v_ded, v_total;
  END IF;

  -- ---- Ghi vào laboratories ----
  IF v_clean <> '{}'::jsonb THEN
    v_rec := jsonb_populate_record(NULL::public.laboratories, v_clean);
    SELECT string_agg(format('%1$I = ($2).%1$I', k), ', ') INTO v_set FROM jsonb_object_keys(v_clean) AS k;
    EXECUTE format('UPDATE public.laboratories SET %s, updated_at = now() WHERE id = $1', v_set)
      USING p_lab_id, v_rec;
  END IF;

  -- ---- Trường bổ sung ----
  IF p_custom IS NOT NULL THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_custom) LOOP
      SELECT * INTO v_def FROM public.lims_custom_fields WHERE key = v_key AND is_active;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Trường bổ sung "%" không tồn tại hoặc đã bị tắt', v_key;
      END IF;

      IF jsonb_typeof(v_val) = 'string' THEN
        v_txt := btrim(v_val #>> '{}');
        v_val := CASE WHEN v_txt = '' THEN 'null'::jsonb ELSE to_jsonb(v_txt) END;
      END IF;
      IF jsonb_typeof(v_val) = 'array' AND jsonb_array_length(v_val) = 0 THEN v_val := 'null'::jsonb; END IF;

      IF jsonb_typeof(v_val) = 'null' THEN
        DELETE FROM public.lims_custom_field_values WHERE lab_id = p_lab_id AND field_id = v_def.id;
        v_cust_chg := v_cust_chg || v_key;
        CONTINUE;
      END IF;

      IF v_def.field_type IN ('text', 'longtext') THEN
        v_maxlen := 4000;
        IF v_def.field_type = 'text' THEN v_maxlen := 300; END IF;
        IF jsonb_typeof(v_val) <> 'string' OR char_length(v_val #>> '{}') > v_maxlen THEN
          RAISE EXCEPTION 'Trường "%": giá trị văn bản không hợp lệ hoặc quá dài', v_def.label;
        END IF;
      ELSIF v_def.field_type = 'number' THEN
        IF jsonb_typeof(v_val) <> 'number' THEN
          RAISE EXCEPTION 'Trường "%" phải là số', v_def.label;
        END IF;
      ELSIF v_def.field_type = 'bool' THEN
        IF jsonb_typeof(v_val) <> 'boolean' THEN
          RAISE EXCEPTION 'Trường "%" chỉ nhận Có/Không', v_def.label;
        END IF;
      ELSIF v_def.field_type = 'date' THEN
        IF jsonb_typeof(v_val) <> 'string' OR (v_val #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
          RAISE EXCEPTION 'Trường "%" phải là ngày dạng YYYY-MM-DD', v_def.label;
        END IF;
        BEGIN
          PERFORM (v_val #>> '{}')::date;
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'Trường "%": ngày "%" không có thật', v_def.label, v_val #>> '{}';
        END;
      ELSIF v_def.field_type = 'select' THEN
        IF jsonb_typeof(v_val) <> 'string' OR NOT (v_def.options @> jsonb_build_array(v_val)) THEN
          RAISE EXCEPTION 'Trường "%": giá trị không nằm trong danh sách lựa chọn', v_def.label;
        END IF;
      ELSIF v_def.field_type = 'multiselect' THEN
        IF jsonb_typeof(v_val) <> 'array' THEN
          RAISE EXCEPTION 'Trường "%" phải là danh sách lựa chọn', v_def.label;
        END IF;
        FOR v_elem IN SELECT * FROM jsonb_array_elements(v_val) LOOP
          IF jsonb_typeof(v_elem) <> 'string' OR NOT (v_def.options @> jsonb_build_array(v_elem)) THEN
            RAISE EXCEPTION 'Trường "%": có giá trị không nằm trong danh sách lựa chọn', v_def.label;
          END IF;
        END LOOP;
      END IF;

      SELECT value INTO v_cur FROM public.lims_custom_field_values WHERE lab_id = p_lab_id AND field_id = v_def.id;
      IF v_cur IS DISTINCT FROM v_val THEN
        INSERT INTO public.lims_custom_field_values (lab_id, field_id, value, updated_at, updated_by)
        VALUES (p_lab_id, v_def.id, v_val, now(), auth.uid())
        ON CONFLICT (lab_id, field_id) DO UPDATE
          SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
        v_cust_chg := v_cust_chg || v_key;
      END IF;
    END LOOP;
  END IF;

  SELECT to_jsonb(l) - 'location' INTO v_after FROM public.laboratories l WHERE l.id = p_lab_id;
  SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_changed
  FROM jsonb_object_keys(v_after) AS k
  WHERE k NOT IN ('updated_at') AND (v_before -> k) IS DISTINCT FROM (v_after -> k);

  RETURN jsonb_build_object(
    'ok', true,
    'changed', to_jsonb(v_changed),
    'custom_changed', to_jsonb(v_cust_chg),
    'capability_tier', v_after -> 'capability_tier'
  );
END $function$;

CREATE OR REPLACE FUNCTION public.lims_save_pathogen(p_id uuid, p_name text, p_category text, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_cat  text := btrim(coalesce(p_category, ''));
  v_old  public.pathogens;
  v_new  public.pathogens;
  v_action text;
BEGIN
  PERFORM public.lims_require_hcdc();
  IF char_length(v_name) < 2 OR char_length(v_name) > 150 THEN RAISE EXCEPTION 'Tên tác nhân phải từ 2 đến 150 ký tự'; END IF;
  IF char_length(v_cat) < 1 OR char_length(v_cat) > 80 THEN RAISE EXCEPTION 'Nhóm tác nhân không được để trống (tối đa 80 ký tự)'; END IF;
  IF EXISTS (SELECT 1 FROM public.pathogens x WHERE lower(btrim(x.name)) = lower(v_name) AND x.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Đã có tác nhân tên "%"', v_name;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.pathogens (name, category, is_active) VALUES (v_name, v_cat, coalesce(p_is_active, true)) RETURNING * INTO v_new;
    PERFORM public.lims_log_catalog('pathogens', v_new.id::text, v_new.name, 'create', NULL, to_jsonb(v_new));
    RETURN jsonb_build_object('ok', true, 'id', v_new.id);
  END IF;

  SELECT * INTO v_old FROM public.pathogens WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tác nhân'; END IF;
  UPDATE public.pathogens SET name = v_name, category = v_cat, is_active = coalesce(p_is_active, is_active) WHERE id = p_id RETURNING * INTO v_new;
  v_action := 'update';
  IF v_old.is_active IS DISTINCT FROM v_new.is_active THEN
    v_action := CASE WHEN v_new.is_active THEN 'activate' ELSE 'deactivate' END;
  END IF;
  IF to_jsonb(v_old) <> to_jsonb(v_new) THEN
    PERFORM public.lims_log_catalog('pathogens', p_id::text, v_new.name, v_action, to_jsonb(v_old), to_jsonb(v_new));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_save_test_type(p_id uuid, p_name text, p_category text, p_required_bsl integer, p_parent_name text, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Các kỹ thuật compute_capability_tier tra theo TÊN (đã chuẩn hoá dấu gạch); không được đổi tên.
  c_tier_names constant text[] := ARRAY[
    'Soi tươi', 'Nhuộm soi', 'Nuôi cấy - định danh vi khuẩn thông thường', 'Định danh vi khuẩn tự động',
    'Test nhanh', 'Miễn dịch bán tự động', 'Miễn dịch tự động'
  ];
  v_name   text := btrim(coalesce(p_name, ''));
  v_parent text := nullif(btrim(coalesce(p_parent_name, '')), '');
  v_old    public.test_types;
  v_new    public.test_types;
  v_action text;
BEGIN
  PERFORM public.lims_require_hcdc();

  IF char_length(v_name) < 2 OR char_length(v_name) > 150 THEN
    RAISE EXCEPTION 'Tên kỹ thuật phải từ 2 đến 150 ký tự';
  END IF;
  IF p_category NOT IN ('basic', 'culture', 'molecular', 'advanced') THEN
    RAISE EXCEPTION 'Nhóm kỹ thuật phải là một trong: basic, culture, molecular, advanced';
  END IF;
  IF p_required_bsl IS NULL OR p_required_bsl NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Cấp ATSH tối thiểu phải từ 1 đến 4';
  END IF;
  IF v_parent IS NOT NULL AND char_length(v_parent) > 150 THEN
    RAISE EXCEPTION 'Tên nhóm cha quá dài';
  END IF;
  IF EXISTS (SELECT 1 FROM public.test_types t WHERE lower(btrim(t.name)) = lower(v_name) AND t.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Đã có kỹ thuật tên "%"', v_name;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.test_types (name, category, required_bsl, parent_name, is_active)
    VALUES (v_name, p_category, p_required_bsl, v_parent, coalesce(p_is_active, true))
    RETURNING * INTO v_new;
    PERFORM public.lims_log_catalog('test_types', v_new.id::text, v_new.name, 'create', NULL, to_jsonb(v_new));
    RETURN jsonb_build_object('ok', true, 'id', v_new.id);
  END IF;

  SELECT * INTO v_old FROM public.test_types WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy kỹ thuật'; END IF;

  IF v_old.category IS DISTINCT FROM p_category THEN
    RAISE EXCEPTION 'Không được đổi nhóm kỹ thuật (nhóm quyết định cách tính bậc năng lực của PXN). Hãy tắt kỹ thuật này và tạo kỹ thuật mới.';
  END IF;
  IF replace(replace(v_old.name, '–', '-'), '—', '-') = ANY (c_tier_names) AND v_name IS DISTINCT FROM v_old.name THEN
    RAISE EXCEPTION 'Không được đổi tên kỹ thuật "%": hệ thống tính bậc năng lực tra theo tên này', v_old.name;
  END IF;

  UPDATE public.test_types
     SET name = v_name, required_bsl = p_required_bsl, parent_name = v_parent, is_active = coalesce(p_is_active, is_active)
   WHERE id = p_id
   RETURNING * INTO v_new;

  v_action := 'update';
  IF v_old.is_active IS DISTINCT FROM v_new.is_active THEN
    v_action := CASE WHEN v_new.is_active THEN 'activate' ELSE 'deactivate' END;
  END IF;
  IF to_jsonb(v_old) <> to_jsonb(v_new) THEN
    PERFORM public.lims_log_catalog('test_types', p_id::text, v_new.name, v_action, to_jsonb(v_old), to_jsonb(v_new));
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_set_lab_active(p_lab_id uuid, p_active boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old    boolean;
  v_name   text;
BEGIN
  PERFORM public.lims_require_hcdc();
  IF p_active IS NULL THEN RAISE EXCEPTION 'Thiếu trạng thái'; END IF;
  IF p_active = false AND v_reason IS NULL THEN RAISE EXCEPTION 'Vui lòng nhập lý do khi ngừng hoạt động phòng xét nghiệm'; END IF;
  IF char_length(coalesce(v_reason, '')) > 500 THEN RAISE EXCEPTION 'Lý do tối đa 500 ký tự'; END IF;

  SELECT is_active, name INTO v_old, v_name FROM public.laboratories WHERE id = p_lab_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phòng xét nghiệm'; END IF;
  IF v_old IS NOT DISTINCT FROM p_active THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;

  UPDATE public.laboratories SET is_active = p_active, updated_at = now() WHERE id = p_lab_id;
  PERFORM public.lims_log_catalog('laboratories', p_lab_id::text, v_name, CASE WHEN p_active THEN 'activate' ELSE 'deactivate' END,
    jsonb_build_object('is_active', v_old), jsonb_build_object('is_active', p_active, 'reason', v_reason));
  RETURN jsonb_build_object('ok', true, 'changed', true);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_set_operating_status(p_lab_id uuid, p_status text, p_reason text DEFAULT NULL::text, p_until date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role   text := public.lims_current_role();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old    public.lims_lab_operating_status;
  v_new    jsonb;
  v_prev   jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập' USING ERRCODE = '42501';
  END IF;
  IF v_role = 'lab_admin' THEN
    IF p_lab_id IS NULL OR p_lab_id IS DISTINCT FROM public.lims_current_lab_id() THEN
      RAISE EXCEPTION 'Bạn không có quyền đổi trạng thái của phòng xét nghiệm khác' USING ERRCODE = '42501';
    END IF;
  ELSIF v_role IS DISTINCT FROM 'hcdc_admin' THEN
    RAISE EXCEPTION 'Tài khoản không có quyền đổi trạng thái vận hành' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('hoat_dong', 'han_che', 'tam_ngung') THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ';
  END IF;
  IF p_status <> 'hoat_dong' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Vui lòng nhập lý do khi chuyển sang trạng thái hạn chế hoặc tạm ngưng';
  END IF;
  IF char_length(coalesce(v_reason, '')) > 500 THEN
    RAISE EXCEPTION 'Lý do tối đa 500 ký tự';
  END IF;
  IF p_until IS NOT NULL AND p_until < public.lims_today() THEN
    RAISE EXCEPTION 'Ngày kết thúc không được ở quá khứ';
  END IF;
  PERFORM 1 FROM public.laboratories WHERE id = p_lab_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy phòng xét nghiệm'; END IF;

  SELECT * INTO v_old FROM public.lims_lab_operating_status WHERE lab_id = p_lab_id;
  v_prev := CASE WHEN v_old.lab_id IS NULL
                 THEN jsonb_build_object('status', 'hoat_dong')
                 ELSE jsonb_build_object('status', v_old.status, 'reason', v_old.reason, 'until', v_old.effective_until) END;

  IF p_status = 'hoat_dong' THEN v_reason := NULL; p_until := NULL; END IF;

  INSERT INTO public.lims_lab_operating_status (lab_id, status, reason, effective_until, updated_at, updated_by)
  VALUES (p_lab_id, p_status, v_reason, p_until, now(), auth.uid())
  ON CONFLICT (lab_id) DO UPDATE
    SET status = EXCLUDED.status, reason = EXCLUDED.reason, effective_until = EXCLUDED.effective_until,
        updated_at = now(), updated_by = auth.uid();

  v_new := jsonb_build_object('status', p_status, 'reason', v_reason, 'until', p_until);
  IF v_new IS DISTINCT FROM v_prev THEN
    PERFORM public.lims_log_change(p_lab_id, 'status', 'operating_status', v_prev, v_new);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', p_status, 'reason', v_reason, 'until', p_until);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_staff_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.lab_id IS DISTINCT FROM OLD.lab_id THEN
    RAISE EXCEPTION 'Không được chuyển nhân sự sang phòng xét nghiệm khác';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_stocktake_close(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab     uuid := public.lims_require_lab_admin();
  v_total   integer;
  v_done    integer;
  v_changed integer;
BEGIN
  PERFORM 1 FROM public.lims_stocktakes WHERE id = p_id AND lab_id = v_lab AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Đợt kiểm kê không tồn tại hoặc đã kết thúc.'; END IF;
  SELECT (SELECT count(*) FROM public.lab_equipments WHERE lab_id = v_lab)
       + (SELECT count(*) FROM public.lab_inventory  WHERE lab_id = v_lab) INTO v_total;
  SELECT count(*),
         count(*) FILTER (WHERE (kind = 'inventory' AND qty_after IS DISTINCT FROM qty_before)
                             OR (kind = 'equipment' AND (status_after IS DISTINCT FROM status_before OR due_after IS DISTINCT FROM due_before)))
    INTO v_done, v_changed
    FROM public.lims_stocktake_lines WHERE stocktake_id = p_id;
  UPDATE public.lims_stocktakes
     SET status = 'closed', closed_at = now(), items_total = v_total, items_counted = v_done, items_changed = v_changed
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'counted', v_done, 'changed', v_changed, 'total', v_total);
END $function$;

CREATE OR REPLACE FUNCTION public.lims_stocktake_start(p_name text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab  uuid := public.lims_require_lab_admin();
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
BEGIN
  IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN RAISE EXCEPTION 'Tên đợt kiểm kê từ 1 đến 120 ký tự.'; END IF;
  IF EXISTS (SELECT 1 FROM public.lims_stocktakes WHERE lab_id = v_lab AND status = 'open') THEN
    RAISE EXCEPTION 'PXN đang có một đợt kiểm kê chưa kết thúc. Hãy kết thúc đợt đó trước.';
  END IF;
  INSERT INTO public.lims_stocktakes (lab_id, name, note, created_by)
  VALUES (v_lab, v_name, nullif(btrim(coalesce(p_note, '')), ''), auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_today()
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$ SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date $function$;

CREATE OR REPLACE FUNCTION public.lims_trg_log_capability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab  uuid := coalesce(NEW.lab_id, OLD.lab_id);
  v_test uuid := coalesce(NEW.test_type_id, OLD.test_type_id);
  v_name text;
BEGIN
  BEGIN
    SELECT name INTO v_name FROM public.test_types WHERE id = v_test;
    v_name := coalesce(v_name, v_test::text);
    IF TG_OP = 'INSERT' THEN
      PERFORM public.lims_log_change(v_lab, 'capability', v_name, NULL, to_jsonb(NEW.max_capacity_per_day));
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.lims_log_change(v_lab, 'capability', v_name, to_jsonb(OLD.max_capacity_per_day), NULL);
    ELSIF NEW.max_capacity_per_day IS DISTINCT FROM OLD.max_capacity_per_day THEN
      PERFORM public.lims_log_change(v_lab, 'capability', v_name,
        to_jsonb(OLD.max_capacity_per_day), to_jsonb(NEW.max_capacity_per_day));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lims_trg_log_capability bỏ qua do lỗi: %', SQLERRM;
  END;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_trg_log_catalog_table()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_action text;
BEGIN
  BEGIN
    v_new := to_jsonb(NEW);
    IF TG_OP = 'INSERT' THEN
      v_action := 'create';
      v_old := NULL;
    ELSE
      v_old := to_jsonb(OLD);
      IF v_old = v_new THEN RETURN NULL; END IF;
      v_action := 'update';
      IF (v_old ->> 'is_active') IS DISTINCT FROM (v_new ->> 'is_active') THEN
        v_action := CASE WHEN (v_new ->> 'is_active') = 'true' THEN 'activate' ELSE 'deactivate' END;
      END IF;
    END IF;
    PERFORM public.lims_log_catalog(TG_TABLE_NAME, v_new ->> 'id', coalesce(v_new ->> 'name', v_new ->> 'code'), v_action, v_old, v_new);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lims_trg_log_catalog_table bỏ qua do lỗi: %', SQLERRM;
  END;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_trg_log_custom_value()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab   uuid := coalesce(NEW.lab_id, OLD.lab_id);
  v_field uuid := coalesce(NEW.field_id, OLD.field_id);
  v_key   text;
BEGIN
  BEGIN
    SELECT key INTO v_key FROM public.lims_custom_fields WHERE id = v_field;
    v_key := coalesce(v_key, v_field::text);
    IF TG_OP = 'INSERT' THEN
      PERFORM public.lims_log_change(v_lab, 'custom_field', v_key, NULL, NEW.value);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.lims_log_change(v_lab, 'custom_field', v_key, OLD.value, NULL);
    ELSIF NEW.value IS DISTINCT FROM OLD.value THEN
      PERFORM public.lims_log_change(v_lab, 'custom_field', v_key, OLD.value, NEW.value);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lims_trg_log_custom_value bỏ qua do lỗi: %', SQLERRM;
  END;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_trg_log_lab()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k text;
  o jsonb;
  n jsonb;
BEGIN
  BEGIN
    o := to_jsonb(OLD);
    n := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF k IN ('location', 'updated_at', 'telegram_chat_id') THEN CONTINUE; END IF;
      IF (o -> k) IS DISTINCT FROM (n -> k) THEN
        PERFORM public.lims_log_change(NEW.id, 'profile', k, o -> k, n -> k);
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lims_trg_log_lab bỏ qua do lỗi: %', SQLERRM;
  END;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_trg_log_lab_standard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab  uuid := coalesce(NEW.lab_id, OLD.lab_id);
  v_code text;
  v_old  jsonb;
  v_new  jsonb;
BEGIN
  BEGIN
    SELECT code INTO v_code FROM public.lims_standards WHERE id = coalesce(NEW.standard_id, OLD.standard_id);
    IF TG_OP <> 'INSERT' THEN v_old := jsonb_build_object('status', OLD.status, 'no', OLD.cert_no, 'expires_on', OLD.expires_on); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := jsonb_build_object('status', NEW.status, 'no', NEW.cert_no, 'expires_on', NEW.expires_on); END IF;
    IF TG_OP = 'UPDATE' AND v_old = v_new THEN RETURN NULL; END IF;
    PERFORM public.lims_log_change(v_lab, 'standard', 'Tiêu chuẩn: ' || coalesce(v_code, '?'), v_old, v_new);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lims_trg_log_lab_standard bỏ qua do lỗi: %', SQLERRM;
  END;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.lims_trg_log_staff()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab  uuid := coalesce(NEW.lab_id, OLD.lab_id);
  v_name text;
  v_old  jsonb;
  v_new  jsonb;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'lims_lab_staff' THEN
      IF TG_OP <> 'INSERT' THEN v_old := jsonb_build_object('degree', OLD.degree, 'job_title', OLD.job_title, 'active', OLD.is_active); END IF;
      IF TG_OP <> 'DELETE' THEN v_new := jsonb_build_object('degree', NEW.degree, 'job_title', NEW.job_title, 'active', NEW.is_active); END IF;
      IF TG_OP = 'UPDATE' AND v_old = v_new THEN RETURN NULL; END IF;
      PERFORM public.lims_log_change(v_lab, 'staff', 'Nhân sự: ' || coalesce(NEW.full_name, OLD.full_name), v_old, v_new);
    ELSE
      SELECT full_name INTO v_name FROM public.lims_lab_staff WHERE id = coalesce(NEW.staff_id, OLD.staff_id);
      IF TG_OP <> 'INSERT' THEN v_old := jsonb_build_object('no', OLD.cert_no, 'expires_on', OLD.expires_on); END IF;
      IF TG_OP <> 'DELETE' THEN v_new := jsonb_build_object('no', NEW.cert_no, 'expires_on', NEW.expires_on); END IF;
      IF TG_OP = 'UPDATE' AND v_old = v_new THEN RETURN NULL; END IF;
      PERFORM public.lims_log_change(v_lab, 'staff',
        'Chứng chỉ ' || coalesce(NEW.cert_type, OLD.cert_type) || ' — ' || coalesce(v_name, '(đã xoá)'), v_old, v_new);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lims_trg_log_staff bỏ qua do lỗi: %', SQLERRM;
  END;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.row_in_my_ward(target_ma_xa text, target_fax text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    target_ma_xa IS NOT NULL
    AND target_ma_xa = public.current_user_workplace_ma_xa()
    AND lower(btrim(coalesce(target_fax, ''))) IN (
      'trạm y tế phường/xã/ đặc khu',
      'ubnd phường/xã/ đặc khu'
    )
$function$;

CREATE OR REPLACE FUNCTION public.sync_lab_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_workplace_ma_xa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Nếu có workplace_ward → tra ward_codes lấy mã tương ứng
  IF NEW.workplace_ward IS NOT NULL AND trim(NEW.workplace_ward) <> '' THEN
    SELECT wc.ma_xa INTO NEW.workplace_ma_xa
    FROM public.ward_codes wc
    WHERE wc.ten_xa = trim(NEW.workplace_ward);
    -- Nếu không tìm thấy tên trong ward_codes → để null (không chặn lưu)
  ELSE
    NEW.workplace_ma_xa := NULL;  -- xóa workplace_ward thì xóa luôn mã
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recompute_tier_on_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lab uuid;
BEGIN
  v_lab := COALESCE(NEW.lab_id, OLD.lab_id);
  UPDATE public.laboratories
  SET capability_tier = public.compute_capability_tier(v_lab)
  WHERE id = v_lab;
  RETURN COALESCE(NEW, OLD);
END $function$;

CREATE OR REPLACE FUNCTION public.trg_recompute_tier_on_qsm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.laboratories
  SET capability_tier = public.compute_capability_tier(NEW.id)
  WHERE id = NEW.id;
  RETURN NEW;
END $function$;

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
  v_confirmations int;
  v_members text[];
  v_declined text[];
begin
  if p_action not in ('confirm', 'decline') then
    raise exception 'invalid action: %', p_action;
  end if;

  if v_email = '' or v_email is null then
    raise exception 'email is required';
  end if;

  -- Khoá dòng incident trong lúc tính toán để 2 request đồng thời không đè lên nhau
  select i.members, i.declined_members, coalesce(i.confirmations, 0)
    into v_members_raw, v_declined_raw, v_confirmations
  from public.incidents i
  where i.id = p_incident_id
  for update;

  if not found then
    raise exception 'incident % not found', p_incident_id;
  end if;

  -- Tách chuỗi ";" thành mảng, chuẩn hoá lower/trim từng phần tử (giữ đúng
  -- hành vi cũ vốn chuẩn hoá lại toàn bộ mảng mỗi lần đọc), bỏ phần tử rỗng.
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

CREATE TABLE IF NOT EXISTS "public"."deployment_history" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "incident_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "action_type" text,
    "reason" text,
    "replaced_by" uuid,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    "profile_id" uuid,
    "confirmed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "public"."helpers" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "category" text NOT NULL,
    "name" text NOT NULL,
    "parent_name" text
);

CREATE TABLE IF NOT EXISTS "public"."helpers_backup_pre_fix" (
    "id" uuid,
    "category" text,
    "name" text,
    "parent_name" text
);

CREATE TABLE IF NOT EXISTS "public"."incident_activities" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "incident_id" uuid NOT NULL,
    "content" text NOT NULL,
    "task_group" text,
    "assignee_id" text,
    "status" text DEFAULT 'pending'::text,
    "deadline" text,
    "expected_output" text,
    "completed_by" uuid,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    "objective_id" text
);

CREATE TABLE IF NOT EXISTS "public"."incident_assessments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "incident_id" uuid NOT NULL,
    "author_id" uuid,
    "causes" text,
    "clinical_char" text,
    "context" text,
    "objectives" text,
    "forecast" text,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "public"."incident_logistics" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "incident_id" uuid,
    "name" text,
    "qty" numeric,
    "unit" text,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."incident_logs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "incident_id" uuid NOT NULL,
    "user_id" uuid,
    "log_type" text,
    "content" text NOT NULL,
    "attachment_url" text,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "public"."incident_objectives" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "objective_text" text NOT NULL,
    "status" text DEFAULT 'Pending'::text,
    "deadline" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    "incident_id" uuid
);

CREATE TABLE IF NOT EXISTS "public"."incident_plans" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "incident_id" uuid,
    "author" text,
    "timestamp" timestamp with time zone DEFAULT now(),
    "causes" text,
    "clinical_char" text,
    "context" text,
    "activities_by_objective" text,
    "assessment" jsonb,
    "level" text,
    "meta" jsonb DEFAULT '{}'::jsonb,
    "summary" text,
    "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."incident_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "incident_id" uuid,
    "report_type" text,
    "level" text,
    "event_name" text,
    "cases_new" integer DEFAULT 0,
    "suspected_new" integer DEFAULT 0,
    "deaths_new" integer DEFAULT 0,
    "cases_total" integer DEFAULT 0,
    "suspected_total" integer DEFAULT 0,
    "deaths_total" integer DEFAULT 0,
    "overview" text,
    "activities" text,
    "issues" text,
    "next_steps" text,
    "hr_changes" text,
    "lessons" text,
    "detected_incidents" text,
    "reporter" text,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."incidents" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "event_name" text NOT NULL,
    "status" text DEFAULT 'active'::text,
    "location_text" text,
    "ma_xa" text,
    "latitude" double precision,
    "longitude" double precision,
    "admin_activate" uuid,
    "activation_time" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    "aar_data" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    "initial_selected_members" text,
    "members" text,
    "declined_members" text,
    "confirmations" integer DEFAULT 0,
    "activation_key" uuid
);

CREATE TABLE IF NOT EXISTS "public"."inventory_transactions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "inventory_id" uuid NOT NULL,
    "lab_id" uuid NOT NULL,
    "transaction_type" text NOT NULL,
    "amount" numeric NOT NULL,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lab_capabilities" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lab_id" uuid NOT NULL,
    "test_type_id" uuid NOT NULL,
    "max_capacity_per_day" integer DEFAULT 200 NOT NULL,
    "turnaround_hours" integer DEFAULT 24,
    "created_at" timestamp with time zone DEFAULT now(),
    "equipment_detail" text
);

CREATE TABLE IF NOT EXISTS "public"."lab_dispatch_log" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lab_id" uuid NOT NULL,
    "incident_id" uuid,
    "test_type_id" uuid,
    "sample_count" integer DEFAULT 0 NOT NULL,
    "dispatch_date" date DEFAULT CURRENT_DATE NOT NULL,
    "status" text DEFAULT 'dispatched'::text,
    "dispatched_by" uuid,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now(),
    "requested_sample_count" integer DEFAULT 0 NOT NULL,
    "accepted_sample_count" integer,
    "pathogens" jsonb,
    "accepted_pathogens" jsonb,
    "accepted_test_types" jsonb,
    "action_token" text,
    "token_expires_at" timestamp with time zone,
    "requested_test_types" text[] DEFAULT '{}'::text[]
);

CREATE TABLE IF NOT EXISTS "public"."lab_equipments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lab_id" uuid NOT NULL,
    "name" text NOT NULL,
    "status" text DEFAULT 'hoat_dong'::text NOT NULL,
    "calibration_due_date" date,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "catalog_id" uuid,
    "code" text NOT NULL,
    "barcode" text
);

CREATE TABLE IF NOT EXISTS "public"."lab_inventory" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lab_id" uuid NOT NULL,
    "item_name" text NOT NULL,
    "lot_number" text,
    "quantity" numeric DEFAULT 0 NOT NULL,
    "unit" text,
    "expiration_date" date,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "catalog_id" uuid,
    "code" text NOT NULL,
    "barcode" text
);

CREATE TABLE IF NOT EXISTS "public"."laboratories" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "address" text,
    "phone" text,
    "lat" double precision,
    "lng" double precision,
    "location" geography(Point,4326),
    "level" text DEFAULT 'xa_phuong'::text,
    "bsl_level" integer DEFAULT 2,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "head_name" text,
    "head_phone" text,
    "head_email" text,
    "total_biosafety_staff" integer,
    "dedicated_staff" integer,
    "does_microbiology" boolean DEFAULT false,
    "qsm_level" integer DEFAULT 0,
    "qsm_label" text,
    "iso15189_scope" text,
    "network_tier" integer,
    "external_qa" boolean DEFAULT false,
    "external_qa_detail" text,
    "interlab" boolean DEFAULT false,
    "interlab_detail" text,
    "reports_positive" boolean DEFAULT false,
    "report_method" text,
    "periodic_report" boolean DEFAULT false,
    "periodic_report_detail" text,
    "capacity_needs" text,
    "survey_email" text,
    "capability_tier" integer,
    "telegram_chat_id" text
);

CREATE TABLE IF NOT EXISTS "public"."library_docs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "category" text,
    "doc_type" text,
    "file_url" text NOT NULL,
    "version" text DEFAULT '1.0'::text,
    "description" text,
    "updated_by" uuid,
    "last_updated" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "public"."lims_alert_log" (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
    "week_end" date NOT NULL,
    "weeks" smallint NOT NULL,
    "ma_xa" text NOT NULL,
    "ward_name" text,
    "pathogen_id" uuid NOT NULL,
    "pathogen_name" text,
    "current_cases" integer NOT NULL,
    "previous_cases" integer NOT NULL,
    "recipients" integer NOT NULL,
    "trigger" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_alert_settings" (
    "id" smallint DEFAULT 1 NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "recipients" text[] DEFAULT '{}'::text[] NOT NULL,
    "include_admins" boolean DEFAULT true NOT NULL,
    "weeks" smallint DEFAULT 2 NOT NULL,
    "min_positives" integer DEFAULT 3 NOT NULL,
    "ratio" numeric(4,1) DEFAULT 2.0 NOT NULL,
    "updated_by" uuid,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_api_keys" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "key_hash" text NOT NULL,
    "key_prefix" text NOT NULL,
    "scopes" text[] NOT NULL,
    "rate_limit_per_min" integer DEFAULT 60 NOT NULL,
    "note" text,
    "created_by" uuid DEFAULT auth.uid(),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "use_count" bigint DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_catalog_log" (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "at" timestamp with time zone DEFAULT now() NOT NULL,
    "actor" uuid,
    "actor_label" text,
    "catalog" text NOT NULL,
    "item_id" text,
    "item_label" text,
    "action" text NOT NULL,
    "old_value" jsonb,
    "new_value" jsonb
);

CREATE TABLE IF NOT EXISTS "public"."lims_certificate_types" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_custom_field_values" (
    "lab_id" uuid NOT NULL,
    "field_id" uuid NOT NULL,
    "value" jsonb NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_by" uuid
);

CREATE TABLE IF NOT EXISTS "public"."lims_custom_fields" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "key" text NOT NULL,
    "label" text NOT NULL,
    "help" text,
    "section" text DEFAULT 'Thông tin bổ sung'::text NOT NULL,
    "field_type" text NOT NULL,
    "options" jsonb,
    "unit" text,
    "required" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_by" uuid DEFAULT auth.uid(),
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_disease_report_lines" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_id" uuid NOT NULL,
    "lab_id" uuid NOT NULL,
    "week_start" date NOT NULL,
    "pathogen_id" uuid NOT NULL,
    "ma_xa" text,
    "tests_done" integer NOT NULL,
    "positives" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_disease_report_log" (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "at" timestamp with time zone DEFAULT now() NOT NULL,
    "lab_id" uuid NOT NULL,
    "week_start" date NOT NULL,
    "actor" uuid,
    "actor_label" text,
    "action" text NOT NULL,
    "old_lines" integer,
    "old_tests" integer,
    "old_pos" integer,
    "new_lines" integer,
    "new_tests" integer,
    "new_pos" integer
);

CREATE TABLE IF NOT EXISTS "public"."lims_disease_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lab_id" uuid NOT NULL,
    "week_start" date NOT NULL,
    "submitted_by" uuid,
    "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_equipment_catalog" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "category" text,
    "manufacturer" text,
    "model" text,
    "note" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_import_log" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lab_id" uuid NOT NULL,
    "kind" text NOT NULL,
    "file_name" text,
    "rows_total" integer NOT NULL,
    "inserted" integer NOT NULL,
    "skipped" integer NOT NULL,
    "errors" integer NOT NULL,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_lab_daily_load" (
    "lab_id" uuid NOT NULL,
    "load_date" date NOT NULL,
    "test_type_id" uuid NOT NULL,
    "samples" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_by" uuid
);

CREATE TABLE IF NOT EXISTS "public"."lims_lab_history" (
    "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    "lab_id" uuid NOT NULL,
    "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "changed_by" uuid,
    "actor_label" text,
    "actor_role" text,
    "entity" text NOT NULL,
    "field" text NOT NULL,
    "old_value" jsonb,
    "new_value" jsonb
);

CREATE TABLE IF NOT EXISTS "public"."lims_lab_operating_status" (
    "lab_id" uuid NOT NULL,
    "status" text DEFAULT 'hoat_dong'::text NOT NULL,
    "reason" text,
    "effective_until" date,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_by" uuid
);

CREATE TABLE IF NOT EXISTS "public"."lims_lab_staff" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lab_id" uuid NOT NULL,
    "full_name" text NOT NULL,
    "job_title" text,
    "degree" text,
    "specialty" text,
    "employment" text DEFAULT 'bien_che'::text NOT NULL,
    "biosafety_role" boolean DEFAULT false NOT NULL,
    "note" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_lab_standards" (
    "lab_id" uuid NOT NULL,
    "standard_id" uuid NOT NULL,
    "status" text DEFAULT 'dat'::text NOT NULL,
    "cert_no" text,
    "issuer" text,
    "issued_on" date,
    "expires_on" date,
    "note" text,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_by" uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS "public"."lims_reagent_catalog" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "category" text,
    "manufacturer" text,
    "unit" text,
    "note" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_report_presets" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" uuid DEFAULT auth.uid() NOT NULL,
    "name" text NOT NULL,
    "report_type" text NOT NULL,
    "config" jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_staff_certificates" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "staff_id" uuid NOT NULL,
    "lab_id" uuid NOT NULL,
    "cert_type" text NOT NULL,
    "cert_no" text,
    "issuer" text,
    "issued_on" date,
    "expires_on" date,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_standards" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "kind" text DEFAULT 'quality'::text NOT NULL,
    "description" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_stocktake_lines" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "stocktake_id" uuid NOT NULL,
    "lab_id" uuid NOT NULL,
    "kind" text NOT NULL,
    "equipment_id" uuid,
    "inventory_id" uuid,
    "item_label" text NOT NULL,
    "code" text,
    "lot_label" text,
    "qty_before" numeric,
    "qty_after" numeric,
    "status_before" text,
    "status_after" text,
    "due_before" date,
    "due_after" date,
    "note" text,
    "counted_by" uuid,
    "counted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."lims_stocktakes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lab_id" uuid NOT NULL,
    "name" text NOT NULL,
    "note" text,
    "status" text DEFAULT 'open'::text NOT NULL,
    "items_total" integer,
    "items_counted" integer,
    "items_changed" integer,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "closed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "public"."logistics_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "item_name" text NOT NULL,
    "category" text,
    "unit" text,
    "quantity" integer DEFAULT 0,
    "min_threshold" integer DEFAULT 0,
    "expiry_date" date,
    "storage_location" text,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "public"."logistics_logs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "item_id" uuid NOT NULL,
    "transaction_type" text,
    "quantity_change" integer NOT NULL,
    "admin_id" uuid NOT NULL,
    "recipient_id" uuid,
    "incident_id" uuid,
    "note" text,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_email" text NOT NULL,
    "message" text NOT NULL,
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "notification_type" text,
    "incident_id" uuid,
    "schedule_id" uuid,
    "response_status" text DEFAULT 'pending'::text,
    "responded_at" timestamp with time zone,
    "action_token" uuid DEFAULT gen_random_uuid(),
    "sent_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "public"."pathogens" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "category" text NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" uuid NOT NULL,
    "email" text NOT NULL,
    "full_name" text,
    "phone" text,
    "role" text DEFAULT 'User'::text,
    "fax" text,
    "department" text,
    "team" text,
    "position" text,
    "registration_status" text DEFAULT 'pending'::text,
    "edit_comment" text,
    "latitude" double precision,
    "longitude" double precision,
    "ma_xa" text,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    "approval_status" text DEFAULT 'pending'::text,
    "deployment_status" text DEFAULT 'Sẵn sàng'::text,
    "address" text,
    "ward" text,
    "dob" text,
    "gender" text,
    "updated_at" timestamp with time zone DEFAULT now(),
    "academic" text,
    "academic_level" text,
    "languages" text,
    "languages_level" text,
    "employeestatus" text,
    "telegram_chat_id" text,
    "workplace_ward" text,
    "workplace_ma_xa" text,
    "lab_id" uuid
);

CREATE TABLE IF NOT EXISTS "public"."roster_assignments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "schedule_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "assignment_status" text DEFAULT 'assigned'::text,
    "decline_reason" text,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "public"."roster_schedules" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "team_name" text NOT NULL,
    "duty_date" date NOT NULL,
    "shift_type" text DEFAULT ''::text,
    "status" text DEFAULT 'draft'::text,
    "note" text,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "public"."rrt_qualifications" (
    "profile_id" uuid NOT NULL,
    "academic_level" text,
    "languages" text,
    "skills" jsonb DEFAULT '{}'::jsonb,
    "updated_at" timestamp with time zone DEFAULT now(),
    "languages_level" text,
    "academic" text
);

CREATE TABLE IF NOT EXISTS "public"."spatial_ref_sys" (
    "srid" integer NOT NULL,
    "auth_name" character varying(256),
    "auth_srid" integer,
    "srtext" character varying(2048),
    "proj4text" character varying(2048)
);

CREATE TABLE IF NOT EXISTS "public"."technique_equivalences" (
    "id" bigint DEFAULT nextval('technique_equivalences_id_seq'::regclass) NOT NULL,
    "group_id" integer NOT NULL,
    "test_type_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."test_types" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "category" text,
    "required_bsl" integer DEFAULT 2,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "parent_name" text
);

CREATE TABLE IF NOT EXISTS "public"."training_courses" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "course_name" text NOT NULL,
    "description" text,
    "training_date" timestamp with time zone,
    "location" text,
    "file_url" text,
    "status" text DEFAULT 'open'::text,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS "public"."training_records" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "course_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "attendance" boolean DEFAULT false,
    "result" text,
    "note" text,
    "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
    "profile_id" uuid
);

CREATE TABLE IF NOT EXISTS "public"."ward_codes" (
    "ten_xa" text NOT NULL,
    "ma_xa" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."website_stats" (
    "id" integer DEFAULT 1 NOT NULL,
    "total_views" bigint DEFAULT 0
);

ALTER TABLE "public"."deployment_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."helpers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."helpers_backup_pre_fix" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."incident_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."incident_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."incident_logistics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."incident_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."incident_objectives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."incident_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."incident_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."inventory_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lab_capabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lab_dispatch_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lab_equipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lab_inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."laboratories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."library_docs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_alert_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_alert_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_catalog_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_certificate_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_custom_field_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_custom_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_disease_report_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_disease_report_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_disease_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_equipment_catalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_import_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_lab_daily_load" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_lab_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_lab_operating_status" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_lab_staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_lab_standards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_reagent_catalog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_report_presets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_staff_certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_standards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_stocktake_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lims_stocktakes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."logistics_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."logistics_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pathogens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."roster_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."roster_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rrt_qualifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."technique_equivalences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."test_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."training_courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."training_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ward_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."website_stats" ENABLE ROW LEVEL SECURITY;

ALTER TABLE ONLY "public"."deployment_history" ADD CONSTRAINT "deployment_history_action_type_check" CHECK ((action_type = ANY (ARRAY['mobilize'::text, 'deployed'::text, 'active'::text, 'replace_in'::text, 'declined'::text])));
ALTER TABLE ONLY "public"."deployment_history" ADD CONSTRAINT "deployment_history_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."helpers" ADD CONSTRAINT "helpers_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."incident_activities" ADD CONSTRAINT "incident_activities_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."incident_activities" ADD CONSTRAINT "incident_activities_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."incident_assessments" ADD CONSTRAINT "incident_assessments_id_key" UNIQUE (id);
ALTER TABLE ONLY "public"."incident_assessments" ADD CONSTRAINT "incident_assessments_incident_id_key" UNIQUE (incident_id);
ALTER TABLE ONLY "public"."incident_assessments" ADD CONSTRAINT "incident_assessments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."incident_logistics" ADD CONSTRAINT "incident_logistics_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."incident_logs" ADD CONSTRAINT "event_logs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."incident_logs" ADD CONSTRAINT "incident_logs_log_type_check" CHECK ((log_type = ANY (ARRAY['Message'::text, 'Report'::text, 'DAILY'::text, 'EMERGENCY'::text, 'COMPLETION'::text, 'CRITICAL_REPORT'::text, 'SOS'::text, 'system'::text, 'activity'::text, 'update'::text, 'alert'::text, 'media'::text, 'general'::text])));
ALTER TABLE ONLY "public"."incident_objectives" ADD CONSTRAINT "incident_objectives_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."incident_plans" ADD CONSTRAINT "incident_plans_id_key" UNIQUE (id);
ALTER TABLE ONLY "public"."incident_plans" ADD CONSTRAINT "incident_plans_incident_id_key" UNIQUE (incident_id);
ALTER TABLE ONLY "public"."incident_plans" ADD CONSTRAINT "incident_plans_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."incident_reports" ADD CONSTRAINT "incident_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."incidents" ADD CONSTRAINT "incidents_activation_key_uniq" UNIQUE (activation_key);
ALTER TABLE ONLY "public"."incidents" ADD CONSTRAINT "incidents_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."incidents" ADD CONSTRAINT "incidents_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'evaluating'::text, 'resolved'::text, 'closed'::text])));
ALTER TABLE ONLY "public"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE ONLY "public"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_transaction_type_check" CHECK ((transaction_type = ANY (ARRAY['in'::text, 'out'::text])));
ALTER TABLE ONLY "public"."lab_capabilities" ADD CONSTRAINT "lab_capabilities_lab_id_test_type_id_key" UNIQUE (lab_id, test_type_id);
ALTER TABLE ONLY "public"."lab_capabilities" ADD CONSTRAINT "lab_capabilities_max_capacity_per_day_check" CHECK ((max_capacity_per_day >= 0));
ALTER TABLE ONLY "public"."lab_capabilities" ADD CONSTRAINT "lab_capabilities_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lab_capabilities" ADD CONSTRAINT "lab_capabilities_turnaround_hours_check" CHECK ((turnaround_hours >= 0));
ALTER TABLE ONLY "public"."lab_dispatch_log" ADD CONSTRAINT "lab_dispatch_log_action_token_key" UNIQUE (action_token);
ALTER TABLE ONLY "public"."lab_dispatch_log" ADD CONSTRAINT "lab_dispatch_log_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lab_dispatch_log" ADD CONSTRAINT "lab_dispatch_log_sample_count_check" CHECK ((sample_count >= 0));
ALTER TABLE ONLY "public"."lab_dispatch_log" ADD CONSTRAINT "lab_dispatch_log_status_check" CHECK ((status = ANY (ARRAY['suggested'::text, 'inquiry_sent'::text, 'accepted'::text, 'partially_accepted'::text, 'rejected'::text, 'dispatched'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY "public"."lab_equipments" ADD CONSTRAINT "lab_equipments_code_chk" CHECK ((COALESCE((code ~ '^\S{3,40}$'::text), false) AND COALESCE(((char_length(barcode) >= 1) AND (char_length(barcode) <= 64)), (barcode IS NULL))));
ALTER TABLE ONLY "public"."lab_equipments" ADD CONSTRAINT "lab_equipments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lab_equipments" ADD CONSTRAINT "lab_equipments_status_check" CHECK ((status = ANY (ARRAY['hoat_dong'::text, 'bao_tri'::text, 'hong'::text])));
ALTER TABLE ONLY "public"."lab_inventory" ADD CONSTRAINT "lab_inventory_code_chk" CHECK ((COALESCE((code ~ '^\S{3,40}$'::text), false) AND COALESCE(((char_length(barcode) >= 1) AND (char_length(barcode) <= 64)), (barcode IS NULL))));
ALTER TABLE ONLY "public"."lab_inventory" ADD CONSTRAINT "lab_inventory_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lab_inventory" ADD CONSTRAINT "lab_inventory_quantity_check" CHECK ((quantity >= (0)::numeric));
ALTER TABLE ONLY "public"."laboratories" ADD CONSTRAINT "laboratories_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."library_docs" ADD CONSTRAINT "library_docs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_alert_log" ADD CONSTRAINT "lims_alert_log_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_alert_log" ADD CONSTRAINT "lims_alert_log_trigger_check" CHECK ((trigger = ANY (ARRAY['cron'::text, 'manual'::text])));
ALTER TABLE ONLY "public"."lims_alert_log" ADD CONSTRAINT "lims_alert_log_week_end_weeks_ma_xa_pathogen_id_key" UNIQUE (week_end, weeks, ma_xa, pathogen_id);
ALTER TABLE ONLY "public"."lims_alert_settings" ADD CONSTRAINT "lims_alert_settings_id_check" CHECK ((id = 1));
ALTER TABLE ONLY "public"."lims_alert_settings" ADD CONSTRAINT "lims_alert_settings_min_positives_check" CHECK (((min_positives >= 1) AND (min_positives <= 1000)));
ALTER TABLE ONLY "public"."lims_alert_settings" ADD CONSTRAINT "lims_alert_settings_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_alert_settings" ADD CONSTRAINT "lims_alert_settings_ratio_check" CHECK (((ratio >= 1.2) AND (ratio <= (10)::numeric)));
ALTER TABLE ONLY "public"."lims_alert_settings" ADD CONSTRAINT "lims_alert_settings_weeks_check" CHECK ((weeks = ANY (ARRAY[1, 2, 4])));
ALTER TABLE ONLY "public"."lims_api_keys" ADD CONSTRAINT "lims_api_keys_key_hash_check" CHECK ((key_hash ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE ONLY "public"."lims_api_keys" ADD CONSTRAINT "lims_api_keys_key_hash_key" UNIQUE (key_hash);
ALTER TABLE ONLY "public"."lims_api_keys" ADD CONSTRAINT "lims_api_keys_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 100)));
ALTER TABLE ONLY "public"."lims_api_keys" ADD CONSTRAINT "lims_api_keys_note_check" CHECK (((note IS NULL) OR (char_length(note) <= 300)));
ALTER TABLE ONLY "public"."lims_api_keys" ADD CONSTRAINT "lims_api_keys_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_api_keys" ADD CONSTRAINT "lims_api_keys_rate_limit_per_min_check" CHECK (((rate_limit_per_min >= 1) AND (rate_limit_per_min <= 6000)));
ALTER TABLE ONLY "public"."lims_api_keys" ADD CONSTRAINT "lims_api_keys_scopes_check" CHECK (((cardinality(scopes) >= 1) AND (scopes <@ ARRAY['labs.read'::text, 'capabilities.read'::text, 'availability.read'::text, 'contacts.read'::text])));
ALTER TABLE ONLY "public"."lims_catalog_log" ADD CONSTRAINT "lims_catalog_log_action_check" CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'deactivate'::text, 'activate'::text])));
ALTER TABLE ONLY "public"."lims_catalog_log" ADD CONSTRAINT "lims_catalog_log_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_certificate_types" ADD CONSTRAINT "lims_certificate_types_name_check" CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 150)));
ALTER TABLE ONLY "public"."lims_certificate_types" ADD CONSTRAINT "lims_certificate_types_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_custom_field_values" ADD CONSTRAINT "lims_custom_field_values_pkey" PRIMARY KEY (lab_id, field_id);
ALTER TABLE ONLY "public"."lims_custom_fields" ADD CONSTRAINT "lims_custom_fields_field_type_check" CHECK ((field_type = ANY (ARRAY['text'::text, 'longtext'::text, 'number'::text, 'bool'::text, 'date'::text, 'select'::text, 'multiselect'::text])));
ALTER TABLE ONLY "public"."lims_custom_fields" ADD CONSTRAINT "lims_custom_fields_help_check" CHECK (((help IS NULL) OR (char_length(help) <= 500)));
ALTER TABLE ONLY "public"."lims_custom_fields" ADD CONSTRAINT "lims_custom_fields_key_check" CHECK ((key ~ '^[a-z][a-z0-9_]{1,39}$'::text));
ALTER TABLE ONLY "public"."lims_custom_fields" ADD CONSTRAINT "lims_custom_fields_key_key" UNIQUE (key);
ALTER TABLE ONLY "public"."lims_custom_fields" ADD CONSTRAINT "lims_custom_fields_label_check" CHECK (((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 160)));
ALTER TABLE ONLY "public"."lims_custom_fields" ADD CONSTRAINT "lims_custom_fields_options_chk" CHECK (COALESCE((((field_type = ANY (ARRAY['select'::text, 'multiselect'::text])) AND (jsonb_typeof(options) = 'array'::text) AND ((jsonb_array_length(options) >= 1) AND (jsonb_array_length(options) <= 60))) OR ((field_type <> ALL (ARRAY['select'::text, 'multiselect'::text])) AND (options IS NULL))), false));
ALTER TABLE ONLY "public"."lims_custom_fields" ADD CONSTRAINT "lims_custom_fields_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_custom_fields" ADD CONSTRAINT "lims_custom_fields_section_check" CHECK (((char_length(btrim(section)) >= 1) AND (char_length(btrim(section)) <= 80)));
ALTER TABLE ONLY "public"."lims_custom_fields" ADD CONSTRAINT "lims_custom_fields_unit_check" CHECK (((unit IS NULL) OR (char_length(unit) <= 30)));
ALTER TABLE ONLY "public"."lims_disease_report_lines" ADD CONSTRAINT "lims_disease_report_lines_check" CHECK ((positives <= tests_done));
ALTER TABLE ONLY "public"."lims_disease_report_lines" ADD CONSTRAINT "lims_disease_report_lines_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_disease_report_lines" ADD CONSTRAINT "lims_disease_report_lines_positives_check" CHECK (((positives >= 0) AND (positives <= 1000000)));
ALTER TABLE ONLY "public"."lims_disease_report_lines" ADD CONSTRAINT "lims_disease_report_lines_tests_done_check" CHECK (((tests_done >= 0) AND (tests_done <= 1000000)));
ALTER TABLE ONLY "public"."lims_disease_report_log" ADD CONSTRAINT "lims_disease_report_log_action_check" CHECK ((action = ANY (ARRAY['submit'::text, 'update'::text, 'delete'::text, 'import'::text])));
ALTER TABLE ONLY "public"."lims_disease_report_log" ADD CONSTRAINT "lims_disease_report_log_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_disease_reports" ADD CONSTRAINT "lims_disease_reports_lab_id_week_start_key" UNIQUE (lab_id, week_start);
ALTER TABLE ONLY "public"."lims_disease_reports" ADD CONSTRAINT "lims_disease_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_disease_reports" ADD CONSTRAINT "lims_disease_reports_week_start_check" CHECK ((EXTRACT(isodow FROM week_start) = (1)::numeric));
ALTER TABLE ONLY "public"."lims_equipment_catalog" ADD CONSTRAINT "lims_equipment_catalog_category_check" CHECK (((category IS NULL) OR (char_length(category) <= 80)));
ALTER TABLE ONLY "public"."lims_equipment_catalog" ADD CONSTRAINT "lims_equipment_catalog_manufacturer_check" CHECK (((manufacturer IS NULL) OR (char_length(manufacturer) <= 120)));
ALTER TABLE ONLY "public"."lims_equipment_catalog" ADD CONSTRAINT "lims_equipment_catalog_model_check" CHECK (((model IS NULL) OR (char_length(model) <= 120)));
ALTER TABLE ONLY "public"."lims_equipment_catalog" ADD CONSTRAINT "lims_equipment_catalog_name_check" CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 150)));
ALTER TABLE ONLY "public"."lims_equipment_catalog" ADD CONSTRAINT "lims_equipment_catalog_note_check" CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE ONLY "public"."lims_equipment_catalog" ADD CONSTRAINT "lims_equipment_catalog_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_import_log" ADD CONSTRAINT "lims_import_log_file_name_check" CHECK (((file_name IS NULL) OR (char_length(file_name) <= 200)));
ALTER TABLE ONLY "public"."lims_import_log" ADD CONSTRAINT "lims_import_log_kind_check" CHECK ((kind = ANY (ARRAY['equipment'::text, 'inventory'::text, 'staff'::text, 'disease'::text])));
ALTER TABLE ONLY "public"."lims_import_log" ADD CONSTRAINT "lims_import_log_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_lab_daily_load" ADD CONSTRAINT "lims_lab_daily_load_pkey" PRIMARY KEY (lab_id, load_date, test_type_id);
ALTER TABLE ONLY "public"."lims_lab_daily_load" ADD CONSTRAINT "lims_lab_daily_load_samples_check" CHECK (((samples >= 0) AND (samples <= 1000000)));
ALTER TABLE ONLY "public"."lims_lab_history" ADD CONSTRAINT "lims_lab_history_entity_check" CHECK ((entity = ANY (ARRAY['profile'::text, 'capability'::text, 'custom_field'::text, 'baseline'::text, 'status'::text, 'staff'::text, 'standard'::text])));
ALTER TABLE ONLY "public"."lims_lab_history" ADD CONSTRAINT "lims_lab_history_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_lab_operating_status" ADD CONSTRAINT "lims_lab_operating_status_pkey" PRIMARY KEY (lab_id);
ALTER TABLE ONLY "public"."lims_lab_operating_status" ADD CONSTRAINT "lims_lab_operating_status_reason_check" CHECK (((reason IS NULL) OR (char_length(reason) <= 500)));
ALTER TABLE ONLY "public"."lims_lab_operating_status" ADD CONSTRAINT "lims_lab_operating_status_status_check" CHECK ((status = ANY (ARRAY['hoat_dong'::text, 'han_che'::text, 'tam_ngung'::text])));
ALTER TABLE ONLY "public"."lims_lab_staff" ADD CONSTRAINT "lims_lab_staff_degree_check" CHECK (((degree IS NULL) OR (char_length(degree) <= 120)));
ALTER TABLE ONLY "public"."lims_lab_staff" ADD CONSTRAINT "lims_lab_staff_employment_check" CHECK ((employment = ANY (ARRAY['bien_che'::text, 'hop_dong'::text, 'thinh_giang'::text, 'khac'::text])));
ALTER TABLE ONLY "public"."lims_lab_staff" ADD CONSTRAINT "lims_lab_staff_full_name_check" CHECK (((char_length(btrim(full_name)) >= 2) AND (char_length(btrim(full_name)) <= 120)));
ALTER TABLE ONLY "public"."lims_lab_staff" ADD CONSTRAINT "lims_lab_staff_job_title_check" CHECK (((job_title IS NULL) OR (char_length(job_title) <= 120)));
ALTER TABLE ONLY "public"."lims_lab_staff" ADD CONSTRAINT "lims_lab_staff_note_check" CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE ONLY "public"."lims_lab_staff" ADD CONSTRAINT "lims_lab_staff_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_lab_staff" ADD CONSTRAINT "lims_lab_staff_specialty_check" CHECK (((specialty IS NULL) OR (char_length(specialty) <= 120)));
ALTER TABLE ONLY "public"."lims_lab_standards" ADD CONSTRAINT "lims_lab_standards_cert_no_check" CHECK (((cert_no IS NULL) OR (char_length(cert_no) <= 100)));
ALTER TABLE ONLY "public"."lims_lab_standards" ADD CONSTRAINT "lims_lab_standards_dates_chk" CHECK (((expires_on IS NULL) OR (issued_on IS NULL) OR (expires_on >= issued_on)));
ALTER TABLE ONLY "public"."lims_lab_standards" ADD CONSTRAINT "lims_lab_standards_issuer_check" CHECK (((issuer IS NULL) OR (char_length(issuer) <= 150)));
ALTER TABLE ONLY "public"."lims_lab_standards" ADD CONSTRAINT "lims_lab_standards_note_check" CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE ONLY "public"."lims_lab_standards" ADD CONSTRAINT "lims_lab_standards_pkey" PRIMARY KEY (lab_id, standard_id);
ALTER TABLE ONLY "public"."lims_lab_standards" ADD CONSTRAINT "lims_lab_standards_status_check" CHECK ((status = ANY (ARRAY['dat'::text, 'dang_thuc_hien'::text, 'chua_dat'::text])));
ALTER TABLE ONLY "public"."lims_reagent_catalog" ADD CONSTRAINT "lims_reagent_catalog_category_check" CHECK (((category IS NULL) OR (char_length(category) <= 80)));
ALTER TABLE ONLY "public"."lims_reagent_catalog" ADD CONSTRAINT "lims_reagent_catalog_manufacturer_check" CHECK (((manufacturer IS NULL) OR (char_length(manufacturer) <= 120)));
ALTER TABLE ONLY "public"."lims_reagent_catalog" ADD CONSTRAINT "lims_reagent_catalog_name_check" CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 150)));
ALTER TABLE ONLY "public"."lims_reagent_catalog" ADD CONSTRAINT "lims_reagent_catalog_note_check" CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE ONLY "public"."lims_reagent_catalog" ADD CONSTRAINT "lims_reagent_catalog_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_reagent_catalog" ADD CONSTRAINT "lims_reagent_catalog_unit_check" CHECK (((unit IS NULL) OR (char_length(unit) <= 30)));
ALTER TABLE ONLY "public"."lims_report_presets" ADD CONSTRAINT "lims_report_presets_config_chk" CHECK (((jsonb_typeof(config) = 'object'::text) AND (pg_column_size(config) < 20000)));
ALTER TABLE ONLY "public"."lims_report_presets" ADD CONSTRAINT "lims_report_presets_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 100)));
ALTER TABLE ONLY "public"."lims_report_presets" ADD CONSTRAINT "lims_report_presets_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_report_presets" ADD CONSTRAINT "lims_report_presets_report_type_check" CHECK ((report_type = ANY (ARRAY['labs'::text, 'capacity'::text, 'load'::text, 'equipment'::text, 'inventory'::text, 'history'::text, 'staff'::text, 'standards'::text])));
ALTER TABLE ONLY "public"."lims_staff_certificates" ADD CONSTRAINT "lims_staff_certificates_cert_no_check" CHECK (((cert_no IS NULL) OR (char_length(cert_no) <= 100)));
ALTER TABLE ONLY "public"."lims_staff_certificates" ADD CONSTRAINT "lims_staff_certificates_cert_type_check" CHECK (((char_length(btrim(cert_type)) >= 2) AND (char_length(btrim(cert_type)) <= 150)));
ALTER TABLE ONLY "public"."lims_staff_certificates" ADD CONSTRAINT "lims_staff_certificates_issuer_check" CHECK (((issuer IS NULL) OR (char_length(issuer) <= 150)));
ALTER TABLE ONLY "public"."lims_staff_certificates" ADD CONSTRAINT "lims_staff_certificates_note_check" CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE ONLY "public"."lims_staff_certificates" ADD CONSTRAINT "lims_staff_certificates_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_staff_certificates" ADD CONSTRAINT "lims_staff_certs_dates_chk" CHECK (((expires_on IS NULL) OR (issued_on IS NULL) OR (expires_on >= issued_on)));
ALTER TABLE ONLY "public"."lims_standards" ADD CONSTRAINT "lims_standards_code_check" CHECK ((code ~ '^[A-Za-z0-9_.-]{2,30}$'::text));
ALTER TABLE ONLY "public"."lims_standards" ADD CONSTRAINT "lims_standards_description_check" CHECK (((description IS NULL) OR (char_length(description) <= 500)));
ALTER TABLE ONLY "public"."lims_standards" ADD CONSTRAINT "lims_standards_kind_check" CHECK ((kind = ANY (ARRAY['quality'::text, 'biosafety'::text, 'other'::text])));
ALTER TABLE ONLY "public"."lims_standards" ADD CONSTRAINT "lims_standards_name_check" CHECK (((char_length(btrim(name)) >= 2) AND (char_length(btrim(name)) <= 200)));
ALTER TABLE ONLY "public"."lims_standards" ADD CONSTRAINT "lims_standards_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_stocktake_lines" ADD CONSTRAINT "lims_stocktake_lines_kind_check" CHECK ((kind = ANY (ARRAY['equipment'::text, 'inventory'::text])));
ALTER TABLE ONLY "public"."lims_stocktake_lines" ADD CONSTRAINT "lims_stocktake_lines_note_check" CHECK (((note IS NULL) OR (char_length(note) <= 300)));
ALTER TABLE ONLY "public"."lims_stocktake_lines" ADD CONSTRAINT "lims_stocktake_lines_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_stocktakes" ADD CONSTRAINT "lims_stocktakes_check" CHECK (((status = 'closed'::text) = (closed_at IS NOT NULL)));
ALTER TABLE ONLY "public"."lims_stocktakes" ADD CONSTRAINT "lims_stocktakes_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 120)));
ALTER TABLE ONLY "public"."lims_stocktakes" ADD CONSTRAINT "lims_stocktakes_note_check" CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE ONLY "public"."lims_stocktakes" ADD CONSTRAINT "lims_stocktakes_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lims_stocktakes" ADD CONSTRAINT "lims_stocktakes_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));
ALTER TABLE ONLY "public"."logistics_items" ADD CONSTRAINT "logistics_items_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."logistics_logs" ADD CONSTRAINT "logistics_logs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."logistics_logs" ADD CONSTRAINT "logistics_logs_transaction_type_check" CHECK ((transaction_type = ANY (ARRAY['IMPORT'::text, 'EXPORT'::text, 'NHẬP'::text, 'XUẤT'::text])));
ALTER TABLE ONLY "public"."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."pathogens" ADD CONSTRAINT "pathogens_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_email_key" UNIQUE (email);
ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_registration_status_check" CHECK ((registration_status = ANY (ARRAY['pending'::text, 'approved'::text, 'edit'::text, 'rejected'::text])));
ALTER TABLE ONLY "public"."roster_assignments" ADD CONSTRAINT "roster_assignments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."roster_assignments" ADD CONSTRAINT "roster_assignments_schedule_id_user_id_key" UNIQUE (schedule_id, user_id);
ALTER TABLE ONLY "public"."roster_schedules" ADD CONSTRAINT "roster_schedules_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."rrt_qualifications" ADD CONSTRAINT "rrt_qualifications_pkey" PRIMARY KEY (profile_id);
ALTER TABLE ONLY "public"."spatial_ref_sys" ADD CONSTRAINT "spatial_ref_sys_pkey" PRIMARY KEY (srid);
ALTER TABLE ONLY "public"."spatial_ref_sys" ADD CONSTRAINT "spatial_ref_sys_srid_check" CHECK (((srid > 0) AND (srid <= 998999)));
ALTER TABLE ONLY "public"."technique_equivalences" ADD CONSTRAINT "technique_equivalences_group_id_test_type_id_key" UNIQUE (group_id, test_type_id);
ALTER TABLE ONLY "public"."technique_equivalences" ADD CONSTRAINT "technique_equivalences_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."test_types" ADD CONSTRAINT "test_types_bsl_check" CHECK (((required_bsl >= 1) AND (required_bsl <= 4)));
ALTER TABLE ONLY "public"."test_types" ADD CONSTRAINT "test_types_name_key" UNIQUE (name);
ALTER TABLE ONLY "public"."test_types" ADD CONSTRAINT "test_types_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."training_courses" ADD CONSTRAINT "training_courses_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."training_records" ADD CONSTRAINT "training_records_course_id_user_id_key" UNIQUE (course_id, user_id);
ALTER TABLE ONLY "public"."training_records" ADD CONSTRAINT "training_records_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."training_records" ADD CONSTRAINT "training_records_result_check" CHECK ((result = ANY (ARRAY['pass'::text, 'fail'::text, 'pending'::text])));
ALTER TABLE ONLY "public"."ward_codes" ADD CONSTRAINT "ward_codes_ma_xa_key" UNIQUE (ma_xa);
ALTER TABLE ONLY "public"."ward_codes" ADD CONSTRAINT "ward_codes_pkey" PRIMARY KEY (ten_xa);
ALTER TABLE ONLY "public"."website_stats" ADD CONSTRAINT "website_stats_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."deployment_history" ADD CONSTRAINT "deployment_history_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."deployment_history" ADD CONSTRAINT "deployment_history_replaced_by_fkey" FOREIGN KEY (replaced_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."deployment_history" ADD CONSTRAINT "deployment_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."deployment_history" ADD CONSTRAINT "incident_history_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."incident_activities" ADD CONSTRAINT "fk_incident_activities_to_incidents" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."incident_activities" ADD CONSTRAINT "incident_activities_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES profiles(id);
ALTER TABLE ONLY "public"."incident_activities" ADD CONSTRAINT "incident_activities_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."incident_assessments" ADD CONSTRAINT "incident_assessments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES profiles(id);
ALTER TABLE ONLY "public"."incident_assessments" ADD CONSTRAINT "incident_assessments_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."incident_logistics" ADD CONSTRAINT "incident_logistics_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."incident_logs" ADD CONSTRAINT "event_logs_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."incident_logs" ADD CONSTRAINT "event_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id);
ALTER TABLE ONLY "public"."incident_logs" ADD CONSTRAINT "incident_logs_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."incident_objectives" ADD CONSTRAINT "incident_objectives_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."incident_plans" ADD CONSTRAINT "incident_plans_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."incident_reports" ADD CONSTRAINT "incident_reports_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."incidents" ADD CONSTRAINT "incidents_admin_activate_fkey" FOREIGN KEY (admin_activate) REFERENCES profiles(id);
ALTER TABLE ONLY "public"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES lab_inventory(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."inventory_transactions" ADD CONSTRAINT "inventory_transactions_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lab_capabilities" ADD CONSTRAINT "lab_capabilities_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lab_capabilities" ADD CONSTRAINT "lab_capabilities_test_type_id_fkey" FOREIGN KEY (test_type_id) REFERENCES test_types(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lab_dispatch_log" ADD CONSTRAINT "fk_dispatch_suggester" FOREIGN KEY (dispatched_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lab_dispatch_log" ADD CONSTRAINT "lab_dispatch_log_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lab_dispatch_log" ADD CONSTRAINT "lab_dispatch_log_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lab_dispatch_log" ADD CONSTRAINT "lab_dispatch_log_test_type_id_fkey" FOREIGN KEY (test_type_id) REFERENCES test_types(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lab_equipments" ADD CONSTRAINT "lab_equipments_catalog_id_fkey" FOREIGN KEY (catalog_id) REFERENCES lims_equipment_catalog(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lab_equipments" ADD CONSTRAINT "lab_equipments_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lab_inventory" ADD CONSTRAINT "lab_inventory_catalog_id_fkey" FOREIGN KEY (catalog_id) REFERENCES lims_reagent_catalog(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lab_inventory" ADD CONSTRAINT "lab_inventory_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."library_docs" ADD CONSTRAINT "library_docs_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES profiles(id);
ALTER TABLE ONLY "public"."lims_custom_field_values" ADD CONSTRAINT "lims_custom_field_values_field_id_fkey" FOREIGN KEY (field_id) REFERENCES lims_custom_fields(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."lims_custom_field_values" ADD CONSTRAINT "lims_custom_field_values_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_disease_report_lines" ADD CONSTRAINT "lims_disease_report_lines_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_disease_report_lines" ADD CONSTRAINT "lims_disease_report_lines_report_id_fkey" FOREIGN KEY (report_id) REFERENCES lims_disease_reports(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_disease_report_log" ADD CONSTRAINT "lims_disease_report_log_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_disease_reports" ADD CONSTRAINT "lims_disease_reports_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_import_log" ADD CONSTRAINT "lims_import_log_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_lab_daily_load" ADD CONSTRAINT "lims_lab_daily_load_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_lab_daily_load" ADD CONSTRAINT "lims_lab_daily_load_test_type_id_fkey" FOREIGN KEY (test_type_id) REFERENCES test_types(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_lab_history" ADD CONSTRAINT "lims_lab_history_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_lab_operating_status" ADD CONSTRAINT "lims_lab_operating_status_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_lab_staff" ADD CONSTRAINT "lims_lab_staff_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_lab_standards" ADD CONSTRAINT "lims_lab_standards_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_lab_standards" ADD CONSTRAINT "lims_lab_standards_standard_id_fkey" FOREIGN KEY (standard_id) REFERENCES lims_standards(id) ON DELETE RESTRICT;
ALTER TABLE ONLY "public"."lims_staff_certificates" ADD CONSTRAINT "lims_staff_certificates_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_staff_certificates" ADD CONSTRAINT "lims_staff_certificates_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES lims_lab_staff(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_stocktake_lines" ADD CONSTRAINT "lims_stocktake_lines_equipment_id_fkey" FOREIGN KEY (equipment_id) REFERENCES lab_equipments(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lims_stocktake_lines" ADD CONSTRAINT "lims_stocktake_lines_inventory_id_fkey" FOREIGN KEY (inventory_id) REFERENCES lab_inventory(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."lims_stocktake_lines" ADD CONSTRAINT "lims_stocktake_lines_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_stocktake_lines" ADD CONSTRAINT "lims_stocktake_lines_stocktake_id_fkey" FOREIGN KEY (stocktake_id) REFERENCES lims_stocktakes(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lims_stocktakes" ADD CONSTRAINT "lims_stocktakes_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."logistics_logs" ADD CONSTRAINT "logistics_logs_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES profiles(id);
ALTER TABLE ONLY "public"."logistics_logs" ADD CONSTRAINT "logistics_logs_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."logistics_logs" ADD CONSTRAINT "logistics_logs_item_id_fkey" FOREIGN KEY (item_id) REFERENCES logistics_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."logistics_logs" ADD CONSTRAINT "logistics_logs_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES profiles(id);
ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."profiles" ADD CONSTRAINT "profiles_lab_id_fkey" FOREIGN KEY (lab_id) REFERENCES laboratories(id) ON DELETE SET NULL;
ALTER TABLE ONLY "public"."roster_assignments" ADD CONSTRAINT "roster_assignments_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES roster_schedules(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."roster_assignments" ADD CONSTRAINT "roster_assignments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."roster_schedules" ADD CONSTRAINT "roster_schedules_created_by_fkey" FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE ONLY "public"."rrt_qualifications" ADD CONSTRAINT "rrt_qualifications_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id);
ALTER TABLE ONLY "public"."technique_equivalences" ADD CONSTRAINT "technique_equivalences_test_type_id_fkey" FOREIGN KEY (test_type_id) REFERENCES test_types(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."training_records" ADD CONSTRAINT "training_records_course_id_fkey" FOREIGN KEY (course_id) REFERENCES training_courses(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."training_records" ADD CONSTRAINT "training_records_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."training_records" ADD CONSTRAINT "training_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

CREATE INDEX idx_deployment_history_incident_id ON public.deployment_history USING btree (incident_id);
CREATE INDEX idx_deployment_history_user_id ON public.deployment_history USING btree (user_id);
CREATE INDEX idx_deployments_incident_id ON public.deployment_history USING btree (incident_id);
CREATE INDEX idx_activities_incident_id ON public.incident_activities USING btree (incident_id);
CREATE INDEX idx_incident_activities_incident_id ON public.incident_activities USING btree (incident_id);
CREATE INDEX idx_incident_activities_objective_id ON public.incident_activities USING btree (objective_id);
CREATE INDEX idx_assessments_incident_id ON public.incident_assessments USING btree (incident_id);
CREATE INDEX idx_incident_assessments_incident_id ON public.incident_assessments USING btree (incident_id);
CREATE INDEX idx_incident_logistics_incident_id ON public.incident_logistics USING btree (incident_id);
CREATE INDEX idx_incident_logs_incident_id ON public.incident_logs USING btree (incident_id);
CREATE INDEX idx_logs_incident_id ON public.incident_logs USING btree (incident_id);
CREATE INDEX idx_incident_objectives_incident_id ON public.incident_objectives USING btree (incident_id);
CREATE INDEX idx_objectives_incident_id ON public.incident_objectives USING btree (incident_id);
CREATE INDEX idx_incident_plans_incident_id ON public.incident_plans USING btree (incident_id);
CREATE INDEX idx_incident_reports_incident_id ON public.incident_reports USING btree (incident_id);
CREATE INDEX idx_inv_tx_inventory_id ON public.inventory_transactions USING btree (inventory_id);
CREATE INDEX idx_inv_tx_lab_created ON public.inventory_transactions USING btree (lab_id, created_at DESC);
CREATE INDEX idx_cap_lab ON public.lab_capabilities USING btree (lab_id);
CREATE INDEX idx_cap_testtype ON public.lab_capabilities USING btree (test_type_id);
CREATE INDEX idx_dispatch_incident ON public.lab_dispatch_log USING btree (incident_id);
CREATE INDEX idx_dispatch_lab_date ON public.lab_dispatch_log USING btree (lab_id, test_type_id, dispatch_date);
CREATE INDEX idx_lab_equipments_calibration_due ON public.lab_equipments USING btree (calibration_due_date) WHERE (calibration_due_date IS NOT NULL);
CREATE INDEX idx_lab_equipments_lab_barcode ON public.lab_equipments USING btree (lab_id, barcode) WHERE (barcode IS NOT NULL);
CREATE INDEX idx_lab_equipments_lab_id ON public.lab_equipments USING btree (lab_id);
CREATE INDEX idx_lab_equipments_lab_status ON public.lab_equipments USING btree (lab_id, status);
CREATE UNIQUE INDEX uq_lab_equipments_lab_code ON public.lab_equipments USING btree (lab_id, code);
CREATE INDEX idx_lab_inventory_expiration ON public.lab_inventory USING btree (expiration_date) WHERE (expiration_date IS NOT NULL);
CREATE INDEX idx_lab_inventory_lab_barcode ON public.lab_inventory USING btree (lab_id, barcode) WHERE (barcode IS NOT NULL);
CREATE INDEX idx_lab_inventory_lab_id ON public.lab_inventory USING btree (lab_id);
CREATE INDEX idx_lab_inventory_lab_item ON public.lab_inventory USING btree (lab_id, item_name);
CREATE UNIQUE INDEX uq_lab_inventory_lab_code ON public.lab_inventory USING btree (lab_id, code);
CREATE INDEX idx_lims_alert_log_sent ON public.lims_alert_log USING btree (sent_at DESC);
CREATE INDEX idx_lims_catalog_log_at ON public.lims_catalog_log USING btree (at DESC);
CREATE UNIQUE INDEX uq_lims_certificate_types_name ON public.lims_certificate_types USING btree (lower(btrim(name)));
CREATE INDEX idx_lims_disease_lines_lab ON public.lims_disease_report_lines USING btree (lab_id, week_start);
CREATE INDEX idx_lims_disease_lines_week ON public.lims_disease_report_lines USING btree (week_start, pathogen_id);
CREATE UNIQUE INDEX uq_lims_disease_lines_key ON public.lims_disease_report_lines USING btree (report_id, pathogen_id, COALESCE(ma_xa, ''::text));
CREATE INDEX idx_lims_disease_log_lab ON public.lims_disease_report_log USING btree (lab_id, at DESC);
CREATE INDEX idx_lims_disease_reports_week ON public.lims_disease_reports USING btree (week_start);
CREATE UNIQUE INDEX uq_lims_equipment_catalog_name ON public.lims_equipment_catalog USING btree (lower(btrim(name)));
CREATE INDEX idx_lims_import_log_lab ON public.lims_import_log USING btree (lab_id, created_at DESC);
CREATE INDEX idx_lims_daily_load_date ON public.lims_lab_daily_load USING btree (load_date);
CREATE INDEX idx_lims_lab_history_lab_time ON public.lims_lab_history USING btree (lab_id, changed_at DESC);
CREATE INDEX idx_lims_lab_history_time ON public.lims_lab_history USING btree (changed_at DESC);
CREATE INDEX idx_lims_lab_staff_lab ON public.lims_lab_staff USING btree (lab_id);
CREATE INDEX idx_lims_lab_standards_expiry ON public.lims_lab_standards USING btree (expires_on) WHERE (expires_on IS NOT NULL);
CREATE UNIQUE INDEX uq_lims_reagent_catalog_name ON public.lims_reagent_catalog USING btree (lower(btrim(name)));
CREATE INDEX idx_lims_report_presets_owner ON public.lims_report_presets USING btree (owner_id, created_at DESC);
CREATE INDEX idx_lims_staff_certs_expiry ON public.lims_staff_certificates USING btree (expires_on) WHERE (expires_on IS NOT NULL);
CREATE INDEX idx_lims_staff_certs_lab ON public.lims_staff_certificates USING btree (lab_id);
CREATE INDEX idx_lims_staff_certs_staff ON public.lims_staff_certificates USING btree (staff_id);
CREATE UNIQUE INDEX uq_lims_standards_code ON public.lims_standards USING btree (lower(code));
CREATE INDEX idx_lims_stocktake_lines_lab ON public.lims_stocktake_lines USING btree (lab_id, counted_at DESC);
CREATE UNIQUE INDEX uq_lims_stocktake_line_eq ON public.lims_stocktake_lines USING btree (stocktake_id, equipment_id) WHERE (equipment_id IS NOT NULL);
CREATE UNIQUE INDEX uq_lims_stocktake_line_inv ON public.lims_stocktake_lines USING btree (stocktake_id, inventory_id) WHERE (inventory_id IS NOT NULL);
CREATE INDEX idx_lims_stocktakes_lab_created ON public.lims_stocktakes USING btree (lab_id, created_at DESC);
CREATE UNIQUE INDEX uq_lims_stocktakes_one_open ON public.lims_stocktakes USING btree (lab_id) WHERE (status = 'open'::text);
CREATE INDEX idx_profiles_lab_id ON public.profiles USING btree (lab_id) WHERE (lab_id IS NOT NULL);
CREATE INDEX idx_teq_group ON public.technique_equivalences USING btree (group_id);
CREATE INDEX idx_teq_ttid ON public.technique_equivalences USING btree (test_type_id);
CREATE INDEX idx_testtype_active ON public.test_types USING btree (is_active) WHERE (is_active = true);

CREATE OR REPLACE VIEW "public"."geography_columns" AS
 SELECT current_database() AS f_table_catalog,
    n.nspname AS f_table_schema,
    c.relname AS f_table_name,
    a.attname AS f_geography_column,
    postgis_typmod_dims(a.atttypmod) AS coord_dimension,
    postgis_typmod_srid(a.atttypmod) AS srid,
    postgis_typmod_type(a.atttypmod) AS type
   FROM pg_class c,
    pg_attribute a,
    pg_type t,
    pg_namespace n
  WHERE t.typname = 'geography'::name AND a.attisdropped = false AND a.atttypid = t.oid AND a.attrelid = c.oid AND c.relnamespace = n.oid AND (c.relkind = ANY (ARRAY['r'::"char", 'v'::"char", 'm'::"char", 'f'::"char", 'p'::"char"])) AND NOT pg_is_other_temp_schema(c.relnamespace) AND has_table_privilege(c.oid, 'SELECT'::text);

CREATE OR REPLACE VIEW "public"."geometry_columns" AS
 SELECT current_database()::character varying(256) AS f_table_catalog,
    n.nspname AS f_table_schema,
    c.relname AS f_table_name,
    a.attname AS f_geometry_column,
    COALESCE(postgis_typmod_dims(a.atttypmod), sn.ndims, 2) AS coord_dimension,
    COALESCE(NULLIF(postgis_typmod_srid(a.atttypmod), 0), sr.srid, 0) AS srid,
    replace(replace(COALESCE(NULLIF(upper(postgis_typmod_type(a.atttypmod)), 'GEOMETRY'::text), st.type, 'GEOMETRY'::text), 'ZM'::text, ''::text), 'Z'::text, ''::text)::character varying(30) AS type
   FROM pg_class c
     JOIN pg_attribute a ON a.attrelid = c.oid AND NOT a.attisdropped
     JOIN pg_namespace n ON c.relnamespace = n.oid
     JOIN pg_type t ON a.atttypid = t.oid
     LEFT JOIN ( SELECT s.connamespace,
            s.conrelid,
            s.conkey,
            replace(split_part(s.consrc, ''''::text, 2), ')'::text, ''::text) AS type
           FROM ( SELECT pg_constraint.connamespace,
                    pg_constraint.conrelid,
                    pg_constraint.conkey,
                    pg_get_constraintdef(pg_constraint.oid) AS consrc
                   FROM pg_constraint) s
          WHERE s.consrc ~~* '%geometrytype(% = %'::text) st ON st.connamespace = n.oid AND st.conrelid = c.oid AND (a.attnum = ANY (st.conkey))
     LEFT JOIN ( SELECT s.connamespace,
            s.conrelid,
            s.conkey,
            replace(split_part(s.consrc, ' = '::text, 2), ')'::text, ''::text)::integer AS ndims
           FROM ( SELECT pg_constraint.connamespace,
                    pg_constraint.conrelid,
                    pg_constraint.conkey,
                    pg_get_constraintdef(pg_constraint.oid) AS consrc
                   FROM pg_constraint) s
          WHERE s.consrc ~~* '%ndims(% = %'::text) sn ON sn.connamespace = n.oid AND sn.conrelid = c.oid AND (a.attnum = ANY (sn.conkey))
     LEFT JOIN ( SELECT s.connamespace,
            s.conrelid,
            s.conkey,
            replace(replace(split_part(s.consrc, ' = '::text, 2), ')'::text, ''::text), '('::text, ''::text)::integer AS srid
           FROM ( SELECT pg_constraint.connamespace,
                    pg_constraint.conrelid,
                    pg_constraint.conkey,
                    pg_get_constraintdef(pg_constraint.oid) AS consrc
                   FROM pg_constraint) s
          WHERE s.consrc ~~* '%srid(% = %'::text) sr ON sr.connamespace = n.oid AND sr.conrelid = c.oid AND (a.attnum = ANY (sr.conkey))
  WHERE (c.relkind = ANY (ARRAY['r'::"char", 'v'::"char", 'm'::"char", 'f'::"char", 'p'::"char"])) AND NOT c.relname = 'raster_columns'::name AND t.typname = 'geometry'::name AND NOT pg_is_other_temp_schema(c.relnamespace) AND has_table_privilege(c.oid, 'SELECT'::text);

CREATE TRIGGER on_incident_created AFTER INSERT ON public.incidents FOR EACH ROW EXECUTE FUNCTION handle_new_incident();
CREATE TRIGGER trg_lims_apply_inventory_transaction BEFORE INSERT ON public.inventory_transactions FOR EACH ROW EXECUTE FUNCTION lims_apply_inventory_transaction();
CREATE TRIGGER lims_t_log_capability AFTER INSERT OR DELETE OR UPDATE ON public.lab_capabilities FOR EACH ROW EXECUTE FUNCTION lims_trg_log_capability();
CREATE TRIGGER t_recompute_tier_cap AFTER INSERT OR DELETE OR UPDATE ON public.lab_capabilities FOR EACH ROW EXECUTE FUNCTION trg_recompute_tier_on_cap();
CREATE TRIGGER lims_t_equipment_code BEFORE INSERT OR UPDATE ON public.lab_equipments FOR EACH ROW EXECUTE FUNCTION lims_item_code_default('TB');
CREATE TRIGGER lims_t_inventory_code BEFORE INSERT OR UPDATE ON public.lab_inventory FOR EACH ROW EXECUTE FUNCTION lims_item_code_default('VT');
CREATE TRIGGER lims_t_log_lab AFTER UPDATE ON public.laboratories FOR EACH ROW EXECUTE FUNCTION lims_trg_log_lab();
CREATE TRIGGER t_recompute_tier_qsm AFTER UPDATE OF qsm_level ON public.laboratories FOR EACH ROW WHEN ((new.qsm_level IS DISTINCT FROM old.qsm_level)) EXECUTE FUNCTION trg_recompute_tier_on_qsm();
CREATE TRIGGER trg_sync_lab_location BEFORE INSERT OR UPDATE OF lat, lng ON public.laboratories FOR EACH ROW EXECUTE FUNCTION sync_lab_location();
CREATE TRIGGER lims_t_log_catalog AFTER INSERT OR UPDATE ON public.lims_certificate_types FOR EACH ROW EXECUTE FUNCTION lims_trg_log_catalog_table();
CREATE TRIGGER lims_t_log_custom_value AFTER INSERT OR DELETE OR UPDATE ON public.lims_custom_field_values FOR EACH ROW EXECUTE FUNCTION lims_trg_log_custom_value();
CREATE TRIGGER lims_t_custom_fields_guard BEFORE UPDATE ON public.lims_custom_fields FOR EACH ROW EXECUTE FUNCTION lims_custom_fields_guard();
CREATE TRIGGER lims_t_log_catalog AFTER INSERT OR UPDATE ON public.lims_equipment_catalog FOR EACH ROW EXECUTE FUNCTION lims_trg_log_catalog_table();
CREATE TRIGGER lims_t_log_staff AFTER INSERT OR DELETE OR UPDATE ON public.lims_lab_staff FOR EACH ROW EXECUTE FUNCTION lims_trg_log_staff();
CREATE TRIGGER lims_t_staff_touch BEFORE UPDATE ON public.lims_lab_staff FOR EACH ROW EXECUTE FUNCTION lims_staff_touch();
CREATE TRIGGER lims_t_log_lab_standard AFTER INSERT OR DELETE OR UPDATE ON public.lims_lab_standards FOR EACH ROW EXECUTE FUNCTION lims_trg_log_lab_standard();
CREATE TRIGGER lims_t_log_catalog AFTER INSERT OR UPDATE ON public.lims_reagent_catalog FOR EACH ROW EXECUTE FUNCTION lims_trg_log_catalog_table();
CREATE TRIGGER lims_t_cert_set_lab BEFORE INSERT OR UPDATE OF staff_id ON public.lims_staff_certificates FOR EACH ROW EXECUTE FUNCTION lims_cert_set_lab();
CREATE TRIGGER lims_t_log_staff_cert AFTER INSERT OR DELETE OR UPDATE ON public.lims_staff_certificates FOR EACH ROW EXECUTE FUNCTION lims_trg_log_staff();
CREATE TRIGGER lims_t_log_catalog AFTER INSERT OR UPDATE ON public.lims_standards FOR EACH ROW EXECUTE FUNCTION lims_trg_log_catalog_table();
-- LƯU Ý: header thật (service_role key, webhook secret) đã được che; giá trị thật chỉ nằm trên database.
CREATE TRIGGER "Send Free Notification" AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://sxzjbygiowpscyhiffqc.supabase.co/functions/v1/send-notification-free', 'POST', '{"Content-type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>","x-webhook-secret":"<WEBHOOK_SECRET>"}', '{}', '8000');
CREATE TRIGGER trg_sync_workplace_ma_xa BEFORE INSERT OR UPDATE OF workplace_ward ON public.profiles FOR EACH ROW EXECUTE FUNCTION sync_workplace_ma_xa();

CREATE POLICY "authenticated_full_access" ON "public"."deployment_history" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."helpers" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_activities" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_assessments" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_logistics" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Allow all" ON "public"."incident_logs" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_logs" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_objectives" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_plans" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."incident_reports" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Super_Admin_duoc_tao_o_dich" ON "public"."incidents" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'super_admin'::text)))));
CREATE POLICY "incidents_delete_auth" ON "public"."incidents" AS PERMISSIVE FOR DELETE TO authenticated
  USING (true);
CREATE POLICY "incidents_insert_auth" ON "public"."incidents" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "incidents_select_scoped" ON "public"."incidents" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'ward_admin'::text) AND (p.workplace_ma_xa IS NOT NULL) AND (p.workplace_ma_xa = incidents.ma_xa)))) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.email IS NOT NULL) AND ((((';'::text || COALESCE(incidents.members, ''::text)) || ';'::text) ~~ (('%;'::text || p.email) || ';%'::text)) OR (((';'::text || COALESCE(incidents.initial_selected_members, ''::text)) || ';'::text) ~~ (('%;'::text || p.email) || ';%'::text))))))));
CREATE POLICY "incidents_update_auth" ON "public"."incidents" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "lims_inv_tx_hcdc_select" ON "public"."inventory_transactions" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_inv_tx_lab_admin_insert" ON "public"."inventory_transactions" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((lims_current_role() = 'lab_admin'::text) AND (EXISTS ( SELECT 1
   FROM lab_inventory i
  WHERE ((i.id = inventory_transactions.inventory_id) AND (i.lab_id = lims_current_lab_id()))))));
CREATE POLICY "lims_inv_tx_lab_admin_select" ON "public"."inventory_transactions" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "cap_select_all" ON "public"."lab_capabilities" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "cap_write_admin" ON "public"."lab_capabilities" AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "lims_cap_lab_admin_delete" ON "public"."lab_capabilities" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_cap_lab_admin_insert" ON "public"."lab_capabilities" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_cap_lab_admin_update" ON "public"."lab_capabilities" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())))
  WITH CHECK (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "disp_select_all" ON "public"."lab_dispatch_log" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "disp_write_admin" ON "public"."lab_dispatch_log" AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "lims_equipments_hcdc_all" ON "public"."lab_equipments" AS PERMISSIVE FOR ALL TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_equipments_lab_admin_all" ON "public"."lab_equipments" AS PERMISSIVE FOR ALL TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())))
  WITH CHECK (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_inventory_hcdc_all" ON "public"."lab_inventory" AS PERMISSIVE FOR ALL TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_inventory_lab_admin_all" ON "public"."lab_inventory" AS PERMISSIVE FOR ALL TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())))
  WITH CHECK (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lab_select_all" ON "public"."laboratories" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "lab_write_admin" ON "public"."laboratories" AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "Admin can delete library docs" ON "public"."library_docs" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))) OR (updated_by = auth.uid())));
CREATE POLICY "Allow authenticated users to insert" ON "public"."library_docs" AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "Authenticated users can create library docs" ON "public"."library_docs" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Authenticated users can update library docs" ON "public"."library_docs" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users can view library docs" ON "public"."library_docs" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "authenticated_full_access" ON "public"."library_docs" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "lims_alert_log_hcdc_select" ON "public"."lims_alert_log" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_alert_settings_hcdc_select" ON "public"."lims_alert_settings" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_apikeys_hcdc_insert" ON "public"."lims_api_keys" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_apikeys_hcdc_select" ON "public"."lims_api_keys" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_apikeys_hcdc_update" ON "public"."lims_api_keys" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_catlog_hcdc_select" ON "public"."lims_catalog_log" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cat_hcdc_insert" ON "public"."lims_certificate_types" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cat_hcdc_update" ON "public"."lims_certificate_types" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cat_select" ON "public"."lims_certificate_types" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = ANY (ARRAY['hcdc_admin'::text, 'lab_admin'::text])));
CREATE POLICY "lims_cfv_hcdc_select" ON "public"."lims_custom_field_values" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cfv_lab_select" ON "public"."lims_custom_field_values" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_cf_hcdc_write" ON "public"."lims_custom_fields" AS PERMISSIVE FOR ALL TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cf_select" ON "public"."lims_custom_fields" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = ANY (ARRAY['hcdc_admin'::text, 'lab_admin'::text])));
CREATE POLICY "lims_disease_hcdc_select" ON "public"."lims_disease_report_lines" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_disease_lab_select" ON "public"."lims_disease_report_lines" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_disease_hcdc_select" ON "public"."lims_disease_report_log" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_disease_lab_select" ON "public"."lims_disease_report_log" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_disease_hcdc_select" ON "public"."lims_disease_reports" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_disease_lab_select" ON "public"."lims_disease_reports" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_cat_hcdc_insert" ON "public"."lims_equipment_catalog" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cat_hcdc_update" ON "public"."lims_equipment_catalog" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cat_select" ON "public"."lims_equipment_catalog" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = ANY (ARRAY['hcdc_admin'::text, 'lab_admin'::text])));
CREATE POLICY "lims_import_log_hcdc_select" ON "public"."lims_import_log" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_import_log_lab_select" ON "public"."lims_import_log" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_dailyload_select" ON "public"."lims_lab_daily_load" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "lims_history_hcdc_select" ON "public"."lims_lab_history" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_history_lab_select" ON "public"."lims_lab_history" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_opstatus_select" ON "public"."lims_lab_operating_status" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "lims_hcdc_all" ON "public"."lims_lab_staff" AS PERMISSIVE FOR ALL TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_own_lab_all" ON "public"."lims_lab_staff" AS PERMISSIVE FOR ALL TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())))
  WITH CHECK (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_hcdc_all" ON "public"."lims_lab_standards" AS PERMISSIVE FOR ALL TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_own_lab_all" ON "public"."lims_lab_standards" AS PERMISSIVE FOR ALL TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())))
  WITH CHECK (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_cat_hcdc_insert" ON "public"."lims_reagent_catalog" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cat_hcdc_update" ON "public"."lims_reagent_catalog" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cat_select" ON "public"."lims_reagent_catalog" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = ANY (ARRAY['hcdc_admin'::text, 'lab_admin'::text])));
CREATE POLICY "lims_presets_owner_delete" ON "public"."lims_report_presets" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((owner_id = auth.uid()) AND (lims_current_role() = ANY (ARRAY['hcdc_admin'::text, 'lab_admin'::text]))));
CREATE POLICY "lims_presets_owner_insert" ON "public"."lims_report_presets" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((owner_id = auth.uid()) AND (lims_current_role() = ANY (ARRAY['hcdc_admin'::text, 'lab_admin'::text]))));
CREATE POLICY "lims_presets_owner_select" ON "public"."lims_report_presets" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((owner_id = auth.uid()) AND (lims_current_role() = ANY (ARRAY['hcdc_admin'::text, 'lab_admin'::text]))));
CREATE POLICY "lims_presets_owner_update" ON "public"."lims_report_presets" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((owner_id = auth.uid()) AND (lims_current_role() = ANY (ARRAY['hcdc_admin'::text, 'lab_admin'::text]))))
  WITH CHECK (((owner_id = auth.uid()) AND (lims_current_role() = ANY (ARRAY['hcdc_admin'::text, 'lab_admin'::text]))));
CREATE POLICY "lims_hcdc_all" ON "public"."lims_staff_certificates" AS PERMISSIVE FOR ALL TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_own_lab_all" ON "public"."lims_staff_certificates" AS PERMISSIVE FOR ALL TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())))
  WITH CHECK (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_cat_hcdc_insert" ON "public"."lims_standards" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cat_hcdc_update" ON "public"."lims_standards" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text))
  WITH CHECK ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_cat_select" ON "public"."lims_standards" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = ANY (ARRAY['hcdc_admin'::text, 'lab_admin'::text])));
CREATE POLICY "lims_stocktake_lines_hcdc_select" ON "public"."lims_stocktake_lines" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_stocktake_lines_lab_select" ON "public"."lims_stocktake_lines" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "lims_stocktakes_hcdc_select" ON "public"."lims_stocktakes" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lims_current_role() = 'hcdc_admin'::text));
CREATE POLICY "lims_stocktakes_lab_select" ON "public"."lims_stocktakes" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "Enable read access for all users" ON "public"."logistics_items" AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY "authenticated_full_access" ON "public"."logistics_items" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."logistics_logs" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."notifications" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Cho phép người dùng hệ thống xem danh mục tác nhân" ON "public"."pathogens" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Chỉ Admin mới được thay đổi danh mục tác nhân" ON "public"."pathogens" AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
CREATE POLICY "lims_profiles_hcdc_select" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'hcdc_admin'::text) AND (lower(COALESCE(role, ''::text)) = ANY (ARRAY['lab_admin'::text, 'hcdc_admin'::text]))));
CREATE POLICY "lims_profiles_lab_admin_select" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lims_current_role() = 'lab_admin'::text) AND (lower(COALESCE(role, ''::text)) = 'lab_admin'::text) AND (lab_id IS NOT NULL) AND (lab_id = lims_current_lab_id())));
CREATE POLICY "p_admin_all" ON "public"."profiles" AS PERMISSIVE FOR ALL TO authenticated
  USING ((current_user_role() = 'admin'::text))
  WITH CHECK ((current_user_role() = 'admin'::text));
CREATE POLICY "p_self_select" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((id = auth.uid()));
CREATE POLICY "p_ward_select" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((current_user_role() = 'ward_admin'::text) AND row_in_my_ward(workplace_ma_xa, fax)));
CREATE POLICY "p_ward_update" ON "public"."profiles" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((current_user_role() = 'ward_admin'::text) AND row_in_my_ward(workplace_ma_xa, fax)))
  WITH CHECK (((current_user_role() = 'ward_admin'::text) AND row_in_my_ward(workplace_ma_xa, fax) AND (COALESCE("position", ''::text) <> 'Leader'::text) AND (role = ( SELECT p.role
   FROM profiles p
  WHERE (p.id = profiles.id))) AND (workplace_ma_xa = ( SELECT p.workplace_ma_xa
   FROM profiles p
  WHERE (p.id = profiles.id)))));
CREATE POLICY "authenticated_full_access" ON "public"."roster_assignments" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."roster_schedules" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON "public"."rrt_qualifications" AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY "teq_admin_write" ON "public"."technique_equivalences" AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (lower(p.role) = ANY (ARRAY['admin'::text, 'super_admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (lower(p.role) = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "teq_select_all" ON "public"."technique_equivalences" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "tt_select_all" ON "public"."test_types" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "tt_write_admin" ON "public"."test_types" AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
CREATE POLICY "training_courses_select_scoped" ON "public"."training_courses" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (EXISTS ( SELECT 1
   FROM training_records tr
  WHERE ((tr.course_id = training_courses.id) AND ((tr.profile_id = auth.uid()) OR (tr.user_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM ((training_records tr
     JOIN profiles student ON ((student.id = COALESCE(tr.profile_id, tr.user_id))))
     JOIN profiles me ON ((me.id = auth.uid())))
  WHERE ((tr.course_id = training_courses.id) AND (me.role = 'ward_admin'::text) AND (me.workplace_ma_xa IS NOT NULL) AND (student.workplace_ma_xa = me.workplace_ma_xa))))));
CREATE POLICY "training_courses_write_admin" ON "public"."training_courses" AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "training_records_select_scoped" ON "public"."training_records" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))) OR (profile_id = auth.uid()) OR (user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (profiles me
     JOIN profiles student ON ((student.id = COALESCE(training_records.profile_id, training_records.user_id))))
  WHERE ((me.id = auth.uid()) AND (me.role = 'ward_admin'::text) AND (me.workplace_ma_xa IS NOT NULL) AND (student.workplace_ma_xa = me.workplace_ma_xa))))));
CREATE POLICY "training_records_write_admin" ON "public"."training_records" AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'super_admin'::text]))))));
CREATE POLICY "Cho phép tất cả mọi người tăng lượt view" ON "public"."website_stats" AS PERMISSIVE FOR UPDATE TO public
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Cho phép tất cả mọi người đọc lượt view" ON "public"."website_stats" AS PERMISSIVE FOR SELECT TO public
  USING (true);

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deployment_history" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deployment_history" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."deployment_history" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."geography_columns" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."geography_columns" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."geography_columns" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."geometry_columns" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."geometry_columns" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."geometry_columns" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."helpers" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."helpers" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."helpers" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."helpers_backup_pre_fix" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."helpers_backup_pre_fix" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."helpers_backup_pre_fix" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_activities" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_activities" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_activities" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_assessments" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_assessments" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_assessments" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_logistics" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_logistics" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_logistics" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_logs" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_logs" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_logs" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_objectives" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_objectives" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_objectives" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_plans" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_plans" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_plans" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_reports" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_reports" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incident_reports" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incidents" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incidents" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."incidents" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."inventory_transactions" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."inventory_transactions" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."inventory_transactions" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_capabilities" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_capabilities" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_capabilities" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_dispatch_log" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_dispatch_log" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_dispatch_log" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_equipments" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_equipments" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_equipments" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_inventory" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_inventory" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lab_inventory" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."laboratories" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."laboratories" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."laboratories" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."library_docs" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."library_docs" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."library_docs" TO "service_role";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_alert_log" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_alert_log" TO "service_role";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_alert_settings" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_alert_settings" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."lims_api_keys" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_api_keys" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_catalog_log" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_catalog_log" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_certificate_types" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_certificate_types" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_custom_field_values" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_custom_field_values" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_custom_fields" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_custom_fields" TO "service_role";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_disease_report_lines" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_disease_report_lines" TO "service_role";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_disease_report_log" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_disease_report_log" TO "service_role";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_disease_reports" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_disease_reports" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_equipment_catalog" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_equipment_catalog" TO "service_role";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_import_log" TO "anon";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_import_log" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_import_log" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_lab_daily_load" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_lab_daily_load" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_lab_history" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_lab_history" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_lab_operating_status" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_lab_operating_status" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_lab_staff" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_lab_staff" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_lab_standards" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_lab_standards" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_reagent_catalog" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_reagent_catalog" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_report_presets" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_report_presets" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_staff_certificates" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_staff_certificates" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_standards" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_standards" TO "service_role";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_stocktake_lines" TO "anon";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_stocktake_lines" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_stocktake_lines" TO "service_role";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_stocktakes" TO "anon";
GRANT REFERENCES, SELECT, TRIGGER ON TABLE "public"."lims_stocktakes" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lims_stocktakes" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."logistics_items" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."logistics_items" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."logistics_items" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."logistics_logs" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."logistics_logs" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."logistics_logs" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notifications" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notifications" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notifications" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pathogens" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pathogens" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pathogens" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roster_assignments" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roster_assignments" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roster_assignments" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roster_schedules" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roster_schedules" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roster_schedules" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rrt_qualifications" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rrt_qualifications" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rrt_qualifications" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."spatial_ref_sys" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."spatial_ref_sys" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."spatial_ref_sys" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."technique_equivalences" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."technique_equivalences" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."technique_equivalences" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_types" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_types" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."test_types" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."training_courses" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."training_courses" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."training_courses" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."training_records" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."training_records" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."training_records" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ward_codes" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ward_codes" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ward_codes" TO "service_role";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."website_stats" TO "anon";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."website_stats" TO "authenticated";
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."website_stats" TO "service_role";

