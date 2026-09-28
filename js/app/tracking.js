// ============================================================
// TRACKING — Theo dõi sự kiện, hồ sơ (dossier), thông báo, duyệt hồ sơ
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // Chia sẻ cho các file js/app/* khác (trước đây dùng chung 1 closure)
  rrtShared.getStatusTextClient = getStatusTextClient;
  rrtShared.getStatusClassClient = getStatusClassClient;


  // ============================================================================
  // renderTrackingPage — THÊM "Thời gian kết thúc" cho thẻ sự kiện đã đóng.
  //   Nguồn: created_at (SỚM NHẤT) của notification 'ket_thuc' theo incident_id.
  //   Query 1 LẦN cho các sự kiện closed đang hiển thị, rồi tra map khi render.
  // ============================================================================
  window.renderTrackingPage = async function (forceFetch = false) {
    const container = document.getElementById('event-grid-container');
    if (!container) return;

    // 1. Tải dữ liệu
    if (
      forceFetch ||
      !window.appState.trackingIncidents ||
      window.appState.trackingIncidents.length === 0
    ) {
      container.innerHTML =
        '<div class="text-center p-4"><span class="spinner-border text-primary"></span><p>Đang tải sự kiện...</p></div>';
      const { data, error } = await window.supabaseClient
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Lỗi Supabase:', error);
        container.innerHTML = `<p class="text-center text-danger">Lỗi tải dữ liệu: ${error.message}</p>`;
        return;
      }
      window.appState.trackingIncidents = data || [];
    }

    let incidents = window.appState.trackingIncidents;

    // 2. Phân quyền xem sự cố
    const role = (window.userSession?.role || '').toLowerCase();
    const myEmail = String(window.userSession?.email || '')
      .toLowerCase()
      .trim();
    const myMaXa = String(window.userSession?.workplace_ma_xa || '').trim();
    if (role === 'admin') {
      // admin: thấy tất cả — không lọc
    } else {
      incidents = incidents.filter((inc) => {
        const isMyWard =
          role === 'ward_admin' &&
          myMaXa &&
          String(inc.ma_xa || '').trim() === myMaXa;
        const members = String(inc.members || '').toLowerCase();
        const initial = String(
          inc.initial_selected_members || ''
        ).toLowerCase();
        const declined = String(inc.declined_members || '').toLowerCase();
        const hasJoined = members.includes(myEmail);
        const isInvited =
          initial.includes(myEmail) && !declined.includes(myEmail);
        return isMyWard || hasJoined || isInvited;
      });
    }

    // 2b. Lấy THỜI GIAN KẾT THÚC cho các sự kiện đã đóng (1 query duy nhất)
    const closureTimeMap = new Map(); // incident_id -> created_at (sớm nhất)
    try {
      const closedIds = incidents
        .filter((i) => i.status === 'closed')
        .map((i) => i.id)
        .filter(Boolean);
      if (closedIds.length) {
        const { data: closureNotifs } = await window.supabaseClient
          .from('notifications')
          .select('incident_id, created_at')
          .eq('notification_type', 'ket_thuc')
          .in('incident_id', closedIds);
        (closureNotifs || []).forEach((n) => {
          const cur = closureTimeMap.get(n.incident_id);
          if (!cur || new Date(n.created_at) < new Date(cur)) {
            closureTimeMap.set(n.incident_id, n.created_at);
          }
        });
      }
    } catch (e) {
      console.warn('[tracking] Không lấy được thời gian kết thúc:', e);
    }

    const fmtVN = (t) =>
      t
        ? new Date(t).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour12: false,
          })
        : 'N/A';

    // 3. Tìm kiếm & ngày tháng
    const searchKey = (
      document.getElementById('tracking-search-input')?.value || ''
    ).toLowerCase();
    const startDateVal = $('#filter-date-start-tracking').val();
    const endDateVal = $('#filter-date-end-tracking').val();
    let startTs = startDateVal
      ? new Date(startDateVal + 'T00:00:00').getTime()
      : 0;
    let endTs = endDateVal
      ? new Date(endDateVal + 'T23:59:59').getTime()
      : Infinity;

    container.innerHTML = '';
    let hasResult = false;

    // 4. Render
    incidents.forEach((inc) => {
      const eventName = String(inc.event_name || 'Không có tên');
      const location = String(inc.location_text || 'N/A');
      const id = String(inc.id || '');
      const timestamp = inc.created_at
        ? new Date(inc.created_at).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour12: false,
          })
        : 'N/A';

      const countList = (s) =>
        String(s || '')
          .split(';')
          .filter((x) => x.trim()).length;
      const confirmedCount = countList(inc.members);
      const declinedCount = countList(inc.declined_members);
      const invitedCount = countList(inc.initial_selected_members);
      const respondedCount = confirmedCount + declinedCount;
      const pendingCount = Math.max(0, invitedCount - respondedCount);

      if (
        searchKey &&
        !eventName.toLowerCase().includes(searchKey) &&
        !location.toLowerCase().includes(searchKey)
      )
        return;

      if (startDateVal || endDateVal) {
        const incTs = new Date(inc.created_at).getTime();
        if (incTs < startTs || incTs > endTs) return;
      }
      hasResult = true;

      const isClosed = inc.status === 'closed';
      const cardClass = isClosed
        ? 'event-card ev-closed'
        : 'event-card ev-active';
      const badgeClass = isClosed
        ? 'ev-status st-closed'
        : 'ev-status st-active';
      const statusText = isClosed ? '✔ Đã kết thúc' : '🔴 Đang kích hoạt';
      const incString = encodeURIComponent(JSON.stringify(inc));
      const adminName =
        typeof window.getUserName === 'function'
          ? window.getUserName(inc.admin_activate)
          : 'admin';

      // Dòng thời gian kết thúc (chỉ khi đã đóng VÀ có dữ liệu)
      const closureTime = isClosed ? closureTimeMap.get(inc.id) : null;
      const closureLine = closureTime
        ? `<br><i class='bx bx-check-circle' style="color:#16a34a;"></i> Kết thúc: ${fmtVN(
            closureTime
          )}`
        : '';

      container.insertAdjacentHTML(
        'beforeend',
        `
          <div class="${cardClass}" onclick="openDossierView('${jsAttr(incString)}')" style="cursor:pointer;">
              <span class="${badgeClass}">${statusText}</span>
              <h5 style="margin: 0 0 10px 0; font-weight: bold; color: #333; padding-right: 90px;">${rrtShared.escapeHtml(
                eventName
              )}</h5>

              <div style="font-size: 13px; color: #666;">
                  <i class='bx bx-map'></i> Địa điểm: ${rrtShared.escapeHtml(
                    location
                  )}<br>
                  <i class='bx bx-time'></i> Kích hoạt: ${timestamp}${closureLine}
              </div>

              <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: end; border-top: 1px solid #eee; padding-top: 10px;">
                   <div style="font-size: 10px; color: #888;">
                      <span style="font-family: monospace;">#${id.substring(
                        0,
                        8
                      )}</span><br>
                      <i class='bx bxs-user-badge'></i> <b>${rrtShared.escapeHtml(
                        adminName
                      )}</b>
                   </div>
                   <small style="text-align:right; line-height:1.6; font-size: 12px;">
                      <strong>${respondedCount}</strong>${
          invitedCount > 0 ? `/${invitedCount}` : ''
        } phản hồi<br>
                      <span style="color:#16a34a;" title="Xác nhận tham gia">✅ ${confirmedCount}</span> ·
                      <span style="color:#dc2626;" title="Không tham gia">❌ ${declinedCount}</span> ·
                      <span style="color:#d97706;" title="Chưa phản hồi">⏳ ${pendingCount}</span>
                   </small>
              </div>
          </div>
      `
      );
    });

    if (!hasResult) {
      container.innerHTML =
        '<p class="text-center text-muted" style="grid-column: 1/-1; padding: 20px;">Không tìm thấy kết quả phù hợp.</p>';
    }
  };

  // --- CÁC HÀM HỖ TRỢ GIAO DIỆN MỚI ---
  // ============================================================
  // 1. Mở giao diện chi tiết (Dossier) - PHIÊN BẢN HOÀN CHỈNH NHẤT
  // ============================================================
  window.openDossierView = function (incString) {
    let incParams;
    try {
      incParams = JSON.parse(decodeURIComponent(incString));
    } catch (e) {
      console.error('Lỗi parse dữ liệu sự kiện:', e);
      return;
    }
    // --- LẤY DỮ LIỆU TƯƠI NHẤT ---
    let inc = incParams;
    if (window.appState && window.appState.trackingIncidents) {
      const freshInc = window.appState.trackingIncidents.find(
        (i) => String(i.id) === String(incParams.id)
      );
      if (freshInc) inc = freshInc;
    }

    // 🔥 GÁN ID CHO BIẾN TOÀN CỤC
    window.selectedIncidentId = inc.id;
    window.currentDossierId = inc.id;

    // --- CHUYỂN VIEW ---
    const listView = document.getElementById('tracking-view-list');
    const dossierView = document.getElementById('tracking-view-dossier');
    if (listView) listView.style.display = 'none';
    if (dossierView) {
      dossierView.style.display = 'block';
      dossierView.classList.add('active');
    }

    // Helper lấy tên
    const getName = (email) => {
      if (!email) return 'Unknown';
      if (typeof window.getUserName === 'function')
        return window.getUserName(email);
      return email;
    };

    // --- ĐIỀN HEADER (Dùng đúng tên cột DB: event_name, location_text) ---
    if (document.getElementById('dossier-title'))
      document.getElementById('dossier-title').textContent =
        inc.event_name || 'Chưa có tiêu đề';
    if (document.getElementById('dossier-id'))
      document.getElementById('dossier-id').textContent = '#' + (inc.id || '');
    if (document.getElementById('dossier-time')) {
      // Đổi ISO UTC thô -> giờ Việt Nam dễ đọc (dd/mm/yyyy, hh:mm:ss)
      let timeText = 'Chưa cập nhật';
      const rawTime = inc.activation_time || inc.created_at;
      if (rawTime) {
        const d = new Date(rawTime);
        timeText = isNaN(d.getTime())
          ? String(rawTime)
          : d.toLocaleString('vi-VN', { hour12: false });
      }
      document.getElementById('dossier-time').textContent = timeText;
    }
    if (document.getElementById('dossier-location'))
      document.getElementById('dossier-location').textContent =
        inc.location_text || '';

    // --- TRẠNG THÁI ---
    const isClosed = inc.status === 'closed';
    const isActivated = !!inc.admin_activate; // Flag kích hoạt
    const badge = document.getElementById('dossier-status-badge');
    if (badge) {
      badge.className = isClosed
        ? 'ev-status st-closed'
        : 'ev-status st-active';
      badge.textContent = isClosed
        ? '✔ ĐÃ KẾT THÚC'
        : isActivated
        ? '🔴 ĐANG HOẠT ĐỘNG'
        : '⚠️ CHỜ KÍCH HOẠT';
    }

    const isAdmin = window.userSession.role.toLowerCase() === 'admin';

    // --- XỬ LÝ CÁC TAB HIỂN THỊ ---
    // Reset về Tab đầu tiên (Nhật ký) mỗi khi mở lại Modal để tránh bị lưu cache view cũ
    const logTabBtn = document.getElementById('tab-log-tab');
    if (logTabBtn && typeof bootstrap !== 'undefined') {
      const tabTrigger = new bootstrap.Tab(logTabBtn);
      tabTrigger.show();
    }

    // --- XỬ LÝ ẨN/HIỆN CÁC NÚT CHỨC NĂNG TRÊN HEADER ---

    // 1. Nút Lập Báo Cáo (Màu vàng)
    const btnReport = document.getElementById('btn-open-report-modal');
    if (btnReport) {
      btnReport.onclick = function () {
        window.openReportModal();
      };

      btnReport.title = 'Lập báo cáo';

      if (isClosed) {
        if (isAdmin) {
          btnReport.style.display = 'inline-block';
          btnReport.title = 'Xuất lại Báo cáo Hoàn thành (từ dữ liệu AAR)';
          const aarData = {
            summary: inc.aar_summary,
            issues: inc.aar_issues,
            lessons: inc.aar_lessons_learned,
          };
          btnReport.onclick = function () {
            window.openReportModal('COMPLETION', aarData);
          };
        } else {
          btnReport.style.display = 'none';
        }
      } else {
        // Lập báo cáo tình hình: HCDC, tuyến cơ sở của phường/xã sự kiện,
        // hoặc Đội trưởng (Leader) — khớp RLS bảng incident_reports
        const isLeader =
          String(window.userSession?.position || '').toLowerCase() === 'leader';
        btnReport.style.display =
          window.canManageIncident?.(inc) || isLeader ? 'inline-block' : 'none';
      }
    }

    // 2. 🔥 NÚT MỚI: PHƯƠNG ÁN 🔥
    const btnPlan = document.getElementById('btn-open-plan-modal');
    if (btnPlan) {
      btnPlan.style.display = 'inline-block';
      btnPlan.onclick = function () {
        // Đóng Modal Dossier hiện tại (nếu muốn mở Modal mới đè lên)
        // Hoặc giữ nguyên nếu muốn chồng Modal (Bootstrap hỗ trợ chồng Modal nhưng cần cẩn thận z-index)

        // Cách 1: Ẩn Modal Dossier đi rồi mở Modal Plan (Gọn gàng)
        /*
            const dossierModalEl = document.getElementById('tracking-view-dossier'); 
            // Lưu ý: tracking-view-dossier của bạn đang là 1 DIV giả lập Modal hay là Bootstrap Modal thật?
            // Dựa vào code trước thì nó là DIV class="app-view". 
            // Nên ta chỉ cần gọi hàm mở Modal mới đè lên là được.
            */

        // GỌI HÀM MỞ MODAL BẠN VỪA VIẾT
        if (typeof window.openIAPModal === 'function') {
          window.openIAPModal(inc.id, inc.event);
        } else {
          console.error('Chưa load được hàm openIAPModal');
        }
      };
    }
    // 3. NÚT TÌM PXN — mở Dispatch Modal với tọa độ sự cố
    const btnFindLab = document.getElementById('btn-find-lab');
    if (btnFindLab) {
      btnFindLab.onclick = function () {
        // Kiểm tra sự cố đã có tọa độ chưa
        if (inc.latitude == null || inc.longitude == null) {
          if (typeof showToast === 'function')
            showToast(
              'Sự cố này chưa có tọa độ (latitude/longitude) để tìm Phòng Xét nghiệm.',
              'warning'
            );
          return;
        }
        if (typeof window.openDispatchModal === 'function') {
          window.openDispatchModal({
            incidentId: inc.id,
            incidentName: inc.event_name || inc.event || 'Sự cố',
            lat: inc.latitude,
            lng: inc.longitude,
          });
        } else {
          console.error(
            'Chưa load được hàm openDispatchModal (kiểm tra đã nhúng lab-dispatch-modal.js chưa)'
          );
        }
      };
    }
    if (typeof window.bindTeamStatsButton === 'function') {
      window.bindTeamStatsButton(inc);
    }
    // 3. Nút AAR (Màu xanh)
    const btnAar = document.getElementById('btn-open-aar-modal');
    if (btnAar) {
      btnAar.style.display = isAdmin ? 'inline-block' : 'none';

      if (isClosed) {
        btnAar.innerHTML = "<i class='bx bx-check-double'></i> Xem kết quả AAR";
        btnAar.onclick = function () {
          if (typeof openAarModal === 'function') openAarModal(inc, true);
        };
      } else {
        btnAar.innerHTML = "<i class='bx bx-notepad'></i> Đánh giá (AAR)";
        btnAar.onclick = function () {
          if (typeof openAarModal === 'function') openAarModal(inc, false);
        };
      }
    }

    // 4. Nút Điều phối (Chỉ Admin)
    const rotationControls = document.getElementById('admin-rotation-controls');
    if (rotationControls) {
      rotationControls.style.display = isAdmin && !isClosed ? 'flex' : 'none';
    }

    // --- ĐIỀN DANH SÁCH NHÂN SỰ ---
    if (typeof updateDossierMemberList === 'function') {
      updateDossierMemberList(inc);
    } else {
      // Fallback logic cũ
      const memberListEl = document.getElementById('dossier-member-list');
      if (memberListEl) {
        memberListEl.innerHTML = '';
        const confirmedStr = (inc.members || '').toLowerCase();
        const splitEmailsFallback = (s) =>
          (s || '')
            .split(';')
            .map((e) => e.trim())
            .filter(Boolean);
        // Gộp cả nhân sự thay thế (không nằm trong initial_selected_members)
        const seenFallback = new Set();
        const invitedEmails = [];
        [
          ...splitEmailsFallback(inc.initial_selected_members),
          ...splitEmailsFallback(inc.members),
          ...splitEmailsFallback(inc.declined_members),
        ].forEach((email) => {
          const key = email.toLowerCase();
          if (!seenFallback.has(key)) {
            seenFallback.add(key);
            invitedEmails.push(email);
          }
        });

        invitedEmails.forEach((email) => {
          const displayName = getName(email);
          let isConfirmed = false;
          if (confirmedStr.includes(email.toLowerCase())) isConfirmed = true;
          else if (confirmedStr.includes(String(displayName).toLowerCase()))
            isConfirmed = true;

          if (window.appState && Array.isArray(window.appState.teamData)) {
            const mInfo = window.appState.teamData.find(
              (m) => m.email && m.email.toLowerCase() === email.toLowerCase()
            );
            if (
              mInfo &&
              mInfo.username &&
              confirmedStr.includes(mInfo.username.toLowerCase())
            )
              isConfirmed = true;
          }

          const icon = isConfirmed
            ? '<span class="badge bg-success">✔ Đã xác nhận</span>'
            : '<span class="badge bg-secondary">⏳ Chờ</span>';

          memberListEl.insertAdjacentHTML(
            'beforeend',
            `
                    <div class="member-row">
                        <div>
                            <div style="font-weight:bold; color:#333;">${window.escapeHtml(
                              displayName
                            )}</div>
                            <div style="font-size:11px; color:#999;">${window.escapeHtml(
                              email
                            )}</div>
                        </div>
                        ${icon}
                    </div>
                `
          );
        });
        if (document.getElementById('dossier-stat-confirmed'))
          document.getElementById('dossier-stat-confirmed').textContent =
            inc.confirmations || 0;
        if (document.getElementById('dossier-stat-declined'))
          document.getElementById('dossier-stat-declined').textContent =
            invitedEmails.length - (inc.confirmations || 0);
      }
    }

    // --- ĐIỀN CHAT LOG ---
    const adminName = getName(inc.admin);
    const chatBox = document.getElementById('dossier-chat-box');
    if (chatBox) {
      chatBox.innerHTML = `
            <div class="msg system">
                <div class="msg-bubble">
                <strong>KÍCH HOẠT SỰ KIỆN: ${window.escapeHtml(
                  inc.id
                )}</strong><br>
                Thời gian: ${inc.timestamp}<br>
                Người kích hoạt: ${window.escapeHtml(adminName)}
                </div>
            </div>
        `;
      if (typeof window.loadEventLogs === 'function') {
        window.loadEventLogs(inc.id);
      }
    }

    // ============================================================================
    // (B) SỬA HIỂN THỊ AAR trong openDossierView — đọc từ inc.aar_data (jsonb)
    // ----------------------------------------------------------------------------
    // THAY cả khối "--- TAB PREVIEW AAR ---" trong openDossierView bằng đoạn này.
    // Lý do: AAR lưu vào cột aar_data (JSON) với key aar_summary/aar_issues/
    //        aar_lessons_learned — KHÔNG phải cột riêng inc.aar_summary...
    // ============================================================================

    // --- TAB PREVIEW AAR ---
    {
      const aar = inc.aar_data || {}; // ← nguồn đúng: cột jsonb
      const aarSummary = aar.aar_summary || '';
      const aarIssues = aar.aar_issues || '';
      const aarLessons = aar.aar_lessons_learned || '';
      const aarAdmin = aar.submitted_by || inc.aar_admin || 'admin';

      const hasAAR = !!(aarSummary || aarIssues || aarLessons);

      if (hasAAR || isClosed) {
        if (document.getElementById('aar-content-placeholder'))
          document.getElementById('aar-content-placeholder').style.display =
            'none';
        if (document.getElementById('aar-content-real'))
          document.getElementById('aar-content-real').style.display = 'block';

        // Tóm tắt — dùng hàm format nếu có
        if (document.getElementById('view-aar-summary')) {
          document.getElementById('view-aar-summary').innerHTML =
            typeof formatAarDisplay === 'function'
              ? formatAarDisplay(aarSummary)
              : aarSummary
              ? window.escapeHtml(aarSummary).replace(/\n/g, '<br>')
              : '<span class="text-muted fst-italic">(Chưa cập nhật)</span>';
        }

        // Vấn đề
        if (document.getElementById('view-aar-issues')) {
          document.getElementById('view-aar-issues').innerHTML = aarIssues
            ? window.escapeHtml(aarIssues).replace(/\n/g, '<br>')
            : '<span class="text-muted fst-italic">(Chưa cập nhật)</span>';
        }

        // Bài học
        if (document.getElementById('view-aar-lessons')) {
          document.getElementById('view-aar-lessons').innerHTML = aarLessons
            ? window.escapeHtml(aarLessons).replace(/\n/g, '<br>')
            : '<span class="text-muted fst-italic">(Chưa cập nhật)</span>';
        }

        // Người đánh giá
        if (document.getElementById('view-aar-admin')) {
          const getNameLocal =
            typeof getName === 'function' ? getName : (x) => x || 'admin';
          document.getElementById('view-aar-admin').textContent =
            getNameLocal(aarAdmin) || 'admin';
        }

        // Badge trạng thái
        if (isClosed) {
          if ($('#aar-badge-closed').length) $('#aar-badge-closed').show();
          if ($('#aar-badge-active').length) $('#aar-badge-active').hide();
        } else {
          if ($('#aar-badge-closed').length) $('#aar-badge-closed').hide();
          if ($('#aar-badge-active').length) $('#aar-badge-active').show();
        }
      } else {
        if (document.getElementById('aar-content-placeholder'))
          document.getElementById('aar-content-placeholder').style.display =
            'block';
        if (document.getElementById('aar-content-real'))
          document.getElementById('aar-content-real').style.display = 'none';
      }
    }

    // --- ACTION BAR (XỬ LÝ 3 TRẠNG THÁI) ---
    const actionBar = document.getElementById('dossier-action-bar');
    if (actionBar) {
      const invitedStr = (inc.initial_selected_members || '').toLowerCase();
      const confirmedStr = (inc.members || '').toLowerCase();
      const declinedStr = (inc.declined_members || '').toLowerCase();
      const isActive = inc.status !== 'closed';

      // 1. LOGIC KÍCH HOẠT (CHỈ DÀNH CHO ADMIN)
      if (isAdmin && isActive && !isActivated) {
        actionBar.style.display = 'flex';
        actionBar.className = 'alert alert-danger shadow-sm mb-3';
        actionBar.innerHTML = `
                <div class="d-flex justify-content-between align-items-center w-100">
                    <div>
                        <h5 style="margin:0; color:#721c24;">
                            <i class='bx bxs-bolt-circle'></i> CHƯA KÍCH HOẠT
                        </h5>
                        <small>Sự kiện này đang chờ Admin kích hoạt khẩn cấp.</small>
                    </div>
                    <button class="btn btn-danger fw-bold" onclick="activateIncident('${jsAttr(inc.id)}')">
                        <i class='bx bxs-bolt-circle'></i> KÍCH HOẠT KHẨN CẤP
                    </button>
                </div>
            `;
      }
      // ============================================================
      // 2. LOGIC PHẢN HỒI (DÀNH CHO NGƯỜI DÙNG)
      // ============================================================
      else if (isActive && isActivated) {
        // Lấy thông tin user hiện tại (đảm bảo không bị lỗi null/undefined)
        const myEmail = String(window.userSession?.email || '')
          .toLowerCase()
          .trim();
        const myUser = String(window.userSession?.username || '')
          .toLowerCase()
          .trim();
        const myFullName = String(window.userSession?.full_name || '')
          .toLowerCase()
          .trim();

        // 🛡️ HÀM BẢO VỆ: Tuyệt đối không so sánh nếu từ khóa bị rỗng
        const checkIncludes = (listStr, keyword) => {
          if (!keyword) return false;
          return listStr.includes(keyword);
        };

        // Kiểm tra 3 danh sách (Sử dụng hàm bảo vệ)
        const isInvited =
          checkIncludes(invitedStr, myEmail) ||
          checkIncludes(invitedStr, myUser) ||
          checkIncludes(invitedStr, myFullName);

        const isConfirmed =
          checkIncludes(confirmedStr, myEmail) ||
          checkIncludes(confirmedStr, myUser) ||
          checkIncludes(confirmedStr, myFullName);

        const isDeclined =
          checkIncludes(declinedStr, myEmail) ||
          checkIncludes(declinedStr, myUser) ||
          checkIncludes(declinedStr, myFullName);

        // 🔥 THỨ TỰ ƯU TIÊN HIỂN THỊ GIAO DIỆN 🔥
        if (isConfirmed) {
          // Ưu tiên 1: Đã xác nhận -> Tắt thông báo
          actionBar.style.display = 'none';
        } else if (isDeclined) {
          // Ưu tiên 2: Đã từ chối -> Hiện bảng xám
          actionBar.style.display = 'flex';
          actionBar.className =
            'alert alert-secondary shadow-sm mb-3 justify-content-between align-items-center';
          actionBar.innerHTML = `
          <div>
            <h5 style="margin:0; color:#666; font-size:16px;">
              <i class='bx bx-x-circle'></i> BẠN KHÔNG THỂ THAM GIA
            </h5>
            <p style="margin:0; font-size:13px; color:#666;">
              Hệ thống đã ghi nhận phản hồi của bạn.
            </p>
          </div>
          <div>
             <button class="btn btn-outline-primary btn-sm" onclick="submitIncidentResponse('confirm')">Tham gia lại</button>
          </div>
          `;
        } else if (isInvited) {
          // Ưu tiên 3: Được mời nhưng chưa phản hồi gì -> Hiện bảng vàng
          actionBar.style.display = 'flex';
          actionBar.className =
            'alert alert-warning shadow-sm mb-3 justify-content-between align-items-center';
          actionBar.innerHTML = `
          <div>
            <h5 style="margin:0; color:#856404; font-size:16px;">
              <i class='bx bxs-megaphone'></i> YÊU CẦU TỪ HỆ THỐNG
            </h5>
            <p style="margin:0; font-size:13px; color:#856404;">
              Bạn được điều động tham gia sự kiện này. Vui lòng phản hồi ngay!
            </p>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-success btn-sm fw-bold" onclick="submitIncidentResponse('confirm')">
              <i class='bx bx-check'></i> XÁC NHẬN
            </button>
            <button class="btn btn-danger btn-sm fw-bold" onclick="submitIncidentResponse('decline')">
              <i class='bx bx-x'></i> KHÔNG THỂ THAM GIA
            </button>
          </div>
          `;
        } else {
          // Không thuộc đối tượng nào -> Ẩn
          actionBar.style.display = 'none';
        }
      } else {
        // Sự kiện đã kết thúc hoặc chưa kích hoạt -> Ẩn
        actionBar.style.display = 'none';
      }
    }
    // Quét và mở khóa lại các nút chức năng sau khi HTML vừa được vẽ xong
    if (typeof window.applyRolePermissions === 'function') {
      window.applyRolePermissions();
    }
  };

  /**
   * ============================================================
   * HÀM FORMAT HIỂN THỊ AAR (Dùng cho Dossier View)
   * ============================================================
   */
  function formatAarDisplay(data) {
    // Kiểm tra dữ liệu đầu vào
    if (!data) return '';

    // Kiểm tra xem có nội dung AAR nào không
    const hasSummary = data.aar_summary && data.aar_summary.trim() !== '';
    const hasIssues = data.aar_issues && data.aar_issues.trim() !== '';
    const hasLessons =
      data.aar_lessons_learned && data.aar_lessons_learned.trim() !== '';

    if (!hasSummary && !hasIssues && !hasLessons) {
      return `<div class="text-muted text-center py-4" style="background: #f8f9fa; border-radius: 8px; border: 1px dashed #dee2e6;">
                    <i class='bx bx-history fs-3 mb-2 text-secondary'></i><br>
                    <em>Chưa có Báo cáo sau hành động (AAR).</em>
                </div>`;
    }

    let html = `<div class="d-flex flex-column gap-3">`;

    // 1. Tóm tắt kết quả (Màu xanh lá)
    if (hasSummary) {
      html += `
            <div class="card border-success border-opacity-25 shadow-sm">
                <div class="card-header bg-success bg-opacity-10 text-success fw-bold py-2">
                    <i class='bx bx-check-circle me-1'></i> Tóm tắt kết quả
                </div>
                <div class="card-body py-2 small text-dark">
                    ${data.aar_summary.replace(/\n/g, '<br>')}
                </div>
            </div>`;
    }

    // 2. Vấn đề / Khó khăn (Màu đỏ)
    if (hasIssues) {
      html += `
            <div class="card border-danger border-opacity-25 shadow-sm">
                <div class="card-header bg-danger bg-opacity-10 text-danger fw-bold py-2">
                    <i class='bx bx-error me-1'></i> Vấn đề / Khó khăn
                </div>
                <div class="card-body py-2 small text-dark">
                    ${data.aar_issues.replace(/\n/g, '<br>')}
                </div>
            </div>`;
    }

    // 3. Bài học kinh nghiệm (Màu xanh dương/Vàng)
    if (hasLessons) {
      html += `
            <div class="card border-primary border-opacity-25 shadow-sm">
                <div class="card-header bg-primary bg-opacity-10 text-primary fw-bold py-2">
                    <i class='bx bx-bulb me-1'></i> Bài học kinh nghiệm
                </div>
                <div class="card-body py-2 small text-dark">
                    ${data.aar_lessons_learned.replace(/\n/g, '<br>')}
                </div>
            </div>`;
    }

    html += `</div>`;
    return html;
  }
  // 4. Gắn sự kiện tìm kiếm (Live Search)
  document
    .getElementById('tracking-search-input')
    .addEventListener('keyup', function () {
      renderTrackingPage(); // Vẽ lại lưới khi gõ phím
    });

  // Event listener cho nút Filter
  $('#btn-filter-tracking')
    .off('click')
    .on('click', function () {
      const start = $('#filter-date-start-tracking').val();
      const end = $('#filter-date-end-tracking').val();
      if (start && end) {
        window.renderTrackingPage();
      } else {
        showToast('Vui lòng chọn cả ngày bắt đầu và ngày kết thúc.', 'warning');
      }
    });

  $('#btn-clear-filter-tracking')
    .off('click')
    .on('click', function () {
      $('#filter-date-start-tracking').val('');
      $('#filter-date-end-tracking').val('');
      $('#tracking-search-input').val('');
      window.renderTrackingPage();
    });
  // ============================================================
  // CÁC HÀM HỖ TRỢ GIAO DIỆN (MODAL & TABS) CHO TRANG TRACKING
  // (Dán vào cuối file script-js-RRT.txt)
  // ============================================================

  // 1. Mở Modal bất kỳ theo ID
  window.openModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex'; // Dùng flex để căn giữa
    } else {
      console.warn('Không tìm thấy modal có ID: ' + modalId);
    }
  };

  // ==========================================
  // CHUYỂN TAB TRONG DOSSIER (Nhật ký / AAR)
  // ==========================================
  window.switchDossierTab = function (tabId, btnElement) {
    const dossierView = document.getElementById('tracking-view-dossier');
    if (!dossierView) return;

    // Ẩn tất cả các tab-pane
    const panes = dossierView.querySelectorAll('.tab-pane');
    panes.forEach((el) => el.classList.remove('active'));

    // Bỏ active các nút tab
    const btns = dossierView.querySelectorAll('.tab-btn');
    btns.forEach((el) => el.classList.remove('active'));

    // Hiện tab được chọn
    const targetPane = document.getElementById(tabId);
    if (targetPane) targetPane.classList.add('active');

    // Active nút được nhấn
    if (btnElement) btnElement.classList.add('active');

    // GỌI HÀM TẢI DỮ LIỆU KHI CHUYỂN SANG TAB AAR
    if (tabId === 'tab-aar-preview') {
      const incidentId = window.currentDossierId || window.selectedIncidentId;
      if (incidentId && typeof window.loadAARPreview === 'function') {
        window.loadAARPreview(incidentId);
      }
    }
  };
  // 2. HÀM ĐÓNG DOSSIER VIEW (Giữ nguyên bản chuẩn của bạn)
  window.closeDossierView = function () {
    const listView = document.getElementById('tracking-view-list');
    const dossierView = document.getElementById('tracking-view-dossier');

    try {
      if (dossierView) {
        dossierView.style.display = 'none';
        dossierView.classList.remove('active');
      }
    } catch (e) {
      console.warn('Lỗi khi ẩn Dossier:', e);
    }

    try {
      if (listView) {
        listView.style.display = 'block';
      }
    } catch (e) {
      console.warn('Lỗi khi hiện List:', e);
    }

    // Reset biến trạng thái
    window.currentDossierId = null;
    window.selectedIncidentId = null;
  };

  // 6. Đóng modal khi click ra ngoài (Optional)
  window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
      event.target.style.display = 'none';
    }
  };

  //NOTIFICATION function getNotificationsForMess
  window.renderMessageTable = async function () {
    const tbody = document.getElementById('message-table-body');
    if (!tbody) return;

    // 1. SỬA LỖI: Kiểm tra session linh hoạt (Chấp nhận cả Email HOẶC Username)
    const session = window.userSession;
    if (!session || (!session.email && !session.username && !session.id)) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Lỗi: Không tìm thấy thông tin định danh của phiên đăng nhập.</td></tr>`;
      return;
    }

    // 2. Fetch dữ liệu trực tiếp từ Supabase
    try {
      // SỬA LỖI: Gom tất cả định danh có thể có của người dùng vào 1 mảng (lọc bỏ các giá trị rỗng)
      const identifiers = [session.email, session.username, session.id].filter(
        Boolean
      );

      const { data: notifications, error } = await window.supabaseClient
        .from('notifications')
        .select('*')
        // Dùng .in() để đối chiếu mảng. Cột 'user_email' trong DB giờ sẽ khớp nếu chứa email HOẶC username
        .in('user_email', identifiers)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Xóa nội dung cũ
      tbody.innerHTML = '';

      if (!notifications || notifications.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Không có thông báo nào.</td></tr>`;
        return;
      }

      // 3. Render danh sách
      notifications.forEach((item) => {
        const isRead = item.is_read === true;
        const row = document.createElement('tr');
        if (!isRead) row.classList.add('table-warning');

        // Format thời gian
        const displayTime = new Date(item.created_at).toLocaleString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });

        row.innerHTML = `
                <td style="white-space: nowrap;">${displayTime}</td>
                <td>${item.message}</td>
                
                <td class="text-center">
                    ${
                      isRead
                        ? `<span class="badge bg-success"><i class='bx bxs-check-circle'></i> Đã đọc</span>`
                        : `<button class="btn btn-sm btn-outline-primary" onclick="markAsRead('${jsAttr(item.id)}', this)">
                             <i class='bx bxs-envelope'></i> Đánh dấu đã đọc
                           </button>`
                    }
                </td>
            `;
        tbody.appendChild(row);
      });
    } catch (err) {
      console.error('Lỗi khi tải thông báo:', err);
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Lỗi tải dữ liệu: ${err.message}</td></tr>`;
    }
  };

  // Hàm xử lý "Đánh dấu đã đọc" đi kèm
  window.markAsRead = async function (notificationId, btnElement) {
    showLoadingSpinner(true);
    const { error } = await window.supabaseClient
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    hideLoadingSpinner();

    if (error) {
      showToast('Lỗi cập nhật: ' + error.message, 'error');
    } else {
      showToast('Đã đánh dấu là đã đọc', 'success');
      // Reload lại bảng sau khi update
      window.renderMessageTable();
    }
  };

  // ============================================================
  // PATCH 3: markNotificationAsRead – xóa item khỏi list mượt mà
  // ============================================================

  window.markNotificationAsRead = async function (notifId, btn) {
    if (!notifId) return;
    const li = btn?.closest('li');
    if (btn) btn.disabled = true;
    if (li) li.style.opacity = '0.5';

    try {
      const { error } = await window.supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notifId);

      if (error) throw error;

      // Animation xóa khỏi list
      if (li) {
        li.style.transition = 'max-height .3s, opacity .3s';
        li.style.maxHeight = li.offsetHeight + 'px';
        li.style.overflow = 'hidden';
        requestAnimationFrame(() => {
          li.style.maxHeight = '0';
          li.style.opacity = '0';
          setTimeout(() => {
            li.remove();
            const container = document.getElementById('user-dash-alerts');
            if (container && container.children.length === 0) {
              container.innerHTML =
                '<li class="list-group-item text-muted text-center py-3">' +
                'Không có thông báo mới.</li>';
            }
          }, 310);
        });
      }

      // Cập nhật số chuông
      if (typeof window.loadUserNotifications === 'function') {
        window.loadUserNotifications();
      }
    } catch (err) {
      console.error('[markNotificationAsRead] Lỗi:', err);
      if (btn) btn.disabled = false;
      if (li) li.style.opacity = '1';
      if (typeof showToast === 'function')
        showToast('Lỗi: ' + err.message, 'error');
    }
  };
  // ==========================================
  // HÀM TẢI THÔNG BÁO (SUPABASE VERSION)
  // ==========================================
  // PATCH 13: loadUserNotifications – chỉ hiện thông báo CHƯA đọc
  window.loadUserNotifications = async function () {
    // 1. SỬA LỖI: Kiểm tra session linh hoạt (Chấp nhận cả Email, Username, ID)
    const session = window.userSession;
    if (!session || (!session.email && !session.username && !session.id))
      return;

    const list = document.getElementById('notification-list');
    const numEl = document.querySelector('.notification .num');

    try {
      // 2. SỬA LỖI: Tạo mảng định danh để vét cạn thông báo
      const identifiers = [session.email, session.username, session.id].filter(
        Boolean
      );

      const { data: notifications, error } = await window.supabaseClient
        .from('notifications')
        .select('*')
        .in('user_email', identifiers) // <-- Dùng .in() thay vì .eq()
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (numEl) numEl.textContent = notifications?.length || 0;
      if (!list) return;
      list.innerHTML = '';

      if (!notifications || notifications.length === 0) {
        list.innerHTML =
          '<li class="p-3 text-muted text-center">Không có thông báo mới.</li>';
        return;
      }

      notifications.forEach((n) => {
        const dateStr = n.created_at
          ? new Date(n.created_at).toLocaleString('vi-VN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';

        const li = document.createElement('li');
        li.innerHTML = `
        <div class="p-2 border-bottom">
          <div style="font-size:.9em;font-weight:bold;">
            ${window.escapeHtml?.(n.message) || n.message}
          </div>
          <div style="font-size:.7em;color:gray;" class="mb-1">${dateStr}</div>
          <button class="btn btn-sm btn-outline-danger"
                  onclick="window.markNotificationAsRead('${jsAttr(n.id)}',this)">
            <i class='bx bxs-envelope'></i> Đánh dấu đã đọc
          </button>
        </div>`;
        list.appendChild(li);
      });

      // Hiện dropdown
      const menu = document.getElementById('notificationMenu');
      if (menu) menu.style.display = 'block';
    } catch (err) {
      console.error('[loadUserNotifications] Lỗi:', err);
    }
  };

  // ========================================================================
  // XỬ LÝ SỰ KIỆN KHI ĐỔI TRẠNG THÁI TRÊN BẢNG DATA (APPROVAL STATUS)
  // ========================================================================
  $(document).on('change', '.update-status', async function () {
    const rrtRecordId = $(this).data('report-id');
    const newStatus = $(this).val();

    // 1. NẾU CHỌN "YÊU CẦU SỬA" -> BẬT MODAL NHẬP LÝ DO
    if (newStatus === 'edit') {
      // Lưu lại ID hồ sơ để dùng khi submit
      window.tempEditProfileId = rrtRecordId;

      // Xóa trắng ô nhập liệu cũ và bật Modal lên
      $('#edit-requirements-text').val('');
      const editModal = new bootstrap.Modal(
        document.getElementById('modal-edit-requirements')
      );
      editModal.show();
      return; // Dừng lại ở đây, chờ Admin nhập xong rồi tính tiếp
    }

    // 2. NẾU CHỌN TRẠNG THÁI KHÁC (Chờ duyệt / Đã duyệt) -> CẬP NHẬT TRỰC TIẾP
    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {
      // Gọi Supabase để cập nhật trạng thái
      const { error } = await supabaseClient
        .from('profiles')
        .update({ approval_status: newStatus })
        .eq('id', rrtRecordId);

      if (error) throw error;

      showToast('Cập nhật trạng thái thành công!', 'success');

      // LÀM MỚI UI

      if (typeof window.renderRRTTable === 'function') {
        window.renderRRTTable();
      }
      // Vẽ lại giao diện
      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
      }
    } catch (err) {
      console.error('Lỗi cập nhật trạng thái:', err);
      showToast('Lỗi cập nhật: ' + err.message, 'error');

      // Trả lại trạng thái cũ trên giao diện nếu lỗi
      if (typeof window.renderRRTTable === 'function') {
        window.renderRRTTable();
      }
      // Vẽ lại giao diện
      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
      }
    } finally {
      if (typeof showLoadingSpinner === 'function') showLoadingSpinner(false);
    }
  });

  // Hủy hành động (Khi Admin tắt Modal mà không nhập)
  // Tính năng này tự động trả dropdown về trạng thái trước đó
  document
    .getElementById('modal-edit-requirements')
    ?.addEventListener('hidden.bs.modal', function () {
      // Nếu Admin bấm Hủy, làm tươi lại bảng để select box tự nhảy về giá trị đúng trong CSDL
      if (typeof window.renderRRTTable === 'function') {
        window.renderRRTTable();
      }
    });
  $(document).on('click', '.delete-report', function () {
    const rrtRecordId = $(this).data('report-id');

    // Hộp thoại xác nhận
    showToastConfirm(
      `Bạn có chắc chắn muốn xóa Biểu mẫu RRT <strong>${rrtRecordId}</strong>?`,
      async function () {
        // 1. Hiệu ứng loading
        if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

        try {
          // 2. Gọi Supabase để xóa
          // Lưu ý: Thay 'reports' bằng tên bảng chính xác của bạn trong Supabase
          // Thay 'id' bằng cột khóa chính bạn đang dùng (nếu nó là 'rrt_id' chẳng hạn)
          const { error } = await supabaseClient
            .from('profiles')
            .delete()
            .eq('id', rrtRecordId);

          if (error) throw error;

          // 3. THÀNH CÔNG: Hiển thị toast
          showToast('Đã xóa báo cáo thành công!', 'success');

          // 4. LÀM MỚI UI
          // Không cần gọi lại getInitialData phức tạp.
          // Chỉ cần vẽ lại bảng là xong, dữ liệu sẽ tự cập nhật từ Supabase
          if (typeof window.renderRRTTable === 'function') {
            window.renderRRTTable();
          }

          // (Tùy chọn) Nếu bạn muốn chắc chắn toàn bộ Dashboard được sync:
          // if (typeof window.enterDashboard === 'function') await window.enterDashboard();
        } catch (err) {
          console.error('Lỗi xóa báo cáo:', err);
          showToast('Lỗi xóa báo cáo: ' + err.message, 'error');
        } finally {
          // 5. Tắt loading
          if (typeof showLoadingSpinner === 'function')
            showLoadingSpinner(false);
        }
      }
    );
  });
  // ========================================================================
  // SUBMIT YÊU CẦU CHỈNH SỬA (Admin nhập lý do rồi gửi)
  // ========================================================================
  window.submitEditRequirements = async function () {
    const requirements = $('#edit-requirements-text').val();
    const profileId = window.tempEditProfileId;

    // Validate
    if (!profileId) {
      showToast('Lỗi: Không tìm thấy ID hồ sơ!', 'error');
      return;
    }

    if (!requirements || requirements.trim() === '') {
      showToast('Vui lòng nhập yêu cầu chỉnh sửa!', 'warning');
      return;
    }

    if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

    try {

      // ✅ Update profile với approval_status = 'edit' + lưu yêu cầu chỉnh sửa
      const { error } = await supabaseClient
        .from('profiles')
        .update({
          approval_status: 'edit',
          edit_comment: requirements.trim(), // Lưu ghi chú
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileId);

      if (error) throw error;

      // Đóng modal
      $('#modal-edit-requirements').modal('hide');

      // Reset biến tạm
      window.tempEditProfileId = null;

      // Refresh UI (Cập nhật lại bảng để thấy chữ "Yêu cầu sửa" đỏ chót)
      if (typeof window.renderRRTTable === 'function') {
        window.renderRRTTable();
      }
      // Vẽ lại giao diện
      if (typeof renderDashboard === 'function') {
        renderDashboard();
      }
      if (typeof rrtShared.updateRecentReportsTable === 'function') {
        rrtShared.updateRecentReportsTable();
      }
    } catch (err) {
      console.error('❌ Lỗi submitEditRequirements:', err);
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };
  // --- Status Helper Functions (Client-side) ---
  function getStatusTextClient(status) {
    if (status == 'approved') return 'approved';
    if (status == 'pending') return 'pending';
    if (status == 'edit') return 'edit';
    return status || '';
  }

  function getStatusClassClient(status) {
    if (status == 'approved') return 'status-approved';
    if (status == 'pending') return 'status-pending';
    if (status == 'edit') return 'status-edit';
    return 'status-pending';
  }
  // --- Filtering Logic (Keep existing) ---
  // Lưu function filter vào biến để dễ remove
  let dateFilterFn = null;

  function applyDateFilter(startDate, endDate) {
    console.log('=== FILTER INPUT ===', startDate, endDate);

    // Lấy dataTable instance an toàn
    const table = $('#report-table').DataTable();
    if (!table) {
      console.warn('DataTable not initialized');
      return;
    }

    // Xóa filter cũ
    if (dateFilterFn) {
      const idx = $.fn.dataTable.ext.search.indexOf(dateFilterFn);
      if (idx > -1) $.fn.dataTable.ext.search.splice(idx, 1);
    }

    // Nếu không có filter, vẽ lại table
    if (!startDate && !endDate) {
      table.draw();
      return;
    }

    // === PARSE NGÀY LỌC ===
    const parseFilterDate = (str) => {
      if (!str) return null;
      const parts = str.split(/[/-]/);
      if (parts.length !== 3) return null;

      let [d, m, y] = parts.map(Number);
      if (y < 100) y += 2000; // dd/mm/yy → yyyy

      if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
      return new Date(y, m - 1, d);
    };

    const fromDate = startDate ? parseFilterDate(startDate) : null;
    const toDate = endDate ? parseFilterDate(endDate) : null;

    const fromTime = fromDate
      ? new Date(
          fromDate.getFullYear(),
          fromDate.getMonth(),
          fromDate.getDate(),
          0,
          0,
          0
        ).getTime()
      : 0;
    const toTime = toDate
      ? new Date(
          toDate.getFullYear(),
          toDate.getMonth(),
          toDate.getDate(),
          23,
          59,
          59
        ).getTime()
      : Infinity;

    console.log('Filter range:', new Date(fromTime), '→', new Date(toTime));

    // === FILTER FUNCTION ===
    dateFilterFn = function (settings, data, dataIndex) {
      // ✅ FIX 1: Dùng column index ĐÚNG (cột 2 = Ngày cập nhật)
      const dateCell = data[2];

      // ✅ FIX 2: Parse ngày từ định dạng toLocaleDateString('vi-VN')
      // Format: "27/5/2026" hoặc "27/05/2026" (KHÔNG có giờ)
      const dateMatch = dateCell?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!dateMatch) return true; // Nếu không parse được, giữ lại hàng

      const [, day, month, year] = dateMatch.map(Number);
      const rowDate = new Date(year, month - 1, day);
      const rowTime = rowDate.getTime();

      // So sánh
      const pass = rowTime >= fromTime && rowTime <= toTime;
      return pass;
    };

    $.fn.dataTable.ext.search.push(dateFilterFn);
    table.draw();
    console.log('✅ Filter applied!');
  }

  // Events
  $('#btn-filter').on('click', function () {
    console.log('=== BUTTON CLICKED ===');
    applyDateFilter($('#filter-date-start').val(), $('#filter-date-end').val());
  });

  $('#btn-clear-filter').on('click', function () {
    console.log('=== CLEAR BUTTON ===');
    $('#filter-date-start, #filter-date-end').val('');
    applyDateFilter(null, null);
  });
});
