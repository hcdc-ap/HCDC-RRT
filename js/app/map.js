// ============================================================
// MAP — Module bản đồ RRT-HCDC (choropleth, dân số, thành viên, sự cố)
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // Chia sẻ cho các file js/app/* khác (trước đây dùng chung 1 closure)
  rrtShared.renderMapPage = renderMapPage;


  // ============================================================================
  // MODULE BẢN ĐỒ RRT-HCDC — PHIÊN BẢN 2 (KIẾN TRÚC LAYER THỐNG NHẤT)
  // ----------------------------------------------------------------------------
  // Nâng cấp so với bản cũ:
  //   • MỌI lớp (choropleth phường, thành viên, sự cố, PXN) quản lý qua MỘT
  //     L.control.layers duy nhất → bật/tắt chuẩn, không còn add/remove thủ công
  //     tranh chấp (khắc phục lỗi "tắt sự kiện vẫn hiện").
  //   • Layer là ĐỐI TƯỢNG ỔN ĐỊNH: filter chỉ cập nhật NỘI DUNG bên trong
  //     (clearLayers + add lại marker), KHÔNG tạo layer mới → control không lệch.
  //   • Legend tự ẩn/hiện phần tương ứng khi bật/tắt lớp (overlayadd/remove).
  //   • Lớp PXN tích hợp sẵn qua window.LabMapLayer (Bước 1 đã viết).
  //
  // THAY TOÀN BỘ code bản đồ cũ bằng file này (đặt trong cùng IIFE/scope cũ).
  // HTML #page-map giữ nguyên. Bỏ checkbox #toggleFillMap cũ (giờ dùng control),
  // hoặc giữ lại cũng được — file này không phụ thuộc nó nữa.
  // ============================================================================

  // ============================================================
  // 1. BIẾN TOÀN CỤC & CSS
  // ============================================================
  let map;
  let geojsonData;
  let companyData = [];
  let filteredData = [];
  let incidentData = [];
  let geojsonBaseLayer;

  // Các LAYER ỔN ĐỊNH (tạo 1 lần, cập nhật nội dung bên trong)
  let choroplethLayer = null; // L.geoJSON (tô màu phường)
  let populationLayer = null;
  let membersLayer = null; // L.layerGroup (thành viên)
  let incidentsLayer = null; // L.layerGroup (sự cố)
  let membersMarkerMap = new Map(); // tra marker theo tọa độ (cho zoom-to)

  let layersControl = null; // L.control.layers DUY NHẤT
  let legendControl = null;
  let statsControl = null;

  // Trạng thái bật/tắt từng lớp
  const layerVisible = {
    choropleth: false,
    population: true, // BỔ SUNG: Mặc định tắt để không đè màu lớp RRT
    members: true,
    incidents: true,
    labs: true,
  };

  let mapPluginsReady = false;
  let mapEventsBound = false;

  const pulseCSS = `
    .incident-marker-active {
      background-color: #ff0000; border-radius: 50%;
      box-shadow: 0 0 0 rgba(255, 0, 0, 0.4);
      animation: pulse-red 1.5s infinite; border: 2px solid #fff;
    }
    .incident-marker-resolved {
      background-color: #6b7280; border-radius: 50%; border: 2px solid #fff;
      box-shadow: 0 0 0 rgba(107, 114, 128, 0.4);   /* ← đổi từ đỏ sang xám */
      animation: pulse-grey 4.5s infinite;
    }
    @keyframes pulse-red {
      0% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7); }
      70% { box-shadow: 0 0 0 15px rgba(255, 0, 0, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 0, 0, 0); }
    }
    @keyframes pulse-grey {
      0% { box-shadow: 0 0 0 0 rgba(107, 114, 128, 0.7); }
      70% { box-shadow: 0 0 0 15px rgba(107, 114, 128, 0); }
      100% { box-shadow: 0 0 0 0 rgba(107, 114, 128, 0); }
    }
    .map-legend, .map-stats {
      background: #fff; padding: 8px 12px; border-radius: 8px;
      box-shadow: 0 1px 5px rgba(0,0,0,.3); font-size: 12px; line-height: 1.7;
    }
    .map-legend i {
      width: 14px; height: 14px; display: inline-block;
      margin-right: 6px; vertical-align: middle; border-radius: 3px;
    }
    .map-legend .legend-section { margin-top: 4px; }
  `;
  document.head.insertAdjacentHTML('beforeend', `<style>${pulseCSS}</style>`);

  const industryColors = {
    'Ban Giám đốc': '#4CAF50',
    'Tổ chức hành chính': '#2E7D32',
    'Tài chính kế toán': '#0288D1',
    'Kế hoạch nghiệp vụ': '#6D4C41',
    'Công nghệ thông tin': '#78909C',
    'Đào tạo nghiên cứu khoa học và hợp tác quốc tế': '#FFCA28',
    'Phòng khám': '#0288D1',
    'Giám sát cảnh báo chuẩn bị và đáp ứng khẩn cấp dịch bệnh': '#D81B60',
    'Phòng chống bệnh truyền nhiễm cấp tính': '#FBC02D',
    'Kiểm dịch y tế quốc tế': '#5E35B1',
    'Phòng chống HIV/AIDS và các bệnh truyền nhiễm mãn tính': '#03396c',
    'Xét nghiệm': '#00ACC1',
    'Truyền thông giáo dục sức khỏe': '#C2185B',
    'Dược - Vật tư Y tế': '#7B1FA2',
    'Dinh dưỡng – Bệnh không lây': '#1976D2',
  };

  const escMap = (s) =>
    typeof window.escapeHtml === 'function'
      ? window.escapeHtml(String(s ?? ''))
      : String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

  // ============================================================
  // 2. CHOROPLETH
  // ============================================================
  function getColor(d) {
    if (d === 0) return '#fae1e1';
    return d > 5
      ? '#800026'
      : d > 3
      ? '#BD0026'
      : d > 1
      ? '#E31A1C'
      : '#FC4E2A';
  }
  function choroStyle(feature) {
    return {
      fillColor: getColor(feature.properties.count || 0),
      weight: 2,
      opacity: 1,
      color: 'white',
      dashArray: '3',
      fillOpacity: 0.7,
    };
  }
  function highlightFeature(e) {
    e.target.setStyle({
      fillColor: '#ed1384',
      weight: 3,
      color: '#fff',
      dashArray: '',
      fillOpacity: 0.9,
    });
  }
  function resetHighlight(e) {
    const layer = e.target;
    if (choroplethLayer) choroplethLayer.resetStyle(layer);
    if (layer.isTooltipOpen && layer.isTooltipOpen()) layer.closeTooltip();
  }
  function onEachFeatureChoropleth(feature, layer) {
    const p = feature.properties;
    const name = p.name || p.tenXa || p.ma_xa || p.MA_XA || 'Chưa xác định';
    const count = p.count || 0;
    layer.bindTooltip(`<b>${escMap(name)}</b>`, {
      sticky: true,
      direction: 'auto',
      className: 'leaflet-tooltip-own',
    });
    layer.on({
      mouseover: highlightFeature,
      mouseout: resetHighlight,
      click: () =>
        layer
          .bindPopup(
            `<div style="text-align:center;min-width:120px;">
           <b style="color:#ed1384;font-size:15px;">${escMap(name)}</b><br/>
           <span style="font-size:13px;">Nhân sự RRT: <b>${count}</b></span>
         </div>`
          )
          .openPopup(),
    });
  }

  // Tính lại count theo filteredData rồi trả GeoJSON đã gắn count
  function buildChoroGeoJson() {
    const countsByMaXa = new Map();
    (filteredData || []).forEach((m) => {
      const k = String(m.ma_xa || m.maXa || '');
      if (k) countsByMaXa.set(k, (countsByMaXa.get(k) || 0) + 1);
    });
    const g = JSON.parse(JSON.stringify(geojsonData));
    g.features.forEach((f) => {
      const p = f.properties;
      if (p) {
        const maXa = String(p.maXa || p.MA_XA || '');
        p.count = countsByMaXa.get(maXa) || 0;
        if (!p.name && p.tenXa) p.name = p.tenXa;
      }
    });
    return g;
  }
  // ============================================================
  // 2B. LỚP BẢN ĐỒ HÀNH CHÍNH / DÂN SỐ
  // ============================================================
  // Dải màu xanh dương để phân biệt với màu đỏ của RRT
  function getPopColor(d) {
    const pop = parseFloat(d) || 0;
    return pop > 50000
      ? '#7fbfbf'
      : pop > 30000
      ? '#99cccc'
      : pop > 15000
      ? '#b2d8d8'
      : pop > 5000
      ? '#cce5e5'
      : pop > 0
      ? '#e5f2f2'
      : '#ffffff'; // Màu nhạt nếu phường không có dữ liệu
  }

  function populationStyle(feature) {
    return {
      fillColor: getPopColor(
        feature.properties.danSo || feature.properties.DanSo || 0
      ),
      weight: 1.5,
      opacity: 1,
      color: '#666', // Viền xám đậm để rõ ranh giới hành chính
      dashArray: '2',
      fillOpacity: 0.7,
    };
  }

  function onEachFeaturePopulation(feature, layer) {
    const p = feature.properties;
    const name = p.name || p.tenXa || p.maXa || p.ma_xa || 'Chưa xác định';
    const quan = p.quan || p.tenQuan || p.QUAN || '';
    const danSo = p.danSo || p.DanSo || 0;

    // Lấy thông tin diện tích, có bọc lót chữ hoa/thường tùy định dạng GeoJSON
    const dienTich = p.dienTich || p.DienTich || p.Shape_Area || 0;

    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({
          weight: 1.3,
          color: '#000',
          fillOpacity: 0.63,
          dashArray: '',
        });
        l.bringToFront();
      },
      mouseout: (e) => {
        if (populationLayer) populationLayer.resetStyle(e.target);
      },
      click: () => {
        layer
          .bindPopup(
            `
          <div style="text-align:center;min-width:160px;font-family:sans-serif;">
            <b style="color:#08519c;font-size:15px;">${escMap(name)}</b><br/>
            ${
              quan
                ? `<span style="font-size:12px;color:#6b7280;">${escMap(
                    quan
                  )}</span><br/>`
                : ''
            }
            <hr style="margin:8px 0;border-top:1px dashed #cbd5e1;">
            <div style="text-align:left;font-size:13px;line-height:1.6;">
              <b>Dân số:</b> <span style="color:#b91c1c;">${danSo.toLocaleString(
                'vi-VN'
              )}</span> người<br/>
              <b>Diện tích:</b> ${
                dienTich
                  ? Number(dienTich).toLocaleString('vi-VN') + ' km²'
                  : 'N/A'
              }
            </div>
          </div>
        `
          )
          .openPopup();
      },
    });
  }

  // ============================================================
  // 3. NỘI DUNG LAYER THÀNH VIÊN & SỰ CỐ (điền vào layer ổn định)
  // ============================================================
  // ============================================================================
  // HIGHLIGHT MARKER NHÂN SỰ THEO KHOA/PHÒNG (circleMarker — to lên + pulse)
  //   Bấm tên khoa trong chú giải → marker khoa đó to + nhấp nháy.
  //   Bấm lại / bấm khoa khác → bỏ highlight cũ.
  // ============================================================================

  // ── (1) THAY hàm fillMembersLayer: gắn khoa + style gốc vào từng marker ──
  function fillMembersLayer() {
    membersLayer.clearLayers();
    membersMarkerMap.clear();
    window._membersMarkers = []; // danh sách phẳng để lọc theo khoa

    (filteredData || []).forEach((c) => {
      const lat = parseFloat(c.lat ?? c.latitude);
      const lon = parseFloat(c.lon ?? c.longitude);
      if (isNaN(lat) || isNaN(lon)) return;

      const dept = c.department || 'N/A';
      const baseColor = industryColors[dept] || '#FF5722';
      const baseStyle = {
        radius: 4,
        fillColor: baseColor,
        color: '#000',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
      };

      const marker = L.circleMarker([lat, lon], baseStyle);
      marker._dept = dept; // ← nhớ khoa
      marker._baseStyle = baseStyle; // ← nhớ style gốc để khôi phục

      marker.bindPopup(`
      <b>${escMap(c.fullName || c.full_name || 'N/A')}</b><br/>
      Khoa/phòng: ${escMap(dept)}<br/>
      Đội: ${escMap(c.team || 'N/A')}<br/>
      Phường: ${escMap(c.ward || c.ma_xa || 'N/A')}
    `);
      marker.bindTooltip(escMap(c.fullName || c.full_name || 'RRT Member'), {
        direction: 'top',
        offset: L.point(0, -10),
      });

      membersLayer.addLayer(marker);
      membersMarkerMap.set(`${lat},${lon}`, marker);
      window._membersMarkers.push(marker);
    });
  }

  // ── (2) Hàm highlight theo khoa (toggle) ──
  window._highlightedDept = null;

  window.highlightDeptMarkers = function (deptName) {
    const markers = window._membersMarkers || [];

    // Nếu đang highlight chính khoa này → tắt (toggle)
    if (window._highlightedDept === deptName) {
      clearDeptHighlight();
      return;
    }

    window._highlightedDept = deptName;

    markers.forEach((m) => {
      const el = m.getElement && m.getElement(); // SVG path của circleMarker
      if (m._dept === deptName) {
        // Marker khoa được chọn: to lên + đậm + pulse
        m.setStyle({ radius: 9, weight: 2, fillOpacity: 1, color: '#111' });
        m.setRadius(9);
        m.bringToFront && m.bringToFront();
        if (el) el.classList.add('member-marker-pulse');
      } else {
        // Marker khác: mờ đi cho tương phản
        m.setStyle({ fillOpacity: 0.15, opacity: 0.25 });
        if (el) el.classList.remove('member-marker-pulse');
      }
    });

    // Cập nhật nhãn nút trong chú giải (nếu có)
    _syncLegendDeptActive(deptName);
  };

  window.clearDeptHighlight = function () {
    const markers = window._membersMarkers || [];
    markers.forEach((m) => {
      if (m._baseStyle) {
        m.setStyle(m._baseStyle);
        m.setRadius(m._baseStyle.radius);
      }
      const el = m.getElement && m.getElement();
      if (el) el.classList.remove('member-marker-pulse');
    });
    window._highlightedDept = null;
    _syncLegendDeptActive(null);
  };

  // Đánh dấu dòng khoa đang active trong chú giải (đổi nền nhẹ)
  function _syncLegendDeptActive(deptName) {
    document.querySelectorAll('.legend-dept-row').forEach((row) => {
      const active = row.getAttribute('data-dept') === deptName;
      row.style.background = active ? '#e0f2fe' : '';
      row.style.fontWeight = active ? '600' : '';
    });
  }

  // ============================================================================
  // fillIncidentsLayer — THÊM "Thời gian kết thúc" cho sự kiện đã đóng.
  //   Nguồn: created_at (SỚM NHẤT) của notification type 'ket_thuc' theo incident_id.
  //   Query 1 LẦN trước vòng lặp (không query trong forEach) → nhanh, không lỗi async.
  //   Hàm thành ASYNC → nơi gọi nên: await fillIncidentsLayer();
  //   (nếu gọi rời không await vẫn chạy, chỉ là không đợi — thường OK).
  // ============================================================================
  async function fillIncidentsLayer() {
    incidentsLayer.clearLayers();
    const visibleIncidents = incidentData || [];

    // ── Lấy THỜI GIAN KẾT THÚC cho các sự kiện đã đóng (1 query duy nhất) ──
    const closureTimeMap = new Map(); // incident_id -> created_at (sớm nhất)
    try {
      const closedIds = visibleIncidents
        .filter(
          (i) =>
            !['active', 'pending', 'monitoring'].includes(
              (i.status || '').toLowerCase()
            )
        )
        .map((i) => i.id)
        .filter(Boolean);

      if (closedIds.length) {
        const { data: closureNotifs } = await window.supabaseClient
          .from('notifications')
          .select('incident_id, created_at')
          .eq('notification_type', 'ket_thuc')
          .in('incident_id', closedIds);

        // Mỗi sự kiện có nhiều notif ket_thuc (mỗi thành viên 1) → lấy SỚM NHẤT
        (closureNotifs || []).forEach((n) => {
          const cur = closureTimeMap.get(n.incident_id);
          if (!cur || new Date(n.created_at) < new Date(cur)) {
            closureTimeMap.set(n.incident_id, n.created_at);
          }
        });
      }
    } catch (e) {
      console.warn('[map] Không lấy được thời gian kết thúc:', e);
    }

    const fmtVN = (t) =>
      t
        ? new Date(t).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour12: false,
          })
        : 'N/A';

    const usedCoords = new Set();
    visibleIncidents.forEach((inc) => {
      let lat = parseFloat(inc.latitude ?? inc.lat);
      let lon = parseFloat(inc.longitude ?? inc.lon);
      if (isNaN(lat) || isNaN(lon)) return;

      const coordKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (usedCoords.has(coordKey)) {
        lat += (Math.random() - 0.5) * 0.003;
        lon += (Math.random() - 0.5) * 0.003;
      }
      usedCoords.add(coordKey);

      const isActive = ['active', 'pending', 'monitoring'].includes(
        (inc.status || '').toLowerCase()
      );
      const icon = L.divIcon({
        className: isActive
          ? 'incident-marker-active'
          : 'incident-marker-resolved',
        iconSize: isActive ? [13, 13] : [10, 10],
        iconAnchor: isActive ? [7, 7] : [5, 5],
      });

      // Dịch email → tên hiển thị
      let membersListHtml =
        '<span style="color:#9ca3af;font-style:italic;">Chưa có nhân sự</span>';
      if (inc.members) {
        const emails = String(inc.members)
          .split(/[,;\s\n]+/)
          .map((e) => e.replace(/[<>]/g, '').trim())
          .filter(Boolean);
        if (emails.length) {
          membersListHtml = emails
            .map((email) => {
              const key = email.toLowerCase();
              const u =
                window.globalUserMap?.get(key) ||
                (window.companyData || []).find(
                  (x) => String(x.email || '').toLowerCase() === key
                );
              if (u) {
                const name = u.full_name || u.fullName || email;
                const team =
                  u.team && u.team !== 'No team' && u.team !== 'undefined'
                    ? ` <i>(<span style="color:#2ca3af;">${escMap(
                        u.team
                      )}</span>)</i>`
                    : '';
                return `• <b>${escMap(name)}</b>${team}`;
              }
              return email.includes('@') ? `• ${escMap(email)}` : '';
            })
            .join('<br/>');
        }
      }

      // Dòng "Thời gian kết thúc" chỉ hiện khi đã đóng VÀ có dữ liệu
      const closureTime = !isActive ? closureTimeMap.get(inc.id) : null;
      const closureRow = closureTime
        ? `<b style="color:#1f2937;">Thời gian kết thúc:</b> ${fmtVN(
            closureTime
          )}<br/>`
        : '';

      const marker = L.marker([lat, lon], { icon });
      marker.bindPopup(`
      <div style="min-width:250px;font-family:'Inter',sans-serif;">
        <h6 style="color:${
          isActive ? '#dc2626' : '#4b5563'
        };margin-bottom:8px;font-weight:bold;border-bottom:1px solid #e5e7eb;padding-bottom:5px;">
          ${isActive ? '🚨 ĐANG KÍCH HOẠT' : '✅ ĐÃ KẾT THÚC'}
        </h6>
        <b style="color:#1f2937;">Sự kiện:</b> ${escMap(
          inc.event_name || 'Không rõ'
        )}<br/>
        <b style="color:#1f2937;">Địa điểm sự kiện:</b> ${escMap(
          inc.location_text || 'N/A'
        )}<br/>
        <b style="color:#1f2937;">Thời gian kích hoạt:</b> ${fmtVN(
          inc.activation_time
        )}<br/>
        ${closureRow}
        <hr style="margin:10px 0;border-top:1px dashed #cbd5e1;" />
        <b style="color:#0369a1;"><i class='bx bx-group'></i> Nhân sự tham gia:</b>
        <div style="max-height:120px;overflow-y:auto;font-size:13px;color:#4b5563;margin-top:4px;padding-left:4px;border-left:2px solid #e2e8f0;line-height:1.6;">
          ${membersListHtml}
        </div>
      </div>`);
      marker.bindTooltip(
        `${isActive ? '🚨' : '✅'} ${escMap(inc.event_name || 'Sự cố')}`,
        { direction: 'top', offset: L.point(0, -10) }
      );
      incidentsLayer.addLayer(marker);
    });
  }

  // ============================================================
  // 4. LEGEND (Hỏi trực tiếp bản đồ - Tự động hiển thị/ẩn)
  // ============================================================
  function renderLegendContent(div) {
    // 1. Đồng bộ cỡ chữ và khoảng cách dòng cho toàn bộ bảng chú giải
    div.style.fontSize = '13px';
    div.style.lineHeight = '1.6';

    const sections = []; // Mảng chứa các khối nội dung

    // ==========================================
    // KHỐI 1: THỐNG KÊ TỔNG QUAN (Luôn hiển thị)
    // ==========================================
    const activeCount = incidentData.filter((i) =>
      ['active', 'pending', 'monitoring'].includes(
        (i.status || '').toLowerCase()
      )
    ).length;

    sections.push(`
      <div class="legend-section">
        <b style="font-size: 14px; display: inline-block; margin-bottom: 4px;">Thống kê</b><br>
        <span style="color:#0369a1; font-weight:bold;"><i class='bx bx-group'></i> Nhân sự RRT:</span> 
        <b>${filteredData.length}</b>/${companyData.length}<br>
        <span style="color:#dc2626; font-weight:bold;"><i class='bx bx-alarm-exclamation'></i> Sự kiện kích hoạt:</span> 
        <b>${activeCount}</b>
      </div>
    `);

    // ==========================================
    // KHỐI 2: CHÚ GIẢI BẢN ĐỒ (Ẩn/Hiện theo Layer)
    // ==========================================
    // ============================================================================
    // KHỐI CHÚ GIẢI "NHÂN SỰ RRT" — Cách C + CLICK highlight, CHỈ khoa CÓ nhân sự
    // Thay khối cũ trong renderLegendContent bằng đoạn này.
    //   • Chỉ liệt kê khoa/phòng THỰC SỰ có nhân sự đang hiển thị (bỏ khoa trống).
    //   • Kèm số lượng người mỗi khoa. Bấm khoa → highlight marker khoa đó.
    // ============================================================================

    // 0. Lớp Nhân sự RRT — chỉ hiện khoa đang có người + bấm để nổi bật
    if (
      typeof membersLayer !== 'undefined' &&
      membersLayer &&
      map.hasLayer(membersLayer)
    ) {
      // Đếm số nhân sự theo khoa TỪ dữ liệu đang hiển thị (filteredData)
      const _deptCount = {};
      (filteredData || []).forEach((c) => {
        const lat = parseFloat(c.lat ?? c.latitude);
        const lon = parseFloat(c.lon ?? c.longitude);
        if (isNaN(lat) || isNaN(lon)) return; // chỉ tính người có tọa độ (có marker)
        const dept = c.department || 'Chưa rõ khoa/phòng';
        _deptCount[dept] = (_deptCount[dept] || 0) + 1;
      });

      // Chỉ giữ khoa CÓ người, sắp xếp theo tên
      const _activeDepts = Object.keys(_deptCount).sort((a, b) =>
        a.localeCompare(b, 'vi')
      );

      // Chỉ thêm khối nếu thực sự có nhân sự trên bản đồ
      if (_activeDepts.length > 0) {
        const _escAttr = (s) =>
          String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');

        const _rows = _activeDepts
          .map((name) => {
            const color = industryColors[name] || '#FF5722';
            const count = _deptCount[name];
            return `<div class="legend-dept-row" data-dept="${name.replace(
              /"/g,
              '&quot;'
            )}"
                  onclick="window.highlightDeptMarkers('${_escAttr(name)}')"
                  style="display:flex;align-items:center;gap:6px;margin:1px 0;padding:2px 4px;
                         border-radius:4px;cursor:pointer;transition:background .15s;"
                  onmouseover="if(this.getAttribute('data-dept')!==window._highlightedDept)this.style.background='#f1f5f9'"
                  onmouseout="if(this.getAttribute('data-dept')!==window._highlightedDept)this.style.background=''">
               <span style="flex:0 0 12px;width:12px;height:12px;border-radius:50%;
                     background:${color};border:1.5px solid #fff;
                     box-shadow:0 0 2px rgba(0,0,0,.4);"></span>
               <span style="font-size:12px;flex:1;">${name}</span>
               <span style="font-size:11px;color:#64748b;">${count}</span>
             </div>`;
          })
          .join('');

        sections.push(`
          <div class="legend-section">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <span>
                <b style="font-size:14px;">RRT-ers</b>
                
              </span>
              <a href="javascript:void(0)"
                 style="font-size:11px;text-decoration:none;color:#0369a1;white-space:nowrap;"
                 onclick="(function(a){
                   var box=document.getElementById('legend-members-colors');
                   if(!box)return;
                   var show=box.style.display==='none';
                   box.style.display=show?'block':'none';
                   a.innerHTML=show?'▴':'▾';
                 })(this)">▾ Chi tiết</a>
            </div>
            <div id="legend-members-colors"
                 style="display:none;margin-top:6px;max-height:200px;overflow-y:auto;
                        padding-right:4px;border-left:2px solid #e2e8f0;padding-left:6px;">
              ${_rows}
              <div style="margin-top:6px;text-align:center;">
                <a href="javascript:void(0)" onclick="window.clearDeptHighlight()"
                   style="font-size:11px;color:#dc2626;text-decoration:none;">
                  <i class='bx bx-x-circle'></i> Clear
                </a>
              </div>
            </div>
          </div>
        `);
      }
    }
    // 1. Lớp Sự kiện (Incidents)
    if (incidentsLayer && map.hasLayer(incidentsLayer)) {
      sections.push(`
        <div class="legend-section">
          <b style="font-size: 14px; display: inline-block; margin-bottom: 4px;">Sự kiện</b><br>
          <span class="incident-marker-active" style="display:inline-block;width:12px;height:12px;"></span> Đang kích hoạt<br>
          <span class="incident-marker-resolved" style="display:inline-block;width:10px;height:10px;"></span> Đã kết thúc
        </div>
      `);
    }

    // 2. Lớp Phòng Xét Nghiệm (Labs)
    if (layerVisible.labs && window.LabMapLayer) {
      sections.push(`
        <div class="legend-section">
          ${window.LabMapLayer.legendHtml()}
        </div>
      `);
    }

    // 3. Lớp Dân số (Hành chính)
    if (populationLayer && map.hasLayer(populationLayer)) {
      const pGrades = [0, 5000, 15000, 30000, 50000];
      const pLabels = ['< 5k', '5k - 15k', '15k - 30k', '30k - 50k', '> 50k'];
      let popHtml = `
        <div class="legend-section">
          <b style="font-size: 14px; display: inline-block; margin-bottom: 4px;">Dân số (người)</b><br>
      `;
      pGrades.forEach((g, i) => {
        popHtml += `<i style="background:${getPopColor(g + 1)}"></i> ${
          pLabels[i]
        }<br>`;
      });
      popHtml += '</div>';
      sections.push(popHtml);
    }

    // 4. Lớp Choropleth (RRT-ers/Phường)
    if (choroplethLayer && map.hasLayer(choroplethLayer)) {
      const grades = [0, 1, 2, 4, 6];
      const labels = ['0', '1', '2–3', '4–5', '> 5'];
      let choroHtml = `
        <div class="legend-section">
          <b style="font-size: 14px; display: inline-block; margin-bottom: 4px;">RRT-ers/Phường</b><br>
      `;
      grades.forEach((g, i) => {
        choroHtml += `<i style="background:${getColor(g)}"></i> ${
          labels[i]
        }<br>`;
      });
      choroHtml += '</div>';
      sections.push(choroHtml);
    }

    // ==========================================
    // RENDER: Tự động chèn gạch nối đứt nét giữa các khối
    // ==========================================
    const dividerHtml =
      '<hr style="margin: 8px 0; border: 0; border-top: 1px dashed #cbd5e1;">';

    div.innerHTML =
      sections.length > 0
        ? sections.join(dividerHtml)
        : '<span class="text-muted">Không có dữ liệu.</span>';

    // Kích hoạt hover cho PXN
    if (
      layerVisible.labs &&
      window.LabMapLayer &&
      window.LabMapLayer.bindLegendHover
    ) {
      window.LabMapLayer.bindLegendHover(div);
    }
  }

  function addLegend() {
    if (legendControl || typeof L === 'undefined') return;
    legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = function () {
      const div = L.DomUtil.create('div', 'map-legend');
      div.id = 'map-legend-box';
      renderLegendContent(div);
      return div;
    };
    legendControl.addTo(map);
  }
  function refreshLegend() {
    const box = document.getElementById('map-legend-box');
    if (box) renderLegendContent(box);
  }

  // ============================================================
  // 5. XÂY LAYER (1 lần) + control thống nhất
  // ============================================================
  function buildLayersOnce() {
    choroplethLayer = L.geoJSON(buildChoroGeoJson(), {
      style: choroStyle,
      onEachFeature: onEachFeatureChoropleth,
    });

    // BỔ SUNG: Khởi tạo layer Dân số
    populationLayer = L.geoJSON(geojsonData, {
      style: populationStyle,
      onEachFeature: onEachFeaturePopulation,
    });

    membersLayer = L.layerGroup();
    incidentsLayer = L.layerGroup();
    fillMembersLayer();
    fillIncidentsLayer();

    if (layerVisible.choropleth) choroplethLayer.addTo(map);
    if (layerVisible.population) populationLayer.addTo(map); // BỔ SUNG
    // if (layerVisible.members) membersLayer.addTo(map);
    if (layerVisible.incidents) incidentsLayer.addTo(map);
  }

  // Cập nhật CHOROPLETH khi filter đổi (không tạo control mới)
  function refreshChoropleth() {
    if (!choroplethLayer) return;
    const wasOn = map.hasLayer(choroplethLayer);
    // clearLayers + addData để giữ cùng 1 đối tượng layer
    choroplethLayer.clearLayers();
    choroplethLayer.addData(buildChoroGeoJson());
    // addData không tự áp style/onEachFeature lần 2 → set lại
    choroplethLayer.setStyle(choroStyle);
    choroplethLayer.eachLayer((l) => onEachFeatureChoropleth(l.feature, l));
    if (wasOn && !map.hasLayer(choroplethLayer)) choroplethLayer.addTo(map);
  }

  // ============================================================
  // 6. TẢI GEOJSON
  // ============================================================
  window.loadGeoJSON = async function () {
    if (window.appState && window.appState.mapGeoData) {
      geojsonData = window.appState.mapGeoData;
      return geojsonData;
    }
    try {
      const { data, error } = await window.supabaseClient.storage
        .from('maps')
        .download('hcm_map.json');
      if (error) throw error;
      const json = JSON.parse(await data.text());
      if (!json.features) throw new Error("File JSON thiếu 'features'.");
      window.appState.mapGeoData = json;
      geojsonData = json;
      return json;
    } catch (err) {
      console.error('Lỗi xử lý file bản đồ:', err);
      if (typeof showToast === 'function')
        showToast('Lỗi tải bản đồ.', 'error');
      return null;
    }
  };

  // ============================================================
  // 7. FILTER (chỉ cập nhật NỘI DUNG layer, không tạo layer mới)
  // ============================================================
  function applyFilters() {
    const searchEl = document.getElementById('rrt-search');
    const wardEl = document.getElementById('wardFilter');
    if (!searchEl || !wardEl) return;
    const searchTerm = searchEl.value.toLowerCase().trim();
    const selectedMaXas = Array.from(wardEl.selectedOptions).map(
      (o) => o.value
    );

    filteredData = companyData.filter((m) => {
      const okSearch =
        !searchTerm ||
        (m.fullName || m.full_name || m.email || '')
          .toLowerCase()
          .includes(searchTerm);
      const okWard =
        selectedMaXas.length === 0 || selectedMaXas.includes(String(m.ma_xa));
      return okSearch && okWard;
    });

    // Cập nhật nội dung — KHÔNG remove/tạo lại layer
    fillMembersLayer();
    refreshChoropleth();
    refreshLegend();

    // Zoom theo kết quả
    // Kiểm tra tọa độ có thực sự nằm trong vùng hợp lệ (VN, quanh TP.HCM)
    const isValidCoord = (lat, lon) =>
      !isNaN(lat) &&
      !isNaN(lon) &&
      lat !== 0 &&
      lon !== 0 && // loại điểm 0,0 (ngoài khơi châu Phi)
      lat >= 8 &&
      lat <= 24 && // vĩ độ Việt Nam
      lon >= 102 &&
      lon <= 110; // kinh độ Việt Nam

    // Zoom theo kết quả — CHỈ dùng tọa độ hợp lệ
    if (searchTerm && filteredData.length === 1) {
      const m = filteredData[0];
      const lat = parseFloat(m.lat ?? m.latitude),
        lon = parseFloat(m.lon ?? m.longitude);
      if (isValidCoord(lat, lon)) {
        const tm = membersMarkerMap.get(`${lat},${lon}`);
        if (tm) {
          map.setView(tm.getLatLng(), 14);
          tm.openTooltip();
        }
      } else {
        // Thành viên tìm thấy nhưng tọa độ lỗi → báo, không zoom văng
        if (typeof showToast === 'function')
          showToast(
            'Thành viên này chưa có tọa độ hợp lệ để định vị trên bản đồ.',
            'warning'
          );
      }
    } else if (
      filteredData.length > 1 &&
      (searchTerm || selectedMaXas.length > 0)
    ) {
      const pts = filteredData
        .map((m) => [
          parseFloat(m.lat ?? m.latitude),
          parseFloat(m.lon ?? m.longitude),
        ])
        .filter((p) => isValidCoord(p[0], p[1])); // ← lọc chặt
      if (pts.length) {
        map.fitBounds(L.latLngBounds(pts).pad(0.2));
      }
      // Nếu không có điểm hợp lệ nào → giữ nguyên khung nhìn (không văng)
    }
  }

  // ============================================================
  // 8. DROPDOWN PHƯỜNG
  // ============================================================
  function initWardFilter() {
    const sel = document.getElementById('wardFilter');
    if (!sel) return;
    if (
      window.$ &&
      $.fn.select2 &&
      $(sel).hasClass('select2-hidden-accessible')
    )
      $(sel).select2('destroy');
    sel.innerHTML = '';
    const wardMap = new Map();
    companyData.forEach((m) => {
      if (m.ma_xa && m.ward && !wardMap.has(String(m.ma_xa)))
        wardMap.set(String(m.ma_xa), String(m.ward));
    });
    Array.from(wardMap.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
      .forEach(([maXa, wardName]) => {
        const o = document.createElement('option');
        o.value = maXa;
        o.textContent = wardName;
        sel.appendChild(o);
      });
    if (window.$ && $.fn.select2)
      $(sel).select2({ placeholder: 'Chọn...', allowClear: true });
  }

  // ============================================================
  // 9. GẮN SỰ KIỆN
  // ============================================================
  function bindMapEvents() {
    if (mapEventsBound) return;
    mapEventsBound = true;
    const searchEl = document.getElementById('rrt-search');
    if (searchEl) {
      const deb =
        typeof window.debounce === 'function'
          ? window.debounce(applyFilters, 300)
          : applyFilters;
      searchEl.addEventListener('input', deb);
    }
    if (window.$ && $.fn) {
      $(document)
        .off('change.mapWard', '#wardFilter')
        .on('change.mapWard', '#wardFilter', applyFilters);
    } else {
      const wardEl = document.getElementById('wardFilter');
      if (wardEl) wardEl.addEventListener('change', applyFilters);
    }
    // Checkbox cũ #toggleFillMap giờ đồng bộ với control choropleth (tùy chọn)
    const toggleEl = document.getElementById('toggleFillMap');
    if (toggleEl) {
      toggleEl.addEventListener('change', function () {
        if (this.checked) {
          choroplethLayer.addTo(map);
        } else {
          map.removeLayer(choroplethLayer);
        }
      });
    }
  }

  // ============================================================
  // 10. PLUGIN
  // ============================================================
  function setupMapPlugins() {
    if (mapPluginsReady || !map) return;
    mapPluginsReady = true;
    if (typeof L.Control.Draw !== 'undefined') {
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      const drawControl = new L.Control.Draw({
        position: 'topleft',
        draw: { circle: false, rectangle: false },
        edit: { featureGroup: drawnItems },
      });
      map.addControl(drawControl);
      map.on('draw:created', (e) => drawnItems.addLayer(e.layer));
    }
    if (typeof L.control.browserPrint !== 'undefined') {
      L.control.browserPrint({ title: 'In bản đồ RRT' }).addTo(map);
    }
  }

  // ============================================================
  // 11. CONTROL LAYERS THỐNG NHẤT (tất cả lớp qua đây)
  // ============================================================
  async function setupLayersControl() {
    // 1. Lớp PXN: lấy từ module LabMapLayer. Nó tự tạo cluster group.
    let labLayer = null;
    if (window.LabMapLayer) {
      const res = await window.LabMapLayer.attach(map, {
        show: layerVisible.labs,
        standalone: true,
      });
      labLayer = res?.layer || null;
    }

    // 2. Khai báo danh sách các lớp phủ (Overlays - Checkbox)
    const overlays = {};

    // Đưa lớp Tên địa danh vào trên cùng (nếu đã tạo ở renderMapPage)
    if (window.mapLabelsLayer) {
      overlays['🏷️ Địa danh'] = window.mapLabelsLayer;
    }

    // Đưa các lớp nghiệp vụ vào
    overlays['🏙️ Hành chính/ Dân số'] = populationLayer;
    overlays['🗺️ RRT-ers/ Phường'] = choroplethLayer;
    overlays['👥 RRT-ers'] = membersLayer;
    overlays['🚨 Sự kiện khẩn cấp'] = incidentsLayer;

    if (labLayer) {
      overlays['🧪 Phòng xét nghiệm'] = labLayer;
    }

    // 3. Xóa control cũ (nếu có) khi load lại trang để không bị nhân bản
    if (layersControl) {
      layersControl.remove();
      layersControl = null;
    }

    // 4. Lấy danh sách Basemaps (Bản đồ nền) từ biến toàn cục
    const basemaps = window.mapBasemaps || null;

    // 5. Khởi tạo Control Layers kết hợp cả Basemaps và Overlays
    layersControl = L.control
      .layers(basemaps, overlays, { collapsed: false, position: 'topright' })
      .addTo(map);

    // ============================================================
    // 🚨 BẮT SỰ KIỆN: Đồng bộ bảng chú giải (Legend) khi bật/tắt lớp
    // LƯU Ý: Dùng map.off().on() để tránh bị lặp sự kiện khi quay lại trang
    // ============================================================
    map
      .off('overlayadd overlayremove')
      .on('overlayadd overlayremove', function (e) {
        // Bắt riêng trạng thái cho lớp Phòng Xét Nghiệm (vì nó load từ module rời)
        if (e.name && e.name.includes('Phòng xét nghiệm')) {
          layerVisible.labs = e.type === 'overlayadd';
        }

        // Gọi vẽ lại Legend. Hàm renderLegendContent sẽ tự quét map.hasLayer()
        // để quyết định vẽ/ẩn HTML của các lớp nghiệp vụ.
        refreshLegend();
      });
  }
  // ============================================================
  // 12. LUỒNG CHÍNH
  // ============================================================
  async function renderMapPage() {
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner();
    try {
      if (!window.appState || !window.appState.mapGeoData) await loadGeoJSON();
      geojsonData = window.appState.mapGeoData;

      // Profiles
      const role = (window.userSession?.role || '').toLowerCase();
      const isAdmin = role === 'admin';
      const isWardAdmin = role === 'ward_admin';
      const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();
      const myEmail = String(window.userSession?.email || '')
        .toLowerCase()
        .trim();

      // =================================================================
      // 1. KÉO VÀ LỌC DỮ LIỆU NHÂN SỰ (PROFILES)
      // =================================================================
      const { data: profData, error: profErr } = await window.supabaseClient
        .from('profiles')
        .select(
          'email, full_name, team, department, ma_xa, latitude, longitude, ward, workplace_ma_xa, fax'
        )
        .not('role', 'in', `(${window.LIMS_ONLY_ROLES.join(',')})`);

      window.globalUserMap = new Map();

      if (!profErr && profData) {
        let allUsers = profData.map((u) => {
          const email = String(u.email || '')
            .toLowerCase()
            .trim();
          const parsedUser = {
            ...u,
            fullName: u.full_name || u.email,
            team: u.team || u.department,
            lat: parseFloat(u.latitude),
            lon: parseFloat(u.longitude),
          };
          if (email) window.globalUserMap.set(email, parsedUser);
          return parsedUser;
        });

        if (!isAdmin) {
          allUsers = allUsers.filter((u) => {
            const isMe =
              myEmail !== '' && String(u.email || '').toLowerCase() === myEmail;
            const uMaXa = String(u.workplace_ma_xa || u.ma_xa || '').trim();
            const isMyWard = myMaXa !== '' && uMaXa === myMaXa;
            return isMe || isMyWard;
          });
        }
        companyData = allUsers;
      } else {
        console.error('Không lấy được profiles:', profErr);
        companyData = window.appState.users || [];
      }
      filteredData = [...companyData];

      const myStaffEmails = companyData
        .map((u) =>
          String(u.email || '')
            .toLowerCase()
            .trim()
        )
        .filter(Boolean);

      console.log('👉 [X-RAY] QUYỀN HẠN:', {
        role,
        isAdmin,
        isWardAdmin,
        myMaXa,
      });
      console.log('👉 [X-RAY] DANH SÁCH EMAIL:', myStaffEmails);

      // =================================================================
      // 2. KÉO VÀ LỌC DỮ LIỆU SỰ CỐ (INCIDENTS)
      // =================================================================
      const { data: incData, error: incErr } = await window.supabaseClient
        .from('incidents')
        .select(
          'id, event_name, location_text, ma_xa, latitude, longitude, status, activation_time, members'
        );

      let allIncidents = !incErr && incData ? [...incData] : [];

      if (!isAdmin) {
        allIncidents = allIncidents.filter((inc) => {
          const rawMembersString = String(inc.members || '').toLowerCase();
          const isAssignedToMe =
            myEmail !== '' && rawMembersString.includes(myEmail);

          if (isWardAdmin) {
            const isMyWard =
              myMaXa !== '' && String(inc.ma_xa || '').trim() === myMaXa;
            const isMyStaffAssigned = myStaffEmails.some((staffEmail) =>
              rawMembersString.includes(staffEmail)
            );
            const isAccepted = isMyWard || isMyStaffAssigned || isAssignedToMe;

            if (!isAccepted) {
              console.log(`❌ ĐÃ LOẠI SỰ KIỆN: "${inc.event_name}"`, {
                ma_xa_su_kien: inc.ma_xa,
                du_lieu_members: inc.members,
                ly_do: 'Khác mã xã VÀ không có email lính nào khớp',
              });
            } else {
              console.log(`✅ ĐÃ GIỮ SỰ KIỆN: "${inc.event_name}"`, {
                isMyWard,
                isMyStaffAssigned,
                isAssignedToMe,
              });
            }
            return isAccepted;
          } else {
            return isAssignedToMe;
          }
        });
      }
      incidentData = allIncidents;
      console.log('🎯 SỰ KIỆN SAU KHI LỌC QUYỀN:', incidentData);

      // =================================================================
      // 3. KHỞI TẠO BẢN ĐỒ VÀ CÁC LỚP BASEMAP XỊN XÒ
      // =================================================================
      if (!map) {
  map = L.map('containerMap', {
    center: [10.77, 106.7],
    zoom: 10,
    zoomControl: true,
  });

  // ĐỔI: basemaps.cartocdn.com giờ yêu cầu API key
  // → thay bằng Esri World_Light_Gray_Base (miễn phí, không cần key)
  const lightNoLabels = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    {
      opacity: 0.8,
      attribution: '&copy; Esri',
      maxZoom: 16, // Esri Canvas base chỉ hỗ trợ tới zoom 16
    }
  );

  // ĐỔI: tương tự, dùng Esri World_Dark_Gray_Base
  const darkNoLabels = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    {
      opacity: 0.8,
      attribution: '&copy; Esri',
      maxZoom: 16,
    }
  );

  const satelliteMap = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri',
      maxZoom: 19,
    }
  );

  // ------------------------------------------------------------------
  // TẠO LỚP CHỈ CHỨA CHỮ ĐỊA DANH (Labels Only) + 2 QUẦN ĐẢO
  // ------------------------------------------------------------------
  window.mapLabelsLayer = L.layerGroup(); // Tạo nhóm chứa tất cả nhãn

  // ĐỔI: dùng Esri World_Light_Gray_Reference — lớp nhãn riêng
  // tương ứng chính xác với World_Light_Gray_Base ở trên (cặp Base+Reference chuẩn của Esri)
  const cartoLabels = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    {
      pane: 'overlayPane',
      maxZoom: 16,
    }
  ).addTo(window.mapLabelsLayer);

        // Chèn CSS cho nhãn Hoàng Sa, Trường Sa (nếu chưa có)
        const customLabelStyle = `
          .vn-island-label {
            font-size: 11px;
            font-weight: 700;
            color: #008b99;
            text-align: center;
            white-space: nowrap;
            text-shadow: 1px 1px 0px #fff, -1px -1px 0px #fff, 1px -1px 0px #fff, -1px 1px 0px #fff;
            pointer-events: none;
          }
        `;
        if (!document.getElementById('island-label-style')) {
          const s = document.createElement('style');
          s.id = 'island-label-style';
          s.innerHTML = customLabelStyle;
          document.head.appendChild(s);
        }

        // Tọa độ 2 quần đảo
        const ISLANDS_COORD = {
          'Hoàng Sa': [16.5, 112.0],
          'Trường Sa': [9.0, 114.0],
        };

        // Tạo marker nhãn và thêm vào window.mapLabelsLayer
        Object.entries(ISLANDS_COORD).forEach(([name, coords]) => {
          const islandLabel = L.marker(coords, {
            icon: L.divIcon({
              className: 'vn-island-label',
              html: `🏝️ ${name}<br><span style="font-size:8px;font-weight:400;color:#64748b">Việt Nam</span>`,
              iconSize: [100, 40],
              iconAnchor: [50, 20],
            }),
            interactive: false,
          });
          islandLabel.addTo(window.mapLabelsLayer);
        });

        // Đặt bản đồ Sáng màu (Không chữ) làm mặc định ban đầu
        lightNoLabels.addTo(map);

        window.mapBasemaps = {
          'Carto (Light)': lightNoLabels,
          'Carto (Dark)': darkNoLabels,
          Satelite: satelliteMap,
        };

        // Lớp viền ranh giới hành chính cơ bản
        geojsonBaseLayer = L.geoJSON(geojsonData, {
          style: { fillColor: 'transparent', color: '#bcbcbc', weight: 1 },
          interactive: false,
        }).addTo(map);

        setupMapPlugins();
        buildLayersOnce();

        await setupLayersControl();

        addLegend();
        refreshLegend();
      } else {
        fillMembersLayer();
        await fillIncidentsLayer();
        refreshChoropleth();
        refreshLegend();
        setTimeout(() => map.invalidateSize(), 200);
      }

      initWardFilter();
      bindMapEvents();

      const b = document.getElementById('btn-map-find-lab');
      if (b) b.onclick = () => window.openDispatchModal();
    } catch (error) {
      console.error('Lỗi renderMapPage:', error);
      if (typeof showToast === 'function')
        showToast('Lỗi bản đồ: ' + error.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  }
  window._getLeafletMap = function () {
    return map;
  };
});
