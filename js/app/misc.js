// ============================================================
// TIỆN ÍCH KHÁC — Dropdown phường, lượt truy cập, AAR, xếp lịch tự động, bản đồ mini, duyệt báo cáo, phân quyền giao diện
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================


// ==========================================
// HÀM KHỞI TẠO VÀ ĐỔ DỮ LIỆU DROPDOWN CHUNG (ĐÃ SỬA LỖI)
// ==========================================
function populateDropdown(
  elementId,
  dataArray,
  lastValueVarName,
  needsUniqueAndSort = false
) {
  const selectEl = $(`#${elementId}`);
  if (!selectEl.length) return;

  selectEl.empty().append('<option value="">Chọn</option>');

  if (!Array.isArray(dataArray) || dataArray.length === 0) return;

  let finalData = dataArray.filter(
    (v) => v !== null && v !== undefined && v.toString().trim() !== ''
  );

  if (needsUniqueAndSort) {
    // Lọc trùng lặp và sắp xếp theo bảng chữ cái tiếng Việt
    finalData = [...new Set(finalData)].sort((a, b) =>
      a.toString().localeCompare(b.toString(), 'vi', { sensitivity: 'base' })
    );
  }

  finalData.forEach((item) => {
    selectEl.append(new Option(item, item));
  });

  // Khôi phục giá trị cũ (nếu đang ở chế độ Edit Form)
  if (window[lastValueVarName]) {
    selectEl.val(window[lastValueVarName]).trigger('change.select2');
  }
}

// ==========================================
// HÀM TẠO DANH SÁCH DROPDOWN TỪ SUPABASE
// ==========================================
window.createWardDropdown = async function () {
  console.log('🔄 Bắt đầu tạo danh sách Dropdown từ Supabase...');

  try {
    // 1. KÉO TOÀN BỘ BẢNG DANH MỤC
    const { data: helpersData, error } = await supabaseClient
      .from('helpers')
      .select('*');

    if (error) {
      console.warn(
        'Chưa tải được bảng helpers từ Supabase, dùng dữ liệu tạm hoặc bỏ qua.',
        error.message
      );
      return;
    }

    // 2. PHÂN LOẠI DỮ LIỆU VÀO CÁC DROPDOWN (Sửa lại dựa trên ảnh bảng helpers)
    // Dựa vào ảnh bạn cung cấp, tên cột là 'name'
    const wards = helpersData
      .filter((h) => h.category === 'ward')
      .map((h) => h.name);
    const academicList = helpersData
      .filter((h) => h.category === 'academic')
      .map((h) => h.name);
    const academicLevels = helpersData
      .filter((h) => h.category === 'academicLevel')
      .map((h) => h.name);

    // --- XỬ LÝ RIÊNG CHO PHẦN KHOA/PHÒNG (departmentAP) ---
    const departmentsData = helpersData.filter(
      (h) => h.category === 'departmentAP'
    );

    // Tạo danh sách Đơn vị công tác (parent_name)
    const units = [
      ...new Set(departmentsData.map((h) => h.parent_name).filter(Boolean)),
    ].sort();

    // Tạo map Đơn vị -> Khoa/Phòng
    const departmentMap = {};
    units.forEach((unit) => {
      departmentMap[unit] = departmentsData
        .filter((h) => h.parent_name === unit)
        .map((h) => h.name)
        .sort();
    });
    window.departmentMap = departmentMap;
    // Tạo map Đơn vị -> Chức vụ (employeeStatus giờ phụ thuộc đơn vị như Khoa/phòng)
    const employeeStatusData = helpersData.filter(
      (h) => h.category === 'employeeStatus'
    );
    const employeeStatusMap = {};
    units.forEach((unit) => {
      employeeStatusMap[unit] = employeeStatusData
        .filter((h) => h.parent_name === unit)
        .map((h) => h.name)
        .sort();
    });
    window.employeeStatusMap = employeeStatusMap;

    // Điền dữ liệu vào các Dropdown tĩnh
    populateDropdown('ward', wards, 'lastwardValue', true);

    // Đổ danh sách xã vào dropdown workplace_ward (cùng nguồn với ward)
    const workplaceWardSelect = $('#workplace_ward');
    workplaceWardSelect.empty().append('<option value="">Chọn</option>');
    wards.forEach((w) => workplaceWardSelect.append(new Option(w, w)));

    populateDropdown('academic', academicList, 'lastacademicValue', true);
    populateDropdown(
      'academicLevel',
      academicLevels,
      'lastacademicLevelValue',
      true
    );

    // 3. XỬ LÝ DROPDOWN PHỤ THUỘC (Đơn vị -> Khoa/Phòng)
    const faxSelect = $('#fax'); // Giả sử #fax là dropdown Đơn vị công tác
    const departmentSelect = $('#department'); // Giả sử #department là dropdown Khoa/Phòng

    faxSelect.empty().append('<option value="">Chọn</option>');
    departmentSelect.empty().append('<option value="">Chọn</option>');

    // Đổ dữ liệu vào dropdown Đơn vị
    units.forEach((donVi) => {
      faxSelect.append(new Option(donVi, donVi));
    });

    // Sự kiện khi Đơn vị thay đổi
    faxSelect.off('change').on('change', function () {
      const selectedDonVi = $(this).val();

      departmentSelect.empty().append('<option value="">Chọn</option>');
      if (selectedDonVi && departmentMap[selectedDonVi]) {
        departmentMap[selectedDonVi].forEach((khoaPhong) => {
          departmentSelect.append(new Option(khoaPhong, khoaPhong));
        });
      }
      departmentSelect.trigger('change.select2');
      // Đổ Chức vụ theo đơn vị (MỚI)
      const employeeStatusSelect = $('#employeeStatus');
      employeeStatusSelect.empty().append('<option value="">Chọn</option>');
      if (selectedDonVi && employeeStatusMap[selectedDonVi]) {
        employeeStatusMap[selectedDonVi].forEach((cv) => {
          employeeStatusSelect.append(new Option(cv, cv));
        });
      }
      employeeStatusSelect.trigger('change.select2');
      // --- Ẩn/hiện Phường/Xã nơi công tác theo tuyến cơ sở ---
      // 2 chuỗi này KHỚP CHÍNH XÁC với hàm is_grassroots_unit ở DB (Bước 1)
      const grassrootsUnits = [
        'Trạm Y tế Phường/Xã/ Đặc khu',
        'UBND Phường/Xã/ Đặc khu',
      ];
      const row = document.getElementById('workplace-ward-row');
      const wpSelect = document.getElementById('workplace_ward');
      if (grassrootsUnits.includes(selectedDonVi)) {
        if (row) row.style.display = '';
        if (wpSelect) wpSelect.setAttribute('required', 'required');
      } else {
        if (row) row.style.display = 'none';
        if (wpSelect) {
          wpSelect.removeAttribute('required');
          $('#workplace_ward').val('').trigger('change.select2'); // clear khi không phải tuyến cơ sở
        }
      }
    });

    // 4. KHỞI TẠO SELECT2 CHO TẤT CẢ DROPDOWN
    if (typeof jQuery !== 'undefined' && jQuery.fn.select2) {
      $(
        '#ward, #employeeStatus, #academic, #academicLevel, #fax, #department, #workplace_ward'
      ).select2({
        theme: 'bootstrap-5',
        dropdownParent: $('#modal-rrtForm .modal-content'),
        width: '100%',
      });

      // (Giữ nguyên các khởi tạo select2 khác của bạn)
      $('#filter-team-select').select2({
        /* ... */
      });
      $('#departmentAP').select2({
        /* ... */
      });
    }

    // 5. KHÔI PHỤC GIÁ TRỊ CŨ (Khi mở form sửa)
    if (window.lastfaxValue) {
      faxSelect.val(window.lastfaxValue).trigger('change');
    }
    // Khôi phục workplace_ward khi mở form sửa (nếu có)
    if (window.lastworkplaceWardValue) {
      setTimeout(() => {
        // đảm bảo fax đã trigger change (hiện row) trước khi set giá trị
        $('#workplace_ward')
          .val(window.lastworkplaceWardValue)
          .trigger('change.select2');
      }, 150);
    }
    if (window.lastdepartmentValue) {
      // setTimeout để đảm bảo dropdown Khoa/Phòng đã được đổ dữ liệu sau khi Đơn vị thay đổi
      setTimeout(() => {
        departmentSelect
          .val(window.lastdepartmentValue)
          .trigger('change.select2');
      }, 100);
    }
    if (window.lastemployeeStatusValue) {
      setTimeout(() => {
        $('#employeeStatus')
          .val(window.lastemployeeStatusValue)
          .trigger('change.select2');
      }, 120);
    }

    console.log('✅ Khởi tạo Dropdown thành công!');
  } catch (err) {
    console.error('❌ Lỗi khi khởi tạo Dropdown:', err);
  }
};

