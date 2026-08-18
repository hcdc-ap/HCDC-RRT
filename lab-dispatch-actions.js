// ============================================================================
// GIAI ĐOẠN 2C — HÀNH ĐỘNG ĐIỀU PHỐI (đề xuất / duyệt / chốt / hủy)
// Hệ thống RRT-HCDC
// ----------------------------------------------------------------------------
// Phụ thuộc: lab-dispatch-engine.js, lab-dispatch-modal.js, Bootstrap, Supabase.
// NHÚNG: <script src="lab-dispatch-actions.js"></script>  (SAU lab-dispatch-modal.js)
//
// LUỒNG NGHIỆP VỤ (đã chốt qua thảo luận):
//   • Đội trưởng (position='Leader'):
//       - Nút "Đề xuất PXN" → ghi lab_dispatch_log status='suggested'
//         + gửi thông báo cho admin qua bảng notifications (hệ thống sẵn có)
//   • Admin (role='admin'):
//       - Thấy các đề xuất đang chờ (status='suggested') → "Duyệt" (→ dispatched)
//         hoặc "Từ chối" (→ cancelled)
//       - Nút "Chốt điều phối mẫu" → ghi thẳng status='dispatched' (trừ công suất)
//       - Xem "Lịch sử điều phối mẫu hôm nay" + "Hủy" lệnh vừa chốt (→ cancelled)
//
// GHI CHÚ CÔNG SUẤT: chốt/duyệt (status dispatched) → sample_count tính vào
//   tổng-theo-ngày → PXN đó giảm công suất còn lại ở lần tìm sau. Hủy
//   (cancelled) → không còn tính (RPC find_candidate_labs đã loại 'cancelled').
// ============================================================================

