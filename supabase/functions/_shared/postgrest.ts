// Chỉ cho phép ký tự hợp lệ của số điện thoại / email trước khi ghép vào
// chuỗi filter .or() của PostgREST — chặn chèn thêm điều kiện lọc
// (vd: nhập "x,head_email.ilike.*" để dò toàn bộ bảng).
const SAFE_IDENTIFIER = /^[a-zA-Z0-9@._+-]+$/;
export function isSafeFilterIdentifier(value: string): boolean {
  return SAFE_IDENTIFIER.test(value);
}

// Escape ký tự đại diện của (I)LIKE trước khi đưa input người dùng vào,
// để tránh dùng %, _ để dò dữ liệu (wildcard injection / enumeration).
export function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (m) => "\\" + m);
}
