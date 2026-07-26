// ============================================================================
// BƯỚC 2 — DISPATCH MODE TRÊN BẢN ĐỒ (chiếu kết quả điều phối lên bản đồ nền)
// Hệ thống RRT-HCDC
// ----------------------------------------------------------------------------
// TÁI DÙNG hoàn toàn: engine (LabDispatch), Dispatch Modal (S.lastResult),
// lớp PXN (LabMapLayer). KHÔNG viết lại logic chấm điểm/OSRM.
//
// Ý tưởng: khi Dispatch Modal có kết quả VÀ đang ở trang Bản đồ, chiếu kết quả
// (điểm sự cố + Top 3 + tuyến OSRM) lên BẢN ĐỒ LỚN phía sau; làm mờ lớp nền để
// nổi bật. Bản đồ CHỈ ĐỂ XEM — chốt điều mẫu vẫn qua modal.
//
// NHÚNG (sau lab-dispatch-modal.js + lab-map-layer.js + map-module-v2.js):
//   <script src="lab-dispatch-map-mode.js"></script>
//
// CÁCH KÍCH HOẠT (2 cách, chọn 1):
//   (A) Tự động: mỗi khi modal render kết quả, tự chiếu lên bản đồ nếu đang mở
//       trang bản đồ. → gọi window.LabDispatchMap.project(result, origin) từ
//       renderResults() của modal (thêm 1 dòng — xem cuối file).
//   (B) Thủ công: thêm nút "Xem trên bản đồ lớn" trong modal.
//
// PHỤ THUỘC: cần map instance. Module bản đồ v2 giữ `map` trong scope riêng;
// file này lấy map qua window._getLeafletMap() (thêm 1 dòng export — xem cuối).
// ============================================================================

