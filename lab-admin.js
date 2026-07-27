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
  let _ttSort = { col: 'required_bsl', dir: 'desc' }; // cột + chiều sắp xếp bảng loại XN

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

  const LEVEL_LABELS = {
    trung_uong: 'Tuyến Trung ương',
    tinh_thanh: 'Tuyến Tỉnh/Thành phố',
    xa_phuong: 'Tuyến Xã/Phường',
  };

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
        rows = `<tr><td colspan="6" class="text-center text-muted py-4">
                  Chưa có phòng xét nghiệm nào. Bấm "Thêm Phòng Xét nghiệm" để bắt đầu.
                </td></tr>`;
      } else {
        labs.forEach((lab) => {
          const capCount = lab.lab_capabilities?.[0]?.count ?? 0;
          const statusBadge = lab.is_active
            ? '<span class="badge bg-success">Đang hoạt động</span>'
            : '<span class="badge bg-secondary">Tạm ngừng</span>';
          const bslBadge = `<span class="badge bg-dark">BSL-${
            lab.bsl_level ?? '?'
          }</span>`;
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
              <td>${esc(LEVEL_LABELS[lab.level] || lab.level || '—')}</td>
              <td>${bslBadge}</td>
              <td class="text-center">
                <span class="badge bg-info text-dark">${capCount} loại xét nghiệm</span>
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
              <i class='bx bx-list-ul'></i> Danh mục loại xét nghiệm
            </button>
            <button class="btn btn-primary" onclick="window.openLabModal()">
              <i class='bx bx-plus'></i> Thêm Phòng Xét nghiệm
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-hover align-middle">
            <thead class="table-light">
              <tr>
                <th>Tên & Địa chỉ</th>
                <th>Tuyến</th>
                <th>An toàn sinh học</th>
                <th class="text-center">Năng lực</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    } catch (e) {
      console.error('[lab-admin] Lỗi tải danh sách Phòng Xét nghiệm:', e);
      container.innerHTML = `<div class="alert alert-danger m-3">Lỗi tải danh sách: ${esc(
        e.message
      )}</div>`;
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
      level: 'xa_phuong',
      bsl_level: 2,
      is_active: true,
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
    const levelOptions = Object.entries(LEVEL_LABELS)
      .map(
        ([v, label]) =>
          `<option value="${v}" ${
            lab.level === v ? 'selected' : ''
          }>${label}</option>`
      )
      .join('');

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
                  <label class="form-label">Tuyến chuyên môn</label>
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

    const payload = {
      name,
      address: document.getElementById('lab-address').value.trim() || null,
      phone: document.getElementById('lab-phone').value.trim() || null,
      lat,
      lng,
      level: document.getElementById('lab-level').value,
      bsl_level: parseInt(document.getElementById('lab-bsl').value),
      is_active: document.getElementById('lab-active').checked,
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
        const reqBsl = c.test_types?.required_bsl ?? '?';
        const mismatch =
          c.test_types && c.test_types.required_bsl > lab.bsl_level;
        return `
        <tr class="${mismatch ? 'table-danger' : ''}">
          <td>
            ${esc(c.test_types?.name || '(không rõ)')}
            ${
              mismatch
                ? `<br><small class="text-danger"><i class="bx bx-error"></i> Xét nghiệm này cần BSL-${reqBsl} nhưng Phòng Xét nghiệm chỉ đạt BSL-${lab.bsl_level}</small>`
                : ''
            }
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
      .map(
        (t) =>
          `<option value="${t.id}" data-bsl="${t.required_bsl}">${esc(
            t.name
          )} (cần BSL-${t.required_bsl})</option>`
      )
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
    const reqBsl = parseInt(sel.selectedOptions[0]?.dataset.bsl || '2');
    const capacity =
      parseInt(document.getElementById('cap-capacity').value) || 0;
    const turnaround = document.getElementById('cap-turnaround').value;

    // Cảnh báo (không chặn) nếu gán XN đòi BSL cao hơn cấp Phòng Xét nghiệm — dữ liệu sẽ mâu thuẫn
    if (reqBsl > labBsl) {
      const ok = confirm(
        `Cảnh báo an toàn sinh học:\n\nLoại xét nghiệm này yêu cầu BSL-${reqBsl}, nhưng Phòng Xét nghiệm chỉ đạt BSL-${labBsl}.\n\n` +
          `Nếu vẫn gán, khi điều phối mẫu hệ thống sẽ TỰ ĐỘNG LOẠI Phòng Xét nghiệm này khỏi gợi ý (vì không đủ cấp an toàn) — năng lực gán vào sẽ vô tác dụng.\n\n` +
          `Bạn có chắc muốn tiếp tục? (Nên kiểm tra lại cấp BSL của Phòng Xét nghiệm)`
      );
      if (!ok) return;
    }

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
      if (_ttSort.col === 'required_bsl') {
        // cột số
        return ((va ?? 0) - (vb ?? 0)) * _dir;
      }
      // cột chữ (name, category) — so sánh tiếng Việt
      return String(va ?? '').localeCompare(String(vb ?? ''), 'vi') * _dir;
    });

    const rows = _sorted
      .map(
        (t) => `
      <tr>
        <td>${esc(t.name)}</td>
        <td>${esc(t.category || '—')}</td>
        <td class="text-center"><span class="badge bg-dark">BSL-${
          t.required_bsl
        }</span></td>
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
              <div class="alert alert-warning py-2">
                <small><i class='bx bx-info-circle'></i> Cấp BSL yêu cầu quyết định việc chặn điều phối mẫu.
                Cần cán bộ an toàn sinh học của HCDC rà soát.</small>
              </div>
              <table class="table table-sm align-middle">
              <thead class="table-light"><tr>
              <th style="cursor:pointer;" onclick="window.sortTestTypes('name')">
                Tên loại Xét nghiệm ${_ttArrow('name')}
              </th>
              <th style="cursor:pointer;" onclick="window.sortTestTypes('category')">
                Nhóm ${_ttArrow('category')}
              </th>
              <th class="text-center" style="cursor:pointer;" onclick="window.sortTestTypes('required_bsl')">
                BSL yêu cầu ${_ttArrow('required_bsl')}
              </th>
            </tr></thead>
                <tbody>${
                  rows ||
                  '<tr><td colspan="3" class="text-center text-muted">Chưa có loại xét nghiệm.</td></tr>'
                }</tbody>
              </table>
              <hr>
              <h6 class="mb-2"><i class='bx bx-plus-circle'></i> Thêm loại xét nghiệm</h6>
              <div class="row g-2 align-items-end">
                <div class="col-md-5">
                  <label class="form-label">Tên loại xét nghiệm</label>
                  <input id="tt-name" class="form-control" placeholder="VD: PCR Sốt rét">
                </div>
                <div class="col-md-3">
                  <label class="form-label">Nhóm</label>
                  <input id="tt-category" class="form-control" placeholder="sinh_hoc / moi_truong">
                </div>
                <div class="col-md-2">
                  <label class="form-label">BSL yêu cầu</label>
                  <select id="tt-bsl" class="form-select">
                    <option value="1">BSL-1</option>
                    <option value="2" selected>BSL-2</option>
                    <option value="3">BSL-3</option>
                    <option value="4">BSL-4</option>
                  </select>
                </div>
                <div class="col-md-2">
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
          required_bsl: parseInt(document.getElementById('tt-bsl').value),
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
