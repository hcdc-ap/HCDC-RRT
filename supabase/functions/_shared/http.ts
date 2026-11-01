// fetch() có timeout — tránh Edge Function bị treo tới hết ngân sách thực thi
// khi Telegram/GAS phản hồi chậm hoặc không phản hồi.
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
