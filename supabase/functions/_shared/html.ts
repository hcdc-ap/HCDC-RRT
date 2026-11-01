// Escape HTML dùng chung khi chèn dữ liệu người dùng vào tin nhắn Telegram/email (chống HTML/markup injection).
export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