(function () {
  'use strict';

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

  const RANK_COLORS = ['#16a34a', '#0ea5e9', '#f59e0b'];
  const FALLBACK_COLOR = '#6b7280';

  // Lớp riêng chứa mọi thứ vẽ ra ở dispatch mode (dễ xóa sạch)
  let _dispatchLayer = null;
  let _dimApplied = false;
  let _mapRef = null;

  function getMap() {
    if (_mapRef) return _mapRef;
    if (typeof window._getLeafletMap === 'function') {
      _mapRef = window._getLeafletMap();
    }
    return _mapRef;
  }

  // Đảm bảo pane riêng biệt cho dispatch layer
  function ensureDispatchPane(map) {
    const paneName = 'dispatch-pane';
    if (!map.getPane(paneName)) {
      const pane = map.createPane(paneName);
      pane.style.zIndex = '700';
      pane.style.pointerEvents = 'all';
    }
  }

  // Có đang ở trang bản đồ không (để quyết định có chiếu hay không)
  function isMapPageVisible() {
    // Đáng tin hơn: kiểm tra container bản đồ có kích thước thật trên màn hình.
    // Không phụ thuộc cách app ẩn/hiện trang (style.display / class / v.v.)
    const mapEl = document.getElementById('containerMap');
    if (!mapEl) return false;
    const rect = mapEl.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0; // đang hiển thị thật
  }

  // ------------------------------------------------------------------
  // LÀM MỜ lớp nền để nổi bật dispatch (grayscale + giảm opacity)
  // ------------------------------------------------------------------
  function applyDim() {
    const map = getMap();
    if (!map || _dimApplied) return;

    const container = map.getContainer();

    // Làm mờ các pane nền, trừ dispatch-pane và popup-pane
    const panesToDim = container.querySelectorAll(
      '.leaflet-tile-pane, ' +
        '.leaflet-overlay-pane:not([pane="dispatch-pane"]), ' +
        '.leaflet-marker-pane:not([pane="dispatch-pane"])'
    );

    panesToDim.forEach((p) => {
      p.style.transition = 'filter 0.3s, opacity 0.3s';
      p.style.filter = 'grayscale(0.85)';
      p.style.opacity = '0.45';
    });

    // Đảm bảo dispatch-pane và popup-pane không bị mờ
    const dispatchPane = container.querySelector('[pane="dispatch-pane"]');
    if (dispatchPane) {
      dispatchPane.style.filter = '';
      dispatchPane.style.opacity = '';
    }

    const popupPane = container.querySelector('.leaflet-popup-pane');
    if (popupPane) {
      popupPane.style.filter = '';
      popupPane.style.opacity = '';
    }

    _dimApplied = true;
  }

  function removeDim() {
    const map = getMap();
    if (!map) return;

    const container = map.getContainer();
    const panes = container.querySelectorAll(
      '.leaflet-tile-pane, .leaflet-overlay-pane, .leaflet-marker-pane, .leaflet-popup-pane'
    );
    panes.forEach((p) => {
      p.style.filter = '';
      p.style.opacity = '';
    });

    _dimApplied = false;
  }

  // ------------------------------------------------------------------
  // Màu tải trọng ĐỘNG (giờ đã biết loại XN → tô chính xác)
  //   >=70% còn trống → xanh; 20–70% → vàng; <20% hoặc không đủ → đỏ
  // ------------------------------------------------------------------
  function loadColor(lab) {
    const maxCap = lab.max_capacity_per_day || 0;
    if (maxCap <= 0) return '#9ca3af';
    const ratio = (lab.remaining_today ?? 0) / maxCap;
    if (!lab.is_enough) return '#dc2626'; // không đủ cho lô này → đỏ
    if (ratio >= 0.7) return '#16a34a'; // còn nhiều → xanh
    if (ratio >= 0.2) return '#f59e0b'; // vơi → vàng
    return '#dc2626'; // gần cạn → đỏ
  }

  // ------------------------------------------------------------------
  // CHIẾU KẾT QUẢ LÊN BẢN ĐỒ
  //   result: object trả về từ LabDispatch.findBestLabs (S.lastResult)
  //   origin: { lat, lng, name }
  // ------------------------------------------------------------------
  window.LabDispatchMap = {
    project: function (result, origin) {
      const map = getMap();
      if (!map || typeof L === 'undefined') {
        console.warn('[dispatch-map] Không có map để chiếu.');
        return;
      }
      if (!result || !result.ranked || !origin) return;
      if (!isMapPageVisible()) return; // chỉ chiếu khi đang xem bản đồ

      this.clear();
      applyDim();

      ensureDispatchPane(map);
      _dispatchLayer = L.layerGroup().addTo(map);

      // Gán lớp vào pane riêng để nổi bật
      _dispatchLayer.getLayerId = () => 'dispatch-group';
      _dispatchLayer.eachLayer((layer) => {
        if (layer instanceof L.Polyline) {
          layer.options.pane = 'dispatch-pane';
          layer.redraw();
        } else if (layer instanceof L.Marker) {
          layer.options.pane = 'dispatch-pane';
        }
      });

      // Marker điểm sự cố (A) — nổi bật trên nền mờ
      const originMarker = L.marker([origin.lat, origin.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#dc2626;color:#fff;border-radius:50%;width:30px;height:30px;
                   display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;
                   box-shadow:0 0 8px rgba(220,38,38,.8);border:2px solid #fff;">A</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        zIndexOffset: 1000,
        pane: 'dispatch-pane',
      }).addTo(_dispatchLayer);
      originMarker.bindPopup(
        `<b>Sự kiện khẩn cấp</b><br>${esc(origin.name || '')}`,
        {
          pane: 'popupPane', // giữ popup trong pane riêng
        }
      );

      const top = result.top || [];
      const bounds = [[origin.lat, origin.lng]];

      // Vẽ Top 3: tuyến OSRM + marker màu hạng
      top.forEach((lab) => {
        const color =
          lab.rank <= 3 ? RANK_COLORS[lab.rank - 1] : FALLBACK_COLOR;
        const isTop1 = lab.rank === 1;

        // Tuyến đường
        if (lab.route?.geometry?.coordinates) {
          const coords = lab.route.geometry.coordinates.map((c) => [
            c[1],
            c[0],
          ]);
          L.polyline(coords, {
            color,
            weight: isTop1 ? 6 : 4,
            opacity: isTop1 ? 0.95 : 0.6,
            dashArray: isTop1 ? null : '8,6',
            pane: 'dispatch-pane',
          }).addTo(_dispatchLayer);
          coords.forEach((c) => bounds.push(c));
        }

        // Marker PXN: viền = hạng, nền = tải trọng động
        const fill = loadColor(lab);
        const marker = L.marker([lab.lat, lab.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="background:${fill};border:3px solid ${color};color:#fff;border-radius:50%;
                     width:${isTop1 ? 34 : 28}px;height:${
              isTop1 ? 34 : 28
            }px;display:flex;align-items:center;
                     justify-content:center;font-weight:bold;font-size:${
                       isTop1 ? 15 : 12
                     }px;
                     box-shadow:0 0 6px rgba(0,0,0,.5);">${lab.rank}</div>`,
            iconSize: [isTop1 ? 34 : 28, isTop1 ? 34 : 28],
            iconAnchor: [isTop1 ? 17 : 14, isTop1 ? 17 : 14],
          }),
          zIndexOffset: 900 - lab.rank,
          pane: 'dispatch-pane',
        }).addTo(_dispatchLayer);

        marker.bindPopup(
          `
          <div style="min-width:200px;font-family:'Inter',sans-serif;">
            <div style="font-weight:bold;color:${color};">#${lab.rank} ${
            lab.rank === 1 ? 'TỐI ƯU' : 'Dự phòng ' + lab.rank
          }</div>
            <div style="font-weight:bold;">${esc(lab.lab_name)}</div>
            <div style="font-size:12px;color:#6b7280;">${esc(
              lab.address || ''
            )}</div>
            <hr style="margin:6px 0;">
            <div style="font-size:12px;line-height:1.6;">
              <div><i class='bx bx-map-pin'></i> ${lab.route.km} km · ${
            lab.route.minutes
          } phút
                ${
                  lab.route.source === 'haversine'
                    ? '<span style="color:#9ca3af;">(ước lượng)</span>'
                    : ''
                }</div>
              <div><i class='bx bx-timer'></i> Trả KQ: ${
                lab.turnaround_hours != null ? lab.turnaround_hours + 'h' : '—'
              }</div>
              <div><i class='bx bx-box'></i> Còn nhận: <b style="color:${fill};">${
            lab.remaining_today
          }</b> mẫu
                ${
                  lab.is_enough
                    ? ''
                    : '<span style="color:#dc2626;"> (không đủ)</span>'
                }</div>
              <div><i class='bx bx-bar-chart'></i> Điểm: <b>${
                lab.scores.total
              }</b></div>
            </div>
            <button class="btn btn-sm btn-outline-primary w-100 mt-2"
            onclick="window.LabRouteSteps.show(${origin.lat}, ${origin.lng}, ${
            lab.lat
          }, ${lab.lng}, '${esc(lab.lab_name).replace(/'/g, "\\'")}')">
            <i class='bx bx-directions'></i> Xem chỉ đường
          </button>
          </div>`,
          { maxWidth: 260 }
        );

        bounds.push([lab.lat, lab.lng]);
        if (isTop1) setTimeout(() => marker.openPopup(), 300);
      });

      // Ôm trọn điểm sự cố + Top 3
      if (bounds.length > 1) {
        try {
          map.fitBounds(L.latLngBounds(bounds).pad(0.2));
        } catch (_) {}
      }

      // Nút "Thoát chế độ điều phối" nổi trên bản đồ
      _addExitButton();
    },

    clear: function () {
      const map = getMap();
      if (_dispatchLayer && map) {
        map.removeLayer(_dispatchLayer);
        _dispatchLayer = null;
      }
      _removeExitButton();
      removeDim();
    },
  };

  // ------------------------------------------------------------------
  // Nút thoát chế độ điều phối (nổi góc trái dưới bản đồ)
  // ------------------------------------------------------------------
  let _exitCtrl = null;
  function _addExitButton() {
    const map = getMap();
    if (!map || _exitCtrl) return;
    _exitCtrl = L.control({ position: 'bottomleft' });
    _exitCtrl.onAdd = function () {
      const div = L.DomUtil.create('div', '');
      div.innerHTML = `
        <button style="background:#006a75;color:#fff;border:none;padding:8px 14px;border-radius:8px;
          font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;">
          <i class='bx bx-x'></i> Thoát chế độ điều phối
        </button>`;
      L.DomEvent.disableClickPropagation(div);
      div.querySelector('button').onclick = () => window.LabDispatchMap.clear();
      return div;
    };
    _exitCtrl.addTo(map);
  }
  function _removeExitButton() {
    if (_exitCtrl) {
      try {
        _exitCtrl.remove();
      } catch (_) {}
      _exitCtrl = null;
    }
  }

  console.log(
    '[lab-dispatch-map-mode.js] ✅ Dispatch Mode trên bản đồ sẵn sàng. (window.LabDispatchMap)'
  );
})();

