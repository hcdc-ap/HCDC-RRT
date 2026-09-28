-- ============================================================================
-- Siết quyền bảng notifications (RLS)
--
-- Trước đây: policy "authenticated_full_access" = ALL USING (true) → MỌI tài khoản
-- đăng nhập (kể cả vừa tự đăng ký) đọc được thông báo của người khác (kèm
-- action_token dùng để xác nhận qua email) và TẠO được thông báo mới. Mỗi dòng
-- mới kích hoạt trigger "Send Free Notification" gửi Email/Telegram mang tên
-- HCDC-RRT → có thể bị lợi dụng gửi tin giả tới toàn bộ nhân sự.
--
-- Sau migration:
--   SELECT  người nhận (email hoặc id của chính mình) | admin, super_admin
--           | ward_admin: thông báo của nhân sự thuộc xã/phường mình
--   INSERT  admin, super_admin, ward_admin (các luồng tạo thông báo trong app:
--           kích hoạt khẩn cấp, lịch trực, thay thế, duyệt hồ sơ, đóng sự kiện,
--           điều phối mẫu — đều do quản trị thực hiện)
--   UPDATE  người nhận (đánh dấu đã đọc, phản hồi) | admin, super_admin;
--           không được chuyển thông báo sang người nhận khác
--   DELETE  admin, super_admin
--
-- Không ảnh hưởng: Edge Functions (send-notification-free, telegram-bot-handler,
-- handle-email-callback) dùng service_role nên bỏ qua RLS; trigger gửi thông báo
-- giữ nguyên; không đổi dữ liệu, cột hay GRANT.
--
-- Hoàn tác: xem cuối file.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "authenticated_full_access" ON "public"."notifications";
DROP POLICY IF EXISTS "notif_select_scoped" ON "public"."notifications";
DROP POLICY IF EXISTS "notif_insert_admins" ON "public"."notifications";
DROP POLICY IF EXISTS "notif_update_recipient_or_admin" ON "public"."notifications";
DROP POLICY IF EXISTS "notif_delete_admin" ON "public"."notifications";

CREATE POLICY "notif_select_scoped" ON "public"."notifications" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lower(user_email) = lower(auth.email())) OR (user_email = (auth.uid())::text) OR (current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])) OR ((current_user_role() = 'ward_admin'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((lower(p.email) = lower(notifications.user_email)) AND row_in_my_ward(p.workplace_ma_xa, p.fax)))))));

CREATE POLICY "notif_insert_admins" ON "public"."notifications" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text, 'ward_admin'::text])));

CREATE POLICY "notif_update_recipient_or_admin" ON "public"."notifications" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((lower(user_email) = lower(auth.email())) OR (user_email = (auth.uid())::text) OR (current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))))
  WITH CHECK (((lower(user_email) = lower(auth.email())) OR (user_email = (auth.uid())::text) OR (current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))));

CREATE POLICY "notif_delete_admin" ON "public"."notifications" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((current_user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));

COMMIT;

-- ----------------------------------------------------------------------------
-- HOÀN TÁC (trả về như cũ):
--   BEGIN;
--   DROP POLICY IF EXISTS "notif_select_scoped" ON public.notifications;
--   DROP POLICY IF EXISTS "notif_insert_admins" ON public.notifications;
--   DROP POLICY IF EXISTS "notif_update_recipient_or_admin" ON public.notifications;
--   DROP POLICY IF EXISTS "notif_delete_admin" ON public.notifications;
--   CREATE POLICY "authenticated_full_access" ON public.notifications
--     AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
--   COMMIT;
-- ----------------------------------------------------------------------------
