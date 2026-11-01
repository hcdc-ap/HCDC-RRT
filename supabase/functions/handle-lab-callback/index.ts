// ============================================================================
// EDGE FUNCTION: handle-lab-callback — v7
// v7: dùng module dùng chung (_shared), kiểm tra hết hạn token (token_expires_at
//   được set khi gửi khảo sát nhưng trước đây không bao giờ được kiểm tra lại),
//   select cột cụ thể thay vì "*", fetch Telegram có timeout.
// v6: BỎ incidents(pathogens) — cột KHÔNG tồn tại → query GET lỗi làm
//   PXN bấm nút email nhận "hết hạn". Lấy tác nhân từ lab_dispatch_log.pathogens.
// GIỮ: redirect trang tĩnh + báo Group Nhịp 2 (Form web / nút Email).
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { esc } from "../_shared/html.ts";
import { nowVN } from "../_shared/time.ts";
import { createTelegramClient } from "../_shared/telegram.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const GROUP_ID = Deno.env.get("TELEGRAM_GROUP_ID");
const postToTG = createTelegramClient(BOT_TOKEN);

const LAB_DISPATCH_COLUMNS =
  "id, status, requested_sample_count, requested_test_types, test_type_id, pathogens, token_expires_at, laboratories(name), test_types(name), incidents(event_name)";

const LAB_RESULT_PAGE = "https://hcdc-ap.github.io/HCDC-RRT/lab-result.html";
const redirectResult = (status: string, msg: string) =>
  Response.redirect(
    `${LAB_RESULT_PAGE}?status=${encodeURIComponent(status)}&msg=${encodeURIComponent(msg)}`,
    302
  );

