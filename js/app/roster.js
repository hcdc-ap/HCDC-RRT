// ============================================================
// ROSTER — Lịch trực, wizard thay người, tạo ca
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // ============================================================
  // LOGIC ROSTER WIZARD (SMART REPLACEMENT - SUPABASE VERSION)
  // ============================================================

  // 1. DATA STORE CHO WIZARD
  window.wizardData = {
    shiftId: null,
    date: null,
    oldUserId: null,
    oldUserName: null,
    oldUserRole: null,
    oldEmail: null,
    newUserId: null,
    newUserName: null,
    newEmail: null,
    context: 'roster',
  };

  // 2. KHỞI TẠO LẮNG NGHE SỰ KIỆN (BỌC THÉP CHỐNG LẶP SỰ KIỆN)
  $(document).ready(function () {
    // Bước 1 -> 2: Chọn lịch trực
    $(document)
      .off('click', '.wiz-select-shift-btn')
      .on('click', '.wiz-select-shift-btn', function () {
        const id = $(this).data('id');
        const date = $(this).data('date');
        const team = $(this).data('team');
        window.selectShiftForWizard(id, date, team);
      });

    // Bước 2 -> 3 (Hoặc Bước 1 -> 3 của Incident): Chọn người cần thay thế
    $(document)
      .off('click', '.wiz-select-old-member-btn')
      .on('click', '.wiz-select-old-member-btn', function () {
        const id = $(this).data('userid') || $(this).data('id');
        const name = $(this).data('name');
        const role = $(this).data('role');
        const email = $(this).data('email');
        window.selectOldMember(id, name, role, email);
      });

    // Bước 3 -> 4: Chốt người mới
    $(document)
      .off('click', '.wiz-select-new-member-btn')
      .on('click', '.wiz-select-new-member-btn', function () {
        const id = $(this).data('userid') || $(this).data('id');
        const name = $(this).data('name');
        const email = $(this).data('email');
        window.confirmReplacement(id, name, email);
      });
  });

  // ============================================================
  // BƯỚC 1: MỞ WIZARD & TẢI DANH SÁCH CA TRỰC HOẶC SỰ CỐ
  // ============================================================
  window.openWizard = async function (context = 'roster') {
    window.wizardData = { context: context };
    window.goToStep(1);

    if (typeof window.openModal === 'function')
      window.openModal('modal-wizard');
    const container = document.getElementById('wiz-shift-list');

    if (!container) return console.error('🚨 THIẾU THẺ: #wiz-shift-list');

    container.innerHTML =
      '<div class="text-center p-4"><span class="spinner-border"></span><p>Đang tải danh sách ca...</p></div>';

    try {
      if (context === 'roster') {
        const stepInd1 = document.querySelector('#wiz-step-1 .step-indicator');
        if (stepInd1) stepInd1.textContent = 'Bước 1/3: Chọn Ca trực cần sửa';

        // Lấy dữ liệu
        if (typeof window.loadRosterData === 'function')
          await window.loadRosterData();

        const rosters = window.appState.roster_schedules || [];

        // 🔥 ĐÃ SỬA: Xóa bỏ bộ lọc ngày tháng (new Date),
        // Chỉ giữ lại điều kiện lọc loại lịch là 'roster'
        const displayRosters = rosters.filter((r) => r.shift_type === 'roster');

        container.innerHTML = '';
        if (displayRosters.length === 0) {
          container.innerHTML =
            '<div class="p-3 text-center text-muted">Không có lịch trực nào.</div>';
          return;
        }

        displayRosters.forEach((r) => {
          const isLocked = r.status === 'replaced' || r.status === 'completed';
          const date = r.duty_date || 'Không rõ ngày';
          // TẠO NGÀY HIỂN THỊ CHUẨN VIỆT NAM
          let displayDate = date;
          if (displayDate && displayDate.includes('-')) {
            const parts = displayDate.split('T')[0].split('-');
            if (parts.length === 3) {
              displayDate = `${parts[2]}-${parts[1]}-${parts[0]}`; // Lật thành DD/MM/YYYY
            }
          }
          container.insertAdjacentHTML(
            'beforeend',
            `
                  <div class="list-item ${
                    isLocked ? 'locked-item' : 'wiz-select-shift-btn'
                  }" 
                       style="cursor: ${
                         isLocked ? 'not-allowed' : 'pointer'
                       }; border: 1px solid #ddd; padding: 12px; margin-bottom: 8px; border-radius: 8px; ${
              isLocked ? 'opacity:0.6' : ''
            }" 
                       data-id="${
                         r.id
                       }" data-date="${displayDate}" data-team="${
              r.team_name || ''
            }">
                      <div class="d-flex justify-content-between align-items-center">
                          <div>
                              <strong class="text-primary">📅 ${displayDate}</strong><br>
                              <small class="text-muted">Nhóm: ${
                                r.team_name || 'Không xác định'
                              }</small>
                          </div>
                          <div>
                              ${
                                isLocked
                                  ? '<span class="badge bg-secondary">Đã khóa</span>'
                                  : '<i class="bx bx-chevron-right fs-4"></i>'
                              }
                          </div>
                      </div>
                  </div>
              `
          );
        });
      }
      // ==========================================
      // NHÁNH SỰ CỐ KHẨN CẤP (INCIDENT)
      // ==========================================
      else if (context === 'incident') {
        const stepInd1 = document.querySelector('#wiz-step-1 .step-indicator');
        if (stepInd1)
          stepInd1.textContent = 'Bước 1/2: Chọn thành viên cần thay thế';

        const incidentId = window.currentDossierId;
        container.innerHTML =
          '<div class="text-center p-3"><span class="spinner-border spinner-border-sm"></span> Đang tải danh sách nhân sự...</div>';

        try {
          const { data: inc, error } = await window.supabaseClient
            .from('incidents')
            .select('initial_selected_members')
            .eq('id', incidentId)
            .single();

          if (error) throw error;

          let emails = (inc?.initial_selected_members || '')
            .split(';')
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);

          if (emails.length === 0) {
            container.innerHTML =
              '<div class="text-center text-muted p-3">Chưa có thành viên nào trong sự kiện.</div>';
            return;
          }

          const { data: profiles } = await window.supabaseClient
            .from('profiles')
            .select('id, full_name, email, role, position')
            .in('email', emails);

          container.innerHTML = '';
          emails.forEach((email) => {
            const p = profiles?.find(
              (prof) => prof.email.toLowerCase() === email
            ) || { email: email, full_name: email, position: 'Thành viên' };
            const name = p.full_name || email;
            const role = p.position || p.role || 'Thành viên';
            const roleClass = role.toLowerCase().includes('leader')
              ? 'bg-danger'
              : 'bg-info text-dark';

            container.insertAdjacentHTML(
              'beforeend',
              `
                    <div class="card mb-2 shadow-sm border-0 member-hover-effect wiz-select-old-member-btn" 
                         style="cursor: pointer;" 
                         data-userid="${p.id || ''}" 
                         data-email="${email}" 
                         data-name="${name}">
                        <div class="card-body p-3 d-flex align-items-center">
                            <div class="me-3 d-flex align-items-center justify-content-center text-white fw-bold rounded-circle shadow-sm"
                                 style="width: 45px; height: 45px; background-color: #6c757d; font-size: 18px;">
                                ${name.charAt(0).toUpperCase()}
                            </div>
                            <div class="flex-grow-1">
                                <div class="fw-bold text-dark">${
                                  window.escapeHtml
                                    ? window.escapeHtml(name)
                                    : name
                                }</div>
                                <div class="text-muted small">
                                    <span class="badge ${roleClass} rounded-pill me-1">${role}</span>
                                    ${email}
                                </div>
                            </div>
                            <div class="text-primary"><i class='bx bx-chevron-right fs-4'></i></div>
                        </div>
                    </div>
                `
            );
          });
        } catch (err) {
          container.innerHTML = `<div class="alert alert-danger">Lỗi tải dữ liệu: ${err.message}</div>`;
        }
      }
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">Lỗi: ${err.message}</div>`;
    }
  };

  // ============================================================
  // BƯỚC 2: TẢI DANH SÁCH NGƯỜI ĐANG TRONG CA (DÀNH RIÊNG ROSTER)
  // ============================================================
  window.selectShiftForWizard = async function (shiftId, dutyDate, teamName) {
    wizardData.shiftId = shiftId;
    wizardData.date = dutyDate;

    const stepInd2 = document.querySelector('#wiz-step-2 .step-indicator');
    if (stepInd2) stepInd2.textContent = 'Bước 2/3: Chọn nhân sự cần thay thế';

    window.goToStep(2);

    const container = document.getElementById('wiz-member-list');
    if (!container) return;

    container.innerHTML =
      '<div class="text-center p-3"><span class="spinner-border spinner-border-sm"></span> Đang tải danh sách nhân sự trong ca...</div>';

    try {
      // 🔥 ĐÃ SỬA: Phải lấy từ 'roster_assignments' thay vì 'profiles'
      let { data: assignments, error } = await window.supabaseClient
        .from('roster_assignments')
        .select(
          `user_id, profiles ( id, full_name, email, role, position, team )`
        )
        .eq('schedule_id', shiftId);

      if (error) throw error;

      let membersToShow = [];
      if (assignments && assignments.length > 0) {
        membersToShow = assignments.map((a) => a.profiles).filter(Boolean);
      }

      // Fallback: Nếu ca này chưa gán ai nhưng có tên đội, thì bốc cả đội đó ra
      if (membersToShow.length === 0 && teamName) {
        const { data: teamMembers } = await window.supabaseClient
          .from('profiles')
          .select('id, full_name, email, role, position, team')
          .eq('team', teamName);
        if (teamMembers) membersToShow = teamMembers;
      }

      container.innerHTML = '';
      if (membersToShow.length === 0) {
        container.innerHTML = `<div class="text-center text-muted p-3">Không tìm thấy nhân sự nào thuộc ca này trong hệ thống.</div>`;
        return;
      }

      membersToShow.forEach((p) => {
        const name = p.full_name || p.email;
        const role = p.position || p.role || 'Thành viên';
        const roleClass = role.toLowerCase().includes('leader')
          ? 'bg-danger'
          : 'bg-info text-dark';

        container.insertAdjacentHTML(
          'beforeend',
          `
              <div class="card mb-2 shadow-sm border-0 member-hover-effect wiz-select-old-member-btn" 
                   style="cursor: pointer;" data-userid="${p.id}" data-email="${
            p.email
          }" data-name="${name}" data-role="${role}">
                  <div class="card-body p-3 d-flex align-items-center">
                      <div class="me-3 d-flex align-items-center justify-content-center text-white fw-bold rounded-circle shadow-sm"
                           style="width: 45px; height: 45px; background-color: #6c757d; font-size: 18px;">
                          ${name.charAt(0).toUpperCase()}
                      </div>
                      <div class="flex-grow-1">
                          <div class="fw-bold text-dark">${
                            window.escapeHtml ? window.escapeHtml(name) : name
                          }</div>
                          <div class="text-muted small">
                              <span class="badge ${roleClass} rounded-pill me-1">${role}</span>
                              ${p.email}
                          </div>
                      </div>
                      <div class="text-primary"><i class='bx bx-chevron-right fs-4'></i></div>
                  </div>
              </div>
          `
        );
      });
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">Lỗi tải dữ liệu: ${err.message}</div>`;
    }
  };

  // ============================================================
  // BƯỚC 3: TRÌNH TÌM KIẾM NGƯỜI THAY THẾ THÔNG MINH (AI LOGIC)
  // ============================================================
  window.selectOldMember = async function (userId, name, role, email) {
    wizardData.oldUserId = userId;
    wizardData.oldUserName = name;
    wizardData.oldUserRole = role;
    wizardData.oldEmail = email;

    if (wizardData.context === 'incident') {
      wizardData.shiftId = window.currentDossierId;
    }

    const targetRoleEl = document.getElementById('wiz-target-role');
    if (targetRoleEl) targetRoleEl.innerText = role || 'Thành viên';

    window.goToStep(3);

    // Gọi hàm load mượt mà sau khi chuyển frame
    setTimeout(() => {
      window.loadReplacementCandidates();
    }, 150);
  };

  window.loadReplacementCandidates = async function () {
    const container = document.getElementById('wiz-suggestion-list');
    if (!container)
      return console.error(
        "🚨 THIẾU THẺ HTML: <div id='wiz-suggestion-list'></div>"
      );

    container.innerHTML =
      '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p>Hệ thống đang quét nhân sự rảnh rỗi...</p></div>';

    try {
      const isRoster = wizardData.context === 'roster';
      let finalCandidates = [];
      let busyRostersData = [];

      // ✅ BỌC THÉP 1: XỬ LÝ CHUỖI TÊN CHỨC VỤ BỊ DÍNH HTML/CẶN
      let targetPosition = 'Thành viên';
      if (wizardData.oldUserRole) {
        // Bóc tách HTML nếu có, loại bỏ khoảng trắng thừa
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = wizardData.oldUserRole;
        const cleanRole = tempDiv.textContent || tempDiv.innerText || '';
        targetPosition = cleanRole.trim();
      }

      if (isRoster) {
        // [LOGIC CA TRỰC] - Lấy danh sách rảnh
        const { data, error } = await window.supabaseClient
          .from('profiles')
          .select(
            'id, email, full_name, team, position, deployment_status, workplace_ma_xa, fax'
          )
          .eq('deployment_status', 'Sẵn sàng')
          .neq('approval_status', 'pending');

        if (error) {
          console.warn('⚠️ Lỗi fetch profiles:', error.message);
          return;
        }

        finalCandidates = (data || []).filter((user) => {
          const oldEmail = wizardData.oldEmail?.toLowerCase();
          const userEmail = user.email?.toLowerCase();

          if (oldEmail && userEmail && userEmail === oldEmail) return false;
          if (wizardData.oldUserId && user.id === wizardData.oldUserId)
            return false;

          // Loại người đang trong sự cố khẩn cấp
          if (window.appState?.trackingIncidents) {
            const busyInIncident = window.appState.trackingIncidents.some(
              (inc) => {
                const members = (inc.members || '').toLowerCase();
                return (
                  inc.status === 'active' &&
                  (members.includes(userEmail) || members.includes(user.id))
                );
              }
            );
            if (busyInIncident) return false;
          }
          return true;
        });
        // ward_admin: người thay thế cũng phải cùng xã + tuyến cơ sở
        const _role = (window.userSession?.role || '').toLowerCase();
        if (_role === 'ward_admin') {
          const myMaXa = String(
            window.userSession?.workplace_ma_xa || ''
          ).trim();
          const gu = [
            'trạm y tế phường/xã/ đặc khu',
            'ubnd phường/xã/ đặc khu',
          ];
          finalCandidates = finalCandidates.filter((u) => {
            const uMaXa = String(u.workplace_ma_xa || '').trim();
            const uFax = String(u.fax || '')
              .toLowerCase()
              .trim();
            return myMaXa && uMaXa === myMaXa && gu.includes(uFax);
          });
        }
      } else {
        // [LOGIC AI ĐIỀU ĐỘNG KHẨN CẤP]
        if (!wizardData.oldEmail)
          throw new Error('Không xác định được Email của người cần thay!');

        // 1. Tìm thông tin chuyên môn chính xác nếu bị rỗng
        if (!targetPosition || targetPosition === 'Thành viên') {
          const { data: oldProfile } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .ilike('email', wizardData.oldEmail.trim())
            .maybeSingle();

          if (oldProfile) {
            targetPosition =
              oldProfile.position ||
              oldProfile.academic ||
              oldProfile.role ||
              'Thành viên';
          }
        }

        // 2. Màng lọc 1: Nhân sự bận dập dịch
        const { data: activeIncidents } = await window.supabaseClient
          .from('incidents')
          .select('initial_selected_members, members')
          .eq('status', 'active');

        let busyIncidentEmails = [];
        if (activeIncidents) {
          activeIncidents.forEach((inc) => {
            // Quét cả initial và confirmed members cho chắc chắn
            const mem1 = (inc.initial_selected_members || '')
              .split(';')
              .map((m) => m.trim().toLowerCase());
            const mem2 = (inc.members || '')
              .split(';')
              .map((m) => m.trim().toLowerCase());
            busyIncidentEmails.push(...mem1, ...mem2);
          });
          // Lọc trùng
          busyIncidentEmails = [...new Set(busyIncidentEmails.filter(Boolean))];
        }

        // 3. Màng lọc 2: Nhân sự dính lịch trực
        let busyRosterIds = [];
        try {
          const todayDate = new Date();
          const yesterdayDate = new Date(todayDate);
          yesterdayDate.setDate(yesterdayDate.getDate() - 1);
          const tomorrowDate = new Date(todayDate);
          tomorrowDate.setDate(tomorrowDate.getDate() + 1);

          // ✅ BỌC THÉP 2: DÙNG ĐỊNH DẠNG ISO CHUẨN YYYY-MM-DD
          const todayStr = todayDate.toISOString().split('T')[0];
          const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
          const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

          let dbDate = wizardData.date || todayStr;
          if (dbDate.includes('/')) {
            // Sửa lỗi ngày Việt Nam DD/MM/YYYY
            const parts = dbDate.split('/');
            if (parts.length === 3)
              dbDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else if (dbDate.includes('-')) {
            const parts = dbDate.split('-');
            if (parts[0].length <= 2)
              dbDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }

          const { data: busyRosters } = await window.supabaseClient
            .from('roster_assignments')
            .select('user_id, roster_schedules!inner(duty_date, team_name)')
            .in('roster_schedules.duty_date', [
              yesterdayStr,
              todayStr,
              tomorrowStr,
              dbDate,
            ])
            .in('assignment_status', ['assigned', 'confirmed']); // Kể cả pending (assigned) hay confirmed đều tính là bận

          if (busyRosters) {
            busyRostersData = busyRosters;
            busyRosterIds = busyRosters.map((r) => r.user_id);
          }
        } catch (e) {
          console.warn('Lỗi khi quét lịch trực:', e);
        }

        // 4. Lấy USER CÙNG CHỨC VỤ (Sẵn sàng)
        let query = window.supabaseClient
          .from('profiles')
          .select('*')
          .eq('approval_status', 'approved')
          .eq('deployment_status', 'Sẵn sàng'); // Thêm điều kiện sẵn sàng cho chắc

        // Nếu khác 'Thành viên', 'No position' hoặc rỗng thì mới filter theo Position
        if (
          targetPosition &&
          targetPosition !== 'Thành viên' &&
          targetPosition !== 'No position'
        ) {
          query = query.ilike('position', `%${targetPosition}%`);
        }

        const { data: matchedUsers, error: matchErr } = await query;
        if (matchErr)
          throw new Error(
            'Lỗi khi tìm người cùng chức vụ: ' + matchErr.message
          );

        // 5. THỰC THI BỘ LỌC CUỐI CÙNG
        finalCandidates = (matchedUsers || []).filter((user) => {
          if (!user.email) return false;
          const email = user.email.toLowerCase();

          if (email === wizardData.oldEmail.toLowerCase()) return false; // Loại chính họ
          if (busyIncidentEmails.includes(email)) return false; // Đang đi dập dịch
          if (!isRoster && busyRosterIds.includes(user.id)) return false; // Kẹt trực
          return true;
        });
      }

      // =======================================================
      // RENDER KẾT QUẢ ĐỀ XUẤT
      // =======================================================
      container.innerHTML = '';
      if (finalCandidates.length === 0) {
        return (container.innerHTML = `
              <div class="text-center py-4">
                  <i class='bx bx-error-circle fs-1 text-danger mb-2'></i>
                  <p>Không tìm thấy nhân sự rảnh rỗi phù hợp.<br><small class="text-muted">Mọi người cùng chuyên môn đều đang kẹt nhiệm vụ khác.</small></p>
              </div>`);
      }

      if (!isRoster) {
        container.insertAdjacentHTML(
          'beforeend',
          `
              <div class="mb-3 text-success small fw-bold d-flex align-items-center bg-light p-2 rounded">
                  <i class='bx bx-check-shield fs-5 me-2'></i> AI đã loại trừ nhân sự bận dập dịch và vướng lịch trực định kỳ.
              </div>
          `
        );
      }

      finalCandidates.forEach((user) => {
        const fullName = user.full_name || user.username || user.email;
        const extraInfo = isRoster
          ? `Đội: ${user.team || 'Không rõ'}`
          : `Chức vụ: ${user.position || user.academic || 'N/A'}`;

        container.insertAdjacentHTML(
          'beforeend',
          `
              <div class="card mb-2 shadow-sm border-0 border-start border-success border-5 wiz-select-new-member-btn" 
                   style="cursor: pointer;" data-userid="${
                     user.id
                   }" data-email="${user.email}" data-name="${window.escapeHtml(
            fullName
          )}">
                  <div class="card-body p-3 d-flex align-items-center">
                      <div class="me-3 position-relative">
                          <div class="d-flex align-items-center justify-content-center fw-bold rounded-circle" 
                               style="width: 45px; height: 45px; background-color: #e6f9ec; color: #28a745; font-size: 18px;">
                              ${fullName.charAt(0).toUpperCase()}
                          </div>
                      </div>
                      <div class="flex-grow-1">
                          <div class="d-flex justify-content-between align-items-center mb-1">
                              <span class="fw-bold text-dark">${window.escapeHtml(
                                fullName
                              )}</span>
                              <span class="badge bg-success-subtle text-success border border-success-subtle">Phù hợp</span>
                          </div>
                          <div class="text-muted small">
                              <i class='bx bx-id-card me-1'></i> ${window.escapeHtml(
                                extraInfo
                              )}
                          </div>
                      </div>
                  </div>
              </div>
          `
        );
      });
    } catch (err) {
      console.error('Lỗi AI tìm kiếm:', err);
      container.innerHTML = `<div class="alert alert-danger p-3 text-center shadow-sm"><i class='bx bx-error fs-2'></i><br><strong>Lỗi:</strong> ${err.message}</div>`;
    }
  };

  // ============================================================
  // BƯỚC 4: XÁC NHẬN VÀ THỰC THI (DATABASE UPDATE + NOTIFICATIONS)
  // ============================================================
  window.confirmReplacement = function (newId, newName, newEmail) {
    if (newId) wizardData.newUserId = newId;
    if (newName) wizardData.newUserName = newName;
    if (newEmail) wizardData.newEmail = newEmail;

    window.submitRotation();
  };

  window.submitRotation = async function () {
    const targetId = wizardData.shiftId || window.currentDossierId;
    if (!targetId)
      return showToast('Lỗi: Không xác định được sự kiện.', 'error');
    if (!wizardData.newUserId)
      return showToast('Lỗi: Chưa chọn người thay thế.', 'error');

    showLoadingSpinner(true);

    try {
      const isRoster = wizardData.context === 'roster';

      // 1. Cập nhật dữ liệu chính
      if (isRoster) {
        const { error: updateErr } = await window.supabaseClient
          .from('roster_assignments')
          .update({
            user_id: wizardData.newUserId,
            assignment_status: 'assigned',
          })
          .eq('schedule_id', targetId)
          .eq('user_id', wizardData.oldUserId);
        if (updateErr) throw updateErr;
      } else {
        const { data: inc } = await window.supabaseClient
          .from('incidents')
          .select('initial_selected_members')
          .eq('id', targetId)
          .single();
        let membersArr = (inc?.initial_selected_members || '')
          .split(';')
          .map((e) => e.trim())
          .filter(Boolean);

        membersArr = membersArr.filter(
          (e) => e.toLowerCase() !== wizardData.oldEmail.toLowerCase()
        );
        if (!membersArr.includes(wizardData.newEmail))
          membersArr.push(wizardData.newEmail);

        const { error: incErr } = await window.supabaseClient
          .from('incidents')
          .update({ initial_selected_members: membersArr.join(';') })
          .eq('id', targetId);
        if (incErr) throw incErr;

        await window.supabaseClient.from('deployment_history').insert([
          {
            incident_id: targetId,
            user_id: wizardData.oldUserId,
            replaced_by: wizardData.newUserId,
            action_type: 'replace_in',
            reason: 'Cập nhật nhân sự bằng AI',
          },
        ]);
      }

      // 2. Định nghĩa nội dung thông báo (để tránh lỗi ReferenceError)
      const dateStr = wizardData.date ? ` ngày ${wizardData.date}` : '';
      const notifyOld = isRoster
        ? `Bạn đã được thay thế bởi ${
            wizardData.newUserName || 'người mới'
          } cho ca trực${dateStr}.`
        : `Bạn đã được rút khỏi lệnh điều động khẩn cấp${dateStr}.`;
      const notifyNew = isRoster
        ? `Bạn được phân công thay cho ${
            wizardData.oldUserName || wizardData.oldEmail
          } vào ca trực${dateStr}.`
        : `Bạn vừa được hệ thống tự động chọn tham gia dập dịch khẩn cấp${dateStr}!`;

      // 3. Tạo payload KHÔNG CÓ cột 'channels'
      // Thay đoạn tạo payload thành như thế này:
      // Dựa trên ảnh: id, user_email, message, is_read, created_at, notification_type, incident_id, schedule_id, response_status, responded_at
      const notificationsPayload = [
        {
          user_email: wizardData.oldEmail,
          message: notifyOld,
          notification_type: 'thong_tin',
          incident_id: !isRoster ? targetId : null,
          schedule_id: isRoster ? targetId : null,
        },
        {
          user_email: wizardData.newEmail,
          message: notifyNew,
          notification_type: 'thay_the',
          incident_id: !isRoster ? targetId : null,
          schedule_id: isRoster ? targetId : null,
        },
      ];

      // Gửi thông báo
      await window.supabaseClient
        .from('notifications')
        .insert(notificationsPayload);

      showToast('Thay đổi nhân sự thành công!', 'success');

      // 4. Refresh UI
      window.wizardData = {};
      if (typeof window.closeModal === 'function')
        window.closeModal('modal-wizard');
      if (typeof window.reloadData === 'function')
        await window.reloadData({ showSpinner: false, refreshUI: true });

      if (!isRoster && typeof window.openDossierView === 'function') {
        const { data: updatedInc } = await window.supabaseClient
          .from('incidents')
          .select('*')
          .eq('id', targetId)
          .single();
        if (updatedInc)
          window.openDossierView(
            encodeURIComponent(JSON.stringify(updatedInc))
          );
      }
    } catch (err) {
      console.error('❌ Lỗi SubmitRotation:', err);
      showToast('Lỗi server: ' + err.message, 'error');
    } finally {
      hideLoadingSpinner();
    }
  };

  // ============================================================
  // CÁC HÀM XỬ LÝ KHÁC (GIỮ NGUYÊN HOÀN TOÀN)
  // ============================================================
  window.goToStep = function (stepNumber) {
    document
      .querySelectorAll('.step-container')
      .forEach((el) => el.classList.remove('step-active'));
    const target = document.getElementById('wiz-step-' + stepNumber);
    if (target) target.classList.add('step-active');
  };

  let currentCalDate = new Date();

  window.renderRosterPage = async function () {
    const teamSelect = document.getElementById('new-shift-team');
    const role = (window.userSession?.role || '').toLowerCase();
    if (teamSelect) {
      let opts = '<option value="">-- Chọn Đội --</option>';
      if (role === 'ward_admin') {
        // Đội của xã mình: quét distinct team của người cùng workplace_ma_xa
        const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();
        const gu = ['trạm y tế phường/xã/ đặc khu', 'ubnd phường/xã/ đặc khu'];
        let wardTeams = [];
        try {
          const { data } = await window.supabaseClient
            .from('profiles')
            .select('team, workplace_ma_xa, fax')
            .eq('workplace_ma_xa', myMaXa);
          wardTeams = [
            ...new Set(
              (data || [])
                .filter((m) =>
                  gu.includes(
                    String(m.fax || '')
                      .toLowerCase()
                      .trim()
                  )
                )
                .map((m) => m.team)
                .filter((t) => t && t !== 'No team')
            ),
          ].sort();
        } catch (e) {
          console.warn('Lỗi tải đội xã:', e);
        }
        if (wardTeams.length === 0) {
          opts +=
            '<option value="" disabled>(Xã chưa có đội nào — tạo đội ở tab Thành viên trước)</option>';
        } else {
          wardTeams.forEach((t) => {
            opts += `<option value="${window.escapeHtml(
              t
            )}">${window.escapeHtml(t)}</option>`;
          });
        }
      } else {
        // admin: MỌI đội (Team 1-10 luôn có + Team Phường... quét từ profiles)
        const adminTeams = new Set();
        for (let i = 1; i <= 10; i++) adminTeams.add(`Team ${i}`);
        try {
          const { data } = await window.supabaseClient
            .from('profiles')
            .select('team');
          (data || []).forEach((p) => {
            const t = String(p.team || '').trim();
            if (t && t !== 'No team') adminTeams.add(t);
          });
        } catch (e) {
          console.warn('Lỗi quét đội cho admin:', e);
        }
        [...adminTeams].sort().forEach((t) => {
          opts += `<option value="${window.escapeHtml(t)}">${window.escapeHtml(
            t
          )}</option>`;
        });
      }
      teamSelect.innerHTML = opts;
    }
    window.reloadData({ showSpinner: true, refreshUI: true });
  };

  window.renderCalendar = async function () {
    try {
      const container = document.getElementById('calendar-grid');
      if (!container) return;

      const year = currentCalDate.getFullYear();
      const month = currentCalDate.getMonth();
      const firstDayOfMonth = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const today = new Date();

      const monthNames = [
        'Tháng 1',
        'Tháng 2',
        'Tháng 3',
        'Tháng 4',
        'Tháng 5',
        'Tháng 6',
        'Tháng 7',
        'Tháng 8',
        'Tháng 9',
        'Tháng 10',
        'Tháng 11',
        'Tháng 12',
      ];
      const titleEl = document.getElementById('cal-month-title');
      if (titleEl) titleEl.innerText = `${monthNames[month]} / ${year}`;

      let fullGridHtml = `
          <div class="cal-day-header" style="color:#dc3545">CN</div>
          <div class="cal-day-header">T2</div><div class="cal-day-header">T3</div>
          <div class="cal-day-header">T4</div><div class="cal-day-header">T5</div>
          <div class="cal-day-header">T6</div><div class="cal-day-header">T7</div>
      `;

      for (let i = 0; i < firstDayOfMonth; i++) {
        fullGridHtml += `<div class="cal-cell empty"></div>`;
      }

      const rosters = window.appState.roster_schedules || [];

      for (let day = 1; day <= daysInMonth; day++) {
        const isToday =
          day === today.getDate() &&
          month === today.getMonth() &&
          year === today.getFullYear();
        let shiftsHtml = '';

        const dayRosters = rosters.filter((r) => {
          if (!r.duty_date) return false;
          const rDate = new Date(r.duty_date);
          return (
            rDate.getDate() === day &&
            rDate.getMonth() === month &&
            rDate.getFullYear() === year
          );
        });

        dayRosters.forEach((r) => {
          const safeId = String(r.id || '').replace(/'/g, "\\'");
          const safeTeam = window.escapeHtml
            ? window.escapeHtml(r.team_name || 'Không tên')
            : r.team_name || 'Không tên';
          const isIncident = r.shift_type === 'incident';
          const shiftText = isIncident ? 'Sự cố' : 'Định kỳ';
          const borderCol = isIncident ? '#dc3545' : '#0d6efd';
          const badgeBg = isIncident
            ? 'bg-danger-subtle text-danger'
            : 'bg-primary-subtle text-primary';

          shiftsHtml += `
                  <div class="shift-tag" style="border-left: 3px solid ${borderCol}; padding-left:4px; margin-bottom:4px; cursor:pointer;" data-action="view-roster" data-id="${safeId}">
                      <div class="d-flex justify-content-between align-items-center">
                          <span style="font-weight:bold; font-size:12px; color: #333;">${safeTeam}</span>
                      </div>
                      <div style="margin-top: 2px;">
                          <span class="badge ${badgeBg}" style="font-size:9px; padding: 2px 4px;">${shiftText}</span>
                      </div>
                  </div>`;
        });

        fullGridHtml += `
              <div class="cal-cell ${
                isToday ? 'today' : ''
              }" data-date="${year}-${month + 1}-${day}">
                  <span class="day-num">${day}</span>
                  <div class="shifts-container">${shiftsHtml}</div>
              </div>`;
      }

      container.innerHTML = fullGridHtml;

      container
        .querySelectorAll('[data-action="view-roster"]')
        .forEach((el) => {
          el.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            const rosterId = this.getAttribute('data-id');
            if (rosterId && typeof window.viewRosterDetail === 'function')
              window.viewRosterDetail(rosterId);
          };
        });
    } catch (err) {
      console.error('❌ renderCalendar error:', err);
    }
  };

  window.prevMonth = function () {
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    renderCalendar();
  };
  window.nextMonth = function () {
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    renderCalendar();
  };
  window.todayMonth = function () {
    currentCalDate = new Date();
    renderCalendar();
  };

  window.viewRosterDetail = async function (rosterId) {
    try {
      if (document.activeElement) document.activeElement.blur();
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      const rosters = window.appState.roster_schedules || [];
      const shift = rosters.find(
        (r) => String(r.id).trim() === String(rosterId).trim()
      );

      if (!shift) throw new Error('Không tìm thấy dữ liệu ca trực này.');

      document.getElementById('detail-roster-team').textContent =
        shift.team_name || 'Chưa rõ';

      let displayDate = shift.duty_date || '';
      if (displayDate.includes('-')) {
        const parts = displayDate.split('T')[0].split('-');
        if (parts.length === 3)
          displayDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }

      document.getElementById('detail-roster-date').textContent = displayDate;
      document.getElementById('detail-roster-id').textContent =
        shift.note || '';

      // ==========================================
      // PHÂN LUỒNG TÌM KIẾM THÀNH VIÊN
      // ==========================================
      let teamMembers = [];
      let assignments = [];
      const isIncident = shift.shift_type === 'incident';

      if (!isIncident) {
        // TRƯỜNG HỢP 1: LỊCH TRỰC ĐỊNH KỲ (ROSTER)
        const [profilesRes, assignmentsRes] = await Promise.all([
          window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('team', shift.team_name),
          window.supabaseClient
            .from('roster_assignments')
            .select('*')
            .eq('schedule_id', shift.id),
        ]);
        teamMembers = profilesRes.data || [];
        assignments = assignmentsRes.data || [];
      } else {
        // TRƯỜNG HỢP 2: SỰ CỐ KHẨN CẤP (INCIDENT)
        const { data: incidentData } = await window.supabaseClient
          .from('incidents')
          .select('members, declined_members')
          .eq('id', shift.incident_id)
          .single();

        if (incidentData) {
          // Tách chuỗi email thành mảng
          const confirmedEmails = (incidentData.members || '')
            .split(';')
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);
          const declinedEmails = (incidentData.declined_members || '')
            .split(';')
            .map((e) => e.trim().toLowerCase())
            .filter(Boolean);

          // Gộp tất cả email để truy vấn
          const allEmails = [
            ...new Set([...confirmedEmails, ...declinedEmails]),
          ];

          if (allEmails.length > 0) {
            const { data: profilesData } = await window.supabaseClient
              .from('profiles')
              .select('*')
              .in('email', allEmails);

            teamMembers = profilesData || [];

            // Giả lập cấu trúc assignments để tái sử dụng logic render bên dưới
            assignments = teamMembers.map((member) => {
              const email = (member.email || '').toLowerCase();
              let status = 'pending';
              if (confirmedEmails.includes(email)) status = 'confirmed';
              else if (declinedEmails.includes(email)) status = 'declined';

              return {
                user_id: member.id,
                assignment_status: status,
              };
            });
          }
        }
      }

      // ==========================================
      // RENDER DANH SÁCH RA GIAO DIỆN
      // ==========================================
      const container = document.getElementById('detail-roster-members');
      container.innerHTML = '';

      if (teamMembers.length === 0) {
        container.innerHTML =
          '<div class="text-center text-muted p-3">Đội/Sự kiện này hiện chưa có thành viên nào trong hệ thống.</div>';
      } else {
        let confirmedCount = 0;

        teamMembers.forEach((member) => {
          const name = member.full_name || member.email;
          const role = member.position || member.role || 'Thành viên';
          const assignRecord = assignments.find((a) => a.user_id === member.id);
          const status = assignRecord
            ? assignRecord.assignment_status
            : 'pending';

          let statusHtml = '';
          let opacity = '1';

          if (status === 'confirmed' || status === 'assigned') {
            statusHtml = `<span class="badge bg-success-subtle text-success" style="font-size:11px;"><i class='bx bx-check'></i> Đã nhận</span>`;
            confirmedCount++;
          } else if (status === 'declined') {
            statusHtml = `<span class="badge bg-danger-subtle text-danger" style="font-size:11px;">Báo bận</span>`;
            opacity = '0.6';
          } else {
            statusHtml = `<span class="badge bg-warning-subtle text-warning" style="font-size:11px;"><i class='bx bx-time'></i> Chưa phản hồi</span>`;
          }

          container.insertAdjacentHTML(
            'beforeend',
            `
              <div class="list-group-item border-0 border-bottom d-flex align-items-center p-2" style="opacity: ${opacity};">
                  <div class="me-3 d-flex align-items-center justify-content-center shadow-sm" style="width: 40px; height: 40px; background-color: #f0f2f5; border-radius: 50%; font-weight: bold;">
                      ${name.charAt(0).toUpperCase()}
                  </div>
                  <div class="flex-grow-1">
                      <div class="fw-bold text-dark" style="font-size: 14px;">${
                        window.escapeHtml ? window.escapeHtml(name) : name
                      }</div>
                      <div class="text-muted small">${
                        window.escapeHtml ? window.escapeHtml(role) : role
                      }</div>
                  </div>
                  <div>${statusHtml}</div>
              </div>
            `
          );
        });

        const statusEl = document.getElementById('detail-roster-status');
        if (confirmedCount === 0) {
          statusEl.innerHTML = `<span class="badge bg-warning text-dark">Đang chờ xác nhận (0/${teamMembers.length})</span>`;
        } else if (confirmedCount < teamMembers.length) {
          statusEl.innerHTML = `<span class="badge bg-info text-dark">Đã nhận một phần (${confirmedCount}/${teamMembers.length})</span>`;
        } else {
          statusEl.innerHTML = `<span class="badge bg-success">Đã xác nhận đủ</span>`;
        }
      }

      // ==========================================
      // XỬ LÝ NÚT XÓA
      // ==========================================
      const btnDelete = document.getElementById('btn-delete-roster');
      if (btnDelete) {
        btnDelete.onclick = null;

        // Không cho phép xóa Sự cố (Incident) từ màn hình Lịch trực
        if (isIncident) {
          btnDelete.style.display = 'none';
        } else {
          const _role = (window.userSession?.role || '').toLowerCase();
          const canDelete =
            _role === 'admin' ||
            (_role === 'ward_admin' && window.isMyWardTeam(shift.team_name));

          if (canDelete) {
            btnDelete.style.display = 'block';
            btnDelete.onclick = async function () {
              document.activeElement.blur();
              showToastConfirm(
                `Xóa ca trực ngày ${displayDate}?`,
                async function () {
                  if (typeof showLoadingSpinner === 'function')
                    showLoadingSpinner(true);
                  try {
                    const { error } = await window.supabaseClient
                      .from('roster_schedules')
                      .delete()
                      .eq('id', shift.id);
                    if (error) throw error;
                    showToast('Đã xóa thành công!', 'success');
                    if (typeof window.closeModal === 'function')
                      window.closeModal('modal-roster-detail');
                    window.reloadData({ showSpinner: false, refreshUI: true });
                  } catch (err) {
                    showToast('Lỗi xóa: ' + err.message, 'error');
                  } finally {
                    if (typeof hideLoadingSpinner === 'function')
                      hideLoadingSpinner();
                  }
                }
              );
            };
          } else {
            btnDelete.style.display = 'none';
          }
        }
      }

      if (typeof window.openModal === 'function')
        window.openModal('modal-roster-detail');
    } catch (err) {
      console.error('viewRosterDetail error:', err);
      showToast('Lỗi hiển thị chi tiết: ' + err.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  window.reloadData = async function (options = {}) {
    const { showSpinner = true, refreshUI = true } = options;
    if (showSpinner && typeof showLoadingSpinner === 'function')
      showLoadingSpinner(true);
    try {
      await window.loadRosterData();
      if (refreshUI && typeof renderCalendar === 'function')
        await renderCalendar();
    } catch (err) {
      showToast('Lỗi tải lại dữ liệu: ' + err.message, 'error');
    } finally {
      if (showSpinner && typeof hideLoadingSpinner === 'function')
        hideLoadingSpinner();
    }
  };

  // PATCH 15 (v3): Hiển thị TẤT CẢ incident đang active trên lịch,
  // không phụ thuộc trạng thái của từng activity con bên trong
  window.loadRosterData = async function () {
    try {
      let combinedData = [];

      // 1. Lịch trực định kỳ (giữ nguyên)
      const { data: rosters, error: rosterErr } = await window.supabaseClient
        .from('roster_schedules')
        .select('*')
        .order('duty_date', { ascending: false });
      if (rosterErr) throw rosterErr;

      if (rosters) {
        combinedData = rosters.map((r) => ({
          id: r.id,
          duty_date: r.duty_date,
          team_name: r.team_name,
          status: r.status,
          note: r.note || '',
          shift_type: r.shift_type || 'roster',
        }));
      }

      // 2. Sự cố khẩn cấp — LẤY THEO incident.status, KHÔNG theo activity
      try {
        // THÊM ma_xa VÀO SELECT QUERY
        const { data: incidents, error: incErr } = await window.supabaseClient
          .from('incidents')
          .select('id, event_name, status, activation_time, ma_xa')
          .eq('status', 'active'); // ← Chỉ cần incident còn active
        if (incErr) throw incErr;

        if (incidents && incidents.length > 0) {
          const incidentIds = incidents.map((i) => i.id);

          // Lấy thêm activities để biết % hoàn thành (hiển thị phụ, không dùng để filter)
          const { data: activities } = await window.supabaseClient
            .from('incident_activities')
            .select('incident_id, status')
            .in('incident_id', incidentIds);

          const progressMap = {};
          (activities || []).forEach((a) => {
            if (!progressMap[a.incident_id]) {
              progressMap[a.incident_id] = { total: 0, done: 0 };
            }
            progressMap[a.incident_id].total++;
            if (a.status === 'completed') progressMap[a.incident_id].done++;
          });

          const formattedIncidents = incidents
            .map((inc) => {
              if (!inc.activation_time) return null; // Không có ngày thật → bỏ

              const validDate = String(inc.activation_time).split('T')[0];
              const prog = progressMap[inc.id];
              const progressText = prog
                ? ` (${prog.done}/${prog.total} HĐ xong)`
                : '';

              return {
                id: inc.id,
                duty_date: validDate,
                team_name: inc.event_name || 'Sự cố',
                status: inc.status, // Luôn là 'active' vì đã filter ở query
                note: 'Điều động khẩn cấp' + progressText,
                shift_type: 'incident',
                incident_id: inc.id,
                ma_xa: inc.ma_xa, // GẮN ma_xa VÀO OBJECT
              };
            })
            .filter(Boolean);

          combinedData = [...combinedData, ...formattedIncidents];
        }
      } catch (e) {
        console.warn('⚠️ Bỏ qua dữ liệu Sự cố:', e.message);
      }

      // ward_admin: chỉ giữ ca trực của đội xã mình (roster định kỳ)
      // VÀ sự cố thuộc xã của mình
      const _role = (window.userSession?.role || '').toLowerCase();
      if (_role === 'ward_admin') {
        const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();

        combinedData = combinedData.filter((r) => {
          if (r.shift_type === 'incident') {
            // sự cố: Lọc theo mã xã của ward_admin
            const incidentMaXa = String(r.ma_xa || '').trim();
            return myMaXa && incidentMaXa === myMaXa;
          }
          // roster định kỳ: giữ nếu đội thuộc xã mình
          return window.isMyWardTeam(r.team_name);
        });
      }

      window.appState = window.appState || {};
      window.appState.roster_schedules = combinedData;
      return combinedData;
    } catch (err) {
      console.error('❌ loadRosterData error:', err);
      return [];
    }
  };

  async function waitForSupabaseReady(timeout = 10000) {
    if (window.supabaseClient?.auth) return true;
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = () => {
        if (window.supabaseClient?.auth) return resolve(true);
        if (Date.now() - startTime > timeout)
          return reject(
            new Error('Supabase client not initialized after ' + timeout + 'ms')
          );
        setTimeout(check, 100);
      };
      check();
    });
  }

  window.submitNewShift = async function () {
    const date = document.getElementById('new-shift-date').value;
    const team = document.getElementById('new-shift-team').value;
    const note = document.getElementById('new-shift-note').value;

    if (!date || !team)
      return showToast('Vui lòng chọn ngày và đội.', 'warning');
    // ward_admin: chỉ được tạo ca cho đội thuộc xã mình
    const _role = (window.userSession?.role || '').toLowerCase();
    if (_role === 'ward_admin' && !window.isMyWardTeam(team)) {
      return showToast(
        'Bạn chỉ được tạo lịch trực cho đội thuộc xã mình.',
        'error'
      );
    }
    showLoadingSpinner();

    try {
      // ✅ LẤY USER ID HIỆN TẠI
      const currentUserId =
        window.userSession?.id ||
        (await window.supabaseClient.auth.getUser())?.data?.user?.id;

      // 1. Tạo lịch mới + lưu created_by
      const { data: newShift, error: shiftErr } = await window.supabaseClient
        .from('roster_schedules')
        .insert([
          {
            duty_date: date,
            team_name: team,
            note: note,
            shift_type: 'roster',
            status: 'active',
            created_by: currentUserId, // ✅ THÊM DÒNG NÀY
          },
        ])
        .select('id')
        .single();

      if (shiftErr) throw shiftErr;

      // 2. Lấy danh sách thành viên của team
      const { data: teamMembers, error: profileErr } =
        await window.supabaseClient
          .from('profiles')
          .select('id, email, team')
          .eq('team', team);

      if (profileErr) throw profileErr;

      if (teamMembers && teamMembers.length > 0) {
        // 3. Tạo assignments
        const assignments = teamMembers.map((m) => ({
          schedule_id: newShift.id,
          user_id: m.id,
          assignment_status: 'pending',
        }));

        const { error: assignErr } = await window.supabaseClient
          .from('roster_assignments')
          .insert(assignments);

        if (assignErr) throw assignErr;

        // 4. Tạo notifications
        const memberEmails = teamMembers.map((m) => m.email).filter(Boolean);
        const displayDate = date.split('-').reverse().join('/');

        const notificationsPayload = memberEmails.map((email) => ({
          user_email: email,
          message: `📅 Lịch trực định kỳ: Bạn được phân công trực ngày ${displayDate} cùng ${team}.`,
          // Nếu notifications có thêm cột, có thể thêm:
          notification_type: 'truc_ban',
          schedule_id: newShift.id,
          //created_by: currentUserId
        }));

        await window.supabaseClient
          .from('notifications')
          .insert(notificationsPayload);
      }

      showToast('Tạo lịch thành công!', 'success');
      if (typeof window.reloadData === 'function')
        await window.reloadData({ refreshUI: true });
    } catch (err) {
      console.error('❌ submitNewShift error:', err);
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      hideLoadingSpinner();
    }
  };

  window.submitIncidentResponse = async function (actionType) {
    if (!window.selectedIncidentId) return;

    // Lấy thông tin user
    const myEmail = String(window.userSession?.email || '')
      .toLowerCase()
      .trim();
    const myUserId = window.userSession?.id; // Lấy thêm ID để lưu lịch sử

    if (!myEmail)
      return showToast('Lỗi: Không tìm thấy email của bạn', 'error');

    showLoadingSpinner();
    try {
      // 1. Kéo dữ liệu sự kiện hiện tại về
      const { data: inc, error: fetchErr } = await window.supabaseClient
        .from('incidents')
        .select('members, declined_members')
        .eq('id', window.selectedIncidentId)
        .single();
      if (fetchErr) throw fetchErr;

      let confirmedArr = (inc.members || '')
        .split(';')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      let declinedArr = (inc.declined_members || '')
        .split(';')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      // 2. Logic thêm/bớt danh sách
      if (actionType === 'confirm') {
        if (!confirmedArr.includes(myEmail)) confirmedArr.push(myEmail);
        declinedArr = declinedArr.filter((e) => e !== myEmail);
      } else if (actionType === 'decline') {
        if (!declinedArr.includes(myEmail)) declinedArr.push(myEmail);
        confirmedArr = confirmedArr.filter((e) => e !== myEmail);
      }

      // 3. Cập nhật vào bảng incidents
      const { error: updateErr } = await window.supabaseClient
        .from('incidents')
        .update({
          members: confirmedArr.join(';'),
          declined_members: declinedArr.join(';'),
          confirmations: confirmedArr.length,
        })
        .eq('id', window.selectedIncidentId);

      if (updateErr) throw updateErr;

      // ==============================================================
      // 🔥 BƯỚC MỚI: GHI NHẬT KÝ VÀO BẢNG DEPLOYMENT_HISTORY 🔥
      // ==============================================================
      if (myUserId) {
        const stdAction = actionType === 'confirm' ? 'deployed' : 'declined';
        const stdReason =
          actionType === 'confirm'
            ? 'Xác nhận tham gia (trong app)'
            : 'Không thể tham gia (trong app)';

        // Cập nhật bản ghi điều động có sẵn; nếu chưa có thì tạo mới
        const { data: updated, error: updErr } = await window.supabaseClient
          .from('deployment_history')
          .update({ action_type: stdAction, reason: stdReason })
          .eq('incident_id', window.selectedIncidentId)
          .eq('user_id', myUserId)
          .in('action_type', ['deployed', 'replace_in', 'declined'])
          .select('id');

        if (!updErr && (!updated || updated.length === 0)) {
          await window.supabaseClient.from('deployment_history').insert({
            incident_id: window.selectedIncidentId,
            user_id: myUserId,
            action_type: stdAction,
            reason: stdReason,
          });
        }
        if (updErr) console.warn('Lỗi lưu lịch sử thực chiến:', updErr);
      }
      // ==============================================================

      showToast(
        actionType === 'confirm'
          ? 'Đã xác nhận tham gia!'
          : 'Không thể tham gia!',
        'success'
      );

      // 4. Làm mới giao diện
      const { data: updatedInc } = await window.supabaseClient
        .from('incidents')
        .select('*')
        .eq('id', window.selectedIncidentId)
        .single();

      if (updatedInc) {
        const newIncString = encodeURIComponent(JSON.stringify(updatedInc));
        window.currentDossierString = newIncString;
        if (window.appState && window.appState.trackingIncidents) {
          const idx = window.appState.trackingIncidents.findIndex(
            (i) => String(i.id) === String(updatedInc.id)
          );
          if (idx !== -1) window.appState.trackingIncidents[idx] = updatedInc;
        }
        if (typeof window.openDossierView === 'function')
          window.openDossierView(newIncString);
      }
      if (typeof window.renderTrackingPage === 'function')
        window.renderTrackingPage(true);
    } catch (error) {
      showToast('Lỗi hệ thống: ' + error.message, 'error');
    } finally {
      hideLoadingSpinner();
    }
  };

  window.getUserName = function (key) {
    if (!key) return 'Unknown';
    const cleanKey = String(key).trim().toLowerCase();
    if (
      window.userSession &&
      (String(window.userSession.email).toLowerCase() === cleanKey ||
        String(window.userSession.username).toLowerCase() === cleanKey)
    ) {
      return 'Tôi (' + window.userSession.username + ')';
    }
    if (window.appState && window.appState.userDirectory) {
      const nameFound = window.appState.userDirectory[cleanKey];
      if (nameFound) return nameFound;
    }
    if (window.appState && Array.isArray(window.appState.teamData)) {
      const member = window.appState.teamData.find(
        (m) =>
          (m.email && String(m.email).trim().toLowerCase() === cleanKey) ||
          (m.username && String(m.username).trim().toLowerCase() === cleanKey)
      );
      if (member) return member.fullName || member.username;
    }
    if (cleanKey.includes('@')) return key.split('@')[0];
    return key;
  };
});
