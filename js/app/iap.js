// ============================================================
// IAP — Kế hoạch hành động sự cố (mở/điền/lưu/xuất Word)
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

// Biến toàn cục lưu vị trí để dùng lại (Cache)
let cachedLocation = null;

function getUserLocation(callback) {
  // 1. Nếu đã có vị trí lưu tạm trong phiên làm việc này -> Dùng luôn cho nhanh
  if (cachedLocation) {
    console.log('📍 Sử dụng vị trí từ bộ nhớ đệm (Cache)');
    callback(cachedLocation);
    return;
  }

  if (!('geolocation' in navigator)) {
    console.log('Trình duyệt không hỗ trợ Geolocation.');
    callback({ lat: null, lng: null });
    return;
  }

  // Hàm gọi geolocation với cấu hình tùy chỉnh
  const tryGetPosition = (options, onSuccess, onError) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        cachedLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        onSuccess(cachedLocation);
      },
      onError,
      options
    );
  };

  // ── TẦNG 1: Thử nhanh (3s, WiFi/IP, chấp nhận cache 5 phút) ──
  tryGetPosition(
    { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 },
    callback,
    (error) => {
      // Từ chối quyền → không thử lại (thử cũng vô ích), trả null luôn
      if (error.code === error.PERMISSION_DENIED) {
        console.warn('⚠️ Người dùng từ chối cấp quyền định vị.');
        callback({ lat: null, lng: null });
        return;
      }

      // ── TẦNG 2: Timeout/unavailable → thử lại kiên nhẫn hơn (12s) ──
      console.log('⏳ Lấy vị trí nhanh thất bại, đang thử lại (tối đa 12s)...');
      tryGetPosition(
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
        callback,
        (error2) => {
          let msg = '';
          switch (error2.code) {
            case error2.POSITION_UNAVAILABLE:
              msg = 'Không định vị được.';
              break;
            case error2.TIMEOUT:
              msg = 'Hết thời gian chờ (Timeout).';
              break;
            default:
              msg = error2.message;
          }
          console.warn('⚠️ Lỗi lấy vị trí (sau 2 lần thử): ' + msg);
          callback({ lat: null, lng: null });
        }
      );
    }
  );
}

// --- BIẾN TOÀN CỤC ---
let currentIAPMembers = []; // Danh sách nhân sự (nếu cần dùng cho dropdown)
let objectiveCounter = 0; // Bộ đếm để tạo ID tạm cho các mục tiêu

// ========================================================================
// 1. MỞ MODAL & LOAD DỮ LIỆU IAP (LUÔN CẬP NHẬT VERSION MỚI NHẤT)
// ========================================================================

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
  $(
    '#iap-objectives-container, #iap-logistics-body, #iap-activities-body'
  ).empty();

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
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
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

    // Gọi hàm populate (iap.js)
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

// ========================================================================
// 2. ĐIỀN DỮ LIỆU VÀO FORM (POPULATE)
// ========================================================================

function populateIAPForm(data) {
  $('#modal-incident-plan').data('id', data.incident.id);
  $('#plan-incident-title').text(data.incident.name);

  let currentLevel = data.incident.level;
  if (currentLevel === 'Active' || currentLevel === 'New') {
    currentLevel = 'Đáp ứng';
  }
  $('#iap-risk-level').val(currentLevel);
  $('#plan-status-badge').text(currentLevel);

  const meta = data.meta || {};

  $('#iap-summary').val(data.incident.summary || meta.iapSummary || '');
  $('#iap-causes').val(data.assessment.causes);
  $('#iap-clinical').val(data.assessment.clinical_char);
  $('#iap-context').val(data.assessment.context);
  $('#iap-forecast').val(data.assessment.forecast);

  // 🔥 GỌI HÀM VẼ GIAO DIỆN VÀ TRUYỀN MẢNG MỤC TIÊU VÀO
  renderObjectivesTab(data.objectives);

  let cirValue = '';
  if (meta.cir) {
    if (typeof meta.cir === 'string') cirValue = meta.cir;
    else if (Array.isArray(meta.cir)) cirValue = meta.cir.join('\n');
  }
  $('#iap-cir-content').val(cirValue);

  const coord = meta.coordination || {};
  $('#iap-coord-name').val(coord.coordinator);
  $('#iap-coord-channel').val(coord.channel);
  $('#iap-coord-mode').val(coord.reportMode);
  $('#iap-coord-partners').val(coord.partners);

  $('#iap-logistics-body').empty();
  if (data.logistics && data.logistics.length > 0) {
    data.logistics.forEach((item) => addLogisticsRow(item));
  }
  toggleLogisticsEmptyState();

  const app = meta.approval || {};
  $('#iap-lead-unit').val(app.leadUnit || data.incident.mainTeam || '');
  $('#iap-part-internal').val(app.participants?.internal);
  $('#iap-part-external').val(app.participants?.external);
  $('#iap-approver-name').val(app.approverName);
  $('#iap-approver-title').val(app.approverTitle);
  $('#iap-date-from').val(app.dateFrom);
  $('#iap-date-to').val(app.dateTo);
  $('#iap-version').val(app.version || 1);
}

