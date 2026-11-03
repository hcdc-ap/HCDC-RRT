# Supabase

Frontend gọi tới các đối tượng phía Supabase sau (không nằm trong repo này):

- **RPC** `update_incident_membership(p_incident_id, p_email, p_action)` — cập
  nhật thành viên sự kiện một cách atomic khi xác nhận/từ chối
  (dùng trong `js/app/incident-response.js` → `submitIncidentResponse`; nếu
  database chưa có RPC này, code tự quay về cách đọc → sửa → ghi).
- **Edge Functions** `handle-email-callback`, `handle-lab-callback`
  (dùng trong `confirm.html`, `lab-response.html`), `send-lab-inquiry`,
  `notify-lab-result` (gọi qua `supabaseClient.functions.invoke(...)` trong
  `lab-dispatch-actions.js`).
- Các bảng chính: `profiles`, `incidents`, `incident_logs`, `incident_plans`,
  `incident_assessments`, `deployment_history`, `notifications`,
  `roster_assignments`, `training_courses`, `lab_dispatch_log`, …
  Ràng buộc đáng chú ý: `deployment_history.action_type` là enum/CHECK
  (`deployed`, `declined`, `replace_in`, …) — frontend phải gửi đúng giá trị này.

## Kiểm tra schema khớp với code

```bash
RRT_TEST_EMAIL=test@... RRT_TEST_PASSWORD=... npm run check:schema
```

Công cụ `tools/check-supabase-schema.js` gửi `GET /rest/v1/<bảng>?select=<cột>&limit=0`
cho từng truy vấn trong code (chỉ đọc, không lấy dữ liệu) và kiểm tra các RPC
qua OpenAPI của PostgREST. Công cụ chưa kiểm tra ràng buộc CHECK; xem trong
`migrations/*_remote_schema.sql` (vd. `deployment_history_action_type_check`
cho phép `mobilize`, `deployed`, `active`, `replace_in`, `declined`).

## Schema trong repo

`migrations/20260928000000_remote_schema.sql` là ảnh chụp schema `public`
(bảng, ràng buộc, index, view, hàm/RPC, trigger, RLS policy, grant) của database
thật ngày 2026-09-28. Header của trigger webhook `Send Free Notification`
(service_role key, webhook secret) đã được thay bằng `<SERVICE_ROLE_KEY>` /
`<WEBHOOK_SECRET>` — không commit giá trị thật.

Cập nhật lại schema / tải Edge Functions:

```bash
npm i -g supabase          # hoặc: npx supabase ...
supabase login
supabase link --project-ref sxzjbygiowpscyhiffqc
supabase db pull           # tạo supabase/migrations/<timestamp>_remote_schema.sql
supabase functions download handle-email-callback
supabase functions download handle-lab-callback
supabase functions download send-lab-inquiry
supabase functions download notify-lab-result
```

Sau đó commit thư mục `supabase/` (không commit file `.env`/khoá `service_role`).

## Khôi phục mật khẩu (dự án dùng chung với LIMS)

Dự án Supabase này dùng chung với app LIMS (`hcdc-lims.vercel.app`), nên
**Site URL** đang trỏ về LIMS. App RRT gửi email khôi phục kèm `redirectTo`
= địa chỉ trang RRT; Supabase chỉ chấp nhận nếu địa chỉ đó nằm trong
**Authentication → URL Configuration → Redirect URLs**, nếu không sẽ chuyển
về Site URL (trang LIMS). Cần thêm:

```
https://hcdc-ap.github.io/HCDC-RRT/**
http://localhost:8080/**
```

## Phân quyền dữ liệu theo vai trò (`20260929000000_rrt_rls_roles.sql`)

Thay các policy "mọi tài khoản đăng nhập đều đọc/ghi" trên bảng RRT bằng phân
quyền theo vai trò (xem đầu file migration). Kiểm thử cục bộ:

```bash
npm run test:rls     # cần Postgres cục bộ (PGHOST/PGUSER/PGPASSWORD); CI tự chạy
```

### Áp dụng lên Supabase thật (dùng chung với LIMS)

1. **Xem trước ai sẽ bị khóa** (SQL Editor, chỉ đọc) — những tài khoản này sẽ
   chỉ còn xem được hồ sơ của mình cho tới khi được duyệt:
   ```sql
   SELECT email, role, approval_status, registration_status
   FROM profiles
   WHERE coalesce(registration_status, '') <> 'approved'
     AND lower(coalesce(approval_status, '')) NOT IN ('approved', 'edit')
     AND lower(coalesce(role, '')) NOT IN ('admin', 'super_admin', 'ward_admin', 'hcdc_admin', 'lab_admin')
   ORDER BY email;
   ```
   Nếu có nhân viên thật trong danh sách (ví dụ đã được duyệt rồi tự sửa hồ sơ),
   duyệt lại họ trong app sau khi áp dụng, hoặc chạy trước:
   `UPDATE profiles SET registration_status = 'approved' WHERE email IN (...);`
2. Chạy **toàn bộ** file migration trong SQL Editor (một transaction; lỗi thì
   không có gì thay đổi).
3. Kiểm tra ngay: `npm run check:rls` với tài khoản nhân viên, tuyến cơ sở,
   một tài khoản chưa duyệt; `npm run e2e` với cả 3 vai trò; mở LIMS kiểm tra.