// Toggle skill level dropdown based on radio selection
// Xử lý bật/tắt ô Mức độ và thuộc tính required khi người dùng click chọn Kỹ năng
document.addEventListener('change', function (e) {
  if (e.target && e.target.classList.contains('skill-radio')) {
    // Lấy cái tên gốc, ví dụ 'skill_ruiro'
    const baseName = e.target.name;
    const levelSelect = document.getElementById(`${baseName}_level`);

    if (levelSelect) {
      // Kiểm tra xem user đang chọn Có hay Không
      if (e.target.value === 'Yes' || e.target.value === 'Có') {
        levelSelect.style.display = 'block';
        levelSelect.setAttribute('required', 'required');
      } else {
        levelSelect.style.display = 'none';
        levelSelect.removeAttribute('required'); // Gỡ required đi để submit không lỗi
        levelSelect.value = '';
      }
    }
  }
});
// Gọi hàm ngay khi trang được tải
document.addEventListener('DOMContentLoaded', () => {
  createWardDropdown();
  getUserLocation((loc) => {
    console.log('Đã chuẩn bị sẵn vị trí:', loc);
  });
});
// ========================================================================
// 2. KHỞI CHẠY TỨC THÌ (BỌC THÉP CHỐNG FOUC)
// ========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Phòng hờ nếu bạn quên thêm CSS ở Bước 1, JS sẽ ép ẩn ngay lập tức
  document
    .querySelectorAll('#sidebar .side-menu li[data-roles]')
    .forEach((el) => (el.style.display = 'none'));

  // Khôi phục Session từ LocalStorage để xử lý phân quyền siêu tốc (0 ms)
  const sessionStr = localStorage.getItem('userSession');
  if (sessionStr) {
    try {
      const cachedSession = JSON.parse(sessionStr);
      window.userSession = cachedSession;

      // Phân quyền ngay tắp lự trước cả khi Supabase kịp tải xong
      if (cachedSession.role && typeof applyRolePermissions === 'function') {
        applyRolePermissions(cachedSession.role);
      }
    } catch (e) {}
  }
});
// ============================================================
// QUẢN LÝ AAR (After Action Review)
// ============================================================
// ============================================================================
// openAarModal — SỬA đọc dữ liệu cũ từ incident.aar_data (jsonb), KHÔNG cột riêng
//   Bug cũ: điền form từ incident.aar_summary/aar_issues/aar_lessons (không tồn tại
//   hoặc sai key) → mở lại AAR bị trống. Nguồn đúng: incident.aar_data.{key}.
// ============================================================================
window.openAarModal = async function (incident, isViewOnly) {
  // 1. Reset form
  const form = document.getElementById('aarForm');
  if (form) form.reset();

  // 2. Thông tin cơ bản
  $('#aar-incident-id').val(incident.id);
  $('#aar-incident-id-display').text(incident.id);
  $('#aar-location-display').text(incident.location_text || 'N/A');
  $('#aar-event-display').text(incident.event_name || 'N/A');

  // 3. Điền dữ liệu cũ TỪ aar_data (jsonb) — đúng key theo name= của form
  const aar = incident.aar_data || {};
  $('#aar-summary').val(aar.aar_summary || '');
  $('#aar-issues').val(aar.aar_issues || '');
  $('#aar-lessons-learned').val(aar.aar_lessons_learned || '');

  // 4. Chỉ xem khi gọi xem kết quả hoặc không có quyền quản lý sự kiện
  // (HCDC, tuyến cơ sở của phường/xã sự kiện — khớp RLS incidents_update)
  const isView =
    isViewOnly || !(window.canManageIncident ? window.canManageIncident(incident) : false);
  $('#aar-summary').prop('disabled', isView);
  $('#aar-issues').prop('disabled', isView);
  $('#aar-lessons-learned').prop('disabled', isView);
  $('#aar-status').prop('disabled', isView);

  // Trạng thái dropdown: nếu đã có lựa chọn cũ thì khôi phục, không thì mặc định theo status
  const savedStatus =
    aar.problem_status || (incident.status === 'closed' ? 'closed' : 'closed');
  $('#aar-status').val(savedStatus);

  if (isView) $('#btn-submit-aar').hide();
  else $('#btn-submit-aar').show();

  // 5. Tải nhật ký
  window.currentIncidentLogs = [];
  try {
    const { data: logs, error } = await supabaseClient
      .from('incident_logs')
      .select('*')
      .eq('incident_id', incident.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    window.currentIncidentLogs = logs || [];
  } catch (err) {
    console.error('Lỗi tải log:', err);
    showToast('Lỗi tải nhật ký: ' + err.message, 'error');
  }

  $('#aarModal').modal('show');
};

// ============================================================
// 1. CÁC HÀM XỬ LÝ SỰ KIỆN (EVENT DELEGATION - KHÔNG DÙNG ONCLICK)
// ============================================================
$(document).ready(function () {
  // Mở Modal gợi ý
  $(document).on('click', '#btn-auto-trigger', function () {
    window.openAutoScheduleModal();
  });

  // Áp dụng gợi ý (Nút trong Modal)
  $(document).on('click', '.sug-apply-btn', function () {
    const date = $(this).data('date');
    const team = $(this).data('team');
    window.applySuggestion(date, team);
  });
});
// Hàm logic của bạn (Giữ nguyên hoặc đặt ở bất kỳ đâu)
window.openAutoScheduleModal = async function () {
  console.log('Đang mở Modal...');
  const modal = document.getElementById('modal-auto');

  if (modal) {
    modal.style.display = 'flex';

    // Tự động chọn ngày mai
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const dateInput = document.getElementById('auto-date-input');
    if (dateInput) {
      dateInput.value = dateStr;
      if (typeof window.suggestRoster === 'function') {
        window.suggestRoster(dateStr);
      }
    }
  } else {
    showToast('Lỗi: Không tìm thấy giao diện Modal lịch tự động', 'error');
    console.error("Lỗi: Không tìm thấy <div id='modal-auto'>");
  }
};
window.suggestRoster = async function (dateStr) {
  const container = document.getElementById('auto-suggestions-container');
  if (!container) return;

  // Hiện loading
  container.innerHTML =
    '<p class="text-center text-muted mt-3"><span class="spinner-border spinner-border-sm"></span> Đang phân tích dữ liệu đội...</p>';

  try {
    // 1. Lấy dữ liệu từ 2 bảng Supabase
    const [rosterRes, incidentRes] = await Promise.all([
      window.supabaseClient.from('roster_schedules').select('team_name'),
      window.supabaseClient
        .from('incident_activities')
        .select('task_group')
        .eq('status', 'active'),
    ]);

    if (rosterRes.error) throw rosterRes.error;

    const history = rosterRes.data || [];
    const busyTeams = (incidentRes.data || []).map((i) => i.task_group);

    // 2. LẤY DANH SÁCH ĐỘI KHẢ DỤNG THEO PHÂN QUYỀN (VÉT CẠN TỪ NHIỀU NGUỒN)
    let availableTeams = [];
    const role = (window.userSession?.role || '').toLowerCase();

    if (role === 'ward_admin') {
      const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();

      // NGUỒN 1: Từ danh sách nhân sự (Những đội đã có người)
      const allUsers = window.appState?.users || [];
      const userTeams = allUsers
        .filter((u) => String(u.workplace_ma_xa || '').trim() === myMaXa)
        .map((u) => String(u.team || '').trim())
        .filter(Boolean);

      // NGUỒN 2: Từ lịch sử đã trực (Những đội từng được lên lịch)
      const historyTeams = history
        .map((h) => String(h.team_name || '').trim())
        .filter(Boolean);

      // NGUỒN 3: Từ ô dropdown "Chọn Đội" trên giao diện (Nếu thẻ <select> đã có sẵn danh sách)
      const uiTeams = [];
      const teamSelect = document.getElementById('new-shift-team');
      if (teamSelect && teamSelect.options) {
        Array.from(teamSelect.options).forEach((opt) => {
          if (opt.value) uiTeams.push(opt.value.trim());
        });
      }

      // Gộp tất cả các nguồn lại và xóa trùng lặp bằng Set
      const combinedTeams = [
        ...new Set([...userTeams, ...historyTeams, ...uiTeams]),
      ];

      // Lọc lại lần cuối qua hàm isMyWardTeam của bạn
      availableTeams = combinedTeams.filter((t) => window.isMyWardTeam(t));

      // DỰ PHÒNG: Nếu quét cả 3 nguồn vẫn không có dữ liệu, tự động sinh Đội 1 và Đội 2
      if (availableTeams.length === 0) {
        const myWard = String(window.userSession?.workplace_ward || myMaXa);
        availableTeams = [`Team ${myWard} 01`, `Team ${myWard} 02`];
      }
    } else {
      // Admin HCDC: thấy MỌI đội (Team 1-10 + Team Phường...) — quét distinct từ nhiều nguồn
      const adminTeams = new Set();

      // Luôn có sẵn Team 1-10 (đội thành phố, kể cả chưa lên lịch bao giờ)
      for (let i = 1; i <= 10; i++) adminTeams.add(`Team ${i}`);

      // NGUỒN 1: đội thực tế có người (quét profiles)
      try {
        const { data: prof } = await window.supabaseClient
          .from('profiles')
          .select('team');
        (prof || []).forEach((p) => {
          const t = String(p.team || '').trim();
          if (t && t !== 'No team') adminTeams.add(t);
        });
      } catch (e) {
        console.warn('Không quét được đội từ profiles:', e);
      }

      // NGUỒN 2: đội từng được lên lịch (history đã lấy ở trên)
      history.forEach((h) => {
        const t = String(h.team_name || '').trim();
        if (t) adminTeams.add(t);
      });

      availableTeams = [...adminTeams].sort();
    }

    // 3. Tính toán số lần trực (công bằng luân phiên)
    const dutyCounts = {};
    availableTeams.forEach((tName) => {
      dutyCounts[tName] = history.filter((h) => h.team_name === tName).length;
    });

    // 4. Phân tích gợi ý
    let suggestions = [];
    availableTeams.forEach((teamName) => {
      let status = 'ok';
      let reason = 'Đội sẵn sàng (Đã trực: ' + dutyCounts[teamName] + ' ca)';

      // Loại trừ đội đang bận
      if (busyTeams.includes(teamName)) {
        status = 'bad';
        reason = 'Đang xử lý sự cố khẩn cấp';
      }

      suggestions.push({
        team: teamName,
        status: status,
        reason: reason,
        count: dutyCounts[teamName],
      });
    });

    // 5. Sắp xếp: Đội bận cho xuống cuối, đội trực ít cho lên đầu
    suggestions.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'bad' ? 1 : -1;
      return a.count - b.count;
    });

    // 6. Render ra Modal
    container.innerHTML = '';
    suggestions.forEach((s) => {
      const isBad = s.status === 'bad';
      const itemClass = isBad ? 'sug-bad' : 'sug-good';
      const iconHTML = isBad
        ? '<i class="bx bxs-error-circle text-danger"></i>'
        : '<i class="bx bxs-star text-warning"></i>';
      const btnText = isBad ? 'Không khả dụng' : 'Xếp lịch đội này';
      const btnAttr = isBad ? 'disabled' : '';

      const html = `
            <div class="suggestion-item ${itemClass}">
                <div class="sug-header">
                    <span class="sug-team fw-bold">${s.team}</span>
                    ${iconHTML}
                </div>
                <div class="text-center p-2">
                    <small class="sug-reason text-muted">${s.reason}</small>
                </div>
                <button class="btn btn-sm ${
                  isBad ? 'btn-outline-secondary' : 'btn-primary'
                } w-100 sug-apply-btn" 
                        ${btnAttr} 
                        data-date="${dateStr}" 
                        data-team="${s.team}">
                    ${btnText}
                </button>
            </div>
        `;
      container.insertAdjacentHTML('beforeend', html);
    });
  } catch (err) {
    console.error('Lỗi Auto Schedule:', err);
    container.innerHTML = `<p class="text-danger text-center">Lỗi tải dữ liệu: ${err.message}</p>`;
  }
};
// ĐẶT Ở ĐẦU FILE SCRIPT.JS (Nơi trình duyệt đọc đầu tiên)
window.applySuggestion = function (date, team) {
  // 1. TẮT FOCUS CỦA NÚT VỪA BẤM ĐỂ TRÁNH CẢNH BÁO MÀU VÀNG
  if (document.activeElement) {
    document.activeElement.blur();
  }

  console.log('Hàm applySuggestion đã được gọi với:', date, team); // Dòng này để debug

  // Đóng modal gợi ý
  if (typeof window.closeModal === 'function') {
    window.closeModal('modal-auto');
  }

  // TẠO NGÀY HIỂN THỊ CHUẨN VIỆT NAM
  let displayDate = date;
  if (displayDate && displayDate.includes('-')) {
    const parts = displayDate.split('T')[0].split('-');
    if (parts.length === 3) {
      displayDate = `${parts[2]}-${parts[1]}-${parts[0]}`; // Lật thành DD/MM/YYYY
    }
  }

  // Điền ngày + đội vào form "Lịch trực" rồi để người dùng chọn thành viên,
  // địa điểm trực trước khi bấm XÁC NHẬN (không tạo lịch ngay cho cả đội).
  const dateInput = document.getElementById('new-shift-date');
  const teamInput = document.getElementById('new-shift-team');
  const noteInput = document.getElementById('new-shift-note');

  if (dateInput) dateInput.value = String(date || '').split('T')[0];
  if (teamInput) teamInput.value = team;
  if (noteInput && !noteInput.value.trim())
    noteInput.value = 'Được xếp tự động bởi AP Assistant';
  if (typeof window.loadShiftTeamMembers === 'function')
    window.loadShiftTeamMembers(team);

  document
    .querySelector('#new-shift-team')
    ?.closest('.control-box')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast(
    `Đã điền ${team} ngày ${displayDate}. Chọn thành viên, địa điểm trực rồi bấm XÁC NHẬN.`,
    'info'
  );
};
// ==========================================
// BÁO QUẢN TRỊ TRẠM Y TẾ KHI HCDC TẠO SỰ KIỆN TRÊN ĐỊA BÀN
// Chỉ HCDC (admin) gọi: sự kiện có mã xã → quản trị tuyến cơ sở của xã đó
// nhận thông báo nội bộ để phối hợp (không thêm họ vào danh sách điều động).
// Lỗi ở bước này chỉ cảnh báo, không chặn kích hoạt.
// ==========================================
window.notifyWardAdminsOfIncident = async function (
  incidentId,
  maXa,
  eventName,
  excludeEmails = []
) {
  try {
    if (String(window.userSession?.role || '').toLowerCase() !== 'admin') return;
    if (!incidentId || !maXa) return;
    const { data: admins, error } = await window.supabaseClient
      .from('profiles')
      .select('email')
      .eq('role', 'ward_admin')
      .eq('workplace_ma_xa', String(maXa));
    if (error) throw error;
    const skip = new Set(excludeEmails.map((e) => String(e).toLowerCase().trim()));
    const emails = (admins || [])
      .map((a) => String(a.email || '').toLowerCase().trim())
      .filter((e) => e && !skip.has(e));
    if (!emails.length) return;
    await window.createSystemNotification(
      emails,
      `HCDC vừa kích hoạt sự kiện "${eventName || ''}" trên địa bàn xã/phường của bạn. ` +
        'Vui lòng mở "Theo dõi sự kiện" để phối hợp: bổ sung nhân sự của Trạm, cập nhật IAP, theo dõi nhật ký.',
      'thong_tin',
      incidentId,
      null
    );
  } catch (e) {
    console.warn('[notify] Không báo được quản trị Trạm Y tế:', e.message || e);
  }
};
// ==========================================
// HÀM TẠO THÔNG BÁO NỘI BỘ (CHUẨN HÓA THEO DB)
// ==========================================
// Thêm tham số type (mặc định là 'thong_tin'), incidentId, và scheduleId vào khai báo hàm
window.createSystemNotification = async function (
  emails,
  message,
  type = 'thong_tin',
  incidentId = null,
  scheduleId = null
) {
  if (!emails || emails.length === 0) return;

  // Tạo mảng dữ liệu để insert hàng loạt
  const notifData = emails.map((email) => ({
    user_email: email,
    message: message,
    notification_type: type, // Lấy ĐỘNG từ tham số truyền vào, không đóng cứng nữa
    incident_id: incidentId, // Nhận ID từ nơi gọi hàm
    schedule_id: scheduleId, // Nhận ID từ nơi gọi hàm
  }));

  try {
    const { error } = await supabaseClient
      .from('notifications')
      .insert(notifData);

    if (error) throw error;
    console.log(`✅ Đã bắn ${emails.length} thông báo loại [${type}].`);
  } catch (err) {
    console.error('❌ Lỗi tạo thông báo:', err);
  }
};
let miniMap = null;
let miniMarker = null;

