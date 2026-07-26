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
  // LỊCH SỬ điều phối mẫu — modal riêng.
  //   • Xem theo SỰ CỐ hiện tại hoặc TẤT CẢ (nút chuyển)
  //   • Chọn NGÀY (mặc định hôm nay) — xem lại lệnh cũ
  //   • Cột "Sự cố" hiện khi xem tất cả
  //   • Admin hủy được lệnh 'dispatched'
  // scopeIncidentId: id sự cố để lọc (null/undefined = xem tất cả)
  // --------------------------------------------------------------------------
  window._histState = { scopeIncidentId: null, date: null };

  window.showDispatchHistory = function (incidentId) {
    // Lần mở đầu: mặc định lọc theo sự cố truyền vào (nếu có) + ngày hôm nay
    window._histState.scopeIncidentId = incidentId || null;
    window._histState.date = new Date().toISOString().slice(0, 10);
    _renderDispatchHistory();
  };

  async function _renderDispatchHistory() {
    const st = window._histState;
    try {
      let q = window.supabaseClient
        .from('lab_dispatch_log')
        .select(
          '*, laboratories(name), test_types(name), incidents(event_name)'
        )
        .eq('dispatch_date', st.date)
        .in('status', ['dispatched', 'completed'])
        .order('created_at', { ascending: false });
      if (st.scopeIncidentId) q = q.eq('incident_id', st.scopeIncidentId);
      const { data, error } = await q;
      if (error) throw error;

      const role = await resolveRole();
      const showIncidentCol = !st.scopeIncidentId; // xem tất cả → hiện cột Sự cố

      const rows = (data || [])
        .map(
          (d) => `
        <tr>
          ${
            showIncidentCol
              ? `<td><small>${esc(
                  d.incidents?.event_name || '— (không gắn sự kiện)'
                )}</small></td>`
              : ''
          }
          <td>${esc(d.laboratories?.name || '?')}</td>
          <td><small>${esc(d.test_types?.name || '')}</small></td>
          <td class="text-center">${d.sample_count}</td>
          <td class="text-center">
            <span class="badge ${
              d.status === 'completed' ? 'bg-success' : 'bg-primary'
            }">
              ${d.status === 'completed' ? 'Hoàn thành' : 'Đã điều'}
            </span>
          </td>
          <td class="text-center">
            ${
              role.isAdmin && d.status === 'dispatched'
                ? `<button class="btn btn-sm btn-outline-danger" onclick="window.cancelDispatch('${d.id}')">
                   <i class='bx bx-undo'></i> Hủy
                 </button>`
                : ''
            }
          </td>
        </tr>`
        )
        .join('');

      const colspan = showIncidentCol ? 6 : 5;
      const headIncident = showIncidentCol ? '<th>Sự kiện</th>' : '';

      // Nút chuyển phạm vi: chỉ hiện "Xem sự cố này" khi đang có scope,
      // và "Xem tất cả" khi đang lọc theo sự cố.
      const scopeToggle = st.scopeIncidentId
        ? `<button class="btn btn-sm btn-outline-primary" onclick="window._histSetScope(null)">
             <i class='bx bx-list-ul'></i> Xem tất cả điều phối mẫu
           </button>`
        : `<span class="badge bg-secondary">Đang xem: tất cả sự kiện</span>`;

      const total = (data || []).reduce((s, d) => s + (d.sample_count || 0), 0);

      document.getElementById('dispatch-history-wrapper')?.remove();
      const wrap = document.createElement('div');
      wrap.id = 'dispatch-history-wrapper';
      wrap.innerHTML = `
        <div class="modal fade" id="dispatchHistModal" tabindex="-1">
          <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header" style="background:#006a75;color:#fff;">
                <h5 class="modal-title"><i class='bx bx-history'></i> Lịch sử điều phối mẫu</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                  <div class="d-flex align-items-center gap-2">
                    <label class="mb-0"><small>Ngày:</small></label>
                    <input type="date" id="hist-date" class="form-control form-control-sm" style="width:auto;"
                           value="${
                             st.date
                           }" onchange="window._histSetDate(this.value)">
                  </div>
                  ${scopeToggle}
                </div>
                <table class="table table-sm align-middle">
                  <thead class="table-light"><tr>
                    ${headIncident}<th>Phòng Xét nghiệm</th><th>Loại xét nghiệm</th>
                    <th class="text-center">Số mẫu</th><th class="text-center">Trạng thái</th><th></th>
                  </tr></thead>
                  <tbody>${
                    rows ||
                    `<tr><td colspan="${colspan}" class="text-center text-muted py-3">Không có lệnh điều phối mẫu nào ${
                      st.scopeIncidentId ? 'cho sự kiện này ' : ''
                    }trong ngày ${st.date}.</td></tr>`
                  }</tbody>
                </table>
                ${
                  data && data.length
                    ? `<div class="text-end"><small class="text-muted">Tổng: <b>${total}</b> mẫu / ${data.length} lệnh</small></div>`
                    : ''
                }
                <small class="text-muted d-block mt-1"><i class='bx bx-info-circle'></i>
                  Hủy lệnh sẽ trả lại công suất cho Phòng Xét nghiệm. Chỉ hủy được lệnh chưa hoàn thành.</small>
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

  // Đổi phạm vi (sự cố này ↔ tất cả) → render lại
  window._histSetScope = function (incidentId) {
    window._histState.scopeIncidentId = incidentId;
    _renderDispatchHistory();
  };
  // Đổi ngày → render lại
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

  console.log(
    '[lab-dispatch-actions.js] ✅ Hành động điều phối (đề xuất/duyệt/chốt/hủy) sẵn sàng.'
  );
})();
