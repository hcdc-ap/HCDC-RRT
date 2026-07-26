// ============================================================================
// CHỈ ĐƯỜNG TỪNG BƯỚC (TURN-BY-TURN) — Hướng A
// Hệ thống RRT-HCDC
// ----------------------------------------------------------------------------
// Gọi OSRM với steps=true để lấy hướng dẫn chi tiết A→B, hiện trong 1 modal.
// Giữ nguyên tiếng Anh của OSRM (không dịch).
//
// TÁCH RIÊNG khỏi engine: chỉ gọi khi người dùng bấm "Xem chỉ đường" trong
// popup PXN — không làm nặng luồng tìm kiếm chính.
//
// NHÚNG (sau lab-dispatch-map-mode.js):
//   <script src="lab-route-steps.js"></script>
//
// DÙNG: window.LabRouteSteps.show(originLat, originLng, destLat, destLng, labName)
// ============================================================================

(function () {
  'use strict';

  const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
  const TIMEOUT_MS = 6000;

  const esc = (s) =>
    window.escapeHtml
      ? window.escapeHtml(String(s ?? ''))
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

  // Icon Boxicons theo loại maneuver của OSRM (giữ nguyên, chỉ chọn icon)
  function maneuverIcon(step) {
    const type = step.maneuver?.type || '';
    const modifier = step.maneuver?.modifier || '';
    if (type === 'depart') return 'bx-map-pin';
    if (type === 'arrive') return 'bx-flag';
    if (type === 'roundabout' || type === 'rotary') return 'bx-loader-circle';
    if (modifier.includes('left')) return 'bx-left-arrow-alt';
    if (modifier.includes('right')) return 'bx-right-arrow-alt';
    if (modifier === 'straight' || type === 'continue')
      return 'bx-up-arrow-alt';
    return 'bx-navigation';
  }

  // Ghép mô tả 1 bước từ dữ liệu OSRM (tiếng Anh nguyên bản)
  function describeStep(step) {
    const m = step.maneuver || {};
    const road = step.name || '';
    const type = m.type || '';
    const modifier = m.modifier || '';
    // Ghép câu tiếng Anh giống định dạng navigation phổ biến
    let text = '';
    if (type === 'depart') text = 'Depart';
    else if (type === 'arrive') text = 'Arrive at destination';
    else if (type === 'roundabout' || type === 'rotary') {
      text = m.exit
        ? `Take exit ${m.exit} at the roundabout`
        : 'Enter the roundabout';
    } else if (type === 'turn') text = `Turn ${modifier || ''}`.trim();
    else if (type === 'continue')
      text = `Continue ${modifier || 'straight'}`.trim();
    else if (type === 'merge') text = `Merge ${modifier || ''}`.trim();
    else if (type === 'fork')
      text = `Keep ${modifier || ''} at the fork`.trim();
    else if (type === 'end of road')
      text = `Turn ${modifier || ''} at the end of the road`.trim();
    else if (type === 'new name') text = 'Continue';
    else text = (type ? type : 'Proceed') + (modifier ? ' ' + modifier : '');
    if (road) text += ` onto ${road}`;
    return text;
  }

  function fmtDist(m) {
    if (m == null) return '';
    return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
  }
  function fmtDur(s) {
    if (s == null) return '';
    const min = Math.round(s / 60);
    return min < 1 ? '<1 phút' : min + ' phút';
  }

  window.LabRouteSteps = {
    show: async function (originLat, originLng, destLat, destLng, labName) {
      // Mở modal trạng thái "đang tải"
      _renderModal(
        labName,
        '<div class="text-center p-4"><span class="spinner-border"></span> Đang tải chỉ đường...</div>'
      );

      const url =
        `${OSRM_BASE}/${originLng},${originLat};${destLng},${destLat}` +
        `?overview=false&steps=true&geometries=geojson`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error('OSRM HTTP ' + res.status);
        const data = await res.json();
        if (data.code !== 'Ok' || !data.routes?.length)
          throw new Error('OSRM no route');

        const route = data.routes[0];
        const legs = route.legs || [];
        const steps = legs.length ? legs[0].steps || [] : [];

        if (!steps.length) {
          _updateBody(
            '<div class="alert alert-warning m-2">Không có dữ liệu chỉ đường chi tiết cho tuyến này.</div>'
          );
          return;
        }

        const totalKm = (route.distance / 1000).toFixed(1);
        const totalMin = Math.round(route.duration / 60);

        const rows = steps
          .map((s, i) => {
            const icon = maneuverIcon(s);
            const desc = describeStep(s);
            const dist = fmtDist(s.distance);
            return `
            <div class="d-flex align-items-start gap-2 py-2 ${
              i < steps.length - 1 ? 'border-bottom' : ''
            }">
              <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:#e0f2f1;
                   display:flex;align-items:center;justify-content:center;color:#00695c;">
                <i class='bx ${icon}'></i>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;">${esc(desc)}</div>
                ${dist ? `<small class="text-muted">${dist}</small>` : ''}
              </div>
              <div style="flex-shrink:0;color:#9ca3af;font-size:11px;">${
                i + 1
              }</div>
            </div>`;
          })
          .join('');

        const body = `
          <div class="d-flex justify-content-between align-items-center mb-2 px-1">
            <span class="badge bg-info text-dark"><i class='bx bx-map-pin'></i> ${totalKm} km</span>
            <span class="badge bg-secondary"><i class='bx bx-time'></i> ~${totalMin} phút</span>
            <span class="badge bg-light text-dark">${steps.length} bước</span>
          </div>
          <div style="max-height:50vh;overflow-y:auto;" class="px-1">${rows}</div>
          <div class="mt-2 px-1"><small class="text-muted"><i class='bx bx-info-circle'></i>
            Tài xế nên dùng kèm ứng dụng bản đồ khi di chuyển thực tế.</small></div>`;
        _updateBody(body);
      } catch (err) {
        clearTimeout(timer);
        _updateBody(`<div class="alert alert-warning m-2">
          Không lấy được chỉ đường chi tiết (${esc(err.message)}).<br>
          <small>Dịch vụ chỉ đường có thể tạm gián đoạn. Vẫn có thể xem tuyến tổng quát trên bản đồ.</small>
        </div>`);
      }
    },
  };

  function _renderModal(labName, bodyHtml) {
    document.getElementById('route-steps-wrapper')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'route-steps-wrapper';
    wrap.innerHTML = `
      <div class="modal fade" id="routeStepsModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header" style="background:#006a75;color:#fff;">
              <h5 class="modal-title"><i class='bx bx-directions'></i> Chỉ đường: ${esc(
                labName || 'Phòng xét nghiệm'
              )}</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="route-steps-body">${bodyHtml}</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const modalEl = document.getElementById('routeStepsModal');
    new bootstrap.Modal(modalEl).show();
    modalEl.addEventListener(
      'hidden.bs.modal',
      () => {
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
  }

  function _updateBody(html) {
    const body = document.getElementById('route-steps-body');
    if (body) body.innerHTML = html;
  }

  console.log(
    '[lab-route-steps.js] ✅ Chỉ đường turn-by-turn sẵn sàng. (window.LabRouteSteps)'
  );
})();
