// utils/escape.js
// Escape dữ liệu khi nhúng vào thuộc tính sự kiện inline (onclick="..."), nơi
// trình duyệt giải mã HTML TRƯỚC rồi mới chạy JavaScript. escapeHtml KHÔNG đủ
// ở đây: &#39; bị giải mã lại thành ' và phá chuỗi JS → chèn được mã.

const ATTR_UNSAFE = /[\\'"`<>&\n\r\u2028\u2029]/g;
const toUnicodeEscape = (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');

/**
 * Giá trị đặt TRONG một chuỗi JS bên trong thuộc tính sự kiện:
 *   onclick="viewReport('${jsAttr(report.id)}')"
 * Kết quả không chứa nháy, &, <, > nên an toàn cho cả HTML lẫn JS; JS nhận lại
 * đúng chuỗi gốc.
 */
window.jsAttr = function (value) {
  return String(value).replace(ATTR_UNSAFE, toUnicodeEscape);
};

/**
 * Object/mảng đặt trực tiếp làm literal JS trong thuộc tính nháy ĐƠN:
 *   onclick='confirmDispatch(${jsonAttr(payload)})'
 * & < > ' chỉ có thể nằm trong chuỗi JSON nên thay bằng \u00XX vẫn hợp lệ.
 */
window.jsonAttr = function (value) {
  return JSON.stringify(value).replace(/[&<>']/g, toUnicodeEscape);
};