// ========================================================================
// 3. XỬ LÝ TAB 2: ĐA MỤC TIÊU (OBJECTIVES & ACTIVITIES)
// ========================================================================

function renderObjectivesTab(objectivesData) {
  const container = $('#iap-objectives-container');
  container.empty();
  window.objectiveCounter = 0; // Reset biến đếm toàn cục

  let objectives = objectivesData || [];

  // Nếu sự kiện mới hoàn toàn chưa có mục tiêu, tự tạo 1 block rỗng với ID ngẫu nhiên
  if (objectives.length === 0) {
    const fakeId = crypto.randomUUID ? crypto.randomUUID() : 'temp_1';
    objectives.push({ id: fakeId, content: '', activities: [] });
  }

  // Tiến hành lặp và render
  objectives.forEach((obj) => {
    // 🔥 Lệnh .filter() gây lỗi đã bị xóa!
    // Vì obj.activities đã có sẵn dữ liệu chuẩn từ hàm openIAPModal rồi.
    addObjectiveBlock(obj.id, obj.content, obj.activities || []);
  });
}

// Hàm tạo khung HTML cho 1 Mục tiêu
function addObjectiveBlock(id = null, content = '', activities = []) {
  if (!id) {
    objectiveCounter++;
    id = objectiveCounter;
  }

  const html = `
    <div class="card border-0 shadow-sm mb-4 objective-block" data-obj-id="${id}">
        <div class="card-header bg-white border-bottom border-3 border-success d-flex justify-content-between align-items-center py-3">
            <h6 class="text-success fw-bold text-uppercase mb-0">
                <i class='bx bx-target-lock'></i> MỤC TIÊU <span class="obj-index"></span>
            </h6>
            <button class="btn btn-sm btn-outline-danger" onclick="removeObjective(this)" title="Xóa mục tiêu này">
                <i class='bx bx-trash'></i> Xóa mục tiêu
            </button>
        </div>
        <div class="card-body bg-light">
            <div class="mb-3">
                <textarea class="form-control fw-bold border-success obj-content" rows="2" placeholder="Nhập nội dung mục tiêu (VD: Kiểm soát ổ dịch trong 7 ngày)...">${content}</textarea>
            </div>

            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white py-2 d-flex align-items-center">
                    <small class="fw-bold text-muted me-3 text-nowrap">KẾ HOẠCH HÀNH ĐỘNG CỤ THỂ</small>
                    
                    <div class="d-flex align-items-center flex-grow-1 me-3">
                        <div class="progress w-100" style="height: 10px; background-color: #e9ecef; border-radius: 5px;">
                            <div class="progress-bar bg-success progress-bar-striped progress-bar-animated" 
                                 id="prog-bar-${id}" 
                                 role="progressbar" 
                                 style="width: 0%"></div>
                        </div>
                        <span class="ms-2 small fw-bold text-success" id="prog-text-${id}" style="min-width: 40px;">0%</span>
                    </div>
                    <button class="btn btn-sm btn-success text-nowrap" onclick="addActivityRowToObj('${jsAttr(id)}')">
                        <i class='bx bx-plus'></i> Thêm
                    </button>
                </div>

                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0 bg-white small">
                        <thead class="table-light small text-center text-uppercase">
                            <tr>
                                <th width="3%">✔</th> 
                                <th width="16%">Nhóm</th>
                                <th width="35%">Nội dung</th>
                                <th width="15%">Phụ trách</th>
                                <th width="15%">Deadline</th>
                                <th width="15%">Kết quả</th>
                                <th width="3%"></th>
                            </tr>
                        </thead>
                        <tbody class="obj-activities-body" id="act-body-${id}">
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    `;

  $('#iap-objectives-container').append(html);
  updateObjectiveIndexes();

  if (activities.length > 0) {
    activities.forEach((act) => addActivityRowToObj(id, act));
  } else {
    addActivityRowToObj(id);
  }

  // [QUAN TRỌNG] Tính toán lại % ngay khi khởi tạo
  updateProgress(id);
}

