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
      source: 'modal',
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
  // Đã bỏ cột pathogens ở bảng incidents, chỉ lấy dữ liệu từ bảng lab_dispatch_log
  async function _notifyIncidentMembers(p, logId) {
    if (!p.incidentId || !logId) {
      return;
    }
    try {
      // Lấy danh sách thành viên VÀ thông tin log điều phối
      const [incRes, logRes] = await Promise.all([
        window.supabaseClient
          .from('incidents')
          .select('event_name, members') // 👉 CHỈ LẤY event_name và members
          .eq('id', p.incidentId)
          .single(),
        window.supabaseClient
          .from('lab_dispatch_log')
          .select('requested_test_types, accepted_test_types, test_types(name), pathogens, accepted_pathogens')
          .eq('id', logId)
          .single()
      ]);

      const inc = incRes.data;
      const logData = logRes.data;
      if (!inc || !logData) return;

      const emails = String(inc.members || '')
        .split(';')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      if (emails.length === 0) return;

      // ==========================================
      // 1. Xử lý lấy tên Kỹ thuật (Ưu tiên đã nhận)
      // ==========================================
      let testName = "xét nghiệm chuyên sâu";
      const finalTechs = (logData.accepted_test_types && logData.accepted_test_types.length > 0) 
                          ? logData.accepted_test_types 
                          : logData.requested_test_types;
                          
      if (Array.isArray(finalTechs) && finalTechs.length > 0) {
        testName = finalTechs.join(", ");
      } else if (logData.test_types?.name) {
        testName = logData.test_types.name;
      }

      // ==========================================
      // 2. Xử lý lấy tên Tác nhân (Từ log điều phối)
      // ==========================================
      let pathogensList = "Không chỉ định cụ thể";
      let rawPathogens = logData.accepted_pathogens;
      
      // Nếu không có tác nhân "đã nhận", lấy tác nhân "yêu cầu ban đầu"
      if (!rawPathogens || rawPathogens.length === 0) {
        rawPathogens = logData.pathogens;
      }
      
      if (Array.isArray(rawPathogens) && rawPathogens.length > 0) {
        pathogensList = rawPathogens.join(", ");
      }

      // ==========================================
      // 3. Soạn thông báo đầy đủ
      // ==========================================
      const message = `Đã điều ${p.sampleCount} mẫu (Kỹ thuật: ${testName} | Tác nhân: ${pathogensList}) tới ${p.labName}.`;

      // Ghi vào bảng notifications để hệ thống tự bắn vào ứng dụng/email
      const rows = emails.map((email) => ({
        user_email: email,
        message: message,
        notification_type: 'thong_tin',
        incident_id: p.incidentId,
        is_read: false,
        response_status: 'confirmed' // 👉 Khóa cứng trạng thái để giữ màu xanh trên Dashboard
      }));
      
      const { error } = await window.supabaseClient.from('notifications').insert(rows);
      if (error) throw error;

      console.info(`[notifyIncidentMembers] Đã báo ${emails.length} thành viên sự kiện.`);
    } catch (e) {
      console.warn('[notifyIncidentMembers] không gửi được thông báo:', e.message);
    }
  }

  // ===================================================================
  // HÀM CHỐT ĐIỀU PHỐI MẪU (CONFIRM DISPATCH)
  // Xử lý 2 luồng: Từ Modal tìm kiếm (INSERT) và Từ Bảng Lịch sử (UPDATE)
  // ===================================================================
  // HÀM BỌC (WRAPPER) ĐỂ LẤY SỐ LƯỢNG TỪ Ô INPUT TRƯỚC KHI CHỐT
  window.submitCustomDispatch = function (payload, inputId) {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;

    const actualQty = parseInt(inputEl.value, 10);
    const maxQty = payload.sampleCount; // Số lượng tối đa PXN đã đồng ý

    if (isNaN(actualQty) || actualQty <= 0) {
      if (window.showToast) window.showToast('Số lượng chốt không hợp lệ!', 'warning');
      return;
    }

    if (actualQty > maxQty) {
      if (window.showToast) window.showToast(`Phòng xét nghiệm này chỉ đồng ý nhận tối đa ${maxQty} mẫu!`, 'error');
      inputEl.value = maxQty; // Tự động trả về mức tối đa
      return;
    }

    // Cập nhật số lượng thực tế muốn chốt vào payload
    payload.sampleCount = actualQty;

    // Chuyển tiếp sang hàm chốt gốc của hệ thống
    if (typeof window.confirmDispatch === 'function') {
      window.confirmDispatch(payload);
    }
  };
  window.confirmDispatch = async function (p) {
    if (typeof p === 'string') p = JSON.parse(p);
    
    const role = await resolveRole();
    if (!role.isAdmin) {
      if (window.showToast) window.showToast('Chỉ điều phối viên mới chốt được', 'warning');
      return;
    }

    // 👉 ÉP LUỒNG RÕ RÀNG: Cứ có logId thì chắc chắn là từ Mini-Dashboard -> UPDATE
    const source = (p.logId || p.source === 'dashboard') ? 'dashboard' : 'modal';

    const routeLine = p.km && p.km !== '?' ? `\n(${p.km} km · ${p.minutes} phút)` : '';
    const ok = await window.showConfirm({
      title: 'Xác nhận điều phối mẫu',
      message: `Xác nhận điều ${p.sampleCount} mẫu tới:\n"${p.labName}"${routeLine}\n\nCông suất còn lại hôm nay của Phòng Xét nghiệm sẽ được trừ tương ứng.`,
      confirmText: 'Xác nhận',
      cancelText: 'Xem lại',
      variant: 'primary',
      icon: 'bx-check-double',
    });
    
    if (!ok) return;

    try {
      let logIdToNotify = p.logId;

      if (source === 'dashboard') {
        // LUỒNG 1 — chốt từ Dashboard (PXN đã khảo sát, đã có sẵn log) → UPDATE.
        // KHÔNG đụng DOM modal, KHÔNG bắt chọn kỹ thuật lại.
        if (!p.logId) throw new Error('Thiếu logId để cập nhật lệnh điều phối.');
        
        const { error } = await window.supabaseClient
          .from('lab_dispatch_log')
          .update({
            status: 'dispatched',
            sample_count: p.sampleCount,
            dispatched_by: role.userId,
          })
          .eq('id', p.logId);
          
        if (error) throw error;
        
      } else {
        // LUỒNG 2 — chốt trực tiếp từ Modal tìm kiếm (chưa khảo sát) → INSERT.
        // Modal đang mở nên đọc kỹ thuật từ #disp-testtype là hợp lệ.
        const techSelect = document.getElementById('disp-testtype');
        let techNames = [];
        
        if (techSelect) {
          techNames = window.$ && $(techSelect).hasClass('select2-hidden-accessible')
              ? $(techSelect).select2('data').map((d) => d.text.trim())
              : Array.from(techSelect.selectedOptions).map((o) => o.text.trim());
        }
        
        if (techNames.length === 0) {
          if (window.showToast) window.showToast('Vui lòng chọn ít nhất 1 loại kỹ thuật', 'warning');
          return;
        }
        
        const S = window._getDispatchState?.();
        const { data: insertedLog, error } = await window.supabaseClient
          .from('lab_dispatch_log')
          .insert([{
              lab_id: p.labId,
              incident_id: p.incidentId || null,
              test_type_id: p.testTypeId,
              requested_test_types: techNames,
              pathogens: S?.pathogens || [],
              sample_count: p.sampleCount,
              status: 'dispatched',
              dispatched_by: role.userId,
          }])
          .select('id')
          .single();
          
        if (error) throw error;
        logIdToNotify = insertedLog.id;
      }

      // Thông báo thành công trên giao diện
      if (window.showToast) {
        window.showToast(`✅ Đã điều ${p.sampleCount} mẫu tới ${p.labName}`, 'success');
      }

      // Bắn lệnh qua Edge Function (Sẽ tự gửi mail và bắn Group Telegram)
      window.supabaseClient.functions
        .invoke('notify-lab-result', {
          body: {
            logId: logIdToNotify,
            action: 'dispatched',
            message: `Nhân sự RRT của HCDC sẽ gửi ${p.sampleCount} mẫu đến trong vòng 60 phút. Vui lòng chuẩn bị tiếp nhận.`,
          },
        })
        .catch((err) => console.warn('Lỗi gọi API:', err));

      // Thực thi các hành động hậu kỳ (Cập nhật giao diện, thông báo nội bộ...)
      if (typeof _notifyIncidentMembers === 'function') await _notifyIncidentMembers(p, logIdToNotify);
      if (typeof _notifyIncidentMembers === 'function') await _notifyIncidentMembers(p);
      
      // Load lại bảng lịch sử nếu đang mở
      if (typeof window.showDispatchHistory === 'function') {
        await window.showDispatchHistory(p.incidentId, p.testTypeId);
      }
      
      // Chạy lại tìm kiếm trên bản đồ để cập nhật công suất
      if (typeof window._runDispatch === 'function') window._runDispatch();
      
    } catch (e) {
      if (window.showToast) window.showToast('Lỗi xác nhận: ' + e.message, 'error');
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
      // 1. Tải TOÀN BỘ trạng thái trong ngày
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

      // --- HÀM HELPER CHUẨN HÓA CHUỖI (Khắc phục triệt để Lỗi 6: Nhạy dấu/en-dash) ---
      const normalizeStr = (s) =>
        String(s || '')
          .toLowerCase()
          .trim()
          .replace(/[–—]/g, '-')
          .replace(/\s+/g, ' ');

      // ===================================================================
      // 2. TIỀN XỬ LÝ TRẠNG THÁI & TÍNH TOÁN X/Y TỪNG CHỈ TIÊU
      // ===================================================================
      const enrichedData = (data || []).map((d) => {
        let displayStatus = d.status;

        let reqQty = d.requested_sample_count || 0;
        let accQty = d.accepted_sample_count || 0;
        let isQtyFull = accQty >= reqQty;

        let reqTechs = d.requested_test_types || [];
        if (reqTechs.length === 0 && d.test_types?.name)
          reqTechs = [d.test_types.name];
        let accTechs = d.accepted_test_types || [];

        // So sánh an toàn qua chuỗi đã chuẩn hóa
        const normReqTechs = reqTechs.map(normalizeStr);
        const normAccTechs = accTechs.map(normalizeStr);
        let isTechFull =
          normReqTechs.length === 0 ||
          normReqTechs.every((t) => normAccTechs.includes(t));

        let reqPaths = d.pathogens || [];
        let accPaths = d.accepted_pathogens || [];
        const normReqPaths = reqPaths.map(normalizeStr);
        const normAccPaths = accPaths.map(normalizeStr);
        let isPathFull =
          normReqPaths.length === 0 ||
          normReqPaths.every((p) => normAccPaths.includes(p));

        let isSpecialtyFull = isTechFull && isPathFull;
        let specificWarning = [];

        if (
          displayStatus === 'partially_accepted' ||
          displayStatus === 'accepted'
        ) {
          if (isQtyFull && isSpecialtyFull) {
            displayStatus = 'accepted_full';
          } else {
            displayStatus = 'accepted_partial';
            if (!isQtyFull) specificWarning.push('Thiếu mẫu');
            if (!isTechFull) specificWarning.push('Thiếu Kỹ thuật');
            if (!isPathFull) specificWarning.push('Thiếu Tác nhân');
          }
        }

        return {
          ...d,
          displayStatus,
          specificWarning,
          reqTechs,
          accTechs,
          reqPaths,
          accPaths,
          reqQty,
          accQty,
        };
      });
      // Lưu trữ tạm dữ liệu đã xử lý để phục vụ việc Xuất Excel
      window._currentHistExportData = enrichedData;
      // ===================================================================
      // 3. TÍNH TOÁN THỐNG KÊ MINI DASHBOARD (Thống nhất dùng displayStatus)
      // ===================================================================
      let stats = {
        waitingLabs: 0,
        fullAccLabs: 0,
        partialLabs: { total: 0, qtyShort: 0, techShort: 0, pathShort: 0 },
        rejectedLabs: 0,
        dispatchedSamples: 0,
      };

      enrichedData.forEach((d) => {
        if (['inquiry_sent', 'suggested'].includes(d.displayStatus))
          stats.waitingLabs++;
        else if (d.displayStatus === 'accepted_full') stats.fullAccLabs++;
        else if (d.displayStatus === 'accepted_partial') {
          stats.partialLabs.total++;
          if (d.accQty < d.reqQty) stats.partialLabs.qtyShort++;
          if (d.specificWarning.includes('Thiếu Kỹ thuật'))
            stats.partialLabs.techShort++;
          if (d.specificWarning.includes('Thiếu Tác nhân'))
            stats.partialLabs.pathShort++;
        } else if (d.displayStatus === 'rejected') stats.rejectedLabs++;

        // Thống nhất kiểm tra displayStatus cho cả trạng thái chốt
        if (['dispatched', 'completed'].includes(d.displayStatus)) {
          stats.dispatchedSamples += d.sample_count || 0;
        }
      });

      // ===================================================================
      // 4. KHUNG ĐỀ BÀI & THUẬT TOÁN GỢI Ý (Đã vá Lỗi 3, 4, 5)
      // ===================================================================
      let reqBlockHtml = '';
      if (enrichedData.length > 0) {
        let sampleD = enrichedData[0];
        let eventName =
          sampleD.incidents?.event_name || 'Tìm Phòng xét nghiệm (Bản đồ)';

        const uniqueKeys = new Set(
          enrichedData.map(
            (d) =>
              `${d.incident_id || 'map'}_${d.reqTechs.join(
                ','
              )}_${d.reqPaths.join(',')}_${d.reqQty}`
          )
        );
        const isMixed = uniqueKeys.size > 1;

        let blockTitle = isMixed
          ? 'YÊU CẦU ĐIỀU PHỐI MẪU GẦN NHẤT'
          : 'YÊU CẦU ĐIỀU PHỐI MẪU';
        let badgeColor = sampleD.incidents?.event_name
          ? 'bg-primary'
          : 'bg-secondary';
        let techsText =
          sampleD.reqTechs.length > 0
            ? sampleD.reqTechs.map(esc).join(', ')
            : 'Không rõ';
        let pathsText =
          sampleD.reqPaths.length > 0
            ? sampleD.reqPaths.map(esc).join(', ')
            : 'Không yêu cầu';

        let suggestionHtml = '';
        let isAlreadyDispatched = enrichedData.some((d) =>
          ['dispatched', 'completed'].includes(d.displayStatus)
        );

        // 👉 Vá Lỗi 3: Nếu đã có đơn vị nhận full 100% thì KHÔNG cần chạy thuật toán ghép đôi thừa thãi
        let hasFullAccepted = enrichedData.some(
          (d) => d.displayStatus === 'accepted_full'
        );

        if (!isMixed && !isAlreadyDispatched && !hasFullAccepted) {
          // 👉 Vá Lỗi 4: Giới hạn tối đa 10 candidates để bảo vệ hiệu năng O(n³) tránh khựng UI
          // Điểm 1: chỉ ghép PXN nhận 1 phần (đã chặn hasFullAccepted phía trên).
          // Trần 12 ứng viên, ưu tiên PXN nhận nhiều mẫu → bảo vệ hiệu năng O(n³).
          let candidates = enrichedData
            .filter((d) => d.displayStatus === 'accepted_partial')
            .sort((a, b) => (b.accQty || 0) - (a.accQty || 0))
            .slice(0, 12);

          const reqTechsN = sampleD.reqTechs.map(normalizeStr);
          const reqPathsN = sampleD.reqPaths.map(normalizeStr);

          // Kiểm 1 tổ hợp có phủ 100% đề bài không + trả tổng mẫu (để tính dư)
          const coverInfo = (combo) => {
            let sumQty = 0;
            const techs = new Set();
            const paths = new Set();
            combo.forEach((c) => {
              sumQty += c.accQty || 0;
              (c.accTechs || []).forEach((t) => techs.add(normalizeStr(t)));
              (c.accPaths || []).forEach((p) => paths.add(normalizeStr(p)));
            });
            const valid =
              sumQty >= sampleD.reqQty &&
              reqTechsN.every((t) => techs.has(t)) &&
              reqPathsN.every((p) => paths.has(p));
            return { valid, sumQty };
          };

          // Điểm 2: BEST combo thật — chấm điểm mọi tổ hợp cỡ 2 & 3.
          // Ưu tiên ÍT PXN nhất → trong cùng số PXN thì DƯ mẫu ít nhất.
          let best = null;
          const consider = (combo) => {
            const info = coverInfo(combo);
            if (!info.valid) return;
            const overshoot = info.sumQty - sampleD.reqQty;
            const score = combo.length * 100000 + overshoot; // ít PXN quan trọng hơn
            if (!best || score < best.score) best = { combo, score, overshoot };
          };
          const nCand = candidates.length;
          for (let i = 0; i < nCand; i++) {
            for (let j = i + 1; j < nCand; j++) {
              consider([candidates[i], candidates[j]]);
              for (let k = j + 1; k < nCand; k++) {
                consider([candidates[i], candidates[j], candidates[k]]);
              }
            }
          }

          if (best) {
            const comboNames = best.combo
              .map(
                (c) =>
                  `<b class="text-dark">${esc(
                    c.laboratories?.name || 'PXN'
                  )}</b>`
              )
              .join(' <span class="text-muted">+</span> ');
            const overNote =
              best.overshoot > 0
                ? ` <span class="text-muted">(dư ${best.overshoot} mẫu)</span>`
                : '';
            suggestionHtml = `
                <div class="mt-3 p-2 rounded" style="background-color: #fef9c3; border: 1px dashed #eab308; font-size: 13px; color: #854d0e; animation: slideDown 0.5s ease;">
                  <i class='bx bx-bulb text-warning fs-5 align-middle me-1'></i>
                  <b>AP Assitant:</b> Chọn đồng thời ${comboNames} để bù trừ chuyên môn cho nhau và đáp ứng 100% Yêu cầu điều phối mẫu${overNote}.
                </div>
              `;
          } else if (candidates.length > 0) {
            // Điểm 3: có PXN nhận 1 phần nhưng ghép tối đa 3 PXN vẫn CHƯA đủ → cảnh báo mềm
            suggestionHtml = `
                <div class="mt-3 p-2 rounded" style="background-color: #fee2e2; border: 1px dashed #ef4444; font-size: 13px; color: #991b1b;">
                  <i class='bx bx-error-circle fs-5 align-middle me-1'></i>
                  <b>Chưa đủ năng lực:</b> Các phản hồi hiện tại (kể cả khi ghép nhiều PXN) vẫn chưa đáp ứng đủ Yêu cầu điều phối mẫu. Cân nhắc gửi khảo sát thêm đơn vị khác.
                </div>
              `;
          }
        }

        reqBlockHtml = `
          <div class="alert border-0 shadow-sm mb-3" style="background-color: #f0fdf4; position: relative; overflow: hidden; padding: 12px 16px;">
             <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background-color: #16a34a;"></div>
             <div class="d-flex align-items-center gap-3">
               <div style="font-size: 32px; color: #16a34a;"><i class='bx bx-bullseye'></i></div>
               <div class="flex-grow-1">
                 <div class="d-flex justify-content-between align-items-center mb-2">
                   <div class="fw-bold text-dark" style="font-size: 14px; text-transform: uppercase;">
                     ${blockTitle} 
                     <span class="badge ${badgeColor} ms-2 fw-normal" style="text-transform: none;">${esc(
          eventName
        )}</span>
                   </div>
                   ${
                     isMixed
                       ? `<span class="badge bg-warning text-dark shadow-sm" style="font-size:11px; font-weight:600;"><i class='bx bx-error-circle'></i> Ngày này có nhiều Yêu cầu điều phối mẫu khác nhau</span>`
                       : ''
                   }
                 </div>
                 <div class="row g-2 text-muted" style="font-size: 13px;">
                   <div class="col-md-5"><b>Kỹ thuật xét nghiệm:</b> <span class="text-success fw-bold">${techsText}</span></div>
                   <div class="col-md-5"><b>Tác nhân gây bệnh:</b> <span class="text-success fw-bold">${pathsText}</span></div>
                   <div class="col-md-2"><b>Số lượng:</b> <span class="text-success fw-bold">${
                     sampleD.reqQty
                   }</span> mẫu</div>
                 </div>
               </div>
             </div>
             ${suggestionHtml}
          </div>
        `;
      }

      // ===================================================================
      // 5. RENDER CÁC DÒNG BẢNG
      // ===================================================================
      const rows = enrichedData
        .map((d) => {
          const displayStatus = d.displayStatus;
          const hasResponded = [
            'accepted_full',
            'accepted_partial',
            'dispatched',
            'completed',
          ].includes(displayStatus);

          let displayTechsHtml = '';
          if (hasResponded) {
            let techList =
              d.accTechs.length > 0
                ? d.accTechs.map(esc).join('<br>')
                : '<span class="text-muted">Không nhận kỹ thuật nào</span>';
            let ratioColor =
              d.accTechs.length >= d.reqTechs.length
                ? 'text-success'
                : 'text-danger';
            displayTechsHtml = `
            <div style="line-height:1.4;">${techList}</div>
            <div class="mt-1 ${ratioColor}" style="font-size:11px; font-weight:600;"><i class='bx bx-filter-alt'></i> Nhận: ${d.accTechs.length} / ${d.reqTechs.length}</div>
          `;
          } else {
            let techList =
              d.reqTechs.length > 0
                ? d.reqTechs.map(esc).join('<br>')
                : '<span class="text-muted">Không rõ</span>';
            displayTechsHtml = `
            <div style="line-height:1.4;">${techList}</div>
            <div class="mt-1 text-muted" style="font-size:11px;"><i class='bx bx-target-lock'></i> Yêu cầu: ${d.reqTechs.length} loại</div>
          `;
          }

          let displayPathsHtml = '';
          if (hasResponded) {
            let reqLen = d.reqPaths.length || 0;
            if (reqLen > 0) {
              let pathList =
                d.accPaths.length > 0
                  ? d.accPaths.map(esc).join('<br>')
                  : '<span class="text-muted">Không nhận tác nhân nào</span>';
              let ratioColor =
                d.accPaths.length >= reqLen ? 'text-success' : 'text-danger';
              displayPathsHtml = `
              <div style="line-height:1.4;">${pathList}</div>
              <div class="mt-1 ${ratioColor}" style="font-size:11px; font-weight:600;"><i class='bx bx-bug'></i> Nhận: ${d.accPaths.length} / ${reqLen}</div>
            `;
            } else
              displayPathsHtml = `<span class="text-muted">Không yêu cầu</span>`;
          } else {
            let reqLen = d.reqPaths.length || 0;
            if (reqLen > 0) {
              let pathList = d.reqPaths.map(esc).join('<br>');
              displayPathsHtml = `
              <div style="line-height:1.4;">${pathList}</div>
              <div class="mt-1 text-muted" style="font-size:11px;"><i class='bx bx-target-lock'></i> Yêu cầu: ${reqLen} loại</div>
            `;
            } else
              displayPathsHtml = `<span class="text-muted">Không yêu cầu</span>`;
          }

          let sampleInfo = '';
          if (
            ['inquiry_sent', 'suggested', 'rejected'].includes(displayStatus)
          ) {
            sampleInfo = `<div class="text-muted">Yêu cầu: <b>${d.reqQty}</b></div>`;
          } else if (
            ['accepted_full', 'accepted_partial'].includes(displayStatus)
          ) {
            let ratioColor =
              d.accQty >= d.reqQty ? 'text-success' : 'text-danger';
            sampleInfo = `<div class="${ratioColor} fw-bold" style="font-size:14px;">Nhận: ${d.accQty} / ${d.reqQty}</div>`;
          } else {
            sampleInfo = `<div class="text-primary fw-bold" style="font-size:14px;">Đã chốt: ${d.sample_count}</div>`;
          }

          let statusBadge = '';
          if (displayStatus === 'suggested')
            statusBadge = `<span class="badge bg-warning text-dark"><i class='bx bx-time'></i> Đề xuất chờ duyệt</span>`;
          else if (displayStatus === 'inquiry_sent')
            statusBadge = `<span class="badge bg-info text-dark"><i class='bx bx-mail-send'></i> Chờ phản hồi</span>`;
          else if (displayStatus === 'accepted_full')
            statusBadge = `<span class="badge bg-success"><i class='bx bx-check-double'></i> Nhận toàn bộ</span>`;
          else if (displayStatus === 'accepted_partial') {
            statusBadge = `<span class="badge bg-warning text-dark"><i class='bx bx-adjust'></i> Nhận một phần</span>
                         <div class="text-danger mt-1 fw-bold" style="font-size:10px;">(${d.specificWarning.join(
                           ' & '
                         )})</div>`;
          } else if (displayStatus === 'rejected')
            statusBadge = `<span class="badge bg-danger"><i class='bx bx-block'></i> Không nhận/Quá tải</span>`;
          else if (displayStatus === 'dispatched')
            statusBadge = `<span class="badge bg-primary"><i class='bx bx-rocket'></i> Đã chốt lệnh</span>`;
          else if (displayStatus === 'completed')
            statusBadge = `<span class="badge bg-success"><i class='bx bx-check'></i> Hoàn thành</span>`;
          else if (displayStatus === 'cancelled')
            statusBadge = `<span class="badge bg-secondary"><i class='bx bx-x'></i> Đã hủy</span>`;

          let actionBtns = '';
          if (role.isAdmin) {
            if (['accepted_full', 'accepted_partial'].includes(displayStatus)) {
              let pObj = {
                source: 'dashboard',
                labId: d.lab_id,
                labName: d.laboratories?.name,
                km: '?',
                minutes: '?',
                headName: d.laboratories?.head_name,
                headPhone: d.laboratories?.head_phone,
                headEmail: d.laboratories?.head_email,
                testTypeId: d.test_type_id,
                sampleCount: d.accQty,
                incidentId: d.incident_id,
                logId: d.id,
              };
              const finalPayload = JSON.stringify(pObj).replace(/'/g, '&#39;');
              
              // ĐÃ SỬA: Chống rớt dòng và ép nhỏ ô input lại
              actionBtns += `
                <div class="input-group input-group-sm mb-1 shadow-sm" style="flex-wrap: nowrap;">
                  <input type="number" id="chot-qty-${d.id}" class="form-control text-center fw-bold text-primary px-1" 
                         value="${d.accQty}" min="1" max="${d.accQty}" title="SL thực tế" style="max-width: 55px;">
                  <button class="btn btn-success px-2" style="white-space: nowrap;" 
                          onclick='window.submitCustomDispatch(${finalPayload}, "chot-qty-${d.id}")' title="Chốt điều phối">
                    <i class='bx bx-check'></i> Chốt
                  </button>
                </div>`;
            }

            let cxLabel = '', cxIcon = 'bx-x-circle', cxCls = 'btn-outline-danger';
            if (displayStatus === 'dispatched') {
              cxLabel = 'Thu hồi';
              cxIcon = 'bx-undo';
              cxCls = 'btn-outline-danger';
            } else if (
              ['accepted_full', 'accepted_partial', 'inquiry_sent'].includes(
                displayStatus
              )
            ) {
              cxLabel = 'Bỏ qua';
              cxIcon = 'bx-x-circle';
              cxCls = 'btn-outline-secondary';
            } else if (displayStatus === 'suggested') {
              cxLabel = 'Bỏ qua';
              cxIcon = 'bx-x';
              cxCls = 'btn-outline-danger';
            }
            if (cxLabel) {
              actionBtns += `<button class="btn btn-sm ${cxCls} w-100" onclick="window.cancelDispatch('${d.id}')">
                            <i class='bx ${cxIcon}'></i> ${cxLabel}
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
        <td><small class="text-primary fw-bold">${displayTechsHtml}</small></td>
        <td><small class="text-secondary fw-bold">${displayPathsHtml}</small></td>
        <td class="text-center">${sampleInfo}</td>
        <td class="text-center">${statusBadge}</td>
        <!-- ĐÃ SỬA: Tăng width lên 140px -->
        <td class="text-center" style="width: 140px; min-width: 140px;">${actionBtns}</td>
      </tr>`;
        })
        .join('');

      const colspan = showIncidentCol ? 7 : 6;
      const headIncident = showIncidentCol ? '<th>Sự kiện</th>' : '';

      const scopeToggle = st.scopeIncidentId
        ? `<button class="btn btn-sm btn-outline-primary" onclick="window._histSetScope(null)">
             <i class='bx bx-list-ul'></i> Xem tất cả sự kiện
           </button>`
        : `<span class="badge bg-secondary">Đang xem: tất cả sự kiện</span>`;

      // ===================================================================
      // 6. RENDER GIAO DIỆN CHÍNH MODAL
      // ===================================================================
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
                
              <!-- HEADER CHỌN NGÀY & NÚT XUẤT EXCEL -->
              <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
                <div class="d-flex align-items-center gap-2">
                  <label class="mb-0 fw-bold"><i class='bx bx-calendar'></i> Theo dõi ngày:</label>
                  <input type="date" id="hist-date" class="form-control" style="width:auto; font-weight: bold;"
                         value="${
                           st.date
                         }" onchange="window._histSetDate(this.value)">
                </div>
                
                <div class="d-flex gap-2">
                  <button class="btn btn-sm btn-success shadow-sm" onclick="window.exportDispatchHistoryToExcel()">
                    <i class='bx bx-export'></i> Xuất file (*.CSV)
                  </button>
                  ${scopeToggle}
                </div>
              </div>

                ${reqBlockHtml}

                <div class="row row-cols-1 row-cols-md-5 g-2 mb-3">
                  <div class="col">
                    <div class="card bg-info text-white h-100 border-0 shadow-sm">
                      <div class="card-body p-2 text-center">
                        <h6 class="mb-1" style="font-size: 11.5px;"><i class='bx bx-mail-send'></i> Đang chờ phản hồi</h6>
                        <h4 class="mb-0 fw-bold">${
                          stats.waitingLabs
                        } <small style="font-size:11px; font-weight:normal;">PXN</small></h4>
                      </div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="card bg-success text-white h-100 border-0 shadow-sm">
                      <div class="card-body p-2 text-center">
                        <h6 class="mb-1" style="font-size: 11.5px;"><i class='bx bx-check-double'></i> Nhận toàn bộ</h6>
                        <h4 class="mb-0 fw-bold">${
                          stats.fullAccLabs
                        } <small style="font-size:11px; font-weight:normal;">PXN</small></h4>
                      </div>
                    </div>
                  </div>
                  <div class="col">
                  <div class="card bg-warning text-dark h-100 border-0 shadow-sm">
                    <div class="card-body p-2 text-center">
                      <h6 class="mb-1" style="font-size: 11.5px;"><i class='bx bx-adjust'></i> Nhận một phần</h6>
                      <h4 class="mb-0 fw-bold">${
                        stats.partialLabs.total
                      } <small style="font-size:11px; font-weight:normal;">PXN</small></h4>
                      <div style="font-size:10px; margin-top: 3px; opacity: 0.85; font-weight: 600; line-height: 1.5;">
                         Thiếu mẫu: ${stats.partialLabs.qtyShort}<br>
                         Thiếu Kỹ thuật: ${
                           stats.partialLabs.techShort
                         } | Thiếu Tác nhân: ${stats.partialLabs.pathShort}
                      </div>
                    </div>
                  </div>
                </div>
                  <div class="col">
                    <div class="card bg-danger text-white h-100 border-0 shadow-sm">
                      <div class="card-body p-2 text-center">
                        <h6 class="mb-1" style="font-size: 11.5px;"><i class='bx bx-block'></i> Không nhận/Quá tải</h6>
                        <h4 class="mb-0 fw-bold">${
                          stats.rejectedLabs
                        } <small style="font-size:11px; font-weight:normal;">PXN</small></h4>
                      </div>
                    </div>
                  </div>
                  <div class="col">
                    <div class="card bg-primary text-white h-100 border-0 shadow-sm">
                      <div class="card-body p-2 text-center">
                        <h6 class="mb-1" style="font-size: 11.5px;"><i class='bx bx-rocket'></i> ĐÃ CHỐT ĐIỀU PHỐI</h6>
                        <h4 class="mb-0 fw-bold">${
                          stats.dispatchedSamples
                        } <small style="font-size:11px; font-weight:normal;">mẫu</small></h4>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="card border-0 shadow-sm">
                  <div class="card-body p-0 table-responsive">
                    <table class="table table-hover align-middle mb-0">
                      <thead class="table-light"><tr>
                        ${headIncident}
                        <th>Phòng Xét nghiệm</th>
                        <th>Kỹ thuật xét nghiệm</th>
                        <th>Tác nhân gây bệnh</th>
                        <th class="text-center">Số lượng</th>
                        <th class="text-center">Trạng thái (Realtime)</th>
                        <!-- ĐÃ SỬA: Tăng width lên 140px -->
                        <th class="text-center" style="width: 140px; min-width: 140px;">Thao tác</th>
                      </tr></thead>
                      <tbody>${
                        rows ||
                        `<tr><td colspan="${colspan}" class="text-center text-muted py-4">Không có hoạt động điều phối nào ${
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
  // ===================================================================
  // HÀM XUẤT BÁO CÁO ĐIỀU PHỐI RA FILE EXCEL (CSV)
  // ===================================================================
  window.exportDispatchHistoryToExcel = function () {
    const data = window._currentHistExportData; // Lấy dữ liệu đã được xử lý từ hàm render
    if (!data || data.length === 0) {
      if (window.showToast)
        window.showToast('Không có dữ liệu để xuất', 'warning');
      return;
    }

    // 1. Khởi tạo nội dung CSV với BOM (\uFEFF) để Excel nhận diện đúng Tiếng Việt có dấu
    let csvContent = '\uFEFF';

    // 2. Tạo dòng tiêu đề (Headers)
    csvContent +=
      'Sự kiện,Phòng Xét nghiệm,Kỹ thuật yêu cầu,Kỹ thuật nhận,Tác nhân yêu cầu,Tác nhân nhận,Số lượng yêu cầu,Số lượng nhận,Số lượng chốt,Trạng thái\n';

    // 3. Quét dữ liệu và định dạng từng dòng
    data.forEach((d) => {
      const eventName = `"${d.incidents?.event_name || 'Điều phối độc lập'}"`;
      const labName = `"${d.laboratories?.name || ''}"`;
      const reqTechs = `"${d.reqTechs.join(', ')}"`;
      const accTechs = `"${d.accTechs.join(', ')}"`;
      const reqPaths = `"${d.reqPaths.join(', ')}"`;
      const accPaths = `"${d.accPaths.join(', ')}"`;
      const reqQty = d.reqQty || 0;
      const accQty = d.accQty || 0;
      const dispatchedQty = d.sample_count || 0;

      // Chuyển mã trạng thái sang Tiếng Việt dễ đọc
      const statusMap = {
        suggested: 'Đề xuất chờ duyệt',
        inquiry_sent: 'Đang chờ phản hồi',
        accepted_full: 'Đồng ý 100%',
        accepted_partial: 'Nhận 1 phần / Lệch',
        rejected: 'Từ chối / Quá tải',
        dispatched: 'Đã chốt lệnh',
        completed: 'Hoàn thành',
        cancelled: 'Đã hủy',
      };
      let statusText = `"${statusMap[d.displayStatus] || d.displayStatus}"`;

      // Nối các cột lại bằng dấu phẩy
      csvContent +=
        [
          eventName,
          labName,
          reqTechs,
          accTechs,
          reqPaths,
          accPaths,
          reqQty,
          accQty,
          dispatchedQty,
          statusText,
        ].join(',') + '\n';
    });

    // 4. Kích hoạt trình duyệt tải file xuống
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `Bao_Cao_Dieu_Phoi_${window._histState.date}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  // --------------------------------------------------------------------------
  // HỦY LỆNH điều phối mẫu (→ cancelled, trả lại công suất)
  // --------------------------------------------------------------------------
  window.cancelDispatch = async function (logId) {
    // Đọc trạng thái hiện tại để quyết định nhãn xác nhận + email phù hợp
    const { data: before } = await window.supabaseClient
      .from('lab_dispatch_log')
      .select('status')
      .eq('id', logId)
      .single();
    const status = before?.status;
    const wasDispatched = status === 'dispatched';
    const isResponded = [
      'accepted',
      'partially_accepted',
      'inquiry_sent',
    ].includes(status);

    // Nhãn hộp xác nhận theo ngữ cảnh
    let confTitle, confMsg, confBtn;
    if (wasDispatched) {
      confTitle = 'Thu hồi lệnh điều phối';
      confMsg =
        'Thu hồi lệnh đã chốt? Công suất sẽ được trả lại cho PXN. Đơn vị sẽ nhận email báo lệnh đã hủy.';
      confBtn = 'Thu hồi lệnh';
    } else if (isResponded) {
      confTitle = 'Không chọn đơn vị này';
      confMsg =
        'Không điều phối tới đơn vị này? Đơn vị sẽ nhận email cảm ơn và biết HCDC đã gửi mẫu ở nơi khác.';
      confBtn = 'Không chọn đơn vị này';
    } else {
      confTitle = 'Bỏ đề xuất';
      confMsg =
        'Bỏ dòng đề xuất này? (Đơn vị chưa được liên hệ nên sẽ không nhận thông báo.)';
      confBtn = 'Bỏ đề xuất';
    }

    const ok = await window.showConfirm({
      title: confTitle,
      message: confMsg,
      confirmText: confBtn,
      cancelText: 'Giữ lại',
      variant: 'danger',
      icon: 'bx-x-circle',
    });
    if (!ok) return;

    try {
      const { error } = await window.supabaseClient
        .from('lab_dispatch_log')
        .update({ status: 'cancelled' })
        .eq('id', logId);
      if (error) throw error;

      if (window.showToast)
        window.showToast('Đã cập nhật trạng thái', 'success');

      // Gửi email/telegram theo ngữ cảnh (chạy ngầm)
      if (wasDispatched) {
        window.supabaseClient.functions
          .invoke('notify-lab-result', {
            body: {
              logId: logId,
              action: 'cancelled',
              message:
                'Lệnh điều phối mẫu trước đó đã được HCDC thu hồi. Đơn vị KHÔNG cần chuẩn bị tiếp nhận. Trân trọng cảm ơn sự phối hợp của đơn vị!',
            },
          })
          .catch((err) => console.warn('Lỗi gửi báo thu hồi:', err));
      } else if (isResponded) {
        window.supabaseClient.functions
          .invoke('notify-lab-result', {
            body: {
              logId: logId,
              action: 'not_selected',
              message:
                'HCDC cảm ơn phản hồi năng lực của đơn vị. Lần điều phối này HCDC đã gửi mẫu tới đơn vị khác. Rất mong tiếp tục nhận được sự phối hợp của đơn vị trong các đợt sau!',
            },
          })
          .catch((err) => console.warn('Lỗi gửi báo không chọn:', err));
      }
      // suggested → KHÔNG gửi email (đơn vị chưa được liên hệ)

      // Reload lịch sử GIỮ NGUYÊN phạm vi + ngày đang xem
      _renderDispatchHistory();
      if (typeof window._runDispatch === 'function') window._runDispatch();
    } catch (e) {
      if (window.showToast) window.showToast('Lỗi: ' + e.message, 'error');
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
      // 👉 BỔ SUNG: Lấy mảng tên các kỹ thuật đã chọn trên giao diện
      const techSelect = document.getElementById('disp-testtype');
      let techNames = [];
      if (techSelect) {
        techNames =
          window.$ && $(techSelect).hasClass('select2-hidden-accessible')
            ? $(techSelect)
                .select2('data')
                .map((d) => d.text.trim())
            : Array.from(techSelect.selectedOptions).map((o) => o.text.trim());
      }
      for (const lab of result.top) {
        const actionToken = crypto.randomUUID();
        const { data: insertedLog, error } = await window.supabaseClient
          .from('lab_dispatch_log')
          .insert([
            {
              lab_id: lab.lab_id,
              incident_id: S.incidentId || null,
              test_type_id:
                S.testTypeIds && S.testTypeIds.length > 0
                  ? S.testTypeIds[0]
                  : S.testTypeId || null,
              requested_test_types: techNames, // 👉 BỔ SUNG LƯU VÀO DB TẠI ĐÂY
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

      // Lấy mảng tên các kỹ thuật đã chọn trên giao diện
      const techSelect = document.getElementById('disp-testtype');
      let techNames = [];
      if (techSelect) {
        techNames =
          window.$ && $(techSelect).hasClass('select2-hidden-accessible')
            ? $(techSelect)
                .select2('data')
                .map((d) => d.text.trim())
            : Array.from(techSelect.selectedOptions).map((o) => o.text.trim());
      }

      // ĐÃ SỬA: KHÔNG DÙNG VÒNG LẶP FOR Ở ĐÂY NỮA, CHỈ GỬI CHO ĐÚNG LAB NÀY
      const actionToken = crypto.randomUUID();
      const { data: insertedLog, error } = await window.supabaseClient
        .from('lab_dispatch_log')
        .insert([
          {
            lab_id: lab.lab_id,
            incident_id: S.incidentId || null,
            test_type_id:
              S.testTypeIds && S.testTypeIds.length > 0
                ? S.testTypeIds[0]
                : S.testTypeId || null,
            requested_test_types: techNames, // 👉 LƯU MẢNG KỸ THUẬT VÀO DB
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

// 3. LẮNG NGHE REALTIME PHẢN HỒI (Đã vá lỗi mất nút)
let _realtimeChannel = null;
function _subscribeToLabResponses() {
  if (_realtimeChannel) return; // đã đăng ký

  _realtimeChannel = window.supabaseClient
    .channel('lab_responses_channel')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'lab_dispatch_log' },
      async (payload) => {
        const newData = payload.new;
        const labId = newData.lab_id;

        // A. Tìm card trên giao diện (hỗ trợ fallback nếu đổi cấu trúc ID)
        let cardEl = document.getElementById('lab-card-' + labId);
        let slotEl = document.getElementById('disp-action-' + labId);
        
        // Fallback: nếu không tìm thấy ID chính xác, thử tìm qua thuộc tính data-lab-id
        if (!slotEl) {
          slotEl = document.querySelector(`[data-disp-action="${labId}"]`);
        }
        if (!cardEl) {
          cardEl = document.querySelector(`[data-lab-card="${labId}"]`);
        }

        // Lấy thông tin phòng xét nghiệm (Ưu tiên window._currentDispatchResult, nếu không có thì query trực tiếp Supabase)
        let labData = window._currentDispatchResult?.top?.find(
          (l) => l.lab_id === labId
        );

        if (!labData) {
          const { data: labInfo } = await window.supabaseClient
            .from('laboratories')
            .select('id, name, head_name, head_phone, head_email')
            .eq('id', labId)
            .maybeSingle();
          
          if (labInfo) {
            labData = {
              lab_id: labInfo.id,
              lab_name: labInfo.name,
              head_name: labInfo.head_name,
              head_phone: labInfo.head_phone,
              head_email: labInfo.head_email
            };
          }
        }

        // Nếu tìm thấy slot hiển thị nút thao tác trên màn hình
        if (slotEl && labData) {
          const S = window._getDispatchState?.();
          const approvePayload = (qty) =>
            JSON.stringify({
              source: 'dashboard',
              logId: newData.id,
              labId: labData.lab_id,
              labName: labData.lab_name,
              testTypeId:
                newData.test_type_id ||
                labData.test_type_id ||
                (S && S.testTypeId),
              sampleCount: qty,
              incidentId: newData.incident_id || (S && S.incidentId) || null,
              headName: labData.head_name,
              headPhone: labData.head_phone,
              headEmail: labData.head_email,
              km: labData.route?.km || '?',
              minutes: labData.route?.minutes || '?',
            }).replace(/'/g, '&#39;');

          let displayStatus = newData.status;
          if (
            displayStatus === 'partially_accepted' &&
            (newData.accepted_sample_count || 0) >= (newData.requested_sample_count || 0)
          ) {
            displayStatus = 'accepted';
          }

          if (displayStatus === 'accepted') {
            if (window.showToast)
              window.showToast(
                `🔔 ${labData.lab_name} đã đồng ý nhận đủ mẫu!`,
                'success'
              );
            if (cardEl) cardEl.style.backgroundColor = '#f0fdf4';
            slotEl.innerHTML = `<button class="btn btn-success btn-sm w-100 shadow-sm" onclick='window.confirmDispatch(${approvePayload(
              newData.accepted_sample_count
            )})'>
                                  <i class='bx bx-rocket'></i> Phê duyệt điều phối (Đủ mẫu)
                                </button>`;
          } else if (displayStatus === 'partially_accepted') {
            if (window.showToast)
              window.showToast(
                `🔔 ${labData.lab_name} chỉ nhận ${newData.accepted_sample_count} mẫu.`,
                'warning'
              );
            if (cardEl) cardEl.style.backgroundColor = '#fffbeb';
            const short =
              (newData.requested_sample_count || 0) -
              (newData.accepted_sample_count || 0);
            slotEl.innerHTML = `<button class="btn btn-warning btn-sm w-100 shadow-sm" onclick='window.confirmDispatch(${approvePayload(
              newData.accepted_sample_count
            )})'>
                                  <i class='bx bx-rocket'></i> Phê duyệt điều phối (${newData.accepted_sample_count} mẫu)
                                </button>
                                <div class="text-danger mt-1" style="font-size:11px;">⚠️ Thiếu ${short} mẫu</div>`;
          } else if (displayStatus === 'rejected') {
            if (window.showToast)
              window.showToast(
                `🔔 ${labData.lab_name} đã từ chối nhận mẫu.`,
                'error'
              );
            if (cardEl) {
              cardEl.style.opacity = '0.6';
              cardEl.style.backgroundColor = '#fef2f2';
            }
            slotEl.innerHTML = `<span class="badge bg-danger w-100 py-2"><i class='bx bx-block'></i> TỪ CHỐI / QUÁ TẢI</span>`;
          }
        }

        // B. Tự làm mới bảng mini-dashboard nếu modal lịch sử đang mở
        const histModal = document.getElementById('dispatchHistModal');
        if (
          histModal &&
          histModal.classList.contains('show') &&
          typeof _renderDispatchHistory === 'function'
        ) {
          setTimeout(() => _renderDispatchHistory(), 300);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED')
        console.log('[Realtime] Đã kết nối kênh theo dõi phản hồi PXN.');
    });
}
window._subscribeToLabResponses = _subscribeToLabResponses;

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
