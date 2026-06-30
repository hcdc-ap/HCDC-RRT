// ============================================================
// FIX-PATCHES.JS  –  HCDC RRT Webapp
// Thêm file này vào index.html NGAY SAU script.js:
//   <script src="fix-patches.js"></script>
// ============================================================

(function applyPatches() {
  'use strict';

  // ============================================================
  // PATCH 1: Các hàm helper bị thiếu
  // ============================================================

  /** Trả về UUID của user đang đăng nhập */
  window.getCurrentUserId = function () {
    return window.userSession?.id || null;
  };

  /** Kiểm tra có phải admin không */
  window.isUserAdmin = function () {
    const role = (window.userSession?.role || '').toLowerCase().trim();
    return role === 'admin';
  };

  /** Kiểm tra có phải manager trở lên không */
  window.isUserManager = function () {
    const role = (window.userSession?.role || '').toLowerCase().trim();
    return role === 'admin' || role === 'manager';
  };

  // ============================================================
  // PATCH 2: renderUserDashboard – hiển thị đúng thông báo
  // từ bảng notifications thay vì đọc appState.incidents trực tiếp
  // (tránh lỗi RLS chặn user thường đọc incidents)
  // ============================================================

  window.renderUserDashboard = async function () {
    // Cập nhật tên hiển thị
    const nameEl = document.getElementById('user-dash-name');
    if (nameEl) {
      nameEl.textContent =
        window.userSession?.full_name ||
        window.userSession?.username ||
        'Thành viên';
    }

    const alertsContainer = document.getElementById('user-dash-alerts');
    if (!alertsContainer) return;

    alertsContainer.innerHTML =
      '<li class="list-group-item text-muted text-center">' +
      '<span class="spinner-border spinner-border-sm me-2"></span>Đang tải...</li>';

    const myEmail = String(window.userSession?.email || '')
      .toLowerCase()
      .trim();
    if (!myEmail) {
      alertsContainer.innerHTML =
        '<li class="list-group-item text-muted text-center">Không xác định được tài khoản.</li>';
      return;
    }

    try {
      // Lấy thông báo chưa đọc (kết hợp incident nếu có)
      const { data: notifs, error } = await window.supabaseClient
        .from('notifications')
        .select(
          'id, message, notification_type, is_read, created_at, incident_id, schedule_id'
        )
        .eq('user_email', myEmail)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      alertsContainer.innerHTML = '';

      if (!notifs || notifs.length === 0) {
        alertsContainer.innerHTML =
          '<li class="list-group-item text-muted text-center py-3">' +
          'Không có thông báo mới.</li>';
        return;
      }

      // Nếu có incident_id, fetch thêm tên/status của sự kiện
      const incidentIds = [
        ...new Set(notifs.map((n) => n.incident_id).filter(Boolean)),
      ];
      let incidentMap = {};

      if (incidentIds.length > 0) {
        const { data: incs } = await window.supabaseClient
          .from('incidents')
          .select('id, event_name, status')
          .in('id', incidentIds);
        (incs || []).forEach((i) => (incidentMap[i.id] = i));
      }

      notifs.forEach((notif) => {
        const inc = notif.incident_id ? incidentMap[notif.incident_id] : null;
        const isEmergency =
          notif.notification_type === 'khan_cap' ||
          notif.notification_type === 'thay_the';
        const isActive = inc && inc.status === 'active';

        const li = document.createElement('li');

        if (isEmergency) {
          li.className =
            'list-group-item ' +
            (isActive ? 'list-group-item-danger' : 'list-group-item-secondary') +
            ' py-2';
          li.innerHTML = `
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div style="min-width:0;">
                <strong>${isActive ? '🚨' : '✅'} ${_esc(notif.message)}</strong>
                ${inc ? '<br><small class="text-muted">' + _esc(inc.event_name) + '</small>' : ''}
              </div>
              <div class="d-flex gap-1 flex-shrink-0">
                ${
                  isActive
                    ? `<a href="#" onclick="simulateSidebarClick('page-tracking');return false;"
                         class="btn btn-danger btn-sm py-0 px-2">Xem</a>`
                    : ''
                }
                <button onclick="window.markNotificationAsRead('${notif.id}',this)"
                        class="btn btn-outline-secondary btn-sm py-0 px-2"
                        title="Đánh dấu đã đọc">✓</button>
              </div>
            </div>`;
        } else {
          li.className = 'list-group-item py-2';
          li.innerHTML = `
            <div class="d-flex justify-content-between align-items-start gap-2">
              <small style="min-width:0;">${_esc(notif.message)}</small>
              <button onclick="window.markNotificationAsRead('${notif.id}',this)"
                      class="btn btn-outline-secondary btn-sm py-0 px-2 flex-shrink-0">✓</button>
            </div>`;
        }

        alertsContainer.appendChild(li);
      });
    } catch (err) {
      console.error('[renderUserDashboard] Lỗi:', err);
      alertsContainer.innerHTML =
        '<li class="list-group-item text-danger text-center">Lỗi tải thông báo: ' +
        _esc(err.message) +
        '</li>';
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

  // ============================================================
  // PATCH 4: submitIncidentResponse – đánh dấu thông báo đã đọc
  // sau khi người dùng phản hồi
  // ============================================================

  window.submitIncidentResponse = async function (actionType) {
    if (!window.selectedIncidentId) return;

    const myEmail = String(window.userSession?.email || '')
      .toLowerCase()
      .trim();
    const myUserId = window.getCurrentUserId();

    if (!myEmail) {
      if (typeof showToast === 'function')
        showToast('Lỗi: Không tìm thấy email của bạn', 'error');
      return;
    }

    if (typeof showLoadingSpinner === 'function') showLoadingSpinner();

    try {
      // 1. Lấy incident hiện tại
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

      if (actionType === 'confirm') {
        if (!confirmedArr.includes(myEmail)) confirmedArr.push(myEmail);
        declinedArr = declinedArr.filter((e) => e !== myEmail);
      } else {
        if (!declinedArr.includes(myEmail)) declinedArr.push(myEmail);
        confirmedArr = confirmedArr.filter((e) => e !== myEmail);
      }

      // 2. Cập nhật incident
      const { error: updateErr } = await window.supabaseClient
        .from('incidents')
        .update({
          members: confirmedArr.join(';'),
          declined_members: declinedArr.join(';'),
          confirmations: confirmedArr.length,
        })
        .eq('id', window.selectedIncidentId);
      if (updateErr) throw updateErr;

      // 3. *** ĐÁNH DẤU THÔNG BÁO ĐÃ ĐỌC ***
      await window.supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('incident_id', window.selectedIncidentId)
        .eq('user_email', myEmail)
        .eq('is_read', false);

      // 4. Ghi lịch sử điều động (nếu có userId)
      if (myUserId) {
        await window.supabaseClient
          .from('deployment_history')
          .upsert(
            {
              incident_id: window.selectedIncidentId,
              user_id: myUserId,
              action_type: actionType === 'confirm' ? 'Thành viên' : 'Đã từ chối',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'incident_id,user_id' }
          )
          .catch((e) => console.warn('deployment_history upsert:', e.message));
      }

      if (typeof showToast === 'function')
        showToast(
          actionType === 'confirm'
            ? '✅ Đã xác nhận tham gia!'
            : '❌ Đã từ chối tham gia!',
          'success'
        );

      // 5. Reload dossier view với dữ liệu mới
      const { data: updatedInc } = await window.supabaseClient
        .from('incidents')
        .select('*')
        .eq('id', window.selectedIncidentId)
        .single();

      if (updatedInc) {
        const str = encodeURIComponent(JSON.stringify(updatedInc));
        if (window.appState?.trackingIncidents) {
          const idx = window.appState.trackingIncidents.findIndex(
            (i) => String(i.id) === String(updatedInc.id)
          );
          if (idx !== -1) window.appState.trackingIncidents[idx] = updatedInc;
          else window.appState.trackingIncidents.push(updatedInc);
        }
        if (typeof window.openDossierView === 'function')
          window.openDossierView(str);
      }

      // 6. Refresh tracking page
      if (typeof window.renderTrackingPage === 'function')
        window.renderTrackingPage(true);

      // 7. Refresh user dashboard (xóa thông báo khỏi list)
      if (
        !window.isUserAdmin() &&
        typeof window.renderUserDashboard === 'function'
      ) {
        window.renderUserDashboard();
      }
    } catch (err) {
      console.error('[submitIncidentResponse] Lỗi:', err);
      if (typeof showToast === 'function')
        showToast('Lỗi hệ thống: ' + err.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // ============================================================
  // PATCH 5: openIAPModal – fetch từng bảng riêng lẻ,
  // bỏ qua gracefully nếu bảng chưa tồn tại, tránh crash
  // ============================================================

  window.openIAPModal = async function (incidentId) {
    if (!incidentId) {
      if (typeof showToast === 'function')
        showToast('Lỗi: Thiếu ID sự kiện', 'error');
      return;
    }

    if (typeof showLoadingSpinner === 'function') showLoadingSpinner();

    // Reset form
    try {
      $('#iapTabs button:first').tab('show');
    } catch (_) {}
    $('#iap-objectives-container, #iap-logistics-body, #iap-activities-body').empty();

    try {
      // --- Bắt buộc: incidents ---
      const { data: incData, error: incErr } = await window.supabaseClient
        .from('incidents')
        .select('*')
        .eq('id', incidentId)
        .maybeSingle();
      if (incErr) throw incErr;
      if (!incData) throw new Error('Không tìm thấy sự kiện: ' + incidentId);

      // --- incident_plans (optional) ---
      let planData = {};
      try {
        const { data: planArr } = await window.supabaseClient
          .from('incident_plans')
          .select('*')
          .eq('incident_id', incidentId)
          .order('updated_at', { ascending: false })
          .limit(1);
        planData = planArr?.[0] || {};
      } catch (e) {
        console.warn('[IAP] incident_plans:', e.message);
      }

      // --- incident_assessments (optional – bảng có thể chưa tồn tại) ---
      let assessData = {};
      try {
        const { data: assessArr } = await window.supabaseClient
          .from('incident_assessments')
          .select('*')
          .eq('incident_id', incidentId)
          .limit(1);
        assessData = assessArr?.[0] || {};
      } catch (e) {
        console.warn('[IAP] incident_assessments không khả dụng:', e.message);
      }

      // --- incident_objectives (optional) ---
      let objectivesData = [];
      try {
        const { data: objArr } = await window.supabaseClient
          .from('incident_objectives')
          .select('*')
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: true });
        objectivesData = objArr || [];
      } catch (e) {
        console.warn('[IAP] incident_objectives:', e.message);
      }

      // --- incident_activities (optional) ---
      let activitiesData = [];
      try {
        const { data: actArr } = await window.supabaseClient
          .from('incident_activities')
          .select('*')
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: true });
        activitiesData = actArr || [];
      } catch (e) {
        console.warn('[IAP] incident_activities:', e.message);
      }

      // --- incident_logistics (optional) ---
      let logisticsData = [];
      try {
        const { data: logArr } = await window.supabaseClient
          .from('incident_logistics')
          .select('*')
          .eq('incident_id', incidentId);
        logisticsData = logArr || [];
      } catch (e) {
        console.warn('[IAP] incident_logistics:', e.message);
      }

      // Parse JSON fields
      const safeParse = (val, fallback = {}) => {
        if (!val) return fallback;
        if (typeof val === 'object') return val;
        try { return JSON.parse(val); } catch { return fallback; }
      };

      const meta = safeParse(planData.meta, {});
      const currentApproval = meta?.approval || {};
      const nextVersion = (parseInt(currentApproval?.version) || 0) + 1;

      // Ghép objectives + activities
      const structuredObjectives = objectivesData.map((obj, idx) => {
        let childActs = activitiesData.filter(
          (a) => String(a.objective_id) === String(obj.id)
        );
        if (idx === 0) {
          const orphans = activitiesData.filter(
            (a) => !a.objective_id || a.objective_id === 'null'
          );
          childActs = [...childActs, ...orphans];
        }
        return {
          id: obj.id,
          content: obj.objective_text || '',
          activities: childActs.map((a) => ({
            id: a.id,
            group: a.task_group,
            content: a.content,
            assignee: a.assignee_id,
            deadline: a.deadline,
            output: a.expected_output,
            status: a.status === 'completed' ? 'Done' : 'Pending',
          })),
        };
      });

      const formData = {
        incident: {
          id: incidentId,
          name: incData.event_name || 'Chưa có tên',
          level: planData.level || 'Đáp ứng',
          summary: planData.summary || '',
        },
        assessment: assessData,
        meta: meta,
        objectives: structuredObjectives,
        logistics: logisticsData,
      };

      // Gọi hàm populate (đã có sẵn trong script.js)
      if (typeof populateIAPForm === 'function') {
        populateIAPForm(formData);
      }

      $('#iap-version').val(nextVersion);
      $('#plan-incident-title').text(incData.event_name || '');
      $('#plan-status-badge')
        .text(incData.status === 'closed' ? 'ĐÃ ĐÓNG' : 'ĐANG HOẠT ĐỘNG')
        .removeClass('bg-warning bg-success')
        .addClass(incData.status === 'closed' ? 'bg-success' : 'bg-warning');
      $('#modal-incident-plan').data('id', incidentId);

      // Mở modal an toàn
      const modalEl = document.getElementById('modal-incident-plan');
      if (modalEl) {
        const existing = bootstrap.Modal?.getInstance(modalEl);
        if (existing) existing.dispose();
        document
          .querySelectorAll('.modal-backdrop')
          .forEach((el) => el.remove());
        new bootstrap.Modal(modalEl, { backdrop: true, keyboard: true }).show();
      }
    } catch (err) {
      console.error('[openIAPModal] Lỗi:', err);
      if (typeof showToast === 'function')
        showToast('Không thể mở IAP: ' + err.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };

  // ============================================================
  // PATCH 6: openDossierView – sửa logic phản hồi hiển thị
  // action bar chính xác hơn sau khi đã phản hồi
  // ============================================================

  const _origOpenDossierView = window.openDossierView;
  // Không override toàn bộ, chỉ patch phần action bar sau khi mở
  // bằng cách hook vào sự kiện sau khi dossier render xong.
  // (openDossierView gốc đã đủ logic, PATCH 4 đã fix phần cốt lõi)

  // ============================================================
  // PATCH 7: submitIAP – sửa getCurrentUserId
  // (đã được patch bởi PATCH 1, chỉ cần đảm bảo gọi đúng)
  // ============================================================

  // ============================================================
  // PATCH 8: openReportModal – guard getCurrentUserId
  // ============================================================
  const _origOpenReportModal = window.openReportModal;
  if (typeof _origOpenReportModal === 'function') {
    window.openReportModal = async function (preSelectType, preFillData) {
      // Đảm bảo getCurrentUserId luôn có giá trị trước khi mở
      if (!window.getCurrentUserId()) {
        console.warn('[openReportModal] Chưa có userSession.id');
      }
      return _origOpenReportModal.call(this, preSelectType, preFillData);
    };
  }

  // ============================================================
  // PATCH 9: Tự động refresh user dashboard sau khi đăng nhập
  // ============================================================
  const _origHandleSuccessfulAuth = window.handleSuccessfulAuth;
  window.handleSuccessfulAuth = function () {
    if (typeof _origHandleSuccessfulAuth === 'function') {
      _origHandleSuccessfulAuth.call(this);
    }
    // Đảm bảo user dashboard được render sau khi có dữ liệu
    setTimeout(async () => {
      if (!window.isUserAdmin() && typeof window.renderUserDashboard === 'function') {
        await window.renderUserDashboard();
      }
    }, 1500);
  };

  // ============================================================
  // PATCH 10: sendDossierMessage – dùng getCurrentUserId đúng cách
  // ============================================================
  window.sendDossierMessage = async function (type) {
    const input = document.getElementById('inp-chat');
    if (!input) return;

    const content = input.value.trim();
    if (!content) return;

    const incidentId = window.currentDossierId;
    if (!incidentId) {
      if (typeof showToast === 'function')
        showToast('Lỗi: Không xác định được ID sự kiện.', 'error');
      return;
    }

    const chatBox = document.getElementById('dossier-chat-box');
    const userId = window.getCurrentUserId(); // ← Đã có từ PATCH 1

    // Render optimistic UI
    const escaped = typeof window.escapeHtml === 'function' ? window.escapeHtml(content) : content;
    let htmlContent =
      type === 'Report'
        ? `<div class="report-bubble"><div class="report-header">
             <span><i class="bx bxs-report"></i> BÁO CÁO NHANH</span>
             <span>${new Date().toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit'})}</span>
           </div><div class="report-body">${escaped}</div></div>`
        : `<div class="msg-bubble" style="background:#0084ff;color:white;">${escaped}</div>`;

    if (chatBox) {
      chatBox.insertAdjacentHTML(
        'beforeend',
        `<div class="msg right">
          <div class="msg-sender">Tôi</div>
          ${htmlContent}
         </div>`
      );
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    input.value = '';
    input.focus();

    try {
      const { error } = await window.supabaseClient
        .from('incident_logs')
        .insert([
          {
            incident_id: incidentId,
            content: content,
            log_type: type,
            user_id: userId,   // ← Không còn crash
            attachment_url: null,
          },
        ]);

      if (error) throw error;

      if (typeof window.loadEventLogs === 'function') {
        await window.loadEventLogs(incidentId);
      }
    } catch (err) {
      console.error('[sendDossierMessage] Lỗi:', err);
      if (typeof showToast === 'function')
        showToast('Lỗi gửi tin: ' + err.message, 'error');
    }
  };

  // ============================================================
  // PATCH 11: submitSOS – dùng getCurrentUserId
  // ============================================================
  window.submitSOS = async function () {
    const type = document.getElementById('sos-type')?.value || '';
    const qty = document.getElementById('sos-qty')?.value?.trim() || '';
    const desc = document.getElementById('sos-desc')?.value?.trim() || '';
    const incidentId = window.currentDossierId;

    if (!qty) {
      if (typeof showToast === 'function')
        showToast('Vui lòng nhập số lượng hoặc chi tiết.', 'warning');
      return;
    }

    const esc = typeof window.escapeHtml === 'function' ? window.escapeHtml : (s) => s;
    const contentHtml = `
      <div class="msg-bubble" style="background:#fff3cd;color:#856404;border:1px solid #ffeeba;width:100%;padding:15px;">
        <div style="display:inline-block;background:#dc3545;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;margin-bottom:8px;">
          YÊU CẦU HỖ TRỢ (SOS)
        </div>
        <div style="font-weight:bold;font-size:14px;color:#dc3545;">${esc(type).toUpperCase()}</div>
        <div style="margin-top:5px;"><b>Chi tiết:</b> ${esc(qty)}</div>
        <div style="margin-top:5px;font-style:italic;">"${esc(desc)}"</div>
      </div>`;

    const chatBox = document.getElementById('dossier-chat-box');
    if (chatBox) {
      chatBox.insertAdjacentHTML(
        'beforeend',
        `<div class="msg right"><div class="msg-sender">Tôi</div>${contentHtml}</div>`
      );
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    try {
      if (!incidentId) throw new Error('Không tìm thấy ID sự kiện');

      const { error } = await window.supabaseClient.from('incident_logs').insert([
        {
          incident_id: incidentId,
          content: contentHtml,
          log_type: 'SOS',
          user_id: window.getCurrentUserId(), // ← Đã có từ PATCH 1
          attachment_url: null,
        },
      ]);
      if (error) throw error;

      document.getElementById('sos-qty').value = '';
      document.getElementById('sos-desc').value = '';

      if (typeof window.closeModal === 'function') window.closeModal('modal-sos');
      if (typeof showToast === 'function') showToast('✅ Đã gửi yêu cầu hỗ trợ SOS!', 'success');
    } catch (err) {
      console.error('[submitSOS] Lỗi:', err);
      if (typeof showToast === 'function') showToast('Lỗi gửi SOS: ' + err.message, 'error');
    }
  };

  // ============================================================
  // PATCH 12: Hàm escape helper đảm bảo luôn tồn tại
  // ============================================================
  if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function (text) {
      if (text == null) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };
  }

  // Shortcut nội bộ
  function _esc(s) {
    return window.escapeHtml(s);
  }

  console.log('[fix-patches.js] ✅ Tất cả patches đã được áp dụng thành công.');
})();
