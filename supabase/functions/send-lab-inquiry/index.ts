// ============================================================================
// EDGE FUNCTION: send-lab-inquiry (KHẢO SÁT NĂNG LỰC PXN) — v4
// v4: module dùng chung (_shared), bắt buộc JWT người dùng đã đăng nhập (trước đây
//   verify_jwt=false + không kiểm tra gì nên gọi thẳng bằng anon key cũng thực thi
//   được), secret gửi email đọc từ biến môi trường thay vì hardcode trong source,
//   select cột cụ thể, fetch GAS có timeout.
// v3.4: Bổ sung: Gỡ bỏ cột lỗi khỏi truy vấn incidents để lấy đúng Tên sự kiện
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { esc } from "../_shared/html.ts";
import { fmtVN } from "../_shared/time.ts";
import { createTelegramClient } from "../_shared/telegram.ts";
import { requireRrtAdmin } from "../_shared/auth.ts";
import { fetchWithTimeout } from "../_shared/http.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const GROUP_ID = Deno.env.get("TELEGRAM_GROUP_ID");
const GAS_WEBHOOK_URL = Deno.env.get("GAS_WEBHOOK_URL");
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "hcdc.ap.github@gmail.com";
const SENDER_NAME = "Hệ thống HCDC-RRT";
// Bắt buộc đặt bằng `supabase secrets set GAS_WEBHOOK_SECRET=...` (khớp với phía Google Apps Script);
// không còn giá trị dự phòng ghi cứng trong mã.
const GAS_WEBHOOK_SECRET = Deno.env.get("GAS_WEBHOOK_SECRET");
const PARTIAL_ACCEPT_URL = "https://hcdc-ap.github.io/HCDC-RRT/lab-response.html";
const postToTG = createTelegramClient(BOT_TOKEN);

