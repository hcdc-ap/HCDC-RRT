import { fetchWithTimeout } from "./http.ts";

// Tạo hàm gửi tin nhắn Telegram dùng chung — có timeout, không throw ra ngoài
// (trả về null khi lỗi mạng/timeout để caller tự quyết định fallback).
export function createTelegramClient(botToken: string | undefined) {
  return async function postToTG(method: string, body: unknown): Promise<Response | null> {
    if (!botToken) return null;
    try {
      const res = await fetchWithTimeout(
        `https://api.telegram.org/bot${botToken}/${method}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        10000
      );
      if (!res.ok) console.error(`LỖI TELEGRAM (${method}):`, await res.text());
      return res;
    } catch (err) {
      console.error(`LỖI TELEGRAM (${method}) - mạng/timeout:`, (err as Error).message);
      return null;
    }
  };
}
