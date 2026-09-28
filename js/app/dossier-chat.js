// ============================================================
// DOSSIER CHAT & AAR — Tin nhắn, file đính kèm, nhật ký sự kiện, AAR
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // ====================================================================
  // LOGIC XỬ LÝ CHAT & BÁO CÁO (EVENT DOSSIER)
  // (Dán đoạn này vào cuối file script-js-RRT.txt)
  // ====================================================================

  // 1. Helper an toàn để escape HTML
  window.escapeHtml = function (text) {
    if (!text) return text;
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // 2. Hàm gửi tin nhắn hoặc báo cáo
  window.sendDossierMessage = async function (type) {
    const input = document.getElementById('inp-chat');
    if (!input) return;

    const content = input.value.trim();
    if (!content) return;

    const incidentId = window.currentDossierId;
    if (!incidentId) {
      showToast('Lỗi: Không xác định được ID sự kiện.', 'error');
      return;
    }

    const chatBox = document.getElementById('dossier-chat-box');

    // 1. RENDER GIAO DIỆN NGAY (Optimistic UI)
    let htmlContent = '';
    if (type === 'Report') {
      htmlContent = `
        <div class="report-bubble">
          <div class="report-header">
            <span><i class="bx bxs-report"></i> BÁO CÁO NHANH</span>
            <span>Vừa xong</span>
          </div>
          <div class="report-body">${window.escapeHtml(content)}</div>
        </div>`;
    } else {
      htmlContent = `<div class="msg-bubble" style="background:#006a75; color:white;">${window.escapeHtml(
        content
      )}</div>`;
    }

    chatBox.insertAdjacentHTML(
      'beforeend',
      `
      <div class="msg right">
        <div class="msg-sender">Tôi</div>
        ${htmlContent}
      </div>`
    );
    chatBox.scrollTop = chatBox.scrollHeight;
    input.value = '';
    input.focus();

    // 2. GỬI DỮ LIỆU VỀ SUPABASE - FIX FIELD NAMES
    try {
      // ✅ Validate incidentId trước khi insert
      if (!incidentId) {
        throw new Error('Không tìm thấy ID sự kiện');
      }

      // ✅ Validate content
      if (!content || content.trim() === '') {
        throw new Error('Nội dung tin nhắn không được để trống');
      }

      // ✅ Lấy user_id an toàn
      const currentUserId =
        window.getCurrentUserId?.() || window.userSession?.id || null;

      const { error } = await supabaseClient.from('incident_logs').insert([
        {
          incident_id: incidentId,
          content: content.trim(), // ✅ Trim để tránh khoảng trắng thừa
          log_type: type, // ✅ Đúng tên cột theo schema
          user_id: currentUserId, // ✅ UUID hoặc null (cột này cho phép NULL)
          attachment_url: null, // ✅ Có thể bỏ dòng này vì default là null
          // created_at: bỏ dòng này → DB tự sinh default timezone('utc'::text, now())
        },
      ]);

      if (error) {
        console.error('❌ Supabase error:', error);
        throw new Error(error.message || 'Lỗi khi lưu tin nhắn');
      }

      // ✅ Optional: Reload chat để hiển thị tin mới ngay
      if (typeof window.loadEventLogs === 'function' && incidentId) {
        await window.loadEventLogs(incidentId);
      }
    } catch (err) {
      console.error('Lỗi gửi tin nhắn:', err);
      showToast('Lỗi gửi tin: ' + err.message, 'error');
    }
  };

  // ============================================================
  // LOGIC CHAT FILE & AUTO AAR
  // ============================================================

  window.handleChatFileUpload = async function (input) {
    if (input.files.length === 0) return;
    const file = input.files[0];
    const chatBox = document.getElementById('dossier-chat-box');
    const tempId = 'upload-' + Date.now();

    // 1. Hiện loading ảo
    chatBox.insertAdjacentHTML(
      'beforeend',
      `
      <div class="msg right" id="${tempId}">
        <div class="msg-bubble text-muted">
          <i class="bx bx-loader-alt bx-spin"></i> Đang tải lên ${window.escapeHtml(
            file.name
          )}...
        </div>
      </div>`
    );
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
      // 2. Upload file lên bucket 'chat-files'
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}.${fileExt}`;
      const filePath = `chat/${fileName}`;

      const { error: uploadError } = await supabaseClient.storage
        .from('chat-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 3. Lấy Public URL
      const { data: publicUrlData } = supabaseClient.storage
        .from('chat-files')
        .getPublicUrl(filePath);
      const fileUrl = publicUrlData.publicUrl;

      // 4. Tạo nội dung hiển thị
      let displayContent = '';
      if (file.type.startsWith('image/')) {
        displayContent = `<a href="${fileUrl}" target="_blank"><img src="${fileUrl}" style="max-width: 200px; border-radius: 8px;"></a>`;
      } else {
        displayContent = `<a href="${fileUrl}" target="_blank" class="text-decoration-none text-primary">
          <i class="bx bxs-file"></i> ${window.escapeHtml(file.name)}
        </a>`;
      }

      // 5. Lưu vào Database - FIX FIELD NAMES
      // Trong handleChatFileUpload
      const { error: dbError } = await supabaseClient
        .from('incident_logs')
        .insert([
          {
            incident_id: window.currentDossierId,
            content: `[Đính kèm] ${file.name}`,
            log_type: 'Message', // ✅ Sửa type → log_type
            user_id: window.userSession?.id || null, // ✅ Sửa user → user_id
            attachment_url: fileUrl, // ✅ URL file
            created_at: new Date().toISOString(),
          },
        ]);

      if (dbError) throw dbError;

      // 6. Xóa loading, reload chat
      document.getElementById(tempId)?.remove();
      if (typeof window.loadEventLogs === 'function') {
        await window.loadEventLogs(window.currentDossierId);
      }
    } catch (err) {
      console.error('Upload thất bại:', err);
      showToast('Upload thất bại: ' + err.message, 'error');
      document.getElementById(tempId)?.remove();
    } finally {
      input.value = '';
    }
  };
  // ========================================================================
  // HELPER: Icon cho từng loại file
  // ========================================================================
  function getFileIcon(ext) {
    const icons = {
      pdf: 'bxs-file-pdf',
      doc: 'bxs-file-doc',
      docx: 'bxs-file-doc',
      xls: 'bxs-file-spreadsheet',
      xlsx: 'bxs-file-spreadsheet',
      ppt: 'bxs-file-presentation',
      pptx: 'bxs-file-presentation',
      txt: 'bxs-file-txt',
      zip: 'bxs-file-archive',
      rar: 'bxs-file-archive',
      '7z': 'bxs-file-archive',
      mp3: 'bxs-file-audio',
      wav: 'bxs-file-audio',
      mp4: 'bxs-file-video',
      avi: 'bxs-file-video',
      mkv: 'bxs-file-video',
    };
    return icons[ext?.toLowerCase()] || 'bxs-file';
  }

  // ========================================================================
  // HELPER: Mở modal xem ảnh full-size
  // ========================================================================
  function openImageModal(url) {
    let modal = document.getElementById('image-modal');

    // Tạo modal nếu chưa có
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'image-modal';
      modal.style.cssText = `
      display: none;
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.9);
      z-index: 9999;
      justify-content: center;
      align-items: center;
      cursor: zoom-out;
    `;
      modal.innerHTML = `
      <img id="image-modal-img" src="" style="max-width: 90%; max-height: 90%; object-fit: contain; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
      <button onclick="document.getElementById('image-modal').style.display='none'" 
              style="position: absolute; top: 20px; right: 40px; background: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 24px; line-height: 1; color: #333;">×</button>
    `;
      modal.onclick = function (e) {
        if (e.target === modal) modal.style.display = 'none';
      };
      document.body.appendChild(modal);
    }

    document.getElementById('image-modal-img').src = url;
    modal.style.display = 'flex';
  }

  // ========================================================================
  // MAIN: LOAD EVENT LOGS - FULL VERSION
  // ========================================================================
  window.loadEventLogs = async function (incidentId, isSilentUpdate = false) {
    const chatBox = document.getElementById('dossier-chat-box');
    if (!chatBox) return;

    try {
      // 1. Fetch logs từ Supabase
      const { data: logs, error } = await supabaseClient
        .from('incident_logs')
        .select('*')
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      window.currentIncidentLogs = logs;

      // 2. Render UI
      if (!isSilentUpdate) {
        chatBox.innerHTML = '';
      }

      logs.forEach((log) => {
        // ✅ Xác định người gửi (dùng UUID)
        const isMe = log.user_id === window.userSession?.id;
        const side = isMe ? 'right' : 'left';
        const displayName = isMe
          ? 'Tôi'
          : log.user_email || log.user || 'Thành viên';

        let htmlContent = '';
        const reportTypes = [
          'Report',
          'DAILY',
          'EMERGENCY',
          'COMPLETION',
          'CRITICAL_REPORT',
        ];

        // ==========================================
        // CASE 1: BÁO CÁO (Report types)
        // ==========================================
        if (reportTypes.includes(log.log_type)) {
          let displayTitle = 'BÁO CÁO';
          let iconClass = 'bxs-report';

          if (log.log_type === 'EMERGENCY') {
            displayTitle = 'BÁO CÁO KHẨN CẤP';
            iconClass = 'bxs-error-alt';
          } else if (log.log_type === 'DAILY') {
            displayTitle = 'BÁO CÁO NGÀY';
            iconClass = 'bxs-calendar';
          } else if (log.log_type === 'COMPLETION') {
            displayTitle = 'BÁO CÁO HOÀN THÀNH';
            iconClass = 'bxs-check-shield';
          } else if (log.log_type === 'CRITICAL_REPORT') {
            displayTitle = 'BÁO CÁO QUAN TRỌNG';
            iconClass = 'bxs-flag-alt';
          }

          // Hiển thị file đính kèm nếu có
          const attachmentHtml = log.attachment_url
            ? `<div style="margin-top:8px; padding-top:8px; border-top: 1px dashed rgba(255,255,255,0.3);">
              <a href="${log.attachment_url}" target="_blank" style="font-size:12px; color:#fff; text-decoration:none; display: inline-flex; align-items: center; gap: 5px;">
                <i class="bx bxs-paperclip"></i> Xem file đính kèm
              </a>
            </div>`
            : '';

          htmlContent = `
          <div class="report-bubble" style="background: linear-gradient(135deg, rgba(242, 101, 34, 0.5) 0%, rgba(0, 106, 117, 0.5) 100%); color: white; border-radius: 12px; padding: 12px 16px; max-width: 90%;">
            <div class="report-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 11px; opacity: 0.9;">
              <span><i class="bx ${iconClass}"></i> ${displayTitle}</span>
              <span>${new Date(log.created_at).toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              })}</span>
            </div>
            <div class="report-body" style="font-size: 13px; line-height: 1.4; white-space: pre-wrap;">${window.escapeHtml(
              log.content
            )}</div>
            ${attachmentHtml}
          </div>`;
        }
        // ==========================================
        // CASE 2: SOS (Render HTML trực tiếp)
        // ==========================================
        else if (log.log_type === 'SOS') {
          // SOS content đã là HTML an toàn từ server → render trực tiếp
          htmlContent = log.content;
        }
        // ==========================================
        // CASE 3: TIN NHẮN THƯỜNG + FILE ĐÍNH KÈM
        // ==========================================
        else {
          const bubbleStyle =
            side === 'left'
              ? 'background:#f0f2f5; color:#333;'
              : 'background:#006a75; color:white;';

          // ✅ KIỂM TRA FILE ĐÍNH KÈM
          if (log.attachment_url) {
            const fileExt =
              log.attachment_url.split('.').pop()?.toLowerCase() || '';
            const isImage = [
              'jpg',
              'jpeg',
              'png',
              'gif',
              'webp',
              'svg',
            ].includes(fileExt);
            const fileName =
              log.content?.replace('[Đính kèm] ', '') || `file.${fileExt}`;

            if (isImage) {
              // 🖼️ ẢNH: Click để xem full-size
              htmlContent = `
              <div class="msg-bubble" style="${bubbleStyle} border-radius: 12px; padding: 8px;">
                <a href="${
                  log.attachment_url
                }" target="_blank" onclick="openImageModal('${
                log.attachment_url
              }'); return false;">
                  <img src="${log.attachment_url}" 
                       style="max-width: 250px; border-radius: 8px; cursor: zoom-in; display: block;"
                       onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                  <div style="display:none; padding: 20px; background: rgba(0,0,0,0.1); border-radius: 8px; text-align: center; align-items: center; justify-content: center; gap: 8px;">
                    <i class="bx bx-image-alt" style="font-size: 32px; opacity: 0.5;"></i>
                    <span style="font-size: 12px;">Không tải được ảnh</span>
                  </div>
                </a>
                ${
                  log.content && !log.content.includes('[Đính kèm]')
                    ? `<div style="margin-top: 8px; font-size: 13px;">${window.escapeHtml(
                        log.content
                      )}</div>`
                    : ''
                }
              </div>
            `;
            } else {
              // 📄 FILE KHÁC (PDF, DOC, XLS...): Hiển thị card có icon
              const fileIcon = getFileIcon(fileExt);

              htmlContent = `
              <div class="msg-bubble" style="${bubbleStyle} border-radius: 12px; padding: 8px; min-width: 220px;">
                <a href="${log.attachment_url}" target="_blank" 
                   style="display: flex; align-items: center; gap: 12px; padding: 10px; background: rgba(255,255,255,0.2); border-radius: 10px; text-decoration: none; color: inherit;">
                  <i class="bx ${fileIcon}" style="font-size: 36px; opacity: 0.9;"></i>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${window.escapeHtml(fileName)}
                    </div>
                    <div style="font-size: 11px; opacity: 0.8;">${fileExt.toUpperCase()} • Click để xem</div>
                  </div>
                  <i class="bx bx-link-external" style="font-size: 18px; opacity: 0.7;"></i>
                </a>
                ${
                  log.content && !log.content.includes('[Đính kèm]')
                    ? `<div style="margin-top: 8px; font-size: 13px; padding: 0 4px;">${window.escapeHtml(
                        log.content
                      )}</div>`
                    : ''
                }
              </div>
            `;
            }
          }
          // ✅ TIN NHẮN TEXT THƯỜNG
          else {
            // Nếu content đã có HTML tag → render trực tiếp (tránh double-escape)
            // Nếu là text thuần → escape để chống XSS
            const displayContent =
              log.content && log.content.trim().startsWith('<')
                ? log.content
                : window.escapeHtml(log.content || '');

            htmlContent = `<div class="msg-bubble" style="${bubbleStyle} border-radius: 18px; padding: 10px 14px; word-wrap: break-word;">${displayContent}</div>`;
          }
        }

        // ==========================================
        // RENDER TIN NHẮN VÀO CHAT BOX
        // ==========================================
        chatBox.insertAdjacentHTML(
          'beforeend',
          `
        <div class="msg ${side}" style="margin-bottom: 12px; display: flex; flex-direction: ${
            side === 'right' ? 'column' : 'column'
          }; align-items: ${side === 'right' ? 'flex-end' : 'flex-start'};">
          <div class="msg-sender" style="font-size: 11px; opacity: 0.7; margin-bottom: 4px; ${
            side === 'right' ? 'text-align: right' : 'text-align: left'
          };">
            ${window.escapeHtml(displayName)}
          </div>
          ${htmlContent}
          <div class="msg-time" style="font-size: 10px; opacity: 0.5; margin-top: 4px; ${
            side === 'right' ? 'text-align: right' : 'text-align: left'
          }">
            ${new Date(log.created_at).toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      `
        );
      });

      // Auto-scroll xuống cuối
      chatBox.scrollTop = chatBox.scrollHeight;
    } catch (err) {
      console.error('❌ Lỗi tải logs:', err);
      showToast('Lỗi tải lịch sử chat: ' + err.message, 'error');
    }
  };

  // =====================================================================
  // 2. HÀM TAB PREVIEW (SỬ DỤNG JOIN ĐỂ LẤY FULL NAME CỦA ADMIN)
  // =====================================================================
  // =====================================================================
  // 1. LÕI TỔNG HỢP DỮ LIỆU (GOM 100% THÔNG TIN TỪ 8 BẢNG)
  // =====================================================================
  window.generateAARData = async function (incidentId) {
    console.log('🔄 Đang chạy Lõi tổng hợp toàn diện...', incidentId);

    // 1. FETCH DỮ LIỆU
    const [
      incRes,
      planRes,
      objRes,
      actRes,
      logisticsRes,
      reportsRes,
      deployRes,
      logsRes,
    ] = await Promise.all([
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
        .from('incident_logistics')
        .select('*')
        .eq('incident_id', incidentId),
      window.supabaseClient
        .from('incident_reports')
        .select('*')
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: true }),
      window.supabaseClient
        .from('deployment_history')
        .select(
          '*, user_profile:profiles!deployment_history_user_id_fkey(full_name, email), replaced_profile:profiles!deployment_history_replaced_by_fkey(full_name, email)'
        )
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: false }),
      window.supabaseClient
        .from('incident_logs')
        .select('*')
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: true }),
    ]);

    if (incRes.error) throw new Error(`incidents: ${incRes.error.message}`);

    // 2. PARSE DATA
    const incData = incRes.data || {};
    const planData = planRes.data?.[0] || {};
    const objectivesData = objRes.data || [];
    const activitiesData = actRes.data || [];
    const logisticsData = logisticsRes.data || [];
    const reportsData = reportsRes.data || [];
    const deployHistory = deployRes.data || [];
    const logsData = logsRes.data || [];

    const safeParseJson = (val, fallback = {}) => {
      if (!val) return fallback;
      if (typeof val === 'object') return val;
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    };

    const meta = safeParseJson(planData.meta, {});
    const assessment = safeParseJson(planData.assessment, {});

    const eventName = incData.event_name || 'Chưa đặt tên';
    const location = incData.location_text || 'Chưa xác định';
    const incidentCode = incData.id || incidentId;
    const actTime = incData.activation_time
      ? new Date(incData.activation_time).toLocaleString('vi-VN')
      : 'Chưa rõ';

    // Helper bóc tách HTML
    const stripHtml = (html) => {
      if (!html) return '';
      const temp = document.createElement('div');
      temp.innerHTML = html;
      return temp.textContent || temp.innerText || '';
    };

    // ==========================================
    // Ô 1: TÓM TẮT & DIỄN TIẾN (Đầy đủ theo code cũ)
    // ==========================================
    let textSummary = `[THÔNG TIN SỰ KIỆN]\n- Tên sự kiện: ${eventName}\n- Địa điểm: ${location}\n- Mã ID: ${incidentCode}\n- Thời gian kích hoạt: ${actTime}\n\n`;
    textSummary += `[TỔNG QUAN TÌNH HÌNH]\n- Tóm tắt: ${
      planData.summary || 'Chưa có tóm tắt'
    }\n- Nguyên nhân: ${
      assessment.causes || 'Đang xác minh'
    }\n- Đặc tính lâm sàng: ${
      assessment.clinical_char || assessment.clinical || 'Chưa rõ'
    }\n- Bối cảnh: ${assessment.context || 'Chưa cập nhật'}\n\n`;

    let htmlSummary = `
      <div class="mb-3"><strong class="text-primary"><i class="bx bx-info-circle"></i> Thông tin sự kiện:</strong>
          <ul class="mb-1"><li><b>Tên:</b> ${eventName}</li><li><b>Địa điểm:</b> ${location}</li><li><b>Kích hoạt:</b> ${actTime}</li></ul>
      </div>
      <div class="mb-3"><strong class="text-primary"><i class="bx bx-radar"></i> Tổng quan tình hình:</strong>
          <ul class="mb-1">
              <li><b>Tóm tắt:</b> ${planData.summary || 'Chưa có'}</li>
              <li><b>Nguyên nhân:</b> ${
                assessment.causes || 'Đang xác minh'
              }</li>
              <li><b>Đặc tính lâm sàng:</b> ${
                assessment.clinical_char || assessment.clinical || 'Chưa rõ'
              }</li>
              <li><b>Bối cảnh:</b> ${assessment.context || 'Chưa cập nhật'}</li>
          </ul>
      </div>
  `;

    textSummary += `[KẾT QUẢ TRIỂN KHAI HOẠT ĐỘNG]\n`;
    htmlSummary += `<div class="mb-3"><strong class="text-primary"><i class="bx bx-check-square"></i> Triển khai hoạt động:</strong><ul class="mb-1">`;
    if (objectivesData.length > 0) {
      objectivesData.forEach((obj, idx) => {
        textSummary += `\n* Mục tiêu ${idx + 1}: ${obj.objective_text}\n`;
        htmlSummary += `<li><b>Mục tiêu ${idx + 1}:</b> ${
          obj.objective_text
        }<ul>`;
        const matchedActs = activitiesData.filter(
          (a) => String(a.objective_id) === String(obj.id)
        );
        if (matchedActs.length > 0) {
          matchedActs.forEach((act) => {
            const isDone = act.status === 'completed' || act.status === 'Done';
            const assignee = act.assignee_id || 'Chưa rõ';
            textSummary += `  ${isDone ? '✅ [Đã xong]' : '⏳ [Đang xử lý]'} ${
              act.content
            } (Phụ trách: ${assignee})\n`;
            htmlSummary += `<li>${
              isDone
                ? '<span class="text-success fw-bold">✓</span>'
                : '<span class="text-warning fw-bold">⏳</span>'
            } ${act.content} <i>(Phụ trách: ${assignee})</i></li>`;
          });
        } else {
          textSummary += `  (Chưa có hoạt động chi tiết)\n`;
          htmlSummary += `<li><i>Chưa có hoạt động</i></li>`;
        }
        htmlSummary += `</ul></li>`;
      });
    } else {
      textSummary += `Chưa ghi nhận mục tiêu hành động.\n`;
      htmlSummary += `<li><i>Chưa ghi nhận mục tiêu hành động.</i></li>`;
    }
    htmlSummary += `</ul></div>`;

    // Hậu cần
    if (logisticsData.length > 0) {
      textSummary += `\n[NGUỒN LỰC ĐÃ HUY ĐỘNG]\n`;
      htmlSummary += `<div class="mb-3"><strong class="text-primary"><i class="bx bx-package"></i> Nguồn lực đã huy động:</strong><ul class="mb-1">`;
      logisticsData.forEach((log) => {
        let noteStr = log.note ? ` (${log.note})` : '';
        textSummary += `- ${log.name}: ${log.qty || 0} ${
          log.unit || ''
        }${noteStr}\n`;
        htmlSummary += `<li>${log.name}: <b>${log.qty || 0}</b> ${
          log.unit || ''
        }${noteStr}</li>`;
      });
      htmlSummary += `</ul></div>`;
    }

    // Biến động nhân sự
    if (deployHistory.length > 0) {
      textSummary += `\n[BIẾN ĐỘNG NHÂN SỰ]\n`;
      htmlSummary += `<div><strong class="text-primary"><i class="bx bx-group"></i> Biến động nhân sự:</strong><ul class="mb-1">`;
      deployHistory.forEach((d, idx) => {
        const time = new Date(d.created_at).toLocaleString('vi-VN');
        const userName =
          d.user_profile?.full_name || d.user_profile?.email || 'Thành viên';
        const action = d.action_type || 'deployed';
        const reason = d.reason ? ` - ${d.reason}` : '';

        let actionText = '',
          htmlIcon = '';
        if (action === 'deployed') {
          actionText = `🟢 Điều động: ${userName}`;
          htmlIcon = '<span class="text-success">🟢</span>';
        } else if (action === 'replaced') {
          const replacer =
            d.replaced_profile?.full_name || d.replaced_by || '?';
          actionText = `🔄 Thay thế: ${userName} → ${replacer}`;
          htmlIcon = '<span class="text-primary">🔄</span>';
        } else if (action === 'added') {
          actionText = `➕ Bổ sung: ${userName}`;
          htmlIcon = '<span class="text-info">➕</span>';
        } else if (action === 'removed') {
          actionText = `➖ Rút quân: ${userName}`;
          htmlIcon = '<span class="text-danger">➖</span>';
        } else {
          actionText = `• ${userName}: ${action}`;
          htmlIcon = '•';
        }

        textSummary += `${idx + 1}. [${time}] ${actionText}${reason}\n`;
        htmlSummary += `<li>${htmlIcon} [${time}] <b>${actionText}</b> <i>${reason}</i></li>`;
      });
      htmlSummary += `</ul></div>`;
    }

    // ==========================================
    // Ô 2: VẤN ĐỀ, SOS VÀ CIR
    // ==========================================
    let textIssues = '';
    let htmlIssues = '<ul class="mb-0 ps-3">';
    let hasIssue = false;

    // Từ báo cáo
    const reportsWithIssues = reportsData.filter(
      (r) =>
        r.issues &&
        r.issues.trim() !== '' &&
        !/chưa ghi nhận|không có/i.test(r.issues.toLowerCase())
    );
    if (reportsWithIssues.length > 0) {
      textIssues += 'Các khó khăn/vướng mắc từ báo cáo:\n';
      const uniqueIssues = new Set();
      reportsWithIssues.forEach((r) => {
        let iss = r.issues.trim().replace(/^[-•]\s*/, '');
        uniqueIssues.add(iss);
        htmlIssues += `<li>${iss} <i>(Báo cáo)</i></li>`;
      });
      textIssues +=
        Array.from(uniqueIssues)
          .map((i) => `- ${i}`)
          .join('\n') + '\n\n';
      hasIssue = true;
    }

    // Từ Chat & SOS (Bắt cả log_type = 'SOS' hoặc keyword)
    const chatIssues = logsData.filter(
      (l) =>
        l.log_type === 'SOS' ||
        ((l.log_type === 'Message' || l.log_type === 'Report') &&
          l.content?.match(
            /khó khăn|vướng mắc|khó|cần hỗ trợ|không thể|gặp vấn đề|sos|cứu/i
          ))
    );
    if (chatIssues.length > 0) {
      textIssues += `* Ghi nhận từ trao đổi / SOS (${chatIssues.length} tin nhắn):\n`;
      chatIssues.forEach((log, idx) => {
        const time = new Date(log.created_at).toLocaleTimeString('vi-VN');
        const user = log.user_email || 'Thành viên';
        let content = stripHtml(log.content);
        const isSOS = log.log_type === 'SOS' ? '[🚨 SOS] ' : '';
        textIssues += `${
          idx + 1
        }. [${time}] ${user}: ${isSOS}${content.substring(0, 150)}${
          content.length > 150 ? '...' : ''
        }\n`;
        htmlIssues += `<li><span class="badge bg-danger">${time}</span> <b>${user}:</b> ${isSOS}${content.substring(
          0,
          150
        )}</li>`;
      });
      textIssues += '\n';
      hasIssue = true;
    }

    // CIR
    if (meta.cir) {
      const cirItems = Array.isArray(meta.cir) ? meta.cir : [meta.cir];
      textIssues += `* Thông tin yêu cầu quan trọng (CIR):\n`;
      cirItems.forEach((item) => {
        textIssues += `- ${item.trim()}\n`;
        htmlIssues += `<li><span class="badge bg-warning text-dark">CIR</span> ${item.trim()}</li>`;
      });
      hasIssue = true;
    }

    if (!hasIssue) {
      textIssues = 'Không ghi nhận khó khăn/vướng mắc nghiêm trọng.';
      htmlIssues = '<i>Không ghi nhận khó khăn/vướng mắc nghiêm trọng.</i>';
    } else {
      htmlIssues += '</ul>';
    }

    // ==========================================
    // Ô 3: BÀI HỌC & ĐỀ XUẤT
    // ==========================================
    let textLessons = '';
    let htmlLessons = '<ul class="mb-0 ps-3">';
    let hasLesson = false;

    const reportsWithProposals = reportsData.filter(
      (r) =>
        r.next_steps &&
        r.next_steps.trim() !== '' &&
        !/tiếp tục theo dõi|chưa có/i.test(r.next_steps.toLowerCase())
    );
    if (reportsWithProposals.length > 0) {
      textLessons += 'Các đề xuất/kiến nghị từ báo cáo:\n';
      const uniqueProposals = new Set();
      reportsWithProposals.forEach((r) => {
        let pro = r.next_steps.trim().replace(/^[-•]\s*/, '');
        uniqueProposals.add(pro);
        htmlLessons += `<li>${pro}</li>`;
      });
      textLessons +=
        Array.from(uniqueProposals)
          .map((p) => `- ${p}`)
          .join('\n') + '\n';
      hasLesson = true;
    }

    const chatProposals = logsData.filter((l) =>
      l.content?.match(/đề nghị|kiến nghị|đề xuất|nên|cần phải|yêu cầu/i)
    );
    if (chatProposals.length > 0) {
      textLessons += `\n* Đề xuất từ trao đổi:\n`;
      chatProposals.forEach((log, idx) => {
        const time = new Date(log.created_at).toLocaleTimeString('vi-VN');
        const user = log.user_email || 'Thành viên';
        let content = stripHtml(log.content);
        textLessons += `${idx + 1}. [${time}] ${user}: ${content.substring(
          0,
          150
        )}...\n`;
        htmlLessons += `<li>[${time}] <b>${user}:</b> ${content.substring(
          0,
          150
        )}...</li>`;
      });
      hasLesson = true;
    }

    if (!hasLesson) {
      textLessons = 'Cần rà soát và rút kinh nghiệm cho lần xử lý sau...';
      htmlLessons = '<i>Cần tiến hành họp rút kinh nghiệm chuyên sâu.</i>';
    } else {
      htmlLessons += '</ul>';
    }

    return {
      text: { summary: textSummary, issues: textIssues, lessons: textLessons },
      html: { summary: htmlSummary, issues: htmlIssues, lessons: htmlLessons },
    };
  };
  window.loadAARPreview = async function (incidentId) {
    const placeholder = document.getElementById('aar-content-placeholder');
    const realContent = document.getElementById('aar-content-real');
    if (!placeholder || !realContent) return;

    placeholder.style.display = 'block';
    placeholder.innerHTML =
      '<p class="text-center mt-5"><span class="spinner-border text-primary"></span> Đang tổng hợp dữ liệu AAR đầy đủ...</p>';
    realContent.style.display = 'none';

    try {
      // 1. Dùng LÕI TỔNG HỢP (generateAARData) để lấy dữ liệu HTML mới nhất, đầy đủ nhất
      const compiledData = await window.generateAARData(incidentId);

      // 2. Fetch trạng thái sự kiện (để hiện Badge)
      const { data: incData, error } = await window.supabaseClient
        .from('incidents')
        .select(
          `status, admin_activate, admin:profiles!incidents_admin_activate_fkey(full_name)`
        )
        .eq('id', incidentId)
        .single();

      if (error) throw error;

      // 3. ĐỔ DỮ LIỆU HTML VÀO GIAO DIỆN
      placeholder.style.display = 'none';
      realContent.style.display = 'block';

      // Sử dụng định dạng HTML "đẹp" từ lõi tổng hợp
      document.getElementById('view-aar-summary').innerHTML =
        compiledData.html.summary;
      document.getElementById('view-aar-issues').innerHTML =
        compiledData.html.issues;
      document.getElementById('view-aar-lessons').innerHTML =
        compiledData.html.lessons;

      // Cập nhật tên Admin (Join với profiles)
      let adminName =
        incData.admin?.full_name || incData.admin_activate || 'Hệ thống';
      if (Array.isArray(incData.admin)) adminName = incData.admin[0]?.full_name;
      document.getElementById('view-aar-admin').textContent = adminName;

      // Xử lý Badge trạng thái
      const badgeClosed = document.getElementById('aar-badge-closed');
      const badgeActive = document.getElementById('aar-badge-active');
      if (badgeClosed)
        badgeClosed.style.display =
          incData.status === 'closed' || incData.status === 'completed'
            ? 'block'
            : 'none';
      if (badgeActive)
        badgeActive.style.display =
          incData.status !== 'closed' && incData.status !== 'completed'
            ? 'block'
            : 'none';

      console.log(
        '✅ Load Preview thành công với đầy đủ dữ liệu (SOS, Deployment, Logs)'
      );
    } catch (err) {
      console.error('❌ Lỗi loadAARPreview:', err);
      placeholder.innerHTML = `<div class="alert alert-danger mt-3">Lỗi tải dữ liệu: ${err.message}</div>`;
    }
  };
  window.autoFillAarFromLogs = async function () {
    const btn = document.querySelector(
      'button[onclick="autoFillAarFromLogs()"]'
    );
    const originalText = btn ? btn.innerHTML : 'Tự động tổng hợp';

    if (btn) {
      btn.innerHTML =
        '<i class="bx bx-loader-alt bx-spin"></i> Đang tổng hợp...';
      btn.disabled = true;
    }

    try {
      const incidentId =
        window.currentDossierId || $('#aar-incident-id')?.val();
      if (!incidentId) throw new Error('Không xác định được ID sự kiện.');

      console.log('🔄 Fetching data for AAR auto-fill...', incidentId);

      // =====================================================================
      // 1. FETCH TẤT CẢ DỮ LIỆU CẦN THIẾT (8 QUERY)
      // =====================================================================
      const [
        incRes,
        planRes,
        objRes,
        actRes,
        logisticsRes,
        reportsRes,
        deployRes,
        logsRes, // ✅ THÊM: Fetch incident_logs (chat)
      ] = await Promise.all([
        // 1. Incident chính
        window.supabaseClient
          .from('incidents')
          .select('*')
          .eq('id', incidentId)
          .maybeSingle(),

        // 2. Incident plan
        window.supabaseClient
          .from('incident_plans')
          .select('*')
          .eq('incident_id', incidentId)
          .order('updated_at', { ascending: false })
          .limit(1),

        // 3. Objectives
        window.supabaseClient
          .from('incident_objectives')
          .select('*')
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: true }),

        // 4. Activities
        window.supabaseClient
          .from('incident_activities')
          .select('*')
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: true }),

        // 5. Logistics
        window.supabaseClient
          .from('incident_logistics')
          .select('*')
          .eq('incident_id', incidentId),

        // 6. Reports
        window.supabaseClient
          .from('incident_reports')
          .select('*')
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: true }),

        // 7. Deployment history (HR changes)
        window.supabaseClient
          .from('deployment_history')
          .select(
            `
          *,
          user_profile:profiles!deployment_history_user_id_fkey(full_name, email),
          replaced_profile:profiles!deployment_history_replaced_by_fkey(full_name, email)
        `
          )
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: false }),

        // 8. ✅ Incident logs (chat messages)
        window.supabaseClient
          .from('incident_logs')
          .select('*')
          .eq('incident_id', incidentId)
          .order('created_at', { ascending: true }),
      ]);

      if (incRes.error) throw new Error(`incidents: ${incRes.error.message}`);

      // =====================================================================
      // 2. PARSE DATA
      // =====================================================================
      const incData = incRes.data || {};
      const planData = planRes.data?.[0] || {};
      const objectivesData = objRes.data || [];
      const activitiesData = actRes.data || [];
      const logisticsData = logisticsRes.data || [];
      const reportsData = reportsRes.data || [];
      const deployHistory = deployRes.data || [];
      const logsData = logsRes.data || []; // ✅ Chat logs

      console.log('📊 Fetched:', {
        objectives: objectivesData.length,
        activities: activitiesData.length,
        logistics: logisticsData.length,
        reports: reportsData.length,
        deployments: deployHistory.length,
        logs: logsData.length,
      });

      // Helper parse JSON
      const safeParseJson = (val, fallback = {}) => {
        if (!val) return fallback;
        if (typeof val === 'object') return val;
        try {
          return JSON.parse(val);
        } catch {
          return fallback;
        }
      };

      const meta = safeParseJson(planData.meta, {});
      const assessment = safeParseJson(planData.assessment, {});

      // =====================================================================
      // 3. UPDATE THÔNG TIN SỰ KIỆN (FIX ĐỊA ĐIỂM + TÊN SỰ KIỆN)
      // =====================================================================
      const eventName = incData.event_name || 'Chưa đặt tên';
      const location = incData.location_text || 'Chưa xác định';
      const incidentCode = incData.id || incidentId;

      // Update thông tin sự kiện trong sidebar (nếu có element)
      const eventInfoEl =
        document.querySelector('[data-field="event-name"]') ||
        document.getElementById('aar-event-name');
      if (eventInfoEl) eventInfoEl.textContent = eventName;

      const locationInfoEl =
        document.querySelector('[data-field="location"]') ||
        document.getElementById('aar-location');
      if (locationInfoEl) locationInfoEl.textContent = location;

      // =====================================================================
      // 4. XÂY DỰNG NỘI DUNG AAR
      // =====================================================================

      // --------------------------------------------------
      // Ô 1: TÓM TẮT KẾT QUẢ / DIỄN TIẾN
      // --------------------------------------------------
      let aarSummary = `[THÔNG TIN SỰ KIỆN]\n`;
      aarSummary += `- Tên sự kiện: ${eventName}\n`;
      aarSummary += `- Địa điểm: ${location}\n`;
      aarSummary += `- Mã ID: ${incidentCode}\n`;
      aarSummary += `- Thời gian kích hoạt: ${
        incData.activation_time
          ? new Date(incData.activation_time).toLocaleString('vi-VN')
          : 'Chưa rõ'
      }\n\n`;

      aarSummary += `[TỔNG QUAN TÌNH HÌNH]\n`;
      aarSummary += `- Tóm tắt: ${planData.summary || 'Chưa có tóm tắt'}\n`;
      aarSummary += `- Nguyên nhân: ${assessment.causes || 'Đang xác minh'}\n`;
      aarSummary += `- Đặc tính lâm sàng: ${
        assessment.clinical_char || assessment.clinical || 'Chưa rõ'
      }\n`;
      aarSummary += `- Bối cảnh: ${assessment.context || 'Chưa cập nhật'}\n\n`;

      aarSummary += `[KẾT QUẢ TRIỂN KHAI HOẠT ĐỘNG]\n`;

      if (objectivesData.length > 0) {
        objectivesData.forEach((obj, oIdx) => {
          aarSummary += `\n* Mục tiêu ${oIdx + 1}: ${obj.objective_text}\n`;

          const matchedActs = activitiesData.filter(
            (a) => String(a.objective_id) === String(obj.id)
          );

          if (matchedActs.length > 0) {
            matchedActs.forEach((act) => {
              const isDone =
                act.status === 'completed' || act.status === 'Done';
              const statusIcon = isDone ? '✅ [Đã xong]' : '⏳ [Đang xử lý]';
              const assignee = act.assignee_id || 'Chưa rõ';
              aarSummary += `  ${statusIcon} ${act.content} (Phụ trách: ${assignee})\n`;
            });
          } else {
            aarSummary += `  (Chưa có hoạt động chi tiết)\n`;
          }
        });
      } else {
        aarSummary += `Chưa ghi nhận mục tiêu hành động.\n`;
      }

      // Thêm logistics
      if (logisticsData.length > 0) {
        aarSummary += `\n[NGUỒN LỰC ĐÃ HUY ĐỘNG]\n`;
        logisticsData.forEach((log) => {
          aarSummary += `- ${log.name}: ${log.qty || 0} ${log.unit || ''}${
            log.note ? ` (${log.note})` : ''
          }\n`;
        });
      }

      // ✅ THÊM: Biến động nhân sự từ deployment_history
      if (deployHistory.length > 0) {
        aarSummary += `\n[BIẾN ĐỘNG NHÂN SỰ]\n`;
        deployHistory.forEach((d, idx) => {
          const time = new Date(d.created_at).toLocaleString('vi-VN');
          const userName =
            d.user_profile?.full_name || d.user_profile?.email || 'Thành viên';
          const action = d.action_type || 'deployed';
          const reason = d.reason ? ` - ${d.reason}` : '';

          let actionText = '';
          switch (action) {
            case 'deployed':
              actionText = `🟢 Điều động: ${userName}`;
              break;
            case 'replaced':
              const replacer =
                d.replaced_profile?.full_name || d.replaced_by || '?';
              actionText = `🔄 Thay thế: ${userName} → ${replacer}`;
              break;
            case 'added':
              actionText = `➕ Bổ sung: ${userName}`;
              break;
            case 'removed':
              actionText = `➖ Rút quân: ${userName}`;
              break;
            default:
              actionText = `• ${userName}: ${action}`;
          }

          aarSummary += `${idx + 1}. [${time}] ${actionText}${reason}\n`;
        });
      }

      // --------------------------------------------------
      // Ô 2: CÁC VẤN ĐỀ / KHÓ KHĂN (Từ Reports + Chat Logs)
      // --------------------------------------------------
      let aarIssues = '';

      // 2a. Từ incident_reports
      const reportsWithIssues = reportsData.filter(
        (r) =>
          r.issues &&
          r.issues.trim() !== '' &&
          !/chưa ghi nhận|không có/i.test(r.issues.toLowerCase())
      );

      if (reportsWithIssues.length > 0) {
        aarIssues += 'Các khó khăn/vướng mắc từ báo cáo:\n';
        const uniqueIssues = new Set();
        reportsWithIssues.forEach((r) => {
          const issue = r.issues.trim().replace(/^[-•]\s*/, '');
          uniqueIssues.add(`- ${issue}`);
        });
        aarIssues += Array.from(uniqueIssues).join('\n') + '\n\n';
      }

      // ✅ 2b. Từ chat logs (incident_logs)
      const chatIssues = logsData.filter(
        (l) =>
          (l.log_type === 'Message' || l.log_type === 'Report') &&
          l.content?.match(
            /khó khăn|vướng mắc|khó|cần hỗ trợ|không thể|gặp vấn đề/i
          )
      );

      if (chatIssues.length > 0) {
        aarIssues += `* Ghi nhận từ trao đổi (${chatIssues.length} tin nhắn):\n`;
        chatIssues.forEach((log, idx) => {
          const time = new Date(log.created_at).toLocaleTimeString('vi-VN');
          const user = log.user_email || 'Thành viên';
          // Strip HTML nếu có
          let content = log.content;
          if (content?.includes('<')) {
            const temp = document.createElement('div');
            temp.innerHTML = content;
            content = temp.textContent || temp.innerText || content;
          }
          aarIssues += `${idx + 1}. [${time}] ${user}: ${content.substring(
            0,
            150
          )}${content.length > 150 ? '...' : ''}\n`;
        });
        aarIssues += '\n';
      }

      // 2c. CIR (Critical Information Requirements)
      if (meta.cir) {
        const cirItems = Array.isArray(meta.cir) ? meta.cir : [meta.cir];
        aarIssues += `\n* Thông tin yêu cầu quan trọng (CIR):\n`;
        cirItems.forEach((item) => {
          aarIssues += `- ${item.trim()}\n`;
        });
      }

      if (!aarIssues.trim()) {
        aarIssues = 'Không ghi nhận khó khăn/vướng mắc nghiêm trọng.';
      }

      // --------------------------------------------------
      // Ô 3: BÀI HỌC KINH NGHIỆM / ĐỀ XUẤT
      // --------------------------------------------------
      let aarLessons = '';

      const reportsWithProposals = reportsData.filter(
        (r) =>
          r.next_steps &&
          r.next_steps.trim() !== '' &&
          !/tiếp tục theo dõi|chưa có/i.test(r.next_steps.toLowerCase())
      );

      if (reportsWithProposals.length > 0) {
        aarLessons += 'Các đề xuất/kiến nghị từ báo cáo:\n';
        const uniqueProposals = new Set();
        reportsWithProposals.forEach((r) => {
          const proposal = r.next_steps.trim().replace(/^[-•]\s*/, '');
          uniqueProposals.add(`- ${proposal}`);
        });
        aarLessons += Array.from(uniqueProposals).join('\n') + '\n';
      }

      // ✅ Thêm đề xuất từ chat logs
      const chatProposals = logsData.filter((l) =>
        l.content?.match(/đề nghị|kiến nghị|đề xuất|nên|cần phải|yêu cầu/i)
      );

      if (chatProposals.length > 0) {
        aarLessons += `\n* Đề xuất từ trao đổi:\n`;
        chatProposals.forEach((log, idx) => {
          const time = new Date(log.created_at).toLocaleTimeString('vi-VN');
          const user = log.user_email || 'Thành viên';
          let content = log.content;
          if (content?.includes('<')) {
            const temp = document.createElement('div');
            temp.innerHTML = content;
            content = temp.textContent || temp.innerText || content;
          }
          aarLessons += `${idx + 1}. [${time}] ${user}: ${content.substring(
            0,
            150
          )}${content.length > 150 ? '...' : ''}\n`;
        });
      }

      if (!aarLessons.trim()) {
        aarLessons = 'Cần rà soát và rút kinh nghiệm cho lần xử lý sau...';
      }

      // =====================================================================
      // 5. ĐỔ DỮ LIỆU VÀO UI
      // =====================================================================
      console.log('📝 Filling AAR fields...');

      const setVal = (id, val) => {
        const el = document.getElementById(id) || $(`#${id}`)?.[0];
        if (el) {
          el.value = val?.trim() || '';
          el.dispatchEvent?.(new Event('input', { bubbles: true }));
          el.dispatchEvent?.(new Event('change', { bubbles: true }));
          console.log(`✅ Set #${id} (${val?.length || 0} chars)`);
        } else {
          console.warn(`⚠️ Element #${id} not found`);
        }
      };

      setVal('aar-summary', aarSummary);
      setVal('aar-issues', aarIssues);
      setVal('aar-lessons-learned', aarLessons);

      showToast(
        '✅ Đã tổng hợp đầy đủ: IAP + Reports + Chat + Nhân sự!',
        'success'
      );

      // Auto-scroll to AAR
      const aarSection =
        document.getElementById('aar-section') ||
        document.querySelector('[data-section="aar"]') ||
        document.querySelector('.modal-body');
      if (aarSection) {
        aarSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      console.error('❌ Lỗi tổng hợp AAR:', err);
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }
  };
});