const DISPATCH_COLUMNS =
  "id, lab_id, incident_id, status, requested_test_types, test_type_id, pathogens, requested_sample_count, created_at, action_token, token_expires_at";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Chỉ Quản trị RRT (HCDC): gửi thông tin thật tới Phòng xét nghiệm
  const auth = await requireRrtAdmin(req, supabase);
  if (!auth.ok) return auth.response;

  try {
    const payload = await req.json();
    const record = payload.record || payload;
    if (!record || !record.id) {
      return new Response(JSON.stringify({ error: "No record id provided" }), { status: 400, headers: corsHeaders });
    }
    const dispatchId = record.id;

    // 1. LOG ĐIỀU PHỐI
    const { data: dispatchData, error: fetchErr } = await supabase
        .from("lab_dispatch_log")
        .select(DISPATCH_COLUMNS)
        .eq("id", dispatchId)
        .single();
    if (fetchErr || !dispatchData) throw new Error(`Không tìm thấy log điều phối ID: ${dispatchId}`);
    // Chỉ gửi khảo sát cho yêu cầu điều phối THẬT (HCDC tạo), không gửi cho đề xuất
    // nội bộ (suggested) của tuyến cơ sở / Đội trưởng hay yêu cầu đã xử lý xong.
    if (dispatchData.status !== "inquiry_sent") {
      return new Response(JSON.stringify({ error: `Yêu cầu ở trạng thái "${dispatchData.status}" — không gửi khảo sát.` }), { status: 409, headers: corsHeaders });
    }

    const { data: lab, error: labErr } = await supabase.from("laboratories").select("name, head_email, survey_email, telegram_chat_id").eq("id", dispatchData.lab_id).single();
    if (labErr || !lab) throw new Error(`Lỗi query PXN: ${labErr?.message}`);

    // ==========================================
    // 3. CƠ CHẾ KHÔI PHỤC DỮ LIỆU (QUÉT THÔNG MINH)
    // ==========================================
    const reqTechs = Array.isArray(dispatchData.requested_test_types) ? dispatchData.requested_test_types : [];

    // Bổ sung kỹ thuật / tác nhân còn thiếu CHỈ từ yêu cầu trước của CÙNG SỰ KIỆN.
    // KHÔNG lấy mã sự kiện từ yêu cầu khác: trước đây yêu cầu không gắn sự kiện
    // (tìm PXN từ Bản đồ) bị gắn nhầm vào sự kiện cũ của cùng PXN.
    if (dispatchData.incident_id && reqTechs.length === 0) {
      const { data: prevLogs } = await supabase
        .from("lab_dispatch_log")
        .select("incident_id, requested_test_types, test_type_id, pathogens")
        .eq("lab_id", dispatchData.lab_id)
        .eq("incident_id", dispatchData.incident_id)
        .neq("id", dispatchId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (prevLogs && prevLogs.length > 0) {
        let validLog = prevLogs.find(l => (Array.isArray(l.requested_test_types) && l.requested_test_types.length > 0) || l.test_type_id);
        if (!validLog) validLog = prevLogs[0];


        if (reqTechs.length === 0) {
          dispatchData.requested_test_types = validLog.requested_test_types;
          dispatchData.test_type_id = validLog.test_type_id;
        }

        if (!dispatchData.pathogens || (Array.isArray(dispatchData.pathogens) && dispatchData.pathogens.length === 0)) {
          dispatchData.pathogens = validLog.pathogens;
        }

        await supabase.from("lab_dispatch_log").update({
          requested_test_types: dispatchData.requested_test_types,
          test_type_id: dispatchData.test_type_id,
          pathogens: dispatchData.pathogens
        }).eq("id", dispatchId);
      }
    }

    // ==========================================
    // 4. SỰ KIỆN + DỮ LIỆU ĐA TẦNG
    // ==========================================
    let eventName = "Yêu cầu giám sát dịch bệnh";

    if (dispatchData.incident_id) {
      // Chỉ gọi "event_name", tuyệt đối không gọi "pathogens" ở bảng incidents (cột không tồn tại)!
      const { data: inc } = await supabase
        .from("incidents")
        .select("event_name")
        .eq("id", dispatchData.incident_id)
        .maybeSingle();

      if (inc?.event_name) eventName = inc.event_name;
    }

    let testTypeName = "Xét nghiệm chuyên sâu";
    if (Array.isArray(dispatchData.requested_test_types) && dispatchData.requested_test_types.length > 0) {
      testTypeName = dispatchData.requested_test_types.join(", ");
    } else if (dispatchData.test_type_id) {
      const { data: tt } = await supabase.from("test_types").select("name").eq("id", dispatchData.test_type_id).maybeSingle();
      if (tt?.name) testTypeName = tt.name;
    }

    let pathogensList = "Không chỉ định cụ thể";
    let rawPathogens = dispatchData.pathogens;

    if (Array.isArray(rawPathogens) && rawPathogens.length > 0) {
      pathogensList = rawPathogens.join(", ");
    }

    // 5. ACTION TOKEN
    let actionToken = dispatchData.action_token;
    if (!actionToken) {
      actionToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);
      await supabase.from("lab_dispatch_log").update({ action_token: actionToken, token_expires_at: expiresAt.toISOString() }).eq("id", dispatchId);
    }

    const labName = lab.name || "Phòng Xét nghiệm";
    const labEmail = lab.head_email || lab.survey_email;
    const reqCount = dispatchData.requested_sample_count || 0;
    const timeString = fmtVN(new Date(dispatchData.created_at || Date.now()));
    const typeLabel = "🔬 YÊU CẦU ĐIỀU PHỐI MẪU";
    const actionText = `HCDC cần điều phối ${reqCount} mẫu. Vui lòng xác nhận năng lực tiếp nhận:`;

    const tgKeyboard = [
      [{ text: `✅ Nhận toàn bộ (${reqCount} mẫu)`, callback_data: `lab_acc_${actionToken}` }],
      [{ text: `⚠️ Nhận một phần (Nhập số lượng)`, url: `${PARTIAL_ACCEPT_URL}?token=${actionToken}` }],
      [{ text: `❌ Không nhận / Quá tải`, callback_data: `lab_rej_${actionToken}` }],
    ];

    // ==========================================
    // 6. TELEGRAM
    // ==========================================
    let telegramSuccess = false;

    if (lab.telegram_chat_id && BOT_TOKEN) {
      const privateMsg =
        `<b>${typeLabel}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Kính gửi <b>${esc(labName)}</b>,\n\n` +
        `📌 <b>Sự kiện:</b> ${esc(eventName)}\n` +
        `🧪 <b>Kỹ thuật:</b> ${esc(testTypeName)}\n` +
        `🦠 <b>Tác nhân:</b> ${esc(pathogensList)}\n` +
        `📦 <b>Số lượng:</b> ${reqCount} mẫu\n` +
        `🕒 <b>Thời gian gửi Yêu cầu:</b> ${timeString}\n\n` +
        `<i>${esc(actionText)}</i>\n` +
        `⏳ <b>LƯU Ý: Vui lòng phản hồi trong vòng 30 PHÚT.</b>`;

      const tgRes = await postToTG("sendMessage", {
        chat_id: lab.telegram_chat_id, text: privateMsg, parse_mode: "HTML", reply_markup: { inline_keyboard: tgKeyboard },
      });
      if (tgRes?.ok) telegramSuccess = true;
    }

    if (GROUP_ID && BOT_TOKEN) {
      const groupMsg =
        `📡 <b>YÊU CẦU ĐIỀU PHỐI MẪU</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏥 <b>Đơn vị:</b> ${esc(labName)}\n` +
        `📌 <b>Sự kiện:</b> ${esc(eventName)}\n` +
        `🧪 <b>Kỹ thuật:</b> ${esc(testTypeName)}\n` +
        `🦠 <b>Tác nhân:</b> ${esc(pathogensList)}\n` +
        `📦 <b>Số lượng:</b> ${reqCount} mẫu\n` +
        `🕒 <b>Thời gian:</b> ${timeString}\n` +
        `⏳ <i>Hệ thống đang chờ PXN phản hồi...</i>`;

      await postToTG("sendMessage", { chat_id: GROUP_ID, text: groupMsg, parse_mode: "HTML" });
    }

    // ==========================================
    // 7. EMAIL (GAS)
    // ==========================================
    let emailSuccess = false;
    let emailError = "";
    if (GAS_WEBHOOK_URL && labEmail) {
      try {
        const projectUrl = Deno.env.get("SUPABASE_URL")!;
        const cbBase = `${projectUrl}/functions/v1/handle-lab-callback`;
        const linkAcceptAll = `${cbBase}?token=${actionToken}&action=accept_all`;
        const linkReject = `${cbBase}?token=${actionToken}&action=reject`;
        const linkPartial = `${PARTIAL_ACCEPT_URL}?token=${actionToken}`;

        const actionButtons = `
          <div style="margin-bottom: 10px;">
            <a href="${linkAcceptAll}" style="display:inline-block; padding:12px 24px; background-color:#16a34a; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:bold; text-align:center; width: 100%; box-sizing: border-box;">✅ Nhận toàn bộ (${reqCount} mẫu)</a>
          </div>
          <div style="margin-bottom: 10px;">
            <a href="${linkPartial}" style="display:inline-block; padding:12px 24px; background-color:#eab308; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:bold; text-align:center; width: 100%; box-sizing: border-box;">⚠️ Nhận một phần (Tùy chọn)</a>
          </div>
          <div>
            <a href="${linkReject}" style="display:inline-block; padding:12px 24px; background-color:#dc2626; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:bold; text-align:center; width: 100%; box-sizing: border-box;">❌ Không nhận / Quá tải</a>
          </div>`;

        const emailBody = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
          <div style="background-color: #006a75; padding: 20px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 1px;">${typeLabel}</h2>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #374151; margin-top: 0;">Kính gửi đầu mối <b>${esc(labName)}</b>,</p>
            <div style="background-color: #f3f4f6; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0;">
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>Sự kiện:</b> ${esc(eventName)}</p>
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>Kỹ thuật yêu cầu:</b> ${esc(testTypeName)}</p>
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>Loại tác nhân:</b> ${esc(pathogensList)}</p>
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>Số lượng:</b> ${reqCount} mẫu</p>
              <p style="margin: 0; color: #1f2937;"><b>Thời gian phát lệnh:</b> <span style="color:#d97706; font-weight:bold;">${timeString}</span></p>
            </div>
            <p style="font-size: 15px; color: #4b5563; margin-bottom: 10px;"><i>${esc(actionText)}</i></p>
            <p style="font-size: 15px; color: #dc2626; font-weight: bold; margin-bottom: 25px;">⏳ Vui lòng phản hồi trong vòng 30 PHÚT.</p>
            <div style="text-align: center;">${actionButtons}</div>
          </div>
          <div style="background-color: #f9fafb; padding: 15px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">
            <p style="margin: 0;"><b>Hệ thống HCDC-RRT</b></p>
          </div>
        </div>`;

        const subject = `[HCDC] Khẩn: Điều phối mẫu – ${eventName}`.substring(0, 110);
        const gasPayload = {
          webhook_secret: GAS_WEBHOOK_SECRET,
          // Cho phép GAS tự chống gửi trùng khi request này bị gọi lại (timeout/mất kết nối)
          idempotency_key: `send-lab-inquiry_${dispatchId}`,
          toEmail: labEmail, subject, htmlContent: emailBody,
          senderName: SENDER_NAME, replyTo: SENDER_EMAIL,
        };
        const response = await fetchWithTimeout(GAS_WEBHOOK_URL, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gasPayload),
        }, 10000);
        if (response.ok) {
          const resData = await response.json();
          if (resData.success) emailSuccess = true;
        }
      } catch (err) {
        emailError = (err as Error).message;
      }
    }

    await supabase.from("lab_dispatch_log").update({ status: "inquiry_sent" }).eq("id", dispatchId);

    return new Response(JSON.stringify({ success: true, telegram: telegramSuccess, email: emailSuccess, ...(emailError ? { email_error: emailError } : {}) }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Lỗi hệ thống:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
