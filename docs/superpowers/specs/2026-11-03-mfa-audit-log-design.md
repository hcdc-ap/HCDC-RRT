# Thiết kế: Xác thực 2 bước (MFA) + Nhật ký truy cập — HCDC-RRT

Ngày: 2026-11-03 · Trạng thái: chờ duyệt

## 1. Mục đích và lý do
Người dùng RRT cần **bảo mật đăng nhập mạnh hơn mật khẩu** để đưa vào báo cáo bảo mật, và admin cần
**xem được ai đăng nhập / thay đổi tài khoản khi nào**. Hai tính năng làm chung một đợt vì cùng thuộc
tầng tài khoản và nhật ký cần ghi các sự kiện MFA.

## 2. Mục tiêu / Không mục tiêu / Điều tuyệt đối tránh
**Mục tiêu**
- MFA TOTP (Google/Microsoft Authenticator) **tuỳ chọn**, bật trong "Tài khoản của tôi".
- Mất điện thoại vẫn vào lại được: (1) 10 mã dự phòng dùng một lần; (2) admin RRT đặt lại MFA cho người dùng.
- Ép MFA ở **tầng dữ liệu (RLS)**: ai đã bật MFA mà phiên chưa qua bước 2 thì không đọc/ghi được dữ liệu, kể cả gọi thẳng API.
- Nhật ký truy cập tầng ứng dụng, chỉ admin xem, không sửa/xoá được.
- Cập nhật Hướng dẫn sử dụng (`huong-dan-data.js`) cho cả hai tính năng.

**Không mục tiêu**
- Không bắt buộc MFA cho mọi người; không SMS/Email OTP; không đăng nhập Google/WebAuthn.
- Nhật ký **không** ghi thao tác nghiệp vụ (xem/sửa/xoá hồ sơ, báo cáo, vụ việc) — người dùng đã chọn phạm vi (a).
- Không xuất CSV, không cảnh báo thời gian thực.

**Điều tuyệt đối tránh (anti-goal)**: người **chưa bật MFA** bị đổi hành vi hoặc bị khoá; hỏng luồng đăng nhập, đổi mật khẩu, Telegram, LIMS (cùng dự án Supabase).

## 3. Ràng buộc đã có trong code
- Supabase Auth; client tạo ở `js/app/core.js` (storageKey `your-app-name-auth-token`, không đổi).
- Đăng nhập: `core.js` (~dòng 1179, `signInWithPassword`); F5 khôi phục phiên qua `onAuthStateChange` (`core.js` ~324) + `loadUserProfile` (`auth-helpers.js`).
- Đổi mật khẩu: `shell.js` (~293) đăng nhập lại bằng mật khẩu cũ rồi `updateUser`.
- Menu hồ sơ: `index.html` ~487 (đã có "Liên kết Telegram" làm mẫu: modal + RPC).
- Edge function dùng `_shared/auth.ts` (`requireUser`, `requireRrtAdmin`, `verify_jwt=false` tự kiểm tra).
- Migration: thêm nhỏ, có file `rollback/*_down.sql`, có `BEGIN/COMMIT`. Test: `npm run check`, `npm run test:rls`, `npm run check:rls`.
- `config.toml`: `[auth.mfa.totp] enroll_enabled/verify_enabled = false` → phải bật (cả file lẫn **Dashboard dự án thật**: Authentication → Multi-Factor). TOTP không cần gói Pro.
- Vai trò admin = `profiles.role = 'admin'` ("Quản trị RRT"). "Quản trị hệ thống" xử lý bằng Supabase Dashboard (xem 4.3), không tạo role mới.

## 4. Thiết kế

