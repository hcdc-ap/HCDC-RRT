// ============================================================================
// XÁC THỰC 2 BƯỚC (MFA, TOTP) — giao diện đăng nhập + "Xác thực 2 bước" trong menu hồ sơ
// Phụ thuộc: mfa-helpers.js ở thư mục gốc (window.rrtMfaHelpers), window.supabaseClient, Bootstrap.
// Mọi thao tác tuỳ chọn: người chưa bật MFA không đi qua đoạn nào trong file này
// (ngoài ghi nhật ký, luôn "best-effort" — lỗi ghi log không được làm hỏng luồng chính).
// ============================================================================
(function () {
  'use strict';

  const H = window.rrtMfaHelpers;
  const ISSUER = 'HCDC RRT';
  const sb = () => window.supabaseClient;
  const $ = (id) => document.getElementById(id);
  const toast = (msg, type) => {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
  };
  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((resolve) => setTimeout(resolve, ms))]);

  function setHidden(id, hidden) {
    const el = $(id);
    if (el) el.hidden = !!hidden;
  }
  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text || '';
  }

  /** Lấy thông báo lỗi tiếng Việt từ lỗi của supabase.functions.invoke */
  async function functionError(error, fallback) {
    try {
      const body = await error?.context?.json?.();
      if (body?.error) return body.error;
    } catch (e) {
      /* bỏ qua */
    }
    return fallback;
  }

  // -------------------------------------------------------------------------
  // Nhật ký (best-effort)
  // -------------------------------------------------------------------------
  async function logEvent(event, detail) {
    try {
      await withTimeout(
        sb().rpc('rrt_log_event', { p_event: event, p_detail: detail || {} }),
        3000
      );
    } catch (e) {
      console.warn('Không ghi được nhật ký', event, e);
    }
  }
  function logLoginFailed(email) {
    try {
      Promise.resolve(
        sb().functions.invoke('auth-log', {
          body: { event: 'login_failed', email: String(email || '') },
        })
      ).catch(() => {});
    } catch (e) {
      /* bỏ qua */
    }
  }

  // -------------------------------------------------------------------------
  // Bước 2 khi đăng nhập
  // -------------------------------------------------------------------------
  function promptLogin() {
    return new Promise((resolve, reject) => {
      const el = $('modal-mfa-login');
      if (!el || typeof bootstrap === 'undefined') {
        sb().auth.signOut();
        reject(new Error('Không mở được bước xác thực 2 bước'));
        return;
      }
      const modal = bootstrap.Modal.getOrCreateInstance(el, {
        backdrop: 'static',
        keyboard: false,
      });
      let done = false;
      const finish = (err) => {
        if (done) return;
        done = true;
        modal.hide();
        if (err) reject(err);
        else resolve();
      };
      const showError = (msg) => setText('mfa-login-error', msg);
      const showMode = (mode) => {
        setHidden('mfa-login-totp', mode !== 'totp');
        setHidden('mfa-login-backup', mode !== 'backup');
        showError('');
        const input = $(mode === 'totp' ? 'mfa-login-code' : 'mfa-login-backup-code');
        if (input) {
          input.value = '';
          setTimeout(() => input.focus(), 300);
        }
      };
      const busy = (isBusy) => {
        ['mfa-login-submit', 'mfa-login-backup-submit'].forEach((id) => {
          if ($(id)) $(id).disabled = isBusy;
        });
      };

      async function submitTotp() {
        const code = H.normalizeTotp($('mfa-login-code').value);
        if (!code) return showError('Nhập đủ 6 chữ số trong ứng dụng Authenticator.');
        busy(true);
        try {
          const { data: fd, error: lErr } = await sb().auth.mfa.listFactors();
          const factor = fd?.totp?.[0];
          if (lErr || !factor) throw new Error('Không tìm thấy thiết bị xác thực');
          const { error } = await sb().auth.mfa.challengeAndVerify({
            factorId: factor.id,
            code,
          });
          if (error) {
            logEvent('mfa_verify_failed', { method: 'totp' });
            return showError('Mã không đúng hoặc đã hết hạn. Hãy thử mã mới.');
          }
          finish();
        } catch (e) {
          showError(e.message || 'Không xác thực được, vui lòng thử lại.');
        } finally {
          busy(false);
        }
      }

      async function submitBackup() {
        const code = H.normalizeBackupCode($('mfa-login-backup-code').value);
        if (!code) return showError('Mã dự phòng gồm 8 ký tự, ví dụ ABCD-EFGH.');
        busy(true);
        try {
          const { data, error } = await sb().functions.invoke('mfa-recovery', {
            body: { code },
          });
          if (error || !data?.ok) {
            return showError(
              await functionError(error, 'Mã dự phòng không đúng hoặc đã dùng.')
            );
          }
          await sb().auth.refreshSession();
          toast(
            'Đã dùng mã dự phòng. Xác thực 2 bước đã được tắt — hãy bật lại trong menu hồ sơ.',
            'warning'
          );
          finish();
        } catch (e) {
          showError(e.message || 'Không thực hiện được, vui lòng thử lại.');
        } finally {
          busy(false);
        }
      }

      $('mfa-login-submit').onclick = submitTotp;
      $('mfa-login-backup-submit').onclick = submitBackup;
      $('mfa-login-code').onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitTotp();
        }
      };
      $('mfa-login-backup-code').onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitBackup();
        }
      };
      $('mfa-login-to-backup').onclick = (e) => {
        e.preventDefault();
        showMode('backup');
      };
      $('mfa-login-to-totp').onclick = (e) => {
        e.preventDefault();
        showMode('totp');
      };
      $('mfa-login-cancel').onclick = async () => {
        try {
          await sb().auth.signOut();
        } catch (e) {
          /* bỏ qua */
        }
        finish(new Error('Đã huỷ đăng nhập.'));
      };

      showMode('totp');
      modal.show();
    });
  }

  // -------------------------------------------------------------------------
  // Đổi mật khẩu của người đã bật MFA: xác minh mật khẩu cũ bằng client tạm
  // (đăng nhập lại trên client chính sẽ làm phiên tụt về aal1 → updateUser bị từ chối)
  // -------------------------------------------------------------------------
  async function hasMfa() {
    try {
      const { data } = await sb().auth.mfa.listFactors();
      return (data?.totp?.length || 0) > 0;
    } catch (e) {
      return false;
    }
  }
  function verifyPassword(email, password) {
    const cfg = window.rrtShared?.supabaseConfig;
    if (!cfg) return Promise.resolve({ error: new Error('Chưa khởi tạo Supabase') });
    const tmp = window.supabase.createClient(cfg.url, cfg.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'rrt-tmp-verify-password',
      },
    });
    return tmp.auth.signInWithPassword({ email, password });
  }

  // -------------------------------------------------------------------------
  // "Xác thực 2 bước" trong menu hồ sơ
  // -------------------------------------------------------------------------
  let enrollFactorId = null;
  let verifiedFactor = null;

  function showSection(name) {
    ['off', 'enroll', 'on', 'codes'].forEach((s) => setHidden('mfa-s-' + s, s !== name));
    setText('mfa-s-error', '');
  }

  async function dropUnverified(all) {
    for (const f of all || []) {
      if (f.status !== 'verified') {
        try {
          await sb().auth.mfa.unenroll({ factorId: f.id });
        } catch (e) {
          /* bỏ qua */
        }
      }
    }
  }

  async function refreshSettings() {
    const { data, error } = await sb().auth.mfa.listFactors();
    if (error) throw error;
    await dropUnverified(data.all);
    enrollFactorId = null;
    verifiedFactor = data.totp?.[0] || null;
    showSection(verifiedFactor ? 'on' : 'off');
    if ($('mfa-s-off-code')) $('mfa-s-off-code').value = '';
    if ($('mfa-s-enroll-code')) $('mfa-s-enroll-code').value = '';
  }

  function showCodes(codes) {
    window.rrtMfa._codes = codes;
    setText('mfa-s-codes-list', codes.join('\n'));
    showSection('codes');
  }

  async function generateCodes() {
    const { data, error } = await sb().functions.invoke('mfa-backup-codes', { body: {} });
    if (error || !data?.ok) {
      throw new Error(
        await functionError(error, 'Không tạo được mã dự phòng, hãy thử lại.')
      );
    }
    showCodes(data.codes);
  }

  async function startEnroll() {
    try {
      const { data, error } = await sb().auth.mfa.enroll({
        factorType: 'totp',
        // issuer = tên hiện trong ứng dụng Authenticator. Không đặt thì Supabase dùng Site URL
        // của dự án (đang là hcdc-lims.vercel.app vì dùng chung với LIMS).
        issuer: ISSUER,
        friendlyName: 'RRT ' + new Date().toISOString(),
      });
      if (error) throw error;
      enrollFactorId = data.id;
      $('mfa-s-qr').src = data.totp.qr_code;
      setText('mfa-s-secret', data.totp.secret);
      showSection('enroll');
      setTimeout(() => $('mfa-s-enroll-code')?.focus(), 200);
    } catch (e) {
      toast('Không bắt đầu được: ' + (e.message || e), 'error');
    }
  }

  async function confirmEnroll() {
    const code = H.normalizeTotp($('mfa-s-enroll-code').value);
    if (!code) return setText('mfa-s-error', 'Nhập đủ 6 chữ số hiện trong ứng dụng.');
    try {
      const { error } = await sb().auth.mfa.challengeAndVerify({
        factorId: enrollFactorId,
        code,
      });
      if (error) return setText('mfa-s-error', 'Mã không đúng hoặc đã hết hạn. Thử mã mới.');
      enrollFactorId = null;
      logEvent('mfa_enabled'); // trigger DB có thể đã ghi — RPC tự bỏ qua bản trùng
      try {
        await generateCodes();
      } catch (e) {
        toast(e.message, 'warning');
        await refreshSettings();
      }
      toast('Đã bật xác thực 2 bước.', 'success');
    } catch (e) {
      setText('mfa-s-error', e.message || 'Có lỗi, vui lòng thử lại.');
    }
  }

  async function cancelEnroll() {
    if (enrollFactorId) {
      try {
        await sb().auth.mfa.unenroll({ factorId: enrollFactorId });
      } catch (e) {
        /* bỏ qua */
      }
    }
    await refreshSettings();
  }

  async function disableMfa() {
    const code = H.normalizeTotp($('mfa-s-off-code').value);
    if (!code) return setText('mfa-s-error', 'Nhập mã 6 số hiện tại để xác nhận tắt.');
    try {
      const { error } = await sb().auth.mfa.challengeAndVerify({
        factorId: verifiedFactor.id,
        code,
      });
      if (error) return setText('mfa-s-error', 'Mã không đúng hoặc đã hết hạn.');
      const { error: uErr } = await sb().auth.mfa.unenroll({ factorId: verifiedFactor.id });
      if (uErr) throw uErr;
      logEvent('mfa_disabled');
      await sb().auth.refreshSession();
      await refreshSettings();
      toast('Đã tắt xác thực 2 bước.', 'success');
    } catch (e) {
      setText('mfa-s-error', e.message || 'Không tắt được, vui lòng thử lại.');
    }
  }

  async function bindSettingsOnce() {
    const el = $('modal-mfa-settings');
    if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';
    $('mfa-s-start').onclick = startEnroll;
    $('mfa-s-enroll-confirm').onclick = confirmEnroll;
    $('mfa-s-enroll-cancel').onclick = cancelEnroll;
    $('mfa-s-disable').onclick = disableMfa;
    $('mfa-s-regen').onclick = async () => {
      try {
        await generateCodes();
      } catch (e) {
        setText('mfa-s-error', e.message);
      }
    };
    $('mfa-s-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText((window.rrtMfa._codes || []).join('\n'));
        toast('Đã chép 10 mã dự phòng.', 'success');
      } catch (e) {
        toast('Không chép được, hãy bôi đen và chép thủ công.', 'warning');
      }
    };
    $('mfa-s-download').onclick = () => {
      const text =
        'MÃ DỰ PHÒNG XÁC THỰC 2 BƯỚC - HCDC RRT\n' +
        'Mỗi mã chỉ dùng 1 lần. Cất nơi an toàn, KHÔNG gửi cho ai.\n\n' +
        (window.rrtMfa._codes || []).join('\n') +
        '\n';
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rrt-ma-du-phong.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $('mfa-s-codes-done').onclick = async () => {
      window.rrtMfa._codes = null;
      setText('mfa-s-codes-list', '');
      await refreshSettings();
    };
    el.addEventListener('hidden.bs.modal', () => {
      // Đóng giữa chừng khi đang bật dở → dọn factor chưa xác minh; xoá mã khỏi bộ nhớ
      window.rrtMfa._codes = null;
      setText('mfa-s-codes-list', '');
      if (enrollFactorId) cancelEnroll();
    });
  }

  async function openSettings() {
    const el = $('modal-mfa-settings');
    if (!el || typeof bootstrap === 'undefined') return;
    await bindSettingsOnce();
    document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    showSection('off');
    modal.show();
    try {
      await refreshSettings();
    } catch (e) {
      toast('Không đọc được trạng thái xác thực 2 bước: ' + (e.message || e), 'error');
    }
  }

  window.rrtMfa = {
    ISSUER,
    logEvent,
    logLoginFailed,
    promptLogin,
    hasMfa,
    verifyPassword,
    openSettings,
    _codes: null,
  };
  window.openMfaModal = function () {
    return openSettings();
  };
})();
