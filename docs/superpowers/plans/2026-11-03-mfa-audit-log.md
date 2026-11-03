# MFA + Nhật ký truy cập — Kế hoạch triển khai

> **For agentic workers:** dùng superpowers:executing-plans, làm lần lượt từng task.

**Goal:** MFA TOTP tuỳ chọn có mã dự phòng + admin reset, cổng MFA ở RLS, nhật ký truy cập cho admin, cập nhật Hướng dẫn.
**Architecture:** Supabase Auth MFA gốc; 4 edge function (service role) cho phần Supabase không có sẵn; migration thêm bảng/hàm/policy RESTRICTIVE; giao diện thêm `js/app/mfa.js` + `js/app/access-log.js`.
**Tech Stack:** Supabase (Postgres, Edge Functions Deno), JS thuần, Bootstrap modal, node:test, pglite (test SQL).
**Spec:** docs/superpowers/specs/2026-11-03-mfa-audit-log-design.md

## Global Constraints
- Người chưa bật MFA: hành vi không đổi. Migration có `rollback/*_down.sql`, bọc `BEGIN/COMMIT`.
- Mã dự phòng: 10 mã, dạng `XXXX-XXXX`, chỉ lưu SHA-256. Sai 5 lần/15 phút thì khoá tạm.
- Sự kiện nhật ký (allowlist): login_success, login_failed, logout, mfa_enabled, mfa_disabled, mfa_verify_failed, mfa_backup_code_used, mfa_backup_codes_regenerated, mfa_admin_reset, password_changed, account_approved.
- Giao diện tiếng Việt; `npm run check` phải xanh.

## Review Focus
- Mã dự phòng nhập thường/hoa, có/không dấu gạch → vẫn nhận.
- Mã đã dùng, mã sai, hết lần thử → bị từ chối, không lộ mã nào đúng.
- Người có factor nhưng phiên aal1 gọi thẳng API → bị RLS chặn; người không factor → như cũ.
- Ghi nhật ký lỗi → không làm hỏng đăng nhập.
- Admin reset người chưa bật MFA → báo rõ; non-admin gọi → 403.

### Task 1: Migration + test SQL
Files: `supabase/migrations/20261103000000_rrt_mfa_audit.sql`, `rollback/..._down.sql`, `tests/mfa-rls.test.js` (pglite).
Interfaces — Produces: `public.rrt_mfa_ok() boolean`; bảng `rrt_mfa_backup_codes`, `rrt_mfa_attempts`, `rrt_access_log`; RPC `rrt_log_event(p_event text, p_detail jsonb) void`, `rrt_list_access_log(...)`; policy `rrt_mfa_gate` trên mọi bảng public bật RLS.
Test: không factor → thấy dữ liệu; factor + aal1 → 0 dòng/ghi bị chặn; factor + aal2 → thấy; log: non-admin không đọc, không UPDATE/DELETE; event ngoài allowlist bị từ chối.

### Task 2: Helper thuần JS + test
`js/app/mfa-helpers.js` (UMD, dùng được trong node): `normalizeBackupCode`, `needsSecondStep(session)`, `aalFromJwt`. Test `tests/mfa-helpers.test.js`.

### Task 3: Edge functions
`_shared/mfa.ts` (sinh/băm mã, giới hạn thử, ghi log), `mfa-backup-codes`, `mfa-recovery`, `mfa-admin-reset`, `auth-log`; thêm vào `config.toml` (`verify_jwt=false`, bật TOTP).

### Task 4: Giao diện MFA
`js/app/mfa.js` + modal trong `index.html`; sửa `core.js` (đăng nhập + listener + logout log), `shell.js` (đổi mật khẩu), menu hồ sơ.

### Task 5: Nhật ký + nút Đặt lại MFA
`js/app/access-log.js`, trang `page-access-log` + menu admin, nút đặt lại MFA ở trang Thành viên.

### Task 6: Hướng dẫn sử dụng + README, chạy `npm run check`, deploy edge function, PR.
