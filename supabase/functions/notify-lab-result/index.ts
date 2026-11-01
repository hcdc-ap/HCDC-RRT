// ============================================================================
// EDGE FUNCTION: notify-lab-result — v6
// v6: module dùng chung (_shared), bắt buộc JWT người dùng đã đăng nhập (trước đây
//   verify_jwt=false + không kiểm tra gì nên gọi thẳng bằng anon key cũng thực thi
//   được), secret gửi email đọc từ biến môi trường thay vì hardcode trong source,
//   song song hoá 2 truy vấn độc lập (incident/test_type), select cột cụ thể,
//   fetch Telegram/GAS có timeout.
// v5.2: Thêm Vòng lặp Retry chống xịt Email.
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
const postToTG = createTelegramClient(BOT_TOKEN);

const ACTION_CFG: Record<string, { label: string; color: string; subject: string; qtyLabel: string }> = {
  dispatched:   { label: "✅ XÁC NHẬN YÊU CẦU ĐIỀU PHỐI MẪU",   color: "#006a75", subject: "Xác nhận yêu cầu điều phối mẫu",  qtyLabel: "Số lượng" },
  cancelled:    { label: "❌ THU HỒI YÊU CẦU ĐIỀU PHỐI MẪU", color: "#dc2626", subject: "Thu hồi yêu cầu điều phối mẫu",  qtyLabel: "Số lượng" },
  not_selected: { label: "ℹ️ THÔNG BÁO KẾT QUẢ ĐIỀU PHỐI MẪU", color: "#fe6a35", subject: "Kết quả điều phối mẫu", qtyLabel: "Số lượng" },
};

