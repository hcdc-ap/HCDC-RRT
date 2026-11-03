// Mất điện thoại: đăng nhập email+mật khẩu (phiên aal1) rồi dùng 1 mã dự phòng.
// Mã đúng → xoá toàn bộ factor TOTP + các mã dự phòng còn lại; người dùng vào được và bật lại MFA.
// Sai quá MAX_ATTEMPTS lần trong ATTEMPT_WINDOW_MINUTES phút thì khoá tạm.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import {
  ATTEMPT_WINDOW_MINUTES, MAX_ATTEMPTS, deleteAllFactors, hashCode, json, jsonHeaders, logEvent, normalizeBackupCode,
} from "../_shared/mfa.ts";

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = await requireUser(req, service);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;
    const { data: u } = await service.auth.admin.getUserById(userId);
    const email = u?.user?.email;

    const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60_000).toISOString();
    const { count: tries } = await service
      .from("rrt_mfa_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("attempted_at", since);
    if ((tries ?? 0) >= MAX_ATTEMPTS) {
      await logEvent(service, req, { userId, email, event: "mfa_verify_failed", success: false, detail: { method: "backup_code", locked: true } });
      return json({ error: `Nhập sai quá nhiều lần. Thử lại sau ${ATTEMPT_WINDOW_MINUTES} phút hoặc nhờ admin đặt lại.` }, 429);
    }

    // Tính lần thử TRƯỚC khi kiểm tra (chống thử song song)
    await service.from("rrt_mfa_attempts").insert({ user_id: userId });

    let body: { code?: unknown } = {};
    try { body = await req.json(); } catch { /* body rỗng */ }
    const code = normalizeBackupCode(body.code);
    const fail = async () => {
      await logEvent(service, req, { userId, email, event: "mfa_verify_failed", success: false, detail: { method: "backup_code" } });
      return json({ error: "Mã dự phòng không đúng hoặc đã dùng" }, 400);
    };
    if (!code) return await fail();

    // Đánh dấu đã dùng một cách nguyên tử: chỉ 1 request thắng
    const { data: used, error: updErr } = await service
      .from("rrt_mfa_backup_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("code_hash", await hashCode(code))
      .is("used_at", null)
      .select("id");
    if (updErr) throw new Error(updErr.message);
    if (!used || used.length === 0) return await fail();

    await deleteAllFactors(service, userId);
    await service.from("rrt_mfa_backup_codes").delete().eq("user_id", userId);
    await service.from("rrt_mfa_attempts").delete().eq("user_id", userId);
    await logEvent(service, req, { userId, email, event: "mfa_backup_code_used", detail: { method: "backup_code" } });
    return json({ ok: true });
  } catch (err) {
    console.error("mfa-recovery:", err);
    return json({ error: "Không thực hiện được, vui lòng thử lại hoặc nhờ admin đặt lại" }, 500);
  }
});
