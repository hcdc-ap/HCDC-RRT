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
