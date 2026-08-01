// ============================================================================
// LỚP PHÒNG XÉT NGHIỆM TRÊN BẢN ĐỒ — V2 (theo Bảng 1 phân tầng năng lực)
// Hệ thống RRT-HCDC
// ----------------------------------------------------------------------------
// THAY ĐỔI:
//   • Marker 5 MÀU theo CẤP NĂNG LỰC (capability_tier 1-5, tính theo Bảng 1)
//   • Popup: CẤP NĂNG LỰC + ATSH (BSL). KHÔNG hiện QSM.
//   • Panel chi tiết đầy đủ (QSM, đầu mối, kỹ thuật).
//   • MỚI: hover legend → highlight marker cùng cấp (mờ cấp khác).
//
// PHỤ THUỘC: leaflet + (tùy chọn) leaflet.markercluster.
// ============================================================================
(function () {
  'use strict';
  const esc = (s) =>
    window.escapeHtml
      ? window.escapeHtml(String(s ?? ''))
      : String(s ?? '').replace(/[&<>"']/g, (c) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])
        );
  let _labsCache = null;
  let _labLayer = null;
  let _layersControl = null;
  let _markersByTier = {}; // { tier: [{marker, lab}] } — highlight theo cấp
  // ------------------------------------------------------------------
  // THANG 5 CẤP NĂNG LỰC (capability_tier 1-5 theo Bảng 1)
  // ------------------------------------------------------------------
  const TIER_INFO = {
    5: { color: '#dc2626', label: 'Năng lực Xét nghiệm Cấp 5' },
    4: { color: '#ea580c', label: 'Năng lực Xét nghiệm Cấp 4' },
    3: { color: '#f59e0b', label: 'Năng lực Xét nghiệm Cấp 3' },
    2: { color: '#0ea5e9', label: 'Năng lực Xét nghiệm Cấp 2' },
    1: { color: '#94a3b8', label: 'Năng lực Xét nghiệm Cấp 1' },
    0: { color: '#cbd5e1', label: 'Chưa phân hạng' },
  };
  function tierInfo(tier, isActive) {
    if (!isActive) return { color: '#9ca3af', label: 'Tạm ngừng' };
    return TIER_INFO[tier] || TIER_INFO[0];
  }
  function labIcon(tier, isActive) {
    const color = tierInfo(tier, isActive).color;
    const num = isActive && tier >= 1 && tier <= 5 ? tier : '';
    const svg = `<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        <text x="12" y="15.5" text-anchor="middle" font-size="10" fill="#fff" font-weight="bold">${num || 'XN'}</text>
      </svg>`;
    // Bọc SVG trong lớp con .lab-icon-inner. KHI HIGHLIGHT chỉ scale lớp con này,
    // KHÔNG đụng transform của marker container (Leaflet dùng transform để định vị!).
    return L.divIcon({
      className: 'lab-map-icon',
      html: `<div class="lab-icon-inner" style="transition:transform .2s;transform-origin:center bottom;">${svg}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14],
    });
  }
  // ------------------------------------------------------------------
  // LOAD PXN (dùng capability_tier từ DB) + kỹ thuật cho panel
  // ------------------------------------------------------------------
  async function loadLabs(force) {
    if (_labsCache && !force) return _labsCache;
    try {
      const { data: labs, error: e1 } = await window.supabaseClient
        .from('laboratories')
        .select(
          'id, name, address, phone, lat, lng, level, bsl_level, is_active, ' +
            'capability_tier, qsm_level, qsm_label, network_tier, ' +
            'head_name, head_phone, head_email, does_microbiology, iso15189_scope, ' +
            'external_qa, interlab, reports_positive, periodic_report, ' +
            'total_biosafety_staff, dedicated_staff, capacity_needs'
        );
      if (e1) throw e1;
      const validLabs = (labs || []).filter((l) => l.lat != null && l.lng != null);
      const ids = validLabs.map((l) => l.id);
      let caps = [];
      if (ids.length) {
        const { data: capData, error: e2 } = await window.supabaseClient
          .from('lab_capabilities')
          .select('lab_id, max_capacity_per_day, turnaround_hours, equipment_detail, test_types(name, category)')
          .in('lab_id', ids);
        if (e2) throw e2;
        caps = capData || [];
      }
      const capsByLab = {};
      caps.forEach((c) => {
        (capsByLab[c.lab_id] = capsByLab[c.lab_id] || []).push(c);
      });
      validLabs.forEach((l) => {
        l._caps = capsByLab[l.id] || [];
        const t = l.capability_tier;
        l._tier = t != null ? t : 0;
        const info = tierInfo(l._tier, l.is_active);
        l._tierColor = info.color;
        l._tierLabel = info.label;
      });
      _labsCache = validLabs;
      return _labsCache;
    } catch (e) {
      console.error('[lab-map] Lỗi tải PXN:', e);
      _labsCache = [];
      return _labsCache;
    }
  }
  // ------------------------------------------------------------------
  // POPUP GỌN — CẤP NĂNG LỰC + ATSH (không QSM)
  // ------------------------------------------------------------------
  function buildLabPopupContent(lab) {
    const isActive = lab.is_active;
    const info = tierInfo(lab._tier, isActive);
    const bslBadge = `<span style="background:#1f2937;color:#fff;padding:1px 6px;border-radius:4px;font-size:11px;">ATSH cấp ${
      lab.bsl_level ?? '?'
    }</span>`;
    const statusText = isActive
      ? '<span style="color:#16a34a;font-weight:bold;">● Đang hoạt động</span>'
      : '<span style="color:#9ca3af;font-weight:bold;">● Tạm ngừng</span>';
    const phone = lab.phone
      ? `<a href="tel:${esc(lab.phone)}" style="color:#0369a1;">${esc(lab.phone)}</a>`
      : '<span style="color:#9ca3af;">—</span>';
    const container = document.createElement('div');
    container.style.minWidth = '250px';
    container.style.fontFamily = "'Inter',sans-serif";
    container.innerHTML = `
      <div style="border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:6px;">
        <div style="font-weight:bold;color:#0f766e;font-size:14px;">${esc(lab.name)}</div>
        <div style="font-size:12px;color:#6b7280;">${esc(lab.level || '—')}</div>
      </div>
      <div style="font-size:12px;line-height:1.9;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${info.color};border:1px solid #fff;box-shadow:0 0 0 1px #cbd5e1;text-align:center;"></span>
          <span style="font-weight:700;">${esc(info.label)}</span>
        </div>
        <div style="margin-top:2px;">${bslBadge}</div>
        <div>${statusText}</div>
        <div><i class='bx bx-phone'></i> ${phone}</div>
      </div>
      <button class="lab-detail-btn" style="margin-top:8px;width:100%;background:#0f766e;color:#fff;border:none;padding:6px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
        <i class='bx bx-list-ul'></i> Xem chi tiết đầy đủ
      </button>
    `;
    container.querySelector('.lab-detail-btn').addEventListener('click', () => {
      openLabDetailPanel(lab);
    });
    return container;
  }
  // ------------------------------------------------------------------
  // PANEL CHI TIẾT ĐẦY ĐỦ (gồm QSM, đầu mối, kỹ thuật)
  // ------------------------------------------------------------------
  function openLabDetailPanel(lab) {
    document.getElementById('lab-detail-panel')?.remove();
    document.getElementById('lab-detail-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'lab-detail-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:20000;';
    backdrop.addEventListener('click', closeLabDetailPanel);
    const yn = (v) =>
      v ? '<span style="color:#16a34a;font-weight:600;">Có</span>' : '<span style="color:#9ca3af;">Không</span>';
    const row = (label, val) =>
      `<div style="display:flex;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:13px;">
         <div style="width:42%;color:#6b7280;">${esc(label)}</div>
         <div style="width:58%;font-weight:500;">${val}</div>
       </div>`;
    const contact =
      lab.head_name || lab.head_phone || lab.head_email
        ? `${row('Đầu mối (Trưởng khoa)', esc(lab.head_name || '—'))}
           ${row('Điện thoại đầu mối', lab.head_phone ? `<a href="tel:${esc(lab.head_phone)}">${esc(lab.head_phone)}</a>` : '—')}
           ${row('Email đầu mối', lab.head_email ? `<a href="mailto:${esc(lab.head_email)}">${esc(lab.head_email)}</a>` : '—')}`
        : row('Đầu mối liên hệ', '<span style="color:#9ca3af;">Chưa khai báo</span>');
    const caps = lab._caps || [];
    const capsHtml = caps.length
      ? `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;">
           <thead><tr style="color:#6b7280;text-align:left;">
             <th style="padding:3px 4px;">Kỹ thuật</th>
             <th style="padding:3px 4px;text-align:center;">CS/ngày</th>
             <th style="padding:3px 4px;text-align:center;">Trả KQ</th>
           </tr></thead>
           <tbody>
             ${caps
               .map(
                 (c) => `<tr style="border-top:1px solid #f1f5f9;">
                   <td style="padding:3px 4px;">${esc(c.test_types?.name || '—')}
                     ${c.equipment_detail ? `<br><span style="color:#9ca3af;font-size:11px;">${esc(c.equipment_detail)}</span>` : ''}
                   </td>
                   <td style="padding:3px 4px;text-align:center;">${c.max_capacity_per_day ?? '—'}</td>
                   <td style="padding:3px 4px;text-align:center;">${c.turnaround_hours != null ? c.turnaround_hours + 'h' : '—'}</td>
                 </tr>`
               )
               .join('')}
           </tbody>
         </table>`
      : '<span style="color:#9ca3af;font-style:italic;">Chưa khai báo năng lực.</span>';
    const info = tierInfo(lab._tier, lab.is_active);
    const panel = document.createElement('div');
    panel.id = 'lab-detail-panel';
    panel.style.cssText =
      'position:fixed;top:0;right:0;width:min(420px,92vw);height:100%;background:#fff;z-index:20001;' +
      'box-shadow:-4px 0 24px rgba(0,0,0,.18);overflow-y:auto;font-family:\'Inter\',sans-serif;';
    panel.innerHTML = `
      <div style="position:sticky;top:0;background:linear-gradient(135deg,#0f766e,#0369a1);color:#fff;padding:14px 16px;">
        <button id="lab-detail-close" style="float:right;background:transparent;border:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;">&times;</button>
        <div style="font-weight:bold;font-size:16px;padding-right:24px;">${esc(lab.name)}</div>
        <div style="font-size:12px;opacity:.9;margin-top:2px;">${esc(lab.level || '')}</div>
      </div>
      <div style="padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${info.color};"></span>
          <b style="font-size:14px;">${esc(info.label)}</b>
        </div>
        <div style="font-weight:bold;color:#0369a1;font-size:13px;margin:10px 0 4px;">📞 Đầu mối liên hệ</div>
        ${contact}
        <div style="font-weight:bold;color:#0369a1;font-size:13px;margin:14px 0 4px;">🏥 Thông tin chung</div>
        ${row('Địa chỉ', esc(lab.address || '—'))}
        ${row('Hotline', lab.phone ? `<a href="tel:${esc(lab.phone)}">${esc(lab.phone)}</a>` : '—')}
        ${row('An toàn sinh học', 'ATSH cấp ' + (lab.bsl_level ?? '?'))}
        ${row('Cấp năng lực xét nghiệm', lab._tier >= 1 ? 'Cấp ' + lab._tier : 'Chưa phân hạng')}
        ${row('Mức chất lượng (QSM)', esc(lab.qsm_label || 'Chưa có'))}
        ${row('Lĩnh vực ISO công nhận', esc(lab.iso15189_scope || '—'))}
        ${row('NS an toàn sinh học', lab.total_biosafety_staff ?? '—')}
        ${row('NS chuyên trách', lab.dedicated_staff ?? '—')}
        <div style="font-weight:bold;color:#0369a1;font-size:13px;margin:14px 0 4px;">✅ Chất lượng & Báo cáo</div>
        ${row('Ngoại kiểm', yn(lab.external_qa))}
        ${row('So sánh liên phòng', yn(lab.interlab))}
        ${row('Báo cáo ca (+) (TT54)', yn(lab.reports_positive))}
        ${row('Báo cáo định kỳ', yn(lab.periodic_report))}
        <div style="font-weight:bold;color:#0369a1;font-size:13px;margin:14px 0 4px;">🧪 Năng lực kỹ thuật</div>
        ${capsHtml}
        ${
          lab.capacity_needs
            ? `<div style="font-weight:bold;color:#0369a1;font-size:13px;margin:14px 0 4px;">📌 Nhu cầu nâng cao</div>
               <div style="font-size:12.5px;color:#374151;">${esc(lab.capacity_needs)}</div>`
            : ''
        }
      </div>
    `;
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    panel.querySelector('#lab-detail-close').addEventListener('click', closeLabDetailPanel);
  }
  function closeLabDetailPanel() {
    document.getElementById('lab-detail-panel')?.remove();
    document.getElementById('lab-detail-backdrop')?.remove();
  }
  function createLabLayer(labs) {
    const useCluster = typeof L.markerClusterGroup === 'function';
    const group = useCluster
      ? L.markerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true, chunkedLoading: true })
      : L.layerGroup();
    if (!useCluster) console.warn('[lab-map] Chưa nhúng Leaflet.markercluster — dùng marker thường.');

    _markersByTier = {}; // reset mỗi lần dựng lại

    labs.forEach((lab) => {
      const marker = L.marker([lab.lat, lab.lng], { icon: labIcon(lab._tier, lab.is_active) });
      marker.bindTooltip(esc(lab.name), { direction: 'top', offset: L.point(0, -14) });
      marker.on('click', function () {
        marker.bindPopup(buildLabPopupContent(lab), { maxWidth: 320 }).openPopup();
      });
      group.addLayer(marker);

      // Gom marker theo cấp để highlight khi hover legend
      const tierKey = lab.is_active && lab._tier >= 1 && lab._tier <= 5 ? lab._tier : 0;
      (_markersByTier[tierKey] = _markersByTier[tierKey] || []).push({ marker, lab });
    });
    return group;
  }

  // ------------------------------------------------------------------
  // HIGHLIGHT MARKER THEO CẤP (hover legend)
  //   CHỈ tác động marker PXN (qua _markersByTier), KHÔNG đụng marker khác
  //   (RRT-ers, sự kiện...). An toàn với cluster: marker bị gom (không có
  //   element) thì bỏ qua, không làm hỏng gì.
  // ------------------------------------------------------------------
  function _allLabMarkers() {
    const out = [];
    Object.values(_markersByTier).forEach((arr) =>
      arr.forEach((o) => out.push(o))
    );
    return out;
  }

  window.__labHighlightTier = function (tier) {
    let shown = 0;
    let total = 0;
    _allLabMarkers().forEach(({ marker, lab }) => {
      const el = marker.getElement && marker.getElement();
      if (!el) return; // đang bị gom trong cluster → bỏ qua
      const isTarget =
        (lab.is_active && lab._tier >= 1 && lab._tier <= 5 ? lab._tier : 0) === tier;
      // CHỈ đổi opacity trên container (an toàn — không dời vị trí).
      // Scale áp vào LỚP CON .lab-icon-inner (không có transform định vị).
      el.style.transition = 'opacity .2s';
      const inner = el.querySelector('.lab-icon-inner');
      if (isTarget) {
        el.style.opacity = '1';
        if (inner) inner.style.transform = 'scale(1.6)';
        shown++;
      } else {
        el.style.opacity = '0.25';
        if (inner) inner.style.transform = '';
      }
    });
    (_markersByTier[tier] || []).forEach(() => total++);
    return { total, shown };
  };

  window.__labResetHighlight = function () {
    _allLabMarkers().forEach(({ marker }) => {
      const el = marker.getElement && marker.getElement();
      if (!el) return;
      el.style.opacity = ''; // KHÔNG đụng el.style.transform (Leaflet dùng để định vị)
      const inner = el.querySelector('.lab-icon-inner');
      if (inner) inner.style.transform = '';
    });
  };

  // Gắn sự kiện hover cho legend (gọi sau khi legend đã vào DOM)
  window.__labBindLegendHover = function (legendRoot) {
    const root = legendRoot || document;
    root.querySelectorAll('[data-lab-tier]').forEach((item) => {
      const tier = parseInt(item.getAttribute('data-lab-tier'));
      item.style.cursor = 'pointer';
      item.addEventListener('mouseenter', () => window.__labHighlightTier(tier));
      item.addEventListener('mouseleave', () => window.__labResetHighlight());
    });
  };

  window.LabMapLayer = {
    attach: async function (map, opts = {}) {
      if (!map || typeof L === 'undefined') {
        console.warn('[lab-map] Thiếu map hoặc Leaflet.');
        return;
      }
      const labs = await loadLabs();
      if (_labLayer && map.hasLayer(_labLayer)) map.removeLayer(_labLayer);
      _labLayer = createLabLayer(labs);
      if (opts.show) _labLayer.addTo(map);
      if (opts.standalone) return { layer: _labLayer, count: labs.length };
      const overlays = { '🧪 Phòng xét nghiệm': _labLayer };
      if (opts.otherOverlays && typeof opts.otherOverlays === 'object') {
        Object.entries(opts.otherOverlays).forEach(([name, layer]) => {
          if (layer) overlays[name] = layer;
        });
      }
      if (!_layersControl) {
        _layersControl = L.control.layers(null, overlays, { collapsed: true, position: 'topright' }).addTo(map);
      } else {
        _layersControl.addOverlay(_labLayer, '🧪 Phòng xét nghiệm');
      }
      return { layer: _labLayer, count: labs.length, control: _layersControl };
    },
    reload: async function (map, opts = {}) {
      await loadLabs(true);
      return window.LabMapLayer.attach(map, opts);
    },
    getCache: function () { return _labsCache; },
    openDetail: function (lab) { openLabDetailPanel(lab); },
    highlightTier: function (t) { return window.__labHighlightTier(t); },
    resetHighlight: function () { return window.__labResetHighlight(); },
    bindLegendHover: function (root) { return window.__labBindLegendHover(root); },
    // Legend theo 5 CẤP NĂNG LỰC — mỗi dòng có data-lab-tier để hover highlight
    legendHtml: function () {
      const item = (tier, color, text) =>
        `<div data-lab-tier="${tier}" style="display:flex;align-items:center;gap:6px;margin:2px 0;padding:1px 3px;border-radius:4px;transition:background .15s;"
              onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background=''">
           <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};"></span>
           <span style="font-size:12px;">${text}</span>
         </div>`;
      return `
        <hr style="margin:2px 0;">
        <b style="font-size:10px;">Năng lực xét nghiệm</b>

        ${item(5, TIER_INFO[5].color, 'Cấp 5')}
        ${item(4, TIER_INFO[4].color, 'Cấp 4')}
        ${item(3, TIER_INFO[3].color, 'Cấp 3')}
        ${item(2, TIER_INFO[2].color, 'Cấp 2')}
        ${item(1, TIER_INFO[1].color, 'Cấp 1')}
        ${item(0, TIER_INFO[0].color, 'Chưa phân hạng / tạm ngừng')}`;
    },
  };
  console.log('[lab-map-layer.js] ✅ Lớp PXN (5 cấp + hover highlight) sẵn sàng.');
})();
/* ============================================================================
   GHÉP VÀO renderMapPage():
     if (window.LabMapLayer) {
       await window.LabMapLayer.attach(map, {
         show: false,
         otherOverlays: { 'Thành viên RRT': markersLayerGroupInstance, 'Sự kiện': incidentsLayerGroup },
       });
     }

   LEGEND — sau khi chèn legendHtml() vào DOM, GẮN HOVER:
     div.innerHTML += window.LabMapLayer.legendHtml();
     window.LabMapLayer.bindLegendHover(div);   // ← thêm dòng này để kích hoạt highlight
============================================================================ */
