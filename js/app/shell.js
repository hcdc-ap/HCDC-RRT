// ============================================================
// APP SHELL — Helpers, spinner, toast, datepicker, khởi tạo UI
// (Tách từ script.js cũ — xem js/app/README.md về thứ tự nạp)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  // Chia sẻ cho các file js/app/* khác (trước đây dùng chung 1 closure)
  rrtShared.escapeHtml = escapeHtml;
  rrtShared.parseFilterDate = parseFilterDate;

  // 6. (ĐÃ XÓA) Lệnh gọi getTeamRegisterData cũ đã được xóa
  //    vì getInitialData đã làm việc này.

  // 7. (SỬA LỖI) Khai báo các biến DOM chính
  //    Phải khai báo mainContent Ở ĐÂY để hàm handleSearch có thể thấy
  const mainContent = document.querySelector('main');
  if (!mainContent) {
    console.error('LỖI NGHIÊM TRỌNG: Không tìm thấy thẻ <main>');
    return;
  }

  const searchFormtab = document.querySelector('form');
  const searchInput = document.querySelector('#search-input');
  if (!searchFormtab || !searchInput) {
    console.error(
      'Không tìm thấy form hoặc input tìm kiếm. Vui lòng kiểm tra lại HTML.'
    );
    return;
  }
  //8.AAR

  // ============================================================================
  // (A) SỬA FORM SUBMIT AAR — tôn trọng lựa chọn "Đóng / Giữ trạng thái"
  //     Thay listener submit của #aarForm bằng bản này.
  // ============================================================================
  (function () {
    const aarForm = document.getElementById('aarForm');
    if (!aarForm) return;

    aarForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      customShowLoading(true);

      const formData = new FormData(this);
      const aarData = {};
      formData.forEach((value, key) => (aarData[key] = value));

      const adminName =
        window.userSession?.username ||
        window.userSession?.full_name ||
        'admin';
      const incidentId = document.getElementById('aar-incident-id')?.value;
      if (!incidentId) {
        showToast('Lỗi: Không tìm thấy ID sự kiện!', 'error');
        customShowLoading(false);
        return;
      }

      // 🔧 TÔN TRỌNG LỰA CHỌN: đóng hay giữ trạng thái (từ dropdown problem_status)
      const nextStatus =
        aarData.problem_status === 'active' ? 'active' : 'closed';
      const willClose = nextStatus === 'closed';

      try {
        const { data: currentIncident, error: fetchErr } = await supabaseClient
          .from('incidents')
          .select('members, event_name')
          .eq('id', incidentId)
          .single();
        if (fetchErr) throw fetchErr;

        // Cập nhật AAR + trạng thái theo lựa chọn
        const { error: updateErr } = await supabaseClient
          .from('incidents')
          .update({
            aar_data: {
              ...aarData,
              submitted_by: adminName,
              submitted_at: new Date().toISOString(),
            },
            status: nextStatus, // ← 'closed' hoặc 'active' theo dropdown, KHÔNG cứng nữa
          })
          .eq('id', incidentId);
        if (updateErr) throw updateErr;

        // Chỉ gửi thông báo KẾT THÚC khi thực sự đóng
        if (willClose) {
          const membersStr = currentIncident?.members || '';
          const memberEmails = membersStr
            .split(/[,;\s\n]+/)
            .map((e) => e.replace(/[<>]/g, '').trim().toLowerCase())
            .filter(Boolean);
          if (memberEmails.length > 0) {
            const notificationsPayload = memberEmails.map((email) => ({
              user_email: email,
              incident_id: incidentId,
              notification_type: 'ket_thuc',
              message: `Sự kiện "${
                currentIncident.event_name || 'Nhiệm vụ'
              }" đã được Giám đốc đóng lại. Đội RRT kết thúc nhiệm vụ tại hiện trường.`,
            }));
            const { error: notifErr } = await supabaseClient
              .from('notifications')
              .insert(notificationsPayload);
            if (notifErr)
              console.error('Lỗi gửi thông báo kết thúc:', notifErr);
          }
        }

        showToast(
          willClose
            ? 'Đã lưu đánh giá và đóng sự kiện!'
            : 'Đã lưu đánh giá, sự kiện vẫn đang xử lý.',
          'success'
        );

        if (typeof window.closeModal === 'function')
          window.closeModal('aarModal');
        else $('#aarModal').modal('hide');

        if (typeof window.renderTrackingPage === 'function')
          window.renderTrackingPage(true);
      } catch (err) {
        console.error('Lỗi gửi AAR:', err);
        showToast('Gửi AAR thất bại: ' + err.message, 'error');
      } finally {
        customShowLoading(false);
      }
    });
  })();

  // --- Lấy các phần tử DOM ---
  const accountLink = document.getElementById('accountLink');
  const messageLink = document.getElementById('messageLink');

  // --- Hàm mô phỏng click vào mục sidebar ---
  // Hàm mô phỏng click vào mục sidebar (Dựa trên ID trang)
  /**
   * Hàm mô phỏng việc click vào sidebar để chuyển tab.
   * Hỗ trợ cả trường hợp menu bị ẩn (đối với User thường).
   */
  function simulateSidebarClick(targetSectionId) {
    // 1. Tìm thẻ <a> trong sidebar có data-target khớp với ID trang
    // (Yêu cầu bạn đã thêm data-target vào HTML như hướng dẫn trước)
    const link = document.querySelector(
      `#sidebar .side-menu.top li a[data-target="${targetSectionId}"]`
    );

    if (link) {
      // TRƯỜNG HỢP 1: Menu có tồn tại trên giao diện
      // Giả lập sự kiện click vào nó.
      // Việc này sẽ tự động kích hoạt logic đổi màu active và chuyển trang.
      link.click();
    } else {
      // TRƯỜNG HỢP 2: Menu bị ẩn (VD: User thường không thấy menu Admin)
      // Hoặc nút đó chưa được render.
      // Ta gọi trực tiếp hàm hiển thị trang để ép buộc chuyển hướng.
      console.warn(
        `Menu cho ${targetSectionId} không hiển thị, chuyển hướng trực tiếp.`
      );

      if (typeof showSectionById === 'function') {
        showSectionById(targetSectionId);
      } else {
        console.error('Lỗi: Hàm showSectionById chưa được định nghĩa.');
      }
    }
  }

  // --- Gắn sự kiện cho các liên kết trong menu hồ sơ ---
  if (accountLink) {
    accountLink.addEventListener('click', function (e) {
      e.preventDefault();
      simulateSidebarClick('page-datatable');
    });
  }

  if (messageLink) {
    messageLink.addEventListener('click', function (e) {
      e.preventDefault();
      simulateSidebarClick('page-notification');
    });
  }
  $(document).ready(function () {
    $('#form-change-password').on('submit', function (e) {
      e.preventDefault(); // CHẶN LOAD TRANG
      submitChangePassword(); // Gọi hàm xử lý
    });
  });
  //ĐỔI MẬT KHẨU
  window.openChangePassModal = function () {
    const modalEl = document.getElementById('modal-change-password');
    if (!modalEl) {
      console.error(
        'Không tìm thấy HTML Modal. Có thể dashboard_modals chưa được load!'
      );
      return;
    }

    // Xóa sạch vết tích cũ nếu có
    const oldInstance = bootstrap.Modal.getInstance(modalEl);
    if (oldInstance) oldInstance.dispose();

    // Dọn dẹp màn hình mờ bị kẹt
    document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());

    // Khởi tạo mới và hiện
    const myModal = new bootstrap.Modal(modalEl);
    myModal.show();

    // Điền email (đảm bảo window.userSession đã được nạp lại sau khi login)
    const hiddenEmail = document.getElementById('lib-user-hidden');
    if (hiddenEmail) {
      hiddenEmail.value = window.userSession ? window.userSession.email : '';
    }
  };
  window.submitChangePassword = async function () {
    const oldPass = document.getElementById('old-pass').value;
    const newPass = document.getElementById('new-pass').value;
    const confirmPass = document.getElementById('confirm-pass').value;

    // 1. Client-side validation
    if (!oldPass || !newPass || !confirmPass) {
      return showToast('Vui lòng điền đầy đủ các trường!', 'warning');
    }
    if (newPass !== confirmPass) {
      return showToast('Mật khẩu mới và xác nhận không khớp!', 'error');
    }
    if (newPass.length < 6) {
      return showToast('Mật khẩu mới phải có ít nhất 6 ký tự!', 'warning');
    }

    if (typeof showLoadingSpinner === 'function') showLoadingSpinner();

    try {
      // 2. Đổi mật khẩu qua Supabase Auth
      const email = window.userSession?.email;
      if (!email) throw new Error('Không tìm thấy phiên đăng nhập!');

      // Bước A: Xác thực mật khẩu cũ
      const { error: signInError } =
        await window.supabaseClient.auth.signInWithPassword({
          email: email,
          password: oldPass,
        });
      if (signInError) throw new Error('Mật khẩu cũ không chính xác!');

      // Bước B: Cập nhật mật khẩu mới
      const { error: updateError } =
        await window.supabaseClient.auth.updateUser({
          password: newPass,
        });
      if (updateError) throw updateError;

      // 3. THÀNH CÔNG
      if (typeof showToast === 'function') {
        showToast('Mật khẩu đã đổi! Đang đăng xuất sau 2 giây...', 'success');
      }

      // Đóng Modal an toàn tuyệt đối bằng Bootstrap (Tránh lỗi null style)
      const modalEl = document.getElementById('modal-change-password');
      if (modalEl) {
        // Lấy instance hiện tại hoặc tạo mới nếu chưa có
        const modalInstance =
          bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modalInstance.hide();
      }

      const form = document.getElementById('form-change-password');
      if (form) form.reset();

      // Logout sau khi đổi thành công
      setTimeout(async function () {
        if (typeof window.logout === 'function') {
          await window.logout();
        } else {
          window.location.reload();
        }
      }, 2500);
    } catch (err) {
      console.error('❌ Lỗi đổi mật khẩu:', err);

      // Phiên dịch lỗi của Supabase ra tiếng Việt cho dễ hiểu
      let errorMsg = err.message;
      if (errorMsg.includes('different from the old password')) {
        errorMsg = 'Mật khẩu mới không được giống với mật khẩu cũ!';
      } else if (errorMsg.includes('least 6 characters')) {
        errorMsg = 'Mật khẩu mới phải có ít nhất 6 ký tự!';
      }

      if (typeof showToast === 'function') {
        showToast(errorMsg, 'error');
      } else {
        alert(errorMsg);
      }
    } finally {
      if (typeof hideLoadingSpinner === 'function') hideLoadingSpinner();
    }
  };
  window.togglePassword = function (inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');

    if (input.type === 'password') {
      input.type = 'text';
      icon.classList.replace('bx-show', 'bx-hide'); // Đổi icon sang mắt gạch chéo
    } else {
      input.type = 'password';
      icon.classList.replace('bx-hide', 'bx-show'); // Đổi icon về mắt mở
    }
  };
  // =========================
  // HELPERS & GLOBALS
  // =========================

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // parse dd/mm/yyyy -> Date object (returns null if invalid)
  /**
   * Hỗ trợ: dd/mm/yy, dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd
   */
  /**
   * Hỗ trợ: dd/mm/yy, dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd
   */
  function parseFilterDate(str) {
    if (!str) return null;
    const parts = str.split(/[/-]/);
    if (parts.length !== 3) return null;

    let d, m, y;
    if (str.includes('-')) {
      if (str.indexOf('-') === 4) {
        // yyyy-mm-dd
        [y, m, d] = parts.map(Number);
      } else {
        // dd-mm-yyyy
        [d, m, y] = parts.map(Number);
      }
    } else {
      // dd/mm/yy hoặc dd/mm/yyyy
      [d, m, y] = parts.map(Number);
      if (y < 100) y += 2000;
    }

    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    return new Date(y, m - 1, d);
  }
  // --- Hàm Handle Search (Bây giờ đã an toàn) ---
  function handleSearch() {
    const query = searchInput.value.trim().toLowerCase();
    const dashboardPage = document.getElementById('page-dashboard');
    const datatablePage = document.getElementById('page-datatable');
    const notificationPage = document.getElementById('page-notification');
    const teamPage = document.getElementById('page-team');
    const emergencyPage = document.getElementById('page-emergency');

    let currentPage = '';
    if (
      dashboardPage &&
      window.getComputedStyle(dashboardPage).display !== 'none'
    ) {
      currentPage = 'page-dashboard';
    } else if (
      datatablePage &&
      window.getComputedStyle(datatablePage).display !== 'none'
    ) {
      currentPage = 'page-datatable';
    } else if (
      notificationPage &&
      window.getComputedStyle(notificationPage).display !== 'none'
    ) {
      currentPage = 'page-notification';
    } else if (
      teamPage &&
      window.getComputedStyle(teamPage).display !== 'none'
    ) {
      currentPage = 'page-team';
    } else if (
      emergencyPage &&
      window.getComputedStyle(emergencyPage).display !== 'none'
    ) {
      currentPage = 'page-emergency';
    }

    // Logic lọc DataTables
    if (currentPage === 'page-dashboard') {
      const table1 = document.getElementById('recent-report-body');
      const table2 = document.getElementById('todo-list');
      if (table1) filterTable('recent-report-body', query);
      if (table2) filterTable('todo-list', query);
    } else if (currentPage === 'page-datatable') {
      if (
        typeof $ !== 'undefined' &&
        $.fn.DataTable &&
        $('#report-table').length
      ) {
        $('#report-table').DataTable().search(query).draw();
      }
    } else if (currentPage === 'page-emergency') {
      if (
        typeof $ !== 'undefined' &&
        $.fn.DataTable &&
        $('#memberListTable').length
      ) {
        $('#memberListTable').DataTable().search(query).draw();
      }
    } else if (currentPage === 'page-notification') {
      if (
        typeof $ !== 'undefined' &&
        $.fn.DataTable &&
        $('#message-table').length
      ) {
        $('#message-table').DataTable().search(query).draw();
      }
    } else if (currentPage === 'page-tracking') {
      if (
        typeof $ !== 'undefined' &&
        $.fn.DataTable &&
        $('#schedule-table').length
      ) {
        $('#schedule-table').DataTable().search(query).draw();
      }
      if (
        typeof $ !== 'undefined' &&
        $.fn.DataTable &&
        $('#schedule-incidents-table').length
      ) {
        $('#schedule-incidents-table').DataTable().search(query).draw();
      }
    } else if (currentPage === 'page-team') {
      if (
        typeof $ !== 'undefined' &&
        $.fn.DataTable &&
        $('#team-table').length
      ) {
        $('#team-table').DataTable().search(query).draw();
      }
    }

    // Logic tìm kiếm .searchable (Bây giờ đã an toàn vì 'mainContent' đã được định nghĩa)
    const searchables = mainContent.querySelectorAll('.searchable');
    let hasResults = false;
    searchables.forEach((item) => {
      const text = item.textContent.toLowerCase();
      if (query === '' || text.includes(query)) {
        item.classList.remove('hidden');
        hasResults = true;
      } else {
        item.classList.add('hidden');
      }
    });

    let noResults = mainContent.querySelector('.no-results');
    if (query && !hasResults) {
      if (!noResults) {
        noResults = document.createElement('p');
        noResults.className = 'no-results';
        const target =
          mainContent.querySelector('.tab-content') ||
          mainContent.querySelector('.page-content') ||
          mainContent.querySelector('.details');
        if (target) {
          target.appendChild(noResults);
        }
      }
      noResults.textContent = 'No results found.';
    } else if (noResults) {
      noResults.remove();
    }
  }

  // Gắn sự kiện cho Search
  searchFormtab.addEventListener('submit', function (event) {
    event.preventDefault();
    handleSearch();
  });
  searchInput.addEventListener('keyup', handleSearch);

  // Gọi handleSearch lần đầu
  handleSearch();

  // --- Helper functions for UI Feedback ---
  document
    .getElementById('notificationIcon')
    .addEventListener('click', function (e) {
      window.loadUserNotifications();
    });

  //SEARCH IF NOT USING DATATABLE
  function filterTable(tableId, query) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const rows = table.getElementsByTagName('tr');
    const filter = query.toUpperCase();

    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].getElementsByTagName('td');
      let shouldShow = false;

      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        if (cell) {
          const textValue = cell.textContent || cell.innerText;
          if (textValue.toUpperCase().indexOf(filter) > -1) {
            shouldShow = true;
            break;
          }
        }
      }

      if (shouldShow) {
        rows[i].style.display = '';
      } else {
        rows[i].style.display = 'none';
      }
    }
  }
  // Enhanced Loading Spinner Function
  window.customShowLoading = function (show = true) {
    if (show && appState.loadingActive) return; // Prevent multiple loaders
    if (!show && !appState.loadingActive) return; // Prevent hiding when not shown
    appState.loadingActive = show;

    if (show) {
      // Create loader element if it doesn't exist
      let loader = document.getElementById('appSmartLoader');
      if (!loader) {
        loader = document.createElement('div');
        loader.id = 'appSmartLoader';
        loader.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            z-index: 999998; background: rgba(255,255,255,0.85);
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px); opacity: 0; transition: opacity 0.3s ease-in-out;
          `;
        loader.innerHTML = `
            <div style="text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
              <div class="spinner-border text-primary mb-3" style="width: 2.5rem; height: 2.5rem;"></div>
              <div style="font-weight: 500; color: #333; font-size: 1rem;">Đang xử lý...</div>
            </div>
          `;
        document.body.appendChild(loader);
        // Force reflow before adding opacity class for transition
        void loader.offsetWidth;
      }
      loader.style.display = 'flex'; // Ensure it's visible
      setTimeout(() => {
        loader.style.opacity = '1';
      }, 10); // Start fade-in
      window.lastLoadingStart = Date.now(); // Track start time for timeout
    } else {
      const loader = document.getElementById('appSmartLoader');
      if (loader) {
        loader.style.opacity = '0'; // Start fade-out
        // Remove after transition
        setTimeout(() => {
          if (loader) loader.style.display = 'none'; // Hide element
        }, 300);
      }
    }
  };
  // ======================
  // HÀM QUẢN LÝ SPINNER
  // ======================
  window.showLoadingSpinner = function () {
    const overlay = document.getElementById('global-loading-spinner');
    if (overlay) {
      document.body.appendChild(overlay);
      overlay.style.display = 'flex';
    }
  };

  window.hideLoadingSpinner = function () {
    const overlay = document.getElementById('global-loading-spinner');
    if (overlay) overlay.style.display = 'none';
  };

  // ======================
  // HÀM HIỂN THỊ TOAST (THÔNG BÁO)
  // ======================
  let toastTimeout = null;

  window.showToast = function (message, type = 'info') {
    const toast = document.getElementById('appToast');
    const toastBody = document.getElementById('appToastBody');
    const title = document.getElementById('toastTitle');

    if (!toast || !toastBody) return;

    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }

    if (title) title.textContent = 'Thông báo';
    toastBody.innerHTML = message;

    toast.className = 'toast show';
    toast.classList.remove(
      'bg-success',
      'text-white',
      'bg-danger',
      'bg-warning',
      'text-dark',
      'bg-primary',
      'bg-success-subtle',
      'text-success-emphasis',
      'bg-danger-subtle',
      'text-danger-emphasis',
      'bg-warning-subtle',
      'text-warning-emphasis',
      'bg-primary-subtle',
      'text-primary-emphasis',
      'border-warning',
      'border-3'
    );

    if (type === 'success') {
      toast.classList.add('bg-success-subtle', 'text-success-emphasis');
    } else if (type === 'error') {
      toast.classList.add('bg-danger-subtle', 'text-danger-emphasis');
    } else if (type === 'warning') {
      toast.classList.add('bg-warning-subtle', 'text-warning-emphasis');
    } else {
      toast.classList.add('bg-primary-subtle', 'text-primary-emphasis');
    }

    toastTimeout = setTimeout(() => {
      window.hideToast();
    }, 3000);
  };

  window.showToastConfirm = function (message, onConfirm) {
    const toast = document.getElementById('appToast');
    const body = document.getElementById('appToastBody');
    const title = document.getElementById('toastTitle');

    if (!toast || !body) return;

    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }

    if (title) title.textContent = 'Xác nhận hành động';
    toast.className = 'toast show';
    toast.classList.remove('bg-success', 'bg-danger', 'text-white');
    toast.classList.add('border-warning', 'border-3');

    body.innerHTML = `
      <div class="fw-bold mb-2 fs-6">${message}</div>
      <div class="mt-2 pt-2 border-top d-flex justify-content-end gap-2">
          <button id="toast-cancel-btn" class="btn btn-secondary btn-sm">Để sau</button>
          <button id="toast-confirm-btn" class="btn btn-primary btn-sm fw-bold">Đồng ý</button>
      </div>
  `;

    setTimeout(() => {
      const btnYes = document.getElementById('toast-confirm-btn');
      const btnNo = document.getElementById('toast-cancel-btn');

      if (btnYes) {
        btnYes.onclick = function () {
          window.hideToast();
          if (typeof onConfirm === 'function') onConfirm();
        };
      }
      if (btnNo) {
        btnNo.onclick = window.hideToast;
      }
    }, 50);
  };

  window.hideToast = function () {
    const toast = document.getElementById('appToast');
    if (toast) {
      toast.classList.remove('show');
      if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
      }
    }
  };
  // ======================
  // DATEPICKER (Giữ nguyên cấu hình)
  // ======================
  $(document).ready(function () {
    if ($.datepicker) {
      $.datepicker.regional['vi'] = {
        closeText: 'Close',
        prevText: '<Previous',
        nextText: 'Next>',
        currentText: 'Today',
        monthNames: [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ],
        monthNamesShort: [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ],
        dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        dayNamesMin: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        weekHeader: 'Tu',
        dateFormat: 'dd-mm-yy',
        firstDay: 0,
        isRTL: false,
        showMonthAfterYear: false,
        yearSuffix: '',
      };
      $.datepicker.setDefaults($.datepicker.regional['vi']);

      $('#filter-date-start').datepicker({
        dateFormat: 'dd/mm/yy',
        onSelect: function (selectedDate) {
          $('#filter-date-end').datepicker('option', 'minDate', selectedDate);
          if (typeof rrtShared.dataTableInstance !== 'undefined' && rrtShared.dataTableInstance)
            rrtShared.dataTableInstance.draw();
        },
      });

      $('#filter-date-end').datepicker({
        dateFormat: 'dd/mm/yy',
        onSelect: function (selectedDate) {
          $('#filter-date-start').datepicker('option', 'maxDate', selectedDate);
          if (typeof rrtShared.dataTableInstance !== 'undefined' && rrtShared.dataTableInstance)
            rrtShared.dataTableInstance.draw();
        },
      });

      $('#filter-date-start-team').datepicker({
        onSelect: function (selectedDate) {
          $('#filter-date-end-team').datepicker(
            'option',
            'minDate',
            selectedDate
          );
        },
      });

      $('#filter-date-end-team').datepicker({
        onSelect: function (selectedDate) {
          $('#filter-date-start-team').datepicker(
            'option',
            'maxDate',
            selectedDate
          );
        },
      });

      $('#filter-date-start-tracking').datepicker({
        dateFormat: 'yy-mm-dd',
        onSelect: function (selectedDate) {
          $('#filter-date-end-tracking').datepicker(
            'option',
            'minDate',
            selectedDate
          );
        },
      });

      $('#filter-date-end-tracking').datepicker({
        dateFormat: 'yy-mm-dd',
        onSelect: function (selectedDate) {
          $('#filter-date-start-tracking').datepicker(
            'option',
            'maxDate',
            selectedDate
          );
        },
      });
    }
  });

  // ===============================
  // CONFIG & GLOBAL STATE
  // ===============================
  window.__uiState = window.__uiState || {
    sidebarHidden: false,
    isDark: false,
    sessionReady: false,
    initialized: false,
  };

  window.appState = window.appState || {};

  // ===============================
  // 1. UI COMPONENTS INIT
  // ===============================
  function initUIComponents() {
    if (window.__uiState.initialized) {
      console.log('⚠️ UI already initialized, skipping...');
      return;
    }
    window.__uiState.initialized = true;

    console.log('🎨 Initializing UI components...');

    const $sidebar = $('#sidebar');
    const $switch = $('#switch-mode');
    const $menuBtn = $('#content nav .bx.bx-menu');

    // === A. SIDEBAR TOGGLE - Multiple binding methods ===

    // Method 1: Direct binding (ưu tiên)
    $menuBtn.off('click.sidebar').on('click.sidebar', function (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔘 Sidebar button clicked (direct)');
      toggleSidebar();
    });

    // Method 2: Event delegation (backup)
    $(document)
      .off('click.sidebarDelegated')
      .on('click.sidebarDelegated', '#content nav .bx.bx-menu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔘 Sidebar button clicked (delegated)');
        toggleSidebar();
      });

    // Method 3: Global click catcher (debug)
    $(document)
      .off('click.sidebarGlobal')
      .on('click.sidebarGlobal', function (e) {
        if ($(e.target).closest('#content nav .bx.bx-menu').length) {
          console.log('🔘 Sidebar button clicked (global catcher)');
        }
      });

    function toggleSidebar() {
      $sidebar.toggleClass('hide');
      const isHidden = $sidebar.hasClass('hide');
      window.__uiState.sidebarHidden = isHidden;
      localStorage.setItem('sidebar_hidden', isHidden);
      console.log('🔄 Sidebar toggled:', isHidden ? 'HIDDEN' : 'VISIBLE');

      // Trigger resize để adjust content
      $(window).trigger('resize');
    }

    // Restore sidebar state
    const savedSidebar = localStorage.getItem('sidebar_hidden');
    if (savedSidebar === 'true' && window.innerWidth > 576) {
      $sidebar.addClass('hide');
      window.__uiState.sidebarHidden = true;
    }

    // === B. DARK/LIGHT MODE - Multiple binding methods ===

    // Check saved theme
    const savedTheme = localStorage.getItem('theme');
    const systemDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches;

    if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
      document.body.classList.add('dark');
      $switch.prop('checked', true);
      window.__uiState.isDark = true;
    }

    // Method 1: Direct binding
    $switch.off('change.theme').on('change.theme', function () {
      const isDark = $(this).is(':checked');
      console.log(
        '🌓 Theme switch clicked (direct):',
        isDark ? 'DARK' : 'LIGHT'
      );
      setTheme(isDark);
    });

    // Method 2: Event delegation
    $(document)
      .off('change.themeDelegated')
      .on('change.themeDelegated', '#switch-mode', function () {
        const isDark = $(this).is(':checked');
        console.log(
          '🌓 Theme switch clicked (delegated):',
          isDark ? 'DARK' : 'LIGHT'
        );
        setTheme(isDark);
      });

    function setTheme(isDark) {
      document.body.classList.toggle('dark', isDark);
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      window.__uiState.isDark = isDark;
      $(document).trigger('theme:changed', [isDark]);
      console.log('🎨 Theme set to:', isDark ? 'DARK' : 'LIGHT');
    }

    // === C. RESPONSIVE SIDEBAR ===
    window.adjustSidebar = function () {
      if (window.innerWidth <= 576) {
        $sidebar.addClass('hide');
        window.__uiState.sidebarHidden = true;
        localStorage.setItem('sidebar_hidden', 'true');
      }
    };

    adjustSidebar();
    $(window).off('resize.sidebar').on('resize.sidebar', adjustSidebar);

    // === D. MOBILE SEARCH ===
    $(document)
      .off('click.search')
      .on('click.search', '#content nav form .form-input button', function (e) {
        if (window.innerWidth < 768) {
          e.preventDefault();
          const $form = $(this).closest('form');
          const $icon = $(this).find('.bx');
          $form.toggleClass('show');
          $icon.toggleClass('bx-search bx-x');
        }
      });

    // === E. DROPDOWN MENUS ===
    // ===============================
    // DROPDOWN NOTIFICATION & PROFILE - FIX VERSION
    // ===============================
    $(document)
      .off('click.dropdownToggle')
      .on('click.dropdownToggle', '.notification, .profile', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const $wrapper = $(this);
        let $menu;

        // 🎯 TÁCH RIÊNG RẠCH RÒI THEO TỪNG CLASS
        if ($wrapper.hasClass('notification')) {
          // Nếu bấm vào chuông: Chỉ tìm đúng notification-menu nằm kế bên
          $menu = $wrapper.siblings('#notificationMenu, .notification-menu');
          // Đóng menu profile lại ngay lập tức
          $('.profile-menu').removeClass('show').hide();
        } else if ($wrapper.hasClass('profile')) {
          // Nếu bấm vào profile: Chỉ tìm đúng profile-menu nằm kế bên
          $menu = $wrapper.siblings('#profileMenu, .profile-menu');
          // Đóng menu notification lại ngay lập tức
          $('.notification-menu').removeClass('show').hide();
        }

        if (!$menu || $menu.length === 0) {
          console.warn('⚠️ Không tìm thấy menu dropdown tương ứng cho:', this);
          return;
        }

        // Toggle menu hiện tại (kết hợp cả class 'show' và style display để đồng bộ code cũ)
        const isOpen = $menu.hasClass('show');

        // Đóng tất cả các menu khác trước
        $('.notification-menu, .profile-menu').removeClass('show').hide();

        if (!isOpen) {
          $menu.addClass('show').show(); // Mở lên
        } else {
          $menu.removeClass('show').hide(); // Đóng lại
        }
      });

    console.log('✅ UI components initialized');
    console.log('📊 State:', window.__uiState);
  }


  // ===============================
  // 3. DASHBOARD INIT
  // ===============================
  window.initDashboard = async function () {
    if (window.appState?.appInitialized) {
      console.log('⚠️ Dashboard already initialized');
      return;
    }
    window.appState.appInitialized = true;

    console.log('🚀 Initializing dashboard...');

    if (typeof window.customShowLoading === 'function') {
      window.customShowLoading(true);
    }

    try {
      // ✅ THAY VÌ gọi initSession, dùng loadUserProfile nếu cần
      if (!window.userSession?.id) {
        console.log('🔄 Loading user profile...');
        if (typeof window.loadUserProfile === 'function') {
          await window.loadUserProfile();
        }
      }

      // Load data...
      console.log('📊 Loading dashboard data...');

      const { data: profilesData, error: profileErr } =
        await window.supabaseClient
          .from('profiles')
          .select('*')
          .not('role', 'in', `(${window.LIMS_ONLY_ROLES.join(',')})`)
          .order('updated_at', { ascending: false });

      if (profileErr) throw profileErr;

      window.appState.profiles = profilesData || [];

      // Load other data...
      await Promise.all([
        typeof window.fetchUsers === 'function'
          ? window.fetchUsers().catch((e) => console.error('Users error:', e))
          : Promise.resolve(),
        typeof window.fetchLogistics === 'function'
          ? window
              .fetchLogistics()
              .catch((e) => console.error('Logistics error:', e))
          : Promise.resolve(),
        typeof window.fetchLibrary === 'function'
          ? window
              .fetchLibrary()
              .catch((e) => console.error('Library error:', e))
          : Promise.resolve(),
      ]);

      window.appState.isDataLoaded = true;
      console.log('✅ Dashboard data loaded');

      if (typeof window.renderDashboard === 'function') {
        window.renderDashboard();
      }
    } catch (error) {
      console.error('❌ Dashboard init error:', error);
      if (typeof window.showToast === 'function') {
        window.showToast('Lỗi tải dashboard: ' + error.message, 'error');
      }
    } finally {
      if (typeof window.customShowLoading === 'function') {
        window.customShowLoading(false);
      }
    }
  };

  // ===============================
  // 4. APP STARTUP (CHỈ KHỞI TẠO UI - KHÔNG TẢI DỮ LIỆU DASHBOARD)
  // ===============================
  // ✅ FIX: Đã bỏ mọi lệnh gọi window.initDashboard()/enterDashboard() ở khu vực
  // này. Trước khi sửa, có 2 nơi NGAY TẠI ĐÂY cùng gọi initDashboard() (1 lần qua
  // $(document).ready với setTimeout 100ms, 1 lần qua khối "Fallback" với
  // setTimeout 50ms) - và vì document.readyState gần như LUÔN LÀ 'interactive'
  // ngay khi DOMContentLoaded bắn ra, khối fallback bên dưới thực chất chạy ở
  // MỌI LẦN tải trang, không phải chỉ khi cần "dự phòng". Cộng thêm luồng tải
  // dashboard từ onAuthStateChange, dữ liệu bị tải 2-3 lần cùng lúc -> đụng nhau,
  // lỗi, kẹt màn hình trắng. Giờ chỉ còn duy nhất onAuthStateChange phụ trách
  // tải dashboard; ở đây chỉ lo phần UI tĩnh (sidebar, dropdown, theme...).
  function startAppUI() {
    if (!window.__uiState) window.__uiState = {};
    if (window.__uiState.appStartCalled) return;
    window.__uiState.appStartCalled = true;

    console.log('📄 DOM ready - init UI only');
    document.body.classList.remove('loading');
    initUIComponents();
  }

  $(document).ready(startAppUI);

  // Dự phòng thật sự: chỉ chạy nếu vì lý do gì đó $(document).ready chưa kịp bắn
  if (
    document.readyState === 'complete' ||
    document.readyState === 'interactive'
  ) {
    setTimeout(startAppUI, 50);
  }
});
