import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Dùng chung cho các Edge Function MFA (mfa-backup-codes, mfa-recovery, mfa-admin-reset, auth-log).
// Phần "thuần" (sinh/chuẩn hoá/băm mã, đọc aal) không phụ thuộc mạng nên có test trong tests/mfa-server.test.js.

// Bảng chữ không gây nhầm (bỏ 0/O, 1/I/L) — phải khớp js/app/mfa-helpers.js
export const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const BACKUP_CODE_COUNT = 10;
export const MAX_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MINUTES = 15;

export const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

/** Sinh 1 mã dạng XXXX-XXXX (≈ 39.6 bit), lấy mẫu từ chối để không lệch xác suất. */
export function generateBackupCode(): string {
  const limit = 256 - (256 % BACKUP_ALPHABET.length);
  let out = "";
  while (out.length < 8) {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit && out.length < 8) out += BACKUP_ALPHABET[b % BACKUP_ALPHABET.length];
    }
  }
  return out.slice(0, 4) + "-" + out.slice(4);
}

export function generateBackupCodes(n = BACKUP_CODE_COUNT): string[] {
  const set = new Set<string>();
  while (set.size < n) set.add(generateBackupCode());
  return [...set];
}

/** 'abcd efgh' → 'ABCD-EFGH'; sai định dạng → '' */
export function normalizeBackupCode(input: unknown): string {
  const s = String(input ?? "").toUpperCase().replace(/[\s\-_.]/g, "");
  if (s.length !== 8) return "";
  for (const ch of s) if (!BACKUP_ALPHABET.includes(ch)) return "";
  return s.slice(0, 4) + "-" + s.slice(4);
}

export async function hashCode(code: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Đọc claim aal từ JWT (JWT đã được getUser() xác thực trước đó). */
export function aalFromJwt(authHeader: string): string {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const part = token.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return String(JSON.parse(new TextDecoder().decode(bytes)).aal || "");
  } catch {
    return "";
  }
}

export function clientInfo(req: Request): { ip: string; userAgent: string } {
  const fwd = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "";
  return {
    ip: fwd.split(",")[0].trim().slice(0, 64),
    userAgent: (req.headers.get("user-agent") || "").slice(0, 300),
  };
}

/** Ghi nhật ký bằng service role. Không bao giờ ném lỗi (log hỏng không làm hỏng thao tác chính). */
export async function logEvent(
  service: SupabaseClient,
  req: Request,
  e: { userId?: string | null; email?: string | null; event: string; success?: boolean; detail?: Record<string, unknown> }
): Promise<void> {
  try {
    const { ip, userAgent } = clientInfo(req);
    const { error } = await service.from("rrt_access_log").insert({
      user_id: e.userId ?? null,
      email: e.email ?? null,
      event: e.event,
      success: e.success ?? true,
      detail: e.detail ?? {},
      ip,
      user_agent: userAgent,
    });
    if (error) console.warn("logEvent:", error.message);
  } catch (err) {
    console.warn("logEvent:", err);
  }
}

/** Xoá toàn bộ factor MFA (cả chưa xác minh) của một người. Trả số factor đã xoá. */
export async function deleteAllFactors(service: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await service.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error("Không đọc được danh sách factor: " + error.message);
  let n = 0;
  for (const f of data?.factors ?? []) {
    const { error: delErr } = await service.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (delErr) throw new Error("Không xoá được factor: " + delErr.message);
    n++;
  }
  return n;
}
