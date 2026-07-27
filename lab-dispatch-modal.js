// ============================================================================
// GIAI ĐOẠN 2B — DISPATCH MODAL (giao diện điều phối PXN) — BẢN HOÀN CHỈNH
// Hệ thống RRT-HCDC
// ----------------------------------------------------------------------------
// Phụ thuộc: lab-dispatch-engine.js (window.LabDispatch), Leaflet, Bootstrap 5.
// NHÚNG theo thứ tự:
//   <script src="lab-dispatch-engine.js"></script>
//   <script src="lab-dispatch-modal.js"></script>   ← file này
//   <script src="lab-dispatch-actions.js"></script>
//
// MỞ MODAL — 2 nơi:
//   (A) Từ HỒ SƠ SỰ CỐ (gắn tọa độ sự cố):
//       window.openDispatchModal({ incidentId, incidentName, lat, lng })
//   (B) Từ trang BẢN ĐỒ (admin tự nhập điểm — địa chỉ / vị trí / tay):
//       window.openDispatchModal()
//
// Phân quyền nút hành động do lab-dispatch-actions.js (2C) quyết định:
//   admin → "Chốt điều phối mẫu" · Leader → "Đề xuất" · khác → chỉ xem.
// ============================================================================

(function () {
  'use strict';

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
  // Danh sách ngày lễ VN cố định (dd-mm). Admin bổ sung ngày lễ âm lịch thủ công.
  const VN_HOLIDAYS = [
    '01-01', // Tết Dương lịch
    '30-04', // Giải phóng miền Nam
    '01-05', // Quốc tế Lao động
    '02-09', // Quốc khánh
    // Tết Nguyên đán, Giỗ Tổ (âm lịch) đổi hằng năm — thêm dạng 'dd-mm' của năm hiện tại nếu cần
  ];

  // Trả về chuỗi cảnh báo nếu hôm nay là T7/CN/lễ; '' nếu ngày thường
  function getDayWarning() {
    const now = new Date();
    const dow = now.getDay(); // 0=CN, 6=T7
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const isHoliday = VN_HOLIDAYS.includes(`${dd}-${mm}`);

    if (isHoliday) return 'Hôm nay là ngày lễ';
    if (dow === 0) return 'Hôm nay là Chủ nhật';
    if (dow === 6) return 'Hôm nay là Thứ Bảy';
    return '';
  }
  // State phiên làm việc hiện tại của modal
  const S = {
    incidentId: null,
    incidentName: null,
    lat: null,
    lng: null,
    testTypeId: null,
    sampleCount: 20,
    preset: 'balanced',
    weights: null, // trọng số slider tùy chỉnh (null = dùng preset)
    excludeLabIds: [], // PXN bị loại trừ tại trận
    lastResult: null, // kết quả findBestLabs gần nhất
    map: null, // Leaflet instance
    routeLayers: [], // các polyline/marker đang vẽ
  };

  let _testTypes = [];

  const RANK_COLORS = ['#16a34a', '#0ea5e9', '#f59e0b']; // #1 lá, #2 dương, #3 cam
  const FALLBACK_COLOR = '#6b7280';

  // --------------------------------------------------------------------------
  // MỞ MODAL
  // --------------------------------------------------------------------------
  window.openDispatchModal = async function (opts = {}) {
    // Reset toàn bộ state cho phiên mới
    S.incidentId = opts.incidentId || null;
    S.incidentName = opts.incidentName || null;
    S.lat = opts.lat ?? null;
    S.lng = opts.lng ?? null;
    S.testTypeId = null;
    S.sampleCount = 20;
    S.preset = 'balanced';
    S.weights = null;
    S.excludeLabIds = [];
    S.lastResult = null;
    S.map = null;
    S.routeLayers = [];

    // Nạp danh mục loại XN
    try {
      const { data, error } = await window.supabaseClient
        .from('test_types')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      _testTypes = data || [];
    } catch (e) {
      if (window.showToast)
        window.showToast('Lỗi tải loại xét nghiệm: ' + e.message, 'error');
      return;
    }

    if (!_testTypes.length) {
      if (window.showToast)
        window.showToast(
          'Chưa có loại xét nghiệm nào. Vào Quản lý Phòng Xét nghiệm để thêm danh mục.',
          'warning'
        );
      return;
    }

    buildModal();
  };

  function buildModal() {
    document.getElementById('dispatch-modal-wrapper')?.remove();

    const ttOptions = _testTypes
      .map(
        (t) =>
          `<option value="${t.id}" data-bsl="${t.required_bsl}">${esc(
            t.name
          )} · cần BSL-${t.required_bsl}</option>`
      )
      .join('');

    // Điểm sự cố: từ hồ sơ (khóa, hiện tên) hoặc nhập tay (địa chỉ/vị trí/tọa độ)
    const originBlock = S.incidentId
      ? `<div class="alert alert-secondary py-2 mb-0">
           <small class="text-muted d-block">Sự kiện khẩn cấp</small>
           <strong>${esc(S.incidentName || 'Sự cố')}</strong>
           <span class="text-muted"> · ${S.lat?.toFixed?.(
             5
           )}, ${S.lng?.toFixed?.(5)}</span>
         </div>`
      : `<div>
           <label class="form-label mb-1"><small>Vị trí sự kiện khẩn cấp</small></label>
           <div class="input-group input-group-sm mb-2">
             <input id="disp-address" class="form-control" placeholder="366A Âu Dương Lân, phường Chánh Hưng">
             <button class="btn btn-outline-primary" type="button" onclick="window._geocodeAddress()">
               <i class='bx bx-search'></i> Tìm
             </button>
             <button class="btn btn-outline-secondary" type="button" onclick="window._dispatchUseMyLocation()" title="Dùng vị trí hiện tại của tôi">
               <i class='bx bx-current-location'></i>
             </button>
           </div>
           <div class="row g-2">
             <div class="col-6">
               <input id="disp-lat" class="form-control form-control-sm" placeholder="Vĩ độ (lat)">
             </div>
             <div class="col-6">
               <input id="disp-lng" class="form-control form-control-sm" placeholder="Kinh độ (lng)">
             </div>
           </div>
           <div id="disp-origin-hint" class="mt-1"></div>
         </div>`;

    const wrap = document.createElement('div');
    wrap.id = 'dispatch-modal-wrapper';
    wrap.innerHTML = `
      <div class="modal fade" id="dispatchModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header" style="background:#006a75;color:#fff;">
              <h5 class="modal-title"><i class='bx bx-test-tube'></i> Điều phối mẫu xét nghiệm</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <!-- HÀNG INPUT -->
              <div class="row g-3 align-items-end mb-3">
                <div class="col-md-9">
                  <label class="form-label mb-1">Loại xét nghiệm <span class="text-danger">*</span></label>
                  <select id="disp-testtype" class="form-select">${ttOptions}</select>
                </div>
                <div class="col-md-3">
                  <label class="form-label mb-1">Số mẫu</label>
                  <input id="disp-samples" type="number" min="1" class="form-control" value="20">
                </div>
                <div class="col-md-12">${originBlock}</div>
              </div>

              <!-- TRỌNG SỐ: PRESET + SLIDER NÂNG CAO -->
              <div class="card mb-3">
                <div class="card-body py-2">
                  <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div class="btn-group btn-group-sm" role="group" id="disp-presets">
                      <input type="radio" class="btn-check" name="preset" id="p-urgent" value="urgent">
                      <label class="btn btn-outline-danger" for="p-urgent">⚡ Khẩn</label>
                      <input type="radio" class="btn-check" name="preset" id="p-balanced" value="balanced" checked>
                      <label class="btn btn-outline-secondary" for="p-balanced">⚖️ Cân bằng</label>
                      <input type="radio" class="btn-check" name="preset" id="p-capacity" value="capacity">
                      <label class="btn btn-outline-primary" for="p-capacity">📦 Nhiều mẫu</label>
                    </div>
                    <div class="d-flex align-items-center gap-1">
                      <button class="btn btn-sm btn-link text-decoration-none p-1" type="button"
                              onclick="window._toggleDispatchHelp()">
                        <i class='bx bx-info-circle'></i> Giải thích
                      </button>
                      <button class="btn btn-sm btn-link text-decoration-none p-1" type="button"
                              onclick="document.getElementById('disp-advanced').classList.toggle('d-none')">
                        <i class='bx bx-slider'></i> Tùy chỉnh
                      </button>
                    </div>
                  </div>
                  <div id="disp-advanced" class="d-none mt-2 pt-2 border-top">
                    <small class="text-muted d-block mb-1">Kéo để thay đổi mức độ ưu tiên:</small>
                    <div class="row g-2">
                      <div class="col-md-4"><label class="form-label mb-0"><small>Gần nhất <span id="w-near">34</span>%</small></label>
                        <input type="range" class="form-range" id="slider-near" min="0" max="100" value="34"></div>
                      <div class="col-md-4"><label class="form-label mb-0"><small>Còn nhận mẫu trong ngày <span id="w-free">33</span>%</small></label>
                        <input type="range" class="form-range" id="slider-free" min="0" max="100" value="33"></div>
                      <div class="col-md-4"><label class="form-label mb-0"><small>Trả Kết quả nhanh <span id="w-fast">33</span>%</small></label>
                        <input type="range" class="form-range" id="slider-fast" min="0" max="100" value="33"></div>
                    </div>
                  </div>
                  <div id="disp-help" class="d-none mt-2 pt-2 border-top">
                    <div class="alert alert-info py-2 mb-0" style="font-size:.85rem;">
                      <div class="mb-2"><b><i class='bx bx-bulb'></i> Hệ thống xếp hạng Phòng xét nghiệm theo 3 tiêu chí:</b></div>
                      <div class="d-flex align-items-start gap-2 mb-1">
                        <span class="badge" style="background:#16a34a;">Gần nhất</span>
                        <span>Phòng xét nghiệm có thời gian di chuyển ngắn nhất từ sự kiện khẩn cấp.</span>
                      </div>
                      <div class="d-flex align-items-start gap-2 mb-1">
                        <span class="badge" style="background:#0ea5e9;">Còn nhận mẫu trong ngày</span>
                        <span>Phòng xét nghiệm còn nhiều công suất nhận mẫu trong ngày.</span>
                      </div>
                      <div class="d-flex align-items-start gap-2 mb-2">
                        <span class="badge" style="background:#f59e0b;">Trả Kết quả nhanh</span>
                        <span>Phòng xét nghiệm trả kết quả xét nghiệm sớm nhất.</span>
                      </div>
                      <div class="mb-1"><b>Chọn chế độ phù hợp tình huống:</b></div>
                      <div class="ms-1" style="line-height:1.7;">
                        ⚡ <b>Khẩn</b>: cần kết quả gấp → ưu tiên Phòng xét nghiệm gần nhất & trả Kết quả nhanh.<br>
                        ⚖️ <b>Cân bằng</b>: tình huống thường → cân nhắc đều cả 3 tiêu chí.<br>
                        📦 <b>Nhiều mẫu</b>: ổ dịch lớn, nhiều mẫu → ưu tiên nơi còn khả năng tiếp nhận mẫu.<br>
                        🎚️ <b>Tùy chỉnh</b>: tự kéo mức ưu tiên nếu 3 chế độ trên chưa phù hợp.
                      </div>
                      <div class="mt-2 pt-1 border-top text-muted">
                        <i class='bx bx-shield'></i> Lưu ý an toàn: Phòng xét nghiệm không đủ cấp an toàn sinh học (BSL)
                        cho tác nhân này sẽ <b>không bao giờ xuất hiện</b>, bất kể chọn chế độ nào.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="text-center mb-3">
                <button class="btn btn-primary px-4" onclick="window._runDispatch()">
                  <i class='bx bx-search-alt'></i> Tìm Phòng xét nghiệm phù hợp
                </button>
              </div>

              <!-- KẾT QUẢ + BẢN ĐỒ (ẩn, hiện khi bấm Phòng Xét nghiệm) -->
              <div id="disp-results"></div>
              <div id="disp-map-wrap" class="d-none mt-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <small class="text-muted"><i class='bx bx-map'></i> <span id="disp-map-label">Tuyến đường</span></small>
                  <button class="btn btn-sm btn-outline-secondary" onclick="window._hideDispatchMap()">
                    <i class='bx bx-x'></i> Ẩn bản đồ
                  </button>
                </div>
                <div id="disp-map" style="height:340px;border-radius:8px;background:#eee;"></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const modalEl = document.getElementById('dispatchModal');
    new bootstrap.Modal(modalEl).show();
    // Biến dropdown loại XN thành ô tìm-gõ (Select2 — app đã có sẵn)
    if (window.$ && $.fn.select2) {
      $('#disp-testtype').select2({
        dropdownParent: $('#dispatchModal'),   // QUAN TRỌNG: neo trong modal, không Select2 sẽ bị modal che
        placeholder: 'Gõ để tìm loại xét nghiệm...',
        width: '100%',
      });
    }

    // Dọn dẹp khi modal đóng: hủy map + gỡ backdrop kẹt
    modalEl.addEventListener(
      'hidden.bs.modal',
      function () {
        if (S.map) {
          try {
            S.map.remove();
          } catch (_) {}
          S.map = null;
          S.routeLayers = [];
        }
      // Hủy Select2 của dropdown loại XN khi đóng modal
      if (window.$ && $.fn.select2 && $('#disp-testtype').hasClass('select2-hidden-accessible')) {
        $('#disp-testtype').select2('destroy');
      }
        wrap.remove();
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
      },
      { once: true }
    );

    // Slider tự cân bằng tổng = 100
    ['near', 'free', 'fast'].forEach((k) => {
      const el = document.getElementById('slider-' + k);
      if (el) el.addEventListener('input', () => rebalanceSliders(k));
    });
    // Chọn preset → tắt chế độ custom
    // Chọn preset → slider chạy theo + tắt chế độ custom
    document.querySelectorAll('input[name="preset"]').forEach((r) => {
      r.addEventListener('change', () => {
        S.weights = null; // dùng preset, không phải custom
        syncSlidersToPreset(r.value); // slider nhảy theo cho người dùng thấy
      });
    });

    // Đặt slider khớp preset mặc định (balanced) ngay khi mở modal
    syncSlidersToPreset('balanced');
  }

  // Bảng trọng số của từng preset (khớp với PRESETS trong engine)
  const PRESET_WEIGHTS = {
    urgent: { near: 45, free: 10, fast: 45 },
    balanced: { near: 34, free: 33, fast: 33 },
    capacity: { near: 20, free: 60, fast: 20 },
  };

  // Đẩy slider + nhãn % chạy theo preset được chọn
  function syncSlidersToPreset(preset) {
    const w = PRESET_WEIGHTS[preset] || PRESET_WEIGHTS.balanced;
    ['near', 'free', 'fast'].forEach((k) => {
      const slider = document.getElementById('slider-' + k);
      const label = document.getElementById('w-' + k);
      if (slider) slider.value = w[k];
      if (label) label.textContent = w[k];
    });
  }
  function rebalanceSliders(changed) {
    const get = (k) =>
      parseInt(document.getElementById('slider-' + k).value) || 0;
    let near = get('near'),
      free = get('free'),
      fast = get('fast');
    const others = ['near', 'free', 'fast'].filter((k) => k !== changed);
    const changedVal = { near, free, fast }[changed];
    const remain = 100 - changedVal;
    let o1 = { near, free, fast }[others[0]];
    let o2 = { near, free, fast }[others[1]];
    const sumO = o1 + o2;
    if (sumO === 0) {
      o1 = Math.round(remain / 2);
      o2 = remain - o1;
    } else {
      o1 = Math.round((o1 / sumO) * remain);
      o2 = remain - o1;
    }
    const vals = { [changed]: changedVal, [others[0]]: o1, [others[1]]: o2 };

    ['near', 'free', 'fast'].forEach((k) => {
      document.getElementById('slider-' + k).value = vals[k];
      document.getElementById('w-' + k).textContent = vals[k];
    });
    S.weights = {
      near: vals.near / 100,
      free: vals.free / 100,
      fast: vals.fast / 100,
    };
  }

  // --------------------------------------------------------------------------
  // CHẠY TÌM KIẾM
  // --------------------------------------------------------------------------
  window._runDispatch = async function () {
    S.testTypeId = document.getElementById('disp-testtype').value;
    S.sampleCount =
      parseInt(document.getElementById('disp-samples').value) || 1;
    S.preset =
      document.querySelector('input[name="preset"]:checked')?.value ||
      'balanced';

    if (!S.incidentId) {
      S.lat = parseFloat(document.getElementById('disp-lat')?.value);
      S.lng = parseFloat(document.getElementById('disp-lng')?.value);
    }
    if (isNaN(S.lat) || isNaN(S.lng) || S.lat == null || S.lng == null) {
      if (window.showToast)
        window.showToast(
          'Chưa có tọa độ điểm sự cố (nhập địa chỉ/vị trí/tọa độ)',
          'warning'
        );
      return;
    }

    const resultsEl = document.getElementById('disp-results');
    resultsEl.innerHTML =
      '<div class="text-center p-4"><span class="spinner-border"></span> Đang tính tuyến đường & xếp hạng...</div>';
    _hideDispatchMap();

    try {
      const result = await window.LabDispatch.findBestLabs({
        testTypeId: S.testTypeId,
        sampleCount: S.sampleCount,
        originLat: S.lat,
        originLng: S.lng,
        preset: S.preset,
        weights: S.weights,
        excludeLabIds: S.excludeLabIds,
        candidateLimit: 10,
        topN: 3,
      });
      S.lastResult = result;
      renderResults(result);
    } catch (e) {
      console.error('[dispatch] Lỗi:', e);
      resultsEl.innerHTML = `<div class="alert alert-danger">Lỗi: ${esc(
        e.message
      )}</div>`;
    }
  };

  // --------------------------------------------------------------------------
  // HIỂN THỊ PANEL XẾP HẠNG
  // --------------------------------------------------------------------------
  function renderResults(result) {
    const el = document.getElementById('disp-results');
    const { ranked, top, meta } = result;

    if (!ranked.length) {
      const tt = _testTypes.find((t) => t.id === S.testTypeId);
      // Cảnh báo mềm nếu hôm nay T7/CN/lễ (đa số PXN nghỉ, chỉ vài PXN trực)
      const dayWarn = getDayWarning();
      const dayWarnHtml = dayWarn
        ? `<div class="alert alert-warning py-2 mb-2">
           <i class='bx bx-calendar-exclamation'></i> <b>${dayWarn}</b> — đa số Phòng xét nghiệm
           có thể nghỉ. Vui lòng <b>gọi xác nhận</b> Phòng xét nghiệm còn trực trước khi điều phối mẫu.
         </div>`
        : '';
      el.innerHTML = `
       <div id="disp-pending"></div>
       ${dayWarnHtml}
       ${osrmWarn}
        <div class="alert alert-warning">
          <i class='bx bx-error'></i> <strong>Không tìm thấy Phòng xét nghiệm phù hợp</strong> cho "${esc(
            tt?.name || ''
          )}".<br>
          <small>Nguyên nhân có thể: chưa Phòng xét nghiệm nào đủ cấp an toàn sinh học (cần BSL-${
            tt?.required_bsl ?? '?'
          }),
          chưa khai báo năng lực loại Xét nghiệm này, hoặc tất cả đã bị loại trừ.</small>
        </div>`;
      if (typeof window.showPendingSuggestions === 'function')
        window.showPendingSuggestions(S.incidentId, S.testTypeId);
      // Không tìm thấy PXN → xóa hình dispatch cũ trên bản đồ (nếu có)
      if (window.LabDispatchMap) window.LabDispatchMap.clear();
      return;
    }

    const osrmWarn =
      meta.osrmFailures > 0
        ? `<div class="alert alert-warning py-1 px-2 mb-2"><small><i class='bx bx-wifi-off'></i>
         ${meta.osrmFailures}/${meta.afterExclude} tuyến dùng khoảng cách ước lượng (dịch vụ chỉ đường tạm gián đoạn).
         Thời gian/quãng đường có thể chưa chính xác.</small></div>`
        : '';

    const cards = ranked
      .map((lab) => {
        const isTop3 = lab.rank <= 3;
        const color = isTop3 ? RANK_COLORS[lab.rank - 1] : FALLBACK_COLOR;
        const rankLabel = lab.rank === 1 ? 'TỐI ƯU' : `Dự phòng ${lab.rank}`;
        const enoughBadge = lab.is_enough
          ? `<span class="badge bg-success">Đủ chỗ (còn ${lab.remaining_today})</span>`
          : `<span class="badge bg-danger">Không đủ chỗ (còn ${lab.remaining_today}/${S.sampleCount})</span>`;
        const srcNote =
          lab.route.source === 'haversine'
            ? ' <small class="text-muted">(ước lượng)</small>'
            : '';

        return `
        <div class="card mb-2 dispatch-lab-card" style="border-left:5px solid ${color};">
          <div class="card-body py-2">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
              <div style="min-width:0;">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <span class="badge" style="background:${color};">#${
          lab.rank
        } ${rankLabel}</span>
                  <strong>${esc(lab.lab_name)}</strong>
                  <span class="badge bg-dark">BSL-${lab.bsl_level}</span>
                </div>
                <small class="text-muted d-block">${esc(
                  lab.address || ''
                )}</small>
                <div class="mt-1 d-flex flex-wrap gap-3">
                  <small><i class='bx bx-map-pin'></i> <b>${
                    lab.route.km
                  } km</b>${srcNote}</small>
                  <small><i class='bx bx-time'></i> <b>${
                    lab.route.minutes
                  } phút</b></small>
                  <small><i class='bx bx-timer'></i> Trả Kết quả: <b>${
                    lab.turnaround_hours != null
                      ? lab.turnaround_hours + 'h'
                      : '—'
                  }</b></small>
                  ${enoughBadge}
                </div>
              </div>
              <div class="text-end flex-shrink-0">
                <div class="mb-1"><span class="badge bg-light text-dark" style="font-size:.95em;">
                  Điểm: <b>${lab.scores.total}</b></span></div>
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-secondary" onclick="window._showLabRoute('${
                    lab.lab_id
                  }')" title="Xem đường đi">
                    <i class='bx bx-map'></i>
                  </button>
                  <button class="btn btn-outline-danger" onclick="window._excludeLab('${
                    lab.lab_id
                  }')" title="Loại trừ Phòng xét nghiệm này">
                    <i class='bx bx-x-circle'></i>
                  </button>
                </div>
                <div class="mt-1" id="disp-action-${lab.lab_id}"></div>
              </div>
            </div>
            <div class="mt-1 d-flex gap-1" style="height:5px;" title="Gần ${
              lab.scores.gan
            } · Trống ${lab.scores.trong} · Nhanh ${lab.scores.nhanh}">
              <div style="flex:${
                lab.scores.gan
              };background:#16a34a;border-radius:3px;"></div>
              <div style="flex:${
                lab.scores.trong
              };background:#0ea5e9;border-radius:3px;"></div>
              <div style="flex:${
                lab.scores.nhanh
              };background:#f59e0b;border-radius:3px;"></div>
            </div>
          </div>
        </div>`;
      })
      .join('');

    const excludeInfo = S.excludeLabIds.length
      ? `<div class="mb-2"><small class="text-muted">Đã loại trừ ${S.excludeLabIds.length} Phòng xét nghiệm.
         <a href="#" onclick="window._resetExclude();return false;">Khôi phục tất cả</a></small></div>`
      : '';

    el.innerHTML = `
      <div id="disp-pending"></div>
      ${osrmWarn}
      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-1">
        <small class="text-muted">Tìm thấy ${
          ranked.length
        } Phòng xét nghiệm phù hợp · Xếp theo <b>${labelPreset(
      meta
    )}</b></small>
        <small class="text-muted"><i class='bx bx-bulb'></i> Thanh màu: 🟢Gần 🔵Trống 🟠Nhanh</small>
      </div>
      ${excludeInfo}
      ${cards}
      <div class="mt-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <small class="text-muted"><i class='bx bx-info-circle'></i>
          Bấm <i class='bx bx-map'></i> xem tuyến · <i class='bx bx-x-circle'></i> loại Phòng xét nghiệm và xếp lại.</small>
        <button class="btn btn-sm btn-outline-secondary" onclick="window.showDispatchHistory(window._getDispatchState().incidentId)">
          <i class='bx bx-history'></i> Lịch sử điều phối mẫu hôm nay
        </button>
      </div>`;

    if (typeof window.renderDispatchActions === 'function') {
      top.forEach((lab) => window.renderDispatchActions(lab, S));
    }
    if (typeof window.showPendingSuggestions === 'function') {
      window.showPendingSuggestions(S.incidentId, S.testTypeId);
    }
    if (typeof window.renderDispatchActions === 'function') {
      top.forEach((lab) => window.renderDispatchActions(lab, S));
    }
    if (typeof window.showPendingSuggestions === 'function') {
      window.showPendingSuggestions(S.incidentId, S.testTypeId);
    }
    // Chiếu kết quả lên bản đồ nền (Bước 2) — CHỖ ĐÚNG: nhánh CÓ kết quả
    if (window.LabDispatchMap && ranked.length) {
      window.LabDispatchMap.project(result, {
        lat: S.lat,
        lng: S.lng,
        name: S.incidentName || 'Điểm sự kiện',
      });
    }
  }
  window._toggleDispatchHelp = function () {
    document.getElementById('disp-help')?.classList.toggle('d-none');
  };
  function labelPreset(meta) {
    if (meta.preset === 'custom') return 'trọng số tùy chỉnh';
    return (
      { urgent: '⚡ Khẩn', balanced: '⚖️ Cân bằng', capacity: '📦 Nhiều mẫu' }[
        meta.preset
      ] || meta.preset
    );
  }

  // --------------------------------------------------------------------------
  // LOẠI TRỪ / KHÔI PHỤC PXN TẠI TRẬN
  // --------------------------------------------------------------------------
  window._excludeLab = function (labId) {
    if (!S.excludeLabIds.includes(labId)) S.excludeLabIds.push(labId);
    window._runDispatch();
  };
  window._resetExclude = function () {
    S.excludeLabIds = [];
    window._runDispatch();
  };

  // --------------------------------------------------------------------------
  // BẢN ĐỒ — hiện khi bấm 1 PXN
  // --------------------------------------------------------------------------
  window._showLabRoute = function (labId) {
    const result = S.lastResult;
    if (!result) return;
    const lab = result.ranked.find((l) => l.lab_id === labId);
    if (!lab) return;

    document.getElementById('disp-map-wrap').classList.remove('d-none');
    document.getElementById(
      'disp-map-label'
    ).textContent = `${lab.lab_name} — ${lab.route.km} km, ${lab.route.minutes} phút`;

    if (!S.map) {
      if (typeof L === 'undefined') {
        document.getElementById('disp-map').innerHTML =
          '<div class="alert alert-warning m-2">Không nạp được bản đồ (Leaflet).</div>';
        return;
      }
      S.map = L.map('disp-map').setView([S.lat, S.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(S.map);
      L.marker([S.lat, S.lng], {
        icon: L.divIcon({
          className: '',
          html: '<div style="background:#dc2626;color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:bold;box-shadow:0 0 4px rgba(0,0,0,.5);">A</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      })
        .addTo(S.map)
        .bindPopup('Điểm sự cố');
    }

    S.routeLayers.forEach((layer) => {
      try {
        S.map.removeLayer(layer);
      } catch (_) {}
    });
    S.routeLayers = [];

    result.top.forEach((l) => {
      const selected = l.lab_id === labId;
      const color = l.rank <= 3 ? RANK_COLORS[l.rank - 1] : FALLBACK_COLOR;
      const coords = l.route.geometry.coordinates.map((c) => [c[1], c[0]]);

      const poly = L.polyline(coords, {
        color,
        weight: selected ? 6 : 3,
        opacity: selected ? 0.95 : 0.35,
        dashArray: l.rank === 1 ? null : '8,6',
      }).addTo(S.map);
      S.routeLayers.push(poly);

      const marker = L.marker([l.lat, l.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:${color};color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;box-shadow:0 0 4px rgba(0,0,0,.4);">${l.rank}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      })
        .addTo(S.map)
        .bindPopup(
          `<b>#${l.rank} ${esc(l.lab_name)}</b><br>${l.route.km} km · ${
            l.route.minutes
          } phút` +
            (l.route.source === 'haversine'
              ? '<br><i>(ước lượng đường chim bay)</i>'
              : '')
        );
      S.routeLayers.push(marker);
      if (selected) marker.openPopup();
    });

    const selCoords = lab.route.geometry.coordinates.map((c) => [c[1], c[0]]);
    S.map.fitBounds(L.latLngBounds(selCoords).pad(0.2));
    setTimeout(() => S.map.invalidateSize(), 150);
    document
      .getElementById('disp-map-wrap')
      .scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  window._hideDispatchMap = function () {
    document.getElementById('disp-map-wrap')?.classList.add('d-none');
  };

  // --------------------------------------------------------------------------
  // NHẬP TỌA ĐỘ (trang bản đồ): địa chỉ → tọa độ, vị trí của tôi
  // --------------------------------------------------------------------------
  window._geocodeAddress = async function () {
    const q = document.getElementById('disp-address')?.value.trim();
    const hint = document.getElementById('disp-origin-hint');
    if (!q) {
      if (window.showToast) window.showToast('Nhập địa chỉ cần tìm', 'warning');
      return;
    }
    hint.innerHTML =
      '<small class="text-muted"><span class="spinner-border spinner-border-sm"></span> Đang tìm địa chỉ...</small>';

    try {
      const url =
        'https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=vn&q=' +
        encodeURIComponent(q);
      const res = await fetch(url, { headers: { 'Accept-Language': 'vi' } });
      const data = await res.json();

      if (!data || data.length === 0) {
        hint.innerHTML =
          '<small class="text-danger">Không tìm thấy địa chỉ. Thử nhập cụ thể hơn (thêm quận, thành phố).</small>';
        return;
      }

      if (data.length === 1) {
        _applyGeocode(data[0]);
      } else {
        const opts = data
          .map(
            (d, i) =>
              `<a href="#" class="list-group-item list-group-item-action py-1"
              onclick='window._pickGeocode(${i});return false;'>
             <small>${esc(d.display_name)}</small>
           </a>`
          )
          .join('');
        window._geocodeResults = data;
        hint.innerHTML = `<div class="list-group mt-1" style="max-height:160px;overflow:auto;">
          <small class="text-muted px-2 py-1">Chọn địa điểm đúng:</small>${opts}</div>`;
      }
    } catch (e) {
      console.error('[geocode]', e);
      hint.innerHTML =
        '<small class="text-danger">Lỗi tìm địa chỉ: ' +
        esc(e.message) +
        '</small>';
    }
  };

  window._pickGeocode = function (i) {
    const d = window._geocodeResults?.[i];
    if (d) _applyGeocode(d);
  };

  function _applyGeocode(d) {
    const lat = parseFloat(d.lat),
      lng = parseFloat(d.lon);
    document.getElementById('disp-lat').value = lat.toFixed(6);
    document.getElementById('disp-lng').value = lng.toFixed(6);
    document.getElementById(
      'disp-origin-hint'
    ).innerHTML = `<small class="text-success"><i class='bx bx-check-circle'></i> ${esc(
      d.display_name
    )}</small>`;
  }

  window._dispatchUseMyLocation = function () {
    const hint = document.getElementById('disp-origin-hint');
    if (!navigator.geolocation) {
      if (window.showToast)
        window.showToast('Trình duyệt không hỗ trợ định vị', 'warning');
      return;
    }
    hint.innerHTML =
      '<small class="text-muted"><span class="spinner-border spinner-border-sm"></span> Đang lấy vị trí...</small>';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById('disp-lat').value =
          pos.coords.latitude.toFixed(6);
        document.getElementById('disp-lng').value =
          pos.coords.longitude.toFixed(6);
        hint.innerHTML =
          '<small class="text-success"><i class="bx bx-check-circle"></i> Đã lấy vị trí hiện tại của bạn.</small>';
      },
      (err) => {
        hint.innerHTML =
          '<small class="text-danger">Không lấy được vị trí: ' +
          esc(err.message) +
          '</small>';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // --------------------------------------------------------------------------
  // EXPORT STATE (cho 2C đọc)
  // --------------------------------------------------------------------------
  window._getDispatchState = function () {
    return {
      incidentId: S.incidentId,
      testTypeId: S.testTypeId,
      sampleCount: S.sampleCount,
      lat: S.lat,
      lng: S.lng,
    };
  };

  console.log(
    '[lab-dispatch-modal.js] ✅ Dispatch Modal sẵn sàng. (window.openDispatchModal)'
  );
})();
