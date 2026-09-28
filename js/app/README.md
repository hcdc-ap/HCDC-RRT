# js/app — mã chính của webapp

Thư mục này thay cho file `script.js` cũ (~21.000 dòng). Nội dung được tách
nguyên văn theo tính năng; mỗi file là một *classic script* được nạp tuần tự
trong `index.html`.

| File | Nội dung |
|---|---|
| `core.js` | Khởi tạo Supabase, SPA router `go()`, xử lý đăng nhập, `RealtimeManager`, lọc dữ liệu theo vai trò, `enterDashboard`, đăng xuất |
| `login-ui.js` | Form đăng nhập/đăng ký/OTP, kiểm tra mật khẩu, theme màn hình đăng nhập |
| `shell.js` | Helpers dùng chung, spinner, toast, datepicker, khởi tạo UI |
| `dashboard.js` | Trang tổng quan admin/user, lịch trực trên dashboard, biểu đồ năng lực, KPI |
| `analytics-nav.js` | Xuất Excel, phân tích, bảng báo cáo gần đây, to-do, điều hướng menu (`showSectionById`) |
| `team.js` | Bảng hồ sơ (datatable), trang Đội, phân tích đào tạo |
| `tracking.js` | Theo dõi sự kiện, hồ sơ sự kiện (dossier), thông báo, duyệt hồ sơ |
| `rrt-records.js` | Form tạo/sửa/xem hồ sơ RRT, in PDF, xuất Excel |
| `emergency.js` | Điều động sự cố: chọn thành viên, kích hoạt, SITREP |
| `training.js` | Khóa đào tạo, hồ sơ đào tạo, chọn đối tượng |
| `logistics-library.js` | Vật tư và thư viện tài liệu |
| `roster.js` | Lịch trực, wizard thay người, tạo ca |
| `incident-response.js` | Thành viên xác nhận/từ chối tham gia sự kiện (RPC atomic, tự quay về cách cũ nếu DB chưa có RPC) |
| `map.js` | Bản đồ RRT (choropleth, dân số, thành viên, sự cố) |
| `dossier-chat.js` | Tin nhắn/file trong hồ sơ sự kiện, nhật ký, AAR |
| `field-ops.js` | SOS, luân chuyển đội, báo cáo nhanh, modal báo cáo |
| `official-reports.js` | Soạn, gửi, xuất PDF báo cáo chính thức |
| `iap.js` | Kế hoạch hành động sự cố (IAP) |
| `misc.js` | Dropdown phường, AAR, xếp lịch tự động, bản đồ mini, duyệt báo cáo, phân quyền giao diện |

## Quy ước

- **Thứ tự nạp**: giữ đúng thứ tự trong `index.html`; `core.js` luôn đứng đầu
  vì nó tạo `window.rrtShared`.
- Phần lớn các file bọc code trong `document.addEventListener('DOMContentLoaded', …)`
  giống `script.js` cũ. Các listener chạy theo đúng thứ tự file, nên thứ tự
  khởi tạo giữ nguyên như trước.
- **Chia sẻ giữa các file**: ưu tiên `window.tenHam = function …` như phần còn
  lại của app. Với hàm/biến *cục bộ* cần dùng ở file khác, file khai báo đăng ký
  vào `rrtShared` ở đầu callback:

  ```js
  rrtShared.escapeHtml = escapeHtml;              // hàm
  Object.defineProperty(rrtShared, 'dataTableInstance', {
    get: () => dataTableInstance,                 // biến thay đổi theo thời gian
    configurable: true,
  });
  ```

  File khác gọi `rrtShared.escapeHtml(...)`. `tests/structure.test.js` báo lỗi
  nếu dùng `rrtShared.X` mà không file nào đăng ký.
- Hàm cục bộ trong closure **không** gọi được từ `onclick="..."` trong HTML;
  phải gán lên `window` (ví dụ `window.openImageModal` trong `dossier-chat.js`).
- **Không ghi đè hàm từ file khác** (như `fix-patches.js` trước đây): các hàm
  gán trong closure `DOMContentLoaded` chạy SAU mọi script, nên bản vá nạp ở
  load-time bị ghi đè ngược lại mà không ai biết. Sửa thẳng vào hàm gốc.
- Dữ liệu nhúng vào `onclick="f('${…}')"` dùng `jsAttr(…)`; object nhúng vào
  `onclick='f(${…})'` dùng `jsonAttr(…)` (xem `utils/escape.js`).
- File mới: thêm `<script src="js/app/<file>.js">` vào `index.html` (test cấu
  trúc sẽ báo nếu quên).
