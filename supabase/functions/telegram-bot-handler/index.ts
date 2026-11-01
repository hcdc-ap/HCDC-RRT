// ============================================================================
// EDGE FUNCTION: telegram-bot-handler (v3.5)
// SỬA v3.5:
//   • Module dùng chung (_shared): esc/nowVN/postToTG (có timeout).
//   • Liên kết nhân sự bằng mã dùng một lần lấy trong ứng dụng (bỏ cách gõ email);
//     liên kết PXN chỉ nhận UUID phòng (bỏ SĐT/email).
//   • Escape ký tự đại diện %/_ trước khi dùng .ilike() (chống dò email).
//   • Kiểm tra token_expires_at khi PXN bấm nút Telegram (trước đây không kiểm
//     tra nên link không bao giờ thực sự hết hạn).
//   • select cột cụ thể thay vì "*".
// SỬA v3.3:
//   • BỎ incidents(pathogens) — cột KHÔNG tồn tại → query lỗi làm gãy Nhịp 2.
//     Lấy tác nhân từ lab_dispatch_log.pathogens.
//   • THÊM LẠI guard chống bấm lại cho luồng RRT (confirm/decline).
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { esc } from "../_shared/html.ts";
import { nowVN } from "../_shared/time.ts";
import { createTelegramClient } from "../_shared/telegram.ts";
import { escapeIlike } from "../_shared/postgrest.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const GROUP_ID = Deno.env.get("TELEGRAM_GROUP_ID");
const TG_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const postToTG = createTelegramClient(BOT_TOKEN);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_CODE_RE = /^[0-9A-F]{10}$/;
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}


