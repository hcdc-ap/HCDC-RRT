// auth-helpers.js
// ========================================================================
// AUTH HELPERS - DÙNG CHUNG CHO TOÀN APP
// ========================================================================

/**
 * Kiểm tra user có phải admin không
 */
 window.isUserAdmin = function () {
  const role = window.userSession?.role || '';
  return String(role).toLowerCase().trim() === 'admin';
};

/**
 * Kiểm tra user có role cụ thể không
 */
window.hasRole = function (requiredRole) {
  if (!requiredRole) return false;
  const role = window.userSession?.role || '';
  return String(role).toLowerCase().trim() === String(requiredRole).toLowerCase().trim();
};

// Thêm hàm này ở đầu file để lấy UUID an toàn
window.getCurrentUserId = function () {
  // Ưu tiên 1: Đã có trong session
  if (window.userSession?.id) return window.userSession.id;
  
  // Fallback 2: Đọc từ localStorage của Supabase
  try {
    const key = `sb-${window.supabaseClient?.projectRef || 'default'}-auth-token`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.user?.id || null;
    }
  } catch (e) {}
  
  return null;
};

/**
 * Load profile từ DB và cập nhật window.userSession
 * @returns {Promise<boolean>} true nếu thành công
 */
window.loadUserProfile = async function () {
  try {
    if (!window.supabaseClient?.auth) {
      console.error('❌ Supabase client not ready');
      return false;
    }

    // Lấy user từ auth
    const { data: { user }, error: authErr } = 
      await window.supabaseClient.auth.getUser();
    
    if (authErr || !user?.id) {
      console.log('ℹ️ User chưa đăng nhập');
      return false;
    }

    // Load profile từ bảng profiles
    const { data: profile, error: profileErr } = await window.supabaseClient
      .from('profiles')
      .select('id, email, full_name, role, team, position, deployment_status, approval_status')
      .eq('id', user.id)
      .single();
    
    if (profileErr) {
      console.error('❌ Lỗi load profile:', profileErr);
      return false;
    }

    // Cập nhật window.userSession
    window.userSession = {
      id: user.id,
      email: profile.email || user.email,
      role: profile.role || 'user',  // Schema default là 'User' (viết hoa)
      full_name: profile.full_name || '',
      team: profile.team || '',
      position: profile.position || '',
      deployment_status: profile.deployment_status || 'Sẵn sàng',
      approval_status: profile.approval_status || 'pending'
    };

    console.log('✅ User profile loaded:', {
      email: window.userSession.email,
      role: window.userSession.role
    });

    return true;

  } catch (err) {
    console.error('❌ Lỗi loadUserProfile:', err);
    return false;
  }
};

/**
 * Đăng xuất + cleanup
 */
window.logout = async function () {
  console.log('👋 Logging out...');
  
  // Clear local state
  window.userSession = null;
  if (window.appState) {
    window.appState.currentUser = null;
    window.appState.appInitialized = false;
  }
  
  // Sign out từ Supabase
  if (window.supabaseClient?.auth) {
    await window.supabaseClient.auth.signOut();
  }
  
  // Clear localStorage
  localStorage.removeItem('sidebar_hidden');
  localStorage.removeItem('theme');
  
  // Redirect về login
  console.log('🔄 Redirecting to login...');
  window.location.href = '/login.html';
};
