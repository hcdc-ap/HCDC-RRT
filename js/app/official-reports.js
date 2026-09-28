// ============================================================
// BÁO CÁO CHÍNH THỨC — Soạn, gửi, xuất PDF báo cáo sự kiện
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  window.getCurrentUserEmail = function () {
    return window.userSession?.email || window.userSession?.username || null;
  };

  window.renderReportContentFromCache = function (cache) {
    console.log(' START RENDERING REPORT...');
    if (!cache) return console.error(' Cache is empty');

    // ✅ HELPER GHI TRỰC TIẾP VÀO DOM ( bypass mọi framework conflict )
    const forceSet = (id, val) => {
      const el = document.getElementById(id);
      if (el) {
        el.value = String(val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`✅ FORCED #${id}`);
      } else {
        console.error(`❌ MISSING #${id}`);
      }
    };

    try {
      // 1. Basic Info
      forceSet('rpt-event-name', cache.incident?.name || '');
      forceSet(
        'rpt-level',
        cache.plan?.level || cache.incident?.status || 'Chưa xác định'
      );

      // 2. Stats
      forceSet('rpt-cases-new', cache.stats?.cases ?? 0);
      forceSet('rpt-cases-total', cache.stats?.cases ?? 0);
      forceSet('rpt-suspected-new', cache.stats?.suspected ?? 0);
      forceSet('rpt-suspected-total', cache.stats?.suspected ?? 0);
      forceSet('rpt-deaths-new', cache.stats?.deaths ?? 0);
      forceSet('rpt-deaths-total', cache.stats?.deaths ?? 0);

      // 3. Overview & Activities
      const overview = [
        cache.plan?.summary ? `📋 IAP: ${cache.plan.summary}` : '',
        cache.plan?.assessment?.context
          ? ` Bối cảnh: ${cache.plan.assessment.context}`
          : '',
        cache.activitiesSummary
          ? `\n📌 Hoạt động:\n${cache.activitiesSummary}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      forceSet('rpt-overview', overview || 'Chưa có nội dung.');
      forceSet(
        'rpt-activities',
        cache.activitiesSummary || 'Chưa có hoạt động.'
      );

      // 🚨 4. SOS - FIX QUAN TRỌNG NHẤT
      const sosField = document.getElementById('rpt-detected-incidents');
      if (cache.sosRequests?.length > 0) {
        console.log(`🆘 Rendering ${cache.sosRequests.length} SOS logs...`);
        const sosText = cache.sosRequests
          .map((s, i) => {
            let txt = s.content || '';
            if (txt.includes('<')) {
              const d = document.createElement('div');
              d.innerHTML = txt;
              txt = d.textContent.trim();
            }
            return `${i + 1}. [${new Date(s.created_at).toLocaleString(
              'vi-VN'
            )}] ${s.user_email || 'Thành viên'}:\n   ${txt}`;
          })
          .join('\n\n');

        const finalSOS = `=== 🆘 YÊU CẦU HỖ TRỢ KHẨN CẤP ===\n\n${sosText}\n\n(Tổng: ${cache.sosRequests.length})`;

        // ✅ GHI TRỰC TIẾP & VERIFY
        if (sosField) {
          sosField.value = finalSOS;
          sosField.dispatchEvent(new Event('input'));
          sosField.dispatchEvent(new Event('change'));
          console.log('✅ SOS RENDERED. Length:', sosField.value.length);

          // Verify sau 50ms
          setTimeout(
            () =>
              console.log('🔍 SOS VERIFY:', sosField.value.substring(0, 50)),
            50
          );
        }
      } else {
        if (sosField) sosField.value = 'Không ghi nhận sự cố bất thường/SOS.';
      }

      // 5. Other fields
      forceSet(
        'rpt-hr-changes',
        cache.plan?.meta?.approval?.participants?.internal || 'Không thay đổi.'
      );
      forceSet('rpt-issues', 'Chưa ghi nhận khó khăn.');
      forceSet(
        'rpt-next-steps',
        cache.incident?.status === 'active'
          ? 'Tiếp tục giám sát.'
          : 'Sự kiện đã kết thúc.'
      );

      const lessonsEl = document.getElementById('section-completion');
      if (lessonsEl)
        lessonsEl.style.display = cache.plan?.meta?.cir ? 'block' : 'none';
      forceSet('rpt-lessons', cache.plan?.meta?.cir || '');

      console.log('✅ RENDER COMPLETE');
    } catch (err) {
      console.error(' RENDER CRASHED:', err);
    }
  };
  console.log('✅ OVERRIDE SUCCESSFUL! Now try opening modal again.');
  // =========================================================================
  // 2. KÍCH HOẠT RENDER LẠI KHI ĐỔI DROPDOWN LOẠI BÁO CÁO
  // =========================================================================
  window.onReportTypeChange = function () {
    if (typeof toggleReportFields === 'function') toggleReportFields();
    renderReportContentFromCache(window.cachedPlanData);
  };

  // =========================================================================
  // 3. HÀM "BỘ NÃO" RENDER GIAO DIỆN CHUẨN 3 LOẠI BÁO CÁO (HIỂN THỊ FULL HOẠT ĐỘNG)
  // =========================================================================

  window.analyzePersonnelChangesClient = async function (incidentId) {
    try {
      // Lấy log liên quan đến thay đổi nhân sự (Ví dụ: log có chứa từ khóa 'thay thế')
      const { data, error } = await supabaseClient
        .from('incident_logs')
        .select('content, created_at')
        .eq('incident_id', incidentId)
        .or('content.ilike.%thay thế%,content.ilike.%đổi nhân sự%')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) return 'Không có thay đổi nhân sự.';

      return data
        .map(
          (log) =>
            `[${new Date(log.created_at).toLocaleTimeString()}] ${log.content}`
        )
        .join('\n');
    } catch (err) {
      console.error('Lỗi phân tích HR:', err);
      return 'Lỗi khi tải thông tin nhân sự.';
    }
  };

  // ========================================================================
  // SUBMIT OFFICIAL REPORT - FULL VERSION
  // ========================================================================
  window.submitOfficialReport = async function () {
    // 1. VALIDATE CƠ BẢN
    if (!window.currentDossierId) {
      showToast('Lỗi: Không xác định được sự kiện.', 'error');
      return;
    }

    // 2. UI LOADING STATE
    const btn =
      document.getElementById('btn-save-report') ||
      document.querySelector('#modal-official-report .btn-primary');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Đang xử lý...';

    try {
      // 3. HELPER: Lấy giá trị input an toàn
      const getNum = (id) => {
        const el = document.getElementById(id);
        const val = el?.value?.trim();
        const num = parseInt(val, 10);
        return isNaN(num) ? 0 : num;
      };

      const getStr = (id) => document.getElementById(id)?.value?.trim() || '';

      // 4. BUILD PAYLOAD - ĐÚNG SCHEMA incident_reports
      const reportData = {
        incident_id: window.currentDossierId,

        // Text fields
        report_type: getStr('report-type'),
        level: getStr('rpt-level'),
        event_name: getStr('rpt-event-name'),
        overview: getStr('rpt-overview'),
        activities: getStr('rpt-activities'),
        issues: getStr('rpt-issues'),
        next_steps: getStr('rpt-next-steps'),
        hr_changes: getStr('rpt-hr-changes'),
        lessons: getStr('rpt-lessons'),
        detected_incidents: getStr('rpt-detected-incidents'),
        reporter:
          window.userSession?.email ||
          window.userSession?.username ||
          'Unknown',

        // ✅ Integer fields - Ép kiểu an toàn
        cases_new: getNum('rpt-cases-new'),
        suspected_new: getNum('rpt-suspected-new'),
        deaths_new: getNum('rpt-deaths-new'),
        cases_total: getNum('rpt-cases-total'),
        suspected_total: getNum('rpt-suspected-total'),
        deaths_total: getNum('rpt-deaths-total'),

        // ✅ Auto timestamp
        created_at: new Date().toISOString(),
      };

      console.log('📦 Report payload:', reportData);

      // 5. INSERT VÀO incident_reports
      const { data: inserted, error } = await window.supabaseClient
        .from('incident_reports')
        .insert([reportData])
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase error:', error);
        throw new Error(error.message || 'Lỗi khi lưu báo cáo');
      }

      console.log('✅ Report saved:', inserted?.id);

      // 6. SUCCESS FEEDBACK
      showToast('✅ Đã lưu báo cáo vào hệ thống thành công!', 'success');

      // Đóng modal báo cáo
      const reportModalEl = document.getElementById('modal-official-report');
      if (reportModalEl) {
        const modalInstance = bootstrap.Modal.getInstance(reportModalEl);
        if (modalInstance) modalInstance.hide();
        else reportModalEl.style.display = 'none';
      }

      // 7. ✅ TẠO LOG ENTRY để báo cáo hiện trong chat
      const logEntry = {
        incident_id: window.currentDossierId,
        log_type: reportData.report_type || 'Report',
        content:
          `📊 **BÁO CÁO: ${reportData.report_type || 'Chính thức'}**\n` +
          `**Cấp độ:** ${reportData.level || 'N/A'}\n` +
          `**Tóm tắt:** ${
            reportData.overview?.substring(0, 100) || 'Không có tóm tắt'
          }${reportData.overview?.length > 100 ? '...' : ''}`,
        user_id: window.userSession?.id || null,
        attachment_url: null, // Sẽ update nếu export PDF
        created_at: new Date().toISOString(),
      };

      const { error: logError } = await window.supabaseClient
        .from('incident_logs')
        .insert([logEntry]);

      if (logError) {
        console.warn('⚠️ Không tạo được log entry:', logError.message);
      }

      // 8. RELOAD CHAT để hiển thị báo cáo vừa lưu
      if (typeof window.loadEventLogs === 'function') {
        await window.loadEventLogs(window.currentDossierId);
      }

      // 9. ✅ SHOW STATS POPUP + EXPORT CONFIRM (Sau delay nhỏ để UX mượt)
      setTimeout(() => {
        const statsSummary = {
          reportType: reportData.report_type,
          casesNew: reportData.cases_new,
          casesTotal: reportData.cases_total,
          suspectedNew: reportData.suspected_new,
          suspectedTotal: reportData.suspected_total,
          deathsNew: reportData.deaths_new,
          deathsTotal: reportData.deaths_total,
          level: reportData.level,
          eventName: reportData.event_name,
        };

        showReportSuccessModal(statsSummary, null, inserted?.id);
      }, 500);
    } catch (err) {
      console.error('❌ Lỗi lưu báo cáo:', err);
      showToast(
        'Lỗi lưu báo cáo: ' + (err.message || 'Không xác định'),
        'error'
      );
    } finally {
      // 10. RESTORE BUTTON STATE
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  };

  // ========================================================================
  // HELPER: Modal hiển thị Stats + Export Confirm
  // ========================================================================
  function showReportSuccessModal(stats, fileUrl = null, reportId = null) {
    // Xóa modal cũ nếu tồn tại (tránh duplicate)
    const oldModal = document.getElementById('reportSuccessModal');
    if (oldModal) oldModal.remove();

    // Build stats HTML
    const statsHtml = `
    <div class="card bg-light border-0 mb-3">
      <div class="card-header fw-bold bg-white d-flex align-items-center">
        <i class='bx bx-stats me-2 text-primary'></i> 📊 Số liệu báo cáo
      </div>
      <div class="card-body">
        <div class="row g-3">
          <div class="col-4 text-center">
            <small class="text-muted d-block">Ca mắc</small>
            <div class="fw-bold text-primary fs-5">${stats.casesNew} <span class="text-muted fs-6">/ ${stats.casesTotal}</span></div>
            <small class="text-muted" style="font-size: 10px;">Mới / Tổng</small>
          </div>
          <div class="col-4 text-center">
            <small class="text-muted d-block">Nghi ngờ</small>
            <div class="fw-bold text-warning fs-5">${stats.suspectedNew} <span class="text-muted fs-6">/ ${stats.suspectedTotal}</span></div>
            <small class="text-muted" style="font-size: 10px;">Mới / Tổng</small>
          </div>
          <div class="col-4 text-center">
            <small class="text-muted d-block">Tử vong</small>
            <div class="fw-bold text-danger fs-5">${stats.deathsNew} <span class="text-muted fs-6">/ ${stats.deathsTotal}</span></div>
            <small class="text-muted" style="font-size: 10px;">Mới / Tổng</small>
          </div>
        </div>
      </div>
    </div>
  `;

    // Build action buttons
    const hasFile = fileUrl && fileUrl.trim();
    const actionButtons = `
    <div class="d-grid gap-2">
      ${
        hasFile
          ? `
        <a href="${fileUrl}" target="_blank" class="btn btn-primary">
          <i class='bx bxs-file-pdf'></i> Mở file báo cáo
        </a>
      `
          : `
        <button type="button" class="btn btn-outline-primary" id="btn-export-now">
          <i class='bx bx-export'></i> Xuất file PDF ngay
        </button>
      `
      }
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Đóng</button>
    </div>
  `;

    // Tạo modal HTML
    const modalHtml = `
    <div class="modal fade" id="reportSuccessModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg">
          <div class="modal-header bg-success text-white">
            <h5 class="modal-title fw-bold">
              <i class='bx bx-check-circle me-2'></i> Lưu báo cáo thành công!
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="mb-3">
              Báo cáo <strong class="text-primary">${
                stats.reportType || 'Chính thức'
              }</strong> 
              ${stats.eventName ? `cho sự kiện "${stats.eventName}"` : ''} 
              đã được lưu vào hệ thống.
            </p>
            
            ${statsHtml}
            ${actionButtons}
          </div>
        </div>
      </div>
    </div>
  `;

    // Append vào body
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    const modalEl = document.getElementById('reportSuccessModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Handle "Xuất file PDF ngay" click
    document
      .getElementById('btn-export-now')
      ?.addEventListener('click', async function () {
        // Disable button tránh click nhiều lần
        this.disabled = true;
        this.innerHTML =
          '<i class="bx bx-loader-alt bx-spin"></i> Đang xuất...';

        try {
          // Gọi hàm export (truyền reportId để lấy data chính xác)
          if (typeof window.exportOfficialReport === 'function') {
            const exportedUrl = await window.exportOfficialReport(reportId);

            if (exportedUrl) {
              // Update modal với link file mới
              modal.hide();
              modalEl.addEventListener(
                'hidden.bs.modal',
                function cleanup() {
                  showReportSuccessModal(stats, exportedUrl, reportId);
                  modalEl.removeEventListener('hidden.bs.modal', cleanup);
                },
                { once: true }
              );
            }
          } else {
            showToast('⚠️ Chức năng xuất file chưa sẵn sàng!', 'warning');
          }
        } catch (err) {
          console.error('Lỗi export:', err);
          showToast('Lỗi xuất file: ' + err.message, 'error');
        } finally {
          // Restore button
          this.disabled = false;
          this.innerHTML = '<i class="bx bx-export"></i> Xuất file PDF ngay';
        }
      });

    // Cleanup khi modal đóng
    modalEl.addEventListener(
      'hidden.bs.modal',
      function () {
        setTimeout(() => {
          modalEl.remove();
          document
            .querySelectorAll('.modal-backdrop')
            .forEach((el) => el.remove());
        }, 100);
      },
      { once: true }
    );
  }


  // ========================================================================
  // EXPORT OFFICIAL REPORT - FULL VERSION (PDF + Chat Integration)
  // ========================================================================
  window.exportOfficialReport = async function (reportId = null) {
    const incidentId = window.currentDossierId;
    const reportType = $('#report-type').val()?.trim() || 'DAILY'; // DAILY, EMERGENCY, COMPLETION

    if (!incidentId)
      return showToast('Lỗi: Không tìm thấy ID sự kiện.', 'error');

    showLoadingSpinner();

    try {
      // ==============================================================
      // 1. FETCH DỮ LIỆU TỪ SUPABASE
      // ==============================================================
      const [incRes, planRes, reportRes] = await Promise.all([
        // Incident chính
        window.supabaseClient
          .from('incidents')
          .select('*')
          .eq('id', incidentId)
          .maybeSingle(),

        // Incident plan (lấy bản mới nhất)
        window.supabaseClient
          .from('incident_plans')
          .select('*')
          .eq('incident_id', incidentId)
          .order('updated_at', { ascending: false })
          .limit(1),

        // Official report (nếu có reportId)
        reportId
          ? window.supabaseClient
              .from('incident_reports')
              .select('*')
              .eq('id', reportId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const incData = incRes.data || {};
      const planData = planRes.data?.[0] || {};
      const reportData = reportRes.data || {};

      // ✅ Parse JSONB an toàn
      const parseJson = (val, fallback = {}) => {
        if (!val) return fallback;
        if (typeof val === 'object') return val;
        try {
          return JSON.parse(val);
        } catch {
          return fallback;
        }
      };

      const assessment = parseJson(planData.assessment, {});
      const meta = parseJson(planData.meta, {});

      // ==============================================================
      // 2. CONFIG TEMPLATE & HELPER FUNCTIONS
      // ==============================================================
      const TEMPLATES = {
        DAILY: '1DfPyiAVAd5ZmuKw7Nf62EtE3zDWLGL70KNi2h51BERs',
        EMERGENCY: '1oMRtL8cSNm6ak7wNsfU2NOKH5LbmW3aOifDGkrmTTyk',
        COMPLETION: '1QQbFqLziRiyQQqaP-Mmuvdd2JN1n1RH3lE-6EsmbtjE',
      };
      const templateId = TEMPLATES[reportType] || TEMPLATES.DAILY;

      // Helper: Format datetime VN
      const toVNDateTime = (dateStr) => {
        if (!dateStr) return 'Chưa cập nhật';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'Chưa cập nhật';
        return `${d.getHours().toString().padStart(2, '0')}:${d
          .getMinutes()
          .toString()
          .padStart(2, '0')} ngày ${d.getDate().toString().padStart(2, '0')}/${(
          d.getMonth() + 1
        )
          .toString()
          .padStart(2, '0')}/${d.getFullYear()}`;
      };

      // Helper: Format checkbox ☑/☐
      const getCheckbox = (condition) =>
        condition ? '☑ Có    ☐ Không' : '☐ Có    ☑ Không';

      // ==============================================================
      // 3. BUILD PAYLOAD CHO GOOGLE APPS SCRIPT
      // ==============================================================

      // Lấy giá trị từ form hoặc fallback từ DB
      const getVal = (selector, fallback = '') => {
        const val = $(selector)?.val()?.trim();
        return val && val !== 'null' && val !== 'undefined' ? val : fallback;
      };

      const hrChanges = getVal('#rpt-hr-changes', reportData.hr_changes || '');
      const hasHrChange =
        hrChanges && !/không\s+(có\s+)?thay đổi/i.test(hrChanges.toLowerCase());

      const payload = {
        templateId: templateId,
        fileName: `[${reportType}]_${
          incData.event_name || incidentId
        }_${Date.now()}`,
        replacements: {
          // === HEADER ===
          '{{VERSION}}': '01',
          '{{NGAY_BAO_CAO}}': toVNDateTime(new Date()),
          '{{TEN_SU_KIEN}}':
            getVal('#rpt-event-name', incData.event_name) || 'Chưa có tên',
          '{{CAP_DO}}': getVal('#rpt-level', planData.level) || 'Chưa xác định',

          // === INCIDENT INFO (từ DB) ===
          '{{DIA_DIEM}}': incData.location_text || 'Chưa cập nhật địa điểm',
          '{{MA_XA}}': incData.ma_xa || '',
          '{{NGUON_TIN}}': 'Hệ thống Quản lý Giám sát RRT - HCDC',
          '{{THOI_DIEM_SU_CO}}': toVNDateTime(
            incData.activation_time || incData.created_at
          ),
          '{{NGUYEN_NHAN}}': assessment.causes || 'Đang điều tra xác minh',

          // === CLINICAL (fix typo {{LAM_SAN}} → {{LAM_SANG}}) ===
          '{{LAM_SAN}}':
            assessment.clinical_char ||
            assessment.clinical ||
            'Chưa ghi nhận đặc tính',
          '{{LAM_SANG}}':
            assessment.clinical_char ||
            assessment.clinical ||
            'Chưa ghi nhận đặc tính',

          '{{BOI_CANH}}':
            assessment.context || planData.context || 'Chưa cập nhật bối cảnh',
          '{{DU_BAO}}': assessment.forecast || 'Tiếp tục theo dõi diễn tiến',

          // === CHECKBOXES ===
          '{{CHECK_NHAN_SU}}': getCheckbox(hasHrChange),
          '{{CHECK_KET_THUC}}': getCheckbox(reportType === 'COMPLETION'),

          // === CONTACT INFO ===
          '{{CHUC_VU}}':
            window.userSession?.position ||
            meta.approval?.approverTitle ||
            'Cán bộ RRT',
          '{{TEN_NGUOI_BC}}':
            window.userSession?.full_name ||
            window.userSession?.username ||
            'Cán bộ HCDC',
          '{{EMAIL}}': window.userSession?.email || '',
          '{{SDT}}':
            window.userSession?.phone ||
            meta.coordination?.channel ||
            'Chưa cập nhật',
          '{{DOI_PHOI_HOP}}':
            meta.coordination?.partners || 'Đội Đáp ứng nhanh (RRT) HCDC',
          '{{CO_QUAN}}': 'Trung tâm Kiểm soát Bệnh tật TP.HCM (HCDC)',

          // === EPIDEMIOLOGY STATS (Integer fields) ===
          '{{MAC_MOI}}':
            getVal('#rpt-cases-new', reportData.cases_new?.toString()) || '0',
          '{{MAC_TONG}}':
            getVal('#rpt-cases-total', reportData.cases_total?.toString()) ||
            '0',
          '{{NGHI_MOI}}':
            getVal(
              '#rpt-suspected-new',
              reportData.suspected_new?.toString()
            ) || '0',
          '{{NGHI_TONG}}':
            getVal(
              '#rpt-suspected-total',
              reportData.suspected_total?.toString()
            ) || '0',
          '{{TV_MOI}}':
            getVal('#rpt-deaths-new', reportData.deaths_new?.toString()) || '0',
          '{{TV_TONG}}':
            getVal('#rpt-deaths-total', reportData.deaths_total?.toString()) ||
            '0',

          // === CONTENT SECTIONS ===
          '{{TONG_QUAN}}':
            getVal('#rpt-overview', reportData.overview) || 'Không có nội dung',
          '{{HOAT_DONG}}':
            getVal('#rpt-activities', reportData.activities) ||
            'Không có nội dung',
          '{{KHO_KHAN}}':
            getVal('#rpt-issues', reportData.issues) || 'Chưa ghi nhận',
          '{{DE_XUAT}}':
            getVal('#rpt-next-steps', reportData.next_steps) ||
            'Tiếp tục theo dõi',
          '{{SU_CO_PHAT_HIEN}}':
            getVal('#rpt-detected-incidents', reportData.detected_incidents) ||
            'Không có',
          '{{NHAN_SU}}': hrChanges || 'Không có thay đổi nhân sự',
          '{{BAI_HOC}}':
            getVal('#rpt-lessons', reportData.lessons) || 'Chưa cập nhật',
        },
      };

      console.log('📦 Export payload:', {
        templateId,
        fileName: payload.fileName,
      });

      // ==============================================================
      // 4. CALL GOOGLE APPS SCRIPT API
      // ==============================================================
      const GAS_API_URL =
        'https://script.google.com/macros/s/AKfycbwA-tfQX4wNbbUlb5AwHO3eCUF7tbCKF4QN_TxyDN9dRAYryw8My1DUZhjbWVHtX_u1/exec';

      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      const res = await response.json();
      console.log('🖨️ GAS response:', res);

      hideLoadingSpinner();

      if (res.success && res.docsUrl) {
        // ✅ Mở file trong tab mới
        window.open(res.docsUrl, '_blank');
        showToast(`🎉 Đã xuất báo cáo ${reportType} thành công!`, 'success');

        // ✅ QUAN TRỌNG: Update incident_logs với file URL để hiện trong chat
        await updateReportLogWithFile(incidentId, reportType, res.docsUrl);

        return res.docsUrl;
      } else {
        throw new Error(res.message || 'Xưởng in trả về lỗi không xác định');
      }
    } catch (err) {
      console.error('❌ Lỗi export report:', err);
      hideLoadingSpinner();
      showToast('Lỗi xuất báo cáo: ' + err.message, 'error');
      return null;
    }
  };

  // ========================================================================
  // HELPER: Update incident_logs với file URL sau khi export thành công
  // ========================================================================
  async function updateReportLogWithFile(incidentId, reportType, fileUrl) {
    try {
      // Tìm log entry gần nhất có log_type = reportType
      const { data: existingLog } = await window.supabaseClient
        .from('incident_logs')
        .select('id')
        .eq('incident_id', incidentId)
        .eq('log_type', reportType)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingLog?.id) {
        // Update attachment_url cho log existing
        await window.supabaseClient
          .from('incident_logs')
          .update({ attachment_url: fileUrl })
          .eq('id', existingLog.id);
        console.log('✅ Updated log with file URL:', existingLog.id);
      } else {
        // Tạo log entry mới nếu chưa có
        await window.supabaseClient.from('incident_logs').insert([
          {
            incident_id: incidentId,
            log_type: reportType,
            content: `📄 Báo cáo ${reportType} đã được xuất thành công`,
            user_id: window.userSession?.id || null,
            attachment_url: fileUrl,
            created_at: new Date().toISOString(),
          },
        ]);
        console.log('✅ Created new log with file URL');
      }

      // Reload chat để hiển thị link download
      if (typeof window.loadEventLogs === 'function') {
        await window.loadEventLogs(incidentId);
      }
    } catch (err) {
      console.warn('⚠️ Could not update log with file URL:', err.message);
      // Không throw error để không block UX chính
    }
  }

  // ============================================================
  // HÀM TOGGLE FIELDS (VIẾT LẠI JS THUẦN - FIX LỖI ILLEGAL INVOCATION)
  // ============================================================
  window.toggleReportFields = function () {
    // Dùng document.getElementById thay cho $
    const el = document.getElementById('report-type');
    if (!el) return; // An toàn nếu chưa load form

    const type = el.value;
    const section = document.getElementById('section-completion');

    if (section) {
      if (type === 'COMPLETION') {
        section.style.display = 'block'; // Hiện
      } else {
        section.style.display = 'none'; // Ẩn
      }
    }
  };
});
