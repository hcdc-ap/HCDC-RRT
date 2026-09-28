// ============================================================
// DASHBOARD — Trang tổng quan admin/user, lịch trực, biểu đồ năng lực, KPI
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // Chia sẻ cho các file js/app/* khác (trước đây dùng chung 1 closure)
  rrtShared.renderCompetencyChart = renderCompetencyChart;

  // ======================
  // QUẢN LÝ DASHBOARD (ADMIN & USER)
  // ======================

  // 2. HÀM ĐIỀU PHỐI GIAO DIỆN CHÍNH
  // ============================================================
  // PAGE-DASHBOARD (Phiên bản Hoàn thiện: 100% Real-time, No Cache, Bọc lót Regex)
  // ============================================================
  window.renderDashboard = async function (customShowLoading = true) {
    try {
      if (customShowLoading && typeof window.customShowLoading === 'function') {
        window.customShowLoading(true);
      }

      // =======================================================
      // 1. CẬP NHẬT LOGIC PHÂN QUYỀN
      // =======================================================
      const isAdmin =
        typeof window.isUserAdmin === 'function'
          ? window.isUserAdmin()
          : window.userSession?.role === 'admin';
      const isWardAdmin =
        (window.userSession?.role || '').toLowerCase() === 'ward_admin';

      const adminView = document.getElementById('dashboard-admin-view');
      const userView = document.getElementById('dashboard-user-view');

      if (isAdmin || isWardAdmin) {
        // ===== ADMIN VIEW =====
        if (adminView) adminView.style.display = 'block';
        if (userView) userView.style.display = 'none';

        const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();

        // ✅ TẢI PROFILES: Ward Admin chỉ tải lính của mình
        const fetchProfiles = async () => {
          let query = window.supabaseClient
            .from('profiles')
            .select(
              'id, email, full_name, role, team, position, deployment_status, approval_status, updated_at, workplace_ma_xa, fax'
            )
            .not('role', 'in', `(${window.LIMS_ONLY_ROLES.join(',')})`)
            .order('updated_at', { ascending: false });

          if (isWardAdmin && myMaXa) {
            query = query.eq('workplace_ma_xa', myMaXa);
          }

          const { data, error } = await query;
          if (error) throw error;
          return data;
        };

        // 🚨 GỠ BỎ HOÀN TOÀN CACHE ĐỂ DỮ LIỆU LUÔN TƯƠI 100%
        const [profiles] = await Promise.all([
          fetchProfiles(),
          // Không cần fetchIncidents ở đây nữa vì ta đã xóa khối đồng bộ
        ]);

        // KHÔNG LÀM GÌ CẢ, DÙNG NGUYÊN BẢN DATA TỪ SUPABASE!
        const updatedProfiles = profiles || [];

        // =======================================================
        // 🚀 RENDER CÁC COMPONENT BÊN DƯỚI
        // =======================================================

        // 1. KPI Cards
        if (typeof updateKpiCards === 'function') {
          updateKpiCards();
        }

        // 2. Bảng báo cáo gần đây
        if (typeof rrtShared.updateRecentReportsTable === 'function') {
          rrtShared.updateRecentReportsTable(updatedProfiles.slice(0, 10));
        }

        // 3. Todo list
        if (typeof rrtShared.updateTodoList === 'function') {
          rrtShared.updateTodoList(updatedProfiles);
        }

        // 4. Notifications
        if (typeof window.renderMessageTable === 'function') {
          window.renderMessageTable();
        }

        // 5. Analytics
        if (typeof Highcharts !== 'undefined' && window.appState?.teamData) {
          if (typeof renderAnalytics === 'function') {
            renderAnalytics(window.appState.teamData, null, null);
          }
        }
      } else {
        // ===== USER VIEW =====
        if (adminView) adminView.style.display = 'none';
        if (userView) userView.style.display = 'block';

        if (typeof window.renderUserDashboard === 'function') {
          await window.renderUserDashboard();
        }
      }
    } catch (e) {
      console.error('❌ Lỗi renderDashboard:', e);
      if (typeof showToast === 'function') {
        showToast('Không thể tải dữ liệu Dashboard: ' + e.message, 'error');
      }
    } finally {
      // Tắt loading
      if (customShowLoading && typeof window.customShowLoading === 'function') {
        setTimeout(() => window.customShowLoading(false), 150);
      }
    }
  };

  // 3. HÀM HIỂN THỊ DÀNH CHO USER BÌNH THƯỜNG
  window.renderUserDashboard = async function () {
    console.log('🚀 Bắt đầu render User Dashboard...');

    // 1. CHUẨN HÓA ĐỊNH DANH
    const myEmail = String(window.userSession?.email || '')
      .toLowerCase()
      .trim();

    const nameEl = document.getElementById('user-dash-name');
    if (nameEl) {
      nameEl.textContent =
        window.userSession?.full_name ||
        window.userSession?.username ||
        'Thành viên';
    }

    const alertsContainer = document.getElementById('user-dash-alerts');
    if (!alertsContainer) return;

    if (!myEmail) {
      alertsContainer.innerHTML =
        '<li class="list-group-item text-muted text-center">Không xác định được tài khoản.</li>';
      return;
    }

    alertsContainer.innerHTML =
      '<li class="list-group-item text-muted text-center"><span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</li>';

    try {
      // 2. QUÉT TRẠNG THÁI THỰC TẾ TỪ BẢNG SỰ KIỆN (Tránh lỗi trôi thông báo)
      const incidents = window.appState?.incidents || [];
      const joinedIncidents = [];
      const invitedIncidents = [];

      const parseEmails = (str) =>
        String(str || '')
          .split(';')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);

      incidents.forEach((inc) => {
        if (inc.status !== 'active') return;
        const members = parseEmails(inc.members);
        const initial = parseEmails(inc.initial_selected_members);
        const declined = parseEmails(inc.declined_members);

        if (members.includes(myEmail)) {
          joinedIncidents.push(inc); // Đã xác nhận tham gia
        } else if (initial.includes(myEmail) && !declined.includes(myEmail)) {
          invitedIncidents.push(inc); // Đang bị gọi, chưa trả lời
        }
      });

      // 3. ĐỒNG BỘ UI KHỐI TRẠNG THÁI (SẴN SÀNG / ĐANG LÀM NHIỆM VỤ)
      // *LƯU Ý: Bạn cần bọc khối trạng thái trong HTML bằng id="user-dash-status-card"
      const statusCard = document.getElementById('user-dash-status-card');
      if (statusCard) {
        if (joinedIncidents.length > 0) {
          // Trạng thái: Đang bận
          statusCard.innerHTML = `
            <div class="text-center text-danger">
                <i class='bx bx-error-circle' style="font-size: 3rem;"></i>
                <h3 class="mt-2 text-white bg-danger d-inline-block px-3 py-1 rounded">Đang làm nhiệm vụ</h3>
                <p class="text-muted mt-2">Bạn đang tham gia ${joinedIncidents.length} sự kiện khẩn cấp.</p>
            </div>
          `;
        } else if (invitedIncidents.length > 0) {
          // Trạng thái: Có lệnh triệu tập
          statusCard.innerHTML = `
            <div class="text-center text-warning">
                <i class='bx bxs-bell-ring' style="font-size: 3rem;"></i>
                <h3 class="mt-2 text-dark bg-warning d-inline-block px-3 py-1 rounded">Có Lệnh Triệu Tập</h3>
                <p class="text-muted mt-2">Vui lòng phản hồi yêu cầu điều động bên cạnh.</p>
            </div>
          `;
        } else {
          // Trạng thái: Sẵn sàng (Mặc định)
          statusCard.innerHTML = `
            <div class="text-center text-success">
                <i class='bx bx-check-circle' style="font-size: 3rem;"></i>
                <h3 class="mt-2 text-white bg-primary d-inline-block px-3 py-1 rounded">Sẵn sàng</h3>
                <p class="text-muted mt-2">Hiện không có nhiệm vụ khẩn cấp.</p>
            </div>
          `;
        }
      }

      // 4. HIỂN THỊ DANH SÁCH ALERTS BÊN PHẢI (Kết hợp code cũ của bạn)
      alertsContainer.innerHTML = '';

      if (joinedIncidents.length === 0 && invitedIncidents.length === 0) {
        alertsContainer.innerHTML =
          '<li class="list-group-item text-muted text-center py-3">Bạn chưa được phân công vào sự kiện nào đang hoạt động.</li>';
      } else {
        // Nhóm 1: Ưu tiên báo gọi triệu tập
        invitedIncidents.forEach((i) => {
          const li = document.createElement('li');
          li.className = 'list-group-item list-group-item-warning fw-bold py-3';

          // Mã hóa dữ liệu sự kiện để truyền vào hàm
          const incidentData = encodeURIComponent(JSON.stringify(i));

          li.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <span>📨 KÍCH HOẠT KHẨN CẤP: ${
                  window.escapeHtml?.(i.event_name) || 'Sự kiện khẩn cấp'
                }</span>
                <button onclick="simulateSidebarClick('page-tracking'); setTimeout(() => openDossierView('${jsAttr(incidentData)}'), 300);" class="btn btn-warning btn-sm fw-bold">
                    Phản hồi ngay
                </button>
            </div>`;
          alertsContainer.appendChild(li);
        });

        // Nhóm 2: Sự kiện đang tham gia
        joinedIncidents.forEach((i) => {
          const li = document.createElement('li');
          li.className = 'list-group-item list-group-item-danger fw-bold py-3';
          li.innerHTML = `
             <div class="d-flex justify-content-between align-items-center">
                <span>🚨 ĐANG THAM GIA: ${
                  window.escapeHtml?.(i.event_name) || 'Sự cố'
                }</span>
                <a href="#" onclick="simulateSidebarClick('page-tracking'); return false;" class="btn btn-danger btn-sm">Xem chi tiết</a>
            </div>`;
          alertsContainer.appendChild(li);
        });
      }
    } catch (err) {
      console.error('[renderUserDashboard] Lỗi:', err);
      alertsContainer.innerHTML =
        '<li class="list-group-item text-danger text-center">Lỗi tải dữ liệu.</li>';
    }
  };
  // ============================================================
  // 3. XỬ LÝ LỊCH TRỰC (ROSTERS) VÀ THÔNG BÁO DASHBOARD
  // ============================================================
  // Tôi tách hàm này ra để có thể tái sử dụng dễ dàng khi Supabase Realtime đẩy dữ liệu về
  window.renderRosterAlerts = function () {
    const alertsContainer = document.getElementById('user-dash-alerts');
    if (!alertsContainer) return;

    // Giữ lại phần thông báo Sự cố đã render trước đó
    // Dọn dẹp để vẽ lại phần Roster (Tùy chiến thuật giao diện của bạn, ở đây tôi nối tiếp vào)

    const rosters = window.appState.rosters || []; // Dữ liệu kéo từ Supabase (bảng roster_schedules & roster_assignments)

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const email = String(window.userSession?.email || '')
      .toLowerCase()
      .trim();

    const myShifts = rosters.filter((r) => {
      const rDate = rrtShared.parseFilterDate(r.duty_date); // Sử dụng parseFilterDate (có thể thay parseAnyDate nếu bạn thích)
      if (!rDate || isNaN(rDate.getTime())) return false;

      const rDateZero = new Date(rDate);
      rDateZero.setHours(0, 0, 0, 0);

      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);
      if (rDateZero.getTime() < threeDaysAgo.getTime()) return false;

      // Logic check assignments (Giả sử bạn đã fetch kèm roster_assignments)
      // Tùy thuộc vào câu truy vấn Supabase: select('*, roster_assignments(*)')
      const myAssignment = (r.roster_assignments || []).find(
        (a) =>
          a.user_id === window.userSession?.id ||
          (a.profiles && a.profiles.email === email)
      );

      if (!myAssignment) return false;

      if (myAssignment.assignment_status === 'declined') return false;

      if (myAssignment.assignment_status === 'confirmed') {
        r._myStatus = 'CONFIRMED';
        r._myAssignmentId = myAssignment.id;
        return true;
      } else if (myAssignment.assignment_status === 'assigned') {
        r._myStatus = 'PENDING';
        r._myAssignmentId = myAssignment.id;
        return true;
      }
      return false;
    });

    if (myShifts.length > 0) {
      myShifts.sort(
        (a, b) => rrtShared.parseFilterDate(a.duty_date) - rrtShared.parseFilterDate(b.duty_date)
      );

      myShifts.forEach((s) => {
        const dateObj = rrtShared.parseFilterDate(s.duty_date);
        const dateStr = dateObj
          ? dateObj.toLocaleDateString('vi-VN')
          : s.duty_date;

        let highlightClass = '';
        let badgeHtml = '';

        if (dateObj && dateObj.getTime() === tomorrow.getTime()) {
          highlightClass = 'list-group-item-warning';
          badgeHtml += '<span class="badge bg-danger ms-1">NGÀY MAI</span>';
        } else if (dateObj && dateObj.getTime() === today.getTime()) {
          highlightClass = 'list-group-item-success';
          badgeHtml += '<span class="badge bg-success ms-1">HÔM NAY</span>';
        }

        let statusBadge = '';
        let actionLink = '';

        if (s._myStatus === 'PENDING') {
          statusBadge =
            '<span class="badge bg-warning text-dark ms-1">Chờ xác nhận</span>';
          if (!highlightClass)
            highlightClass = 'border-warning border-start border-4';
          // Truyền _myAssignmentId thay vì r.calendar
          actionLink = ` <a href="#" onclick="openQuickResponseModal('${jsAttr(s._myAssignmentId)}', '${jsAttr(dateStr)}', '${jsAttr(s.team_name)}')" class="text-decoration-none small ms-2 fw-bold text-primary fst-italic">
          <i class='bx bx-edit'></i> Phản hồi ngay
        </a>`;
        } else {
          statusBadge = '<span class="badge bg-primary ms-1">Đã nhận</span>';
        }

        const li = document.createElement('li');
        li.className = `list-group-item ${highlightClass}`;
        li.innerHTML = `
          <div class="d-flex w-100 justify-content-between align-items-center">
              <div>
                  <i class='bx bx-calendar text-primary'></i> 
                  Lịch trực <b>${s.team_name}</b> 
                  ${badgeHtml} ${statusBadge}
                  ${actionLink}
              </div>
              <small class="text-muted fw-bold">${dateStr}</small>
          </div>
      `;
        alertsContainer.appendChild(li);
      });
    }

    if (alertsContainer.children.length === 0) {
      alertsContainer.innerHTML =
        '<li class="list-group-item text-muted text-center py-3">Không có thông báo mới.</li>';
    }
  };
  // ============================================================
  // HÀM ĐIỀU HƯỚNG TẮT & MODAL PHẢN HỒI
  // ============================================================
  window.openQuickResponseModal = function (assignmentId, dateStr, teamName) {
    const modalHtml = `
  <div class="modal fade" id="modal-quick-response" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content shadow">
        <div class="modal-header bg-light">
          <h5 class="modal-title">👮 Phản hồi Lịch trực định kỳ </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body text-center p-4">
          <h4 class="mb-3 text-primary">${teamName}</h4>
          <p class="mb-4">Bạn có lịch trực vào ngày <strong>${dateStr}</strong>.<br>Vui lòng xác nhận khả năng tham gia của bạn.</p>
          
          <div class="d-grid gap-2 d-sm-flex justify-content-sm-center">
            <button onclick="submitRosterResponse('${jsAttr(assignmentId)}', 'confirmed')" class="btn btn-success btn-lg px-4 gap-3">
              <i class='bx bx-check-circle'></i> TÔI THAM GIA
            </button>
            <button onclick="submitRosterResponse('${jsAttr(assignmentId)}', 'declined')" class="btn btn-outline-danger btn-lg px-4">
              <i class='bx bx-x-circle'></i> BÁO BẬN
            </button>
          </div>
          <div id="response-loading" class="mt-3 text-muted" style="display:none">
              <span class="spinner-border spinner-border-sm"></span> Đang xử lý...
          </div>
        </div>
      </div>
    </div>
  </div>
  `;

    const oldModal = document.getElementById('modal-quick-response');
    if (oldModal) oldModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const myModal = new bootstrap.Modal(
      document.getElementById('modal-quick-response')
    );
    myModal.show();
  };
  // Hàm gửi dữ liệu về Server (Đã sửa để dùng Core Function xịn sò của bạn)
  window.submitRosterResponse = async function (assignmentId, actionStatus) {
    const loading = document.getElementById('response-loading');
    const btns = document.querySelectorAll('#modal-quick-response button');

    if (loading) loading.style.display = 'block';
    btns.forEach((b) => (b.disabled = true));

    try {
      // Cập nhật trạng thái trực tiếp vào bảng roster_assignments
      const { error } = await supabaseClient
        .from('roster_assignments')
        .update({ assignment_status: actionStatus })
        .eq('id', assignmentId);

      if (error) throw error;

      // Đóng modal
      const el = document.getElementById('modal-quick-response');
      if (el) {
        const modal = bootstrap.Modal.getInstance(el);
        if (modal) modal.hide();
        el.remove();
      }

      showToast(
        actionStatus === 'confirmed'
          ? 'Đã xác nhận tham gia! ✅'
          : 'Đã báo bận lịch trực! ❌',
        'success'
      );

      // Tải lại dữ liệu Dashboard (Sẽ tự động cập nhật qua Realtime)
      if (typeof window.enterDashboard === 'function')
        await window.enterDashboard();
    } catch (err) {
      showToast('Lỗi cập nhật: ' + err.message, 'error');
    } finally {
      if (loading) loading.style.display = 'none';
      btns.forEach((b) => (b.disabled = false));
    }
  };
  /**
   * Hàm này giúp chuyển trang bằng cách giả lập cú click vào menu bên trái.
   * Dùng cho các nút "Xem ngay", "Bấm vào đây" ở Dashboard.
   */
  window.simulateSidebarClick = function (targetId) {
    const menuLink = document.querySelector(
      `#sidebar .side-menu li a[data-target="${targetId}"]`
    );
    if (menuLink) {
      menuLink.click();
    } else {
      if (typeof showSectionById === 'function') {
        showSectionById(targetId);
      } else {
        console.error('Lỗi: Hàm showSectionById chưa được định nghĩa.');
      }
    }
  };
  // ============================================================
  // PAGE-TEAM (BIỂU ĐỒ NĂNG LỰC)
  // ============================================================
  // Trong hàm load data chính
  window.loadAllData = async function () {
    try {
      // Load users
      const { data: users } = await supabaseClient
        .from('profiles')
        .select('id, email, full_name, team, position')
        .not('role', 'in', `(${window.LIMS_ONLY_ROLES.join(',')})`);

      // Load training
      await window.loadTrainingData();

      // Load deployment history
      const { data: deployments } = await supabaseClient
        .from('deployment_history')
        .select('*');

      // ✅ FIX: GỘP vào appState hiện có bằng spread {...window.appState, ...},
      // KHÔNG ghi đè nguyên cả object như trước. Trước đây dòng này thay thế
      // toàn bộ window.appState chỉ bằng {users, training, deployment_history},
      // xóa mất cờ appInitialized cùng các dữ liệu khác (incidents, map,
      // notifications...) -> khiến các nơi khác nghĩ dashboard "chưa init" và
      // tải lại từ đầu, góp phần gây race condition khi F5.
      window.appState = {
        ...window.appState,
        users: users || [],
        training: window.appState?.training || { courses: [], records: [] },
        deployment_history: deployments || [],
      };

      // Render charts
      if (typeof renderCompetencyChart === 'function') {
        renderCompetencyChart(window.appState.users);
      }
    } catch (err) {
      console.error('Lỗi load data:', err);
    }
  };
  async function renderCompetencyChart(filteredMembers) {
    console.group('🔍 renderCompetencyChartDebug - BẮT ĐẦU'); // Mở nhóm log

    // 1. LẤY DỮ LIỆU ĐẦU VÀO
    console.log('1. Dữ liệu đầu vào:');
    console.log('   - filteredMembers:', filteredMembers);
    console.log(
      '   - window.appState.training?.records:',
      window.appState?.training?.records
    );
    console.log(
      '   - window.appState.deployment_history:',
      window.appState?.deployment_history
    );

    if (!filteredMembers || !Array.isArray(filteredMembers)) {
      console.warn(
        '   - filteredMembers không hợp lệ, dùng mặc định window.appState.users'
      );
      filteredMembers = window.appState?.users || [];
    }
    console.log('   - filteredMembers sau khi xác định:', filteredMembers);

    const trainingRecords = window.appState?.training?.records || [];
    const deploymentHistory = window.appState?.deployment_history || [];

    console.log('   - Số lượng filteredMembers:', filteredMembers.length);
    console.log('   - Số lượng trainingRecords:', trainingRecords.length);
    console.log('   - Số lượng deploymentHistory:', deploymentHistory.length);

    // 2. KHỞI TẠO CẤU TRÚC TEAM
    console.log('\n2. Khởi tạo cấu trúc teams từ filteredMembers:');
    const teams = {};
    filteredMembers.forEach((m, index) => {
      const teamName = m.team || 'No team';
      if (!teams[teamName]) {
        console.log(`   - Tạo team mới: "${teamName}"`);
        teams[teamName] = { trained: 0, combat: 0, total: 0 };
      }
      teams[teamName].total++;
      // Log chi tiết nếu cần thiết
      // console.log(`   - Thành viên ${index} (${m.fullName || m.email}) -> team "${teamName}", total = ${teams[teamName].total}`);
    });
    console.log('   - Cấu trúc teams sau khi khởi tạo:', teams);

    // 3. XỬ LÝ TRAINING RECORDS
    console.log('\n3. Xử lý trainingRecords:');
    if (trainingRecords.length > 0) {
      const trainedByUser = {};
      console.log('   - Bắt đầu duyệt trainingRecords...');
      trainingRecords.forEach((r, index) => {
        if (r.result === 'pass') {
          const userId = r.profile_id || r.user_id;
          if (userId) {
            trainedByUser[userId] = (trainedByUser[userId] || 0) + 1;
            console.log(
              `   - Training record ${index}: userId="${userId}", result=pass -> trainedByUser["${userId}"] = ${trainedByUser[userId]}`
            );
          } else {
            console.warn(
              `   - Training record ${index}: Thiếu profile_id và user_id, bỏ qua.`
            );
          }
        } else {
          console.log(
            `   - Training record ${index}: result="${r.result}", bỏ qua.`
          );
        }
      });

      console.log(
        '   - Cập nhật số lượng trained vào teams từ filteredMembers:'
      );
      filteredMembers.forEach((m) => {
        const userId = m.id;
        const teamName = m.team || 'No team';
        if (teams[teamName] && trainedByUser[userId]) {
          teams[teamName].trained += trainedByUser[userId];
          console.log(
            `   - Team "${teamName}", userId="${userId}" -> trained += ${trainedByUser[userId]} (total now: ${teams[teamName].trained})`
          );
        } else {
          // Có thể log nếu không match, nhưng có thể nhiều
          // console.log(`   - Team "${teamName}", userId="${userId}" -> không có training match hoặc trainedByUser[userId]=${trainedByUser[userId]}`);
        }
      });
    } else {
      console.log('   - Danh sách trainingRecords rỗng, bỏ qua.');
    }

    // 4. XỬ LÝ DEPLOYMENT HISTORY
    console.log('\n4. Xử lý deploymentHistory:');
    if (deploymentHistory.length > 0) {
      const deployedByUser = {};
      console.log('   - Bắt đầu duyệt deploymentHistory...');
      deploymentHistory.forEach((h, index) => {
        const isValidForCombat =
          (h.action_type === 'deployed' || h.action_type === 'replace_in') &&
          h.confirmed_at &&
          h.incident_id;
        const userId = h.profile_id || h.user_id;

        if (isValidForCombat) {
          if (userId) {
            deployedByUser[userId] = (deployedByUser[userId] || 0) + 1;
            console.log(
              `   - Deployment record ${index}: userId="${userId}", valid -> deployedByUser["${userId}"] = ${deployedByUser[userId]}`
            );
          } else {
            console.warn(
              `   - Deployment record ${index}: Hợp lệ nhưng thiếu profile_id và user_id, bỏ qua.`,
              h
            );
          }
        } else {
          console.log(
            `   - Deployment record ${index}: Không hợp lệ (action_type:${
              h.action_type
            }, confirmed_at:${!!h.confirmed_at}, incident_id:${!!h.incident_id}), bỏ qua.`,
            h
          );
        }
      });

      console.log(
        '   - Cập nhật số lượng combat vào teams từ filteredMembers:'
      );
      filteredMembers.forEach((m) => {
        const userId = m.id;
        const teamName = m.team || 'No team';
        if (teams[teamName] && deployedByUser[userId]) {
          teams[teamName].combat += deployedByUser[userId];
          console.log(
            `   - Team "${teamName}", userId="${userId}" -> combat += ${deployedByUser[userId]} (total now: ${teams[teamName].combat})`
          );
        } else {
          // Có thể log nếu không match, nhưng có thể nhiều
          // console.log(`   - Team "${teamName}", userId="${userId}" -> không có deployment match hoặc deployedByUser[userId]=${deployedByUser[userId]}`);
        }
      });
    } else {
      console.log('   - Danh sách deploymentHistory rỗng, bỏ qua.');
    }

    // 5. TÍNH TRUNG BÌNH
    console.log('\n5. Tính trung bình theo team:');
    const categories = Object.keys(teams).sort();
    const dataTrained = [];
    const dataCombat = [];

    categories.forEach((team) => {
      const stat = teams[team];
      const avgTrained =
        stat.total > 0 ? parseFloat((stat.trained / stat.total).toFixed(1)) : 0;
      const avgCombat =
        stat.total > 0 ? parseFloat((stat.combat / stat.total).toFixed(1)) : 0;
      dataTrained.push(avgTrained);
      dataCombat.push(avgCombat);
      console.log(
        `   - Team "${team}": total=${stat.total}, trained=${stat.trained}, combat=${stat.combat} -> avgTrained=${avgTrained}, avgCombat=${avgCombat}`
      );
    });

    // 6. KIỂM TRA CÓ DỮ LIỆU HIỂN THỊ KHÔNG
    const hasData =
      dataTrained.some((v) => v > 0) || dataCombat.some((v) => v > 0);
    console.log('\n6. Kiểm tra dữ liệu để hiển thị:');
    console.log('   - dataTrained:', dataTrained);
    console.log('   - dataCombat:', dataCombat);
    console.log('   - hasData (dữ liệu > 0):', hasData);

    // 7. RENDER
    const chartContainer = document.getElementById('competencyChartAP');
    if (!chartContainer) {
      console.error('❌ Container #competencyChartAP không tìm thấy!');
      console.groupEnd(); // Đóng nhóm log
      return;
    }

    if (!hasData) {
      console.log('   - Không có dữ liệu, hiển thị thông báo trống.');
      chartContainer.innerHTML = `
            <p class="text-center text-muted" style="padding: 50px 20px;">
                📊 <strong>Chưa có dữ liệu năng lực.</strong><br><br>
                <small>Hệ thống cần có:<br>
                • Dữ liệu tham gia đào tạo, tập huấn<br>
                • Dữ liệu tham gia sự kiện kích hoạt khẩn cấp</small>
            </p>`;
      console.groupEnd(); // Đóng nhóm log
      return;
    }

    console.log('   - Có dữ liệu, chuẩn bị vẽ biểu đồ.');
    if (typeof Highcharts === 'undefined') {
      console.error('❌ Thư viện Highcharts chưa được tải!');
      chartContainer.innerHTML =
        '<p class="text-danger">Thư viện biểu đồ chưa được tải.</p>';
      console.groupEnd(); // Đóng nhóm log
      return;
    }

    console.log('   - Gọi Highcharts.chart...');
    Highcharts.chart('competencyChartAP', {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        style: { fontFamily: "'Ubuntu', sans-serif" },
      },
      title: {
        text: 'Năng lực Trung bình theo Đội (Đào tạo vs Thực chiến)',
        style: { fontSize: '16px', fontWeight: 'bold' },
      },
      subtitle: { text: 'Chỉ số trung bình trên mỗi thành viên' },
      xAxis: {
        categories: categories,
        crosshair: true,
        labels: { style: { fontSize: '12px' } },
      },
      yAxis: {
        min: 0,
        title: { text: 'Số lượng (Avg)', style: { color: '#666' } },
        labels: { style: { fontSize: '11px' } },
      },
      tooltip: {
        shared: true,
        headerFormat: '<b>{point.x}</b><br/>',
        pointFormat: '{series.name}: <b>{point.y}</b>{point.suffix}',
      },
      legend: {
        layout: 'horizontal',
        align: 'center',
        verticalAlign: 'bottom',
        x: 0,
        y: 0,
        floating: false,
        backgroundColor: 'rgba(255,255,255,0.9)',
        itemStyle: { fontSize: '12px' },
      },
      plotOptions: {
        column: {
          borderRadius: 6,
          dataLabels: {
            enabled: true,
            style: { fontSize: '11px', fontWeight: 'bold' },
          },
          pointPadding: 0.2,
          groupPadding: 0.1,
        },
      },
      series: [
        {
          name: '📚 Đào tạo (chứng chỉ/người)',
          data: dataTrained.map((v, i) => ({
            y: v,
            suffix: ' khóa',
          })),
          color: 'rgba(54, 162, 235, 0.85)',
        },
        {
          name: '⚡ Thực chiến (lần tham gia/người)',
          data: dataCombat.map((v, i) => ({
            y: v,
            suffix: ' lần',
          })),
          color: 'rgba(255, 99, 132, 0.85)',
        },
      ],
      credits: { enabled: false },
    });

    console.log('✅ Competency chart đã được render thành công.');
    console.groupEnd(); // Đóng nhóm log
  }

  // Gọi hàm mới để kiểm tra
  // renderCompetencyChartDebug(window.appState?.users);

  window.updateKpiCards = async function () {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      sevenDaysLater.setHours(23, 59, 59, 999);

      console.log('📊 Updating KPI Cards...');

      // 🚨 1. THÊM LOGIC PHÂN QUYỀN ĐỂ ĐẾM ĐÚNG NGƯỜI
      const role = (window.userSession?.role || '').toLowerCase();
      const isWardAdmin = role === 'ward_admin';
      const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();

      const formatNameList = (arr) => {
        if (!arr || arr.length === 0) return 'Chưa có dữ liệu';
        const unique = [...new Set(arr)].filter(Boolean);
        if (unique.length === 0) return 'Chưa có dữ liệu';
        if (unique.length <= 2) return unique.join(', ');
        return `${unique[0]}, ${unique[1]} và ${unique.length - 2} người khác`;
      };

      const setHtml = (selector, value) => {
        const el = $(selector);
        if (el.length) el.html(value);
      };

      // ===========================================
      // 1. FETCH TẤT CẢ PROFILES ĐỂ MAP TÊN VÀ LỌC LÍNH
      // ===========================================
      let profileQuery = window.supabaseClient
        .from('profiles')
        .select('id, email, full_name, workplace_ma_xa')
        .not('role', 'in', `(${window.LIMS_ONLY_ROLES.join(',')})`);

      // WARD ADMIN: Chỉ kéo danh sách lính của phường mình
      if (isWardAdmin && myMaXa) {
        profileQuery = profileQuery.eq('workplace_ma_xa', myMaXa);
      }

      const { data: allProfiles } = await profileQuery;
      const profiles = allProfiles || [];
      const validUserIds = profiles.map((p) => p.id);
      const validEmails = profiles.map((p) =>
        String(p.email || '')
          .toLowerCase()
          .trim()
      );

      const getNameById = (id) => {
        const p = profiles.find((x) => x.id === id);
        return p ? p.full_name || p.email : 'Ẩn danh';
      };

      const getNameByEmail = (email) => {
        if (!email) return '';
        const p = profiles.find(
          (x) => String(x.email).toLowerCase() === String(email).toLowerCase()
        );
        return p ? p.full_name || p.email : email;
      };

      // ===========================================
      // 2. KPI LỊCH TRỰC (ROSTER ASSIGNMENTS)
      // ===========================================
      const { data: assignmentsData, error: rErr } = await window.supabaseClient
        .from('roster_assignments')
        .select(
          `assignment_status, user_id, roster_schedules!inner (duty_date, team_name)`
        )
        .gte('roster_schedules.duty_date', today.toISOString())
        .lte('roster_schedules.duty_date', sevenDaysLater.toISOString());

      if (rErr) console.warn('⚠️ Lỗi tải roster_assignments:', rErr);

      let rosterItems = assignmentsData || [];

      // LỌC KPI: Ward Admin chỉ đếm lịch trực của nhân sự trạm mình
      if (isWardAdmin) {
        rosterItems = rosterItems.filter((r) =>
          validUserIds.includes(r.user_id)
        );
      }

      let rConfNames = [],
        rDecNames = [],
        rPendNames = [];
      let activeTeams = new Set();

      rosterItems.forEach((r) => {
        const name = getNameById(r.user_id);
        if (r.roster_schedules?.team_name)
          activeTeams.add(r.roster_schedules.team_name);

        if (r.assignment_status === 'confirmed') rConfNames.push(name);
        else if (r.assignment_status === 'declined') rDecNames.push(name);
        else rPendNames.push(name);
      });

      const rTotal = rosterItems.length;

      // ===========================================
      // 3. KPI KÍCH HOẠT KHẨN CẤP (INCIDENTS)
      // ===========================================
      const { data: incidentsData, error: incidentsErr } =
        await window.supabaseClient
          .from('incidents')
          .select(
            'id, event_name, activation_time, members, initial_selected_members, declined_members'
          )
          .gte('activation_time', today.toISOString())
          .lte('activation_time', sevenDaysLater.toISOString());

      if (incidentsErr) console.warn('⚠️ Lỗi tải incidents:', incidentsErr);

      let incidents = incidentsData || [];

      // LỌC SỰ KIỆN GIỐNG TRÊN BẢN ĐỒ: Chỉ tính sự kiện phường mình hoặc có lính mình bị gọi
      if (isWardAdmin) {
        incidents = incidents.filter((inc) => {
          const isMyWard =
            myMaXa !== '' && String(inc.ma_xa || '').trim() === myMaXa;
          const rawCalled = String(
            inc.initial_selected_members || ''
          ).toLowerCase();
          const isMyStaffCalled = validEmails.some((email) =>
            rawCalled.includes(email)
          );
          return isMyWard || isMyStaffCalled;
        });
      }

      let iConfNames = [],
        iDecNames = [],
        iPendNames = [];
      let latestActivation = 'Chưa có sự kiện';

      if (incidents.length > 0) {
        const sortedIncidents = [...incidents].sort(
          (a, b) => new Date(b.activation_time) - new Date(a.activation_time)
        );
        const latestTime = new Date(sortedIncidents[0].activation_time);
        latestActivation = `Gần nhất: ${latestTime.toLocaleTimeString(
          'vi-VN'
        )} ${latestTime.toLocaleDateString('vi-VN')}`;

        // 🚨 THUẬT TOÁN ĐẾM KPI MỚI: Bọc lót mọi định dạng chuỗi
        incidents.forEach((inc) => {
          const called = String(inc.initial_selected_members || '')
            .split(/[,;\s\n]+/)
            .map((e) => e.replace(/[<>]/g, '').trim().toLowerCase())
            .filter(Boolean);
          const confirmed = String(inc.members || '')
            .split(/[,;\s\n]+/)
            .map((e) => e.replace(/[<>]/g, '').trim().toLowerCase())
            .filter(Boolean);
          const declined = String(inc.declined_members || '')
            .split(/[,;\s\n]+/)
            .map((e) => e.replace(/[<>]/g, '').trim().toLowerCase())
            .filter(Boolean);

          // Hàm phụ: Đảm bảo Ward Admin chỉ xem thông số KPI của LÍNH MÌNH (Không đếm nhầm người phường khác đi hỗ trợ cùng)
          const filterMyStaff = (email) =>
            !isWardAdmin || validEmails.includes(email);

          confirmed
            .filter(filterMyStaff)
            .forEach((email) => iConfNames.push(getNameByEmail(email)));
          declined
            .filter(filterMyStaff)
            .forEach((email) => iDecNames.push(getNameByEmail(email)));

          // PENDING = Số người Bị Gọi trừ đi (Số người Xác Nhận + Số người Từ Chối)
          called.filter(filterMyStaff).forEach((email) => {
            if (!confirmed.includes(email) && !declined.includes(email)) {
              iPendNames.push(getNameByEmail(email));
            }
          });
        });
      }

      // ===========================================
      // 4. BƠM DỮ LIỆU VÀO GIAO DIỆN HTML (DOM)
      // ===========================================
      setHtml('#schedule-total-count', rTotal);
      setHtml('#schedule-confirmed-count', rConfNames.length);
      setHtml('#schedule-declined-count', rDecNames.length);
      setHtml('#schedule-pending-count', rPendNames.length);

      const dateRangeText = `${today.getDate()}/${
        today.getMonth() + 1
      } - ${sevenDaysLater.getDate()}/${sevenDaysLater.getMonth() + 1}`;
      setHtml('#schedule-dates-info', dateRangeText);
      setHtml(
        '#schedule-dates-team',
        activeTeams.size > 0
          ? Array.from(activeTeams).join(', ')
          : 'Chưa xếp đội'
      );

      setHtml('#schedule-confirmed-members', formatNameList(rConfNames));
      setHtml('#schedule-declined-members', formatNameList(rDecNames));
      setHtml('#schedule-pending-members', formatNameList(rPendNames));

      setHtml('#emergency-activations-count', incidents.length);
      setHtml('#emergency-confirmed-count', iConfNames.length);
      setHtml('#emergency-declined-count', iDecNames.length);
      setHtml('#emergency-pending-count', iPendNames.length);

      setHtml('#emergency-times-info', latestActivation);
      setHtml('#emergency-confirmed-members', formatNameList(iConfNames));
      setHtml('#emergency-declined-members', formatNameList(iDecNames));
      setHtml('#emergency-pending-members', formatNameList(iPendNames));

      // TRẢ LẠI HÀM NÀY ĐỂ CÁC THẺ KPI (BẢNG TRỰC, SỰ KIỆN) CÓ HIỆU ỨNG NHẢY SỐ
      if (typeof handleCounterAnimation === 'function') {
        handleCounterAnimation();
      }
    } catch (error) {
      console.error('❌ Lỗi updateKpiCards:', error);
      if (typeof showToast === 'function')
        showToast('Lỗi cập nhật Dashboard: ' + error.message, 'error');
    }
  }; // <--- KẾT THÚC HÀM updateKpiCards Ở ĐÂY
  // KHAI BÁO HÀM ĐẾM VIEW ĐỘC LẬP
  window.handleCounterAnimation = function () {
    // Nếu có hàm animateCounters từ thư viện ngoài thì dùng
    if (typeof animateCounters === 'function') {
      animateCounters();
      return;
    }

    // Mở rộng vùng quét: Tìm h3, h4 trong .card, HOẶC các thẻ ID kết thúc bằng "-count"
    $('.card h3, .card h4, [id$="-count"]').each(function () {
      const $this = $(this);
      const val = parseInt($this.text().replace(/\./g, ''));

      // Điều kiện 1: Phải là một số hợp lệ lớn hơn 0
      // Điều kiện 2: Tránh animate lại nếu con số KHÔNG THAY ĐỔI (chống giật lag khi realtime)
      if (!isNaN(val) && val > 0 && $this.data('current-val') !== val) {
        // Lưu lại giá trị mục tiêu để lần cập nhật sau biết đường đối chiếu
        $this.data('current-val', val);

        $({ Counter: 0 }).animate(
          { Counter: val },
          {
            duration: 1000, // Thời gian chạy hiệu ứng (1 giây)
            easing: 'swing',
            step: function (now) {
              $this.text(Math.ceil(now));
            },
          }
        );
      }
    });
  };
  function animateCounters() {
    $('.box-info h3').each(function () {
      const $this = $(this);
      const countTo = parseInt($this.text());
      $({ countNum: 0 }).animate(
        {
          countNum: countTo,
        },
        {
          duration: 1000,
          easing: 'swing',
          step: function () {
            $this.text(Math.floor(this.countNum));
          },
          complete: function () {
            $this.text(this.countNum);
          },
        }
      );
    });
  }
  window.renderWebViewCount = async function () {
    try {
      const $viewBadge = $('#web-view-count');
      if (!$viewBadge.length) return;

      // 🚀 GỌI HÀM RPC TRÊN SUPABASE
      const { data: currentViews, error } = await window.supabaseClient.rpc(
        'increment_page_view'
      );

      if (error) {
        console.error('Lỗi từ Supabase RPC:', error.message);
        throw error;
      }

      // 🎯 Chạy hiệu ứng nhảy số
      $({ Counter: 0 }).animate(
        { Counter: currentViews || 0 },
        {
          duration: 1500,
          easing: 'swing',
          step: function (now) {
            $viewBadge.text(Math.ceil(now).toLocaleString('vi-VN'));
          },
        }
      );
    } catch (err) {
      console.warn('⚠️ Lỗi đếm lượt truy cập:', err);
      $('#web-view-count').text('---');
    }
  };

  // 🚨 KÍCH HOẠT HÀM NGAY KHI TRANG WEB TẢI XONG
  $(document).ready(function () {
    if (typeof window.renderWebViewCount === 'function') {
      window.renderWebViewCount();
    }
  });
  // ========================================================================
  // AUTO-REFRESH KPI (Mỗi 30 giây, tạm dừng khi tab bị ẩn để đỡ tốn
  // request/pin khi người dùng chuyển sang tab khác)
  // ========================================================================
  if (window._kpiInterval) clearInterval(window._kpiInterval);
  window._kpiInterval = setInterval(() => {
    if (document.hidden) return;
    if (typeof window.updateKpiCards === 'function') {
      window.updateKpiCards();
    }
  }, 30000);

  // Chạy lần đầu khi DOM ready
  $(document).ready(function () {
    if (typeof window.updateKpiCards === 'function') {
      window.updateKpiCards();
    }
  });

  // ==========================================
  // XỬ LÝ SỰ KIỆN ENTER CHO CHAT
  // ==========================================
  $(document).ready(function () {
    $('#inp-chat').on('keypress', function (e) {
      if (e.which === 13) {
        e.preventDefault();
        if (typeof window.sendDossierMessage === 'function') {
          window.sendDossierMessage('Message');
        }
      }
    });
  });
});
