// ============================================================================
// EDGE FUNCTION: send-notification — v2
// v2: module dùng chung (_shared), song song hoá 4 truy vấn độc lập (notification/
//   profile/incident/roster), secret gửi email đọc từ biến môi trường thay vì
//   hardcode trong source, fetch Telegram/GAS có timeout.
// (Bản vá lỗi hiển thị nút bấm Hủy Lệnh)
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { esc } from "../_shared/html.ts";
import { createTelegramClient } from "../_shared/telegram.ts";
import { fetchWithTimeout } from "../_shared/http.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const GROUP_ID = Deno.env.get("TELEGRAM_GROUP_ID")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const GAS_WEBHOOK_URL = Deno.env.get("GAS_WEBHOOK_URL");
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "hcdc.ap.github@gmail.com";
const SENDER_NAME = "Hệ thống HCDC-RRT";
// Bắt buộc đặt bằng `supabase secrets set GAS_WEBHOOK_SECRET=...` (khớp với phía Google Apps Script);
// không còn giá trị dự phòng ghi cứng trong mã.
const GAS_WEBHOOK_SECRET = Deno.env.get("GAS_WEBHOOK_SECRET");
const postToTG = createTelegramClient(BOT_TOKEN);

serve(async (req) => {
  try {
    if (WEBHOOK_SECRET) {
      const secret = req.headers.get("x-webhook-secret");
      if (secret !== WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
    }
    const payload = await req.json();
    const record = payload.record || payload;
    if (!record || !record.id) return new Response("No record", { status: 400 });

    const { id, user_email, message, incident_id, schedule_id, notification_type } = record;

    // 1. LẤY DỮ LIỆU LIÊN QUAN (song song — 4 truy vấn độc lập)
    const [{ data: notif }, { data: profile }, { data: incident }, { data: roster }] = await Promise.all([
      supabase.from("notifications").select("action_token").eq("id", id).single(),
      supabase.from("profiles").select("*").eq("email", user_email).single(),
      incident_id
        ? supabase.from("incidents").select("*").eq("id", incident_id).single()
        : Promise.resolve({ data: null }),
      schedule_id
        ? supabase.from("roster_schedules").select("*").eq("id", schedule_id).single()
        : Promise.resolve({ data: null }),
    ]);
    const actionToken = notif?.action_token || "";

    const fullName = profile?.full_name || user_email;
    const eventName = incident?.event_name || (roster ? `Phân công trực ban (${roster.team_name})` : "Nhiệm vụ theo chỉ đạo");
    // Lịch trực: địa điểm do HCDC / tuyến cơ sở nhập (roster_schedules.location_text, có thể trống)
    const location = incident?.location_text || roster?.location_text || (roster ? "Trực tại đơn vị / Theo phân công" : "Liên hệ HCDC-RRT");

    const VN_TZ = "Asia/Ho_Chi_Minh";
    let displayTime = "Chưa cập nhật";
    if (incident?.activation_time) {
      displayTime = new Date(incident.activation_time).toLocaleString("vi-VN", { timeZone: VN_TZ, hour12: false });
    } else if (roster?.duty_date) {
      displayTime = new Date(roster.duty_date).toLocaleDateString("vi-VN", { timeZone: VN_TZ });
    }

    // 2. NHÃN NGHIỆP VỤ (Xác định màu sắc và loại nút)
    let typeLabel = "HỆ THỐNG HCDC-RRT";
    let subjectLabel = "Thông báo hệ thống";
    let keyboard: any[] = [];
    let actionText = "Vui lòng phản hồi:";
    let headerColor = "#006a75"; // Mặc định xanh HCDC

    switch (notification_type) {
      case "khan_cap":
        typeLabel = "🚨 KÍCH HOẠT KHẨN CẤP";
        subjectLabel = "Kích hoạt khẩn cấp";
        actionText = "Vui lòng xác nhận khả năng tham gia ngay lập tức:";
        headerColor = "#dc2626";
        keyboard = [[{ text: "✅ TÔI XÁC NHẬN", callback_data: `confirm_${id}` }, { text: "❌ KHÔNG THỂ THAM GIA", callback_data: `decline_${id}` }]];
        break;
      case "truc_ban":
        typeLabel = "📅 THÔNG BÁO LỊCH TRỰC";
        subjectLabel = "Thông báo lịch trực";
        actionText = "Vui lòng xác nhận lịch trực:";
        keyboard = [[{ text: "✅ TIẾP NHẬN CA", callback_data: `confirm_${id}` }, { text: "❌ BÁO BẬN", callback_data: `decline_${id}` }]];
        break;
      case "thay_the":
        typeLabel = "🔄 ĐIỀU ĐỘNG THAY THẾ";
        subjectLabel = "Điều động thay thế";
        actionText = "Vui lòng xác nhận hỗ trợ thay thế ca trực/nhiệm vụ này:";
        headerColor = "#ea580c";
        keyboard = [[{ text: "✅ ĐỒNG Ý ĐI THAY", callback_data: `confirm_${id}` }, { text: "❌ KHÔNG THỂ HỖ TRỢ", callback_data: `decline_${id}` }]];
        break;
      case "huy_lenh": // 👉 NHẬN DIỆN LỆNH HỦY
        typeLabel = "🛑 HỦY LỆNH ĐIỀU PHỐI MẪU";
        subjectLabel = "Báo động: Hủy lệnh điều phối mẫu";
        actionText = "Vui lòng xác nhận đã nắm thông tin để ngưng vận chuyển mẫu:";
        headerColor = "#dc2626"; // Đỏ cảnh báo
        keyboard = [[{ text: "👁️ ĐÃ RÕ THÔNG TIN", callback_data: `read_${id}` }]];
        break;
      case "nhac_viec":
      case "thong_tin":
        typeLabel = notification_type === "nhac_viec" ? "⏰ NHẮC NHỞ NGHIỆP VỤ" : "ℹ️ THÔNG BÁO NỘI BỘ";
        subjectLabel = notification_type === "nhac_viec" ? "Nhắc việc" : "Thông báo nội bộ";
        actionText = "Xác nhận đã xem thông báo:";
        keyboard = [[{ text: "👁️ ĐÃ ĐỌC", callback_data: `read_${id}` }]];
        break;
      case "ket_thuc":
        typeLabel = "✅ KẾT THÚC SỰ KIỆN";
        subjectLabel = "Thông báo kết thúc sự kiện";
        actionText = "Sự kiện đã được đóng. Cảm ơn chuyên viên đã tham gia nhiệm vụ!";
        headerColor = "#16a34a";
        keyboard = [[{ text: "👁️ ĐÃ XEM", callback_data: `read_${id}` }]];
        break;
    }

    // 👉 DANH SÁCH CÁC LỆNH CHỈ CẦN NÚT "ĐÃ ĐỌC" (READ-ONLY)
    const READ_ONLY_TYPES = ["thong_tin", "nhac_viec", "ket_thuc", "huy_lenh"];

    // 3. XỬ LÝ GỬI TIN BÁO LÊN TELEGRAM
    let telegramSuccess = false;

    // Ẩn tin read-only khỏi Group chung (Tránh spam group)
    if (!READ_ONLY_TYPES.includes(notification_type)) {
      const groupMsg = `📢 <b>${typeLabel}</b>\n━━━━━━━━━━━━━━━━━━━━\n👤 <b>Nhân sự:</b> ${esc(fullName)}\n📌 <b>Sự kiện:</b> ${esc(eventName)}\n⏰ <b>Thời gian kích hoạt:</b> ${esc(displayTime)}\n📍 <b>Địa điểm sự kiện:</b> ${esc(location)}\n⏳ <b>Trạng thái:</b> <i>Đang chờ xác nhận...</i>`;
      const groupRes = await postToTG("sendMessage", { chat_id: GROUP_ID, text: groupMsg, parse_mode: "HTML" });
      if (groupRes?.ok) telegramSuccess = true;
    }

    // Gửi tin nhắn riêng (có nút) cho nhân sự
    if (profile?.telegram_chat_id) {
      const privateMsg = `<b>${typeLabel}</b>\n━━━━━━━━━━━━━━━━━━━━\nKính gửi chuyên viên <b>${esc(fullName)}</b>,\n\n📋 <b>Nội dung:</b> ${esc(message)}\n📌 <b>Sự kiện:</b> ${esc(eventName)}\n⏰ <b>Thời gian kích hoạt:</b> ${esc(displayTime)}\n📍 <b>Địa điểm sự kiện:</b> ${esc(location)}\n\n<i>${esc(actionText)}</i>`;
      const privateRes = await postToTG("sendMessage", { chat_id: profile.telegram_chat_id, text: privateMsg, parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } });
      if (privateRes?.ok) telegramSuccess = true;
    }

    // 4. BIÊN SOẠN NỘI DUNG EMAIL
    let emailSuccess = false;
    let emailError = "";
    if (GAS_WEBHOOK_URL && user_email) {
      try {
        const projectUrl = Deno.env.get("SUPABASE_URL")!;
        const cbBase = `${projectUrl}/functions/v1/handle-email-callback`;
        const linkFor = (action: string) => `${cbBase}?id=${encodeURIComponent(id)}&token=${encodeURIComponent(actionToken)}&action=${action}`;

        let actionButtons = "";

        // 👉 RẼ NHÁNH TẠO NÚT BẤM DỰA TRÊN LOẠI THÔNG BÁO
        if (READ_ONLY_TYPES.includes(notification_type)) {
          // Các lệnh Read-only (bao gồm Hủy lệnh) chỉ hiện 1 nút duy nhất
          const btnText = notification_type === "huy_lenh" ? "Đã rõ thông tin hủy lệnh" : "Xác nhận đã đọc";
          const btnColor = notification_type === "huy_lenh" ? "#dc2626" : "#0ea5e9";
          actionButtons = `<a href="${linkFor("read")}" style="display:inline-block; padding:12px 24px; background-color:${btnColor}; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:bold; text-align:center;">${btnText}</a>`;
        } else {
          // Các lệnh Khẩn cấp / Trực ban hiện 2 nút
          actionButtons = `
            <a href="${linkFor("confirm")}" style="display:inline-block; padding:12px 24px; background-color:#16a34a; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:bold; margin-right:15px; text-align:center;">Xác nhận tham gia</a>
            <a href="${linkFor("decline")}" style="display:inline-block; padding:12px 24px; background-color:#dc2626; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:bold; text-align:center;">Báo không thể tham gia</a>
          `;
        }

        const emailBody = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
          <div style="background-color: ${headerColor}; padding: 20px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 1px;">${typeLabel}</h2>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #374151; margin-top: 0;">Kính gửi chuyên viên <b>${esc(fullName)}</b>,</p>
            <div style="background-color: #f3f4f6; border-left: 4px solid ${headerColor}; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0;">
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>Sự kiện:</b> ${esc(eventName)}</p>
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>Nội dung:</b> ${esc(message).replace(/\n/g, "<br>")}</p>
              <p style="margin: 0 0 10px 0; color: #1f2937;"><b>Thời gian kích hoạt:</b> ${esc(displayTime)}</p>
              <p style="margin: 0; color: #1f2937;"><b>Địa điểm sự kiện:</b> ${esc(location)}</p>
            </div>
            <p style="font-size: 15px; color: #4b5563; margin-bottom: 25px;"><i>${esc(actionText)}</i></p>
            <div style="text-align: center;">${actionButtons}</div>
            <p style="font-size: 13px; color: #9ca3af; margin-top: 25px;">Nút bấm sẽ mở trang xác nhận an toàn của hệ thống. Nếu không thao tác được, vui lòng phản hồi qua Telegram hoặc ứng dụng HCDC-RRT.</p>
          </div>
          <div style="background-color: #f9fafb; padding: 15px; text-align: center; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280;">
            <p style="margin: 0;"><b>Hệ thống HCDC-RRT</b> — Trung tâm Kiểm soát Bệnh tật Thành phố Hồ Chí Minh</p>
          </div>
        </div>`;

        const subject = `[RRT HCDC] ${subjectLabel}` + (eventName ? ` – ${eventName}`.substring(0, 80) : "");
        const gasPayload = {
          webhook_secret: GAS_WEBHOOK_SECRET,
          // Cho phép GAS tự chống gửi trùng khi request này bị gọi lại (timeout/mất kết nối)
          idempotency_key: `notif_${id}`,
          toEmail: user_email, subject: subject, htmlContent: emailBody,
          senderName: SENDER_NAME, replyTo: SENDER_EMAIL
        };

        // Gửi qua GAS (Cơ chế thử lại tối đa 4 lần nếu lỗi)
        for (let i = 0; i < 4; i++) {
          try {
            const response = await fetchWithTimeout(GAS_WEBHOOK_URL, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gasPayload),
            }, 10000);
            if (response.ok) {
              const resData = await response.json();
              if (resData.success) { emailSuccess = true; break; }
              else throw new Error(resData.error || "Lỗi xử lý nội bộ GAS");
            } else throw new Error(`HTTP Lỗi ${response.status}`);
          } catch (err) {
            if (i < 3) await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 2000));
            else { emailError = (err as Error).message; }
          }
        }
      } catch (err) {
        emailError = (err as Error).message;
        console.error("❌ Lỗi thiết lập dữ liệu gửi Email:", err);
      }
    }

    // 5. GHI NHẬN THỜI ĐIỂM PHÁT LỆNH VÀO DB
    await supabase.from("notifications").update({ sent_at: new Date().toISOString() }).eq("id", id);

    return new Response(
      JSON.stringify({ success: true, telegram: telegramSuccess, email: emailSuccess, ...(emailError ? { email_error: emailError } : {}) }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Lỗi hệ thống tổng:", (err as Error).message);
    return new Response("Error", { status: 500 });
  }
});