4. Sự cố: chạy `migrations/rollback/20260929000000_rrt_rls_roles_down.sql` để
   trả policy về như cũ.

Khóa một tài khoản: `UPDATE profiles SET registration_status = 'rejected' WHERE email = '...';`

### Bổ sung sau khi áp (29/09/2026)

Áp theo thứ tự trong SQL Editor (mỗi file một transaction, chạy lại được):

1. `20260929010000_rrt_rls_fix_self_profile.sql` — **vá bảo mật**: email người
   dùng lấy từ `auth.users` (trước đó đổi email hồ sơ là đọc được thông báo người
   khác); tài khoản đã duyệt không tự đổi nơi công tác (tuyến cơ sở không tự
   chuyển sang phường khác).
2. `20260929020000_rrt_leader_reports.sql` — Đội trưởng (Leader) đang tham gia
   sự kiện được lập báo cáo tình hình.

File rollback hoàn tác cả 3 migration.

### Ẩn mã gửi phòng xét nghiệm (`20260929040000_rrt_hide_dispatch_token.sql`)

Trước đây mọi tài khoản đăng nhập đọc được `lab_dispatch_log.action_token` — mã
trong link gửi PXN — nên có thể phản hồi "nhận/không nhận mẫu" thay PXN. Migration
bỏ quyền đọc riêng cột này (Edge Function dùng service_role, không ảnh hưởng).
Truy vấn `select('*')` trên bảng này sẽ lỗi quyền — phải liệt kê cột
(`tests/structure.test.js` kiểm tra tự động cho app RRT). **App LIMS** nếu đọc
`lab_dispatch_log` bằng `select('*')` cần đổi tương tự trước khi áp.

## Rà soát an toàn thông tin 11/2026 — thứ tự triển khai

Sao lưu trước (đã có `backup-supabase-2026-11-01-truoc-nang-cap-rrt`, gồm cả mã Edge Function cũ). Thứ tự bắt buộc, vì LIMS dùng chung project:

1. **CSDL** — `supabase db query --linked -f supabase/migrations/20261101000000_rrt_telegram_link_code.sql` (hoàn tác: `rollback/20261101000000_rrt_telegram_link_code_down.sql`). Chỉ thêm 1 bảng, 1 hàm; sửa `handle_new_user` (không metadata thì hành vi y như cũ).
2. **Bí mật gửi email** — `supabase secrets set GAS_WEBHOOK_SECRET=<giá trị đang chạy>` (giá trị cũ nằm ở bản sao `edge-functions/send-notification-free` trong thư mục sao lưu). Phải đặt TRƯỚC khi deploy bước 3, vì mã mới không còn giá trị dự phòng. Sau đó nên đổi sang giá trị mới ở cả Supabase lẫn Google Apps Script.
3. **Deploy** `send-notification-free`, `send-lab-inquiry`, `notify-lab-result`: `supabase functions deploy <tên> --project-ref sxzjbygiowpscyhiffqc`. Kiểm tra: kích hoạt một thông báo thử, email phải tới.
4. **Webhook Telegram có secret** — tạo `S=$(openssl rand -hex 32)`; gọi `https://api.telegram.org/bot<TOKEN>/setWebhook` với `url=https://sxzjbygiowpscyhiffqc.supabase.co/functions/v1/telegram-bot-handler` và `secret_token=$S`; rồi `supabase secrets set TELEGRAM_WEBHOOK_SECRET=$S`. Đặt webhook trước, biến môi trường sau (hàm chỉ kiểm tra khi biến có mặt).
5. **Deploy** `telegram-bot-handler` cùng lúc đưa giao diện mới lên GitHub Pages (nút "Liên kết Telegram" cần bước 1). Cách liên kết bằng email không còn hoạt động.
6. **Xoá** hàm cũ không còn dùng: `supabase functions delete send-notification --project-ref sxzjbygiowpscyhiffqc` (trigger chỉ trỏ `send-notification-free`).
7. Chạy `sql/kiem_tra_rls.sql` (LIMS) để xác nhận không có mục `loi` mới.

## Xác thực 2 bước (MFA) + nhật ký truy cập

- Migration `20261103000000_rrt_mfa_audit.sql` (hoàn tác: `rollback/20261103000000_rrt_mfa_audit_down.sql`): hàm `rrt_mfa_ok()`, policy RESTRICTIVE `rrt_mfa_gate` trên mọi bảng public bật RLS (chỉ chặn người ĐÃ bật MFA mà phiên chưa qua bước 2), bảng `rrt_mfa_backup_codes`, `rrt_mfa_attempts`, `rrt_access_log` (chỉ thêm, admin đọc), RPC `rrt_log_event`.
- Edge Functions: `mfa-backup-codes`, `mfa-recovery`, `mfa-admin-reset`, `auth-log` (deploy với `--no-verify-jwt`; tự kiểm tra JWT trong mã).
- Bật TOTP trong Dashboard: Authentication → Multi-Factor. Test: `npm test` (tests/mfa-*.test.js chạy migration trên pglite).
- Admin mất điện thoại và không còn admin khác: Dashboard → Authentication → Users → xóa factor MFA của người dùng.
