// Ghi sự kiện đăng nhập THẤT BẠI (lúc này chưa có phiên nên không dùng được rrt_log_event).
// Công khai nhưng chỉ nhận 'login_failed', giới hạn tần suất theo IP để không bị spam nhật ký.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientInfo, json, jsonHeaders, logEvent } from "../_shared/mfa.ts";

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX_PER_MINUTE = 20;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    let body: { event?: unknown; email?: unknown } = {};
    try { body = await req.json(); } catch { /* rỗng */ }
    if (body.event !== "login_failed") return json({ error: "Sự kiện không hợp lệ" }, 400);

    const email = String(body.email ?? "").trim().slice(0, 254);
    const { ip } = clientInfo(req);

    if (ip) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count } = await service
        .from("rrt_access_log")
        .select("id", { count: "exact", head: true })
        .eq("event", "login_failed")
        .eq("ip", ip)
        .gte("created_at", since);
      if ((count ?? 0) >= MAX_PER_MINUTE) return json({ ok: true, throttled: true });
    }
    await logEvent(service, req, { email: email || null, event: "login_failed", success: false });
    return json({ ok: true });
  } catch (err) {
    console.error("auth-log:", err);
    return json({ ok: true });
  }
});