serve(async (req) => {
  try {
    if (TG_WEBHOOK_SECRET) {
      const secret = req.headers.get("x-telegram-bot-api-secret-token");
      if (secret !== TG_WEBHOOK_SECRET) return new Response("Forbidden", { status: 403 });
    }
    const update = await req.json();

    // ==================================================================
    // A. TIN NHẮN VĂN BẢN (Liên kết tài khoản)
    // ==================================================================
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (text.startsWith("/start LAB_")) {
        // Chỉ nhận mã định danh phòng xét nghiệm (UUID, không đoán được). Trước đây còn nhận
        // SĐT/email đầu mối — thông tin ai cũng biết nên người ngoài có thể chiếm kênh nhận lệnh của PXN.
        const queryParam = text.replace("/start LAB_", "").trim();
        let labs: { id: string; name: string }[] | null = null;
        let findErr: unknown = null;

        if (UUID_RE.test(queryParam)) {
          const res = await supabase.from("laboratories").select("id, name").eq("id", queryParam);
          labs = res.data; findErr = res.error;
        } else {
          labs = [];
        }
        if (findErr || !labs || labs.length === 0) {
          await postToTG("sendMessage", { chat_id: chatId, text: `❌ <b>Không tìm thấy phòng xét nghiệm.</b> Vui lòng dùng đúng lệnh hiển thị trong trang quản lý PXN.`, parse_mode: "HTML" });
        } else {
          await supabase.from("laboratories").update({ telegram_chat_id: chatId.toString() }).eq("id", labs[0].id);
          await postToTG("sendMessage", { chat_id: chatId, text: `✅ <b>KẾT NỐI THÀNH CÔNG!</b>\nĐầu mối <b>${esc(labs[0].name)}</b> đã kết nối Telegram.`, parse_mode: "HTML" });
        }
        return new Response("OK");
      }

      // Liên kết nhân sự: mã 10 ký tự dùng một lần, lấy trong ứng dụng (nút "Liên kết Telegram").
      // Chấp nhận cả "/start <mã>" (đường dẫn t.me/<bot>?start=<mã>) lẫn gõ trực tiếp mã.
      const maybeCode = text.replace(/^\/start\s+/i, "").trim().toUpperCase();
      if (LINK_CODE_RE.test(maybeCode)) {
        const hash = await sha256Hex(maybeCode);
        const { data: row } = await supabase
          .from("rrt_telegram_link_codes")
          .select("user_id, expires_at")
          .eq("code_hash", hash)
          .maybeSingle();
        if (!row || new Date(row.expires_at).getTime() < Date.now()) {
          await postToTG("sendMessage", { chat_id: chatId, text: `❌ <b>Mã không đúng hoặc đã hết hạn.</b>\nVào ứng dụng HCDC-RRT, bấm "Liên kết Telegram" để lấy mã mới (hiệu lực 10 phút).`, parse_mode: "HTML" });
        } else {
          // Dùng một lần: xoá trước, ai xoá được mới được liên kết (chống hai tin nhắn đồng thời)
          const { data: del } = await supabase.from("rrt_telegram_link_codes").delete().eq("user_id", row.user_id).eq("code_hash", hash).select("user_id");
          if (!del || del.length === 0) {
            await postToTG("sendMessage", { chat_id: chatId, text: `❌ <b>Mã đã được sử dụng.</b>`, parse_mode: "HTML" });
          } else {
            const { data: prof } = await supabase.from("profiles").update({ telegram_chat_id: chatId.toString() }).eq("id", row.user_id).select("full_name");
            if (prof && prof.length > 0) {
              await postToTG("sendMessage", { chat_id: chatId, text: `✅ <b>LIÊN KẾT THÀNH CÔNG!</b>\nKính chào <b>${esc(prof[0].full_name)}</b>. Từ nay bạn nhận thông báo điều động qua Telegram.`, parse_mode: "HTML" });
            } else {
              await postToTG("sendMessage", { chat_id: chatId, text: `❌ <b>Không tìm thấy hồ sơ.</b>`, parse_mode: "HTML" });
            }
          }
        }
        return new Response("OK");
      }

      if (text.toLowerCase().startsWith("/start") || text.includes("@")) {
        await postToTG("sendMessage", { chat_id: chatId, text: `🏥 <b>HỆ THỐNG HCDC-RRT</b>\n\nĐể liên kết: đăng nhập ứng dụng HCDC-RRT, bấm <b>Liên kết Telegram</b> để lấy mã 10 ký tự, rồi gửi mã đó vào đây.`, parse_mode: "HTML" });
        return new Response("OK");
      }
    }

    // ==================================================================
    // B. NÚT BẤM (CALLBACK QUERY ROUTER)
    // ==================================================================
    if (update.callback_query && update.callback_query.data) {
      const { id: cb_id, data: cb_data, message } = update.callback_query;

      // -------------------------------------------------------------
      // LUỒNG 1: NÚT PXN PHẢN HỒI
      // -------------------------------------------------------------
      if (cb_data.startsWith("lab_")) {
        const parts = cb_data.split("_");
        const action = parts[1];
        const token = parts[2];

        // BỎ incidents(pathogens) — cột không tồn tại. Chỉ lấy event_name.
        const { data: log } = await supabase
          .from("lab_dispatch_log")
          .select("id, status, requested_sample_count, requested_test_types, test_type_id, pathogens, token_expires_at, laboratories(name), test_types(name), incidents(event_name)")
          .eq("action_token", token)
          .single();
        if (!log || log.status !== "inquiry_sent") {
          await postToTG("answerCallbackQuery", { callback_query_id: cb_id, text: "⚠️ Yêu cầu đã hết hạn hoặc được xử lý.", show_alert: true });
          return new Response("OK");
        }
        if (log.token_expires_at && new Date(log.token_expires_at).getTime() < Date.now()) {
          await postToTG("answerCallbackQuery", { callback_query_id: cb_id, text: "⚠️ Liên kết đã hết hạn (quá 48 giờ).", show_alert: true });
          return new Response("OK");
        }

        let replyText = "";
        let groupStatus = "";
        const labName = (log.laboratories as any)?.name || "Phòng Xét nghiệm";
        const eventName = (log.incidents as any)?.event_name || "Tìm Phòng xét nghiệm (Bản đồ)";

        let testTypesArr = log.requested_test_types || (log.test_type_id ? [(log.test_types as any)?.name] : []);
        const testTypeName = testTypesArr.length > 0 ? testTypesArr.join(", ") : "Không rõ";

        // Tác nhân LẤY TỪ log (không lấy từ incidents)
        let pathogensArr = log.pathogens || [];
        const pathogensName = pathogensArr.length > 0 ? pathogensArr.join(", ") : "Không yêu cầu";

        if (action === "acc") {
          await supabase.from("lab_dispatch_log").update({
            status: "accepted",
            accepted_sample_count: log.requested_sample_count,
            accepted_pathogens: pathogensArr,
            accepted_test_types: testTypesArr,
          }).eq("id", log.id);
          replyText = `✅ ĐÃ XÁC NHẬN NHẬN TOÀN BỘ (${log.requested_sample_count} MẪU)`;
          groupStatus = `✅ Nhận toàn bộ (${log.requested_sample_count} mẫu)`;
        } else if (action === "rej") {
          await supabase.from("lab_dispatch_log").update({ status: "rejected", accepted_sample_count: 0 }).eq("id", log.id);
          replyText = `❌ KHÔNG THỂ TIẾP NHẬN`;
          groupStatus = `❌ Quá tải / Không nhận`;
        }

        await postToTG("editMessageText", {
          chat_id: message.chat.id, message_id: message.message_id,
          text: `${message.text}\n\n━━━━━━━━━━━━━━━━━━━━\n🏁 <b>KẾT QUẢ: ${replyText}</b>\n🕒 <i>Ghi nhận: ${nowVN()}</i>`,
          parse_mode: "HTML", reply_markup: { inline_keyboard: [] },
        });

        // NHỊP 2 — báo Group
        if (GROUP_ID) {
          const labGroupMsg =
            `📢 <b>PHÒNG XÉT NGHIỆM PHẢN HỒI</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🏥 <b>Đơn vị:</b> ${esc(labName)}\n` +
            `📌 <b>Sự kiện:</b> ${esc(eventName)}\n` +
            `🧪 <b>Kỹ thuật YC:</b> ${esc(testTypeName)}\n` +
            `🦠 <b>Tác nhân:</b> ${esc(pathogensName)}\n` +
            `📝 <b>Kết quả:</b> ${groupStatus}\n` +
            `🕒 <b>Thời gian:</b> ${nowVN()}\n` +
            `📱 <i>Kênh phản hồi: Telegram</i>`;
          await postToTG("sendMessage", { chat_id: GROUP_ID, text: labGroupMsg, parse_mode: "HTML" });
        }
        await postToTG("answerCallbackQuery", { callback_query_id: cb_id, text: "Đã ghi nhận phản hồi." });
        return new Response("OK");
      }

      // -------------------------------------------------------------
      // LUỒNG 2: NÚT RRT
      // -------------------------------------------------------------
      const parts = cb_data.split("_");
      if (parts.length < 2) return new Response("OK");
      const action = parts[0];
      const notifId = parts[1];
      const { data: notif } = await supabase
        .from("notifications")
        .select("response_status, responded_at, user_email, incident_id, schedule_id")
        .eq("id", notifId)
        .single();
      if (!notif) {
        await postToTG("answerCallbackQuery", { callback_query_id: cb_id, text: "⚠️ Không tìm thấy dữ liệu mã lệnh này!", show_alert: true });
        return new Response("OK");
      }

      // KHÓA SAU LẦN ĐẦU: chỉ khóa khi ĐÃ confirmed/declined (quyết định thật).
      // 'read' (đã đọc) KHÔNG khóa → vẫn cho xác nhận/từ chối tiếp. Báo rõ trạng thái + giờ.
      if (["confirmed", "declined"].includes(notif.response_status) && action !== "read") {
        const prevLabel = notif.response_status === "confirmed" ? "XÁC NHẬN tham gia" : "KHÔNG THỂ tham gia";
        const whenTxt = notif.responded_at
          ? new Date(notif.responded_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false })
          : "";
        await postToTG("answerCallbackQuery", {
          callback_query_id: cb_id,
          text: `⚠️ Bạn đã ${prevLabel}${whenTxt ? " lúc " + whenTxt : ""}. Ghi nhận giữ nguyên — mỗi thông báo chỉ phản hồi một lần.`,
          show_alert: true,
        });
        return new Response("OK");
      }

      let staffName = notif.user_email;
      let staffId = null;
      const { data: prof } = await supabase.from("profiles").select("id, full_name").ilike("email", escapeIlike(notif.user_email)).maybeSingle();
      if (prof) { staffName = prof.full_name; staffId = prof.id; }

      if (action === "read") {
        // 👉 ĐÃ SỬA: Bỏ response_status: "read" đi để giữ nguyên chữ "confirmed" ban đầu
        await supabase.from("notifications").update({ 
            is_read: true, 
            responded_at: new Date().toISOString() 
        }).eq("id", notifId);
        
        await postToTG("editMessageText", {
          chat_id: message.chat.id, message_id: message.message_id,
          text: `${message.text}\n\n━━━━━━━━━━━━━━━━━━━━\n👁️ <b>ĐÃ GHI NHẬN THÔNG TIN</b>\n🕒 <i>Lúc: ${nowVN()}</i>`,
          parse_mode: "HTML", reply_markup: { inline_keyboard: [] },
        });
        await postToTG("answerCallbackQuery", { callback_query_id: cb_id, text: "Ghi nhận đã đọc." });
        return new Response("OK");
      }

      const finalStatus = action === "confirm" ? "confirmed" : "declined";
      const label = action === "confirm" ? "✅ ĐÃ XÁC NHẬN" : "❌ KHÔNG THỂ THAM GIA";

      await supabase.from("notifications").update({ response_status: finalStatus, responded_at: new Date().toISOString() }).eq("id", notifId);

      let eventName = "Nhiệm vụ nội bộ";
      if (staffId && notif.incident_id) {
        if (action === "confirm") {
          await supabase.from("deployment_history").update({ confirmed_at: new Date().toISOString() }).eq("incident_id", notif.incident_id).eq("user_id", staffId).is("confirmed_at", null);
        } else if (action === "decline") {
          await supabase.from("deployment_history").update({ action_type: "declined", reason: "Không thể tham gia qua Telegram" }).eq("incident_id", notif.incident_id).eq("user_id", staffId).in("action_type", ["deployed", "replace_in"]);
        }

        const { data: inc } = await supabase.from("incidents").select("event_name").eq("id", notif.incident_id).maybeSingle();
        if (inc?.event_name) eventName = inc.event_name;

        // RPC atomic — tránh mất dữ liệu khi 2 phản hồi đến gần như cùng lúc;
        // xem supabase/migrations/20260917000000_atomic_incident_membership.sql
        const { error: rpcErr } = await supabase.rpc("update_incident_membership", {
          p_incident_id: notif.incident_id,
          p_email: notif.user_email,
          p_action: action, // 'confirm' | 'decline'
        });
        if (rpcErr) console.error("Lỗi đồng bộ incidents (RPC):", rpcErr.message);
      }

      if (notif.schedule_id && staffId) {
        eventName = "Phân công ca trực";
        await supabase.from("roster_assignments").update({ assignment_status: finalStatus }).eq("schedule_id", notif.schedule_id).eq("user_id", staffId);
      }

      await postToTG("editMessageText", {
        chat_id: message.chat.id, message_id: message.message_id,
        text: `${message.text}\n\n━━━━━━━━━━━━━━━━━━━━\n🏁 <b>KẾT QUẢ: ${label}</b>\n🕒 <i>Ghi nhận: ${nowVN()}</i>`,
        parse_mode: "HTML", reply_markup: { inline_keyboard: [] },
      });

      if (GROUP_ID) {
        const rrtGroupMsg = `📢 <b>CẬP NHẬT THÔNG TIN RRT</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Nhân sự:</b> ${esc(staffName)}\n📌 <b>Sự kiện:</b> ${esc(eventName)}\n📝 <b>Phản hồi:</b> ${label}\n📱 <i>Kênh phản hồi: Telegram</i>`;
        await postToTG("sendMessage", { chat_id: GROUP_ID, text: rrtGroupMsg, parse_mode: "HTML" });
      }
      await postToTG("answerCallbackQuery", { callback_query_id: cb_id, text: "Hệ thống đã ghi nhận!" });
      return new Response("OK");
    }

    return new Response("OK");
  } catch (err) {
    console.error("LỖI HỆ THỐNG:", (err as Error).message);
    return new Response("OK");
  }
});