function isExpired(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return false;
  return new Date(tokenExpiresAt).getTime() < Date.now();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    // =======================================================
    // LUỒNG 1: POST — FORM "NHẬN 1 PHẦN" (trả JSON)
    // =======================================================
    if (req.method === "POST") {
      const body = await req.json();
      const pToken = body.token;
      if (!pToken) {
        return new Response(JSON.stringify({ success: false, message: "Missing token" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: log, error: logErr } = await supabase
        .from("lab_dispatch_log")
        .select(LAB_DISPATCH_COLUMNS)
        .eq("action_token", pToken)
        .single();

      if (logErr || !log || log.status !== "inquiry_sent") {
        return new Response(JSON.stringify({ success: false, message: "Invalid or expired" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (isExpired(log.token_expires_at)) {
        return new Response(JSON.stringify({ success: false, message: "Token expired" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const reqQty = log.requested_sample_count || 0;
      const acceptedQty = parseInt(body.accepted_qty, 10);
      if (!Number.isFinite(acceptedQty) || acceptedQty <= 0 || acceptedQty > reqQty) {
        return new Response(
          JSON.stringify({ success: false, message: `Số lượng nhận không hợp lệ (1..${reqQty}).` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("lab_dispatch_log")
        .update({
          status: "partially_accepted",
          accepted_sample_count: acceptedQty,
          accepted_test_types: body.accepted_test_types,
          accepted_pathogens: body.accepted_pathogens,
        })
        .eq("id", log.id);

      // NHỊP 2 — báo Group
      const labName = (log.laboratories as any)?.name || "Phòng Xét nghiệm";
      const eventName = (log.incidents as any)?.event_name || "Tìm Phòng xét nghiệm (Bản đồ)";
      const testTypeName = body.accepted_test_types && body.accepted_test_types.length > 0 ? body.accepted_test_types.join(", ") : "Không rõ";
      const pathogensName = body.accepted_pathogens && body.accepted_pathogens.length > 0 ? body.accepted_pathogens.join(", ") : "Không yêu cầu";
      const groupStatus = `⚠️ Nhận một phần (${acceptedQty}/${reqQty} mẫu)`;
      const labGroupMsg =
        `📢 <b>PHÒNG XÉT NGHIỆM PHẢN HỒI</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏥 <b>Đơn vị:</b> ${esc(labName)}\n` +
        `📌 <b>Sự kiện:</b> ${esc(eventName)}\n` +
        `🧪 <b>Kỹ thuật nhận:</b> ${esc(testTypeName)}\n` +
        `🦠 <b>Tác nhân nhận:</b> ${esc(pathogensName)}\n` +
        `📝 <b>Kết quả:</b> ${groupStatus}\n` +
        `🕒 <b>Thời gian:</b> ${nowVN()}\n` +
        `💻 <i>Kênh phản hồi: Webapp HCDC-RRT</i>`;
      await postToTG("sendMessage", { chat_id: GROUP_ID, text: labGroupMsg, parse_mode: "HTML" });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =======================================================
    // LUỒNG 2: GET
    // =======================================================
    if (req.method === "GET") {
      const action = url.searchParams.get("action");

      // 2A. get_info → JSON cho form "Nhận 1 phần"
      if (action === "get_info") {
        if (!token) {
          return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const { data: log, error: logErr } = await supabase
          .from("lab_dispatch_log")
          .select("status, requested_test_types, test_type_id, test_types(name), requested_sample_count, pathogens, token_expires_at")
          .eq("action_token", token)
          .single();
        if (logErr || !log) return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        let testTypesArr = [];
        if (Array.isArray(log.requested_test_types) && log.requested_test_types.length > 0) {
          testTypesArr = log.requested_test_types;
        } else if ((log.test_types as any)?.name) {
          testTypesArr = [(log.test_types as any).name];
        }
        return new Response(
          JSON.stringify({
            success: true,
            status: log.status,
            expired: isExpired(log.token_expires_at),
            test_types: testTypesArr,
            requested_qty: log.requested_sample_count,
            pathogens: log.pathogens || [],
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2B. Nút bấm từ email → REDIRECT sang trang tĩnh
      if (!token || !action) {
        return redirectResult("error", "Thiếu mã xác thực trong đường dẫn.");
      }

      const { data: log, error: logErr } = await supabase
        .from("lab_dispatch_log")
        .select(LAB_DISPATCH_COLUMNS)
        .eq("action_token", token)
        .single();

      if (logErr || !log) {
        return redirectResult("error", "Mã xác thực không đúng hoặc đã bị xóa.");
      }
      if (log.status !== "inquiry_sent") {
        return redirectResult("done", "Yêu cầu này đã được đơn vị xử lý trước đó. Bạn không cần thao tác lại, xin cảm ơn!");
      }
      if (isExpired(log.token_expires_at)) {
        return redirectResult("expired", "Liên kết này đã hết hạn (quá 48 giờ kể từ khi gửi yêu cầu). Vui lòng liên hệ HCDC để được gửi lại yêu cầu.");
      }

      const labName = (log.laboratories as any)?.name || "Phòng Xét nghiệm";
      const eventName = (log.incidents as any)?.event_name || "Điều phối độc lập";
      let testTypesArr = log.requested_test_types || (log.test_type_id ? [(log.test_types as any)?.name] : []);
      const testTypeName = testTypesArr.length > 0 ? testTypesArr.join(", ") : "Không rõ";
      // Tác nhân LẤY TỪ log (không lấy từ incidents)
      let pathogensArr = log.pathogens || [];
      const pathogensName = pathogensArr.length > 0 ? pathogensArr.join(", ") : "Không yêu cầu";

      let groupStatus = "";
      if (action === "accept_all") {
        await supabase
          .from("lab_dispatch_log")
          .update({
            status: "accepted",
            accepted_sample_count: log.requested_sample_count,
            accepted_pathogens: pathogensArr,
            accepted_test_types: testTypesArr,
          })
          .eq("id", log.id);

        groupStatus = `✅ Nhận toàn bộ (${log.requested_sample_count} mẫu)`;
        const labGroupMsg =
          `📢 <b>PHÒNG XÉT NGHIỆM PHẢN HỒI</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏥 <b>Đơn vị:</b> ${esc(labName)}\n` +
          `📌 <b>Sự kiện:</b> ${esc(eventName)}\n` +
          `🧪 <b>Kỹ thuật:</b> ${esc(testTypeName)}\n` +
          `🦠 <b>Tác nhân:</b> ${esc(pathogensName)}\n` +
          `📝 <b>Kết quả:</b> ${groupStatus}\n` +
          `🕒 <b>Thời gian:</b> ${nowVN()}\n` +
          `📧 <i>Kênh phản hồi: Email</i>`;
        await postToTG("sendMessage", { chat_id: GROUP_ID, text: labGroupMsg, parse_mode: "HTML" });
        return redirectResult("accepted", `Hệ thống HCDC ghi nhận đơn vị sẽ tiếp nhận toàn bộ <b>${log.requested_sample_count} mẫu</b>. Xin cảm ơn sự phối hợp của đơn vị!`);

      } else if (action === "reject") {
        await supabase
          .from("lab_dispatch_log")
          .update({ status: "rejected", accepted_sample_count: 0 })
          .eq("id", log.id);

        groupStatus = `❌ Quá tải / Không nhận`;
        const labGroupMsg =
          `📢 <b>PHÒNG XÉT NGHIỆM PHẢN HỒI</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏥 <b>Đơn vị:</b> ${esc(labName)}\n` +
          `📌 <b>Sự kiện:</b> ${esc(eventName)}\n` +
          `🧪 <b>Kỹ thuật:</b> ${esc(testTypeName)}\n` +
          `🦠 <b>Tác nhân:</b> ${esc(pathogensName)}\n` +
          `📝 <b>Kết quả:</b> ${groupStatus}\n` +
          `🕒 <b>Thời gian:</b> ${nowVN()}\n` +
          `📧 <i>Kênh phản hồi: Email</i>`;
        await postToTG("sendMessage", { chat_id: GROUP_ID, text: labGroupMsg, parse_mode: "HTML" });
        return redirectResult("rejected", "Hệ thống ghi nhận đơn vị hiện đang quá tải hoặc không thể tiếp nhận mẫu lần này. Xin cảm ơn phản hồi của đơn vị!");
      }

      return redirectResult("error", "Hành động không hợp lệ.");
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (err) {
    return redirectResult("error", `Lỗi hệ thống: ${(err as Error).message}`);
  }
});