window.initMiniMap = async function () {
  const defaultLat = 10.762622;
  const defaultLng = 106.660172;

  if (miniMap !== null) {
    miniMap.remove();
  }

  miniMap = L.map('miniMap').setView([defaultLat, defaultLng], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
  }).addTo(miniMap);

  // autoPan: kéo ghim tới mép thì bản đồ tự dịch theo, ghim không bị kéo mất
  // ra ngoài khung bản đồ
  miniMarker = L.marker([defaultLat, defaultLng], {
    draggable: true,
    autoPan: true,
  }).addTo(miniMap);

  // Điền mặc định tọa độ tâm ban đầu
  document.getElementById('incidentLat').value = defaultLat;
  document.getElementById('incidentLng').value = defaultLng;

  // 1. Kích hoạt tải ngầm file hcm_map.json từ bucket lên bộ nhớ trình duyệt ngay khi mở bản đồ
  const geojsonData = await window.loadGeoJSON();

  // Hiển thị ranh giới mờ lên mini-map cho sinh động (Tùy chọn)
  if (geojsonData) {
    L.geoJSON(geojsonData, {
      style: {
        color: '#198754',
        weight: 1,
        fillOpacity: 0.05,
        pointerEvents: 'none',
      },
    }).addTo(miniMap);
  }

  // 2. Xử lý sự kiện kéo ghim
  miniMarker.on('dragend', function (e) {
    // Lỡ thả ghim ra ngoài khung nhìn: đưa bản đồ về chỗ ghim
    if (!miniMap.getBounds().contains(miniMarker.getLatLng())) {
      miniMap.panTo(miniMarker.getLatLng());
    }
    const position = miniMarker.getLatLng();

    // Điền tọa độ thực
    document.getElementById('incidentLat').value = position.lat;
    document.getElementById('incidentLng').value = position.lng;

    // Tiến hành quét không gian cục bộ (0 VNĐ) để tìm mã xã
    const locationResult = window.findWardByCoordinates(
      position.lat,
      position.lng
    );

    if (locationResult) {
      // 1. Điền mã số hành chính chuẩn xác tuyệt đối vào ô input ẩn để insert Supabase
      document.getElementById('incidentWard').value = locationResult.maXa;

      // 2. Cập nhật nhãn text địa điểm trực quan ra màn hình cho admin xem
      document.getElementById(
        'incidentLocation'
      ).value = `${locationResult.tenXa}`;
      console.log(
        `🎯 Đã định vị ổ dịch tại Mã Xã: ${locationResult.maXa} - ${locationResult.tenXa}`
      );
    } else {
      // Phòng hờ kéo ghim ra ngoài biển hoặc tỉnh lân cận
      document.getElementById('incidentLocation').value =
        'Vị trí nằm ngoài ranh giới Thành phố!';
      document.getElementById('incidentWard').value = '';
    }
  });
  // ============================================================
  // BỔ SUNG: XỬ LÝ LƯỜNG NGƯỢC (GÕ ĐỊA CHỈ -> CỤC MARKER NHẢY THEO)
  // ============================================================
  const locationInput = document.getElementById('incidentLocation');

  // Dùng biến timeout để chống spam API (người dùng gõ liên tục thì đợi gõ xong mới tìm)
  let typingTimer;

  locationInput.addEventListener('input', function () {
    clearTimeout(typingTimer);

    // Đợi người dùng ngừng gõ 800ms rồi mới bắt đầu tìm kiếm
    typingTimer = setTimeout(async function () {
      const query = locationInput.value.trim();
      if (query.length < 5) return; // Bỏ qua nếu gõ quá ngắn

      try {
        // Gọi API Nominatim miễn phí để tìm tọa độ từ chuỗi địa chỉ
        // Thêm "Ho Chi Minh City" vào cuối để ưu tiên tìm trong khu vực HCM
        const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query + ', Ho Chi Minh City'
        )}&limit=1`;
        const response = await fetch(searchUrl);
        const results = await response.json();

        if (results && results.length > 0) {
          const foundLat = parseFloat(results[0].lat);
          const foundLng = parseFloat(results[0].lon);

          // 1. Bay bản đồ tới đó và dời cục Marker
          miniMap.flyTo([foundLat, foundLng], 14, { duration: 1.5 });
          miniMarker.setLatLng([foundLat, foundLng]);

          // 2. Điền tọa độ ẩn
          document.getElementById('incidentLat').value = foundLat;
          document.getElementById('incidentLng').value = foundLng;

          // 3. Quét không gian để tìm lại Mã Xã chính xác từ GeoJSON
          const locationResult = window.findWardByCoordinates(
            foundLat,
            foundLng
          );
          if (locationResult) {
            document.getElementById('incidentWard').value = locationResult.maXa;
            console.log(
              `🎯 Đã bay đến: ${locationResult.maXa} - ${locationResult.tenXa}`
            );
          }
        }
      } catch (error) {
        console.error('Lỗi tìm kiếm địa chỉ:', error);
      }
    }, 800);
  });
};

// Đánh thức bản đồ khi modal mở ra
$('#emergencyDetailsModal')
  .off('shown.bs.modal')
  .on('shown.bs.modal', function () {
    window.initMiniMap();
    setTimeout(() => {
      if (miniMap) miniMap.invalidateSize();
    }, 200);
  });
// Thuật toán Ray-Casting kiểm tra điểm nằm trong một vòng tọa độ
function isPointInRing(point, ring) {
  let x = point[0],
    y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let xi = ring[i][0],
      yi = ring[i][1];
    let xj = ring[j][0],
      yj = ring[j][1];
    let intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Hàm tổng hợp kiểm tra cho cả Polygon và MultiPolygon
window.findWardByCoordinates = function (lat, lng) {
  const geojson = window.appState.mapGeoData;
  if (!geojson || !geojson.features) return null;

  // Lưu ý: GeoJSON sử dụng định dạng hệ tọa độ [Kinh độ, Vĩ độ] tức là [lng, lat]
  const point = [parseFloat(lng), parseFloat(lat)];

  for (let feature of geojson.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    let isInside = false;

    if (geometry.type === 'Polygon') {
      // Vòng đầu tiên (geometry.coordinates[0]) luôn là ranh giới ngoài của vùng
      if (isPointInRing(point, geometry.coordinates[0])) {
        isInside = true;
      }
    } else if (geometry.type === 'MultiPolygon') {
      // Duyệt qua từng Polygon cấu thành nên MultiPolygon
      for (let polygonCoords of geometry.coordinates) {
        if (isPointInRing(point, polygonCoords[0])) {
          isInside = true;
          break;
        }
      }
    }

    if (isInside) {
      // Trả về toàn bộ thuộc tính của Phường/Xã đó khi tìm thấy
      return {
        maXa: feature.properties.maXa,
        // Bạn có thể đổi tên cột 'tenXa' hoặc 'name' cho khớp với các thuộc tính chữ khác trong file json của bạn
        tenXa:
          feature.properties.tenXa ||
          feature.properties.ten_xa ||
          feature.properties.name ||
          'Phường/Xã',
      };
    }
  }
  return null; // Không nằm trong ranh giới TP.HCM
};

/**
 * Phê duyệt form đăng ký (Duyệt hồ sơ người dùng trong bảng 'profiles')
 * @param {string} profileId - ID của người dùng cần duyệt (UUID)
 * @param {string} userEmail - Email để gửi thông báo (optional)
 */
window.approveReport = async function (profileId, userEmail) {
  console.log('🔍 [approveReport] Bắt đầu duyệt hồ sơ...', {
    profileId,
    userEmail,
  });

  // Validate input
  if (!profileId || profileId === 'undefined' || profileId === '') {
    console.error('❌ profileId không hợp lệ:', profileId);
    showToast('Lỗi: Không tìm thấy ID hồ sơ cần duyệt!', 'error');
    return;
  }

  // Đảm bảo có loading
  if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

  try {
    // ✅ BƯỚC 1: Kiểm tra profile có tồn tại không (debug)
    const { data: checkData, error: checkErr } = await window.supabaseClient
      .from('profiles')
      .select('id, email, full_name, approval_status')
      .eq('id', profileId)
      .maybeSingle();

    if (checkErr) {
      console.warn('⚠️ Không tìm thấy profile để check:', checkErr.message);
    } else if (!checkData) {
      console.warn('⚠️ Profile không tồn tại với ID:', profileId);
      // Thử fallback: tìm theo email nếu có
      if (userEmail) {
        console.log('🔄 Thử tìm theo email:', userEmail);
        const { data: emailData } = await window.supabaseClient
          .from('profiles')
          .select('id, approval_status')
          .eq('email', userEmail)
          .maybeSingle();

        if (emailData) {
          profileId = emailData.id; // Update lại ID đúng
          console.log('✅ Tìm thấy profile qua email, ID mới:', profileId);
        }
      }
    } else {
      console.log('✅ Found profile:', {
        id: checkData.id,
        email: checkData.email,
        current_status: checkData.approval_status,
      });
    }

    // ✅ BƯỚC 2: Thực hiện update với .select() để verify
    const {
      data: updated,
      error: updateErr,
      count,
    } = await window.supabaseClient
      .from('profiles')
      .update({
        approval_status: 'approved', // ✅ Đảm bảo tên cột đúng theo schema
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId)
      .select() // ✅ Quan trọng: trả về dữ liệu sau update để verify
      .maybeSingle();

    if (updateErr) {
      console.error('❌ Supabase update error:', updateErr);

      // Xử lý lỗi phổ biến
      if (updateErr.code === 'PGRST116') {
        throw new Error(
          'Không tìm thấy hồ sơ với ID này. Vui lòng kiểm tra lại.'
        );
      } else if (updateErr.message?.includes('approval_status')) {
        throw new Error(
          'Cột "approval_status" không tồn tại. Liên hệ admin để kiểm tra schema.'
        );
      } else if (updateErr.message?.includes('policy')) {
        throw new Error(
          'Bạn không có quyền phê duyệt hồ sơ. Vui lòng đăng nhập bằng tài khoản Admin.'
        );
      }

      throw new Error(updateErr.message || 'Lỗi cập nhật database');
    }

    // ✅ BƯỚC 3: Verify update thành công
    if (!updated) {
      console.warn(
        '⚠️ Update succeeded but no row returned (count:',
        count,
        ')'
      );
      // Có thể do RLS chặn, hoặc ID không khớp
      throw new Error(
        'Cập nhật thành công nhưng không tìm thấy dữ liệu phản hồi. Vui lòng tải lại trang.'
      );
    }

    console.log('✅ Phê duyệt thành công:', {
      id: updated.id,
      new_status: updated.approval_status,
      updated_at: updated.updated_at,
    });

    showToast('✅ Phê duyệt hồ sơ thành công!', 'success');

    // ✅ BƯỚC 4: Refresh UI
    // Vẽ lại giao diện
    if (typeof window.renderDashboard === 'function') {
      window.renderDashboard();
    }
    if (typeof window.renderRRTTable === 'function') {
      await window.renderRRTTable();
    }
    // ✅ BƯỚC 5: Gửi thông báo cho user (nếu có email)
    if (userEmail && typeof window.createSystemNotification === 'function') {
      await window.createSystemNotification(
        [userEmail],
        '🎉 Hồ sơ RRT của bạn đã được phê duyệt! Bạn có thể đăng nhập và tham gia đội.',
        'phe_duyet',
        null,
        profileId
      );
      console.log('📧 Đã gửi thông báo phê duyệt tới:', userEmail);
    }

    // ✅ BƯỚC 6: Đóng modal nếu có
    if (typeof window.closeModal === 'function') {
      window.closeModal('modal-report-detail');
    }
  } catch (err) {
    console.error('❌ Lỗi approveReport:', err);
    showToast('Lỗi phê duyệt: ' + err.message, 'error');
  } finally {
    if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
  }
};
// ========================================================================
// HÀM PHÂN QUYỀN GIAO DIỆN TỔNG HỢP (Người Gác Cổng)
// Đặt ở ngoài cùng của file script.js
// ========================================================================
window.applyRolePermissions = function (role) {
  // Lấy role từ tham số truyền vào, nếu không có thì lấy từ Session, mặc định là 'user'
  let userRole = role || window.userSession?.role || 'user';
  userRole = userRole.toLowerCase().trim();

  // Định nghĩa Role chặt chẽ
  const isAdmin = userRole === 'admin';
  const isWardAdmin = userRole === 'ward_admin';

  console.log(
    `🔐 Đang áp dụng phân quyền toàn cục cho Role: ${userRole.toUpperCase()}`
  );

  // 1. ẨN/HIỆN MENU SIDEBAR (Trang/Page) -> CHỈ ADMIN
  if (typeof $ !== 'undefined') {
    $('#sidebar .side-menu li').each(function () {
      const allowedRoles = $(this).attr('data-roles');
      if (allowedRoles) {
        const rolesArray = allowedRoles
          .split(',')
          .map((r) => r.trim().toLowerCase());
        // Chỉ admin hoặc đúng role được chỉ định mới thấy menu
        if (rolesArray.includes(userRole) || isAdmin) {
          $(this).show();
        } else {
          $(this).hide();
        }
      } else {
        $(this).show(); // Menu public mặc định hiện
      }
    });
  } else {
    // Dự phòng nếu jQuery chưa load
    document.querySelectorAll('#sidebar .side-menu li').forEach((li) => {
      const allowedRoles = li.getAttribute('data-roles');
      if (allowedRoles) {
        const rolesArray = allowedRoles
          .split(',')
          .map((r) => r.trim().toLowerCase());
        li.style.display =
          rolesArray.includes(userRole) || isAdmin ? '' : 'none';
      } else {
        li.style.display = '';
      }
    });
  }

  // 2. ẨN/HIỆN NÚT CHỨC NĂNG THEO THUỘC TÍNH (data-permission) -> CHỈ ADMIN
  document.querySelectorAll('[data-permission]').forEach((el) => {
    const perm = el.getAttribute('data-permission');
    if (perm === 'admin' && !isAdmin) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
    }
  });

  // 3. ẨN/HIỆN CÁC NÚT ĐẶC BIỆT THEO ID CỤ THỂ -> ADMIN VÀ WARD_ADMIN ĐỀU THẤY
  const adminOnlyIds = [
    'btn-create-course-trigger',
    'btn-add-doc',
    'admin-rotation-controls',
    /*'btn-export-members',*/
    'btn-find-lab',
    'btn-map-find-lab',
    'btn-export-logistics',
    'btn-delete-roster',
    'btn-open-aar-modal',
    'btn-auto-trigger',
  ];

  // Chỉ HCDC (database cũng chặn tuyến cơ sở — supabase/migrations/*_rrt_rls_roles.sql):
  // đào tạo chỉ HCDC tổ chức, thư viện chỉ HCDC cập nhật
  const hcdcOnlyIds = ['btn-create-course-trigger', 'btn-add-doc'];

  adminOnlyIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      if (isAdmin || (isWardAdmin && !hcdcOnlyIds.includes(id))) {
        // Cấp đúng display: flex cho cụm nút điều chỉnh nhân sự để không bị vỡ UI
        el.style.display = id === 'admin-rotation-controls' ? 'flex' : '';
      } else {
        el.style.display = 'none';
      }
    }
  });

  // 4. THIẾT LẬP CỜ PHÂN QUYỀN TOÀN CỤC (Module/Page Access) -> CHỈ ADMIN
  window.appState = window.appState || {};
  window.appState.permissions = {
    role: userRole,
    canAccess: {
      dashboard: true,
      datatable: true,
      roster: isAdmin,
      emergency: isAdmin,
      team: isAdmin,
      training: isAdmin,
      logistics: isAdmin,
      library: isAdmin,
      map: true,
    },
  };

  console.log('✅ Phân quyền giao diện hoàn tất.');
};