/* ============================================================================
   TÍCH HỢP — thêm 2 dòng nhỏ, KHÔNG viết lại logic
   ----------------------------------------------------------------------------

   (1) EXPORT map từ module bản đồ v2:
       Trong map-module-v2.js, thêm vào cuối (trong scope có biến `map`):
         window._getLeafletMap = function () { return map; };

   (2) CHIẾU kết quả khi modal render xong:
       Trong lab-dispatch-modal.js, hàm renderResults(), NGAY SAU khi đã gọi
       renderDispatchActions + showPendingSuggestions (cuối hàm), thêm:

         // Chiếu kết quả lên bản đồ nền nếu đang ở trang Bản đồ (Bước 2)
         if (window.LabDispatchMap && ranked.length) {
           window.LabDispatchMap.project(result, {
             lat: S.lat, lng: S.lng, name: S.incidentName || 'Điểm sự kiện',
           });
         }

   (3) DỌN khi đóng modal:
       Trong lab-dispatch-modal.js, phần 'hidden.bs.modal' của dispatchModal,
       thêm 1 dòng (không bắt buộc — nếu muốn giữ hình trên bản đồ sau khi đóng
       modal thì BỎ QUA bước này):
         if (window.LabDispatchMap) window.LabDispatchMap.clear();

       → Khuyến nghị: KHÔNG clear khi đóng modal, để admin đóng modal vẫn xem
         được Top 3 + tuyến trên bản đồ lớn. Admin tự bấm "Thoát chế độ điều
         phối" khi xong. (Đúng tinh thần "bản đồ để xem".)
============================================================================ */
