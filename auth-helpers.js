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
  return (
    String(role).toLowerCase().trim() ===
    String(requiredRole).toLowerCase().trim()
  );
};

// Thêm hàm này ở đầu file để lấy UUID an toàn
window.getCurrentUserId = function () {
  // Ưu tiên 1: Đã có trong session
  if (window.userSession?.id) return window.userSession.id;

  // Fallback 2: Đọc từ localStorage của Supabase
  try {
    const key = `sb-${
      window.supabaseClient?.projectRef || 'default'
    }-auth-token`;
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
// ========================================================================
// HÀM LOAD PROFILE - CHỐNG MẤT SESSION KHI F5
// ========================================================================
window.loadUserProfile = async function () {
  try {
    // 1. BẮT BUỘC dùng getSession() để Supabase tự động móc token từ localStorage ra
    const {
      data: { session },
      error: sessionError,
    } = await window.supabaseClient.auth.getSession();

    // Nếu vừa F5 mà chưa kịp có session, hoặc báo lỗi -> Trả về false để đá ra login
    if (sessionError || !session) {
      console.warn(
        '⚠️ Mất Session: Supabase không tìm thấy token trong bộ nhớ.'
      );
      return false;
    }

    // 2. Nếu đã có session, bắt đầu lấy chi tiết Profile từ Database
    const user = session.user;
    const { data: profile, error: profileError } = await window.supabaseClient
      .from('profiles')
      .select('*') // Nếu bảng profiles của bạn lớn, bạn có thể select đích danh các cột cần thiết
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('❌ Lỗi lấy Profile từ Supabase:', profileError.message);
      return false;
    }

    // 3. Phục hồi thành công! Ghép thông tin User và Profile lại lưu vào biến toàn cục
    window.userSession = {
      id: user.id,
      email: user.email,
      ...profile,
    };

    console.log('✅ Đã khôi phục Session thành công sau khi F5!');
    return true;
  } catch (error) {
    console.error('❌ Lỗi hệ thống cực nghiêm trọng khi tải Profile:', error);
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
