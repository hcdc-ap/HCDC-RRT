// ============================================================================
// MODULE: QUẢN LÝ PHÒNG XÉT NGHIỆM (PXN) — Giai đoạn 1, phần giao diện
// Hệ thống RRT-HCDC
// ----------------------------------------------------------------------------
// CÁCH NHÚNG:
//
// (1) HTML — thêm mục menu vào sidebar (cạnh các mục Bản đồ, Thành viên...):
//     <li id="menu-lab-admin">
//       <a href="#" data-target="page-lab-admin">
//         <i class='bx bxs-flask bx-sm'></i><span class="text">Quản lý PXN</span>
//       </a>
//     </li>
//     (icon bxs-flask cần Boxicons — app bạn đã dùng bx rồi nên có sẵn)
//
// (2) HTML — thêm khối trang vào vùng nội dung (cạnh các <div id="page-...">):
//     Dán khối LAB_ADMIN_PAGE_HTML (ở cuối file này, trong comment) vào index.html
//
// (3) JS — thêm dòng này vào cuối index.html, SAU script.js và fix-patches.js:
//     <script src="lab-admin.js"></script>
//
// (4) Đảm bảo Leaflet đã được nạp (app bạn có trang Bản đồ nên chắc đã có):
//     <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
//     <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
//
// (5) Gọi renderLabAdminPage() khi user điều hướng tới trang này. Nếu app bạn
//     dùng data-target để chuyển trang, thêm vào hàm chuyển trang:
//       if (targetId === 'page-lab-admin') window.renderLabAdminPage();
// ============================================================================

