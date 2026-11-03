// Tạo (hoặc tạo lại) 10 mã dự phòng MFA. Chỉ người đã bật MFA VÀ phiên đã qua bước 2 (aal2).
// Mã chỉ trả về MỘT lần ở đây; DB chỉ lưu bản băm SHA-256. Tạo lại thì mã cũ mất hiệu lực.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { aalFromJwt, generateBackupCodes, hashCode, json, jsonHeaders, logEvent } from "../_shared/mfa.ts";

const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const auth = await requireUser(req, service);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    if (aalFromJwt(req.headers.get("Authorization") || "") !== "aal2") {
      return json({ error: "Cần xác thực mã 6 số trước khi tạo mã dự phòng" }, 403);
    }
    const { data: f, error: fErr } = await service.auth.admin.mfa.listFactors({ userId });
    if (fErr) throw new Error(fErr.message);
    if (!(f?.factors ?? []).some((x) => x.status === "verified")) {
      return json({ error: "Tài khoản chưa bật xác thực 2 bước" }, 400);
    }

    const { count } = await service
      .from("rrt_mfa_backup_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const first = !count;

    const codes = generateBackupCodes();
    const rows = await Promise.all(codes.map(async (c) => ({ user_id: userId, code_hash: await hashCode(c) })));
    const { error: delErr } = await service.from("rrt_mfa_backup_codes").delete().eq("user_id", userId);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await service.from("rrt_mfa_backup_codes").insert(rows);
    if (insErr) throw new Error(insErr.message);

    const { data: u } = await service.auth.admin.getUserById(userId);
    await logEvent(service, req, {
      userId,
      email: u?.user?.email,
      event: "mfa_backup_codes_regenerated",
      detail: { first },
    });
    return json({ ok: true, codes });
  } catch (err) {
    console.error("mfa-backup-codes:", err);
    return json({ error: "Không tạo được mã dự phòng" }, 500);
  }
});
