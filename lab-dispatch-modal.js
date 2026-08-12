// ============================================================================
// DISPATCH MODAL (giao diện điều phối PXN) — BẢN CHỐT (quy trình mới 2026)
// Hệ thống RRT-HCDC
// ----------------------------------------------------------------------------
// Phụ thuộc: lab-dispatch-engine.js (window.LabDispatch), Leaflet, Bootstrap 5.
//
// MỚI:
//   • Ô nhập TIÊU CHÍ CHUYÊN GIA: QSM tối thiểu (ưu tiên) + Thời gian trả KQ
//     tối đa (ưu tiên) → truyền xuống engine (minQsm, maxTurnaround).
//   • Preset thứ 4: 🏅 Chất lượng (ưu tiên QSM). Giữ 3 slider gần/trống/nhanh.
//   • Card kết quả: badge QSM + phân cấp mạng lưới, ĐẦU MỐI LIÊN HỆ (gọi/email),
//     cảnh báo mềm (QSM thấp / trả KQ chậm hơn yêu cầu).
//   • Sửa bug osrmWarn dùng trước khai báo ở nhánh "không tìm thấy".
//
// MỞ MODAL:
//   (A) Từ hồ sơ sự cố: window.openDispatchModal({ incidentId, incidentName, lat, lng })
//   (B) Từ bản đồ (tự nhập điểm):  window.openDispatchModal()
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

  const VN_HOLIDAYS = ['01-01', '30-04', '01-05', '02-09'];

  function getDayWarning() {
    const now = new Date();
    const dow = now.getDay();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    if (VN_HOLIDAYS.includes(`${dd}-${mm}`)) return 'Hôm nay là ngày lễ';
    if (dow === 0) return 'Hôm nay là Chủ nhật';
    if (dow === 6) return 'Hôm nay là Thứ Bảy';
    return '';
  }

  const S = {
    incidentId: null,
    incidentName: null,
    lat: null,
    lng: null,
    testTypeId: null,
    sampleCount: 20,
    preset: 'balanced',
    weights: null,
    minBsl: null, // BSL chuyên gia chọn (lọc cứng)
    minQsm: null, // không nhập — chỉ chấm điểm
    maxTurnaround: null, // không nhập — chỉ chấm điểm
    excludeLabIds: [],
    lastResult: null,
    map: null,
    routeLayers: [],
  };

  let _testTypes = [];

  const RANK_COLORS = ['#16a34a', '#0ea5e9', '#f59e0b'];
  const FALLBACK_COLOR = '#6b7280';

  window.openDispatchModal = async function (opts = {}) {
    S.incidentId = opts.incidentId || null;
    S.incidentName = opts.incidentName || null;
    S.lat = opts.lat ?? null;
    S.lng = opts.lng ?? null;
    S.testTypeId = null;
    S.sampleCount = 20;
    S.preset = 'balanced';
    S.weights = null;
    S.minBsl = null;
    S.minQsm = null;
    S.maxTurnaround = null;
    S.excludeLabIds = [];
    S.lastResult = null;
    S.map = null;
    S.routeLayers = [];

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
      .map((t) => `<option value="${t.id}">${esc(t.name)}</option>`)
      .join('');

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
              <!-- HÀNG INPUT: kỹ thuật + BSL (lọc cứng) + số mẫu -->
              <div class="row g-3 align-items-end mb-2">
                <div class="col-md-6">
                  <label class="form-label mb-1">Loại xét nghiệm (kỹ thuật) <span class="text-danger">*</span></label>
                  <select id="disp-testtype" class="form-select">${ttOptions}</select>
                </div>
                <div class="col-md-3">
                  <label class="form-label mb-1">An toàn sinh học <span class="text-danger">*</span></label>
                  <select id="disp-bsl" class="form-select" title="Cấp ATSH tối thiểu — PXN thấp hơn sẽ bị loại (lọc cứng)">
                    <option value="1">ATSH cấp 1</option>
                    <option value="2" selected>ATSH cấp 2</option>
                    <option value="3">ATSH cấp 3</option>
                    <option value="4">ATSH cấp 4</option>
                  </select>
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
                    <div class="btn-group btn-group-sm flex-wrap" role="group" id="disp-presets">
                      <input type="radio" class="btn-check" name="preset" id="p-urgent" value="urgent">
                      <label class="btn btn-outline-danger" for="p-urgent">⚡ Khẩn</label>
                      <input type="radio" class="btn-check" name="preset" id="p-balanced" value="balanced" checked>
                      <label class="btn btn-outline-secondary" for="p-balanced">⚖️ Cân bằng</label>
                      <input type="radio" class="btn-check" name="preset" id="p-capacity" value="capacity">
                      <label class="btn btn-outline-primary" for="p-capacity">📦 Nhiều mẫu</label>
                      <input type="radio" class="btn-check" name="preset" id="p-quality" value="quality">
                      <label class="btn btn-outline-success" for="p-quality">🏅 Chất lượng</label>
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
                  <small class="text-muted d-block mb-2"> Chọn 1 trong 4 chế độ (⚡Khẩn/ ⚖️ Cân bằng/ 📦 Nhiều mẫu/ 🏅 Chất lượng) hoặc điều chỉnh trọng số của 5 tiêu chí:</small>
                  <div class="row g-2">
                    <div class="col-md-4">
                      <label class="form-label mb-0"><small>🟢 Gần nhất <span id="w-near">25</span>%</small></label>
                      <input type="range" class="form-range" id="slider-near" min="0" max="100" value="25">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label mb-0"><small>🔵 Còn nhận mẫu <span id="w-free">20</span>%</small></label>
                      <input type="range" class="form-range" id="slider-free" min="0" max="100" value="20">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label mb-0"><small>🟠 Trả Kết quả nhanh <span id="w-fast">20</span>%</small></label>
                      <input type="range" class="form-range" id="slider-fast" min="0" max="100" value="20">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label mb-0"><small>🏅 Chất lượng (QSM) <span id="w-qual">20</span>%</small></label>
                      <input type="range" class="form-range" id="slider-qual" min="0" max="100" value="20">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label mb-0"><small>🌐 Năng lực Xét nghiệm <span id="w-net">15</span>%</small></label>
                      <input type="range" class="form-range" id="slider-net" min="0" max="100" value="15">
                    </div>
                    <div class="col-md-4 d-flex align-items-end">
                      <small class="text-muted">Tổng: <b><span id="w-total">100</span>%</b></small>
                    </div>
                  </div>
                  </div>
                  <div id="disp-help" class="d-none mt-2 pt-2 border-top">
                    <div class="alert alert-info py-2 mb-0" style="font-size:.85rem;">
                      <div class="mb-2"><b><i class='bx bx-bulb'></i> Hệ thống tìm phòng xét nghiệm tối ưu theo 5 tiêu chí:</b></div>
                      <div class="ms-1" style="line-height:1.7;">
                        🟢 <b>Gần nhất</b>: thời gian di chuyển từ sự kiện khẩn cấp đến phòng xét nghiệm ngắn nhất.<br>
                        🔵 <b>Còn nhận mẫu</b>: phòng xét nghiệm còn công suất tiếp nhận mẫu trong ngày.<br>
                        🟠 <b>Trả Kết quả nhanh</b>: phòng xét nghiệm trả kết quả xét nghiệm nhanh nhất.<br>
                        🏅 <b>Chất lượng (QSM)</b>: phòng xét nghiệm đạt ISO 15189 / QĐ2429 mức cao.<br>
                        🌐 <b>Năng lực xét nghiệm</b>: phân cấp năng lực xét nghiệm cao trong mạng lưới.
                      </div>
                      <div class="mb-1 mt-2"><b><i class='bx bx-equalizer'></i> Chế độ:</b></div>
                      <div class="ms-1" style="line-height:1.7;">
                        ⚡ <b>Khẩn</b>: ưu tiên khoảng cách gần nhất & trả kết quả nhanh.<br>
                        ⚖️ <b>Cân bằng</b>: cân bằng tương đối 5 tiêu chí.<br>
                        📦 <b>Nhiều mẫu</b>: ưu tiên công suất tiếp nhận mẫu nhiều trong ngày.<br>
                        🏅 <b>Chất lượng</b>: ưu tiên QSM & năng lực xét nghiệm cao trong mạng lưới.
                      </div>
                      <div class="mt-2 pt-1 border-top text-muted">
                        <i class='bx bx-shield'></i> An toàn: Phòng xét nghiệm không đủ cấp ATSH cho loại tác nhân này
                        <b>không bao giờ xuất hiện</b>, bất kể chế độ. QSM & thời gian trả kết quả là
                        <b>ưu tiên</b> (thiếu vẫn hiện nhưng xếp sau + cảnh báo).
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

    if (window.$ && $.fn.select2) {
      $('#disp-testtype').select2({
        dropdownParent: $('#dispatchModal'),
        placeholder: 'Gõ để tìm loại xét nghiệm...',
        width: '100%',
      });
    }

    // BSL KHÔNG auto-set theo kỹ thuật. Chuyên gia CHỦ ĐỘNG chọn cấp ATSH theo
    // TÁC NHÂN của tình huống (dropdown mặc định ATSH cấp 2). Kỹ thuật không gắn BSL.

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
        if (
          window.$ &&
          $.fn.select2 &&
          $('#disp-testtype').hasClass('select2-hidden-accessible')
        ) {
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

    ['near', 'free', 'fast', 'qual', 'net'].forEach((k) => {
      const el = document.getElementById('slider-' + k);
      if (el) el.addEventListener('input', () => rebalanceSliders(k));
    });
    document.querySelectorAll('input[name="preset"]').forEach((r) => {
      r.addEventListener('change', () => {
        S.weights = null;
        syncSlidersToPreset(r.value);
      });
    });

    syncSlidersToPreset('balanced');
  }

  // Trọng số HIỂN THỊ cho 3 slider (near/free/fast, tổng 100).
  // Lưu ý: trọng số THẬT khi chọn preset lấy từ engine.PRESETS (5 chiều);
  // 3 slider chỉ hiện tương quan gần/trống/nhanh cho trực quan.

  // (2) Lấy trọng số preset ĐÚNG từ engine (đổi 0..1 → 0..100 để hiển thị).
  const DIMS = ['near', 'free', 'fast', 'qual', 'net'];

  // Lấy % preset ĐÚNG từ engine (LabDispatch.PRESETS, 0..1 → 0..100)
  function _getPresetPct(preset) {
    const P = (window.LabDispatch && window.LabDispatch.PRESETS) || {};
    const w = P[preset] ||
      P.balanced || { near: 0.25, free: 0.2, fast: 0.2, qual: 0.2, net: 0.15 };
    const pct = {};
    let acc = 0;
    DIMS.forEach((k) => {
      pct[k] = Math.round((w[k] || 0) * 100);
      acc += pct[k];
    });
    pct.near += 100 - acc; // bù sai số làm tròn để tổng = 100
    return pct;
  }

  // (3a) Nạp slider theo preset (đủ 5 chiều)
  // Nạp slider theo preset (đủ 5 chiều). Đặt S.weights = null → engine dùng PRESETS[preset].
  function syncSlidersToPreset(preset) {
    const w = _getPresetPct(preset);
    DIMS.forEach((k) => {
      const slider = document.getElementById('slider-' + k);
      const label = document.getElementById('w-' + k);
      if (slider) slider.value = w[k];
      if (label) label.textContent = w[k];
    });
    _updateTotalLabel();
    S.weights = null; // ← GHI TRỰC TIẾP vào S cục bộ: preset → engine dùng PRESETS
  }

  // (3b) Kéo 1 slider → 4 slider còn lại tự chia phần còn lại theo tỉ lệ (tổng=100)
  // Kéo 1 slider → 4 cái kia tự chia phần còn lại (tổng = 100). Ghi ĐỦ 5 chiều vào S.weights.
  function rebalanceSliders(changed) {
    const get = (k) =>
      parseInt(document.getElementById('slider-' + k)?.value) || 0;
    const cur = {};
    DIMS.forEach((k) => (cur[k] = get(k)));
    const changedVal = cur[changed];
    const others = DIMS.filter((k) => k !== changed);
    const remain = 100 - changedVal;
    const sumOthers = others.reduce((s, k) => s + cur[k], 0);

    const vals = { [changed]: changedVal };
    if (sumOthers === 0) {
      const base = Math.floor(remain / others.length);
      others.forEach((k) => (vals[k] = base));
      vals[others[0]] += remain - base * others.length;
    } else {
      let acc = 0;
      others.forEach((k, i) => {
        if (i < others.length - 1) {
          vals[k] = Math.round((cur[k] / sumOthers) * remain);
          acc += vals[k];
        } else {
          vals[k] = remain - acc;
        }
      });
    }

    DIMS.forEach((k) => {
      const slider = document.getElementById('slider-' + k);
      const label = document.getElementById('w-' + k);
      if (slider) slider.value = vals[k];
      if (label) label.textContent = vals[k];
    });
    _updateTotalLabel();

    // ← GHI TRỰC TIẾP vào S cục bộ: custom → engine dùng weights 5 chiều (0..1)
    S.weights = {
      near: vals.near / 100,
      free: vals.free / 100,
      fast: vals.fast / 100,
      qual: vals.qual / 100,
      net: vals.net / 100,
    };
  }

  function _updateTotalLabel() {
    const total = DIMS.reduce(
      (s, k) =>
        s + (parseInt(document.getElementById('slider-' + k)?.value) || 0),
      0
    );
    const el = document.getElementById('w-total');
    if (el) {
      el.textContent = total;
      if (el.parentElement)
        el.parentElement.style.color = total === 100 ? '' : '#dc3545';
    }
  }

  // (3c) Gắn sự kiện cho 5 slider — GỌI hàm này trong buildModal thay cho vòng ['near','free','fast']
  window._bindDispatchSliders = function () {
    DIMS.forEach((k) => {
      const el = document.getElementById('slider-' + k);
      if (el) el.addEventListener('input', () => window.rebalanceSliders(k));
    });
  };

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

    // BSL chuyên gia chọn (lọc CỨNG). QSM/turnaround KHÔNG nhập — chỉ vào chấm điểm.
    const bslRaw = document.getElementById('disp-bsl')?.value;
    S.minBsl = bslRaw ? parseInt(bslRaw) : null;
    S.minQsm = null;
    S.maxTurnaround = null;

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
      '<div class="text-center p-4"><span class="spinner-border"></span> Đang tìm phòng xét nghiệm tối ưu...</div>';
    _hideDispatchMap();

    try {
      const result = await window.LabDispatch.findBestLabs({
        testTypeId: S.testTypeId,
        sampleCount: S.sampleCount,
        originLat: S.lat,
        originLng: S.lng,
        preset: S.preset,
        weights: S.weights,
        minBsl: S.minBsl,
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

    // Định nghĩa osrmWarn TRƯỚC mọi nhánh (sửa bug dùng trước khai báo)
    const osrmWarn =
      meta.osrmFailures > 0
        ? `<div class="alert alert-warning py-1 px-2 mb-2"><small><i class='bx bx-wifi-off'></i>
         ${meta.osrmFailures}/${meta.afterExclude} tuyến dùng khoảng cách ước lượng (dịch vụ chỉ đường tạm gián đoạn).
         Thời gian/quãng đường có thể chưa chính xác.</small></div>`
        : '';

    if (!ranked.length) {
      const tt = _testTypes.find((t) => t.id === S.testTypeId);
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
          <small>Nguyên nhân có thể: chưa PXN nào đạt cấp an toàn sinh học bạn yêu cầu (ATSH cấp ${
            S.minBsl ?? '?'
          }),
          chưa khai báo năng lực loại này, hoặc tất cả đã bị loại trừ.
          Có thể thử hạ cấp ATSH yêu cầu (nếu phù hợp với tác nhân).</small>
        </div>`;
      if (typeof window.showPendingSuggestions === 'function')
        window.showPendingSuggestions(S.incidentId, S.testTypeId);
      if (window.LabDispatchMap) window.LabDispatchMap.clear();
      return;
    }

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

        // QSM + cấp năng lực (capability_tier — tính từ QSM + kỹ thuật)
        const qsmBadge = lab.qsm_label
          ? `<span class="badge bg-info text-dark">${esc(lab.qsm_label)}</span>`
          : `<span class="badge bg-light text-muted">Chưa có QSM</span>`;
        const netBadge =
          lab.capability_tier != null
            ? `<span class="badge bg-secondary">Cấp năng lực ${lab.capability_tier}</span>`
            : '';

        // Cảnh báo mềm (chỉ còn công suất — QSM/turnaround không còn là ngưỡng nhập)
        const warnHtml = '';

        // Đầu mối liên hệ — KEY cho RRT
        const contactHtml =
          lab.head_name || lab.head_phone
            ? `<div class="mt-1 p-2 rounded" style="background:#f0fdf4;border:1px solid #bbf7d0;">
                 <small class="d-block text-muted">Đầu mối PXN</small>
                 <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
                   <span><i class='bx bx-user'></i> <b>${esc(
                     lab.head_name || '—'
                   )}</b></span>
                   ${
                     lab.head_phone
                       ? `<a href="tel:${esc(
                           lab.head_phone
                         )}" class="btn btn-sm btn-success py-0"><i class='bx bx-phone'></i> ${esc(
                           lab.head_phone
                         )}</a>`
                       : ''
                   }
                 </div>
                 ${
                   lab.head_email
                     ? `<small><a href="mailto:${esc(
                         lab.head_email
                       )}"><i class='bx bx-envelope'></i> ${esc(
                         lab.head_email
                       )}</a></small>`
                     : ''
                 }
               </div>`
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
                  <span class="badge bg-dark">ATSH ${lab.bsl_level}</span>
                </div>
                <small class="text-muted d-block">${esc(
                  lab.level || ''
                )} · ${esc(lab.address || '')}</small>
                <div class="mt-1 d-flex flex-wrap gap-1">${qsmBadge} ${netBadge}</div>
                <div class="mt-1 d-flex flex-wrap gap-3">
                  <small><i class='bx bx-map-pin'></i> <b>${
                    lab.route.km
                  } km</b>${srcNote}</small>
                  <small><i class='bx bx-time'></i> <b>${
                    lab.route.minutes
                  } phút</b></small>
                  <small><i class='bx bx-timer'></i> Trả KQ: <b>${
                    lab.turnaround_hours != null
                      ? lab.turnaround_hours + 'h'
                      : '—'
                  }</b></small>
                  ${enoughBadge}
                </div>
                ${warnHtml}
                ${contactHtml}
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
            <div class="mt-1 d-flex gap-1" style="height:5px;" title="Gần nhất ${
              lab.scores.gan
            } · Còn nhận mẫu ${lab.scores.trong} · Trả Kết quả nhanh ${
          lab.scores.nhanh
        } · Chất lượng (QSM) ${lab.scores.chatLuong} · Năng lực Xét nghiệm ${
          lab.scores.mangLuoi
        }">
              <div style="flex:${
                lab.scores.gan
              };background:#16a34a;border-radius:3px;"></div>
              <div style="flex:${
                lab.scores.trong
              };background:#0ea5e9;border-radius:3px;"></div>
              <div style="flex:${
                lab.scores.nhanh
              };background:#f59e0b;border-radius:3px;"></div>
              <div style="flex:${
                lab.scores.chatLuong
              };background:#8b5cf6;border-radius:3px;"></div>
              <div style="flex:${
                lab.scores.mangLuoi
              };background:#64748b;border-radius:3px;"></div>
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
        <small class="text-muted"><i class='bx bx-bulb'></i> 🟢Gần nhất   🔵Còn nhận mẫu   🟠Trả Kết quả nhanh   🟣Chất lượng (QSM)   ⚫Năng lực Xét nghiệm</small>
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
      {
        urgent: '⚡ Khẩn',
        balanced: '⚖️ Cân bằng',
        capacity: '📦 Nhiều mẫu',
        quality: '🏅 Chất lượng',
      }[meta.preset] || meta.preset
    );
  }

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
  // NHẬP TỌA ĐỘ (trang bản đồ)
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
    '[lab-dispatch-modal.js] ✅ Dispatch Modal (tiêu chí chuyên gia + QSM/đầu mối) sẵn sàng.'
  );
})();
