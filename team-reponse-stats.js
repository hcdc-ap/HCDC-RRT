// ============================================================================
// THỐNG KÊ PHẢN HỒI THEO ĐỘI & VỊ TRÍ (cho trang Hồ sơ sự kiện)
//   Đồng ý / Từ chối / Chưa phản hồi — nhóm theo team. Phục vụ điều xe, vật tư.
//   Cộng thêm thống kê số lượng vị trí (position) theo từng đội (Bản Tiếng Việt).
//   Quyền xem: admin (tất cả đội) · ward_admin (chỉ đội thuộc ward mình).
// ----------------------------------------------------------------------------
// GHÉP:
//   (1) Thêm nút vào cụm nút header (cạnh Xét nghiệm/IAP):
//       <button class="btn btn-outline-dark" id="btn-team-stats" style="display:none;">
//         <i class='bx bx-bar-chart-alt-2'></i> Thống kê theo đội
//       </button>
//   (2) Trong openDossierView, sau khi có 'inc', gọi:  window.bindTeamStatsButton(inc);
//   (3) Nhúng file này sau khi có escapeHtml + appState.
// ============================================================================

(function () {
  'use strict';

  // TỪ ĐIỂN DỊCH VỊ TRÍ (CHỨC DANH) SANG TIẾNG VIỆT
  const posMapFull = {
    'No position': 'Chưa có vị trí',
    'Leader': 'Đội trưởng',
    'Epidemic': 'Cán bộ Dịch tễ',
    'Member': 'Cán bộ Lấy mẫu',
    'Engineer': 'Cán bộ Xử lý môi trường',
    'Media': 'Cán bộ Truyền thông',
    'Logistic': 'Hậu cần',
    'Driver': 'Lái xe',
  };

  const esc = (s) =>
    window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? '');

  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .trim();

  // Nguồn nhân sự: ưu tiên appState.users (enterDashboard nạp), fallback teamData.
  function _memberSource() {
    const u = window.appState?.users;
    if (Array.isArray(u) && u.length) return u;
    const td = window.appState?.teamData;
    if (Array.isArray(td) && td.length) return td;
    return [];
  }

  // Tra thông tin thành viên theo email (đội, tên, ward, position)
  function lookupMember(email) {
    const e = norm(email);
    const src = _memberSource();
    const m = src.find((x) => norm(x.email) === e);
    
    // Lấy chức danh tiếng Anh và dịch sang Tiếng Việt bằng từ điển
    const rawPos = m?.position ? String(m.position).trim() : '';
    const translatedPos = posMapFull[rawPos] || rawPos || 'Chưa phân công';

    return {
      email,
      name: m?.full_name || m?.username || m?.name || email,
      team: (m?.team && String(m.team).trim()) || 'Chưa có đội',
      position: translatedPos, // Đã được dịch sang Tiếng Việt
      ma_xa:
        (m?.workplace_ma_xa != null
          ? String(m.workplace_ma_xa).trim()
          : null) || (m?.ma_xa != null ? String(m.ma_xa).trim() : null),
    };
  }

  // Phân loại từng người mời vào: confirmed / declined / pending
  function classifyMembers(inc) {
    const invited = String(inc.initial_selected_members || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    const confirmedStr = norm(inc.members);
    const declinedStr = norm(inc.declined_members);

    return invited.map((email) => {
      const info = lookupMember(email);
      let status = 'pending';
      const keys = [norm(email), norm(info.name)].filter(Boolean);
      if (keys.some((k) => confirmedStr.includes(k))) status = 'confirmed';
      else if (keys.some((k) => declinedStr.includes(k))) status = 'declined';
      return { ...info, status };
    });
  }

  // Gom theo đội → {team: {confirmed:[], declined:[], pending:[]}}
  function groupByTeam(members) {
    const g = {};
    members.forEach((m) => {
      if (!g[m.team]) g[m.team] = { confirmed: [], declined: [], pending: [] };
      g[m.team][m.status].push(m);
    });
    return g;
  }

  // Lọc theo quyền
  function scopeByRole(members) {
    const role = norm(window.userSession?.role);
    if (role === 'admin' || role === 'super_admin') return members;
    if (role === 'ward_admin') {
      const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();
      if (!myMaXa) return [];
      const teamsInMyWard = new Set(
        members.filter((m) => m.ma_xa && m.ma_xa === myMaXa).map((m) => m.team)
      );
      return members.filter((m) => teamsInMyWard.has(m.team));
    }
    return []; 
  }

  // Render bảng vào 1 container
  function renderStatsTable(inc) {
    const all = classifyMembers(inc);
    const scoped = scopeByRole(all);
    const grouped = groupByTeam(scoped);
    const teams = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'vi'));

    if (teams.length === 0) {
      return '<div class="alert alert-secondary mb-0">Không có dữ liệu phản hồi trong phạm vi của bạn.</div>';
    }

    let tC = 0,
      tD = 0,
      tP = 0;
    
    // Tích lũy vị trí của toàn bộ chiến dịch (để in ở dưới cùng nếu cần)
    const grandPositionStats = {};

    const rows = teams
      .map((team) => {
        const g = grouped[team];
        const c = g.confirmed.length,
          d = g.declined.length,
          p = g.pending.length;
        tC += c;
        tD += d;
        tP += p;
        const tot = c + d + p;
        const nameList = (arr) =>
          arr.length
            ? arr.map((m) => esc(m.name)).join(', ')
            : '<span class="text-muted">—</span>';

        // ==========================================
        // Tính toán số lượng vị trí trong ĐỘI
        // Chỉ đếm những người đã CONFIRMED (đồng ý tham gia)
        // ==========================================
        const teamPositionStats = {};
        g.confirmed.forEach(member => {
            const pos = member.position; // Đã là tiếng Việt nhờ lookupMember
            teamPositionStats[pos] = (teamPositionStats[pos] || 0) + 1;
            grandPositionStats[pos] = (grandPositionStats[pos] || 0) + 1;
        });

        // Tạo HTML cho bảng thống kê vị trí của đội
        let positionHtml = '';
        const posKeys = Object.keys(teamPositionStats);
        if (posKeys.length > 0) {
            positionHtml = `
              <div class="mt-2 p-2 rounded" style="background-color: #e9ecef; border: 1px dashed #ced4da;">
                 <div class="fw-bold mb-1" style="font-size:11px; color:#006a75;">📊 CƠ CẤU NHÂN SỰ ĐỘI RRT (Đã đồng ý):</div>
                 <div class="d-flex flex-wrap gap-2">
                   ${posKeys.map(pos => `<span class="badge bg-secondary">${esc(pos)}: ${teamPositionStats[pos]}</span>`).join('')}
                 </div>
              </div>
            `;
        } else {
             positionHtml = `<div class="mt-2 text-muted" style="font-size:11px; font-style: italic;">Chưa có nhân sự xác nhận tham gia để thống kê vị trí.</div>`;
        }


        return `
        <tr>
          <td class="fw-bold">${esc(team)}</td>
          <td class="text-center text-success fw-bold">${c}</td>
          <td class="text-center text-danger fw-bold">${d}</td>
          <td class="text-center text-secondary fw-bold">${p}</td>
          <td class="text-center">${tot}</td>
        </tr>
        <tr class="table-light">
          <td colspan="5" style="font-size:12px;">
            <div class="row g-2">
              <div class="col-md-4"><span class="text-success">✅ Đồng ý:</span> ${nameList(g.confirmed)}</div>
              <div class="col-md-4"><span class="text-danger">❌ Từ chối:</span> ${nameList(g.declined)}</div>
              <div class="col-md-4"><span class="text-secondary">⏳ Chưa phản hồi:</span> ${nameList(g.pending)}</div>
            </div>
            ${positionHtml}
          </td>
        </tr>`;
      })
      .join('');

    // Tạo HTML tổng kết cơ cấu nhân sự toàn chiến dịch
    let grandPosHtml = '';
    const grandKeys = Object.keys(grandPositionStats);
    if(grandKeys.length > 0) {
        grandPosHtml = `
            <div class="alert alert-info mt-3 mb-1 py-2">
                <div class="fw-bold mb-1" style="font-size:13px;"><i class='bx bx-briefcase'></i> TỔNG CƠ CẤU LỰC LƯỢNG RRT (Đã đồng ý):</div>
                <div class="d-flex flex-wrap gap-2">
                   ${grandKeys.map(pos => `<span class="badge bg-primary fs-6">${esc(pos)}: ${grandPositionStats[pos]}</span>`).join('')}
                 </div>
            </div>
        `;
    }

    return `
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-2">
          <thead style="background:#006a75;color:#fff;">
            <tr>
              <th>Team</th>
              <th class="text-center">✅ Đồng ý</th>
              <th class="text-center">❌ Từ chối</th>
              <th class="text-center">⏳ Chưa phản hồi</th>
              <th class="text-center">Tổng</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr style="background:#f1f5f9;font-weight:bold;">
              <td>TỔNG CỘNG</td>
              <td class="text-center text-success">${tC}</td>
              <td class="text-center text-danger">${tD}</td>
              <td class="text-center text-secondary">${tP}</td>
              <td class="text-center">${tC + tD + tP}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${grandPosHtml}
      <div class="small text-muted mt-2">
        <i class='bx bx-info-circle'></i> Dùng để phân công nhiệm vụ, điều xe, vật tư theo số thành viên xác nhận tham gia.
      </div>`;
  }

  // Mở modal thống kê
  window.openTeamStatsModal = function (inc) {
    document.getElementById('team-stats-modal-wrap')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'team-stats-modal-wrap';
    wrap.innerHTML = `
      <div class="modal fade" id="teamStatsModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header" style="background:#006a75;color:#fff;">
              <h5 class="modal-title"><i class='bx bx-bar-chart-alt-2'></i> Thống kê phản hồi theo đội</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-2"><strong>${esc(
                inc.event_name || 'Sự kiện'
              )}</strong></div>
              ${renderStatsTable(inc)}
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const el = document.getElementById('teamStatsModal');
    new bootstrap.Modal(el).show();
    el.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  };

  // Gắn nút (ẩn/hiện theo quyền) — gọi trong openDossierView
  window.bindTeamStatsButton = function (inc) {
    const btn = document.getElementById('btn-team-stats');
    if (!btn) return;
    const role = norm(window.userSession?.role);
    const canView =
      role === 'admin' || role === 'super_admin' || role === 'ward_admin';
    btn.style.display = canView ? 'inline-block' : 'none';
    btn.onclick = () => window.openTeamStatsModal(inc);
  };
})();
