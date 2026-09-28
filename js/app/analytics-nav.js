// ============================================================
// XUẤT EXCEL, PHÂN TÍCH, BÁO CÁO GẦN ĐÂY, TO-DO, ĐIỀU HƯỚNG MENU
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // Chia sẻ cho các file js/app/* khác (trước đây dùng chung 1 closure)
  rrtShared.updateRecentReportsTable = updateRecentReportsTable;
  rrtShared.updateTodoList = updateTodoList;


  // ==========================================
  // TÍNH NĂNG XUẤT EXCEL TỪ SUPABASE (THAY THẾ GAS)
  // ==========================================
  // Sử dụng thư viện SheetJS (XLSX) đã nhúng ở index.html
  // ============================================================================
  // setupExportButton v2 — THAY TRỌN HÀM CŨ
  // Bổ sung cho export RRT-ers (tableName === 'profiles') 4 cột mới:
  //   - nang_luc_dao_tao      : số khóa đào tạo đạt (result = 'pass')
  //   - chi_tiet_dao_tao      : tên các khóa đã đạt
  //   - kinh_nghiem_thuc_chien: số SỰ KIỆN đã tham gia thực chiến
  //                             (deployed/replaced VÀ có confirmed_at — đúng
  //                              quy tắc đã thống nhất: từ chối/chờ không tính)
  //   - chi_tiet_thuc_chien   : tên các sự kiện đã tham gia
  // ============================================================================
  async function setupExportButton(btnSelector, tableName, fileNamePrefix) {
    $(btnSelector)
      .off('click')
      .on('click', async function () {
        const btn = $(this);
        const originalText = btn.html();
        try {
          // 1. Hiệu ứng Loading
          btn
            .prop('disabled', true)
            .html('<i class="bx bx-loader-alt bx-spin"></i> Đang tải...');
          if (typeof showToast === 'function')
            showToast(`Đang truy xuất dữ liệu từ ${tableName}...`, 'info');

          let data = [];

          // 2. Xử lý riêng cho bảng profiles (join kỹ năng + đào tạo + thực chiến)
          if (tableName === 'profiles') {
            // 2a. Fetch profiles
            const { data: profilesData, error: profilesErr } =
              await supabaseClient
                .from('profiles')
                .select('*')
                .not('role', 'in', `(${window.LIMS_ONLY_ROLES.join(',')})`)
                .order('full_name', { ascending: true });
            if (profilesErr) throw profilesErr;
            if (!profilesData || profilesData.length === 0) {
              if (typeof showToast === 'function')
                showToast('Không có dữ liệu để xuất!', 'warning');
              btn.prop('disabled', false).html(originalText);
              return;
            }
            const profileIds = profilesData.map((p) => p.id);

            // 2b. Fetch rrt_qualifications (kỹ năng khai báo)
            const { data: qualsData, error: qualsErr } = await supabaseClient
              .from('rrt_qualifications')
              .select('profile_id, skills')
              .in('profile_id', profileIds);
            if (qualsErr)
              console.warn('⚠️ Warning fetching qualifications:', qualsErr);
            const skillsMap = {};
            (qualsData || []).forEach((q) => {
              skillsMap[q.profile_id] = q.skills || {};
            });

            // 2c. NĂNG LỰC ĐÀO TẠO: đếm khóa result='pass' theo người
            const trainCountMap = {}; // user_id -> số khóa pass
            const trainDetailMap = {}; // user_id -> [tên khóa]
            try {
              const { data: trainRecs, error: trainErr } = await supabaseClient
                .from('training_records')
                .select('profile_id, user_id, result, course_id');
              if (trainErr) throw trainErr;

              // Lấy tên khóa học để ghi cột chi tiết
              const courseIds = [
                ...new Set(
                  (trainRecs || []).map((r) => r.course_id).filter(Boolean)
                ),
              ];
              const courseNameMap = {};
              if (courseIds.length > 0) {
                const { data: courses } = await supabaseClient
                  .from('training_courses')
                  .select('id, course_name')
                  .in('id', courseIds);
                (courses || []).forEach((c) => {
                  courseNameMap[c.id] = c.course_name || '';
                });
              }

              (trainRecs || []).forEach((r) => {
                if (String(r.result || '').toLowerCase() !== 'pass') return;
                const uid = r.profile_id || r.user_id;
                if (!uid) return;
                trainCountMap[uid] = (trainCountMap[uid] || 0) + 1;
                if (!trainDetailMap[uid]) trainDetailMap[uid] = [];
                trainDetailMap[uid].push(
                  courseNameMap[r.course_id] || 'Khóa học'
                );
              });
            } catch (e) {
              console.warn('⚠️ Không tải được dữ liệu đào tạo:', e);
            }

            // 2d. KINH NGHIỆM THỰC CHIẾN: deployed/replaced + confirmed_at,
            //     đếm theo SỰ KIỆN duy nhất (không đếm trùng 1 vụ nhiều dòng)
            const combatSetMap = {}; // user_id -> Set(incident_id)
            const combatDetailMap = {}; // user_id -> [tên sự kiện]
            try {
              const { data: deps, error: depErr } = await supabaseClient
                .from('deployment_history')
                .select('user_id, incident_id, action_type, confirmed_at');
              if (depErr) throw depErr;

              const validDeps = (deps || []).filter(
                (h) =>
                  (h.action_type === 'deployed' ||
                    h.action_type === 'replace_in') &&
                  h.confirmed_at &&
                  h.incident_id &&
                  h.user_id
              );

              // Lấy tên sự kiện cho cột chi tiết
              const incIds = [...new Set(validDeps.map((h) => h.incident_id))];
              const incNameMap = {};
              if (incIds.length > 0) {
                const { data: incs } = await supabaseClient
                  .from('incidents')
                  .select('id, event_name')
                  .in('id', incIds);
                (incs || []).forEach((i) => {
                  incNameMap[String(i.id)] =
                    i.event_name || `#${String(i.id).substring(0, 5)}`;
                });
              }

              validDeps.forEach((h) => {
                if (!combatSetMap[h.user_id])
                  combatSetMap[h.user_id] = new Set();
                // Set tự khử trùng: 1 sự kiện chỉ tính 1 lần/người
                if (!combatSetMap[h.user_id].has(h.incident_id)) {
                  combatSetMap[h.user_id].add(h.incident_id);
                  if (!combatDetailMap[h.user_id])
                    combatDetailMap[h.user_id] = [];
                  const label =
                    h.action_type === 'replace_in' ? ' (được thay thế)' : '';
                  combatDetailMap[h.user_id].push(
                    (incNameMap[String(h.incident_id)] || 'Sự kiện') + label
                  );
                }
              });
            } catch (e) {
              console.warn('⚠️ Không tải được dữ liệu thực chiến:', e);
            }

            // 2e. Merge profiles + skills + đào tạo + thực chiến
            data = profilesData.map((profile) => {
              const skills = skillsMap[profile.id] || {};
              const flattenedSkills = {
                skill_ungpho_has: skills.emergency_response?.has_skill || false,
                skill_ungpho_level: skills.emergency_response?.level || '',
                skill_ruiro_has: skills.risk_communication?.has_skill || false,
                skill_ruiro_level: skills.risk_communication?.level || '',
                skill_tamly_has: skills.psycho_social?.has_skill || false,
                skill_tamly_level: skills.psycho_social?.level || '',
                skill_dulieu_has: skills.data_management?.has_skill || false,
                skill_dulieu_level: skills.data_management?.level || '',
                skill_dichte_has: skills.epidemiology?.has_skill || false,
                skill_dichte_level: skills.epidemiology?.level || '',
                skill_nhiemtrung_has:
                  skills.infection_control?.has_skill || false,
                skill_nhiemtrung_level: skills.infection_control?.level || '',
                skill_thinghiem_has: skills.lab?.has_skill || false,
                skill_thinghiem_level: skills.lab?.level || '',
                skill_haucan_has: skills.logistics?.has_skill || false,
                skill_haucan_level: skills.logistics?.level || '',
                skill_vanhanh_has:
                  skills.operation_materials?.has_skill || false,
                skill_vanhanh_level: skills.operation_materials?.level || '',
                skill_cabenh_has: skills.case_management?.has_skill || false,
                skill_cabenh_level: skills.case_management?.level || '',
                skill_dinhduong_has: skills.food_management?.has_skill || false,
                skill_dinhduong_level: skills.food_management?.level || '',
                skill_nuoc_has: skills.wash_management?.has_skill || false,
                skill_nuoc_level: skills.wash_management?.level || '',
                skill_nguyhiem_has:
                  skills.hazardous_management?.has_skill || false,
                skill_nguyhiem_level: skills.hazardous_management?.level || '',
                skill_anninh_has:
                  skills.security_management?.has_skill || false,
                skill_anninh_level: skills.security_management?.level || '',
              };

              return {
                ...profile,
                ...flattenedSkills,
                // === 4 CỘT MỚI ===
                nang_luc_dao_tao: trainCountMap[profile.id] || 0,
                chi_tiet_dao_tao: (trainDetailMap[profile.id] || []).join('; '),
                kinh_nghiem_thuc_chien: combatSetMap[profile.id]
                  ? combatSetMap[profile.id].size
                  : 0,
                chi_tiet_thuc_chien: (combatDetailMap[profile.id] || []).join(
                  '; '
                ),
              };
            });
          } else {
            // 3. Fetch bình thường cho các bảng khác
            const { data: normalData, error } = await supabaseClient
              .from(tableName)
              .select('*');
            if (error) throw error;
            data = normalData || [];
          }

          if (data.length === 0) {
            if (typeof showToast === 'function')
              showToast('Không có dữ liệu để xuất!', 'warning');
            return;
          }

          // 4. Dùng SheetJS tạo file Excel
          if (typeof XLSX === 'undefined') {
            throw new Error(
              'Không tìm thấy thư viện SheetJS. Hãy kiểm tra thẻ <script> ở index.html'
            );
          }
          const worksheet = XLSX.utils.json_to_sheet(data);
          const colWidths = Object.keys(data[0] || {}).map((key) => ({
            wch:
              Math.max(
                key.length,
                ...data.map((row) => String(row[key] || '').length)
              ) + 2,
          }));
          worksheet['!cols'] = colWidths;
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

          // 5. Tải file về máy
          const fileName = `${fileNamePrefix}_${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx`;
          XLSX.writeFile(workbook, fileName);

          if (typeof showToast === 'function')
            showToast(`✅ Đã xuất ${data.length} dòng thành công!`, 'success');
        } catch (err) {
          console.error('Lỗi xuất file:', err);
          if (typeof showToast === 'function')
            showToast('Lỗi: ' + err.message, 'error');
        } finally {
          // 6. Trả lại nút ban đầu
          btn.prop('disabled', false).html(originalText);
        }
      });
  }

  // Kích hoạt nút bấm Export khi tải xong trang
  $(document).ready(function () {
    setupExportButton('#btn-export-members', 'profiles', 'RRT_NhanSu');
    setupExportButton(
      '#btn-export-logistics',
      'logistics_logs',
      'RRT_Logistics'
    );
  });

  /**
   * Hàm xử lý khi tải dữ liệu thất bại
   */
  window.onInitialDataFailure = function (error) {
    console.error('❌ LỖI TẢI DỮ LIỆU:', error);
    hideLoadingSpinner();
    showToast('Lỗi cập nhật dữ liệu: ' + (error.message || error), 'error');
  };

  // ============================================================
  // HÀM ĐỒNG BỘ TRACKING (REALTIME)
  // ============================================================

  // Thay vì Polling, chúng ta dùng Realtime của Supabase
  window.initTrackingRealtime = function () {
    if (!window.userSession) return;

    // 1. Lắng nghe thay đổi trên bảng 'incidents'
    const incidentChannel = supabaseClient
      .channel('tracking_incidents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        (payload) => {
          console.log('⚡ Incident update detected:', payload);
          // Refresh dữ liệu Dashboard
          if (typeof window.enterDashboard === 'function')
            window.enterDashboard();
          // Cập nhật lại UI Tracking nếu đang mở
          // forceFetch=true: bắt buộc tải lại từ DB — nếu không, hàm này thấy
          // window.appState.trackingIncidents đã có sẵn dữ liệu (từ lần mở trang
          // trước) nên bỏ qua việc tải mới, khiến sự kiện vừa kích hoạt/thay đổi
          // không hiện ra cho tới khi F5 lại trang.
          if (
            document.getElementById('page-tracking')?.style.display !== 'none'
          ) {
            if (typeof window.renderTrackingPage === 'function')
              window.renderTrackingPage(true);
          }
        }
      )
      .subscribe();

    // 2. Lắng nghe thay đổi trên bảng 'roster_assignments'
    const rosterChannel = supabaseClient
      .channel('tracking_rosters')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roster_assignments' },
        (payload) => {
          console.log('⚡ Roster update detected:', payload);
          if (typeof window.renderTrackingPage === 'function')
            window.renderTrackingPage(true);
        }
      )
      .subscribe();
  };

  /**
   * Helper: Cập nhật danh sách thành viên (PHIÊN BẢN KHÔNG CÒN GOOGLE APPS SCRIPT)
   */
  window.updateDossierMemberList = async function (inc) {
    const memberListEl = document.getElementById('dossier-member-list');
    if (!memberListEl) return;

    // 1. Lấy dữ liệu mới nhất từ Supabase (Đảm bảo không dùng dữ liệu cũ)
    const { data: profiles } = await window.supabaseClient
      .from('profiles')
      .select('*');

    // Tạo Map tra cứu (Map trực tiếp từ data vừa fetch)
    const memberMap = {};
    if (profiles) {
      profiles.forEach((m) => {
        if (m.email) memberMap[m.email.toLowerCase().trim()] = m;
      });
    }

    memberListEl.innerHTML = '';
    const splitEmails = (s) =>
      (s || '')
        .split(';')
        .map((e) => e.trim())
        .filter(Boolean);

    // Nhân sự THAY THẾ được thêm vào sau, không nằm trong danh sách mời ban đầu
    // (initial_selected_members) — nếu chỉ duyệt danh sách mời gốc thì họ sẽ
    // không bao giờ hiện ra dù đã xác nhận/từ chối thật. Gộp thêm mọi email
    // đang có trong members/declined_members để không bỏ sót ai.
    const seenEmails = new Set();
    const invitedEmails = [];
    [
      ...splitEmails(inc.initial_selected_members),
      ...splitEmails(inc.members),
      ...splitEmails(inc.declined_members),
    ].forEach((email) => {
      const key = email.toLowerCase();
      if (!seenEmails.has(key)) {
        seenEmails.add(key);
        invitedEmails.push(email);
      }
    });

    const confirmedStr = (inc.members || '').toLowerCase();
    const declinedStr = (inc.declined_members || '').toLowerCase();

    let countConfirmed = 0,
      countDeclined = 0,
      countPending = 0;

    // 2. Duyệt danh sách
    invitedEmails.forEach((email) => {
      const emailLower = email.toLowerCase();
      const memInfo = memberMap[emailLower];

      // Lấy thông tin từ profiles (nếu có)
      const fullName = memInfo?.full_name || email;
      const teamName = memInfo?.team || 'Chưa phân đội';
      const position = memInfo?.position || 'Thành viên';

      const isMe =
        window.userSession?.email &&
        emailLower === window.userSession.email.toLowerCase();
      const displayName = isMe ? `${fullName} (Tôi)` : fullName;

      // 3. Logic xác định trạng thái (Dùng includes để kiểm tra)
      let status = 'PENDING';
      if (
        confirmedStr.includes(emailLower) ||
        (memInfo?.full_name &&
          confirmedStr.includes(memInfo.full_name.toLowerCase()))
      ) {
        status = 'CONFIRMED';
        countConfirmed++;
      } else if (
        declinedStr.includes(emailLower) ||
        (memInfo?.full_name &&
          declinedStr.includes(memInfo.full_name.toLowerCase()))
      ) {
        status = 'DECLINED';
        countDeclined++;
      } else {
        countPending++;
      }

      const statusConfig = {
        CONFIRMED: { badge: 'bg-success', text: 'Xác nhận', icon: 'bx-check' },
        DECLINED: { badge: 'bg-danger', text: 'Không tham gia', icon: 'bx-x' },
        PENDING: { badge: 'bg-secondary', text: 'Chờ...', icon: 'bx-loader' },
      };
      const st = statusConfig[status];

      memberListEl.insertAdjacentHTML(
        'beforeend',
        `
            <div class="member-row" style="${
              isMe ? 'background-color: #f0f7ff;' : ''
            } padding: 12px; margin-bottom: 8px; display: flex; align-items: center; border-radius: 8px; border: 1px solid #f0f0f0;">
                <div class="me-3 d-flex align-items-center justify-content-center text-white fw-bold rounded"
                     style="width: 40px; height: 40px; background-color: #6c757d;">
                    ${(fullName || 'U').charAt(0).toUpperCase()}
                </div>
                <div style="flex-grow: 1; overflow: hidden;">
                    <div class="fw-bold text-dark">${window.escapeHtml(
                      displayName
                    )}</div>
                    <div style="font-size: 11px; color: #666;">
                        <i class='bx bx-group'></i> ${window.escapeHtml(
                          teamName
                        )} | 
                        <span class="badge bg-light text-dark border">${window.escapeHtml(
                          position
                        )}</span>
                    </div>
                </div>
                <div style="margin-left: 10px;">
                    <span class="badge ${st.badge}"><i class="bx ${
          st.icon
        }"></i> ${st.text}</span>
                </div>
            </div>
        `
      );
    });

    // 4. Cập nhật Panel Thống kê
    const panels = document.querySelectorAll(
      '#tracking-view-dossier .col-static .panel'
    );
    if (panels.length >= 2) {
      panels[1].innerHTML = `
            <h5>📊 Thống kê Phản hồi</h5>
            <div class="d-flex justify-content-between mb-1 text-success"><span><i class='bx bx-check-circle'></i> Xác nhận:</span> <strong>${countConfirmed}</strong></div>
            <div class="d-flex justify-content-between mb-1 text-danger"><span><i class='bx bx-x-circle'></i> Không tham gia:</span> <strong>${countDeclined}</strong></div>
            <div class="d-flex justify-content-between text-secondary border-top pt-2"><span><i class='bx bx-time'></i> Chưa trả lời:</span> <strong>${countPending}</strong></div>
        `;
    }
  };

  // Hàm vẽ biểu đồ và bảng tóm tắt
  /**
   * Renders the analytics charts and summary table based on team data.
   * @param {Array<Object>} teamData - The data array from getTeamRegisterData.
   * @param {string} startDate - The start date for filtering (YYYY-MM-DD).
   * @param {string} endDate - The end date for filtering (YYYY-MM-DD).
   */
  window.renderAnalytics = async function (teamData, startDate, endDate) {
    try {
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      // ==========================================
      // BƯỚC 1: TẢI ĐỘC LẬP 2 BẢNG (Tránh lỗi Join của Supabase)
      // ==========================================
      const [profilesRes, qualRes] = await Promise.all([
        supabaseClient
          .from('profiles')
          .select('*')
          .not('role', 'in', `(${window.LIMS_ONLY_ROLES.join(',')})`),
        supabaseClient.from('rrt_qualifications').select('*'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (qualRes.error) throw qualRes.error;

      let filteredData = profilesRes.data || [];
      const allQuals = qualRes.data || []; // Chứa toàn bộ dữ liệu Kỹ năng, Ngoại ngữ

      // Lọc theo ngày
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        filteredData = filteredData.filter((r) => {
          const regDate = new Date(r.updated_at || r.created_at);
          return regDate >= start && regDate <= end;
        });
      }

      function getColorPalette() {
        return {
          male: '#4361ee',
          female: '#f72585',
          pending: '#fcbf49',
          edit: '#2a9d8f',
          approved: '#2a9d8f',
          academic1: '#83adb5',
          academic2: '  #5e3c58',
          academic3: '#ff0079',
          academicOther: '#f72585',
          levelBeginner: '#4cc9f0',
          levelIntermediate: '#4361ee',
          levelAdvanced: '#3a0ca3',
          levelExpert: '#7209b7',
          academicLevel1: '#4361ee',
          academicLevel2: '#3a0ca3',
          academicLevel3: '#7209b7',
        };
      }
      const colors = getColorPalette();

      if (typeof Highcharts !== 'undefined') {
        Highcharts.setOptions({
          chart: { style: { fontFamily: "'Ubuntu', sans-serif" } },
        });
      }

      // ==========================================
      // KHỞI TẠO BIẾN ĐẾM
      // ==========================================
      const genderCounts = { Male: 0, Female: 0 };
      const statusCounts = { pending: 0, edit: 0, approved: 0 };

      const academicCounts = {
        'Y khoa và Điều dưỡng': 0,
        'Y tế công cộng': 0,
        'Kỹ thuật và Quản lý': 0,
      };
      const academicLevelCounts = {
        'Trung cấp/Cao đẳng': 0,
        'Đại học': 0,
        'Sau Đại học': 0,
      };

      const languageOrder = ['Anh', 'Trung', 'Pháp', 'Nhật', 'Hàn'];
      const languageCounts = { Anh: 0, Trung: 0, Pháp: 0, Nhật: 0, Hàn: 0 };

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

      const skillCounts = {
        'Trình độ ngoại ngữ': {
          beginner: 0,
          intermediate: 0,
          advanced: 0,
          expert: 0,
        },
      };
      Object.values(dbSkillKeys).forEach((skill) => {
        skillCounts[skill] = {
          beginner: 0,
          intermediate: 0,
          advanced: 0,
          expert: 0,
        };
      });

      // ==========================================
      // BƯỚC 2: QUÉT VÀ ĐẾM DỮ LIỆU
      // ==========================================
      filteredData.forEach((r) => {
        // 1. TÌM CHÍNH XÁC QUALIFICATION CỦA NGƯỜI NÀY BẰNG JAVASCRIPT
        const qual = allQuals.find((q) => q.profile_id === r.id) || {};

        // Giới tính & Trạng thái
        const gender = (r.gender || '').toLowerCase();
        if (gender === 'male' || gender === 'nam') genderCounts.Male++;
        else if (gender === 'female' || gender === 'nữ') genderCounts.Female++;

        const statusKey = (r.approval_status || 'pending').toLowerCase();
        if (statusCounts.hasOwnProperty(statusKey)) statusCounts[statusKey]++;

        // Chuyên môn & Cấp bậc
        const specRaw = (qual.specialty || r.academic || '')
          .trim()
          .toLowerCase();
        if (
          specRaw.includes('y khoa') ||
          specRaw.includes('điều dưỡng') ||
          specRaw.includes('dược')
        )
          academicCounts['Y khoa và Điều dưỡng']++;
        else if (specRaw.includes('công cộng'))
          academicCounts['Y tế công cộng']++;
        else if (specRaw.includes('kỹ thuật') || specRaw.includes('quản lý'))
          academicCounts['Kỹ thuật và Quản lý']++;

        const levelRaw = (qual.academic_level || r.academic_level || '')
          .trim()
          .toLowerCase();
        if (levelRaw.includes('trung cấp') || levelRaw.includes('cao đẳng'))
          academicLevelCounts['Trung cấp/Cao đẳng']++;
        else if (levelRaw === 'đại học') academicLevelCounts['Đại học']++;
        else if (
          levelRaw.includes('sau đại học') ||
          levelRaw.includes('thạc sĩ') ||
          levelRaw.includes('tiến sĩ')
        )
          academicLevelCounts['Sau Đại học']++;

        // Ngoại ngữ
        const languageRaw = (qual.languages || '').trim();
        if (languageRaw) {
          const capLang =
            languageRaw.charAt(0).toUpperCase() +
            languageRaw.slice(1).toLowerCase();
          if (languageCounts.hasOwnProperty(capLang)) languageCounts[capLang]++;
        }

        // Kỹ năng JSONB
        if (
          qual.languages_level &&
          levels.includes(qual.languages_level.toLowerCase())
        ) {
          skillCounts['Trình độ ngoại ngữ'][
            qual.languages_level.toLowerCase()
          ]++;
        }

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
            skillCounts[viName][s.level.toLowerCase()]++;
          }
        });
      });

      // ==========================================
      // BƯỚC 3: VẼ BIỂU ĐỒ (KÈM BÁO LỖI NẾU TRỐNG)
      // ==========================================

      // Biểu đồ Giới tính
      const genderData = ['Male', 'Female'].map((g) => ({
        name: g,
        y: genderCounts[g],
        color: colors[g.toLowerCase()],
      }));
      if (genderData.some((d) => d.y > 0)) {
        Highcharts.chart('genderDistributionChart', {
          chart: { type: 'pie', backgroundColor: 'transparent' },
          title: { text: 'Phân bố thành viên theo giới tính' },
          series: [{ name: 'Số lượng', colorByPoint: true, data: genderData }],
          credits: { enabled: false },
        });
      } else {
        $('#genderDistributionChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu giới tính.</p>'
        );
      }

      // Biểu đồ Trạng thái
      const statusOrder = ['pending', 'edit', 'approved'];
      const statusData = statusOrder.map((s) => ({
        name: s,
        y: statusCounts[s],
        color: colors[s] || '#ccc',
      }));
      const totalMembers = Object.values(statusCounts).reduce(
        (a, b) => a + b,
        0
      );
      if (totalMembers > 0) {
        Highcharts.chart('statusDistributionChart', {
          chart: { type: 'column', backgroundColor: 'transparent' },
          title: { text: 'Tình trạng nhân sự RRT' },
          xAxis: { categories: [...statusOrder, 'Total'] },
          yAxis: { allowDecimals: false },
          legend: { enabled: false },
          series: [
            {
              name: 'Members',
              data: [
                ...statusData,
                { name: 'Total', y: totalMembers, color: '#03396c' },
              ],
              colorByPoint: true,
            },
          ],
          credits: { enabled: false },
        });
      } else {
        $('#statusDistributionChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu trạng thái.</p>'
        );
      }

      // Biểu đồ Chuyên môn
      const academicData = [
        'Y khoa và Điều dưỡng',
        'Y tế công cộng',
        'Kỹ thuật và Quản lý',
      ].map((s, i) => ({
        name: s,
        y: academicCounts[s],
        color: colors[`academic${i + 1}`],
      }));
      if (academicData.some((d) => d.y > 0)) {
        Highcharts.chart('academicSpecializationChart', {
          chart: { type: 'pie', backgroundColor: 'transparent' },
          title: { text: 'Phân bố theo chuyên môn' },
          series: [
            { name: 'Thành viên', colorByPoint: true, data: academicData },
          ],
          credits: { enabled: false },
        });
      } else {
        $('#academicSpecializationChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu chuyên môn.</p>'
        );
      }

      // Biểu đồ Cấp bậc
      const academicLevelData = [
        'Trung cấp/Cao đẳng',
        'Đại học',
        'Sau Đại học',
      ].map((l, i) => ({
        name: l,
        y: academicLevelCounts[l],
        color: colors[`academicLevel${i + 1}`],
      }));
      if (academicLevelData.some((d) => d.y > 0)) {
        Highcharts.chart('academicLevelChart', {
          chart: { type: 'pie', backgroundColor: 'transparent' },
          title: { text: 'Phân bố theo trình độ học vấn' },
          series: [
            { name: 'Thành viên', colorByPoint: true, data: academicLevelData },
          ],
          credits: { enabled: false },
        });
      } else {
        $('#academicLevelChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu cấp bậc.</p>'
        );
      }

      // Biểu đồ Ngoại ngữ
      const languageData = languageOrder.map((l, i) => ({
        name: l,
        y: languageCounts[l],
        color: Highcharts.getOptions().colors[i] || '#ccc',
      }));
      if (languageData.some((d) => d.y > 0)) {
        Highcharts.chart('languageChart', {
          chart: { type: 'pie', backgroundColor: 'transparent' },
          title: { text: 'Phân bố theo ngoại ngữ' },
          series: [
            { name: 'Thành viên', colorByPoint: true, data: languageData },
          ],
          credits: { enabled: false },
        });
      } else {
        $('#languageChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu ngoại ngữ.</p>'
        );
      }

      // Biểu đồ Cấp bậc Kỹ năng & Bảng
      const chartCategories = Object.keys(skillCounts);
      const chartSeries = levels.map((level) => ({
        name: level.charAt(0).toUpperCase() + level.slice(1),
        data: chartCategories.map((skill) => skillCounts[skill][level]),
        color:
          colors[`level${level.charAt(0).toUpperCase() + level.slice(1)}`] ||
          '#cccccc',
      }));

      const hasAnySkillData = chartSeries.some((series) =>
        series.data.some((val) => val > 0)
      );

      if (hasAnySkillData) {
        Highcharts.chart('teamLevelChart', {
          chart: { type: 'column', backgroundColor: 'transparent' },
          title: { text: 'Phân bố trình độ kỹ năng' },
          xAxis: { categories: chartCategories },
          yAxis: { allowDecimals: false, stackLabels: { enabled: true } },
          plotOptions: { column: { stacking: 'normal', borderRadius: 3 } },
          series: chartSeries,
          credits: { enabled: false },
        });

        let tableHtml = `<h4 class="mt-4 analytics-subtitle">Bảng thống kê chi tiết</h4><div class="table-responsive"><table class="table table-striped table-bordered analytics-table"><thead class="table-warning"><tr><th>Kỹ năng</th><th>Cơ bản</th><th>Trung cấp</th><th>Nâng cao</th><th>Chuyên gia</th></tr></thead><tbody>`;
        Object.entries(skillCounts).forEach(([skill, counts]) => {
          if (levels.some((l) => counts[l] > 0)) {
            tableHtml += `<tr><td>${skill}</td><td>${counts.beginner}</td><td>${counts.intermediate}</td><td>${counts.advanced}</td><td>${counts.expert}</td></tr>`;
          }
        });
        tableHtml += '</tbody></table></div>';
        $('#detailedSummaryTable').html(tableHtml);
      } else {
        $('#teamLevelChart').html(
          '<p class="no-data-message mt-4 text-center">Không có dữ liệu về trình độ kỹ năng.</p>'
        );
        $('#detailedSummaryTable').html('');
      }

      // Bảng Tóm tắt
      const summaryData = {
        'Tổng số thành viên': filteredData.length,
        ...Object.fromEntries(
          statusOrder.map((cat) => [`Tình trạng: ${cat}`, statusCounts[cat]])
        ),
        ...Object.fromEntries(
          Object.keys(genderCounts).map((gender) => [
            `Giới tính: ${gender}`,
            genderCounts[gender],
          ])
        ),
      };
      let summaryHtml =
        '<h4 class="mt-4 analytics-subtitle">Tóm tắt thành viên</h4><div class="table-responsive"><table class="table table-hover table-bordered analytics-table"><thead class="table-secondary"><tr><th>Số liệu</th><th>Giá trị</th></tr></thead><tbody>';
      Object.entries(summaryData).forEach(([key, value]) => {
        summaryHtml += `<tr><td>${key}</td><td><strong>${value}</strong></td></tr>`;
      });
      summaryHtml += '</tbody></table></div>';
      $('#summaryTable').html(summaryHtml);
    } catch (error) {
      console.error('Lỗi renderAnalytics:', error);
      showToast('Đã xảy ra lỗi khi hiển thị phân tích.', 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };
  // --- Giữ nguyên các hàm helper khác như animateCounters, loadRecentReportsAndTodos, updateRecentReportsTable, updateTodoList ---

  // --- Helper Functions for UI Updates (Client-side) ---

  // =================================================================
  // CẬP NHẬT BẢNG BÁO CÁO GẦN ĐÂY
  // =================================================================
  function updateRecentReportsTable(reports) {
    const tbody = document.getElementById('recent-report-body');
    tbody.innerHTML = '';

    if (!reports || reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Không có hồ sơ gần đây.</td></tr>`;
      return;
    }

    reports.forEach((report) => {
      const row = document.createElement('tr');

      const name = report.full_name || 'Chưa cập nhật';
      const date = new Date(
        report.updated_at || report.created_at || Date.now()
      ).toLocaleDateString('vi-VN');
      const shortId = report.id ? String(report.id).substring(0, 8) : '';

      // Sửa lỗi trường hợp approval_status bị null, rỗng hoặc chứa chữ 'none'
      let rawStatus = report.approval_status;
      if (
        rawStatus === null ||
        rawStatus === undefined ||
        rawStatus === '' ||
        rawStatus === 'none'
      ) {
        rawStatus = 'pending'; // Ép về pending thay vì hiện chữ none
      }
      const status = rawStatus;

      row.innerHTML = `
            <td data-label="User"><b>${
              window.escapeHtml ? window.escapeHtml(name) : name
            }</b></td>
            <td data-label="Date" class="text-center">${date}</td>
            <td data-label="Report ID" class="text-center"><small class="text-muted">${shortId}...</small></td>
            <td data-label="Status" class="text-center">
                <span class="status ${rrtShared.getStatusClassClient(
                  status
                )}">${rrtShared.getStatusTextClient(status)}</span>
            </td>
            <td data-label="Action" class="text-center">
                <div class="btn-group" role="group">
                    <button type="button" class="btn btn-sm btn-info text-white" onclick="viewReport('${
                      report.id
                    }')" title="Xem & Cập nhật">
                        <i class='bx bx-show-alt'></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-warning" 
                    onclick="window.openEditModal('${report.id}')"
                            title="Yêu cầu chỉnh sửa">
                        <i class='bx bx-error'></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-success" 
                            onclick="approveReport('${report.id}')" 
                            title="Phê duyệt">
                        <i class='bx bx-check'></i>
                    </button>
                </div>
            </td>
        `;
      tbody.appendChild(row);
    });
  }

  // =================================================================
  // CẬP NHẬT DANH SÁCH VIỆC CẦN LÀM (TO-DO LIST)
  // =================================================================
  function updateTodoList(todos) {
    const listContainer = document.getElementById('todo-list');
    listContainer.innerHTML = '';

    if (!todos || todos.length === 0) {
      listContainer.style.display = 'block';
      listContainer.innerHTML = `<li class="not-completed" style="list-style:none;"><p>Không có tác vụ nào</p></li>`;
      return;
    }

    // CHIA CỘT BẰNG CSS GRID
    listContainer.style.display = 'grid';
    listContainer.style.gridTemplateColumns =
      'repeat(auto-fit, minmax(250px, 1fr))';
    listContainer.style.gap = '20px';
    listContainer.style.padding = '0';

    // GOM NHÓM DỮ LIỆU
    const groups = todos.reduce(
      (acc, item) => {
        // Làm sạch và đồng nhất status thành chữ thường để so sánh
        let rawStatus = item.approval_status || item.status || '';
        if (rawStatus === 'none' || rawStatus === null) rawStatus = ''; // Ép các giá trị lạ về rỗng
        const status = String(rawStatus).toLowerCase().trim();

        const text = item.text || `Hồ sơ: ${item.full_name || 'Không tên'}`;
        const isDone = item.done || status === 'approved';
        const task = { text, done: isDone };

        // Phân loại: Chỉ những status có giá trị cụ thể mới vào 2 cột đầu
        if (status === 'pending') {
          acc.pending.push(task);
        } else if (status === 'edit') {
          acc.edit.push(task);
        } else {
          // Còn lại (đã approved, hoặc dữ liệu bị trống/none từ xa xưa) cho vào cột Đã xử lý
          acc.other.push(task);
        }

        return acc;
      },
      { pending: [], edit: [], other: [] }
    );

    const columnsConfig = [
      {
        id: 'pending',
        title: '💡 Đang chờ phê duyệt',
        data: groups.pending,
        className: 'status-pending',
      },
      {
        id: 'edit',
        title: '🪔 Yêu cầu sửa đổi',
        data: groups.edit,
        className: 'status-edit',
      },
      { id: 'other', title: '✅ Đã xử lý', data: groups.other, className: '' },
    ];

    // RENDER CÁC CỘT
    columnsConfig.forEach((col) => {
      if (col.data.length === 0) return;

      const colDiv = document.createElement('div');
      colDiv.className = 'todo-column';
      colDiv.style.background = 'var(--light)';
      colDiv.style.padding = '15px';
      colDiv.style.borderRadius = '12px';
      colDiv.style.listStyle = 'none';

      // 1. TẠO THANH TIÊU ĐỀ CÓ THỂ CLICK ĐỂ THU GỌN
      const headerWrapper = document.createElement('div');
      headerWrapper.style.display = 'flex';
      headerWrapper.style.justifyContent = 'space-between';
      headerWrapper.style.alignItems = 'center';
      headerWrapper.style.cursor = 'pointer';
      headerWrapper.style.marginBottom = '15px';
      headerWrapper.style.userSelect = 'none';

      const headerTitle = document.createElement('h6');
      headerTitle.style.margin = '0';
      headerTitle.innerHTML = `<strong>${col.title}</strong> <span style="opacity: 0.6; font-size: 0.9em;">(${col.data.length})</span>`;

      const toggleIcon = document.createElement('i');
      toggleIcon.className = 'bx bx-chevron-down';
      toggleIcon.style.fontSize = '24px';
      toggleIcon.style.transition = 'transform 0.3s ease';

      headerWrapper.appendChild(headerTitle);
      headerWrapper.appendChild(toggleIcon);
      colDiv.appendChild(headerWrapper);

      // 2. TẠO HỘP CHỨA TÁC VỤ VÀ ĐỔ DỮ LIỆU VÀO
      const tasksWrapper = document.createElement('div');

      col.data.forEach((todo) => {
        const taskCard = document.createElement('div');

        const taskClass =
          col.id === 'other'
            ? todo.done
              ? 'completed'
              : 'not-completed'
            : `not-completed ${col.className}`;

        taskCard.className = `task-card ${taskClass}`;
        taskCard.style.padding = '12px';
        taskCard.style.marginBottom = '10px';
        taskCard.style.backgroundColor = '#fff';
        taskCard.style.borderRadius = '8px';
        taskCard.style.borderLeft = '4px solid var(--blue)';
        taskCard.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';

        taskCard.innerHTML = `<p style="margin:0; font-size: 14px; font-weight: 500;">${todo.text}</p>`;
        tasksWrapper.appendChild(taskCard);
      });

      colDiv.appendChild(tasksWrapper);

      // 3. GẮN SỰ KIỆN CLICK ĐỂ ẨN/HIỆN
      let isCollapsed = false;
      headerWrapper.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
          tasksWrapper.style.display = 'none';
          toggleIcon.style.transform = 'rotate(-90deg)';
        } else {
          tasksWrapper.style.display = 'block';
          toggleIcon.style.transform = 'rotate(0deg)';
        }
      });

      listContainer.appendChild(colDiv);
      if (col.id === 'other') {
        headerWrapper.click(); // Thu gọn cột "Đã xử lý" theo mặc định
      }
    });
  }

  // =================================================================
  // GET STATUS BADGE CLASS
  // =================================================================
  function getStatusBadgeClass(status) {
    if (!status) return 'pending';
    switch (status.toLowerCase()) {
      case 'on duty':
        return 'approved';
      case 'off duty':
        return 'pending';
      case 'available':
        return 'pending';
      case 'deploy':
        return 'approved';
      default:
        return 'pending';
    }
  }

  const sectionMap = [
    'page-dashboard',
    'page-datatable',
    'page-roster',
    'page-emergency',
    'page-tracking',
    'page-team',
    'page-training',
    'page-logistics',
    'page-library',
    'page-map',
    'page-lab-admin',
    'page-notification',
  ];
  const sideMenuItems = document.querySelectorAll('#sidebar .side-menu.top li');

  /**
   * Hàm hiển thị Section & Quản lý Polling (HOÀN CHỈNH)
   */
  window.showSectionById = async function (targetId) {
    // 1. Tắt poller cũ
    if (typeof stopDashboardPoller === 'function') stopDashboardPoller();
    if (typeof stopTrackingPoller === 'function') stopTrackingPoller();

    // 2. Cập nhật Sidebar UI
    document
      .querySelectorAll('#sidebar .side-menu li')
      .forEach((li) => li.classList.remove('active'));
    const activeLink = document.querySelector(
      `#sidebar .side-menu a[data-target="${targetId}"]`
    );
    if (activeLink) activeLink.parentElement.classList.add('active');

    // 3. Ẩn/Hiện trang
    const allPages = document.querySelectorAll('main > div[id^="page-"]');
    allPages.forEach((page) => (page.style.display = 'none'));

    const targetEl = document.getElementById(targetId);
    if (!targetEl) {
      console.error('Không tìm thấy trang ID:', targetId);
      return;
    }

    targetEl.style.display = 'block';

    // 4. Render nội dung (Sử dụng await cho các hàm async)
    switch (targetId) {
      case 'page-dashboard':
        if (typeof renderDashboard === 'function') renderDashboard();

        if (typeof startDashboardPoller === 'function') startDashboardPoller();
        break;
      case 'page-map':
        // [QUAN TRỌNG] Dùng await ở đây vì renderMapPage là async
        await rrtShared.renderMapPage();
        break;
      case 'page-lab-admin':
        renderLabAdminPage();
        break;
      case 'page-notification':
        renderMessageTable();

        break;
      case 'page-library':
        if (typeof renderLibraryPage === 'function') renderLibraryPage();
        break;
      case 'page-logistics':
        if (typeof renderLogisticsPage === 'function') renderLogisticsPage();
        break;
      case 'page-training':
        if (typeof renderTrainingPage === 'function') renderTrainingPage();
        break;
      case 'page-team':
        if (typeof renderTeamPage === 'function') renderTeamPage();
        break;

      // ... Các case khác giữ nguyên ...
      default:
        // Các trang đơn giản không cần async
        const renderFnName =
          'render' +
          targetId.replace('page-', '').charAt(0).toUpperCase() +
          targetId.replace('page-', '').slice(1) +
          'Page';
        if (typeof window[renderFnName] === 'function') window[renderFnName]();
        break;
    }
  };

  // --- XỬ LÝ CLICK MENU (SỬA LỖI LỆCH INDEX) ---
  const allSideMenuLinks = document.querySelectorAll(
    '#sidebar .side-menu.top li a'
  );

  allSideMenuLinks.forEach((link) => {
    link.addEventListener('click', function (e) {
      e.preventDefault();

      // 1. Lấy ID trang mục tiêu từ HTML
      const targetId = this.getAttribute('data-target');

      // 2. Xử lý Active class (Giao diện)
      const li = this.parentElement;
      document
        .querySelectorAll('#sidebar .side-menu.top li')
        .forEach((i) => i.classList.remove('active'));
      li.classList.add('active');

      // 3. Gọi hàm chuyển trang theo ID (Không dùng index nữa)
      showSectionById(targetId);
    });
  });
});
