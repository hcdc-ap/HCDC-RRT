// ============================================================
// EMERGENCY — Điều động sự cố, chọn thành viên, kích hoạt, SITREP
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

// Chuẩn hoá tên đội để so sánh: cùng dạng Unicode (NFC), bỏ khoảng trắng thừa
function normTeam(t) {
  return String(t || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

document.addEventListener('DOMContentLoaded', function () {
  // Main function to load and display the member list
  // ============================================================
  // LOGIC TRANG EMERGENCY (ĐIỀU ĐỘNG SỰ CỐ) - TỰ ĐỘNG NẠP DỮ LIỆU
  // ============================================================
  window.renderEmergencyPage = async function () {
    let teamData = window.appState.teamData || [];
    let rosters = window.appState.roster_schedules || [];

    // 1. TỰ ĐỘNG KIỂM TRA VÀ NẠP DỮ LIỆU NẾU THIẾU
    const missingTeam = teamData.length === 0;
    const missingRosters = rosters.length === 0;

    if (missingTeam || missingRosters) {
      console.log(
        '🚀 Trang Điều động: Phát hiện thiếu dữ liệu, đang tải bổ sung...'
      );
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      try {
        const fetchTasks = [];

        // Nếu thiếu danh sách nhân sự, gọi hàm tải nhân sự
        if (missingTeam && typeof window.renderTeamTable === 'function') {
          fetchTasks.push(window.renderTeamTable());
        }

        // Nếu thiếu lịch trực, gọi hàm tải lịch trực
        if (missingRosters && typeof window.loadRosterData === 'function') {
          fetchTasks.push(window.loadRosterData());
        }

        // Chờ cho cả 2 dữ liệu được tải xong song song
        await Promise.all(fetchTasks);

        // Cập nhật lại biến từ appState sau khi đã tải xong
        teamData = window.appState.teamData || [];
        rosters = window.appState.roster_schedules || [];
      } catch (err) {
        console.error('❌ Lỗi nạp dữ liệu cho trang Điều động:', err);
        showToast('Lỗi tải dữ liệu. Vui lòng F5 lại trang.', 'error');
      } finally {
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
      }

      // Nếu tải xong mà hệ thống vẫn không có Đội nào (database trống), thì dừng
      if (teamData.length === 0) return;
    }
    // ==========================================
    // LỌC THEO QUYỀN: ward_admin chỉ thấy người xã mình + tuyến cơ sở
    // ==========================================
    const _role = (window.userSession?.role || '').toLowerCase();
    if (_role === 'ward_admin') {
      const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();
      const grassrootsUnits = [
        'trạm y tế phường/xã/ đặc khu',
        'ubnd phường/xã/ đặc khu',
      ];
      teamData = teamData.filter((m) => {
        const mMaXa = String(m.workplace_ma_xa || '').trim();
        const mFax = String(m.fax || '')
          .toLowerCase()
          .trim();
        return myMaXa && mMaXa === myMaXa && grassrootsUnits.includes(mFax);
      });
    }
    // (admin: giữ nguyên teamData — thấy tất cả)
    // ==========================================
    // 2. Logic kiểm tra Lịch trực Hôm nay (ĐÃ BỌC THÉP MÚI GIỜ)
    // ==========================================
    const today = new Date();
    // Tạo chuỗi YYYY-MM-DD an toàn theo giờ Local (Việt Nam)
    const todayStr =
      today.getFullYear() +
      '-' +
      String(today.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(today.getDate()).padStart(2, '0');

    let onDutyTeam = null;

    rosters.forEach((r) => {
      if (!r.duty_date) return;

      const dutyDateStr = String(r.duty_date).split('T')[0];

      // So sánh chuỗi ngày + Nới lỏng kiểm tra roster
      if (
        dutyDateStr === todayStr &&
        (!r.shift_type || r.shift_type === 'roster')
      ) {
        onDutyTeam = r.team_name || 'Không tên';
      }
    });

    // ==========================================
    // 3. Cập nhật Giao diện Alert Box
    // ==========================================
    const alertBox = document.getElementById('on-duty-alert');
    const alertTitle = document.getElementById('on-duty-title');
    const alertDesc = document.getElementById('on-duty-desc');
    const alertAction = document.getElementById('on-duty-action');

    if (onDutyTeam) {
      alertBox.className =
        'alert alert-success d-flex align-items-center justify-content-between shadow-sm mb-4';
      alertBox.style.borderLeft = '5px solid #198754';

      const onDutyMembers = teamData.filter(
        (u) => normTeam(u.team) === normTeam(onDutyTeam)
      );
      const memberNames =
        onDutyMembers.length > 0
          ? onDutyMembers
              .map((m) => m.full_name || m.username || m.email)
              .join(', ')
          : 'Chưa có thành viên nào';

      alertTitle.innerHTML = `<i class='bx bx-calendar-check'></i> ĐỘI TRỰC HÔM NAY: <b>${onDutyTeam}</b>`;
      alertDesc.innerHTML = `<strong>Danh sách:</strong> ${memberNames}`;
      alertAction.innerHTML = `<button class="btn btn-success btn-sm fw-bold" onclick="autoSelectTeam('${jsAttr(onDutyTeam)}')"><i class='bx bx-check-double'></i> Chọn toàn bộ ${onDutyTeam}</button>`;
    } else {
      alertBox.className =
        'alert alert-warning d-flex align-items-center justify-content-between shadow-sm mb-4';
      alertBox.style.borderLeft = '5px solid #ffc107';
      alertTitle.innerHTML = `<i class='bx bx-error'></i> KHÔNG CÓ LỊCH TRỰC HÔM NAY`;
      alertDesc.innerHTML = `Vui lòng sử dụng bộ lọc bên dưới để chọn nhân sự phù hợp.`;
      alertAction.innerHTML = ``;
    }

    // 4. Render DataTable
    if ($.fn.DataTable.isDataTable('#memberListTable')) {
      $('#memberListTable').DataTable().clear().destroy();
    }

    const tbody = document.getElementById('memberListTable-body');
    tbody.innerHTML = '';

    const teamSet = new Set(
      teamData
        .map((m) => normTeam(m.team))
        .filter((t) => t !== '' && t !== 'No team')
    );
    const teamSelect = document.getElementById('emer-filter-team');
    if (teamSelect) {
      const prev = teamSelect.value;
      teamSelect.innerHTML = '<option value="all">-- Tất cả Đội --</option>';
      [...teamSet].sort((a, b) => a.localeCompare(b, 'vi')).forEach((t) => {
        teamSelect.add(new Option(t, t));
      });
      // Giữ lựa chọn đang lọc khi bảng được vẽ lại
      if ([...teamSet].includes(prev)) teamSelect.value = prev;
    }

    teamData.forEach((m) => {
      const name = m.full_name || m.username || m.email;
      const position = m.position || 'No position';
      const posLower = String(position).toLowerCase();

      let posBadge = `<span class="badge bg-secondary">${
        position === 'No position' ? 'Chưa phân công' : position
      }</span>`;
      if (posLower.includes('leader'))
        posBadge = `<span class="badge bg-danger">Đội trưởng</span>`;
      else if (posLower.includes('epidemic'))
        posBadge = `<span class="badge bg-info text-dark">Cán bộ Dịch tễ</span>`;
      else if (posLower.includes('member'))
        posBadge = `<span class="badge bg-primary">Cán bộ Lấy mẫu</span>`;
      else if (posLower.includes('engineer'))
        posBadge = `<span class="badge bg-dark text-white">Cán bộ Xử lý MT</span>`;
      else if (posLower.includes('media'))
        posBadge = `<span class="badge bg-success text-white">Cán bộ Truyền thông</span>`;
      else if (posLower.includes('logistic'))
        posBadge = `<span class="badge bg-secondary text-white">Hậu cần</span>`;
      else if (posLower.includes('driver'))
        posBadge = `<span class="badge bg-warning text-dark">Lái xe</span>`;

      const positionCell = `<span style="display:none;">${position}</span>${posBadge}`;

      let rankHtml = '<span class="badge bg-secondary">N/A</span>';
      try {
        if (typeof window.calculateRRTLevel === 'function')
          rankHtml = window.calculateRRTLevel(m);
      } catch (e) {}

      const row = `
          <tr data-team="${window.escapeHtml ? window.escapeHtml(normTeam(m.team)) : normTeam(m.team)}">
              <td class="text-center">
                  <input type="checkbox" class="member-checkbox form-check-input" value="${
                    m.email
                  }" data-id="${m.id}" data-team="${m.team || ''}">
              </td>
              <td class="fw-bold">
                  ${window.escapeHtml ? window.escapeHtml(name) : name} <br>
                  ${rankHtml}
              </td>
              <td>${m.team && m.team !== 'No team' ? m.team : '-'}</td>
              <td>${positionCell}</td> 
              <td>${m.phone || '-'}</td>
              <td>${m.academic_degree || m.academic || '-'}</td>
              <td>${m.department || '-'}</td>
              <td>${m.ward || '-'}</td>
          </tr>
      `;
      tbody.insertAdjacentHTML('beforeend', row);
    });

    const table = $('#memberListTable').DataTable({
      responsive: true,
      dom: '<"dataTables_top"Blf>rt<"dataTables_bottom"ip>',
      buttons: [
        'copy',
        'csv',
        'excel',
        'pdf',
        'print',
        { extend: 'colvis', text: 'Columns' },
      ],
      language: {
        search: 'Tìm kiếm:',
        lengthMenu: 'Hiển thị _MENU_ dòng',
        info: 'Hiển thị _START_ đến _END_ của _TOTAL_ hồ sơ',
        paginate: {
          first: 'Đầu',
          last: 'Cuối',
          next: 'Sau',
          previous: 'Trước',
        },
      },
      order: [[2, 'asc']],
    });

    // ===== BỘ LỌC BỀN VỮNG: đăng ký 1 lần duy nhất, sống qua mọi lần draw =====
    // (thay cho push -> draw -> pop cũ vốn bị mất filter khi user sort/search)
    if (!window._emerFilterRegistered) {
      window._emerFilterRegistered = true;
      $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
        if (settings.nTable.id !== 'memberListTable') return true;
        const teamVal = $('#emer-filter-team').val() || 'all';
        const roleVal = $('#emer-filter-role').val() || 'all';
        // So theo tên đội gốc lưu trên dòng (data-team), KHÔNG theo data[2]:
        // dữ liệu tìm kiếm của DataTables 2 đã bỏ dấu tiếng Việt nên
        // "Team Phường ..." không bao giờ bằng giá trị trong dropdown.
        const tr = settings.aoData[dataIndex]?.nTr;
        const rowTeam = tr ? tr.getAttribute('data-team') || '' : normTeam(data[2]);
        const matchTeam = teamVal === 'all' || rowTeam === normTeam(teamVal);
        const matchRole =
          roleVal === 'all' || String(data[3]).includes(roleVal);
        return matchTeam && matchRole;
      });
    }

    $('#emer-filter-team, #emer-filter-role')
      .off('change.emer')
      .on('change.emer', function () {
        $('#memberListTable').DataTable().draw();
        if (typeof window.syncSelectAllState === 'function')
          window.syncSelectAllState();
      });

    // ===== MỖI LẦN BẢNG VẼ LẠI (đổi trang / lọc / sort) =====
    // -> khôi phục trạng thái tick từ state, đồng bộ checkbox tổng
    table.off('draw.emerSel').on('draw.emerSel', function () {
      if (typeof window.restoreEmergencyChecks === 'function')
        window.restoreEmergencyChecks();
      if (typeof window.syncSelectAllState === 'function')
        window.syncSelectAllState();
    });

    // Khôi phục lựa chọn nếu bảng vừa bị render lại giữa lúc admin đang chọn
    if (typeof window.restoreEmergencyChecks === 'function')
      window.restoreEmergencyChecks();
    if (typeof window.renderSelectedPanel === 'function')
      window.renderSelectedPanel();
    if (typeof window.updateSelectedCount === 'function')
      window.updateSelectedCount();
  };

  // ============================================================
  // HELPER: TÍNH ĐIỂM & XẾP HẠNG THỰC CHIẾN (COMBAT RATING)
  // ============================================================
  window.calculateRRTLevel = function (member) {
    let score = 0;
    const username = String(member.username).toLowerCase();
    const email = String(member.email).toLowerCase();

    // 1. Cộng điểm Đào tạo (+1 điểm/khóa)
    const trainingRecords = window.appState.training?.records || [];
    trainingRecords.forEach((r) => {
      if (
        r.result === 'pass' &&
        (r.username.toLowerCase() === username ||
          r.username.toLowerCase() === email)
      ) {
        score += 1;
      }
    });

    // 2. Cộng điểm Thực chiến (+2 điểm/vụ)
    // 2. Cộng điểm Thực chiến (+2 điểm/vụ) — đọc đúng schema DB
    const history = window.appState.deployment_history || [];
    const missions = new Set();
    history.forEach((h) => {
      if (
        h.user_id === member.id &&
        (h.action_type === 'deployed' || h.action_type === 'replace_in') &&
        h.incident_id
      ) {
        missions.add(h.incident_id);
      }
    });
    score += missions.size * 2;

    // 3. Cộng điểm Vai trò (+5 nếu là Leader)
    if (member.position === 'Leader') score += 5;
    if (member.position === 'Epidemic') score += 3;

    // 4. Trả về HTML Badge
    if (score > 15)
      return `<span class="badge bg-warning text-dark" title="Chuyên gia: ${score} pts">👑 Chuyên gia</span>`;
    if (score >= 7)
      return `<span class="badge bg-danger" title="Tinh nhuệ: ${score} pts">⭐ Tinh nhuệ</span>`;
    if (score >= 3)
      return `<span class="badge bg-primary" title="Chính quy: ${score} pts">🎖️ Chính quy</span>`;

    return `<span class="badge bg-light text-secondary border" title="Tân binh: ${score} pts">🛡️ Tân binh</span>`;
  };
  // ==========================================
  // CÁC HÀM HELPER ĐI KÈM
  // ==========================================
  // ================================================================
  // [PATCH v2] STATE CHỌN THÀNH VIÊN — NGUỒN SỰ THẬT DUY NHẤT
  // Map<emailLowercase, {email, name, team}> — độc lập hoàn toàn với
  // phân trang, bộ lọc và việc bảng bị render lại.
  // ================================================================
  window.emergencySelection = window.emergencySelection || new Map();

  const _normEmail = (e) =>
    String(e || '')
      .trim()
      .toLowerCase();
  const _escHtml = (s) =>
    typeof window.escapeHtml === 'function'
      ? window.escapeHtml(String(s ?? ''))
      : String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

  // Lấy tên hiển thị từ dòng chứa checkbox (bỏ badge xếp hạng)
  function _extractMemberInfo(checkboxEl) {
    const $row = $(checkboxEl).closest('tr');
    const name = $row
      .find('td')
      .eq(1)
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .trim();
    return {
      email: checkboxEl.value,
      name: name || checkboxEl.value,
      team: $(checkboxEl).data('team') || '',
    };
  }

  window.updateSelectedCount = function () {
    const countEl = document.getElementById('selected-count');
    if (countEl) countEl.textContent = window.emergencySelection.size;
  };

  // Khôi phục trạng thái tick cho toàn bộ row trong bảng (kể cả trang ẩn)
  window.restoreEmergencyChecks = function () {
    if (!$.fn.DataTable.isDataTable('#memberListTable')) return;
    const table = $('#memberListTable').DataTable();
    table.$('input.member-checkbox').each(function () {
      this.checked = window.emergencySelection.has(_normEmail(this.value));
    });
  };

  // Đồng bộ checkbox tổng (checked / indeterminate) theo các dòng ĐANG LỌC
  window.syncSelectAllState = function () {
    const el = document.getElementById('selectAllMembers');
    if (!el || !$.fn.DataTable.isDataTable('#memberListTable')) return;
    const table = $('#memberListTable').DataTable();
    const boxes = $(
      'input.member-checkbox',
      table.rows({ search: 'applied' }).nodes()
    );
    const total = boxes.length;
    const checked = boxes.filter(':checked').length;
    el.checked = total > 0 && checked === total;
    el.indeterminate = checked > 0 && checked < total;
  };

  // ================================================================
  // PANEL THEO DÕI "ĐÃ CHỌN AI" — tự chèn phía trên bảng
  // ================================================================
  window.renderSelectedPanel = function () {
    let panel = document.getElementById('emergency-selected-panel');
    if (!panel) {
      const tableEl = document.getElementById('memberListTable');
      if (!tableEl || !tableEl.parentNode) return;
      panel = document.createElement('div');
      panel.id = 'emergency-selected-panel';
      panel.style.cssText =
        'display:none;background:#fff8f0;border:1px solid #fd7e14;' +
        'border-radius:10px;padding:12px 14px;margin:10px 0;';
      tableEl.parentNode.insertBefore(panel, tableEl);
    }

    const selected = [...window.emergencySelection.values()];
    if (selected.length === 0) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }

    const chips = selected
      .map((m) => {
        const emailAttr = _escHtml(m.email).replace(/'/g, '&#39;');
        return (
          `<span class="badge" style="background:#fd7e14;color:#fff;` +
          `font-weight:500;font-size:13px;padding:6px 10px;border-radius:16px;` +
          `display:inline-flex;align-items:center;gap:6px;margin:3px;">` +
          `${_escHtml(m.name)}` +
          (m.team
            ? ` <small style="opacity:.85">(${_escHtml(m.team)})</small>`
            : '') +
          ` <a href="javascript:void(0)" onclick="removeSelectedMember('${jsAttr(emailAttr)}')"` +
          ` title="Bỏ chọn ${_escHtml(m.name)}"` +
          ` style="color:#fff;font-weight:700;text-decoration:none;line-height:1;">✕</a>` +
          `</span>`
        );
      })
      .join('');

    panel.style.display = 'block';
    panel.innerHTML =
      `<div style="display:flex;align-items:center;justify-content:space-between;` +
      `flex-wrap:wrap;gap:8px;margin-bottom:6px;">` +
      `<strong style="color:#c2410c;"><i class='bx bx-user-check'></i> ` +
      `Đã chọn ${selected.length} thành viên</strong>` +
      `<button type="button" class="btn btn-outline-danger btn-sm" ` +
      `onclick="clearAllSelectedMembers()">` +
      `<i class='bx bx-x-circle'></i> Bỏ chọn tất cả</button></div>` +
      `<div>${chips}</div>`;
  };

  function _afterSelectionChanged() {
    window.updateSelectedCount();
    window.renderSelectedPanel();
    window.syncSelectAllState();
  }

  // Bỏ chọn 1 người (từ nút ✕ trên panel)
  window.removeSelectedMember = function (email) {
    const key = _normEmail(email);
    window.emergencySelection.delete(key);
    if ($.fn.DataTable.isDataTable('#memberListTable')) {
      const table = $('#memberListTable').DataTable();
      table.$('input.member-checkbox').each(function () {
        if (_normEmail(this.value) === key) this.checked = false;
      });
    }
    _afterSelectionChanged();
  };

  // Bỏ chọn tất cả
  window.clearAllSelectedMembers = function (silent) {
    window.emergencySelection.clear();
    if ($.fn.DataTable.isDataTable('#memberListTable')) {
      $('#memberListTable')
        .DataTable()
        .$('input.member-checkbox')
        .prop('checked', false);
    }
    _afterSelectionChanged();
    if (!silent && typeof showToast === 'function')
      showToast('Đã bỏ chọn tất cả thành viên', 'info');
  };

  // ================================================================
  // SỰ KIỆN TICK TỪNG DÒNG (delegate ở document — sống qua mọi lần render)
  // ================================================================
  $(document)
    .off('change.emerSel', '#memberListTable .member-checkbox')
    .on('change.emerSel', '#memberListTable .member-checkbox', function () {
      const key = _normEmail(this.value);
      if (this.checked) {
        window.emergencySelection.set(key, _extractMemberInfo(this));
      } else {
        window.emergencySelection.delete(key);
      }
      _afterSelectionChanged();
    });

  // ================================================================
  // "CHỌN TẤT CẢ" — quét TOÀN BỘ các dòng ĐANG LỌC trên MỌI TRANG
  // (chỉ 1 handler duy nhất, thay cho 3 handler chồng nhau trước đây)
  // ================================================================
  $(document)
    .off('change.emerSelAll', '#selectAllMembers')
    .on('change.emerSelAll', '#selectAllMembers', function () {
      if (!$.fn.DataTable.isDataTable('#memberListTable')) return;
      const isChecked = this.checked;
      const table = $('#memberListTable').DataTable();
      const rows = table.rows({ search: 'applied' }).nodes();
      $('input.member-checkbox', rows).each(function () {
        this.checked = isChecked;
        const key = _normEmail(this.value);
        if (isChecked) {
          window.emergencySelection.set(key, _extractMemberInfo(this));
        } else {
          window.emergencySelection.delete(key);
        }
      });
      _afterSelectionChanged();
    });

  // ================================================================
  // CHỌN NHANH ĐỘI TRỰC — quét mọi trang, không dùng :visible nữa
  // ================================================================
  window.autoSelectTeam = function (teamName) {
    if (!$.fn.DataTable.isDataTable('#memberListTable')) return;
    const table = $('#memberListTable').DataTable();

    // Reset ô search + đặt bộ lọc về đúng đội rồi vẽ lại
    table.search('');
    $('#emer-filter-team').val(normTeam(teamName));
    $('#emer-filter-role').val('all');
    table.draw();

    // Tick TOÀN BỘ dòng khớp bộ lọc, kể cả các trang ẩn
    const rows = table.rows({ search: 'applied' }).nodes();
    let added = 0;
    $('input.member-checkbox', rows).each(function () {
      this.checked = true;
      window.emergencySelection.set(
        _normEmail(this.value),
        _extractMemberInfo(this)
      );
      added++;
    });

    _afterSelectionChanged();
    if (typeof showToast === 'function')
      showToast(
        `Đã chọn toàn bộ ${added} thành viên ${teamName}`,
        added > 0 ? 'success' : 'warning'
      );
  };

  // ================================================================
  // NÚT KÍCH HOẠT — đọc danh sách từ state (không phụ thuộc DOM/trang)
  // ================================================================
  $('#btn-activate-emergency')
    .off('click')
    .on('click', function () {
      const selectedEmails = [...window.emergencySelection.values()].map(
        (m) => m.email
      );

      if (selectedEmails.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 thành viên!', 'warning');
        return;
      }

      document.getElementById('incidentLocation').value = '';
      const nameEl = document.getElementById('incidentName');
      if (nameEl) nameEl.value = '';
      const now = new Date();
      document.getElementById('activationTime').value = now.toLocaleString(
        'vi-VN',
        {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour12: false,
        }
      );
      // Điền sẵn template vào ô Chi tiết (giờ tập trung mặc định = giờ hiện tại VN)
      window.fillActivationDetailTemplate &&
        window.fillActivationDetailTemplate();

      window.tempSelectedEmails = selectedEmails;
      $('#emergencyDetailsModal').modal('show');
    });
  // Event listener for the "Next" button in the details modal
  // Sự kiện nút "Next" (Chuyển sang màn hình Review)
  // ======================================================
  // XỬ LÝ QUY TRÌNH KÍCH HOẠT KHẨN CẤP (NEW & ADD)
  // ======================================================


  // 3. Xử lý nút "Tiếp tục" -> Chuyển sang Modal Review
  // ========================================================================
  // 1. HÀM QUẢN LÝ GIAO DIỆN (TỰ ĐỘNG FETCH DB NẾU BỘ NHỚ TRỐNG)
  // ========================================================================
  window.toggleActivationType = async function () {
    const typeElement = document.querySelector(
      'input[name="activationType"]:checked'
    );
    if (!typeElement) return;
    const type = typeElement.value;

    const groupNew = document.getElementById('group-new-incident');
    const groupAdd = document.getElementById('group-existing-incident');
    const select = document.getElementById('existingIncidentSelect');

    // Tìm hoặc tạo khung hiển thị thông tin thay thế nhân sự
    let replacementInfo = document.getElementById('replacement-info');
    if (!replacementInfo) {
      replacementInfo = document.createElement('div');
      replacementInfo.id = 'replacement-info';
      groupAdd.appendChild(replacementInfo);
    }

    if (type === 'new') {
      // Ẩn ô chọn xã với ward_admin — server tự gắn xã của họ
      const role = (window.userSession?.role || '').toLowerCase();
      if (role === 'ward_admin') {
        const wardInput = document.getElementById('incidentWard');
        if (wardInput) {
          const wardRow =
            wardInput.closest('.form-group') || wardInput.parentElement;
          if (wardRow) wardRow.style.display = 'none';
        }
      }

      groupNew.style.display = 'block';
      groupAdd.style.display = 'none';
      replacementInfo.style.display = 'none';
    } else {
      groupNew.style.display = 'none';
      groupAdd.style.display = 'block';

      // BƯỚC 1: Hiển thị trạng thái đang tải
      select.innerHTML =
        '<option value="">-- Đang tải dữ liệu từ máy chủ... --</option>';
      select.disabled = true;

      try {
        let activeIncidents = [];

        // BƯỚC 2: LUÔN lấy dữ liệu MỚI NHẤT từ DB cho quyết định khẩn cấp.
        // Cache trong bộ nhớ CHỈ dùng làm phương án dự phòng khi mạng lỗi
        // (trước đây ưu tiên cache -> danh sách sự kiện & số người từ chối
        // có thể đã lỗi thời tại thời điểm admin ra quyết định thay thế).
        try {
          const { data, error } = await window.supabaseClient
            .from('incidents')
            .select('*')
            .neq('status', 'closed')
            .order('activation_time', { ascending: false });
          if (error) throw error;
          activeIncidents = data || [];
          // KHÔNG ghi vào appState.trackingIncidents: danh sách này chỉ có sự kiện
          // đang mở, ghi đè làm trang Theo dõi sự kiện mất các sự kiện đã đóng.
          if (!window.appState) window.appState = {};
          window.appState.emergencyActiveIncidents = activeIncidents;
        } catch (fetchErr) {
          console.warn(
            '⚠️ Không tải được sự kiện mới nhất, dùng tạm cache:',
            fetchErr
          );
          activeIncidents = (window.appState?.trackingIncidents || []).filter(
            (inc) => inc.status !== 'closed'
          );
        }

        // BƯỚC 3: Đổ dữ liệu vào Dropdown (build chuỗi 1 lần + escape chống XSS)
        const escOpt = (s) =>
          typeof window.escapeHtml === 'function'
            ? window.escapeHtml(String(s ?? ''))
            : String(s ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');

        let optionsHtml =
          '<option value="">-- Chọn sự kiện cần bổ sung/thay thế --</option>';

        if (activeIncidents.length === 0) {
          optionsHtml +=
            '<option value="" disabled>(Không có sự kiện nào đang hoạt động)</option>';
        } else {
          activeIncidents.forEach((inc) => {
            const eventName =
              inc.event_name || inc.event || 'Sự kiện không tên';
            const location =
              inc.location_text || inc.location || 'Chưa rõ địa điểm';
            const declined = inc.declined_members || '';
            const statusIcon = inc.admin_activate ? '🔴' : '⚠️';

            optionsHtml += `<option value="${escOpt(
              inc.id
            )}" data-declined="${escOpt(declined)}">
            ${statusIcon} [ID: ${escOpt(
              String(inc.id).substring(0, 5)
            )}] ${escOpt(eventName)} (${escOpt(location)})
          </option>`;
          });
        }

        select.innerHTML = optionsHtml;
        select.disabled = false;

        /* ===== HẾT KHỐI 8 — phần "// BƯỚC 4: Xử lý sự kiện khi chọn 1 option"
   và toàn bộ catch của toggleActivationType giữ nguyên phía sau ===== */

        // BƯỚC 4: Xử lý sự kiện khi chọn 1 option
        select.onchange = function () {
          const selectedOption = select.options[select.selectedIndex];
          if (!selectedOption || !selectedOption.value) {
            replacementInfo.style.display = 'none';
            return;
          }

          const declinedStr = selectedOption.getAttribute('data-declined');
          replacementInfo.style.display = 'block';

          if (declinedStr) {
            const declinedArr = declinedStr.split(';').filter(Boolean);
            replacementInfo.innerHTML = `
            <div class="alert alert-danger mt-3 d-flex align-items-center" role="alert">
              <i class='bx bxs-error-circle fs-4 me-2'></i>
              <div>
                <strong>Cần bổ sung thay thế ${
                  declinedArr.length
                } nhân sự không thể tham gia:</strong><br/>
                <small>${declinedArr.join(', ')}</small>
              </div>
            </div>
          `;
          } else {
            replacementInfo.innerHTML = `
            <div class="alert alert-info mt-3 d-flex align-items-center" role="alert">
              <i class='bx bxs-info-circle fs-4 me-2'></i>
              <div>
                <strong>Sự kiện đang diễn ra ổn định.</strong><br/>
                <small>Hiện chưa có nhân sự nào báo không thể tham gia. Lệnh này sẽ tăng cường thêm quân số.</small>
              </div>
            </div>
          `;
          }
        };
      } catch (err) {
        console.error('Lỗi tải sự kiện:', err);
        select.innerHTML =
          '<option value="">-- Lỗi tải dữ liệu, vui lòng thử lại --</option>';
        select.disabled = false;
      }
    }
  };

  // ========================================================================
  // 2. SỰ KIỆN CLICK NÚT "TIẾP TỤC" ĐỂ REVIEW VÀ KIỂM TRA LỊCH TRỰC
  // ========================================================================
  document
    .getElementById('nextToReviewBtn')
    .addEventListener('click', async function () {
      this.blur(); // Xóa focus khỏi nút bấm

      // A. Lấy thông tin từ form
      const typeElement = document.querySelector(
        'input[name="activationType"]:checked'
      );
      if (!typeElement) {
        showToast(
          'Vui lòng chọn loại kích hoạt (Tạo mới / Bổ sung)!',
          'warning'
        );
        return;
      }

      const type = typeElement.value;
      const time = $('#activationTime').val();

      let location = '',
        details = '',
        incidentId = '',
        lat = '',
        lng = '',
        ward = '';

      // Xử lý nhánh Tạo Mới vs Bổ Sung
      let eventName = '';
      if (type === 'new') {
        eventName = ($('#incidentName').val() || '').trim();
        location = $('#incidentLocation').val();
        details = $('#incidentDetails').val();
        lat = $('#incidentLat').val();
        lng = $('#incidentLng').val();
        ward = $('#incidentWard').val();
        if (!eventName) {
          showToast('Vui lòng nhập TÊN sự kiện!', 'warning');
          return;
        }
        if (!location) {
          showToast('Vui lòng nhập địa điểm!', 'warning');
          return;
        }
        if (!details) {
          showToast('Vui lòng nhập chi tiết sự kiện!', 'warning');
          return;
        }
        // Sự kiện HCDC tạo chỉ hiện cho tuyến cơ sở khi có mã phường/xã (RLS incidents:
        // ma_xa = phường/xã của tuyến cơ sở). Mã lấy từ vị trí chọn trên bản đồ.
        const creatorRole = (window.userSession?.role || '').toLowerCase();
        if (!ward && creatorRole !== 'ward_admin') {
          const goOn = window.confirm(
            'Chưa xác định được phường/xã của địa điểm (chưa định vị trên bản đồ).\n\n' +
              'Tuyến cơ sở sẽ KHÔNG thấy sự kiện này, chỉ người được điều động mới thấy.\n\n' +
              'Bấm Hủy để chọn lại địa điểm, hoặc OK để vẫn tạo.'
          );
          if (!goOn) return;
        }
      } else {
        incidentId = $('#existingIncidentSelect').val();
        if (!incidentId) {
          showToast('Vui lòng chọn sự kiện để bổ sung/thay thế!', 'warning');
          return;
        }

        // Quét mảng trackingIncidents để lấy dữ liệu sự kiện cũ
        const incidents = [
          ...(window.appState?.emergencyActiveIncidents || []),
          ...(window.appState?.trackingIncidents ||
            window.appState?.incidents ||
            []),
        ];
        const inc = incidents.find((i) => String(i.id) === String(incidentId));

        if (inc) {
          eventName = inc.event_name || inc.event || 'Sự kiện';
          location =
            inc.location_text || inc.location || 'Chưa xác định địa điểm';

          // Khôi phục lại tọa độ của sự kiện cũ
          lat = inc.latitude || '';
          lng = inc.longitude || '';
          ward = inc.ma_xa || '';

          // Tự động phân tích xem đây là lệnh Thay Thế hay Tăng Cường
          const declinedCount = inc.declined_members
            ? inc.declined_members.split(';').filter(Boolean).length
            : 0;

          if (declinedCount > 0) {
            details = `[THAY THẾ NHÂN SỰ] Điều động bổ sung thay thế cho ${declinedCount} chuyên viên không thể tham gia sự kiện: ${eventName}`;
          } else {
            details = `[TĂNG CƯỜNG QUÂN SỐ] Điều động bổ sung thêm lực lượng cho sự kiện: ${eventName}`;
          }
        } else {
          showToast(
            'Không tìm thấy dữ liệu của sự kiện này. Vui lòng tải lại trang!',
            'error'
          );
          return;
        }
      }

      // B. Chuẩn bị danh sách Email cần check (chuẩn hóa lowercase để khớp DB)
      const _normEm = (e) =>
        String(e || '')
          .trim()
          .toLowerCase();
      const rawEmails = window.tempSelectedEmails || [];
      if (rawEmails.length === 0) {
        showToast('Chưa chọn thành viên nào!', 'warning');
        return;
      }
      const emailsToCheck = [...new Set(rawEmails.map(_normEm))].filter(
        Boolean
      );

      showLoadingSpinner();

      try {
        // C. TRUY VẤN PROFILES — gửi cả bản gốc LẪN bản lowercase để không
        // bị sót người do khác biệt hoa/thường giữa bảng chọn và Database
        const emailQueryList = [...new Set([...rawEmails, ...emailsToCheck])];
        const { data: freshProfiles, error: profErr } =
          await window.supabaseClient
            .from('profiles')
            .select('id, email, full_name, position, team')
            .in('email', emailQueryList);

        if (profErr) throw profErr;

        const dbUsers = freshProfiles || [];
        const userIdsToCheck = dbUsers.map((u) => u.id);

        // Cảnh báo NGAY nếu có email không tìm thấy hồ sơ (thay vì mất âm thầm)
        const foundSet = new Set(dbUsers.map((u) => _normEm(u.email)));
        const notFoundEmails = emailsToCheck.filter((e) => !foundSet.has(e));
        if (notFoundEmails.length > 0) {
          showToast(
            `⚠️ ${notFoundEmails.length} email không có hồ sơ trong hệ thống!`,
            'warning'
          );
          console.warn('⚠️ Email không có hồ sơ:', notFoundEmails);
        }

        // D1. KIỂM TRA LỊCH TRỰC HÔM NAY — dùng ngày LOCAL (giờ Việt Nam),
        // KHÔNG dùng toISOString() vì đó là ngày UTC (sai trước 7h sáng VN)
        const _t = new Date();
        const todayStr =
          _t.getFullYear() +
          '-' +
          String(_t.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(_t.getDate()).padStart(2, '0');

        let busyList = [];
        if (userIdsToCheck.length > 0) {
          const { data: busyData, error } = await window.supabaseClient
            .from('roster_assignments')
            .select(
              'user_id, assignment_status, roster_schedules(duty_date, team_name)'
            )
            .in('user_id', userIdsToCheck)
            .in('assignment_status', ['assigned', 'confirmed'])
            .gte('roster_schedules.duty_date', todayStr);

          if (error) throw error;

          busyList = (busyData || []).filter(
            (b) =>
              b.roster_schedules && b.roster_schedules.duty_date === todayStr
          );
        }

        // D2. KIỂM TRA ĐANG THAM GIA SỰ KIỆN KHÁC CHƯA ĐÓNG
        // (trước đây helper getBusyInfo có sẵn nhưng không được gọi ở đây)
        // Dựa vào danh sách thành viên của các sự kiện CHƯA ĐÓNG (được mời / đã
        // xác nhận, chưa từ chối) — nguồn quyết định ai đang tham gia. Trước đây
        // dựa vào deployment_history nên người vừa được thay vào (chưa xác nhận)
        // không bị cảnh báo, còn người đã bị thay ra vẫn bị coi là đang tham gia.
        const deployedMap = new Map(); // user_id -> tên sự kiện đang tham gia
        if (userIdsToCheck.length > 0) {
          const { data: openIncs } = await window.supabaseClient
            .from('incidents')
            .select('id, event_name, initial_selected_members, members, declined_members')
            .neq('status', 'closed');
          const inList = (email, list) =>
            String(list || '')
              .split(';')
              .some((x) => _normEm(x) === email);
          (openIncs || [])
            .filter((i) => String(i.id) !== String(incidentId)) // bỏ qua chính sự kiện đang bổ sung
            .forEach((i) => {
              const ev = i.event_name || `#${String(i.id).substring(0, 5)}`;
              dbUsers.forEach((u) => {
                const em = _normEm(u.email);
                if (deployedMap.has(u.id) || inList(em, i.declined_members)) return;
                if (inList(em, i.initial_selected_members) || inList(em, i.members))
                  deployedMap.set(u.id, ev);
              });
            });
        }

        // E. HIỂN THỊ LÊN GIAO DIỆN REVIEW (bản gọn gàng, không tràn)
        $('#reviewEventName').text(eventName); // ← THÊM DÒNG NÀY
        $('#reviewTime').text(time);
        $('#reviewLocation').text(location);
        $('#reviewDetails').html(
          (window.escapeHtml ? window.escapeHtml(details) : details).replace(
            /\n/g,
            '<br>'
          )
        );
        $('#reviewMemberCount').text(emailsToCheck.length);

        const listContainer = $('#reviewMemberList');
        listContainer.empty();
        let busyCount = 0;

        emailsToCheck.forEach((email) => {
          let displayName = email;
          let teamBadge = '';
          let positionBadge = '';
          let userUUID = null;

          const m = dbUsers.find((u) => _normEm(u.email) === email);
          if (m) {
            displayName =
              m.full_name && m.full_name.trim() !== ''
                ? m.full_name
                : m.username || email;
            userUUID = m.id;
            if (m.team && m.team !== 'No team') {
              teamBadge = `<span class="badge bg-light text-dark border team-badge">${window.escapeHtml(
                m.team
              )}</span>`;
            }
            if (m.position && m.position.trim() !== '') {
              positionBadge = `<span class="badge bg-info text-dark border position-badge">${window.escapeHtml(
                m.position
              )}</span>`;
            }
          }

          const onDutyRoster = busyList.find((b) => b.user_id === userUUID);
          const busyIncident = userUUID ? deployedMap.get(userUUID) : null;

          // Trạng thái: icon nhỏ bên phải hàng tên + dòng mô tả riêng bên dưới (nếu có)
          let statusIcon = `<i class="bx bx-check-circle text-success flex-shrink-0" style="font-size:1.3rem;" title="Sẵn sàng"></i>`;
          let statusLine = '';
          let rowClass = '';

          if (!m) {
            statusIcon = `<i class="bx bx-user-x text-secondary flex-shrink-0" style="font-size:1.3rem;" title="Không có hồ sơ"></i>`;
            statusLine = `<div class="review-status-line text-secondary"><i class='bx bx-user-x'></i> Không có hồ sơ trong hệ thống</div>`;
            rowClass = 'bg-light';
          } else if (busyIncident) {
            busyCount++;
            statusIcon = `<i class="bx bxs-error-alt text-danger flex-shrink-0" style="font-size:1.3rem;" title="Đang bận"></i>`;
            statusLine = `<div class="review-status-line text-danger"><i class='bx bxs-error-alt'></i> Đang tham gia: ${window.escapeHtml(
              busyIncident
            )}</div>`;
            rowClass = 'list-group-item-warning';
          } else if (onDutyRoster) {
            statusIcon = `<i class="bx bx-shield-quarter text-success flex-shrink-0" style="font-size:1.3rem;" title="Đang trực — Sẵn sàng"></i>`;
            statusLine = `<div class="review-status-line text-success"><i class='bx bx-shield-quarter'></i> Đang trực ${window.escapeHtml(
              onDutyRoster.roster_schedules.team_name || ''
            )} — Sẵn sàng</div>`;
          }

          let displayEmailHtml = '';
          if (displayName.toLowerCase() !== email.toLowerCase()) {
            displayEmailHtml = `<div class="review-member-email text-muted">${window.escapeHtml(
              email
            )}</div>`;
          }

          listContainer.append(`
    <li class="list-group-item review-member-item ${rowClass}">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="review-member-info">
          <span class="fw-bold">${window.escapeHtml(displayName)}</span>
          ${teamBadge} ${positionBadge}
        </div>
        ${statusIcon}
      </div>
      ${displayEmailHtml}
      ${statusLine}
    </li>
  `);
        });

        /* ===== HẾT KHỐI 5 — phần "// F. LƯU DỮ LIỆU..." giữ nguyên phía sau =====
   LƯU Ý: phần F dùng biến  members: emailsToCheck  -> giờ đây danh sách này
   đã được chuẩn hóa lowercase + khử trùng lặp, mọi bước sau tự động hưởng lợi.
============================================================================ */

        // F. LƯU DỮ LIỆU ĐỂ TIẾN HÀNH KÍCH HOẠT
        window.tempActivationData = {
          type: type,
          incidentId: incidentId,
          eventName: eventName, // ← MỚI: tên sự kiện ngắn gọn
          time: time,
          location: location,
          details: details, // giờ tập trung + chi tiết (vào thông báo)
          members: emailsToCheck,
          latitude: lat,
          longitude: lng,
          ma_xa: ward,
        };

        if (busyCount > 0) {
          showToast(
            `⚠️ Cảnh báo: Có ${busyCount} nhân sự đang tham gia sự kiện khác chưa kết thúc!`,
            'warning'
          );
        }

        // 1. Ra lệnh đóng Modal hiện tại
        $('#emergencyDetailsModal').modal('hide');

        // 2. Lắng nghe: KHI NÀO đóng hẳn xong (hiệu ứng chạy xong), THÌ mới mở Modal Review
        $('#emergencyDetailsModal').one('hidden.bs.modal', function () {
          $('#finalReviewModal').modal('show');
        });
      } catch (err) {
        showToast('Lỗi hệ thống: ' + err.message, 'error');
        console.error('Lỗi khi review:', err);
      } finally {
        hideLoadingSpinner();
      }
    });

  // ============================================================
  // 4. Sự kiện nút "Back" trong modal review (ĐÃ FIX CẢNH BÁO MÀU VÀNG)
  // ============================================================
  document
    .getElementById('backToDetailsBtn')
    .addEventListener('click', function () {
      // Xóa điểm nhìn (focus) khỏi nút bấm trước khi đóng Modal
      this.blur();

      // Đóng modal hiện tại và mở lại modal trước đó
      $('#finalReviewModal').modal('hide');
      $('#emergencyDetailsModal').modal('show');
    });

  // ============================================================
  // 5. Sự kiện nút "Confirm and Send" (ĐÃ ĐỒNG BỘ ĐỦ VỆ TINH + TRIGGER)
  // ============================================================
  /* ============================================================================
   KHỐI 9 — THAY TOÀN BỘ HANDLER "XÁC NHẬN & GỬI"
   XÓA từ dòng:   document.getElementById('confirmAndSendBtn')
   ĐẾN HẾT dòng:  });   đóng handler này
   (tức là đến ngay TRƯỚC comment  /** Xử lý sau khi kích hoạt khẩn cấp... )
   Dán trọn khối dưới đây vào thay:
============================================================================ */

  document
    .getElementById('confirmAndSendBtn')
    .addEventListener('click', async function () {
      // CHỐNG BẤM ĐÚP LỚP 1 (client) — lớp 2 là activation_key phía server
      if (window._activationInFlight) return;
      window._activationInFlight = true;
      this.disabled = true;
      this.blur();

      $('#finalReviewModal').modal('hide');
      if (typeof window.closeModal === 'function')
        window.closeModal('finalReviewModal');
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      const data = window.tempActivationData; // Dữ liệu từ Modal review
      const supabase = window.supabaseClient;

      // Chặn trường hợp dữ liệu review bị mất (F5 / lỗi giữa chừng)
      if (!data || !Array.isArray(data.members) || data.members.length === 0) {
        if (typeof showToast === 'function')
          showToast(
            'Dữ liệu kích hoạt không hợp lệ. Vui lòng thực hiện lại từ đầu!',
            'error'
          );
        window._activationInFlight = false;
        this.disabled = false;
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
        return;
      }

      try {
        // ============================================================
        // 1. CHUẨN BỊ THAM SỐ GỌI RPC
        // ============================================================
        const normEm = (e) =>
          String(e || '')
            .trim()
            .toLowerCase();
        const memberEmails = [...new Set(data.members.map(normEm))].filter(
          Boolean
        );

        const toNum = (v) => {
          if (v === '' || v === null || v === undefined) return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        };

        // Khóa chống trùng: sinh MỚI cho mỗi lượt bấm Xác nhận.
        // Nếu request bị gửi 2 lần (retry mạng...), server nhận ra key cũ
        // và trả về incident đã tạo thay vì tạo bản ghi trùng.
        const activationKey =
          window.crypto && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
                /[xy]/g,
                function (c) {
                  const r = (Math.random() * 16) | 0;
                  const v = c === 'x' ? r : (r & 0x3) | 0x8;
                  return v.toString(16);
                }
              );

        // ============================================================
        // 2. GỌI RPC — MỘT LỆNH DUY NHẤT, ATOMIC PHÍA SERVER
        // (kiểm tra quyền admin, tạo incident, deployment_history,
        //  gộp thành viên khi bổ sung... tất cả trong 1 transaction)
        // ============================================================
        const { data: rpcResult, error: rpcErr } = await supabase.rpc(
          'activate_emergency',
          {
            p_type: data.type,
            p_activation_key: activationKey,
            p_member_emails: memberEmails,
            p_incident_id: data.type === 'add' ? data.incidentId : null,
            p_event_name: data.eventName || data.details || null,
            p_location_text: data.location || null,
            p_ma_xa: data.ma_xa || null,
            p_latitude: toNum(data.latitude),
            p_longitude: toNum(data.longitude),
          }
        );

        if (rpcErr) {
          // Dịch mã lỗi nghiệp vụ từ server thành thông báo thân thiện
          const msg = String(rpcErr.message || '');
          if (msg.includes('FORBIDDEN'))
            throw new Error(
              'Tài khoản của bạn không có quyền kích hoạt khẩn cấp!'
            );
          if (msg.includes('AUTH_REQUIRED'))
            throw new Error(
              'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!'
            );
          if (msg.includes('NOT_FOUND'))
            throw new Error('Sự kiện không tồn tại hoặc đã được đóng!');
          if (msg.includes('BAD_REQUEST'))
            throw new Error(
              (msg.split('BAD_REQUEST:')[1] || 'Dữ liệu không hợp lệ!').trim()
            );
          throw rpcErr;
        }

        const activeIncidentId = rpcResult.incident_id;

        // Cảnh báo email không có hồ sơ (server đối soát và trả về)
        const missingEmails = rpcResult.missing_emails || [];
        if (missingEmails.length > 0) {
          console.warn(
            '⚠️ Email không có hồ sơ trong hệ thống:',
            missingEmails
          );
          if (typeof showToast === 'function')
            showToast(
              `⚠️ ${missingEmails.length} thành viên không có hồ sơ, không ghi được lịch sử điều động!`,
              'warning'
            );
        }
        // Cảnh báo nếu ward_admin lỡ chọn người khác xã (bị loại âm thầm)
        const filteredOut = rpcResult.filtered_out || [];
        if (filteredOut.length > 0) {
          showToast(
            `${filteredOut.length} người không thuộc xã bạn quản lý đã bị loại khỏi lệnh điều động.`,
            'warning'
          );
        }

        // Lệnh trùng (bấm đúp / retry): server KHÔNG tạo bản ghi mới
        // -> không gửi lại thông báo lần 2 cho thành viên
        if (rpcResult.duplicated) {
          if (typeof showToast === 'function')
            showToast(
              'Lệnh kích hoạt này đã được ghi nhận trước đó — không tạo trùng.',
              'info'
            );
          return; // finally vẫn chạy để mở khóa nút
        }

        // ============================================================
        // 3. THÔNG BÁO GIAO DIỆN VÀ PHÁT LỆNH RRT (giữ nguyên như cũ)
        // ============================================================
        if (typeof showToast === 'function')
          showToast('🚨 Kích hoạt thành công!', 'success');

        // Xóa toàn bộ lựa chọn để tránh lần kích hoạt sau mang theo danh sách cũ
        if (typeof window.clearAllSelectedMembers === 'function')
          window.clearAllSelectedMembers(true);

        if (
          memberEmails.length > 0 &&
          typeof window.createSystemNotification === 'function'
        ) {
          const notifMsg =
            data.details && data.details.trim()
              ? data.details
              : `Đã ${
                  data.type === 'new' ? 'kích hoạt sự kiện' : 'bổ sung nhân lực'
                }: ${data.eventName || ''}`;

          await window.createSystemNotification(
            memberEmails,
            notifMsg,
            'khan_cap',
            activeIncidentId,
            null
          );
        }

        // HCDC tạo sự kiện trên địa bàn một xã/phường → báo quản trị Trạm Y tế xã
        // đó (thông báo nội bộ, chỉ "Xác nhận đã đọc", không tính là điều động)
        if (data.type === 'new' && data.ma_xa) {
          await window.notifyWardAdminsOfIncident?.(
            activeIncidentId,
            data.ma_xa,
            data.eventName,
            memberEmails
          );
        }

        if (typeof showActivationSuccessModal === 'function') {
          const allUsers =
            window.appState.users || window.appState.teamData || [];
          const userNamesToNotify = memberEmails.map((email) => {
            const u = allUsers.find(
              (x) => String(x.email).toLowerCase() === email
            );
            return u ? u.full_name || u.email : email;
          });
          showActivationSuccessModal({
            incidentId: activeIncidentId,
            recipientCount: memberEmails.length,
            recipients: userNamesToNotify,
          });
        }
      } catch (err) {
        console.error('Lỗi quy trình kích hoạt:', err);
        if (typeof showToast === 'function')
          showToast('Lỗi hệ thống: ' + (err.message || ''), 'error');
        // Mở lại modal review để admin thao tác tiếp mà không mất dữ liệu
        $('#finalReviewModal').modal('show');
      } finally {
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
        // Mở khóa cho lượt kích hoạt tiếp theo
        window._activationInFlight = false;
        const btnConfirm = document.getElementById('confirmAndSendBtn');
        if (btnConfirm) btnConfirm.disabled = false;
      }
    });

  /* ===== HẾT KHỐI 9 =====
LƯU Ý QUAN TRỌNG SAU KHI DÁN:
- Khối này ĐÃ BAO GỒM nội dung của Khối 4, 6, 7 cũ. Nếu trước đó bạn đã
 dán các khối ấy thì không sao — toàn bộ vùng handler cũ (kể cả phần đã
 vá) đều bị thay bằng khối này.
- Hàm getUuidFromFetchedProfiles và biến membersString không còn được
 dùng trong handler này (server tự tra UUID). Nếu nơi khác trong file
 không tham chiếu chúng thì không cần giữ lại.
============================================================================ */
  // ============================================================================
  // RENDER SẴN TEXT MẪU vào ô "Chi tiết sự kiện" (#incidentDetails) khi mở modal.
  //   Mẫu: Thời gian tập trung / Địa điểm tập trung / Chi tiết sự kiện
  //   Giờ tập trung mặc định = giờ hiện tại (VN), admin sửa được (đi sau thì đổi).
  // GHÉP: gọi window.fillActivationDetailTemplate() trong handler nút Kích hoạt
  //       (#btn-activate-emergency) — xem EDIT 2 trong incident-name-separation.md.
  // ============================================================================
  window.fillActivationDetailTemplate = function (opts) {
    opts = opts || {};
    const ta = document.getElementById('incidentDetails');
    if (!ta) {
      console.warn('[activation] Không tìm thấy #incidentDetails');
      return;
    }
    // Chỉ điền nếu đang TRỐNG (không ghi đè nội dung admin đang gõ dở)
    if (ta.value && ta.value.trim() !== '') return;

    const now = new Date().toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour12: false,
    });
    const diaDiemMacDinh =
      opts.defaultLocation ||
      'Trung tâm Kiểm soát bệnh tật Thành phố Hồ Chí Minh - 366A Âu Dương Lân, phường Chánh Hưng, Thành phố Hồ Chí Minh';

    ta.value =
      `Thời gian tập trung: ${now}\n` +
      `Địa điểm tập trung: ${diaDiemMacDinh}\n` +
      `Chi tiết sự kiện: `;

    // Con trỏ vào cuối để admin gõ tiếp phần "Chi tiết sự kiện:"
    const pos = ta.value.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
  };
  /**
   * Xử lý sau khi kích hoạt khẩn cấp thành công
   * Hàm này tự động chạy KHI NGƯỜI DÙNG BẤM ĐÓNG MODAL CHÚC MỪNG.
   */
  window.onEmergencyActivatedSuccess = async function () {
    // Xóa form cũ để lần sau mở lên sạch sẽ
    if (typeof window.clearAllSelectedMembers === 'function') {
      window.clearAllSelectedMembers(true); // xóa cả state Map + DOM + panel
    } else {
      $('.member-checkbox').prop('checked', false);
      $('#selectAllMembers').prop('checked', false);
      if (typeof updateSelectedCount === 'function') updateSelectedCount();
    }
    $('#incidentLocation').val('');
    $('#incidentDetails').val('');

    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {
      // Làm mới dữ liệu hệ thống ngầm bên dưới
      if (typeof window.reloadData === 'function') {
        await window.reloadData({ showSpinner: false, refreshUI: false });
      }

      // Cập nhật lại giao diện Dashboard
      if (typeof window.enterDashboard === 'function') {
        await window.enterDashboard();
      }
    } catch (err) {
      console.error('Lỗi khi làm mới bảng điều khiển:', err);
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }

    // Tự động điều hướng về trang chủ Dashboard
    if (typeof window.simulateSidebarClick === 'function') {
      window.simulateSidebarClick('page-dashboard');
    }
  };
  /**
   * Displays a detailed modal with confirmation information.
   * @param {object} data The data object containing incident details.
   */
  /**
   * 1. Displays a detailed modal with confirmation information.
   * Đã nâng cấp thành window. để gọi được từ mọi nơi.
   */
  window.showActivationSuccessModal = function (data) {
    const modalTitle = document.getElementById('activationSuccessModalLabel');
    const incidentIdSpan = document.getElementById('incidentId');
    const recipientCountSpan = document.getElementById('recipientCount');
    const recipientListUl = document.getElementById('recipientList');

    if (modalTitle) modalTitle.textContent = 'KÍCH HOẠT THÀNH CÔNG!';
    if (incidentIdSpan) incidentIdSpan.textContent = data.incidentId || 'N/A';
    if (recipientCountSpan)
      recipientCountSpan.textContent = data.recipientCount || 0;

    if (recipientListUl) {
      recipientListUl.innerHTML = '';
      if (data.recipients && data.recipients.length > 0) {
        data.recipients.forEach((name) => {
          const li = document.createElement('li');
          li.className =
            'list-group-item fw-bold text-danger border-0 border-bottom'; // Format cho ngầu
          li.innerHTML = `<i class='bx bx-radio-circle-marked'></i> ${window.escapeHtml(
            name
          )}`;
          recipientListUl.appendChild(li);
        });
      } else {
        recipientListUl.innerHTML =
          '<li class="list-group-item text-muted border-0">Không tìm thấy thông tin người nhận.</li>';
      }
    }

    const modalEl = $('#activationSuccessModal');

    // Gỡ bỏ sự kiện cũ để tránh lặp lệnh
    modalEl.off('hidden.bs.modal');

    // GÀI CÒ: Khi người dùng ĐÓNG modal chúc mừng, lập tức chạy quy trình Dọn dẹp & Chuyển trang
    modalEl.on('hidden.bs.modal', function () {
      if (typeof window.onEmergencyActivatedSuccess === 'function') {
        window.onEmergencyActivatedSuccess();
      }
    });

    // Hiện modal
    modalEl.modal('show');
  };

  /**
   * 3. Shows a custom confirmation modal.
   * Giữ nguyên cấu trúc của bạn, chỉ chuyển thành window. để an toàn.
   */
  window.showCustomConfirmModal = function (message, onConfirmCallback) {
    const modal = $('#customConfirmModal');
    const confirmMessage = $('#confirmMessage');
    const btnOk = $('#btnOkConfirm');
    const btnCancel = $('#btnCancelConfirm');

    confirmMessage.text(message);

    btnOk.off('click');
    btnCancel.off('click');

    btnOk.on('click', function () {
      modal.modal('hide');
      if (onConfirmCallback && typeof onConfirmCallback === 'function') {
        onConfirmCallback();
      }
    });

    btnCancel.on('click', function () {
      modal.modal('hide');
    });

    modal.modal('show');
  };
  // Callback function sau khi kích hoạt thành công


  //CALENDAR

  // ============================================================
  // LOGIC LẬP BÁO CÁO (SITREP) - XUẤT PDF TRÌNH DUYỆT
  // ============================================================

  $(document).on('click', '#btn-export-pdf', async function () {
    if (!window.currentDossierId) {
      showToast('Không tìm thấy ID ổ dịch.', 'error');
      return;
    }

    const $btn = $(this);
    const originalText = $btn.html();
    $btn
      .prop('disabled', true)
      .html('<i class="bx bx-loader-alt bx-spin"></i> Đang chuẩn bị...');

    showToast('Đang chuẩn bị giao diện in báo cáo SITREP...', 'info');

    try {
      // Tùy chọn: Lấy dữ liệu chi tiết của Dossier nếu cần truyền vào trang in riêng
      // const { data, error } = await supabaseClient.from('incidents').select('*').eq('id', window.currentDossierId).single();
      // if (error) throw error;

      // Mở hộp thoại in của trình duyệt (Ctrl+P)
      // Trình duyệt sẽ tự lo việc chuyển CSS thành dạng in (bạn có thể thiết lập @media print trong file CSS)
      setTimeout(() => {
        window.print();
      }, 500);
    } catch (err) {
      console.error('Lỗi in SITREP:', err);
      showToast('Lỗi kết nối: ' + err.message, 'error');
    } finally {
      setTimeout(() => {
        $btn.prop('disabled', false).html(originalText);
      }, 1000);
    }
  });
});
