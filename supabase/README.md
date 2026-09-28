# Supabase

Frontend gọi tới các đối tượng phía Supabase sau (không nằm trong repo này):

- **RPC** `update_incident_membership(p_incident_id, p_email, p_action)` — cập
  nhật thành viên sự kiện một cách atomic khi xác nhận/từ chối
  (dùng trong `fix-patches.js` → `submitIncidentResponse`).
- **Edge Functions** `handle-email-callback`, `handle-lab-callback`
  (dùng trong `confirm.html`, `lab-response.html`), `send-lab-inquiry`,
  `notify-lab-result` (gọi qua `supabaseClient.functions.invoke(...)` trong
  `lab-dispatch-actions.js`).
- Các bảng chính: `profiles`, `incidents`, `incident_logs`, `incident_plans`,
  `incident_assessments`, `deployment_history`, `notifications`,
  `roster_assignments`, `training_courses`, `lab_dispatch_log`, …
  Ràng buộc đáng chú ý: `deployment_history.action_type` là enum/CHECK
  (`deployed`, `declined`, `replace_in`, …) — frontend phải gửi đúng giá trị này.

## Đưa schema vào repo (khuyến nghị)

Mã nguồn có nhắc tới migration
`supabase/migrations/20260917000000_atomic_incident_membership.sql` nhưng file
này hiện chưa được commit. Để schema được quản lý cùng mã nguồn:

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
