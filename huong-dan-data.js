// ============================================================================
// huong-dan-data.js — Nội dung Hướng dẫn sử dụng RRT-HCDC
// Cấu trúc: { t:'p'|'steps'|'list'|'note'|'table', ... } — xem huong-dan-engine.js.
// Quy ước trong chuỗi text: **đậm**, [[Tên nút/mục]] hiển thị dạng nhãn nút.
// ============================================================================
window.RRT_GUIDE = {
  version: 'Cập nhật ngày 22/09/2026',
  title: 'Hướng dẫn sử dụng hệ thống RRT-HCDC',
  roles: [
    { role: 'admin', label: 'Quản trị RRT (thành phố)' },
    { role: 'ward_admin', label: 'Quản trị tuyến cơ sở' },
    { role: 'user', label: 'Nhân viên RRT' },
  ],

  // ---- Các mục CHUNG cho cả 3 vai trò, hiện đầu tiên trong mọi tab ----
  common: [
    {
      id: 'bat-dau',
      title: 'Bắt đầu: tài khoản, đăng nhập, đăng ký hồ sơ',
      summary: 'Cách tạo tài khoản, đăng nhập, khôi phục mật khẩu và đăng ký hồ sơ RRT lần đầu.',
      blocks: [
        { t: 'p', text: 'RRT-HCDC là hệ thống điều phối Đội đáp ứng nhanh (Rapid Response Team) của HCDC: xếp lịch trực, kích hoạt khẩn cấp, theo dõi sự kiện, quản lý thành viên/đào tạo/vật tư, và điều phối mẫu xét nghiệm tới phòng xét nghiệm (PXN).' },
        {
          t: 'table',
          title: 'Ba loại tài khoản',
          head: ['Vai trò', 'Ai dùng', 'Phạm vi xem/làm được'],
          rows: [
            ['**Quản trị RRT** (`admin`)', 'Cán bộ HCDC quản lý toàn mạng lưới RRT thành phố', 'Xem và quản lý toàn bộ nhân sự, sự kiện, lịch trực, vật tư, phòng xét nghiệm trên toàn thành phố.'],
            ['**Quản trị tuyến cơ sở** (`ward_admin`)', 'Người phụ trách đội RRT của một phường/xã/đặc khu', 'Chỉ xem và quản lý nhân sự, lịch trực, sự kiện **cùng nơi công tác**. Không thấy Vật tư và Phòng xét nghiệm.'],
            ['**Nhân viên RRT** (`user`)', 'Thành viên đội RRT thường', 'Chỉ xem hồ sơ, lịch, thông báo, kết quả đào tạo **của chính mình**; xác nhận tham gia khi được điều động.'],
          ],
        },
        {
          t: 'steps',
          title: 'Đăng nhập lần đầu',
          items: [
            'Mở trang đăng nhập, nhập **Email đăng nhập** và **Mật khẩu**, bấm [[Đăng nhập]].',
            'Chưa có tài khoản? Bấm [[Đăng ký]] ở cuối form, điền Tên người dùng, Đơn vị công tác, Email, Số điện thoại, Mật khẩu, đồng ý điều khoản rồi bấm [[Đăng ký]].',
            'Sau khi đăng ký, hệ thống tạo tài khoản với vai trò **Nhân viên RRT** và trạng thái hồ sơ **Chờ duyệt**. Vào ngay trang **Biểu mẫu RRT**, bấm [[Biểu mẫu RRT]] để điền đầy đủ hồ sơ năng lực (kỹ năng, học vấn, ngoại ngữ…) rồi nộp.',
          ],
        },
        {
          t: 'note', kind: 'warn', title: 'Hồ sơ luôn cần được duyệt lại',
          text: 'Mỗi lần nộp hoặc sửa hồ sơ, trạng thái phê duyệt tự động chuyển về **Chờ duyệt** — Quản trị RRT/Quản trị tuyến cơ sở cần duyệt lại thì hồ sơ mới có hiệu lực.',
        },
        {
          t: 'steps',
          title: 'Quên mật khẩu',
          items: [
            'Ở màn hình đăng nhập, chọn mục khôi phục tài khoản, nhập **Email** rồi bấm [[Gửi liên kết]].',
            'Kiểm tra email nhận mã **OTP**. Nhập **Email**, **Mã OTP** (6 số), **Mật khẩu mới** và **Xác nhận mật khẩu** (đủ chữ hoa/thường/số/ký tự đặc biệt, 8–32 ký tự), bấm [[Xác nhận]].',
          ],
        },
      ],
    },
    {
      id: 'lam-quen-man-hinh',
      title: 'Làm quen với màn hình',
      summary: 'Vị trí menu, thanh trên cùng, chuông thông báo và menu tài khoản.',
      blocks: [
        { t: 'p', text: 'Sau khi đăng nhập, menu bên trái liệt kê các trang bạn được phép vào — trang nào bạn không có quyền sẽ tự động không hiện trong menu, không cần phân biệt thủ công.' },
        {
          t: 'list',
          title: 'Thanh trên cùng (navbar)',
          items: [
            'Ô **Search** — tìm nhanh trong trang đang mở.',
            'Nút bật/tắt **giao diện tối** (biểu tượng mặt trời/mặt trăng).',
            'Biểu tượng **chuông** — danh sách thông báo gần đây (xem nhanh, bấm vào để mở trang **Tin nhắn** đầy đủ).',
            'Biểu tượng **hồ sơ** (ảnh đại diện) — mở menu [[Tài khoản]] / [[Đổi mật khẩu]] / [[Tin nhắn]] / [[Đăng xuất]].',
          ],
        },
      ],
    },
    {
      id: 'khai-niem',
      title: 'Các khái niệm cần biết',
      summary: 'Thuật ngữ dùng xuyên suốt hệ thống: trạng thái hồ sơ, sự kiện, điều phối mẫu, cấp năng lực PXN.',
      blocks: [
        {
          t: 'table',
          title: 'Trạng thái phê duyệt hồ sơ RRT',
          head: ['Trạng thái', 'Ý nghĩa'],
          rows: [
            ['**Chờ duyệt**', 'Hồ sơ mới nộp hoặc vừa sửa, đang chờ Quản trị xem xét.'],
            ['**Yêu cầu sửa**', 'Quản trị RRT thành phố yêu cầu bổ sung/chỉnh sửa trước khi duyệt.'],
            ['**Đã duyệt**', 'Hồ sơ hợp lệ, được tính vào danh sách nhân sự sẵn sàng điều động.'],
          ],
        },
        { t: 'p', text: '**Sự kiện / Kích hoạt khẩn cấp**: khi có tình huống cần huy động nhân sự, Quản trị tạo một "sự kiện" và điều động (mời) một nhóm nhân sự. Nhân sự được mời cần vào trang **Theo dõi sự kiện** để xác nhận tham gia hoặc báo không thể tham gia.' },
        { t: 'p', text: '**Điều phối mẫu xét nghiệm**: khi sự kiện cần gửi mẫu đi xét nghiệm, Quản trị dùng công cụ tìm phòng xét nghiệm (PXN) phù hợp nhất theo khoảng cách, công suất còn trống, thời gian trả kết quả và chất lượng, rồi gửi yêu cầu và chốt lệnh điều phối.' },
        {
          t: 'note', kind: 'info', title: 'Cấp năng lực và ATSH của phòng xét nghiệm',
          text: 'Mỗi PXN có **Cấp năng lực** (1–5, hiển thị bằng màu marker trên Bản đồ: đỏ = cấp 5 cao nhất, cam = 4, vàng = 3, xanh dương = 2, xám xanh = 1, xám nhạt = chưa phân hạng) và **Cấp an toàn sinh học (ATSH/BSL)** — PXN có ATSH thấp hơn yêu cầu sẽ không bao giờ được đề xuất, dù ở chế độ điều phối nào.',
        },
      ],
    },
    {
      id: 'tai-khoan-mat-khau',
      title: 'Tài khoản và đổi mật khẩu',
      summary: 'Xem/sửa hồ sơ cá nhân và đổi mật khẩu từ menu hồ sơ trên navbar.',
      blocks: [
        {
          t: 'steps',
          items: [
            'Bấm biểu tượng hồ sơ ở góc phải trên cùng → [[Tài khoản]] để mở đúng hồ sơ RRT của bạn tại trang **Biểu mẫu RRT** (xem/sửa thông tin cá nhân, kỹ năng, học vấn…).',
            'Bấm [[Đổi mật khẩu]] để mở hộp thoại đổi mật khẩu: nhập **Mật khẩu cũ**, **Mật khẩu mới**, **Xác nhận mật khẩu mới** (tối thiểu 6 ký tự, khớp nhau) rồi xác nhận.',
          ],
        },
        {
          t: 'note', kind: 'warn',
          text: 'Sau khi đổi mật khẩu thành công, hệ thống tự động đăng xuất sau vài giây — đăng nhập lại bằng mật khẩu mới.',
        },
      ],
    },
  ],

  // ---- Nội dung riêng theo từng vai trò ----
  perRole: {
    admin: {
      title: 'Hướng dẫn sử dụng dành cho Quản trị RRT (thành phố)',
      audience: 'Cán bộ HCDC quản lý mạng lưới RRT trên toàn thành phố.',
      groupLabel: 'Dành cho Quản trị RRT',
      sections: [
        {
          id: 'dashboard',
          title: 'Dashboard',
          summary: 'Tổng quan số liệu lịch trực, kích hoạt khẩn cấp, hồ sơ và thống kê thành viên.',
          blocks: [
            { t: 'p', text: 'Trang đầu tiên sau khi đăng nhập. Hiển thị các thẻ số liệu về lịch trực và kích hoạt khẩn cấp (đã xác nhận / báo bận / chưa phản hồi), danh sách "Hồ sơ RRT gần đây", mục "Việc cần làm", và 6 biểu đồ thống kê thành viên (tổng quan, phân bố trạng thái, cấp độ nhóm, giới tính, chuyên môn, trình độ, ngoại ngữ).' },
            { t: 'p', text: 'Bấm vào một hồ sơ trong "Hồ sơ RRT gần đây" để xem nhanh — việc duyệt hồ sơ chính thức nên thực hiện tại trang **Biểu mẫu RRT** (mục kế tiếp) để tránh nhầm lẫn.' },
          ],
        },
        {
          id: 'bieu-mau-rrt',
          title: 'Biểu mẫu RRT — duyệt hồ sơ nhân sự',
          summary: 'Danh sách toàn bộ hồ sơ RRT thành phố và nơi duyệt trạng thái hồ sơ.',
          blocks: [
            { t: 'p', text: 'Bảng liệt kê mọi hồ sơ RRT: Mã RRT, Ngày cập nhật, Họ tên - Đơn vị, SĐT, Phê duyệt, Điều động, Đính kèm, Hành động.' },
            {
              t: 'steps',
              title: 'Duyệt một hồ sơ',
              items: [
                'Dùng ô [[Lọc]] để tìm nhanh, [[Xóa lọc]] để về danh sách đầy đủ.',
                'Ở cột **Phê duyệt** của hồ sơ cần xử lý, chọn trạng thái mới trong danh sách sổ xuống: **Chờ duyệt** / **Yêu cầu sửa** / **Đã duyệt**. Hệ thống lưu ngay khi chọn.',
                'Bấm biểu tượng mắt ở cột **Hành động** để xem chi tiết hồ sơ; biểu tượng thùng rác để xóa hồ sơ (chỉ Quản trị RRT thành phố có nút xóa).',
              ],
            },
            {
              t: 'note', kind: 'tip',
              text: 'Bấm [[Xuất RRT-ers]] để tải danh sách thành viên ra Excel.',
            },
          ],
        },
        {
          id: 'lich-truc',
          title: 'Lịch trực',
          summary: 'Xếp ca trực định kỳ theo đội trên lịch tháng.',
          blocks: [
            {
              t: 'steps',
              items: [
                'Dùng mũi tên trái/phải hoặc [[Hôm nay]] để chọn tháng cần xem.',
                'Bấm [[XÁC NHẬN]] trong khung tạo ca để thêm một ca trực mới: chọn ngày, chọn đội, ghi chú.',
                'Nếu một người trong ca trực không thể tham gia, bấm [[Tạo yêu cầu Thay thế]] và làm theo các bước của trình hướng dẫn (wizard) để chọn người thay thế.',
                'Có thể dùng [[Lịch trình (AP Assistant)]] để nhờ trợ lý tự động đề xuất lịch trực.',
              ],
            },
          ],
        },
        {
          id: 'kich-hoat-khan-cap',
          title: 'Kích hoạt khẩn cấp',
          summary: 'Chọn nhân sự và triệu tập khi có tình huống khẩn cấp.',
          blocks: [
            {
              t: 'steps',
              title: 'Tạo một đợt kích hoạt',
              items: [
                'Dùng bộ lọc **Đội** / **Vị trí** để tìm nhanh nhân sự, rồi tick chọn từng người trong danh sách.',
                'Bấm nút **KÍCH HOẠT (n)** (n = số người đã chọn) để mở hộp thoại chi tiết.',
                'Chọn loại kích hoạt: **🔥 Sự kiện Mới** (nhập Thời gian, Địa điểm — chọn trên minimap, Tên sự kiện, Chi tiết) hoặc **➕ Bổ sung nhân sự** (chọn một sự kiện đang hoạt động có sẵn để mời thêm người).',
                'Bấm [[▶️ Tiếp tục]] để sang màn hình xem lại (Thời gian/Địa điểm/Chi tiết/Danh sách thành viên), rồi bấm **☑️ XÁC NHẬN** để gửi. Hệ thống gửi thông báo tới từng người được chọn và hiện thông báo kích hoạt thành công.',
              ],
            },
            {
              t: 'note', kind: 'info',
              text: 'Nhân sự được điều động sẽ nhận thông báo và xác nhận tham gia tại trang **Theo dõi sự kiện** (không phải tại trang Tin nhắn) — xem mục "Theo dõi sự kiện" bên dưới.',
            },
            {
              t: 'p', text: 'Nếu một sự kiện đang có người báo không thể tham gia, khi chọn **➕ Bổ sung nhân sự** hệ thống sẽ cảnh báo để mời người thay thế.',
            },
          ],
        },
        {
          id: 'theo-doi-su-kien',
          title: 'Theo dõi sự kiện',
          summary: 'Xem danh sách sự kiện và quản lý chi tiết một sự kiện đang diễn ra.',
          blocks: [
            { t: 'p', text: 'Danh sách sự kiện hiển thị dạng thẻ. Dùng ô tìm kiếm và [[Lọc]]/[[Xóa Lọc]] theo ngày để tìm sự kiện. Bấm vào một thẻ để mở chi tiết ("hồ sơ sự kiện").' },
            {
              t: 'list',
              title: 'Trong một sự kiện, bạn có thể',
              items: [
                'Xem/viết **Nhật ký** hoạt động, gửi tin nhắn trao đổi trong nhóm sự kiện, đính kèm file.',
                'Bấm [[Xét nghiệm]] để mở công cụ điều phối mẫu tới phòng xét nghiệm (xem mục riêng bên dưới).',
                'Bấm [[Phương án (IAP)]] để lập/xem phương án ứng phó của sự kiện.',
                'Bấm [[Yêu cầu hỗ trợ SOS]] khi cần chi viện gấp: chọn loại hỗ trợ (Nhân lực/Vật tư/Phương tiện/Khác) rồi [[XÁC NHẬN]].',
                'Theo dõi thẻ **📊 Thống kê Phản hồi** để biết đã có bao nhiêu người xác nhận / chưa phản hồi.',
                'Dùng cụm nút thay quân khi sự kiện đang chạy: 🧑‍🤝‍🧑 **Người** (thay một người) hoặc 👩‍👩‍👦‍👦 **Đội** (thay nguyên đội).',
                'Khi kết thúc, bấm [[Đánh giá (AAR)]] để lập báo cáo sau hành động — có thể bấm **Tự động tổng hợp (AP Assistant)** để trợ lý gom dữ liệu từ nhật ký, rồi [[LƯU & ĐÓNG SỰ KIỆN]] để chốt và đóng sự kiện.',
              ],
            },
            {
              t: 'note', kind: 'tip',
              text: 'Là Quản trị RRT thành phố, bạn thấy mọi sự kiện trên toàn thành phố, không bị giới hạn theo địa bàn.',
            },
          ],
        },
        {
          id: 'thanh-vien',
          title: 'Thành viên',
          summary: 'Hồ sơ năng lực, xếp hạng, đội và vị trí công tác lâu dài của từng nhân sự (khác Lịch trực — đây không phải ca trực theo ngày).',
          blocks: [
            { t: 'p', text: 'Bảng liệt kê toàn bộ nhân sự với Xếp hạng, Khoa phòng, SĐT, Email. Hai cột **Đội** và **Vị trí** chỉnh sửa được ngay trên bảng bằng danh sách sổ xuống.' },
            {
              t: 'list',
              items: [
                'Dùng [[Lọc]]/[[Xóa lọc]] để tìm nhanh; bấm [[So sánh]] để so sánh năng lực nhiều đội cùng lúc, [[Xóa so sánh]] để tắt.',
                'Đổi **Đội** hoặc **Vị trí** của một người: chọn giá trị mới trong sổ xuống tương ứng ở dòng của người đó — hệ thống lưu ngay.',
                'Cuối trang có biểu đồ "Đánh giá Năng lực Tổng hợp" so sánh Đào tạo và Thực chiến.',
              ],
            },
          ],
        },
        {
          id: 'dao-tao',
          title: 'Đào tạo',
          summary: 'Tạo khóa đào tạo, ghi nhận điểm danh và kết quả cho toàn bộ nhân sự.',
          blocks: [
            {
              t: 'steps',
              items: [
                'Bấm [[Khóa Đào tạo]] để mở hộp thoại tạo khóa mới, điền thông tin rồi bấm [[XÁC NHẬN]].',
                'Mở một khóa học để điểm danh và chấm kết quả từng học viên, rồi bấm [[Lưu Kết Quả]].',
                'Bấm biểu tượng thùng rác trên một khóa để xóa khóa học đó.',
              ],
            },
            { t: 'p', text: 'Là Quản trị RRT thành phố, bạn xem và chấm được mọi khóa học, mọi học viên trên toàn thành phố.' },
          ],
        },
        {
          id: 'vat-tu',
          title: 'Vật tư',
          summary: 'Quản lý kho vật tư và lịch sử xuất/nhập (chỉ Quản trị RRT thành phố).',
          blocks: [
            { t: 'p', text: 'Có 2 tab: **📦 Kho Hiện tại** và **📜 Lịch sử giao dịch**.' },
            {
              t: 'steps',
              items: [
                'Bấm [[Vật tư]] để thêm một mã vật tư mới vào danh mục kho.',
                'Trên một dòng vật tư, bấm biểu tượng thao tác để mở hộp thoại **Điều phối Vật tư**: chọn **📤 XUẤT KHO (Cấp phát)** hoặc **📥 NHẬP KHO (Bổ sung)**, nhập số lượng, nơi nhận/đội, có thể liên kết tới một sự kiện, rồi bấm [[XÁC NHẬN]].',
                'Bấm [[Xuất Logistics]] để tải lịch sử ra Excel.',
              ],
            },
            {
              t: 'note', kind: 'info',
              text: 'Trang này chỉ hiện với Quản trị RRT thành phố — Quản trị tuyến cơ sở và Nhân viên RRT không thấy mục này trong menu.',
            },
          ],
        },
        {
          id: 'thu-vien',
          title: 'Thư viện',
          summary: 'Kho tài liệu dùng chung: SOP, biểu mẫu, hướng dẫn chuyên môn.',
          blocks: [
            { t: 'p', text: 'Lọc tài liệu theo danh mục: Tất cả danh mục / SOPs / Biểu mẫu / Hướng dẫn chuyên môn / Khác.' },
            {
              t: 'steps',
              items: [
                'Bấm [[Đăng tải]] để thêm tài liệu mới: chọn **Tải lên File** hoặc **Liên kết (URL)**, điền Tên/Danh mục/Phiên bản/Mô tả rồi bấm [[XÁC NHẬN]].',
              ],
            },
          ],
        },
        {
          id: 'ban-do',
          title: 'Bản đồ',
          summary: 'Xem vị trí nhân sự, sự kiện đang diễn ra và mạng lưới phòng xét nghiệm.',
          blocks: [
            { t: 'p', text: 'Dùng ô [[Tìm thành viên]] và bộ lọc **Phường, Xã, Đặc khu** để định vị nhanh. Bảng điều khiển lớp bản đồ (góc trên bên phải) cho bật/tắt từng lớp dữ liệu.' },
            {
              t: 'table',
              title: 'Các lớp bản đồ',
              head: ['Lớp', 'Nội dung'],
              rows: [
                ['**Thành viên**', 'Vị trí nhân sự RRT (mặc định bật).'],
                ['**Sự kiện**', 'Marker đỏ nhấp nháy = đang kích hoạt, xám = đã kết thúc (mặc định bật).'],
                ['**Phòng Xét Nghiệm**', 'Marker tô màu theo cấp năng lực (mặc định bật) — xem bảng màu ở mục "Các khái niệm cần biết".'],
                ['**Dân số**', 'Bản đồ nhiệt (choropleth) dân số theo phường (mặc định bật).'],
                ['**RRT-ers/Phường**', 'Bản đồ nhiệt mật độ nhân sự RRT theo phường (mặc định tắt).'],
              ],
            },
            { t: 'p', text: 'Bấm [[Tìm Phòng Xét nghiệm]] để mở nhanh công cụ điều phối mẫu ngay từ bản đồ, không cần vào một sự kiện cụ thể.' },
          ],
        },
        {
          id: 'phong-xet-nghiem',
          title: 'Phòng Xét nghiệm — quản trị danh mục',
          summary: 'Quản lý danh mục phòng xét nghiệm, năng lực và danh mục kỹ thuật (chỉ Quản trị RRT thành phố).',
          blocks: [
            { t: 'p', text: 'Đây là trang quản trị **danh mục** PXN (không phải nơi gửi mẫu — gửi mẫu thực hiện ở nút [[Xét nghiệm]]/[[Tìm Phòng Xét nghiệm]], xem mục "Điều phối mẫu xét nghiệm").' },
            {
              t: 'list',
              items: [
                'Bấm [[Thêm Phòng Xét nghiệm]] để khai báo một PXN mới.',
                'Trên một dòng PXN: biểu tượng **Quản lý năng lực** để khai báo kỹ thuật/công suất PXN đó làm được; biểu tượng **Sửa**; biểu tượng **Xóa**.',
                'Bấm [[Danh mục loại kỹ thuật xét nghiệm]] hoặc [[Danh mục Tác nhân gây bệnh]] để quản lý hai danh mục dùng chung.',
                'Bấm [[Lịch sử điều phối mẫu]] để xem toàn bộ lịch sử gửi mẫu tới mọi PXN trên toàn thành phố.',
              ],
            },
            { t: 'p', text: 'Trang có 6 biểu đồ tổng quan mạng lưới: theo Cấp năng lực, Mô hình cơ quan, Kỹ thuật xét nghiệm, An toàn sinh học (BSL), Vi sinh, Danh mục.' },
          ],
        },
        {
          id: 'dieu-phoi-mau',
          title: 'Điều phối mẫu xét nghiệm',
          summary: 'Tìm phòng xét nghiệm phù hợp nhất và gửi yêu cầu nhận mẫu cho một sự kiện.',
          blocks: [
            { t: 'p', text: 'Mở từ nút [[Xét nghiệm]] trong một sự kiện (trang Theo dõi sự kiện) hoặc [[Tìm Phòng Xét nghiệm]] trên trang Bản đồ.' },
            {
              t: 'steps',
              title: 'Bước 1 — Nhập tiêu chí',
              items: [
                'Chọn **Loại xét nghiệm (kỹ thuật)** cần thực hiện (bắt buộc, chọn được nhiều).',
                'Chọn **An toàn sinh học** tối thiểu cần có (mặc định cấp 2) — PXN thấp cấp hơn sẽ không bao giờ được đề xuất.',
                'Nhập **Số mẫu** và chọn **Tác nhân gây bệnh** liên quan (nếu có).',
                'Vị trí sự kiện tự điền nếu mở từ một sự kiện có sẵn; nếu mở từ Bản đồ thì nhập địa chỉ và bấm [[Tìm]] hoặc dùng vị trí hiện tại.',
                'Chọn một trong 4 chế độ ưu tiên: **⚡ Khẩn — ưu tiên tốc độ**, **⚖️ Cân bằng**, **📦 Nhiều mẫu — ưu tiên công suất**, **🏅 Ưu tiên chất lượng (QMS & năng lực xét nghiệm)** — hoặc chọn **Tùy chỉnh** để tự kéo 5 thanh trọng số.',
                'Bấm [[Tìm Phòng xét nghiệm phù hợp]].',
              ],
            },
            {
              t: 'steps',
              title: 'Bước 2 — Xem kết quả và gửi yêu cầu',
              items: [
                'Hệ thống xếp hạng các PXN phù hợp: thẻ đầu tiên gắn nhãn **TỐI ƯU**, các thẻ sau là **Dự phòng 2, 3…**; PXN công lập luôn xếp trên PXN tư nhân.',
                'Mỗi thẻ hiện khoảng cách, thời gian di chuyển, thời gian trả kết quả, còn đủ chỗ hay không, cấp QMS/năng lực và đầu mối liên hệ (bấm số điện thoại để gọi trực tiếp).',
                'Bấm [[Gửi]] trên một thẻ để gửi yêu cầu khảo sát riêng cho PXN đó, hoặc bấm [[Gửi yêu cầu điều phối mẫu (Top PXN)]] để gửi hàng loạt tới các PXN xếp hạng cao cùng lúc.',
                'Không muốn chọn một PXN? Bấm biểu tượng loại trừ trên thẻ đó — danh sách sẽ xếp hạng lại ngay.',
              ],
            },
            {
              t: 'steps',
              title: 'Bước 3 — Chốt lệnh khi PXN phản hồi',
              items: [
                'Trạng thái mỗi thẻ tự cập nhật khi PXN phản hồi: **Đang chờ PXN...** khi chưa có phản hồi.',
                'Khi PXN đồng ý nhận đủ mẫu: bấm nút xanh lá **Chốt điều phối (Đủ mẫu)**, xác nhận trong hộp thoại hiện ra.',
                'Khi PXN chỉ nhận được một phần: bấm nút vàng **Chốt (n mẫu)**.',
                'Nếu PXN từ chối, thẻ chuyển màu đỏ **Không nhận**. Lệnh đã chốt có thể hủy nếu cần.',
              ],
            },
            {
              t: 'note', kind: 'tip',
              text: 'Bấm [[Lịch sử điều phối mẫu hôm nay]] trong hộp thoại (theo từng sự kiện) hoặc [[Lịch sử điều phối mẫu]] ở trang Phòng Xét nghiệm (toàn thành phố) để tra cứu và xuất Excel.',
            },
          ],
        },
        {
          id: 'tin-nhan',
          title: 'Tin nhắn',
          summary: 'Thông báo hệ thống gửi riêng cho bạn.',
          blocks: [
            { t: 'p', text: 'Danh sách thông báo của chính bạn (mỗi tài khoản chỉ thấy thông báo của mình, kể cả Quản trị RRT thành phố). Dòng chưa đọc tô nền vàng — bấm [[Đánh dấu đã đọc]] để chuyển thành đã đọc.' },
          ],
        },
      ],
    },

    ward_admin: {
      title: 'Hướng dẫn sử dụng dành cho Quản trị tuyến cơ sở',
      audience: 'Người phụ trách đội RRT của một phường/xã/đặc khu.',
      groupLabel: 'Dành cho Quản trị tuyến cơ sở',
      sections: [
        {
          id: 'dashboard',
          title: 'Dashboard',
          summary: 'Tổng quan lịch trực, kích hoạt khẩn cấp, hồ sơ và thống kê — trong phạm vi đơn vị bạn phụ trách.',
          blocks: [
            { t: 'p', text: 'Giao diện giống Quản trị RRT thành phố (thẻ số liệu, hồ sơ gần đây, việc cần làm, biểu đồ thống kê), nhưng số liệu chỉ tính trong phạm vi nhân sự cùng nơi công tác với bạn.' },
          ],
        },
        {
          id: 'bieu-mau-rrt',
          title: 'Biểu mẫu RRT — duyệt hồ sơ nhân sự',
          summary: 'Duyệt hồ sơ RRT của nhân sự cùng phường/xã/đặc khu.',
          blocks: [
            {
              t: 'steps',
              items: [
                'Dùng [[Lọc]]/[[Xóa lọc]] để tìm hồ sơ.',
                'Ở cột **Phê duyệt**, chọn trạng thái: **Chờ duyệt** hoặc **Đã duyệt**.',
                'Bấm biểu tượng mắt ở cột **Hành động** để xem chi tiết hồ sơ.',
              ],
            },
            {
              t: 'note', kind: 'info',
              text: 'Khác với Quản trị RRT thành phố, bạn **không có** lựa chọn "Yêu cầu sửa" và **không có** nút xóa hồ sơ — chỉ duyệt hoặc để chờ.',
            },
          ],
        },
        {
          id: 'lich-truc',
          title: 'Lịch trực',
          summary: 'Xếp ca trực cho đội thuộc phường/xã/đặc khu của bạn.',
          blocks: [
            {
              t: 'steps',
              items: [
                'Bấm [[XÁC NHẬN]] trong khung tạo ca để thêm ca trực: chọn ngày, chọn đội (chỉ thấy các đội thuộc đơn vị bạn), ghi chú.',
                'Bấm [[Tạo yêu cầu Thay thế]] để thay người vắng mặt trong ca trực, làm theo từng bước của trình hướng dẫn.',
              ],
            },
          ],
        },
        {
          id: 'kich-hoat-khan-cap',
          title: 'Kích hoạt khẩn cấp',
          summary: 'Triệu tập nhân sự thuộc đơn vị bạn khi có tình huống khẩn cấp.',
          blocks: [
            { t: 'p', text: 'Danh sách nhân sự để chọn chỉ gồm người cùng phường/xã/đặc khu với bạn.' },
            {
              t: 'steps',
              items: [
                'Tick chọn nhân sự, bấm **KÍCH HOẠT (n)**.',
                'Chọn **🔥 Sự kiện Mới** hoặc **➕ Bổ sung nhân sự** (mời thêm người vào sự kiện đang có). Ô chọn xã không hiện — hệ thống tự gắn đúng đơn vị của bạn.',
                'Bấm [[▶️ Tiếp tục]] → xem lại thông tin → bấm **☑️ XÁC NHẬN** để gửi.',
              ],
            },
            {
              t: 'note', kind: 'warn',
              text: 'Nếu tài khoản của bạn chưa được gán đúng phường/xã/đặc khu, danh sách nhân sự sẽ trống — liên hệ Quản trị RRT thành phố để cập nhật nơi công tác cho tài khoản.',
            },
          ],
        },
        {
          id: 'theo-doi-su-kien',
          title: 'Theo dõi sự kiện',
          summary: 'Theo dõi sự kiện thuộc đơn vị bạn hoặc sự kiện bạn được mời tham gia.',
          blocks: [
            { t: 'p', text: 'Bạn thấy các sự kiện xảy ra tại đơn vị mình, cộng với mọi sự kiện khác mà bạn từng được mời hoặc đã tham gia.' },
            {
              t: 'list',
              title: 'Trong một sự kiện',
              items: [
                'Viết Nhật ký, gửi tin nhắn nhóm sự kiện, đính kèm file.',
                'Bấm [[Xét nghiệm]] để điều phối mẫu tới PXN (xem mục riêng bên dưới).',
                'Bấm [[Phương án (IAP)]] và [[Đánh giá (AAR)]] để lập phương án và báo cáo sau hành động.',
                'Dùng cụm nút 🧑‍🤝‍🧑 **Người** / 👩‍👩‍👦‍👦 **Đội** để thay quân khi sự kiện đang chạy.',
                'Bấm [[Yêu cầu hỗ trợ SOS]] khi cần chi viện gấp.',
              ],
            },
          ],
        },
        {
          id: 'thanh-vien',
          title: 'Thành viên',
          summary: 'Hồ sơ năng lực, đội và vị trí công tác của nhân sự thuộc đơn vị bạn.',
          blocks: [
            { t: 'p', text: 'Chỉ thấy nhân sự cùng phường/xã/đặc khu. Cột **Đội** và **Vị trí** vẫn chỉnh sửa được bằng sổ xuống.' },
            {
              t: 'note', kind: 'info',
              text: 'Danh sách **Vị trí** của bạn không có lựa chọn "Đội trưởng" để gán mới — nếu một người đã là Đội trưởng từ trước, vị trí đó vẫn giữ nguyên và hiện trong danh sách, nhưng bạn không đổi ai khác thành Đội trưởng được. Cần đổi Đội trưởng thì liên hệ Quản trị RRT thành phố.',
            },
          ],
        },
        {
          id: 'dao-tao',
          title: 'Đào tạo',
          summary: 'Xem khóa học và kết quả của học viên thuộc đơn vị bạn.',
          blocks: [
            { t: 'p', text: 'Bạn chỉ thấy các khóa học có học viên thuộc đơn vị mình, và chỉ thấy học viên cùng đơn vị. Kết quả hiển thị dạng chữ, **không chỉnh sửa được** — việc tạo khóa học và chấm điểm do Quản trị RRT thành phố thực hiện.' },
          ],
        },
        {
          id: 'thu-vien',
          title: 'Thư viện',
          summary: 'Tra cứu và đăng tải tài liệu dùng chung.',
          blocks: [
            { t: 'p', text: 'Lọc theo danh mục để tìm tài liệu.' },
            { t: 'steps', items: ['Bấm [[Đăng tải]] để thêm tài liệu mới (Tải lên File hoặc Liên kết URL), điền thông tin rồi [[XÁC NHẬN]].'] },
          ],
        },
        {
          id: 'ban-do',
          title: 'Bản đồ',
          summary: 'Xem vị trí nhân sự đơn vị bạn, sự kiện và mạng lưới phòng xét nghiệm.',
          blocks: [
            { t: 'p', text: 'Lớp **Thành viên** chỉ hiện người cùng phường/xã/đặc khu với bạn. Lớp **Phòng Xét Nghiệm**, **Sự kiện**, **Dân số** hiển thị như Quản trị RRT thành phố.' },
            { t: 'p', text: 'Bấm [[Tìm Phòng Xét nghiệm]] để mở nhanh công cụ điều phối mẫu ngay từ bản đồ.' },
          ],
        },
        {
          id: 'dieu-phoi-mau',
          title: 'Điều phối mẫu xét nghiệm',
          summary: 'Tìm phòng xét nghiệm phù hợp và gửi yêu cầu nhận mẫu cho sự kiện của đơn vị bạn.',
          blocks: [
            { t: 'p', text: 'Thao tác giống hệt Quản trị RRT thành phố: mở từ nút [[Xét nghiệm]] trong một sự kiện hoặc [[Tìm Phòng Xét nghiệm]] trên Bản đồ, chọn tiêu chí, xem xếp hạng PXN, gửi yêu cầu và chốt lệnh khi PXN phản hồi.' },
            {
              t: 'note', kind: 'tip',
              text: 'Xem đầy đủ các bước tại mục "Điều phối mẫu xét nghiệm" trong tab Quản trị RRT (thành phố) — quy trình giống hệt, chỉ khác là bạn thực hiện cho sự kiện thuộc đơn vị mình.',
            },
          ],
        },
        {
          id: 'tin-nhan',
          title: 'Tin nhắn',
          summary: 'Thông báo hệ thống gửi riêng cho bạn.',
          blocks: [
            { t: 'p', text: 'Chỉ thấy thông báo của chính bạn. Bấm [[Đánh dấu đã đọc]] để chuyển một thông báo sang trạng thái đã đọc.' },
          ],
        },
      ],
    },

    user: {
      title: 'Hướng dẫn sử dụng dành cho Nhân viên RRT',
      audience: 'Thành viên đội RRT.',
      groupLabel: 'Dành cho Nhân viên RRT',
      sections: [
        {
          id: 'dashboard',
          title: 'Dashboard',
          summary: 'Trang chào và trạng thái cá nhân sau khi đăng nhập.',
          blocks: [
            { t: 'p', text: 'Hiện lời chào cùng tên của bạn, thẻ trạng thái cá nhân (mặc định "Sẵn sàng") và danh sách "Thông báo mới" gần đây.' },
          ],
        },
        {
          id: 'bieu-mau-rrt',
          title: 'Biểu mẫu RRT — hồ sơ của tôi',
          summary: 'Xem và cập nhật hồ sơ năng lực RRT của chính bạn, theo dõi trạng thái duyệt.',
          blocks: [
            { t: 'p', text: 'Bạn chỉ thấy đúng một dòng — hồ sơ của chính mình. Cột **Phê duyệt** chỉ hiện huy hiệu trạng thái (Chờ duyệt / Yêu cầu sửa / Đã duyệt), không chỉnh sửa được — việc duyệt do Quản trị RRT thực hiện.' },
            {
              t: 'steps',
              items: [
                'Bấm [[Biểu mẫu RRT]] hoặc biểu tượng mắt trên dòng hồ sơ của bạn để mở form, cập nhật thông tin cá nhân, kỹ năng, học vấn, ngoại ngữ… rồi nộp.',
              ],
            },
            {
              t: 'note', kind: 'warn',
              text: 'Mỗi lần nộp/sửa, trạng thái tự chuyển về **Chờ duyệt**, cần Quản trị RRT duyệt lại. Nếu bị chuyển sang **Yêu cầu sửa**, hãy bổ sung theo góp ý rồi nộp lại.',
            },
          ],
        },
        {
          id: 'theo-doi-su-kien',
          title: 'Theo dõi sự kiện — xác nhận tham gia',
          summary: 'Nơi bạn xác nhận tham gia hoặc báo không thể tham gia khi được điều động.',
          blocks: [
            { t: 'p', text: 'Bạn chỉ thấy các sự kiện mình đã tham gia, hoặc đang được mời tham gia (và chưa từ chối). Khi được điều động vào một sự kiện, hãy vào trang này để xử lý — **không phải** trang Tin nhắn.' },
            {
              t: 'steps',
              title: 'Khi được điều động',
              items: [
                'Mở sự kiện bạn được mời từ danh sách "Theo dõi sự kiện".',
                'Thanh cảnh báo vàng **"YÊU CẦU TỪ HỆ THỐNG — Bạn được điều động tham gia sự kiện này. Vui lòng phản hồi ngay!"** sẽ hiện ở đầu trang.',
                'Bấm [[XÁC NHẬN]] nếu bạn tham gia được, hoặc [[KHÔNG THỂ THAM GIA]] nếu không thể. Chọn xong là ghi nhận ngay, không cần bước nào thêm.',
              ],
            },
            { t: 'p', text: 'Trong lúc sự kiện diễn ra, bạn có thể xem Nhật ký, gửi tin nhắn trao đổi trong nhóm sự kiện và đính kèm file như các thành viên khác.' },
          ],
        },
        {
          id: 'dao-tao',
          title: 'Đào tạo',
          summary: 'Xem các khóa học và kết quả đào tạo của chính bạn.',
          blocks: [
            { t: 'p', text: 'Bạn chỉ thấy những khóa học mình đã tham gia và kết quả của chính mình, hiển thị dạng chữ, không chỉnh sửa được.' },
          ],
        },
        {
          id: 'thu-vien',
          title: 'Thư viện',
          summary: 'Tra cứu và tải tài liệu dùng chung: SOP, biểu mẫu, hướng dẫn chuyên môn.',
          blocks: [
            { t: 'p', text: 'Lọc theo danh mục và tải tài liệu về dùng. Bạn không có nút [[Đăng tải]] — chỉ Quản trị RRT/Quản trị tuyến cơ sở mới đăng tài liệu mới.' },
          ],
        },
        {
          id: 'ban-do',
          title: 'Bản đồ',
          summary: 'Xem vị trí của chính bạn và mạng lưới phòng xét nghiệm.',
          blocks: [
            { t: 'p', text: 'Lớp **Thành viên** chỉ hiện marker của chính bạn (trừ khi bạn thuộc một đơn vị tuyến cơ sở, khi đó thấy thêm người cùng đơn vị). Lớp **Phòng Xét Nghiệm** vẫn xem được đầy đủ, tô màu theo cấp năng lực — hữu ích để biết PXN gần mình nhất.' },
          ],
        },
        {
          id: 'tin-nhan',
          title: 'Tin nhắn',
          summary: 'Thông báo hệ thống gửi riêng cho bạn.',
          blocks: [
            { t: 'p', text: 'Danh sách thông báo của bạn, dòng chưa đọc tô nền vàng. Bấm [[Đánh dấu đã đọc]] để đánh dấu đã xem.' },
            {
              t: 'note', kind: 'info',
              text: 'Thông báo mời tham gia sự kiện chỉ để **báo có việc mới** — xác nhận tham gia thực hiện tại trang **Theo dõi sự kiện**, không phải ở đây.',
            },
          ],
        },
      ],
    },
  },
};
