// ============================================================================
// TRANG ADMIN "NHẬT KÝ TRUY CẬP & BẢO MẬT"
//  - Xem nhật ký truy cập (bảng rrt_access_log; RLS chỉ cho admin đọc), lọc + phân trang.
//  - Đặt lại MFA cho thành viên mất điện thoại (Edge Function mfa-admin-reset).
// Dựng DOM bằng textContent (không nối chuỗi HTML) nên dữ liệu trong nhật ký không chèn được mã.
// ============================================================================
(function () {
  'use strict';

  const PAGE_SIZE = 50;
  const EVENT_LABELS = {
    login_success: 'Đăng nhập',
    login_failed: 'Đăng nhập thất bại',
    logout: 'Đăng xuất',
    mfa_enabled: 'Bật xác thực 2 bước',
    mfa_disabled: 'Tắt xác thực 2 bước',
    mfa_verify_failed: 'Sai mã xác thực 2 bước',
    mfa_backup_code_used: 'Dùng mã dự phòng',
    mfa_backup_codes_regenerated: 'Tạo mã dự phòng',
    mfa_admin_reset: 'Admin đặt lại MFA',
    password_changed: 'Đổi mật khẩu',
    account_approved: 'Duyệt tài khoản',
  };
  let page = 0;
  let bound = false;

  const sb = () => window.supabaseClient;
  const $ = (id) => document.getElementById(id);
  const toast = (m, t) => typeof window.showToast === 'function' && window.showToast(m, t);

  function describe(row) {
    const d = row.detail || {};
    if (row.event === 'mfa_admin_reset') return 'Cho: ' + (d.target_email || d.target_user_id || '');
    if (row.event === 'account_approved') return 'Duyệt: ' + (d.target_email || d.target_user_id || '');
    if (d.locked) return 'Bị khoá tạm do nhập sai nhiều lần';
    if (d.method === 'backup_code') return 'Mã dự phòng';
    if (d.method === 'totp') return 'Mã từ ứng dụng';
    return '';
  }

  function cell(tr, text, cls) {
    const td = document.createElement('td');
    td.textContent = text == null ? '' : String(text);
    if (cls) td.className = cls;
    tr.appendChild(td);
    return td;
  }

  async function loadLog() {
    const body = $('access-log-body');
    const info = $('access-log-info');
    if (!body) return;
    body.textContent = '';
    info.textContent = 'Đang tải…';

    let q = sb()
      .from('rrt_access_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    const email = $('access-log-email').value.trim();
    const event = $('access-log-event').value;
    const result = $('access-log-result').value;
    const from = $('access-log-from').value;
    const to = $('access-log-to').value;
    if (email) q = q.ilike('email', '%' + email.replace(/[%_,()]/g, '') + '%');
    if (event) q = q.eq('event', event);
    if (result) q = q.eq('success', result === 'ok');
    if (from) q = q.gte('created_at', new Date(from + 'T00:00:00').toISOString());
    if (to) q = q.lte('created_at', new Date(to + 'T23:59:59.999').toISOString());
    q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    const { data, error, count } = await q;
    if (error) {
      info.textContent = 'Không tải được nhật ký: ' + error.message;
      return;
    }
    (data || []).forEach((row) => {
      const tr = document.createElement('tr');
      cell(tr, new Date(row.created_at).toLocaleString('vi-VN'));
      cell(tr, row.email || '(không rõ)');
      cell(tr, EVENT_LABELS[row.event] || row.event);
      const res = cell(tr, row.success ? 'Thành công' : 'Thất bại', row.success ? 'text-success' : 'text-danger');
      res.style.fontWeight = '600';
      cell(tr, describe(row));
      cell(tr, row.ip || '');
      body.appendChild(tr);
    });
    if (!data || data.length === 0) {
      const tr = document.createElement('tr');
      const td = cell(tr, 'Không có bản ghi nào.', 'text-center text-muted');
      td.colSpan = 6;
      body.appendChild(tr);
    }
    const total = count || 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    info.textContent = `${total} bản ghi · Trang ${page + 1}/${pages}`;
    $('access-log-prev').disabled = page === 0;
    $('access-log-next').disabled = page + 1 >= pages;
  }

  // ---- Đặt lại MFA ----
  let resetTarget = null;

  async function findMember() {
    const email = $('mfa-reset-email').value.trim().toLowerCase();
    const msg = $('mfa-reset-msg');
    $('mfa-reset-confirm-box').hidden = true;
    resetTarget = null;
    if (!email) return (msg.textContent = 'Nhập email của thành viên.');
    const { data, error } = await sb()
      .from('profiles')
      .select('id, email, full_name')
      .ilike('email', email)
      .maybeSingle();
    if (error || !data) return (msg.textContent = 'Không tìm thấy thành viên có email này.');
    resetTarget = data;
    msg.textContent = '';
    $('mfa-reset-who').textContent = (data.full_name ? data.full_name + ' — ' : '') + data.email;
    $('mfa-reset-confirm-box').hidden = false;
  }

  async function doReset() {
    if (!resetTarget) return;
    const btn = $('mfa-reset-confirm');
    btn.disabled = true;
    try {
      const { data, error } = await sb().functions.invoke('mfa-admin-reset', {
        body: { user_id: resetTarget.id },
      });
      if (error) {
        let m = 'Không đặt lại được MFA.';
        try {
          m = (await error.context.json()).error || m;
        } catch (e) {
          /* giữ thông báo mặc định */
        }
        throw new Error(m);
      }
      if (data?.ok) {
        toast('Đã đặt lại MFA cho ' + resetTarget.email + '. Họ có thể đăng nhập bằng mật khẩu và bật lại.', 'success');
      } else {
        toast(data?.error || 'Không đặt lại được MFA.', 'warning');
      }
      $('mfa-reset-confirm-box').hidden = true;
      $('mfa-reset-email').value = '';
      resetTarget = null;
      page = 0;
      loadLog();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    const select = $('access-log-event');
    Object.keys(EVENT_LABELS).forEach((k) => {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = EVENT_LABELS[k];
      select.appendChild(o);
    });
    $('access-log-filter').onclick = () => {
      page = 0;
      loadLog();
    };
    $('access-log-clear').onclick = () => {
      ['access-log-email', 'access-log-event', 'access-log-result', 'access-log-from', 'access-log-to'].forEach(
        (id) => ($(id).value = '')
      );
      page = 0;
      loadLog();
    };
    $('access-log-prev').onclick = () => {
      if (page > 0) page--;
      loadLog();
    };
    $('access-log-next').onclick = () => {
      page++;
      loadLog();
    };
    $('mfa-reset-find').onclick = findMember;
    $('mfa-reset-confirm').onclick = doReset;
    $('mfa-reset-cancel').onclick = () => {
      resetTarget = null;
      $('mfa-reset-confirm-box').hidden = true;
    };
  }

  window.renderAccessLogPage = function () {
    if (!window.isUserAdmin || !window.isUserAdmin()) {
      toast('Chỉ Quản trị RRT được xem nhật ký truy cập.', 'warning');
      return;
    }
    bindOnce();
    page = 0;
    loadLog();
  };
})();
