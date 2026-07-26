// ============================================================================
// LỚP PHÒNG XÉT NGHIỆM TRÊN BẢN ĐỒ — Bước 1 (nền tảng)
// Hệ thống RRT-HCDC
// ----------------------------------------------------------------------------
// Module ĐỘC LẬP, không sửa code bản đồ hiện có. Ghép vào bằng 2 dòng trong
// renderMapPage() (xem cuối file).
//
// Tính năng Bước 1:
//   • Load PXN 1 lần + cache (không query lại mỗi lần bật/tắt)
//   • Marker hình theo TUYẾN: ★ trung ương · ⬢ tỉnh/thành · ● xã/phường
//   • Màu tĩnh: xanh = đang hoạt động, xám = tạm ngừng (KHÔNG phải tải trọng)
//   • Clustering (Leaflet.markercluster) khi có hàng trăm điểm — fallback
//     layerGroup thường nếu chưa nhúng thư viện
//   • Popup dashboard-mini LAZY: chỉ query năng lực khi click 1 điểm
//     (phương án A — chỉ năng lực tĩnh, KHÔNG tải trọng động)
//   • Đăng ký vào L.control.layers để bật/tắt
//
// NHÚNG (sau leaflet + markercluster):
//   <script src="lab-map-layer.js"></script>
//
// PHỤ THUỘC nhúng sẵn trong index.html:
//   <link href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" rel="stylesheet"/>
//   <link href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" rel="stylesheet"/>
//   <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
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

  // Cache PXN (load 1 lần)
  let _labsCache = null;
  let _labLayer = null; // cluster group hoặc layerGroup
  let _layersControl = null; // L.control.layers (tạo 1 lần)

  const LEVEL_LABELS = {
    trung_uong: 'Tuyến Trung ương',
    tinh_thanh: 'Tuyến Tỉnh/Thành phố',
    xa_phuong: 'Tuyến Xã/Phường',
  };

  // Icon hình theo tuyến (SVG divIcon). Màu theo trạng thái hoạt động.
  function labIcon(level, isActive) {
    const color = isActive ? '#0d9488' : '#9ca3af'; // teal / xám
    const stroke = '#ffffff';
    let shape;
    if (level === 'trung_uong') {
      // Ngôi sao (tuyến cao nhất)
      shape = `<polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9"
                 fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`;
    } else if (level === 'tinh_thanh') {
      // Lục giác
      shape = `<polygon points="12,2 21,7 21,17 12,22 3,17 3,7"
                 fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`;
    } else {
      // Tròn (xã/phường)
      shape = `<circle cx="12" cy="12" r="9" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`;
    }
    const svg = `<svg width="26" height="26" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
         ${shape}
         <text x="12" y="15" text-anchor="middle" font-size="9" fill="#fff" font-weight="bold">XN</text>
       </svg>`;
    return L.divIcon({
      className: 'lab-map-icon',
      html: svg,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -13],
    });
  }

  // ------------------------------------------------------------------
  // LOAD PXN (cache). Chỉ query 1 lần cho cả phiên.
  // ------------------------------------------------------------------
  async function loadLabs(force) {
    if (_labsCache && !force) return _labsCache;
    try {
      const { data, error } = await window.supabaseClient
        .from('laboratories')
        .select(
          'id, name, address, phone, lat, lng, level, bsl_level, is_active'
        );
      if (error) throw error;
      _labsCache = (data || []).filter((l) => l.lat != null && l.lng != null);
      return _labsCache;
    } catch (e) {
      console.error('[lab-map] Lỗi tải PXN:', e);
      _labsCache = [];
      return _labsCache;
    }
  }

  // ------------------------------------------------------------------
  // POPUP DASHBOARD-MINI (lazy: query năng lực khi click)
  // Phương án A: chỉ NĂNG LỰC TĨNH (loại XN + công suất tối đa + trả KQ),
  // KHÔNG hiện tải trọng động (để dành cho Dispatch Mode).
  // ------------------------------------------------------------------
  async function buildLabPopupContent(lab) {
    // Khung cơ bản hiện ngay, phần năng lực tải sau
    const bslBadge = `<span style="background:#1f2937;color:#fff;padding:1px 6px;border-radius:4px;font-size:11px;">BSL-${
      lab.bsl_level ?? '?'
    }</span>`;
    const levelText = LEVEL_LABELS[lab.level] || lab.level || '—';
    const statusText = lab.is_active
      ? '<span style="color:#0d9488;font-weight:bold;">● Đang hoạt động</span>'
      : '<span style="color:#9ca3af;font-weight:bold;">● Tạm ngừng</span>';
    const phone = lab.phone
      ? `<a href="tel:${esc(lab.phone)}" style="color:#0369a1;">${esc(
          lab.phone
        )}</a>`
      : '<span style="color:#9ca3af;">—</span>';

    let capHtml =
      '<div style="color:#9ca3af;font-size:12px;padding:6px 0;"><span class="spinner-border spinner-border-sm"></span> Đang tải năng lực...</div>';

    const container = document.createElement('div');
    container.style.minWidth = '260px';
    container.style.fontFamily = "'Inter',sans-serif";
    container.innerHTML = `
      <div style="border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:6px;">
        <div style="font-weight:bold;color:#0f766e;font-size:14px;">${esc(
          lab.name
        )}</div>
        <div style="font-size:12px;color:#6b7280;">${esc(
          lab.address || ''
        )}</div>
      </div>
      <div style="font-size:12px;line-height:1.7;">
        <div>${bslBadge} &nbsp; ${esc(levelText)}</div>
        <div>${statusText}</div>
        <div><i class='bx bx-phone'></i> Hotline: ${phone}</div>
      </div>
      <div style="border-top:1px dashed #cbd5e1;margin:6px 0;"></div>
      <div style="font-weight:bold;font-size:12px;color:#0369a1;margin-bottom:3px;">
        <i class='bx bx-list-check'></i> Năng lực xét nghiệm
      </div>
      <div class="lab-popup-caps" style="font-size:12px;">${capHtml}</div>
    `;

    // Lazy load năng lực
    (async () => {
      try {
        const { data, error } = await window.supabaseClient
          .from('lab_capabilities')
          .select(
            'max_capacity_per_day, turnaround_hours, test_types(name, required_bsl)'
          )
          .eq('lab_id', lab.id);
        if (error) throw error;

        const capBox = container.querySelector('.lab-popup-caps');
        if (!capBox) return;

        if (!data || data.length === 0) {
          capBox.innerHTML =
            '<span style="color:#9ca3af;font-style:italic;">Chưa khai báo năng lực.</span>';
          return;
        }

        capBox.innerHTML = `
          <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
            <thead>
              <tr style="color:#6b7280;text-align:left;">
                <th style="padding:2px 4px;">Loại XN</th>
                <th style="padding:2px 4px;text-align:center;">CS/ngày</th>
                <th style="padding:2px 4px;text-align:center;">Trả KQ</th>
              </tr>
            </thead>
            <tbody>
              ${data
                .map(
                  (c) => `
                <tr style="border-top:1px solid #f1f5f9;">
                  <td style="padding:2px 4px;">${esc(
                    c.test_types?.name || '—'
                  )}</td>
                  <td style="padding:2px 4px;text-align:center;">${
                    c.max_capacity_per_day
                  }</td>
                  <td style="padding:2px 4px;text-align:center;">${
                    c.turnaround_hours != null ? c.turnaround_hours + 'h' : '—'
                  }</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>`;
      } catch (e) {
        const capBox = container.querySelector('.lab-popup-caps');
        if (capBox)
          capBox.innerHTML =
            '<span style="color:#dc2626;">Lỗi tải năng lực.</span>';
      }
    })();

    return container;
  }

  // ------------------------------------------------------------------
  // TẠO LỚP PXN (cluster nếu có thư viện, không thì layerGroup thường)
  // ------------------------------------------------------------------
  function createLabLayer(labs) {
    const useCluster = typeof L.markerClusterGroup === 'function';
    const group = useCluster
      ? L.markerClusterGroup({
          maxClusterRadius: 50,
          spiderfyOnMaxZoom: true,
          chunkedLoading: true, // load mượt với hàng trăm điểm
        })
      : L.layerGroup();

    if (!useCluster) {
      console.warn(
        '[lab-map] Chưa nhúng Leaflet.markercluster — dùng marker thường. ' +
          'Với hàng trăm điểm nên nhúng thư viện để tránh đè marker.'
      );
    }

    labs.forEach((lab) => {
      const marker = L.marker([lab.lat, lab.lng], {
        icon: labIcon(lab.level, lab.is_active),
      });
      // Tooltip nhanh (tên) + popup dashboard (lazy) khi click
      marker.bindTooltip(esc(lab.name), {
        direction: 'top',
        offset: L.point(0, -13),
      });
      marker.on('click', async function () {
        const content = await buildLabPopupContent(lab);
        marker.bindPopup(content, { maxWidth: 320 }).openPopup();
      });
      group.addLayer(marker);
    });

    return group;
  }

  // ------------------------------------------------------------------
  // API CHÍNH: gắn lớp PXN vào bản đồ + đăng ký vào layers control.
  //   Gọi từ renderMapPage(): window.LabMapLayer.attach(map, { show: false })
  //   • map: Leaflet map instance (biến `map` trong module bản đồ của bạn)
  //   • opts.show: true = hiện sẵn, false = tắt sẵn (mặc định false)
  //   • opts.otherOverlays: object các lớp khác muốn gộp vào control
  //       VD { 'Thành viên RRT': markersLayerGroupInstance, 'Sự kiện': incidentsLayerGroup }
  // ------------------------------------------------------------------
  window.LabMapLayer = {
    attach: async function (map, opts = {}) {
      if (!map || typeof L === 'undefined') {
        console.warn('[lab-map] Thiếu map hoặc Leaflet.');
        return;
      }

      const labs = await loadLabs();

      // Tạo lại lớp (nếu attach nhiều lần, gỡ cái cũ)
      if (_labLayer && map.hasLayer(_labLayer)) map.removeLayer(_labLayer);
      _labLayer = createLabLayer(labs);

      if (opts.show) _labLayer.addTo(map);

      // CHẾ ĐỘ STANDALONE: chỉ trả layer, KHÔNG tự tạo control.
      // Module bản đồ chính sẽ gom _labLayer vào L.control.layers chung.
      if (opts.standalone) {
        return { layer: _labLayer, count: labs.length };
      }

      // Chế độ tự quản (dùng khi module bản đồ chính không quản control)
      const overlays = { '🧪 Phòng xét nghiệm': _labLayer };
      if (opts.otherOverlays && typeof opts.otherOverlays === 'object') {
        Object.entries(opts.otherOverlays).forEach(([name, layer]) => {
          if (layer) overlays[name] = layer;
        });
      }

      if (!_layersControl) {
        _layersControl = L.control
          .layers(null, overlays, {
            collapsed: true,
            position: 'topright',
          })
          .addTo(map);
      } else {
        _layersControl.addOverlay(_labLayer, '🧪 Phòng xét nghiệm');
      }

      return {
        layer: _labLayer,
        count: labs.length,
        control: _layersControl,
      };
    },

    // Nạp lại dữ liệu PXN (VD sau khi admin thêm PXN mới) + vẽ lại
    reload: async function (map, opts = {}) {
      await loadLabs(true); // force
      return window.LabMapLayer.attach(map, opts);
    },

    // Lấy cache PXN (cho Dispatch Mode ở Bước 2 tái dùng, khỏi query lại)
    getCache: function () {
      return _labsCache;
    },

    // Legend HTML cho hình dạng tuyến (bên ngoài tự chèn vào legend nếu muốn)
    legendHtml: function () {
      return `
        <hr style="margin:4px 0;">
        <b>Phòng xét nghiệm</b><br>
        <span style="font-size:13px;">★</span> Tuyến Trung ương<br>
        <span style="font-size:13px;">⬢</span> Tuyến Tỉnh/Thành<br>
        <span style="font-size:13px;">●</span> Tuyến Xã/Phường<br>
        <i style="background:#0d9488;width:12px;height:12px;display:inline-block;border-radius:3px;"></i> Đang hoạt động<br>
        <i style="background:#9ca3af;width:12px;height:12px;display:inline-block;border-radius:3px;"></i> Tạm ngừng`;
    },
  };

  console.log(
    '[lab-map-layer.js] ✅ Lớp PXN trên bản đồ sẵn sàng. (window.LabMapLayer)'
  );
})();

/* ============================================================================
   CÁCH GHÉP VÀO renderMapPage() — thêm 2-3 dòng, KHÔNG sửa gì khác
   ----------------------------------------------------------------------------
   Trong renderMapPage(), SAU khi đã có markersLayerGroupInstance +
   incidentsLayerGroup + renderMap() (tức bản đồ đã vẽ xong), thêm:

     // Gắn lớp PXN + gộp các lớp có sẵn vào 1 control bật/tắt
     if (window.LabMapLayer) {
       await window.LabMapLayer.attach(map, {
         show: false,                       // mặc định tắt, người dùng tự bật
         otherOverlays: {
           'Thành viên RRT': markersLayerGroupInstance,
           'Sự kiện': incidentsLayerGroup,
         },
       });
     }

   (Tùy chọn) chèn chú thích tuyến vào legend hiện có — trong addLegend(),
   thêm vào cuối div.innerHTML:
     if (window.LabMapLayer) div.innerHTML += window.LabMapLayer.legendHtml();
============================================================================ */
