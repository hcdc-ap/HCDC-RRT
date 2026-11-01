import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Các function này (send-lab-inquiry, notify-lab-result) chỉ được gọi từ
// trình duyệt của người dùng đã đăng nhập (window.supabaseClient.functions.invoke),
// nên phải có JWT của một user thật — không chỉ anon key — mới được thực thi.
// verify_jwt=false ở config.toml chỉ tắt việc Supabase tự chặn ở tầng gateway,
// hàm vẫn phải tự kiểm tra để tránh bị gọi trực tiếp (curl + anon key) mà bỏ qua
// toàn bộ luồng nghiệp vụ (gửi email/Telegram, ghi dữ liệu bằng service role).
export async function requireUser(
  req: Request,
  serviceClient: SupabaseClient
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!jwt) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized: missing token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const { data, error } = await serviceClient.auth.getUser(jwt);
  if (error || !data?.user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized: invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  return { ok: true, userId: data.user.id };
}

// Chỉ Quản trị RRT (HCDC) — profiles.role = 'admin'. Dùng cho các function gửi
// thông tin THẬT ra ngoài (khảo sát / kết quả điều phối tới Phòng xét nghiệm):
// requireUser() chỉ kiểm tra "đã đăng nhập", nên tuyến cơ sở, Đội trưởng, nhân
// viên — kể cả tài khoản chưa duyệt / tài khoản LIMS — vẫn gọi trực tiếp được.
export async function requireRrtAdmin(
  req: Request,
  serviceClient: SupabaseClient
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const user = await requireUser(req, serviceClient);
  if (!user.ok) return user;

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.userId)
    .maybeSingle();
  if (String(profile?.role || "").toLowerCase() !== "admin") {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden: chỉ Quản trị RRT (HCDC) được thực hiện thao tác này" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  return user;
}
