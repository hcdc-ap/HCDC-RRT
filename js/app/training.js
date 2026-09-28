// ============================================================
// TRAINING — Khóa đào tạo, hồ sơ đào tạo, chọn đối tượng
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // ============================================================
  // 1. HÀM RENDER TRANG TRAINING (HOÀN CHỈNH)
  // ============================================================
  window.renderTrainingPage = async function () {
    const container = document.getElementById('course-grid-container');
    if (!container) return;

    try {
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      // Gọi tải dữ liệu 1 lần. Hàm loadTrainingData giờ đã xử lý việc giấu khóa học theo quyền.
      await window.loadTrainingData();
      const { courses, records } = window.appState.training;

      const isAdmin =
        (window.userSession?.role || '').toLowerCase() === 'admin';
      const btnCreate = document.getElementById('btn-create-course-trigger');
      if (btnCreate) btnCreate.style.display = isAdmin ? 'block' : 'none';

      container.innerHTML = '';

      // Nếu khóa học rỗng, báo ngay, chặn vẽ thẻ
      if (!courses || courses.length === 0) {
        container.innerHTML =
          '<p class="text-muted text-center mt-4">Bạn chưa tham gia Khóa đào tạo nào.</p>';
        // Biểu đồ sẽ tự đọc dữ liệu rỗng và vẽ biểu đồ trống
        if (typeof rrtShared.renderTrainingAnalytics === 'function')
          rrtShared.renderTrainingAnalytics();
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      courses.forEach((c) => {
        // Chỉ đếm các học viên hợp lệ thuộc quyền người đang xem
        const recordsThisCourse = records.filter(
          (r) => String(r.course_id || r.courseId) === String(c.id)
        );
        const hasGraded = recordsThisCourse.some(
          (r) => r.result === 'pass' || r.result === 'fail'
        );
        const totalTrainees = recordsThisCourse.length;

        let statusText = 'Upcoming';
        let badgeClass = 'bg-primary';
        let cardClass = 'course-card cc-gen';
        let cardStyle = '';
        const rawDate = c.training_date ? new Date(c.training_date) : null;

        if (hasGraded) {
          statusText = 'Graded';
          badgeClass = 'bg-success';
          cardClass = 'course-card cc-spec';
        } else if (rawDate) {
          if (rawDate < today) {
            statusText = 'Completed';
            badgeClass = 'bg-secondary';
            cardStyle = 'border-top: 5px solid #6c757d;';
          } else if (rawDate.getTime() === today.getTime()) {
            statusText = 'Happening';
            badgeClass = 'bg-danger spinner-grow spinner-grow-sm';
            cardStyle = 'border-top: 5px solid #dc3545;';
          }
        }

        const deleteBtn = isAdmin
          ? `<button class="btn-delete-course"
                    onclick="event.stopPropagation(); deleteCourseConfirm('${
                      jsAttr(c.id)
                    }', '${jsAttr(c.course_name || c.name || '')}', event)"
                    title="Xóa khóa học"
                    style="position: absolute; bottom: 15px; right: 15px; width: 30px; height: 30px; background: #ffebee; color: #d32f2f; border: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10;">
                <i class='bx bx-trash'></i>
            </button>`
          : '';

        const displayDate = c.training_date
          ? new Date(c.training_date).toLocaleDateString('vi-VN')
          : 'Chưa rõ';

        const html = `
        <div class="${cardClass}" style="${cardStyle}" data-course-id="${
          c.id
        }" data-name="${rrtShared.escapeHtml(
          c.course_name || c.name || ''
        ).toLowerCase()}">
            <span class="course-badge badge ${badgeClass}" style="position: absolute; top: 15px; right: 15px; padding: 5px 10px; border-radius: 12px; font-size: 11px; color: white;">
                ${statusText}
            </span>
            ${deleteBtn}
            <div onclick="openTrainingDossier('${
              jsAttr(c.id)
            }')" style="cursor: pointer;">
                <h5 style="margin: 0 0 10px 0; font-weight: bold; color: #333; font-size: 16px;">${rrtShared.escapeHtml(
                  c.course_name || c.name || ''
                )}</h5>
                <div style="font-size: 13px; color: #666; line-height: 1.5;">
                    <i class="fa-solid fa-location-dot"></i> ${rrtShared.escapeHtml(
                      c.location || 'Chưa xác định'
                    )}<br>
                    <i class="fa-regular fa-calendar"></i> ${displayDate}
                </div>
                <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #eee; padding-top: 10px; font-size: 13px;">
                    <small class="text-muted">ID: ${String(c.id).substring(
                      0,
                      8
                    )}...</small>
                    <small><strong>${totalTrainees}</strong> học viên</small>
                </div>
            </div>
        </div>`;

        container.insertAdjacentHTML('beforeend', html);
      });

      const searchInput = document.getElementById('training-search');
      if (searchInput) searchInput.onkeyup = window.filterTrainingCourses;

      // Lúc này records đã được lọc sạch, biểu đồ sẽ tự động đọc đúng
      if (typeof rrtShared.renderTrainingAnalytics === 'function')
        rrtShared.renderTrainingAnalytics();
    } catch (err) {
      console.error('Lỗi renderTrainingPage:', err);
      container.innerHTML = `<p class="text-danger text-center mt-4">Có lỗi xảy ra khi tải dữ liệu: ${err.message}</p>`;
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // 2. TÌM KIẾM KHÓA HỌC (ĐÃ SỬA LỖI KHÔNG TÌM ĐƯỢC)
  window.filterTrainingCourses = function () {
    const input = document.getElementById('training-search');
    if (!input) return;
    const filter = input.value.toLowerCase().trim();
    const cards = document.querySelectorAll(
      '#course-grid-container .course-card'
    );

    cards.forEach((card) => {
      const name = card.getAttribute('data-name') || '';
      card.style.display = name.includes(filter) ? '' : 'none';
    });
  };

  // 3. XÁC NHẬN XÓA KHÓA HỌC (SUPABASE)
  window.deleteCourseConfirm = function (courseId, courseName, event) {
    if (event) event.stopPropagation();

    showToastConfirm(
      `Bạn có chắc chắn muốn xóa khóa học <strong>${courseName}</strong>?`,
      async function () {
        // ✅ Show spinner đúng cách
        if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

        try {
          const { error } = await supabaseClient
            .from('training_courses')
            .delete()
            .eq('id', courseId);

          if (error) throw error;

          showToast('Đã xóa khóa học thành công!', 'success');

          // Refresh UI
          await window.loadTrainingData();
          if (typeof rrtShared.renderTrainingAnalytics === 'function')
            rrtShared.renderTrainingAnalytics();
          await window.renderTrainingPage();
        } catch (err) {
          console.error('Lỗi xóa khóa học:', err);
          showToast('Lỗi: ' + err.message, 'error');
        } finally {
          // ✅ Hide spinner đúng cách
          if (typeof hideLoadingSpinner === 'function') {
            hideLoadingSpinner();
          } else if (typeof showLoadingSpinner === 'function') {
            showLoadingSpinner(false);
          }
        }
      }
    );
  };

  // 3. Mở chi tiết khóa học (Dossier) - CÓ PHÂN QUYỀN
  window.loadTrainingData = async function () {
    try {
      const [coursesRes, recordsRes] = await Promise.all([
        supabaseClient.from('training_courses').select('*'),
        supabaseClient.from('training_records').select('*'),
      ]);

      // Bổ sung lấy workplace_ma_xa để cấp quyền cho Ward Admin
      const userIds = [
        ...new Set(
          (recordsRes.data || [])
            .map((r) => r.profile_id || r.user_id)
            .filter(Boolean)
        ),
      ];
      let profilesMap = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabaseClient
          .from('profiles')
          .select(
            'id, full_name, email, team, position, phone, workplace_ma_xa'
          )
          .in('id', userIds);

        (profiles || []).forEach((p) => {
          profilesMap[p.id] = {
            fullName: p.full_name || 'N/A',
            email: p.email || '',
            team: p.team || 'N/A',
            position: p.position || 'N/A',
            phone: p.phone || '',
            workplace_ma_xa: p.workplace_ma_xa || '',
          };
        });
      }

      const role = (window.userSession?.role || '').toLowerCase();
      const myId = window.userSession?.id;
      const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();

      // Map dữ liệu thô
      let rawRecords = (recordsRes.data || []).map((r) => {
        const pData = profilesMap[r.profile_id || r.user_id] || {};
        return {
          ...r,
          courseId: r.course_id,
          fullName: pData.fullName || 'Chưa cập nhật',
          email: pData.email || '',
          team: pData.team || '',
          phone: pData.phone || '',
          position: pData.position || '',
          workplace_ma_xa: pData.workplace_ma_xa || '',
        };
      });

      // 🚨 CHỐT CHẶN PHÂN QUYỀN 1: Lọc Danh sách học viên (Records)
      let scopedRecords = rawRecords;
      if (role !== 'admin') {
        if (role === 'ward_admin') {
          // Ward admin chỉ quản lý người cùng mã xã
          scopedRecords = rawRecords.filter(
            (r) => String(r.workplace_ma_xa) === myMaXa
          );
        } else {
          // User thường chỉ quản lý chính mình
          scopedRecords = rawRecords.filter(
            (r) => String(r.profile_id || r.user_id) === String(myId)
          );
        }
      }

      // 🚨 CHỐT CHẶN PHÂN QUYỀN 2: Lọc Khóa học (Courses)
      let scopedCourses = coursesRes.data || [];
      if (role !== 'admin') {
        // Chỉ cho phép hiển thị các lớp có chứa ID nằm trong danh sách học viên đã lọc ở trên
        const validCourseIds = [
          ...new Set(
            scopedRecords.map((r) => String(r.course_id || r.courseId))
          ),
        ];
        scopedCourses = scopedCourses.filter((c) =>
          validCourseIds.includes(String(c.id))
        );
      }

      // Lưu vào State toàn cục
      window.appState = window.appState || {};
      window.appState.training = {
        courses: scopedCourses,
        records: scopedRecords,
        profilesMap: profilesMap,
      };
    } catch (err) {
      console.error('Lỗi loadTrainingData:', err);
    }
  };

  // ========================================================================
  // OPEN TRAINING DOSSIER - FIX HIỂN THỊ TÊN HỌC VIÊN
  // ========================================================================
  // ============================================================================
  // openTrainingDossier — CÓ PHÂN QUYỀN XEM + ẨN CHẤM ĐIỂM cho non-admin
  //   • admin      : xem đủ + chấm điểm (select result, ô note, checkbox điểm danh)
  //   • ward_admin : chỉ xem học viên cùng ward, KẾT QUẢ dạng chữ (không sửa được)
  //   • user       : chỉ xem record của chính mình, dạng chữ
  //   Nút "Lưu kết quả" cũng ẩn với non-admin (xử lý ở phần HTML/‌render nút — xem ghi chú cuối).
  // ============================================================================
  window.openTrainingDossier = async function (courseId) {
    if (!window.appState?.training?.courses) {
      await window.loadTrainingData();
    }
    const course = window.appState.training.courses.find(
      (c) => String(c.id) === String(courseId)
    );
    if (!course) {
      showToast('Không tìm thấy khóa học!', 'error');
      return;
    }
    window.currentCourseId = courseId;

    const isAdmin = (window.userSession?.role || '').toLowerCase() === 'admin';

    // UI Switch
    document.getElementById('training-list-view').style.display = 'none';
    document.getElementById('training-dossier-view').classList.add('active');

    // Thông tin khóa học
    document.getElementById('td-title').textContent =
      course.course_name || course.name || 'Không tên';
    document.getElementById('td-date').textContent = course.training_date
      ? new Date(course.training_date).toLocaleDateString('vi-VN')
      : 'Chưa rõ';
    document.getElementById('td-loc').textContent =
      course.location || 'Chưa xác định';
    document.getElementById('td-desc').textContent =
      course.description || course.desc || '';

    // Lấy records của khóa này
    let records = window.appState.training.records.filter(
      (r) => String(r.course_id) === String(courseId)
    );

    // ✅ PHÂN QUYỀN XEM: lọc theo vai trò (admin: tất cả; ward_admin: cùng ward; user: của mình)
    if (typeof window.scopeTrainingRecords === 'function') {
      records = await window.scopeTrainingRecords(
        records,
        window.appState.training.profilesMap
      );
    }

    const tbody = document.getElementById('trainee-list-body');
    tbody.innerHTML = '';

    // Ẩn/hiện nút "Lưu kết quả" theo quyền (nếu nút có id 'btn-save-training')
    const saveBtn = document.getElementById('btn-save-training');
    if (saveBtn) saveBtn.style.display = isAdmin ? '' : 'none';

    if (records.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="text-center text-muted">Chưa có học viên (hoặc không có dữ liệu trong phạm vi của bạn).</td></tr>';
      return;
    }

    // Nhãn kết quả dạng chữ (cho non-admin)
    const resultLabel = (v) =>
      v === 'pass'
        ? '<span class="badge bg-success">Đạt</span>'
        : v === 'fail'
        ? '<span class="badge bg-danger">Không đạt</span>'
        : '<span class="badge bg-secondary">Chờ</span>';

    records.forEach((r) => {
      const fullName = r.fullName || 'Chưa cập nhật';
      const userId = r.profile_id || r.user_id;
      const email = r.email || '';
      const phone = r.phone || '';
      const team = r.team || '';
      const position = r.position || '';

      // Cột điểm danh: admin = checkbox sửa được; non-admin = icon tĩnh
      const attendanceCell = isAdmin
        ? `<input type="checkbox" class="chk-attendance" ${
            r.attendance ? 'checked' : ''
          }>`
        : r.attendance
        ? '<i class="bx bx-check text-success"></i>'
        : '<i class="bx bx-x text-muted"></i>';

      // Cột kết quả: admin = select sửa được; non-admin = badge tĩnh
      const resultCell = isAdmin
        ? `<select class="form-select result-select st-${r.result || 'pending'}"
                 onchange="this.className='form-select result-select st-'+this.value">
           <option value="pending" ${
             r.result === 'pending' ? 'selected' : ''
           }>Chờ</option>
           <option value="pass" ${
             r.result === 'pass' ? 'selected' : ''
           }>Đạt</option>
           <option value="fail" ${
             r.result === 'fail' ? 'selected' : ''
           }>Không đạt</option>
         </select>`
        : resultLabel(r.result);

      // Cột ghi chú: admin = input; non-admin = text tĩnh
      const noteCell = isAdmin
        ? `<input type="text" class="note-input" value="${rrtShared.escapeHtml(
            r.note || ''
          )}">`
        : `<span class="text-muted">${rrtShared.escapeHtml(r.note || '')}</span>`;

      const row = `
      <tr data-userid="${userId}">
        <td><b>${rrtShared.escapeHtml(fullName)}</b></td>
        <td>${rrtShared.escapeHtml(team)}</td>
        <td>${rrtShared.escapeHtml(position)}</td>
        <td>${rrtShared.escapeHtml(phone)}</td>
        <td>${rrtShared.escapeHtml(email)}</td>
        <td class="text-center">${attendanceCell}</td>
        <td>${resultCell}</td>
        <td>${noteCell}</td>
      </tr>`;
      tbody.insertAdjacentHTML('beforeend', row);
    });
  };
  // TỰ ĐỘNG ĐỔI MÀU SELECT KHI MỞ LẠI TRANG HOẶC SAU KHI LƯU
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.result-select').forEach((select) => {
      const value = select.value;
      select.className = 'form-select result-select st-' + value;
    });
  });
  // 4. Đóng chi tiết
  window.closeTrainingDossier = function () {
    document.getElementById('training-dossier-view').classList.remove('active');
    document.getElementById('training-list-view').style.display = 'block';
  };

  // ============================================================================
  // BỘ CHỌN ĐỐI TƯỢNG ĐÀO TẠO (modal Tạo khóa học) — bản chống lỗi
  //   Luồng: chọn Đội (nhiều) + chọn Vị trí (nhiều) → xem trước học viên khớp (AND).
  //   Nguồn người dùng: ưu tiên appState.users → teamData → query profiles.
  // ============================================================================

  const _POSITIONS = [
    { value: 'Leader', label: 'Đội trưởng' },
    { value: 'Epidemic', label: 'Cán bộ Dịch tễ' },
    { value: 'Member', label: 'Cán bộ Lấy mẫu' },
    { value: 'Engineer', label: 'Cán bộ Xử lý môi trường' },
    { value: 'Media', label: 'Cán bộ Truyền thông' },
    { value: 'Logistic', label: 'Hậu cần' },
    { value: 'Driver', label: 'Lái xe' },
  ];

  const _escT = (s) =>
    window.escapeHtml
      ? window.escapeHtml(String(s ?? ''))
      : String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

  // 🚨 1. TÁCH HÀM LỌC ĐỘI RA NGOÀI ĐỂ KHÔNG BỊ "MẤT TRÍ NHỚ" KHI ĐÓNG/MỞ MODAL
  window._audFilterTeams = function (kw) {
    kw = String(kw || '')
      .toLowerCase()
      .trim();
    const wrap = document.getElementById('new-course-team-wrap');
    if (!wrap) return;

    wrap.querySelectorAll('.course-team-chk-item').forEach((item) => {
      const txt = item.textContent.toLowerCase();
      if (txt.includes(kw)) {
        // Bỏ ẩn, trả lại class flex để hiển thị đẹp như cũ
        item.classList.remove('d-none');
        item.classList.add('d-flex');
      } else {
        // 🚨 DÙNG d-none ĐỂ KHẮC CHẾ d-flex CỦA BOOTSTRAP
        item.classList.remove('d-flex');
        item.classList.add('d-none');
      }
    });
  };

  window._getAudienceUsers = async function () {
    if (Array.isArray(window.appState?.users) && window.appState.users.length) {
      return window.appState.users;
    }
    if (
      Array.isArray(window.appState?.teamData) &&
      window.appState.teamData.length
    ) {
      return window.appState.teamData;
    }
    if (typeof window.getInitialData === 'function') {
      try {
        await window.getInitialData();
      } catch (e) {}
      if (Array.isArray(window.appState?.users) && window.appState.users.length)
        return window.appState.users;
      if (
        Array.isArray(window.appState?.teamData) &&
        window.appState.teamData.length
      )
        return window.appState.teamData;
    }
    try {
      const { data } = await window.supabaseClient
        .from('profiles')
        .select('id, full_name, email, team, position, role')
        .not('role', 'in', `(${window.LIMS_ONLY_ROLES.join(',')})`);
      return data || [];
    } catch (e) {
      console.error('[training] Không lấy được danh sách người dùng:', e);
      return [];
    }
  };

  window.renderCourseAudiencePicker = async function () {
    const teamHost = document.getElementById('new-course-team-wrap');
    const roleHost = document.getElementById('new-course-role-wrap');
    if (!teamHost || !roleHost) {
      console.warn(
        '[training] Thiếu #new-course-team-wrap hoặc #new-course-role-wrap.'
      );
      return;
    }
    teamHost.innerHTML =
      '<div class="text-muted small"><span class="spinner-border spinner-border-sm"></span> Đang tải...</div>';

    const users = await window._getAudienceUsers();
    window._audienceUsersCache = users;

    const teams = [
      ...new Set(
        users
          .map((u) => String(u.team || '').trim())
          .filter((t) => t && t !== 'No team')
      ),
    ].sort((a, b) => a.localeCompare(b, 'vi'));

    const wardTeams = teams.filter((t) => /phường|xã|đặc khu/i.test(t));
    const hcdcTeams = teams.filter((t) => !/phường|xã|đặc khu/i.test(t));

    const chk = (cls, val, label) => `
    <label class="d-flex align-items-center gap-2 py-1 px-2 aud-item ${cls}-item" style="cursor:pointer;font-size:13px;">
      <input type="checkbox" class="form-check-input mt-0 ${cls}" value="${_escT(
      val
    )}">
      <span>${_escT(label)}</span>
    </label>`;

    // 🚨 2. GẮN HÀM TÌM KIẾM TRỰC TIẾP VÀO THUỘC TÍNH oninput ĐỂ ĐẢM BẢO LUÔN HOẠT ĐỘNG
    teamHost.innerHTML = `
    <label class="form-label small text-muted d-block mb-1">Chọn Đội (Team) — chọn nhiều</label>
    <div class="d-flex gap-2 mb-2">
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window._audSelectAll('course-team-chk', true)">Chọn tất cả</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window._audSelectAll('course-team-chk', false)">Bỏ chọn</button>
      <input type="text" oninput="window._audFilterTeams(this.value)" class="form-control form-control-sm aud-team-search-input" placeholder="Tìm đội..." style="max-width:150px;">
    </div>
    <div style="max-height:170px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;padding:6px;">
      ${
        hcdcTeams.length
          ? `<div class="fw-bold small text-primary px-2 pt-1 aud-group">Đội HCDC</div>${hcdcTeams
              .map((t) => chk('course-team-chk', t, t))
              .join('')}`
          : ''
      }
      ${
        wardTeams.length
          ? `<div class="fw-bold small text-success px-2 pt-2 aud-group">Đội phường/xã</div>${wardTeams
              .map((t) => chk('course-team-chk', t, t))
              .join('')}`
          : ''
      }
      ${
        teams.length === 0
          ? '<div class="text-muted small px-2">Chưa có đội nào (kiểm tra dữ liệu người dùng).</div>'
          : ''
      }
    </div>`;

    // --- Khối VỊ TRÍ ---
    roleHost.innerHTML = `
    <label class="form-label small text-muted d-block mb-1">Chọn Vị trí (Position) — chọn nhiều</label>
    <div class="d-flex gap-2 mb-2">
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window._audSelectAll('course-role-chk', true)">Chọn tất cả</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window._audSelectAll('course-role-chk', false)">Bỏ chọn</button>
    </div>
    <div style="max-height:170px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;padding:6px;">
      ${_POSITIONS
        .map((p) => chk('course-role-chk', p.value, p.label))
        .join('')}
    </div>`;

    document
      .querySelectorAll('.course-team-chk, .course-role-chk')
      .forEach((c) => c.addEventListener('change', window._audUpdatePreview));

    window._audUpdatePreview();
  };

  window._audSelectAll = function (cls, on) {
    document.querySelectorAll('.' + cls).forEach((c) => {
      const item = c.closest('label');
      // 🚨 3. CHỈ CHECK NHỮNG MỤC ĐANG HIỂN THỊ (không bị ẩn bởi ô tìm kiếm)
      if (!item || !item.classList.contains('d-none')) {
        c.checked = on;
      }
    });
    window._audUpdatePreview();
  };

  window.getSelectedCourseTeams = function () {
    return [...document.querySelectorAll('.course-team-chk:checked')].map(
      (c) => c.value
    );
  };
  window.getSelectedCourseRoles = function () {
    return [...document.querySelectorAll('.course-role-chk:checked')].map(
      (c) => c.value
    );
  };

  window.getCourseAudience = function () {
    const users = Array.isArray(window._audienceUsersCache)
      ? window._audienceUsersCache
      : [];
    const teams = new Set(window.getSelectedCourseTeams());
    const roles = new Set(window.getSelectedCourseRoles());
    const allTeams = teams.size === 0;
    const allRoles = roles.size === 0;

    return users.filter((m) => {
      if (!m.id) return false;
      const t = String(m.team || '').trim();
      const p = String(m.position || m.role || '').trim();
      return (allTeams || teams.has(t)) && (allRoles || roles.has(p));
    });
  };

  window._audUpdatePreview = function () {
    const host = document.getElementById('new-course-audience-preview');
    if (!host) return;
    const list = window.getCourseAudience();
    const posLabel = (v) =>
      _POSITIONS.find((p) => p.value === v)?.label || v || '—';

    if (list.length === 0) {
      host.innerHTML =
        '<div class="alert alert-warning py-2 mb-0 small"><i class="bx bx-error-circle"></i> Không có học viên nào khớp lựa chọn.</div>';
      return;
    }

    const rows = list
      .slice(0, 200)
      .map(
        (m, i) => `<tr>
      <td class="text-muted">${i + 1}</td>
      <td>${_escT(m.full_name || m.email || 'N/A')}</td>
      <td>${_escT(m.team || '—')}</td>
      <td>${_escT(posLabel(m.position || m.role))}</td>
    </tr>`
      )
      .join('');

    host.innerHTML = `
    <div class="small fw-bold text-success mb-1"><i class="bx bx-user-check"></i> Đối tượng được đào tạo: ${
      list.length
    } học viên</div>
    <div style="max-height:220px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:8px;">
      <table class="table table-sm table-hover mb-0" style="font-size:12.5px;">
        <thead class="table-light" style="position:sticky;top:0;"><tr><th style="width:36px;">#</th><th>Họ tên</th><th>Đội</th><th>Vị trí</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${
      list.length > 200
        ? '<div class="small text-muted mt-1">Hiển thị 200/' +
          list.length +
          '.</div>'
        : ''
    }`;
  };
  // 5. Submit tạo khóa học (SUPABASE)

  // ============================================================================
  // submitCreateCourse — dùng ĐÚNG danh sách đối tượng đã xem trước
  //   (getCourseAudience = Team đã chọn AND Vị trí đã chọn). Nhất quán 100%
  //   với danh sách admin nhìn thấy trong khung xem trước.
  // ============================================================================
  window.submitCreateCourse = async function () {
    const name = document.getElementById('new-course-name').value;
    const date = document.getElementById('new-course-date').value;
    const loc = document.getElementById('new-course-loc').value;
    const desc = document.getElementById('new-course-desc')?.value || '';
    const file = document.getElementById('new-course-file')?.value || '';

    if (!name || !date) {
      showToast('Vui lòng nhập tên khóa học và ngày tổ chức.', 'warning');
      return;
    }

    // Đảm bảo có danh sách người dùng
    if (!window.appState?.users?.length) {
      await window.getInitialData?.();
    }

    // Đối tượng = đúng danh sách xem trước (Team AND Vị trí)
    const membersToInsert =
      typeof window.getCourseAudience === 'function'
        ? window.getCourseAudience()
        : [];

    const doCallServer = async () => {
      if (typeof window.closeModal === 'function') {
        window.closeModal('modal-create-course');
      } else {
        const el = document.getElementById('modal-create-course');
        if (el) el.style.display = 'none';
      }
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);
      try {
        const { data: createdCourse, error: courseErr } = await supabaseClient
          .from('training_courses')
          .insert([
            {
              course_name: name,
              training_date: date,
              location: loc,
              description: desc,
              file_url: file,
              status: 'upcoming',
            },
          ])
          .select()
          .single();
        if (courseErr) throw courseErr;

        if (membersToInsert.length > 0 && createdCourse?.id) {
          const recordsData = membersToInsert.map((user) => ({
            course_id: createdCourse.id,
            user_id: user.id,
            profile_id: user.id,
            attendance: false,
            result: 'pending',
            note: '',
          }));
          const { error: recordErr } = await supabaseClient
            .from('training_records')
            .insert(recordsData);
          if (recordErr) throw recordErr;
        }

        showToast(
          `Đã tạo khóa học với ${membersToInsert.length} học viên!`,
          'success'
        );
        await window.loadTrainingData();
        if (typeof window.renderTrainingPage === 'function') {
          await window.renderTrainingPage();
        }
      } catch (err) {
        console.error('Lỗi tạo khóa học:', err);
        showToast('Lỗi: ' + err.message, 'error');
      } finally {
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
        else if (typeof showLoadingSpinner === 'function')
          showLoadingSpinner(false);
      }
    };

    if (membersToInsert.length === 0) {
      showToastConfirm(
        '⚠️ Không có học viên nào khớp lựa chọn. Tạo khóa học rỗng?',
        doCallServer
      );
    } else {
      doCallServer();
    }
  };

  // ============================================================================
  // (B) PHÂN QUYỀN XEM — lọc records theo vai trò (client-side, Bước 1)
  //     • admin      : xem tất cả (giữ nguyên)
  //     • ward_admin : chỉ record của học viên CÙNG ward (workplace_ma_xa)
  //     • user khác  : chỉ record CỦA CHÍNH MÌNH
  //     Gọi hàm này để lọc mảng records trước khi hiển thị/thống kê.
  //     LƯU Ý: đây là lọc GIAO DIỆN. Bảo mật thật cần RLS (Bước 2).
  // ============================================================================
  // ============================================================
  // 3. VÔ HIỆU HÓA BỘ LỌC CŨ (Để tránh xung đột với openTrainingDossier)
  // ============================================================
  window.scopeTrainingRecords = async function (records, profilesMap) {
    // Dữ liệu đã được khóa phân quyền triệt để ở hàm loadTrainingData.
    // Trả về mảng gốc để openTrainingDossier không cần lọc lại nữa.
    return records;
  };
  // 6. Lưu kết quả học tập (SUPABASE)
  window.saveTrainingResultsClick = async function () {
    const rows = document.querySelectorAll('#trainee-list-body tr');
    const updatePromises = [];

    rows.forEach((row) => {
      const userId = row.getAttribute('data-userid'); // Đảm bảo HTML có data-userid="${r.user_id}"
      const attendance = row.querySelector('.chk-attendance').checked;
      const result = row.querySelector('.result-select').value;
      const note = row.querySelector('.note-input').value;

      if (userId) {
        updatePromises.push(
          supabaseClient
            .from('training_records')
            .update({ attendance, result, note })
            .eq('course_id', window.currentCourseId)
            .eq('user_id', userId)
        );
      }
    });

    showLoadingSpinner();
    try {
      await Promise.all(updatePromises);
      showToast('Lưu thành công!', 'success');

      // ✅ Refresh data và UI

      await window.loadTrainingData();
      await window.renderTrainingPage(); // Giả sử hàm này render lại list course
      if (window.currentCourseId)
        await window.openTrainingDossier(window.currentCourseId);
    } catch (err) {
      showToast('Lỗi lưu: ' + err.message, 'error');
    } finally {
      hideLoadingSpinner();
    }
  };
});