function addActivityRowToObj(objId, data = {}) {
  const groups = [
    'Điều tra',
    'Phòng ngừa',
    'Truyền thông',
    'Hậu cần',
    'Hỗ trợ',
  ];
  let groupOpts = groups
    .map(
      (g) =>
        `<option value="${g}" ${
          data.group === g ? 'selected' : ''
        }>${g}</option>`
    )
    .join('');

  const isChecked = data.status === 'Done' ? 'checked' : '';

  const html = `
        <tr>
            <td class="align-top text-center pt-2">
                <input type="checkbox" class="form-check-input act-status" 
                       style="cursor: pointer; width: 20px; height: 20px;" 
                       ${isChecked} 
                       onchange="updateProgress(${objId})">
            </td>
            
            <td class="align-top pt-2">
                <select class="form-select form-select-sm act-group fw-bold">${groupOpts}</select>
            </td>
            <td class="align-top">
                <textarea class="form-control form-control-sm act-content table-textarea" rows="2" placeholder="Nội dung...">${
                  data.content || ''
                }</textarea>
            </td>
            <td class="align-top">
                <textarea class="form-control form-control-sm act-assignee table-textarea" rows="2" placeholder="Phụ trách...">${
                  data.assignee || ''
                }</textarea>
            </td>

            <td class="align-top">
                <textarea class="form-control form-control-sm act-deadline table-textarea text-center" rows="2" placeholder="dd/mm/yyyy...">${
                  data.deadline || ''
                }</textarea>
            </td>
            <td class="align-top">
                <textarea class="form-control form-control-sm act-output table-textarea" rows="2" placeholder="Kết quả...">${
                  data.output || ''
                }</textarea>
            </td>
            <td class="align-middle text-center">
                <button class="btn btn-sm text-danger p-1" onclick="$(this).closest('tr').remove(); updateProgress(${objId});">
                    <i class='bx bx-trash fs-5'></i>
                </button>
            </td>
        </tr>
    `;
  $(`#act-body-${objId}`).append(html);

  // Cập nhật lại thanh progress khi thêm dòng mới (vì tổng số dòng tăng lên -> % giảm đi)
  updateProgress(objId);
}
// Hàm tính toán % hoàn thành cho từng Mục tiêu
function updateProgress(objId) {
  const tbody = $(`#act-body-${objId}`);
  const totalRows = tbody.find('tr').length;

  // Đếm số lượng checkbox được tick
  const checkedRows = tbody.find('.act-status:checked').length;

  let percent = 0;
  if (totalRows > 0) {
    percent = Math.round((checkedRows / totalRows) * 100);
  }

  // Cập nhật giao diện
  const progressBar = $(`#prog-bar-${objId}`);
  const progressText = $(`#prog-text-${objId}`);

  progressBar.css('width', percent + '%');
  progressText.text(percent + '%');

  // Đổi màu thanh progress cho sinh động
  if (percent === 100) {
    progressBar.removeClass('bg-success bg-warning').addClass('bg-primary'); // Hoàn thành 100% -> Màu xanh dương
  } else if (percent > 0) {
    progressBar.removeClass('bg-primary bg-warning').addClass('bg-success'); // Đang làm -> Màu xanh lá
  } else {
    progressBar.removeClass('bg-primary bg-success').addClass('bg-warning'); // Chưa làm -> Màu vàng
  }
}

// Hàm xóa mục tiêu
// --- BIẾN TOÀN CỤC ---
let targetToDelete = null; // Biến tạm để lưu đối tượng cần xóa

// 1. HÀM GỌI MODAL XÁC NHẬN
function removeObjective(btn) {
  // Lưu lại cái thẻ Card (Mục tiêu) đang muốn xóa
  targetToDelete = $(btn).closest('.objective-block');

  // Mở Modal xác nhận (Modal nhỏ)
  $('#modal-confirm-delete').modal('show');
}