### 4.1 Bật/tắt MFA ("Tài khoản của tôi" → mục "Xác thực 2 bước")
- Trạng thái: Chưa bật / Đang bật. Dùng `supabase.auth.mfa.enroll({factorType:'totp'})` → hiện QR + khoá nhập tay → người dùng nhập mã 6 số → `challengeAndVerify`.
- Bật xong: gọi edge function `mfa-backup-codes` tạo **10 mã dự phòng**, hiển thị **một lần** (nút in/chép). Mã dạng `XXXX-XXXX` (bảng chữ không gây nhầm, ≥ 40 bit ngẫu nhiên), DB chỉ lưu SHA-256 (bảng `rrt_mfa_backup_codes`: user_id, code_hash, used_at). *(quyết định của tôi)*
- Tắt MFA, hoặc tạo lại mã dự phòng: yêu cầu phiên đã AAL2 (nhập lại mã 6 số). Tạo lại mã thì vô hiệu mã cũ.
- Huỷ giữa chừng khi enroll: dọn factor `unverified`.

### 4.2 Đăng nhập khi đã bật MFA
- Sau `signInWithPassword`, kiểm tra `mfa.getAuthenticatorAssuranceLevel()`: nếu `nextLevel='aal2'` và `currentLevel='aal1'` → hiện bước nhập mã 6 số (và liên kết "Mất điện thoại? Dùng mã dự phòng"), **chưa** gọi `loadUserProfile`/vào dashboard.
- Người chưa bật MFA: đi nguyên đường cũ.
- F5 khi đang ở phiên AAL1 dở dang: coi như chưa đăng nhập → `signOut` về màn hình đăng nhập *(quyết định của tôi; phiên AAL2 đã xong thì token mang `aal2` nên F5 không bị hỏi lại)*.
- Đổi mật khẩu của người đã bật MFA: không đăng nhập lại trên client chính (sẽ rơi về AAL1 và `updateUser` bị từ chối). Xác minh mật khẩu cũ bằng **client tạm** (`persistSession:false`), rồi `updateUser` trên phiên AAL2. Người chưa bật MFA giữ nguyên luồng cũ.

### 4.3 Mất điện thoại — hai đường cứu
1. **Mã dự phòng (tự phục vụ):** đăng nhập email+mật khẩu (phiên AAL1) → "Dùng mã dự phòng" → edge function `mfa-recovery` (JWT hợp lệ AAL1 + mã): kiểm tra băm, đánh dấu đã dùng, **xoá toàn bộ factor TOTP** bằng service role, ghi nhật ký. Người dùng vào được ngay và được nhắc bật lại MFA. Giới hạn thử: sai 5 lần/15 phút thì khoá tạm.
2. **Admin RRT đặt lại:** nút "Đặt lại MFA" ở màn hình quản lý thành viên (chỉ admin), có hộp xác nhận → edge function `mfa-admin-reset` (`requireRrtAdmin`) xoá factor + mã dự phòng của người đó, ghi nhật ký (ai đặt lại cho ai). Nếu người đó chưa bật MFA thì báo rõ, không làm gì.
3. **Quản trị hệ thống / admin mất điện thoại và không còn admin khác:** Supabase Dashboard → Authentication → Users → chọn user → xoá factor MFA. Ghi vào hướng dẫn.

### 4.4 Ép MFA ở RLS (rủi ro đã thống nhất, giảm bằng cách sau)
- Hàm `public.rrt_mfa_ok()` (`STABLE`, `SECURITY DEFINER`, `search_path` cố định): `true` nếu `auth.jwt()->>'aal' = 'aal2'`, **hoặc** user không có factor `verified` trong `auth.mfa_factors`. Kiểm tra claim trước, chỉ tra bảng khi phiên chưa AAL2.
- Với **mỗi bảng `public` đang bật RLS**: thêm `CREATE POLICY rrt_mfa_gate ... AS RESTRICTIVE FOR ALL TO authenticated USING (rrt_mfa_ok()) WITH CHECK (rrt_mfa_ok())`. Restrictive nên **không nới** quyền nào của policy hiện có; `anon` và `service_role` không bị tác động (edge function, bot Telegram, LIMS server-side giữ nguyên).
- Hàm `SECURITY DEFINER` trả dữ liệu cho người dùng (các RPC hiện có và RPC mới) bỏ qua RLS → người xây rà soát từng RPC trả dữ liệu và thêm kiểm tra `rrt_mfa_ok()` bên trong khi cần.
- Storage: nếu migration hiện có quản lý policy `storage.objects` thì thêm cổng tương tự; nếu không thì ghi rõ là ngoài phạm vi.
- Migration kèm `rollback/..._down.sql` gỡ toàn bộ policy + hàm. Triển khai theo thứ tự: migration → deploy edge function → deploy giao diện.
- Test: mở rộng `supabase/tests/` (stub `auth.jwt()`, `auth.mfa_factors`): (a) không factor → đọc/ghi như cũ; (b) có factor + `aal1` → bị chặn; (c) có factor + `aal2` → như cũ; chạy lại `npm run test:rls` và `npm run check:rls`.