(function () {
  'use strict';

  let _labMap = null; // instance Leaflet trong modal thêm/sửa PXN
  let _labMarker = null; // marker chọn tọa độ
  let _editingLabId = null; // id PXN đang sửa (null = thêm mới)
  let _testTypesCache = []; // cache danh mục loại XN
  let _ttSort = { col: 'category', dir: 'asc' }; // cột + chiều sắp xếp bảng loại XN
  // BỔ SUNG 2 BIẾN CHO TÁC NHÂN
  let _pathogensCacheAdmin = [];
  let _pSort = { col: 'category', dir: 'asc' };

  const esc = (s) =>
    window.escapeHtml
      ? window.escapeHtml(s)
      : String(s ?? '').replace(
          /[&<>"']/g,
          (c) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#039;',
            }[c])
        );

  // Mô hình cơ quan (level = loại hình đơn vị, theo tài liệu chốt PXN 2026)
  const ORG_MODELS = [
    'Viện, Trường',
    'Bệnh viện bộ ngành',
    'Bệnh viện công lập',
    'Bệnh viện tư nhân',
    'Trung tâm Kiểm soát bệnh tật',
    'Trung tâm y tế',
    'Trạm Y tế',
  ];
  // QMS: mức chất lượng (label → level số để tính capability_tier)
  const QSM_OPTIONS = [
    { level: 0, label: '', text: 'Chưa có' },
    { level: 1, label: 'QĐ2429 Mức 1', text: 'QĐ2429 Mức 1' },
    { level: 2, label: 'QĐ2429 Mức 2', text: 'QĐ2429 Mức 2' },
    { level: 3, label: 'QĐ2429 Mức 3', text: 'QĐ2429 Mức 3' },
    { level: 4, label: 'QĐ2429 Mức 4', text: 'QĐ2429 Mức 4' },
    { level: 5, label: 'ISO 15189', text: 'ISO 15189 (≈ Mức 5)' },
  ];

  // ==========================================================================
  // GUARD QUYỀN: chỉ admin mới vào được trang này
  // ==========================================================================
  async function ensureAdmin() {
    try {
      const { data, error } = await window.supabaseClient.rpc('is_admin');
      if (error) throw error;
      return data === true;
    } catch (e) {
      console.error('[lab-admin] Lỗi kiểm tra quyền:', e);
      return false;
    }
  }

  // ==========================================================================
  // ENTRY POINT — gọi khi mở trang Quản lý PXN
  // ==========================================================================
  window.renderLabAdminPage = async function () {
    const container = document.getElementById('lab-admin-content');
    if (!container) {
      console.warn('[lab-admin] Không tìm thấy #lab-admin-content trong HTML');
      return;
    }

    // Chặn người không phải admin (phòng khi menu lọt ra ngoài)
    const isAdmin = await ensureAdmin();
    if (!isAdmin) {
      container.innerHTML = `
        <div class="alert alert-warning m-3">
          <i class='bx bx-lock-alt'></i> Bạn không có quyền truy cập trang này.
          Chỉ quản trị viên mới quản lý được danh mục Phòng xét nghiệm.
        </div>`;
      return;
    }

    await loadTestTypes();
    await renderLabList();
  };

  // ==========================================================================
  // TẢI DANH MỤC LOẠI XÉT NGHIỆM (dùng cho dropdown năng lực)
  // ==========================================================================
  async function loadTestTypes() {
    try {
      const { data, error } = await window.supabaseClient
        .from('test_types')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      _testTypesCache = data || [];
    } catch (e) {
      console.error('[lab-admin] Lỗi tải test_types:', e);
      _testTypesCache = [];
    }
  }

  // ==========================================================================
  // DANH SÁCH PXN
  // ==========================================================================
  async function renderLabList() {
    const container = document.getElementById('lab-admin-content');
    container.innerHTML =
      '<div class="text-center p-4"><span class="spinner-border"></span> Đang tải danh sách...</div>';

    try {
      // Lấy PXN kèm số năng lực (loại XN) mỗi PXN đảm nhận
      const { data: labs, error } = await window.supabaseClient
        .from('laboratories')
        .select('*, lab_capabilities(count)')
        .order('name', { ascending: true });
      if (error) throw error;

      let rows = '';
      if (!labs || labs.length === 0) {
        rows = `<tr><td colspan="8" class="text-center text-muted py-4">
                  Chưa có phòng xét nghiệm nào. Bấm "Thêm Phòng Xét nghiệm" để bắt đầu.
                </td></tr>`;
      } else {
        labs.forEach((lab) => {
          const capCount = lab.lab_capabilities?.[0]?.count ?? 0;
          const statusBadge = lab.is_active
            ? '<span class="badge bg-success">Đang hoạt động</span>'
            : '<span class="badge bg-secondary">Tạm ngừng</span>';
          const bslBadge = `<span class="badge bg-dark">ATSH cấp ${
            lab.bsl_level ?? '?'
          }</span>`;
          const qsmBadge = lab.qsm_label
            ? `<span class="badge bg-info text-dark">${esc(
                lab.qsm_label
              )}</span>`
            : '<span class="text-muted">—</span>';
          const tierBadge =
            lab.capability_tier != null
              ? `<span class="badge bg-secondary">${lab.capability_tier}</span>`
              : '<span class="text-muted">—</span>';
          const hasCoord = lab.lat != null && lab.lng != null;

          rows += `
            <tr>
              <td>
                <div class="fw-bold">${esc(lab.name)}</div>
                <small class="text-muted">${esc(
                  lab.address || 'Chưa có địa chỉ'
                )}</small>
                ${
                  !hasCoord
                    ? '<br><small class="text-danger"><i class="bx bx-error-circle"></i> Chưa có tọa độ</small>'
                    : ''
                }
              </td>
              <td>${esc(lab.level || '—')}</td>
              <td>${bslBadge}</td>
              <td>${qsmBadge}</td>
              <td class="text-center">${tierBadge}</td>
              <td class="text-center">
                <span class="badge bg-info text-dark">${capCount} loại</span>
                <button class="btn btn-sm btn-outline-primary ms-1" onclick="window.openCapabilityModal('${
                  lab.id
                }')" title="Quản lý năng lực">
                  <i class='bx bx-list-plus'></i>
                </button>
              </td>
              <td>${statusBadge}</td>
              <td class="text-nowrap">
                <button class="btn btn-sm btn-outline-secondary" onclick="window.openLabModal('${
                  lab.id
                }')" title="Sửa">
                  <i class='bx bx-edit'></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="window.deleteLab('${
                  lab.id
                }','${esc(lab.name).replace(/'/g, "\\'")}')" title="Xóa">
                  <i class='bx bx-trash'></i>
                </button>
              </td>
            </tr>`;
        });
      }

      container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h5 class="mb-0"><i class='bx bxs-flask'></i> Danh mục Phòng xét nghiệm</h5>
            <small class="text-muted">Quản lý Phòng Xét nghiệm, tuyến, cấp an toàn sinh học và năng lực xét nghiệm</small>
          </div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-info" onclick="window._openDispatchHistorySafe()">
              <i class='bx bx-history'></i> Lịch sử điều phối mẫu
            </button>
            <button class="btn btn-outline-secondary" onclick="window.openTestTypeModal()">
              <i class='bx bx-list-ul'></i> Danh mục loại kỹ thuật xét nghiệm
            </button>
            <button class="btn btn-outline-secondary" onclick="window.openPathogenModal()">
              <i class='bx bx-bug'></i> Danh mục Tác nhân gây bệnh
            </button>
            <button class="btn btn-primary" onclick="window.openLabModal()">
              <i class='bx bx-plus'></i> Thêm Phòng Xét nghiệm
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table id="lab-list-table" class="table table-hover align-middle" style="width:100%">
            <thead class="table-light">
              <tr>
                <th>Tên & Địa chỉ</th>
                <th>Mô hình cơ quan</th>
                <th>An toàn sinh học</th>
                <th>QMS</th>
                <th class="text-center">Năng lực xét nghiệm</th>
                <th class="text-center">Kỹ thuật xét nghiệm</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <!-- 6 BIỂU ĐỒ TỔNG QUAN (dàn ngang 2 hàng) -->
        <div class="row g-3 mt-2" id="lab-charts-row">
          
          <!-- HÀNG 1: 3 Biểu đồ cũ -->
          <div class="col-md-4">
            <div class="card h-100"><div class="card-body p-2">
              <div id="chart-tier" style="height:280px;"></div>
            </div></div>
          </div>
          <div class="col-md-4">
            <div class="card h-100"><div class="card-body p-2">
              <div id="chart-orgmodel" style="height:280px;"></div>
            </div></div>
          </div>
          <div class="col-md-4">
            <div class="card h-100"><div class="card-body p-2">
              <div id="chart-techniques" style="height:280px;"></div>
            </div></div>
          </div>

          <!-- HÀNG 2: 3 Biểu đồ mới bổ sung -->
          <div class="col-md-4">
            <div class="card h-100"><div class="card-body p-2">
              <div id="chart-bsl" style="height:280px;"></div>
            </div></div>
          </div>
          <div class="col-md-4">
            <div class="card h-100"><div class="card-body p-2">
              <div id="chart-micro" style="height:280px;"></div>
            </div></div>
          </div>
          <div class="col-md-4">
            <div class="card h-100"><div class="card-body p-2">
              <div id="chart-category" style="height:280px;"></div>
            </div></div>
          </div>

        </div>`;

      // Khởi tạo DataTable (tìm kiếm, phân trang, sắp xếp, xuất Excel/CSV)
      _initLabDataTable();
    } catch (e) {
      console.error('[lab-admin] Lỗi tải danh sách Phòng Xét nghiệm:', e);
      container.innerHTML = `<div class="alert alert-danger m-3">Lỗi tải danh sách: ${esc(
        e.message
      )}</div>`;
    }
  }

  // Khởi tạo DataTable cho bảng PXN: tìm kiếm, phân trang, sắp xếp, xuất Excel/CSV
  function _initLabDataTable() {
    if (!(window.$ && $.fn && $.fn.DataTable)) {
      console.warn(
        '[lab-admin] Chưa nạp DataTables — bảng hiển thị dạng thường.'
      );
      return;
    }
    // Hủy instance cũ nếu có (tránh lỗi "reinitialise")
    if ($.fn.DataTable.isDataTable('#lab-list-table')) {
      $('#lab-list-table').DataTable().destroy();
    }
    // Nút xuất chỉ hiện nếu có plugin buttons
    const hasButtons = !!($.fn.dataTable && $.fn.dataTable.Buttons);
    const cfg = {
      destroy: true,
      responsive: true,
      pageLength: 10,
      lengthMenu: [
        [10, 25, 50, 100, -1],
        [10, 25, 50, 100, 'Tất cả'],
      ],
      order: [[0, 'asc']],
      columnDefs: [{ orderable: false, targets: [5, 7] }],
      language: {
        search: 'Tìm kiếm:',
        lengthMenu: 'Hiện _MENU_ dòng',
        info: 'Hiển thị _START_–_END_ / _TOTAL_ phòng xét nghiệm',
        infoEmpty: 'Không có dữ liệu',
        infoFiltered: '(lọc từ _MAX_ phòng)',
        paginate: {
          first: 'Đầu',
          last: 'Cuối',
          next: 'Sau',
          previous: 'Trước',
        },
        zeroRecords: 'Không tìm thấy phòng xét nghiệm phù hợp',
      },
    };
    if (hasButtons) {
      // Trên: nút xuất (B) + độ dài trang (l) + phân trang (p) + tìm kiếm (f)
      // Dưới: thông tin (i) + phân trang (p)
      cfg.dom =
        '<"d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2"B<"d-flex align-items-center gap-2"lf>>' +
        '<"d-flex justify-content-end mb-2"p>' +
        'rt' +
        '<"d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2"ip>';
      cfg.buttons = [
        // Xuất Excel bảng đang hiển thị (nhanh, chỉ cột trên bảng)
        {
          extend: 'excelHtml5',
          text: "<i class='bx bx-table'></i> Excel (bảng)",
          className: 'btn btn-sm btn-outline-success',
          title: 'Danh_muc_PXN',
          exportOptions: { columns: [0, 1, 2, 3, 4, 6] },
        },
        // Xuất CSV ĐẦY ĐỦ dữ liệu liên kết (PXN + từng kỹ thuật)
        {
          text: "<i class='bx bx-download'></i> Xuất file *.CSV",
          className: 'btn btn-sm btn-outline-primary',
          action: function () {
            window._exportLabsCsv();
          },
        },
      ];
    } else {
      cfg.dom =
        '<"d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2"lf>' +
        '<"d-flex justify-content-end mb-2"p>' +
        'rt' +
        '<"d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2"ip>';
      console.info(
        '[lab-admin] Plugin Buttons chưa có → dùng nút xuất dự phòng.'
      );
    }
    $('#lab-list-table').DataTable(cfg);

    if (!hasButtons) _injectFallbackExport();

    // Vẽ 3 biểu đồ tổng quan dưới bảng
    _renderLabCharts();
  }

  // Xuất CSV dự phòng (không cần plugin) — đọc thẳng dữ liệu PXN
  function _injectFallbackExport() {
    const host = document.querySelector('#lab-admin-content .d-flex.gap-2');
    if (!host || document.getElementById('lab-export-fallback')) return;
    const btn = document.createElement('button');
    btn.id = 'lab-export-fallback';
    btn.className = 'btn btn-outline-success';
    btn.innerHTML = "<i class='bx bx-download'></i> Xuất CSV";
    btn.onclick = window._exportLabsCsv;
    host.prepend(btn);
  }

  // Xuất CSV có DỮ LIỆU LIÊN KẾT (laboratories + lab_capabilities).
  // Định dạng "long": mỗi dòng = 1 kỹ thuật của 1 PXN, kèm đầy đủ thông tin PXN.
  // PXN chưa khai kỹ thuật vẫn có 1 dòng (cột kỹ thuật để trống).
  window._exportLabsCsv = async function () {
    try {
      if (window.showToast)
        window.showToast('Đang chuẩn bị dữ liệu xuất...', 'info');

      // Tải PXN + năng lực liên kết (join test_types) trong 1 truy vấn
      const { data: labs, error } = await window.supabaseClient
        .from('laboratories')
        .select(
          'name, level, address, phone, bsl_level, qsm_label, capability_tier, ' +
            'head_name, head_phone, head_email, total_biosafety_staff, dedicated_staff, ' +
            'external_qa, interlab, reports_positive, periodic_report, is_active, ' +
            'lab_capabilities ( max_capacity_per_day, turnaround_hours, equipment_detail, ' +
            'test_types ( name, category, required_bsl ) )'
        )
        .order('name', { ascending: true });
      if (error) throw error;

      const headers = [
        'Tên PXN',
        'Mô hình cơ quan',
        'Địa chỉ',
        'Điện thoại',
        'ATSH cấp',
        'QMS',
        'Cấp năng lực',
        'Đầu mối',
        'SĐT đầu mối',
        'Email đầu mối',
        'NS ATSH',
        'NS chuyên trách',
        'Ngoại kiểm',
        'Liên phòng',
        'Báo cáo ca(+)',
        'Báo cáo định kỳ',
        'Hoạt động',
        'Kỹ thuật xét nghiệm',
        'Nhóm kỹ thuật',
        'BSL yêu cầu KT',
        'Công suất (mẫu/ngày)',
        'Thời gian trả KQ (giờ)',
        'Chi tiết máy',
      ];
      const yn = (v) => (v ? 'Có' : 'Không');
      const cell = (v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };

      const lines = [headers.join(',')];
      let capRowCount = 0;
      (labs || []).forEach((l) => {
        const labCols = [
          l.name,
          l.level,
          l.address,
          l.phone,
          l.bsl_level,
          l.qsm_label,
          l.capability_tier,
          l.head_name,
          l.head_phone,
          l.head_email,
          l.total_biosafety_staff,
          l.dedicated_staff,
          yn(l.external_qa),
          yn(l.interlab),
          yn(l.reports_positive),
          yn(l.periodic_report),
          yn(l.is_active),
        ];
        const caps = l.lab_capabilities || [];
        if (caps.length === 0) {
          lines.push([...labCols, '', '', '', '', '', ''].map(cell).join(','));
        } else {
          caps.forEach((c) => {
            capRowCount++;
            lines.push(
              [
                ...labCols,
                c.test_types?.name,
                c.test_types?.category,
                c.test_types?.required_bsl,
                c.max_capacity_per_day,
                c.turnaround_hours,
                c.equipment_detail,
              ]
                .map(cell)
                .join(',')
            );
          });
        }
      });

      const blob = new Blob(['\uFEFF' + lines.join('\n')], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PXN_va_nang_luc_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (window.showToast)
        window.showToast(
          `Đã xuất ${labs?.length || 0} PXN, ${capRowCount} dòng năng lực`,
          'success'
        );
    } catch (e) {
      if (window.showToast)
        window.showToast('Lỗi xuất CSV: ' + e.message, 'error');
    }
  };

  // ==========================================================================
  // 6 BIỂU ĐỒ TỔNG QUAN DASHBOARD (Highcharts) - BẢN HOÀN THIỆN UI & ACTIONABLE DATA
  // ==========================================================================
  async function _renderLabCharts() {
    if (typeof Highcharts === 'undefined') {
      console.warn('[lab-admin] Chưa nạp Highcharts — bỏ qua biểu đồ.');
      return;
    }

    try {
      // 👉 BƯỚC 1 CỰC QUAN TRỌNG: Gọi thêm cột 'name' để lấy tên PXN
      const { data: labs } = await window.supabaseClient
        .from('laboratories')
        .select(
          'name, level, capability_tier, does_microbiology, bsl_level, head_name, head_phone, head_email'
        );

      const { data: caps } = await window.supabaseClient
        .from('lab_capabilities')
        .select('test_types(name, category)');

      const L = labs || [];

      // ======== BỘ SƯU TẬP MÀU SẮC ========
      const TEAL = '#0f766e';
      const TEAL_LIGHT = '#2dd4bf';
      const ORANGE = '#ea580c';
      const ORANGE_LIGHT = '#f97316';
      const BLUE = '#0284c7';
      const PURPLE = '#7c3aed';
      const YELLOW = '#eab308';
      const RED = '#dc2626';
      const GRAY_DARK = '#1e293b';
      const GRAY_MED = '#647481';
      const WHITE = '#ffffff';
      const BG_TOOLTIP = 'rgba(15, 23, 42, 0.95)';

      const EXTENDED_PALETTE = [
        TEAL,
        ORANGE,
        BLUE,
        YELLOW,
        PURPLE,
        RED,
        '#059669',
        '#be123c',
        GRAY_MED,
      ];

      Highcharts.setOptions({ credits: { enabled: false } });

      // --- Hàm Helper: Định dạng danh sách Lab trong Tooltip ---
      const formatLabList = (labsArray) => {
        if (!labsArray || labsArray.length === 0) return '';
        const displayLabs = labsArray.slice(0, 10); // Hiển thị tối đa 10 cái để không tràn màn hình
        let html = `<div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.2); font-size:12px; color:#cbd5e1; text-align: left;">`;
        displayLabs.forEach((name) => {
          html += `<div style="margin-bottom:4px; white-space: normal; line-height: 1.4;">• ${name}</div>`;
        });
        if (labsArray.length > 10) {
          html += `<div style="color:#f97316; font-style:italic; margin-top:4px;">... và ${
            labsArray.length - 10
          } đơn vị khác</div>`;
        }
        html += `</div>`;
        return html;
      };

      // ----------------------------------------------------------------------
      // CHART 1: Phân bố Cấp năng lực (Cột dọc)
      // ----------------------------------------------------------------------
      const tierCount = [0, 0, 0, 0, 0];
      L.forEach((l) => {
        const t = l.capability_tier;
        if (t >= 1 && t <= 5) tierCount[t - 1]++;
      });

      Highcharts.chart('chart-tier', {
        chart: {
          type: 'column',
          backgroundColor: 'transparent',
          style: { fontFamily: "'Inter', 'Lexend', sans-serif" },
        },
        title: {
          text: 'Phân bố cấp Năng lực xét nghiệm',
          style: { fontSize: '15px', fontWeight: '700', color: GRAY_DARK },
        },
        xAxis: {
          categories: ['Cấp 1', 'Cấp 2', 'Cấp 3', 'Cấp 4', 'Cấp 5'],
          labels: {
            style: { color: GRAY_DARK, fontWeight: '600', fontSize: '12px' },
          },
        },
        yAxis: {
          min: 0,
          title: { text: '' },
          allowDecimals: false,
          labels: { style: { color: GRAY_DARK } },
        },
        legend: { enabled: false },
        tooltip: {
          backgroundColor: BG_TOOLTIP,
          style: { color: WHITE },
          borderWidth: 0,
          borderRadius: 8,
          pointFormat: '<b>{point.y}</b> PXN',
        },
        plotOptions: {
          column: {
            borderRadius: 4,
            dataLabels: {
              enabled: true,
              color: GRAY_DARK,
              style: {
                textOutline: 'none',
                fontWeight: 'bold',
                fontSize: '13px',
              },
              y: -5,
            },
            colorByPoint: true,
            colors: [ORANGE_LIGHT, ORANGE, TEAL_LIGHT, TEAL, RED],
          },
        },
        series: [{ name: 'PXN', data: tierCount }],
      });

      // ----------------------------------------------------------------------
      // CHART 2: Cơ cấu Mô hình cơ quan (Donut)
      // ----------------------------------------------------------------------
      const orgMap = {};
      L.forEach((l) => {
        const k = l.level || 'Khác';
        orgMap[k] = (orgMap[k] || 0) + 1;
      });
      const orgData = Object.entries(orgMap)
        .sort((a, b) => b[1] - a[1])
        .map(([name, y], i) => ({
          name: name,
          y: y,
          color: EXTENDED_PALETTE[i % EXTENDED_PALETTE.length],
        }));

      Highcharts.chart('chart-orgmodel', {
        chart: {
          type: 'pie',
          backgroundColor: 'transparent',
          height: 280,
          style: { fontFamily: "'Inter', 'Lexend', sans-serif" },
        },
        title: {
          text: 'Phân bố Mô hình cơ quan',
          style: { fontSize: '15px', fontWeight: '700', color: GRAY_DARK },
        },
        tooltip: {
          backgroundColor: BG_TOOLTIP,
          style: { color: WHITE },
          borderWidth: 0,
          borderRadius: 8,
          pointFormat: '<b>{point.y}</b> PXN ({point.percentage:.1f}%)',
        },
        plotOptions: {
          pie: {
            innerSize: '60%',
            dataLabels: {
              enabled: true,
              format: '<b>{point.name}</b><br>{point.y}',
              style: {
                fontWeight: '600',
                textOutline: 'none',
                color: GRAY_DARK,
                fontSize: '11px',
              },
            },
          },
        },
        series: [{ name: 'PXN', data: orgData }],
      });

      // ----------------------------------------------------------------------
      // CHART 3: Top 8 Kỹ thuật (Thanh ngang)
      // ----------------------------------------------------------------------
      const techMap = {};
      (caps || []).forEach((c) => {
        const n = c.test_types?.name;
        if (n) techMap[n] = (techMap[n] || 0) + 1;
      });
      const techData = Object.entries(techMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      Highcharts.chart('chart-techniques', {
        chart: {
          type: 'bar',
          backgroundColor: 'transparent',
          height: 280,
          style: { fontFamily: "'Inter', 'Lexend', sans-serif" },
        },
        title: {
          text: 'Phân bố Kỹ thuật xét nghiệm (Top 10)',
          style: { fontSize: '15px', fontWeight: '700', color: GRAY_DARK },
        },
        xAxis: {
          categories: techData.map((d) => d[0]),
          labels: {
            align: 'right',
            reserveSpace: true,
            style: {
              fontSize: '11px',
              width: '130px',
              whiteSpace: 'normal',
              color: GRAY_DARK,
              fontWeight: '600',
            },
          },
        },
        yAxis: {
          min: 0,
          title: { text: '' },
          allowDecimals: false,
          labels: { style: { color: GRAY_DARK } },
        },
        legend: { enabled: false },
        tooltip: {
          backgroundColor: BG_TOOLTIP,
          style: { color: WHITE },
          borderWidth: 0,
          borderRadius: 8,
          pointFormat: 'Thực hiện tại <b>{point.y}</b> PXN',
        },
        plotOptions: {
          bar: {
            borderRadius: 3,
            dataLabels: {
              enabled: true,
              align: 'left',
              style: {
                color: GRAY_DARK,
                textOutline: 'none',
                fontWeight: 'bold',
              },
            },
            color: TEAL,
          },
        },
        series: [{ name: 'PXN', data: techData.map((d) => d[1]) }],
      });

      // ----------------------------------------------------------------------
      // CHART 4: Phân bố An toàn sinh học (Pie)
      // ----------------------------------------------------------------------
      const bslMap = { 'Cấp 1': 0, 'Cấp 2': 0, 'Cấp 3': 0, 'Chưa rõ': 0 };
      L.forEach((l) => {
        if (l.bsl_level === 1) bslMap['Cấp 1']++;
        else if (l.bsl_level === 2) bslMap['Cấp 2']++;
        else if (l.bsl_level === 3) bslMap['Cấp 3']++;
        else bslMap['Chưa rõ']++;
      });

      const bslData = Object.entries(bslMap)
        .filter((d) => d[1] > 0)
        .map(([name, y]) => ({
          name: name,
          y: y,
          color:
            name === 'Cấp 2'
              ? ORANGE
              : name === 'Cấp 3'
              ? RED
              : name === 'Cấp 1'
              ? TEAL
              : GRAY_MED,
        }));

      Highcharts.chart('chart-bsl', {
        chart: {
          type: 'pie',
          backgroundColor: 'transparent',
          height: 280,
          style: { fontFamily: "'Inter', 'Lexend', sans-serif" },
        },
        title: {
          text: 'Phân bố cấp An toàn sinh học',
          style: { fontSize: '15px', fontWeight: '700', color: GRAY_DARK },
        },
        tooltip: {
          backgroundColor: BG_TOOLTIP,
          style: { color: WHITE },
          borderWidth: 0,
          borderRadius: 8,
          pointFormat: '<b>{point.y}</b> PXN ({point.percentage:.1f}%)',
        },
        plotOptions: {
          pie: {
            dataLabels: {
              enabled: true,
              distance: 15,
              format: '<b>{point.name}</b>: {point.y}',
              style: {
                color: GRAY_DARK,
                textOutline: 'none',
                fontWeight: '600',
              },
            },
          },
        },
        series: [{ data: bslData }],
      });

      // ----------------------------------------------------------------------
      // HÀM LỌC RÁC
      // ----------------------------------------------------------------------
      const isValidContact = (val) => {
        if (!val) return false;
        const s = String(val).trim().toLowerCase();
        if (
          s === '' ||
          s === 'null' ||
          s === 'không cung cấp' ||
          s === 'n/a' ||
          s === 'chưa có'
        )
          return false;
        return true;
      };

      // ----------------------------------------------------------------------
      // CHART 5: Mạng lưới kết nối (Bán khuyên) - ĐÃ FIX VỊ TRÍ CHỮ
      // ----------------------------------------------------------------------
      let fullContact = 0;
      let missingContactLabs = [];

      L.forEach((l) => {
        if (
          isValidContact(l.head_name) &&
          isValidContact(l.head_phone) &&
          isValidContact(l.head_email)
        ) {
          fullContact++;
        } else {
          missingContactLabs.push(l.name || 'PXN chưa cập nhật tên');
        }
      });

      Highcharts.chart('chart-micro', {
        chart: {
          type: 'pie',
          backgroundColor: 'transparent',
          height: 280,
          style: { fontFamily: "'Inter', 'Lexend', sans-serif" },
        },
        title: {
          text: 'Sẵn sàng Kết nối mạng lưới PXN',
          style: { fontSize: '15px', fontWeight: '700', color: GRAY_DARK },
        },
        tooltip: {
          useHTML: true,
          backgroundColor: BG_TOOLTIP,
          style: { color: WHITE },
          borderWidth: 0,
          borderRadius: 8,
          formatter: function () {
            let text = `<div style="text-align:center;"><b>${this.point.percentage.toFixed(
              1
            )}%</b> (${this.point.y} PXN)</div>`;
            if (
              this.point.custom &&
              this.point.custom.labsList &&
              this.point.custom.labsList.length > 0
            ) {
              text += formatLabList(this.point.custom.labsList);
            }
            return text;
          },
        },
        plotOptions: {
          pie: {
            dataLabels: {
              enabled: true,
              distance: 20, // 👉 BÍ QUYẾT 1: Đổi thành số dương để đẩy chữ ra ngoài
              style: {
                fontWeight: '600',
                color: GRAY_DARK,
                textOutline: 'none',
                fontSize: '12px',
              },
              connectorColor: GRAY_MED, // Thêm đường kẻ nối mảnh
              format: '<b>{point.name}</b>',
            },
            startAngle: -90,
            endAngle: 90,
            center: ['50%', '75%'],
            size: '90%', // 👉 BÍ QUYẾT 2: Thu nhỏ vòng cung lại 1 chút để có không gian cho chữ bên ngoài
            innerSize: '55%',
          },
        },
        series: [
          {
            data: [
              { name: 'Đầy đủ', y: fullContact, color: TEAL },
              // Bỏ đi thuộc tính ép màu chữ riêng vì giờ chữ đã nằm ngoài nền trắng
              {
                name: 'Chưa đủ',
                y: missingContactLabs.length,
                color: '#94a5b8',
                custom: { labsList: missingContactLabs },
              },
            ],
          },
        ],
      });

      // ----------------------------------------------------------------------
      // CHART 6: Phân tích Dữ liệu hổng - ĐÃ BỔ SUNG DANH SÁCH LAB
      // ----------------------------------------------------------------------
      let missingNameLabs = [],
        missingPhoneLabs = [],
        missingEmailLabs = [];

      L.forEach((l) => {
        const labName = l.name || 'PXN chưa cập nhật tên';
        if (!isValidContact(l.head_name)) missingNameLabs.push(labName);
        if (!isValidContact(l.head_phone)) missingPhoneLabs.push(labName);
        if (!isValidContact(l.head_email)) missingEmailLabs.push(labName);
      });

      Highcharts.chart('chart-category', {
        chart: {
          type: 'bar',
          backgroundColor: 'transparent',
          height: 280,
          style: { fontFamily: "'Inter', 'Lexend', sans-serif" },
        },
        title: {
          text: ' Thông tin Đầu mối liên hệ còn thiếu',
          style: { fontSize: '15px', fontWeight: '700', color: GRAY_DARK },
        },
        xAxis: {
          categories: ['Họ tên', 'Số Điện thoại', 'Email'],
          labels: {
            style: { fontSize: '12px', color: GRAY_DARK, fontWeight: '600' },
          },
        },
        yAxis: {
          min: 0,
          title: { text: '' },
          allowDecimals: false,
          labels: { style: { color: GRAY_DARK } },
        },
        legend: { enabled: false },
        tooltip: {
          useHTML: true,
          backgroundColor: BG_TOOLTIP,
          style: { color: WHITE, width: '220px' },
          borderWidth: 0,
          borderRadius: 8,
          formatter: function () {
            let text = `<b>${this.point.y}</b> PXN`;
            if (
              this.point.custom &&
              this.point.custom.labsList &&
              this.point.custom.labsList.length > 0
            ) {
              text += formatLabList(this.point.custom.labsList);
            }
            return text;
          },
        },
        plotOptions: {
          bar: {
            borderRadius: 3,
            color: ORANGE,
            dataLabels: {
              enabled: true,
              color: GRAY_DARK,
              style: {
                textOutline: 'none',
                fontWeight: 'bold',
                fontSize: '13px',
              },
            },
          },
        },
        series: [
          {
            name: 'PXN',
            data: [
              {
                y: missingNameLabs.length,
                custom: { labsList: missingNameLabs },
              },
              {
                y: missingPhoneLabs.length,
                custom: { labsList: missingPhoneLabs },
              },
              {
                y: missingEmailLabs.length,
                custom: { labsList: missingEmailLabs },
              },
            ],
          },
        ],
      });
    } catch (e) {
      console.warn('[lab-admin] Lỗi vẽ biểu đồ:', e.message);
    }
  }

  // ==========================================================================
  // MODAL THÊM / SỬA PXN (có bản đồ chọn tọa độ)
  // ==========================================================================
  window.openLabModal = async function (labId) {
    _editingLabId = labId || null;
    let lab = {
      name: '',
      address: '',
      phone: '',
      lat: '',
      lng: '',
      level: 'Bệnh viện công lập',
      bsl_level: 2,
      is_active: true,
      head_name: '',
      head_phone: '',
      head_email: '',
      qsm_level: 0,
      qsm_label: '',
      iso15189_scope: '',
      total_biosafety_staff: '',
      dedicated_staff: '',
      does_microbiology: true,
      external_qa: false,
      external_qa_detail: '',
      interlab: false,
      interlab_detail: '',
      reports_positive: false,
      report_method: '',
      periodic_report: false,
      periodic_report_detail: '',
      capacity_needs: '',
      telegram_chat_id: '',
    };

    if (labId) {
      try {
        const { data, error } = await window.supabaseClient
          .from('laboratories')
          .select('*')
          .eq('id', labId)
          .single();
        if (error) throw error;
        lab = data;
      } catch (e) {
        if (window.showToast)
          window.showToast('Lỗi tải Phòng Xét nghiệm: ' + e.message, 'error');
        return;
      }
    }

    const bslOptions = [1, 2, 3, 4]
      .map(
        (n) =>
          `<option value="${n}" ${
            lab.bsl_level == n ? 'selected' : ''
          }>BSL-${n}</option>`
      )
      .join('');
    const levelOptions = ORG_MODELS.map(
      (m) =>
        `<option value="${esc(m)}" ${lab.level === m ? 'selected' : ''}>${esc(
          m
        )}</option>`
    ).join('');
    const qsmOptions = QSM_OPTIONS.map(
      (q) =>
        `<option value="${q.level}" data-label="${esc(q.label)}" ${
          (lab.qsm_level ?? 0) === q.level ? 'selected' : ''
        }>${esc(q.text)}</option>`
    ).join('');

    // Dựng modal (tạo mới mỗi lần mở để tránh state cũ)
    document.getElementById('lab-modal-wrapper')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'lab-modal-wrapper';
    wrap.innerHTML = `
      <div class="modal fade" id="labFormModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header" style="background:#006a75;color:#fff;">
              <h5 class="modal-title">
                <i class='bx bxs-flask'></i> ${
                  labId ? 'Sửa' : 'Thêm'
                } Phòng xét nghiệm
              </h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-md-8">
                  <label class="form-label">Tên Phòng Xét nghiệm <span class="text-danger">*</span></label>
                  <input id="lab-name" class="form-control" value="${esc(
                    lab.name
                  )}" placeholder="Trung tâm Kiểm soát bệnh tật TP.HCM">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Điện thoại</label>
                  <input id="lab-phone" class="form-control" value="${esc(
                    lab.phone || ''
                  )}" placeholder="028...">
                </div>
                <div class="col-12">
                  <label class="form-label">Địa chỉ</label>
                  <input id="lab-address" class="form-control" value="${esc(
                    lab.address || ''
                  )}" placeholder="Số nhà, đường, phường, quận...">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Mô hình cơ quan</label>
                  <select id="lab-level" class="form-select">${levelOptions}</select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">
                    Cấp an toàn sinh học
                    <i class='bx bx-info-circle' title="Cấp BSL cao nhất Phòng Xét nghiệm đạt được. Dùng để chặn điều phối mẫu tác nhân nguy hiểm tới Phòng Xét nghiệm không đủ cấp."></i>
                  </label>
                  <select id="lab-bsl" class="form-select">${bslOptions}</select>
                </div>

                <div class="col-12"><hr class="my-1"></div>
                <div class="col-12">
                <label class="form-label mb-1">Tọa độ <span class="text-danger">*</span></label>
                <div class="input-group input-group-sm mb-2">
                  <input id="lab-address-search" class="form-control" placeholder="Nhập địa chỉ để tìm tọa độ, VD: 366A Âu Dương Lân, phường Chánh Hưng, TP.HCM">
                  <button class="btn btn-outline-primary" type="button" onclick="window._labGeocodeAddress()">
                    <i class='bx bx-search'></i> Tìm tọa độ
                  </button>
                </div>
                <div id="lab-geocode-hint" class="mb-2"></div>
                <div class="row g-2">
                  <div class="col-md-4">
                    <input id="lab-lat" class="form-control" value="${
                      lab.lat ?? ''
                    }" placeholder="Vĩ độ (lat)" oninput="window._updateLabMarkerFromInput()">
                  </div>
                  <div class="col-md-4">
                    <input id="lab-lng" class="form-control" value="${
                      lab.lng ?? ''
                    }" placeholder="Kinh độ (lng)" oninput="window._updateLabMarkerFromInput()">
                  </div>
                  <div class="col-md-4">
                    <button class="btn btn-outline-secondary w-100" onclick="window._locateLabToDevice()">
                      <i class='bx bx-current-location'></i> Vị trí của tôi
                    </button>
                  </div>
                </div>
                <small class="text-muted">Nhập địa chỉ, nhập tay, hoặc bấm trực tiếp lên bản đồ để đặt điểm.</small>
                  <div id="lab-picker-map" style="height:300px;border-radius:8px;margin-top:8px;background:#eee;"></div>
                </div>

                <div class="col-12"><hr class="my-1"><h6 class="text-primary mb-0"><i class='bx bx-phone'></i> Đầu mối liên hệ & Kênh thông báo (Telegram & Email)</h6></div>
                
                <!-- TRẠNG THÁI TELEGRAM CHAT ID (HIỂN THỊ TĨNH / READ-ONLY) -->
                <div class="col-12">
                  <div class="p-2 rounded bg-light border d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div>
                      <small class="text-muted d-block">Trạng thái kết nối HCDC-RRT:</small>
                      ${
                        lab.telegram_chat_id
                          ? `<span class="badge bg-success">
                              <i class='bx bx-check-circle'></i> Đã kết nối (Chat ID: <code>${esc(
                                lab.telegram_chat_id
                              )}</code>)
                             </span>`
                          : `<span class="badge bg-secondary">
                              <i class='bx bx-time'></i> Chưa kết nối Telegram
                             </span>`
                      }
                    </div>
                    <div>
                      ${
                        lab.head_phone
                          ? `<small class="text-danger d-block">
                              <i class='bx bx-telegram'></i>
                              Tìm kiếm <strong>@rrt_alert_bot</strong> nhập: <code class="user-select-all bg-white px-2 py-1 border rounded">/start LAB_${lab.head_phone}</code>
                            </small>`
                          : `<small class="text-muted fst-italic">
                              <i class='bx bx-info-circle'></i>
                              Lưu phòng xét nghiệm để kết nối HCDC-RRT.
                            </small>`
                      }
                    </div>
                  </div>
                </div>

                <div class="col-md-4">
                  <label class="form-label">Họ tên đầu mối</label>
                  <input id="lab-head-name" class="form-control" value="${esc(
                    lab.head_name || ''
                  )}" placeholder="Trưởng khoa XN">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Điện thoại đầu mối</label>
                  <input id="lab-head-phone" class="form-control" value="${esc(
                    lab.head_phone || ''
                  )}" placeholder="09...">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Email đầu mối</label>
                  <input id="lab-head-email" class="form-control" value="${esc(
                    lab.head_email || ''
                  )}" placeholder="email@...">
                </div>

                <div class="col-12"><hr class="my-1"><h6 class="text-primary mb-0"><i class='bx bx-award'></i> Chất lượng (QMS) & Nhân sự</h6></div>
                <div class="col-md-5">
                  <label class="form-label">Mức chất lượng (QMS)</label>
                  <select id="lab-qsm" class="form-select">${qsmOptions}</select>
                </div>
                <div class="col-md-7">
                  <label class="form-label">Lĩnh vực ISO 15189 công nhận</label>
                  <input id="lab-iso-scope" class="form-control" value="${esc(
                    lab.iso15189_scope || ''
                  )}" placeholder="VS, SHPT...">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Tổng nhân sự có chứng chỉ ATSH</label>
                  <input id="lab-staff-total" type="number" min="0" class="form-control" value="${
                    lab.total_biosafety_staff ?? ''
                  }">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Nhân sự chuyên trách vi sinh/SHPT</label>
                  <input id="lab-staff-dedicated" type="number" min="0" class="form-control" value="${
                    lab.dedicated_staff ?? ''
                  }">
                </div>

                <div class="col-12"><hr class="my-1"><h6 class="text-primary mb-0"><i class='bx bx-check-shield'></i> Ngoại kiểm & Báo cáo theo quy định</h6></div>
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="lab-external-qa" ${
                      lab.external_qa ? 'checked' : ''
                    }>
                    <label class="form-check-label" for="lab-external-qa">Tham gia ngoại kiểm</label>
                  </div>
                  <input id="lab-external-qa-detail" class="form-control form-control-sm mt-1" value="${esc(
                    lab.external_qa_detail || ''
                  )}" placeholder="Chi tiết ngoại kiểm...">
                </div>
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="lab-interlab" ${
                      lab.interlab ? 'checked' : ''
                    }>
                    <label class="form-check-label" for="lab-interlab">So sánh liên phòng</label>
                  </div>
                  <input id="lab-interlab-detail" class="form-control form-control-sm mt-1" value="${esc(
                    lab.interlab_detail || ''
                  )}" placeholder="Chi tiết liên phòng...">
                </div>
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="lab-reports-positive" ${
                      lab.reports_positive ? 'checked' : ''
                    }>
                    <label class="form-check-label" for="lab-reports-positive">Báo cáo ca (+) theo quy định</label>
                  </div>
                  <input id="lab-report-method" class="form-control form-control-sm mt-1" value="${esc(
                    lab.report_method || ''
                  )}" placeholder="Phương thức báo cáo...">
                </div>
                <div class="col-md-6">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="lab-periodic-report" ${
                      lab.periodic_report ? 'checked' : ''
                    }>
                    <label class="form-check-label" for="lab-periodic-report">Báo cáo định kỳ</label>
                  </div>
                  <input id="lab-periodic-detail" class="form-control form-control-sm mt-1" value="${esc(
                    lab.periodic_report_detail || ''
                  )}" placeholder="Chi tiết báo cáo định kỳ...">
                </div>
                <div class="col-12">
                  <label class="form-label">Nhu cầu nâng cao năng lực</label>
                  <textarea id="lab-capacity-needs" class="form-control" rows="2" placeholder="Nhu cầu đào tạo, thiết bị...">${esc(
                    lab.capacity_needs || ''
                  )}</textarea>
                </div>

                <div class="col-12">
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="lab-active" ${
                      lab.is_active ? 'checked' : ''
                    }>
                    <label class="form-check-label" for="lab-active">Phòng Xét nghiệm đang hoạt động (nhận điều phối mẫu)</label>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" data-bs-dismiss="modal">Hủy</button>
              <button class="btn btn-primary" onclick="window.saveLab()">
                <i class='bx bx-save'></i> Lưu
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const modalEl = document.getElementById('labFormModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Khởi tạo bản đồ sau khi modal hiển thị xong (Leaflet cần kích thước thật)
    modalEl.addEventListener(
      'shown.bs.modal',
      function () {
        initLabPickerMap(lab.lat, lab.lng);
      },
      { once: true }
    );
  };

  function initLabPickerMap(lat, lng) {
    if (typeof L === 'undefined') {
      document.getElementById('lab-picker-map').innerHTML =
        '<div class="alert alert-warning m-2">Không nạp được thư viện bản đồ (Leaflet).</div>';
      return;
    }
    const hasCoord = lat != null && lng != null && lat !== '' && lng !== '';
    const center = hasCoord
      ? [parseFloat(lat), parseFloat(lng)]
      : [10.7769, 106.7009]; // mặc định TP.HCM

    _labMap = L.map('lab-picker-map').setView(center, hasCoord ? 15 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(_labMap);

    if (hasCoord) placeLabMarker(center[0], center[1]);

    // Bấm lên map → đặt điểm + điền vào ô nhập
    _labMap.on('click', function (e) {
      placeLabMarker(e.latlng.lat, e.latlng.lng);
      document.getElementById('lab-lat').value = e.latlng.lat.toFixed(6);
      document.getElementById('lab-lng').value = e.latlng.lng.toFixed(6);
    });

    setTimeout(() => _labMap.invalidateSize(), 200);
  }

  function placeLabMarker(lat, lng) {
    if (!_labMap) return;
    if (_labMarker) _labMarker.setLatLng([lat, lng]);
    else _labMarker = L.marker([lat, lng], { draggable: true }).addTo(_labMap);
    // Kéo marker → cập nhật ô nhập
    _labMarker.off('dragend').on('dragend', function (e) {
      const p = e.target.getLatLng();
      document.getElementById('lab-lat').value = p.lat.toFixed(6);
      document.getElementById('lab-lng').value = p.lng.toFixed(6);
    });
  }

  // Nhập tay lat/lng → di chuyển marker theo
  window._updateLabMarkerFromInput = function () {
    const lat = parseFloat(document.getElementById('lab-lat').value);
    const lng = parseFloat(document.getElementById('lab-lng').value);
    if (!isNaN(lat) && !isNaN(lng) && _labMap) {
      placeLabMarker(lat, lng);
      _labMap.setView([lat, lng], Math.max(_labMap.getZoom(), 14));
    }
  };
  // Tìm tọa độ từ địa chỉ (Nominatim) cho form Thêm PXN
  window._labGeocodeAddress = async function () {
    const q = document.getElementById('lab-address-search')?.value.trim();
    const hint = document.getElementById('lab-geocode-hint');
    if (!q) {
      if (window.showToast) window.showToast('Nhập địa chỉ cần tìm', 'warning');
      return;
    }
    hint.innerHTML =
      '<small class="text-muted"><span class="spinner-border spinner-border-sm"></span> Đang tìm...</small>';
    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=vn&q=' +
        encodeURIComponent(q);
      const res = await fetch(url, { headers: { 'Accept-Language': 'vi' } });
      const data = await res.json();
      if (!data || data.length === 0) {
        hint.innerHTML =
          '<small class="text-danger">Không tìm thấy. Thử thêm quận, thành phố.</small>';
        return;
      }
      if (data.length === 1) {
        _labApplyGeocode(data[0]);
      } else {
        window._labGeocodeResults = data;
        hint.innerHTML = `<div class="list-group" style="max-height:150px;overflow:auto;">
        <small class="text-muted px-2 py-1">Chọn địa điểm đúng:</small>
        ${data
          .map(
            (
              d,
              i
            ) => `<a href="#" class="list-group-item list-group-item-action py-1"
            onclick='window._labPickGeocode(${i});return false;'><small>${esc(
              d.display_name
            )}</small></a>`
          )
          .join('')}
      </div>`;
      }
    } catch (e) {
      hint.innerHTML =
        '<small class="text-danger">Lỗi tìm: ' + esc(e.message) + '</small>';
    }
  };
  window._labPickGeocode = function (i) {
    const d = window._labGeocodeResults?.[i];
    if (d) _labApplyGeocode(d);
  };
  function _labApplyGeocode(d) {
    const lat = parseFloat(d.lat),
      lng = parseFloat(d.lon);
    document.getElementById('lab-lat').value = lat.toFixed(6);
    document.getElementById('lab-lng').value = lng.toFixed(6);
    document.getElementById(
      'lab-geocode-hint'
    ).innerHTML = `<small class="text-success"><i class='bx bx-check-circle'></i> ${esc(
      d.display_name
    )}</small>`;
    // Di chuyển marker + bản đồ theo tọa độ vừa tìm
    if (typeof window._updateLabMarkerFromInput === 'function')
      window._updateLabMarkerFromInput();
  }
  // Lấy vị trí thiết bị
  window._locateLabToDevice = function () {
    if (!navigator.geolocation) {
      if (window.showToast)
        window.showToast('Trình duyệt không hỗ trợ định vị', 'warning');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        document.getElementById('lab-lat').value = latitude.toFixed(6);
        document.getElementById('lab-lng').value = longitude.toFixed(6);
        placeLabMarker(latitude, longitude);
        if (_labMap) _labMap.setView([latitude, longitude], 15);
      },
      (err) => {
        if (window.showToast)
          window.showToast('Không lấy được vị trí: ' + err.message, 'warning');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // ==========================================================================
  // LƯU PXN
  // ==========================================================================
  window.saveLab = async function () {
    const name = document.getElementById('lab-name').value.trim();
    const lat = parseFloat(document.getElementById('lab-lat').value);
    const lng = parseFloat(document.getElementById('lab-lng').value);

    if (!name) {
      if (window.showToast)
        window.showToast('Vui lòng nhập tên Phòng Xét nghiệm', 'warning');
      return;
    }
    if (isNaN(lat) || isNaN(lng)) {
      if (window.showToast)
        window.showToast(
          'Vui lòng đặt tọa độ (nhập tay hoặc chọn trên bản đồ)',
          'warning'
        );
      return;
    }

    const qsmSel = document.getElementById('lab-qsm');
    const qsmLevel = qsmSel ? parseInt(qsmSel.value) || 0 : 0;
    const qsmLabel =
      qsmSel?.options[qsmSel.selectedIndex]?.getAttribute('data-label') || null;

    const numOrNull = (id) => {
      const v = document.getElementById(id)?.value;
      return v !== '' && v != null ? parseInt(v) : null;
    };
    const strOrNull = (id) => {
      const v = document.getElementById(id)?.value?.trim();
      return v || null;
    };

    const payload = {
      name,
      address: document.getElementById('lab-address').value.trim() || null,
      phone: document.getElementById('lab-phone').value.trim() || null,
      lat,
      lng,
      level: document.getElementById('lab-level').value,
      bsl_level: parseInt(document.getElementById('lab-bsl').value),
      is_active: document.getElementById('lab-active').checked,
      // Đầu mối liên hệ
      head_name: strOrNull('lab-head-name'),
      head_phone: strOrNull('lab-head-phone'),
      head_email: strOrNull('lab-head-email'),
      // QMS (level + label → trigger tự tính lại capability_tier)
      qsm_level: qsmLevel,
      qsm_label: qsmLabel,
      iso15189_scope: strOrNull('lab-iso-scope'),
      // Nhân sự
      total_biosafety_staff: numOrNull('lab-staff-total'),
      dedicated_staff: numOrNull('lab-staff-dedicated'),
      // Ngoại kiểm / liên phòng
      external_qa: document.getElementById('lab-external-qa')?.checked || false,
      external_qa_detail: strOrNull('lab-external-qa-detail'),
      interlab: document.getElementById('lab-interlab')?.checked || false,
      interlab_detail: strOrNull('lab-interlab-detail'),
      // Báo cáo TT54
      reports_positive:
        document.getElementById('lab-reports-positive')?.checked || false,
      report_method: strOrNull('lab-report-method'),
      periodic_report:
        document.getElementById('lab-periodic-report')?.checked || false,
      periodic_report_detail: strOrNull('lab-periodic-detail'),
      // Nhu cầu
      capacity_needs: strOrNull('lab-capacity-needs'),
      telegram_chat_id: strOrNull('lab-tg-chatid'),
    };

    try {
      let error;
      if (_editingLabId) {
        ({ error } = await window.supabaseClient
          .from('laboratories')
          .update(payload)
          .eq('id', _editingLabId));
      } else {
        ({ error } = await window.supabaseClient
          .from('laboratories')
          .insert([payload]));
      }
      if (error) throw error;

      bootstrap.Modal.getInstance(
        document.getElementById('labFormModal')
      )?.hide();
      if (window.showToast)
        window.showToast(
          _editingLabId
            ? 'Đã cập nhật Phòng Xét nghiệm'
            : 'Đã thêm Phòng Xét nghiệm',
          'success'
        );
      await renderLabList();
    } catch (e) {
      console.error('[lab-admin] Lỗi lưu Phòng Xét nghiệm:', e);
      if (window.showToast) window.showToast('Lỗi lưu: ' + e.message, 'error');
    }
  };

  // ==========================================================================
  // XÓA PXN
  // ==========================================================================
  window.deleteLab = async function (labId, labName) {
    if (
      !confirm(
        `Xóa Phòng Xét nghiệm "${labName}"?\n\nToàn bộ năng lực xét nghiệm đã gán cũng sẽ bị xóa. Nhật ký điều phối mẫu cũ được giữ lại.`
      )
    )
      return;
    try {
      const { error } = await window.supabaseClient
        .from('laboratories')
        .delete()
        .eq('id', labId);
      if (error) throw error;
      if (window.showToast)
        window.showToast('Đã xóa Phòng Xét nghiệm', 'success');
      await renderLabList();
    } catch (e) {
      if (window.showToast) window.showToast('Lỗi xóa: ' + e.message, 'error');
    }
  };

  // ==========================================================================
  // MODAL QUẢN LÝ NĂNG LỰC (loại XN + công suất + thời gian trả KQ) CHO 1 PXN
  // ==========================================================================
  window.openCapabilityModal = async function (labId) {
    let lab, caps;
    try {
      const [labRes, capRes] = await Promise.all([
        window.supabaseClient
          .from('laboratories')
          .select('name,bsl_level')
          .eq('id', labId)
          .single(),
        window.supabaseClient
          .from('lab_capabilities')
          .select('*, test_types(name, required_bsl)')
          .eq('lab_id', labId),
      ]);
      if (labRes.error) throw labRes.error;
      lab = labRes.data;
      caps = capRes.data || [];
    } catch (e) {
      if (window.showToast)
        window.showToast('Lỗi tải năng lực: ' + e.message, 'error');
      return;
    }

    // Loại XN chưa được gán cho PXN này (để thêm mới)
    const usedIds = new Set(caps.map((c) => c.test_type_id));
    const available = _testTypesCache.filter((t) => !usedIds.has(t.id));

    // Cảnh báo nếu năng lực đòi BSL cao hơn cấp của PXN (dữ liệu mâu thuẫn)
    const capRows = caps
      .map((c) => {
        return `
        <tr>
          <td>
            ${esc(c.test_types?.name || '(không rõ)')}
          </td>
          <td class="text-center">${c.max_capacity_per_day} mẫu/ngày</td>
          <td class="text-center">${
            c.turnaround_hours != null ? c.turnaround_hours + 'h' : '—'
          }</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-danger" onclick="window.removeCapability('${
              c.id
            }','${labId}')">
              <i class='bx bx-trash'></i>
            </button>
          </td>
        </tr>`;
      })
      .join('');

    const addOptions = available
      .map((t) => `<option value="${t.id}">${esc(t.name)}</option>`)
      .join('');

    document.getElementById('cap-modal-wrapper')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'cap-modal-wrapper';
    wrap.innerHTML = `
      <div class="modal fade" id="capModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header" style="background:#006a75;color:#fff;">
              <h5 class="modal-title"><i class='bx bx-list-plus'></i> Năng lực: ${esc(
                lab.name
              )}
                <span class="badge bg-light text-dark ms-2">BSL-${
                  lab.bsl_level
                }</span>
              </h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <table class="table table-sm align-middle">
                <thead class="table-light">
                  <tr><th>Loại xét nghiệm</th><th class="text-center">Công suất/ngày</th><th class="text-center">Trả Kết quả</th><th></th></tr>
                </thead>
                <tbody>${
                  capRows ||
                  '<tr><td colspan="4" class="text-center text-muted py-3">Chưa gán năng lực nào.</td></tr>'
                }</tbody>
              </table>
              <hr>
              <h6 class="mb-2"><i class='bx bx-plus-circle'></i> Thêm năng lực</h6>
              ${
                available.length === 0
                  ? '<div class="text-muted">Đã gán hết các loại xét nghiệm trong danh mục.</div>'
                  : `<div class="row g-2 align-items-end">
                    <div class="col-md-5">
                      <label class="form-label">Loại xét nghiệm</label>
                      <select id="cap-testtype" class="form-select">${addOptions}</select>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label">Công suất/ngày</label>
                      <input id="cap-capacity" type="number" min="0" class="form-control" value="50">
                    </div>
                    <div class="col-md-2">
                      <label class="form-label">Trả Kết quả (giờ)</label>
                      <input id="cap-turnaround" type="number" min="0" class="form-control" value="24">
                    </div>
                    <div class="col-md-2">
                      <button class="btn btn-primary w-100" onclick="window.addCapability('${labId}', ${lab.bsl_level})">
                        <i class='bx bx-plus'></i> Thêm
                      </button>
                    </div>
                  </div>`
              }
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    new bootstrap.Modal(document.getElementById('capModal')).show();
  };

  window.addCapability = async function (labId, labBsl) {
    const sel = document.getElementById('cap-testtype');
    const testTypeId = sel.value;
    const capacity =
      parseInt(document.getElementById('cap-capacity').value) || 0;
    const turnaround = document.getElementById('cap-turnaround').value;
    // Kỹ thuật KHÔNG gắn BSL. BSL do chuyên gia chọn khi điều phối (theo tác nhân),
    // lọc cứng theo bsl_level của PXN tại thời điểm điều phối.

    try {
      const { error } = await window.supabaseClient
        .from('lab_capabilities')
        .insert([
          {
            lab_id: labId,
            test_type_id: testTypeId,
            max_capacity_per_day: capacity,
            turnaround_hours: turnaround === '' ? null : parseInt(turnaround),
          },
        ]);
      if (error) throw error;
      if (window.showToast) window.showToast('Đã thêm năng lực', 'success');
      window.openCapabilityModal(labId); // reload modal
      renderLabList(); // cập nhật số đếm ở bảng chính
    } catch (e) {
      if (window.showToast)
        window.showToast('Lỗi thêm năng lực: ' + e.message, 'error');
    }
  };

  window.removeCapability = async function (capId, labId) {
    if (!confirm('Xóa năng lực này khỏi Phòng Xét nghiệm?')) return;
    try {
      const { error } = await window.supabaseClient
        .from('lab_capabilities')
        .delete()
        .eq('id', capId);
      if (error) throw error;
      window.openCapabilityModal(labId);
      renderLabList();
    } catch (e) {
      if (window.showToast) window.showToast('Lỗi xóa: ' + e.message, 'error');
    }
  };

  // ==========================================================================
  // MODAL DANH MỤC LOẠI XÉT NGHIỆM (thêm loại + đặt required_bsl)
  // ==========================================================================
  window.openTestTypeModal = async function () {
    await loadTestTypes();

    // Sắp xếp theo cột + chiều đang chọn (_ttSort)
    const _dir = _ttSort.dir === 'asc' ? 1 : -1;
    const _sorted = [..._testTypesCache].sort((a, b) => {
      let va = a[_ttSort.col],
        vb = b[_ttSort.col];
      // cột chữ (name, category) — so sánh tiếng Việt
      return String(va ?? '').localeCompare(String(vb ?? ''), 'vi') * _dir;
    });

    const rows = _sorted
      .map(
        (t) => `
      <tr>
        <td>${esc(t.name)}</td>
        <td>${esc(t.category || '—')}</td>
      </tr>`
      )
      .join('');

    document.getElementById('tt-modal-wrapper')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'tt-modal-wrapper';
    wrap.innerHTML = `
      <div class="modal fade" id="ttModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header" style="background:#006a75;color:#fff;">
              <h5 class="modal-title"><i class='bx bx-list-ul'></i> Danh mục loại xét nghiệm</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="alert alert-info py-2">
                <small><i class='bx bx-info-circle'></i> Khi thực hiện điều phối mẫu, chuyên gia dịch tễ và chuyên gia phòng xét nghiệm sẽ quyết định chọn cấp an toàn sinh học phù hợp với tác nhân.</small>
              </div>
              <table class="table table-sm align-middle">
              <thead class="table-light"><tr>
              <th style="cursor:pointer;" onclick="window.sortTestTypes('name')">
                Tên loại Xét nghiệm ${_ttArrow('name')}
              </th>
              <th style="cursor:pointer;" onclick="window.sortTestTypes('category')">
                Nhóm ${_ttArrow('category')}
              </th>
            </tr></thead>
                <tbody>${
                  rows ||
                  '<tr><td colspan="2" class="text-center text-muted">Chưa có loại kỹ thuật xét nghiệm.</td></tr>'
                }</tbody>
              </table>
              <hr>
              <h6 class="mb-2"><i class='bx bx-plus-circle'></i> Thêm loại kỹ thuật xét nghiệm</h6>
              <div class="row g-2 align-items-end">
                <div class="col-md-5">
                  <label class="form-label">Tên loại xét nghiệm</label>
                  <input id="tt-name" class="form-control" placeholder="VD: Huyết học">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Nhóm</label>
                  <select id="tt-category" class="form-select">
                    <option value="basic">basic (cơ bản)</option>
                    <option value="culture">culture (nuôi cấy/miễn dịch)</option>
                    <option value="molecular">molecular (SHPT/PCR)</option>
                    <option value="advanced">advanced (giải trình tự/virus)</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <button class="btn btn-primary w-100" onclick="window.addTestType()"><i class='bx bx-plus'></i> Thêm</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    new bootstrap.Modal(document.getElementById('ttModal')).show();
  };

  // Mũi tên chỉ chiều sắp xếp trên cột đang active
  function _ttArrow(col) {
    if (_ttSort.col !== col)
      return '<i class="bx bx-sort-alt-2" style="opacity:.3;"></i>';
    return _ttSort.dir === 'asc'
      ? '<i class="bx bx-up-arrow-alt"></i>'
      : '<i class="bx bx-down-arrow-alt"></i>';
  }

  // Bấm tiêu đề cột → đổi cột/chiều rồi vẽ lại bảng
  window.sortTestTypes = function (col) {
    if (_ttSort.col === col) {
      _ttSort.dir = _ttSort.dir === 'asc' ? 'desc' : 'asc'; // cùng cột → đảo chiều
    } else {
      _ttSort.col = col;
      _ttSort.dir = 'asc'; // cột mới → tăng dần
    }
    window.openTestTypeModal(); // vẽ lại modal với thứ tự mới
  };
  window.addTestType = async function () {
    const name = document.getElementById('tt-name').value.trim();
    if (!name) {
      if (window.showToast)
        window.showToast('Nhập tên loại xét nghiệm', 'warning');
      return;
    }
    try {
      const { error } = await window.supabaseClient.from('test_types').insert([
        {
          name,
          category: document.getElementById('tt-category').value.trim() || null,
          // required_bsl bỏ — kỹ thuật không gắn BSL (BSL do chuyên gia chọn khi điều phối)
        },
      ]);
      if (error) throw error;
      if (window.showToast)
        window.showToast('Đã thêm loại xét nghiệm', 'success');
      window.openTestTypeModal(); // reload
    } catch (e) {
      const msg = e.message?.includes('duplicate')
        ? 'Loại xét nghiệm này đã tồn tại.'
        : e.message;
      if (window.showToast) window.showToast('Lỗi: ' + msg, 'error');
    }
  };

  // Mở lịch sử điều phối mẫu (không tham số = xem tất cả sự cố).
  // ==========================================================================
  // MODAL DANH MỤC TÁC NHÂN GÂY BỆNH (Thêm / Xóa)
  // ==========================================================================
  async function loadPathogensAdmin() {
    try {
      const { data, error } = await window.supabaseClient
        .from('pathogens')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      _pathogensCacheAdmin = data || [];
    } catch (e) {
      console.error('[lab-admin] Lỗi tải danh mục tác nhân:', e);
      _pathogensCacheAdmin = [];
    }
  }

  window.openPathogenModal = async function () {
    await loadPathogensAdmin();

    // Sắp xếp
    const _dir = _pSort.dir === 'asc' ? 1 : -1;
    const _sorted = [..._pathogensCacheAdmin].sort((a, b) => {
      let va = a[_pSort.col],
        vb = b[_pSort.col];
      return String(va ?? '').localeCompare(String(vb ?? ''), 'vi') * _dir;
    });

    const rows = _sorted
      .map(
        (p) => `
      <tr>
        <td>${esc(p.name)}</td>
        <td>
          <span class="badge ${
            p.category === 'Nhóm A'
              ? 'bg-danger'
              : p.category === 'Nhóm B'
              ? 'bg-warning text-dark'
              : 'bg-secondary'
          }">
            ${esc(p.category || 'Khác')}
          </span>
        </td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-danger" onclick="window.deletePathogen('${
            p.id
          }', '${esc(p.name).replace(/'/g, "\\'")}')" title="Xóa">
            <i class='bx bx-trash'></i>
          </button>
        </td>
      </tr>`
      )
      .join('');

    const arrow = (col) =>
      _pSort.col !== col
        ? '<i class="bx bx-sort-alt-2" style="opacity:.3;"></i>'
        : _pSort.dir === 'asc'
        ? '<i class="bx bx-up-arrow-alt"></i>'
        : '<i class="bx bx-down-arrow-alt"></i>';

    document.getElementById('pathogen-modal-wrapper')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'pathogen-modal-wrapper';
    wrap.innerHTML = `
      <div class="modal fade" id="pathogenModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header" style="background:#006a75;color:#fff;">
              <h5 class="modal-title"><i class='bx bx-bug'></i> Danh mục Tác nhân gây bệnh</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <table class="table table-sm align-middle">
                <thead class="table-light"><tr>
                  <th style="cursor:pointer;" onclick="window.sortPathogens('name')">Tên Tác nhân gây bệnh ${arrow(
                    'name'
                  )}</th>
                  <th style="cursor:pointer;" onclick="window.sortPathogens('category')">Phân loại Nhóm ${arrow(
                    'category'
                  )}</th>
                  <th class="text-center">Xóa</th>
                </tr></thead>
                <tbody>${
                  rows ||
                  '<tr><td colspan="3" class="text-center text-muted">Chưa có dữ liệu tác nhân.</td></tr>'
                }</tbody>
              </table>
              <hr>
              <h6 class="mb-2"><i class='bx bx-plus-circle'></i> Thêm Tác nhân mới</h6>
              <div class="row g-2 align-items-end">
                <div class="col-md-5">
                  <label class="form-label">Tên tác nhân</label>
                  <input id="p-name" class="form-control" placeholder="VD: Bệnh do vi rút Marburg">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Phân nhóm (A, B, Khác)</label>
                  <select id="p-category" class="form-select">
                    <option value="Nhóm A">Bệnh truyền nhiễm Nhóm A</option>
                    <option value="Nhóm B" selected>Bệnh truyền nhiễm Nhóm B</option>
                    <option value="Khác">Nhóm Khác</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <button class="btn btn-primary w-100" onclick="window.addPathogen()"><i class='bx bx-plus'></i> Thêm</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    new bootstrap.Modal(document.getElementById('pathogenModal')).show();
  };

  window.sortPathogens = function (col) {
    if (_pSort.col === col) _pSort.dir = _pSort.dir === 'asc' ? 'desc' : 'asc';
    else {
      _pSort.col = col;
      _pSort.dir = 'asc';
    }
    window.openPathogenModal();
  };

  window.addPathogen = async function () {
    const name = document.getElementById('p-name').value.trim();
    if (!name) {
      if (window.showToast)
        window.showToast('Vui lòng nhập tên tác nhân', 'warning');
      return;
    }
    try {
      const { error } = await window.supabaseClient.from('pathogens').insert([
        {
          name,
          category: document.getElementById('p-category').value,
        },
      ]);
      if (error) throw error;
      if (window.showToast) window.showToast('Đã thêm tác nhân', 'success');
      window.openPathogenModal(); // reload modal
    } catch (e) {
      if (window.showToast) window.showToast('Lỗi: ' + e.message, 'error');
    }
  };

  window.deletePathogen = async function (id, name) {
    if (!confirm(`Bạn có chắc muốn xóa "${name}" khỏi danh mục?`)) return;
    try {
      const { error } = await window.supabaseClient
        .from('pathogens')
        .delete()
        .eq('id', id);
      if (error) throw error;
      if (window.showToast) window.showToast('Đã xóa tác nhân', 'success');
      window.openPathogenModal(); // reload modal
    } catch (e) {
      if (window.showToast) window.showToast('Lỗi xóa: ' + e.message, 'error');
    }
  };
  // Guard: hàm showDispatchHistory nằm ở lab-dispatch-actions.js.
  window._openDispatchHistorySafe = function () {
    if (typeof window.showDispatchHistory === 'function') {
      window.showDispatchHistory(); // không tham số → xem tất cả
    } else {
      if (window.showToast)
        window.showToast(
          'Chưa nạp module điều phối (lab-dispatch-actions.js).',
          'warning'
        );
      console.warn(
        '[lab-admin] showDispatchHistory chưa tồn tại — kiểm tra đã nhúng lab-dispatch-actions.js chưa.'
      );
    }
  };

  console.log('[lab-admin.js] ✅ Module Quản lý Phòng Xét nghiệm đã sẵn sàng.');
})();
// ============================================================
// PATCH 18: showConfirm() — modal xác nhận thay cho confirm() gốc
// Trả về Promise<boolean>: true nếu bấm đồng ý, false nếu hủy.
// Dùng: if (await showConfirm({...})) { ...tiếp tục... }
// ============================================================
window.showConfirm = function (opts = {}) {
  const {
    title = 'Xác nhận',
    message = 'Bạn có chắc chắn?',
    confirmText = 'Đồng ý',
    cancelText = 'Hủy',
    variant = 'primary',
    icon = 'bx-help-circle',
  } = opts;

  return new Promise((resolve) => {
    document.getElementById('app-confirm-wrapper')?.remove();

    const headerBg =
      variant === 'danger'
        ? '#dc3545'
        : variant === 'warning'
        ? '#f0ad4e'
        : '#006a75';
    const btnClass =
      variant === 'danger'
        ? 'btn-danger'
        : variant === 'warning'
        ? 'btn-warning'
        : 'btn-primary';

    const wrap = document.createElement('div');
    wrap.id = 'app-confirm-wrapper';
    wrap.innerHTML = `
      <div class="modal fade" id="appConfirmModal" tabindex="-1" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header" style="background:${headerBg};color:#fff;">
              <h5 class="modal-title"><i class='bx ${icon}'></i> ${window.escapeHtml(
      title
    )}</h5>
            </div>
            <div class="modal-body" style="white-space:pre-line;">${window.escapeHtml(
              message
            )}</div>
            <div class="modal-footer">
              <button class="btn btn-secondary" id="app-confirm-cancel">${window.escapeHtml(
                cancelText
              )}</button>
              <button class="btn ${btnClass}" id="app-confirm-ok">${window.escapeHtml(
      confirmText
    )}</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const modalEl = document.getElementById('appConfirmModal');
    const modal = new bootstrap.Modal(modalEl);
    let settled = false;
    let result = false;

    const finish = (val) => {
      if (settled) return;
      settled = true;
      result = val;
      modal.hide(); // chỉ hide, việc dọn dẹp để 'hidden.bs.modal' lo
    };

    document.getElementById('app-confirm-ok').onclick = () => finish(true);
    document.getElementById('app-confirm-cancel').onclick = () => finish(false);

    // Khi modal đã ẩn HẲN → dọn dẹp + resolve
    modalEl.addEventListener(
      'hidden.bs.modal',
      () => {
        // Xóa DOM của modal này
        wrap.remove();

        // DỌN BACKDROP KẸT: nếu không còn modal nào đang mở, gỡ hết backdrop
        // và trả body về trạng thái bình thường.
        setTimeout(() => {
          if (!document.querySelector('.modal.show')) {
            document
              .querySelectorAll('.modal-backdrop')
              .forEach((b) => b.remove());
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
          }
        }, 150);

        resolve(result);
      },
      { once: true }
    );

    modal.show();
  });
};
/* ============================================================================
   LAB_ADMIN_PAGE_HTML — DÁN KHỐI NÀY VÀO index.html (vùng chứa các trang)
   ----------------------------------------------------------------------------
   Đặt cạnh các <div id="page-map">, <div id="page-members">... của bạn.
   Class ẩn/hiện trang (d-none / .page-section) tùy theo cơ chế chuyển trang
   của app — chỉnh cho khớp. Ví dụ dưới dùng class "page-section" + "d-none".

<div id="page-lab-admin" class="page-section d-none">
  <div class="container-fluid py-3">
    <div id="lab-admin-content">
      <!-- renderLabAdminPage() sẽ đổ nội dung vào đây -->
    </div>
  </div>
</div>

============================================================================ */
