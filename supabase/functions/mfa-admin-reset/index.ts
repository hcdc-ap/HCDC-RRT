// Admin RRT đặt lại MFA cho một người dùng (xoá factor + mã dự phòng).
// Chỉ role 'admin'. Admin không tự đặt lại cho chính mình (dùng mã dự phòng hoặc admin khác).
// Nếu chính admin đã bật MFA thì phiên của họ phải là aal2.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRrtAdmin } from "../_shared/auth.ts";
import { aalFromJwt, deleteAllFactors, json, jsonHeaders, logEvent } from "../_shared/mfa.ts";

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = await requireRrtAdmin(req, service);
    if (!auth.ok) return auth.response;
    const adminId = auth.userId;

    const { data: af } = await service.auth.admin.mfa.listFactors({ userId: adminId });
    if ((af?.factors ?? []).some((x) => x.status === "verified") &&
        aalFromJwt(req.headers.get("Authorization") || "") !== "aal2") {
      return json({ error: "Cần xác thực mã 6 số của bạn trước" }, 403);
    }

    let body: { user_id?: unknown } = {};
    try { body = await req.json(); } catch { /* rỗng */ }
    const target = String(body.user_id ?? "");
    if (!UUID.test(target)) return json({ error: "user_id không hợp lệ" }, 400);
    if (target === adminId) {
      return json({ error: "Không thể tự đặt lại MFA cho chính mình. Hãy dùng mã dự phòng hoặc nhờ admin khác." }, 400);
    }

    const { data: t, error: tErr } = await service.auth.admin.getUserById(target);
    if (tErr || !t?.user) return json({ error: "Không tìm thấy người dùng" }, 404);

    const removed = await deleteAllFactors(service, target);
    if (removed === 0) return json({ ok: false, code: "not_enrolled", error: "Người này chưa bật xác thực 2 bước" });
    await service.from("rrt_mfa_backup_codes").delete().eq("user_id", target);
    await service.from("rrt_mfa_attempts").delete().eq("user_id", target);

    const { data: a } = await service.auth.admin.getUserById(adminId);
    await logEvent(service, req, {
      userId: adminId,
      email: a?.user?.email,
      event: "mfa_admin_reset",
      detail: { target_user_id: target, target_email: t.user.email },
    });
    return json({ ok: true });
  } catch (err) {
    console.error("mfa-admin-reset:", err);
    return json({ error: "Không đặt lại được MFA" }, 500);
  }
});
