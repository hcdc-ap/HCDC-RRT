// Định dạng thời gian theo giờ Việt Nam, dùng chung cho các thông báo Telegram/email.
export function fmtVN(d: Date): string {
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${g("hour")}:${g("minute")} ngày ${g("day")}/${g("month")}/${g("year")}`;
}

export const nowVN = () =>
  new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
