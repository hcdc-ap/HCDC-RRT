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

ESLint tự thu thập các biến toàn cục của app (`window.X = …`, khai báo
top-level), nên rule `no-undef` vẫn bắt được lỗi gõ sai tên hàm giữa các file.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `index.html` | Trang chính (SPA): đăng nhập + toàn bộ các trang quản trị |
| `styles.css` | Giao diện |
| `auth-helpers.js` | `isUserAdmin`, `getCurrentUserId`, `loadUserProfile`, `logout` |
| `utils/` | `query-cache.js` (cache truy vấn), `batch-fetch.js` (truy vấn song song), `debounce.js` |
| `js/app/` | Mã chính của app, chia theo tính năng — xem [`js/app/README.md`](js/app/README.md) |
| `team-response-stats.js` | Thống kê phản hồi của đội |
| `fix-patches.js` | Các bản vá ghi đè một số hàm của `js/app/*` (nạp sau cùng) |
| `lab-*.js` | Module điều phối mẫu xét nghiệm (LIMS): quản trị PXN, đề xuất điều phối, bản đồ, lộ trình |
| `huong-dan*.{html,js}` | Trang Hướng dẫn sử dụng |
| `confirm.html`, `response.html` | Trang xác nhận/phản hồi mở từ link email/Telegram |
| `lab-response.html`, `lab-result.html` | Trang PXN xác nhận tiếp nhận mẫu / xem kết quả điều phối |
| `tests/` | Unit test + kiểm tra cấu trúc |
| `supabase/` | Ghi chú về schema/migration phía Supabase |

## Thứ tự nạp script

Các file là *classic script* dùng chung phạm vi toàn cục, nên **thứ tự trong
`index.html` là quan trọng**:

1. Thư viện CDN (jQuery, Bootstrap, Supabase, Leaflet, Highcharts, …)
2. `auth-helpers.js`, `utils/*.js`
3. `js/app/*.js` — `core.js` đầu tiên, sau đó theo đúng thứ tự đang có
4. `team-response-stats.js`, `fix-patches.js`, `lab-*.js`

`tests/structure.test.js` kiểm tra tự động các ràng buộc này.

## Ghi chú

- `console.log`/`console.debug` tự tắt khi chạy ngoài `localhost`
  (xem script đầu `<head>` trong `index.html`); `console.warn/error` vẫn giữ.
- Khoá `SUPABASE_ANON_KEY` trong `js/app/core.js` là khoá *public* — quyền truy
  cập dữ liệu được bảo vệ bằng Row Level Security phía Supabase.
