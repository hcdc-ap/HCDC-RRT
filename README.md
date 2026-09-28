# HCDC-RRT

Webapp quản lý **Đội phản ứng nhanh (Rapid Response Team — RRT)** của Trung tâm
Kiểm soát Bệnh tật TP.HCM (HCDC): hồ sơ thành viên, lịch trực, điều động sự cố,
theo dõi sự kiện, đào tạo, vật tư, bản đồ, báo cáo và điều phối mẫu xét nghiệm (LIMS).

Frontend là HTML/CSS/JavaScript thuần (không có bước build), backend là
[Supabase](https://supabase.com) (Postgres + Auth + Realtime + Storage + Edge Functions).

## Chạy thử local

Yêu cầu Node.js ≥ 22.

```bash
npm install
npm start          # servor --reload → mở http://localhost:8080
```

## Kiểm tra mã nguồn

```bash
npm run lint       # ESLint
npm test           # Unit test (node:test, không cần trình duyệt)
npm run check      # cả hai — CI (.github/workflows/ci.yml) chạy lệnh tương tự
```

### Kiểm tra với Supabase thật (trước khi deploy)

Cần mạng tới `*.supabase.co` và **một tài khoản test** (không dùng tài khoản thật):

```bash
# 1. Đối chiếu mọi bảng/cột/quan hệ/RPC mà code dùng với database — chỉ đọc
RRT_TEST_EMAIL=test@... RRT_TEST_PASSWORD=... npm run check:schema

# 1b. Phân quyền dữ liệu (RLS): đọc thẳng từng bảng qua API bằng tài khoản
#     không phải quản trị, báo dữ liệu đọc được ngoài phạm vi — chỉ đọc.
#     Chạy lần lượt với nhân viên, tuyến cơ sở và 1 tài khoản tự đăng ký chưa duyệt.
RRT_TEST_EMAIL=test@... RRT_TEST_PASSWORD=... npm run check:rls

# 2. End-to-end: đăng nhập, mở lần lượt 11 trang, báo lỗi JS và request lỗi
npm start   # terminal khác
RRT_TEST_EMAIL=test@... RRT_TEST_PASSWORD=... npm run e2e

# 3. Quên mật khẩu: gửi email thật, dán link từ email vào terminal, đổi mật khẩu
#    tài khoản test. Cần http://localhost:8080/** trong Supabase Redirect URLs.
RRT_TEST_EMAIL=test@... RRT_NEW_PASSWORD='Moi@12345' npm run e2e:recovery
```

`npm run e2e` dùng Google Chrome đã cài trên máy (hoặc đặt `CHROME_PATH`);
`HEADLESS=0` để xem trình duyệt chạy. `npm run check:schema -- --list` liệt kê
các truy vấn mà không gọi mạng.

ESLint tự thu thập các biến toàn cục của app (`window.X = …`, khai báo
top-level), nên rule `no-undef` vẫn bắt được lỗi gõ sai tên hàm giữa các file.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `index.html` | Trang chính (SPA): đăng nhập + toàn bộ các trang quản trị |
| `styles.css` | Giao diện |
| `auth-helpers.js` | `isUserAdmin`, `getCurrentUserId`, `loadUserProfile`, `logout` |
| `utils/` | `query-cache.js` (cache truy vấn, tự xóa khi ghi dữ liệu), `batch-fetch.js` (truy vấn song song), `escape.js` (`jsAttr`/`jsonAttr` cho `onclick`), `debounce.js` |
| `js/app/` | Mã chính của app, chia theo tính năng — xem [`js/app/README.md`](js/app/README.md) |
| `team-response-stats.js` | Thống kê phản hồi của đội |
| `lab-*.js` | Module điều phối mẫu xét nghiệm (LIMS): quản trị PXN, đề xuất điều phối, bản đồ, lộ trình |
| `huong-dan*.{html,js}` | Trang Hướng dẫn sử dụng |
| `confirm.html`, `response.html` | Trang xác nhận/phản hồi mở từ link email/Telegram |
| `lab-response.html`, `lab-result.html` | Trang PXN xác nhận tiếp nhận mẫu / xem kết quả điều phối |
| `tests/` | Unit test + kiểm tra cấu trúc; `tests/e2e/` kiểm thử với Supabase thật |
| `tools/` | `check-supabase-schema.js` — đối chiếu schema database |
| `supabase/` | Ghi chú về schema/migration phía Supabase |

## Thứ tự nạp script

Các file là *classic script* dùng chung phạm vi toàn cục, nên **thứ tự trong
`index.html` là quan trọng**:

1. Thư viện CDN (jQuery, Bootstrap, Supabase, Leaflet, Highcharts, …)
2. `auth-helpers.js`, `utils/*.js`
3. `js/app/*.js` — `core.js` đầu tiên, sau đó theo đúng thứ tự đang có
4. `team-response-stats.js`, `lab-*.js`

`tests/structure.test.js` kiểm tra tự động các ràng buộc này.

## Ghi chú

- `console.log`/`console.debug` tự tắt khi chạy ngoài `localhost`
  (xem script đầu `<head>` trong `index.html`); `console.warn/error` vẫn giữ.
- Khoá `SUPABASE_ANON_KEY` trong `js/app/core.js` là khoá *public* — quyền truy
  cập dữ liệu được bảo vệ bằng Row Level Security phía Supabase.
- Thư viện CDN được cố định phiên bản; file từ jsDelivr/unpkg/code.jquery.com có
  `integrity` (SRI). Khi nâng phiên bản phải cập nhật lại mã SRI (tính từ gói npm:
  `npm pack <gói>@<phiên bản>` rồi `openssl dgst -sha384 -binary <file> | openssl base64 -A`).
- Dữ liệu đưa vào `onclick="…('${…}')"` phải bọc `jsAttr(…)` — `escapeHtml` không
  đủ trong ngữ cảnh này (test `tests/structure.test.js` sẽ báo nếu quên).