### 4.5 Nhật ký truy cập
- Bảng `rrt_access_log`: `id`, `created_at`, `user_id` (null được), `email`, `event`, `success`, `detail jsonb`, `ip`, `user_agent`. Chỉ INSERT: thu hồi UPDATE/DELETE và thêm trigger chặn sửa/xoá. Đọc: chỉ admin (kèm cổng MFA). Không tự xoá (giữ vô thời hạn) *(quyết định của tôi)*.
- Danh sách sự kiện (allowlist): `login_success`, `login_failed`, `logout`, `mfa_enabled`, `mfa_disabled`, `mfa_verify_failed`, `mfa_backup_code_used`, `mfa_backup_codes_regenerated`, `mfa_admin_reset`, `password_changed`, `account_approved`.
- Nguồn ghi, ưu tiên nơi **không thể giả mạo**: trigger DB (`auth.mfa_factors` → bật/tắt MFA; `auth.users` đổi mật khẩu; `profiles.approval_status` → duyệt) và edge function (dùng mã dự phòng, admin đặt lại). Nếu trigger trên bảng `auth` không tạo được trên dự án thật thì chuyển sang RPC phía client và ghi chú rõ là "client báo".
- `login_success` / `logout` / `mfa_verify_failed`: RPC `rrt_log_event(event, detail)` (chỉ nhận event trong allowlist, `user_id = auth.uid()`). `login_failed` (chưa có phiên): edge function `auth-log` công khai, chỉ nhận `login_failed`, giới hạn tần suất theo IP, lấy IP/UA từ header. Ghi nhật ký **không bao giờ làm hỏng** luồng chính (lỗi thì bỏ qua, chỉ `console.warn`).
- Màn hình admin "Nhật ký truy cập" (mục menu chỉ hiện với admin): bảng thời gian · người dùng · sự kiện · kết quả · IP, lọc theo email, loại sự kiện, khoảng ngày, thành công/thất bại, phân trang 50 dòng/trang.

### 4.6 Hướng dẫn sử dụng
Cập nhật `huong-dan-data.js` (giữ cấu trúc `{t:'p'|'steps'|'list'|'note'|'table'}`, chạy `tests/structure.test.js`):
- Mục tài khoản (mọi vai trò): "Bật xác thực 2 bước", "Đăng nhập khi đã bật", "Mất điện thoại thì làm gì" (mã dự phòng, liên hệ admin), lưu ý cất mã dự phòng.
- Phần admin: "Đặt lại MFA cho thành viên", "Xem Nhật ký truy cập", cách xử lý khi chính admin mất điện thoại (4.3.3).
- Cập nhật nhắc đến menu hồ sơ và danh sách sự kiện nhật ký.

## 5. Để người xây quyết định
Bố cục giao diện chi tiết, chữ thông báo tiếng Việt, tên hàm JS, cách tạo QR (dùng ảnh/SVG `qr_code` Supabase trả về, không thêm thư viện), cách bố trí file mới trong `js/app/`, mức giới hạn tần suất `auth-log`, và thứ tự các commit.

## 6. Việc người dùng phải làm khi triển khai (ngoài code)
1. Bật TOTP Enroll + Verify trong Supabase Dashboard (Authentication → Multi-Factor).
2. Chạy migration; deploy 4 edge function mới (`mfa-backup-codes`, `mfa-recovery`, `mfa-admin-reset`, `auth-log`).
3. Thông báo cho người dùng đã bật MFA: phiên cũ chưa qua bước 2 sẽ phải đăng nhập lại.