(function () {
  'use strict';

  const esc = (s) =>
    window.escapeHtml
      ? window.escapeHtml(s)
      : String(s ?? '').replace(
          /[&<>"']/g,
          (c) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#039;',
            }[c])
        );

  let _role = { isAdmin: false, isLeader: false, userId: null, checked: false };

  // --------------------------------------------------------------------------
  // XÁC ĐỊNH QUYỀN NGƯỜI DÙNG (cache trong phiên)
  // --------------------------------------------------------------------------
  async function resolveRole() {
    if (_role.checked) return _role;
    try {
      const { data: userData } = await window.supabaseClient.auth.getUser();
      _role.userId = userData?.user?.id || window.getCurrentUserId?.() || null;

      const [adminRes, leaderRes] = await Promise.all([
        window.supabaseClient.rpc('is_admin'),
        window.supabaseClient.rpc('is_team_leader'),
      ]);
      _role.isAdmin = adminRes.data === true;
      _role.isLeader = leaderRes.data === true;
      _role.checked = true;
    } catch (e) {
      console.error('[dispatch-actions] Lỗi xác định quyền:', e);
    }
    return _role;
  }

  // --------------------------------------------------------------------------
  // GẮN NÚT HÀNH ĐỘNG VÀO MỖI CARD TOP 3 (modal 2B gọi hàm này)
  //   lab: 1 phần tử trong result.top ; S: state của modal
  // --------------------------------------------------------------------------
  window.renderDispatchActions = async function (lab, S) {
    const slot = document.getElementById('disp-action-' + lab.lab_id);
    if (!slot) return;

    const role = await resolveRole();

    // Không đủ chỗ → không cho điều thẳng (chỉ cảnh báo); vẫn cho đề xuất để admin cân nhắc
    const enoughNote = lab.is_enough
      ? ''
      : `<div class="text-danger" style="font-size:.7rem;">Vượt công suất còn lại</div>`;

    if (role.isAdmin) {
      slot.innerHTML = `
        <button class="btn btn-success btn-sm w-100"
          onclick='window.confirmDispatch(${_labPayloadAttr(lab, S)})'>
          <i class='bx bx-check-double'></i> Xác nhận điều phối mẫu
        </button>${enoughNote}`;
    } else if (role.isLeader) {
      slot.innerHTML = `
        <button class="btn btn-warning btn-sm w-100"
          onclick='window.suggestDispatch(${_labPayloadAttr(lab, S)})'>
          <i class='bx bx-send'></i> Đề xuất lên điều phối
        </button>${enoughNote}`;
    } else {
      // Thành viên thường: chỉ xem
      slot.innerHTML = `<small class="text-muted">Chỉ xem</small>`;
    }
  };

  // Đóng gói dữ liệu lab+ngữ cảnh thành tham số cho onclick (an toàn qua JSON)
  function _labPayloadAttr(lab, S) {
    const payload = {
      labId: lab.lab_id,
      labName: lab.lab_name,
      testTypeId: S.testTypeId,
      sampleCount: S.sampleCount,
      incidentId: S.incidentId,
      km: lab.route.km,
      minutes: lab.route.minutes,
      // Đầu mối liên hệ PXN — để RRT liên hệ ngay sau khi chốt
      headName: lab.head_name || null,
      headPhone: lab.head_phone || null,
      headEmail: lab.head_email || null,
    };
    // Nhúng dưới dạng chuỗi JSON đã escape nháy đơn để đặt trong onclick='...'
    return JSON.stringify(payload).replace(/'/g, '&#39;');
  }

  // --------------------------------------------------------------------------
  // ĐỘI TRƯỞNG: ĐỀ XUẤT (ghi suggested + báo admin)
  // --------------------------------------------------------------------------
  window.suggestDispatch = async function (p) {
    if (typeof p === 'string') p = JSON.parse(p);
    const role = await resolveRole();

    const note = await _promptNote(
      'Đề xuất phòng xét nghiệm',
      `Đề xuất điều ${p.sampleCount} mẫu tới "${p.labName}".\nGhi chú cho điều phối (tùy chọn):`
    );
    if (note === null) return; // hủy

    try {
      // 1. Ghi log đề xuất
      const { data: logRow, error } = await window.supabaseClient
        .from('lab_dispatch_log')
        .insert([
          {
            lab_id: p.labId,
            incident_id: p.incidentId || null,
            test_type_id: p.testTypeId,
            sample_count: p.sampleCount,
            status: 'suggested',
            dispatched_by: role.userId,
            note: note || null,
          },
        ])
        .select()
        .single();
      if (error) throw error;

      // 2. Gửi thông báo cho admin qua hệ thống notifications sẵn có
      await _notifyAdmins(
        `Đề xuất điều ${p.sampleCount} mẫu tới ${p.labName}` +
          (p.incidentId ? ' (có gắn sự kiện)' : ''),
        p.incidentId
      );

      if (window.showToast)
        window.showToast('✅ Đã gửi đề xuất lên điều phối', 'success');
      // Cập nhật lại nút thành trạng thái đã gửi
      const slot = document.getElementById('disp-action-' + p.labId);
      if (slot)
        slot.innerHTML =
          '<span class="badge bg-warning text-dark"><i class="bx bx-time"></i> Đã đề xuất</span>';
    } catch (e) {
      console.error('[suggestDispatch]', e);
      if (window.showToast)
        window.showToast('Lỗi đề xuất: ' + e.message, 'error');
    }
  };

  // Gửi notification cho toàn bộ admin (dùng bảng notifications sẵn có)
  async function _notifyAdmins(message, incidentId) {
    try {
      const { data: admins } = await window.supabaseClient
        .from('profiles')
        .select('email')
        .eq('role', 'admin');
      if (!admins || admins.length === 0) return;

      const rows = admins.map((a) => ({
        user_email: a.email,
        message: '[Điều phối Phòng Xét nghiệm] ' + message,
        notification_type: 'thong_tin',
        incident_id: incidentId || null,
        is_read: false,
      }));
      await window.supabaseClient.from('notifications').insert(rows);
    } catch (e) {
      console.warn('[notifyAdmins] không gửi được thông báo:', e.message);
      // Không chặn luồng chính nếu notify lỗi
    }
  }

  // Báo cho THÀNH VIÊN đang tham gia sự cố khi đã CHỐT điều phối mẫu (kèm km + phút).
  // Nguồn thành viên: incidents.members (chuỗi email nối bằng ';').
  async function _notifyIncidentMembers(p) {
    if (!p.incidentId) {
      // điều phối mẫu không gắn sự cố (mở từ trang bản đồ) → không có thành viên để báo
      return;
    }
    try {
      // 1. Lấy danh sách email thành viên + tên loại XN để ghi nội dung
      const [incRes, ttRes] = await Promise.all([
        window.supabaseClient
          .from('incidents')
          .select('event_name, members')
          .eq('id', p.incidentId)
          .single(),
        window.supabaseClient
          .from('test_types')
          .select('name')
          .eq('id', p.testTypeId)
          .single(),
      ]);

      const inc = incRes.data;
      if (!inc) return;

      const emails = String(inc.members || '')
        .split(';')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (emails.length === 0) {
        console.info(
          '[notifyIncidentMembers] Sự kiện chưa có thành viên nào để báo.'
        );
        return;
      }

      const testName = ttRes.data?.name || 'xét nghiệm';

      // 2. Soạn nội dung có km + phút (đúng yêu cầu)
      const message =
        `Đã điều ${p.sampleCount} mẫu (${testName}) tới ${p.labName} — ` +
        `${p.km} km, khoảng ${p.minutes} phút di chuyển.`;

      // 3. Ghi vào notifications cho từng thành viên → trigger tự bắn Telegram/email
      const rows = emails.map((email) => ({
        user_email: email,
        message: message,
        notification_type: 'thong_tin',
        incident_id: p.incidentId,
        is_read: false,
      }));
      const { error } = await window.supabaseClient
        .from('notifications')
        .insert(rows);
      if (error) throw error;

      console.info(
        `[notifyIncidentMembers] Đã báo ${emails.length} thành viên sự kiện.`
      );
    } catch (e) {
      console.warn(
        '[notifyIncidentMembers] không gửi được thông báo:',
        e.message
      );
      // Không chặn luồng chính — điều phối mẫu đã thành công dù notify lỗi
    }
  }

  // --------------------------------------------------------------------------
  // ADMIN: CHỐT điều phối mẫu (ghi dispatched → trừ công suất)
  // --------------------------------------------------------------------------
  window.confirmDispatch = async function (p) {
    if (typeof p === 'string') p = JSON.parse(p);
    const role = await resolveRole();
    if (!role.isAdmin) {
      if (window.showToast)
        window.showToast('Chỉ điều phối viên mới chốt được', 'warning');
      return;
    }

    const ok = await window.showConfirm({
      title: 'Xác nhận điều phối mẫu',
      message:
        `Xác nhận điều ${p.sampleCount} mẫu tới:\n"${p.labName}"\n(${p.km} km · ${p.minutes} phút)\n\n` +
        `Công suất còn lại hôm nay của Phòng Xét nghiệm sẽ được trừ tương ứng.`,
      confirmText: 'Xác nhận',
      cancelText: 'Xem lại',
      variant: 'primary',
      icon: 'bx-check-double',
    });
    if (!ok) return;

    try {
      const { error } = await window.supabaseClient
        .from('lab_dispatch_log')
        .insert([
          {
            lab_id: p.labId,
            incident_id: p.incidentId || null,
            test_type_id: p.testTypeId,
            sample_count: p.sampleCount,
            status: 'dispatched',
            dispatched_by: role.userId,
          },
        ]);
      if (error) throw error;

      if (window.showToast)
        window.showToast(
          `✅ Đã điều ${p.sampleCount} mẫu tới ${p.labName}`,
          'success'
        );

      // Nhắc RRT liên hệ ĐẦU MỐI PXN để phối hợp (mong muốn Khoa XN)
      _showContactReminder(p);

      // Gửi thông báo cho THÀNH VIÊN đang tham gia sự cố (kèm km + phút).
      // → ghi vào bảng notifications → trigger tự bắn Telegram/email.
      await _notifyIncidentMembers(p);

      // Hiện lịch sử điều phối mẫu (có nút hủy) + chạy lại tìm kiếm để cập nhật công suất
      await window.showDispatchHistory(p.incidentId, p.testTypeId);
      if (typeof window._runDispatch === 'function') window._runDispatch();
    } catch (e) {
      console.error('[confirmDispatch]', e);
      if (window.showToast)
        window.showToast('Lỗi xác nhận điều phối mẫu: ' + e.message, 'error');
    }
  };

  // --------------------------------------------------------------------------
  // ADMIN: DUYỆT / TỪ CHỐI ĐỀ XUẤT CỦA ĐỘI TRƯỞNG
  // (hiển thị trong panel "Đề xuất đang chờ" — gọi từ showPendingSuggestions)
  // --------------------------------------------------------------------------
  window.approveSuggestion = async function (logId, action) {
    const role = await resolveRole();
    if (!role.isAdmin) return;

    const newStatus = action === 'approve' ? 'dispatched' : 'cancelled';
    try {
      const { error } = await window.supabaseClient
        .from('lab_dispatch_log')
        .update({ status: newStatus })
        .eq('id', logId);
      if (error) throw error;

      if (window.showToast)
        window.showToast(
          action === 'approve' ? 'Đã duyệt đề xuất' : 'Đã từ chối đề xuất',
          'success'
        );

      // reload panel đề xuất + kết quả
      const S = window._getDispatchState?.();
      await window.showPendingSuggestions(S?.incidentId, S?.testTypeId);
      if (typeof window._runDispatch === 'function') window._runDispatch();
    } catch (e) {
      if (window.showToast) window.showToast('Lỗi: ' + e.message, 'error');
    }
  };

  // --------------------------------------------------------------------------
  // PANEL: ĐỀ XUẤT ĐANG CHỜ DUYỆT (admin thấy, gắn vào modal)
  // --------------------------------------------------------------------------
  window.showPendingSuggestions = async function (incidentId, testTypeId) {
    const role = await resolveRole();
    const host = document.getElementById('disp-pending');
    if (!host) return;
    if (!role.isAdmin) {
      host.innerHTML = '';
      return;
    }

    try {
      let q = window.supabaseClient
        .from('lab_dispatch_log')
        .select(
          '*, laboratories(name), test_types(name), profiles:dispatched_by(full_name)'
        )
        .eq('status', 'suggested')
        .order('created_at', { ascending: false });
      if (incidentId) q = q.eq('incident_id', incidentId);
      const { data, error } = await q;
      if (error) throw error;

      if (!data || data.length === 0) {
        host.innerHTML = '';
        return;
      }

      const rows = data
        .map(
          (s) => `
        <div class="d-flex justify-content-between align-items-center border rounded p-2 mb-1 bg-warning-subtle">
          <div>
            <small><b>${esc(s.laboratories?.name || '?')}</b> · ${
            s.sample_count
          } mẫu ·
            ${esc(s.test_types?.name || '')}</small><br>
            <small class="text-muted">Đề xuất bởi ${esc(
              s.profiles?.full_name || '—'
            )}
            ${s.note ? '· "' + esc(s.note) + '"' : ''}</small>
          </div>
          <div class="btn-group btn-group-sm flex-shrink-0">
            <button class="btn btn-success" onclick="window.approveSuggestion('${
              s.id
            }','approve')">
              <i class='bx bx-check'></i> Duyệt
            </button>
            <button class="btn btn-outline-danger" onclick="window.approveSuggestion('${
              s.id
            }','reject')">
              <i class='bx bx-x'></i>
            </button>
          </div>
        </div>`
        )
        .join('');

      host.innerHTML = `
        <div class="card border-warning mb-3">
          <div class="card-body py-2">
            <h6 class="mb-2"><i class='bx bx-bell'></i> Đề xuất đang chờ duyệt (${data.length})</h6>
            ${rows}
          </div>
        </div>`;
    } catch (e) {
      console.warn('[showPendingSuggestions]', e.message);
    }
  };

  // --------------------------------------------------------------------------
  // MINI DASHBOARD & LỊCH SỬ ĐIỀU PHỐI (Theo dõi toàn bộ vòng đời Yêu cầu 3)
  // --------------------------------------------------------------------------
  window._histState = { scopeIncidentId: null, date: null };

  window.showDispatchHistory = function (incidentId) {
    window._histState.scopeIncidentId = incidentId || null;
    window._histState.date = new Date().toISOString().slice(0, 10);
    _renderDispatchHistory();
  };

  async function _renderDispatchHistory() {
    const st = window._histState;
    try {
      // 1. Tải TOÀN BỘ trạng thái trong ngày (không filter riêng dispatched nữa)
      let q = window.supabaseClient
        .from('lab_dispatch_log')
        .select(
          '*, laboratories(name), test_types(name), incidents(event_name)'
        )
        .eq('dispatch_date', st.date)
        .order('created_at', { ascending: false });

      if (st.scopeIncidentId) q = q.eq('incident_id', st.scopeIncidentId);

      const { data, error } = await q;
      if (error) throw error;

      const role = await resolveRole();
      const showIncidentCol = !st.scopeIncidentId;

      // 2. TÍNH TOÁN THỐNG KÊ (Cho Mini Dashboard)
      let stats = {
        totalReq: 0,
        waiting: 0,
        accepted: 0,
        rejected: 0,
        dispatched: 0,
      };

      (data || []).forEach((d) => {
        if (d.status === 'inquiry_sent') {
          stats.totalReq += d.requested_sample_count || 0;
          stats.waiting++;
        }
        if (d.status === 'accepted' || d.status === 'partially_accepted') {
          stats.totalReq += d.requested_sample_count || 0;
          stats.accepted += d.accepted_sample_count || 0;
        }
        if (d.status === 'rejected') stats.rejected++;
        if (d.status === 'dispatched' || d.status === 'completed') {
          stats.dispatched += d.sample_count || 0;
        }
      });

      // 3. RENDER CÁC DÒNG (Table Rows)
      const rows = (data || [])
        .map((d) => {
          // --- BẮT ĐẦU ĐOẠN SỬA LỖI LOGIC ---
          // "Nâng cấp" trạng thái nếu PXN bấm nhầm nút "Nhận 1 phần" nhưng lại nhập đủ số lượng
          let displayStatus = d.status;
          if (
            displayStatus === 'partially_accepted' &&
            d.accepted_sample_count >= d.requested_sample_count
          ) {
            displayStatus = 'accepted';
          }
          // --- KẾT THÚC ĐOẠN SỬA LỖI ---

          // Render Badge Trạng thái (Dùng displayStatus thay vì d.status)
          let statusBadge = '';
          if (displayStatus === 'suggested')
            statusBadge = `<span class="badge bg-warning text-dark"><i class='bx bx-time'></i> Đề xuất chờ duyệt</span>`;
          else if (displayStatus === 'inquiry_sent')
            statusBadge = `<span class="badge bg-info text-dark"><i class='bx bx-mail-send'></i> Chờ PXN phản hồi</span>`;
          else if (displayStatus === 'accepted')
            statusBadge = `<span class="badge bg-success"><i class='bx bx-check-double'></i> PXN nhận đủ</span>`;
          else if (displayStatus === 'partially_accepted')
            statusBadge = `<span class="badge bg-warning text-dark"><i class='bx bx-adjust'></i> PXN nhận 1 phần</span>`;
          else if (displayStatus === 'rejected')
            statusBadge = `<span class="badge bg-danger"><i class='bx bx-block'></i> PXN từ chối</span>`;
          else if (displayStatus === 'dispatched')
            statusBadge = `<span class="badge bg-primary"><i class='bx bx-rocket'></i> Đã chốt điều mẫu</span>`;
          else if (displayStatus === 'completed')
            statusBadge = `<span class="badge bg-success"><i class='bx bx-check'></i> Hoàn thành</span>`;
          else if (displayStatus === 'cancelled')
            statusBadge = `<span class="badge bg-secondary"><i class='bx bx-x'></i> Đã hủy</span>`;

          // Render số lượng mẫu
          let sampleInfo = '';
          if (
            ['inquiry_sent', 'suggested', 'rejected'].includes(displayStatus)
          ) {
            sampleInfo = `Yêu cầu: <b>${d.requested_sample_count}</b>`;
          } else if (
            ['accepted', 'partially_accepted'].includes(displayStatus)
          ) {
            sampleInfo = `Nhận: <b class="text-success">${d.accepted_sample_count}</b> / ${d.requested_sample_count}`;
          } else {
            sampleInfo = `Đã chốt: <b class="text-primary">${d.sample_count}</b>`;
          }

          // Tác nhân
          let pathogens =
            d.pathogens && d.pathogens.length > 0
              ? d.pathogens.join(', ')
              : 'Không chỉ định';

          // Action Buttons cho Admin
          let actionBtns = '';
          if (role.isAdmin) {
            if (['accepted', 'partially_accepted'].includes(displayStatus)) {
              // Nút chốt ngay trên dashboard nếu PXN đã đồng ý
              const payload = _labPayloadAttr(
                {
                  lab_id: d.lab_id,
                  lab_name: d.laboratories?.name,
                  route: { km: '?', minutes: '?' },
                  headName: d.laboratories?.head_name,
                  headPhone: d.laboratories?.head_phone,
                  headEmail: d.laboratories?.head_email,
                },
                {
                  testTypeId: d.test_type_id,
                  sampleCount: d.accepted_sample_count,
                  incidentId: d.incident_id,
                }
              );

              actionBtns = `<button class="btn btn-sm btn-success w-100 mb-1" onclick='window.confirmDispatch(${payload})'>
                            <i class='bx bx-check'></i> Chốt điều phối
                          </button>`;
            }
            if (
              [
                'dispatched',
                'inquiry_sent',
                'accepted',
                'partially_accepted',
                'suggested',
              ].includes(displayStatus)
            ) {
              actionBtns += `<button class="btn btn-sm btn-outline-danger w-100" onclick="window.cancelDispatch('${d.id}')">
                            <i class='bx bx-undo'></i> Hủy/Thu hồi lệnh
                          </button>`;
            }
          }

          return `
        <tr class="${
          displayStatus === 'rejected' ? 'table-secondary opacity-75' : ''
        }">
          ${
            showIncidentCol
              ? `<td><small class="fw-bold">${esc(
                  d.incidents?.event_name || '—'
                )}</small></td>`
              : ''
          }
          <td><b>${esc(d.laboratories?.name || '?')}</b></td>
          <td>
            <small class="d-block text-primary">${esc(
              d.test_types?.name || ''
            )}</small>
            <small class="d-block text-muted" style="font-size: 11px;">Tác nhân: ${esc(
              pathogens
            )}</small>
          </td>
          <td class="text-center" style="font-size: 13px;">${sampleInfo}</td>
          <td class="text-center">${statusBadge}</td>
          <td class="text-center" style="width: 120px;">${actionBtns}</td>
        </tr>`;
        })
        .join('');

      const colspan = showIncidentCol ? 6 : 5;
      const headIncident = showIncidentCol ? '<th>Sự kiện</th>' : '';

      const scopeToggle = st.scopeIncidentId
        ? `<button class="btn btn-sm btn-outline-primary" onclick="window._histSetScope(null)">
             <i class='bx bx-list-ul'></i> Xem tất cả sự kiện
           </button>`
        : `<span class="badge bg-secondary">Đang xem: tất cả sự kiện</span>`;

      // 4. RENDER GIAO DIỆN CHÍNH
      document.getElementById('dispatch-history-wrapper')?.remove();
      const wrap = document.createElement('div');
      wrap.id = 'dispatch-history-wrapper';
      wrap.innerHTML = `
        <div class="modal fade" id="dispatchHistModal" tabindex="-1">
          <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header" style="background:#006a75;color:#fff;">
                <h5 class="modal-title"><i class='bx bx-radar'></i> Theo dõi điều phối mẫu</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body" style="background: #f8f9fa;">
                
                <!-- HEADER CHỌN NGÀY -->
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                  <div class="d-flex align-items-center gap-2">
                    <label class="mb-0 fw-bold"><i class='bx bx-calendar'></i> Theo dõi ngày:</label>
                    <input type="date" id="hist-date" class="form-control" style="width:auto; font-weight: bold;"
                           value="${
                             st.date
                           }" onchange="window._histSetDate(this.value)">
                  </div>
                  ${scopeToggle}
                </div>

                <!-- MINI DASHBOARD STATS -->
                <div class="row g-2 mb-3">
                  <div class="col-md-3">
                    <div class="card bg-info text-white h-100 border-0 shadow-sm">
                      <div class="card-body p-2 text-center">
                        <h6 class="mb-1"><i class='bx bx-mail-send'></i> PXN đang chờ</h6>
                        <h3 class="mb-0 fw-bold">${stats.waiting}</h3>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-3">
                    <div class="card bg-success text-white h-100 border-0 shadow-sm">
                      <div class="card-body p-2 text-center">
                        <h6 class="mb-1"><i class='bx bx-check-double'></i> Mẫu đã đồng ý nhận</h6>
                        <h3 class="mb-0 fw-bold">${
                          stats.accepted
                        } <span style="font-size: 12px; font-weight: normal;">/ ${
        stats.totalReq
      } yc</span></h3>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-3">
                    <div class="card bg-danger text-white h-100 border-0 shadow-sm">
                      <div class="card-body p-2 text-center">
                        <h6 class="mb-1"><i class='bx bx-block'></i> PXN từ chối / Quá tải</h6>
                        <h3 class="mb-0 fw-bold">${stats.rejected}</h3>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-3">
                    <div class="card bg-primary text-white h-100 border-0 shadow-sm">
                      <div class="card-body p-2 text-center">
                        <h6 class="mb-1"><i class='bx bx-rocket'></i> ĐÃ CHỐT ĐIỀU PHỐI</h6>
                        <h3 class="mb-0 fw-bold">${
                          stats.dispatched
                        } <span style="font-size: 12px; font-weight: normal;">mẫu</span></h3>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- BẢNG CHI TIẾT -->
                <div class="card border-0 shadow-sm">
                  <div class="card-body p-0 table-responsive">
                    <table class="table table-hover align-middle mb-0">
                      <thead class="table-light"><tr>
                        ${headIncident}
                        <th>Phòng Xét nghiệm</th>
                        <th>Chỉ định chuyên môn</th>
                        <th class="text-center">Số lượng</th>
                        <th class="text-center">Trạng thái (Realtime)</th>
                        <th class="text-center">Thao tác</th>
                      </tr></thead>
                      <tbody>${
                        rows ||
                        `<tr><td colspan="${colspan}" class="text-center text-muted py-4">Không có hoạt động điều phối / khảo sát nào ${
                          st.scopeIncidentId ? 'cho sự kiện này ' : ''
                        }trong ngày ${st.date}.</td></tr>`
                      }</tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      new bootstrap.Modal(document.getElementById('dispatchHistModal')).show();
    } catch (e) {
      console.error('[showDispatchHistory]', e);
      if (window.showToast)
        window.showToast('Lỗi tải lịch sử: ' + e.message, 'error');
    }
  }

  window._histSetScope = function (incidentId) {
    window._histState.scopeIncidentId = incidentId;
    _renderDispatchHistory();
  };

  window._histSetDate = function (dateStr) {
    window._histState.date = dateStr;
    _renderDispatchHistory();
  };

  // --------------------------------------------------------------------------
  // HỦY LỆNH điều phối mẫu (→ cancelled, trả lại công suất)
  // --------------------------------------------------------------------------
  window.cancelDispatch = async function (logId) {
    const ok = await window.showConfirm({
      title: 'Hủy lệnh điều phối mẫu',
      message:
        'Hủy lệnh này? Công suất sẽ được trả lại cho Phòng Xét nghiệm và không còn tính vào tổng hôm nay.',
      confirmText: 'Hủy lệnh',
      cancelText: 'Giữ lại',
      variant: 'danger',
      icon: 'bx-undo',
    });
    if (!ok) return;

    try {
      const { error } = await window.supabaseClient
        .from('lab_dispatch_log')
        .update({ status: 'cancelled' })
        .eq('id', logId);
      if (error) throw error;
      if (window.showToast)
        window.showToast('Đã hủy lệnh điều phối mẫu', 'success');
      // Reload lịch sử GIỮ NGUYÊN phạm vi + ngày đang xem (không reset về hôm nay/sự cố)
      _renderDispatchHistory();
      if (typeof window._runDispatch === 'function') window._runDispatch(); // cập nhật công suất
    } catch (e) {
      if (window.showToast) window.showToast('Lỗi hủy: ' + e.message, 'error');
    }
  };

  // --------------------------------------------------------------------------
  // Ô NHẬP GHI CHÚ (promise, thay prompt() xấu)
  // --------------------------------------------------------------------------
  function _promptNote(title, message) {
    return new Promise((resolve) => {
      document.getElementById('note-modal-wrapper')?.remove();
      const wrap = document.createElement('div');
      wrap.id = 'note-modal-wrapper';
      wrap.innerHTML = `
        <div class="modal fade" id="noteModal" tabindex="-1">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header" style="background:#006a75;color:#fff;">
                <h5 class="modal-title">${esc(title)}</h5>
              </div>
              <div class="modal-body">
                <p style="white-space:pre-line;">${esc(message)}</p>
                <textarea id="note-input" class="form-control" rows="2" placeholder="Ghi chú..."></textarea>
              </div>
              <div class="modal-footer">
                <button class="btn btn-secondary" id="note-cancel">Hủy</button>
                <button class="btn btn-primary" id="note-ok">Gửi đề xuất</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      const modalEl = document.getElementById('noteModal');
      const modal = new bootstrap.Modal(modalEl);
      let done = false,
        val = null;
      const finish = (v) => {
        if (done) return;
        done = true;
        val = v;
        modal.hide();
      };
      document.getElementById('note-ok').onclick = () =>
        finish(document.getElementById('note-input').value.trim());
      document.getElementById('note-cancel').onclick = () => finish(null);
      modalEl.addEventListener(
        'hidden.bs.modal',
        () => {
          wrap.remove();
          setTimeout(() => {
            if (!document.querySelector('.modal.show')) {
              document
                .querySelectorAll('.modal-backdrop')
                .forEach((b) => b.remove());
              document.body.classList.remove('modal-open');
              document.body.style.overflow = '';
            }
          }, 150);
          resolve(val);
        },
        { once: true }
      );
      modal.show();
    });
  }

  // --------------------------------------------------------------------------
  // NHẮC LIÊN HỆ ĐẦU MỐI PXN sau khi chốt (mong muốn Khoa XN: phối hợp nhanh)
  // --------------------------------------------------------------------------
  function _showContactReminder(p) {
    if (!p.headName && !p.headPhone && !p.headEmail) return; // không có đầu mối → bỏ qua

    document.getElementById('lab-contact-reminder')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'lab-contact-reminder';
    wrap.innerHTML = `
      <div class="modal fade" id="labContactModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header" style="background:#0f766e;color:#fff;">
              <h5 class="modal-title"><i class='bx bx-phone-call'></i> Liên hệ đầu mối Phòng xét nghiệm</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p class="mb-2">Đã điều <b>${p.sampleCount}</b> mẫu tới <b>${esc(
      p.labName
    )}</b>.
              Vui lòng liên hệ đầu mối để thống nhất phối hợp:</p>
              <div class="p-3 rounded" style="background:#f0fdf4;border:1px solid #bbf7d0;">
                <div class="mb-1"><i class='bx bx-user'></i> <b>${esc(
                  p.headName || 'Trưởng khoa XN'
                )}</b></div>
                ${
                  p.headPhone
                    ? `<div class="mb-2"><a href="tel:${esc(
                        p.headPhone
                      )}" class="btn btn-success btn-sm">
                         <i class='bx bx-phone'></i> Gọi ${esc(
                           p.headPhone
                         )}</a></div>`
                    : '<div class="text-muted mb-2"><small>Chưa có số điện thoại đầu mối</small></div>'
                }
                ${
                  p.headEmail
                    ? `<div><a href="mailto:${esc(
                        p.headEmail
                      )}"><i class='bx bx-envelope'></i> ${esc(
                        p.headEmail
                      )}</a></div>`
                    : ''
                }
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const modalEl = document.getElementById('labContactModal');
    new bootstrap.Modal(modalEl).show();
    modalEl.addEventListener(
      'hidden.bs.modal',
      () => {
        wrap.remove();
        setTimeout(() => {
          if (!document.querySelector('.modal.show')) {
            document
              .querySelectorAll('.modal-backdrop')
              .forEach((b) => b.remove());
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
          }
        }, 150);
      },
      { once: true }
    );
  }
  // ==========================================================================
  // [YÊU CẦU 3] - GỬI KHẢO SÁT HÀNG LOẠT VÀ LẮNG NGHE REALTIME
  // ==========================================================================

  // 1. Hàm Gửi Khảo Sát Hàng Loạt
  window.sendMassInquiry = async function () {
    const result = window._currentDispatchResult;
    const S = window._getDispatchState?.();
    if (!result || !result.top || result.top.length === 0) return;

    const btn = document.getElementById('btn-mass-inquiry');
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Đang gửi...`;
    btn.disabled = true;

    try {
      const role = await resolveRole();
      for (const lab of result.top) {
        const actionToken = crypto.randomUUID();
        const { data: insertedLog, error } = await window.supabaseClient
          .from('lab_dispatch_log')
          .insert([
            {
              lab_id: lab.lab_id,
              incident_id: S.incidentId || null,
              test_type_id: S.testTypeId,
              requested_sample_count: S.sampleCount,
              sample_count: 0,
              status: 'inquiry_sent',
              dispatched_by: role.userId,
              action_token: actionToken,
              pathogens: S.pathogens,
            },
          ])
          .select('id')
          .single();
        if (error) throw error;

        await new Promise((r) => setTimeout(r, 400));
        window.supabaseClient.functions
          .invoke('send-lab-inquiry', {
            body: { record: { id: insertedLog.id } },
          })
          .catch((err) => console.warn('Lỗi gọi Edge Function:', err));

        // Cập nhật giao diện thành "Đang chờ"
        const slot = document.getElementById('disp-action-' + lab.lab_id);
        if (slot) {
          slot.innerHTML = `<button class="btn btn-info btn-sm w-100 disabled text-white">
                              <i class='bx bx-time'></i> Đang chờ PXN phản hồi...
                            </button>`;
        }
      }
      if (window.showToast)
        window.showToast(
          'Đã gửi yêu cầu điều phối mẫu đến Top PXN.',
          'success'
        );
      btn.innerHTML = `<i class='bx bx-check'></i> Đã gửi yêu cầu hàng loạt`;
      window._subscribeToLabResponses();
    } catch (e) {
      if (window.showToast)
        window.showToast('Lỗi gửi yêu cầu: ' + e.message, 'error');
      btn.innerHTML = `<i class='bx bx-mail-send'></i> Gửi lại yêu cầu`;
      btn.disabled = false;
    }
  };

  // 2. Hàm Gửi Khảo Sát Riêng Lẻ Cho 1 PXN
  window.sendSingleInquiry = async function (labId) {
    const result = window._currentDispatchResult;
    const S = window._getDispatchState?.();
    if (!result || !result.ranked) return;

    const lab = result.ranked.find((l) => l.lab_id === labId);
    if (!lab) return;

    const slot = document.getElementById('disp-action-' + labId);
    if (slot) {
      slot.innerHTML = `<button class="btn btn-outline-secondary btn-sm w-100 disabled">
                          <i class='bx bx-loader-circle bx-spin'></i> Đang gửi...
                        </button>`;
    }

    try {
      const role = await resolveRole();
      const actionToken = crypto.randomUUID();
      const { data: insertedLog, error } = await window.supabaseClient
        .from('lab_dispatch_log')
        .insert([
          {
            lab_id: lab.lab_id,
            incident_id: S.incidentId || null,
            test_type_id: S.testTypeId,
            requested_sample_count: S.sampleCount,
            sample_count: 0,
            status: 'inquiry_sent',
            dispatched_by: role.userId,
            action_token: actionToken,
            pathogens: S.pathogens,
          },
        ])
        .select('id')
        .single();
      if (error) throw error;

      await new Promise((r) => setTimeout(r, 600));
      await window.supabaseClient.functions.invoke('send-lab-inquiry', {
        body: { record: { id: insertedLog.id } },
      });

      if (window.showToast)
        window.showToast(`✅ Đã gửi yêu cầu tới ${lab.lab_name}`, 'success');

      if (slot) {
        slot.innerHTML = `<button class="btn btn-info btn-sm w-100 disabled text-white">
                            <i class='bx bx-time'></i> Đang chờ PXN phản hồi...
                          </button>`;
      }
      window._subscribeToLabResponses();
    } catch (e) {
      if (window.showToast)
        window.showToast('Lỗi gửi yêu cầu: ' + e.message, 'error');
      if (slot) {
        slot.innerHTML = `<button class="btn btn-outline-warning btn-sm w-100 shadow-sm" onclick="window.sendSingleInquiry('${labId}')">
                            <i class='bx bx-mail-send'></i> Gửi lại yêu cầu
                          </button>`;
      }
    }
  };

  // 3. LẮNG NGHE REALTIME PHẢN HỒI
  window._subscribeToLabResponses = function () {
    // Nếu đã bật kênh lắng nghe rồi thì giữ nguyên, không tạo lại để tránh giật lag
    if (window._labDispatchSub) return;

    window._labDispatchSub = window.supabaseClient
      .channel('realtime:lab_responses')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lab_dispatch_log' },
        async (payload) => {
          const record = payload.new;
          const actionSlot = document.getElementById(
            'disp-action-' + record.lab_id
          );

          if (actionSlot) {
            const role = await resolveRole();
            const S = window._getDispatchState?.();

            // Tìm labData trong cả mảng ranked hoặc top (để không bị sót thông tin)
            const allLabs =
              window._currentDispatchResult?.ranked ||
              window._currentDispatchResult?.top ||
              [];
            const labData = allLabs.find((l) => l.lab_id === record.lab_id);
            const payloadStr = labData ? _labPayloadAttr(labData, S) : null;

            let displayStatus = record.status;
            if (
              displayStatus === 'partially_accepted' &&
              record.accepted_sample_count >= record.requested_sample_count
            ) {
              displayStatus = 'accepted';
            }

            let btnHtml = '';
            if (displayStatus === 'accepted') {
              if (role.isAdmin && payloadStr) {
                btnHtml = `<button class="btn btn-success btn-sm w-100 shadow-sm" onclick='window.confirmDispatch(${payloadStr})'><i class='bx bx-rocket'></i> Chốt điều phối (Đủ mẫu)</button>`;
              } else {
                btnHtml = `<button class="btn btn-success btn-sm w-100 disabled"><i class='bx bx-check-double'></i> Đã đồng ý nhận</button>`;
              }
            } else if (displayStatus === 'partially_accepted') {
              if (role.isAdmin && payloadStr) {
                btnHtml = `<button class="btn btn-warning btn-sm w-100 shadow-sm" onclick='window.confirmDispatch(${payloadStr})'><i class='bx bx-rocket'></i> Chốt (${record.accepted_sample_count} mẫu)</button>`;
              } else {
                btnHtml = `<button class="btn btn-warning btn-sm w-100 text-dark disabled"><i class='bx bx-adjust'></i> Nhận ${record.accepted_sample_count} mẫu</button>`;
              }
            } else if (displayStatus === 'rejected') {
              btnHtml = `<button class="btn btn-danger btn-sm w-100 disabled"><i class='bx bx-block'></i> Đã từ chối</button>`;
            } else if (displayStatus === 'dispatched') {
              btnHtml = `<button class="btn btn-primary btn-sm w-100 disabled"><i class='bx bx-check'></i> Đã chốt lệnh</button>`;
            } else if (displayStatus === 'inquiry_sent') {
              btnHtml = `<button class="btn btn-info btn-sm w-100 disabled text-white"><i class='bx bx-time'></i> Đang chờ PXN phản hồi...</button>`;
            }

            if (btnHtml) actionSlot.innerHTML = btnHtml;
          }

          // Cập nhật cả Dashboard nếu đang mở
          const histModal = document.getElementById('dispatchHistModal');
          if (histModal && histModal.classList.contains('show')) {
            if (typeof _renderDispatchHistory === 'function') {
              setTimeout(() => _renderDispatchHistory(), 300);
            }
          }
        }
      )
      .subscribe();
  };

  // 4. ĐỒNG BỘ TRẠNG THÁI NÚT BẤM (CẬP NHẬT GIAO DIỆN KHI MỞ MODAL)
  window.syncDispatchStatuses = async function () {
    if (typeof window._getDispatchState !== 'function') return;
    const S = window._getDispatchState();
    if (!S || !S.incidentId) return;

    try {
      const { data, error } = await window.supabaseClient
        .from('lab_dispatch_log')
        .select('*')
        .eq('incident_id', S.incidentId)
        .order('created_at', { ascending: false });
      if (error || !data) return;

      const latestStatus = {};
      data.forEach((d) => {
        if (!latestStatus[d.lab_id]) latestStatus[d.lab_id] = d;
      });

      const role = await resolveRole();

      Object.values(latestStatus).forEach((record) => {
        const slot = document.getElementById('disp-action-' + record.lab_id);
        if (slot) {
          const allLabs =
            window._currentDispatchResult?.ranked ||
            window._currentDispatchResult?.top ||
            [];
          const labData = allLabs.find((l) => l.lab_id === record.lab_id);
          const payloadStr = labData ? _labPayloadAttr(labData, S) : null;

          let displayStatus = record.status;
          if (
            displayStatus === 'partially_accepted' &&
            record.accepted_sample_count >= record.requested_sample_count
          ) {
            displayStatus = 'accepted';
          }

          let btnHtml = '';
          if (displayStatus === 'inquiry_sent') {
            btnHtml = `<button class="btn btn-info btn-sm w-100 disabled text-white"><i class='bx bx-time'></i> Đang chờ PXN...</button>`;
          } else if (displayStatus === 'accepted') {
            if (role.isAdmin && payloadStr) {
              btnHtml = `<button class="btn btn-success btn-sm w-100 shadow-sm" onclick='window.confirmDispatch(${payloadStr})'><i class='bx bx-rocket'></i> Chốt điều phối (Đủ mẫu)</button>`;
            } else {
              btnHtml = `<button class="btn btn-success btn-sm w-100 disabled"><i class='bx bx-check-double'></i> Đã đồng ý nhận</button>`;
            }
          } else if (displayStatus === 'partially_accepted') {
            if (role.isAdmin && payloadStr) {
              btnHtml = `<button class="btn btn-warning btn-sm w-100 shadow-sm" onclick='window.confirmDispatch(${payloadStr})'><i class='bx bx-rocket'></i> Chốt (${record.accepted_sample_count} mẫu)</button>`;
            } else {
              btnHtml = `<button class="btn btn-warning btn-sm w-100 text-dark disabled"><i class='bx bx-adjust'></i> Nhận ${record.accepted_sample_count}/${record.requested_sample_count}</button>`;
            }
          } else if (displayStatus === 'rejected') {
            btnHtml = `<button class="btn btn-danger btn-sm w-100 disabled"><i class='bx bx-block'></i> Đã từ chối</button>`;
          } else if (displayStatus === 'dispatched') {
            btnHtml = `<button class="btn btn-primary btn-sm w-100 disabled"><i class='bx bx-check'></i> Đã chốt lệnh</button>`;
          }

          if (btnHtml) slot.innerHTML = btnHtml;
        }
      });

      // 👉 BÍ QUYẾT NẰM Ở ĐÂY: KÍCH HOẠT REALTIME MỖI KHI ĐỒNG BỘ
      if (typeof window._subscribeToLabResponses === 'function') {
        window._subscribeToLabResponses();
      }
    } catch (e) {
      console.warn('Lỗi đồng bộ trạng thái nút:', e);
    }
  };

  console.log(
    '[lab-dispatch-actions.js] ✅ Hành động điều phối (đề xuất/duyệt/chốt/hủy + đầu mối liên hệ) sẵn sàng.'
  );
})();