// 2. SỰ KIỆN KHI BẤM NÚT "XÓA NGAY" TRONG MODAL
// (Chỉ cần bind 1 lần khi trang web tải xong)
$(document).ready(function () {
  $('#btn-confirm-delete-yes')
    .off('click')
    .on('click', function () {
      if (targetToDelete) {
        // Thực hiện xóa
        targetToDelete.remove();

        // Cập nhật lại số thứ tự (Mục tiêu 1, 2...)
        updateObjectiveIndexes();

        // Đóng modal và báo thành công
        $('#modal-confirm-delete').modal('hide');
        showToast('Đã xóa mục tiêu thành công!', 'success'); // <--- Toast của bạn đây

        // Reset biến tạm
        targetToDelete = null;
      }
    });
});

// Hàm đánh số lại thứ tự mục tiêu
function updateObjectiveIndexes() {
  $('#iap-objectives-container .objective-block').each(function (index) {
    $(this)
      .find('.obj-index')
      .text(index + 1);
  });
}

// ========================================================================
// 4. XỬ LÝ TAB 3: HẬU CẦN (LOGISTICS)
// ========================================================================

function addLogisticsRow(data = {}) {
  const html = `
        <tr>
            <td><input type="text" class="form-control form-control-sm log-name" value="${
              data.name || ''
            }" placeholder="Tên vật tư..."></td>
            <td><input type="number" class="form-control form-control-sm log-qty" value="${
              data.qty || ''
            }"></td>
            <td><input type="text" class="form-control form-control-sm log-unit" value="${
              data.unit || ''
            }" placeholder="Cái/Hộp"></td>
            <td><input type="text" class="form-control form-control-sm log-note" value="${
              data.note || ''
            }"></td>
            <td class="text-center">
                <button class="btn btn-sm text-danger" onclick="removeLogisticsRow(this)"><i class='bx bx-trash'></i></button>
            </td>
        </tr>
    `;
  $('#iap-logistics-body').append(html);
  toggleLogisticsEmptyState();
}

function removeLogisticsRow(btn) {
  $(btn).closest('tr').remove();
  toggleLogisticsEmptyState();
}

function toggleLogisticsEmptyState() {
  if ($('#iap-logistics-body tr').length === 0) {
    $('#iap-logistics-empty').show();
  } else {
    $('#iap-logistics-empty').hide();
  }
}

// ========================================================================
// 5. GOM DỮ LIỆU & GỬI SERVER (SUBMIT)
// ========================================================================

