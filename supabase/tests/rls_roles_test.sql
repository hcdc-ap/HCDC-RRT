-- ============================================================================
-- Kiểm thử phân quyền RLS (migration 20260929000000_rrt_rls_roles.sql)
-- Chạy bằng supabase/tests/run.sh trên Postgres CỤC BỘ — KHÔNG chạy trên
-- database thật (script tạo và sửa dữ liệu mẫu).
-- Mỗi kiểm tra in "PASS: ..." hoặc "FAIL: ...".
-- ============================================================================
\set ON_ERROR_STOP 1
SET client_min_messages = notice;

-- ---------- Công cụ kiểm tra ----------
CREATE SCHEMA rrt_test;
GRANT USAGE ON SCHEMA rrt_test TO authenticated, anon;

-- Chuyển người dùng (giống Supabase: JWT claims + role authenticated)
CREATE FUNCTION rrt_test.login(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, false);
END $$;

CREATE FUNCTION rrt_test.eq(p_name text, p_got bigint, p_want bigint) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS NOT DISTINCT FROM p_want THEN
    RAISE NOTICE 'PASS: %', p_name;
  ELSE
    RAISE NOTICE 'FAIL: % (được %, cần %)', p_name, p_got, p_want;
  END IF;
END $$;

-- Chạy câu lệnh ghi; trả số dòng bị ảnh hưởng, -1 nếu bị từ chối (lỗi)
CREATE FUNCTION rrt_test.exec(p_sql text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RETURN -1;
END $$;

-- Ghi phải bị chặn: lỗi (-1) hoặc 0 dòng
CREATE FUNCTION rrt_test.denied(p_name text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint := rrt_test.exec(p_sql);
BEGIN
  IF n <= 0 THEN RAISE NOTICE 'PASS: %', p_name;
  ELSE RAISE NOTICE 'FAIL: % (không bị chặn, % dòng)', p_name, n; END IF;
END $$;

CREATE FUNCTION rrt_test.allowed(p_name text, p_sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint := rrt_test.exec(p_sql);
BEGIN
  IF n > 0 THEN RAISE NOTICE 'PASS: %', p_name;
  ELSE RAISE NOTICE 'FAIL: % (bị chặn: %)', p_name, n; END IF;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA rrt_test TO authenticated, anon;

-- ---------- Dữ liệu mẫu (chạy bằng postgres, không qua RLS) ----------
INSERT INTO public.ward_codes (ten_xa, ma_xa) VALUES ('Phường A', 'XA'), ('Phường B', 'XB');

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@t.vn'),
  ('00000000-0000-0000-0000-0000000000a1', 'ward.a@t.vn'),
  ('00000000-0000-0000-0000-0000000000b1', 'ward.b@t.vn'),
  ('00000000-0000-0000-0000-000000000001', 's1@t.vn'),
  ('00000000-0000-0000-0000-000000000002', 's2@t.vn'),
  ('00000000-0000-0000-0000-000000000003', 's3@t.vn'),
  ('00000000-0000-0000-0000-0000000000ff', 'pending@t.vn'),
  ('00000000-0000-0000-0000-0000000000c1', 'h1@t.vn');

-- Tuyến cơ sở và nhân viên phường A: Trạm Y tế; nhân viên phường B: s3
INSERT INTO public.profiles (id, email, role, registration_status, approval_status, fax, workplace_ward, team) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'admin@t.vn', 'admin', 'approved', 'approved', NULL, NULL, 'HCDC'),
  ('00000000-0000-0000-0000-0000000000a1', 'ward.a@t.vn', 'ward_admin', 'approved', 'approved', 'Trạm Y tế Phường/Xã/ Đặc khu', 'Phường A', 'Đội A'),
  ('00000000-0000-0000-0000-0000000000b1', 'ward.b@t.vn', 'ward_admin', 'approved', 'approved', 'Trạm Y tế Phường/Xã/ Đặc khu', 'Phường B', 'Đội B'),
  ('00000000-0000-0000-0000-000000000001', 's1@t.vn', 'user', 'approved', 'approved', 'Trạm Y tế Phường/Xã/ Đặc khu', 'Phường A', 'Đội A'),
  ('00000000-0000-0000-0000-000000000002', 's2@t.vn', 'user', 'approved', 'pending', 'Trạm Y tế Phường/Xã/ Đặc khu', 'Phường A', 'Đội A'),
  ('00000000-0000-0000-0000-000000000003', 's3@t.vn', 'user', 'approved', 'approved', 'Trạm Y tế Phường/Xã/ Đặc khu', 'Phường B', 'Đội B'),
  ('00000000-0000-0000-0000-0000000000ff', 'pending@t.vn', 'user', 'pending', 'pending', 'Trạm Y tế Phường/Xã/ Đặc khu', 'Phường A', 'Đội A'),
  -- h1: nhân viên HCDC (không thuộc phường/xã nào), được HCDC điều động vào sự kiện A
  ('00000000-0000-0000-0000-0000000000c1', 'h1@t.vn', 'user', 'approved', 'approved', 'HCDC', NULL, 'HCDC');

-- Sự kiện: IA ở phường A (s1 được điều động), IB ở phường B (s3)
INSERT INTO public.incidents (id, event_name, status, ma_xa, initial_selected_members, members) VALUES
  ('10000000-0000-0000-0000-00000000000a', 'Ổ dịch A', 'active', 'XA', 's1@t.vn', 'h1@t.vn'),
  ('10000000-0000-0000-0000-00000000000b', 'Ổ dịch B', 'active', 'XB', 's3@t.vn', NULL);
-- (trigger handle_new_incident đã tạo sẵn kế hoạch, nhật ký, nhiệm vụ... cho mỗi sự kiện)

INSERT INTO public.roster_schedules (id, team_name, duty_date, created_by) VALUES
  ('20000000-0000-0000-0000-00000000000a', 'Đội A', '2026-10-01', '00000000-0000-0000-0000-0000000000a1'),
  ('20000000-0000-0000-0000-00000000000b', 'Đội B', '2026-10-01', '00000000-0000-0000-0000-0000000000b1');
INSERT INTO public.roster_assignments (id, schedule_id, user_id, assignment_status) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000001', 'assigned'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'assigned'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000003', 'assigned');

INSERT INTO public.notifications (id, user_email, message) VALUES
  ('40000000-0000-0000-0000-000000000001', 's1@t.vn', 'cho s1'),
  ('40000000-0000-0000-0000-000000000002', 's2@t.vn', 'cho s2'),
  ('40000000-0000-0000-0000-000000000003', 's3@t.vn', 'cho s3'),
  -- Luồng cũ lưu email khác hoa/thường hoặc lưu uid vào user_email
  ('40000000-0000-0000-0000-000000000011', 'S1@T.VN', 'cho s1 (email viết hoa)'),
  ('40000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'cho s1 (theo uid)');

INSERT INTO public.rrt_qualifications (profile_id, skills) VALUES
  ('00000000-0000-0000-0000-000000000001', '["xét nghiệm"]'),
  ('00000000-0000-0000-0000-000000000003', '["dịch tễ"]');

INSERT INTO public.logistics_items (item_name, quantity) VALUES ('Khẩu trang', 100);
INSERT INTO public.helpers (category, name) VALUES ('ward', 'Phường A');

SET ROLE authenticated;

-- ============================================================================
\echo '--- Khách CHƯA đăng nhập (anon) ---'
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
SELECT rrt_test.eq('anon: không đọc được kho vật tư', (SELECT count(*) FROM public.logistics_items), 0);
SELECT rrt_test.denied('anon: không gọi được update_incident_membership',
  $$SELECT public.update_incident_membership('10000000-0000-0000-0000-00000000000a', 's1@t.vn', 'decline')$$);
RESET ROLE; SET ROLE authenticated;

-- ============================================================================
\echo '--- Tài khoản CHƯA DUYỆT (pending, phường A) ---'
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000ff');
SELECT rrt_test.eq('pending: chỉ thấy hồ sơ của mình', (SELECT count(*) FROM public.profiles), 1);
SELECT rrt_test.eq('pending: không thấy sự kiện', (SELECT count(*) FROM public.incidents), 0);
SELECT rrt_test.eq('pending: không thấy nhật ký sự kiện', (SELECT count(*) FROM public.incident_logs), 0);
SELECT rrt_test.eq('pending: không thấy lịch trực', (SELECT count(*) FROM public.roster_schedules), 0);
SELECT rrt_test.eq('pending: không thấy phân công', (SELECT count(*) FROM public.roster_assignments), 0);
SELECT rrt_test.eq('pending: không thấy thông báo', (SELECT count(*) FROM public.notifications), 0);
SELECT rrt_test.eq('pending: không thấy kho vật tư', (SELECT count(*) FROM public.logistics_items), 0);
SELECT rrt_test.eq('pending: xem được danh mục helpers (cho form hồ sơ)', (SELECT count(*) FROM public.helpers), 1);
SELECT rrt_test.denied('pending: không tạo được thông báo',
  $$INSERT INTO public.notifications (user_email, message) VALUES ('s1@t.vn', 'x')$$);
SELECT rrt_test.denied('pending: không tạo được sự kiện',
  $$INSERT INTO public.incidents (event_name, ma_xa) VALUES ('giả', 'XA')$$);
SELECT rrt_test.allowed('pending: tự sửa hồ sơ của mình (họ tên)',
  $$UPDATE public.profiles SET full_name = 'Người mới' WHERE id = auth.uid()$$);
SELECT rrt_test.denied('pending: không tự duyệt tài khoản',
  $$UPDATE public.profiles SET registration_status = 'approved' WHERE id = auth.uid()$$);
SELECT rrt_test.denied('pending: không tự duyệt hồ sơ',
  $$UPDATE public.profiles SET approval_status = 'approved' WHERE id = auth.uid()$$);
SELECT rrt_test.denied('pending: không tự nâng quyền admin',
  $$UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid()$$);
SELECT rrt_test.denied('pending: không tự gán Leader',
  $$UPDATE public.profiles SET position = 'Leader' WHERE id = auth.uid()$$);
SELECT rrt_test.allowed('pending: tự chọn nơi công tác khi đăng ký',
  $$UPDATE public.profiles SET workplace_ward = 'Phường B' WHERE id = auth.uid()$$);
SELECT rrt_test.eq('pending: nơi công tác đã đổi (chưa duyệt thì được)',
  (SELECT count(*) FROM public.profiles WHERE id = auth.uid() AND workplace_ma_xa = 'XB'), 1);
UPDATE public.profiles SET workplace_ward = 'Phường A' WHERE id = auth.uid();
SELECT rrt_test.allowed('pending: tự lưu năng lực chuyên môn',
  $$INSERT INTO public.rrt_qualifications (profile_id, skills) VALUES (auth.uid(), '["mới"]')$$);

-- ============================================================================
\echo '--- Nhân viên s1 (phường A, đội A, được điều động sự kiện A) ---'
SELECT rrt_test.login('00000000-0000-0000-0000-000000000001');
SELECT rrt_test.eq('s1: chỉ thấy hồ sơ của mình', (SELECT count(*) FROM public.profiles), 1);
SELECT rrt_test.eq('s1: chỉ thấy sự kiện được điều động', (SELECT count(*) FROM public.incidents), 1);
SELECT rrt_test.eq('s1: thấy nhật ký sự kiện A, không thấy của B',
  (SELECT count(*) FROM public.incident_logs WHERE incident_id = '10000000-0000-0000-0000-00000000000b'), 0);
SELECT rrt_test.eq('s1: thấy kế hoạch sự kiện A',
  (SELECT count(*) FROM public.incident_plans WHERE incident_id = '10000000-0000-0000-0000-00000000000a'), 1);
SELECT rrt_test.eq('s1: thấy lịch trực đội mình (không thấy đội B)', (SELECT count(*) FROM public.roster_schedules), 1);
SELECT rrt_test.eq('s1: thấy cả đội trong ca (s1 + s2)', (SELECT count(*) FROM public.roster_assignments), 2);
SELECT rrt_test.eq('s1: chỉ thấy thông báo của mình (kể cả lưu email viết hoa / uid)', (SELECT count(*) FROM public.notifications), 3);
SELECT rrt_test.eq('s1: không đọc được action_token của người khác',
  (SELECT count(*) FROM public.notifications WHERE lower(user_email) <> 's1@t.vn' AND user_email <> auth.uid()::text), 0);
SELECT rrt_test.allowed('s1: đánh dấu đã đọc theo email viết hoa (incident-response.js)',
  $$UPDATE public.notifications SET is_read = true WHERE user_email = 'S1@T.VN'$$);
SELECT rrt_test.eq('s1: chỉ thấy năng lực của mình', (SELECT count(*) FROM public.rrt_qualifications), 1);
SELECT rrt_test.eq('s1: xem được kho vật tư', (SELECT count(*) FROM public.logistics_items), 1);
SELECT rrt_test.allowed('s1: nhận ca trực của mình',
  $$UPDATE public.roster_assignments SET assignment_status = 'confirmed' WHERE id = '30000000-0000-0000-0000-000000000001'$$);
SELECT rrt_test.denied('s1: không trả lời thay ca của s2',
  $$UPDATE public.roster_assignments SET assignment_status = 'declined' WHERE id = '30000000-0000-0000-0000-000000000002'$$);
SELECT rrt_test.denied('s1: không chuyển ca của mình cho người khác',
  $$UPDATE public.roster_assignments SET user_id = '00000000-0000-0000-0000-000000000002' WHERE id = '30000000-0000-0000-0000-000000000001'$$);
SELECT rrt_test.allowed('s1: đánh dấu đã đọc thông báo của mình',
  $$UPDATE public.notifications SET is_read = true WHERE id = '40000000-0000-0000-0000-000000000001'$$);
SELECT rrt_test.denied('s1: không sửa nội dung thông báo',
  $$UPDATE public.notifications SET message = 'sửa' WHERE id = '40000000-0000-0000-0000-000000000001'$$);
SELECT rrt_test.denied('s1: không đọc/sửa thông báo của s2',
  $$UPDATE public.notifications SET is_read = true WHERE id = '40000000-0000-0000-0000-000000000002'$$);
SELECT rrt_test.denied('s1: không xóa thông báo',
  $$DELETE FROM public.notifications WHERE id = '40000000-0000-0000-0000-000000000001'$$);
SELECT rrt_test.allowed('s1: xác nhận tham gia sự kiện A (RPC)',
  $$SELECT public.update_incident_membership('10000000-0000-0000-0000-00000000000a', 's1@t.vn', 'confirm')$$);
SELECT rrt_test.eq('s1: sau xác nhận, s1 có trong members (h1 vẫn giữ nguyên)',
  (SELECT count(*) FROM public.incidents WHERE members = 'h1@t.vn;s1@t.vn'), 1);
SELECT rrt_test.denied('s1: không trả lời thay người khác (RPC)',
  $$SELECT public.update_incident_membership('10000000-0000-0000-0000-00000000000a', 's2@t.vn', 'confirm')$$);
SELECT rrt_test.denied('s1: không tự thêm mình vào sự kiện không được điều động (RPC)',
  $$SELECT public.update_incident_membership('10000000-0000-0000-0000-00000000000b', 's1@t.vn', 'confirm')$$);
SELECT rrt_test.denied('s1: không sửa trực tiếp danh sách thành viên sự kiện',
  $$UPDATE public.incidents SET members = '' WHERE id = '10000000-0000-0000-0000-00000000000a'$$);
SELECT rrt_test.denied('s1: không tạo sự kiện',
  $$INSERT INTO public.incidents (event_name, ma_xa) VALUES ('giả', 'XA')$$);
SELECT rrt_test.allowed('s1: ghi lịch sử xác nhận của mình',
  $$INSERT INTO public.deployment_history (incident_id, user_id, action_type) VALUES ('10000000-0000-0000-0000-00000000000a', auth.uid(), 'deployed')$$);
SELECT rrt_test.denied('s1: không ghi lịch sử điều động cho người khác',
  $$INSERT INTO public.deployment_history (incident_id, user_id, action_type) VALUES ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'deployed')$$);
SELECT rrt_test.allowed('s1: viết nhật ký hiện trường sự kiện A',
  $$INSERT INTO public.incident_logs (incident_id, user_id, content) VALUES ('10000000-0000-0000-0000-00000000000a', auth.uid(), 'đã tới')$$);
SELECT rrt_test.denied('s1: không viết nhật ký sự kiện B',
  $$INSERT INTO public.incident_logs (incident_id, user_id, content) VALUES ('10000000-0000-0000-0000-00000000000b', auth.uid(), 'x')$$);
SELECT rrt_test.denied('s1: không sửa kế hoạch sự kiện',
  $$UPDATE public.incident_plans SET summary = 'x' WHERE incident_id = '10000000-0000-0000-0000-00000000000a'$$);
SELECT rrt_test.denied('s1: không sửa kho vật tư',
  $$UPDATE public.logistics_items SET quantity = 0$$);
SELECT rrt_test.allowed('s1: tự sửa hồ sơ, gửi duyệt lại (approval_status = pending)',
  $$UPDATE public.profiles SET phone = '0900', approval_status = 'pending' WHERE id = auth.uid()$$);
SELECT rrt_test.eq('s1: sau khi gửi duyệt lại vẫn truy cập được (tài khoản vẫn đã duyệt)',
  (SELECT count(*) FROM public.incidents), 1);

-- ============================================================================
\echo '--- Tuyến cơ sở phường A ---'
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000a1');
SELECT rrt_test.eq('ward A: thấy hồ sơ trong phường (mình, s1, s2, pending)', (SELECT count(*) FROM public.profiles), 4);
SELECT rrt_test.eq('ward A: chỉ thấy sự kiện phường A', (SELECT count(*) FROM public.incidents), 1);
SELECT rrt_test.eq('ward A: thấy thông báo nhân sự phường A (3 của s1, 1 của s2)', (SELECT count(*) FROM public.notifications), 4);
SELECT rrt_test.allowed('ward A: báo đóng sự kiện cho thành viên HCDC ngoài phường (shell.js)',
  $$INSERT INTO public.notifications (user_email, message, incident_id) VALUES ('h1@t.vn', 'đóng sự kiện', '10000000-0000-0000-0000-00000000000a')$$);
SELECT rrt_test.denied('ward A: không mượn sự kiện để báo người ngoài sự kiện',
  $$INSERT INTO public.notifications (user_email, message, incident_id) VALUES ('s3@t.vn', 'x', '10000000-0000-0000-0000-00000000000a')$$);
SELECT rrt_test.denied('ward A: không báo thành viên sự kiện phường B',
  $$INSERT INTO public.notifications (user_email, message, incident_id) VALUES ('s3@t.vn', 'x', '10000000-0000-0000-0000-00000000000b')$$);
SELECT rrt_test.denied('ward A: không sửa thông báo của nhân sự',
  $$UPDATE public.notifications SET is_read = false WHERE user_email = 's2@t.vn'$$);
SELECT rrt_test.denied('ward A: không xóa thông báo',
  $$DELETE FROM public.notifications WHERE user_email = 's2@t.vn'$$);
SELECT rrt_test.eq('ward A: thấy năng lực nhân sự phường A', (SELECT count(*) FROM public.rrt_qualifications), 2);
SELECT rrt_test.eq('ward A: thấy lịch trực mình tạo', (SELECT count(*) FROM public.roster_schedules), 1);
SELECT rrt_test.allowed('ward A: duyệt tài khoản đăng ký trong phường',
  $$UPDATE public.profiles SET approval_status = 'approved' WHERE id = '00000000-0000-0000-0000-0000000000ff'$$);
SELECT rrt_test.eq('ward A: duyệt hồ sơ → tài khoản được mở (registration_status)',
  (SELECT count(*) FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000000ff' AND registration_status = 'approved'), 1);
SELECT rrt_test.denied('ward A: không duyệt người phường B',
  $$UPDATE public.profiles SET approval_status = 'approved' WHERE id = '00000000-0000-0000-0000-000000000003'$$);
SELECT rrt_test.denied('ward A: không nâng quyền nhân sự thành admin',
  $$UPDATE public.profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-000000000001'$$);
SELECT rrt_test.allowed('ward A: sửa năng lực chuyên môn nhân sự phường A',
  $$UPDATE public.rrt_qualifications SET skills = '["cập nhật"]' WHERE profile_id = '00000000-0000-0000-0000-000000000001'$$);
SELECT rrt_test.denied('ward A: không sửa năng lực nhân sự phường B',
  $$UPDATE public.rrt_qualifications SET skills = '["x"]' WHERE profile_id = '00000000-0000-0000-0000-000000000003'$$);
SELECT rrt_test.allowed('ward A: tạo sự kiện phường A',
  $$INSERT INTO public.incidents (event_name, ma_xa, initial_selected_members) VALUES ('Ổ dịch A2', 'XA', 's2@t.vn') RETURNING id$$);
SELECT rrt_test.denied('ward A: không tạo sự kiện ở phường B',
  $$INSERT INTO public.incidents (event_name, ma_xa) VALUES ('sai phường', 'XB')$$);
SELECT rrt_test.denied('ward A: không điều động người phường B',
  $$UPDATE public.incidents SET initial_selected_members = 's1@t.vn;s3@t.vn' WHERE id = '10000000-0000-0000-0000-00000000000a'$$);
SELECT rrt_test.allowed('ward A: điều động thêm người phường A',
  $$UPDATE public.incidents SET initial_selected_members = 's1@t.vn;s2@t.vn' WHERE id = '10000000-0000-0000-0000-00000000000a'$$);
SELECT rrt_test.denied('ward A: không chuyển sự kiện sang phường B',
  $$UPDATE public.incidents SET ma_xa = 'XB' WHERE id = '10000000-0000-0000-0000-00000000000a'$$);
SELECT rrt_test.denied('ward A: không sửa sự kiện phường B',
  $$UPDATE public.incidents SET status = 'closed' WHERE id = '10000000-0000-0000-0000-00000000000b'$$);
SELECT rrt_test.denied('ward A: không xóa sự kiện (chỉ Quản trị)',
  $$DELETE FROM public.incidents WHERE id = '10000000-0000-0000-0000-00000000000a'$$);
SELECT rrt_test.allowed('ward A: sửa kế hoạch sự kiện phường A',
  $$UPDATE public.incident_plans SET summary = 'kế hoạch' WHERE incident_id = '10000000-0000-0000-0000-00000000000a'$$);
SELECT rrt_test.allowed('ward A: gửi thông báo cho nhân sự phường A',
  $$INSERT INTO public.notifications (user_email, message) VALUES ('s2@t.vn', 'họp') RETURNING id$$);
SELECT rrt_test.denied('ward A: không gửi thông báo cho người phường B',
  $$INSERT INTO public.notifications (user_email, message) VALUES ('s3@t.vn', 'x')$$);
SELECT rrt_test.allowed('ward A: tạo lịch trực',
  $$INSERT INTO public.roster_schedules (id, team_name, duty_date) VALUES ('20000000-0000-0000-0000-0000000000a2', 'Đội A', '2026-10-02') RETURNING id$$);
SELECT rrt_test.allowed('ward A: phân công nhân sự phường A',
  $$INSERT INTO public.roster_assignments (schedule_id, user_id) VALUES ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000002')$$);
SELECT rrt_test.denied('ward A: không phân công người phường B',
  $$INSERT INTO public.roster_assignments (schedule_id, user_id) VALUES ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000003')$$);
SELECT rrt_test.denied('ward A: không sửa lịch trực do phường B tạo',
  $$UPDATE public.roster_schedules SET note = 'x' WHERE id = '20000000-0000-0000-0000-00000000000b'$$);
SELECT rrt_test.allowed('ward A: xóa lịch trực do mình tạo',
  $$DELETE FROM public.roster_schedules WHERE id = '20000000-0000-0000-0000-0000000000a2'$$);
SELECT rrt_test.denied('ward A: không ghi nhận đào tạo',
  $$INSERT INTO public.training_records (profile_id) VALUES ('00000000-0000-0000-0000-000000000001')$$);
SELECT rrt_test.denied('ward A: không sửa kho vật tư',
  $$UPDATE public.logistics_items SET quantity = 0$$);

-- ============================================================================
\echo '--- Quản trị HCDC ---'
SELECT rrt_test.login('00000000-0000-0000-0000-00000000000a');
SELECT rrt_test.eq('admin: thấy mọi sự kiện', (SELECT count(*) FROM public.incidents), 3);
SELECT rrt_test.eq('admin: thấy mọi thông báo', (SELECT count(*) FROM public.notifications), 7);
SELECT rrt_test.allowed('admin: xóa thông báo', $$DELETE FROM public.notifications WHERE message = 'họp'$$);
SELECT rrt_test.allowed('admin: điều động người mọi phường',
  $$UPDATE public.incidents SET initial_selected_members = 's1@t.vn;s3@t.vn' WHERE id = '10000000-0000-0000-0000-00000000000a'$$);
SELECT rrt_test.allowed('admin: sửa kho vật tư', $$UPDATE public.logistics_items SET quantity = 90$$);
SELECT rrt_test.allowed('admin: xóa sự kiện', $$DELETE FROM public.incidents WHERE event_name = 'Ổ dịch A2'$$);


-- ============================================================================
\echo '--- Tự sửa hồ sơ không được dùng để leo quyền ---'
SELECT rrt_test.login('00000000-0000-0000-0000-000000000003');
SELECT rrt_test.allowed('s3: lưu hồ sơ kèm email khác (form gửi kèm email)',
  $$UPDATE public.profiles SET email = 'S1@T.vn', phone = '0911' WHERE id = auth.uid()$$);
SELECT rrt_test.eq('s3: email hồ sơ giữ nguyên', (SELECT count(*) FROM public.profiles WHERE email = 's3@t.vn'), 1);
SELECT rrt_test.eq('s3: vẫn không thấy thông báo của s1',
  (SELECT count(*) FROM public.notifications WHERE lower(user_email) = 's1@t.vn'), 0);
SELECT rrt_test.allowed('s3: lưu hồ sơ kèm nơi công tác khác',
  $$UPDATE public.profiles SET workplace_ward = 'Phường A', fax = 'UBND Phường/Xã/ Đặc khu' WHERE id = auth.uid()$$);
SELECT rrt_test.eq('s3: nơi công tác giữ nguyên (đã duyệt)',
  (SELECT count(*) FROM public.profiles WHERE id = auth.uid() AND workplace_ma_xa = 'XB' AND fax = 'Trạm Y tế Phường/Xã/ Đặc khu'), 1);

SELECT rrt_test.login('00000000-0000-0000-0000-0000000000b1');
SELECT rrt_test.allowed('ward B: lưu hồ sơ kèm nơi công tác phường A',
  $$UPDATE public.profiles SET workplace_ward = 'Phường A' WHERE id = auth.uid()$$);
SELECT rrt_test.eq('ward B: không thành tuyến cơ sở phường A (không thấy hồ sơ phường A)',
  (SELECT count(*) FROM public.profiles WHERE workplace_ma_xa = 'XA'), 0);

SELECT rrt_test.login('00000000-0000-0000-0000-0000000000a1');
SELECT rrt_test.allowed('ward A: sửa hồ sơ nhân sự (kèm email khác)',
  $$UPDATE public.profiles SET email = 'h1@t.vn', phone = '0922' WHERE id = '00000000-0000-0000-0000-000000000002'$$);
SELECT rrt_test.eq('ward A: không đổi được email nhân sự (tránh mượn email người ngoài phường)',
  (SELECT count(*) FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002' AND email = 's2@t.vn'), 1);

-- ============================================================================
\echo '--- Đội trưởng (Leader) lập báo cáo tình hình ---'
RESET ROLE;
UPDATE public.profiles SET position = 'Leader' WHERE id = '00000000-0000-0000-0000-0000000000c1';
SET ROLE authenticated;
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000c1');
SELECT rrt_test.allowed('Leader h1: lập báo cáo sự kiện A mình tham gia',
  $$INSERT INTO public.incident_reports (incident_id, report_type, cases_new) VALUES ('10000000-0000-0000-0000-00000000000a', 'Tiến độ', 2) RETURNING id$$);
SELECT rrt_test.denied('Leader h1: không lập báo cáo sự kiện B không tham gia',
  $$INSERT INTO public.incident_reports (incident_id, report_type) VALUES ('10000000-0000-0000-0000-00000000000b', 'x')$$);
SELECT rrt_test.denied('Leader h1: không sửa báo cáo',
  $$UPDATE public.incident_reports SET cases_new = 99 WHERE incident_id = '10000000-0000-0000-0000-00000000000a'$$);
SELECT rrt_test.denied('Leader h1: không sửa phương án (IAP)',
  $$UPDATE public.incident_plans SET summary = 'x' WHERE incident_id = '10000000-0000-0000-0000-00000000000a'$$);
SELECT rrt_test.login('00000000-0000-0000-0000-000000000001');
SELECT rrt_test.denied('s1 (không phải Leader): không lập báo cáo',
  $$INSERT INTO public.incident_reports (incident_id, report_type) VALUES ('10000000-0000-0000-0000-00000000000a', 'x')$$);

-- ============================================================================
\echo '--- Đề xuất phòng xét nghiệm (tuyến cơ sở / Đội trưởng) ---'
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000a1');
SELECT rrt_test.allowed('ward A: đề xuất PXN cho sự kiện phường A',
  $$INSERT INTO public.lab_dispatch_log (lab_id, incident_id, sample_count, status, dispatched_by)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-00000000000a', 3, 'suggested', auth.uid()) RETURNING id$$);
SELECT rrt_test.denied('ward A: không tự chốt điều phối (chỉ HCDC)',
  $$INSERT INTO public.lab_dispatch_log (lab_id, incident_id, sample_count, status, dispatched_by)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-00000000000a', 3, 'dispatched', auth.uid())$$);
SELECT rrt_test.denied('ward A: không đề xuất cho sự kiện phường B',
  $$INSERT INTO public.lab_dispatch_log (lab_id, incident_id, sample_count, status, dispatched_by)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-00000000000b', 3, 'suggested', auth.uid())$$);
SELECT rrt_test.denied('ward A: không đề xuất đứng tên người khác',
  $$INSERT INTO public.lab_dispatch_log (lab_id, sample_count, status, dispatched_by)
    VALUES (gen_random_uuid(), 3, 'suggested', '00000000-0000-0000-0000-000000000001')$$);
SELECT rrt_test.eq('ward A: báo HCDC qua rrt_notify_admins (1 quản trị)',
  (SELECT public.rrt_notify_admins('Đề xuất điều 3 mẫu', '10000000-0000-0000-0000-00000000000a')), 1);
SELECT rrt_test.eq('ward A: không đọc được thông báo gửi HCDC',
  (SELECT count(*) FROM public.notifications WHERE user_email = 'admin@t.vn'), 0);

SELECT rrt_test.login('00000000-0000-0000-0000-0000000000c1');
SELECT rrt_test.allowed('Leader h1: đề xuất PXN cho sự kiện A đang tham gia',
  $$INSERT INTO public.lab_dispatch_log (lab_id, incident_id, sample_count, status, dispatched_by)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-00000000000a', 2, 'suggested', auth.uid())$$);

SELECT rrt_test.login('00000000-0000-0000-0000-000000000001');
SELECT rrt_test.denied('s1 (không phải Leader): không đề xuất PXN',
  $$INSERT INTO public.lab_dispatch_log (lab_id, sample_count, status, dispatched_by)
    VALUES (gen_random_uuid(), 3, 'suggested', auth.uid())$$);
SELECT rrt_test.denied('s1: không gọi được rrt_notify_admins',
  $$SELECT public.rrt_notify_admins('spam', NULL)$$);

-- ============================================================================
\echo '--- Mã action_token gửi PXN bị ẩn ---'
RESET ROLE;
INSERT INTO public.lab_dispatch_log (id, lab_id, incident_id, status, action_token)
  VALUES ('50000000-0000-0000-0000-000000000001', gen_random_uuid(), '10000000-0000-0000-0000-00000000000b', 'inquiry_sent', 'TOKEN-BI-MAT');
SET ROLE authenticated;
SELECT rrt_test.login('00000000-0000-0000-0000-000000000001');
SELECT rrt_test.denied('s1: không đọc được action_token',
  $$SELECT action_token FROM public.lab_dispatch_log$$);
SELECT rrt_test.denied('s1: select * cũng bị chặn (lộ token)',
  $$SELECT * FROM public.lab_dispatch_log$$);
SELECT rrt_test.allowed('s1: vẫn đọc được các cột khác (trạng thái điều phối)',
  $$SELECT id, lab_id, status FROM public.lab_dispatch_log WHERE id = '50000000-0000-0000-0000-000000000001'$$);
SELECT rrt_test.denied('s1: không dò token bằng điều kiện WHERE',
  $$SELECT id FROM public.lab_dispatch_log WHERE action_token = 'TOKEN-BI-MAT'$$);
SELECT rrt_test.login('00000000-0000-0000-0000-00000000000a');
SELECT rrt_test.denied('admin: cũng không đọc token qua API (chỉ Edge Function)',
  $$SELECT action_token FROM public.lab_dispatch_log$$);
SELECT rrt_test.allowed('admin: vẫn gửi yêu cầu PXN kèm token (ghi được)',
  $$INSERT INTO public.lab_dispatch_log (lab_id, status, action_token, dispatched_by) VALUES (gen_random_uuid(), 'inquiry_sent', 'TOKEN-MOI', auth.uid()) RETURNING id$$);
SELECT rrt_test.allowed('admin: cập nhật trạng thái lệnh điều phối',
  $$UPDATE public.lab_dispatch_log SET status = 'cancelled' WHERE id = '50000000-0000-0000-0000-000000000001'$$);
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000a1');
SELECT rrt_test.denied('ward A: đề xuất không được tự gắn token',
  $$INSERT INTO public.lab_dispatch_log (lab_id, incident_id, status, dispatched_by, action_token)
    VALUES (gen_random_uuid(), '10000000-0000-0000-0000-00000000000a', 'suggested', auth.uid(), 'TOKEN-TU-CHE')$$);

-- ============================================================================
\echo '--- Bảng kết quả tập dượt (rrt_rehearsal) ---'
SELECT rrt_test.login('00000000-0000-0000-0000-000000000001');
SELECT rrt_test.allowed('s1 (đã duyệt): ghi kết quả tập dượt',
  $$INSERT INTO public.rrt_rehearsal (kind, key, data) VALUES ('result', 'A1', '{"status":"pass"}')$$);
SELECT rrt_test.eq('s1: người ghi do trigger đặt, không giả mạo được',
  (SELECT count(*) FROM public.rrt_rehearsal WHERE kind = 'result' AND key = 'A1' AND updated_by = auth.uid()), 1);
SELECT rrt_test.allowed('s1: sửa kết quả',
  $$UPDATE public.rrt_rehearsal SET data = '{"status":"fail","note":"x"}' WHERE kind = 'result' AND key = 'A1'$$);
SELECT rrt_test.denied('s1: không xóa được (chỉ HCDC)',
  $$DELETE FROM public.rrt_rehearsal WHERE kind = 'result' AND key = 'A1'$$);
SELECT rrt_test.denied('s1: không TRUNCATE được (TRUNCATE không qua RLS)',
  $$TRUNCATE public.rrt_rehearsal$$);
SELECT rrt_test.denied('s1: kind lạ bị từ chối',
  $$INSERT INTO public.rrt_rehearsal (kind, key, data) VALUES ('secret', 'x', '{}')$$);
-- Tài khoản chờ duyệt riêng (pending@t.vn đã được duyệt ở phần trên)
RESET ROLE;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000fe', 'pending2@t.vn');
INSERT INTO public.profiles (id, email, role, registration_status, approval_status, fax, workplace_ward, team)
  VALUES ('00000000-0000-0000-0000-0000000000fe', 'pending2@t.vn', 'user', 'pending', 'pending', 'Trạm Y tế Phường/Xã/ Đặc khu', 'Phường A', 'Đội A');
SET ROLE authenticated;
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000fe');
SELECT rrt_test.eq('pending: không đọc được kết quả tập dượt',
  (SELECT count(*) FROM public.rrt_rehearsal), 0);
SELECT rrt_test.denied('pending: không ghi được',
  $$INSERT INTO public.rrt_rehearsal (kind, key, data) VALUES ('result', 'A2', '{}')$$);
RESET ROLE;
SET ROLE anon;
SELECT rrt_test.denied('anon: không đọc được bảng tập dượt',
  $$SELECT * FROM public.rrt_rehearsal$$);
RESET ROLE;
SET ROLE authenticated;
SELECT rrt_test.login('00000000-0000-0000-0000-00000000000a');
SELECT rrt_test.eq('admin: đọc được kết quả', (SELECT count(*) FROM public.rrt_rehearsal), 1);
SELECT rrt_test.allowed('admin: xóa được để dọn dẹp',
  $$DELETE FROM public.rrt_rehearsal WHERE kind = 'result' AND key = 'A1'$$);

RESET ROLE;

-- ============================================================================
\echo '--- Thẻ thành viên sự kiện (rrt_incident_member_cards) ---'
SET ROLE authenticated;
SELECT rrt_test.login('00000000-0000-0000-0000-000000000001');
SELECT rrt_test.eq('s1: không đọc trực tiếp được hồ sơ h1 (HCDC)',
  (SELECT count(*) FROM public.profiles WHERE email = 'h1@t.vn'), 0);
SELECT rrt_test.eq('s1: thấy thẻ thành viên sự kiện A (có s1, h1)',
  (SELECT count(*) FROM public.rrt_incident_member_cards('10000000-0000-0000-0000-00000000000a')
   WHERE email IN ('s1@t.vn', 'h1@t.vn')), 2);
SELECT rrt_test.eq('s1: h1 được đánh dấu khác đơn vị, có đội',
  (SELECT count(*) FROM public.rrt_incident_member_cards('10000000-0000-0000-0000-00000000000a')
   WHERE email = 'h1@t.vn' AND is_external AND team = 'HCDC'), 1);
SELECT rrt_test.eq('s1: chính mình không phải khác đơn vị',
  (SELECT count(*) FROM public.rrt_incident_member_cards('10000000-0000-0000-0000-00000000000a')
   WHERE email = 's1@t.vn' AND NOT is_external), 1);
SELECT rrt_test.eq('s1: không xem thẻ sự kiện B (không tham gia)',
  (SELECT count(*) FROM public.rrt_incident_member_cards('10000000-0000-0000-0000-00000000000b')), 0);
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000b1');
SELECT rrt_test.eq('tuyến cơ sở B: không xem thẻ sự kiện A',
  (SELECT count(*) FROM public.rrt_incident_member_cards('10000000-0000-0000-0000-00000000000a')), 0);
SELECT rrt_test.login('00000000-0000-0000-0000-00000000000a');
SELECT rrt_test.eq('admin: xem thẻ sự kiện A (có s1, h1)',
  (SELECT count(*) FROM public.rrt_incident_member_cards('10000000-0000-0000-0000-00000000000a')
   WHERE email IN ('s1@t.vn', 'h1@t.vn')), 2);
RESET ROLE;
SET ROLE anon;
SELECT rrt_test.denied('anon: không gọi được thẻ thành viên',
  $$SELECT * FROM public.rrt_incident_member_cards('10000000-0000-0000-0000-00000000000a')$$);
RESET ROLE;

-- ============================================================================
\echo '--- Người viết tin nhắn sự kiện (rrt_incident_log_authors) ---'
INSERT INTO public.incident_logs (incident_id, user_id, content) VALUES
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'HCDC tới hỗ trợ');
SET ROLE authenticated;
SELECT rrt_test.login('00000000-0000-0000-0000-000000000001');
SELECT rrt_test.eq('s1: thấy tên người viết h1 (HCDC), đánh dấu khác đơn vị',
  (SELECT count(*) FROM public.rrt_incident_log_authors('10000000-0000-0000-0000-00000000000a')
   WHERE user_id = '00000000-0000-0000-0000-0000000000c1' AND is_external), 1);
SELECT rrt_test.eq('s1: chỉ trả người đã viết trong sự kiện (không có s3)',
  (SELECT count(*) FROM public.rrt_incident_log_authors('10000000-0000-0000-0000-00000000000a')
   WHERE user_id = '00000000-0000-0000-0000-000000000003'), 0);
SELECT rrt_test.eq('s1: không xem người viết sự kiện B',
  (SELECT count(*) FROM public.rrt_incident_log_authors('10000000-0000-0000-0000-00000000000b')), 0);
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000b1');
SELECT rrt_test.eq('tuyến cơ sở B: không xem người viết sự kiện A',
  (SELECT count(*) FROM public.rrt_incident_log_authors('10000000-0000-0000-0000-00000000000a')), 0);
RESET ROLE;
SET ROLE anon;
SELECT rrt_test.denied('anon: không gọi được người viết tin nhắn',
  $$SELECT * FROM public.rrt_incident_log_authors('10000000-0000-0000-0000-00000000000a')$$);
RESET ROLE;

\echo '--- rrt_incident_log_authors: người trong lịch sử điều động ---'
INSERT INTO public.deployment_history (incident_id, user_id, action_type, replaced_by) VALUES
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000002', 'replace_in', '00000000-0000-0000-0000-0000000000c1');
SET ROLE authenticated;
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000a1');
SELECT rrt_test.eq('tuyến cơ sở A: thấy tên người được điều động (s2) trong lịch sử',
  (SELECT count(*) FROM public.rrt_incident_log_authors('10000000-0000-0000-0000-00000000000a')
   WHERE user_id = '00000000-0000-0000-0000-000000000002'), 1);
RESET ROLE;

-- ============================================================================
\echo '--- Thay quân trong sự kiện (rrt_replace_incident_member) ---'
SET ROLE authenticated;
SELECT rrt_test.login('00000000-0000-0000-0000-000000000001');
SELECT rrt_test.denied('nhân viên: không thay quân được',
  $$SELECT public.rrt_replace_incident_member('10000000-0000-0000-0000-00000000000a', 's1@t.vn', 's2@t.vn')$$);
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000a1');
SELECT rrt_test.denied('tuyến cơ sở A: không đưa người phường B (s3) vào',
  $$SELECT public.rrt_replace_incident_member('10000000-0000-0000-0000-00000000000a', 's1@t.vn', 's3@t.vn')$$);
SELECT rrt_test.denied('tuyến cơ sở B: không thay quân sự kiện A',
  $$SELECT 1 FROM (SELECT rrt_test.login('00000000-0000-0000-0000-0000000000b1')) x,
    LATERAL (SELECT public.rrt_replace_incident_member('10000000-0000-0000-0000-00000000000a', 's1@t.vn', 's3@t.vn')) y$$);
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000a1');
SELECT rrt_test.allowed('tuyến cơ sở A: thay s1 bằng s2 (cùng phường)',
  $$SELECT public.rrt_replace_incident_member('10000000-0000-0000-0000-00000000000a', 's1@t.vn', 's2@t.vn')$$);
RESET ROLE;
SELECT rrt_test.eq('sau thay: s1 rời danh sách mời, s2 có mặt',
  (SELECT count(*) FROM public.incidents WHERE id = '10000000-0000-0000-0000-00000000000a'
     AND NOT public.rrt_email_in_list('s1@t.vn', initial_selected_members)
     AND public.rrt_email_in_list('s2@t.vn', initial_selected_members)), 1);
SELECT rrt_test.eq('sau thay: lịch sử ghi s1 → s2, có người thực hiện',
  (SELECT count(*) FROM public.deployment_history
   WHERE incident_id = '10000000-0000-0000-0000-00000000000a' AND action_type = 'replace_in'
     AND user_id = '00000000-0000-0000-0000-000000000001'
     AND replaced_by = '00000000-0000-0000-0000-000000000002'
     AND reason LIKE 'Thay quân bởi tuyến cơ sở%'), 1);
SET ROLE authenticated;
SELECT rrt_test.login('00000000-0000-0000-0000-00000000000a');
SELECT rrt_test.allowed('HCDC: đưa nhân sự HCDC (h1) thay s2',
  $$SELECT public.rrt_replace_incident_member('10000000-0000-0000-0000-00000000000a', 's2@t.vn', 'h1@t.vn')$$);
RESET ROLE;
SELECT rrt_test.eq('lịch sử ghi thay quân bởi HCDC',
  (SELECT count(*) FROM public.deployment_history
   WHERE incident_id = '10000000-0000-0000-0000-00000000000a' AND action_type = 'replace_in'
     AND replaced_by = '00000000-0000-0000-0000-0000000000c1' AND reason LIKE 'Thay quân bởi HCDC%'), 1);
SET ROLE anon;
SELECT rrt_test.denied('anon: không gọi được thay quân',
  $$SELECT public.rrt_replace_incident_member('10000000-0000-0000-0000-00000000000a', 's1@t.vn', 's2@t.vn')$$);
RESET ROLE;

-- ============================================================================
\echo '--- Xóa sự kiện (rrt_delete_incident) ---'
INSERT INTO public.incidents (id, event_name, status, ma_xa, initial_selected_members) VALUES
  ('10000000-0000-0000-0000-0000000000de', 'TEST – xóa', 'closed', 'XA', 's1@t.vn');
INSERT INTO public.notifications (user_email, message, incident_id) VALUES
  ('s1@t.vn', 'thông báo sự kiện xóa', '10000000-0000-0000-0000-0000000000de');
SET ROLE authenticated;
SELECT rrt_test.login('00000000-0000-0000-0000-0000000000a1');
SELECT rrt_test.denied('tuyến cơ sở: không xóa được sự kiện',
  $$SELECT public.rrt_delete_incident('10000000-0000-0000-0000-0000000000de', 'TEST – xóa')$$);
SELECT rrt_test.login('00000000-0000-0000-0000-00000000000a');
SELECT rrt_test.denied('admin: gõ sai tên thì không xóa',
  $$SELECT public.rrt_delete_incident('10000000-0000-0000-0000-0000000000de', 'TEST')$$);
SELECT rrt_test.allowed('admin: gõ đúng tên thì xóa',
  $$SELECT public.rrt_delete_incident('10000000-0000-0000-0000-0000000000de', 'TEST – xóa')$$);
RESET ROLE;
SELECT rrt_test.eq('sự kiện và thông báo của nó đã bị xóa',
  (SELECT count(*) FROM public.incidents WHERE id = '10000000-0000-0000-0000-0000000000de')
  + (SELECT count(*) FROM public.notifications WHERE incident_id = '10000000-0000-0000-0000-0000000000de'), 0);
SELECT rrt_test.eq('sự kiện khác còn nguyên',
  (SELECT count(*) FROM public.incidents WHERE id IN ('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000b')), 2);
SET ROLE anon;
SELECT rrt_test.denied('anon: không gọi được xóa sự kiện',
  $$SELECT public.rrt_delete_incident('10000000-0000-0000-0000-00000000000a', 'Ổ dịch A')$$);
RESET ROLE;
