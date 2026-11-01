// ============================================================================
// EDGE FUNCTION: handle-email-callback (v2.6)
// v2.6: module dùng chung (_shared), escape wildcard %/_ trước khi .ilike(),
//   không còn nuốt lỗi âm thầm khi báo Telegram group thất bại, fetch Telegram
//   có timeout.
// v2.5 - Vá lỗi lật trạng thái Hủy Lệnh
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { esc } from "../_shared/html.ts";
import { fmtVN } from "../_shared/time.ts";
import { createTelegramClient } from "../_shared/telegram.ts";
import { escapeIlike } from "../_shared/postgrest.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const GROUP_ID = Deno.env.get("TELEGRAM_GROUP_ID");
const WEBAPP_URL = "https://hcdc-ap.github.io/HCDC-RRT/response.html";
const CONFIRM_PAGE = "https://hcdc-ap.github.io/HCDC-RRT/confirm.html";
const postToTG = createTelegramClient(BOT_TOKEN);

const redirectResult = (ok: boolean, msg: string) =>
  Response.redirect(
    `${WEBAPP_URL}?status=${ok ? "true" : "false"}&msg=${encodeURIComponent(msg)}`,
    302
  );

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";
    const notificationId = url.searchParams.get("id") || "";
    const token = url.searchParams.get("token") || "";

    if (!notificationId || !["confirm", "decline", "read"].includes(action)) {
      return redirectResult(false, "Lỗi tham số xác nhận.");
    }

    // 1. GET → chuyển sang trang xác nhận tĩnh
    if (req.method === "GET") {
      const target =
        `${CONFIRM_PAGE}?id=${encodeURIComponent(notificationId)}` +
        `&token=${encodeURIComponent(token)}&action=${encodeURIComponent(action)}`;
      return Response.redirect(target, 302);
    }

    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // 2. POST → kiểm token rồi thực thi
    const { data: notification, error: notifErr } = await supabase
      .from("notifications")
      .select("id, user_email, message, incident_id, schedule_id, response_status, responded_at, action_token")
      .eq("id", notificationId)
      .maybeSingle();

    if (notifErr || !notification) {
      return redirectResult(false, "Không tìm thấy thông báo.");
    }

    if (!token || String(notification.action_token) !== token) {
      return redirectResult(
        false,
        "Liên kết không hợp lệ hoặc thuộc phiên bản email cũ. Vui lòng phản hồi qua Telegram hoặc ứng dụng HCDC-RRT."
      );
    }

    // ✅ KHÓA SAU LẦN ĐẦU
    if (["confirmed", "declined"].includes(notification.response_status) && action !== "read") {
      const prevLabel = notification.response_status === "confirmed" ? "XÁC NHẬN tham gia" : "KHÔNG THỂ tham gia";
      const whenTxt = notification.responded_at ? fmtVN(new Date(notification.responded_at)) : "";
      const okColor = notification.response_status === "confirmed";
      return redirectResult(
        okColor,
        `Bạn đã ${prevLabel}${whenTxt ? " lúc " + whenTxt : ""}. ` +
        `Ghi nhận này đã được lưu vào hệ thống. ` +
        `Nếu cần thay đổi, vui lòng liên hệ Ban chỉ huy.`
      );
    }

    const { user_email, incident_id, schedule_id } = notification;

    let fullName = user_email;
    let userId: string | null = null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .ilike("email", escapeIlike(user_email))
      .maybeSingle();
    if (profile) {
      if (profile.full_name) fullName = profile.full_name;
      userId = profile.id;
    }

    let eventName = "";
    if (incident_id) {
      const { data: inc } = await supabase
        .from("incidents").select("event_name").eq("id", incident_id).maybeSingle();
      eventName = inc?.event_name || "";
    }

    // 👉 ĐÃ VÁ LỖI: Tách payload update để bảo vệ response_status của lệnh Read
    let updatePayload: any = { responded_at: new Date().toISOString() };

    if (action === "read") {
      updatePayload.is_read = true;
      // Tuyệt đối không chạm vào response_status
    } else {
      updatePayload.response_status = action === "confirm" ? "confirmed" : "declined";
    }

    const { error: updateErr } = await supabase
      .from("notifications")
      .update(updatePayload)
      .eq("id", notificationId);
      
    if (updateErr) throw new Error(`Lỗi Notifications: ${updateErr.message}`);

    // 2b. Đóng dấu deployment_history
    if (userId && incident_id && action !== "read") {
      if (action === "confirm") {
        await supabase
          .from("deployment_history")
          .update({ confirmed_at: new Date().toISOString() })
          .eq("incident_id", incident_id)
          .eq("user_id", userId)
          .is("confirmed_at", null);
      } else {
        await supabase
          .from("deployment_history")
          .update({ action_type: "declined", reason: "Không thể tham gia" })
          .eq("incident_id", incident_id)
          .eq("user_id", userId)
          .in("action_type", ["deployed", "replace_in"]);
      }
    }

    // 3. Đồng bộ incidents (RPC atomic — tránh mất dữ liệu khi 2 phản hồi đến gần
    // như cùng lúc; xem supabase/migrations/20260917000000_atomic_incident_membership.sql)
    if (incident_id && action !== "read") {
      const { error: rpcErr } = await supabase.rpc("update_incident_membership", {
        p_incident_id: incident_id,
        p_email: user_email,
        p_action: action, // "confirm" | "decline"
      });
      if (rpcErr) console.error("Lỗi đồng bộ incidents (RPC):", rpcErr.message);
    }

    // 4. Đồng bộ lịch trực
    if (schedule_id && userId && action !== "read") {
      await supabase
        .from("roster_assignments")
        .update({ assignment_status: action === "confirm" ? "confirmed" : "declined" })
        .eq("schedule_id", schedule_id)
        .eq("user_id", userId);
    }

    // 5. Báo Telegram Group (Bỏ qua Read để không spam)
    if (BOT_TOKEN && GROUP_ID && action !== "read") {
      const statusText = action === "confirm" ? "✅ Đã xác nhận tham gia" : "❌ Không thể tham gia";
      await postToTG("sendMessage", {
        chat_id: GROUP_ID,
        text:
          `📢 <b>CẬP NHẬT QUA EMAIL</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 <b>Nhân sự:</b> ${esc(fullName)}\n📝 <b>Phản hồi:</b> ${statusText}` +
          (eventName ? `\n📌 <b>Sự kiện:</b> ${esc(eventName)}` : ""),
        parse_mode: "HTML",
      });
      // Lỗi mạng/timeout đã được log bên trong postToTG (_shared/telegram.ts),
      // không còn bị nuốt âm thầm như trước.
    }

    const okMsg =
      action === "confirm"
        ? "Xác nhận tham gia thành công. Dữ liệu đã được đồng bộ."
        : action === "decline"
        ? "Đã ghi nhận bạn không thể tham gia. Ban chỉ huy sẽ liên hệ nếu cần."
        : "Đã ghi nhận Đọc thông báo.";

    return redirectResult(action !== "decline", okMsg);
  } catch (err: any) {
    console.error("❌ Error:", err.message);
    return redirectResult(false, `Lỗi hệ thống: ${err.message}`);
  }
});