const DISPATCH_COLUMNS =
  "id, lab_id, incident_id, test_type_id, sample_count, requested_sample_count, requested_test_types, accepted_test_types, pathogens, accepted_pathogens";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Chỉ Quản trị RRT (HCDC): gửi thông tin thật tới Phòng xét nghiệm
  const auth = await requireRrtAdmin(req, supabase);
  if (!auth.ok) return auth.response;

  try {
    const payload = await req.json();
    const { logId, action, message } = payload;
    if (!logId || !action) return new Response(JSON.stringify({ error: "Missing payload" }), { status: 400, headers: corsHeaders });

    const cfg = ACTION_CFG[action] || ACTION_CFG.cancelled;

    // 1. LOG ĐIỀU PHỐI
    const { data: dispatchData } = await supabase.from("lab_dispatch_log").select(DISPATCH_COLUMNS).eq("id", logId).single();
    if (!dispatchData) throw new Error("Không tìm thấy log ID");

    // 2. THÔNG TIN PXN
    const { data: lab } = await supabase.from("laboratories").select("name, head_email, survey_email, telegram_chat_id").eq("id", dispatchData.lab_id).single();
    if (!lab) throw new Error("Lỗi query PXN");

    // 3. SỰ KIỆN + KỸ THUẬT (song song, cả hai chỉ phụ thuộc dispatchData đã có)
    const [incResult, testTypeResult] = await Promise.all([
      dispatchData.incident_id
        ? supabase.from("incidents").select("event_name").eq("id", dispatchData.incident_id).maybeSingle()
        : Promise.resolve({ data: null }),
      (!dispatchData.accepted_test_types || dispatchData.accepted_test_types.length === 0) &&
      (!dispatchData.requested_test_types || dispatchData.requested_test_types.length === 0) &&
      dispatchData.test_type_id
        ? supabase.from("test_types").select("name").eq("id", dispatchData.test_type_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let eventName = "Yêu cầu giám sát dịch bệnh";
    if (incResult.data?.event_name) eventName = incResult.data.event_name;

    let testTypeName = "Xét nghiệm chuyên sâu";
    const finalTechs = (dispatchData.accepted_test_types && dispatchData.accepted_test_types.length > 0) ? dispatchData.accepted_test_types : dispatchData.requested_test_types;
    if (Array.isArray(finalTechs) && finalTechs.length > 0) testTypeName = finalTechs.join(", ");
    else if (testTypeResult.data?.name) testTypeName = testTypeResult.data.name;

    let pathogensList = "Không chỉ định cụ thể";
    let rawPathogens = dispatchData.accepted_pathogens;
    if (!rawPathogens || rawPathogens.length === 0) {
      rawPathogens = dispatchData.pathogens;
    }
    if (Array.isArray(rawPathogens) && rawPathogens.length > 0) {
      pathogensList = rawPathogens.join(", ");
    }

    const labName = lab.name || "Phòng Xét nghiệm";
    const labEmail = lab.head_email || lab.survey_email;
    const reqCount = dispatchData.sample_count || dispatchData.requested_sample_count || 0;
    const timeString = fmtVN(new Date());

    // ==========================================
    // 4. TELEGRAM THÔNG BÁO CHO PXN & GROUP
    // ==========================================
    let telegramSuccess = false;
    if (lab.telegram_chat_id && BOT_TOKEN) {
      const privateMsg = `<b>${cfg.label}</b>\n━━━━━━━━━━━━━━━━━━━━\nKính gửi <b>${esc(labName)}</b>,\n\n📌 <b>Sự kiện:</b> ${esc(eventName)}\n🧪 <b>Kỹ thuật:</b> ${esc(testTypeName)}\n🦠 <b>Tác nhân:</b> ${esc(pathogensList)}\n📦 <b>${cfg.qtyLabel}:</b> ${reqCount} mẫu\n🕒 <b>Thời gian:</b> ${timeString}\n\n<i>${esc(message)}</i>`;
      const tgRes = await postToTG("sendMessage", { chat_id: lab.telegram_chat_id, text: privateMsg, parse_mode: "HTML" });
      if (tgRes?.ok) telegramSuccess = true;
    }

    if (GROUP_ID && BOT_TOKEN) {
      let groupText = "";
      if (action === 'dispatched') {
        groupText = `🚀 <b>ĐÃ CHỐT ĐIỀU PHỐI MẪU</b>\n━━━━━━━━━━━━━━━━━━━━\n🏥 <b>Đơn vị:</b> ${esc(labName)}\n📌 <b>Sự kiện:</b> ${esc(eventName)}\n🧪 <b>Kỹ thuật:</b> ${esc(testTypeName)}\n🦠 <b>Tác nhân:</b> ${esc(pathogensList)}\n📦 <b>Số lượng:</b> <b>${reqCount} mẫu</b>\n🕒 <b>Thời gian:</b> ${timeString}\n👨‍💻 <i>Thao tác bởi: Admin HCDC-RRT</i>`;
      }
      else if (action === 'cancelled' || action === 'not_selected') {
        const titleIcon = action === 'cancelled' ? '🛑 <b>ĐÃ HỦY YÊU CẦU ĐIỀU PHỐI MẪU</b>' : 'ℹ️ <b>THÔNG BÁO PHÒNG XÉT NGHIỆM</b>';
        const reason = action === 'cancelled' ? 'Lệnh đã chốt bị thu hồi' : 'HCDC đã chọn đơn vị khác';
        groupText = `${titleIcon}\n━━━━━━━━━━━━━━━━━━━━\n🏥 <b>Đơn vị:</b> ${esc(labName)}\n📌 <b>Sự kiện:</b> ${esc(eventName)}\n🧪 <b>Kỹ thuật:</b> ${esc(testTypeName)}\n🦠 <b>Tác nhân:</b> ${esc(pathogensList)}\n📦 <b>Số lượng:</b> ${dispatchData.requested_sample_count || 0} mẫu\n📝 <b>Lý do:</b> ${reason}\n🕒 <b>Thời gian:</b> ${timeString}\n👨‍💻 <i>Thao tác bởi: Admin HCDC-RRT</i>`;
      }
      if (groupText !== "") await postToTG("sendMessage", { chat_id: GROUP_ID, text: groupText, parse_mode: "HTML" });
    }

    // ==========================================
    // 5. EMAIL CHO PXN (GAS) - RETRY LOOP
    // ==========================================
    let emailSuccess = false;
    let emailError = "";
    if (GAS_WEBHOOK_URL && labEmail) {
      try {
        const emailBody = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
          <div style="background-color: ${cfg.color}; padding: 20px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 1px;">${cfg.label}</h2>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #374151; margin-top: 0;">Kính gửi đầu mối <b>${esc(labName)}</b>,</p>
            <div style="background-color: #f3f4f6; border-left: 4px solid ${cfg.color}; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0;">
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>Sự kiện:</b> ${esc(eventName)}</p>
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>Kỹ thuật:</b> ${esc(testTypeName)}</p>
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>Loại tác nhân:</b> ${esc(pathogensList)}</p>
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>${cfg.qtyLabel}:</b> ${reqCount} mẫu</p>
              <p style="margin: 0; color: #1f2937;"><b>Cập nhật lúc:</b> <span style="color:#4b5563;">${timeString}</span></p>
            </div>
            <p style="font-size: 15px; color: #1f2937; margin-bottom: 25px; line-height: 1.5;">${esc(message)}</p>
          </div>
          <div style="background-color: #f9fafb; padding: 15px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">
            <p style="margin: 0;"><b>Hệ thống HCDC-RRT</b></p>
          </div>
        </div>`;

        const subject = `[HCDC] ${cfg.subject} – ${eventName}`.substring(0, 110);
        const gasPayload = {
          webhook_secret: GAS_WEBHOOK_SECRET,
          // Cho phép GAS tự chống gửi trùng khi request này bị gọi lại (timeout/mất kết nối).
          // Gồm cả "action" vì cùng logId có thể gửi nhiều loại email khác nhau theo thời gian
          // (dispatched/cancelled/not_selected).
          idempotency_key: `notify-lab-result_${logId}_${action}`,
          toEmail: labEmail,
          subject,
          htmlContent: emailBody,
          senderName: SENDER_NAME,
          replyTo: SENDER_EMAIL
        };

        // 👉 VÒNG LẶP RETRY BẢO VỆ EMAIL
        for (let i = 0; i < 4; i++) {
          try {
            const response = await fetchWithTimeout(GAS_WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(gasPayload)
            }, 10000);
            if (response.ok) {
              const resData = await response.json();
              if (resData.success) {
                emailSuccess = true;
                break; // Gửi thành công thì thoát vòng lặp ngay
              } else throw new Error(resData.error || "Lỗi xử lý nội bộ GAS");
            } else throw new Error(`HTTP Lỗi ${response.status}`);
          } catch (err) {
            if (i < 3) await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 2000)); // Đợi 2-4s rồi thử lại
            else emailError = (err as Error).message;
          }
        }
      } catch (err) { emailError = (err as Error).message; }
    }

    // ==========================================
    // 6. TẠO THÔNG BÁO NỘI BỘ CHO RRT KHI HỦY LỆNH
    // ==========================================
    if (action === 'cancelled' && dispatchData.incident_id) {
      try {
        const { data: incObj } = await supabase.from("incidents").select("members").eq("id", dispatchData.incident_id).single();
        if (incObj?.members) {
          const emails = incObj.members.split(";").map((e: string) => e.trim().toLowerCase()).filter(Boolean);
          if (emails.length > 0) {
            const cancelMsg = `Lệnh điều phối ${reqCount} mẫu (Kỹ thuật: ${testTypeName} | Tác nhân: ${pathogensList}) tới "${labName}" ĐÃ BỊ THU HỒI.\n\nLý do: Admin đã thao tác hủy lệnh trên hệ thống.\nVui lòng NGƯNG quá trình chuẩn bị / vận chuyển mẫu đến đơn vị này.`;

            const notifRows = emails.map((email: string) => ({
              user_email: email,
              message: cancelMsg,
              notification_type: "huy_lenh",
              incident_id: dispatchData.incident_id,
              is_read: false,
              response_status: "confirmed"
            }));
            await supabase.from("notifications").insert(notifRows);
            console.log(`✅ Đã tạo thông báo báo động hủy lệnh cho ${emails.length} thành viên RRT.`);
          }
        }
      } catch (err) {
        console.error("Lỗi tạo thông báo nội bộ cho RRT:", err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, telegram: telegramSuccess, email: emailSuccess, ...(emailError ? { email_error: emailError } : {}) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
