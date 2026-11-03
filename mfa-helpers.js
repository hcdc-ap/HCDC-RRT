/* global module, Buffer, window, atob */
// ============================================================================
// Hàm thuần cho MFA (không gọi mạng) — dùng được cả trong trình duyệt lẫn Node (test).
// ============================================================================
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.rrtMfaHelpers = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // Bảng chữ không gây nhầm (bỏ 0/O, 1/I/L) — phải khớp với edge function (_shared/mfa.ts)
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  /** Chuẩn hoá mã dự phòng người dùng gõ: hoa, bỏ dấu gạch/khoảng trắng → 'ABCD-EFGH' hoặc '' nếu sai. */
  function normalizeBackupCode(input) {
    const s = String(input == null ? '' : input)
      .toUpperCase()
      .replace(/[\s\-_.]/g, '');
    if (s.length !== 8) return '';
    for (const ch of s) if (!ALPHABET.includes(ch)) return '';
    return s.slice(0, 4) + '-' + s.slice(4);
  }

  /** Chuẩn hoá mã 6 số của ứng dụng Authenticator → '123456' hoặc '' nếu sai. */
  function normalizeTotp(input) {
    const s = String(input == null ? '' : input).replace(/\s/g, '');
    return /^\d{6}$/.test(s) ? s : '';
  }

  /** Đọc claim 'aal' từ access_token (JWT) — '' nếu không đọc được. Không xác thực chữ ký (chỉ để điều hướng UI). */
  function aalFromJwt(token) {
    try {
      const part = String(token || '').split('.')[1];
      if (!part) return '';
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const json =
        typeof atob === 'function'
          ? decodeURIComponent(
              Array.prototype.map
                .call(atob(b64), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
                .join('')
            )
          : Buffer.from(b64, 'base64').toString('utf8');
      return String(JSON.parse(json).aal || '');
    } catch {
      return '';
    }
  }

  /**
   * Phiên này có đang "nửa chừng" không: tài khoản đã bật MFA (có factor verified)
   * nhưng phiên chưa qua bước 2 (aal ≠ aal2). Đồng bộ — an toàn gọi trong onAuthStateChange.
   */
  function needsSecondStep(session) {
    if (!session || !session.user) return false;
    const factors = Array.isArray(session.user.factors) ? session.user.factors : [];
    const hasVerified = factors.some((f) => f && f.status === 'verified');
    if (!hasVerified) return false;
    return aalFromJwt(session.access_token) !== 'aal2';
  }

  return { ALPHABET, normalizeBackupCode, normalizeTotp, aalFromJwt, needsSecondStep };
});
