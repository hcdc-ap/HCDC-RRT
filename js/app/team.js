// ============================================================
// PAGE-DATATABLE & PAGE-TEAM — Bảng hồ sơ, bảng đội, phân tích đào tạo
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // Chia sẻ cho các file js/app/* khác (trước đây dùng chung 1 closure)
  Object.defineProperty(rrtShared, 'dataTableInstance', {
    get: () => dataTableInstance,
    configurable: true,
  });
  rrtShared.renderTrainingAnalytics = renderTrainingAnalytics;


  // ============================================================
  // PAGE-DATATABLE
  // ============================================================
  /**
   * (ĐÃ TỐI ƯU VÀ SỬA LỖI SPINNER) Hiển thị bảng RRT Form từ dữ liệu bảng profiles
   */
  window.renderRRTTable = async function () {
    // Bật Loading nội bộ ngay từ đầu
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {
      // =========================================================
      // 1. KIỂM TRA SESSION
      // =========================================================
      const { data: authData, error: authErr } =
        await window.supabaseClient.auth.getUser();

      if (authErr || !authData?.user) {
        console.warn('⚠️ User chưa đăng nhập.');
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
        return;
      }

      const isAdmin = window.isUserAdmin?.() || false;
      const isWardAdmin =
        (window.userSession?.role || '').toLowerCase() === 'ward_admin';
      // =========================================================
      // 2. TẢI DỮ LIỆU TỪ SUPABASE - CHỈ LẤY CỘT CẦN THIẾT
      // =========================================================
      const { data, error } = await window.supabaseClient
        .from('profiles')
        .select(
          `
          id, email, full_name, phone, role, team, position,
          department, deployment_status, approval_status,
          updated_at, created_at, workplace_ward, fax
        `
        )
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // ✅ FIX: Dùng filterDataByRole với biến ĐÚNG (data, không phải profilesRes)
      const filteredProfiles = window.filterDataByRole(data || []);

      window.appState = window.appState || {};
      window.appState.profiles = filteredProfiles;
      const profilesData = filteredProfiles;

      console.log(
        `✅ Loaded ${profilesData.length} profiles (Admin: ${isAdmin})`
      );

      // =========================================================
      // 4. XỬ LÝ GIAO DIỆN BẢNG (DATATABLES)
      // =========================================================
      // Hủy DataTable cũ nếu tồn tại
      if (
        typeof window.dataTableInstance !== 'undefined' &&
        window.dataTableInstance
      ) {
        window.dataTableInstance.destroy();
        $('#report-table tbody').empty();
      }

      // Kiểm tra dữ liệu rỗng
      if (profilesData.length === 0) {
        $('#report-table tbody').html(
          '<tr><td colspan="10" class="text-center text-muted p-3">Chưa có hồ sơ RRT nào.</td></tr>'
        );
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
        return;
      }

      // Hàm tiện ích cho Status
      const getStatusUI = (status) => {
        let text = 'Chờ duyệt',
          badgeClass = 'bg-warning text-dark';
        if (status === 'approved') {
          text = 'Đã duyệt';
          badgeClass = 'bg-success';
        } else if (status === 'edit') {
          text = 'Yêu cầu sửa';
          badgeClass = 'bg-danger';
        }
        return { text, badgeClass };
      };

      // Chuẩn bị dữ liệu cho DataTables
      const dataForTable = profilesData.map((profile, i) => {
        const recordId = profile.id;
        const status = profile.approval_status || 'pending';
        const statusUI = getStatusUI(status);

        // === Cột Status ===
        const statusCol = isAdmin
          ? `
           <select class="form-select form-select-sm update-status"
               data-report-id="${recordId}"
               onchange="window.updateApprovalStatus('${jsAttr(recordId)}', this.value)">
               <option value="pending" ${
                 status === 'pending' ? 'selected' : ''
               }>Chờ duyệt</option>
               <option value="edit" ${
                 status === 'edit' ? 'selected' : ''
               }>Yêu cầu sửa</option>
               <option value="approved" ${
                 status === 'approved' ? 'selected' : ''
               }>Đã duyệt</option>
           </select>`
          : isWardAdmin
          ? `
           <select class="form-select form-select-sm update-status"
               data-report-id="${recordId}"
               onchange="window.updateApprovalStatus('${jsAttr(recordId)}', this.value)">
               <option value="pending" ${
                 status === 'pending' ? 'selected' : ''
               }>Chờ duyệt</option>
               <option value="approved" ${
                 status === 'approved' ? 'selected' : ''
               }>Đã duyệt</option>
           </select>`
          : `<span class="badge ${statusUI.badgeClass}">${statusUI.text}</span>`;

        // === Cột Actions ===
        const actions = isAdmin
          ? `<div class="d-flex justify-content-around">
             <i class="bx bx-show bx-sm text-primary" onclick="viewReport('${jsAttr(recordId)}')" style="cursor:pointer;" title="Xem/Sửa hồ sơ"></i>
             <i class="bx bx-trash bx-sm text-danger" onclick="window.deleteProfile('${jsAttr(recordId)}', '${
              jsAttr(profile.full_name)
            }')" style="cursor:pointer;" title="Xóa"></i>
           </div>`
          : `<div class="text-center"><i class="bx bx-show bx-sm text-primary" onclick="viewReport('${jsAttr(recordId)}')" style="cursor:pointer;" title="Xem hồ sơ"></i></div>`;

        // Xử lý an toàn các giá trị null/undefined
        const dateText =
          profile.updated_at || profile.created_at
            ? new Date(
                profile.updated_at || profile.created_at
              ).toLocaleDateString('vi-VN')
            : 'N/A';
        const nameText = profile.full_name || 'N/A';
        const deptText = profile.department || '';

        // === Trả về mảng dữ liệu cho hàng ===
        return [
          i + 1,
          `<small class="text-muted">${recordId.substring(0, 8)}...</small>`,
          dateText,
          `<b>${
            window.escapeHtml?.(nameText) || nameText
          }</b><br><small class="text-muted">${
            window.escapeHtml?.(deptText) || deptText
          }</small>`,
          profile.phone || 'N/A',
          statusCol,
          profile.deployment_status ||
            '<span class="badge bg-secondary">Chưa rõ</span>',
          profile.resume_url
            ? `<a href="${profile.resume_url}" target="_blank" class="btn btn-sm btn-outline-primary"><i class='bx bx-link'></i> Tệp</a>`
            : '<span class="text-muted small">Không có</span>',
          actions,
        ];
      });

      // Khởi tạo DataTable
      window.dataTableInstance = $('#report-table').DataTable({
        data: dataForTable,
        destroy: true,
        responsive: true,
        columns: [
          { title: 'TT', width: '3%' },
          { title: 'Mã RRT', width: '7%' },
          { title: 'Ngày cập nhật', width: '10%' },
          { title: 'Họ Tên / Đơn vị' },
          { title: 'Số điện thoại', width: '10%' },
          { title: 'Phê duyệt', width: '12%' },
          { title: 'Điều động', width: '10%' },
          {
            title: 'Đính kèm',
            width: '8%',
            orderable: false,
            className: 'text-center',
          },
          {
            title: 'Hành động',
            width: '8%',
            orderable: false,
            className: 'text-center',
          },
        ],
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
      });
    } catch (err) {
      console.error('Lỗi khi lấy dữ liệu hồ sơ hoặc khởi tạo bảng:', err);
      if (typeof showToast === 'function') {
        showToast('Không thể tải danh sách hồ sơ: ' + err.message, 'error');
      }
    } finally {
      // Luôn luôn tắt vòng xoay loading ở cuối cùng
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // --- HÀM PHỤ TRỢ: Cập nhật Trạng thái phê duyệt ---
  window.updateApprovalStatus = async function (id, newStatus) {
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);
    try {
      const { error } = await supabaseClient
        .from('profiles')
        .update({ approval_status: newStatus })
        .eq('id', id);

      if (error) throw error;
      showToast('Đã cập nhật trạng thái hồ sơ.', 'success');
    } catch (err) {
      console.error('Lỗi cập nhật status:', err);
      showToast('Lỗi cập nhật: ' + err.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };
  // =========================
  // PAGE-TEAM (Tự chủ dữ liệu Supabase)
  // =========================
  // ==========================================
  // BIẾN TOÀN CỤC VÀ HÀM LỌC DATATABLE
  // ==========================================
  let dataTableInstance = null;
  let teamAndDateFilterFn = null;

  function applyTeamAndDateFilter(selectedTeams, startDate, endDate) {
    // Xóa bộ lọc cũ để tránh bị chồng chéo
    if (teamAndDateFilterFn) {
      const idx = $.fn.dataTable.ext.search.indexOf(teamAndDateFilterFn);
      if (idx > -1) $.fn.dataTable.ext.search.splice(idx, 1);
    }

    // Chuẩn hóa danh sách đội chọn thành mảng an toàn
    const teamArray = Array.isArray(selectedTeams)
      ? selectedTeams
      : [selectedTeams];
    const isTeamFiltering =
      teamArray.length > 0 &&
      !teamArray.includes('all') &&
      !teamArray.includes('');
    const isDateFiltering = startDate || endDate;

    if (!isTeamFiltering && !isDateFiltering) {
      if (dataTableInstance) dataTableInstance.draw();
      return;
    }

    // Chuyển ngày thành timestamp để so sánh khoảng thời gian
    const from = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : 0;
    const to = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;

    teamAndDateFilterFn = function (settings, data, dataIndex) {
      if (settings.nTable.id !== 'team-table') return true;

      // Lấy trực tiếp object dữ liệu gốc của dòng thông qua dataIndex (Không cần quét HTML)
      const record = window.currentScopedTeamData?.[dataIndex];
      if (!record) return true;

      // 1. LỌC THEO ĐỘI
      let passTeam = true;
      if (isTeamFiltering) {
        const teamName = record.team ? String(record.team).trim() : 'No team';
        passTeam = teamArray.includes(teamName);
      }

      // 2. LỌC THEO NGÀY CẬP NHẬT
      let passDate = true;
      if (isDateFiltering) {
        const dateSource = record.updated_at || record.created_at;
        if (!dateSource) {
          passDate = false;
        } else {
          const rowTime = new Date(dateSource).getTime();
          passDate = rowTime >= from && rowTime <= to;
        }
      }

      return passTeam && passDate;
    };

    // Đẩy hàm lọc vào hệ thống DataTable và vẽ lại bảng
    $.fn.dataTable.ext.search.push(teamAndDateFilterFn);
    if (dataTableInstance) dataTableInstance.draw();
  }
  // ==========================================
  // GẮN SỰ KIỆN CHO CÁC NÚT LỌC VÀ CẬP NHẬT
  // ==========================================

  // 1. Nút Lọc (Team + Date)
  $('#btn-filter-team, #filter-btn')
    .off('click')
    .on('click', function () {
      const startDate = $('#filter-date-start-team').val();
      const endDate = $('#filter-date-end-team').val();

      // 🎯 Ép kiểu cực kỳ an toàn: Dù Select2 trả về chuỗi hay mảng thì selectedTeams vẫn luôn LÀ MẢNG
      const rawTeamVal = $('#filter-team-select').val();
      const selectedTeams = Array.isArray(rawTeamVal)
        ? rawTeamVal
        : rawTeamVal
        ? [rawTeamVal]
        : [];

      console.log(
        '🔍 Dữ liệu lọc Team:',
        selectedTeams,
        '| Từ ngày:',
        startDate,
        '| Đến ngày:',
        endDate
      );

      // Gọi hàm lọc DataTable
      if (typeof applyTeamAndDateFilter === 'function') {
        applyTeamAndDateFilter(selectedTeams, startDate, endDate);
      }

      // Lọc biểu đồ (Dùng dữ liệu từ appState)
      let chartData = window.appState?.teamData || [];
      if (selectedTeams.length > 0 && !selectedTeams.includes('all')) {
        chartData = chartData.filter((m) =>
          selectedTeams.includes(m.team || 'No team')
        );
      }

      // Vẽ lại biểu đồ với data đã lọc
      if (typeof renderAnalytics_Member === 'function') {
        renderAnalytics_Member(chartData, startDate, endDate, selectedTeams);
      }
    });

  // 2. Nút Xóa Lọc
  $('#btn-clear-filter-team, #btn-clear-team-filter')
    .off('click')
    .on('click', function () {
      $('#filter-date-start-team').val('');
      $('#filter-date-end-team').val('');
      $('#filter-team-select').val('all').trigger('change'); // trigger để select2 (nếu có) update

      applyTeamAndDateFilter([], null, null);

      if (typeof renderAnalytics_Member === 'function') {
        renderAnalytics_Member(window.appState.teamData || [], null, null);
      }
    });

  // 3. Nút So Sánh (Thực chất là kích hoạt lại Lọc)
  $('#btn-compare-teams')
    .off('click')
    .on('click', function () {
      $('#btn-filter-team').click();
    });

  // ------------------------------------------
  // CẬP NHẬT ĐỘI & VỊ TRÍ TRỰC TIẾP TRÊN BẢNG
  // ------------------------------------------
  $('#team-table').off('change', '.update-team, .update-position');
  $('#team-table').on('change', '.update-team, .update-position', function () {
    const $tr = $(this).closest('tr');

    // ĐÃ FIX: Lấy data-id thay vì data-username
    const userId = $(this).data('id') || $tr.find('.update-team').data('id');

    const newTeam = $tr.find('.update-team').val() || '';
    const newPos = $tr.find('.update-position').val() || '';

    if (typeof updateTeamData === 'function') {
      updateTeamData(userId, newTeam, newPos, $tr, dataTableInstance);
    }
  });
  // (Handler .update-team-ward/.update-position-ward được gắn trong
  //  renderTeamTable — bản cũ ở đây luôn bị .off() gỡ và dùng biến không tồn tại.)
  // Cầu nối giúp menu sidebar nhận diện được trang Team
  // ============================================================================
  // 1. HÀM TIỆN ÍCH DÙNG CHUNG TOÀN CỤC (GLOBAL HELPERS)
  // ============================================================================
  window.getAllAvailableTeams = function (role, userWorkplaceMaXa) {
    const teamData = window.appState?.teamData || [];
    let baseTeams = Array.from({ length: 10 }, (_, n) => `Team ${n + 1}`);
    const allDatabaseTeams = [
      ...new Set(
        teamData.map((m) => m.team).filter((t) => t && t !== 'No team')
      ),
    ];

    if (role === 'ward_admin') {
      const myMaXa = String(userWorkplaceMaXa || '').trim();
      const gu = ['trạm y tế phường/xã/ đặc khu', 'ubnd phường/xã/ đặc khu'];
      const wardMembers = teamData.filter((m) => {
        const mMaXa = String(m.workplace_ma_xa || '').trim();
        const mFax = String(m.fax || '')
          .toLowerCase()
          .trim();
        return myMaXa && mMaXa === myMaXa && gu.includes(mFax);
      });
      const wardTeams = [
        ...new Set(
          wardMembers.map((m) => m.team).filter((t) => t && t !== 'No team')
        ),
      ];
      return wardTeams.sort();
    } else {
      // Admin: Gộp toàn bộ Team 1-10 và TẤT CẢ các đội tuyến phường phát sinh trong data
      const combined = [...new Set([...baseTeams, ...allDatabaseTeams])];
      return combined.sort();
    }
  };

  // Đội của nhân sự Trạm Y tế / UBND xã phải theo mẫu "Team <xã công tác> NN"
  // (database chặn tên khác — migration 20261002050000_rrt_ward_team_naming)
  const GRASSROOTS_UNITS = ['trạm y tế phường/xã/ đặc khu', 'ubnd phường/xã/ đặc khu'];
  window.isGrassrootsMember = (m) =>
    GRASSROOTS_UNITS.includes(String(m?.fax || '').toLowerCase().trim());
  window.wardTeamsFor = function (ward) {
    const w = String(ward || '').trim();
    if (!w) return [];
    const prefix = `Team ${w} `;
    return [
      ...new Set(
        (window.appState?.teamData || [])
          .map((m) => String(m.team || ''))
          .filter((t) => t.startsWith(prefix) && /^\d{2,3}$/.test(t.slice(prefix.length)))
      ),
    ].sort();
  };
  window.nextWardTeamName = function (ward) {
    let maxNum = 0;
    window.wardTeamsFor(ward).forEach((t) => {
      const m = String(t).match(/(\d+)\s*$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    return `Team ${String(ward).trim()} ${String(maxNum + 1).padStart(2, '0')}`;
  };

  window.buildTeamOptionsUniversal = function (
    currentTeam,
    role = 'admin',
    userWorkplaceMaXa = '',
    member = null
  ) {
    const esc = (s) =>
      window.escapeHtml ? window.escapeHtml(String(s ?? '')) : String(s ?? '');

    // HCDC chọn đội cho nhân sự Trạm Y tế: chỉ các đội đúng mẫu của xã người đó
    if (role === 'admin' && member && window.isGrassrootsMember(member)) {
      const wardTeams = window.wardTeamsFor(member.workplace_ward);
      let opts = `<option value="No team" ${
        !currentTeam || currentTeam === 'No team' ? 'selected' : ''
      }>Chưa có đội</option>`;
      wardTeams.forEach((t) => {
        opts += `<option value="${esc(t)}" ${currentTeam === t ? 'selected' : ''}>${esc(t)}</option>`;
      });
      if (member.workplace_ward)
        opts += `<option value="__NEW__">➕ Tạo đội mới (${esc(
          window.nextWardTeamName(member.workplace_ward)
        )})</option>`;
      if (currentTeam && currentTeam !== 'No team' && !wardTeams.includes(currentTeam))
        opts += `<option value="${esc(currentTeam)}" selected>${esc(currentTeam)} (sai mẫu)</option>`;
      return opts;
    }

    const availableTeams = window.getAllAvailableTeams(role, userWorkplaceMaXa);

    let options = `<option value="No team" ${
      !currentTeam || currentTeam === 'No team' ? 'selected' : ''
    }>Chưa có đội</option>`;

    availableTeams.forEach((t) => {
      options += `<option value="${esc(t)}" ${
        currentTeam === t ? 'selected' : ''
      }>${esc(t)}</option>`;
    });

    if (role === 'ward_admin') {
      options += `<option value="__NEW__">➕ Tạo đội mới...</option>`;
    }

    if (
      currentTeam &&
      currentTeam !== 'No team' &&
      !availableTeams.includes(currentTeam) &&
      currentTeam !== '__NEW__'
    ) {
      options += `<option value="${esc(currentTeam)}" selected>${esc(
        currentTeam
      )}</option>`;
    }

    return options;
  };

  const posOptionsFull = (sel) => `
    <option value="No position" ${
      !sel || sel === 'No position' ? 'selected' : ''
    }>Chưa có vị trí</option>
    <option value="Leader" ${
      sel === 'Leader' ? 'selected' : ''
    }>Đội trưởng</option>
    <option value="Epidemic" ${
      sel === 'Epidemic' ? 'selected' : ''
    }>Cán bộ Dịch tễ</option>
    <option value="Member" ${
      sel === 'Member' ? 'selected' : ''
    }>Cán bộ Lấy mẫu</option>
    <option value="Engineer" ${
      sel === 'Engineer' ? 'selected' : ''
    }>Cán bộ Xử lý môi trường</option>
    <option value="Media" ${
      sel === 'Media' ? 'selected' : ''
    }>Cán bộ Truyền thông</option>
    <option value="Logistic" ${
      sel === 'Logistic' ? 'selected' : ''
    }>Hậu cần</option>
    <option value="Driver" ${
      sel === 'Driver' ? 'selected' : ''
    }>Lái xe</option>`;

  const posOptionsWard = (sel) => {
    const leaderKeep =
      sel === 'Leader'
        ? `<option value="Leader" selected>Đội trưởng</option>`
        : '';
    return (
      leaderKeep +
      `
    <option value="No position" ${
      !sel || sel === 'No position' ? 'selected' : ''
    }>Chưa có vị trí</option>
    <option value="Epidemic" ${
      sel === 'Epidemic' ? 'selected' : ''
    }>Cán bộ Dịch tễ</option>
    <option value="Member" ${
      sel === 'Member' ? 'selected' : ''
    }>Cán bộ Lấy mẫu</option>
    <option value="Engineer" ${
      sel === 'Engineer' ? 'selected' : ''
    }>Cán bộ Xử lý môi trường</option>
    <option value="Media" ${
      sel === 'Media' ? 'selected' : ''
    }>Cán bộ Truyền thông</option>
    <option value="Logistic" ${
      sel === 'Logistic' ? 'selected' : ''
    }>Hậu cần</option>
    <option value="Driver" ${
      sel === 'Driver' ? 'selected' : ''
    }>Lái xe</option>`
    );
  };
  // ============================================================================
  // 2. HÀM RENDER TRANG VÀ BẢNG ĐỘI (renderTeamTable)
  // ============================================================================
  window.renderTeamPage = function () {
    if (typeof window.renderTeamTable === 'function') window.renderTeamTable();
  };

  window.renderTeamTable = async function () {
    console.log('🚀 Bắt đầu tải trang Team...');
    try {
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      const [profilesRes, qualRes] = await Promise.all([
        supabaseClient
          .from('profiles')
          .select('*')
          .not('role', 'in', `(${window.LIMS_ONLY_ROLES.join(',')})`),
        supabaseClient.from('rrt_qualifications').select('*'),
      ]);
      if (profilesRes.error) throw profilesRes.error;

      const fullTeamData = profilesRes.data || [];
      const allQuals = qualRes.data || [];

      const _role = (window.userSession?.role || '').toLowerCase();
      const isAdmin = _role === 'admin';
      const isWardAdmin = _role === 'ward_admin';
      const myWorkplaceWard = String(
        window.userSession?.workplace_ward || ''
      ).trim();
      const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();
      const grassrootsUnits = [
        'trạm y tế phường/xã/ đặc khu',
        'ubnd phường/xã/ đặc khu',
      ];

      window.appState = window.appState || {};
      window.appState.teamData = fullTeamData;

      let scopedTeamData = fullTeamData;
      if (isWardAdmin) {
        scopedTeamData = fullTeamData.filter((m) => {
          const mMaXa = String(m.workplace_ma_xa || '').trim();
          const mFax = String(m.fax || '')
            .toLowerCase()
            .trim();
          return myMaXa && mMaXa === myMaXa && grassrootsUnits.includes(mFax);
        });
      }

      let wardTeams = isWardAdmin
        ? [
            ...new Set(
              scopedTeamData
                .map((m) => m.team)
                .filter((t) => t && t !== 'No team')
            ),
          ].sort()
        : [];

      if (scopedTeamData.length === 0) {
        $('#team-table tbody').html(
          "<tr><td colspan='9' class='text-center'>Chưa có dữ liệu đội thuộc phạm vi của bạn.</td></tr>"
        );
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
        return;
      }

      // --- CẬP NHẬT BỘ LỌC ĐỘI ĐỘNG (DYNAMIC FILTER) ---
      const $filterSelect = $('#filter-team-select');
      $filterSelect
        .find('option:not([value="all"]):not([value="No team"])')
        .remove();

      if (isAdmin) {
        // Admin thấy TẤT CẢ đội (Team 1..10 + Đội phường)
        const allAdminTeams = window.getAllAvailableTeams('admin');
        allAdminTeams.forEach((teamName) => {
          $filterSelect.append(new Option(teamName, teamName));
        });
      } else if (isWardAdmin) {
        wardTeams.forEach((teamName) => {
          $filterSelect.append(new Option(teamName, teamName));
        });
      }

      if ($filterSelect.hasClass('select2-hidden-accessible')) {
        $filterSelect.trigger('change.select2');
      }

      const safeEscapeHtml = (str) => {
        if (!str) return '';
        return String(str).replace(
          /[&<>'"]/g,
          (match) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              "'": '&#39;',
              '"': '&quot;',
            }[match])
        );
      };
      window.currentScopedTeamData = scopedTeamData; // 👈 CẦN THIẾT!
      const dataForTable = scopedTeamData.map((r, i) => {
        const qual = allQuals.find((q) => q.profile_id === r.id) || {};
        r.qualifications = qual;

        let teamCell;
        const userMaXa = window.userSession?.workplace_ma_xa || '';

        if (isAdmin) {
          teamCell = `<span class="team-hidden" style="display:none">${safeEscapeHtml(
            r.team || 'No team'
          )}</span>
             <select class="form-select form-select-sm update-team" data-id="${
               r.id
             }">${window.buildTeamOptionsUniversal(
            r.team,
            'admin',
            userMaXa,
            r
          )}</select>`;
        } else if (isWardAdmin) {
          teamCell = `<span class="team-hidden" style="display:none">${safeEscapeHtml(
            r.team || 'No team'
          )}</span>
             <select class="form-select form-select-sm update-team-ward" data-id="${
               r.id
             }">${window.buildTeamOptionsUniversal(
            r.team,
            'ward_admin',
            userMaXa
          )}</select>`;
        } else {
          teamCell = safeEscapeHtml(r.team || 'Chưa có đội');
        }

        let posCell;
        if (isAdmin) {
          posCell = `<select class="form-select form-select-sm update-position" data-id="${
            r.id
          }">${posOptionsFull(r.position)}</select>`;
        } else if (isWardAdmin) {
          posCell = `<select class="form-select form-select-sm update-position-ward" data-id="${
            r.id
          }">${posOptionsWard(r.position)}</select>`;
        } else {
          posCell = safeEscapeHtml(r.position || 'Chưa có vị trí');
        }

        let rankHtml = '<span class="badge bg-secondary">N/A</span>';
        try {
          if (typeof window.calculateRRTLevel === 'function') {
            rankHtml = window.calculateRRTLevel(r);
          }
        } catch (e) {
          console.warn('Lỗi tính Xếp hạng cho', r.full_name, e);
        }

        const regDate =
          r.updated_at || r.created_at
            ? new Date(r.updated_at || r.created_at).toLocaleDateString('vi-VN')
            : '';

        return [
          i + 1,
          safeEscapeHtml(r.full_name || 'N/A'),
          rankHtml,
          safeEscapeHtml(r.department || ''),
          safeEscapeHtml(r.phone || ''),
          regDate,
          safeEscapeHtml(r.email || ''),
          teamCell,
          posCell,
        ];
      });

      if ($.fn.DataTable.isDataTable('#team-table')) {
        $('#team-table').DataTable().clear().destroy();
      }
      dataTableInstance = $('#team-table').DataTable({
        data: dataForTable,
        destroy: true,
        responsive: true,
        columns: [
          { title: 'TT', width: '3%' },
          { title: 'Họ Tên', width: '15%' },
          { title: 'Xếp hạng', width: '10%' },
          { title: 'Khoa phòng', width: '15%' },
          { title: 'Số điện thoại', width: '10%' },
          { title: 'Ngày cập nhật', width: '10%' },
          { title: 'Email', width: '12%' },
          { title: 'Đội', width: '10%' },
          { title: 'Vị trí', width: '15%' },
        ],
        columnDefs: [
          {
            targets: 5,
            render: function (data, type) {
              if (type === 'sort' || type === 'filter') {
                if (!data) return 0;
                const parts = String(data).split('/');
                if (parts.length !== 3) return 0;
                return new Date(+parts[2], +parts[1] - 1, +parts[0]).getTime();
              }
              return data || '';
            },
          },
          {
            targets: 7,
            render: function (data, type) {
              if (type === 'filter' || type === 'sort') {
                const matchHidden = String(data).match(
                  /<span[^>]*>(.*?)<\/span>/
                );
                if (matchHidden) return matchHidden[1].trim();
                return $('<div>').html(data).text().trim();
              }
              return data;
            },
          },
        ],
        dom: '<"dataTables_top"Blf>rt<"dataTables_bottom"ip>',
        buttons: [
          'copy',
          'csv',
          'excel',
          'pdf',
          'print',
          { extend: 'colvis', text: 'Columns' },
        ],
      });

      if (typeof renderAnalytics_Member === 'function') {
        renderAnalytics_Member(scopedTeamData, null, null);
      }

      // --- GẮN SỰ KIỆN CHANGE AN TOÀN TRÁNH MẤT TEAM KHI ĐỔI VỊ TRÍ ---
      $('#team-table').off('change', '.update-team, .update-position');
      $('#team-table').on(
        'change',
        '.update-team, .update-position',
        function () {
          const $tr = $(this).closest('tr');
          const userId = $(this).data('id');

          const currentMember = (window.appState.teamData || []).find(
            (m) => m.id === userId
          );
          const newTeam =
            $tr.find('.update-team').val() || currentMember?.team || 'No team';
          const newPos =
            $tr.find('.update-position').val() ||
            currentMember?.position ||
            'No position';

          const save = (team) => {
            if (typeof updateTeamData === 'function') {
              updateTeamData(userId, team, newPos, $tr, dataTableInstance, {
                role: 'admin',
              });
            }
          };

          // Tạo đội mới cho nhân sự Trạm Y tế: tên tự đặt theo mẫu "Team <xã> NN"
          if (newTeam === '__NEW__') {
            const name = window.nextWardTeamName(currentMember?.workplace_ward);
            const $sel = $tr.find('.update-team');
            const revert = () => $sel.val(currentMember?.team || 'No team');
            if (typeof window.showToastConfirm === 'function') {
              window.showToastConfirm(
                `Tạo đội mới: <strong>${window.escapeHtml(name)}</strong> và gán người này vào đội?`,
                () => save(name),
                revert
              );
            } else {
              save(name);
            }
            return;
          }
          save(newTeam);
        }
      );

      $('#team-table').off(
        'change',
        '.update-team-ward, .update-position-ward'
      );
      $('#team-table').on(
        'change',
        '.update-team-ward, .update-position-ward',
        function () {
          const $tr = $(this).closest('tr');
          const userId = $(this).data('id');
          const $teamSel = $tr.find('.update-team-ward');
          const $posSel = $tr.find('.update-position-ward');

          const doSaveWard = (teamName) => {
            const currentMember = (window.appState.teamData || []).find(
              (m) => m.id === userId
            );
            const newTeam =
              teamName || $teamSel.val() || currentMember?.team || 'No team';
            const newPos =
              $posSel.val() || currentMember?.position || 'No position';

            if (newPos === 'Leader') {
              if (typeof showToast === 'function')
                showToast(
                  'Bạn không có quyền phong Đội trưởng. Vui lòng liên hệ quản trị cấp trên.',
                  'warning'
                );
              $posSel.val(
                currentMember?.position === 'Leader'
                  ? 'Leader'
                  : currentMember?.position || 'No position'
              );
              return;
            }

            if (typeof updateTeamData === 'function') {
              updateTeamData(userId, newTeam, newPos, $tr, dataTableInstance, {
                role: 'ward_admin',
                wardTeams: wardTeams,
              });
            }
          };

          if (
            $(this).hasClass('update-team-ward') &&
            $teamSel.val() === '__NEW__'
          ) {
            let maxNum = 0;
            wardTeams.forEach((t) => {
              const m = String(t).match(/(\d+)\s*$/);
              if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
            });
            const nextNum = String(maxNum + 1).padStart(2, '0');
            const newTeamName = `Team ${myWorkplaceWard} ${nextNum}`;

            const applyNewTeam = () => {
              $teamSel.val(newTeamName);
              doSaveWard(newTeamName);
              setTimeout(() => {
                if (typeof window.renderTeamTable === 'function') {
                  window.renderTeamTable();
                }
              }, 300);
            };

            if (typeof window.showToastConfirm === 'function') {
              window.showToastConfirm(
                `Tạo đội mới: <strong>${newTeamName}</strong> và gán người này vào đội?`,
                applyNewTeam,
                () => {
                  $teamSel.val('No team');
                }
              );
            } else {
              applyNewTeam();
            }
            return;
          }

          doSaveWard();
        }
      );
    } catch (err) {
      console.error('❌ Lỗi renderTeamTable:', err);
      showToast('Lỗi hiển thị bảng Đội.', 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // ============================================================================
  // 3. HÀM CẬP NHẬT DỮ LIỆU (updateTeamData)
  // ============================================================================
  async function updateTeamData(
    userId,
    newTeam,
    newPosition,
    $tr,
    table,
    opts
  ) {
    if (!userId) return;
    const role = (opts && opts.role) || 'admin';
    const userWorkplaceMaXa =
      opts?.userWorkplaceMaXa || window.userSession?.workplace_ma_xa;

    try {
      const oldMember = (window.appState?.teamData || []).find(
        (m) => m.id === userId
      );

      const finalTeam =
        newTeam !== undefined && newTeam !== null && newTeam !== ''
          ? newTeam
          : oldMember?.team || 'No team';

      const finalPos =
        newPosition !== undefined && newPosition !== null && newPosition !== ''
          ? newPosition
          : oldMember?.position || 'No position';

      const { error } = await supabaseClient
        .from('profiles')
        .update({
          team: finalTeam,
          position: finalPos,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
      if (error) throw error;

      let isTeamChanged = false;
      let isPosChanged = false;

      if (oldMember) {
        isTeamChanged = oldMember.team !== finalTeam;
        isPosChanged = oldMember.position !== finalPos;

        oldMember.team = finalTeam;
        oldMember.position = finalPos;
      }

      const esc = (s) =>
        window.escapeHtml
          ? window.escapeHtml(String(s ?? ''))
          : String(s ?? '');

      if (table && $tr.length) {
        const rowData = table.row($tr).data();
        if (rowData) {
          const teamOptions = window.buildTeamOptionsUniversal(
            finalTeam,
            role,
            userWorkplaceMaXa,
            oldMember
          );
          const selectClass =
            role === 'ward_admin' ? 'update-team-ward' : 'update-team';

          rowData[7] = `<span class="team-hidden" style="display:none">${esc(
            finalTeam
          )}</span>
          <select class="form-select form-select-sm ${selectClass}" data-id="${userId}">${teamOptions}</select>`;

          const posMapFull = {
            'No position': 'Chưa có vị trí',
            Leader: 'Đội trưởng',
            Epidemic: 'Cán bộ Dịch tễ',
            Member: 'Cán bộ Lấy mẫu',
            Engineer: 'Cán bộ Xử lý môi trường',
            Media: 'Cán bộ Truyền thông',
            Logistic: 'Hậu cần',
            Driver: 'Lái xe',
          };

          if (role === 'ward_admin') {
            const posMapWard = { ...posMapFull };
            delete posMapWard.Leader;
            let posOptions =
              finalPos === 'Leader'
                ? `<option value="Leader" selected>Đội trưởng</option>`
                : '';
            for (const [key, label] of Object.entries(posMapWard)) {
              posOptions += `<option value="${key}" ${
                finalPos === key ? 'selected' : ''
              }>${label}</option>`;
            }
            rowData[8] = `<select class="form-select form-select-sm update-position-ward" data-id="${userId}">${posOptions}</select>`;
          } else {
            let posOptions = '';
            for (const [key, label] of Object.entries(posMapFull)) {
              posOptions += `<option value="${key}" ${
                finalPos === key ? 'selected' : ''
              }>${label}</option>`;
            }
            rowData[8] = `<select class="form-select form-select-sm update-position" data-id="${userId}">${posOptions}</select>`;
          }

          table.row($tr).data(rowData).invalidate();
        }
      }

      if (typeof renderAnalytics_Member === 'function') {
        const startDate = $('#filter-date-start-team').val();
        const endDate = $('#filter-date-end-team').val();
        const selectedTeams = $('#filter-team-select').val() || [];
        let chartData = window.appState.teamData || [];
        if (role === 'ward_admin') {
          const myMaXa = String(
            window.userSession?.workplace_ma_xa || ''
          ).trim();
          const gu = [
            'trạm y tế phường/xã/ đặc khu',
            'ubnd phường/xã/ đặc khu',
          ];
          chartData = chartData.filter((m) => {
            const mMaXa = String(m.workplace_ma_xa || '').trim();
            const mFax = String(m.fax || '')
              .toLowerCase()
              .trim();
            return myMaXa && mMaXa === myMaXa && gu.includes(mFax);
          });
        }
        renderAnalytics_Member(chartData, startDate, endDate, selectedTeams);
      }

      // Hiển thị toast thông báo chính xác tùy theo thao tác
      if (isTeamChanged && isPosChanged) {
        showToast('Đã cập nhật Đội và Vị trí thành công!', 'success');
      } else if (isTeamChanged) {
        showToast('Đã phân công Đội thành công!', 'success');
      } else if (isPosChanged) {
        showToast('Đã cập nhật Vị trí thành công!', 'success');
      } else {
        showToast('Cập nhật thành công!', 'success');
      }
    } catch (err) {
      console.error('Lỗi cập nhật thông tin:', err);
      showToast('Lỗi khi cập nhật: ' + err.message, 'error');
      // Trả ô chọn về giá trị đang lưu (vd. tên đội sai mẫu bị database từ chối)
      const saved = (window.appState?.teamData || []).find((m) => m.id === userId);
      if ($tr && $tr.length && saved) {
        $tr.find('.update-team, .update-team-ward').val(saved.team || 'No team');
        $tr.find('.update-position, .update-position-ward').val(saved.position || 'No position');
      }
    }
  }

  // === BIẾN MÀU (colors) - BẮT BUỘC ĐỊNH NGHĨA TRƯỚC KHI GỌI HÀM ===
  const colors = {
    male: '#36a2eb',
    female: '#ff6384',
    pending: '#ffc107',
    edit: '#fd7e14',
    approved: '#28a745',
    academic1: '#4bc0c0',
    academic2: '#9966ff',
    academic3: '#ff9f40',
    academicOther: '#c9cbcf',
    academicLevel1: '#ffcd56',
    academicLevel2: '#4bc0c0',
    academicLevel3: '#36a2eb',
    levelBeginner: '#ff9f40',
    levelIntermediate: '#ffcd56',
    levelAdvanced: '#4bc0c0',
    levelExpert: '#36a2eb',
  };

  const academicLevelColorMap = {
    'Trung cấp/Cao đẳng': 'academicLevel1',
    'Đại học': 'academicLevel2',
    'Sau Đại học': 'academicLevel3',
  };

  // === HÀM CHÍNH: renderAnalytics_Member (SO SÁNH NHIỀU TEAM - ĐÃ NÂNG CẤP SUPABASE) ===
  window.renderAnalytics_Member = function (
    data,
    startDate,
    endDate,
    selectedTeams = []
  ) {
    try {
      if (!data || data.length === 0)
        throw new Error('Không có dữ liệu đầu vào');

      // === 1. LỌC THEO NGÀY (Dùng updated_at của Supabase) ===
      const fromDate = startDate ? new Date(startDate) : null;
      const toDate = endDate ? new Date(endDate) : null;
      if (fromDate) fromDate.setHours(0, 0, 0, 0);
      if (toDate) toDate.setHours(23, 59, 59, 999);

      let filtered = data;
      if (fromDate || toDate) {
        filtered = data.filter((m) => {
          const d = new Date(m.updated_at || m.created_at);
          if (isNaN(d)) return false;
          return (!fromDate || d >= fromDate) && (!toDate || d <= toDate);
        });
      }

      // === 2. LỌC THEO TEAM ===
      if (selectedTeams.length > 0 && !selectedTeams.includes('all')) {
        filtered = filtered.filter((m) =>
          selectedTeams.includes(m.team || 'No team')
        );
      }

      // === 3. LẤY DANH SÁCH TEAM DUY NHẤT ===
      const teams = [
        ...new Set(filtered.map((m) => m.team || 'No team')),
      ].sort();
      if (teams.length === 0) teams.push('No team');

      // === 4. HIGHCHARTS FONT ===
      if (typeof Highcharts !== 'undefined') {
        Highcharts.setOptions({
          chart: { style: { fontFamily: "'Ubuntu', sans-serif" } },
        });
      }

      // === HELPER: TẠO DỮ LIỆU THEO TEAM ===
      const groupByTeam = (keyFn, valueFn = () => 1) => {
        const result = {};
        teams.forEach((t) => (result[t] = {}));
        filtered.forEach((m) => {
          const team = m.team || 'No team';
          const key = keyFn(m);
          if (key)
            result[team][key] = (result[team][key] || 0) + (valueFn(m) || 1);
        });
        return result;
      };

      // === 1. BIỂU ĐỒ SỐ LƯỢNG THÀNH VIÊN ===
      const teamMemberCount = {};
      teams.forEach(
        (t) =>
          (teamMemberCount[t] = filtered.filter(
            (m) => (m.team || 'No team') === t
          ).length)
      );

      renderGroupedColumn('teamComparisonChartAP', {
        title: 'Số lượng thành viên theo Đội',
        categories: teams,
        series: [
          {
            name: 'Thành viên',
            data: teams.map((t) => teamMemberCount[t]),
            color: '#36a2eb',
          },
        ],
      });

      // === 2. GIỚI TÍNH ===
      const genderData = groupByTeam((m) => {
        const g = (m.gender || '').toLowerCase();
        return g === 'male' || g === 'nam'
          ? 'Male'
          : g === 'female' || g === 'nữ'
          ? 'Female'
          : null;
      });
      const genderSeries = ['Male', 'Female'].map((g) => ({
        name: g,
        data: teams.map((t) => genderData[t][g] || 0),
        color: colors[g.toLowerCase()],
      }));
      renderGroupedColumn('genderDistributionChartAP', {
        title: 'Giới tính theo Đội',
        categories: teams,
        series: genderSeries,
      });

      // === 3. TRẠNG THÁI (Đổi thành approval_status) ===
      const statusOrder = ['pending', 'edit', 'approved'];
      const statusData = groupByTeam((m) =>
        (m.approval_status || 'pending').toLowerCase()
      );
      const statusSeries = statusOrder.map((s) => ({
        name: s,
        data: teams.map((t) => statusData[t][s] || 0),
        color: colors[s] || '#cccccc',
      }));
      renderGroupedColumn('statusDistributionChartAP', {
        title: 'Tình trạng theo Đội',
        categories: teams,
        series: statusSeries,
      });

      // === 4. CHUYÊN NGÀNH (Đọc từ qualifications) ===
      const academicData = groupByTeam((m) => {
        const specRaw = (m.qualifications?.specialty || m.academic || '')
          .trim()
          .toLowerCase();
        if (
          specRaw.includes('y khoa') ||
          specRaw.includes('điều dưỡng') ||
          specRaw.includes('dược')
        )
          return 'Y khoa và Điều dưỡng';
        if (specRaw.includes('công cộng')) return 'Y tế công cộng';
        if (specRaw.includes('kỹ thuật') || specRaw.includes('quản lý'))
          return 'Kỹ thuật và Quản lý';
        return null;
      });
      const academicSeries = [
        'Y khoa và Điều dưỡng',
        'Y tế công cộng',
        'Kỹ thuật và Quản lý',
      ].map((s, i) => ({
        name: s,
        data: teams.map((t) => academicData[t][s] || 0),
        color: colors[`academic${i + 1}`] || '#cccccc',
      }));
      renderGroupedColumn('academicSpecializationChartAP', {
        title: 'Chuyên ngành theo Đội',
        categories: teams,
        series: academicSeries,
      });

      // === 5. CẤP BẬC HỌC VẤN ===
      const levelData = groupByTeam((m) => {
        const levelRaw = (
          m.qualifications?.academic_level ||
          m.academic_level ||
          ''
        )
          .trim()
          .toLowerCase();
        if (levelRaw.includes('trung cấp') || levelRaw.includes('cao đẳng'))
          return 'Trung cấp/Cao đẳng';
        if (levelRaw === 'đại học') return 'Đại học';
        if (
          levelRaw.includes('sau đại học') ||
          levelRaw.includes('thạc sĩ') ||
          levelRaw.includes('tiến sĩ')
        )
          return 'Sau Đại học';
        return null;
      });
      const levelSeries = ['Trung cấp/Cao đẳng', 'Đại học', 'Sau Đại học'].map(
        (l) => ({
          name: l,
          data: teams.map((t) => levelData[t][l] || 0),
          color: colors[academicLevelColorMap[l]] || '#cccccc',
        })
      );
      renderGroupedColumn('academicLevelChartAP', {
        title: 'Trình độ học vấn theo Đội',
        categories: teams,
        series: levelSeries,
      });

      // === 6. NGOẠI NGỮ ===
      const langOrder = ['Anh', 'Trung', 'Pháp', 'Nhật', 'Hàn'];
      const langData = groupByTeam((m) => {
        const l = (m.qualifications?.languages || m.language || '')
          .toString()
          .trim();
        return l ? l.charAt(0).toUpperCase() + l.slice(1).toLowerCase() : null;
      });
      const langSeries = langOrder.map((l, i) => ({
        name: l,
        data: teams.map((t) => langData[t][l] || 0),
        color: Highcharts.getOptions().colors[i] || '#cccccc',
      }));
      renderGroupedColumn('languageChartAP', {
        title: 'Ngoại ngữ theo Đội',
        categories: teams,
        series: langSeries,
      });

      // === 7. KỸ NĂNG (BÓC TÁCH TỪ JSONB QUALIFICATIONS) ===
      const levels = ['beginner', 'intermediate', 'advanced', 'expert'];
      const dbSkillKeys = {
        emergency_response: 'Ứng phó khẩn cấp',
        risk_communication: 'Truyền thông rủi ro',
        psycho_social: 'Tâm lý xã hội',
        data_management: 'Quản lý dữ liệu',
        epidemiology: 'Dịch tễ học',
        infection_control: 'Phòng chống nhiễm trùng',
        lab: 'Phòng thí nghiệm',
        logistics: 'Hậu cần khẩn cấp',
        operation_materials: 'Quản lý và vận hành',
        security_management: 'Quản lý ca bệnh/An ninh',
        food_management: 'Dinh dưỡng',
        wash_management: 'WASH',
      };

      const skillData = {};
      Object.values(dbSkillKeys).forEach((s) => (skillData[s] = {}));
      skillData['Trình độ ngoại ngữ'] = {};

      teams.forEach((t) => {
        Object.values(dbSkillKeys).forEach(
          (s) =>
            (skillData[s][t] = {
              beginner: 0,
              intermediate: 0,
              advanced: 0,
              expert: 0,
            })
        );
        skillData['Trình độ ngoại ngữ'][t] = {
          beginner: 0,
          intermediate: 0,
          advanced: 0,
          expert: 0,
        };
      });

      filtered.forEach((m) => {
        const team = m.team || 'No team';
        const qual = m.qualifications || {};

        // Quét trình độ ngoại ngữ
        if (
          qual.languages_level &&
          levels.includes(qual.languages_level.toLowerCase())
        ) {
          skillData['Trình độ ngoại ngữ'][team][
            qual.languages_level.toLowerCase()
          ]++;
        }

        // Quét JSON kỹ năng
        let skillsObj = {};
        if (qual.skills) {
          try {
            skillsObj =
              typeof qual.skills === 'string'
                ? JSON.parse(qual.skills)
                : qual.skills;
          } catch (e) {
            skillsObj = {};
          }
        }

        Object.entries(dbSkillKeys).forEach(([dbKey, viName]) => {
          const s = skillsObj[dbKey];
          if (
            s &&
            s.has_skill &&
            s.level &&
            levels.includes(s.level.toLowerCase())
          ) {
            skillData[viName][team][s.level.toLowerCase()]++;
          }
        });
      });

      const skillCategories = [
        'Trình độ ngoại ngữ',
        ...Object.values(dbSkillKeys),
      ];
      const skillSeries = levels.map((l) => ({
        name: l.charAt(0).toUpperCase() + l.slice(1),
        data: skillCategories.map((skill) => {
          let total = 0;
          teams.forEach((t) => (total += skillData[skill][t]?.[l] || 0));
          return total;
        }),
        color:
          colors[`level${l.charAt(0).toUpperCase() + l.slice(1)}`] || '#cccccc',
      }));

      renderStackedColumn('teamLevelChartAP', {
        title: 'Kỹ năng theo Đội',
        categories: skillCategories,
        series: skillSeries,
      });

      // === 8. BẢNG CHI TIẾT KỸ NĂNG ===
      let tableHtml = `<h4 class="mt-4 analytics-subtitle">Chi tiết kỹ năng theo Team</h4><div class="table-responsive">`;

      skillCategories.forEach((skillName) => {
        const skillTeamData = skillData[skillName];
        const hasData = teams.some((t) =>
          Object.values(skillTeamData[t]).some((v) => v > 0)
        );

        if (!hasData) return; // Bỏ qua kỹ năng không ai có

        tableHtml += `
      <div class="skill-section mb-4 p-3 border rounded shadow-sm" style="background:#f8f9fa;">
        <h5 class="skill-title mb-3 d-flex align-items-center">
          <i class="bx-iconsax-lin-profile me-2 text-primary"></i><strong>${skillName}</strong>
        </h5>
        <table class="table table-sm table-bordered table-hover analytics-table skill-table">
          <thead class="table-light">
            <tr>
              <th class="text-center">Đội</th>
              <th class="text-center text-warning">Cơ bản</th>
              <th class="text-center text-info">Trung cấp</th>
              <th class="text-center text-success">Nâng cao</th>
              <th class="text-center text-danger">Chuyên gia</th>
            </tr>
          </thead>
          <tbody>`;

        teams.forEach((team) => {
          const d = skillTeamData[team];
          if (d.beginner + d.intermediate + d.advanced + d.expert === 0) return;
          tableHtml += `
          <tr>
            <td class="fw-bold text-dark">${team}</td>
            <td class="text-center ${
              d.beginner > 0 ? 'bg-warning-subtle fw-bold' : ''
            }">${d.beginner || '-'}</td>
            <td class="text-center ${
              d.intermediate > 0 ? 'bg-info-subtle fw-bold' : ''
            }">${d.intermediate || '-'}</td>
            <td class="text-center ${
              d.advanced > 0 ? 'bg-success-subtle fw-bold' : ''
            }">${d.advanced || '-'}</td>
            <td class="text-center ${
              d.expert > 0 ? 'bg-danger-subtle text-white fw-bold' : ''
            }">${d.expert || '-'}</td>
          </tr>`;
        });
        tableHtml += `</tbody></table></div>`;
      });
      tableHtml += `</div>`;
      $('#detailedSummaryTableAP').html(
        tableHtml ||
          '<p class="no-data-message mt-4">Không có dữ liệu kỹ năng.</p>'
      );

      // === 9. BẢNG TÓM TẮT ===
      const summary = { 'Tổng số thành viên': filtered.length };
      teams.forEach(
        (t) =>
          (summary[`Team: ${t}`] = filtered.filter(
            (m) => (m.team || 'No team') === t
          ).length)
      );

      let summaryHtml =
        '<h4 class="mt-4 analytics-subtitle">Tóm tắt Đội</h4><div class="table-responsive"><table class="table table-hover analytics-table"><thead class="table-secondary"><tr><th>Số liệu</th><th>Giá trị</th></tr></thead><tbody>';
      Object.entries(summary).forEach(
        ([k, v]) =>
          (summaryHtml += `<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`)
      );
      summaryHtml += '</tbody></table></div>';
      $('#summaryTableAP').html(summaryHtml);

      // Cập nhật biểu đồ Năng lực tổng hợp (Nếu có hàm)
      if (
        document.getElementById('competencyChartAP') &&
        typeof rrtShared.renderCompetencyChart === 'function'
      ) {
        rrtShared.renderCompetencyChart(filtered);
      }
    } catch (error) {
      console.error('renderAnalytics_Member error:', error);
      const ids = [
        'teamComparisonChartAP',
        'genderDistributionChartAP',
        'statusDistributionChartAP',
        'academicSpecializationChartAP',
        'academicLevelChartAP',
        'languageChartAP',
        'teamLevelChartAP',
      ];
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el)
          el.innerHTML =
            '<p class="no-data-message text-center">Chưa có dữ liệu để vẽ biểu đồ.</p>';
      });
      $('#detailedSummaryTableAP, #summaryTableAP').html(
        '<p class="no-data-message text-center">Chưa có dữ liệu.</p>'
      );
    }
  };

  // Hàm vẽ biểu đồ thống kê Đào tạo
  function renderTrainingAnalytics() {
    if (typeof Highcharts === 'undefined') return;

    const records = window.appState.training?.records || [];
    const profilesMap = window.appState.training?.profilesMap || {}; // ✅ Map profile_id → team

    // --- 1. Xử lý dữ liệu Kết quả (Pie Chart) ---
    let countPass = 0;
    let countFail = 0;
    let countPending = 0;

    records.forEach((r) => {
      if (r.result === 'pass') countPass++;
      else if (r.result === 'fail') countFail++;
      else countPending++;
    });

    // Vẽ Pie Chart
    if (document.getElementById('trainingResultChart')) {
      Highcharts.chart('trainingResultChart', {
        chart: {
          type: 'pie',
          backgroundColor: 'transparent',
          style: { fontFamily: "'Ubuntu', sans-serif" },
        },
        title: { text: null },
        tooltip: {
          pointFormat: '<b>{point.y}</b> học viên ({point.percentage:.1f}%)',
        },
        plotOptions: {
          pie: {
            innerSize: '50%',
            dataLabels: { enabled: false },
            showInLegend: true,
          },
        },
        series: [
          {
            name: 'Số lượng',
            colorByPoint: true,
            data: [
              { name: 'Đạt', y: countPass, color: '#28a745' },
              { name: 'Chưa đạt', y: countFail, color: '#dc3545' },
              { name: 'Chờ kết quả', y: countPending, color: '#ffc107' },
            ],
          },
        ],
        credits: { enabled: false },
        legend: { itemStyle: { fontSize: '11px' } },
      });
    }

    // --- 2. Xử lý dữ liệu theo Team (Bar Chart) - FIX ---
    const teamCounts = {};

    records.forEach((r) => {
      if (
        r.attendance === true ||
        r.attendance === 'TRUE' ||
        r.attendance === 'true'
      ) {
        // ✅ Lấy team từ profilesMap thay vì teamData
        const profileId = r.profile_id || r.user_id;
        const profileData = profilesMap[profileId];
        const teamName = profileData?.team || 'Chưa phân loại';

        teamCounts[teamName] = (teamCounts[teamName] || 0) + 1;
      }
    });

    // Sắp xếp Team
    const sortedTeams = Object.keys(teamCounts).sort(
      (a, b) => teamCounts[b] - teamCounts[a]
    );
    const dataSeries = sortedTeams.map((t) => teamCounts[t]);

    // Vẽ Bar Chart
    if (document.getElementById('trainingTeamChart')) {
      Highcharts.chart('trainingTeamChart', {
        chart: {
          type: 'column',
          backgroundColor: 'transparent',
          style: { fontFamily: "'Ubuntu', sans-serif" },
        },
        title: { text: null },
        xAxis: { categories: sortedTeams, crosshair: true },
        yAxis: { min: 0, title: { text: 'Lượt tham gia' } },
        tooltip: {
          headerFormat: '<b>{point.x}</b><br/>',
          pointFormat: '{point.y} lượt tham gia',
        },
        plotOptions: {
          column: {
            borderRadius: 5,
            dataLabels: { enabled: true },
          },
        },
        series: [
          {
            name: 'Lượt học viên tham gia',
            data: dataSeries,
            color: '#0d6efd',
          },
        ],
        legend: { enabled: false },
        credits: { enabled: false },
      });
    }
  }

  // === HELPER: GROUPED COLUMN CHART ===
  function renderGroupedColumn(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container || !config.series.some((s) => s.data.some((v) => v > 0))) {
      if (container)
        container.innerHTML =
          '<p class="no-data-message">Không có dữ liệu.</p>';
      return;
    }
    Highcharts.chart(containerId, {
      chart: { type: 'column', backgroundColor: 'transparent' },
      title: {
        text: config.title,
        style: { fontSize: '18px', fontWeight: '500' },
      },
      xAxis: { categories: config.categories, title: { text: 'Team' } },
      yAxis: { title: { text: 'Value' }, allowDecimals: false },
      tooltip: { shared: true },
      plotOptions: {
        column: {
          borderRadius: 5,
          dataLabels: { enabled: true, format: '{y}' },
        },
      },
      series: config.series,
      credits: { enabled: false },
    });
  }

  // === HELPER: STACKED COLUMN CHART ===
  function renderStackedColumn(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container || !config.series.some((s) => s.data.some((v) => v > 0))) {
      if (container)
        container.innerHTML = '<p class="no-data-message">No data.</p>';
      return;
    }
    Highcharts.chart(containerId, {
      chart: { type: 'column', backgroundColor: 'transparent' },
      title: {
        text: config.title,
        style: { fontSize: '18px', fontWeight: '500' },
      },
      xAxis: { categories: config.categories, title: { text: 'Skills' } },
      yAxis: { title: { text: 'Giá trị' }, stackLabels: { enabled: true } },
      tooltip: {
        headerFormat: '<b>{point.x}</b><br/>',
        pointFormat: '{series.name}: {point.y}<br/>Total: {point.stackTotal}',
      },
      plotOptions: {
        column: {
          stacking: 'normal',
          dataLabels: {
            enabled: true,
            formatter: function () {
              return this.y > 0 ? this.y : '';
            },
          },
        },
      },
      series: config.series,
      credits: { enabled: false },
    });
  }

  //TRACKING function getRostersforTracking


});