window.submitIAP = async function () {
  const incidentId = $('#modal-incident-plan').data('id');
  if (!incidentId)
    return showToast('Lỗi: Không xác định được sự kiện.', 'error');

  showLoadingSpinner();

  try {
    console.log('🚀 Starting IAP submit for incident:', incidentId);

    // ==========================================
    // A. THU THẬP DỮ LIỆU TỪ FORM
    // ==========================================

    // --- 1. Tab 2: Objectives & Activities ---
    const objectives = [];
    const allActivities = [];

    $('#iap-objectives-container .objective-block').each(function (index) {
      const block = $(this);
      const tempId = 'temp_' + index + '_' + Date.now();
      const content = block.find('.obj-content').val()?.trim();

      // ✅ Parse deadline từ text (dd/mm/yyyy) sang ISO string cho incident_objectives
      const objDeadlineText = block.find('.obj-deadline').val()?.trim() || null;
      const objDeadlineISO = objDeadlineText
        ? parseDateToISO(objDeadlineText)
        : null;

      if (content) {
        objectives.push({
          temp_id: tempId,
          content: content,
          deadline_text: objDeadlineText, // Lưu dạng text cho display
          deadline_iso: objDeadlineISO, // Lưu dạng ISO cho DB
        });
      }

      block.find('tbody tr').each(function () {
        const row = $(this);
        const actContent = row.find('.act-content').val()?.trim();

        if (actContent) {
          allActivities.push({
            temp_objective_id: tempId,
            task_group: row.find('.act-group').val() || 'Chung',
            content: actContent,
            // ✅ assignee_id là TEXT trong DB → lưu email hoặc tên
            assignee_id: row.find('.act-assignee').val()?.trim() || null,
            deadline: row.find('.act-deadline').val()?.trim() || null, // TEXT trong DB
            expected_output: row.find('.act-output').val()?.trim() || null,
            status: row.find('.act-status').is(':checked')
              ? 'completed'
              : 'pending',
          });
        }
      });
    });

    // --- 2. Tab 1: Assessment Fields ---
    const causes = $('#iap-causes').val()?.trim() || 'Chưa xác định';
    const clinical_char =
      $('#iap-clinical').val()?.trim() ||
      $('#iap-clinical-char').val()?.trim() ||
      'Chưa ghi nhận';
    const context = $('#iap-context').val()?.trim() || 'Chưa đánh giá';
    const forecast = $('#iap-forecast').val()?.trim() || '';

    const objectivesSummary = objectives
      .map(
        (o, i) =>
          `${i + 1}. ${o.content}${
            o.deadline_text ? ` (Hạn: ${o.deadline_text})` : ''
          }`
      )
      .join('\n');

    // ==========================================
    // B. CHUẨN BỊ PAYLOADS THEO ĐÚNG SCHEMA
    // ==========================================

    // --- 1. incident_plans ---
    // ⚠️ activities_by_objective là TEXT → phải JSON.stringify
    // ⚠️ assessment là JSONB → có thể gửi object trực tiếp
    const activitiesByObjectiveObj = (() => {
      const grouped = {};
      objectives.forEach((obj) => {
        const acts = allActivities
          .filter((a) => a.temp_objective_id === obj.temp_id)
          .map((a) => ({
            task_group: a.task_group,
            content: a.content,
            assignee: a.assignee_id,
            deadline: a.deadline,
            output: a.expected_output,
            status: a.status,
          }));
        if (acts.length > 0) {
          grouped[obj.content] = acts;
        }
      });
      return grouped;
    })();

    const planPayload = {
      incident_id: incidentId,
      author:
        $('#iap-author').val()?.trim() ||
        window.userSession?.username ||
        'admin',
      clinical_char: clinical_char, // ✅ Đúng tên cột
      context: context,
      causes: causes,
      summary: $('#iap-summary').val()?.trim() || '',
      level: $('#iap-risk-level').val() || 'Đáp ứng',

      // ✅ assessment là JSONB → gửi object
      assessment: {
        causes: causes,
        clinical: clinical_char,
        context: context,
        forecast: forecast,
        objectives_summary: objectivesSummary,
        created_at: new Date().toISOString(),
      },

      // ✅ activities_by_objective là TEXT → phải stringify
      activities_by_objective: JSON.stringify(activitiesByObjectiveObj),

      // ✅ meta là JSONB với default '{}'
      meta: {
        coordination: {
          coordinator: $('#iap-coord-name').val(),
          channel: $('#iap-coord-channel').val(),
          reportMode: $('#iap-coord-mode').val(),
          partners: $('#iap-coord-partners').val(),
        },
        approval: {
          leadUnit: $('#iap-lead-unit').val(),
          participants: {
            internal: $('#iap-part-internal').val(),
            external: $('#iap-part-external').val(),
          },
          approverName: $('#iap-approver-name').val(),
          approverTitle: $('#iap-approver-title').val(),
          dateFrom: $('#iap-date-from').val(),
          dateTo: $('#iap-date-to').val(),
          version: parseInt($('#iap-version').val() || 1),
        },
        cir: $('#iap-cir-content').val() || '',
      },

      timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // --- 2. incident_assessments ---
    // ⚠️ objectives và forecast là TEXT
    const assessPayload = {
      incident_id: incidentId,
      author_id: window.getCurrentUserId(), // ✅ Dùng helper
      causes: causes,
      clinical_char: clinical_char, // ✅ Đúng tên cột
      context: context,
      objectives: objectivesSummary, // ✅ TEXT field
      forecast: forecast, // ✅ TEXT field
      created_at: new Date().toISOString(),
    };

    // --- 3. incident_reports ---
    const reportPayload = {
      incident_id: incidentId,
      report_type: 'iap_update',
      level: $('#iap-risk-level').val() || 'Đáp ứng', // ✅ TEXT field
      event_name: null,
      cases_new: 0,
      suspected_new: 0,
      deaths_new: 0,
      cases_total: 0,
      suspected_total: 0,
      deaths_total: 0,
      overview: planPayload.summary,
      activities: objectivesSummary,
      issues: 'Chờ cập nhật',
      next_steps: 'Thu thập thông tin chi tiết',
      hr_changes: null,
      lessons: null,
      detected_incidents: null,
      reporter: window.userSession?.email || 'System',
      created_at: new Date().toISOString(),
    };

    // ==========================================
    // C. GHI XUỐNG DATABASE (DELETE + INSERT)
    // ==========================================

    console.log('📦 Plan payload keys:', Object.keys(planPayload));

    // --- 1. incident_plans: DELETE + INSERT ---
    const { error: delPlanErr } = await window.supabaseClient
      .from('incident_plans')
      .delete()
      .eq('incident_id', incidentId);

    if (delPlanErr) console.warn('⚠️ Delete plan warning:', delPlanErr.message);

    const { error: planErr } = await window.supabaseClient
      .from('incident_plans')
      .insert([planPayload])
      .select();

    if (planErr) {
      console.error('❌ incident_plans error:', planErr);
      throw new Error(`incident_plans: ${planErr.message}`);
    }
    console.log('✅ incident_plans saved');

    // --- 2. incident_assessments: DELETE + INSERT ---
    const { error: delAssessErr } = await window.supabaseClient
      .from('incident_assessments')
      .delete()
      .eq('incident_id', incidentId);
    if (delAssessErr)
      console.warn('⚠️ Delete assessment warning:', delAssessErr.message);

    const { error: assessErr } = await window.supabaseClient
      .from('incident_assessments')
      .insert([assessPayload])
      .select();

    if (assessErr) {
      console.error('❌ incident_assessments error:', assessErr);
      throw new Error(`incident_assessments: ${assessErr.message}`);
    }
    console.log('✅ incident_assessments saved');

    // --- 3. incident_reports: DELETE + INSERT ---
    await window.supabaseClient
      .from('incident_reports')
      .delete()
      .eq('incident_id', incidentId)
      .eq('report_type', 'iap_update');

    await window.supabaseClient
      .from('incident_reports')
      .insert([reportPayload]);

    console.log('✅ incident_reports saved');

    // --- 4. incident_objectives & incident_activities ---
    await Promise.all([
      window.supabaseClient
        .from('incident_objectives')
        .delete()
        .eq('incident_id', incidentId),
      window.supabaseClient
        .from('incident_activities')
        .delete()
        .eq('incident_id', incidentId),
    ]);

    if (objectives.length > 0) {
      const objInserts = objectives.map((o) => ({
        incident_id: incidentId,
        objective_text: o.content,
        // ✅ deadline là timestamp with time zone → dùng ISO string
        deadline: o.deadline_iso,
        status: o.status,
      }));

      const { data: insertedObjs, error: objErr } = await window.supabaseClient
        .from('incident_objectives')
        .insert(objInserts)
        .select('id, objective_text');

      if (objErr) throw new Error(`incident_objectives: ${objErr.message}`);

      // Map temp_id → real_id
      const idMap = {};
      insertedObjs?.forEach((realObj, idx) => {
        const tempObj = objectives[idx];
        if (tempObj) {
          idMap[tempObj.temp_id] = realObj.id;
        }
      });

      // Insert activities
      // ⚠️ objective_id và assignee_id là TEXT trong DB
      const activitiesWithRealIds = allActivities
        .map((act) => ({
          incident_id: incidentId,
          // ✅ objective_id là TEXT → convert UUID sang string
          objective_id: idMap[act.temp_objective_id]
            ? String(idMap[act.temp_objective_id])
            : null,
          task_group: act.task_group,
          content: act.content,
          // ✅ assignee_id là TEXT → lưu email/text
          assignee_id: act.assignee_id,
          // ✅ deadline là TEXT trong incident_activities
          deadline: act.deadline,
          expected_output: act.expected_output,
          status: act.status,
        }))
        .filter((a) => a.objective_id);

      if (activitiesWithRealIds.length > 0) {
        const { error: actErr } = await window.supabaseClient
          .from('incident_activities')
          .insert(activitiesWithRealIds);

        if (actErr) throw new Error(`incident_activities: ${actErr.message}`);
        console.log(`✅ Inserted ${activitiesWithRealIds.length} activities`);
      }
    }

    // ==========================================
    // C. HOÀN TẤT
    // ==========================================
    showToast('✅ Đã lưu IAP đầy đủ!', 'success');

    // 1. Đóng modal ngay lập tức
    $('#modal-incident-plan').modal('hide');

    // 2. ✅ SỬA: KHÔNG gọi lại openIAPModal. Thay vào đó, làm mới danh sách sự kiện ở trang nền
    setTimeout(() => {
      if (typeof window.renderTrackingPage === 'function') {
        window.renderTrackingPage(true); // Force reload trang Tracking
      }
    }, 500);
  } catch (err) {
    console.error('❌ Lỗi lưu IAP:', err);
    showToast('Lỗi: ' + err.message, 'error');
  } finally {
    hideLoadingSpinner();
  }
};

// ========================================================================
// HELPER: Parse date từ dd/mm/yyyy sang ISO string
// ========================================================================
function parseDateToISO(dateStr) {
  if (!dateStr) return null;

  // Nếu đã là ISO string thì trả về luôn
  if (dateStr.includes('T')) return dateStr;

  try {
    // Format dd/mm/yyyy
    if (dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/');
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
    // Format khác: thử parse trực tiếp
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch (e) {
    console.warn('⚠️ Date parse failed:', dateStr, e);
  }
  return null;
}

// ========================================================================
// 6. XUẤT WORD
// ========================================================================

window.exportIAPWord = async function () {
  const incidentId = $('#modal-incident-plan').data('id');
  if (!incidentId)
    return showToast('Lỗi: Không tìm thấy ID sự kiện để xuất.', 'error');

  showLoadingSpinner();
  try {
    // ========================================================
    // 1. ÁP DỤNG LOGIC FETCH "CHUẨN" TỪ HÀM openIAPModal CỦA BẠN
    // ========================================================
    const [incRes, planRes, objRes, actRes, logRes] = await Promise.all([
      window.supabaseClient
        .from('incidents')
        .select('*')
        .eq('id', incidentId)
        .single(),
      // Dùng limit(1) để lấy dòng mới nhất, chống lỗi nhân bản
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
    ]);

    if (incRes.error) throw incRes.error;

    const incData = incRes.data || {};
    // Lấy phần tử đầu tiên của mảng do limit(1) trả về
    const planData =
      planRes.data && planRes.data.length > 0 ? planRes.data[0] : {};

    const objectivesData = objRes.data || [];
    const activitiesData = actRes.data || [];
    const logisticsData = logRes.data || [];

    // ========================================================
    // 2. ÁP DỤNG ÉP KIỂU JSONB AN TOÀN TỪ HÀM openIAPModal
    // ========================================================
    let meta = planData.meta || {};
    if (typeof meta === 'string') meta = JSON.parse(meta);

    let assessment = planData.assessment || {};
    if (typeof assessment === 'string') assessment = JSON.parse(assessment);

    const approval = meta.approval || {};

    // ========================================================
    // 3. TẠO CHUỖI DANH SÁCH MỤC TIÊU & HÀNH ĐỘNG
    // ========================================================
    let activitiesText = '';
    objectivesData.forEach((obj, oIdx) => {
      activitiesText += `${oIdx + 1}. Mục tiêu ${oIdx + 1}: ${
        obj.objective_text
      }\n`;

      // Lọc hoạt động khớp với UUID mục tiêu
      const matchedActs = activitiesData.filter(
        (a) => String(a.objective_id) === String(obj.id)
      );
      if (matchedActs.length > 0) {
        matchedActs.forEach((act, aIdx) => {
          activitiesText += `   - Hành động ${aIdx + 1}: ${act.content}\n`;
          activitiesText += `     + Phụ trách: ${
            act.assignee_id || '...'
          } | Thời hạn: ${act.deadline || '...'}\n`;
          activitiesText += `     + Kết quả dự kiến: ${
            act.expected_output || '...'
          }\n`;
        });
      } else {
        activitiesText += '   (Chưa lập hành động chi tiết)\n';
      }
      activitiesText += '\n';
    });

    // 4. TẠO CHUỖI HẬU CẦN
    let logisticsText = '';
    logisticsData.forEach((log, lIdx) => {
      logisticsText += `Danh mục [${lIdx + 1}]: ${log.name}\n`;
      logisticsText += ` - Số lượng: ${log.qty} ${log.unit || ''} | Ghi chú: ${
        log.note || 'Không'
      }\n\n`;
    });
    if (!logisticsText) logisticsText = 'Không ghi nhận yêu cầu hậu cần.';

    const toVNDate = (dateStr) => {
      if (!dateStr) return '...';
      const parts = dateStr.split('-');
      return parts.length === 3
        ? `${parts[2]}/${parts[1]}/${parts[0]}`
        : dateStr;
    };

    const currentUserName =
      window.userSession?.full_name ||
      window.userSession?.email ||
      'Cán bộ RRT';

    // ========================================================
    // 5. ĐÓNG GÓI PAYLOAD VÀ GỬI SANG XƯỞNG IN (APPS SCRIPT)
    // ========================================================
    const payload = {
      templateId: '1hq048ymG8c3wuYG64oJVC77Dktoz00ZnhQlfzmmlFK4',
      fileName: `IAP_[${incData.event_name}]_${new Date().getTime()}`,
      replacements: {
        '{{TEN_SU_KIEN}}': incData.event_name || '...',
        '{{DIA_DIEM}}': incData.location_text || 'Chưa cập nhật địa điểm',
        '{{MUC_DO}}': planData.level || 'Đáp ứng',

        // Ưu tiên lấy summary, ép kiểu an toàn
        '{{TOM_TAT}}':
          planData.summary && planData.summary.trim() !== ''
            ? planData.summary
            : 'Chưa có tóm tắt hình hiện tại.',

        // Trích xuất an toàn từ biến assessment đã parse chuẩn
        '{{NGUYEN_NHAN}}': assessment.causes || 'Đang điều tra xác minh.',
        '{{LAM_SANG}}': assessment.clinical || 'Chưa ghi nhận đặc tính.',
        '{{BOI_CANH}}': assessment.context || 'Chưa cập nhật bối cảnh.',
        '{{DU_BAO}}': assessment.forecast || 'Tiếp tục theo dõi diễn tiến.',

        '{{HANH_DONG_LIST}}': activitiesText,
        '{{CIR_LIST}}': meta.cir || 'Không có ghi nhận đặc biệt.',

        '{{DAU_MOI}}': meta.coordination?.coordinator || '....................',
        '{{KENH_LL}}': meta.coordination?.channel || 'Zalo/Điện thoại',
        '{{CHE_DO_BC}}': meta.coordination?.reportMode || 'Báo cáo nhanh',
        '{{DON_VI_PH}}': meta.coordination?.partners || '....................',

        '{{HAU_CAN_LIST}}': logisticsText,

        '{{DON_VI_CHU_TRI}}': approval.leadUnit || currentUserName,
        '{{TP_NOI_BO}}': approval.participants?.internal
          ? `☑ Khoa/phòng HCDC: ${approval.participants.internal}`
          : '☐ Khoa/phòng HCDC: ....................',
        '{{TP_BEN_NGOAI}}': approval.participants?.external
          ? `☑ Đơn vị khác: ${approval.participants.external}`
          : '☐ Đơn vị khác: ....................',
        '{{NGUOI_DUYET}}': approval.approverName || '....................',
        '{{CHUC_VU_DUYET}}': approval.approverTitle || '....................',
        '{{THOI_GIAN_AD}}': `Từ ${toVNDate(approval.dateFrom)} đến ${toVNDate(
          approval.dateTo
        )}`,
        '{{IAP_VERSION}}': approval.version || '1',
      },
    };

    const GAS_API_URL =
      'https://script.google.com/macros/s/AKfycbwA-tfQX4wNbbUlb5AwHO3eCUF7tbCKF4QN_TxyDN9dRAYryw8My1DUZhjbWVHtX_u1/exec';

    const response = await fetch(GAS_API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    const res = await response.json();
    hideLoadingSpinner();

    if (res.success) {
      window.open(res.docsUrl, '_blank');
      showToast(
        'Xuất phương án IAP thành công! Vui lòng kiểm tra tab mới.',
        'success'
      );
    } else {
      showToast('Lỗi từ xưởng in: ' + res.message, 'error');
    }
  } catch (err) {
    hideLoadingSpinner();
    console.error('Fetch Error:', err);
    showToast('Lỗi kết nối in ấn: ' + err.message, 'error');
  }
};
