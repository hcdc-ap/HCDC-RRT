// ============================================================
// HỒ SƠ RRT — Form tạo/sửa/xem hồ sơ, in PDF, xuất Excel
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // ==========================================
  // HÀM MỞ VÀ ĐIỀN DỮ LIỆU VÀO FORM (TỐI ƯU & BỌC THÉP)
  // ==========================================
  // ==============================================================
  // HÀM HỖ TRỢ: TẢI VÀ ĐỔ DỮ LIỆU LỊCH SỬ (ĐỂ NGOÀI CHO GỌN)
  // ==============================================================
  async function fetchAndRenderProfileHistory(userId) {
    if (!userId) {
      console.warn('Không có userId, bỏ qua fetch lịch sử.');
      return;
    }

    const trainingBody = document.getElementById('profile-training-body');
    const expBody = document.getElementById('profile-rrt-exp-body');

    if (trainingBody)
      trainingBody.innerHTML =
        '<tr><td colspan="4" class="text-center text-muted">Đang tải dữ liệu...</td></tr>';
    if (expBody)
      expBody.innerHTML =
        '<tr><td colspan="4" class="text-center text-muted">Đang tải dữ liệu...</td></tr>';

    try {
      // 1. TẢI DỮ LIỆU ĐIỀU ĐỘNG
      const { data: expHistory, error: expErr } = await window.supabaseClient
        .from('deployment_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (expErr) throw expErr;

      let finalExpHistory = expHistory || [];
      if (finalExpHistory.length > 0) {
        const incidentIds = [
          ...new Set(finalExpHistory.map((h) => h.incident_id).filter(Boolean)),
        ];
        if (incidentIds.length > 0) {
          const { data: incData } = await window.supabaseClient
            .from('incidents')
            .select('id, event_name, status')
            .in('id', incidentIds);

          if (incData) {
            finalExpHistory = finalExpHistory.map((h) => {
              const match = incData.find((i) => i.id === h.incident_id);
              return { ...h, incident_info: match || null };
            });
          }
        }
      }

      // 2. TẢI DỮ LIỆU ĐÀO TẠO
      const { data: trainingHistory, error: trainErr } =
        await window.supabaseClient
          .from('training_records')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

      if (trainErr) throw trainErr;

      let finalTrainHistory = trainingHistory || [];
      if (finalTrainHistory.length > 0) {
        const courseIds = [
          ...new Set(finalTrainHistory.map((h) => h.course_id).filter(Boolean)),
        ];
        if (courseIds.length > 0) {
          const { data: courseData } = await window.supabaseClient
            .from('training_courses')
            .select('id, course_name, training_date, description, status')
            .in('id', courseIds);

          if (courseData) {
            finalTrainHistory = finalTrainHistory.map((h) => {
              const match = courseData.find((c) => c.id === h.course_id);
              return { ...h, course_info: match || null };
            });
          }
        }
      }

      // 3. ĐỔ DỮ LIỆU RA GIAO DIỆN
      if (trainingBody) {
        trainingBody.innerHTML = '';
        if (finalTrainHistory.length === 0) {
          trainingBody.innerHTML =
            '<tr><td colspan="4" class="text-center text-muted">Chưa có dữ liệu.</td></tr>';
        } else {
          finalTrainHistory.forEach((h) => {
            const courseInfo = h.course_info || {};
            const courseName =
              courseInfo.course_name || 'Khóa học không tồn tại';
            const rawDate = courseInfo.training_date || h.created_at;
            const dateStr = rawDate
              ? new Date(rawDate).toLocaleDateString('vi-VN')
              : 'N/A';
            const noteStr = h.note || courseInfo.description || '';

            const statusVal = (
              h.result ||
              courseInfo.status ||
              ''
            ).toLowerCase();
            let badgeClass = 'bg-warning text-dark';
            let displayStatus = 'Đang xử lý';

            if (['pass', 'completed', 'open'].includes(statusVal)) {
              badgeClass = 'bg-success';
              displayStatus = statusVal === 'open' ? 'Đang mở' : 'Hoàn thành';
            } else if (statusVal === 'fail') {
              badgeClass = 'bg-danger';
              displayStatus = 'Chưa đạt';
            }

            trainingBody.insertAdjacentHTML(
              'beforeend',
              `
              <tr>
                  <td>${window.escapeHtml?.(courseName) || courseName}</td>
                  <td>${dateStr}</td>
                  <td><span class="badge ${badgeClass}">${displayStatus}</span></td>
                  <td><small>${
                    window.escapeHtml?.(noteStr) || noteStr
                  }</small></td>
              </tr>
            `
            );
          });
        }
      }

      if (expBody) {
        expBody.innerHTML = '';
        if (finalExpHistory.length === 0) {
          expBody.innerHTML =
            '<tr><td colspan="4" class="text-center text-muted">Chưa có nhiệm vụ.</td></tr>';
        } else {
          finalExpHistory.forEach((h) => {
            const incInfo = h.incident_info || {};
            const eventName = incInfo.event_name || 'Sự kiện không tồn tại';
            const incidentIdStr = h.incident_id
              ? String(h.incident_id).substring(0, 8)
              : 'N/A';

            const ACTION_UI = {
              deployed: { label: 'Tham gia', cls: 'bg-success' },
              replace_in: { label: 'Được thay thế', cls: 'bg-secondary' },
              declined: { label: 'Không thể tham gia', cls: 'bg-danger' },
            };
            const aUI = ACTION_UI[h.action_type] || {
              label: h.action_type || 'Khác',
              cls: 'bg-light text-dark border',
            };
            const role = aUI.label;
            const isParticipated =
              (h.action_type === 'deployed' ||
                h.action_type === 'replace_in') &&
              h.confirmed_at;

            const notes = h.reason || '';
            const startDate = h.created_at
              ? new Date(h.created_at).toLocaleDateString('vi-VN')
              : 'N/A';
            const incidentStatus = (incInfo.status || '').toLowerCase();

            let actionBadge;
            if (h.action_type === 'declined') {
              actionBadge = '<span class="badge bg-danger">❌ Không thể tham gia</span>';
            } else if (!isParticipated) {
              actionBadge =
                '<span class="badge bg-warning text-dark">⏳ Chờ xác nhận</span>';
            } else if (incidentStatus === 'active') {
              actionBadge =
                '<span class="badge bg-success">🔥 Đang tham gia</span>';
            } else {
              actionBadge =
                '<span class="badge bg-primary">🏁 Hoàn thành</span>';
            }

            expBody.insertAdjacentHTML(
              'beforeend',
              `
              <tr>
                  <td><b>${
                    window.escapeHtml?.(eventName) || eventName
                  }</b><br><small class="text-muted">#${incidentIdStr}</small></td>
                  <td><b>${window.escapeHtml?.(role) || role}</b></td>
                  <td class="text-center">${actionBadge}</td>
                  <td><b>${startDate}</b><br><small class="text-muted">${
                window.escapeHtml?.(notes) || notes
              }</small></td>
              </tr>
            `
            );
          });
        }
      }
    } catch (error) {
      console.error('Lỗi khi fetch dữ liệu lịch sử:', error);
      if (trainingBody)
        trainingBody.innerHTML =
          '<tr><td colspan="4" class="text-center text-danger">Lỗi tải dữ liệu.</td></tr>';
      if (expBody)
        expBody.innerHTML =
          '<tr><td colspan="4" class="text-center text-danger">Lỗi tải dữ liệu.</td></tr>';
    }
  }

  // ========================================================================
  // VIEW REPORT - FIX: Schema + Null Safety + Error Handling + UX
  // ========================================================================
  window.viewReport = async function (profileId) {
    console.log('🔍 [viewReport] Starting with profileId:', profileId);

    // ✅ 1. VALIDATE INPUT
    if (!profileId || profileId === 'undefined' || profileId === '') {
      console.warn('⚠️ [viewReport] Invalid profileId');
      showToast('ID Hồ sơ không hợp lệ.', 'error');
      return;
    }

    // ✅ 2. SHOW LOADING
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {
      console.log('📡 [viewReport] Fetching data from Supabase...');

      // ✅ 3. FETCH DATA IN PARALLEL - CHỈ LẤY CỘT CÓ TRONG SCHEMA
      const [profileRes, qualRes] = await Promise.all([
        window.supabaseClient
          .from('profiles')
          .select(
            `
          id, email, full_name, phone, role, team, position,
          department, deployment_status, approval_status,
          updated_at, created_at, academic, academic_level,
          languages, languages_level, employeestatus,
          ward, address, dob, gender, fax, edit_comment, workplace_ward
        `
          )
          .eq('id', profileId)
          .maybeSingle(), // ✅ Dùng maybeSingle để tránh lỗi nếu không tìm thấy
        window.supabaseClient
          .from('rrt_qualifications')
          .select('*')
          .eq('profile_id', profileId),
      ]);

      // ✅ 4. HANDLE PROFILE ERRORS
      if (profileRes.error) {
        console.error('❌ [viewReport] Profile fetch error:', profileRes.error);
        throw new Error(`Không tìm thấy hồ sơ: ${profileRes.error.message}`);
      }

      const profile = profileRes.data;
      if (!profile) {
        throw new Error('Hồ sơ không tồn tại hoặc đã bị xóa.');
      }
      console.log('✅ [viewReport] Profile loaded:', profile.id);

      // ✅ 5. HANDLE QUALIFICATIONS
      const qual = qualRes.data?.[0] || {};
      console.log('📋 [viewReport] Qualifications:', qual?.id || 'No record');

      // ✅ 6. PARSE SKILLS FROM JSONB SAFELY
      let skills = {};
      if (qual.skills) {
        try {
          skills =
            typeof qual.skills === 'string'
              ? JSON.parse(qual.skills)
              : qual.skills;
          console.log(
            '🧠 [viewReport] Skills parsed:',
            Object.keys(skills).length
          );
        } catch (e) {
          console.error('❌ [viewReport] Skills parse error:', e);
          skills = {};
        }
      }

      // ✅ 7. GET DOM ELEMENTS
      const modal = document.getElementById('modal-rrtForm');
      const reportForm = document.getElementById('rrtForm');

      if (!modal || !reportForm) {
        console.error('❌ [viewReport] Modal/Form not found in DOM');
        throw new Error('Không tìm thấy giao diện biểu mẫu.');
      }

      // ✅ 8. RESET FORM & SET EDIT MODE
      reportForm.reset();
      window.isEditMode = true;
      window.currentEditingProfileId = profileId; // ✅ QUAN TRỌNG: Lưu ID để check email trùng khi submit

      const modalTitle = document.getElementById('modal-title');
      if (modalTitle) modalTitle.textContent = '📑 Cập nhật hồ sơ RRT';

      console.log('🎨 [viewReport] Form reset, UI prepared');

      // ✅ 9. CACHE LAST VALUES FOR DROPDOWNS
      window.lastwardValue = profile.ward || '';
      window.lastfaxValue = profile.fax || '';
      window.lastworkplaceWardValue = profile.workplace_ward || ''; // ← THÊM
      window.lastdepartmentValue = profile.department || '';
      window.lastemployeeStatusValue = profile.employeestatus || '';
      window.lastacademicValue = qual.academic || profile.academic || '';
      window.lastacademicLevelValue =
        qual.academic_level || profile.academic_level || '';
      window.lastlanguageValue = qual.languages || profile.languages || '';

      // ✅ 10. INIT DYNAMIC DROPDOWNS
      if (typeof createWardDropdown === 'function') {
        if (createWardDropdown.constructor?.name === 'AsyncFunction') {
          await createWardDropdown();
        } else {
          createWardDropdown();
        }
      }

      // ✅ 11. HELPER: SAFE SET VALUE WITH SELECT2 SUPPORT
      const setVal = (keys, value) => {
        let el = null;
        for (const key of keys) {
          el =
            document.getElementById(key) ||
            reportForm.querySelector(`[name="${key}"]`);
          if (el) break;
        }
        if (!el) return;

        el.value = value ?? '';

        // Trigger Select2 change if applicable
        if (
          typeof jQuery !== 'undefined' &&
          $(el).hasClass('select2-hidden-accessible')
        ) {
          $(el).trigger('change.select2');
        } else if (el.tagName === 'SELECT') {
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      // ✅ 12. FILL PERSONAL INFO
      setVal(['fullName', 'rrt-fullname', 'ho_ten'], profile.full_name);
      setVal(['gender', 'rrt-gender', 'gioi_tinh'], profile.gender);
      setVal(['dob', 'rrt-dob', 'nam_sinh'], profile.dob);
      setVal(['phone', 'rrt-phone', 'so_dien_thoai'], profile.phone);
      setVal(['email', 'rrt-email'], profile.email);
      setVal(['fax', 'don_vi'], profile.fax);
      setVal(['department', 'khoa_phong'], profile.department);
      setVal(['employeeStatus', 'employeestatus'], profile.employeestatus);
      setVal(['address', 'rrt-address', 'dia_chi'], profile.address);

      // ✅ 13. FILL PROFESSIONAL INFO
      setVal(['academic', 'chuyen_nganh'], qual.specialty || qual.academic);
      setVal(['academicLevel', 'cap_bac'], qual.academic_level);
      setVal(['language', 'ngoai_ngu'], qual.languages);
      setVal(['languageLevel', 'trinh_do_nn'], qual.languages_level);

      // ========================================================================
      // ✅ 14. FILL SKILLS - KEY MAP AT PARENT SCOPE
      // ========================================================================
      const jsonKeyMap = {
        skill_ungpho: 'emergency_response',
        skill_ruiro: 'risk_communication',
        skill_tamly: 'psycho_social',
        skill_dulieu: 'data_management',
        skill_dichte: 'epidemiology',
        skill_nhiemtrung: 'infection_control',
        skill_thinghiem: 'lab',
        skill_haucan: 'logistics',
        skill_vanhanh: 'operation_materials',
        skill_cabenh: 'case_management',
        skill_dinhduong: 'food_management',
        skill_nuoc: 'wash_management',
        skill_nguyhiem: 'hazardous_management',
        skill_anninh: 'security_management',
      };

      const fillSkills = (skillsData) => {
        console.log(
          '🔧 fillSkills called with:',
          Object.keys(skillsData).length,
          'skills'
        );

        Object.keys(jsonKeyMap).forEach((htmlBaseName) => {
          const dbKey = jsonKeyMap[htmlBaseName];
          const skillData = skillsData[dbKey] || {
            has_skill: false,
            level: '',
          };

          const radioCo = document.getElementById(`${htmlBaseName}_co`);
          const radioKhong = document.getElementById(`${htmlBaseName}_khong`);
          const levelSelect = document.getElementById(`${htmlBaseName}_level`);
          const container =
            document.getElementById(`${htmlBaseName}_container`) ||
            document.querySelector(`[data-skill="${htmlBaseName}"]`);

          if (!radioCo || !radioKhong) {
            console.warn(`⚠️ [${htmlBaseName}] Radio buttons not found!`);
            return;
          }

          // Show container
          if (container) {
            container.style.display = 'block';
            container.classList.remove('d-none', 'hidden', 'invisible');
          }

          if (skillData.has_skill) {
            radioCo.checked = true;
            radioCo.dispatchEvent(new Event('change', { bubbles: true }));

            if (levelSelect) {
              levelSelect.style.display = 'block';
              levelSelect.setAttribute('required', 'required');
              levelSelect.value = skillData.level || '';
              levelSelect.dispatchEvent(new Event('change', { bubbles: true }));

              if (
                typeof jQuery !== 'undefined' &&
                $(levelSelect).hasClass('select2-hidden-accessible')
              ) {
                $(levelSelect).trigger('change.select2');
              }
            }
          } else {
            radioKhong.checked = true;
            radioKhong.dispatchEvent(new Event('change', { bubbles: true }));

            if (levelSelect) {
              levelSelect.style.display = 'none';
              levelSelect.removeAttribute('required');
              levelSelect.value = '';
            }
          }
        });

        console.log('✅ fillSkills completed');
      };

      // ========================================================================
      // ✅ 15. SHOW MODAL + DELAYED SKILL FILL (FOR ANIMATION + SELECT2 INIT)
      // ========================================================================
      modal.style.display = 'block';
      modal.classList.add('show', 'd-block');
      modal.setAttribute('aria-hidden', 'false');

      // Wait for modal animation + Select2 init
      setTimeout(() => {
        console.log('🎨 [fillSkills] Starting skill fill...');
        fillSkills(skills);

        // Debug: Verify radio states
        Object.keys(jsonKeyMap).forEach((key) => {
          const radioCo = document.getElementById(`${key}_co`);
          const levelSelect = document.getElementById(`${key}_level`);
          console.log(
            `[${key}] Checked: ${radioCo?.checked}, Level: ${levelSelect?.value}`
          );
        });
      }, 300);

      // ========================================================================
      // ✅ 16. DISPLAY ATTACHMENT INFO (IF ANY) - KHÔNG DÙNG resume_url
      // ========================================================================
      // Lưu ý: profiles table không có cột resume_url, nên không hiển thị ở đây
      // File đính kèm nên lưu ở rrt_qualifications.file_url hoặc bảng khác
      const currentFileDisplay = document.getElementById('currentFileDisplay');
      if (currentFileDisplay) {
        // Nếu bạn có file_url trong qual, hiển thị ở đây:
        if (qual.file_url) {
          currentFileDisplay.innerHTML = `
          Đã đính kèm: <a href="${qual.file_url}" target="_blank" class="text-primary">
            <i class='bx bx-link'></i> Xem tệp
          </a>
        `;
        } else {
          currentFileDisplay.innerHTML = 'Chưa có tệp đính kèm.';
        }
      }

      // ========================================================================
      // ✅ 17. DISPLAY EDIT REQUIREMENTS (NẾU CÓ YÊU CẦU CHỈNH SỬA TỪ ADMIN)
      // ========================================================================
      const editRequirementsEl = document.getElementById(
        'edit-requirements-display'
      );

      if (editRequirementsEl) {
        // Kiểm tra điều kiện: Trạng thái là 'edit' VÀ có nội dung comment
        if (profile.approval_status === 'edit' && profile.edit_comment) {
          const commentClean =
            window.escapeHtml?.(profile.edit_comment) || profile.edit_comment;
          const reviewDate = profile.updated_at
            ? new Date(profile.updated_at).toLocaleString('vi-VN')
            : '';

          editRequirementsEl.innerHTML = `
            <div class="alert alert-warning border-start border-4 border-warning shadow-sm">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="alert-heading mb-0 fw-bold text-danger">
                  <i class='bx bx-error-circle'></i> YÊU CẦU CHỈNH SỬA TỪ ADMIN
                </h6>
                <small class="text-muted" style="font-size: 11px;">${reviewDate}</small>
              </div>
              <div class="mt-2 p-3 bg-white rounded border border-warning-subtle text-dark" style="white-space: pre-wrap; line-height: 1.6;">${commentClean.replace(
                /\n/g,
                '<br>'
              )}</div>
            </div>
          `;
          editRequirementsEl.style.display = 'block';

          // Tự động cuộn lên đầu Modal để User thấy ngay cảnh báo
          const modalBody = modal.querySelector('.modal-body');
          if (modalBody) modalBody.scrollTop = 0;
        } else {
          editRequirementsEl.innerHTML = '';
          editRequirementsEl.style.display = 'none';
        }
      }

      // ========================================================================
      // ✅ 18. FETCH & RENDER PROFILE HISTORY
      // ========================================================================
      console.log('🚀 [viewReport] Loading profile history...');
      if (typeof fetchAndRenderProfileHistory === 'function') {
        await fetchAndRenderProfileHistory(profileId);
      }

      console.log('✅ [viewReport] All steps completed successfully!');
    } catch (err) {
      console.error('❌ [viewReport] Error:', err);
      showToast(
        'Lỗi tải báo cáo: ' + (err.message || 'Không xác định'),
        'error'
      );
    } finally {
      // ✅ ALWAYS HIDE LOADING
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // --- Create/Edit Modal Management ---
  const btnCreateReport = document.getElementById('btn-create-report');
  const modalReportForm = document.getElementById('modal-rrtForm');
  const reportForm = document.getElementById('rrtForm');
  const modalTitle = document.getElementById('modal-title');

  let isSubmitting = false; // Ngăn submit nhiều lần

  // ==========================================
  // 1. HÀM ĐÓNG MODAL VÀ RESET FORM
  // ==========================================
  window.closeModal = function (modalId) {
    if (document.activeElement) {
      document.activeElement.blur();
    }
    const modalEl = document.getElementById(modalId);
    if (!modalEl) return;

    // 1. Đóng Bootstrap instance
    const bsModal = bootstrap.Modal?.getInstance(modalEl);
    if (bsModal) {
      bsModal.hide();
      setTimeout(() => {
        try {
          bsModal.dispose();
        } catch (e) {}
      }, 150);
    }

    // 2. FORCE ẨN MODAL & XÓA BACKDROP
    modalEl.classList.remove('show', 'd-block');
    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden', 'true');

    setTimeout(() => {
      document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }, 100);

    // 3. Reset form tương ứng
    if (modalId === 'modal-official-report') {
      window.cachedPlanData = null;
      const form = modalEl.querySelector('form');
      if (form) form.reset();
    }
    console.log('✅ Modal closed & cleaned:', modalId);
  };

  // ✅ Fix click outside modal
  window.addEventListener('click', function (event) {
    const modalReportForm = document.getElementById('modal-rrtForm');

    // Check nếu click trúng backdrop (không phải modal content)
    if (event.target === modalReportForm) {
      console.log('🖱️ Click outside modal - closing...');

      // Đóng modal với cleanup đầy đủ
      closeModal('modal-rrtForm');
    }
  });

  // ==========================================
  // 2. XỬ LÝ NÚT "TẠO MỚI HỒ SƠ"
  // ==========================================
  if (btnCreateReport) {
    btnCreateReport.addEventListener('click', function () {
      modalTitle.textContent = '📑 Biểu mẫu đăng ký RRT';
      // Phải reset biến TOÀN CỤC (submit đọc window.isEditMode). Trước đây chỉ
      // gán biến cục bộ nên sau khi admin sửa hồ sơ A rồi bấm "Tạo mới",
      // submit vẫn UPDATE đè lên hồ sơ A.
      window.isEditMode = false;
      window.currentEditingProfileId = null;

      reportForm.reset();

      // --- XÓA TRẮNG BẢNG LỊCH SỬ/KINH NGHIỆM ---
      const trainingBody = document.getElementById('profile-training-body');
      if (trainingBody)
        trainingBody.innerHTML =
          '<tr><td colspan="4" class="text-center text-muted" style="padding: 20px;">Dữ liệu lịch sử sẽ hiển thị sau khi hồ sơ được tạo.</td></tr>';

      const expBody = document.getElementById('profile-rrt-exp-body');
      if (expBody)
        expBody.innerHTML =
          '<tr><td colspan="4" class="text-center text-muted" style="padding: 20px;">Dữ liệu thực chiến sẽ hiển thị sau khi hồ sơ được tạo.</td></tr>';

      // Reset các dropdown phụ thuộc (Xóa cache cũ và tạo lại)
      if (typeof createWardDropdown === 'function') {
        window.lastwardValue = '';
        window.lastdepartmentValue = '';
        window.lastdepartmentAPValue = '';
        window.lastemployeeStatusValue = '';
        window.lastacademicValue = '';
        window.lastacademicLevelValue = '';
        window.lastfaxValue = '';
        window.lastworkplaceWardValue = ''; // ← THÊM
        createWardDropdown();
      }

      modalReportForm.style.display = 'block';
      window.scrollTo(0, 0);
    });
  }

  // ==========================================
  // 3. XỬ LÝ SỰ KIỆN SUBMIT FORM RRT (ĐÃ FIX - CHUẨN XÁC)
  // ==========================================
  if (reportForm) {
    reportForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      if (isSubmitting) return; // Chống click nhiều lần
      isSubmitting = true;

      const submitBtn = reportForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

      try {
        // =========================================================
        // 1. XÁC ĐỊNH CHÍNH XÁC ID HỒ SƠ ĐANG CẦN CẬP NHẬT
        // =========================================================
        const {
          data: { user },
          error: userErr,
        } = await supabaseClient.auth.getUser();
        if (userErr || !user)
          throw new Error('Vui lòng đăng nhập lại để gửi biểu mẫu.');

        // NẾU LÀ ADMIN ĐANG EDIT: Lấy ID của người đang được edit từ biến toàn cục
        // NẾU LÀ USER TỰ TẠO/EDIT: Dùng ID của chính họ
        const targetProfileId =
          window.isEditMode && window.currentEditingProfileId
            ? window.currentEditingProfileId
            : user.id;

        // =========================================================
        // 2. LẤY TỌA ĐỘ & MÃ XÃ TỰ ĐỘNG
        // =========================================================
        const userLoc = await new Promise((resolve) => {
          if (typeof getUserLocation === 'function') {
            getUserLocation((loc) => resolve(loc));
          } else {
            console.warn('⚠️ getUserLocation not defined');
            resolve({ lat: null, lng: null });
          }
        });

        let autoMaXa = null;
        if (
          userLoc.lat &&
          userLoc.lng &&
          typeof window.findWardByCoordinates === 'function'
        ) {
          if (!window.appState.mapGeoData) {
            console.warn('⚠️ GeoJSON chưa sẵn sàng, đang tải lại...');
            await window.loadGeoJSON();
          }
          const wardInfo = window.findWardByCoordinates(
            userLoc.lat,
            userLoc.lng
          );
          if (wardInfo) {
            autoMaXa = wardInfo.maXa;
            console.log(`📍 Tìm thấy mã xã: ${wardInfo.tenXa} (${autoMaXa})`);
          }
        }

        // =========================================================
        // 3. THU THẬP DỮ LIỆU CƠ BẢN (profiles)
        // =========================================================
        const getVal = (id) =>
          document.getElementById(id)?.value?.trim() || null;
        const finalMaXa = autoMaXa || getVal('wardCode') || getVal('ward');

        const profileData = {
          id: targetProfileId, // DÙNG ID ĐÃ ĐƯỢC XÁC ĐỊNH Ở BƯỚC 1
          full_name: getVal('fullName'),
          gender: getVal('gender'),
          dob: getVal('dob'),
          phone: getVal('phone'),
          email: getVal('email'),
          address: getVal('address'),
          ward: getVal('ward'),
          ma_xa: finalMaXa,
          latitude: userLoc.lat,
          longitude: userLoc.lng,
          fax: getVal('fax'),
          workplace_ward: getVal('workplace_ward'), // ← THÊM: tên xã nơi công tác (null nếu không phải tuyến cơ sở)
          department: getVal('department'),
          employeestatus: getVal('employeeStatus'),
          academic: getVal('academic'),
          academic_level: getVal('academicLevel'),
          languages: getVal('language'),
          languages_level: getVal('languageLevel'),
          // role: 'user', // <-- XÓA DÒNG NÀY ĐI
          approval_status: 'pending', // Luôn đưa về pending khi submit (cần Admin duyệt lại)
          updated_at: new Date().toISOString(),
        };

        if (!profileData.full_name) throw new Error('Vui lòng nhập Họ Tên.');
        if (!profileData.email) throw new Error('Vui lòng nhập Email.');

        // ==========================================
        // 4. KIỂM TRA EMAIL TRÙNG (AN TOÀN HƠN)
        // ==========================================
        const currentEmail = profileData.email.toLowerCase().trim();

        // Quét DB để xem email này đã tồn tại chưa
        const { data: existingUser, error: emailCheckErr } =
          await supabaseClient
            .from('profiles')
            .select('id, full_name, email')
            .eq('email', currentEmail)
            .maybeSingle();

        if (emailCheckErr)
          console.warn('⚠️ Lỗi kiểm tra email:', emailCheckErr.message);

        // Nếu tìm thấy một người xài email này, VÀ người đó KHÔNG PHẢI LÀ targetProfileId đang sửa
        if (existingUser && existingUser.id !== targetProfileId) {
          const holderName =
            existingUser.full_name || existingUser.email || 'ai đó';
          throw new Error(
            `Email "${profileData.email}" đã được sử dụng bởi ${holderName}!`
          );
        }

        // =========================================================
        // 5. THU THẬP KỸ NĂNG (rrt_qualifications)
        // =========================================================
        const getSkillData = (skillName) => {
          const radio = document.querySelector(
            `input[name="${skillName}"]:checked`
          );
          const hasSkill = radio
            ? radio.value === 'Có' || radio.value === 'Yes'
            : false;
          let levelValue = null;
          if (hasSkill) {
            const levelSelect = document.getElementById(`${skillName}_level`);
            if (levelSelect) levelValue = levelSelect.value.trim() || null;
          }
          return { has_skill: hasSkill, level: levelValue };
        };

        const skillsJSON = {
          emergency_response: getSkillData('skill_ungpho'),
          risk_communication: getSkillData('skill_ruiro'),
          psycho_social: getSkillData('skill_tamly'),
          data_management: getSkillData('skill_dulieu'),
          epidemiology: getSkillData('skill_dichte'),
          infection_control: getSkillData('skill_nhiemtrung'),
          lab: getSkillData('skill_thinghiem'),
          logistics: getSkillData('skill_haucan'),
          operation_materials: getSkillData('skill_vanhanh'),
          case_management: getSkillData('skill_cabenh'),
          food_management: getSkillData('skill_dinhduong'),
          wash_management: getSkillData('skill_nuoc'),
          hazardous_management: getSkillData('skill_nguyhiem'),
          security_management: getSkillData('skill_anninh'),
        };

        const qualData = {
          profile_id: targetProfileId, // DÙNG CHUẨN ID
          academic: getVal('academic'),
          academic_level: getVal('academicLevel'),
          languages: getVal('language'),
          languages_level: getVal('languageLevel'),
          skills: skillsJSON,
          updated_at: new Date().toISOString(),
        };

        // =========================================================
        // 6. XỬ LÝ FILE ĐÍNH KÈM (Supabase Storage)
        // =========================================================
        const fileInput = document.querySelector(
          'input[type="file"][name="reportFile"]'
        );
        if (fileInput && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          const MAX_SIZE = 10 * 1024 * 1024; // 10MB
          if (file.size > MAX_SIZE)
            throw new Error('File quá lớn. Vui lòng chọn file dưới 10MB.');

          const fileExt = file.name.split('.').pop();
          const fileName = `profile_${targetProfileId}_${Date.now()}.${fileExt}`;
          const filePath = `resumes/${fileName}`;

          const { error: uploadError } = await supabaseClient.storage
            .from('documents')
            .upload(filePath, file, { cacheControl: '3600', upsert: false });

          if (uploadError)
            throw new Error('Lỗi upload file: ' + uploadError.message);

          const { data: publicUrlData } = supabaseClient.storage
            .from('documents')
            .getPublicUrl(filePath);

          qualData.file_url = publicUrlData.publicUrl;
        }

        // =========================================================
        // 7. GỬI DỮ LIỆU LÊN SUPABASE (UPDATE)
        // =========================================================
        // Nếu là edit mode thì update, nếu tạo mới (chưa có) thì nên dùng upsert
        if (window.isEditMode) {
          const { error: errProfile } = await supabaseClient
            .from('profiles')
            .update(profileData)
            .eq('id', targetProfileId);

          if (errProfile)
            throw new Error('Lỗi cập nhật hồ sơ: ' + errProfile.message);
        } else {
          // Với tài khoản tự cập nhật lần đầu
          const { error: errProfile } = await supabaseClient
            .from('profiles')
            .upsert(profileData, { onConflict: 'id' });

          if (errProfile)
            throw new Error('Lỗi lưu mới hồ sơ: ' + errProfile.message);
        }

        const { error: errQual } = await supabaseClient
          .from('rrt_qualifications')
          .upsert(qualData, { onConflict: 'profile_id' });

        if (errQual) throw new Error('Lỗi lưu kỹ năng: ' + errQual.message);

        // =========================================================
        // 8. HOÀN TẤT
        // =========================================================
        showToast('✅ Đã lưu hồ sơ RRT thành công!', 'success');

        if (typeof closeModal === 'function') {
          closeModal('modal-rrtForm');
        } else {
          const modalEl = document.getElementById('modal-rrtForm');
          if (modalEl && typeof bootstrap !== 'undefined') {
            const modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (modalInstance) modalInstance.hide();
          }
        }

        if (typeof window.renderRRTTable === 'function') {
          await window.renderRRTTable();
        }
      } catch (err) {
        console.error('❌ Lỗi khi submit Form:', err);
        showToast(err.message, 'error');
      } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
        if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
      }
    });
  }
  // =====  Chức năng In Báo cáo =====

  // ==========================================
  // IN PDF BẰNG TRÌNH DUYỆT (PRINT)
  // ==========================================
  let isPrinting = false;
  const btnPrintReport = document.getElementById('btn-print-report');
  const rrtRecordIdInput = document.getElementById('rrtRecordId');

  if (btnPrintReport) {
    btnPrintReport.addEventListener('click', function () {
      if (isPrinting) {
        showToast('Đang xử lý, vui lòng đợi...', 'info');
        return;
      }

      const rrtRecordId = rrtRecordIdInput ? rrtRecordIdInput.value : '';
      if (!rrtRecordId) {
        showToast('Không thể in biểu mẫu. Mã biểu mẫu không hợp lệ.', 'error');
        return;
      }

      isPrinting = true;
      btnPrintReport.disabled = true;
      showToast('Đang chuẩn bị trang in...', 'info');

      // Tạo một cửa sổ in tạm thời để hiển thị dữ liệu đẹp mắt hơn
      // Hoặc đơn giản là dùng chức năng in của trình duyệt (Ctrl + P)
      setTimeout(() => {
        window.print();
        isPrinting = false;
        btnPrintReport.disabled = false;
      }, 500);
    });
  }

  // ==========================================
  // XUẤT EXCEL BẰNG SHEETJS
  // ==========================================
  const btnExportExcel = document.getElementById('btn-export-excel');
  let isExportingExcel = false;

  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', async function () {
      if (isExportingExcel) {
        showToast('Đang xuất Excel, vui lòng đợi...', 'info');
        return;
      }
      const rrtRecordId = rrtRecordIdInput ? rrtRecordIdInput.value : '';
      if (!rrtRecordId) {
        showToast(
          'Không thể xuất tệp Excel. ID báo cáo không hợp lệ.',
          'error'
        );
        return;
      }

      isExportingExcel = true;
      btnExportExcel.disabled = true;
      showToast('Đang tạo tệp Excel...', 'info');

      try {
        if (typeof XLSX === 'undefined') {
          throw new Error(
            'Thư viện SheetJS chưa được tải. Không thể xuất Excel.'
          );
        }

        // Lấy dữ liệu báo cáo từ Supabase
        const { data, error } = await supabaseClient
          .from('profiles') // Thay đổi nếu tên bảng của bạn khác
          .select('*')
          .eq('id', rrtRecordId)
          .single();

        if (error) throw error;
        if (!data) throw new Error('Không tìm thấy dữ liệu báo cáo này.');

        // Tạo Worksheet từ JSON
        const worksheet = XLSX.utils.json_to_sheet([data]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Report_Data');

        // Xuất file
        XLSX.writeFile(workbook, `Report_${rrtRecordId}.xlsx`);
        showToast('Đã tạo thành công tệp Excel!', 'success');
      } catch (err) {
        console.error('Lỗi xuất Excel:', err);
        showToast('Lỗi khi xuất Excel: ' + err.message, 'error');
      } finally {
        isExportingExcel = false;
        btnExportExcel.disabled = false;
      }
    });
  }

  // ==========================================
  // LẤY DANH SÁCH THÀNH VIÊN TỪ LOCAL STATE
  // ==========================================
  // Thay thế việc gọi server bằng cách lấy dữ liệu sẵn có
  window.getMembersForEmergency = function () {
    return new Promise((resolve, reject) => {
      // Ép kiểu an toàn để tránh lỗi undefined
      const role = String(window.userSession?.role || '').toLowerCase();

      // Gộp cả admin cũ và city_admin mới (nếu có) vào quyền HCDC Admin
      const isAdmin = role === 'admin' || role === 'city_admin';
      const isWardAdmin = role === 'ward_admin';

      // 1. Kiểm tra quyền chặn từ cửa
      if (!isAdmin && !isWardAdmin) {
        if (typeof showToast === 'function')
          showToast('Bạn không có quyền xem danh sách này!', 'error');
        reject(new Error('No permission'));
        return;
      }

      if (!window.appState || !window.appState.users) {
        if (typeof showToast === 'function')
          showToast('Dữ liệu nhân sự chưa được tải!', 'error');
        reject(new Error('Data not loaded'));
        return;
      }

      // 2. LỌC BỎ LÃNH ĐẠO KHỎI DANH SÁCH ĐIỀU ĐỘNG
      // Lệnh này đảm bảo HCDC Admin hay Ward Admin khi chọn quân đi dập dịch
      // sẽ không vô tình chọn nhầm vào tài khoản của sếp hoặc tài khoản hệ thống.
      const rrtMembersOnly = window.appState.users.filter((u) => {
        const uRole = String(u.role || 'user').toLowerCase();
        // Chỉ giữ lại cán bộ (user) chờ phân công
        return uRole === 'user' || uRole === 'member';
      });

      // 3. Phân luồng dữ liệu hiển thị
      if (isAdmin) {
        // Admin HCDC: Thấy tất cả nhân sự (đã lọc bỏ lãnh đạo) toàn thành phố
        resolve(rrtMembersOnly);
        return;
      }

      if (isWardAdmin) {
        const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();

        // Chặn lỗi: Nếu tài khoản Ward Admin bị lỗi thiếu mã xã, trả về rỗng ngay lập tức
        if (!myMaXa) {
          resolve([]);
          return;
        }

        const grassrootsUnits = [
          'trạm y tế phường/xã/ đặc khu',
          'ubnd phường/xã/ đặc khu',
        ];

        // Ward Admin: Chỉ thấy nhân sự (đã lọc bỏ lãnh đạo) cùng Mã Xã Công Tác
        const filtered = rrtMembersOnly.filter((u) => {
          const uMaXa = String(u.workplace_ma_xa || '').trim();
          const uFax = String(u.fax || '')
            .toLowerCase()
            .trim();

          return uMaXa === myMaXa && grassrootsUnits.includes(uFax);
        });

        resolve(filtered);
      }
    });
  };
  // A global variable to store the list of members
  window.memberList = [];
  window.tempSelectedEmails = [];
  window.tempIncidentDetails = {};
  const nowPlus30 = new Date();
  nowPlus30.setMinutes(nowPlus30.getMinutes() + 30);
});
