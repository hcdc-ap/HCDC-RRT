// ============================================================
// LOGISTICS & LIBRARY — Vật tư và thư viện tài liệu
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {

  // === LOGISTICS ===
  // ==========================
  // LOGIC MODULE LOGISTICS (ĐÃ NÂNG CẤP)
  // ==========================

  // 1. Render chính (Kết hợp Fetch trực tiếp để đảm bảo luôn có dữ liệu)
  window.renderLogisticsPage = async function (forceFetch = false) {
    const container = document.getElementById('logistics-table-body');
    const logContainer = document.getElementById('logistics-logs-body');
    if (!container) return;

    // 1. Kiểm tra dữ liệu hiện có trong appState
    let items = window.appState.logistics.items || [];
    let logs = window.appState.logistics.logs || [];

    // 2. Nếu forceFetch = true hoặc appState đang rỗng, tiến hành lấy dữ liệu mới
    if (forceFetch || items.length === 0) {
      container.innerHTML =
        '<tr><td colspan="8" class="text-center">🔄 Đang cập nhật dữ liệu vật tư...</td></tr>';
      try {
        console.log('📡 Đang tải dữ liệu tươi từ Supabase...');
        const [itemsRes, logsRes] = await Promise.all([
          supabaseClient
            .from('logistics_items')
            .select('*')
            .order('item_name', { ascending: true }),
          supabaseClient
            .from('logistics_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50),
        ]);

        if (itemsRes.error) throw itemsRes.error;

        // Cập nhật lại kho dữ liệu chung
        items = itemsRes.data || [];
        logs = logsRes.data || [];
        window.appState.logistics.items = items;
        window.appState.logistics.logs = logs;
      } catch (err) {
        console.error('❌ Lỗi tải dữ liệu Logistics:', err.message);
        container.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Lỗi: ${err.message}</td></tr>`;
        return;
      }
    }

    // 3. LOGIC RENDER BẢNG VẬT TƯ (INVENTORY)
    const isAdmin = window.userSession?.role?.toLowerCase() === 'admin';
    let lowStock = 0,
      expired = 0;
    const today = new Date();

    container.innerHTML = ''; // Xóa sạch nội dung cũ/Loading

    if (items.length === 0) {
      container.innerHTML =
        '<tr><td colspan="8" class="text-center">Chưa có vật tư nào trong kho.</td></tr>';
    } else {
      items.forEach((item) => {
        const itemName = item.item_name || 'N/A';
        const itemLocation = item.storage_location || 'Kho';
        const itemExpiry = item.expiry_date || '';
        const minThreshold = item.min_threshold || 0;
        const quantity = item.quantity || 0;

        let isExp = false,
          isLow = false;

        // Kiểm tra hạn sử dụng
        if (itemExpiry) {
          const expDate = new Date(itemExpiry);
          if (expDate < today) {
            isExp = true;
            expired++;
          }
        }

        // Kiểm tra tồn kho thấp
        if (quantity <= minThreshold) {
          isLow = true;
          lowStock++;
        }

        // Thiết lập Badge trạng thái
        let statusBadge = '';
        if (isExp)
          statusBadge +=
            '<span class="badge bg-danger">Hết hạn sử dụng</span> ';
        if (isLow)
          statusBadge +=
            '<span class="badge bg-warning text-dark">Sắp hết vật tư</span>';
        if (!isExp && !isLow)
          statusBadge = '<span class="badge bg-success">Sẵn sàng</span>';

        const rowStyle = isExp ? 'style="background-color: #fff5f5;"' : '';
        const btnAction = isAdmin
          ? `<button class="btn btn-sm btn-outline-primary" onclick="window.openTransModal('${item.id}')"><i class='bx bx-transfer'></i> Điều phối</button>`
          : '';

        container.insertAdjacentHTML(
          'beforeend',
          `
              <tr ${rowStyle}>
                  <td><small class="text-muted">#${item.id.substring(
                    0,
                    8
                  )}</small></td>
                  <td><b>${itemName}</b><br><small class="text-muted">${
            item.category || ''
          }</small></td>
                  <td>${item.category || ''}</td>
                  <td>${item.unit || 'Cái'}</td>
                  <td><b style="font-size:16px;">${quantity}</b></td>
                  <td>${itemExpiry || 'N/A'}</td>
                  <td>${itemLocation}</td>
                  <td>${statusBadge}<div style="margin-top:5px;">${btnAction}</div></td>
              </tr>
          `
        );
      });
    }

    // 4. CẬP NHẬT KPI (TỔNG HỢP)
    const updateKPI = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    updateKPI('log-total-items', items.length);
    updateKPI('log-low-stock', lowStock);
    updateKPI('log-expired', expired);

    // 5. RENDER BẢNG NHẬT KÝ (LOGS)
    if (logContainer) {
      logContainer.innerHTML = '';
      if (logs.length === 0) {
        logContainer.innerHTML =
          '<tr><td colspan="7" class="text-center text-muted">Chưa có lịch sử giao dịch.</td></tr>';
      } else {
        // Lấy danh sách user từ AppState (hỗ trợ nhiều tên biến mà bạn có thể đang dùng)
        const userList =
          window.appState.users ||
          window.appState.teamData ||
          window.appState.profiles ||
          [];

        logs.forEach((log) => {
          const isImport =
            log.transaction_type === 'IMPORT' ||
            log.transaction_type === 'NHẬP';

          const typeBadge = isImport
            ? '<span class="badge bg-info text-dark">NHẬP</span>'
            : '<span class="badge bg-warning text-dark">XUẤT</span>';

          const changeText = isImport
            ? `+${log.quantity_change}`
            : `-${log.quantity_change}`;

          const itemInfo = items.find((i) => i.id === log.item_id);
          const itemName = itemInfo
            ? itemInfo.item_name
            : `<small>${log.item_id}</small>`;

          const eventDisplay = log.incident_id
            ? `<span class="badge bg-secondary" style="font-size: 0.75rem;">${log.incident_id.substring(
                0,
                8
              )}...</span>`
            : '-';

          // --- TÌM TÊN ADMIN DỰA TRÊN ADMIN_ID ---
          let adminName = 'Hệ thống'; // Mặc định nếu không tìm thấy
          if (log.admin_id) {
            const adminProfile = userList.find((u) => u.id === log.admin_id);
            if (adminProfile) {
              // Lấy full_name, nếu không có thì lấy name, không có nữa thì hiện ID rút gọn
              adminName =
                adminProfile.full_name ||
                adminProfile.name ||
                `User-${log.admin_id.substring(0, 4)}`;
            } else {
              // Trường hợp user đã bị xóa khỏi hệ thống
              adminName = `<small class="text-muted">Cựu NV (${log.admin_id.substring(
                0,
                4
              )})</small>`;
            }
          }

          logContainer.insertAdjacentHTML(
            'beforeend',
            `
              <tr>
                  <td><small>${new Date(log.created_at).toLocaleString(
                    'vi-VN'
                  )}</small></td>
                  <td>${typeBadge}</td>
                  <td><b>${itemName}</b></td>
                  <td style="font-weight:bold; color:${
                    isImport ? '#28a745' : '#dc3545'
                  }">${changeText}</td>
                  <td>${log.note || '-'}</td>
                  <td>${eventDisplay}</td>
                  <td><b>${adminName}</b></td> </tr>
          `
          );
        });
      }
    }
  };
  // ==========================================
  // HÀM LỌC VẬT TƯ (LOGISTICS SEARCH)
  // ==========================================
  window.filterLogistics = function () {
    const input = document.getElementById('log-search');
    if (!input) return;

    const filter = input.value.toLowerCase();
    const rows = document.querySelectorAll('#logistics-table-body tr');

    rows.forEach((row) => {
      // Lấy toàn bộ nội dung text trong hàng
      const text = row.textContent.toLowerCase();

      // Kiểm tra xem có chứa từ khóa tìm kiếm không
      if (text.includes(filter)) {
        row.style.display = ''; // Hiển thị
      } else {
        row.style.display = 'none'; // Ẩn
      }
    });
  };
  // 2. Chuyển Tab Logistics
  window.switchLogisticsTab = function (tabId, btn) {
    document
      .querySelectorAll('.tab-pane-log')
      .forEach((el) => (el.style.display = 'none'));
    document.getElementById(tabId).style.display = 'block';

    // Reset style nút
    const btns = btn.parentElement.children;
    for (let b of btns) {
      b.style.background = 'transparent';
      b.style.borderBottomColor = 'transparent';
      b.classList.remove('active');
    }
    btn.style.background = 'white';
    btn.style.borderBottomColor = '#006a75';
    btn.classList.add('active');
  };
  // 3. Mở modal & Load Active Incidents (ĐÃ SỬA LỖI FIND)
  window.openTransModal = function (itemId) {
    const logisticsData = window.appState.logistics || {};
    const itemsList = logisticsData.items || [];
    const item = itemsList.find((i) => i.id === itemId);

    if (!item) {
      console.error('Không tìm thấy vật tư với ID:', itemId);
      return;
    }

    // SỬA LỖI: Sử dụng item_name thay vì name
    document.getElementById('trans-item-id').value = item.id;
    document.getElementById('trans-item-name').value = item.item_name; // Thay item.name bằng item.item_name
    document.getElementById('trans-current-stock').value = item.quantity;
    document.getElementById('trans-qty').value = 1;
    document.getElementById('trans-type').value = 'EXPORT';

    // 4. Load danh sách sự cố đang hoạt động vào dropdown
    const eventSelect = document.getElementById('trans-event-id');
    if (eventSelect) {
      eventSelect.innerHTML =
        '<option value="">-- Không liên kết / Hoạt động thường quy --</option>';

      const activeIncidents = logisticsData.activeIncidents || []; // Lấy danh sách sự cố

      activeIncidents.forEach((inc) => {
        eventSelect.insertAdjacentHTML(
          'beforeend',
          `<option value="${inc.id}">${inc.name} (${inc.id})</option>`
        );
      });
    }

    toggleTransFields();
    openModal('modal-transaction');
  };

  window.toggleTransFields = function () {
    const type = document.getElementById('trans-type').value;
    const detailsDiv = document.getElementById('div-export-details');
    if (type === 'IMPORT') {
      detailsDiv.style.display = 'none';
    } else {
      detailsDiv.style.display = 'block';
    }
  };

  window.submitTransaction = async function () {
    const itemId = document.getElementById('trans-item-id').value.trim();
    const typeRaw = document.getElementById('trans-type').value; // Lấy giá trị thô từ ô chọn
    const qtyChange = parseInt(document.getElementById('trans-qty').value);
    const recipientText = document
      .getElementById('trans-recipient')
      .value.trim();
    const incidentId = document.getElementById('trans-event-id').value;

    // --- 1. CHUẨN HÓA LOẠI GIAO DỊCH (Fix lỗi Check Constraint) ---
    let type = 'EXPORT';
    // Tự động dịch sang ngôn ngữ Database cần
    if (typeRaw.toUpperCase().includes('NHẬP') || typeRaw === 'IMPORT') {
      type = 'IMPORT';
    } else if (typeRaw.toUpperCase().includes('XUẤT') || typeRaw === 'EXPORT') {
      type = 'EXPORT';
    } else {
      type = typeRaw; // Dự phòng
    }

    if (!itemId || isNaN(qtyChange) || qtyChange <= 0) {
      showToast('Vui lòng nhập đầy đủ và số lượng hợp lệ', 'warning');
      return;
    }

    showLoadingSpinner();

    try {
      // --- 2. LẤY ID ADMIN TỪ SUPABASE AUTH ---
      const {
        data: { user },
        error: userErr,
      } = await supabaseClient.auth.getUser();
      if (userErr || !user)
        throw new Error('Không thể xác thực danh tính admin.');
      const adminId = user.id;

      // --- 3. CẬP NHẬT TỒN KHO ---
      const { data: itemData, error: itemErr } = await supabaseClient
        .from('logistics_items')
        .select('quantity')
        .eq('id', itemId)
        .single();

      if (itemErr) throw itemErr;

      let newQty = itemData.quantity;
      if (type === 'IMPORT') {
        newQty += qtyChange;
      } else if (type === 'EXPORT') {
        if (newQty < qtyChange)
          throw new Error('Số lượng trong kho không đủ để xuất!');
        newQty -= qtyChange;
      }

      const { error: updateErr } = await supabaseClient
        .from('logistics_items')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', itemId);

      if (updateErr) throw updateErr;

      // --- 4. GHI LOG VỚI DỮ LIỆU ĐÃ CHUẨN HÓA ---
      const logData = {
        item_id: itemId,
        transaction_type: type, // Lúc này chắc chắn là 'IMPORT' hoặc 'EXPORT'
        quantity_change: qtyChange,
        admin_id: adminId,
        recipient_id: null,
        incident_id: type === 'EXPORT' && incidentId ? incidentId : null,
        note: type === 'IMPORT' ? 'Nhập kho' : `Xuất kho cho ${recipientText}`,
      };

      const { error: logErr } = await supabaseClient
        .from('logistics_logs')
        .insert([logData]);

      if (logErr) throw logErr;

      // --- HOÀN TẤT ---
      showToast('Giao dịch thành công!', 'success');

      const modal = document.getElementById('modal-transaction');
      if (modal) modal.style.display = 'none';

      if (typeof window.enterDashboard === 'function')
        await window.enterDashboard();
      if (typeof window.renderLogisticsPage === 'function')
        window.renderLogisticsPage(true); // Tham số true để bắt nó tải lại dữ liệu mới
    } catch (err) {
      console.error('Lỗi giao dịch kho:', err);
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };
  window.submitNewItem = async function () {
    const name = document.getElementById('new-item-name').value.trim();
    const qty = parseInt(document.getElementById('new-item-qty').value);
    const category = document.getElementById('new-item-cat').value;
    const unit = document.getElementById('new-item-unit').value;
    const minThreshold =
      parseInt(document.getElementById('new-item-min').value) || 0;
    const expiryDate = document.getElementById('new-item-expiry').value || null;
    const storageLocation =
      document.getElementById('new-item-loc').value || 'Kho chính';

    if (!name || isNaN(qty) || qty < 0) {
      showToast('Vui lòng nhập tên và số lượng hợp lệ', 'warning');
      return;
    }

    showLoadingSpinner();

    try {
      // Dữ liệu chuẩn bị chèn, các key phải khớp 100% với tên cột trong hình
      const newItemData = {
        item_name: name,
        category: category,
        unit: unit,
        quantity: qty,
        min_threshold: minThreshold,
        expiry_date: expiryDate,
        storage_location: storageLocation,
        // Không truyền 'id' hay 'created_at' để PostgreSQL tự sinh (UUID mặc định)
      };

      const { error } = await supabaseClient
        .from('logistics_items')
        .insert([newItemData]);

      if (error) throw error;

      showToast('Đã thêm vật tư thành công!', 'success');

      document.getElementById('modal-add-item').style.display = 'none';

      // Tải lại dữ liệu và giao diện
      if (typeof window.enterDashboard === 'function')
        await window.enterDashboard();
      if (typeof window.renderLogisticsPage === 'function')
        window.renderLogisticsPage();
    } catch (err) {
      console.error('Lỗi thêm vật tư:', err);
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      hideLoadingSpinner();
    }
  };
  // === LIBRARY ===
  // ==========================
  // LOGIC MODULE LIBRARY
  // ==========================

  // 1. Render Library (ĐÃ PHÂN QUYỀN)
  // 1. RENDER THƯ VIỆN (Trực tiếp fetch dữ liệu)
  window.renderLibraryPage = async function () {
    const container = document.getElementById('library-grid');
    if (!container) return;

    container.innerHTML =
      '<div class="text-center w-100 py-5"><i class="bx bx-loader-alt bx-spin" style="font-size: 2rem;"></i><p>Đang nạp tài liệu...</p></div>';

    const isAdmin = window.userSession?.role?.toLowerCase() === 'admin';
    const btnAdd = document.getElementById('btn-add-doc');
    if (btnAdd) btnAdd.style.display = isAdmin ? 'block' : 'none';

    try {
      const { data: docs, error } = await supabaseClient
        .from('library_docs')
        .select('*')
        .order('title', { ascending: true }); // Dùng title vì bạn không có created_at

      if (error) throw error;
      window.appState.library = docs || [];
      container.innerHTML = '';

      if (!docs || docs.length === 0) {
        container.innerHTML =
          '<p class="text-muted text-center w-100">Thư viện chưa có dữ liệu mẫu.</p>';
        return;
      }

      docs.forEach((doc) => {
        const title = doc.title || 'Không tiêu đề';
        const category = doc.category || 'Chung';
        const docType = doc.doc_type || 'FILE';
        const fileUrl = doc.file_url || '#';
        const version = doc.version || '1.0';
        const description = doc.description || '';

        // SỬA LỖI N/A TẠI ĐÂY: Dùng last_updated theo đúng Database
        const docDate = doc.last_updated
          ? new Date(doc.last_updated).toLocaleDateString('vi-VN')
          : 'N/A';

        let iconClass = 'bx-file-blank';
        let actionText = 'Xem tài liệu';
        let actionIcon = 'bx-book-reader';
        const isLink = docType === 'LINK';

        if (isLink) {
          iconClass = 'bx-link-external';
          actionText = 'Mở liên kết';
          actionIcon = 'bx-mouse-alt';
        } else {
          if (category === 'SOP') iconClass = 'bx-list-check';
          else if (category === 'Form') iconClass = 'bx-edit';
        }

        const adminTools = isAdmin
          ? `
              <div class="lib-admin-tools" style="position: absolute; top: 10px; right: 10px;">
                  <button class="btn btn-sm btn-warning" onclick="window.openLibModal('${
                    doc.id
                  }')" title="Sửa"><i class='bx bx-edit'></i></button>
                  <button class="btn btn-sm btn-danger" onclick="window.deleteLibDoc('${
                    doc.id
                  }', '${title.replace(
              /'/g,
              "\\'"
            )}', event)" title="Xóa"><i class='bx bx-trash'></i></button>
              </div>
          `
          : '';

        const html = `
              <div class="lib-card" style="position: relative;" data-title="${title.toLowerCase()}" data-cat="${category}">
                  <div class="lib-icon ${
                    isLink ? 'text-info' : ''
                  }"><i class='bx ${iconClass}'></i></div>
                  <div class="lib-info">
                      <h4 class="lib-title">${title}</h4>
                      <p class="lib-desc" style="font-size: 0.85rem; color: #666; margin-bottom: 8px;">${description}</p>
                      <div class="lib-meta" style="margin-bottom: 10px; font-size: 0.75rem; color: #888;">
                          <span class="badge bg-primary">${category}</span>
                          ${
                            isLink
                              ? '<span class="badge bg-info">LINK</span>'
                              : ''
                          }
                          <span class="ms-2"><i class='bx bx-purchase-tag'></i> v${version}</span>
                          <span class="ms-2"><i class='bx bx-time'></i> ${docDate}</span>
                      </div>
                      <div class="lib-actions">
                          <a href="${fileUrl}" target="_blank" class="btn btn-sm btn-primary w-100">
                              <i class='bx ${actionIcon}'></i> ${actionText}
                          </a>
                      </div>
                  </div>
                  ${adminTools}
              </div>
          `;
        container.insertAdjacentHTML('beforeend', html);
      });
    } catch (err) {
      console.error('❌ Lỗi Render Thư viện:', err);
      container.innerHTML = `<p class="text-danger text-center w-100">Lỗi: ${err.message}</p>`;
    }
  };

  // 2. MỞ MODAL THÊM/SỬA TÀI LIỆU (Sửa lỗi TypeError '.includes')
  window.openLibModal = function (docId = null) {
    const el = {
      id: document.getElementById('lib-id'),
      title: document.getElementById('lib-title'),
      type: document.getElementById('lib-doc-type'),
      cat: document.getElementById('lib-category'),
      ver: document.getElementById('lib-version'),
      desc: document.getElementById('lib-desc'),
      file: document.getElementById('lib-file'),
      urlInput: document.getElementById('lib-url-input'),
      currentUrl: document.getElementById('lib-current-url'),
      status: document.getElementById('lib-file-status'),
    };

    // Reset Form
    el.id.value = '';
    el.title.value = '';
    el.type.value = 'FILE';
    el.ver.value = '';
    el.desc.value = '';
    el.file.value = '';
    el.urlInput.value = '';
    el.currentUrl.value = '';
    el.status.innerHTML = '';
    document.getElementById('lib-modal-title').textContent =
      '📤 Upload Tài liệu Mới';

    window.toggleLibType();

    if (docId) {
      const doc = window.appState.library.find((d) => d.id === docId);
      if (doc) {
        el.id.value = doc.id;
        el.title.value = doc.title || '';
        el.cat.value = doc.category || 'SOP';
        el.ver.value = doc.version || '';
        el.desc.value = doc.description || '';
        el.currentUrl.value = doc.file_url || '';

        // SỬA LỖI TẠI ĐÂY: Phải kiểm tra doc.file_url có tồn tại không trước khi gọi .includes
        const safeUrl = doc.file_url || '';
        const isLink =
          doc.doc_type === 'LINK' ||
          (safeUrl !== '' &&
            !safeUrl.includes('drive.google.com') &&
            !safeUrl.includes('supabase'));

        el.type.value = isLink ? 'LINK' : 'FILE';
        if (isLink) el.urlInput.value = safeUrl;

        if (safeUrl) {
          el.status.innerHTML = `Nguồn hiện tại: <a href="${safeUrl}" target="_blank">Xem trực tiếp</a>`;
        } else {
          el.status.innerHTML = `<span class="text-danger">Tài liệu này chưa có file/link đính kèm.</span>`;
        }

        document.getElementById('lib-modal-title').textContent =
          '✏️ Chỉnh sửa Tài liệu';
        window.toggleLibType();
      }
    }

    if (typeof window.openModal === 'function')
      window.openModal('modal-library');
  };

  // 3. SUBMIT TÀI LIỆU
  window.submitLibrary = async function () {
    const docType = document.getElementById('lib-doc-type').value;
    const id = document.getElementById('lib-id').value;
    const title = document.getElementById('lib-title').value;
    const cat = document.getElementById('lib-category').value;
    const ver = document.getElementById('lib-version').value;
    const desc = document.getElementById('lib-desc').value;
    const currentUrl = document.getElementById('lib-current-url').value;
    const urlInput = document.getElementById('lib-url-input').value;
    const fileInput = document.getElementById('lib-file');

    if (!title) {
      showToast('Vui lòng nhập tên tài liệu', 'warning');
      return;
    }
    if (docType === 'LINK' && !urlInput) {
      showToast('Vui lòng nhập địa chỉ liên kết', 'warning');
      return;
    }

    showLoadingSpinner();

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabaseClient.auth.getUser();
      if (userErr) throw userErr;
      const userId = user?.id;

      if (!userId) {
        throw new Error('Bạn cần đăng nhập để thực hiện thao tác này');
      }

      let finalFileUrl = currentUrl;

      // Xử lý File Upload
      // Xử lý File Upload
      if (docType === 'FILE' && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random()
          .toString(36)
          .substring(7)}.${fileExt}`;
        const filePath = `library/${fileName}`;

        console.log('📤 Uploading file:', filePath, 'Size:', file.size);

        const { data: uploadData, error: uploadError } =
          await supabaseClient.storage
            .from('documents')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false,
            });

        if (uploadError) {
          console.error('❌ Upload error:', uploadError);
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        console.log('✅ Upload success:', uploadData);

        const { data: publicUrlData } = supabaseClient.storage
          .from('documents')
          .getPublicUrl(filePath);

        finalFileUrl = publicUrlData.publicUrl;
        console.log('🔗 Public URL:', finalFileUrl);
      } else if (docType === 'FILE' && !id && !finalFileUrl) {
        throw new Error('Vui lòng chọn file để upload');
      } else if (docType === 'LINK') {
        finalFileUrl = urlInput;
      }

      // ✅ CHUẨN BỊ DỮ LIỆU - CHỈ DÙNG CỘT CÓ TRONG SCHEMA
      const docData = {
        title: title,
        category: cat,
        version: ver,
        description: desc,
        doc_type: docType,
        file_url: finalFileUrl,
        updated_by: userId,
        last_updated: new Date().toISOString(),
      };

      if (id) {
        // UPDATE
        const { error } = await supabaseClient
          .from('library_docs')
          .update(docData)
          .eq('id', id);
        if (error) throw error;

        showToast('Cập nhật tài liệu thành công!', 'success');
      } else {
        // INSERT - KHÔNG DÙNG created_by/created_at
        const { error } = await supabaseClient
          .from('library_docs')
          .insert([docData]);
        if (error) {
          console.error('Insert Error:', error);
          throw error;
        }
        showToast('Thêm tài liệu mới thành công!', 'success');
      }

      if (typeof window.closeModal === 'function') {
        window.closeModal('modal-library');
      }
      window.renderLibraryPage();
    } catch (err) {
      console.error('Lỗi xử lý tài liệu:', err);
      showToast('Lỗi: ' + err.message, 'error');
    } finally {
      hideLoadingSpinner();
    }
  };

  // 4. XÓA TÀI LIỆU
  window.deleteLibDoc = function (id, title, event) {
    if (event) event.stopPropagation();

    showToastConfirm(
      `Bạn có chắc chắn muốn xóa tài liệu <strong style="color:#dc3545;">${title}</strong>?`,
      async function () {
        if (typeof showLoadingSpinner === 'function') showLoadingSpinner(true);

        try {
          const { error } = await supabaseClient
            .from('library_docs')
            .delete()
            .eq('id', id);
          if (error) throw error;

          showToast('Đã xóa tài liệu thành công!', 'success');
          window.renderLibraryPage();
        } catch (err) {
          console.error('Lỗi xóa tài liệu:', err);
          showToast('Lỗi xóa tài liệu: ' + err.message, 'error');
        } finally {
          if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
        }
      }
    );
  };
  // 2. Filter Library
  window.filterLibrary = function () {
    const search = document.getElementById('lib-search').value.toLowerCase();
    const cat = document.getElementById('lib-cat-filter').value;
    const cards = document.querySelectorAll('.lib-card');

    cards.forEach((card) => {
      const title = card.getAttribute('data-title');
      const cardCat = card.getAttribute('data-cat');

      const matchSearch = title.includes(search);
      const matchCat = cat === 'all' || cardCat === cat;

      card.style.display = matchSearch && matchCat ? 'flex' : 'none';
    });
  };

  // Hàm chuyển đổi giao diện giữa File và Link
  window.toggleLibType = function () {
    const type = document.getElementById('lib-doc-type').value;
    const groupFile = document.getElementById('group-lib-file');
    const groupUrl = document.getElementById('group-lib-url');

    if (type === 'FILE') {
      groupFile.style.display = 'block';
      groupUrl.style.display = 'none';
    } else {
      groupFile.style.display = 'none';
      groupUrl.style.display = 'block';
    }
  };

  // HÀM TẮT LOADING CHUNG – ĐẢM BẢO 100% TẮT ĐƯỢC
  function hideGlobalLoading() {
    const spinner = document.getElementById('global-loading-spinner');
    if (spinner) spinner.style.display = 'none';
    else if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    else if (typeof showLoadingSpinner === 'function')
      showLoadingSpinner(false);
  }
  // Đặt gần đầu file, sau các helper khác
  window.isMyWardTeam = function (teamName) {
    const role = (window.userSession?.role || '').toLowerCase();
    if (role !== 'ward_admin') return true; // admin/user: không giới hạn ở đây
    const myWard = String(window.userSession?.workplace_ward || '').trim();
    if (!myWard) return false;
    const prefix = `Team ${myWard}`;
    return String(teamName || '')
      .trim()
      .startsWith(prefix);
  };
});
