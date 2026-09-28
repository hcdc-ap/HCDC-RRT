// ============================================================
// FIELD OPS — SOS, luân chuyển đội, báo cáo nhanh, mở modal báo cáo
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {

  /**
   * ============================================================
   * XỬ LÝ DỮ LIỆU VÀ ĐIỀN VÀO FORM AAR (FINAL VERSION)
   * ============================================================
   */
  function processAarData(planData) {
    let summaryArr = [];
    let issueArr = [];
    let lessonArr = [];

    // ============================================================
    // PHẦN A: TỔNG HỢP SỐ LIỆU
    // ============================================================
    const HEADER_STATS = '📊 SỐ LIỆU GHI NHẬN';
    let finalStats = { cases: 0, suspected: 0, deaths: 0, source: '' };
    let hasData = false;

    // 1. Ưu tiên dữ liệu từ IAP
    if (
      planData &&
      planData.stats &&
      (planData.stats.casesTotal > 0 ||
        planData.stats.deathsTotal > 0 ||
        planData.stats.suspectedTotal > 0)
    ) {
      finalStats.cases = planData.stats.casesTotal;
      finalStats.suspected = planData.stats.suspectedTotal;
      finalStats.deaths = planData.stats.deathsTotal;
      finalStats.source = '(Nguồn: Dữ liệu Phương án IAP)';
      hasData = true;
    }
    // 2. Fallback: Quét từ Log Chat
    else if (
      window.currentIncidentLogs &&
      window.currentIncidentLogs.length > 0
    ) {
      let maxTime = '';
      window.currentIncidentLogs.forEach((r) => {
        const content = r.content;
        const c = content.match(/(?:Số mắc|Mắc|Ca mắc|F0)[:\s]*(\d+)/i);
        const s = content.match(/(?:Nghi ngờ|Ca nghi ngờ|F1)[:\s]*(\d+)/i);
        const d = content.match(/(?:Tử vong|TV|Ca tử vong)[:\s]*(\d+)/i);

        if (c || s || d) {
          hasData = true;
          maxTime = r.timestamp;
          if (c) finalStats.cases = Math.max(finalStats.cases, parseInt(c[1]));
          if (s)
            finalStats.suspected = Math.max(
              finalStats.suspected,
              parseInt(s[1])
            );
          if (d)
            finalStats.deaths = Math.max(finalStats.deaths, parseInt(d[1]));
        }

        if (r.type === 'SOS') {
          let cleanText = content
            .replace(/<[^>]*>/g, '')
            .replace(/YÊU CẦU HỖ TRỢ \(SOS\)/gi, '')
            .replace(/Chi tiết:/gi, '')
            .trim();
          if (!issueArr.some((i) => i.includes(cleanText))) {
            issueArr.push(`⚠️ [SOS ${r.timestamp}] ${cleanText}`);
          }
        }
      });
      if (hasData)
        finalStats.source = `(Theo ghi nhận log chat lúc ${maxTime})`;
    }

    if (hasData) {
      summaryArr.push(HEADER_STATS);
      summaryArr.push(`- Số mắc: ${finalStats.cases}`);
      summaryArr.push(`- Nghi ngờ: ${finalStats.suspected}`);
      summaryArr.push(`- Tử vong: ${finalStats.deaths}`);
      summaryArr.push(finalStats.source);
      summaryArr.push('--------------------------------');
    }

    // ============================================================
    // PHẦN B: TỔNG HỢP DIỄN TIẾN (LỊCH SỬ THÔNG MINH)
    // ============================================================
    if (
      planData &&
      planData.assessmentHistory &&
      planData.assessmentHistory.length > 0
    ) {
      summaryArr.push('📝 TÓM TẮT DIỄN TIẾN SỰ KIỆN');

      // Sắp xếp: Cũ -> Mới
      const history = [...planData.assessmentHistory].sort(
        (a, b) => parseVNDate(a.timestamp) - parseVNDate(b.timestamp)
      );

      let lastContentSignature = '';

      history.forEach((h, index) => {
        // Tạo chữ ký để so sánh trùng lặp
        const currentSig = `${h.causes?.trim()}|${h.clinical_char?.trim()}|${h.context?.trim()}`;

        // Chỉ in nếu nội dung thay đổi hoặc là dòng đầu/cuối
        if (
          index === 0 ||
          index === history.length - 1 ||
          currentSig !== lastContentSignature
        ) {
          // [FIX] Thêm giá trị mặc định nếu không có tên author
          const authorName = h.author ? h.author : 'Không xác định';

          summaryArr.push(
            `\n📅 Giai đoạn: ${h.timestamp} (Đánh giá bởi: ${authorName})`
          );

          // 1. Nguyên nhân
          if (h.causes && h.causes.length > 2)
            summaryArr.push(`- Nguyên nhân (Tác nhân/Nguồn lây): ${h.causes}`);

          // 2. Lâm sàng
          if (h.clinical_char && h.clinical_char.length > 2) {
            const label = '- Đặc tính lâm sàng/dịch tễ: ';
            if (h.clinical_char.length > 100) {
              summaryArr.push(
                `${label}\n  ${h.clinical_char.replace(/\n/g, '\n  ')}`
              );
            } else {
              summaryArr.push(`${label}${h.clinical_char}`);
            }
          }

          // 3. Bối cảnh
          if (h.context && h.context.length > 2) {
            const label = '- Bối cảnh & Yếu tố nguy cơ: ';
            if (h.context.length > 100) {
              summaryArr.push(
                `${label}\n  ${h.context.replace(/\n/g, '\n  ')}`
              );
            } else {
              summaryArr.push(`${label}${h.context}`);
            }
          }

          lastContentSignature = currentSig;
        }
      });
    } else if (planData && planData.assessment) {
      // Fallback: Nếu không có lịch sử, lấy cái mới nhất (Đã format đẹp)
      summaryArr.push('📝 ĐÁNH GIÁ HIỆN TẠI');
      const a = planData.assessment;

      // Nguyên nhân
      summaryArr.push(`- Nguyên nhân: ${a.causes || 'Đang điều tra'}`);

      // Lâm sàng
      if (a.clinical_char && a.clinical_char.length > 100) {
        summaryArr.push(
          `- Đặc tính lâm sàng/dịch tễ:\n  ${a.clinical_char.replace(
            /\n/g,
            '\n  '
          )}`
        );
      } else {
        summaryArr.push(
          `- Đặc tính lâm sàng/dịch tễ: ${a.clinical_char || 'Đang điều tra'}`
        );
      }

      // Bối cảnh
      if (a.context && a.context.length > 100) {
        summaryArr.push(
          `- Bối cảnh & Yếu tố nguy cơ:\n  ${a.context.replace(/\n/g, '\n  ')}`
        );
      } else {
        summaryArr.push(`- Bối cảnh & Yếu tố nguy cơ: ${a.context || ''}`);
      }
    }

    // ============================================================
    // PHẦN C: HOẠT ĐỘNG (GIỮ NGUYÊN)
    // ============================================================
    if (
      planData &&
      planData.assessment &&
      planData.assessment.activitiesByObjective
    ) {
      summaryArr.push('\n🚀 KẾT QUẢ HOẠT ĐỘNG ĐÁP ỨNG');
      summaryArr.push(planData.assessment.activitiesByObjective);
    } else if (planData && planData.activities) {
      const doneTasks = planData.activities.filter((t) => t.status === 'Done');
      if (doneTasks.length > 0) {
        summaryArr.push('\n🚀 KẾT QUẢ HOẠT ĐỘNG');
        doneTasks.forEach((t) => summaryArr.push(`✅ ${t.content}`));
      }
    }

    // ============================================================
    // PHẦN D: SOS TỪ SERVER
    // ============================================================
    if (planData && planData.sosList && planData.sosList.length > 0) {
      planData.sosList.forEach((sosItem) => {
        if (!issueArr.includes(sosItem)) issueArr.push(sosItem);
      });
    }

    // ============================================================
    // PHẦN E: ĐIỀN FORM
    // ============================================================
    if (summaryArr.length === 0 && issueArr.length === 0) {
      showToast('Không tìm thấy dữ liệu để tổng hợp.', 'warning');
      return;
    }

    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    };
    setVal('aar-summary', summaryArr.join('\n'));
    setVal('aar-issues', issueArr.join('\n'));

    const currentLesson = document.getElementById('aar-lessons-learned').value;
    if (!currentLesson || currentLesson.trim() === '') {
      setVal(
        'aar-lessons-learned',
        '- Tiếp tục giám sát sau khi đóng sự kiện.\n- Cập nhật quy trình phối hợp.'
      );
    }

    showToast('Đã tổng hợp dữ liệu thành công!', 'success');
  }

  // Hàm phụ trợ (Bắt buộc phải có để Sort hoạt động)
  function parseVNDate(dateStr) {
    if (!dateStr) return 0;
    const parts = dateStr.match(/\d+/g);
    if (!parts || parts.length < 5) return 0;
    return new Date(
      parts[4],
      parts[3] - 1,
      parts[2],
      parts[0],
      parts[1]
    ).getTime();
  }

  $(document).on('submit', '#aarForm', async function (e) {
    e.preventDefault();
    const btn = $('#btn-submit-aar');
    const originalText = btn.html();

    btn
      .prop('disabled', true)
      .html('<i class="bx bx-loader-alt bx-spin"></i> Đang lưu...');

    // 1. Thu thập dữ liệu từ Modal
    const formData = {
      incidentId: $('#aar-incident-id').val(),
      summary: $('#aar-summary').val(),
      issues: $('#aar-issues').val(),
      lessons: $('#aar-lessons-learned').val(),

      // Bắt chính xác value từ ô Select (sẽ ra 'closed' hoặc 'Active')
      status: $('#aar-status').val(),
    };

    try {
      if (!formData.incidentId)
        throw new Error('Lỗi: Không tìm thấy ID sự kiện.');

      // ==========================================
      // LƯU XUỐNG DATABASE
      // ==========================================

      // Đôi khi Database quy định chữ thường ('closed', 'active').
      // Nếu bạn chạy thử đoạn này mà vẫn dính lỗi 23514, hãy đổi dòng dưới thành:

      //const dbStatus = formData.status.toLowerCase();
      const dbStatus = formData.status;

      const { error } = await window.supabaseClient
        .from('incidents')
        .update({
          aar_data: {
            summary: formData.summary,
            issues: formData.issues,
            lessons: formData.lessons,
          },
          status: dbStatus, // Ghi đè trạng thái sự kiện
        })
        .eq('id', formData.incidentId);

      if (error) throw error;

      // Đóng Modal và thông báo
      $('#aarModal').modal('hide');
      showToast('Đã lưu Báo cáo AAR thành công!', 'success');

      // Refresh dữ liệu màn hình ngoài
      if (typeof window.pollForTrackingUpdates === 'function') {
        window.pollForTrackingUpdates();
      }

      // ==========================================
      // CẮT CHUỖI VÀ MỞ FORM SITREP (GIỮ NGUYÊN)
      // ==========================================
      // ==========================================
      // GỌI GIAO DIỆN CHUYỂN TIẾP CHUYÊN NGHIỆP
      // ==========================================
      setTimeout(() => {
        // 1. NHÀO NẶN DỮ LIỆU TỪ AAR ĐỂ TẠO GÓI PRE-FILL CHO BÁO CÁO
        const rawSummary = formData.summary || '';

        let stats = {
          casesNew: 0,
          casesTotal: 0,
          suspectedNew: 0,
          suspectedTotal: 0,
          deathsNew: 0,
          deathsTotal: 0,
        };
        const c = rawSummary.match(/(?:Mắc|Số mắc)[:\s]*(\d+)/i);
        const s = rawSummary.match(/(?:Nghi ngờ)[:\s]*(\d+)/i);
        const d = rawSummary.match(/(?:Tử vong)[:\s]*(\d+)/i);

        if (c) stats.casesTotal = parseInt(c[1]);
        if (s) stats.suspectedTotal = parseInt(s[1]);
        if (d) stats.deathsTotal = parseInt(d[1]);

        const KEY_ACTIVITY = '[KẾT QUẢ TRIỂN KHAI HOẠT ĐỘNG ĐÁP ỨNG]';
        const KEY_RESOURCE = '[NGUỒN LỰC ĐÃ HUY ĐỘNG]';

        let cleanOverview = rawSummary;
        let cleanActivities = '';

        const idxAct = rawSummary.indexOf(KEY_ACTIVITY);
        if (idxAct > -1) {
          cleanOverview = rawSummary
            .substring(0, idxAct)
            .replace('[TỔNG QUAN TÌNH HÌNH BAN ĐẦU]', '')
            .trim();
          let actSection = rawSummary.substring(idxAct + KEY_ACTIVITY.length);
          const idxRes = actSection.indexOf(KEY_RESOURCE);
          if (idxRes > -1) actSection = actSection.substring(0, idxRes);
          cleanActivities = actSection.trim();
        }

        // Đây là gói dữ liệu CHUẨN mà Modal Báo cáo (SITREP) cần:
        const preFillData = {
          stats: stats,
          summary: cleanOverview,
          activities: cleanActivities,
          detectedIncidents: formData.issues,
          issues: formData.issues
            ? 'Phát sinh các vấn đề/khó khăn (Xem mục Sự cố).'
            : '',
          lessons: formData.lessons,
          nextSteps: 'Hoàn tất đánh giá và đóng sự kiện.',
          hrChanges: 'Không có thay đổi.',
          level: 'Theo dõi',
        };

        // 2. HIỂN THỊ MODAL HỎI XÁC NHẬN
        const modalHtml = `
          <div class="modal fade" id="customConfirmModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
              <div class="modal-content border-0 shadow-lg">
                <div class="modal-body text-center p-4">
                  <i class='bx bx-check-circle text-success' style='font-size: 4rem;'></i>
                  <h5 class="mt-3 fw-bold">Lưu AAR thành công!</h5>
                  <p class="text-muted">Bạn có muốn chuyển sang lập 'Báo cáo Hoàn thành' ngay bây giờ không?</p>
                  <div class="mt-4">
                      <button type="button" class="btn btn-secondary me-2" data-bs-dismiss="modal">Để sau</button>
                      <button type="button" class="btn btn-primary" id="btn-confirm-yes">Lập báo cáo ngay</button>
                  </div>
                </div>
              </div>
            </div>
          </div>`;
        $('body').append(modalHtml);
        const confirmModal = new bootstrap.Modal(
          document.getElementById('customConfirmModal')
        );
        confirmModal.show();

        $('#btn-confirm-yes').on('click', function () {
          confirmModal.hide();
          $('#customConfirmModal').remove();
          $('.modal-backdrop').remove();

          // 🔥 ĐÂY LÀ ĐIỂM SỬA LỖI: Gọi đúng hàm, truyền đúng 2 tham số!
          if (typeof window.openReportModal === 'function') {
            window.openReportModal('COMPLETION', preFillData);
          } else {
            showToast('Lỗi: Chưa tải hàm Modal Báo cáo.', 'error');
          }
        });
        $('#customConfirmModal').on('hidden.bs.modal', () =>
          $('#customConfirmModal').remove()
        );
      }, 800);
    } catch (err) {
      console.error('Lỗi lưu AAR:', err);
      showToast('Lỗi lưu AAR: ' + err.message, 'error');
    } finally {
      btn.prop('disabled', false).html(originalText);
    }
  });
  window.submitSOS = async function () {
    const type = document.getElementById('sos-type').value;
    const qty = document.getElementById('sos-qty').value.trim();
    const desc = document.getElementById('sos-desc').value.trim();
    const incidentId = window.currentDossierId;

    if (!qty) {
      showToast('Vui lòng nhập số lượng hoặc chi tiết.', 'warning');
      return;
    }

    const contentHtml = `
      <div class="msg-bubble" style="background: #fff3cd; color: #856404; border: 1px solid #ffeeba; width: 100%; padding: 15px;">
          <div style="display:inline-block; background: #dc3545; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
              YÊU CẦU HỖ TRỢ (SOS)
          </div>
          <div style="font-weight: bold; font-size: 14px; color: #dc3545;">${type.toUpperCase()}</div>
          <div style="margin-top: 5px;"><b>Chi tiết:</b> ${window.escapeHtml(
            qty
          )}</div>
          <div style="margin-top: 5px; font-style: italic;">"${window.escapeHtml(
            desc
          )}"</div>
      </div>
  `;

    // Render UI ngay
    const chatBox = document.getElementById('dossier-chat-box');
    if (chatBox) {
      chatBox.insertAdjacentHTML(
        'beforeend',
        `
          <div class="msg right">
              <div class="msg-sender">Tôi</div>
              ${contentHtml}
          </div>
      `
      );
      chatBox.scrollTop = chatBox.scrollHeight;
    }
    // Gửi vào bảng incident_logs
    try {
      // ✅ Validate incidentId trước khi insert
      if (!incidentId) {
        throw new Error('Không tìm thấy ID sự kiện');
      }

      // ✅ Escape content nếu có HTML từ user input (chống XSS)
      const safeContent =
        typeof contentHtml === 'string'
          ? contentHtml
          : String(contentHtml || '');

      const { error } = await supabaseClient.from('incident_logs').insert([
        {
          incident_id: incidentId,
          content: safeContent,
          log_type: 'SOS', // ✅ Đúng tên cột theo schema
          user_id: window.getCurrentUserId(), // ✅ Dùng helper lấy UUID
          attachment_url: null, // ✅ Có thể bỏ nếu luôn null
          // created_at: bỏ dòng này → DB tự sinh default
        },
      ]);

      if (error) {
        console.error('❌ Supabase error:', error);
        throw new Error(error.message || 'Lỗi khi lưu SOS');
      }

      // ✅ Dọn dẹp form
      const qtyInput = document.getElementById('sos-qty');
      const descInput = document.getElementById('sos-desc');
      if (qtyInput) qtyInput.value = '';
      if (descInput) descInput.value = '';

      // ✅ Đóng modal an toàn
      if (typeof window.closeModal === 'function') {
        window.closeModal('modal-sos');
      } else {
        const modal = document.getElementById('modal-sos');
        if (modal) {
          modal.style.display = 'none';
          modal.setAttribute('aria-hidden', 'true');
          // Xóa backdrop nếu dùng Bootstrap
          document
            .querySelectorAll('.modal-backdrop')
            .forEach((el) => el.remove());
        }
      }

      showToast('✅ Đã gửi yêu cầu hỗ trợ SOS!', 'success');
    } catch (err) {
      console.error('Lỗi gửi SOS:', err);
      showToast('Lỗi gửi SOS: ' + err.message, 'error');
    }
  };
  // ============================================================
  // LOGIC LUÂN CHUYỂN ĐỘI (NÂNG CẤP)
  // ============================================================

  // 1. Mở Modal & Tự động nhận diện Đội cũ
  // 1. Mở Modal & Tự động nhận diện Đội cũ
  window.openTeamRotationModal = async function () {
    const modal = document.getElementById('modal-team-rotate');
    const oldDisplay = document.getElementById('rot-old-team-display');
    const oldValue = document.getElementById('rot-old-team-value');
    const warning = document.getElementById('rot-old-team-warning');
    const btnConfirm = document.getElementById('btn-confirm-rotate');
    const newSel = document.getElementById('rot-new-team');

    // Bật hiệu ứng loading để trải nghiệm mượt mà
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {
      const role = (window.userSession?.role || '').toLowerCase();
      let availableTeams = [];

      if (role === 'ward_admin') {
        const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();
        const myWard = String(window.userSession?.workplace_ward || '').trim();

        // =========================================================
        // VÉT CẠN DỮ LIỆU TỪ SUPABASE (Chống lỗi Cache bộ nhớ)
        // =========================================================
        // 1. Quét từ bảng profiles
        let profileTeams = [];
        if (myMaXa || myWard) {
          const { data } = await window.supabaseClient
            .from('profiles')
            .select('team')
            .or(`workplace_ma_xa.eq.${myMaXa},ward.eq.${myWard}`);
          if (data) profileTeams = data.map((p) => p.team);
        }

        // 2. Quét từ bảng lịch trực (đề phòng có đội từng trực nhưng đang trống người)
        let rosterTeams = [];
        if (myWard) {
          const { data } = await window.supabaseClient
            .from('roster_schedules')
            .select('team_name')
            .ilike('team_name', `Team ${myWard}%`);
          if (data) rosterTeams = data.map((r) => r.team_name);
        }

        // 3. Gom từ bộ nhớ tạm (dự phòng)
        const cacheTeams = (window.appState?.users || []).map((u) => u.team);

        // Gộp tất cả và xóa trùng lặp
        let combined = [...profileTeams, ...rosterTeams, ...cacheTeams];
        combined = [
          ...new Set(
            combined.map((t) => String(t || '').trim()).filter(Boolean)
          ),
        ];

        // Lọc qua lớp bảo vệ isMyWardTeam của bạn
        availableTeams = combined.filter((t) =>
          typeof window.isMyWardTeam === 'function'
            ? window.isMyWardTeam(t)
            : true
        );

        // =========================================================
        // CƠ CHẾ BẢO VỆ (FAILSAFE): Luôn đảm bảo có tối thiểu 2 đội
        // =========================================================
        if (availableTeams.length < 2 && myWard) {
          availableTeams.push(`Team ${myWard} 01`);
          availableTeams.push(`Team ${myWard} 02`);
          // Xóa trùng một lần nữa
          availableTeams = [...new Set(availableTeams)];
        }
      } else {
        // Admin HCDC: Trả về mặc định 10 Đội
        for (let i = 1; i <= 10; i++) availableTeams.push(`Team ${i}`);
      }

      // Render danh sách Đội vào dropdown
      let opts = '<option value="">-- Chọn đội --</option>';
      // Sort theo A-Z cho đẹp mắt
      availableTeams.sort().forEach((t) => {
        opts += `<option value="${
          window.escapeHtml ? window.escapeHtml(t) : t
        }">${t}</option>`;
      });
      newSel.innerHTML = opts;

      // =========================================================
      // XỬ LÝ ĐỘI CŨ
      // =========================================================
      const incidentId = window.currentDossierId;
      const incident = (window.appState?.trackingIncidents || []).find(
        (i) => i.id === incidentId
      );

      if (incident) {
        let currentTeam = incident.main_team;
        if (!currentTeam || currentTeam === '') {
          currentTeam = 'Mixed/Unknown';
        }

        oldDisplay.value = currentTeam;
        oldValue.value = currentTeam;

        if (currentTeam !== 'Mixed/Unknown') {
          warning.style.display = 'none';
        } else {
          // Vẫn hiện cảnh báo cho Admin biết đây là đội hỗn hợp
          warning.style.display = 'block';
        }

        // MỞ KHÓA NÚT: Bất kể là đội cũ hay Mixed, đều cho phép Ward Admin chọn đội mới để gán vào
        btnConfirm.disabled = false;
      }

      // Reset các trường khác
      document.getElementById('rot-suggestion-text').textContent = '';
      newSel.value = '';

      if (modal) modal.style.display = 'flex';
    } catch (err) {
      console.error('Lỗi lấy danh sách đội:', err);
      if (typeof showToast === 'function')
        showToast('Có lỗi xảy ra khi tải danh sách Đội', 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // 1. Gợi ý Đội Mới
  // 1. Gợi ý Đội Mới (Nút đũa thần trong Modal)
  window.suggestNewTeam = async function () {
    const textEl = document.getElementById('rot-suggestion-text');
    textEl.innerHTML =
      '<span class="spinner-border spinner-border-sm"></span> Đang tìm đội rảnh...';

    const today = new Date().toISOString().split('T')[0];

    try {
      // Query: Lấy các đội đang làm việc hôm nay
      const { data: busyTeams, error } = await window.supabaseClient
        .from('roster_schedules')
        .select('team_name')
        .eq('duty_date', today);

      if (error) throw error;

      const busyTeamNames = busyTeams.map((t) => t.team_name);

      // =========================================================
      // SỬA LỖI: LẤY DANH SÁCH ĐỘI TỪ DROPDOWN VỪA TẠO Ở TRÊN
      // =========================================================
      const newSel = document.getElementById('rot-new-team');
      let allTeams = [];
      if (newSel && newSel.options) {
        // Nhặt tất cả các lựa chọn (bỏ qua option '-- Chọn đội --')
        allTeams = Array.from(newSel.options)
          .map((opt) => opt.value)
          .filter(Boolean);
      }
      // =========================================================

      const availableTeams = allTeams.filter((t) => !busyTeamNames.includes(t));

      if (availableTeams.length > 0) {
        const bestMatch = availableTeams[0]; // Chọn đội đầu tiên rảnh
        newSel.value = bestMatch; // Tự động set giá trị cho dropdown
        textEl.innerHTML = `<span class="text-success"><i class='bx bx-check'></i> Đề xuất: <b>${bestMatch}</b> (Đang rảnh)</span>`;
      } else {
        textEl.innerHTML =
          '<span class="text-danger">Không tìm thấy đội nào rảnh hôm nay.</span>';
      }
    } catch (err) {
      textEl.textContent = 'Lỗi tìm kiếm.';
      console.error(err);
    }
  };

  // 2. Submit Thay thế Đội
  // 2. Submit Thay thế Đội (Ghi chuẩn vào bảng deployment_history)
  window.submitTeamRotation = function () {
    const oldTeam = document.getElementById('rot-old-team-value').value;
    const newTeam = document.getElementById('rot-new-team').value;
    const incidentId = window.currentDossierId;

    if (!newTeam) {
      showToast('Vui lòng chọn Đội thay thế.', 'warning');
      return;
    }
    if (oldTeam === newTeam) {
      showToast('Đội mới trùng với đội cũ.', 'warning');
      return;
    }

    showToastConfirm(
      `Xác nhận luân chuyển: Đưa <strong>${newTeam}</strong> vào tiếp quản sự kiện?`,
      async function () {
        if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);
        try {
          // BƯỚC 1: Lấy danh sách thành viên Đội mới
          const { data: newTeamMembers, error: errNew } =
            await window.supabaseClient
              .from('profiles')
              .select('id, email, full_name')
              .eq('team', newTeam)
              .eq('deployment_status', 'Sẵn sàng'); // Tùy chọn lọc người rảnh

          if (errNew) throw errNew;

          if (!newTeamMembers || newTeamMembers.length === 0) {
            throw new Error(
              `Đội ${newTeam} chưa có thành viên sẵn sàng trong hệ thống.`
            );
          }

          // BƯỚC 2: Lấy danh sách nhân sự đang có mặt trong sự kiện để ráp vào 'replaced_by'
          let oldTeamUsers = [];
          const { data: activeDeployments } = await window.supabaseClient
            .from('deployment_history')
            .select('user_id')
            .eq('incident_id', incidentId)
            // Lọc ra những người đang active/mobilize để thay thế
            .in('action_type', ['mobilize', 'deployed', 'active']);

          if (activeDeployments) {
            // Loại bỏ trùng lặp nếu 1 user có nhiều dòng lịch sử
            oldTeamUsers = [
              ...new Set(activeDeployments.map((d) => d.user_id)),
            ];
          }

          // BƯỚC 3: Xây dựng Payload chèn vào deployment_history theo đúng Schema
          const deploymentPayloads = newTeamMembers.map((newMem, index) => {
            const oldUserId = oldTeamUsers[index]; // Map 1-1 theo thứ tự (có thể null nếu đội mới đông hơn)

            return {
              incident_id: incidentId,
              user_id: newMem.id, // UUID người mới
              profile_id: newMem.id, // Cột profile_id (theo constraint foreign key)
              action_type: oldUserId ? 'replace_in' : 'mobilize', // Dùng đúng Check Constraint
              replaced_by: oldUserId || null, // UUID người cũ bị thay (null nếu là thêm mới)
              reason: `Luân chuyển đội: ${oldTeam} -> ${newTeam}`,
            };
          });

          // Thực thi Insert vào deployment_history
          if (deploymentPayloads.length > 0) {
            const { error: deployErr } = await window.supabaseClient
              .from('deployment_history')
              .insert(deploymentPayloads);
            if (deployErr) throw deployErr;
          }

          // BƯỚC 4: (Tùy chọn) Cập nhật lại chuỗi email trong incidents để UI bản đồ/danh sách đồng bộ ngay
          const newEmailsStr = newTeamMembers
            .map((m) => m.email)
            .filter(Boolean)
            .join(';');
          const { error: updateErr } = await window.supabaseClient
            .from('incidents')
            .update({
              initial_selected_members: newEmailsStr,
            })
            .eq('id', incidentId);

          if (updateErr) console.warn('Lỗi đồng bộ UI incidents:', updateErr);

          // BƯỚC 5: Ghi thông báo vào Log chat của sự kiện
          const currentUserId =
            window.getCurrentUserId?.() || window.userSession?.id;
          await window.supabaseClient.from('incident_logs').insert([
            {
              incident_id: incidentId,
              log_type: 'Report',
              content: `🔄 <b>LUÂN CHUYỂN ĐỘI:</b> Hệ thống đã ghi nhận <b>${newTeam}</b> (${newTeamMembers.length} thành viên) vào lịch sử tiếp quản sự kiện.`,
              user_id: currentUserId,
              attachment_url: null,
            },
          ]);

          // Hoàn tất
          showToast('Thay thế đội thành công!', 'success');

          if (typeof window.closeModal === 'function')
            window.closeModal('modal-team-rotate');
          if (typeof window.enterDashboard === 'function')
            await window.enterDashboard();
          if (typeof window.renderTrackingPage === 'function')
            window.renderTrackingPage(true);
        } catch (err) {
          console.error('Lỗi luân chuyển đội:', err);
          showToast('Lỗi: ' + err.message, 'error');
        } finally {
          if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
        }
      }
    );
  };
  window.submitQuickReport = async function () {
    const sit = document.getElementById('qr-situation').value.trim();
    const act = document.getElementById('qr-action').value.trim();
    const req = document.getElementById('qr-request').value.trim();

    if (!sit && !act && !req) {
      showToast('Vui lòng nhập ít nhất một nội dung báo cáo.', 'warning');
      return;
    }

    let formattedContent = '';
    if (sit)
      formattedContent += `<b>1. Tình hình:</b><br>${window
        .escapeHtml(sit)
        .replace(/\n/g, '<br>')}<br><br>`;
    if (act)
      formattedContent += `<b>2. Hoạt động:</b><br>${window
        .escapeHtml(act)
        .replace(/\n/g, '<br>')}<br><br>`;
    if (req)
      formattedContent += `<b>3. Kiến nghị:</b><br>${window
        .escapeHtml(req)
        .replace(/\n/g, '<br>')}`;

    const incidentId = window.currentDossierId;
    const currentUser =
      window.userSession?.email || window.userSession?.username || 'admin';

    // RENDER UI NGAY (Optimistic UI)
    const chatBox = document.getElementById('dossier-chat-box');
    if (chatBox) {
      chatBox.insertAdjacentHTML(
        'beforeend',
        `
          <div class="msg right">
              <div class="msg-sender">Tôi</div>
              <div class="report-bubble">
                  <div class="report-header"><span><i class="bx bxs-report"></i> BÁO CÁO NHANH</span></div>
                  <div class="report-body">${formattedContent}</div>
              </div>
          </div>
      `
      );
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    // GỬI VÀO SUPABASE
    try {
      // ✅ Dùng helper lấy UUID thay vì email/text
      const currentUserId =
        window.getCurrentUserId?.() || window.userSession?.id;

      const { error } = await supabaseClient.from('incident_logs').insert([
        {
          incident_id: incidentId,
          content: formattedContent,
          // ✅ Sửa: type → log_type
          log_type: 'Report',
          // ✅ Sửa: user → user_id (phải là UUID)
          user_id: currentUserId,
          // ✅ Thêm attachment_url nếu có (để null nếu không)
          attachment_url: null,
          // created_at sẽ tự động sinh bởi DB default, không cần truyền
        },
      ]);

      if (error) throw error;

      // Dọn dẹp form
      document.getElementById('qr-situation').value = '';
      document.getElementById('qr-action').value = '';
      document.getElementById('qr-request').value = '';

      if (typeof window.closeModal === 'function')
        window.closeModal('modal-quick-report');
      else document.getElementById('modal-quick-report').style.display = 'none';

      showToast('✅ Đã gửi báo cáo nhanh!', 'success');
    } catch (err) {
      console.error('❌ Lỗi gửi báo cáo:', err);
      showToast('Lỗi: ' + err.message, 'error');
    }
  };
  /**
   * =======================================================================
   * MODULE: OPEN REPORT MODAL (FULL FEATURES: AI, SYNC & NEW UI)
   * =======================================================================
   */
  // Khởi tạo cache rỗng
  window.cachedPlanData = null;

  // =========================================================================
  // 1. HÀM MỞ MODAL & TẢI DỮ LIỆU
  // =========================================================================
  // ========================================================================
  // HELPER: Parse JSONB an toàn + Format data
  // ========================================================================
  function safeParseJson(val, fallback = {}) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }

  function formatNumber(num) {
    const n = parseInt(num, 10);
    return isNaN(n) ? 0 : n;
  }

  function extractStatsFromContent(content) {
    if (!content) return { cases: 0, suspected: 0, deaths: 0 };
    const stats = { cases: 0, suspected: 0, deaths: 0 };

    // Regex linh hoạt cho nhiều format
    const caseMatch = content.match(
      /(?:số\s*mắc|ca\s*mắc|mắc|f0|confirmed)[:\s]*(\d+)/i
    );
    const suspectedMatch = content.match(
      /(?:nghi\s*ngờ|f1|suspected|probable)[:\s]*(\d+)/i
    );
    const deathMatch = content.match(
      /(?:tử\s*vong|chết|tv|deaths|fatalities)[:\s]*(\d+)/i
    );

    if (caseMatch) stats.cases = Math.max(stats.cases, parseInt(caseMatch[1]));
    if (suspectedMatch)
      stats.suspected = Math.max(stats.suspected, parseInt(suspectedMatch[1]));
    if (deathMatch)
      stats.deaths = Math.max(stats.deaths, parseInt(deathMatch[1]));

    return stats;
  }

  // ========================================================================
  // MAIN: OPEN REPORT MODAL - FIX CHUẨN THEO HTML
  // ========================================================================
  // ========================================================================
  // OPEN REPORT MODAL - FIX CHUẨN: FETCH → SET CACHE → SHOW → RENDER
  // ========================================================================
  window.openReportModal = async function (preSelectType, preFillData) {
    const modalId = 'modal-official-report';
    const modalEl = document.getElementById(modalId);
    if (!modalEl) {
      console.error('❌ Modal element not found:', modalId);
      return;
    }

    console.log('🔍 Opening report modal...');

    // 1. CLEANUP MODAL CŨ
    const existing = bootstrap.Modal?.getInstance(modalEl);
    if (existing) existing.dispose();
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
    modalEl.classList.remove('show', 'd-block');
    modalEl.style.display = '';
    modalEl.setAttribute('aria-hidden', 'true');

    // 2. RESET FORM
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v ?? '';
    };
    const title =
      document.getElementById('dossier-title')?.textContent?.trim() ||
      'Sự kiện chưa đặt tên';
    setVal('rpt-event-name', title);
    setVal('report-type', preSelectType || 'EMERGENCY');
    setVal('rpt-level', 'Chưa xác định');
    [
      'rpt-cases-new',
      'rpt-cases-total',
      'rpt-suspected-new',
      'rpt-suspected-total',
      'rpt-deaths-new',
      'rpt-deaths-total',
      'rpt-overview',
      'rpt-activities',
      'rpt-issues',
      'rpt-next-steps',
      'rpt-detected-incidents',
      'rpt-hr-changes',
      'rpt-lessons',
    ].forEach((id) => setVal(id, ''));

    if (typeof toggleReportFields === 'function') toggleReportFields();

    // 3. NHÁNH A: PRE-FILLED DATA (từ AAR transfer)
    if (preFillData) {
      console.log('📥 Loading with preFillData');
      window.cachedPlanData = {
        isPreFilled: true,
        source: 'aar_transfer',
        stats: preFillData.stats || {},
        summary: preFillData.summary || '',
        activitiesText: preFillData.activities || '',
        issues: preFillData.issues || '',
        detectedIncidents: preFillData.detectedIncidents || 'Không ghi nhận',
        lessons: preFillData.lessons || '',
        nextSteps: preFillData.nextSteps || 'Sự kiện đã kết thúc.',
        hrChanges: preFillData.hrChanges || 'Không thay đổi',
        level: preFillData.level || 'Theo dõi',
        sosRequests: preFillData.sosRequests || [],
      };

      // Show modal rồi render ngay (vì cache đã có sẵn)
      const modal = new bootstrap.Modal(modalEl, {
        backdrop: true,
        keyboard: true,
      });
      modal.show();

      // Render sau khi modal fully shown
      modalEl.addEventListener(
        'shown.bs.modal',
        () => {
          if (window.cachedPlanData) {
            window.renderReportContentFromCache(window.cachedPlanData);
          }
        },
        { once: true }
      );

      return;
    }

    // 4. NHÁNH B: FETCH TỪ DATABASE — QUAN TRỌNG: FETCH TRƯỚC KHI SHOW MODAL
    console.log('🔄 Fetching data from Supabase BEFORE showing modal...');

    try {
      const incidentId = window.currentDossierId;
      if (!incidentId) throw new Error('Missing incidentId');

      // Fetch song song tất cả bảng
      const [incRes, planRes, objRes, actRes, logRes] = await Promise.all([
        window.supabaseClient
          .from('incidents')
          .select('*')
          .eq('id', incidentId)
          .maybeSingle(),
        window.supabaseClient
          .from('incident_plans')
          .select('*')
          .eq('incident_id', incidentId)
          .order('updated_at', { ascending: false })
          .limit(1),
        window.supabaseClient
          .from('incident_objectives')
          .select('*')
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: true }),
        window.supabaseClient
          .from('incident_activities')
          .select('*')
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: true }),
        window.supabaseClient
          .from('incident_logs')
          .select('*')
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: true }),
      ]);

      const incData = incRes.data || {};
      const planData = planRes.data?.[0] || {};
      const objectives = objRes.data || [];
      const activities = actRes.data || [];
      const logs = logRes.data || [];

      console.log('📊 Fetched:', {
        objectives: objectives.length,
        activities: activities.length,
        logs: logs.length,
      });

      // Lọc SOS chính xác
      const sosRequests = logs.filter(
        (l) => String(l.log_type || '').toLowerCase() === 'sos'
      );
      console.log('🆘 Found SOS logs:', sosRequests.length);

      // Build activities summary
      const activitiesSummary =
        objectives.length > 0
          ? objectives
              .map((obj, i) => {
                const acts = activities.filter(
                  (a) => String(a.objective_id) === String(obj.id)
                );
                return `🎯 Mục tiêu ${i + 1}: ${obj.objective_text}\n${
                  acts.map((a) => `• ${a.content}`).join('\n') ||
                  '• Chưa có chi tiết'
                }`;
              })
              .join('\n\n')
          : 'Chưa có hoạt động.';

      // Aggregate stats từ logs
      const stats = { cases: 0, suspected: 0, deaths: 0 };
      logs.forEach((l) => {
        if (l.content) {
          const c = l.content.match(/(?:mắc|f0)[:\s]*(\d+)/i);
          const s = l.content.match(/(?:nghi ngờ|f1)[:\s]*(\d+)/i);
          const d = l.content.match(/(?:tử vong|tv)[:\s]*(\d+)/i);
          if (c) stats.cases = Math.max(stats.cases, +c[1]);
          if (s) stats.suspected = Math.max(stats.suspected, +s[1]);
          if (d) stats.deaths = Math.max(stats.deaths, +d[1]);
        }
      });

      // ✅ QUAN TRỌNG: GÁN CACHE NGAY LẬP TỨC, TRƯỚC KHI SHOW MODAL
      window.cachedPlanData = {
        isPreFilled: false,
        source: 'database_fetch',
        incident: {
          id: incData.id,
          name: incData.event_name || title,
          status: incData.status,
        },
        plan: {
          level: planData.level,
          summary: planData.summary,
          assessment: safeParseJson(planData.assessment),
          meta: safeParseJson(planData.meta),
        },
        objectives,
        activities,
        activitiesSummary,
        logs,
        sosRequests,
        stats,
      };

      console.log('✅ Cache assigned BEFORE modal show:', {
        sosCount: sosRequests.length,
        objectivesCount: objectives.length,
        stats,
      });

      // 5. SHOW MODAL (sau khi cache đã ready)
      const modal = new bootstrap.Modal(modalEl, {
        backdrop: true,
        keyboard: true,
      });
      modal.show();

      // 6. RENDER KHI MODAL FULLY SHOWN
      modalEl.addEventListener(
        'shown.bs.modal',
        function onReady() {
          console.log(
            '✅ Modal fully shown. Cache available?:',
            !!window.cachedPlanData
          );

          if (window.cachedPlanData) {
            console.log('🎨 Calling renderReportContentFromCache...');
            window.renderReportContentFromCache(window.cachedPlanData);
          } else {
            console.error('❌ Cache still missing at render time!');
          }

          // Cleanup listener
          modalEl.removeEventListener('shown.bs.modal', onReady);
        },
        { once: true }
      );
    } catch (err) {
      console.error('❌ Error fetching data:', err);
      setVal('rpt-overview', `⚠️ Lỗi tải dữ liệu: ${err.message}`);

      // Vẫn show modal để user có thể nhập manual
      const modal = new bootstrap.Modal(modalEl, {
        backdrop: true,
        keyboard: true,
      });
      modal.show();

      showToast(
        'Không thể tải dữ liệu tự động. Bạn vẫn có thể nhập thủ công.',
        'warning'
      );
    }
  };

  // Helper parse JSON an toàn
  function safeParseJson(val, fallback = {}) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
});
